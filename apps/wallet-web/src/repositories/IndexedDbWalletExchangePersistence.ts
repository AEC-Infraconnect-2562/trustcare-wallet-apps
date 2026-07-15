import {
  createWalletExchangePartition,
  createWalletExchangeState,
  createWalletClinicalDocumentGraphState,
  prepareWalletExchangeCredentialReverification,
  holderIdentityFromPublicKey,
  assertWalletClinicalDocumentGraphState,
  walletAvatarBindingKey,
  type HolderSigningIdentity,
  type WalletDocumentRecordV2,
  type WalletExchangePartition,
  type WalletExchangeState,
  type WalletExchangeSyncReduction,
  type WalletClinicalDocumentGraphState,
  type WalletClinicalDocumentGraphSyncReduction,
  type WalletAvatarAssetRecord,
  type WalletAvatarIdentityBinding,
} from "@trustcare/wallet-core";
import {
  createWalletExchangePersistencePolicy,
  type WalletExchangePersistencePolicy,
} from "@trustcare/api-client/walletExchangePersistencePolicy";
import type {
  WalletExchangeCredentialRequestLink,
  WalletExchangePendingSubmissionDraft,
  WalletExchangeShlAssociationRecord,
  WalletExchangeSubmissionLink,
} from "@trustcare/api-client/walletExchangeWorkflow";

export const INDEXED_DB_WALLET_EXCHANGE_SCHEMA =
  "wallet-exchange-v2@3" as const;
// Keep the database namespace stable so the IndexedDB version upgrade preserves
// holder keys and previously acknowledged Wallet Exchange state.
export const INDEXED_DB_WALLET_EXCHANGE_VERSION = 5 as const;

export type IndexedDbWalletExchangeStoreName =
  | "exchange_state"
  | "documents"
  | "holder_keys"
  | "request_links"
  | "submission_links"
  | "submission_outbox"
  | "shl_associations"
  | "clinical_graph_objects"
  | "clinical_graph_edges"
  | "clinical_bundle_members"
  | "clinical_graph_changes"
  | "clinical_graph_cursors"
  | "clinical_graph_quarantine"
  | "avatar_current"
  | "avatar_history";

export type IndexedDbWalletExchangeTransactionMode = "readonly" | "readwrite";

export interface IndexedDbWalletExchangeTransaction {
  get<T>(
    store: IndexedDbWalletExchangeStoreName,
    key: string,
  ): Promise<T | undefined>;
  getAll<T>(store: IndexedDbWalletExchangeStoreName): Promise<T[]>;
  put(
    store: IndexedDbWalletExchangeStoreName,
    key: string,
    value: unknown,
  ): void;
  delete(store: IndexedDbWalletExchangeStoreName, key: string): void;
}

/**
 * Transaction-level seam. Browser production uses one IndexedDB transaction;
 * tests can inject a copy-on-write implementation and exercise the same
 * cursor, partition, pending-ACK, and idempotency guards.
 */
export interface IndexedDbWalletExchangeStorage {
  transaction<T>(
    stores: readonly IndexedDbWalletExchangeStoreName[],
    mode: IndexedDbWalletExchangeTransactionMode,
    operation: (transaction: IndexedDbWalletExchangeTransaction) => Promise<T>,
  ): Promise<T>;
}

export type IndexedDbWalletExchangePersistenceOptions = {
  portalOrigin: string;
  holderDid: string;
  schemaNamespace?: string;
  storage?: IndexedDbWalletExchangeStorage;
  indexedDbFactory?: IDBFactory;
};

type PartitionRecord<T> = {
  partitionKey: string;
  value: T;
};

type HolderKeyRecord = PartitionRecord<HolderSigningIdentity> & {
  schema: "trustcare.wallet.holder-key.v1";
};

type ClinicalGraphMetadata = Omit<
  WalletClinicalDocumentGraphState,
  "nodes" | "edges" | "bundleMembers" | "changes" | "quarantine"
>;

const clinicalGraphStores = [
  "clinical_graph_objects",
  "clinical_graph_edges",
  "clinical_bundle_members",
  "clinical_graph_changes",
  "clinical_graph_cursors",
  "clinical_graph_quarantine",
] as const satisfies readonly IndexedDbWalletExchangeStoreName[];

/**
 * Durable browser storage for Wallet Exchange V2 only. It intentionally uses
 * a new database namespace and never imports records from the legacy Wallet
 * document database. Credentials must arrive through the live Portal sync and
 * pass issuer/proof policy before this persistence layer accepts them.
 */
export class IndexedDbWalletExchangePersistence {
  readonly partition: WalletExchangePartition;
  readonly databaseName: string;

  private readonly storage: IndexedDbWalletExchangeStorage;
  private readonly policy: WalletExchangePersistencePolicy;

  constructor(options: IndexedDbWalletExchangePersistenceOptions) {
    this.partition = createWalletExchangePartition({
      portalOrigin: options.portalOrigin,
      holderDid: options.holderDid,
    });
    this.policy = createWalletExchangePersistencePolicy(this.partition);
    this.databaseName = createIndexedDbWalletExchangeDatabaseName({
      portalOrigin: this.partition.portalOrigin,
      holderDid: this.partition.holderDid,
      schemaNamespace: options.schemaNamespace,
    });
    this.storage =
      options.storage ??
      new BrowserIndexedDbWalletExchangeStorage(
        this.databaseName,
        options.indexedDbFactory ?? globalThis.indexedDB,
      );
  }

  configureTrustedIssuers(issuerDids: readonly string[]): void {
    this.policy.configureTrustedIssuers(issuerDids);
  }

  async loadState(): Promise<WalletExchangeState | null> {
    return this.storage.transaction(
      ["exchange_state"],
      "readonly",
      async (transaction) => {
        const record = await transaction.get<
          PartitionRecord<WalletExchangeState>
        >("exchange_state", this.partition.key);
        if (!record) return null;
        this.assertPartitionRecord(record, "exchange state");
        this.policy.assertState(record.value);
        return cloneValue(record.value);
      },
    );
  }

  async loadOrCreateState(): Promise<WalletExchangeState> {
    return this.storage.transaction(
      ["exchange_state"],
      "readwrite",
      async (transaction) => {
        const record = await transaction.get<
          PartitionRecord<WalletExchangeState>
        >("exchange_state", this.partition.key);
        if (record) {
          this.assertPartitionRecord(record, "exchange state");
          this.policy.assertState(record.value);
          return cloneValue(record.value);
        }
        const state = createWalletExchangeState(this.partition);
        transaction.put("exchange_state", this.partition.key, {
          partitionKey: this.partition.key,
          value: state,
        } satisfies PartitionRecord<WalletExchangeState>);
        return cloneValue(state);
      },
    );
  }

  async persistCredentialReverificationState(
    previous: WalletExchangeState,
    state: WalletExchangeState,
  ): Promise<void> {
    const expected = prepareWalletExchangeCredentialReverification(previous);
    if (!this.policy.sameValue(expected, state)) {
      throw new Error(
        "Wallet Exchange verifier migration state does not match the shared policy.",
      );
    }
    await this.storage.transaction(
      ["exchange_state"],
      "readwrite",
      async (transaction) => {
        const record = await transaction.get<PartitionRecord<WalletExchangeState>>(
          "exchange_state",
          this.partition.key,
        );
        if (!record) throw new Error("Wallet Exchange state is not initialized.");
        this.assertPartitionRecord(record, "exchange state");
        if (!this.policy.sameValue(record.value, previous)) {
          throw new Error(
            "Wallet Exchange verifier migration cannot replace changed durable state.",
          );
        }
        this.policy.assertState(state);
        transaction.put("exchange_state", this.partition.key, {
          partitionKey: this.partition.key,
          value: cloneValue(state),
        } satisfies PartitionRecord<WalletExchangeState>);
      },
    );
  }

  async loadOrCreateClinicalDocumentGraphState(): Promise<WalletClinicalDocumentGraphState> {
    return this.storage.transaction(
      clinicalGraphStores,
      "readwrite",
      async (transaction) => {
        const existing = await this.readClinicalGraphState(transaction);
        if (existing) return existing;
        const state = createWalletClinicalDocumentGraphState({
          portalOrigin: this.partition.portalOrigin,
          holderDid: this.partition.holderDid,
        });
        transaction.put("clinical_graph_cursors", this.partition.key, {
          partitionKey: this.partition.key,
          value: graphMetadata(state),
        } satisfies PartitionRecord<ClinicalGraphMetadata>);
        return cloneValue(state);
      },
    );
  }

  async commitClinicalDocumentGraphReduction(
    reduction: WalletClinicalDocumentGraphSyncReduction,
  ): Promise<void> {
    assertWalletClinicalDocumentGraphState(reduction.state, this.partition);
    await this.storage.transaction(
      clinicalGraphStores,
      "readwrite",
      async (transaction) => {
        const persisted = await this.readClinicalGraphState(transaction);
        if (!persisted) {
          throw new Error(
            "Clinical Document Graph state must be initialized before commit.",
          );
        }
        if (persisted.nextCursor !== reduction.plan.expectedCursor) {
          if (
            reduction.plan.replayed &&
            stableValue(persisted) === stableValue(reduction.state)
          )
            return;
          throw new Error(
            "Clinical Document Graph atomic cursor no longer matches persisted state.",
          );
        }
        await this.replaceClinicalGraphCollection(
          transaction,
          "clinical_graph_objects",
          persisted.nodes,
          reduction.state.nodes,
          (item) => item.artifactId,
        );
        await this.replaceClinicalGraphCollection(
          transaction,
          "clinical_graph_edges",
          persisted.edges,
          reduction.state.edges,
          (item) => item.edgeId,
        );
        await this.replaceClinicalGraphCollection(
          transaction,
          "clinical_bundle_members",
          persisted.bundleMembers,
          reduction.state.bundleMembers,
          (item) => `${item.bundleArtifactId}\u0000${item.memberArtifactId}`,
        );
        await this.replaceClinicalGraphCollection(
          transaction,
          "clinical_graph_changes",
          persisted.changes,
          reduction.state.changes,
          (item) => item.changeId,
        );
        await this.replaceClinicalGraphCollection(
          transaction,
          "clinical_graph_quarantine",
          persisted.quarantine,
          reduction.state.quarantine,
          (item) => item.changeId,
        );
        transaction.put("clinical_graph_cursors", this.partition.key, {
          partitionKey: this.partition.key,
          value: graphMetadata(reduction.state),
        } satisfies PartitionRecord<ClinicalGraphMetadata>);
      },
    );
  }

  async listDocuments(): Promise<WalletDocumentRecordV2[]> {
    return this.storage.transaction(
      ["documents"],
      "readonly",
      async (transaction) => {
        const records =
          await transaction.getAll<PartitionRecord<WalletDocumentRecordV2>>(
            "documents",
          );
        return records
          .filter((record) => record.partitionKey === this.partition.key)
          .map((record) => {
            this.policy.assertDocument(record.value);
            return cloneValue(record.value);
          })
          .sort((left, right) => left.id.localeCompare(right.id));
      },
    );
  }

  async loadAvatarAsset(
    binding: WalletAvatarIdentityBinding,
  ): Promise<WalletAvatarAssetRecord | null> {
    const key = this.avatarItemKey(binding);
    return this.storage.transaction(
      ["avatar_current"],
      "readonly",
      async (transaction) => {
        const record = await transaction.get<PartitionRecord<WalletAvatarAssetRecord>>(
          "avatar_current",
          key,
        );
        if (!record) return null;
        this.assertPartitionRecord(record, "avatar asset");
        this.assertAvatarAsset(record.value, binding);
        return cloneValue(record.value);
      },
    );
  }

  async listAvatarHistory(
    binding: WalletAvatarIdentityBinding,
  ): Promise<WalletAvatarAssetRecord[]> {
    return this.storage.transaction(
      ["avatar_history"],
      "readonly",
      async (transaction) => {
        const records =
          await transaction.getAll<PartitionRecord<WalletAvatarAssetRecord>>(
            "avatar_history",
          );
        return records
          .filter(
            (record) =>
              record.partitionKey === this.partition.key &&
              walletAvatarBindingKey(record.value.binding) ===
                walletAvatarBindingKey(binding),
          )
          .map((record) => {
            this.assertAvatarAsset(record.value, binding);
            return cloneValue(record.value);
          })
          .sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt));
      },
    );
  }

  /** Atomically replaces the current avatar and archives only changed bytes/source. */
  async saveAvatarAsset(asset: WalletAvatarAssetRecord): Promise<void> {
    this.assertAvatarAsset(asset, asset.binding);
    const key = this.avatarItemKey(asset.binding);
    await this.storage.transaction(
      ["avatar_current", "avatar_history"],
      "readwrite",
      async (transaction) => {
        const existing = await transaction.get<
          PartitionRecord<WalletAvatarAssetRecord>
        >("avatar_current", key);
        if (existing) {
          this.assertPartitionRecord(existing, "avatar asset");
          this.assertAvatarAsset(existing.value, asset.binding);
          if (sameAvatarVersion(existing.value, asset)) return;
          const historyKey = [
            key,
            existing.value.fetchedAt,
            existing.value.localSha256 ?? existing.value.errorCode ?? "unknown",
          ].join("\u0000");
          transaction.put("avatar_history", historyKey, {
            partitionKey: this.partition.key,
            value: cloneValue(existing.value),
          } satisfies PartitionRecord<WalletAvatarAssetRecord>);
        }
        transaction.put("avatar_current", key, {
          partitionKey: this.partition.key,
          value: cloneValue(asset),
        } satisfies PartitionRecord<WalletAvatarAssetRecord>);
      },
    );
  }

  /**
   * Persists a reducer result before its ACK is sent. The cursor, documents,
   * and pending ACK share one read/write transaction. A stale cursor or an
   * unexpected pending ACK aborts the complete transaction.
   */
  async commitSyncReduction(
    reduction: WalletExchangeSyncReduction,
  ): Promise<void> {
    this.policy.assertReduction(reduction);
    await this.storage.transaction(
      ["exchange_state", "documents"],
      "readwrite",
      async (transaction) => {
        const persistedRecord = await transaction.get<
          PartitionRecord<WalletExchangeState>
        >("exchange_state", this.partition.key);
        if (!persistedRecord) {
          throw new Error(
            "Wallet Exchange state must be initialized before committing sync.",
          );
        }
        this.assertPartitionRecord(persistedRecord, "exchange state");
        const persisted = persistedRecord.value;
        this.policy.assertState(persisted);
        if (persisted.nextCursor !== reduction.plan.expectedCursor) {
          throw new Error(
            "Wallet Exchange atomic commit cursor no longer matches persisted state.",
          );
        }

        if (reduction.plan.replayed) {
          if (
            !this.policy.sameValue(
              persisted.pendingAck,
              reduction.plan.pendingAck,
            )
          ) {
            throw new Error(
              "Wallet Exchange replay does not match the persisted pending ACK.",
            );
          }
          if (!this.policy.sameValue(persisted, reduction.state)) {
            throw new Error(
              "Wallet Exchange replay cannot replace persisted state.",
            );
          }
          return;
        }
        if (persisted.pendingAck) {
          throw new Error(
            "Wallet Exchange must persist the prior ACK before another sync commit.",
          );
        }

        const documentRecords =
          await transaction.getAll<PartitionRecord<WalletDocumentRecordV2>>(
            "documents",
          );
        const nextDocuments = new Map(
          documentRecords
            .filter((record) => record.partitionKey === this.partition.key)
            .map((record) => [record.value.id, record.value] as const),
        );
        for (const id of reduction.plan.documents.deleteIds) {
          nextDocuments.delete(id);
        }
        for (const document of reduction.plan.documents.put) {
          this.policy.assertDocument(document);
          nextDocuments.set(document.id, document);
        }
        if (
          !this.policy.sameDocumentSet(
            Array.from(nextDocuments.values()),
            reduction.state.documents,
          )
        ) {
          throw new Error(
            "Wallet Exchange atomic document plan does not produce reducer state.",
          );
        }

        for (const id of reduction.plan.documents.deleteIds) {
          transaction.delete("documents", this.policy.documentKey(id));
        }
        for (const document of reduction.plan.documents.put) {
          transaction.put("documents", this.policy.documentKey(document.id), {
            partitionKey: this.partition.key,
            value: cloneValue(document),
          } satisfies PartitionRecord<WalletDocumentRecordV2>);
        }
        transaction.put("exchange_state", this.partition.key, {
          partitionKey: this.partition.key,
          value: cloneValue(reduction.state),
        } satisfies PartitionRecord<WalletExchangeState>);
      },
    );
  }

  /** Persist the state produced by applyWalletExchangeAckReceipt. */
  async persistAcknowledgedState(state: WalletExchangeState): Promise<void> {
    this.policy.assertState(state);
    if (state.pendingAck || !state.lastAckReceipt) {
      throw new Error(
        "Wallet Exchange acknowledged state must clear pendingAck and contain an ACK receipt.",
      );
    }
    const receipt = state.lastAckReceipt;
    await this.storage.transaction(
      ["exchange_state"],
      "readwrite",
      async (transaction) => {
        const record = await transaction.get<
          PartitionRecord<WalletExchangeState>
        >("exchange_state", this.partition.key);
        if (!record)
          throw new Error("Wallet Exchange state is not initialized.");
        this.assertPartitionRecord(record, "exchange state");
        const persisted = record.value;
        this.policy.assertState(persisted);
        if (!persisted.pendingAck) {
          if (this.policy.sameValue(persisted, state)) return;
          throw new Error(
            "Wallet Exchange has no matching pending ACK to persist.",
          );
        }
        if (
          persisted.pendingAck.syncId !== receipt.syncId ||
          persisted.pendingAck.cursor !== receipt.cursor ||
          persisted.nextCursor !== state.nextCursor
        ) {
          throw new Error(
            "Wallet Exchange ACK receipt does not match persisted pending state.",
          );
        }
        const expected = {
          ...persisted,
          pendingAck: undefined,
          lastAckReceipt: receipt,
        };
        if (!this.policy.sameValue(expected, state)) {
          throw new Error(
            "Wallet Exchange ACK persistence may only clear pendingAck and add its receipt.",
          );
        }
        transaction.put("exchange_state", this.partition.key, {
          partitionKey: this.partition.key,
          value: cloneValue(state),
        } satisfies PartitionRecord<WalletExchangeState>);
      },
    );
  }

  /** Persist retry/outbox reducer changes without mutating sync state. */
  async persistRetryOutboxState(state: WalletExchangeState): Promise<void> {
    this.policy.assertState(state);
    await this.storage.transaction(
      ["exchange_state"],
      "readwrite",
      async (transaction) => {
        const record = await transaction.get<
          PartitionRecord<WalletExchangeState>
        >("exchange_state", this.partition.key);
        if (!record)
          throw new Error("Wallet Exchange state is not initialized.");
        this.assertPartitionRecord(record, "exchange state");
        this.policy.assertState(record.value);
        const expected = {
          ...record.value,
          retryJournal: state.retryJournal,
        };
        if (!this.policy.sameValue(expected, state)) {
          throw new Error(
            "Wallet Exchange retry persistence cannot mutate cursor, documents, or ACK state.",
          );
        }
        transaction.put("exchange_state", this.partition.key, {
          partitionKey: this.partition.key,
          value: cloneValue(state),
        } satisfies PartitionRecord<WalletExchangeState>);
      },
    );
  }

  async saveHolderIdentity(identity: HolderSigningIdentity): Promise<void> {
    await this.assertHolderIdentity(identity);
    const record: HolderKeyRecord = {
      schema: "trustcare.wallet.holder-key.v1",
      partitionKey: this.partition.key,
      value: cloneValue(identity),
    };
    await this.storage.transaction(
      ["holder_keys"],
      "readwrite",
      async (transaction) => {
        const existing = await transaction.get<HolderKeyRecord>(
          "holder_keys",
          this.partition.key,
        );
        if (existing) {
          this.assertPartitionRecord(existing, "holder key");
          await this.assertHolderIdentity(existing.value);
          if (
            existing.value.publicJwkThumbprint !== identity.publicJwkThumbprint
          ) {
            throw new Error(
              "Wallet Exchange holder key replacement requires a new did:key partition.",
            );
          }
        }
        transaction.put("holder_keys", this.partition.key, record);
      },
    );
  }

  async loadHolderIdentity(): Promise<HolderSigningIdentity | null> {
    return this.storage.transaction(
      ["holder_keys"],
      "readonly",
      async (transaction) => {
        const record = await transaction.get<HolderKeyRecord>(
          "holder_keys",
          this.partition.key,
        );
        if (!record) return null;
        this.assertPartitionRecord(record, "holder key");
        if (record.schema !== "trustcare.wallet.holder-key.v1") {
          throw new Error("Unsupported Wallet Exchange holder key schema.");
        }
        await this.assertHolderIdentity(record.value);
        return cloneValue(record.value);
      },
    );
  }

  async saveCredentialRequestLink(
    link: WalletExchangeCredentialRequestLink,
  ): Promise<void> {
    this.policy.assertRequestLink(link);
    await this.saveLink(
      "request_links",
      this.policy.requestLinkKey(link.clientRequestId),
      link,
      (existing) =>
        existing.clientRequestId === link.clientRequestId &&
        existing.requestId === link.requestId &&
        existing.idempotencyKey === link.idempotencyKey,
      "credential request",
    );
  }

  async getCredentialRequestLink(
    clientRequestId: string,
  ): Promise<WalletExchangeCredentialRequestLink | null> {
    return this.getLink(
      "request_links",
      this.policy.requestLinkKey(
        requireText(clientRequestId, "clientRequestId"),
      ),
      (link) => this.policy.assertRequestLink(link),
    );
  }

  async listCredentialRequestLinks(): Promise<
    WalletExchangeCredentialRequestLink[]
  > {
    return this.listLinks("request_links", (link) =>
      this.policy.assertRequestLink(link),
    );
  }

  async saveSubmissionLink(link: WalletExchangeSubmissionLink): Promise<void> {
    this.policy.assertSubmissionLink(link);
    await this.saveLink(
      "submission_links",
      this.policy.submissionLinkKey(link.clientSubmissionId),
      link,
      (existing) =>
        existing.clientSubmissionId === link.clientSubmissionId &&
        existing.submissionId === link.submissionId &&
        existing.idempotencyKey === link.idempotencyKey,
      "submission",
    );
  }

  async getSubmissionLink(
    clientSubmissionId: string,
  ): Promise<WalletExchangeSubmissionLink | null> {
    return this.getLink(
      "submission_links",
      this.policy.submissionLinkKey(
        requireText(clientSubmissionId, "clientSubmissionId"),
      ),
      (link) => this.policy.assertSubmissionLink(link),
    );
  }

  async listSubmissionLinks(): Promise<WalletExchangeSubmissionLink[]> {
    return this.listLinks("submission_links", (link) =>
      this.policy.assertSubmissionLink(link),
    );
  }

  async savePendingSubmissionDraft(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void> {
    await this.policy.assertPendingSubmissionDraft(draft);
    const key = this.policy.submissionLinkKey(draft.clientSubmissionId);
    await this.storage.transaction(
      ["submission_outbox", "submission_links"],
      "readwrite",
      async (transaction) => {
        const completed = await transaction.get<
          PartitionRecord<WalletExchangeSubmissionLink>
        >("submission_links", key);
        if (completed) {
          this.assertPartitionRecord(completed, "submission");
          this.policy.assertSubmissionLink(completed.value);
          throw new Error(
            "Wallet Exchange submission is already complete and cannot be queued again.",
          );
        }
        const existing = await transaction.get<
          PartitionRecord<WalletExchangePendingSubmissionDraft>
        >("submission_outbox", key);
        if (existing) {
          this.assertPartitionRecord(existing, "submission outbox");
          await this.policy.assertPendingSubmissionDraft(existing.value);
          if (!this.policy.sameValue(existing.value, draft)) {
            throw new Error(
              "Wallet Exchange submission outbox conflicts with its immutable request bytes.",
            );
          }
          return;
        }
        transaction.put("submission_outbox", key, {
          partitionKey: this.partition.key,
          value: cloneValue(draft),
        } satisfies PartitionRecord<WalletExchangePendingSubmissionDraft>);
      },
    );
  }

  async getPendingSubmissionDraft(
    clientSubmissionId: string,
  ): Promise<WalletExchangePendingSubmissionDraft | null> {
    return this.storage.transaction(
      ["submission_outbox"],
      "readonly",
      async (transaction) => {
        const record = await transaction.get<
          PartitionRecord<WalletExchangePendingSubmissionDraft>
        >(
          "submission_outbox",
          this.policy.submissionLinkKey(
            requireText(clientSubmissionId, "clientSubmissionId"),
          ),
        );
        if (!record) return null;
        this.assertPartitionRecord(record, "submission outbox");
        await this.policy.assertPendingSubmissionDraft(record.value);
        return cloneValue(record.value);
      },
    );
  }

  async listPendingSubmissionDrafts(): Promise<
    WalletExchangePendingSubmissionDraft[]
  > {
    return this.storage.transaction(
      ["submission_outbox"],
      "readonly",
      async (transaction) => {
        const records =
          await transaction.getAll<
            PartitionRecord<WalletExchangePendingSubmissionDraft>
          >("submission_outbox");
        const drafts: WalletExchangePendingSubmissionDraft[] = [];
        for (const record of records) {
          if (record.partitionKey !== this.partition.key) continue;
          this.assertPartitionRecord(record, "submission outbox");
          await this.policy.assertPendingSubmissionDraft(record.value);
          drafts.push(cloneValue(record.value));
        }
        return drafts.sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        );
      },
    );
  }

  async completePendingSubmission(
    draft: WalletExchangePendingSubmissionDraft,
    link: WalletExchangeSubmissionLink,
  ): Promise<void> {
    await this.policy.assertPendingSubmissionDraft(draft);
    this.policy.assertSubmissionLink(link);
    this.policy.assertDraftMatchesLink(draft, link);
    const key = this.policy.submissionLinkKey(draft.clientSubmissionId);
    await this.storage.transaction(
      ["submission_outbox", "submission_links"],
      "readwrite",
      async (transaction) => {
        const pending = await transaction.get<
          PartitionRecord<WalletExchangePendingSubmissionDraft>
        >("submission_outbox", key);
        const completed = await transaction.get<
          PartitionRecord<WalletExchangeSubmissionLink>
        >("submission_links", key);
        if (!pending) {
          if (completed) {
            this.assertPartitionRecord(completed, "submission");
            this.policy.assertSubmissionLink(completed.value);
            if (this.policy.sameValue(completed.value, link)) return;
          }
          throw new Error(
            "Wallet Exchange pending submission draft is missing during completion.",
          );
        }
        this.assertPartitionRecord(pending, "submission outbox");
        await this.policy.assertPendingSubmissionDraft(pending.value);
        if (!this.policy.sameValue(pending.value, draft)) {
          throw new Error(
            "Wallet Exchange pending submission changed before completion.",
          );
        }
        if (completed) {
          this.assertPartitionRecord(completed, "submission");
          this.policy.assertSubmissionLink(completed.value);
          if (!this.policy.sameValue(completed.value, link)) {
            throw new Error(
              "Wallet Exchange completed submission conflicts with its durable link.",
            );
          }
        } else {
          transaction.put("submission_links", key, {
            partitionKey: this.partition.key,
            value: cloneValue(link),
          } satisfies PartitionRecord<WalletExchangeSubmissionLink>);
        }
        transaction.delete("submission_outbox", key);
      },
    );
  }

  async savePendingShlAssociation(
    record: WalletExchangeShlAssociationRecord,
  ): Promise<void> {
    this.assertShlAssociationRecord(record);
    if (record.status !== "pending" || record.response) {
      throw new Error("Only a pending SHL association may enter the outbox.");
    }
    const key = this.graphItemKey(record.manifestCredentialId);
    await this.storage.transaction(
      ["shl_associations"],
      "readwrite",
      async (transaction) => {
        const existing = await transaction.get<
          PartitionRecord<WalletExchangeShlAssociationRecord>
        >("shl_associations", key);
        if (existing) {
          this.assertPartitionRecord(existing, "SHL association");
          this.assertShlAssociationRecord(existing.value);
          if (JSON.stringify(existing.value) !== JSON.stringify(record)) {
            throw new Error(
              "Wallet SHL association conflicts with immutable signed request bytes.",
            );
          }
          return;
        }
        transaction.put("shl_associations", key, {
          partitionKey: this.partition.key,
          value: cloneValue(record),
        } satisfies PartitionRecord<WalletExchangeShlAssociationRecord>);
      },
    );
  }

  async getShlAssociation(
    manifestCredentialId: string,
  ): Promise<WalletExchangeShlAssociationRecord | null> {
    const key = this.graphItemKey(
      requireText(manifestCredentialId, "manifestCredentialId"),
    );
    return this.storage.transaction(
      ["shl_associations"],
      "readonly",
      async (transaction) => {
        const record = await transaction.get<
          PartitionRecord<WalletExchangeShlAssociationRecord>
        >("shl_associations", key);
        if (!record) return null;
        this.assertPartitionRecord(record, "SHL association");
        this.assertShlAssociationRecord(record.value);
        return cloneValue(record.value);
      },
    );
  }

  async completeShlAssociation(
    pending: WalletExchangeShlAssociationRecord,
    response: NonNullable<WalletExchangeShlAssociationRecord["response"]>,
  ): Promise<void> {
    this.assertShlAssociationRecord(pending);
    const key = this.graphItemKey(pending.manifestCredentialId);
    await this.storage.transaction(
      ["shl_associations"],
      "readwrite",
      async (transaction) => {
        const existing = await transaction.get<
          PartitionRecord<WalletExchangeShlAssociationRecord>
        >("shl_associations", key);
        if (!existing) throw new Error("SHL association outbox entry is missing.");
        this.assertPartitionRecord(existing, "SHL association");
        this.assertShlAssociationRecord(existing.value);
        if (
          existing.value.status === "complete" &&
          JSON.stringify(existing.value.response) === JSON.stringify(response)
        ) {
          return;
        }
        if (JSON.stringify(existing.value) !== JSON.stringify(pending)) {
          throw new Error("SHL association changed before completion.");
        }
        const complete: WalletExchangeShlAssociationRecord = {
          ...pending,
          status: "complete",
          response: cloneValue(response),
          updatedAt: response.associatedAt,
        };
        this.assertShlAssociationRecord(complete);
        transaction.put("shl_associations", key, {
          partitionKey: this.partition.key,
          value: complete,
        } satisfies PartitionRecord<WalletExchangeShlAssociationRecord>);
      },
    );
  }

  private async saveLink<T>(
    store: "request_links" | "submission_links",
    key: string,
    link: T,
    sameIdentity: (existing: T) => boolean,
    label: string,
  ): Promise<void> {
    this.policy.assertNoSensitiveMaterial(link);
    await this.storage.transaction(
      [store],
      "readwrite",
      async (transaction) => {
        const existing = await transaction.get<PartitionRecord<T>>(store, key);
        if (existing) {
          this.assertPartitionRecord(existing, label);
          if (!sameIdentity(existing.value)) {
            throw new Error(
              `Wallet Exchange ${label} link conflicts with its durable idempotency identity.`,
            );
          }
        }
        transaction.put(store, key, {
          partitionKey: this.partition.key,
          value: cloneValue(link),
        } satisfies PartitionRecord<T>);
      },
    );
  }

  private async getLink<T>(
    store: "request_links" | "submission_links",
    key: string,
    validate: (link: T) => void,
  ): Promise<T | null> {
    return this.storage.transaction(
      [store],
      "readonly",
      async (transaction) => {
        const record = await transaction.get<PartitionRecord<T>>(store, key);
        if (!record) return null;
        this.assertPartitionRecord(record, store);
        validate(record.value);
        return cloneValue(record.value);
      },
    );
  }

  private async listLinks<T>(
    store: "request_links" | "submission_links",
    validate: (link: T) => void,
  ): Promise<T[]> {
    return this.storage.transaction(
      [store],
      "readonly",
      async (transaction) => {
        const records = await transaction.getAll<PartitionRecord<T>>(store);
        return records
          .filter((record) => record.partitionKey === this.partition.key)
          .map((record) => {
            validate(record.value);
            return cloneValue(record.value);
          });
      },
    );
  }

  private assertShlAssociationRecord(
    record: WalletExchangeShlAssociationRecord,
  ): void {
    if (
      record.schema !== "trustcare.wallet.shl-association-outbox.v1" ||
      !Number.isInteger(record.shlId) ||
      record.shlId < 1 ||
      !record.manifestCredentialId ||
      !record.clientAssociationId ||
      !record.consentRef ||
      !record.idempotencyKey ||
      !record.holderPresentationId ||
      record.holderVpJwt.split(".").length !== 3 ||
      !/^sha256:[a-f0-9]{64}$/.test(record.requestDigest) ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      (record.status === "complete") !== Boolean(record.response)
    ) {
      throw new Error("Wallet SHL association outbox record is invalid.");
    }
    if (
      record.response &&
      (record.response.shlId !== record.shlId ||
        record.response.manifestCredentialId !== record.manifestCredentialId ||
        record.response.holderPresentationId !== record.holderPresentationId)
    ) {
      throw new Error("Wallet SHL association response binding is invalid.");
    }
  }

  private async assertHolderIdentity(
    identity: HolderSigningIdentity,
  ): Promise<void> {
    if (identity.did !== this.partition.holderDid) {
      throw new Error("Wallet Exchange holder key belongs to another did:key.");
    }
    if (
      Object.prototype.hasOwnProperty.call(identity.publicJwk, "d") ||
      isJwk(identity.privateKey)
    ) {
      throw new Error(
        "Wallet Exchange browser persistence rejects private or extractable JWK material.",
      );
    }
    if (!isCryptoKeyLike(identity.privateKey)) {
      throw new Error(
        "Wallet Exchange holder private key must be a non-extractable CryptoKey.",
      );
    }
    if (
      identity.privateKey.type !== "private" ||
      identity.privateKey.extractable ||
      !identity.privateKey.usages.includes("sign")
    ) {
      throw new Error(
        "Wallet Exchange holder private key must be non-extractable and sign-only.",
      );
    }
    const derived = await holderIdentityFromPublicKey(identity.publicJwk);
    if (
      derived.did !== identity.did ||
      derived.kid !== identity.kid ||
      derived.jwsAlgorithm !== identity.jwsAlgorithm ||
      derived.publicJwkThumbprint !== identity.publicJwkThumbprint
    ) {
      throw new Error(
        "Wallet Exchange holder identity metadata is inconsistent.",
      );
    }
  }

  private async readClinicalGraphState(
    transaction: IndexedDbWalletExchangeTransaction,
  ): Promise<WalletClinicalDocumentGraphState | null> {
    const metadata = await transaction.get<
      PartitionRecord<ClinicalGraphMetadata>
    >("clinical_graph_cursors", this.partition.key);
    if (!metadata) return null;
    this.assertPartitionRecord(metadata, "clinical graph cursor");
    const [nodes, edges, bundleMembers, changes, quarantine] =
      await Promise.all([
        transaction.getAll<
          PartitionRecord<WalletClinicalDocumentGraphState["nodes"][number]>
        >("clinical_graph_objects"),
        transaction.getAll<
          PartitionRecord<WalletClinicalDocumentGraphState["edges"][number]>
        >("clinical_graph_edges"),
        transaction.getAll<
          PartitionRecord<
            WalletClinicalDocumentGraphState["bundleMembers"][number]
          >
        >("clinical_bundle_members"),
        transaction.getAll<
          PartitionRecord<WalletClinicalDocumentGraphState["changes"][number]>
        >("clinical_graph_changes"),
        transaction.getAll<
          PartitionRecord<
            WalletClinicalDocumentGraphState["quarantine"][number]
          >
        >("clinical_graph_quarantine"),
      ]);
    const values = <T>(records: PartitionRecord<T>[]) =>
      records
        .filter((record) => record.partitionKey === this.partition.key)
        .map((record) => cloneValue(record.value));
    const state: WalletClinicalDocumentGraphState = {
      ...cloneValue(metadata.value),
      nodes: values(nodes),
      edges: values(edges),
      bundleMembers: values(bundleMembers),
      changes: values(changes),
      quarantine: values(quarantine),
    };
    assertWalletClinicalDocumentGraphState(state, this.partition);
    return state;
  }

  private async replaceClinicalGraphCollection<T>(
    transaction: IndexedDbWalletExchangeTransaction,
    store: IndexedDbWalletExchangeStoreName,
    previous: T[],
    next: T[],
    identifier: (item: T) => string,
  ): Promise<void> {
    for (const item of previous) {
      transaction.delete(store, this.graphItemKey(identifier(item)));
    }
    for (const item of next) {
      transaction.put(store, this.graphItemKey(identifier(item)), {
        partitionKey: this.partition.key,
        value: cloneValue(item),
      } satisfies PartitionRecord<T>);
    }
  }

  private graphItemKey(identifier: string): string {
    return `${this.partition.key}\u0000${identifier}`;
  }

  private avatarItemKey(binding: WalletAvatarIdentityBinding): string {
    if (binding.holderDid !== this.partition.holderDid) {
      throw new Error("Wallet avatar holder partition boundary violation.");
    }
    return `${this.partition.key}\u0000${walletAvatarBindingKey(binding)}`;
  }

  private assertAvatarAsset(
    asset: WalletAvatarAssetRecord,
    binding: WalletAvatarIdentityBinding,
  ): void {
    if (
      asset.schema !== "trustcare.wallet.avatar.v1" ||
      walletAvatarBindingKey(asset.binding) !== walletAvatarBindingKey(binding) ||
      asset.binding.holderDid !== this.partition.holderDid ||
      !Number.isFinite(Date.parse(asset.fetchedAt))
    ) {
      throw new Error("Wallet avatar asset violates its identity binding.");
    }
    if (
      asset.status === "ready" &&
      (!asset.sourceUrl?.startsWith("https://") ||
        !asset.mediaType?.startsWith("image/") ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.localSha256 ?? "") ||
        !asset.contentBase64)
    ) {
      throw new Error("Ready Wallet avatar asset is incomplete.");
    }
  }

  private assertPartitionRecord<T>(
    record: PartitionRecord<T>,
    label: string,
  ): void {
    if (record.partitionKey !== this.partition.key) {
      throw new Error(`Wallet Exchange ${label} partition boundary violation.`);
    }
  }
}

export function createIndexedDbWalletExchangeDatabaseName(input: {
  portalOrigin: string;
  holderDid: string;
  schemaNamespace?: string;
}): string {
  const partition = createWalletExchangePartition(input);
  const schemaNamespace = requireText(
    input.schemaNamespace ?? INDEXED_DB_WALLET_EXCHANGE_SCHEMA,
    "schemaNamespace",
  );
  return [
    "trustcare-wallet-exchange",
    encodeURIComponent(schemaNamespace),
    partition.key,
  ].join("::");
}

class BrowserIndexedDbWalletExchangeStorage implements IndexedDbWalletExchangeStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName: string,
    private readonly factory: IDBFactory | undefined,
  ) {}

  async transaction<T>(
    stores: readonly IndexedDbWalletExchangeStoreName[],
    mode: IndexedDbWalletExchangeTransactionMode,
    operation: (transaction: IndexedDbWalletExchangeTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.open();
    const transaction = database.transaction(Array.from(new Set(stores)), mode);
    const adapter: IndexedDbWalletExchangeTransaction = {
      get: <Value>(store: IndexedDbWalletExchangeStoreName, key: string) =>
        requestResult<Value | undefined>(
          transaction.objectStore(store).get(key) as IDBRequest<
            Value | undefined
          >,
        ),
      getAll: <Value>(store: IndexedDbWalletExchangeStoreName) =>
        requestResult<Value[]>(
          transaction.objectStore(store).getAll() as IDBRequest<Value[]>,
        ),
      put: (store, key, value) => {
        transaction.objectStore(store).put(value, key);
      },
      delete: (store, key) => {
        transaction.objectStore(store).delete(key);
      },
    };
    try {
      const result = await operation(adapter);
      await transactionComplete(transaction);
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // A completed/aborted transaction already preserved atomicity.
      }
      throw error;
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) {
      throw new Error("IndexedDB is not available in this Web runtime.");
    }
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.factory!.open(
        this.databaseName,
        INDEXED_DB_WALLET_EXCHANGE_VERSION,
      );
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of [
          "exchange_state",
          "documents",
          "holder_keys",
          "request_links",
          "submission_links",
          "submission_outbox",
          "shl_associations",
          "clinical_graph_objects",
          "clinical_graph_edges",
          "clinical_bundle_members",
          "clinical_graph_changes",
          "clinical_graph_cursors",
          "clinical_graph_quarantine",
          "avatar_current",
          "avatar_history",
        ] satisfies IndexedDbWalletExchangeStoreName[]) {
          if (!database.objectStoreNames.contains(store)) {
            database.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        this.databasePromise = null;
        reject(request.error);
      };
      request.onblocked = () => {
        this.databasePromise = null;
        reject(new Error(`IndexedDB open blocked for ${this.databaseName}.`));
      };
    });
    return this.databasePromise;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function sameAvatarVersion(
  left: WalletAvatarAssetRecord,
  right: WalletAvatarAssetRecord,
): boolean {
  return (
    walletAvatarBindingKey(left.binding) === walletAvatarBindingKey(right.binding) &&
    left.status === right.status &&
    left.sourceUrl === right.sourceUrl &&
    left.sourceCredentialId === right.sourceCredentialId &&
    left.sourceDocumentId === right.sourceDocumentId &&
    left.mediaType === right.mediaType &&
    left.localSha256 === right.localSha256 &&
    left.signedDigest === right.signedDigest &&
    left.proofScope === right.proofScope &&
    left.errorCode === right.errorCode
  );
}

function isJwk(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).kty === "string",
  );
}

function isCryptoKeyLike(value: unknown): value is CryptoKey {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CryptoKey>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.extractable === "boolean" &&
    Array.isArray(candidate.usages) &&
    Boolean(candidate.algorithm && typeof candidate.algorithm.name === "string")
  );
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string.`);
  return normalized;
}

function cloneValue<T>(value: T): T {
  return globalThis.structuredClone(value);
}

function graphMetadata(
  state: WalletClinicalDocumentGraphState,
): ClinicalGraphMetadata {
  const {
    nodes: _nodes,
    edges: _edges,
    bundleMembers: _bundleMembers,
    changes: _changes,
    quarantine: _quarantine,
    ...metadata
  } = state;
  return cloneValue(metadata);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

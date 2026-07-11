import {
  createWalletExchangePartition,
  createWalletExchangeState,
  holderIdentityFromPublicKey,
  type HolderSigningIdentity,
  type WalletDocumentRecordV2,
  type WalletExchangePartition,
  type WalletExchangeState,
  type WalletExchangeSyncReduction,
} from "@trustcare/wallet-core";
import type {
  WalletExchangeCredentialRequestLink,
  WalletExchangePendingSubmissionDraft,
  WalletExchangeSubmissionLink,
} from "@trustcare/api-client";

export const INDEXED_DB_WALLET_EXCHANGE_SCHEMA =
  "wallet-exchange-v2@2" as const;
export const INDEXED_DB_WALLET_EXCHANGE_VERSION = 2 as const;

export type IndexedDbWalletExchangeStoreName =
  | "exchange_state"
  | "documents"
  | "holder_keys"
  | "request_links"
  | "submission_links"
  | "submission_outbox";

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

  constructor(options: IndexedDbWalletExchangePersistenceOptions) {
    this.partition = createWalletExchangePartition({
      portalOrigin: options.portalOrigin,
      holderDid: options.holderDid,
    });
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
        this.assertState(record.value);
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
          this.assertState(record.value);
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
            this.assertDocument(record.value);
            return cloneValue(record.value);
          })
          .sort((left, right) => left.id.localeCompare(right.id));
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
    this.assertReduction(reduction);
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
        this.assertState(persisted);
        if (persisted.nextCursor !== reduction.plan.expectedCursor) {
          throw new Error(
            "Wallet Exchange atomic commit cursor no longer matches persisted state.",
          );
        }

        if (reduction.plan.replayed) {
          if (!sameValue(persisted.pendingAck, reduction.plan.pendingAck)) {
            throw new Error(
              "Wallet Exchange replay does not match the persisted pending ACK.",
            );
          }
          if (!sameValue(persisted, reduction.state)) {
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
          this.assertDocument(document);
          nextDocuments.set(document.id, document);
        }
        if (
          !sameDocumentSet(
            Array.from(nextDocuments.values()),
            reduction.state.documents,
          )
        ) {
          throw new Error(
            "Wallet Exchange atomic document plan does not produce reducer state.",
          );
        }

        for (const id of reduction.plan.documents.deleteIds) {
          transaction.delete("documents", this.documentKey(id));
        }
        for (const document of reduction.plan.documents.put) {
          transaction.put("documents", this.documentKey(document.id), {
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
    this.assertState(state);
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
        this.assertState(persisted);
        if (!persisted.pendingAck) {
          if (sameValue(persisted, state)) return;
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
        if (!sameValue(expected, state)) {
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
    this.assertState(state);
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
        this.assertState(record.value);
        const expected = {
          ...record.value,
          retryJournal: state.retryJournal,
        };
        if (!sameValue(expected, state)) {
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
    this.assertRequestLink(link);
    await this.saveLink(
      "request_links",
      this.requestLinkKey(link.clientRequestId),
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
      this.requestLinkKey(requireText(clientRequestId, "clientRequestId")),
      (link) => this.assertRequestLink(link),
    );
  }

  async listCredentialRequestLinks(): Promise<
    WalletExchangeCredentialRequestLink[]
  > {
    return this.listLinks("request_links", (link) =>
      this.assertRequestLink(link),
    );
  }

  async saveSubmissionLink(link: WalletExchangeSubmissionLink): Promise<void> {
    this.assertSubmissionLink(link);
    await this.saveLink(
      "submission_links",
      this.submissionLinkKey(link.clientSubmissionId),
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
      this.submissionLinkKey(
        requireText(clientSubmissionId, "clientSubmissionId"),
      ),
      (link) => this.assertSubmissionLink(link),
    );
  }

  async listSubmissionLinks(): Promise<WalletExchangeSubmissionLink[]> {
    return this.listLinks("submission_links", (link) =>
      this.assertSubmissionLink(link),
    );
  }

  async savePendingSubmissionDraft(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void> {
    await this.assertPendingSubmissionDraft(draft);
    const key = this.submissionLinkKey(draft.clientSubmissionId);
    await this.storage.transaction(
      ["submission_outbox", "submission_links"],
      "readwrite",
      async (transaction) => {
        const completed = await transaction.get<
          PartitionRecord<WalletExchangeSubmissionLink>
        >("submission_links", key);
        if (completed) {
          this.assertPartitionRecord(completed, "submission");
          this.assertSubmissionLink(completed.value);
          throw new Error(
            "Wallet Exchange submission is already complete and cannot be queued again.",
          );
        }
        const existing = await transaction.get<
          PartitionRecord<WalletExchangePendingSubmissionDraft>
        >("submission_outbox", key);
        if (existing) {
          this.assertPartitionRecord(existing, "submission outbox");
          await this.assertPendingSubmissionDraft(existing.value);
          if (!sameValue(existing.value, draft)) {
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
          this.submissionLinkKey(
            requireText(clientSubmissionId, "clientSubmissionId"),
          ),
        );
        if (!record) return null;
        this.assertPartitionRecord(record, "submission outbox");
        await this.assertPendingSubmissionDraft(record.value);
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
          await this.assertPendingSubmissionDraft(record.value);
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
    await this.assertPendingSubmissionDraft(draft);
    this.assertSubmissionLink(link);
    this.assertDraftMatchesLink(draft, link);
    const key = this.submissionLinkKey(draft.clientSubmissionId);
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
            this.assertSubmissionLink(completed.value);
            if (sameValue(completed.value, link)) return;
          }
          throw new Error(
            "Wallet Exchange pending submission draft is missing during completion.",
          );
        }
        this.assertPartitionRecord(pending, "submission outbox");
        await this.assertPendingSubmissionDraft(pending.value);
        if (!sameValue(pending.value, draft)) {
          throw new Error(
            "Wallet Exchange pending submission changed before completion.",
          );
        }
        if (completed) {
          this.assertPartitionRecord(completed, "submission");
          this.assertSubmissionLink(completed.value);
          if (!sameValue(completed.value, link)) {
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

  private async saveLink<T>(
    store: "request_links" | "submission_links",
    key: string,
    link: T,
    sameIdentity: (existing: T) => boolean,
    label: string,
  ): Promise<void> {
    assertNoTokenMaterial(link);
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

  private assertReduction(reduction: WalletExchangeSyncReduction): void {
    this.assertState(reduction.state);
    if (reduction.plan.partitionKey !== this.partition.key) {
      throw new Error(
        "Wallet Exchange atomic plan belongs to another partition.",
      );
    }
    if (
      reduction.state.nextCursor !== reduction.plan.nextCursor ||
      !sameValue(reduction.state.pendingAck, reduction.plan.pendingAck)
    ) {
      throw new Error(
        "Wallet Exchange reducer state does not match its atomic cursor and pending ACK plan.",
      );
    }
    for (const document of reduction.plan.documents.put) {
      this.assertDocument(document);
    }
    assertNoTokenMaterial(reduction.state);
  }

  private assertState(state: WalletExchangeState): void {
    if (state.partition.key !== this.partition.key) {
      throw new Error("Wallet Exchange state belongs to another partition.");
    }
    const normalized = createWalletExchangePartition(state.partition);
    if (
      normalized.portalOrigin !== this.partition.portalOrigin ||
      normalized.holderDid !== this.partition.holderDid ||
      normalized.key !== this.partition.key
    ) {
      throw new Error("Wallet Exchange state partition metadata is invalid.");
    }
    state.documents.forEach((document) => this.assertDocument(document));
    assertNoTokenMaterial(state);
  }

  private assertDocument(document: WalletDocumentRecordV2): void {
    if (document.schemaVersion !== "2.0") {
      throw new Error(
        "Wallet Exchange only persists Wallet document V2 records.",
      );
    }
    if (
      document.owner.patientId !== undefined ||
      document.owner.id !== this.partition.holderDid ||
      document.owner.holderDid !== this.partition.holderDid
    ) {
      throw new Error(
        "Wallet Exchange document must belong only to its holder did:key partition.",
      );
    }
    if (document.provenance.sourceKind !== "trustcare_portal") {
      throw new Error(
        "Wallet Exchange persistence accepts only live Portal-synced documents.",
      );
    }
    const issuerDid = document.provenance.issuerDid;
    if (!issuerDid || !this.portalIssuerDids().has(issuerDid)) {
      throw new Error(
        "Wallet Exchange document issuer must be the live Portal hospital did:web; legacy issuer fallback is forbidden.",
      );
    }
    assertNoTokenMaterial(document);
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

  private assertRequestLink(link: WalletExchangeCredentialRequestLink): void {
    assertExactKeys(link, [
      "clientRequestId",
      "requestId",
      "idempotencyKey",
      "statusUrl",
      "lastKnownStatus",
      "targetHospitalCode",
      "context",
      "purpose",
      "credentialTypes",
      "documentTypes",
      "createdAt",
      "updatedAt",
    ]);
    requireText(link.clientRequestId, "clientRequestId");
    requireText(link.requestId, "requestId");
    requireText(link.idempotencyKey, "idempotencyKey");
    this.assertPortalStatusUrl(
      link.statusUrl,
      "credential-requests",
      link.requestId,
    );
    requireTimestamp(link.createdAt, "createdAt");
    requireTimestamp(link.updatedAt, "updatedAt");
    if (link.lastKnownStatus !== undefined)
      requireText(link.lastKnownStatus, "lastKnownStatus");
    if (!["TCC", "TCP", "TCM"].includes(link.targetHospitalCode)) {
      throw new Error("Wallet Exchange request hospital code is invalid.");
    }
    requireText(link.context, "context");
    requireText(link.purpose, "purpose");
    requireStringList(link.credentialTypes, "credentialTypes");
    if (link.documentTypes !== undefined) {
      requireStringList(link.documentTypes, "documentTypes");
    }
    assertNoTokenMaterial(link);
  }

  private assertSubmissionLink(link: WalletExchangeSubmissionLink): void {
    assertExactKeys(link, [
      "clientSubmissionId",
      "submissionId",
      "idempotencyKey",
      "intentDigest",
      "requestDigest",
      "statusUrl",
      "lastKnownStatus",
      "createdAt",
      "updatedAt",
    ]);
    requireText(link.clientSubmissionId, "clientSubmissionId");
    requireText(link.submissionId, "submissionId");
    requireText(link.idempotencyKey, "idempotencyKey");
    requireSha256(link.intentDigest, "intentDigest");
    requireSha256(link.requestDigest, "requestDigest");
    this.assertPortalStatusUrl(
      link.statusUrl,
      "submissions",
      link.submissionId,
    );
    requireTimestamp(link.createdAt, "createdAt");
    requireTimestamp(link.updatedAt, "updatedAt");
    if (link.lastKnownStatus !== undefined)
      requireText(link.lastKnownStatus, "lastKnownStatus");
    assertNoTokenMaterial(link);
  }

  private async assertPendingSubmissionDraft(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void> {
    assertExactKeys(draft, [
      "schema",
      "clientSubmissionId",
      "idempotencyKey",
      "intentDigest",
      "requestDigest",
      "requestBody",
      "request",
      "createdAt",
    ]);
    if (draft.schema !== "trustcare.wallet.submission-outbox.v1") {
      throw new Error("Unsupported Wallet Exchange submission outbox schema.");
    }
    requireText(draft.clientSubmissionId, "clientSubmissionId");
    requireText(draft.idempotencyKey, "idempotencyKey");
    requireSha256(draft.intentDigest, "intentDigest");
    requireSha256(draft.requestDigest, "requestDigest");
    requireTimestamp(draft.createdAt, "createdAt");
    assertExactKeys(draft.request, [
      "clientSubmissionId",
      "context",
      "purpose",
      "consentRef",
      "transport",
    ]);
    assertExactKeys(draft.request.transport, ["mode", "vpJwt"]);
    if (
      draft.request.clientSubmissionId !== draft.clientSubmissionId ||
      draft.request.transport.mode !== "direct_vp" ||
      draft.request.transport.vpJwt.split(".").length !== 3
    ) {
      throw new Error(
        "Wallet Exchange submission outbox must contain one exact holder-signed direct VP request.",
      );
    }
    requireText(draft.request.context, "context");
    requireText(draft.request.purpose, "purpose");
    requireText(draft.request.consentRef, "consentRef");
    requireText(draft.request.transport.vpJwt, "vpJwt");
    if (JSON.stringify(draft.request) !== draft.requestBody) {
      throw new Error(
        "Wallet Exchange submission outbox request bytes do not match its request object.",
      );
    }
    if ((await sha256Digest(draft.requestBody)) !== draft.requestDigest) {
      throw new Error(
        "Wallet Exchange submission outbox request digest is invalid.",
      );
    }
    assertNoPatientId(draft);
    assertNoTokenMaterial(draft);
  }

  private assertDraftMatchesLink(
    draft: WalletExchangePendingSubmissionDraft,
    link: WalletExchangeSubmissionLink,
  ): void {
    if (
      draft.clientSubmissionId !== link.clientSubmissionId ||
      draft.idempotencyKey !== link.idempotencyKey ||
      draft.intentDigest !== link.intentDigest ||
      draft.requestDigest !== link.requestDigest
    ) {
      throw new Error(
        "Wallet Exchange submission link does not match its pending outbox identity.",
      );
    }
  }

  private assertPortalStatusUrl(
    value: string,
    collection: "credential-requests" | "submissions",
    id: string,
  ): void {
    const url = new URL(
      requireText(value, "statusUrl"),
      this.partition.portalOrigin,
    );
    const expectedPath = `/api/wallet/v2/${collection}/${encodeURIComponent(id)}`;
    if (
      url.origin !== this.partition.portalOrigin ||
      url.pathname !== expectedPath ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Wallet Exchange statusUrl must be the exact Portal status endpoint.",
      );
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

  private portalIssuerDids(): Set<string> {
    const url = new URL(this.partition.portalOrigin);
    const authority = url.host.replace(/:/g, "%3A");
    return new Set(
      ["tcc", "tcp", "tcm"].map(
        (hospitalCode) => `did:web:${authority}:hospital:${hospitalCode}`,
      ),
    );
  }

  private documentKey(documentId: string): string {
    return `${this.partition.key}::${encodeURIComponent(documentId)}`;
  }

  private requestLinkKey(clientRequestId: string): string {
    return `${this.partition.key}::${encodeURIComponent(clientRequestId)}`;
  }

  private submissionLinkKey(clientSubmissionId: string): string {
    return `${this.partition.key}::${encodeURIComponent(clientSubmissionId)}`;
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

function sameDocumentSet(
  left: WalletDocumentRecordV2[],
  right: WalletDocumentRecordV2[],
): boolean {
  const sort = (records: WalletDocumentRecordV2[]) =>
    [...records].sort((a, b) => a.id.localeCompare(b.id));
  return sameValue(sort(left), sort(right));
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function assertNoTokenMaterial(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object" || isCryptoKeyLike(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoTokenMaterial(item, `${path}[${index}]`),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(?:access|refresh|session|service)?_?token$/i.test(key) ||
      /^(?:authorization|dpop)$/i.test(key)
    ) {
      throw new Error(
        `Wallet Exchange persistence must never store session or token material (${path}.${key}).`,
      );
    }
    assertNoTokenMaterial(child, `${path}.${key}`);
  }
}

function assertExactKeys(value: object, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown Wallet Exchange persistence field: ${key}.`);
    }
  }
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

function requireTimestamp(value: string, name: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }
}

function requireStringList(value: string[], name: string): void {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${name} must contain at least one value.`);
  }
  value.forEach((item) => requireText(item, name));
}

function requireSha256(value: string, name: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a lowercase sha256 digest.`);
  }
}

async function sha256Digest(value: string): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return `sha256:${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function assertNoPatientId(value: unknown, path = "$."): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoPatientId(item, `${path}[${index}]`),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.replace(/[-_]/g, "").toLowerCase() === "patientid") {
      throw new Error(
        `Wallet Exchange persistence must never store Portal patientId (${path}${key}).`,
      );
    }
    assertNoPatientId(child, `${path}${key}.`);
  }
}

function cloneValue<T>(value: T): T {
  return globalThis.structuredClone(value);
}

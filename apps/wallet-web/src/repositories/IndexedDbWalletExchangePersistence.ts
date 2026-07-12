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
import {
  createWalletExchangePersistencePolicy,
  WalletExchangeCredentialRequestLink,
  WalletExchangePendingSubmissionDraft,
  WalletExchangeSubmissionLink,
  type WalletExchangePersistencePolicy,
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
          if (!this.policy.sameValue(persisted.pendingAck, reduction.plan.pendingAck)) {
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
      this.policy.requestLinkKey(requireText(clientRequestId, "clientRequestId")),
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

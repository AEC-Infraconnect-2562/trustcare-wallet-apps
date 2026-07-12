import {
  createWalletExchangePersistencePolicy,
  type WalletExchangePersistencePolicy,
} from "@trustcare/api-client/walletExchangePersistencePolicy";
import type {
  WalletExchangeCredentialRequestLink,
  WalletExchangePendingSubmissionDraft,
  WalletExchangePersistencePort,
  WalletExchangeSubmissionLink,
} from "@trustcare/api-client/walletExchangeWorkflow";
import {
  createWalletExchangePartition,
  createWalletExchangeState,
  type HolderSigningIdentity,
  type WalletDocumentRecordV2,
  type WalletExchangePartition,
  type WalletExchangeState,
  type WalletExchangeSyncReduction,
} from "@trustcare/wallet-core";
import type * as SQLite from "expo-sqlite";
import { createRetryableAsyncLoader } from "../utils/retryableAsyncLoader";

export const MOBILE_WALLET_EXCHANGE_SCHEMA =
  "wallet-exchange-v2-mobile@2" as const;
export const MOBILE_HOLDER_KEY_PERSISTENCE_AVAILABLE = false as const;

const databaseName = "trustcare_wallet_exchange_v2.db";
const recordTable = "wallet_exchange_v2_records";
const databaseKeyName = "trustcare.wallet.exchange.v2.sqlite-key";

export type MobileWalletExchangeStoreName =
  | "exchange_state"
  | "documents"
  | "request_links"
  | "submission_links"
  | "submission_outbox";

export type MobileWalletExchangeTransactionMode = "readonly" | "readwrite";

export interface MobileWalletExchangeTransaction {
  get<T>(
    store: MobileWalletExchangeStoreName,
    key: string,
  ): Promise<T | undefined>;
  getAll<T>(
    store: MobileWalletExchangeStoreName,
    partitionKey: string,
  ): Promise<T[]>;
  put(
    store: MobileWalletExchangeStoreName,
    key: string,
    value: unknown,
  ): Promise<void>;
  delete(store: MobileWalletExchangeStoreName, key: string): Promise<void>;
}

/**
 * Transaction seam used by the production SQLCipher adapter and deterministic
 * copy-on-write tests. A read/write operation must commit or roll back as one
 * unit; cursor, documents, and pending ACK may never be split across writes.
 */
export interface MobileWalletExchangeStorage {
  transaction<T>(
    mode: MobileWalletExchangeTransactionMode,
    operation: (transaction: MobileWalletExchangeTransaction) => Promise<T>,
  ): Promise<T>;
}

export type SqliteWalletExchangePersistenceOptions = {
  portalOrigin: string;
  holderDid: string;
  storage?: MobileWalletExchangeStorage;
};

type PartitionRecord<T> = {
  partitionKey: string;
  schema: typeof MOBILE_WALLET_EXCHANGE_SCHEMA;
  value: T;
};

type PayloadRow = { payload: string };

type WalletExchangeSqlExecutor = Pick<
  SQLite.SQLiteDatabase,
  "runAsync" | "getFirstAsync" | "getAllAsync"
>;

export type WalletExchangeSqliteDatabase = WalletExchangeSqlExecutor &
  Pick<
    SQLite.SQLiteDatabase,
    "execAsync" | "withExclusiveTransactionAsync" | "closeAsync"
  >;

/**
 * Durable mobile Wallet Exchange V2 persistence.
 *
 * It uses a dedicated SQLCipher database, has no legacy import path, and
 * partitions every value by the normalized Portal origin plus holder did:key.
 * Holder private keys are intentionally not handled by this class because the
 * current Expo stack cannot persist a non-exportable signing handle.
 */
export class SqliteWalletExchangePersistence implements WalletExchangePersistencePort {
  readonly partition: WalletExchangePartition;
  private readonly storage: MobileWalletExchangeStorage;
  private readonly policy: WalletExchangePersistencePolicy;

  constructor(options: SqliteWalletExchangePersistenceOptions) {
    this.partition = createWalletExchangePartition({
      portalOrigin: options.portalOrigin,
      holderDid: options.holderDid,
    });
    this.policy = createWalletExchangePersistencePolicy(this.partition);
    this.storage = options.storage ?? new ExpoSqliteWalletExchangeStorage();
  }

  configureTrustedIssuers(issuerDids: readonly string[]): void {
    this.policy.configureTrustedIssuers(issuerDids);
  }

  async loadState(): Promise<WalletExchangeState | null> {
    return this.storage.transaction("readonly", async (transaction) => {
      const record = await transaction.get<
        PartitionRecord<WalletExchangeState>
      >("exchange_state", this.partition.key);
      if (!record) return null;
      this.assertPartitionRecord(record, "exchange state");
      this.policy.assertState(record.value);
      return cloneJson(record.value);
    });
  }

  async loadOrCreateState(): Promise<WalletExchangeState> {
    return this.storage.transaction("readwrite", async (transaction) => {
      const existing = await transaction.get<
        PartitionRecord<WalletExchangeState>
      >("exchange_state", this.partition.key);
      if (existing) {
        this.assertPartitionRecord(existing, "exchange state");
        this.policy.assertState(existing.value);
        return cloneJson(existing.value);
      }
      const state = createWalletExchangeState(this.partition);
      await transaction.put(
        "exchange_state",
        this.partition.key,
        this.record(state),
      );
      return cloneJson(state);
    });
  }

  async listDocuments(): Promise<WalletDocumentRecordV2[]> {
    return this.storage.transaction("readonly", async (transaction) => {
      const records = await transaction.getAll<
        PartitionRecord<WalletDocumentRecordV2>
      >("documents", this.partition.key);
      return records
        .map((record) => {
          this.assertPartitionRecord(record, "document");
          this.policy.assertDocument(record.value);
          return cloneJson(record.value);
        })
        .sort((left, right) => left.id.localeCompare(right.id));
    });
  }

  async commitSyncReduction(
    reduction: WalletExchangeSyncReduction,
  ): Promise<void> {
    this.policy.assertReduction(reduction);
    await this.storage.transaction("readwrite", async (transaction) => {
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
          ) ||
          !this.policy.sameValue(persisted, reduction.state)
        ) {
          throw new Error(
            "Wallet Exchange replay does not match the atomically persisted pending ACK.",
          );
        }
        return;
      }
      if (persisted.pendingAck) {
        throw new Error(
          "Wallet Exchange must ACK the prior sync commit before another commit.",
        );
      }

      const records = await transaction.getAll<
        PartitionRecord<WalletDocumentRecordV2>
      >("documents", this.partition.key);
      const nextDocuments = new Map(
        records.map((record) => {
          this.assertPartitionRecord(record, "document");
          this.policy.assertDocument(record.value);
          return [record.value.id, record.value] as const;
        }),
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
        await transaction.delete("documents", this.policy.documentKey(id));
      }
      for (const document of reduction.plan.documents.put) {
        await transaction.put(
          "documents",
          this.policy.documentKey(document.id),
          this.record(document),
        );
      }
      await transaction.put(
        "exchange_state",
        this.partition.key,
        this.record(reduction.state),
      );
    });
  }

  async persistAcknowledgedState(state: WalletExchangeState): Promise<void> {
    this.policy.assertState(state);
    if (state.pendingAck || !state.lastAckReceipt) {
      throw new Error(
        "Wallet Exchange acknowledged state must clear pendingAck and contain an ACK receipt.",
      );
    }
    const receipt = state.lastAckReceipt;
    await this.storage.transaction("readwrite", async (transaction) => {
      const record = await transaction.get<
        PartitionRecord<WalletExchangeState>
      >("exchange_state", this.partition.key);
      if (!record) throw new Error("Wallet Exchange state is not initialized.");
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
      await transaction.put(
        "exchange_state",
        this.partition.key,
        this.record(state),
      );
    });
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
    await this.storage.transaction("readwrite", async (transaction) => {
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
      await transaction.put("submission_outbox", key, this.record(draft));
    });
  }

  async getPendingSubmissionDraft(
    clientSubmissionId: string,
  ): Promise<WalletExchangePendingSubmissionDraft | null> {
    return this.storage.transaction("readonly", async (transaction) => {
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
      return cloneJson(record.value);
    });
  }

  async listPendingSubmissionDrafts(): Promise<
    WalletExchangePendingSubmissionDraft[]
  > {
    return this.storage.transaction("readonly", async (transaction) => {
      const records = await transaction.getAll<
        PartitionRecord<WalletExchangePendingSubmissionDraft>
      >("submission_outbox", this.partition.key);
      const drafts: WalletExchangePendingSubmissionDraft[] = [];
      for (const record of records) {
        this.assertPartitionRecord(record, "submission outbox");
        await this.policy.assertPendingSubmissionDraft(record.value);
        drafts.push(cloneJson(record.value));
      }
      return drafts.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    });
  }

  async completePendingSubmission(
    draft: WalletExchangePendingSubmissionDraft,
    link: WalletExchangeSubmissionLink,
  ): Promise<void> {
    await this.policy.assertPendingSubmissionDraft(draft);
    this.policy.assertSubmissionLink(link);
    this.policy.assertDraftMatchesLink(draft, link);
    const key = this.policy.submissionLinkKey(draft.clientSubmissionId);
    await this.storage.transaction("readwrite", async (transaction) => {
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
        await transaction.put("submission_links", key, this.record(link));
      }
      await transaction.delete("submission_outbox", key);
    });
  }

  /**
   * Deliberate fail-closed boundary. SecureStore accepts strings, so using it
   * here would require exporting the holder private key as JWK/PKCS8.
   */
  async saveHolderIdentity(_identity: HolderSigningIdentity): Promise<never> {
    throw mobileHolderKeyUnavailableError();
  }

  /** Never returns null, because doing so could trigger silent DID rotation. */
  async loadHolderIdentity(): Promise<never> {
    throw mobileHolderKeyUnavailableError();
  }

  private async saveLink<T>(
    store: "request_links" | "submission_links",
    key: string,
    link: T,
    sameIdentity: (existing: T) => boolean,
    label: string,
  ): Promise<void> {
    assertNoSecretMaterial(link);
    await this.storage.transaction("readwrite", async (transaction) => {
      const existing = await transaction.get<PartitionRecord<T>>(store, key);
      if (existing) {
        this.assertPartitionRecord(existing, label);
        if (!sameIdentity(existing.value)) {
          throw new Error(
            `Wallet Exchange ${label} link conflicts with its durable idempotency identity.`,
          );
        }
      }
      await transaction.put(store, key, this.record(link));
    });
  }

  private async getLink<T>(
    store: "request_links" | "submission_links",
    key: string,
    validate: (link: T) => void,
  ): Promise<T | null> {
    return this.storage.transaction("readonly", async (transaction) => {
      const record = await transaction.get<PartitionRecord<T>>(store, key);
      if (!record) return null;
      this.assertPartitionRecord(record, store);
      validate(record.value);
      return cloneJson(record.value);
    });
  }

  private async listLinks<T>(
    store: "request_links" | "submission_links",
    validate: (link: T) => void,
  ): Promise<T[]> {
    return this.storage.transaction("readonly", async (transaction) => {
      const records = await transaction.getAll<PartitionRecord<T>>(
        store,
        this.partition.key,
      );
      return records.map((record) => {
        this.assertPartitionRecord(record, store);
        validate(record.value);
        return cloneJson(record.value);
      });
    });
  }

  private record<T>(value: T): PartitionRecord<T> {
    assertNoSecretMaterial(value);
    return {
      partitionKey: this.partition.key,
      schema: MOBILE_WALLET_EXCHANGE_SCHEMA,
      value: cloneJson(value),
    };
  }

  private assertPartitionRecord<T>(
    record: PartitionRecord<T>,
    label: string,
  ): void {
    if (
      record.partitionKey !== this.partition.key ||
      record.schema !== MOBILE_WALLET_EXCHANGE_SCHEMA
    ) {
      throw new Error(`Wallet Exchange ${label} partition boundary violation.`);
    }
    assertNoSecretMaterial(record.value);
  }

}

class ExpoSqliteWalletExchangeStorage implements MobileWalletExchangeStorage {
  private readonly loadDatabase;

  constructor() {
    this.loadDatabase = createRetryableAsyncLoader(async () => {
      const database = await openEncryptedWalletExchangeDatabase();
      await initializeDatabase(database);
      return database;
    });
  }

  async transaction<T>(
    mode: MobileWalletExchangeTransactionMode,
    operation: (transaction: MobileWalletExchangeTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.loadDatabase();
    if (mode === "readonly") {
      return operation(sqlTransaction(database));
    }
    let result: T | undefined;
    await database.withExclusiveTransactionAsync(async (exclusive) => {
      result = await operation(sqlTransaction(exclusive));
    });
    return result as T;
  }
}

function sqlTransaction(
  database: WalletExchangeSqlExecutor,
): MobileWalletExchangeTransaction {
  return {
    get: async <T>(store: MobileWalletExchangeStoreName, key: string) => {
      const row = await database.getFirstAsync<PayloadRow>(
        `SELECT payload FROM ${recordTable}
         WHERE store_name = ? AND record_key = ?`,
        store,
        key,
      );
      return row ? parsePayload<T>(row.payload) : undefined;
    },
    getAll: async <T>(
      store: MobileWalletExchangeStoreName,
      partitionKey: string,
    ) => {
      const rows = await database.getAllAsync<PayloadRow>(
        `SELECT payload FROM ${recordTable}
         WHERE store_name = ? AND partition_key = ?
         ORDER BY record_key`,
        store,
        partitionKey,
      );
      return rows.map((row) => parsePayload<T>(row.payload));
    },
    put: async (store, key, value) => {
      assertNoSecretMaterial(value);
      const partitionKey = partitionKeyFromRecord(value);
      await database.runAsync(
        `INSERT INTO ${recordTable}
         (store_name, record_key, partition_key, schema_version, payload)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(store_name, record_key) DO UPDATE SET
           partition_key = excluded.partition_key,
           schema_version = excluded.schema_version,
           payload = excluded.payload`,
        store,
        key,
        partitionKey,
        MOBILE_WALLET_EXCHANGE_SCHEMA,
        JSON.stringify(value),
      );
    },
    delete: async (store, key) => {
      await database.runAsync(
        `DELETE FROM ${recordTable} WHERE store_name = ? AND record_key = ?`,
        store,
        key,
      );
    },
  };
}

async function openEncryptedWalletExchangeDatabase(): Promise<WalletExchangeSqliteDatabase> {
  const [SQLiteModule, SecureStore] = await Promise.all([
    import("expo-sqlite"),
    import("expo-secure-store"),
  ]);
  const key = await loadOrCreateDatabaseKey(SecureStore);
  const database = (await SQLiteModule.openDatabaseAsync(
    databaseName,
  )) as WalletExchangeSqliteDatabase;
  try {
    // The value is validated as exactly 256 bits of hex before interpolation.
    await database.execAsync(`PRAGMA key = "x'${key}'";`);
    const row = await database.getFirstAsync<Record<string, unknown>>(
      "PRAGMA cipher_version;",
    );
    const cipherVersion = row ? Object.values(row)[0] : undefined;
    if (typeof cipherVersion !== "string" || !cipherVersion.trim()) {
      throw new Error(
        "Wallet Exchange mobile storage requires a SQLCipher-enabled native build.",
      );
    }
    await database.execAsync(
      "PRAGMA cipher_memory_security = ON; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;",
    );
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

async function loadOrCreateDatabaseKey(
  secureStore: typeof import("expo-secure-store"),
): Promise<string> {
  const options = {
    keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  const existing = await secureStore.getItemAsync(databaseKeyName, options);
  if (existing !== null) return requireDatabaseKey(existing);
  const cryptoProvider = globalThis.crypto;
  if (!cryptoProvider?.getRandomValues) {
    throw new Error(
      "Secure random generation is unavailable for Wallet Exchange database encryption.",
    );
  }
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(32));
  const generated = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  await secureStore.setItemAsync(databaseKeyName, generated, options);
  const persisted = await secureStore.getItemAsync(databaseKeyName, options);
  if (persisted === null) {
    throw new Error(
      "Wallet Exchange database encryption key was not persisted.",
    );
  }
  return requireDatabaseKey(persisted);
}

function requireDatabaseKey(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Wallet Exchange database encryption key is invalid.");
  }
  return value;
}

async function initializeDatabase(
  database: WalletExchangeSqliteDatabase,
): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ${recordTable} (
      store_name TEXT NOT NULL,
      record_key TEXT NOT NULL,
      partition_key TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (store_name, record_key)
    );
    CREATE INDEX IF NOT EXISTS wallet_exchange_v2_partition_idx
      ON ${recordTable} (partition_key, store_name, record_key);
  `);
}

function partitionKeyFromRecord(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("Wallet Exchange persisted value must be partitioned.");
  }
  const record = value as Partial<PartitionRecord<unknown>>;
  if (
    typeof record.partitionKey !== "string" ||
    !record.partitionKey ||
    record.schema !== MOBILE_WALLET_EXCHANGE_SCHEMA
  ) {
    throw new Error(
      "Wallet Exchange persisted value has an invalid partition.",
    );
  }
  return record.partitionKey;
}

function parsePayload<T>(payload: string): T {
  try {
    const value = JSON.parse(payload) as T;
    assertNoSecretMaterial(value);
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Wallet Exchange")) {
      throw error;
    }
    throw new Error("Stored Wallet Exchange payload is invalid JSON.");
  }
}

function mobileHolderKeyUnavailableError(): Error {
  return new Error(
    "Wallet Exchange mobile holder-key persistence is unavailable: the current Expo stack cannot retain a non-exportable signing handle. Install and audit a native Secure Enclave/Android Keystore signing adapter; private JWK serialization is forbidden.",
  );
}

function assertNoSecretMaterial(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") return;
  if (isCryptoKeyLike(value)) {
    throw new Error(
      `Wallet Exchange mobile persistence must never serialize CryptoKey material (${path}).`,
    );
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSecretMaterial(item, `${path}[${index}]`),
    );
    return;
  }
  const object = value as Record<string, unknown>;
  if (
    typeof object.kty === "string" &&
    Object.prototype.hasOwnProperty.call(object, "d")
  ) {
    throw new Error(
      `Wallet Exchange mobile persistence must never serialize a private JWK (${path}).`,
    );
  }
  for (const [key, child] of Object.entries(object)) {
    if (
      /^(?:access|refresh|session|service|id|bearer)?_?token$/i.test(key) ||
      /^(?:authorization|dpop(?:Proof)?|sessionJwt)$/i.test(key) ||
      /^(?:privateKey|privateJwk)$/i.test(key)
    ) {
      throw new Error(
        `Wallet Exchange persistence must never store session, token, or private-key material (${path}.${key}).`,
      );
    }
    assertNoSecretMaterial(child, `${path}.${key}`);
  }
}

function isCryptoKeyLike(value: object): boolean {
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

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  assertNoSecretMaterial(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

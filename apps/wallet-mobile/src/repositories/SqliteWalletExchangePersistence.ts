import type {
  WalletExchangeCredentialRequestLink,
  WalletExchangePendingSubmissionDraft,
  WalletExchangePersistencePort,
  WalletExchangeSubmissionLink,
} from "@trustcare/api-client";
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

  constructor(options: SqliteWalletExchangePersistenceOptions) {
    this.partition = createWalletExchangePartition({
      portalOrigin: options.portalOrigin,
      holderDid: options.holderDid,
    });
    this.storage = options.storage ?? new ExpoSqliteWalletExchangeStorage();
  }

  async loadState(): Promise<WalletExchangeState | null> {
    return this.storage.transaction("readonly", async (transaction) => {
      const record = await transaction.get<
        PartitionRecord<WalletExchangeState>
      >("exchange_state", this.partition.key);
      if (!record) return null;
      this.assertPartitionRecord(record, "exchange state");
      this.assertState(record.value);
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
        this.assertState(existing.value);
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
          this.assertDocument(record.value);
          return cloneJson(record.value);
        })
        .sort((left, right) => left.id.localeCompare(right.id));
    });
  }

  async commitSyncReduction(
    reduction: WalletExchangeSyncReduction,
  ): Promise<void> {
    this.assertReduction(reduction);
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
      this.assertState(persisted);

      if (persisted.nextCursor !== reduction.plan.expectedCursor) {
        throw new Error(
          "Wallet Exchange atomic commit cursor no longer matches persisted state.",
        );
      }
      if (reduction.plan.replayed) {
        if (
          !sameValue(persisted.pendingAck, reduction.plan.pendingAck) ||
          !sameValue(persisted, reduction.state)
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
          this.assertDocument(record.value);
          return [record.value.id, record.value] as const;
        }),
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
        await transaction.delete("documents", this.documentKey(id));
      }
      for (const document of reduction.plan.documents.put) {
        await transaction.put(
          "documents",
          this.documentKey(document.id),
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
    this.assertState(state);
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
    await this.storage.transaction("readwrite", async (transaction) => {
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
        this.submissionLinkKey(
          requireText(clientSubmissionId, "clientSubmissionId"),
        ),
      );
      if (!record) return null;
      this.assertPartitionRecord(record, "submission outbox");
      await this.assertPendingSubmissionDraft(record.value);
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
        await this.assertPendingSubmissionDraft(record.value);
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
    await this.assertPendingSubmissionDraft(draft);
    this.assertSubmissionLink(link);
    this.assertDraftMatchesLink(draft, link);
    const key = this.submissionLinkKey(draft.clientSubmissionId);
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
        "Wallet Exchange reducer state does not match its cursor and pending ACK plan.",
      );
    }
    reduction.plan.documents.put.forEach((document) =>
      this.assertDocument(document),
    );
    assertNoSecretMaterial(reduction.state);
  }

  private assertState(state: WalletExchangeState): void {
    assertNoSecretMaterial(state);
    assertExactKeys(state, [
      "version",
      "partition",
      "nextCursor",
      "documents",
      "lineages",
      "history",
      "processedEvents",
      "quarantine",
      "pendingAck",
      "lastAckReceipt",
      "retryJournal",
    ]);
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
  }

  private assertDocument(document: WalletDocumentRecordV2): void {
    if (document.schemaVersion !== "2.0") {
      throw new Error(
        "Wallet Exchange only persists Wallet document V2 records.",
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(document.owner, "patientId") ||
      document.owner.id !== this.partition.holderDid ||
      document.owner.holderDid !== this.partition.holderDid
    ) {
      throw new Error(
        "Wallet Exchange document must belong only to its holder did:key partition and must not contain patientId.",
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
        "Wallet Exchange document issuer must be a live Portal hospital did:web; legacy issuer fallback is forbidden.",
      );
    }
    assertNoSecretMaterial(document);
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
    if (link.lastKnownStatus !== undefined) {
      requireText(link.lastKnownStatus, "lastKnownStatus");
    }
    if (!["TCC", "TCP", "TCM"].includes(link.targetHospitalCode)) {
      throw new Error("Wallet Exchange request hospital code is invalid.");
    }
    requireText(link.context, "context");
    requireText(link.purpose, "purpose");
    requireStringList(link.credentialTypes, "credentialTypes");
    if (link.documentTypes !== undefined) {
      requireStringList(link.documentTypes, "documentTypes");
    }
    assertNoSecretMaterial(link);
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
    if (link.lastKnownStatus !== undefined) {
      requireText(link.lastKnownStatus, "lastKnownStatus");
    }
    assertNoSecretMaterial(link);
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
    assertNoSecretMaterial(draft);
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
    const expected = `/api/wallet/v2/${collection}/${encodeURIComponent(id)}`;
    if (
      url.origin !== this.partition.portalOrigin ||
      url.pathname !== expected ||
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
    if (
      record.partitionKey !== this.partition.key ||
      record.schema !== MOBILE_WALLET_EXCHANGE_SCHEMA
    ) {
      throw new Error(`Wallet Exchange ${label} partition boundary violation.`);
    }
    assertNoSecretMaterial(record.value);
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

function assertExactKeys(value: object, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown Wallet Exchange persistence field: ${key}.`);
    }
  }
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

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  assertNoSecretMaterial(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

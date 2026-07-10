import type * as SQLite from "expo-sqlite";
import {
  mergeWalletDocumentRecordsV2,
  type ActiveShare,
  type ActivityQuery,
  type RuntimeEnvironment,
  type WalletActivityEvent,
  type WalletDocumentQuery,
  type WalletDocumentRecordV2,
  type WalletRepository,
} from "@trustcare/wallet-core";
import { openOfflineWalletDatabase } from "../storage/offlineWallet";
import {
  activityMatchesQuery,
  assertDocumentInNamespace,
  createWalletRepositoryNamespace,
  documentMatchesQuery,
  paginateDocuments,
  type WalletRepositoryNamespace,
  WALLET_DOCUMENT_SCHEMA_VERSION,
} from "./sqliteWalletRepositoryPolicy";
import {
  createRetryableAsyncLoader,
  type RetryableAsyncLoader,
} from "../utils/retryableAsyncLoader";

type WalletSqliteDatabase = Pick<
  SQLite.SQLiteDatabase,
  | "execAsync"
  | "withTransactionAsync"
  | "runAsync"
  | "getAllAsync"
  | "getFirstAsync"
>;

export type SqliteWalletRepositoryOptions = {
  runtimeEnvironment: RuntimeEnvironment;
  ownerUserId: string;
  schemaVersion?: typeof WALLET_DOCUMENT_SCHEMA_VERSION;
  database?: WalletSqliteDatabase | Promise<WalletSqliteDatabase>;
  now?: () => string;
};

type PayloadRow = { payload: string };

const documentTable = "wallet_documents_v2";
const activityTable = "wallet_activity_v2";
const activeShareTable = "wallet_active_shares_v2";

export class SqliteWalletRepository implements WalletRepository {
  readonly namespace: WalletRepositoryNamespace;
  private readonly now: () => string;
  private readonly loadReadyDatabase: RetryableAsyncLoader<WalletSqliteDatabase>;

  constructor(options: SqliteWalletRepositoryOptions) {
    this.namespace = createWalletRepositoryNamespace(options);
    const configuredDatabase = options.database;
    this.loadReadyDatabase = createRetryableAsyncLoader(async () => {
      const database = await (configuredDatabase
        ? Promise.resolve(configuredDatabase)
        : openOfflineWalletDatabase());
      await initializeV2Tables(database);
      return database;
    });
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecordV2[]> {
    if (query.ownerUserId && query.ownerUserId !== this.namespace.ownerUserId)
      return [];
    const database = await this.readyDatabase();
    const rows = await database.getAllAsync<PayloadRow>(
      `SELECT payload FROM ${documentTable}
       WHERE runtime_environment = ? AND owner_user_id = ? AND schema_version = ?
       ORDER BY updated_at DESC, document_id ASC`,
      ...this.namespaceParameters(),
    );
    const documents = rows
      .map((row) => this.parseDocument(row.payload))
      .filter((document) =>
        documentMatchesQuery(this.namespace, document, query),
      );
    return paginateDocuments(documents, query);
  }

  async getDocument(id: string): Promise<WalletDocumentRecordV2 | null> {
    const database = await this.readyDatabase();
    return this.getDocumentFromDatabase(database, id);
  }

  async saveDocuments(records: WalletDocumentRecordV2[]): Promise<void> {
    for (const record of records) {
      assertDocumentInNamespace(this.namespace, record);
    }
    const database = await this.readyDatabase();
    await database.withTransactionAsync(async () => {
      for (const record of records) {
        const existing = await this.getDocumentFromDatabase(
          database,
          record.id,
        );
        const candidate = existing
          ? { ...record, local: existing.local }
          : record;
        const persisted = existing
          ? (mergeWalletDocumentRecordsV2([existing], [candidate]).find(
              (document) => document.id === record.id,
            ) ?? existing)
          : candidate;
        await this.upsertDocument(database, persisted);
      }
    });
  }

  async markOffline(id: string, enabled: boolean): Promise<void> {
    const database = await this.readyDatabase();
    const existing = await this.getDocumentFromDatabase(database, id);
    if (!existing) throw new Error(`Wallet document not found: ${id}`);
    const updated: WalletDocumentRecordV2 = {
      ...existing,
      local: {
        ...existing.local,
        availableOffline: enabled,
        cachedAt: enabled ? this.now() : undefined,
      },
    };
    await this.upsertDocument(database, updated);
  }

  async listActivity(
    query: ActivityQuery = {},
  ): Promise<WalletActivityEvent[]> {
    if (query.ownerUserId && query.ownerUserId !== this.namespace.ownerUserId)
      return [];
    const database = await this.readyDatabase();
    const rows = await database.getAllAsync<PayloadRow>(
      `SELECT payload FROM ${activityTable}
       WHERE runtime_environment = ? AND owner_user_id = ? AND schema_version = ?
       ORDER BY occurred_at DESC, event_id ASC`,
      ...this.namespaceParameters(),
    );
    const events = rows
      .map((row) => JSON.parse(row.payload) as WalletActivityEvent)
      .filter((event) => activityMatchesQuery(this.namespace, event, query));
    return events.slice(0, Math.max(0, query.limit ?? events.length));
  }

  async listActiveShares(): Promise<ActiveShare[]> {
    const database = await this.readyDatabase();
    const rows = await database.getAllAsync<PayloadRow>(
      `SELECT payload FROM ${activeShareTable}
       WHERE runtime_environment = ? AND owner_user_id = ? AND schema_version = ?
       ORDER BY created_at DESC, share_id ASC`,
      ...this.namespaceParameters(),
    );
    return rows.map((row) => JSON.parse(row.payload) as ActiveShare);
  }

  async saveActivity(events: WalletActivityEvent[]): Promise<void> {
    const database = await this.readyDatabase();
    await database.withTransactionAsync(async () => {
      for (const event of events) {
        if (
          event.ownerUserId &&
          event.ownerUserId !== this.namespace.ownerUserId
        ) {
          throw new Error(
            `Wallet activity ${event.id} belongs to another owner.`,
          );
        }
        const scopedEvent = {
          ...event,
          ownerUserId: this.namespace.ownerUserId,
        };
        await database.runAsync(
          `INSERT OR REPLACE INTO ${activityTable}
           (runtime_environment, owner_user_id, schema_version, event_id, event_type, occurred_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ...this.namespaceParameters(),
          event.id,
          event.type,
          event.occurredAt,
          JSON.stringify(scopedEvent),
        );
      }
    });
  }

  async saveActiveShares(shares: ActiveShare[]): Promise<void> {
    const database = await this.readyDatabase();
    await database.withTransactionAsync(async () => {
      for (const share of shares) {
        await database.runAsync(
          `INSERT OR REPLACE INTO ${activeShareTable}
           (runtime_environment, owner_user_id, schema_version, share_id, status, created_at, expires_at, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ...this.namespaceParameters(),
          share.id,
          share.status,
          share.createdAt,
          share.expiresAt ?? null,
          JSON.stringify(share),
        );
      }
    });
  }

  private async readyDatabase(): Promise<WalletSqliteDatabase> {
    return this.loadReadyDatabase();
  }

  private namespaceParameters(): [string, string, string] {
    return [
      this.namespace.runtimeEnvironment,
      this.namespace.ownerUserId,
      this.namespace.schemaVersion,
    ];
  }

  private async getDocumentFromDatabase(
    database: WalletSqliteDatabase,
    id: string,
  ): Promise<WalletDocumentRecordV2 | null> {
    const row = await database.getFirstAsync<PayloadRow>(
      `SELECT payload FROM ${documentTable}
       WHERE runtime_environment = ? AND owner_user_id = ? AND schema_version = ? AND document_id = ?`,
      ...this.namespaceParameters(),
      id,
    );
    return row ? this.parseDocument(row.payload) : null;
  }

  private parseDocument(payload: string): WalletDocumentRecordV2 {
    let document: WalletDocumentRecordV2;
    try {
      document = JSON.parse(payload) as WalletDocumentRecordV2;
    } catch {
      throw new Error("Stored WalletDocumentRecordV2 payload is invalid JSON.");
    }
    assertDocumentInNamespace(this.namespace, document);
    return document;
  }

  private async upsertDocument(
    database: WalletSqliteDatabase,
    document: WalletDocumentRecordV2,
  ): Promise<void> {
    assertDocumentInNamespace(this.namespace, document);
    await database.runAsync(
      `INSERT OR REPLACE INTO ${documentTable}
       (runtime_environment, owner_user_id, schema_version, document_id, document_type, category,
        lifecycle_status, trust_state, source_kind, search_text, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...this.namespaceParameters(),
      document.id,
      document.documentType,
      document.category,
      document.lifecycle.status,
      document.trust.state,
      document.provenance.sourceKind,
      documentSearchText(document),
      document.lifecycle.updatedAt ??
        document.lifecycle.issuedAt ??
        document.provenance.receivedAt,
      JSON.stringify(document),
    );
  }
}

async function initializeV2Tables(database: WalletSqliteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ${documentTable} (
      runtime_environment TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      document_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      category TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      trust_state TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      search_text TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (runtime_environment, owner_user_id, schema_version, document_id)
    );
    CREATE INDEX IF NOT EXISTS wallet_documents_v2_scope_updated_idx
      ON ${documentTable} (runtime_environment, owner_user_id, schema_version, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ${activityTable} (
      runtime_environment TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (runtime_environment, owner_user_id, schema_version, event_id)
    );
    CREATE INDEX IF NOT EXISTS wallet_activity_v2_scope_time_idx
      ON ${activityTable} (runtime_environment, owner_user_id, schema_version, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS ${activeShareTable} (
      runtime_environment TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      share_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      payload TEXT NOT NULL,
      PRIMARY KEY (runtime_environment, owner_user_id, schema_version, share_id)
    );
    CREATE INDEX IF NOT EXISTS wallet_active_shares_v2_scope_time_idx
      ON ${activeShareTable} (runtime_environment, owner_user_id, schema_version, created_at DESC);
  `);
}

function documentSearchText(document: WalletDocumentRecordV2): string {
  return [
    document.title.th,
    document.title.en,
    document.documentType,
    document.provenance.issuerName,
    document.clinicalContext.facility?.name,
    document.clinicalContext.practitioner?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

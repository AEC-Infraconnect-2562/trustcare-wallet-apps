import type {
  ActiveShare,
  ActivityQuery,
  RuntimeEnvironment,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletDocumentRecordV2,
  WalletRepository,
} from "@trustcare/wallet-core";

export const INDEXED_DB_WALLET_SCHEMA = "wallet-document-v2@2.0";

export type IndexedDbWalletStoreName =
  | "documents"
  | "activity"
  | "active_shares";

export type IndexedDbWalletStorageWrite = {
  store: IndexedDbWalletStoreName;
  key: string;
  value: unknown;
};

/**
 * Small persistence seam used by the repository contract. Browser production
 * uses IndexedDB; unit tests can inject a deterministic implementation without
 * requiring a DOM or fake IndexedDB runtime.
 */
export interface IndexedDbWalletStorage {
  get<T>(store: IndexedDbWalletStoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: IndexedDbWalletStoreName): Promise<T[]>;
  write(entries: IndexedDbWalletStorageWrite[]): Promise<void>;
}

export type IndexedDbWalletRepositoryOptions = {
  runtimeEnvironment: RuntimeEnvironment;
  ownerId: string;
  schemaNamespace?: string;
  storage?: IndexedDbWalletStorage;
  indexedDbFactory?: IDBFactory;
  now?: () => string;
  createEventId?: () => string;
};

export class IndexedDbWalletRepository implements WalletRepository {
  readonly namespace: string;

  private readonly ownerId: string;
  private readonly storage: IndexedDbWalletStorage;
  private readonly now: () => string;
  private readonly createEventId: () => string;

  constructor(options: IndexedDbWalletRepositoryOptions) {
    this.ownerId = requireNamespaceSegment(options.ownerId, "ownerId");
    const schemaNamespace = requireNamespaceSegment(
      options.schemaNamespace ?? INDEXED_DB_WALLET_SCHEMA,
      "schemaNamespace",
    );
    this.namespace = createIndexedDbWalletNamespace({
      runtimeEnvironment: options.runtimeEnvironment,
      ownerId: this.ownerId,
      schemaNamespace,
    });
    this.storage =
      options.storage ??
      new BrowserIndexedDbWalletStorage(
        this.namespace,
        options.indexedDbFactory ?? globalThis.indexedDB,
      );
    this.now = options.now ?? (() => new Date().toISOString());
    this.createEventId = options.createEventId ?? createRandomEventId;
  }

  async listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecordV2[]> {
    if (query.ownerUserId && query.ownerUserId !== this.ownerId) return [];

    const search = query.search?.trim().toLocaleLowerCase();
    const records = await this.storage.getAll<WalletDocumentRecordV2>(
      "documents",
    );
    records.forEach((record) => this.assertOwnedDocument(record));

    const filtered = records
      .filter(
        (record) =>
          !query.documentTypes?.length ||
          query.documentTypes.includes(record.documentType),
      )
      .filter(
        (record) =>
          !query.categories?.length ||
          query.categories.includes(record.category),
      )
      .filter(
        (record) =>
          !query.statuses?.length ||
          query.statuses.includes(record.lifecycle.status),
      )
      .filter(
        (record) =>
          !query.trustStates?.length ||
          query.trustStates.includes(record.trust.state),
      )
      .filter(
        (record) =>
          !query.sourceSystems?.length ||
          query.sourceSystems.includes(record.provenance.sourceKind),
      )
      .filter((record) => !search || searchableText(record).includes(search))
      .sort(compareDocumentsNewestFirst);

    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.max(0, query.limit ?? filtered.length);
    return cloneValue(filtered.slice(offset, offset + limit));
  }

  async getDocument(id: string): Promise<WalletDocumentRecordV2 | null> {
    const record = await this.storage.get<WalletDocumentRecordV2>(
      "documents",
      id,
    );
    if (!record) return null;
    this.assertOwnedDocument(record);
    return cloneValue(record);
  }

  async saveDocuments(records: WalletDocumentRecordV2[]): Promise<void> {
    const uniqueRecords = new Map<string, WalletDocumentRecordV2>();
    for (const record of records) {
      this.assertOwnedDocument(record);
      uniqueRecords.set(record.id, cloneValue(record));
    }
    await this.storage.write(
      Array.from(uniqueRecords.values(), (record) => ({
        store: "documents" as const,
        key: record.id,
        value: record,
      })),
    );
  }

  async markOffline(id: string, enabled: boolean): Promise<void> {
    const record = await this.getDocument(id);
    if (!record) throw new Error(`Wallet document not found: ${id}`);

    const occurredAt = this.now();
    const updated: WalletDocumentRecordV2 = {
      ...record,
      local: {
        ...record.local,
        availableOffline: enabled,
        cachedAt: enabled ? occurredAt : undefined,
      },
    };
    const event: WalletActivityEvent = {
      id: `offline:${id}:${this.createEventId()}`,
      type: "document_saved_offline",
      occurredAt,
      ownerUserId: this.ownerId,
      documentId: id,
      summary: enabled
        ? "Document made available offline"
        : "Document removed from offline storage",
      metadata: { enabled },
    };
    await this.storage.write([
      { store: "documents", key: id, value: updated },
      { store: "activity", key: event.id, value: event },
    ]);
  }

  async listActivity(
    query: ActivityQuery = {},
  ): Promise<WalletActivityEvent[]> {
    if (query.ownerUserId && query.ownerUserId !== this.ownerId) return [];
    const from = parseBoundary(query.from, Number.NEGATIVE_INFINITY);
    const to = parseBoundary(query.to, Number.POSITIVE_INFINITY);
    const events = await this.storage.getAll<WalletActivityEvent>("activity");
    for (const event of events) {
      if (event.ownerUserId && event.ownerUserId !== this.ownerId) {
        throw new Error("Wallet activity owner boundary violation.");
      }
    }
    const filtered = events
      .filter(
        (event) => !query.types?.length || query.types.includes(event.type),
      )
      .filter((event) => {
        const occurredAt = Date.parse(event.occurredAt);
        return occurredAt >= from && occurredAt <= to;
      })
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return cloneValue(
      filtered.slice(0, Math.max(0, query.limit ?? filtered.length)),
    );
  }

  async listActiveShares(): Promise<ActiveShare[]> {
    const shares = await this.storage.getAll<ActiveShare>("active_shares");
    return cloneValue(
      shares.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    );
  }

  private assertOwnedDocument(record: WalletDocumentRecordV2): void {
    if (record.schemaVersion !== "2.0") {
      throw new Error(
        `Unsupported Wallet document schema: ${String(record.schemaVersion)}.`,
      );
    }
    if (record.owner.id !== this.ownerId) {
      throw new Error(
        `Wallet document owner boundary violation: expected ${this.ownerId}.`,
      );
    }
  }
}

export function createIndexedDbWalletNamespace(input: {
  runtimeEnvironment: RuntimeEnvironment;
  ownerId: string;
  schemaNamespace?: string;
}): string {
  const ownerId = requireNamespaceSegment(input.ownerId, "ownerId");
  const schemaNamespace = requireNamespaceSegment(
    input.schemaNamespace ?? INDEXED_DB_WALLET_SCHEMA,
    "schemaNamespace",
  );
  return [
    "trustcare-wallet",
    encodeURIComponent(schemaNamespace),
    input.runtimeEnvironment,
    encodeURIComponent(ownerId),
  ].join("::");
}

class BrowserIndexedDbWalletStorage implements IndexedDbWalletStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName: string,
    private readonly factory: IDBFactory | undefined,
  ) {}

  async get<T>(
    store: IndexedDbWalletStoreName,
    key: string,
  ): Promise<T | undefined> {
    const database = await this.open();
    const transaction = database.transaction(store, "readonly");
    return requestResult<T | undefined>(transaction.objectStore(store).get(key));
  }

  async getAll<T>(store: IndexedDbWalletStoreName): Promise<T[]> {
    const database = await this.open();
    const transaction = database.transaction(store, "readonly");
    return requestResult<T[]>(transaction.objectStore(store).getAll());
  }

  async write(entries: IndexedDbWalletStorageWrite[]): Promise<void> {
    if (!entries.length) return;
    const database = await this.open();
    const storeNames = Array.from(new Set(entries.map((entry) => entry.store)));
    const transaction = database.transaction(storeNames, "readwrite");
    for (const entry of entries) {
      transaction.objectStore(entry.store).put(entry.value, entry.key);
    }
    await transactionComplete(transaction);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) {
      throw new Error("IndexedDB is not available in this Web runtime.");
    }
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of [
          "documents",
          "activity",
          "active_shares",
        ] satisfies IndexedDbWalletStoreName[]) {
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

function searchableText(record: WalletDocumentRecordV2): string {
  return [
    record.title.th,
    record.title.en,
    record.documentType,
    record.provenance.issuerName,
    record.clinicalContext.facility?.name,
    record.clinicalContext.practitioner?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function compareDocumentsNewestFirst(
  left: WalletDocumentRecordV2,
  right: WalletDocumentRecordV2,
): number {
  const leftTime = documentTime(left);
  const rightTime = documentTime(right);
  return rightTime - leftTime || left.id.localeCompare(right.id);
}

function documentTime(record: WalletDocumentRecordV2): number {
  return Date.parse(
    record.clinicalContext.recordTime ??
      record.lifecycle.updatedAt ??
      record.lifecycle.issuedAt ??
      record.provenance.receivedAt,
  );
}

function parseBoundary(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid activity date: ${value}`);
  return parsed;
}

function requireNamespaceSegment(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string.`);
  return normalized;
}

function createRandomEventId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Web Crypto randomUUID is required for Wallet activity IDs.");
  }
  return globalThis.crypto.randomUUID();
}

function cloneValue<T>(value: T): T {
  return globalThis.structuredClone(value);
}

import {
  walletDocumentRecordFromCard,
  type WalletDocumentRecord,
} from "./canonicalDocuments";
import { getDemoWalletCards } from "./demoData";
import type {
  ActiveShare,
  ActivityQuery,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletRepository,
} from "./serviceInterfaces";

export type DemoWalletRepositorySeed = {
  userId?: string | number;
  documents?: WalletDocumentRecord[];
  activity?: WalletActivityEvent[];
  activeShares?: ActiveShare[];
};

export class DemoWalletRepository implements WalletRepository {
  private readonly documents = new Map<string, WalletDocumentRecord>();
  private readonly offlineDocumentIds = new Set<string>();
  private readonly activity: WalletActivityEvent[];
  private readonly activeShares: ActiveShare[];

  constructor(seed: DemoWalletRepositorySeed = {}) {
    const documents =
      seed.documents ??
      getDemoWalletCards(seed.userId).map(walletDocumentRecordFromCard);
    for (const document of documents) {
      this.documents.set(document.id, cloneValue(document));
    }
    this.activity = cloneValue(seed.activity ?? []);
    this.activeShares = cloneValue(seed.activeShares ?? []);
  }

  async listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecord[]> {
    const search = query.search?.trim().toLocaleLowerCase();
    const filtered = Array.from(this.documents.values()).filter((document) => {
      if (query.ownerUserId && document.ownerUserId !== query.ownerUserId) {
        return false;
      }
      if (
        query.documentTypes?.length &&
        !query.documentTypes.includes(document.documentType)
      ) {
        return false;
      }
      if (
        query.categories?.length &&
        !query.categories.includes(document.category)
      ) {
        return false;
      }
      if (query.statuses?.length && !query.statuses.includes(document.status)) {
        return false;
      }
      if (
        query.trustStatuses?.length &&
        !query.trustStatuses.includes(document.trustStatus)
      ) {
        return false;
      }
      if (
        query.sourceSystems?.length &&
        !query.sourceSystems.includes(document.sourceSystem ?? "")
      ) {
        return false;
      }
      if (!search) return true;
      return [
        document.title,
        document.titleEn,
        document.documentType,
        document.issuerName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(search));
    });
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.max(0, query.limit ?? filtered.length);
    return cloneValue(filtered.slice(offset, offset + limit));
  }

  async getDocument(id: string): Promise<WalletDocumentRecord | null> {
    const document = this.documents.get(id);
    return document ? cloneValue(document) : null;
  }

  async saveDocuments(records: WalletDocumentRecord[]): Promise<void> {
    for (const record of records) {
      this.documents.set(record.id, cloneValue(record));
    }
  }

  async markOffline(id: string, enabled: boolean): Promise<void> {
    if (!this.documents.has(id)) {
      throw new Error(`Wallet document not found: ${id}`);
    }
    if (enabled) this.offlineDocumentIds.add(id);
    else this.offlineDocumentIds.delete(id);
  }

  async listActivity(
    query: ActivityQuery = {},
  ): Promise<WalletActivityEvent[]> {
    const from = query.from ? Date.parse(query.from) : Number.NEGATIVE_INFINITY;
    const to = query.to ? Date.parse(query.to) : Number.POSITIVE_INFINITY;
    const events = this.activity
      .filter((event) => !query.ownerUserId || event.ownerUserId === query.ownerUserId)
      .filter((event) => !query.types?.length || query.types.includes(event.type))
      .filter((event) => {
        const occurredAt = Date.parse(event.occurredAt);
        return occurredAt >= from && occurredAt <= to;
      })
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return cloneValue(events.slice(0, Math.max(0, query.limit ?? events.length)));
  }

  async listActiveShares(): Promise<ActiveShare[]> {
    return cloneValue(this.activeShares);
  }

  isMarkedOffline(id: string): boolean {
    return this.offlineDocumentIds.has(id);
  }
}

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

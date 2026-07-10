import { getDemoWalletCards } from "./demoData";
import {
  walletDocumentRecordV2FromCard,
  type WalletDocumentRecordV2,
} from "./walletDocumentV2";
import type {
  ActiveShare,
  ActivityQuery,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletRepository,
} from "./serviceInterfaces";

export type DemoWalletRepositorySeed = {
  userId?: string | number;
  documents?: WalletDocumentRecordV2[];
  activity?: WalletActivityEvent[];
  activeShares?: ActiveShare[];
};

export class DemoWalletRepository implements WalletRepository {
  private readonly documents = new Map<string, WalletDocumentRecordV2>();
  private readonly offlineDocumentIds = new Set<string>();
  private readonly activity: WalletActivityEvent[];
  private readonly activeShares: ActiveShare[];

  constructor(seed: DemoWalletRepositorySeed = {}) {
    const documents =
      seed.documents ??
      getDemoWalletCards(seed.userId).map((card) =>
        walletDocumentRecordV2FromCard(card),
      );
    for (const document of documents) {
      this.documents.set(document.id, cloneValue(document));
    }
    this.activity = cloneValue(seed.activity ?? []);
    this.activeShares = cloneValue(seed.activeShares ?? []);
  }

  async listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecordV2[]> {
    const search = query.search?.trim().toLocaleLowerCase();
    const filtered = Array.from(this.documents.values()).filter((document) => {
      if (query.ownerUserId && document.owner.id !== query.ownerUserId) {
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
      if (
        query.statuses?.length &&
        !query.statuses.includes(document.lifecycle.status)
      ) {
        return false;
      }
      if (
        query.trustStates?.length &&
        !query.trustStates.includes(document.trust.state)
      ) {
        return false;
      }
      if (
        query.sourceSystems?.length &&
        !query.sourceSystems.includes(document.provenance.sourceKind)
      ) {
        return false;
      }
      if (!search) return true;
      return [
        document.title.th,
        document.title.en,
        document.documentType,
        document.provenance.issuerName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(search));
    });
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.max(0, query.limit ?? filtered.length);
    return cloneValue(filtered.slice(offset, offset + limit));
  }

  async getDocument(id: string): Promise<WalletDocumentRecordV2 | null> {
    const document = this.documents.get(id);
    return document ? cloneValue(document) : null;
  }

  async saveDocuments(records: WalletDocumentRecordV2[]): Promise<void> {
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

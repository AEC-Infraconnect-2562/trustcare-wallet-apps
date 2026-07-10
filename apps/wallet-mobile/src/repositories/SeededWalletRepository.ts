import type {
  ActiveShare,
  ActivityQuery,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletDocumentRecordV2,
  WalletRepository,
} from "@trustcare/wallet-core";

/**
 * Explicit demo bootstrap adapter. It never catches primary-repository errors
 * and therefore cannot turn a storage/runtime failure into a silent demo fallback.
 */
export class SeededWalletRepository implements WalletRepository {
  private seedPromise: Promise<void> | null = null;

  constructor(
    private readonly primary: WalletRepository,
    private readonly seed: WalletRepository,
    private readonly ownerUserId: string,
  ) {}

  async listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecordV2[]> {
    await this.ensureSeeded();
    return this.primary.listDocuments(query);
  }

  async getDocument(id: string): Promise<WalletDocumentRecordV2 | null> {
    await this.ensureSeeded();
    return this.primary.getDocument(id);
  }

  async saveDocuments(records: WalletDocumentRecordV2[]): Promise<void> {
    return this.primary.saveDocuments(records);
  }

  async markOffline(id: string, enabled: boolean): Promise<void> {
    await this.ensureSeeded();
    return this.primary.markOffline(id, enabled);
  }

  async listActivity(
    query: ActivityQuery = {},
  ): Promise<WalletActivityEvent[]> {
    return this.primary.listActivity(query);
  }

  async listActiveShares(): Promise<ActiveShare[]> {
    return this.primary.listActiveShares();
  }

  private ensureSeeded(): Promise<void> {
    this.seedPromise ??= this.seedPrimary().catch((error: unknown) => {
      this.seedPromise = null;
      throw error;
    });
    return this.seedPromise;
  }

  private async seedPrimary(): Promise<void> {
    const existing = await this.primary.listDocuments({
      ownerUserId: this.ownerUserId,
      limit: 1,
    });
    if (existing.length) return;
    const documents = await this.seed.listDocuments({
      ownerUserId: this.ownerUserId,
    });
    if (documents.length) await this.primary.saveDocuments(documents);
  }
}

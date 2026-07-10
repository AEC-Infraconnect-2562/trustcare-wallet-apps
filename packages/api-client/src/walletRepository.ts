import type {
  ActiveShare,
  ActivityQuery,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletDocumentRecord,
  WalletRepository,
} from "@trustcare/wallet-core";
import {
  callTrpcProcedure,
  type TrustCareClientOptions,
} from "./trpc";

export type ApiWalletRepositoryOptions = TrustCareClientOptions & {
  /** Required explicitly so this production adapter cannot inherit demo fallback. */
  demoMode: false;
};

export class ApiWalletRepository implements WalletRepository {
  private readonly options: TrustCareClientOptions;

  constructor(options: ApiWalletRepositoryOptions) {
    if (options.demoMode !== false) {
      throw new Error(
        "ApiWalletRepository requires demoMode:false; demo data belongs in DemoWalletRepository.",
      );
    }
    if (!options.url.trim()) {
      throw new Error("ApiWalletRepository requires a configured API URL.");
    }
    this.options = options;
  }

  listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecord[]> {
    return this.call("wallet.listDocuments", query);
  }

  getDocument(id: string): Promise<WalletDocumentRecord | null> {
    return this.call("wallet.getDocument", { id });
  }

  async saveDocuments(records: WalletDocumentRecord[]): Promise<void> {
    await this.call("wallet.saveDocuments", { records });
  }

  async markOffline(id: string, enabled: boolean): Promise<void> {
    await this.call("wallet.markOffline", { id, enabled });
  }

  listActivity(
    query: ActivityQuery = {},
  ): Promise<WalletActivityEvent[]> {
    return this.call("wallet.listActivity", query);
  }

  listActiveShares(): Promise<ActiveShare[]> {
    return this.call("wallet.listActiveShares", {});
  }

  private call<T>(path: string, input: unknown): Promise<T> {
    return callTrpcProcedure<T>(this.options, path, input);
  }
}

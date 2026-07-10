import type {
  ActiveShare,
  ActivityQuery,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletDocumentRecordV2,
  WalletRepository,
  RuntimeEnvironment,
} from "@trustcare/wallet-core";
import {
  callTrpcProcedure,
  type TrustCareClientOptions,
} from "./trpc";
import { clientRuntimeEnvironment } from "./runtime";

export type ApiWalletRepositoryOptions = TrustCareClientOptions & {
  runtimeEnvironment: Exclude<RuntimeEnvironment, "demo">;
  /** @deprecated Explicit compatibility only. */
  demoMode?: false;
};

export class ApiWalletRepository implements WalletRepository {
  private readonly options: TrustCareClientOptions;

  constructor(options: ApiWalletRepositoryOptions) {
    if (!options.runtimeEnvironment || clientRuntimeEnvironment(options) === "demo") {
      throw new Error(
        "ApiWalletRepository requires an explicit non-demo runtimeEnvironment; demo data belongs in DemoWalletRepository.",
      );
    }
    if (!options.url.trim()) {
      throw new Error("ApiWalletRepository requires a configured API URL.");
    }
    this.options = options;
  }

  listDocuments(
    query: WalletDocumentQuery = {},
  ): Promise<WalletDocumentRecordV2[]> {
    return this.call("wallet.listDocuments", query);
  }

  getDocument(id: string): Promise<WalletDocumentRecordV2 | null> {
    return this.call("wallet.getDocument", { id });
  }

  async saveDocuments(records: WalletDocumentRecordV2[]): Promise<void> {
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

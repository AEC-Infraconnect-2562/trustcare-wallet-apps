import { ApiWalletRepository } from "@trustcare/api-client";
import {
  DemoWalletRepository,
  type RuntimeEnvironment,
  type WalletRepository,
} from "@trustcare/wallet-core";

export type WalletRepositoryFactoryOptions = {
  runtimeEnvironment: RuntimeEnvironment;
  userId: string;
  apiUrl: string;
};

export function createWalletRepository(
  options: WalletRepositoryFactoryOptions,
): WalletRepository {
  if (options.runtimeEnvironment === "demo") {
    return new DemoWalletRepository({ userId: options.userId });
  }

  return new ApiWalletRepository({
    url: options.apiUrl,
    runtimeEnvironment: options.runtimeEnvironment,
  });
}

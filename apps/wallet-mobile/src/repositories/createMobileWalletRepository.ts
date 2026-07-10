import {
  DemoWalletRepository,
  runtimeAllowsSyntheticData,
  type RuntimeEnvironment,
  type WalletRepository,
} from "@trustcare/wallet-core";
import { SeededWalletRepository } from "./SeededWalletRepository";
import { SqliteWalletRepository } from "./SqliteWalletRepository";

export type MobileWalletRepositoryFactoryInput = {
  runtimeEnvironment: RuntimeEnvironment;
  ownerUserId: string;
  demoUserId?: string | number;
};

const repositories = new Map<string, WalletRepository>();

export function createMobileWalletRepository(
  input: MobileWalletRepositoryFactoryInput,
): WalletRepository {
  const key = `${input.runtimeEnvironment}:${input.ownerUserId}:2.0`;
  const cached = repositories.get(key);
  if (cached) return cached;

  const sqlite = new SqliteWalletRepository({
    runtimeEnvironment: input.runtimeEnvironment,
    ownerUserId: input.ownerUserId,
  });
  const repository = runtimeAllowsSyntheticData(input.runtimeEnvironment)
    ? new SeededWalletRepository(
        sqlite,
        new DemoWalletRepository({
          userId: input.demoUserId ?? input.ownerUserId,
        }),
        input.ownerUserId,
      )
    : sqlite;
  repositories.set(key, repository);
  return repository;
}

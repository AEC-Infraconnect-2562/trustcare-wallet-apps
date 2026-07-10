import { describe, expect, it } from "vitest";
import {
  DemoWalletRepository,
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
  type WalletRepository,
} from "@trustcare/wallet-core";
import { SeededWalletRepository } from "./SeededWalletRepository";

const record = walletDocumentRecordV2FromCard(
  getDemoWalletCards("demo-patient-complete-001")[0],
  { now: "2026-07-10T00:00:00.000Z" },
);

describe("SeededWalletRepository", () => {
  it("bootstraps an empty primary repository only in the explicit wrapper", async () => {
    const primary = new DemoWalletRepository({ documents: [] });
    const seed = new DemoWalletRepository({ documents: [record] });
    const repository = new SeededWalletRepository(
      primary,
      seed,
      record.owner.id,
    );

    await expect(repository.listDocuments()).resolves.toEqual([record]);
    await expect(primary.listDocuments()).resolves.toEqual([record]);
    await expect(repository.listDocuments()).resolves.toEqual([record]);
  });

  it("does not hide a primary storage failure behind demo records", async () => {
    const failedPrimary = {
      listDocuments: async () => {
        throw new Error("sqlite unavailable");
      },
    } as unknown as WalletRepository;
    const repository = new SeededWalletRepository(
      failedPrimary,
      new DemoWalletRepository({ documents: [record] }),
      record.owner.id,
    );

    await expect(repository.listDocuments()).rejects.toThrow(
      "sqlite unavailable",
    );
  });
});

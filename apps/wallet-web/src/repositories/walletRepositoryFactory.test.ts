import { describe, expect, it } from "vitest";
import { ApiWalletRepository } from "@trustcare/api-client";
import { DemoWalletRepository } from "@trustcare/wallet-core";
import { createWalletRepository } from "./walletRepositoryFactory";

describe("wallet Web repository factory", () => {
  it("selects the synthetic adapter only for explicit demo runtime", async () => {
    const repository = createWalletRepository({
      runtimeEnvironment: "demo",
      userId: "demo-patient-complete-001",
      apiUrl: "https://unused.example.test/trpc",
    });

    expect(repository).toBeInstanceOf(DemoWalletRepository);
    const allRecords = await repository.listDocuments({
      ownerUserId: "demo-patient-complete-001",
    });
    expect(allRecords.length).toBeGreaterThan(0);
    const records = await repository.listDocuments({
      ownerUserId: "demo-patient-complete-001",
      search: allRecords[0]?.title.th,
    });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.schemaVersion === "2.0")).toBe(
      true,
    );
  });

  it.each(["sandbox", "pilot", "production"] as const)(
    "selects the API adapter for %s without falling back to demo",
    (runtimeEnvironment) => {
      const repository = createWalletRepository({
        runtimeEnvironment,
        userId: "patient-001",
        apiUrl: "https://wallet-api.example.test/trpc",
      });
      expect(repository).toBeInstanceOf(ApiWalletRepository);
      expect(repository).not.toBeInstanceOf(DemoWalletRepository);
    },
  );

  it("fails closed when a non-demo API endpoint is missing", () => {
    expect(() =>
      createWalletRepository({
        runtimeEnvironment: "production",
        userId: "patient-001",
        apiUrl: "",
      }),
    ).toThrow("configured API URL");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  completeWalletSeedCards,
  walletDocumentRecordV2FromCard,
  type ActiveShare,
  type WalletActivityEvent,
  type WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import {
  ApiWalletRepository,
  type ApiWalletRepositoryOptions,
} from "./walletRepository";

describe("ApiWalletRepository", () => {
  it("requires an explicit non-demo configuration", () => {
    expect(
      () =>
        new ApiWalletRepository({
          url: "https://portal.example.test/trpc",
          demoMode: true,
        } as unknown as ApiWalletRepositoryOptions),
    ).toThrow("requires an explicit non-demo runtimeEnvironment");
  });

  it("implements the WalletRepository contract through production API procedures", async () => {
    const document = documentFixture();
    const activity: WalletActivityEvent[] = [
      {
        id: "event-1",
        type: "document_received",
        occurredAt: "2026-07-10T00:00:00.000Z",
      },
    ];
    const activeShares: ActiveShare[] = [
      {
        id: "share-1",
        artifactId: "vp-1",
        recipient: "Hospital A",
        purpose: "OPD intake",
        documentIds: [document.id],
        createdAt: "2026-07-10T00:00:00.000Z",
        status: "active",
      },
    ];
    const outputs: Record<string, unknown> = {
      "wallet.listDocuments": [document],
      "wallet.getDocument": document,
      "wallet.saveDocuments": { ok: true },
      "wallet.markOffline": { ok: true },
      "wallet.listActivity": activity,
      "wallet.listActiveShares": activeShares,
    };
    const calls: Array<{ path: string; input: unknown; authorization?: string }> =
      [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split("/").at(-1)!;
      const body = JSON.parse(String(init?.body)) as { json: unknown };
      calls.push({
        path,
        input: body.json,
        authorization: new Headers(init?.headers).get("authorization") ?? undefined,
      });
      return new Response(
        JSON.stringify({ result: { data: { json: outputs[path] } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const repository = new ApiWalletRepository({
      url: "https://portal.example.test/trpc/",
      runtimeEnvironment: "production",
      demoMode: false,
      getAuthToken: () => "test-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      repository.listDocuments({ documentTypes: ["patient_identity"] }),
    ).resolves.toEqual([document]);
    await expect(repository.getDocument(document.id)).resolves.toEqual(document);
    await repository.saveDocuments([document]);
    await repository.markOffline(document.id, true);
    await expect(repository.listActivity({ limit: 5 })).resolves.toEqual(activity);
    await expect(repository.listActiveShares()).resolves.toEqual(activeShares);

    expect(calls.map((call) => call.path)).toEqual([
      "wallet.listDocuments",
      "wallet.getDocument",
      "wallet.saveDocuments",
      "wallet.markOffline",
      "wallet.listActivity",
      "wallet.listActiveShares",
    ]);
    expect(calls[0]?.input).toEqual({ documentTypes: ["patient_identity"] });
    expect(calls[2]?.input).toEqual({ records: [document] });
    expect(calls[3]?.input).toEqual({ id: document.id, enabled: true });
    expect(calls.every((call) => call.authorization === "Bearer test-token")).toBe(
      true,
    );
  });
});

function documentFixture(): WalletDocumentRecordV2 {
  const seed = completeWalletSeedCards.find(
    (card) => card.cardType === "patient_identity",
  )!;
  return walletDocumentRecordV2FromCard(seed, {
    now: "2026-07-10T00:00:00.000Z",
  });
}

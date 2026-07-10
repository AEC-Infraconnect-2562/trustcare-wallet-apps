import { describe, expect, it } from "vitest";
import { completeWalletSeedCards } from "./completeSeedData";
import { DemoWalletRepository } from "./demoWalletRepository";
import type { ActiveShare, WalletActivityEvent } from "./serviceInterfaces";
import {
  walletDocumentRecordV2FromCard,
  type WalletDocumentRecordV2,
} from "./walletDocumentV2";

describe("DemoWalletRepository", () => {
  it("provides canonical demo records without exposing mutable seed state", async () => {
    const repository = new DemoWalletRepository({
      userId: "demo-patient-complete-001",
    });

    const documents = await repository.listDocuments({
      documentTypes: ["patient_identity"],
    });
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((item) => item.documentType === "patient_identity")).toBe(
      true,
    );

    documents[0]!.title.th = "mutated outside repository";
    expect((await repository.getDocument(documents[0]!.id))?.title.th).not.toBe(
      "mutated outside repository",
    );
  });

  it("filters, upserts, and tracks offline selection without changing the domain shape", async () => {
    const first = document("doc-1", "patient_identity", "Alice Identity");
    const second = document("doc-2", "lab_result", "Blood glucose");
    const repository = new DemoWalletRepository({ documents: [first, second] });

    expect(
      await repository.listDocuments({
        categories: ["diagnostics_and_results"],
        search: "glucose",
      }),
    ).toHaveLength(1);

    await repository.saveDocuments([
      { ...second, title: { ...second.title, th: "Updated result" } },
    ]);
    expect((await repository.getDocument(second.id))?.title.th).toBe(
      "Updated result",
    );

    await repository.markOffline(second.id, true);
    expect(repository.isMarkedOffline(second.id)).toBe(true);
    await repository.markOffline(second.id, false);
    expect(repository.isMarkedOffline(second.id)).toBe(false);
    await expect(repository.markOffline("missing", true)).rejects.toThrow(
      "Wallet document not found",
    );
  });

  it("returns scoped activity and active-share copies", async () => {
    const activity: WalletActivityEvent[] = [
      {
        id: "event-old",
        type: "document_received",
        occurredAt: "2026-07-01T00:00:00.000Z",
        ownerUserId: "patient-1",
      },
      {
        id: "event-new",
        type: "share_created",
        occurredAt: "2026-07-02T00:00:00.000Z",
        ownerUserId: "patient-1",
      },
    ];
    const activeShares: ActiveShare[] = [
      {
        id: "share-1",
        artifactId: "vp-1",
        recipient: "Hospital A",
        purpose: "OPD intake",
        documentIds: ["doc-1"],
        createdAt: "2026-07-02T00:00:00.000Z",
        status: "active",
      },
    ];
    const repository = new DemoWalletRepository({
      documents: [],
      activity,
      activeShares,
    });

    expect(
      await repository.listActivity({
        ownerUserId: "patient-1",
        types: ["share_created"],
      }),
    ).toEqual([activity[1]]);

    const shares = await repository.listActiveShares();
    shares[0]!.recipient = "mutated";
    expect((await repository.listActiveShares())[0]?.recipient).toBe(
      "Hospital A",
    );
  });
});

function document(
  id: string,
  documentType: WalletDocumentRecordV2["documentType"],
  title: string,
): WalletDocumentRecordV2 {
  const seed = completeWalletSeedCards.find(
    (card) => card.cardType === documentType,
  )!;
  const record = walletDocumentRecordV2FromCard(seed, {
    now: "2026-07-10T00:00:00.000Z",
  });
  return {
    ...record,
    id,
    owner: { id: "patient-1" },
    title: { th: title },
    lifecycle: { ...record.lifecycle, versionId: "1" },
  };
}

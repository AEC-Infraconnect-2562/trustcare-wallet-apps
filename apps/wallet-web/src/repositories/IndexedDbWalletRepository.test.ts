import { describe, expect, it } from "vitest";
import type {
  ActiveShare,
  WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import {
  createIndexedDbWalletNamespace,
  IndexedDbWalletRepository,
  type IndexedDbWalletStorage,
  type IndexedDbWalletStorageWrite,
  type IndexedDbWalletStoreName,
} from "./IndexedDbWalletRepository";

describe("IndexedDbWalletRepository", () => {
  it("namespaces storage by schema, runtime, and owner", () => {
    const production = createIndexedDbWalletNamespace({
      runtimeEnvironment: "production",
      ownerId: "did:key:patient/1",
      schemaNamespace: "wallet-v2",
    });
    expect(production).toBe(
      "trustcare-wallet::wallet-v2::production::did%3Akey%3Apatient%2F1",
    );
    expect(
      createIndexedDbWalletNamespace({
        runtimeEnvironment: "sandbox",
        ownerId: "did:key:patient/1",
        schemaNamespace: "wallet-v2",
      }),
    ).not.toBe(production);
    expect(
      createIndexedDbWalletNamespace({
        runtimeEnvironment: "production",
        ownerId: "did:key:patient/2",
        schemaNamespace: "wallet-v2",
      }),
    ).not.toBe(production);
  });

  it("persists and queries only V2 records for the configured owner", async () => {
    const storage = new MemoryWalletStorage();
    const repository = createRepository(storage);
    const identity = document("identity", "patient_identity", "2026-07-01");
    const lab = document("lab", "lab_result", "2026-07-09", {
      title: { th: "ผลน้ำตาล", en: "Blood glucose result" },
      trust: { state: "verified", checks: [] },
    });
    await repository.saveDocuments([identity, lab]);

    await expect(repository.getDocument(identity.id)).resolves.toEqual(identity);
    await expect(
      repository.listDocuments({
        categories: ["diagnostics_and_results"],
        trustStates: ["verified"],
        search: "glucose",
      }),
    ).resolves.toEqual([lab]);
    await expect(
      repository.listDocuments({ ownerUserId: "different-owner" }),
    ).resolves.toEqual([]);

    await expect(
      repository.saveDocuments([
        { ...identity, owner: { ...identity.owner, id: "different-owner" } },
      ]),
    ).rejects.toThrow("owner boundary violation");
  });

  it("updates offline state and activity atomically through the storage seam", async () => {
    const storage = new MemoryWalletStorage();
    const repository = createRepository(storage);
    await repository.saveDocuments([
      document("identity", "patient_identity", "2026-07-01"),
    ]);

    await repository.markOffline("identity", true);
    expect((await repository.getDocument("identity"))?.local).toEqual({
      pinned: false,
      availableOffline: true,
      cachedAt: "2026-07-10T10:00:00.000Z",
    });
    await expect(
      repository.listActivity({ types: ["document_saved_offline"] }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "offline:identity:event-1",
        ownerUserId: "patient-1",
        documentId: "identity",
        metadata: { enabled: true },
      }),
    ]);
    expect(storage.writeSizes.at(-1)).toBe(2);

    await repository.markOffline("identity", false);
    expect((await repository.getDocument("identity"))?.local).toEqual({
      pinned: false,
      availableOffline: false,
      cachedAt: undefined,
    });
  });

  it("reads active shares from the owner-specific store", async () => {
    const storage = new MemoryWalletStorage();
    const older: ActiveShare = {
      id: "share-old",
      artifactId: "vp-old",
      recipient: "Hospital A",
      purpose: "OPD",
      documentIds: ["identity"],
      createdAt: "2026-07-01T00:00:00.000Z",
      status: "active",
    };
    const newer: ActiveShare = {
      ...older,
      id: "share-new",
      artifactId: "vp-new",
      createdAt: "2026-07-09T00:00:00.000Z",
    };
    await storage.write([
      { store: "active_shares", key: older.id, value: older },
      { store: "active_shares", key: newer.id, value: newer },
    ]);

    await expect(createRepository(storage).listActiveShares()).resolves.toEqual([
      newer,
      older,
    ]);
  });
});

function createRepository(storage: IndexedDbWalletStorage) {
  let event = 0;
  return new IndexedDbWalletRepository({
    runtimeEnvironment: "production",
    ownerId: "patient-1",
    storage,
    now: () => "2026-07-10T10:00:00.000Z",
    createEventId: () => `event-${++event}`,
  });
}

function document(
  id: string,
  documentType: WalletDocumentRecordV2["documentType"],
  recordTime: string,
  overrides: Partial<WalletDocumentRecordV2> = {},
): WalletDocumentRecordV2 {
  const category =
    documentType === "lab_result"
      ? "diagnostics_and_results"
      : "identity_and_access";
  return {
    schemaVersion: "2.0",
    id,
    owner: { id: "patient-1" },
    documentType,
    category,
    title: { th: id },
    clinicalContext: { recordTime },
    lifecycle: { status: "final", versionId: "1" },
    provenance: {
      sourceKind: "provider_fhir",
      receivedAt: `${recordTime}T00:00:00.000Z`,
    },
    content: {
      documentReference: {
        resourceType: "DocumentReference",
        id: `reference-${id}`,
        status: "current",
        content: [],
      },
      originalAttachments: [],
    },
    credential: { format: "none" },
    trust: { state: "pending", checks: [] },
    privacy: {
      defaultDisclosure: "ask",
      selectivelyDisclosableFields: [],
    },
    local: { pinned: false, availableOffline: false },
    ...overrides,
  };
}

class MemoryWalletStorage implements IndexedDbWalletStorage {
  readonly writeSizes: number[] = [];
  private readonly stores = new Map<
    IndexedDbWalletStoreName,
    Map<string, unknown>
  >();

  async get<T>(
    store: IndexedDbWalletStoreName,
    key: string,
  ): Promise<T | undefined> {
    return clone(this.store(store).get(key) as T | undefined);
  }

  async getAll<T>(store: IndexedDbWalletStoreName): Promise<T[]> {
    return clone(Array.from(this.store(store).values()) as T[]);
  }

  async write(entries: IndexedDbWalletStorageWrite[]): Promise<void> {
    this.writeSizes.push(entries.length);
    for (const entry of entries) {
      this.store(entry.store).set(entry.key, clone(entry.value));
    }
  }

  private store(name: IndexedDbWalletStoreName): Map<string, unknown> {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return store;
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : globalThis.structuredClone(value);
}

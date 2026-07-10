import { describe, expect, it } from "vitest";
import {
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
} from "@trustcare/wallet-core";
import {
  assertDocumentInNamespace,
  createWalletRepositoryNamespace,
  documentMatchesQuery,
  paginateDocuments,
} from "./sqliteWalletRepositoryPolicy";

const record = walletDocumentRecordV2FromCard(
  getDemoWalletCards("demo-patient-complete-001")[0],
  { now: "2026-07-10T00:00:00.000Z" },
);

describe("SqliteWalletRepository namespace policy", () => {
  const namespace = createWalletRepositoryNamespace({
    runtimeEnvironment: "demo",
    ownerUserId: record.owner.id,
  });

  it("binds storage to runtime, owner and V2 schema", () => {
    expect(namespace).toEqual({
      runtimeEnvironment: "demo",
      ownerUserId: record.owner.id,
      schemaVersion: "2.0",
    });
    expect(() => assertDocumentInNamespace(namespace, record)).not.toThrow();
  });

  it("rejects cross-owner records", () => {
    expect(() =>
      assertDocumentInNamespace(namespace, {
        ...record,
        owner: { ...record.owner, id: "another-owner" },
      }),
    ).toThrow(/another owner/);
  });

  it("applies owner, domain and text queries without leaking another scope", () => {
    expect(documentMatchesQuery(namespace, record, {})).toBe(true);
    expect(
      documentMatchesQuery(namespace, record, {
        ownerUserId: "another-owner",
      }),
    ).toBe(false);
    expect(
      documentMatchesQuery(namespace, record, {
        documentTypes: [record.documentType],
        trustStates: [record.trust.state],
        search: record.title.th.slice(0, 3),
      }),
    ).toBe(true);
  });

  it("uses bounded offset and limit pagination", () => {
    const records = [record, { ...record, id: `${record.id}:second` }];
    expect(paginateDocuments(records, { offset: 1, limit: 1 })).toEqual([
      records[1],
    ]);
    expect(paginateDocuments(records, { offset: -10, limit: -1 })).toEqual([]);
  });
});

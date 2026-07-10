import { describe, expect, it } from "vitest";
import {
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
} from "@trustcare/wallet-core";
import {
  filterPatientDocuments,
  isCurrentPatientDocument,
  patientTrustPresentation,
} from "./patientDocumentPresentation";

const record = walletDocumentRecordV2FromCard(
  getDemoWalletCards("demo-patient-complete-001")[0],
  { now: "2026-07-10T00:00:00.000Z" },
);

describe("patient document presentation", () => {
  it("does not trust a declared verified state with incomplete checks", () => {
    const malformed = {
      ...record,
      trust: { ...record.trust, state: "verified" as const },
    };
    expect(patientTrustPresentation(malformed)).toMatchObject({
      label: "อยู่ระหว่างตรวจสอบ",
      tone: "yellow",
    });
    expect(patientTrustPresentation(record).tone).not.toBe("green");
  });

  it("separates current records from records needing attention", () => {
    const verified = {
      ...record,
      trust: {
        state: "verified" as const,
        verifiedAt: "2026-07-10T00:00:00.000Z",
        checks: ["proof", "issuer", "status", "expiry", "holder", "policy"].map(
          (key) => ({
            key,
            status: "passed" as const,
            checkedAt: "2026-07-10T00:00:00.000Z",
          }),
        ),
      },
    };
    const revoked = {
      ...record,
      id: `${record.id}:revoked`,
      lifecycle: { ...record.lifecycle, status: "revoked" as const },
      trust: { ...record.trust, state: "revoked" as const },
    };
    expect(isCurrentPatientDocument(verified)).toBe(true);
    expect(isCurrentPatientDocument(revoked)).toBe(false);
    expect(
      filterPatientDocuments([verified, revoked], { filter: "current" }),
    ).toEqual([verified]);
    expect(
      filterPatientDocuments([verified, revoked], { filter: "attention" }),
    ).toEqual([revoked]);
  });

  it("searches patient titles and issuer/facility language", () => {
    expect(
      filterPatientDocuments([record], { search: record.title.th.slice(0, 3) }),
    ).toHaveLength(1);
    expect(filterPatientDocuments([record], { search: "not-present" })).toEqual(
      [],
    );
  });
});

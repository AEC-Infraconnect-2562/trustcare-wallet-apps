import { describe, expect, it } from "vitest";
import {
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
} from "@trustcare/wallet-core";
import { recordDate, recordTrustPresentation } from "./RecordsV2View";

const record = walletDocumentRecordV2FromCard(getDemoWalletCards()[0], {
  now: "2026-07-10T00:00:00.000Z",
});

describe("RecordsV2 view model", () => {
  it("does not use green when a declared verified state lacks passed checks", () => {
    expect(
      recordTrustPresentation({
        ...record,
        trust: { ...record.trust, state: "verified" },
      }).tone,
    ).toBe("yellow");
    expect(recordTrustPresentation(record).tone).not.toBe("green");
  });

  it("derives a patient-readable date from the V2 record", () => {
    const card = getDemoWalletCards("demo-patient-complete-001")[0];
    const record = walletDocumentRecordV2FromCard(card);
    expect(recordDate(record)).toBeTruthy();
    expect(recordDate(record)).not.toContain("Invalid");
  });
});

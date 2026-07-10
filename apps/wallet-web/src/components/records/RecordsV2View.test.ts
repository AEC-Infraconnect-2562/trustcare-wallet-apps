import { describe, expect, it } from "vitest";
import { walletDocumentRecordV2FromCard, getDemoWalletCards } from "@trustcare/wallet-core";
import { recordDate, recordTrustPresentation } from "./RecordsV2View";

describe("RecordsV2 view model", () => {
  it("uses green only for the verified V2 trust state", () => {
    expect(recordTrustPresentation("verified").tone).toBe("green");
    expect(recordTrustPresentation("pending").tone).toBe("yellow");
    expect(recordTrustPresentation("issuer_signed_untrusted").tone).not.toBe(
      "green",
    );
    expect(recordTrustPresentation("transport_valid").tone).toBe("blue");
  });

  it("derives a patient-readable date from the V2 record", () => {
    const card = getDemoWalletCards("demo-patient-complete-001")[0];
    const record = walletDocumentRecordV2FromCard(card);
    expect(recordDate(record)).toBeTruthy();
    expect(recordDate(record)).not.toContain("Invalid");
  });
});

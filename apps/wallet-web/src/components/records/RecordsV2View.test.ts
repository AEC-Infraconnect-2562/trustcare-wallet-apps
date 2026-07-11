import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
} from "@trustcare/wallet-core";
import { recordDate, recordTrustPresentation } from "./RecordsV2View";

const recordListStyles = readFileSync(
  new URL("../../styles/index.css", import.meta.url),
  "utf8",
);

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

  it("constrains credential portraits before responsive media rules apply", () => {
    const baseStyles = recordListStyles.split("@media", 1)[0];

    expect(baseStyles).toMatch(/\.record-v2-photo\s*\{[^}]*position:\s*relative/s);
    expect(baseStyles).toMatch(/\.record-v2-photo\s*\{[^}]*contain:\s*paint/s);
    expect(baseStyles).toMatch(
      /\.record-v2-photo img\s*\{[^}]*position:\s*absolute[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s,
    );
  });
});

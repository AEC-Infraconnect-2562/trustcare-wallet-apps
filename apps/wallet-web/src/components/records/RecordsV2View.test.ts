import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  getDemoWalletCards,
  walletDocumentRecordV2FromCard,
} from "@trustcare/wallet-core";
import {
  RecordsV2View,
  mergeRecordSources,
  recordDate,
  recordMatchesSearch,
  recordTrustPresentation,
} from "./RecordsV2View";

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

  it("merges repository and Exchange records without rendering a duplicate", () => {
    const result = mergeRecordSources([record], [structuredClone(record)]);

    expect(result.error).toBe("");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe(record.id);
  });

  it("uses the shared version guard when the Exchange record supersedes a repository record", () => {
    const updated = {
      ...structuredClone(record),
      title: { th: "เอกสารฉบับใหม่", en: "Updated document" },
      lifecycle: {
        ...record.lifecycle,
        versionId: "2",
        updatedAt: "2027-07-10T00:00:00.000Z",
      },
    };
    const result = mergeRecordSources([record], [updated]);

    expect(result.error).toBe("");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.lifecycle.versionId).toBe("2");
    expect(result.records[0]?.title.en).toBe("Updated document");
  });

  it("fails closed when the same record id crosses owner partitions", () => {
    const result = mergeRecordSources(
      [record],
      [
        {
          ...structuredClone(record),
          owner: {
            id: "did:key:z6MkhAnotherWalletHolder",
            holderDid: "did:key:z6MkhAnotherWalletHolder",
          },
        },
      ],
    );

    expect(result.records).toEqual([]);
    expect(result.error).toContain("conflicting owner partitions");
  });

  it("applies the document search vocabulary to Exchange records", () => {
    const exchangeRecord = {
      ...structuredClone(record),
      provenance: {
        ...record.provenance,
        issuerName: "TrustCare Central Hospital",
      },
    };

    expect(recordMatchesSearch(exchangeRecord, "central hospital")).toBe(true);
    expect(recordMatchesSearch(exchangeRecord, "missing issuer")).toBe(false);
  });

  it("offers a patient-readable Portal recipient without technical disclosure modes", () => {
    const signedExchangeRecord = {
      ...structuredClone(record),
      credential: {
        ...record.credential,
        jwt: "header.payload.signature",
      },
    };
    const html = renderToStaticMarkup(
      createElement(RecordsV2View, {
        runtimeEnvironment: "demo",
        userId: record.owner.id,
        apiUrl: "http://127.0.0.1:8787",
        exchangeRecords: [signedExchangeRecord],
        selectedRecordId: signedExchangeRecord.id,
        defaultTargetHospitalCode: "TCP",
        onOpenRecord: vi.fn(),
        onCloseRecord: vi.fn(),
        onSubmitExchangeRecord: vi.fn(),
        onRefreshExchangeSubmission: vi.fn(),
      }),
    );

    expect(html).toContain("แชร์เอกสารกับโรงพยาบาล");
    expect(html).toContain("Wallet จะสร้างลายเซ็นใหม่สำหรับการแชร์ครั้งนี้");
    expect(html).toContain("TrustCare Central Hospital");
    expect(html).toContain("TrustCare Phuket International Hospital");
    expect(html).toContain("TrustCare Medical Center");
    expect(html).not.toContain("Full VC");
    expect(html).not.toContain(">SD<");
    expect(html).not.toContain(">ZKP<");
  });

  it("shows a plain-language recovery action for durable shares after restart", () => {
    const html = renderToStaticMarkup(
      createElement(RecordsV2View, {
        runtimeEnvironment: "demo",
        userId: record.owner.id,
        apiUrl: "http://127.0.0.1:8787",
        pendingShareCount: 1,
        onRecoverPendingShares: vi.fn(),
        onOpenRecord: vi.fn(),
        onCloseRecord: vi.fn(),
      }),
    );

    expect(html).toContain("มีเอกสาร 1 รายการที่รอส่งต่อ");
    expect(html).toContain("ลองส่งอีกครั้ง");
    expect(html).not.toContain("outbox");
    expect(html).not.toContain("idempotency");
  });

  it("constrains credential portraits before responsive media rules apply", () => {
    const baseStyles = recordListStyles.split("@media", 1)[0];

    expect(baseStyles).toMatch(
      /\.record-v2-photo\s*\{[^}]*position:\s*relative/s,
    );
    expect(baseStyles).toMatch(/\.record-v2-photo\s*\{[^}]*contain:\s*paint/s);
    expect(baseStyles).toMatch(
      /\.record-v2-photo img\s*\{[^}]*position:\s*absolute[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s,
    );
  });
});

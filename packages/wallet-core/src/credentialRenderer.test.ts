import { describe, expect, it } from "vitest";
import {
  completeWalletSeedCards,
  credentialRenderModelFromCard,
  getDemoWalletCards,
  presentationEnvelopeFromWalletCard,
} from "./index";

describe("shared credential renderer", () => {
  const somchaiCards = getDemoWalletCards("demo-patient-001");
  const completeCards = getDemoWalletCards("demo-patient-complete-001");

  it("renders Somchai insurance eligibility from the same central model used by VP envelopes", () => {
    const card = requiredCard("insurance_eligibility");
    const model = credentialRenderModelFromCard(card);
    const envelope = presentationEnvelopeFromWalletCard(card);
    const labels = model.fields.map((field) => field.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "ผู้รับประกัน",
        "แผน",
        "สถานะสิทธิ",
        "ตรวจสอบล่าสุด",
      ]),
    );
    expect(model.payloads.coverage.status).toBe("eligible");
    expect(model.payloads.coverage.coveragePeriod).toMatchObject({
      start: expect.any(String),
      end: expect.any(String),
    });
    const envelopeDocumentFields = envelope.sections.find(
      (section) => section.key === "document",
    )?.fields;
    const modelDocumentFields = model.sections.find(
      (section) => section.key === "document",
    )?.fields;

    expect(envelopeDocumentFields).toEqual(modelDocumentFields);
  });

  it("renders Somchai medical certificate without dash-only clinical fields", () => {
    const card = requiredCard("medical_certificate");
    const model = credentialRenderModelFromCard(card);
    const certificate = model.payloads.certificate;

    expect(certificate.certificateNo).toBeTruthy();
    expect(certificate.examinationDate).toBeTruthy();
    expect(certificate.validUntil).toBeTruthy();
    expect(certificate.result).toBeTruthy();
    expect(model.fields.map((field) => field.label)).toEqual(
      expect.arrayContaining(["วันที่ตรวจ", "ใช้ได้ถึง", "ผลการตรวจ"]),
    );
    expect(model.fields.every((field) => field.value !== "-")).toBe(true);
  });

  it("keeps every Somchai credential backed by a type-specific render section", () => {
    for (const card of somchaiCards) {
      const model = credentialRenderModelFromCard(card);
      const documentSection = model.sections.find(
        (section) => section.key === "document",
      );

      expect(documentSection?.fields.length, card.cardType).toBeGreaterThan(0);
      expect(model.narrative.title, card.cardType).toBeTruthy();
    }
  });

  it("keeps every canonical credential envelope aligned with the central type renderer", () => {
    for (const card of completeWalletSeedCards) {
      const model = credentialRenderModelFromCard(card);
      const envelope = presentationEnvelopeFromWalletCard(card);
      const modelDocumentFields = model.sections.find(
        (section) => section.key === "document",
      )?.fields;
      const envelopeDocumentFields = envelope.sections.find(
        (section) => section.key === "document",
      )?.fields;

      expect(envelopeDocumentFields, card.cardType).toEqual(
        modelDocumentFields,
      );
    }
  });

  it("auto-renders business claim payload fields through the central type renderer", () => {
    const baseCard = completeCards.find(
      (item) => item.cardType === "claim_package",
    );
    expect(baseCard).toBeTruthy();

    const credentialData = baseCard!.credentialData as any;
    const credentialSubject = credentialData.credentialSubject as any;
    const card = {
      ...baseCard!,
      credentialData: {
        ...credentialData,
        credentialSubject: {
          ...credentialSubject,
          claimPackage: {
            ...credentialSubject.claimPackage,
            portalAdjudicationNote: "requires original invoice",
          },
        },
      },
    };

    const model = credentialRenderModelFromCard(card);
    const envelope = presentationEnvelopeFromWalletCard(card);
    const fieldPaths = model.fields.map((field) => field.path);
    const envelopeDocumentFields = envelope.sections.find(
      (section) => section.key === "document",
    )?.fields;
    const modelDocumentFields = model.sections.find(
      (section) => section.key === "document",
    )?.fields;

    expect(fieldPaths).toEqual(
      expect.arrayContaining([
        "credentialSubject.claimPackage.claimNo",
        "credentialSubject.claimPackage.diagnosisCodes",
        "credentialSubject.claimPackage.serviceLines",
        "credentialSubject.claimPackage.attachments",
        "credentialSubject.claimPackage.portalAdjudicationNote",
      ]),
    );
    expect(envelopeDocumentFields).toEqual(modelDocumentFields);
  });

  it("auto-renders claim receipt payload fields through the central type renderer", () => {
    const card = completeCards.find(
      (item) => item.cardType === "claim_receipt",
    );
    expect(card).toBeTruthy();

    const model = credentialRenderModelFromCard(card!);
    const fieldPaths = model.fields.map((field) => field.path);

    expect(fieldPaths).toEqual(
      expect.arrayContaining([
        "credentialSubject.claimReceipt.receiptNo",
        "credentialSubject.claimReceipt.invoiceNo",
        "credentialSubject.claimReceipt.paidAt",
        "credentialSubject.claimReceipt.cashier",
        "credentialSubject.claimReceipt.items",
        "credentialSubject.claimReceipt.netAmount",
        "credentialSubject.claimReceipt.insurerResponsibility",
      ]),
    );
  });

  it("renders the eight clinical canonical types from central envelope fields", () => {
    const centrallyRenderedTypes = [
      "patient_summary",
      "allergy_alert",
      "immunization",
      "medication_summary",
      "prescription",
      "pharmacy_dispense",
      "lab_result",
      "diagnostic_report",
    ];

    for (const cardType of centrallyRenderedTypes) {
      const card = completeCards.find((item) => item.cardType === cardType);
      expect(card, cardType).toBeTruthy();
      const model = credentialRenderModelFromCard(card!);
      const envelope = presentationEnvelopeFromWalletCard(card!);
      const documentFields = envelope.sections.find(
        (section) => section.key === "document",
      )?.fields;

      expect(model.fields.length, cardType).toBeGreaterThan(0);
      expect(
        model.fields.some((field) =>
          String(field.path).startsWith(`credentialSubject.`),
        ),
        cardType,
      ).toBe(true);
      expect(documentFields, cardType).toEqual(model.fields);
    }
  });

  it("keeps claim status distinct from payment receipt rendering", () => {
    const baseCard = completeCards.find(
      (item) => item.cardType === "claim_receipt",
    );
    expect(baseCard).toBeTruthy();
    const statusCard = {
      ...baseCard!,
      credentialType: "ClaimStatusCredential",
      displayName: "Legacy Claim Receipt",
      credentialData: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "vc-claim-status-demo",
        type: ["VerifiableCredential", "ClaimStatusCredential"],
        issuer: {
          id: "did:web:trustcare.example:payer:demo",
          name: "Demo Payer",
        },
        credentialSubject: {
          id: baseCard!.holderDid,
          claimCaseId: "claim-case-001",
          payerId: "demo-payer",
          status: "need_more_evidence",
          payerStatusCode: "NME-01",
          payerStatusText: "Original invoice required",
          updatedAt: "2026-07-10T00:30:00.000Z",
          needMoreEvidence: [
            {
              requestId: "evidence-001",
              requiredDocumentTypes: ["claim_receipt"],
            },
          ],
        },
      },
    };

    const model = credentialRenderModelFromCard(statusCard);
    const labels = model.fields.map((field) => field.label);

    expect(model.claimReceiptKind).toBe("claim_status");
    expect(model.kindLabel).toBe("Claim status");
    expect(model.narrative.title).toBe("สถานะเคลมจาก Payer");
    expect(labels).toEqual(
      expect.arrayContaining([
        "Claim case ID",
        "Payer",
        "สถานะเคลม",
        "รหัสสถานะจาก Payer",
        "อัปเดตเมื่อ",
      ]),
    );
    expect(labels).not.toContain("เลขที่ใบเสร็จ");
    expect(labels).not.toContain("ยอดสุทธิ");
  });

  it("uses renderData document metadata before stale card metadata", () => {
    const baseCard = completeCards.find((item) => item.cardType === "quotation")!;
    const credentialData = baseCard.credentialData as any;
    const credentialSubject = credentialData.credentialSubject as any;
    const card = {
      ...baseCard,
      credentialStatus: "active" as const,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      credentialData: {
        ...credentialData,
        credentialSubject: {
          ...credentialSubject,
          humanDocument: {
            renderData: {
              patient: { fullNameEn: "Canonical Patient" },
              hospital: { nameEn: "Canonical Hospital" },
              document: {
                status: "revoked",
                issuedAt: "2026-07-09T00:00:00.000Z",
                expiresAt: "2026-07-10T00:00:00.000Z",
              },
              treatmentQuotation: {
                packageName: "Canonical treatment",
                estimatedTotal: 450000,
                currency: "THB",
              },
            },
          },
        },
      },
    };

    const model = credentialRenderModelFromCard(card);
    const envelope = presentationEnvelopeFromWalletCard(card);
    const metadata = model.sections.find(
      (section) => section.key === "metadata",
    )?.fields;

    expect(model.patient.fullNameEn).toBe("Canonical Patient");
    expect(model.hospital.nameEn).toBe("Canonical Hospital");
    expect(model.document).toMatchObject({
      status: "revoked",
      issuedAt: "2026-07-09T00:00:00.000Z",
      expiresAt: "2026-07-10T00:00:00.000Z",
    });
    expect(model.payloads.quotation.packageName).toBe("Canonical treatment");
    expect(metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "สถานะ", value: "revoked" }),
      ]),
    );
    expect(envelope.trust.status).toBe("invalid_or_revoked");
    expect(envelope.policy.expiresAt).toBe("2026-07-10T00:00:00.000Z");
  });

  function requiredCard(cardType: string) {
    const card = somchaiCards.find((item) => item.cardType === cardType);
    expect(card, cardType).toBeTruthy();
    return card!;
  }
});

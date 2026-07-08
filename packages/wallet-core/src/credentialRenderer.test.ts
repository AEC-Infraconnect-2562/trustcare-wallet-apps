import { describe, expect, it } from "vitest";
import {
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

  function requiredCard(cardType: string) {
    const card = somchaiCards.find((item) => item.cardType === cardType);
    expect(card, cardType).toBeTruthy();
    return card!;
  }
});

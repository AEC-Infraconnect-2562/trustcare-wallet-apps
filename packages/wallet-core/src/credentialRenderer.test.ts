import { describe, expect, it } from "vitest";
import {
  completeWalletSeedCards,
  credentialCompactSummaryRows,
  credentialRenderModelFromCard,
  getDemoWalletCards,
  presentationEnvelopeFromWalletCard,
  walletCardForCredentialRendering,
  walletCardForDocumentRendering,
  walletDocumentRecordV2FromCard,
} from "./index";

describe("shared credential renderer", () => {
  const somchaiCards = getDemoWalletCards("demo-patient-001");
  const completeCards = getDemoWalletCards("demo-patient-complete-001");
  const staffCards = getDemoWalletCards("demo-staff-complete-001");

  it("projects compact Home facts from the shared renderer only", () => {
    const identity = completeCards.find(
      (card) => card.cardType === "patient_identity",
    )!;
    const eligibility = completeCards.find(
      (card) => card.cardType === "insurance_eligibility",
    )!;
    const medication = completeCards.find(
      (card) => card.cardType === "medication_summary",
    )!;

    const identityRows = credentialCompactSummaryRows(
      credentialRenderModelFromCard(identity),
    );
    const eligibilityRows = credentialCompactSummaryRows(
      credentialRenderModelFromCard(eligibility),
    );
    const medicationRows = credentialCompactSummaryRows(
      credentialRenderModelFromCard(medication),
    );

    expect(identityRows.map((row) => row.label)).toEqual([
      "HN",
      "CarePass ID",
      "วันเกิด",
    ]);
    expect(eligibilityRows.map((row) => row.label)).toEqual([
      "ผู้รับประกัน",
      "สถานะสิทธิ",
      "เครือข่าย",
    ]);
    expect(medicationRows[0]).toMatchObject({
      value: expect.stringMatching(/\d+ รายการ/),
    });
    expect(medicationRows.some((row) => /Metformin/i.test(row.value))).toBe(
      true,
    );

    const compactText = [...identityRows, ...eligibilityRows, ...medicationRows]
      .map((row) => `${row.label} ${row.value} ${row.sourcePath ?? ""}`)
      .join(" ");
    expect(compactText).not.toMatch(/proof|issuer did|credential payload/i);
  });

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
    const baseCard = completeCards.find(
      (item) => item.cardType === "quotation",
    )!;
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

  it("builds semantic A4 paper tables for clinical and financial documents", () => {
    const tableProfiles = [
      ["immunization", "immunizations"],
      ["medication_summary", "medications"],
      ["prescription", "prescription-items"],
      ["pharmacy_dispense", "dispensed-items"],
      ["lab_result", "lab-observations"],
      ["diagnostic_report", "diagnostic-observations"],
      ["claim_package", "claim-lines"],
      ["claim_receipt", "receipt-lines"],
      ["quotation", "quotation-lines"],
    ] as const;

    for (const [cardType, sectionKey] of tableProfiles) {
      const card = completeCards.find((item) => item.cardType === cardType);
      expect(card, cardType).toBeTruthy();
      const model = credentialRenderModelFromCard(card!);
      const table = model.paper.sections.find(
        (section) => section.key === sectionKey,
      );

      expect(model.paper.generic, cardType).toBe(false);
      expect(table?.kind, cardType).toBe("table");
      expect(table?.columns?.length, cardType).toBeGreaterThan(0);
      expect(table?.rows?.length, cardType).toBeGreaterThan(0);
    }
  });

  it("assigns ISO ID-1 only to canonical identity cards", () => {
    for (const cardType of ["patient_identity", "staff_identity"]) {
      const source = [...completeCards, ...staffCards].find(
        (item) => item.cardType === cardType,
      );
      expect(source, cardType).toBeTruthy();
      expect(credentialRenderModelFromCard(source!).paper.formFactor).toEqual({
        kind: "iso_id_1",
        widthMm: 85.6,
        heightMm: 53.98,
        orientation: "landscape",
      });
    }

    for (const cardType of [
      "medical_certificate",
      "patient_summary",
      "mpi_link_certificate",
    ]) {
      const source = completeCards.find((item) => item.cardType === cardType);
      expect(source, cardType).toBeTruthy();
      expect(credentialRenderModelFromCard(source!).paper.formFactor).toEqual({
        kind: "a4_portrait",
        widthMm: 210,
        heightMm: 297,
        orientation: "portrait",
      });
    }
  });

  it("does not let an unrelated layout hint turn a clinical document into an ID card", () => {
    const source = completeCards.find(
      (item) => item.cardType === "medical_certificate",
    )!;
    const credentialData = structuredClone(source.credentialData!) as any;
    credentialData.credentialSubject.humanDocument.layout =
      "photo_identity_card";

    expect(
      credentialRenderModelFromCard({ ...source, credentialData }).paper
        .formFactor.kind,
    ).toBe("a4_portrait");
  });

  it("keeps paper identity, issuer, signatory and evidence strictly source-backed", () => {
    const card = {
      id: 901,
      cardType: "medical_certificate",
      displayName: "Source title",
      documentCategory: "clinical_summary",
      credentialId: "vc-minimal-paper",
      credentialStatus: "",
      credentialData: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "vc-minimal-paper",
        type: ["VerifiableCredential", "MedicalCertificateCredential"],
        issuer: { id: "did:web:issuer.example" },
        credentialSubject: {
          id: "did:key:holder",
          certificate: { result: "Source-backed result" },
        },
      },
      createdAt: "",
    } as const;

    const paper = credentialRenderModelFromCard(card).paper;

    expect(paper.title.th).toBe("Source title");
    expect(paper.letterhead).toMatchObject({ did: "did:web:issuer.example" });
    expect(paper.letterhead.nameTh).toBeUndefined();
    expect(paper.letterhead.nameEn).toBeUndefined();
    expect(paper.letterhead.address).toBeUndefined();
    expect(paper.letterhead.phone).toBeUndefined();
    expect(paper.letterhead.logoUrl).toBeUndefined();
    expect(paper.patientFields).toEqual([]);
    expect(paper.signatories).toEqual([]);
    expect(paper.evidence).toEqual([]);
    expect(paper.watermark).toBeUndefined();
  });

  it("renders a watermark only when credential metadata declares it explicitly", () => {
    const baseCard = completeCards.find(
      (item) => item.cardType === "medical_certificate",
    )!;
    expect(credentialRenderModelFromCard(baseCard).paper.watermark).toBe(
      "DEMO ONLY",
    );

    const credentialData = baseCard.credentialData as any;
    const cardWithoutWatermark = {
      ...baseCard,
      credentialData: {
        ...credentialData,
        trustcare: {
          ...credentialData.trustcare,
          display: {
            ...credentialData.trustcare.display,
            watermark: undefined,
          },
        },
      },
    };

    expect(
      credentialRenderModelFromCard(cardWithoutWatermark).paper.watermark,
    ).toBeUndefined();
  });

  it("labels payer outcomes as reported and states that Wallet does not adjudicate", () => {
    for (const cardType of ["insurance_eligibility", "guarantee_letter"]) {
      const card = completeCards.find((item) => item.cardType === cardType)!;
      const paper = credentialRenderModelFromCard(card).paper;
      const disclaimer = paper.sections.find(
        (section) => section.key === "payer-reported-disclaimer",
      );

      expect(
        paper.sections.some(
          (section) =>
            section.title.includes("Payer") ||
            String(section.titleEn).includes("Payer-reported"),
        ),
        cardType,
      ).toBe(true);
      expect(String(disclaimer?.body), cardType).toContain(
        "Wallet ไม่ได้เป็นผู้พิจารณาหรือตัดสินผลเคลม",
      );
    }
  });

  it("keeps payer and provider letterheads separated in complete fixtures", () => {
    for (const cardType of ["insurance_eligibility", "guarantee_letter"]) {
      const card = completeCards.find((item) => item.cardType === cardType)!;
      const paper = credentialRenderModelFromCard(card).paper;

      expect(card.issuerDid, cardType).toContain(":payer:");
      expect(paper.issuerRole, cardType).toBe("payer");
      expect(paper.letterhead.did, cardType).toBe(card.issuerDid);
      expect(paper.letterhead.address, cardType).toBeTruthy();
      expect(paper.letterhead.phone, cardType).toBeTruthy();
    }

    for (const cardType of ["claim_package", "claim_receipt", "quotation"]) {
      const card = completeCards.find((item) => item.cardType === cardType)!;
      const paper = credentialRenderModelFromCard(card).paper;

      expect(card.issuerDid, cardType).toMatch(
        /^did:web:wallet-demo\.invalid:issuer:(?:tcc|tcp|tcm)$/,
      );
      expect(paper.issuerRole, cardType).toBe("healthcare_provider");
      expect(paper.letterhead.did, cardType).toBe(card.issuerDid);
    }
  });

  it("keeps a declared payer issuer even when the payload also names a hospital", () => {
    const source = completeCards.find(
      (item) => item.cardType === "insurance_eligibility",
    )!;
    const credentialData = structuredClone(source.credentialData!);
    const subject = credentialData.credentialSubject as Record<string, unknown>;
    const humanDocument = subject.humanDocument as Record<string, unknown>;
    humanDocument.renderData = {
      hospital: {
        nameTh: "โรงพยาบาลที่ให้บริการ",
        did: "did:web:provider.example",
      },
    };
    const paper = credentialRenderModelFromCard({
      ...source,
      credentialData,
    }).paper;

    expect(paper.letterhead.did).toBe(source.issuerDid);
    expect(paper.letterhead.nameTh).toBe("บริษัทประกันสุขภาพสากล เดโม จำกัด");
  });

  it("keeps staff text and portrait bound to the same staff subject", () => {
    const card = staffCards.find((item) => item.cardType === "staff_identity")!;
    const model = credentialRenderModelFromCard(card);
    const patientValues = model.paper.patientFields.map((field) => field.value);

    expect(patientValues).toContain("พญ.สิริรักษ์ รักษาดี");
    expect(patientValues).not.toContain("นายสมชาย ใจดี");
    expect(card.patientAvatarUrl).toBeTruthy();
    expect(card.patientAvatarUrl).not.toBe(
      completeCards.find((item) => item.cardType === "patient_identity")
        ?.patientAvatarUrl,
    );
  });

  it("adapts a verified raw VC for rendering without inventing storage or trust data", () => {
    const credential = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "urn:vc:render-only:1",
      type: ["VerifiableCredential", "MedicalCertificateCredential"],
      issuer: {
        id: "did:web:hospital.example",
        nameTh: "โรงพยาบาลตัวอย่าง",
      },
      validFrom: "2026-07-10T00:00:00.000Z",
      credentialSubject: {
        id: "did:key:patient-example",
        patient: { fullNameTh: "ผู้ป่วยจาก VC" },
        humanDocument: {
          titleTh: "ใบรับรองจาก VC",
          titleEn: "VC medical certificate",
          sourceSystem: "verified_public_vp",
        },
        certificate: { result: "fit" },
      },
    };

    const card = walletCardForCredentialRendering(credential, 2);

    expect(card).toMatchObject({
      id: 3,
      cardType: "medical_certificate",
      displayName: "ใบรับรองจาก VC",
      displayNameEn: "VC medical certificate",
      credentialId: "urn:vc:render-only:1",
      credentialStatus: "",
      issuerHospitalName: "โรงพยาบาลตัวอย่าง",
      issuerDid: "did:web:hospital.example",
      holderDid: "did:key:patient-example",
      sourceSystem: "verified_public_vp",
    });
    expect(card?.ownerUserId).toBeUndefined();
    expect(card?.patientId).toBeUndefined();
    expect(card?.portalVerification).toBeUndefined();
    expect(card?.credentialData).toBe(credential);
  });

  it("rejects unsupported raw inputs in the public renderer adapter", () => {
    expect(walletCardForCredentialRendering(null)).toBeNull();
    expect(walletCardForCredentialRendering("vc")).toBeNull();
    expect(
      walletCardForCredentialRendering({
        type: ["VerifiableCredential", "UnknownCredential"],
        credentialSubject: { id: "did:key:unknown" },
      }),
    ).toBeNull();
  });

  it("does not turn statusPurpose or an array index into document facts", () => {
    const card = walletCardForCredentialRendering({
      type: ["VerifiableCredential", "MedicalCertificateCredential"],
      issuer: "did:web:hospital.example",
      credentialStatus: {
        id: "https://status.example/1#4",
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
      },
      credentialSubject: {
        id: "did:key:patient-example",
        humanDocument: { titleTh: "ใบรับรองไม่มีรหัส" },
        certificate: { result: "fit" },
      },
    });

    expect(card?.credentialId).toBe("");
    expect(card?.credentialStatus).toBe("");
    const model = credentialRenderModelFromCard(card!);
    expect(
      model.paper.metadataFields.map((field) => field.value),
    ).not.toContain("revocation");
  });

  it("adapts the primary V2 document model through the same source payload", () => {
    const source = completeCards.find(
      (item) => item.cardType === "prescription",
    )!;
    const record = walletDocumentRecordV2FromCard(source, {
      now: "2026-07-10T00:00:00.000Z",
    });
    const card = walletCardForDocumentRendering(record);
    const model = credentialRenderModelFromCard(card);

    expect(card.credentialData).toEqual(source.credentialData);
    expect(model.documentType).toBe("prescription");
    expect(
      model.paper.sections.some((section) => section.kind === "table"),
    ).toBe(true);
  });

  function requiredCard(cardType: string) {
    const card = somchaiCards.find((item) => item.cardType === cardType);
    expect(card, cardType).toBeTruthy();
    return card!;
  }
});

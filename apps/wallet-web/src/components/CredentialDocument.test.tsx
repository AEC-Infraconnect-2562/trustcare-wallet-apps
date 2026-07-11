import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CredentialDocument,
  PresentationCoverDocument,
} from "@trustcare/ui-web";
import {
  getCompleteWalletSeed,
  photoBearingCredentialTypes,
  type WalletCard,
} from "@trustcare/wallet-core";

describe("shared credential document", () => {
  const cards = getCompleteWalletSeed("demo-patient-complete-001");

  it("renders patient identity as an ISO ID-1 card instead of A4 paper", () => {
    const card = cards.find((item) => item.cardType === "patient_identity")!;
    const html = renderToStaticMarkup(<CredentialDocument card={card} />);

    expect(html).toContain('data-document-form-factor="iso_id_1"');
    expect(html).toContain("tc-form-iso-id-1");
    expect(html).toContain("tc-id-card-identifiers");
    expect(html).not.toContain("tc-form-a4-portrait");
    expect(html).not.toContain("tc-document-sections");
  });

  it("renders the authoritative subject portrait for every photo-bearing type", () => {
    const expected = {
      patient_identity: {
        subject: "นายสมชาย ใจดี",
        file: "patient_somsak_a2e00e97.jpg",
      },
      staff_identity: {
        subject: "พญ.สิริรักษ์ รักษาดี",
        file: "doctor_napa_abd67502.jpg",
      },
      travel_document_verification: {
        subject: "นายสมชาย ใจดี",
        file: "patient_somsak_a2e00e97.jpg",
      },
    } as const;

    for (const documentType of photoBearingCredentialTypes) {
      const card = getCompleteWalletSeed().find(
        (item) => item.cardType === documentType,
      );
      expect(card, documentType).toBeTruthy();
      const html = renderToStaticMarkup(<CredentialDocument card={card!} />);

      expect(html, documentType).toContain(
        `data-document-type="${documentType}"`,
      );
      expect(html, documentType).toContain(expected[documentType].subject);
      expect(html, documentType).toContain(expected[documentType].file);
      expect(html, documentType).not.toContain("tc-patient-photo-missing");
    }
  });

  it("fails closed with a visible missing-photo state", () => {
    const card = cards.find((item) => item.cardType === "patient_identity")!;
    const credentialData = structuredClone(card.credentialData!);
    const queue: unknown[] = [credentialData];
    while (queue.length) {
      const value = queue.pop();
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const [key, child] of Object.entries(value)) {
        if (
          [
            "photoUrl",
            "avatarUrl",
            "imageUrl",
            "profileImageUrl",
            "portraitUrl",
          ].includes(key)
        ) {
          delete (value as Record<string, unknown>)[key];
        } else {
          queue.push(child);
        }
      }
    }
    const html = renderToStaticMarkup(
      <CredentialDocument
        card={{ ...card, credentialData, patientAvatarUrl: null }}
      />,
    );

    expect(html).toContain("tc-patient-photo-missing");
    expect(html).toContain("ไม่พบรูปใน credential");
  });

  it("never shows a person portrait on non-photo credential types", () => {
    for (const card of getCompleteWalletSeed().filter(
      (item) =>
        !photoBearingCredentialTypes.includes(
          item.cardType as (typeof photoBearingCredentialTypes)[number],
        ),
    )) {
      const html = renderToStaticMarkup(<CredentialDocument card={card} />);
      expect(html, card.cardType).not.toContain("tc-patient-photo");
    }
  });

  it("renders prescription claims as a semantic paper table", () => {
    const card = cards.find((item) => item.cardType === "prescription")!;
    const html = renderToStaticMarkup(<CredentialDocument card={card} />);

    expect(html).toContain("tc-clinical-paper");
    expect(html).toContain('data-document-form-factor="a4_portrait"');
    expect(html).toContain("tc-form-a4-portrait");
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain('<th scope="col"');
    expect(html).toContain("Metformin XR");
    expect(html).not.toContain("TrustCare Network");
  });

  it("uses the payer issuer as the letterhead for payer artifacts", () => {
    const card = cards.find(
      (item) => item.cardType === "insurance_eligibility",
    )!;
    const html = renderToStaticMarkup(<CredentialDocument card={card} />);

    expect(html).toContain("บริษัทประกันสุขภาพสากล เดโม จำกัด");
    expect(html).toContain("did:web:trustcare.network:payer:global-care-demo");
    expect(html).not.toContain("โรงพยาบาลทรัสต์แคร์ เซ็นทรัล");
  });

  it("does not invent issuer, patient, evidence, signatory or watermark data", () => {
    const card: WalletCard = {
      id: 991,
      cardType: "medical_certificate",
      displayName: "Source-only certificate",
      documentCategory: "clinical_summary",
      credentialId: "urn:vc:source-only",
      credentialStatus: "",
      credentialData: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: "urn:vc:source-only",
        type: ["VerifiableCredential", "MedicalCertificateCredential"],
        issuer: { id: "did:web:issuer.example" },
        credentialSubject: {
          id: "did:key:patient",
          certificate: { result: "source-backed result" },
        },
      },
      createdAt: "2026-07-10T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(<CredentialDocument card={card} />);

    expect(html).toContain("ไม่พบชื่อผู้ออกเอกสารในข้อมูลต้นฉบับ");
    expect(html).not.toContain("ผู้ใช้ TrustCare");
    expect(html).not.toContain("DEMO ONLY");
    expect(html).not.toContain("FHIR Evidence");
    expect(html).not.toContain("เจ้าหน้าที่ผู้มีสิทธิออกเอกสาร");
  });

  it("shows verified wording only for an explicit verifier result", () => {
    const card = cards.find((item) => item.cardType === "medical_certificate")!;
    const unchecked = renderToStaticMarkup(<CredentialDocument card={card} />);
    const checked = renderToStaticMarkup(
      <CredentialDocument
        card={card}
        verification={{
          verified: true,
          checklist: [
            { key: "proof", label: "Proof", ok: true },
            { key: "issuer", label: "Issuer", ok: true },
            { key: "status", label: "Status", ok: true },
            { key: "expiry", label: "Expiry", ok: true },
            { key: "policy", label: "Policy", ok: true },
          ],
        }}
      />,
    );

    expect(unchecked).not.toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
    expect(checked).toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
  });

  it("fails closed when any required verifier check is missing or fails", () => {
    const card = cards.find((item) => item.cardType === "medical_certificate")!;
    const baseChecks = [
      { key: "proof", ok: true },
      { key: "issuer", ok: true },
      { key: "status", ok: true },
      { key: "policy", ok: true },
    ];
    const missingExpiry = renderToStaticMarkup(
      <CredentialDocument
        card={card}
        verification={{ verified: true, checklist: baseChecks }}
      />,
    );
    const failedStatus = renderToStaticMarkup(
      <CredentialDocument
        card={card}
        verification={{
          verified: true,
          checklist: [
            ...baseChecks,
            { key: "expiry", ok: true },
            { key: "status", ok: false },
          ],
        }}
      />,
    );

    expect(missingExpiry).not.toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
    expect(failedStatus).not.toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
  });

  it("recognizes the fail-closed keys emitted by the public verifier", () => {
    const card = cards.find((item) => item.cardType === "medical_certificate")!;
    const publicVerifierChecks = [
      { key: "signature", ok: true },
      { key: "data_integrity", ok: true },
      { key: "issuer_key", ok: true },
      { key: "expiry", ok: true },
      { key: "evidence_issuer", ok: true },
      { key: "evidence_status", ok: true },
      { key: "evidence_policy", ok: true },
      { key: "evidence_binding", ok: true },
    ];
    const verified = renderToStaticMarkup(
      <CredentialDocument
        card={card}
        verification={{ verified: true, checklist: publicVerifierChecks }}
      />,
    );
    const failedEvidence = renderToStaticMarkup(
      <CredentialDocument
        card={card}
        verification={{
          verified: true,
          checklist: publicVerifierChecks.map((check) =>
            check.key === "evidence_status" ? { ...check, ok: false } : check,
          ),
        }}
      />,
    );

    expect(verified).toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
    expect(failedEvidence).not.toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );

    const jwtOnly = renderToStaticMarkup(
      <CredentialDocument
        card={card}
        verification={{
          verified: true,
          checklist: publicVerifierChecks.map((check) =>
            check.key === "data_integrity" ? { ...check, ok: false } : check,
          ),
        }}
      />,
    );
    expect(jwtOnly).toContain(
      "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
    );
  });

  it("renders a source-backed VP cover before a multi-document manifest", () => {
    const html = renderToStaticMarkup(
      <PresentationCoverDocument
        presentationId="urn:vp:public:123"
        holderDid="did:key:holder-123"
        purpose="cross-border referral"
        audience="did:web:receiver.example"
        publicUrl="https://wallet.example/verify/123"
        documents={[
          {
            id: "urn:vc:1",
            title: "ใบส่งต่อ",
            issuer: "โรงพยาบาลต้นทาง",
            status: "active",
          },
          {
            id: "urn:vc:2",
            title: "ผลตรวจ",
            issuer: "ห้องปฏิบัติการ",
            status: "active",
          },
        ]}
        verification={{
          verified: true,
          checklist: [
            { key: "signature", ok: true },
            { key: "data_integrity", ok: true },
            { key: "issuer_key", ok: true },
            { key: "expiry", ok: true },
            { key: "evidence_issuer", ok: true },
            { key: "evidence_status", ok: true },
            { key: "evidence_policy", ok: true },
            { key: "evidence_binding", ok: true },
          ],
        }}
      />,
    );

    expect(html).toContain("HEALTH DOCUMENT PRESENTATION");
    expect(html).toContain("urn:vp:public:123");
    expect(html).toContain("cross-border referral");
    expect(html).toContain("โรงพยาบาลต้นทาง");
    expect(html).toContain(
      "ตรวจ proof, issuer, status, expiry และ policy ผ่านครบแล้ว",
    );
  });
});

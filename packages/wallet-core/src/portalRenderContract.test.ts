import { describe, expect, it } from "vitest";
import {
  extractPortalRenderData,
  mergePortalRenderPayload,
  normalizePortalRenderSubject,
} from "./portalRenderContract";
import {
  credentialRenderModelFromCard,
  walletCardForCredentialRendering,
} from "./credentialRenderer";

describe("portal render contract", () => {
  it("normalizes data.humanDocument into the shared renderer subject", () => {
    const credential = {
      issuer: { id: "did:web:portal.example:hospital:tcc" },
    };
    const subject = {
      id: "Patient/demo-patient-001",
      document: { id: "legacy-document-id", status: "expired" },
      data: { humanDocument: {
        renderVersion: "trustcare-render-v1",
        renderData: {
          hospital: {
            code: "tcc",
            nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
            nameEn: "TrustCare Central Hospital",
          },
          patient: {
            fullNameTh: "นายสมชาย ใจดี",
            fullNameEn: "Mr. Somchai Jaidee",
            hn: "HN-TCC-00100001",
          },
          document: {
            id: "portal-document-id",
            no: "CP-TH-2026-000001",
            status: "active",
          },
        },
      } },
    };

    const normalized = normalizePortalRenderSubject(subject, credential);

    expect(normalized.hospital).toMatchObject({
      code: "tcc",
      nameEn: "TrustCare Central Hospital",
    });
    expect(normalized.patient).toMatchObject({ hn: "HN-TCC-00100001" });
    expect(normalized.document).toMatchObject({
      id: "portal-document-id",
      status: "active",
    });
    expect(normalized.issuer).toMatchObject({
      id: "did:web:portal.example:hospital:tcc",
      code: "tcc",
    });
  });

  it("uses the canonical renderData document payload", () => {
    const subject = {
      quotation: {
        packageName: "legacy package",
      },
      data: { humanDocument: {
        renderData: {
          document: {
            status: "active",
          },
          treatmentQuotation: {
            packageName: "ผ่าตัดเปลี่ยนข้อเข่า",
            estimatedTotal: 450000,
          },
        },
      } },
    };

    expect(extractPortalRenderData(subject)).toMatchObject({
      treatmentQuotation: {
        packageName: "ผ่าตัดเปลี่ยนข้อเข่า",
      },
    });
    expect(
      mergePortalRenderPayload(subject, ["treatmentQuotation", "quotation"]),
    ).toMatchObject({
      packageName: "ผ่าตัดเปลี่ยนข้อเข่า",
      estimatedTotal: 450000,
      document: { status: "active" },
    });
  });

  it("preserves additive optional render data without breaking the shared renderer", () => {
    const credential = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: "urn:uuid:future-compatible-render",
      type: ["VerifiableCredential", "PatientSummaryCredential"],
      issuer: { id: "did:web:portal.example:hospital:tcc" },
      credentialSubject: {
        id: "did:key:holder",
        documentType: "patient_summary",
        data: {
          humanDocument: {
            renderVersion: "trustcare-render-contract-v2",
            renderData: {
              document: {
                titleTh: "สรุปข้อมูลผู้ป่วย",
                titleEn: "Patient summary",
                status: "active",
              },
              patient: { fullNameEn: "Test Patient" },
              futureOptionalSection: {
                displayHint: "This field is not required by the current Wallet",
              },
            },
          },
        },
      },
    };

    const card = walletCardForCredentialRendering(credential);
    expect(card).not.toBeNull();
    const model = credentialRenderModelFromCard(card!);

    expect(model.documentType).toBe("patient_summary");
    expect(model.paper.title).toMatchObject({
      th: "สรุปข้อมูลผู้ป่วย",
      en: "Patient summary",
    });
    expect(model.subject.futureOptionalSection).toEqual({
      displayHint: "This field is not required by the current Wallet",
    });
  });
});

import type { PresentationHistoryItem, ShlPackageDetail, WalletCard, WalletCardsByCategory, WalletPresentationResponse } from "./models";
import { demoPresentationUrl } from "./qr";

const now = new Date("2026-07-04T09:41:00+07:00");

function isoOffset(days: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const demoPatient = {
  id: 6501001001,
  nameTh: "นายธนกร เรียนดี",
  nameEn: "Mr. Thanakorn Riandee",
  initials: "น",
  holderDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  avatarUrl: ""
};

export const demoWalletCards: WalletCard[] = [
  {
    id: 101,
    cardType: "patient_identity",
    displayName: "บัตรประจำตัวผู้ป่วย",
    displayNameEn: "Patient ID Card",
    documentCategory: "identity_and_access",
    credentialId: 9501,
    credentialStatus: "active",
    credentialType: "PatientIdentityCredential",
    issuerHospitalName: "TrustCare Central Hospital",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: demoPatient.holderDid,
    createdAt: isoOffset(-40),
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2030-07-01T09:00:00.000Z",
    credentialData: {
      credentialSubject: {
        id: demoPatient.holderDid,
        patient: {
          fullNameTh: demoPatient.nameTh,
          fullNameEn: demoPatient.nameEn,
          hn: "HN-6501001001",
          carepassId: "TC-6501001001",
          nationalId: "1100700123456",
          birthDate: "2003-05-15",
          status: "ปกติ",
          educationLevel: "ปริญญาตรี"
        },
        organization: {
          code: "TCC",
          name: "TrustCare Central Hospital",
          nameEn: "TrustCare Central Hospital"
        },
        humanDocument: {
          renderData: {
            hospital: {
              code: "TCC",
              nameTh: "TrustCare Central Hospital",
              nameEn: "TRUSTCARE HOSPITAL NETWORK",
              hcode: "TCC"
            },
            patient: {
              fullNameTh: demoPatient.nameTh,
              fullNameEn: demoPatient.nameEn,
              hn: "HN-6501001001",
              carepassId: "TC-6501001001"
            },
            document: {
              no: "TC-ID-6501001001",
              qrLabel: "VP"
            },
            issuer: {
              did: "did:web:trustcare.network:hospital:tcc"
            }
          }
        }
      }
    }
  },
  {
    id: 102,
    cardType: "patient_summary",
    displayName: "สรุปข้อมูลสุขภาพ",
    displayNameEn: "Patient Summary",
    documentCategory: "clinical_summary",
    credentialId: 9502,
    credentialStatus: "active",
    credentialType: "PatientSummaryCredential",
    issuerHospitalName: "TrustCare Central Hospital",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: demoPatient.holderDid,
    createdAt: isoOffset(-20),
    issuedAt: "2026-07-01T09:10:00.000Z",
    expiresAt: "2028-07-01T09:10:00.000Z",
    credentialData: {
      credentialSubject: {
        patient: { fullNameTh: demoPatient.nameTh, fullNameEn: demoPatient.nameEn },
        clinical: {
          conditions: [{ code: "E11", display: "เบาหวานชนิดที่ 2" }],
          allergies: ["Penicillin"],
          medications: [{ name: "Metformin 500mg" }]
        }
      }
    }
  },
  {
    id: 103,
    cardType: "prescription",
    displayName: "ใบสั่งยา",
    displayNameEn: "Prescription",
    documentCategory: "medication_and_pharmacy",
    credentialId: 9503,
    credentialStatus: "active",
    credentialType: "PrescriptionCredential",
    issuerHospitalName: "TrustCare Central Hospital",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: demoPatient.holderDid,
    createdAt: isoOffset(-12),
    issuedAt: "2026-07-02T07:00:00.000Z",
    expiresAt: "2026-08-02T07:00:00.000Z",
    credentialData: {
      credentialSubject: {
        patient: { fullNameTh: demoPatient.nameTh },
        prescriber: { name: "พญ. อริสา กลิ่นใจ", licenseNo: "MD-TH-12345" },
        fhir: {
          medicationRequests: [
            { name: "Metformin 500mg", instructions: "รับประทานครั้งละ 1 เม็ด หลังอาหารเช้า-เย็น" }
          ]
        }
      }
    }
  },
  {
    id: 104,
    cardType: "lab_result",
    displayName: "ผลตรวจ HbA1c",
    displayNameEn: "Lab Result",
    documentCategory: "diagnostics_and_results",
    credentialId: 9504,
    credentialStatus: "active",
    credentialType: "LabResultCredential",
    issuerHospitalName: "TrustCare Central Hospital",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    holderDid: demoPatient.holderDid,
    createdAt: isoOffset(-8),
    issuedAt: "2026-07-02T09:30:00.000Z",
    expiresAt: "2027-07-02T09:30:00.000Z",
    credentialData: {
      credentialSubject: {
        patient: { fullNameTh: demoPatient.nameTh },
        observations: [{ code: "4548-4", display: "HbA1c", value: "7.4", unit: "%" }]
      }
    }
  },
  {
    id: 105,
    cardType: "open_badge",
    displayName: "Open Badge",
    displayNameEn: "Open Badge",
    documentCategory: "education",
    credentialId: 9505,
    credentialStatus: "active",
    credentialType: "OpenBadgeCredential",
    issuerHospitalName: "Ramkhamhaeng University",
    issuerDid: "did:web:ru.ac.th",
    holderDid: demoPatient.holderDid,
    createdAt: isoOffset(-4),
    issuedAt: "2026-07-03T09:30:00.000Z",
    expiresAt: "2031-06-16T09:30:00.000Z",
    credentialData: {
      credentialSubject: {
        student: {
          nameTh: demoPatient.nameTh,
          nameEn: demoPatient.nameEn,
          studentId: "6501001001",
          faculty: "คณะนิติศาสตร์",
          major: "นิติศาสตร์"
        },
        badge: {
          title: "ประกาศนียบัตรรับรองความสามารถด้าน AI และ Machine Learning"
        }
      }
    }
  }
];

export const demoCardsByCategory: WalletCardsByCategory = demoWalletCards.reduce<WalletCardsByCategory>((acc, card) => {
  acc[card.documentCategory] ??= [];
  acc[card.documentCategory].push(card);
  return acc;
}, {});

export const demoHistory: PresentationHistoryItem[] = [
  {
    id: "hist_001",
    verifierName: "TrustCare Verifier",
    purpose: "single_document",
    presentationId: "vp_demo_6501001001",
    verificationResult: "valid",
    presentedAt: "2026-07-04T02:41:00.000Z"
  },
  {
    id: "hist_002",
    verifierName: "Hospital intake",
    purpose: "opd_visit",
    presentationId: "vp_service_opd_demo",
    verificationResult: "valid",
    presentedAt: "2026-07-03T05:10:00.000Z"
  }
];

export const demoShlPackages: ShlPackageDetail[] = [
  {
    id: 701,
    label: "OPD Visit Share Package",
    purpose: "patient_summary",
    context: "treatment",
    status: "active",
    viewerUrl: "https://trustcare.example.com/shl-viewer/demo",
    shlUrl: "shlink:/eyJ1cmwiOiJodHRwczovL3RydXN0Y2FyZS5leGFtcGxlLmNvbS9hcGkvc2hsL21hbmlmZXN0L2RlbW8iLCJrZXkiOiJkZW1vIn0",
    qrPayload: "shlink:/eyJ1cmwiOiJodHRwczovL3RydXN0Y2FyZS5leGFtcGxlLmNvbS9hcGkvc2hsL21hbmlmZXN0L2RlbW8iLCJrZXkiOiJkZW1vIn0",
    manifestCredentialId: "urn:trustcare:vc:shl:demo",
    presentationId: "vp_shl_demo_001",
    passcodeRequired: true,
    currentAccessCount: 1,
    maxAccessCount: 5,
    expiresAt: isoOffset(7),
    files: [{ id: "file_1", contentType: "application/fhir+json", hash: "sha256-demo" }],
    versions: [{ version: 1, status: "active" }],
    accessLogs: [{ recipient: "TrustCare verifier", at: isoOffset(-1) }],
    documentBundle: {
      bundleId: "bundle_demo_001",
      manifestVersion: 1,
      source: "derived_from_shl_manifest_and_fhir_bundle",
      bindingModel: "SHL + Manifest VC + Holder VP",
      standards: ["SMART Health Links", "FHIR R4", "W3C VC/VP"],
      status: "active",
      files: [{ manifestFileId: "file_1" }],
      documents: [
        {
          id: "doc_summary",
          sequence: 1,
          title: "Patient Summary",
          documentType: "patient_summary",
          category: "clinical_summary",
          status: "available_in_manifest",
          sourceRole: "issuer",
          fhirResource: "Bundle",
          contentType: "application/fhir+json",
          manifestVersion: 1,
          vcBinding: {
            recommendedCredentialType: "PatientSummaryCredential",
            manifestCredentialId: "urn:trustcare:vc:shl:demo",
            presentationId: "vp_shl_demo_001"
          },
          accessBinding: {
            passcodeRequired: true,
            expiresAt: isoOffset(7),
            currentAccessCount: 1,
            maxAccessCount: 5
          }
        }
      ]
    }
  }
];

export function createDemoPresentation(card: WalletCard, selectedFields: string[] = [], origin = "https://trustcare.example.com"): WalletPresentationResponse {
  const presentationId = `vp_demo_${card.id}_${Date.now().toString(36)}`;
  return {
    presentationId,
    format: "jwt-vp",
    mode: selectedFields.length ? "selective_disclosure" : "direct_vp",
    credentialCount: 1,
    selectedFields,
    expiresAt: isoOffset(1),
    qrData: demoPresentationUrl(origin, presentationId),
    transportDecision: {
      mode: "direct_vp",
      label: "Single-document VP",
      reason: "เหมาะสำหรับเอกสารเดี่ยวที่ต้องให้ verifier ตรวจสอบด้วย URL สั้น"
    },
    verificationChecklist: [
      { key: "issuer", label: "Issuer DID", ok: Boolean(card.issuerDid), detail: card.issuerDid ?? "" },
      { key: "holder", label: "Holder DID", ok: Boolean(card.holderDid), detail: card.holderDid ?? "" },
      { key: "status", label: "Credential active", ok: card.credentialStatus === "active" },
      { key: "expiry", label: "QR expiry", ok: true, detail: isoOffset(1) },
      { key: "consent", label: "Purpose-bound sharing", ok: true }
    ]
  };
}


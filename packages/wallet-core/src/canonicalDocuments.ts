import type { ReadinessContext, ReadinessRequirement, WalletCard } from "./models";

export const CANONICAL_DOCUMENT_TYPES = [
  "patient_identity",
  "consent_receipt",
  "mpi_link_certificate",
  "patient_summary",
  "allergy_alert",
  "immunization",
  "medical_certificate",
  "medication_summary",
  "prescription",
  "pharmacy_dispense",
  "lab_result",
  "diagnostic_report",
  "referral_vc",
  "discharge_summary",
  "insurance_eligibility",
  "claim_package",
  "claim_receipt",
  "travel_document_verification",
  "visa_support_letter",
  "quotation",
  "guarantee_letter",
  "shl_manifest",
  "sync_receipt",
  "appointment",
  "staff_identity"
] as const;

export type CanonicalDocumentType = (typeof CANONICAL_DOCUMENT_TYPES)[number];

export const CANONICAL_DOCUMENT_CATEGORIES = [
  "identity_and_access",
  "clinical_summary",
  "medication_and_pharmacy",
  "diagnostics_and_results",
  "care_transition",
  "claims_and_finance",
  "medical_tourism",
  "sharing_and_sync",
  "operations"
] as const;

export type CanonicalDocumentCategory = (typeof CANONICAL_DOCUMENT_CATEGORIES)[number];

export type WalletDocumentRecord = {
  id: string;
  ownerUserId?: string;
  holderDid?: string;
  documentType: CanonicalDocumentType;
  category: CanonicalDocumentCategory;
  title: string;
  titleEn?: string | null;
  status: "active" | "expired" | "revoked" | "superseded" | "unverified" | string;
  trustStatus: "issuer_signed" | "patient_provided_unverified" | "trust_artifact" | "pending_trustcare_binding";
  issuedAt?: string | null;
  expiresAt?: string | null;
  issuerDid?: string | null;
  issuerName?: string | null;
  sourceSystem?: string | null;
  credentialId: string;
  credentialData: Record<string, unknown>;
  documentReference: Record<string, unknown>;
  walletCard?: WalletCard;
};

export type SharePackageMode = "DirectVP" | "PurposeVP" | "StandardSHL" | "CertifiedSHLManifestPackage";

export type CanonicalServiceProfile = {
  context: ReadinessContext;
  label: string;
  labelEn: string;
  purpose: string;
  defaultSharePackage: SharePackageMode;
  recommendedWhenLarge?: SharePackageMode;
  requirements: ReadonlyArray<{
    key: string;
    label: string;
    labelEn: string;
    category: CanonicalDocumentCategory;
    required: boolean;
    documentTypes: ReadonlyArray<CanonicalDocumentType>;
    action: string;
    sourceHint: string;
  }>;
};

const aliases: Record<string, CanonicalDocumentType> = {
  identity: "patient_identity",
  patient_id: "patient_identity",
  patient_id_card: "patient_identity",
  staff: "staff_identity",
  staff_badge: "staff_identity",
  consent: "consent_receipt",
  mpi: "mpi_link_certificate",
  mpi_link: "mpi_link_certificate",
  summary: "patient_summary",
  clinical_summary: "patient_summary",
  allergy: "allergy_alert",
  allergies: "allergy_alert",
  medication: "medication_summary",
  current_medication: "medication_summary",
  dispense: "pharmacy_dispense",
  labs: "lab_result",
  lab: "lab_result",
  result: "lab_result",
  diagnostic: "diagnostic_report",
  referral: "referral_vc",
  discharge: "discharge_summary",
  coverage: "insurance_eligibility",
  insurance: "insurance_eligibility",
  claim: "claim_package",
  receipt: "claim_receipt",
  travel_document: "travel_document_verification",
  passport: "travel_document_verification",
  visa: "visa_support_letter",
  guarantee: "guarantee_letter",
  shl: "shl_manifest",
  manifest: "shl_manifest",
  sync: "sync_receipt"
};

export function normalizeDocumentType(value: string | null | undefined): CanonicalDocumentType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (isCanonicalDocumentType(normalized)) return normalized;
  return aliases[normalized] ?? null;
}

export function isCanonicalDocumentType(value: string): value is CanonicalDocumentType {
  return (CANONICAL_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isTrustArtifactDocumentType(value: string | null | undefined): boolean {
  const normalized = normalizeDocumentType(value);
  return normalized === "shl_manifest" || normalized === "sync_receipt";
}

export function walletDocumentRecordFromCard(card: WalletCard): WalletDocumentRecord {
  const documentType = normalizeDocumentType(card.cardType);
  if (!documentType) {
    throw new Error(`Unknown wallet document type: ${card.cardType}`);
  }
  const category = normalizeCategory(card.documentCategory);
  const credentialData = coerceCredentialData(card.credentialData);
  const documentReference = extractDocumentReference(credentialData);
  return {
    id: `${documentType}:${String(card.credentialId)}`,
    ownerUserId: card.ownerUserId ?? undefined,
    holderDid: card.holderDid ?? undefined,
    documentType,
    category,
    title: card.displayName,
    titleEn: card.displayNameEn,
    status: String(card.credentialStatus ?? "active"),
    trustStatus: isTrustArtifactDocumentType(documentType) ? "trust_artifact" : "issuer_signed",
    issuedAt: card.issuedAt,
    expiresAt: card.expiresAt,
    issuerDid: card.issuerDid,
    issuerName: card.issuerHospitalName,
    sourceSystem: card.sourceSystem,
    credentialId: String(card.credentialId),
    credentialData,
    documentReference,
    walletCard: card
  };
}

export const canonicalServiceProfiles: Record<ReadinessContext, CanonicalServiceProfile> = {
  opd_visit: {
    context: "opd_visit",
    label: "เตรียมเข้ารับบริการ OPD",
    labelEn: "OPD visit readiness",
    purpose: "ตรวจว่ามีเอกสารขั้นต่ำสำหรับลงทะเบียนและเริ่มรับบริการตรวจรักษา",
    defaultSharePackage: "PurposeVP",
    requirements: [
      requirement("identity", "ยืนยันตัวตน", "Patient identity", "identity_and_access", true, ["patient_identity"], "request_identity", "Hospital registration/HIS"),
      requirement("allergy", "ข้อมูลแพ้ยา/แพ้อาหาร", "Allergy alerts", "clinical_summary", true, ["allergy_alert"], "request_allergy", "HIS/EMR or patient upload"),
      requirement("medication", "รายการยาปัจจุบัน", "Current medications", "medication_and_pharmacy", true, ["medication_summary", "prescription"], "request_medication", "HIS/pharmacy"),
      requirement("summary", "สรุปสุขภาพล่าสุด", "Recent patient summary", "clinical_summary", false, ["patient_summary"], "request_patient_summary", "HIS/EMR"),
      requirement("coverage", "สิทธิรักษา/ประกัน", "Coverage or eligibility", "claims_and_finance", false, ["insurance_eligibility"], "request_coverage", "Payer/HIS")
    ]
  },
  emergency: {
    context: "emergency",
    label: "เหตุฉุกเฉิน",
    labelEn: "Emergency readiness",
    purpose: "เตรียมข้อมูลตัวตน แพ้ยา ยา และโรคสำคัญให้เข้าถึงได้รวดเร็ว",
    defaultSharePackage: "PurposeVP",
    requirements: [
      requirement("identity", "ยืนยันตัวตน", "Patient identity", "identity_and_access", true, ["patient_identity"], "request_identity", "Hospital registration/HIS"),
      requirement("allergy", "ข้อมูลแพ้ยา/แพ้อาหาร", "Allergy alerts", "clinical_summary", true, ["allergy_alert"], "request_allergy", "HIS/EMR or patient upload"),
      requirement("medication", "รายการยาปัจจุบัน", "Current medications", "medication_and_pharmacy", true, ["medication_summary", "prescription"], "request_medication", "HIS/pharmacy"),
      requirement("conditions", "โรคประจำตัว/วินิจฉัยสำคัญ", "Active conditions", "clinical_summary", true, ["patient_summary", "medical_certificate"], "request_patient_summary", "HIS/EMR")
    ]
  },
  referral: {
    context: "referral",
    label: "ส่งต่อผู้ป่วย",
    labelEn: "Referral readiness",
    purpose: "รวมใบส่งต่อและข้อมูลประกอบสำหรับโรงพยาบาลปลายทาง",
    defaultSharePackage: "CertifiedSHLManifestPackage",
    recommendedWhenLarge: "CertifiedSHLManifestPackage",
    requirements: [
      requirement("identity", "ยืนยันตัวตน", "Patient identity", "identity_and_access", true, ["patient_identity"], "request_identity", "Hospital registration/HIS"),
      requirement("referral", "ใบส่งต่อ", "Referral document", "care_transition", true, ["referral_vc"], "request_referral", "Referring hospital"),
      requirement("summary", "สรุปสุขภาพล่าสุด", "Patient summary", "clinical_summary", true, ["patient_summary"], "request_patient_summary", "HIS/EMR"),
      requirement("labs", "ผลตรวจที่เกี่ยวข้อง", "Relevant labs/results", "diagnostics_and_results", false, ["lab_result", "diagnostic_report"], "request_labs", "LIS/RIS/PACS"),
      requirement("coverage", "สิทธิรักษา/ประกัน", "Coverage or eligibility", "claims_and_finance", false, ["insurance_eligibility"], "request_coverage", "Payer/HIS")
    ]
  },
  cross_border: {
    context: "cross_border",
    label: "ส่งต่อข้ามเครือข่าย/ข้ามแดน",
    labelEn: "Cross-network readiness",
    purpose: "เตรียมเอกสารสองภาษาและหลักฐานที่ verifier ต่างเครือข่ายตรวจสอบได้",
    defaultSharePackage: "CertifiedSHLManifestPackage",
    recommendedWhenLarge: "CertifiedSHLManifestPackage",
    requirements: [
      requirement("identity", "ยืนยันตัวตน", "Patient identity", "identity_and_access", true, ["patient_identity"], "request_identity", "Hospital registration/HIS"),
      requirement("referral", "ใบส่งต่อ/เอกสารรับส่งต่อ", "Referral document", "care_transition", true, ["referral_vc"], "request_referral", "Referring partner"),
      requirement("summary", "สรุปสุขภาพสองภาษา", "Clinical summary", "clinical_summary", true, ["patient_summary"], "request_patient_summary", "HIS/EMR"),
      requirement("labs", "ผลตรวจประกอบ", "Supporting results", "diagnostics_and_results", false, ["lab_result", "diagnostic_report"], "request_labs", "LIS/RIS/PACS"),
      requirement("consent", "หลักฐานความยินยอม", "Consent receipt", "identity_and_access", true, ["consent_receipt"], "request_consent", "Contextual consent")
    ]
  },
  medical_tourist: {
    context: "medical_tourist",
    label: "เตรียมรักษาต่างประเทศ",
    labelEn: "Prepare care abroad",
    purpose: "เตรียมตัวตน เอกสารเดินทาง การเงิน และข้อมูลคลินิกสำหรับ pre-review",
    defaultSharePackage: "CertifiedSHLManifestPackage",
    recommendedWhenLarge: "CertifiedSHLManifestPackage",
    requirements: [
      requirement("identity", "ยืนยันตัวตน/พาสปอร์ต", "Identity/passport", "identity_and_access", true, ["patient_identity", "travel_document_verification"], "request_identity", "Passport/registration"),
      requirement("summary", "สรุปสุขภาพเพื่อ pre-review", "Clinical summary", "clinical_summary", true, ["patient_summary"], "request_patient_summary", "HIS/EMR"),
      requirement("quotation", "ใบเสนอราคา/แผนค่าใช้จ่าย", "Quotation", "medical_tourism", true, ["quotation"], "request_quotation", "International desk"),
      requirement("guarantee", "หนังสือรับรองค่าใช้จ่าย", "Guarantee letter", "medical_tourism", false, ["guarantee_letter"], "request_guarantee", "Payer/facilitator"),
      requirement("visa", "เอกสารประกอบวีซ่า", "Visa support", "medical_tourism", false, ["visa_support_letter", "travel_document_verification"], "request_visa", "International desk")
    ]
  },
  insurance_claim: {
    context: "insurance_claim",
    label: "เคลม/ประกัน",
    labelEn: "Insurance claim readiness",
    purpose: "เตรียมสิทธิประกัน ข้อมูลคลินิก และเอกสารประกอบเคลมสำหรับผู้จ่ายเงิน",
    defaultSharePackage: "CertifiedSHLManifestPackage",
    recommendedWhenLarge: "CertifiedSHLManifestPackage",
    requirements: [
      requirement("identity", "ยืนยันตัวตน", "Patient identity", "identity_and_access", true, ["patient_identity"], "request_identity", "Hospital registration/HIS"),
      requirement("coverage", "สิทธิประกัน", "Coverage eligibility", "claims_and_finance", true, ["insurance_eligibility"], "request_coverage", "Payer"),
      requirement("claim", "ชุดเอกสารเคลม", "Claim package", "claims_and_finance", true, ["claim_package"], "request_claim_package", "Claim center"),
      requirement("summary", "สรุปการรักษา", "Clinical summary", "clinical_summary", false, ["patient_summary", "medical_certificate"], "request_patient_summary", "HIS/EMR"),
      requirement("receipt", "ใบเสร็จ/หลักฐานค่าใช้จ่าย", "Receipt", "claims_and_finance", false, ["claim_receipt"], "request_receipt", "Finance")
    ]
  },
  pharmacy_dispense: {
    context: "pharmacy_dispense",
    label: "รับยา/ต่อยา",
    labelEn: "Pharmacy dispense readiness",
    purpose: "เตรียมใบสั่งยา รายการยา ประวัติแพ้ยา และตัวตนสำหรับรับยา",
    defaultSharePackage: "PurposeVP",
    requirements: [
      requirement("identity", "ยืนยันตัวตน", "Patient identity", "identity_and_access", true, ["patient_identity"], "request_identity", "Hospital registration/HIS"),
      requirement("prescription", "ใบสั่งยา", "Prescription", "medication_and_pharmacy", true, ["prescription"], "request_prescription", "Doctor/pharmacy"),
      requirement("medication", "รายการยาปัจจุบัน", "Medication summary", "medication_and_pharmacy", true, ["medication_summary"], "request_medication", "Pharmacy"),
      requirement("allergy", "ข้อมูลแพ้ยา", "Allergy alerts", "clinical_summary", true, ["allergy_alert"], "request_allergy", "HIS/EMR"),
      requirement("dispense", "ประวัติจ่ายยา", "Dispense history", "medication_and_pharmacy", false, ["pharmacy_dispense"], "request_dispense", "Pharmacy")
    ]
  }
};

export function readinessRequirementsFromProfiles(): Record<ReadinessContext, ReadinessRequirement[]> {
  return Object.fromEntries(
    Object.entries(canonicalServiceProfiles).map(([context, profile]) => [
      context,
      profile.requirements.map(item => ({
        key: item.key,
        label: item.label,
        labelEn: item.labelEn,
        category: item.category,
        required: item.required,
        cardTypes: [...item.documentTypes],
        action: item.action,
        sourceHint: item.sourceHint
      }))
    ])
  ) as Record<ReadinessContext, ReadinessRequirement[]>;
}

function requirement(
  key: string,
  label: string,
  labelEn: string,
  category: CanonicalDocumentCategory,
  required: boolean,
  documentTypes: CanonicalDocumentType[],
  action: string,
  sourceHint: string
) {
  return { key, label, labelEn, category, required, documentTypes, action, sourceHint } as const;
}

function normalizeCategory(value: string | null | undefined): CanonicalDocumentCategory {
  if (value && (CANONICAL_DOCUMENT_CATEGORIES as readonly string[]).includes(value)) {
    return value as CanonicalDocumentCategory;
  }
  return "operations";
}

function coerceCredentialData(value: WalletCard["credentialData"]): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential"],
    credentialSubject: {}
  };
}

function extractDocumentReference(credentialData: Record<string, unknown>): Record<string, unknown> {
  const subject = credentialData.credentialSubject;
  if (subject && typeof subject === "object" && !Array.isArray(subject)) {
    const documentReference = (subject as Record<string, unknown>).documentReference;
    if (documentReference && typeof documentReference === "object" && !Array.isArray(documentReference)) {
      return documentReference as Record<string, unknown>;
    }
  }
  const evidence = credentialData.evidence;
  if (Array.isArray(evidence)) {
    const item = evidence.find(entry => entry && typeof entry === "object" && String((entry as Record<string, unknown>).type).includes("DocumentReference"));
    const resource = item && typeof item === "object" ? (item as Record<string, unknown>).resource : undefined;
    if (resource && typeof resource === "object" && !Array.isArray(resource)) return resource as Record<string, unknown>;
  }
  return {
    resourceType: "DocumentReference",
    status: "current",
    docStatus: "preliminary"
  };
}

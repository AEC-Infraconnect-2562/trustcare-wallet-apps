import type { PresentationHistoryItem, ShlPackageDetail, WalletCard, WalletCardsByCategory } from "./models";
import { trustCarePortalPersonImages } from "./portalSyncData";
import { createTrustCareShlGatewayPublication } from "./shlGateway";

/**
 * TrustCare Wallet complete realistic seed data.
 *
 * This file is synthetic demo data only. It is designed to look and behave like
 * hospital-grade documents without containing real patient data.
 *
 * Suggested location in repo:
 *   packages/wallet-core/src/completeSeedData.ts
 *
 * Goal:
 * - Cover every canonical Wallet document type used by TrustCare Portal.
 * - Keep cardType/documentCategory/credentialType compatible with the current WalletCard model.
 * - Provide realistic credentialData payloads that CredentialDetailDialog, Store, Prepare, Verify,
 *   Export, OID4VCI, OID4VP, SHL, and offline flows can exercise.
 */

export type CompleteSeedDocumentCategory =
  | "identity_and_access"
  | "clinical_summary"
  | "medication_and_pharmacy"
  | "diagnostics_and_results"
  | "care_transition"
  | "claims_and_finance"
  | "medical_tourism"
  | "sharing_and_sync"
  | "operations";

export type CompleteSeedDocumentType =
  | "patient_identity"
  | "staff_identity"
  | "consent_receipt"
  | "mpi_link_certificate"
  | "patient_summary"
  | "allergy_alert"
  | "immunization"
  | "medical_certificate"
  | "medication_summary"
  | "prescription"
  | "pharmacy_dispense"
  | "lab_result"
  | "diagnostic_report"
  | "referral_vc"
  | "discharge_summary"
  | "insurance_eligibility"
  | "claim_package"
  | "claim_receipt"
  | "travel_document_verification"
  | "visa_support_letter"
  | "quotation"
  | "guarantee_letter"
  | "shl_manifest"
  | "sync_receipt"
  | "appointment";

export type CompleteSeedDocumentDefinition = {
  cardType: CompleteSeedDocumentType;
  credentialType: string;
  documentCategory: CompleteSeedDocumentCategory;
  displayName: string;
  displayNameEn: string;
  sourceSystem: string;
  fhirResources: string[];
  defaultValidityDays: number;
  sensitivity: "normal" | "restricted" | "high" | "critical";
  shareDefault: "allow" | "ask" | "deny";
  tags: string[];
};

export const completeSeedDocumentDefinitions: CompleteSeedDocumentDefinition[] = [
  {
    cardType: "patient_identity",
    credentialType: "PatientIdentityCredential",
    documentCategory: "identity_and_access",
    displayName: "บัตรประจำตัวผู้ป่วย",
    displayNameEn: "Patient Identity Card",
    sourceSystem: "Registration / MPI",
    fhirResources: ["Patient", "Organization", "RelatedPerson"],
    defaultValidityDays: 1460,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["identity", "registration", "mpi"]
  },
  {
    cardType: "staff_identity",
    credentialType: "StaffIdentityCredential",
    documentCategory: "identity_and_access",
    displayName: "บัตรประจำตัวเจ้าหน้าที่",
    displayNameEn: "Hospital Staff Identity",
    sourceSystem: "HR / IAM",
    fhirResources: ["Practitioner", "PractitionerRole", "Organization"],
    defaultValidityDays: 730,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["staff", "iam", "role"]
  },
  {
    cardType: "consent_receipt",
    credentialType: "ConsentReceiptCredential",
    documentCategory: "identity_and_access",
    displayName: "ใบรับรองความยินยอม",
    displayNameEn: "Consent Receipt",
    sourceSystem: "Consent Management",
    fhirResources: ["Consent", "Patient", "Organization"],
    defaultValidityDays: 90,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["consent", "pdpa", "purpose"]
  },
  {
    cardType: "mpi_link_certificate",
    credentialType: "MpiLinkCertificateCredential",
    documentCategory: "identity_and_access",
    displayName: "ใบรับรองการเชื่อมโยงตัวตน MPI",
    displayNameEn: "MPI Link Certificate",
    sourceSystem: "Master Patient Index",
    fhirResources: ["Patient", "Linkage", "Organization"],
    defaultValidityDays: 365,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["mpi", "identity-link", "cross-hospital"]
  },
  {
    cardType: "patient_summary",
    credentialType: "PatientSummaryCredential",
    documentCategory: "clinical_summary",
    displayName: "สรุปข้อมูลผู้ป่วย",
    displayNameEn: "Patient Summary",
    sourceSystem: "EMR / IPS Summary",
    fhirResources: ["Composition", "Patient", "Condition", "MedicationStatement", "AllergyIntolerance", "Observation"],
    defaultValidityDays: 365,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["ips", "summary", "problem-list"]
  },
  {
    cardType: "allergy_alert",
    credentialType: "AllergyAlertCredential",
    documentCategory: "clinical_summary",
    displayName: "ข้อมูลแพ้ยา/แพ้อาหาร",
    displayNameEn: "Allergy Alert",
    sourceSystem: "EMR Allergy List",
    fhirResources: ["AllergyIntolerance", "Patient"],
    defaultValidityDays: 730,
    sensitivity: "critical",
    shareDefault: "ask",
    tags: ["allergy", "safety", "emergency"]
  },
  {
    cardType: "immunization",
    credentialType: "ImmunizationCredential",
    documentCategory: "clinical_summary",
    displayName: "ประวัติวัคซีน",
    displayNameEn: "Immunization Record",
    sourceSystem: "Immunization Registry",
    fhirResources: ["Immunization", "Patient"],
    defaultValidityDays: 1825,
    sensitivity: "normal",
    shareDefault: "ask",
    tags: ["vaccine", "immunization"]
  },
  {
    cardType: "medical_certificate",
    credentialType: "MedicalCertificateCredential",
    documentCategory: "clinical_summary",
    displayName: "ใบรับรองแพทย์",
    displayNameEn: "Medical Certificate",
    sourceSystem: "Doctor Certificate Desk",
    fhirResources: ["Composition", "Condition", "Encounter", "Practitioner"],
    defaultValidityDays: 180,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["certificate", "doctor-note", "fit-for-work"]
  },
  {
    cardType: "medication_summary",
    credentialType: "MedicationSummaryCredential",
    documentCategory: "medication_and_pharmacy",
    displayName: "สรุปรายการยาปัจจุบัน",
    displayNameEn: "Medication Summary",
    sourceSystem: "Pharmacy / EMR",
    fhirResources: ["MedicationStatement", "Medication", "Patient"],
    defaultValidityDays: 180,
    sensitivity: "critical",
    shareDefault: "ask",
    tags: ["medication", "active-meds", "safety"]
  },
  {
    cardType: "prescription",
    credentialType: "PrescriptionCredential",
    documentCategory: "medication_and_pharmacy",
    displayName: "ใบสั่งยา",
    displayNameEn: "Prescription",
    sourceSystem: "CPOE / e-Prescription",
    fhirResources: ["MedicationRequest", "Patient", "Practitioner"],
    defaultValidityDays: 30,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["prescription", "pharmacy", "dispense"]
  },
  {
    cardType: "pharmacy_dispense",
    credentialType: "PharmacyDispenseCredential",
    documentCategory: "medication_and_pharmacy",
    displayName: "ประวัติการจ่ายยา",
    displayNameEn: "Pharmacy Dispense Record",
    sourceSystem: "Pharmacy Dispensing System",
    fhirResources: ["MedicationDispense", "MedicationRequest", "Patient"],
    defaultValidityDays: 365,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["pharmacy", "dispense", "adherence"]
  },
  {
    cardType: "lab_result",
    credentialType: "LabResultCredential",
    documentCategory: "diagnostics_and_results",
    displayName: "ผลตรวจทางห้องปฏิบัติการ",
    displayNameEn: "Laboratory Result",
    sourceSystem: "LIS",
    fhirResources: ["Observation", "DiagnosticReport", "Specimen"],
    defaultValidityDays: 365,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["lab", "lis", "observation"]
  },
  {
    cardType: "diagnostic_report",
    credentialType: "DiagnosticReportCredential",
    documentCategory: "diagnostics_and_results",
    displayName: "รายงานวินิจฉัย/ภาพถ่ายทางการแพทย์",
    displayNameEn: "Diagnostic Report",
    sourceSystem: "RIS / PACS / Diagnostic Unit",
    fhirResources: ["DiagnosticReport", "ImagingStudy", "Observation"],
    defaultValidityDays: 365,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["diagnostic", "radiology", "pacs"]
  },
  {
    cardType: "referral_vc",
    credentialType: "ReferralCredential",
    documentCategory: "care_transition",
    displayName: "ใบส่งต่อการรักษา",
    displayNameEn: "Referral Credential",
    sourceSystem: "Referral Center",
    fhirResources: ["ServiceRequest", "Task", "Composition", "Patient"],
    defaultValidityDays: 90,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["referral", "care-transition", "receiving-hospital"]
  },
  {
    cardType: "discharge_summary",
    credentialType: "DischargeSummaryCredential",
    documentCategory: "care_transition",
    displayName: "สรุปจำหน่ายผู้ป่วย",
    displayNameEn: "Discharge Summary",
    sourceSystem: "Inpatient EMR",
    fhirResources: ["Composition", "Encounter", "Condition", "Procedure", "MedicationRequest"],
    defaultValidityDays: 730,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["discharge", "inpatient", "care-plan"]
  },
  {
    cardType: "insurance_eligibility",
    credentialType: "CoverageEligibilityCredential",
    documentCategory: "claims_and_finance",
    displayName: "สิทธิประกันสุขภาพ",
    displayNameEn: "Insurance Eligibility",
    sourceSystem: "Payer / Coverage Eligibility",
    fhirResources: ["Coverage", "CoverageEligibilityResponse", "Patient"],
    defaultValidityDays: 365,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["coverage", "payer", "eligibility"]
  },
  {
    cardType: "claim_package",
    credentialType: "ClaimPackageCredential",
    documentCategory: "claims_and_finance",
    displayName: "ชุดเอกสารเคลม",
    displayNameEn: "Claim Package",
    sourceSystem: "Claim Center",
    fhirResources: ["Claim", "ClaimResponse", "ExplanationOfBenefit", "DocumentReference"],
    defaultValidityDays: 365,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["claim", "billing", "payer-submission"]
  },
  {
    cardType: "claim_receipt",
    credentialType: "ClaimReceiptCredential",
    documentCategory: "claims_and_finance",
    displayName: "ใบเสร็จ/หลักฐานค่าใช้จ่าย",
    displayNameEn: "Claim Receipt",
    sourceSystem: "Finance / Billing",
    fhirResources: ["Invoice", "PaymentNotice", "DocumentReference"],
    defaultValidityDays: 3650,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["receipt", "payment", "claim"]
  },
  {
    cardType: "travel_document_verification",
    credentialType: "TravelDocumentVerificationCredential",
    documentCategory: "medical_tourism",
    displayName: "เอกสารยืนยันตัวตนผู้ป่วยต่างชาติ",
    displayNameEn: "Travel Document Verification",
    sourceSystem: "International Patient Center",
    fhirResources: ["Patient", "DocumentReference", "RelatedPerson"],
    defaultValidityDays: 365,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["passport", "international", "medical-tourism"]
  },
  {
    cardType: "visa_support_letter",
    credentialType: "VisaSupportLetterCredential",
    documentCategory: "medical_tourism",
    displayName: "หนังสือประกอบการขอวีซ่ารักษาพยาบาล",
    displayNameEn: "Visa Support Letter",
    sourceSystem: "International Patient Center",
    fhirResources: ["DocumentReference", "Patient", "Organization"],
    defaultValidityDays: 180,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["visa", "international", "letter"]
  },
  {
    cardType: "quotation",
    credentialType: "QuotationCredential",
    documentCategory: "medical_tourism",
    displayName: "ใบเสนอราคา/แผนค่าใช้จ่าย",
    displayNameEn: "Treatment Quotation",
    sourceSystem: "International Finance Desk",
    fhirResources: ["DocumentReference", "ChargeItem", "Invoice"],
    defaultValidityDays: 45,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["quotation", "estimate", "medical-tourism"]
  },
  {
    cardType: "guarantee_letter",
    credentialType: "GuaranteeLetterCredential",
    documentCategory: "medical_tourism",
    displayName: "หนังสือรับรองค่าใช้จ่าย",
    displayNameEn: "Guarantee of Payment Letter",
    sourceSystem: "Payer / International Desk",
    fhirResources: ["Coverage", "Contract", "DocumentReference"],
    defaultValidityDays: 90,
    sensitivity: "restricted",
    shareDefault: "ask",
    tags: ["guarantee", "payer", "medical-tourism"]
  },
  {
    cardType: "shl_manifest",
    credentialType: "ShlManifestCredential",
    documentCategory: "sharing_and_sync",
    displayName: "Smart Health Link Manifest",
    displayNameEn: "SHL Manifest",
    sourceSystem: "Smart Health Links",
    fhirResources: ["Bundle", "DocumentReference", "Provenance"],
    defaultValidityDays: 14,
    sensitivity: "high",
    shareDefault: "ask",
    tags: ["shl", "manifest", "share-link"]
  },
  {
    cardType: "sync_receipt",
    credentialType: "SyncReceiptCredential",
    documentCategory: "sharing_and_sync",
    displayName: "หลักฐานการ Sync ข้อมูล",
    displayNameEn: "Sync Receipt",
    sourceSystem: "Integration Adapter",
    fhirResources: ["AuditEvent", "Provenance", "Bundle"],
    defaultValidityDays: 365,
    sensitivity: "normal",
    shareDefault: "allow",
    tags: ["sync", "audit", "integration"]
  },
  {
    cardType: "appointment",
    credentialType: "AppointmentCredential",
    documentCategory: "operations",
    displayName: "ใบนัดหมาย",
    displayNameEn: "Appointment",
    sourceSystem: "Appointment Scheduling",
    fhirResources: ["Appointment", "Schedule", "Patient", "Practitioner"],
    defaultValidityDays: 120,
    sensitivity: "normal",
    shareDefault: "ask",
    tags: ["appointment", "schedule", "opd"]
  }
];

const issuedAt = "2026-07-01T02:30:00.000Z";
const baseCreatedAt = "2026-07-01T02:35:00.000Z";

const completePatient = {
  ownerUserId: "demo-patient-complete-001",
  patientId: 9900700100017,
  holderDid: "did:key:z6MkhTrustCareCompletePatient001",
  fullNameTh: "นายสมชาย ใจดี",
  fullNameEn: "Mr. Somchai Jaidee",
  birthDate: "1978-03-15",
  gender: "male",
  nationality: "THA",
  thaiIdMasked: "1-1005-***45-67-8",
  passportNo: "M12345678",
  carepassId: "CP-TH-2026-COMPLETE-001",
  hn: "HN-TCC-670001",
  phone: "089-123-4567",
  email: "somchai.jaidee.demo@example.test",
  address: "99/9 ถนนสาทร แขวงยานนาวา เขตสาทร กรุงเทพมหานคร 10120",
  avatarUrl: trustCarePortalPersonImages.demoPatient001
} as const;

const completeStaff = {
  ownerUserId: "demo-staff-complete-001",
  staffId: "STAFF-TCC-MD-14527",
  holderDid: "did:key:z6MkhTrustCareStaffDoctor001",
  fullNameTh: "พญ.สิริรักษ์ รักษาดี",
  fullNameEn: "Dr. Sirirak Raksadee",
  roleTh: "อายุรแพทย์โรคหัวใจ",
  roleEn: "Cardiologist",
  licenseNo: "ว.14527",
  department: "Cardiology Clinic",
  phone: "02-123-4567",
  email: "sirirak.r@trustcare-central.example.test",
  avatarUrl: trustCarePortalPersonImages.doctorFemale
} as const;

const hospital = {
  code: "TCC",
  nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
  nameEn: "TrustCare Central Hospital",
  issuerDid: "did:web:trustcare.network:hospital:tcc",
  licenseNo: "HOS-TCC-2566-001",
  address: "188 TrustCare Tower, Bangkok 10120",
  phone: "02-555-0100"
} as const;

const partnerHospital = {
  code: "TCP",
  nameTh: "โรงพยาบาลทรัสต์แคร์ ภูเก็ต อินเตอร์เนชันแนล",
  nameEn: "TrustCare Phuket International Hospital",
  issuerDid: "did:web:trustcare.network:hospital:tcp"
} as const;

const payer = {
  nameTh: "บริษัทประกันสุขภาพสากล เดโม จำกัด",
  nameEn: "Global Care Insurance Demo Co., Ltd.",
  policyNo: "GCI-DEMO-TH-2026-7788",
  memberNo: "M-GCI-00045521",
  plan: "International Comprehensive Plus",
  preAuthNo: "PA-2026-0701-00091"
} as const;

const practitioner = {
  fullNameTh: completeStaff.fullNameTh,
  fullNameEn: completeStaff.fullNameEn,
  licenseNo: completeStaff.licenseNo,
  role: completeStaff.roleEn,
  department: completeStaff.department,
  organization: hospital.nameEn
} as const;

const clinicalBaseline = {
  encounterId: "ENC-TCC-20260701-00077",
  encounterClass: "OPD",
  visitDate: "2026-07-01",
  primaryDiagnosis: { code: "E11.9", system: "ICD-10", display: "Type 2 diabetes mellitus without complications" },
  secondaryDiagnoses: [
    { code: "I10", system: "ICD-10", display: "Essential hypertension" },
    { code: "E78.5", system: "ICD-10", display: "Hyperlipidemia" }
  ],
  allergies: [
    {
      code: "7980",
      system: "RxNorm",
      substance: "Penicillin",
      reaction: "ผื่นลมพิษและหายใจลำบาก",
      severity: "severe",
      verificationStatus: "confirmed",
      recordedDate: "2024-02-12"
    },
    {
      code: "1096450",
      system: "RxNorm",
      substance: "Iodinated contrast media",
      reaction: "ผื่นแดงทั่วตัว",
      severity: "moderate",
      verificationStatus: "confirmed",
      recordedDate: "2025-10-18"
    }
  ],
  medications: [
    { name: "Metformin XR", strength: "500 mg", route: "PO", dose: "1 tab", frequency: "bid pc", rxNorm: "860975", atc: "A10BA02" },
    { name: "Losartan", strength: "50 mg", route: "PO", dose: "1 tab", frequency: "od pc", rxNorm: "52175", atc: "C09CA01" },
    { name: "Atorvastatin", strength: "20 mg", route: "PO", dose: "1 tab", frequency: "hs", rxNorm: "617318", atc: "C10AA05" }
  ]
} as const;

export const completeWalletSeedCards: WalletCard[] = [
  makePatientCard("patient_identity", 1, {
    credentialSubject: {
      patient: patientProfile(),
      identifiers: [
        { system: "https://trustcare.network/id/carepass", value: completePatient.carepassId },
        { system: "https://trustcare.network/id/hn", value: completePatient.hn },
        { system: "https://trustcare.network/id/thai-national-id", value: completePatient.thaiIdMasked, masked: true }
      ],
      emergencyContact: { name: "นางสายใจ ใจดี", relationship: "spouse", phone: "089-987-6543" },
      registration: { facility: hospital.nameTh, firstRegisteredAt: "2023-04-18T03:20:00.000Z", active: true }
    },
    expiresAt: "2030-07-01T16:59:59.000Z",
    pinned: true
  }),
  makeStaffCard(2, {
    credentialSubject: {
      staff: {
        id: completeStaff.staffId,
        fullNameTh: completeStaff.fullNameTh,
        fullNameEn: completeStaff.fullNameEn,
        roleTh: completeStaff.roleTh,
        roleEn: completeStaff.roleEn,
        department: completeStaff.department,
        licenseNo: completeStaff.licenseNo,
        email: completeStaff.email,
        phone: completeStaff.phone,
        photoUrl: completeStaff.avatarUrl
      },
      organization: organizationProfile(),
      privileges: ["credential_checker", "clinical_viewer", "service_verifier"],
      accessLevel: "hospital_clinical_staff"
    },
    expiresAt: "2028-07-01T16:59:59.000Z"
  }),
  makePatientCard("consent_receipt", 3, {
    credentialSubject: {
      patient: patientProfile(),
      consent: {
        consentId: "CNS-TCC-20260701-00045",
        status: "active",
        scope: ["identity", "allergy", "medication", "patient_summary", "lab_result", "referral"],
        purpose: "treatment_and_referral",
        grantedTo: [hospital.nameEn, partnerHospital.nameEn],
        legalBasis: ["patient_consent", "treatment_continuity"],
        pdpaControls: ["minimum_necessary", "purpose_bound", "expiry_bound", "revocable"],
        grantedAt: "2026-07-01T02:10:00.000Z",
        expiresAt: "2026-09-29T16:59:59.000Z",
        revokedAt: null,
        attestedBy: completePatient.holderDid
      }
    },
    expiresAt: "2026-09-29T16:59:59.000Z"
  }),
  makePatientCard("mpi_link_certificate", 4, {
    credentialSubject: {
      patient: patientProfile(),
      mpi: {
        goldenRecordId: "MPI-TH-TC-0000007731",
        confidence: 0.992,
        matchingPolicy: "name_dob_phone_national_id_masked",
        linkedIdentifiers: [
          { organization: hospital.nameEn, hn: completePatient.hn, linkStatus: "verified" },
          { organization: partnerHospital.nameEn, hn: "HN-TCP-680021", linkStatus: "verified" },
          { organization: "TrustCare Chiang Mai Cross-Border Hospital", hn: "HN-TCM-660178", linkStatus: "probable" }
        ],
        reviewedBy: "MPI Steward Team",
        reviewedAt: "2026-06-20T04:12:00.000Z"
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z"
  }),
  makePatientCard("patient_summary", 5, {
    credentialSubject: {
      patient: patientProfile(),
      summary: {
        compositionId: "Composition/ips-TCC-20260701-00077",
        title: "International Patient Summary - TrustCare OPD",
        date: "2026-07-01T02:30:00.000Z",
        author: practitioner,
        conditions: [clinicalBaseline.primaryDiagnosis, ...clinicalBaseline.secondaryDiagnoses],
        allergies: clinicalBaseline.allergies,
        medications: clinicalBaseline.medications,
        vitalSigns: [
          { code: "8480-6", display: "Systolic blood pressure", value: 132, unit: "mmHg", interpretation: "borderline" },
          { code: "8462-4", display: "Diastolic blood pressure", value: 82, unit: "mmHg" },
          { code: "29463-7", display: "Body weight", value: 74.5, unit: "kg" },
          { code: "8302-2", display: "Body height", value: 170, unit: "cm" }
        ],
        carePlan: "ควบคุมระดับน้ำตาลและความดันต่อเนื่อง นัดติดตาม 3 เดือน"
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z",
    pinned: true
  }),
  makePatientCard("allergy_alert", 6, {
    credentialSubject: {
      patient: patientProfile(),
      allergyIntolerances: clinicalBaseline.allergies,
      emergencyInstruction: "Avoid penicillin-class antibiotics. Use contrast media premedication protocol if imaging with contrast is unavoidable.",
      lastReviewedAt: "2026-07-01T02:20:00.000Z",
      reviewedBy: practitioner
    },
    expiresAt: "2028-07-01T16:59:59.000Z",
    pinned: true
  }),
  makePatientCard("immunization", 7, {
    credentialSubject: {
      patient: patientProfile(),
      immunizations: [
        { vaccineCode: "208", system: "CVX", display: "COVID-19 mRNA vaccine", occurrenceDate: "2024-11-15", lotNumber: "CVX208-DEMO-771", performer: hospital.nameEn },
        { vaccineCode: "141", system: "CVX", display: "Influenza seasonal injectable", occurrenceDate: "2025-10-08", lotNumber: "FLU25-DEMO-220", performer: hospital.nameEn },
        { vaccineCode: "45", system: "CVX", display: "Hepatitis B vaccine", occurrenceDate: "2023-05-12", lotNumber: "HBV-DEMO-901", performer: hospital.nameEn }
      ],
      registryStatus: "complete_for_adult_baseline"
    },
    expiresAt: "2031-07-01T16:59:59.000Z"
  }),
  makePatientCard("medical_certificate", 8, {
    credentialSubject: {
      patient: patientProfile(),
      certificate: {
        certificateNo: "MC-TCC-20260701-0091",
        type: "fit_for_work_and_travel",
        diagnosis: "Follow-up type 2 diabetes and hypertension, stable condition",
        examinationDate: "2026-07-01",
        result: "ผู้ป่วยมีอาการคงที่ สามารถเดินทางและทำงานทั่วไปได้",
        restrictions: "หลีกเลี่ยงการอดอาหารเป็นเวลานาน และพกยาประจำตัวตลอดการเดินทาง",
        validUntil: "2026-09-30",
        certifyingPractitioner: practitioner
      }
    },
    expiresAt: "2026-09-30T16:59:59.000Z"
  }),
  makePatientCard("medication_summary", 9, {
    credentialSubject: {
      patient: patientProfile(),
      medicationSummary: {
        currentAsOf: "2026-07-01",
        medications: clinicalBaseline.medications.map((medication, index) => ({
          ...medication,
          status: "active",
          startDate: index === 0 ? "2023-05-01" : "2024-02-01",
          indication: index === 0 ? "E11.9" : index === 1 ? "I10" : "E78.5"
        })),
        medicationReconciliation: { performedAt: "2026-07-01T02:25:00.000Z", performedBy: "ภญ.สุธิดา จ่ายยาดี", discrepancies: [] }
      }
    },
    expiresAt: "2027-01-01T16:59:59.000Z",
    pinned: true
  }),
  makePatientCard("prescription", 10, {
    credentialSubject: {
      patient: patientProfile(),
      prescription: {
        prescriptionNo: "RX-TCC-20260701-01882",
        encounterId: clinicalBaseline.encounterId,
        authoredOn: "2026-07-01T03:05:00.000Z",
        prescriber: practitioner,
        items: clinicalBaseline.medications.map((medication, index) => ({
          medicationName: medication.name,
          strength: medication.strength,
          dosageInstruction: `${medication.dose} ${medication.frequency}`,
          quantity: index === 0 ? 180 : 90,
          unit: "tablet",
          refills: 1,
          substitutionAllowed: true
        })),
        note: "จ่ายยาครั้งละ 90 วัน นัดติดตาม HbA1c"
      }
    },
    expiresAt: "2026-07-31T16:59:59.000Z"
  }),
  makePatientCard("pharmacy_dispense", 11, {
    credentialSubject: {
      patient: patientProfile(),
      medicationDispense: {
        dispenseNo: "DSP-TCC-20260701-04219",
        basedOnPrescription: "RX-TCC-20260701-01882",
        dispensedAt: "2026-07-01T04:10:00.000Z",
        dispenser: { name: "ภญ.สุธิดา จ่ายยาดี", licenseNo: "ภ.23451", organization: hospital.nameEn },
        items: clinicalBaseline.medications.map(medication => ({ medicationName: medication.name, strength: medication.strength, quantityDispensed: 90, daysSupply: 90, lotNo: `LOT-${medication.atc}-2026A` })),
        counseling: ["รับประทานยาสม่ำเสมอ", "หากมีอาการแพ้ยาให้หยุดยาและติดต่อโรงพยาบาลทันที"]
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z"
  }),
  makePatientCard("lab_result", 12, {
    credentialSubject: {
      patient: patientProfile(),
      labReport: {
        reportNo: "LAB-TCC-20260701-000377",
        specimenCollectedAt: "2026-07-01T01:45:00.000Z",
        reportedAt: "2026-07-01T03:20:00.000Z",
        laboratory: "TrustCare Central Laboratory",
        status: "final",
        observations: [
          { code: "4548-4", system: "LOINC", display: "Hemoglobin A1c/Hemoglobin.total in Blood", value: 7.2, unit: "%", referenceRange: "4.0-5.6", interpretation: "H" },
          { code: "2345-7", system: "LOINC", display: "Glucose [Mass/volume] in Serum or Plasma", value: 138, unit: "mg/dL", referenceRange: "70-99", interpretation: "H" },
          { code: "2160-0", system: "LOINC", display: "Creatinine [Mass/volume] in Serum or Plasma", value: 0.92, unit: "mg/dL", referenceRange: "0.67-1.17", interpretation: "N" },
          { code: "2093-3", system: "LOINC", display: "Cholesterol [Mass/volume] in Serum or Plasma", value: 176, unit: "mg/dL", referenceRange: "<200", interpretation: "N" },
          { code: "2089-1", system: "LOINC", display: "LDL Cholesterol", value: 96, unit: "mg/dL", referenceRange: "<100", interpretation: "N" }
        ]
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z"
  }),
  makePatientCard("diagnostic_report", 13, {
    credentialSubject: {
      patient: patientProfile(),
      diagnosticReport: {
        reportNo: "DR-TCC-20260701-00088",
        category: "cardiology",
        effectiveDateTime: "2026-07-01T03:40:00.000Z",
        status: "final",
        modality: "ECG",
        conclusion: "Normal sinus rhythm. No acute ischemic change detected.",
        observations: [
          { code: "ECG-RATE", display: "Heart rate", value: 72, unit: "bpm" },
          { code: "ECG-QTC", display: "QTc interval", value: 416, unit: "ms" }
        ],
        imagingStudy: { accessionNo: "ACC-TCC-ECG-20260701-91", pacsStudyUid: "1.2.764.2026.7.1.91.demo" },
        reportingPractitioner: practitioner
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z"
  }),
  makePatientCard("referral_vc", 14, {
    credentialSubject: {
      patient: patientProfile(),
      referral: {
        referralNo: "REF-TCC-TCP-20260701-00021",
        status: "active",
        priority: "routine",
        fromHospital: hospital.nameEn,
        toHospital: partnerHospital.nameEn,
        requestedService: "Cardiology follow-up before travel",
        reason: "Type 2 diabetes and hypertension follow-up; patient requests partner hospital review during Phuket travel.",
        clinicalNotes: "Stable OPD patient. Please review medication adherence and blood pressure log.",
        attachments: ["patient_summary", "lab_result", "diagnostic_report", "medication_summary", "consent_receipt"],
        requestedBy: practitioner,
        authoredOn: "2026-07-01T04:25:00.000Z"
      }
    },
    expiresAt: "2026-09-29T16:59:59.000Z"
  }),
  makePatientCard("discharge_summary", 15, {
    credentialSubject: {
      patient: patientProfile(),
      dischargeSummary: {
        admissionNo: "ADM-TCC-20260518-00042",
        admissionDate: "2026-05-18",
        dischargeDate: "2026-05-20",
        dischargeDisposition: "home",
        principalDiagnosis: { code: "R07.9", system: "ICD-10", display: "Chest pain, unspecified" },
        secondaryDiagnoses: [clinicalBaseline.primaryDiagnosis, ...clinicalBaseline.secondaryDiagnoses],
        hospitalCourse: "Observed for atypical chest pain. Serial cardiac enzymes negative. ECG without acute ischemic change.",
        procedures: [{ code: "93000", system: "CPT", display: "Electrocardiogram" }],
        dischargeMedications: clinicalBaseline.medications,
        followUp: "Cardiology clinic follow-up in 6 weeks"
      }
    },
    expiresAt: "2028-07-01T16:59:59.000Z"
  }),
  makePatientCard("insurance_eligibility", 16, {
    credentialSubject: {
      patient: patientProfile(),
      coverage: {
        payer,
        status: "eligible",
        coveragePeriod: { start: "2026-01-01", end: "2026-12-31" },
        network: "TrustCare Preferred Network",
        benefitSummary: [
          { benefit: "OPD", limit: "THB 80,000/year", remaining: "THB 52,340" },
          { benefit: "IPD", limit: "THB 3,000,000/year", remaining: "THB 2,850,000" },
          { benefit: "Medication", limit: "included", remaining: "policy terms" }
        ],
        lastCheckedAt: "2026-07-01T02:50:00.000Z"
      }
    },
    expiresAt: "2026-12-31T16:59:59.000Z"
  }),
  makePatientCard("claim_package", 17, {
    credentialSubject: {
      patient: patientProfile(),
      claimPackage: {
        claimNo: "CLM-TCC-20260701-00551",
        payer: payer.nameEn,
        policyNo: payer.policyNo,
        encounterId: clinicalBaseline.encounterId,
        claimType: "OPD",
        diagnosisCodes: [clinicalBaseline.primaryDiagnosis.code, "I10", "E78.5"],
        serviceLines: [
          { code: "99214", description: "OPD specialist consultation", quantity: 1, amount: 1200, currency: "THB" },
          { code: "LAB-HBA1C", description: "HbA1c", quantity: 1, amount: 420, currency: "THB" },
          { code: "MED-90D", description: "90-day chronic medication supply", quantity: 1, amount: 3250, currency: "THB" }
        ],
        totalAmount: 4870,
        currency: "THB",
        attachments: ["medical_certificate", "lab_result", "prescription", "claim_receipt"],
        status: "ready_for_submission"
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z"
  }),
  makePatientCard("claim_receipt", 18, {
    credentialSubject: {
      patient: patientProfile(),
      receipt: {
        receiptNo: "RCPT-TCC-20260701-07339",
        invoiceNo: "INV-TCC-20260701-06301",
        paidAt: "2026-07-01T04:30:00.000Z",
        cashier: "FIN-TCC-009",
        items: [
          { description: "OPD specialist consultation", amount: 1200, currency: "THB" },
          { description: "Laboratory HbA1c and chemistry", amount: 920, currency: "THB" },
          { description: "Medication supply", amount: 3250, currency: "THB" }
        ],
        grossAmount: 5370,
        discount: 500,
        netAmount: 4870,
        paymentMethod: "credit_card_demo",
        payerResponsibility: 0,
        insurerResponsibility: 4870
      }
    },
    expiresAt: "2036-07-01T16:59:59.000Z"
  }),
  makePatientCard("travel_document_verification", 19, {
    credentialSubject: {
      patient: patientProfile(),
      travelDocument: {
        passportNoMasked: "M12****78",
        issuingCountry: "THA",
        nationality: completePatient.nationality,
        verifiedAgainst: "passport_scan_and_hospital_registration",
        verifiedAt: "2026-06-25T03:15:00.000Z",
        verifiedBy: "International Patient Center",
        intendedTreatmentCountry: "THA",
        travelWindow: { arrival: "2026-08-10", departure: "2026-08-18" }
      }
    },
    expiresAt: "2027-06-25T16:59:59.000Z"
  }),
  makePatientCard("visa_support_letter", 20, {
    credentialSubject: {
      patient: patientProfile(),
      visaSupportLetter: {
        letterNo: "VSL-TCP-20260701-00012",
        issuingOrganization: partnerHospital.nameEn,
        purpose: "Medical consultation and cardiology follow-up",
        proposedVisitPeriod: { start: "2026-08-10", end: "2026-08-18" },
        receivingDepartment: "International Patient Center",
        responsiblePhysician: practitioner,
        note: "This demo letter supports travel planning only and is not a government visa approval."
      }
    },
    issuerOverride: partnerHospital,
    expiresAt: "2026-12-31T16:59:59.000Z"
  }),
  makePatientCard("quotation", 21, {
    credentialSubject: {
      patient: patientProfile(),
      quotation: {
        quotationNo: "QT-TCP-20260701-00033",
        issuingOrganization: partnerHospital.nameEn,
        packageName: "Cardiology follow-up and metabolic risk review",
        currency: "THB",
        validUntil: "2026-08-15",
        lineItems: [
          { description: "Specialist consultation", amount: 2500 },
          { description: "ECG", amount: 900 },
          { description: "Laboratory metabolic panel", amount: 2400 },
          { description: "Care coordinator service", amount: 1500 }
        ],
        estimatedTotal: 7300,
        exclusions: ["Emergency care", "Unplanned admission", "Non-formulary medication"]
      }
    },
    issuerOverride: partnerHospital,
    expiresAt: "2026-08-15T16:59:59.000Z"
  }),
  makePatientCard("guarantee_letter", 22, {
    credentialSubject: {
      patient: patientProfile(),
      guaranteeLetter: {
        guaranteeNo: "GL-GCI-20260701-90012",
        payer: payer.nameEn,
        policyNo: payer.policyNo,
        preAuthNo: payer.preAuthNo,
        coveredProvider: partnerHospital.nameEn,
        coveredServices: ["Cardiology consultation", "ECG", "Laboratory metabolic panel"],
        guaranteeLimit: { amount: 30000, currency: "THB" },
        validFrom: "2026-08-01",
        validUntil: "2026-08-31",
        conditions: ["Member eligibility active on service date", "Services medically necessary", "Original receipt required"]
      }
    },
    expiresAt: "2026-08-31T16:59:59.000Z"
  }),
  makePatientCard("shl_manifest", 23, {
    credentialSubject: {
      patient: patientProfile(),
      shlManifest: {
        shlId: "shl_TCC_20260701_00045",
        purpose: "opd_visit",
        label: "OPD readiness package for TrustCare partner verification",
        passcodeRequired: true,
        maxAccessCount: 5,
        currentAccessCount: 1,
        expiresAt: "2026-07-15T16:59:59.000Z",
        manifestHash: "sha256:demo-manifest-9a3f1bd45c0f",
        sourceBundleHash: "sha256:demo-fhir-bundle-4883c9e8af11",
        files: [
          { fileId: "file-ips-summary", contentType: "application/fhir+json", documentTypes: ["patient_summary", "allergy_alert", "medication_summary"] },
          { fileId: "file-lab-result", contentType: "application/fhir+json", documentTypes: ["lab_result"] },
          { fileId: "file-vp-binding", contentType: "application/vp+jwt", documentTypes: ["shl_manifest"] }
        ]
      }
    },
    expiresAt: "2026-07-15T16:59:59.000Z"
  }),
  makePatientCard("sync_receipt", 24, {
    credentialSubject: {
      patient: patientProfile(),
      syncReceipt: {
        syncId: "SYNC-TCC-PXH-20260701-00019",
        sourceSystem: "TrustCare Portal",
        targetSystem: "TrustCare Wallet Native",
        syncDirection: "portal_to_wallet",
        startedAt: "2026-07-01T04:42:00.000Z",
        completedAt: "2026-07-01T04:42:08.000Z",
        status: "success",
        objectCounts: { vc: 24, vp: 2, shl: 1, documentReference: 6 },
        checksum: "sha256:demo-sync-aee6f1bca772",
        adapterVersion: "trustcare-wallet-adapter-demo-2026.07"
      }
    },
    expiresAt: "2027-07-01T16:59:59.000Z"
  }),
  makePatientCard("appointment", 25, {
    credentialSubject: {
      patient: patientProfile(),
      appointment: {
        appointmentId: "APT-TCP-20260812-0900-CARD",
        status: "booked",
        serviceType: "Cardiology follow-up",
        start: "2026-08-12T02:00:00.000Z",
        end: "2026-08-12T02:30:00.000Z",
        timezone: "Asia/Bangkok",
        location: "TrustCare Phuket International Hospital, International Clinic, Room IC-03",
        practitioner,
        checkinInstruction: "กรุณามาถึงก่อนเวลานัด 20 นาที พร้อมแสดง VP QR, Standard SHL หรือ Certified SHL + Manifest VP จาก Wallet",
        requiredDocuments: ["patient_identity", "patient_summary", "medication_summary", "lab_result", "insurance_eligibility"]
      }
    },
    issuerOverride: partnerHospital,
    expiresAt: "2026-08-12T03:00:00.000Z",
    pinned: true
  })
];

export const completeWalletPresentationHistory: PresentationHistoryItem[] = [
  {
    id: "hist-complete-001",
    verifierName: "TrustCare Phuket International Hospital",
    purpose: "opd_visit",
    presentationId: "vp_complete_opd_20260701_001",
    verificationResult: "valid",
    presentedAt: "2026-07-01T05:00:00.000Z"
  },
  {
    id: "hist-complete-002",
    verifierName: "Global Care Insurance Demo",
    purpose: "insurance_claim",
    presentationId: "vp_complete_claim_20260701_001",
    verificationResult: "valid",
    presentedAt: "2026-07-01T05:20:00.000Z"
  },
  {
    id: "hist-complete-003",
    verifierName: "Emergency Department Simulation",
    purpose: "emergency",
    presentationId: "vp_complete_emergency_20260618_001",
    verificationResult: "valid",
    presentedAt: "2026-06-18T12:40:00.000Z"
  }
];

export const completeWalletShlPackages: ShlPackageDetail[] = createCompleteWalletShlPackages();

function createCompleteWalletShlPackages(): ShlPackageDetail[] {
  const shlCards = completeWalletSeedCards.filter(card =>
    card.ownerUserId === completePatient.ownerUserId &&
    [
      "patient_identity",
      "patient_summary",
      "allergy_alert",
      "medication_summary",
      "lab_result",
      "insurance_eligibility"
    ].includes(card.cardType)
  );
  const publication = createTrustCareShlGatewayPublication({
    context: "opd_visit",
    ownerUserId: completePatient.ownerUserId,
    patientId: completePatient.patientId,
    selectedCardIds: shlCards.map(card => card.id),
    cards: shlCards,
    receiver: "TrustCare Phuket International Hospital",
    purpose: "opd_visit",
    origin: "https://aec-infraconnect-2562.github.io/trustcare-wallet-apps",
    includeTrustCareManifestVp: true,
    policy: {
      expiresAt: "2026-07-15T16:59:59.000Z",
      passcodeRequired: false,
      passcodeHint: null,
      accessCodeDelivery: "not_required",
      maxAccessCount: 5
    }
  });
  return [
    {
      ...publication,
      id: 7001,
      label: "OPD readiness SHL - Somchai Jaidee",
      purpose: "opd_visit",
      context: "opd_visit",
      status: "active",
      manifestCredentialId: publication.manifest.trustcare.manifestCredentialId,
      presentationId: publication.manifest.trustcare.holderPresentationId,
      manifestCredential: publication.manifest.trustcare.manifestCredential,
      holderAuthorizationCredential: publication.manifest.trustcare.holderAuthorizationCredential,
      manifestVp: publication.manifest.trustcare.manifestVp,
      manifestVpUrl: publication.manifest.trustcare.manifestVpUrl,
      manifestVpHash: publication.manifest.trustcare.manifestVpHash,
      trustcareCertification: {
        status: "maker_checker_approved",
        ownerConfirmed: true,
        makerId: "maker-tcc-001",
        makerName: "TrustCare Central Hospital Maker",
        makerApprovedAt: "2026-07-01T04:44:00.000Z",
        checkerId: "checker-tcc-001",
        checkerName: "TrustCare Central Hospital Checker",
        checkerApprovedAt: "2026-07-01T04:48:00.000Z",
        networkHospitalDid: hospital.issuerDid,
        consentReceiptId: "urn:uuid:TCW-COMPLETE-0003-consent_receipt",
        policyVersion: "trustcare-shl-governance-2026.07"
      },
      currentAccessCount: 1,
      files: publication.manifest.files,
      versions: [{ version: 1, createdAt: "2026-07-01T04:50:00.000Z", manifestHash: publication.manifest.trustcare.manifestVpHash }],
      accessLogs: [
        { id: "log-1", recipient: "TrustCare Phuket International Hospital", accessedAt: "2026-07-01T05:00:00.000Z", result: "granted" }
      ],
      documentBundle: publication.manifest.documentBundle
    }
  ];
}

export function completeCardsByCategory(cards: WalletCard[] = completeWalletSeedCards): WalletCardsByCategory {
  return cards.reduce<WalletCardsByCategory>((acc, card) => {
    acc[card.documentCategory] ??= [];
    acc[card.documentCategory].push(card);
    return acc;
  }, {});
}

export function getCompleteWalletSeed(ownerUserId?: string): WalletCard[] {
  if (!ownerUserId) return completeWalletSeedCards;
  return completeWalletSeedCards.filter(card => card.ownerUserId === ownerUserId);
}

export function getCompleteWalletCardsByCategory(ownerUserId?: string): WalletCardsByCategory {
  return completeCardsByCategory(getCompleteWalletSeed(ownerUserId));
}

export function getCompleteSeedSummary() {
  const all = completeWalletSeedCards;
  return {
    totalCards: all.length,
    patientCards: all.filter(card => card.ownerUserId === completePatient.ownerUserId).length,
    staffCards: all.filter(card => card.ownerUserId === completeStaff.ownerUserId).length,
    categories: Object.fromEntries(Object.entries(completeCardsByCategory(all)).map(([key, cards]) => [key, (cards as WalletCard[]).length])),
    missingDocumentTypes: completeSeedDocumentDefinitions
      .map(def => def.cardType)
      .filter(cardType => !all.some(card => card.cardType === cardType))
  };
}

function makePatientCard(
  cardType: CompleteSeedDocumentType,
  offset: number,
  input: {
    credentialSubject: Record<string, unknown>;
    expiresAt: string;
    issuerOverride?: typeof hospital | typeof partnerHospital;
    pinned?: boolean;
  }
): WalletCard {
  const def = definitionFor(cardType);
  const issuer = input.issuerOverride ?? hospital;
  const credentialId = `urn:uuid:TCW-COMPLETE-${String(offset).padStart(4, "0")}-${cardType}`;
  return {
    id: 900000 + offset,
    cardType: def.cardType,
    displayName: def.displayName,
    displayNameEn: def.displayNameEn,
    documentCategory: def.documentCategory,
    credentialId,
    credentialStatus: "active",
    credentialData: buildCredentialData({ def, credentialId, issuer, subject: input.credentialSubject, expiresAt: input.expiresAt }),
    credentialType: def.credentialType,
    issuerHospitalName: issuer.nameTh,
    issuerDid: issuer.issuerDid,
    holderDid: completePatient.holderDid,
    patientAvatarUrl: completePatient.avatarUrl,
    ownerUserId: completePatient.ownerUserId,
    patientId: completePatient.patientId,
    sourceSystem: "trustcare_portal",
    scopeLabel: "Complete hospital-grade seed",
    issuedAt,
    expiresAt: input.expiresAt,
    createdAt: baseCreatedAt,
    lastPresentedAt: offset <= 6 ? "2026-07-01T05:00:00.000Z" : null,
    pinned: input.pinned ?? false
  };
}

function makeStaffCard(offset: number, input: { credentialSubject: Record<string, unknown>; expiresAt: string }): WalletCard {
  const def = definitionFor("staff_identity");
  const credentialId = `urn:uuid:TCW-COMPLETE-${String(offset).padStart(4, "0")}-staff_identity`;
  return {
    id: 900000 + offset,
    cardType: def.cardType,
    displayName: def.displayName,
    displayNameEn: def.displayNameEn,
    documentCategory: def.documentCategory,
    credentialId,
    credentialStatus: "active",
    credentialData: buildCredentialData({ def, credentialId, issuer: hospital, subject: input.credentialSubject, expiresAt: input.expiresAt, holderDid: completeStaff.holderDid }),
    credentialType: def.credentialType,
    issuerHospitalName: hospital.nameTh,
    issuerDid: hospital.issuerDid,
    holderDid: completeStaff.holderDid,
    patientAvatarUrl: completeStaff.avatarUrl,
    ownerUserId: completeStaff.ownerUserId,
    patientId: completeStaff.staffId,
    sourceSystem: "trustcare_portal",
    scopeLabel: "Complete staff seed",
    issuedAt,
    expiresAt: input.expiresAt,
    createdAt: baseCreatedAt,
    lastPresentedAt: null,
    pinned: true
  };
}

function buildCredentialData(input: {
  def: CompleteSeedDocumentDefinition;
  credentialId: string;
  issuer: typeof hospital | typeof partnerHospital;
  subject: Record<string, unknown>;
  expiresAt: string;
  holderDid?: string;
}): Record<string, unknown> {
  const holderDid = input.holderDid ?? completePatient.holderDid;
  const documentReference = buildDocumentReference(input.def, input.credentialId, input.issuer, input.expiresAt);
  const humanDocument = buildHumanDocument(input.def, input.subject, input.issuer, input.expiresAt);
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://trustcare.network/contexts/wallet-medical-document/v1"],
    id: input.credentialId,
    type: ["VerifiableCredential", input.def.credentialType],
    issuer: {
      id: input.issuer.issuerDid,
      name: input.issuer.nameEn,
      nameTh: input.issuer.nameTh
    },
    validFrom: issuedAt,
    validUntil: input.expiresAt,
    credentialSubject: {
      id: holderDid,
      ...input.subject,
      documentReference,
      humanDocument
    },
    credentialStatus: {
      id: `${input.credentialId}#status`,
      type: "TrustCareStatusList2026",
      statusPurpose: "revocation",
      status: "active"
    },
    evidence: [
      {
        type: "FHIRR4DocumentReferenceEvidence",
        sourceSystem: input.def.sourceSystem,
        fhirResources: input.def.fhirResources,
        documentReferenceId: `DocumentReference/${input.def.cardType}-complete-001`,
        resource: documentReference,
        attachment: documentReference.content[0]?.attachment
      }
    ],
    trustcare: {
      schemaVersion: "2026.07.complete-seed.v1",
      documentType: input.def.cardType,
      credentialType: input.def.credentialType,
      documentCategory: input.def.documentCategory,
      sensitivity: input.def.sensitivity,
      shareDefault: input.def.shareDefault,
      tags: input.def.tags,
      issuerHospitalCode: "code" in input.issuer ? input.issuer.code : hospital.code,
      holderDid,
      sourceSystem: input.def.sourceSystem,
      selectiveDisclosureRecommendedFields: selectiveFieldsFor(input.def.cardType),
      display: {
        cardAccent: accentForCategory(input.def.documentCategory),
        documentLayout: layoutForDocument(input.def.cardType),
        watermark: "DEMO ONLY",
        patientFacingTitleTh: input.def.displayName,
        patientFacingTitleEn: input.def.displayNameEn
      }
    }
  };
}

function buildDocumentReference(
  def: CompleteSeedDocumentDefinition,
  credentialId: string,
  issuer: typeof hospital | typeof partnerHospital,
  expiresAt: string
) {
  return {
    resourceType: "DocumentReference",
    id: `${def.cardType}-complete-001`,
    status: "current",
    docStatus: "final",
    type: {
      coding: [
        {
          system: "https://trustcare.network/fhir/CodeSystem/document-type",
          code: def.cardType,
          display: def.displayNameEn
        }
      ],
      text: def.displayName
    },
    category: [
      {
        coding: [
          {
            system: "https://trustcare.network/fhir/CodeSystem/document-category",
            code: def.documentCategory,
            display: def.documentCategory
          }
        ]
      }
    ],
    subject: def.cardType === "staff_identity"
      ? { reference: `Practitioner/${completeStaff.staffId}`, display: completeStaff.fullNameEn }
      : { reference: `Patient/${completePatient.patientId}`, display: completePatient.fullNameEn },
    date: issuedAt,
    author: [{ reference: `Organization/${issuer.code}`, display: issuer.nameEn }],
    authenticator: { reference: `Organization/${issuer.code}`, display: issuer.nameEn },
    custodian: { reference: `Organization/${issuer.code}`, display: issuer.nameEn },
    content: [
      {
        attachment: {
          contentType: preferredMimeType(def.cardType),
          language: "th-TH",
          title: `${def.displayNameEn} - ${def.cardType}`,
          creation: issuedAt,
          hash: `sha256:demo-${def.cardType}-content-hash`,
          url: `/demo-documents/${def.cardType}-complete-001.${preferredFileExtension(def.cardType)}`
        },
        format: {
          system: "https://trustcare.network/fhir/CodeSystem/document-format",
          code: layoutForDocument(def.cardType),
          display: "TrustCare patient-facing rendered document"
        }
      }
    ],
    context: {
      encounter: [{ reference: clinicalBaseline.encounterId }],
      period: { start: issuedAt, end: expiresAt },
      related: [{ reference: `Credential/${credentialId}` }]
    }
  };
}

function buildHumanDocument(
  def: CompleteSeedDocumentDefinition,
  subject: Record<string, unknown>,
  issuer: typeof hospital | typeof partnerHospital,
  expiresAt: string
) {
  return {
    rendererVersion: "trustcare-wallet-document-renderer-2026.07",
    layout: layoutForDocument(def.cardType),
    audience: "patient_and_partner_verifier",
    titleTh: def.displayName,
    titleEn: def.displayNameEn,
    issuer: {
      code: issuer.code,
      nameTh: issuer.nameTh,
      nameEn: issuer.nameEn,
      did: issuer.issuerDid
    },
    patient: subject.patient ?? patientProfile(),
    issuedAt,
    expiresAt,
    sections: documentSectionsFor(def.cardType),
    sourceSystem: def.sourceSystem,
    fhirResources: def.fhirResources,
    noPortrait: !["patient_identity", "staff_identity", "travel_document_verification"].includes(def.cardType),
    visualHints: {
      accent: accentForCategory(def.documentCategory),
      priority: def.sensitivity,
      tableDocument: ["lab_result", "prescription", "medication_summary", "pharmacy_dispense", "claim_package", "claim_receipt", "quotation"].includes(def.cardType),
      warningDocument: def.cardType === "allergy_alert"
    }
  };
}

function patientProfile() {
  return {
    fullNameTh: completePatient.fullNameTh,
    fullNameEn: completePatient.fullNameEn,
    birthDate: completePatient.birthDate,
    gender: completePatient.gender,
    nationality: completePatient.nationality,
    hn: completePatient.hn,
    carepassId: completePatient.carepassId,
    phone: completePatient.phone,
    email: completePatient.email,
    address: completePatient.address,
    photoUrl: completePatient.avatarUrl
  };
}

function organizationProfile() {
  return {
    code: hospital.code,
    nameTh: hospital.nameTh,
    nameEn: hospital.nameEn,
    identifier: hospital.licenseNo,
    address: hospital.address,
    phone: hospital.phone,
    did: hospital.issuerDid
  };
}

function definitionFor(cardType: CompleteSeedDocumentType): CompleteSeedDocumentDefinition {
  const def = completeSeedDocumentDefinitions.find(item => item.cardType === cardType);
  if (!def) throw new Error(`Unknown TrustCare seed document type: ${cardType}`);
  return def;
}

function preferredMimeType(cardType: CompleteSeedDocumentType): string {
  if (cardType === "shl_manifest") return "application/fhir+json";
  if (cardType === "sync_receipt") return "application/json";
  if (cardType === "diagnostic_report") return "application/dicom+json";
  return "application/pdf";
}

function preferredFileExtension(cardType: CompleteSeedDocumentType): string {
  if (cardType === "shl_manifest" || cardType === "sync_receipt") return "json";
  if (cardType === "diagnostic_report") return "dicom.json";
  return "pdf";
}

function layoutForDocument(cardType: CompleteSeedDocumentType): string {
  const map: Partial<Record<CompleteSeedDocumentType, string>> = {
    patient_identity: "photo_identity_card",
    staff_identity: "staff_badge",
    consent_receipt: "consent_receipt",
    mpi_link_certificate: "identity_link_certificate",
    patient_summary: "clinical_summary_report",
    allergy_alert: "critical_alert_sheet",
    immunization: "immunization_record",
    medical_certificate: "signed_medical_certificate",
    medication_summary: "medication_reconciliation_table",
    prescription: "prescription_order",
    pharmacy_dispense: "pharmacy_dispense_record",
    lab_result: "laboratory_report",
    diagnostic_report: "diagnostic_report",
    referral_vc: "referral_letter",
    discharge_summary: "discharge_summary",
    insurance_eligibility: "coverage_eligibility_response",
    claim_package: "claim_submission_package",
    claim_receipt: "billing_receipt",
    travel_document_verification: "travel_document_verification",
    visa_support_letter: "visa_support_letter",
    quotation: "treatment_quotation",
    guarantee_letter: "letter_of_guarantee",
    shl_manifest: "shl_manifest",
    sync_receipt: "wallet_sync_receipt",
    appointment: "appointment_ticket"
  };
  return map[cardType] ?? "clinical_document";
}

function documentSectionsFor(cardType: CompleteSeedDocumentType): string[] {
  const map: Partial<Record<CompleteSeedDocumentType, string[]>> = {
    patient_identity: ["demographics", "identifiers", "emergency_contact", "registration"],
    staff_identity: ["staff_profile", "license", "department", "privileges"],
    consent_receipt: ["purpose", "scope", "recipient", "expiry", "revocation"],
    mpi_link_certificate: ["golden_record", "linked_identifiers", "matching_policy", "review"],
    patient_summary: ["problems", "allergies", "medications", "vital_signs", "care_plan"],
    allergy_alert: ["allergen", "reaction", "severity", "emergency_instruction"],
    immunization: ["vaccine", "occurrence_date", "lot", "performer"],
    medical_certificate: ["diagnosis", "examination", "result", "restrictions", "certifying_practitioner"],
    medication_summary: ["active_medications", "reconciliation", "indication"],
    prescription: ["prescription_items", "prescriber", "quantity", "refill"],
    pharmacy_dispense: ["dispensed_items", "dispenser", "lot", "counseling"],
    lab_result: ["specimen", "observations", "reference_range", "interpretation"],
    diagnostic_report: ["modality", "findings", "conclusion", "reporting_practitioner"],
    referral_vc: ["from", "to", "reason", "attachments", "requested_service"],
    discharge_summary: ["admission", "diagnoses", "hospital_course", "procedures", "follow_up"],
    insurance_eligibility: ["payer", "policy", "benefits", "remaining_limit", "last_checked"],
    claim_package: ["claim", "diagnosis_codes", "service_lines", "attachments", "total"],
    claim_receipt: ["receipt", "invoice", "items", "payment", "payer_responsibility"],
    travel_document_verification: ["passport", "nationality", "verified_against", "travel_window"],
    visa_support_letter: ["purpose", "visit_period", "receiving_department", "responsible_physician"],
    quotation: ["package", "line_items", "estimated_total", "exclusions"],
    guarantee_letter: ["payer", "pre_auth", "covered_services", "limit", "conditions"],
    shl_manifest: ["manifest", "files", "manifest_vc", "holder_vp", "access_policy"],
    sync_receipt: ["source", "target", "counts", "checksum", "adapter"],
    appointment: ["service", "time", "location", "practitioner", "required_documents"]
  };
  return map[cardType] ?? ["summary", "issuer", "status"];
}

function accentForCategory(category: CompleteSeedDocumentCategory): string {
  const map: Record<CompleteSeedDocumentCategory, string> = {
    identity_and_access: "slate",
    clinical_summary: "emerald",
    medication_and_pharmacy: "blue",
    diagnostics_and_results: "indigo",
    care_transition: "cyan",
    claims_and_finance: "rose",
    medical_tourism: "fuchsia",
    sharing_and_sync: "zinc",
    operations: "purple"
  };
  return map[category];
}

function selectiveFieldsFor(cardType: CompleteSeedDocumentType): string[] {
  const base = ["credentialSubject.patient.fullNameTh", "credentialSubject.patient.birthDate", "issuer", "validUntil"];
  const specific: Partial<Record<CompleteSeedDocumentType, string[]>> = {
    patient_identity: ["credentialSubject.identifiers", "credentialSubject.registration"],
    patient_summary: ["credentialSubject.summary.conditions", "credentialSubject.summary.medications", "credentialSubject.summary.allergies"],
    allergy_alert: ["credentialSubject.allergyIntolerances"],
    medication_summary: ["credentialSubject.medicationSummary.medications"],
    lab_result: ["credentialSubject.labReport.observations"],
    insurance_eligibility: ["credentialSubject.coverage.status", "credentialSubject.coverage.benefitSummary"],
    claim_package: ["credentialSubject.claimPackage.totalAmount", "credentialSubject.claimPackage.attachments"],
    appointment: ["credentialSubject.appointment.start", "credentialSubject.appointment.location"]
  };
  return [...base, ...(specific[cardType] ?? [])];
}

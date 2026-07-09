import type {
  PresentationHistoryItem,
  ShlPackageDetail,
  WalletCard,
  WalletCardsByCategory,
  WalletPresentationResponse,
} from "./models";
import {
  completeWalletPresentationHistory,
  completeWalletShlPackages,
  getCompleteWalletCardsByCategory,
  getCompleteWalletSeed,
} from "./completeSeedData";
import {
  createDemoResolverReferenceUrl,
  type DemoResolvedPayload,
} from "./demoResolvers";
import { createTrustCareShlGatewayPublication } from "./shlGateway";
import {
  TRUSTCARE_PORTAL_WEB_ORIGIN,
  trustCarePortalPersonImages,
} from "./portalSyncData";
import { canPresentCredential } from "./statusTone";

export {
  completeCardsByCategory,
  completeSeedDocumentDefinitions,
  completeWalletPresentationHistory,
  completeWalletSeedCards,
  completeWalletShlPackages,
  getCompleteSeedSummary,
  getCompleteWalletCardsByCategory,
  getCompleteWalletSeed,
  type CompleteSeedDocumentCategory,
  type CompleteSeedDocumentDefinition,
  type CompleteSeedDocumentType,
} from "./completeSeedData";

const now = new Date("2026-07-04T09:41:00+07:00");

function isoOffset(days: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export type WalletDemoUser = {
  id: string;
  patientId: number;
  portalOpenId?: string;
  source: "trustcare_portal" | "partner_wallet";
  sourceLabel: string;
  role: "patient" | "staff";
  hospitalCode: "TCC" | "TCP" | "TCM" | "PXH";
  hospitalName: string;
  hospitalNameTh: string;
  nameTh: string;
  nameEn: string;
  initials: string;
  gender: "male" | "female";
  birthDate: string;
  email: string;
  phone: string;
  thaiId?: string;
  passport?: string;
  carepassId: string;
  hn: string;
  holderDid: string;
  issuerDid: string;
  avatarUrl: string;
  avatarSource: "trustcare_portal" | "wallet_generated";
  persona: string;
  tags: string[];
  conditions: string[];
  allergies: string[];
  cardBase: number;
};

export const TRUSTCARE_PORTAL_ASSET_ORIGIN = TRUSTCARE_PORTAL_WEB_ORIGIN;
export {
  TRUSTCARE_PORTAL_WEB_ORIGIN,
  portalSyncedUsers,
  trustCarePortalPersonImages,
} from "./portalSyncData";

export const walletNativePersonImages = {
  nativeFemale: "assets/users/wallet-native-02.png",
  nativeMale: "assets/users/wallet-native-01.png",
} as const;

export const walletDemoUsers: WalletDemoUser[] = [
  {
    id: "demo-patient-001",
    patientId: 1100500123456,
    portalOpenId: "demo-patient-001",
    source: "trustcare_portal",
    sourceLabel: "ข้อมูลจาก TrustCare Portal",
    role: "patient",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "นายสมชาย ใจดี",
    nameEn: "Mr. Somchai Jaidee",
    initials: "ส",
    gender: "male",
    birthDate: "1978-03-15",
    email: "somsak@gmail.com",
    phone: "089-123-4567",
    thaiId: "1100500123456",
    carepassId: "CP-TH-2026-000001",
    hn: "HN-TCC-00100001",
    holderDid: "did:key:z6MkhSomchaiPortalWallet001",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.demoPatient001,
    avatarSource: "trustcare_portal",
    persona:
      "ผู้ป่วยจาก TrustCare Portal สำหรับทดสอบ OPD การส่งต่อ เคลม และงานยา",
    tags: ["opd", "referral", "claim", "pharmacy", "medical_certificate"],
    conditions: ["E11", "I10"],
    allergies: ["Penicillin severe"],
    cardBase: 1000,
  },
  {
    id: "demo-patient-002",
    patientId: 1100500234567,
    portalOpenId: "demo-patient-002",
    source: "trustcare_portal",
    sourceLabel: "ข้อมูลจาก TrustCare Portal",
    role: "patient",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "นางสาวมาลี วัฒนา",
    nameEn: "Ms. Malee Wattana",
    initials: "ม",
    gender: "female",
    birthDate: "1986-09-24",
    email: "napa@gmail.com",
    phone: "089-234-5678",
    thaiId: "1100500234567",
    carepassId: "CP-TH-2026-000002",
    hn: "HN-TCC-00100002",
    holderDid: "did:key:z6MkhMaleePortalWallet002",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.demoPatient002,
    avatarSource: "trustcare_portal",
    persona:
      "ผู้ป่วยจาก TrustCare Portal สำหรับทดสอบ OPD เหตุฉุกเฉิน และผลแล็บ",
    tags: ["opd", "emergency", "lab"],
    conditions: ["J45"],
    allergies: ["Sulfonamide rash"],
    cardBase: 2000,
  },
  {
    id: "demo-patient-003",
    patientId: 1100500345678,
    portalOpenId: "demo-patient-003",
    source: "trustcare_portal",
    sourceLabel: "ข้อมูลจาก TrustCare Portal",
    role: "patient",
    hospitalCode: "TCP",
    hospitalName: "TrustCare Phuket International Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ ภูเก็ต อินเตอร์เนชันแนล",
    nameTh: "Mr. John Williams",
    nameEn: "Mr. John Williams",
    initials: "J",
    gender: "male",
    birthDate: "1969-12-02",
    email: "wichai@gmail.com",
    phone: "089-345-6789",
    thaiId: "1100500345678",
    passport: "X12345678",
    carepassId: "CP-INT-2026-000003",
    hn: "HN-TCP-00100003",
    holderDid: "did:key:z6MkhJohnPortalWallet003",
    issuerDid: "did:web:trustcare.network:hospital:tcp",
    avatarUrl: trustCarePortalPersonImages.demoPatient003,
    avatarSource: "trustcare_portal",
    persona:
      "ผู้ป่วยต่างชาติจาก TrustCare Portal สำหรับทดสอบประกันและเอกสารเดินทาง",
    tags: ["medical_tourist", "insurance", "travel_document"],
    conditions: ["M17.1"],
    allergies: ["No known drug allergy"],
    cardBase: 3000,
  },
  {
    id: "demo-hospadmin-001",
    patientId: 1100100000002,
    portalOpenId: "demo-hospadmin-001",
    source: "trustcare_portal",
    sourceLabel: "ข้อมูลจาก TrustCare Portal",
    role: "staff",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "นางวิภา บริหารเก่ง",
    nameEn: "Ms. Wipa Borihankeng",
    initials: "ว",
    gender: "female",
    birthDate: "1984-05-03",
    email: "wipa@trustcare-central.th",
    phone: "081-000-0002",
    thaiId: "1100100000002",
    carepassId: "STAFF-TCC-000408",
    hn: "STAFF-TCC-000408",
    holderDid: "did:key:z6MkhWipaPortalStaff004",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.demoHospadmin001,
    avatarSource: "trustcare_portal",
    persona:
      "เจ้าหน้าที่โรงพยาบาลจาก TrustCare Portal สำหรับทดสอบสิทธิ์ผู้ปฏิบัติงาน",
    tags: ["staff_identity", "maker_checker"],
    conditions: [],
    allergies: [],
    cardBase: 4000,
  },
  {
    id: "portal-empty-patient-001",
    patientId: 910000000001,
    portalOpenId: "portal-empty-patient-001",
    source: "trustcare_portal",
    sourceLabel: "กระเป๋าเปล่าสำหรับทดสอบ Sync จาก TrustCare Portal",
    role: "patient",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "ผู้ป่วยทดสอบ Sync",
    nameEn: "Portal Sync Empty Patient",
    initials: "S",
    gender: "female",
    birthDate: "1992-04-12",
    email: "empty.patient.wallet@example.test",
    phone: "080-000-0101",
    thaiId: "910000000001",
    carepassId: "CP-SYNC-EMPTY-001",
    hn: "HN-SYNC-EMPTY-001",
    holderDid: "did:key:z6MkhTrustCareEmptyPatientSync001",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.patientFemale,
    avatarSource: "trustcare_portal",
    persona:
      "กระเป๋าเปล่าสำหรับทดสอบปุ่ม Sync ข้อมูลรายบุคคลจาก TrustCare Portal",
    tags: ["empty_wallet", "portal_sync_test"],
    conditions: [],
    allergies: [],
    cardBase: 910000,
  },
  {
    id: "portal-empty-staff-001",
    patientId: 910000000002,
    portalOpenId: "portal-empty-staff-001",
    source: "trustcare_portal",
    sourceLabel: "กระเป๋าเปล่าสำหรับทดสอบ Sync จาก TrustCare Portal",
    role: "staff",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "เจ้าหน้าที่ทดสอบ Sync",
    nameEn: "Portal Sync Empty Staff",
    initials: "S",
    gender: "female",
    birthDate: "1988-08-18",
    email: "empty.staff.wallet@example.test",
    phone: "080-000-0102",
    thaiId: "910000000002",
    carepassId: "STAFF-SYNC-EMPTY-001",
    hn: "STAFF-SYNC-EMPTY-001",
    holderDid: "did:key:z6MkhTrustCareEmptyStaffSync001",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.nurseFemale,
    avatarSource: "trustcare_portal",
    persona:
      "กระเป๋าเปล่าของเจ้าหน้าที่สำหรับทดสอบปุ่ม Sync จาก TrustCare Portal",
    tags: ["empty_wallet", "portal_sync_test", "staff_identity"],
    conditions: [],
    allergies: [],
    cardBase: 911000,
  },
  {
    id: "demo-patient-complete-001",
    patientId: 9900700100017,
    portalOpenId: "demo-patient-001",
    source: "trustcare_portal",
    sourceLabel: "ข้อมูลครบชุดจาก TrustCare Portal",
    role: "patient",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "นายสมชาย ใจดี",
    nameEn: "Mr. Somchai Jaidee",
    initials: "ส",
    gender: "male",
    birthDate: "1978-03-15",
    email: "somchai.jaidee.demo@example.test",
    phone: "089-123-4567",
    thaiId: "9900700100017",
    passport: "M12345678",
    carepassId: "CP-TH-2026-COMPLETE-001",
    hn: "HN-TCC-670001",
    holderDid: "did:key:z6MkhTrustCareCompletePatient001",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.demoPatient001,
    avatarSource: "trustcare_portal",
    persona:
      "Wallet ผู้ป่วยครบชุด ครอบคลุมเอกสารสุขภาพทุกประเภทที่เกี่ยวข้องกับผู้ป่วย",
    tags: [
      "complete_seed",
      "opd",
      "emergency",
      "referral",
      "claim",
      "pharmacy",
      "medical_tourist",
      "insurance",
      "travel_document",
      "shl",
    ],
    conditions: ["E11", "I10", "E78.5"],
    allergies: ["Penicillin severe", "Shellfish moderate"],
    cardBase: 900000,
  },
  {
    id: "demo-staff-complete-001",
    patientId: 9900700200017,
    source: "trustcare_portal",
    sourceLabel: "ข้อมูลครบชุดจาก TrustCare Portal",
    role: "staff",
    hospitalCode: "TCC",
    hospitalName: "TrustCare Central Hospital",
    hospitalNameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
    nameTh: "พญ.สิริรักษ์ รักษาดี",
    nameEn: "Dr. Sirirak Raksadee",
    initials: "ส",
    gender: "female",
    birthDate: "1982-11-09",
    email: "sirirak.r@trustcare-central.example.test",
    phone: "02-123-4567",
    thaiId: "9900700200017",
    carepassId: "STAFF-TCC-MD-14527",
    hn: "STAFF-TCC-MD-14527",
    holderDid: "did:key:z6MkhTrustCareStaffDoctor001",
    issuerDid: "did:web:trustcare.network:hospital:tcc",
    avatarUrl: trustCarePortalPersonImages.doctorFemale,
    avatarSource: "trustcare_portal",
    persona:
      "Wallet เจ้าหน้าที่ครบชุดสำหรับทดสอบ staff_identity การตรวจสอบ และการเข้าถึงบริการ",
    tags: [
      "complete_seed",
      "staff_identity",
      "credential_checker",
      "service_verifier",
    ],
    conditions: [],
    allergies: [],
    cardBase: 901000,
  },
  {
    id: "partner-patient-001",
    patientId: 880001000001,
    source: "partner_wallet",
    sourceLabel: "ข้อมูลที่สร้างใน Wallet นี้",
    role: "patient",
    hospitalCode: "PXH",
    hospitalName: "HealthPass Partner Clinic",
    hospitalNameTh: "คลินิกเฮลท์พาส พาร์ทเนอร์",
    nameTh: "นางสาวกมลวรรณ ศรีสุข",
    nameEn: "Ms. Kamonwan Srisuk",
    initials: "ก",
    gender: "female",
    birthDate: "1990-02-11",
    email: "kamonwan@partner-wallet.test",
    phone: "088-201-0001",
    thaiId: "8800100011111",
    carepassId: "PX-TH-2026-000001",
    hn: "PXH-000001",
    holderDid: "did:key:z6MkhPartnerNative001",
    issuerDid: "did:web:partner-wallet.example:issuer:pxh",
    avatarUrl: walletNativePersonImages.nativeFemale,
    avatarSource: "wallet_generated",
    persona:
      "ผู้ป่วยที่สร้างใน Wallet นี้ สำหรับทดสอบการนำเข้าและส่งออกกับ partner ภายนอก",
    tags: ["opd", "lab", "cross_border"],
    conditions: ["Z34"],
    allergies: ["No known drug allergy"],
    cardBase: 5000,
  },
  {
    id: "partner-patient-002",
    patientId: 880001000002,
    source: "partner_wallet",
    sourceLabel: "ข้อมูลที่สร้างใน Wallet นี้",
    role: "patient",
    hospitalCode: "PXH",
    hospitalName: "HealthPass Partner Clinic",
    hospitalNameTh: "คลินิกเฮลท์พาส พาร์ทเนอร์",
    nameTh: "Mr. David Chen",
    nameEn: "Mr. David Chen",
    initials: "D",
    gender: "male",
    birthDate: "1981-01-18",
    email: "david.chen@partner-wallet.test",
    phone: "+65-6000-1002",
    passport: "PX7788123",
    carepassId: "PX-INT-2026-000002",
    hn: "PXH-000002",
    holderDid: "did:key:z6MkhPartnerNative002",
    issuerDid: "did:web:partner-wallet.example:issuer:pxh",
    avatarUrl: walletNativePersonImages.nativeMale,
    avatarSource: "wallet_generated",
    persona:
      "ผู้ป่วยต่างชาติที่สร้างใน Wallet นี้ สำหรับทดสอบการเชื่อมโยงกลับไป TrustCare Portal",
    tags: [
      "medical_tourist",
      "insurance",
      "travel_document",
      "guarantee_letter",
    ],
    conditions: ["M16"],
    allergies: ["No known drug allergy"],
    cardBase: 6000,
  },
];

export const demoPatient = walletDemoUsers[0];

export function getDemoUser(userId?: string | number): WalletDemoUser {
  if (!userId) return demoPatient;
  return (
    walletDemoUsers.find(
      (user) =>
        String(user.id) === String(userId) ||
        String(user.patientId) === String(userId),
    ) ?? demoPatient
  );
}

export function getDemoWalletCards(userId?: string | number): WalletCard[] {
  const user = getDemoUser(userId);
  if (user.tags.includes("empty_wallet")) return [];
  if (user.tags.includes("complete_seed")) {
    return getCompleteWalletSeed(user.id).sort((a, b) => a.id - b.id);
  }
  const cards =
    user.role === "staff" ? buildStaffCards(user) : buildPatientCards(user);
  return cards.sort((a, b) => a.id - b.id);
}

export function getDemoCardsByCategory(
  userId?: string | number,
): WalletCardsByCategory {
  const user = getDemoUser(userId);
  if (user.tags.includes("complete_seed"))
    return getCompleteWalletCardsByCategory(user.id);
  return getDemoWalletCards(userId).reduce<WalletCardsByCategory>(
    (acc, card) => {
      acc[card.documentCategory] ??= [];
      acc[card.documentCategory].push(card);
      return acc;
    },
    {},
  );
}

export function getDemoHistory(
  userId?: string | number,
): PresentationHistoryItem[] {
  const user = getDemoUser(userId);
  if (user.tags.includes("empty_wallet")) return [];
  if (user.id === "demo-patient-complete-001")
    return completeWalletPresentationHistory;
  if (user.id === "demo-staff-complete-001") return [];
  return [
    {
      id: `${user.id}:hist:single`,
      verifierName:
        user.source === "trustcare_portal"
          ? "HealthPass Partner Verifier"
          : "TrustCare Portal Verifier",
      purpose: "single_document",
      presentationId: `vp_${user.id}_single`,
      verificationResult: "valid",
      presentedAt: isoOffset(-1),
    },
    {
      id: `${user.id}:hist:service`,
      verifierName:
        user.source === "trustcare_portal"
          ? "Partner service intake"
          : "TrustCare service readiness",
      purpose: user.tags.includes("medical_tourist")
        ? "medical_tourist"
        : "opd_visit",
      presentationId: `vp_${user.id}_service`,
      verificationResult: "valid",
      presentedAt: isoOffset(-2),
    },
  ];
}

export function getDemoShlPackages(
  userId?: string | number,
): ShlPackageDetail[] {
  const user = getDemoUser(userId);
  if (user.tags.includes("empty_wallet")) return [];
  if (user.id === "demo-patient-complete-001") return completeWalletShlPackages;
  if (user.id === "demo-staff-complete-001") return [];
  if (user.role !== "patient") return [];
  const trustcareCertified = user.source === "trustcare_portal";
  const context = user.tags.includes("medical_tourist")
    ? "medical_tourist"
    : user.tags.includes("cross_border")
      ? "cross_border"
      : user.tags.includes("referral")
        ? "referral"
        : "opd_visit";
  const cards = getDemoWalletCards(user.id).filter((card) =>
    [
      "patient_identity",
      "patient_summary",
      "allergy_alert",
      "medication_summary",
      "prescription",
      "lab_result",
      "diagnostic_report",
      "referral_vc",
      "insurance_eligibility",
      "travel_document_verification",
    ].includes(card.cardType),
  );
  const publication = createTrustCareShlGatewayPublication({
    context,
    ownerUserId: user.id,
    patientId: user.patientId,
    selectedCardIds: cards.map((card) => card.id),
    cards,
    receiver:
      user.source === "trustcare_portal"
        ? "HealthPass Partner Verifier"
        : "TrustCare Portal",
    purpose: user.tags.includes("medical_tourist")
      ? "medical_tourist_intake"
      : "patient_summary",
    origin: "https://aec-infraconnect-2562.github.io/trustcare-wallet-apps",
    includeTrustCareManifestVp: trustcareCertified,
    policy: {
      expiresAt: isoOffset(7),
      passcodeRequired: false,
      passcodeHint: null,
      accessCodeDelivery: "not_required",
      maxAccessCount: 5,
    },
  });
  return [
    {
      ...publication,
      id: user.cardBase + 701,
      label: `${user.nameEn} Service Share Package`,
      purpose: user.tags.includes("medical_tourist")
        ? "medical_tourist_intake"
        : "patient_summary",
      context: user.tags.includes("insurance") ? "insurance" : "treatment",
      status: "active",
      manifestCredentialId: publication.manifest.trustcare.manifestCredentialId,
      presentationId: publication.manifest.trustcare.holderPresentationId,
      manifestCredential: publication.manifest.trustcare.manifestCredential,
      holderAuthorizationCredential:
        publication.manifest.trustcare.holderAuthorizationCredential,
      manifestVp: publication.manifest.trustcare.manifestVp,
      manifestVpUrl: publication.manifest.trustcare.manifestVpUrl,
      manifestVpHash: publication.manifest.trustcare.manifestVpHash,
      trustcareCertification: trustcareCertified
        ? {
            status: "maker_checker_approved",
            ownerConfirmed: true,
            makerId: `maker-${user.id}`,
            makerName: `${user.hospitalName} Issuer Attestor`,
            makerApprovedAt: isoOffset(-2),
            checkerId: `checker-${user.id}`,
            checkerName: `${user.hospitalName} Trust Verifier`,
            checkerApprovedAt: isoOffset(-1),
            networkHospitalDid: user.issuerDid,
            consentReceiptId: `consent-${user.id}`,
            policyVersion: "trustcare-shl-governance-2026.07",
          }
        : {
            status: "not_applicable",
            ownerConfirmed: false,
            policyVersion: "standard-shl-transport",
          },
      currentAccessCount: user.source === "trustcare_portal" ? 1 : 0,
      files: publication.manifest.files,
      versions: [{ version: 1, status: "active" }],
      accessLogs: [
        {
          recipient:
            user.source === "trustcare_portal"
              ? "HealthPass Partner Verifier"
              : "TrustCare Portal Verifier",
          at: isoOffset(-1),
        },
      ],
      documentBundle: publication.manifest.documentBundle,
    },
  ];
}

export const demoWalletCards: WalletCard[] = getDemoWalletCards(demoPatient.id);
export const demoCardsByCategory: WalletCardsByCategory =
  getDemoCardsByCategory(demoPatient.id);
export const demoHistory: PresentationHistoryItem[] = getDemoHistory(
  demoPatient.id,
);
export const demoShlPackages: ShlPackageDetail[] = getDemoShlPackages(
  demoPatient.id,
);

export function buildPortalInteroperabilityFixtures(
  userId?: string | number,
  origin = "https://aec-infraconnect-2562.github.io/trustcare-wallet-apps",
) {
  const user = getDemoUser(userId);
  const cards = getDemoWalletCards(user.id);
  const shl = getDemoShlPackages(user.id)[0];
  const state = `state-${user.id}`;
  const nonce = `nonce-${user.id}`;
  const requestedType = cards.some(
    (card) => card.credentialType === "CoverageEligibilityCredential",
  )
    ? "CoverageEligibilityCredential"
    : user.tags.includes("insurance")
      ? "InsuranceEligibilityCredential"
      : "PatientSummaryCredential";
  const credentialOffer = {
    credential_issuer:
      user.source === "trustcare_portal" ? TRUSTCARE_PORTAL_WEB_ORIGIN : origin,
    credential_configuration_ids: cards
      .map((card) => card.credentialType)
      .filter(Boolean),
    grants: {
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
        "pre-authorized_code": `preauth-${user.id}`,
        tx_code: {
          input_mode: "numeric",
          length: 6,
          description: "Demo-only transaction code",
        },
      },
    },
    trustcare: {
      sourceSystem: user.source,
      userId: user.id,
      patientId: user.patientId,
      holderDid: user.holderDid,
      portalOpenId: user.portalOpenId,
      avatarSource: user.avatarSource,
    },
  };
  const presentationRequest = {
    response_type: "vp_token",
    response_mode: "direct_post",
    client_id:
      user.source === "trustcare_portal"
        ? "did:web:partner-wallet.example:verifier"
        : "did:web:trustcarehealth.live:verifier",
    redirect_uri: `${origin}/verifier/callback`,
    nonce,
    state,
    presentation_definition: {
      id: `pd-${user.id}`,
      name: `${requestedType} request for ${user.nameEn}`,
      input_descriptors: [
        {
          id: requestedType,
          name: requestedType,
          constraints: {
            fields: [{ path: ["$.type"], filter: { const: requestedType } }],
          },
        },
      ],
    },
    trustcare: {
      expectedHolderDid: user.holderDid,
      patientId: user.patientId,
      sourceSystem: user.source,
      requestedBy:
        user.source === "trustcare_portal"
          ? "partner-wallet"
          : "trustcare-portal",
    },
  };
  return {
    user,
    counts: {
      cards: cards.length,
      shlPackages: shl ? 1 : 0,
      oid4vciOffers: 1,
      oid4vpRequests: 1,
    },
    credentialOfferUrl: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(credentialOffer))}`,
    presentationRequestUrl: `openid4vp://?request=${encodeURIComponent(JSON.stringify(presentationRequest))}`,
    shlQrPayload: shl?.qrPayload,
    sampleCredentialIds: cards.map((card) => card.credentialId),
    samplePresentationIds: getDemoHistory(user.id)
      .map((item) => item.presentationId)
      .filter(Boolean),
    scope: {
      ownerUserId: user.id,
      patientId: user.patientId,
      holderDid: user.holderDid,
      sourceSystem: user.source,
      portalOpenId: user.portalOpenId,
    },
  };
}

export function createDemoPresentation(
  card: WalletCard,
  selectedFields: string[] = [],
  origin = "https://trustcare.example.com",
  validMinutes = 10,
): WalletPresentationResponse {
  const presentationId = `vp_demo_${card.id}_${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + validMinutes * 60_000).toISOString();
  const qrUrl = new URL(
    createDemoResolverReferenceUrl(origin, "vp", presentationId),
  );
  qrUrl.searchParams.set("tc_exp", expiresAt);
  if (selectedFields.length)
    qrUrl.searchParams.set("tc_fields", selectedFields.join(","));
  return {
    presentationId,
    format: "jwt-vp",
    mode: selectedFields.length ? "selective_disclosure" : "direct_vp",
    credentialCount: 1,
    selectedFields,
    expiresAt,
    qrData: qrUrl.toString(),
    transportDecision: {
      mode: "direct_vp",
      label: "Single-document VP",
      reason:
        "Purpose-bound VP QR for one credential without exposing the full wallet scope.",
    },
    verificationChecklist: [
      {
        key: "issuer",
        label: "Issuer DID",
        ok: Boolean(card.issuerDid),
        detail: card.issuerDid ?? "",
      },
      {
        key: "holder",
        label: "Holder DID",
        ok: Boolean(card.holderDid),
        detail: card.holderDid ?? "",
      },
      {
        key: "status",
        label: "Credential active",
        ok: canPresentCredential(card),
      },
      {
        key: "scope",
        label: "Wallet user scope",
        ok: Boolean(
          (card as WalletCard & { ownerUserId?: string }).ownerUserId,
        ),
        detail:
          (card as WalletCard & { ownerUserId?: string }).ownerUserId ?? "",
      },
      { key: "consent", label: "Purpose-bound sharing", ok: true },
    ],
  };
}

export function resolveDemoVpReferencePayload(
  value: string,
): DemoResolvedPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.searchParams.get("tc_resolver") !== "vp" ||
    !parsed.searchParams.get("tc_ref")
  ) {
    return null;
  }
  const id = parsed.searchParams.get("tc_id");
  if (!id) return null;
  const card = findDemoCardForPresentationId(id);
  if (!card) return null;
  const selectedFields = (parsed.searchParams.get("tc_fields") ?? "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  const validUntil =
    parsed.searchParams.get("tc_exp") ??
    new Date(Date.now() + 10 * 60_000).toISOString();
  return {
    kind: "vp",
    id,
    payload: buildDemoPresentationPayload(card, id, selectedFields, validUntil),
  };
}

function findDemoCardForPresentationId(
  presentationId: string,
): WalletCard | null {
  const match = /^vp_demo_(\d+)_/.exec(presentationId);
  const cardId = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(cardId)) return null;
  for (const user of walletDemoUsers) {
    const card = getDemoWalletCards(user.id).find((item) => item.id === cardId);
    if (card) return card;
  }
  return null;
}

function buildDemoPresentationPayload(
  card: WalletCard,
  presentationId: string,
  selectedFields: string[],
  validUntil: string,
): Record<string, unknown> {
  const credential =
    card.credentialData ??
    ({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: card.credentialId,
      type: ["VerifiableCredential", card.credentialType ?? card.cardType],
      issuer: card.issuerDid ?? card.issuerHospitalName ?? "TrustCare Demo",
      validFrom: card.issuedAt,
      validUntil: card.expiresAt,
      credentialSubject: {
        id: card.holderDid ?? card.ownerUserId ?? String(card.patientId ?? ""),
        credentialId: card.credentialId,
      },
    } satisfies Record<string, unknown>);
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: presentationId,
    type: ["VerifiablePresentation", "PurposeVP", "TrustCareDemoPresentation"],
    holder: card.holderDid,
    validUntil,
    purpose: "TrustCare credential verifier",
    recipient: "TrustCare credential verifier",
    verifiableCredential: [credential],
    trustcare: {
      source: "trustcare_wallet_demo_resolver",
      credentialId: card.credentialId,
      cardType: card.cardType,
      selectedFields,
      minimumNecessary: selectedFields.length > 0,
    },
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "ecdsa-rdfc-2019",
      proofPurpose: "authentication",
      verificationMethod: `${card.holderDid ?? "did:key:trustcare-demo"}#demo-key`,
      created: now.toISOString(),
      proofValue: `zTrustCareDemoResolverProof${presentationId.replace(/[^a-zA-Z0-9]/g, "")}`,
    },
  };
}

function buildPatientCards(user: WalletDemoUser): WalletCard[] {
  const cards: WalletCard[] = [identityCard(user), patientSummaryCard(user)];
  if (hasRealAllergy(user)) cards.push(allergyCard(user));
  if (user.tags.includes("pharmacy") || user.tags.includes("emergency"))
    cards.push(prescriptionCard(user));
  if (
    user.tags.includes("lab") ||
    user.tags.includes("claim") ||
    user.tags.includes("cross_border")
  )
    cards.push(labCard(user));
  if (user.tags.includes("medical_certificate"))
    cards.push(medicalCertificateCard(user));
  if (user.tags.includes("referral") || user.tags.includes("cross_border"))
    cards.push(referralCard(user));
  if (user.tags.includes("insurance") || user.tags.includes("claim"))
    cards.push(insuranceCard(user));
  if (
    user.tags.includes("travel_document") ||
    user.tags.includes("medical_tourist")
  )
    cards.push(travelCard(user));
  return cards;
}

function buildStaffCards(user: WalletDemoUser): WalletCard[] {
  return [
    baseCard(user, {
      offset: 1,
      cardType: "staff_identity",
      displayName: "บัตรประจำตัวเจ้าหน้าที่โรงพยาบาล",
      displayNameEn: "Hospital Staff Identity",
      documentCategory: "identity_and_access",
      credentialType: "StaffIdentityCredential",
      expiresAt: "2027-07-01T09:00:00.000Z",
      subject: {
        staff: {
          fullNameTh: user.nameTh,
          fullNameEn: user.nameEn,
          staffId: user.carepassId,
          role: "Hospital Administrator",
          email: user.email,
          phone: user.phone,
          photoUrl: user.avatarUrl,
        },
      },
    }),
  ];
}

function identityCard(user: WalletDemoUser): WalletCard {
  return baseCard(user, {
    offset: 1,
    cardType: "patient_identity",
    displayName: "บัตรประจำตัวผู้ป่วย",
    displayNameEn: "Patient ID Card",
    documentCategory: "identity_and_access",
    credentialType: "PatientIdentityCredential",
    expiresAt: "2030-07-01T09:00:00.000Z",
    subject: {
      patient: patientSubject(user),
      organization: organizationSubject(user),
    },
  });
}

function patientSummaryCard(user: WalletDemoUser): WalletCard {
  const medications = user.conditions.map((code) => ({
    name: medicationForCondition(code),
    dose: "ตามแผนการรักษาล่าสุด",
    indication: diagnosisText(code),
  }));
  return baseCard(user, {
    offset: 2,
    cardType: "patient_summary",
    displayName: "สรุปข้อมูลผู้ป่วย",
    displayNameEn: "Patient Summary",
    documentCategory: "clinical_summary",
    credentialType: "PatientSummaryCredential",
    expiresAt: "2028-07-01T09:10:00.000Z",
    subject: {
      patient: patientSubject(user),
      clinical: {
        conditions: user.conditions.map((code) => ({
          code,
          display: diagnosisText(code),
        })),
        allergies: user.allergies.map((agent) => ({
          substance: agent,
          severity: agent.toLowerCase().includes("severe")
            ? "high"
            : "moderate",
        })),
        medications,
        vitalSigns: [
          { display: "Blood pressure", value: "128/78", unit: "mmHg" },
          {
            display: user.conditions.includes("E11") ? "HbA1c" : "SpO2",
            value: user.conditions.includes("E11") ? "7.4" : "98",
            unit: user.conditions.includes("E11") ? "%" : "%",
          },
        ],
        carePlan: "ติดตาม OPD ตามนัดและพกข้อมูล wallet เมื่อรับบริการข้ามหน่วย",
      },
    },
  });
}

function allergyCard(user: WalletDemoUser): WalletCard {
  return baseCard(user, {
    offset: 3,
    cardType: "allergy_alert",
    displayName: "แจ้งเตือนการแพ้",
    displayNameEn: "Allergy Alert",
    documentCategory: "clinical_summary",
    credentialType: "AllergyAlertCredential",
    expiresAt: "2028-07-01T09:20:00.000Z",
    subject: {
      patient: patientSubject(user),
      allergies: user.allergies.map((agent) => ({
        agent,
        severity: agent.toLowerCase().includes("severe") ? "high" : "moderate",
      })),
    },
  });
}

function prescriptionCard(user: WalletDemoUser): WalletCard {
  const medicationName = medicationForCondition(user.conditions[0]);
  return baseCard(user, {
    offset: 4,
    cardType: "prescription",
    displayName: "ใบสั่งยา",
    displayNameEn: "Prescription",
    documentCategory: "medication_and_pharmacy",
    credentialType: "PrescriptionCredential",
    expiresAt: "2026-08-02T07:00:00.000Z",
    subject: {
      patient: patientSubject(user),
      prescriber: {
        name:
          user.hospitalCode === "TCP" ? "นพ.ภาณุ ทะเลใส" : "นพ.ธนวัฒน์ รักษาดี",
        licenseNo: `MD-${user.hospitalCode}-12345`,
      },
      prescription: {
        prescriptionNo: `${user.hospitalCode}-RX-${user.cardBase + 4}`,
        status: "active",
        authoredOn: "2026-07-01T09:20:00.000Z",
        items: [
          {
            medicationName,
            dosageInstruction:
              "รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร",
            quantity: "30 tablets",
            refills: 0,
          },
        ],
      },
      fhir: {
        medicationRequests: [
          {
            name: medicationName,
            instructions: "Take as directed by physician",
          },
        ],
      },
    },
  });
}

function labCard(user: WalletDemoUser): WalletCard {
  const labValue = user.conditions.includes("E11") ? "7.4" : "5.6";
  return baseCard(user, {
    offset: 5,
    cardType: "lab_result",
    displayName: "ผลตรวจแล็บ",
    displayNameEn: "Lab Result",
    documentCategory: "diagnostics_and_results",
    credentialType: "LabResultCredential",
    expiresAt: "2027-07-02T09:30:00.000Z",
    subject: {
      patient: patientSubject(user),
      labReport: {
        reportNo: `${user.hospitalCode}-LAB-${user.cardBase + 5}`,
        laboratory: `${user.hospitalNameTh} Laboratory`,
        specimenCollectedAt: "2026-07-01T08:35:00.000Z",
        reportedAt: "2026-07-01T10:05:00.000Z",
        observations: [
          {
            code: "4548-4",
            display: "HbA1c",
            value: labValue,
            unit: "%",
            referenceRange: "4.0-5.6",
            flag: user.conditions.includes("E11") ? "high" : "normal",
          },
        ],
      },
      observations: [
        {
          code: "4548-4",
          display: "HbA1c",
          value: labValue,
          unit: "%",
          referenceRange: "4.0-5.6",
        },
      ],
    },
  });
}

function medicalCertificateCard(user: WalletDemoUser): WalletCard {
  const practitioner = {
    nameTh:
      user.hospitalCode === "TCP" ? "นพ.ภาณุ ทะเลใส" : "นพ.ธนวัฒน์ รักษาดี",
    name:
      user.hospitalCode === "TCP"
        ? "Dr. Panu Talaysai"
        : "Dr. Thanawat Raksadee",
    licenseNo: `MD-${user.hospitalCode}-12345`,
    role: "Certifying physician",
  };
  const diagnosis = diagnosisText(user.conditions[0]);
  return baseCard(user, {
    offset: 6,
    cardType: "medical_certificate",
    displayName: "ใบรับรองแพทย์",
    displayNameEn: "Medical Certificate",
    documentCategory: "clinical_summary",
    credentialType: "MedicalCertificateCredential",
    expiresAt: "2027-01-01T09:30:00.000Z",
    subject: {
      patient: patientSubject(user),
      certificate: {
        certificateNo: `${user.hospitalCode}-MC-${user.cardBase + 6}`,
        type: "ใบรับรองแพทย์สำหรับใช้ประกอบการรับบริการ",
        issuedFor: "service readiness demo",
        examinationDate: "2026-07-01T09:30:00.000Z",
        issuedAt: "2026-07-01T09:45:00.000Z",
        validUntil: "2027-01-01T09:30:00.000Z",
        diagnosis,
        diagnosisText: diagnosis,
        result:
          "แพทย์ผู้ตรวจรับรองผลตามข้อมูลการตรวจในระบบโรงพยาบาล และสามารถใช้ประกอบการรับบริการได้",
        restrictions: "หลีกเลี่ยงงานหนักหากมีอาการผิดปกติและติดตามตามแพทย์นัด",
        recommendations:
          "นำเอกสารนี้พร้อม Credential ID ให้หน่วยบริการตรวจสอบแหล่งที่มา",
        fitForWork: true,
        fitnessForWork: {
          fit: true,
          note: "ปฏิบัติงานหรือรับบริการได้ตามแพทย์เห็นสมควร",
        },
        practitioner,
        certifyingPractitioner: practitioner,
      },
    },
  });
}

function referralCard(user: WalletDemoUser): WalletCard {
  const reason = diagnosisText(user.conditions[0]);
  return baseCard(user, {
    offset: 7,
    cardType: "referral_vc",
    displayName: "ใบส่งต่อการรักษา",
    displayNameEn: "Referral Credential",
    documentCategory: "care_transition",
    credentialType: "ReferralCredential",
    expiresAt: "2026-10-01T09:30:00.000Z",
    subject: {
      patient: patientSubject(user),
      referral: {
        referralNo: `${user.hospitalCode}-REF-${user.cardBase + 7}`,
        from: user.hospitalName,
        fromHospital: user.hospitalNameTh,
        to: "TrustCare compatible hospital",
        toHospital: "TrustCare compatible hospital",
        requestedService: "OPD follow-up and medication reconciliation",
        requestedServices: [
          "OPD follow-up",
          "Medication reconciliation",
          "Insurance eligibility check",
        ],
        priority: "routine",
        reason,
        clinicalNotes: `ส่งต่อเพื่อดูแลต่อเนื่องเรื่อง ${reason} และตรวจสอบรายการยาเดิมจาก wallet`,
        authoredOn: "2026-07-01T09:35:00.000Z",
        validUntil: "2026-10-01T09:30:00.000Z",
        attachments: [
          "patient_summary",
          "prescription",
          "insurance_eligibility",
        ],
        clinicalSummary: {
          primaryConcern: reason,
          medications: medicationForCondition(user.conditions[0]),
          allergies: user.allergies.join(", "),
        },
      },
    },
  });
}

function insuranceCard(user: WalletDemoUser): WalletCard {
  const payer = {
    name:
      user.source === "trustcare_portal"
        ? "NHSO Demo"
        : "Partner International Plan",
    nameEn:
      user.source === "trustcare_portal"
        ? "NHSO Demo"
        : "Partner International Plan",
    policyNo: `POL-${user.hospitalCode}-${user.cardBase + 8}`,
    status: "eligible",
  };
  const coverage = {
    payer,
    status: "eligible",
    planName:
      user.source === "trustcare_portal"
        ? "Universal Coverage Demo"
        : "International Partner Plan",
    memberId: user.carepassId,
    policyNo: payer.policyNo,
    network: "TrustCare Demo Network",
    coveragePeriod: {
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-12-31T23:59:59.000Z",
    },
    lastCheckedAt: "2026-07-01T09:40:00.000Z",
    copay: "0%",
    directBilling: true,
    preAuthorizationRequired: false,
    benefits: {
      annualLimit: 80000,
      remainingLimit: 73500,
      annualLimitCurrency: "THB",
      opd: "covered",
      ipd: "covered",
      directBilling: true,
      preAuthorizationRequired: false,
      copay: "0%",
    },
    benefitSummary: [
      { benefit: "Direct Billing", limit: "supported", remaining: "-" },
      { benefit: "OPD", limit: "covered", remaining: "73,500 THB" },
      { benefit: "Pre-authorization", limit: "not required", remaining: "-" },
    ],
  };
  return baseCard(user, {
    offset: 8,
    cardType: "insurance_eligibility",
    displayName: "สิทธิประกันสุขภาพ",
    displayNameEn: "Insurance Eligibility",
    documentCategory: "claims_and_finance",
    credentialType: "InsuranceEligibilityCredential",
    expiresAt: "2027-07-01T09:30:00.000Z",
    subject: {
      patient: patientSubject(user),
      payer,
      coverage,
    },
  });
}

function travelCard(user: WalletDemoUser): WalletCard {
  const passport = user.passport ?? "PX-PASSPORT-DEMO";
  return baseCard(user, {
    offset: 9,
    cardType: "travel_document_verification",
    displayName: "เอกสารผู้ป่วยต่างชาติ",
    displayNameEn: "Travel Document Verification",
    documentCategory: "medical_tourism",
    credentialType: "TravelDocumentVerificationCredential",
    expiresAt: "2026-12-31T09:30:00.000Z",
    subject: {
      patient: patientSubject(user),
      travel: {
        passport,
        passportNumber: passport,
        passportNoMasked: passport.replace(/^(.{2}).+(.{2})$/, "$1****$2"),
        issuingCountry: user.passport ? "GBR" : "THA",
        verificationStatus: "verified",
        visaType: user.passport ? "Medical tourist" : "Domestic patient",
        expiryDate: "2030-12-31T00:00:00.000Z",
        nationality: user.passport ? "international" : "THA",
      },
    },
  });
}

function baseCard(
  user: WalletDemoUser,
  input: {
    offset: number;
    cardType: string;
    displayName: string;
    displayNameEn: string;
    documentCategory: string;
    credentialType: string;
    expiresAt: string;
    subject: Record<string, unknown>;
  },
): WalletCard {
  const cardId = user.cardBase + input.offset;
  const credentialId = `${user.source === "trustcare_portal" ? "TC" : "PX"}-${user.id}-${input.offset}`;
  const issuedAtValue = "2026-07-01T09:00:00.000Z";
  const documentReference = buildDemoDocumentReference(
    user,
    input,
    credentialId,
    issuedAtValue,
  );
  return {
    id: cardId,
    cardType: input.cardType,
    displayName: input.displayName,
    displayNameEn: input.displayNameEn,
    documentCategory: input.documentCategory,
    credentialId,
    credentialStatus: "active",
    credentialType: input.credentialType,
    issuerHospitalName: user.hospitalNameTh,
    issuerDid: user.issuerDid,
    holderDid: user.holderDid,
    patientAvatarUrl: user.avatarUrl,
    createdAt: isoOffset(-40 + input.offset),
    issuedAt: issuedAtValue,
    expiresAt: input.expiresAt,
    ownerUserId: user.id,
    patientId: user.patientId,
    sourceSystem: user.source,
    scopeLabel: user.sourceLabel,
    credentialData: {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://trustcare.network/contexts/wallet-medical-document/v1",
      ],
      id: credentialId,
      type: ["VerifiableCredential", input.credentialType],
      issuer: {
        id: user.issuerDid,
        name: user.hospitalName,
        nameTh: user.hospitalNameTh,
      },
      validFrom: issuedAtValue,
      validUntil: input.expiresAt,
      credentialSubject: {
        id: user.holderDid,
        ...input.subject,
        documentReference,
        source: {
          system: user.source,
          label: user.sourceLabel,
          portalOpenId: user.portalOpenId,
          userId: user.id,
          patientId: user.patientId,
        },
        humanDocument: {
          rendererVersion: "trustcare-wallet-document-renderer-2026.07",
          layout: demoLayoutForDocument(input.cardType),
          sourceSystem: user.sourceLabel,
          fhirResources: demoFhirResourcesForDocument(input.cardType),
          noPortrait: ![
            "patient_identity",
            "staff_identity",
            "travel_document_verification",
          ].includes(input.cardType),
          renderData: {
            hospital: {
              code: user.hospitalCode,
              nameTh: user.hospitalNameTh,
              nameEn: user.hospitalName,
              hcode: user.hospitalCode,
            },
            patient: {
              fullNameTh: user.nameTh,
              fullNameEn: user.nameEn,
              hn: user.hn,
              carepassId: user.carepassId,
              photoUrl: user.avatarUrl,
              avatarUrl: user.avatarUrl,
            },
            document: {
              no: `${user.hospitalCode}-${input.cardType}-${cardId}`,
              qrLabel: "VP",
            },
            issuer: { did: user.issuerDid },
          },
        },
      },
      credentialStatus: {
        id: `${credentialId}#status`,
        type: "TrustCareDemoStatus",
        status: "active",
      },
      evidence: [
        {
          type: "FHIRR4DocumentReferenceEvidence",
          sourceSystem: user.sourceLabel,
          fhirResources: demoFhirResourcesForDocument(input.cardType),
          documentReferenceId: `DocumentReference/${credentialId}`,
          resource: documentReference,
          attachment: documentReference.content[0]?.attachment,
        },
      ],
    },
  } as WalletCard;
}

function buildDemoDocumentReference(
  user: WalletDemoUser,
  input: {
    cardType: string;
    displayName: string;
    displayNameEn: string;
    documentCategory: string;
    expiresAt: string;
  },
  credentialId: string,
  issuedAtValue: string,
) {
  return {
    resourceType: "DocumentReference",
    id: credentialId,
    status: "current",
    docStatus: "final",
    type: {
      coding: [
        {
          system: "https://trustcare.network/fhir/CodeSystem/document-type",
          code: input.cardType,
          display: input.displayNameEn,
        },
      ],
      text: input.displayName,
    },
    category: [
      {
        coding: [
          {
            system:
              "https://trustcare.network/fhir/CodeSystem/document-category",
            code: input.documentCategory,
            display: input.documentCategory,
          },
        ],
      },
    ],
    subject:
      user.role === "staff"
        ? { reference: `Practitioner/${user.carepassId}`, display: user.nameEn }
        : { reference: `Patient/${user.patientId}`, display: user.nameEn },
    date: issuedAtValue,
    author: [
      {
        reference: `Organization/${user.hospitalCode}`,
        display: user.hospitalName,
      },
    ],
    custodian: {
      reference: `Organization/${user.hospitalCode}`,
      display: user.hospitalName,
    },
    content: [
      {
        attachment: {
          contentType:
            input.cardType === "lab_result"
              ? "application/fhir+json"
              : "application/pdf",
          language: "th-TH",
          title: `${input.displayNameEn} - ${credentialId}`,
          creation: issuedAtValue,
          hash: `sha256:demo-${credentialId}`,
          url: `/demo-documents/${credentialId}.pdf`,
        },
        format: {
          system: "https://trustcare.network/fhir/CodeSystem/document-format",
          code: demoLayoutForDocument(input.cardType),
          display: "TrustCare demo rendered document",
        },
      },
    ],
    context: {
      period: { start: issuedAtValue, end: input.expiresAt },
      related: [{ reference: `Credential/${credentialId}` }],
    },
  };
}

function demoLayoutForDocument(cardType: string): string {
  const map: Record<string, string> = {
    patient_identity: "photo_identity_card",
    staff_identity: "staff_badge",
    patient_summary: "clinical_summary_report",
    allergy_alert: "critical_alert_sheet",
    prescription: "prescription_order",
    lab_result: "laboratory_report",
    medical_certificate: "signed_medical_certificate",
    referral_vc: "referral_letter",
    insurance_eligibility: "coverage_eligibility_response",
    travel_document_verification: "travel_document_verification",
  };
  return map[cardType] ?? "clinical_document";
}

function demoFhirResourcesForDocument(cardType: string): string[] {
  const map: Record<string, string[]> = {
    patient_identity: ["Patient", "Organization"],
    staff_identity: ["Practitioner", "PractitionerRole", "Organization"],
    patient_summary: [
      "Composition",
      "Condition",
      "MedicationStatement",
      "AllergyIntolerance",
    ],
    allergy_alert: ["AllergyIntolerance"],
    prescription: ["MedicationRequest", "Practitioner"],
    lab_result: ["DiagnosticReport", "Observation"],
    medical_certificate: ["Composition", "Practitioner"],
    referral_vc: ["ServiceRequest", "DocumentReference"],
    insurance_eligibility: ["CoverageEligibilityResponse", "Coverage"],
    travel_document_verification: ["Patient", "DocumentReference"],
  };
  return map[cardType] ?? ["DocumentReference"];
}

function patientSubject(user: WalletDemoUser) {
  return {
    fullNameTh: user.nameTh,
    fullNameEn: user.nameEn,
    hn: user.hn,
    carepassId: user.carepassId,
    nationalId: user.thaiId,
    passport: user.passport,
    birthDate: user.birthDate,
    gender: user.gender,
    status: "ปกติ",
    photoUrl: user.avatarUrl,
    avatarUrl: user.avatarUrl,
  };
}

function organizationSubject(user: WalletDemoUser) {
  return {
    code: user.hospitalCode,
    name: user.hospitalNameTh,
    nameEn: user.hospitalName,
  };
}

function hasRealAllergy(user: WalletDemoUser): boolean {
  return user.allergies.some(
    (item) => !item.toLowerCase().includes("no known"),
  );
}

function diagnosisText(code: string | undefined): string {
  const map: Record<string, string> = {
    E11: "Type 2 diabetes mellitus",
    I10: "Essential hypertension",
    J45: "Asthma",
    "M17.1": "Knee osteoarthritis",
    M16: "Hip osteoarthritis",
    Z34: "Supervision of normal pregnancy",
  };
  return map[code ?? ""] ?? "General examination";
}

function medicationForCondition(code: string | undefined): string {
  if (code === "E11") return "Metformin 500mg";
  if (code === "I10") return "Amlodipine 5mg";
  if (code === "J45") return "Salbutamol inhaler";
  return "Paracetamol 500mg";
}

import {
  readinessContextLabels,
  type ReadinessContext,
  type ReadinessRequirement,
  type ShlManifestFetchResult,
  type SharePackageMode,
  type VerifierResult,
  type WalletDemoUser,
  type WalletImportResult,
} from "@trustcare/wallet-core";
export type View =
  | "home"
  | "documents"
  | "receive"
  | "share"
  | "prepare"
  | "store"
  | "history"
  | "settings";
export type DocumentsTab = "cards" | "receive" | "store" | "history";
export type StoreFilter = "all" | "vc" | "vp" | "shl" | "oid" | "service";
export type ShareTransport = "vp_qr" | "shl_recommended" | "shl_manifest";
export type PackageProtocol = "vp" | "shl" | "hybrid";
export type TimeAnchor = "record" | "package";
export type DisclosureMode = "full" | "sd" | "zkp";
export type DocumentFlowMode = "request" | "import";

export type DocumentFlowState = {
  mode: DocumentFlowMode;
  requirements: ReadinessRequirement[];
};

export type ShlAccessPolicyState = {
  passcodeRequired: boolean;
  passcode: string;
  expiryHours: number;
  maxAccessCount: number;
  longTermAccess: boolean;
};

export type ServiceReadinessSummary = {
  context: ReadinessContext;
  label: string;
  purpose: string;
  score: number;
  criticalReady: boolean;
  requiredReady: number;
  requiredTotal: number;
  recommendedReady: number;
  recommendedTotal: number;
  missingRequired: number;
  readyLabels: string[];
  missingLabels: string[];
};

export type ScanOutcome = {
  id: string;
  userId: string;
  context: View | ReadinessContext | "qr_scan";
  raw: string;
  payload: string;
  descriptor?: ScanPayloadDescriptor;
  manifestFetch?: ShlManifestFetchResult;
  verifier: VerifierResult;
  importResult: WalletImportResult;
  scannedAt: string;
};

export type ScanPayloadDescriptor = {
  transport:
    "standard_shl" | "shl_web_viewer" | "wallet_scan_url" | "raw_payload";
  payloadKind: "shl" | "vp" | "json" | "oid4vci" | "oid4vp" | "unknown";
  canonicalPayload: string;
  webViewerUrl?: string;
  manifestUrl?: string;
  label?: string;
  passcodeRequired?: boolean;
  expiresAt?: string;
  trustcareBinding?:
    "pending_manifest_vp" | "certified_manifest_vp" | "standard_only";
};

export type SharePublicationState = {
  state: "idle" | "publishing" | "published" | "blocked" | "error";
  message: string;
  warnings: string[];
  artifactUrl?: string;
};

export function emptyPortalInteropFixtures(user: WalletDemoUser) {
  return {
    user,
    counts: {
      cards: 0,
      shlPackages: 0,
      oid4vciOffers: 0,
      oid4vpRequests: 0,
    },
    credentialOfferUrl: "",
    presentationRequestUrl: "",
    shlQrPayload: undefined,
    sampleCredentialIds: [],
    samplePresentationIds: [],
    scope: {
      ownerUserId: user.id,
      patientId: user.patientId,
      holderDid: user.holderDid,
      sourceSystem: user.source,
      portalOpenId: user.portalOpenId,
    },
  };
}

export const categoryLabels: Record<string, { th: string; en: string }> = {
  identity_and_access: { th: "ตัวตนและสิทธิ์", en: "Identity & Access" },
  clinical_summary: { th: "สรุปทางคลินิก", en: "Clinical Summary" },
  medication_and_pharmacy: {
    th: "ยาและเภสัชกรรม",
    en: "Medication & Pharmacy",
  },
  diagnostics_and_results: {
    th: "ผลตรวจและวินิจฉัย",
    en: "Diagnostics & Results",
  },
  care_transition: { th: "ส่งต่อการดูแล", en: "Care Transition" },
  claims_and_finance: { th: "เคลมและการเงิน", en: "Claims & Finance" },
  medical_tourism: { th: "รักษาต่างประเทศ", en: "Medical Tourism" },
  sharing_and_sync: { th: "แชร์และซิงก์", en: "Sharing & Sync" },
  operations: { th: "ปฏิบัติการ", en: "Operations" },
};

export const criticalCardTypes = new Set([
  "patient_identity",
  "staff_identity",
  "allergy_alert",
  "medication_summary",
  "prescription",
  "insurance_eligibility",
  "appointment",
]);

export const readinessPurposeTh: Record<ReadinessContext, string> = {
  opd_visit: "เตรียมเอกสารขั้นต่ำสำหรับลงทะเบียนและเริ่มรับบริการตรวจรักษา",
  emergency: "เตรียมข้อมูลตัวตน แพ้ยา รายการยา และโรคสำคัญให้เข้าถึงได้รวดเร็ว",
  referral: "รวบรวมใบส่งต่อและสรุปข้อมูลทางคลินิกให้โรงพยาบาลปลายทางตรวจรับ",
  cross_border:
    "เตรียมเอกสารที่ตรวจสอบได้สำหรับการรักษาข้ามเครือข่ายหรือข้ามแดน",
  medical_tourist:
    "เตรียมตัวตน เอกสารเดินทาง การเงิน และข้อมูลคลินิกสำหรับ pre-review",
  insurance_claim: "เตรียมสิทธิ์รักษา ข้อมูลคลินิก และเอกสารประกอบการเคลม",
  pharmacy_dispense:
    "เตรียมใบสั่งยา รายการยา การแพ้ยา และตัวตนสำหรับรับยาหรือต่อยา",
};

export const sharePurposeProfiles: Record<
  ReadinessContext,
  {
    recipient: string;
    expiryMinutes: number;
    help: string;
    transport: ShareTransport;
    biometricRequired: boolean;
    fields: Array<{ key: string; label: string }>;
  }
> = {
  opd_visit: {
    recipient: "โรงพยาบาลที่รองรับ TrustCare",
    expiryMinutes: 10,
    help: "เปิดเผยเฉพาะตัวตน ความเสี่ยงสำคัญ รายการยา และสิทธิ์ที่จำเป็นต่อการลงทะเบียน OPD",
    transport: "vp_qr",
    biometricRequired: false,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "allergy", label: "แพ้ยา" },
      { key: "medication", label: "ยา" },
      { key: "clinical_summary", label: "สรุปสุขภาพ" },
      { key: "coverage", label: "สิทธิ์/ประกัน" },
    ],
  },
  emergency: {
    recipient: "ห้องฉุกเฉิน / หน่วยกู้ชีพ",
    expiryMinutes: 60,
    help: "เน้นข้อมูลช่วยชีวิตที่จำเป็นทันที ได้แก่ ตัวตน แพ้ยา ยาปัจจุบัน โรคสำคัญ และผู้ติดต่อฉุกเฉิน",
    transport: "vp_qr",
    biometricRequired: true,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "allergy", label: "แพ้ยา" },
      { key: "medication", label: "ยา" },
      { key: "conditions", label: "โรคสำคัญ" },
      { key: "emergency_contact", label: "ติดต่อฉุกเฉิน" },
    ],
  },
  referral: {
    recipient: "โรงพยาบาลปลายทาง",
    expiryMinutes: 1440,
    help: "จัดชุดใบส่งต่อ สรุปคลินิก ผลตรวจ และสิทธิ์ที่เกี่ยวข้องสำหรับรับผู้ป่วยต่อเนื่อง",
    transport: "vp_qr",
    biometricRequired: true,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "referral", label: "ใบส่งต่อ" },
      { key: "clinical_summary", label: "สรุปคลินิก" },
      { key: "diagnostics", label: "ผลตรวจ" },
      { key: "coverage", label: "สิทธิ์/ประกัน" },
    ],
  },
  cross_border: {
    recipient: "หน่วยรับส่งต่อข้ามเครือข่าย",
    expiryMinutes: 1440,
    help: "ใช้ข้อมูลสองภาษา เอกสารส่งต่อ ผลตรวจ และ consent เพื่อให้ปลายทางตรวจรับได้โดยไม่ต้องเปิดเผยเกินจำเป็น",
    transport: "shl_recommended",
    biometricRequired: true,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "referral", label: "ส่งต่อ" },
      { key: "clinical_summary", label: "สรุปคลินิก" },
      { key: "diagnostics", label: "ผลตรวจ" },
      { key: "consent", label: "ความยินยอม" },
    ],
  },
  medical_tourist: {
    recipient: "International Patient Center",
    expiryMinutes: 1440,
    help: "รวมพาสปอร์ต สรุปสุขภาพ ใบเสนอราคา หนังสือรับรองค่าใช้จ่าย และเอกสารวีซ่าเพื่อ pre-review",
    transport: "shl_manifest",
    biometricRequired: true,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "travel_document", label: "พาสปอร์ต" },
      { key: "clinical_summary", label: "สรุปสุขภาพ" },
      { key: "quotation", label: "ใบเสนอราคา" },
      { key: "guarantee", label: "รับรองค่าใช้จ่าย" },
      { key: "visa", label: "วีซ่า" },
    ],
  },
  insurance_claim: {
    recipient: "ฝ่ายเคลม / บริษัทประกัน",
    expiryMinutes: 1440,
    help: "ส่งเฉพาะสิทธิ์ประกัน ชุดเคลม สรุปการรักษา และหลักฐานค่าใช้จ่ายที่จำเป็นต่อการพิจารณา",
    transport: "shl_recommended",
    biometricRequired: true,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "coverage", label: "สิทธิ์ประกัน" },
      { key: "claim", label: "ชุดเคลม" },
      { key: "clinical_summary", label: "สรุปการรักษา" },
      { key: "receipt", label: "ใบเสร็จ" },
    ],
  },
  pharmacy_dispense: {
    recipient: "ห้องยา / ร้านยาเครือข่าย",
    expiryMinutes: 60,
    help: "ให้ห้องยาตรวจใบสั่งยา รายการยาปัจจุบัน ประวัติจ่ายยา และข้อมูลแพ้ยาก่อนจ่ายยา",
    transport: "vp_qr",
    biometricRequired: true,
    fields: [
      { key: "identity", label: "ตัวตน" },
      { key: "prescription", label: "ใบสั่งยา" },
      { key: "medication", label: "ยาปัจจุบัน" },
      { key: "allergy", label: "แพ้ยา" },
      { key: "dispense_history", label: "ประวัติจ่ายยา" },
    ],
  },
};

export const protocolProfiles: Record<
  PackageProtocol,
  { label: string; description: string; badge: string }
> = {
  vp: {
    label: "VC/VP",
    description:
      "ชุดเล็ก ตรวจสิทธิ์หรือเอกสารสำคัญแบบ purpose-bound และรองรับ selective disclosure",
    badge: "VP QR",
  },
  shl: {
    label: "SHL",
    description:
      "ชุดข้อมูลขนาดใหญ่หรือใช้ต่อเนื่อง เช่น ผลตรวจหลายรายการ วัคซีน หรือประวัติการรักษา",
    badge: "SHL",
  },
  hybrid: {
    label: "SHL + Manifest VP",
    description:
      "ใช้ SHL เป็น transport และใช้ VC/VP เป็นชั้นความน่าเชื่อถือสำหรับ TrustCare verifier",
    badge: "Certified SHL",
  },
};

export const defaultShlPolicy: ShlAccessPolicyState = {
  passcodeRequired: true,
  passcode: "246810",
  expiryHours: 24,
  maxAccessCount: 5,
  longTermAccess: false,
};

export const vpDisclosureFields = [
  { key: "identity", label: "ตัวตน" },
  { key: "clinical_summary", label: "สรุปสุขภาพ" },
  { key: "medication", label: "ยา" },
  { key: "diagnostics", label: "ผลตรวจ" },
  { key: "coverage", label: "สิทธิ์/ประกัน" },
  { key: "consent", label: "ความยินยอม" },
];

export function protocolForTransport(
  transport: ShareTransport,
): PackageProtocol {
  if (transport === "shl_manifest") return "hybrid";
  if (transport === "shl_recommended") return "shl";
  return "vp";
}

export function defaultShlPolicyForContext(
  context: ReadinessContext,
): ShlAccessPolicyState {
  if (context === "emergency")
    return {
      passcodeRequired: false,
      passcode: "",
      expiryHours: 1,
      maxAccessCount: 8,
      longTermAccess: false,
    };
  if (context === "pharmacy_dispense")
    return {
      passcodeRequired: true,
      passcode: "8642",
      expiryHours: 2,
      maxAccessCount: 3,
      longTermAccess: false,
    };
  if (context === "medical_tourist" || context === "cross_border") {
    return {
      passcodeRequired: true,
      passcode: "1973",
      expiryHours: 72,
      maxAccessCount: 8,
      longTermAccess: false,
    };
  }
  return defaultShlPolicy;
}

export function normalizeShlPasscode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function shlPasscodeReady(policy: ShlAccessPolicyState): boolean {
  return (
    !policy.passcodeRequired ||
    normalizeShlPasscode(policy.passcode).length >= 4
  );
}

export function maskShlPasscode(value: string): string {
  const normalized = normalizeShlPasscode(value);
  return normalized
    ? `${"*".repeat(Math.max(normalized.length - 2, 2))}${normalized.slice(-2)}`
    : "";
}

export function shlPolicyExpiry(policy: ShlAccessPolicyState): string {
  const hours = policy.longTermAccess
    ? Math.max(policy.expiryHours, 24 * 30)
    : policy.expiryHours;
  return new Date(Date.now() + hours * 60 * 60_000).toISOString();
}

export function protocolRequiresVp(protocol: PackageProtocol): boolean {
  return protocol === "vp" || protocol === "hybrid";
}

export function protocolRequiresShl(protocol: PackageProtocol): boolean {
  return protocol === "shl" || protocol === "hybrid";
}

export function sharePackageModeForUi(
  protocol: PackageProtocol,
  disclosureMode: DisclosureMode,
  selectedCount: number,
): SharePackageMode {
  if (protocol === "shl") return "StandardSHL";
  if (protocol === "hybrid") return "CertifiedSHLManifestPackage";
  return disclosureMode === "full" && selectedCount <= 1
    ? "DirectVP"
    : "PurposeVP";
}

export function shareTrustStatusLabel(value: string): {
  label: string;
  tone: "green" | "yellow" | "blue";
} {
  if (value === "issuer_signed")
    return { label: "Issuer ลงนามแล้ว", tone: "green" };
  if (value === "trust_artifact")
    return { label: "Trust artifact", tone: "blue" };
  if (value === "patient_provided_unverified") {
    return { label: "ผู้ใช้นำเข้า รอตรวจ", tone: "yellow" };
  }
  return { label: "รอผูกกับ TrustCare", tone: "yellow" };
}

export const readinessContexts = Object.keys(
  readinessContextLabels,
) as ReadinessContext[];

export const viewBreadcrumbLabels: Record<View, string> = {
  home: "หน้าแรก",
  documents: "เอกสาร",
  receive: "รับเอกสาร",
  share: "แชร์",
  prepare: "เตรียมบริการ",
  store: "คลังข้อมูล",
  history: "ประวัติ",
  settings: "ตั้งค่า",
};

export const documentTabBreadcrumbLabels: Record<DocumentsTab, string> = {
  cards: "รายการเอกสาร",
  receive: "รับเอกสาร",
  store: "คลังข้อมูล",
  history: "ประวัติ",
};

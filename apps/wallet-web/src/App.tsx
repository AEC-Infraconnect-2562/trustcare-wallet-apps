import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Cloud,
  Copy,
  Database,
  Download,
  Eye,
  Fingerprint,
  FileJson,
  FileText,
  FilePlus2,
  Filter,
  Globe2,
  History,
  Home,
  Inbox,
  KeyRound,
  Languages,
  Layers3,
  Link2,
  ListChecks,
  LockKeyhole,
  LogOut,
  Moon,
  Network,
  Pin,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Share2,
  Smartphone,
  Sun,
  UserCheck,
  Upload,
  Wallet,
} from "lucide-react";
import {
  portalSyncApi,
  shlApi,
  verifierApi,
  walletApi,
} from "@trustcare/api-client";
import { useLanguage } from "@trustcare/i18n/src/provider.web";
import { Badge, Button, Surface, WalletCardView } from "@trustcare/ui-web";
import {
  buildPortalInteroperabilityFixtures,
  buildSharePackage,
  buildMissingDocumentCards,
  buildPurposePickerCards,
  buildReadinessSummary,
  createShareDraftFromPrepare,
  createShareGatewayPublicationRequest,
  createSharePolicy,
  countCardsByCategory,
  buildDocumentRequestPlan,
  assessLocalReadiness,
  createShlViewerUrl,
  createDocumentRequestDraft,
  credentialTypeForDocument,
  documentRequestFormatLabel,
  documentRequestReturnChannelLabel,
  documentRequestSourceLabel,
  exportWalletObject,
  exportWalletObjects,
  flattenCardsByCategory,
  getDemoUser,
  importWalletExchange,
  parseShlLink,
  fetchShlManifest,
  mergePortalSyncedCards,
  mergeWalletObjects,
  normalizePhotoUrl,
  recommendPolicyForDraft,
  readinessContextLabels,
  readinessContextValues,
  shlAccessSummary,
  shareModePatientDescription,
  shareModePatientLabel,
  validateShareDraft,
  walletObjectsFromCards,
  walletObjectsFromHistory,
  walletObjectsFromShl,
  walletDemoUsers,
  type ContractHubCatalog,
  type DocumentPackageScope,
  type DocumentRequestDraft,
  type DocumentRequestFormat,
  type DocumentRequestReturnChannel,
  type DocumentRequestSource,
  type PresentationHistoryItem,
  type ReadinessContext,
  type ReadinessRequirement,
  type ShlPackage,
  type ShlPackageDetail,
  type ShlManifestDocument,
  type ShlManifestFetchResult,
  type WalletCard,
  type WalletCardsByCategory,
  type WalletDocumentRequest,
  type WalletDemoUser,
  type WalletExportResult,
  type WalletImportResult,
  type WalletImportJob,
  type WalletPresentationResponse,
  type WalletStoredObject,
  type VerifierResult,
  type BuiltSharePackage,
  type ShareGatewayPublicationResponse,
  type SharePackageMode,
  type ShareAccessPolicy,
  type ShareValidationResult,
} from "@trustcare/wallet-core";
import { AcquisitionPlanner } from "./components/acquisition/AcquisitionPlanner";
import { DisabledReason } from "./components/common/DisabledReason";
import { ImportHub } from "./components/import/ImportHub";
import { MissingDocumentCard } from "./components/prepare/MissingDocumentCard";
import { PurposePickerCard } from "./components/prepare/PurposePickerCard";
import { ReadinessSummaryCard } from "./components/prepare/ReadinessSummaryCard";
import { SharePacketComposer } from "./components/share/SharePacketComposer";
import { TrustChecklist } from "./components/trust/TrustChecklist";
import { env } from "./env";
import { useOfflineWallet } from "./hooks/useOfflineWallet";
import { useWebAuthn } from "./hooks/useWebAuthn";
import { toQrDataUrl } from "./utils/qrCode";

const CredentialDetailDialog = lazy(() =>
  import("./components/CredentialDetailDialog").then((module) => ({
    default: module.CredentialDetailDialog,
  })),
);
const QrScannerDialog = lazy(() =>
  import("./components/QrScannerDialog").then((module) => ({
    default: module.QrScannerDialog,
  })),
);
const SelectiveDisclosureDialog = lazy(() =>
  import("./components/SelectiveDisclosureDialog").then((module) => ({
    default: module.SelectiveDisclosureDialog,
  })),
);

type View =
  | "home"
  | "documents"
  | "receive"
  | "share"
  | "prepare"
  | "store"
  | "history"
  | "settings";
type DocumentsTab = "cards" | "receive" | "store" | "history";
type StoreFilter = "all" | "vc" | "vp" | "shl" | "oid" | "service";
type ShareTransport = "vp_qr" | "shl_recommended" | "shl_manifest";
type PackageProtocol = "vp" | "shl" | "hybrid";
type TimeAnchor = "record" | "package";
type DisclosureMode = "full" | "sd" | "zkp";
type DocumentFlowMode = "request" | "import";

type DocumentFlowState = {
  mode: DocumentFlowMode;
  requirements: ReadinessRequirement[];
};

type ShlAccessPolicyState = {
  passcodeRequired: boolean;
  passcode: string;
  expiryHours: number;
  maxAccessCount: number;
  longTermAccess: boolean;
};

type ServiceReadinessSummary = {
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

type ScanOutcome = {
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

type ScanPayloadDescriptor = {
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

type SharePublicationState = {
  state: "idle" | "publishing" | "published" | "blocked" | "error";
  message: string;
  warnings: string[];
  artifactUrl?: string;
};

const baseApiOptions = {
  url: env.apiUrl,
  demoMode: env.demoMode,
  demoOrigin:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://trustcare.example.com",
  shlGatewayUrl: env.shlGatewayUrl,
  shlViewerUrl: env.shlViewerUrl,
  shareGatewayUrl: env.shareGatewayUrl,
  portalOrigin: "https://trustcarehealth.live",
  portalSyncMode: "disabled" as const,
};

const isStaticStandaloneRuntime =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith("github.io"));

const walletSessionKey = "trustcare-wallet-active-user";
const defaultLoginUserId = "demo-patient-001";
const scanHistoryStorageKey = "trustcare-wallet-scan-history";
const storedExtrasStorageKey = "trustcare-wallet-store-extras";

function emptyPortalInteropFixtures(user: WalletDemoUser) {
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

const categoryLabels: Record<string, { th: string; en: string }> = {
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

const criticalCardTypes = new Set([
  "patient_identity",
  "staff_identity",
  "allergy_alert",
  "medication_summary",
  "prescription",
  "insurance_eligibility",
  "appointment",
]);

const readinessPurposeTh: Record<ReadinessContext, string> = {
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

const sharePurposeProfiles: Record<
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

const protocolProfiles: Record<
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
    badge: "Hybrid",
  },
};

const defaultShlPolicy: ShlAccessPolicyState = {
  passcodeRequired: true,
  passcode: "246810",
  expiryHours: 24,
  maxAccessCount: 5,
  longTermAccess: false,
};

const vpDisclosureFields = [
  { key: "identity", label: "ตัวตน" },
  { key: "clinical_summary", label: "สรุปสุขภาพ" },
  { key: "medication", label: "ยา" },
  { key: "diagnostics", label: "ผลตรวจ" },
  { key: "coverage", label: "สิทธิ์/ประกัน" },
  { key: "consent", label: "ความยินยอม" },
];

function protocolForTransport(transport: ShareTransport): PackageProtocol {
  if (transport === "shl_manifest") return "hybrid";
  if (transport === "shl_recommended") return "shl";
  return "vp";
}

function defaultShlPolicyForContext(
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

function normalizeShlPasscode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

function shlPasscodeReady(policy: ShlAccessPolicyState): boolean {
  return (
    !policy.passcodeRequired ||
    normalizeShlPasscode(policy.passcode).length >= 4
  );
}

function maskShlPasscode(value: string): string {
  const normalized = normalizeShlPasscode(value);
  return normalized
    ? `${"*".repeat(Math.max(normalized.length - 2, 2))}${normalized.slice(-2)}`
    : "";
}

function shlPolicyExpiry(policy: ShlAccessPolicyState): string {
  const hours = policy.longTermAccess
    ? Math.max(policy.expiryHours, 24 * 30)
    : policy.expiryHours;
  return new Date(Date.now() + hours * 60 * 60_000).toISOString();
}

function protocolRequiresVp(protocol: PackageProtocol): boolean {
  return protocol === "vp" || protocol === "hybrid";
}

function protocolRequiresShl(protocol: PackageProtocol): boolean {
  return protocol === "shl" || protocol === "hybrid";
}

function sharePackageModeForUi(
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

function shareTrustStatusLabel(value: string): { label: string; tone: "green" | "yellow" | "blue" } {
  if (value === "issuer_signed") return { label: "Issuer ลงนามแล้ว", tone: "green" };
  if (value === "trust_artifact") return { label: "Trust artifact", tone: "blue" };
  if (value === "patient_provided_unverified") {
    return { label: "ผู้ใช้นำเข้า รอตรวจ", tone: "yellow" };
  }
  return { label: "รอผูกกับ TrustCare", tone: "yellow" };
}

const readinessContexts = Object.keys(
  readinessContextLabels,
) as ReadinessContext[];

const viewBreadcrumbLabels: Record<View, string> = {
  home: "หน้าแรก",
  documents: "เอกสาร",
  receive: "รับเอกสาร",
  share: "แชร์",
  prepare: "เตรียมบริการ",
  store: "คลังข้อมูล",
  history: "ประวัติ",
  settings: "ตั้งค่า",
};

const documentTabBreadcrumbLabels: Record<DocumentsTab, string> = {
  cards: "รายการเอกสาร",
  receive: "รับเอกสาร",
  store: "คลังข้อมูล",
  history: "ประวัติ",
};

export default function App() {
  const { lang, setLang, t } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<View>("home");
  const [viewHistory, setViewHistory] = useState<View[]>([]);
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("cards");
  const [developerMode, setDeveloperMode] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (typeof window === "undefined") return defaultLoginUserId;
    return window.localStorage.getItem(walletSessionKey) ?? defaultLoginUserId;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(walletSessionKey));
  });
  const [grouped, setGrouped] = useState<WalletCardsByCategory>({});
  const [history, setHistory] = useState<PresentationHistoryItem[]>([]);
  const [shlPackages, setShlPackages] = useState<ShlPackage[]>([]);
  const [selectedCard, setSelectedCard] = useState<WalletCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [presentation, setPresentation] =
    useState<WalletPresentationResponse | null>(null);
  const [verifierResult, setVerifierResult] = useState<VerifierResult | null>(
    null,
  );
  const [scanOutcome, setScanOutcome] = useState<ScanOutcome | null>(null);
  const [scanResponseOpen, setScanResponseOpen] = useState(false);
  const [scanHistoryByUser, setScanHistoryByUser] = useState<
    Record<string, ScanOutcome[]>
  >(() => readScanHistory());
  const [pendingScanPayload, setPendingScanPayload] = useState(() =>
    readScanPayloadFromLocation(),
  );
  const [readinessContext, setReadinessContext] =
    useState<ReadinessContext>("opd_visit");
  const [readiness, setReadiness] = useState<any>(null);
  const [contractHub, setContractHub] = useState<ContractHubCatalog | null>(
    null,
  );
  const [prepareWorkbench, setPrepareWorkbench] = useState<any>(null);
  const [documentRequests, setDocumentRequests] = useState<
    WalletDocumentRequest[]
  >([]);
  const [documentFlow, setDocumentFlow] = useState<DocumentFlowState | null>(
    null,
  );
  const [importJob, setImportJob] = useState<WalletImportJob | null>(null);
  const [storedExtrasByUser, setStoredExtrasByUser] = useState<
    Record<string, WalletStoredObject[]>
  >(() => readStoredExtras());
  const [lastImportMessage, setLastImportMessage] = useState("");
  const [portalSyncMessage, setPortalSyncMessage] = useState("");
  const [portalSyncBusy, setPortalSyncBusy] = useState(false);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const offlineWallet = useOfflineWallet();
  const webAuthn = useWebAuthn();
  const activeUser = useMemo(
    () => getDemoUser(selectedUserId),
    [selectedUserId],
  );
  const apiOptions = useMemo(
    () => ({
      ...baseApiOptions,
      demoMode: isStaticStandaloneRuntime ? true : baseApiOptions.demoMode,
      portalSyncMode: "disabled" as const,
      userId: selectedUserId,
    }),
    [selectedUserId],
  );
  const portalSyncOptions = useMemo(
    () => ({
      ...baseApiOptions,
      demoMode: true,
      portalSyncMode: "live_demo" as const,
      userId: selectedUserId,
    }),
    [selectedUserId],
  );
  const canSyncPortalWallet = portalSyncApi.canUsePortalDemoSync(selectedUserId);
  const interopFixtures = useMemo(() => {
    if (canSyncPortalWallet) return emptyPortalInteropFixtures(activeUser);
    return buildPortalInteroperabilityFixtures(
      selectedUserId,
      baseApiOptions.demoOrigin,
    );
  }, [activeUser, canSyncPortalWallet, selectedUserId]);
  const storedExtras = storedExtrasByUser[selectedUserId] ?? [];
  const scanHistory = scanHistoryByUser[selectedUserId] ?? [];
  const navigateTo = useCallback(
    (nextView: View, options?: { replace?: boolean }) => {
      if (nextView === view) return;
      if (!options?.replace) {
        setViewHistory((previous) => [...previous.slice(-7), view]);
      }
      setView(nextView);
    },
    [view],
  );
  const goBack = useCallback(() => {
    setViewHistory((previous) => {
      const next = [...previous];
      const previousView = next.pop();
      setView(previousView ?? "home");
      return next;
    });
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncPendingScanFromUrl = () => {
      const nextPayload = readScanPayloadFromLocation();
      if (nextPayload) setPendingScanPayload(nextPayload);
    };
    window.addEventListener("hashchange", syncPendingScanFromUrl);
    window.addEventListener("popstate", syncPendingScanFromUrl);
    return () => {
      window.removeEventListener("hashchange", syncPendingScanFromUrl);
      window.removeEventListener("popstate", syncPendingScanFromUrl);
    };
  }, []);

  useEffect(() => {
    writeStoredExtras(storedExtrasByUser);
  }, [storedExtrasByUser]);

  useEffect(() => {
    let cancelled = false;
    async function loadWallet() {
      setPortalSyncMessage("");
      const [cards, walletHistory, shl, hub] = await Promise.all([
        walletApi.cardsByCategory(apiOptions),
        walletApi.history(apiOptions),
        shlApi.listShl(apiOptions),
        walletApi.contractHub(apiOptions),
      ]);
      if (cancelled) return;
      setGrouped(cards);
      setHistory(walletHistory);
      setShlPackages(shl);
      setContractHub(hub);
      void offlineWallet.syncCards(flattenCardsByCategory(cards));
    }
    void loadWallet().catch((error) => {
      if (cancelled) return;
      const message = friendlyWalletRuntimeError(
        error,
        "ไม่สามารถโหลดข้อมูล Wallet ได้",
      );
      setGrouped({});
      setPortalSyncMessage(`โหลดข้อมูล Wallet ไม่สำเร็จ: ${message}`);
    });
    setSelectedCard(null);
    setDetailOpen(false);
    setQrDataUrl("");
    setPresentation(null);
    setVerifierResult(null);
    setScanOutcome(null);
    setScanResponseOpen(false);
    setImportJob(null);
    setLastImportMessage("");
    return () => {
      cancelled = true;
    };
  }, [apiOptions, selectedUserId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      walletApi.readiness(apiOptions, { context: readinessContext }),
      walletApi.prepareWorkbench(apiOptions, { context: readinessContext }),
      walletApi.documentRequests(apiOptions, { context: readinessContext }),
    ])
      .then(([nextReadiness, workbench, requests]) => {
        if (cancelled) return;
        setReadiness(nextReadiness);
        setPrepareWorkbench(workbench);
        setDocumentRequests(requests);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = friendlyWalletRuntimeError(
          error,
          "ไม่สามารถประเมินความพร้อมได้",
        );
        setReadiness(null);
        setPrepareWorkbench(null);
        setDocumentRequests([]);
        setPortalSyncMessage(`ประเมินความพร้อมไม่สำเร็จ: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [apiOptions, readinessContext]);

  const allCards = useMemo(() => {
    const online = flattenCardsByCategory(grouped);
    return online.length
      ? online
      : offlineWallet.offlineCards.filter(
          (card) => card.ownerUserId === selectedUserId,
        );
  }, [grouped, offlineWallet.offlineCards, selectedUserId]);

  useEffect(() => {
    if (!allCards.length) return;
    const nextReadiness = assessLocalReadiness(allCards, readinessContext);
    setReadiness((previous: any) =>
      previous
        ? { ...previous, readiness: nextReadiness }
        : {
            patientId: activeUser.patientId,
            readiness: nextReadiness,
            requests: [],
            previousChecks: [],
          },
    );
    setPrepareWorkbench((previous: any) =>
      previous
        ? {
            ...previous,
            patient: { ...previous.patient, readiness: nextReadiness },
          }
        : previous,
    );
  }, [activeUser.patientId, allCards, readinessContext]);

  const counts = useMemo(() => countCardsByCategory(grouped), [grouped]);
  const serviceReadinessSummaries = useMemo<ServiceReadinessSummary[]>(
    () =>
      readinessContexts.map((context) => {
        const result = assessLocalReadiness(allCards, context);
        return {
          context,
          label: readinessContextLabels[context].th,
          purpose: readinessPurposeTh[context],
          score: result.score ?? 0,
          criticalReady: Boolean(result.criticalReady),
          requiredReady: result.requiredReady ?? 0,
          requiredTotal: result.requiredTotal ?? 0,
          recommendedReady: result.recommendedReady ?? 0,
          recommendedTotal: result.recommendedTotal ?? 0,
          missingRequired: (result.missing ?? []).filter(
            (item) => item.required,
          ).length,
          readyLabels: (result.ready ?? [])
            .map((item) => item.label)
            .slice(0, 4),
          missingLabels: (result.missing ?? [])
            .map((item) => item.label)
            .slice(0, 4),
        };
      }),
    [allCards],
  );
  const scanHistoryObjects = useMemo<WalletStoredObject[]>(
    () =>
      scanHistory.map((item) => ({
        id: `scan_history:${item.id}`,
        type: "document_reference",
        title: `ประวัติการสแกน ${item.verifier.protocol ?? item.importResult.format}`,
        subtitle: item.verifier.requestSummary ?? item.importResult.format,
        status: item.verifier.verified ? "verified" : "pending",
        protocol:
          item.importResult.protocol === "shl"
            ? "shl"
            : item.importResult.protocol === "oid4vci"
              ? "oid4vci"
              : item.importResult.protocol === "oid4vp"
                ? "oid4vp"
                : "trustcare",
        createdAt: item.scannedAt,
        payload: item,
      })),
    [scanHistory],
  );

  const storedObjects = useMemo(
    () =>
      mergeWalletObjects(
        walletObjectsFromCards(allCards),
        walletObjectsFromHistory(history),
        walletObjectsFromShl(shlPackages),
        scanHistoryObjects,
        storedExtras,
      ),
    [allCards, history, scanHistoryObjects, shlPackages, storedExtras],
  );

  const filteredObjects = useMemo(() => {
    if (storeFilter === "all") return storedObjects;
    if (storeFilter === "oid")
      return storedObjects.filter(
        (item) =>
          item.type === "oid4vci_offer" || item.type === "oid4vp_request",
      );
    if (storeFilter === "service")
      return storedObjects.filter(
        (item) =>
          item.type === "service_packet" ||
          item.id.startsWith("service_bundle:"),
      );
    return storedObjects.filter((item) => item.type === storeFilter);
  }, [storeFilter, storedObjects]);

  const addStoredObject = useCallback(
    (object: WalletStoredObject) => {
      setStoredExtrasByUser((previous) => ({
        ...previous,
        [selectedUserId]: mergeWalletObjects(previous[selectedUserId] ?? [], [
          object,
        ]),
      }));
    },
    [selectedUserId],
  );

  const syncActiveWalletFromPortal = useCallback(async () => {
    if (!canSyncPortalWallet) {
      setPortalSyncMessage("Wallet นี้ไม่ได้ผูกกับ TrustCare Portal จึงไม่สามารถ Sync จาก Portal ได้");
      return;
    }
    setPortalSyncBusy(true);
    setPortalSyncMessage("กำลัง Sync VC/VP จาก TrustCare Portal...");
    try {
      const result = await portalSyncApi.syncTrustCarePortalWallet({
        ...portalSyncOptions,
        currentCards: allCards,
      });
      if (result.report.ownerUserId !== selectedUserId) {
        throw new Error(
          `Portal sync owner mismatch: expected ${selectedUserId}, received ${result.report.ownerUserId}`,
        );
      }
      const syncedCards = flattenCardsByCategory(result.cardsByCategory);
      if (syncedCards.some((card) => card.ownerUserId !== selectedUserId)) {
        throw new Error("Portal sync returned credentials for another wallet user");
      }
      const mergedSync = mergePortalSyncedCards({
        existingCards: allCards,
        incomingCards: syncedCards,
        syncedAt: result.report.syncedAt,
      });
      setGrouped(mergedSync.cardsByCategory);
      setHistory(result.presentations);
      setShlPackages([]);
      if (mergedSync.archivedObjects.length) {
        setStoredExtrasByUser((previous) => ({
          ...previous,
          [selectedUserId]: mergeWalletObjects(
            previous[selectedUserId] ?? [],
            mergedSync.archivedObjects,
          ),
        }));
      }
      await offlineWallet.syncCards(mergedSync.cards);
      const warningText = result.report.warnings.length
        ? ` (${result.report.warnings.join(" / ")})`
        : "";
      setPortalSyncMessage(
        [
          `Sync จาก TrustCare Portal สำเร็จ: ใช้งาน VC ${mergedSync.report.active} รายการ`,
          `เพิ่ม ${mergedSync.report.added}`,
          `อัปเดต ${mergedSync.report.updated}`,
          `ซ้ำเดิม ${mergedSync.report.unchanged}`,
          mergedSync.report.archived ? `เก็บเวอร์ชันเดิม ${mergedSync.report.archived}` : null,
          `และ VP ${result.presentations.length} รายการ สำหรับ ${activeUser.nameTh}${warningText}`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (error) {
      const message = friendlyPortalSyncError(error);
      setPortalSyncMessage(`Sync จาก TrustCare Portal ไม่สำเร็จ: ${message}`);
    } finally {
      setPortalSyncBusy(false);
    }
  }, [
    activeUser,
    allCards,
    canSyncPortalWallet,
    offlineWallet,
    portalSyncOptions,
    selectedUserId,
  ]);

  const addScanHistory = useCallback((outcome: ScanOutcome) => {
    setScanHistoryByUser((previous) => {
      const next = {
        ...previous,
        [outcome.userId]: [outcome, ...(previous[outcome.userId] ?? [])].slice(
          0,
          80,
        ),
      };
      writeScanHistory(next);
      return next;
    });
  }, []);

  const generateQr = useCallback(
    async (fields: string[] = []) => {
      if (!selectedCard) return;
      if (selectedCard.credentialStatus !== "active") {
        alert("Credential นี้ไม่ได้อยู่ในสถานะใช้งานได้");
        return;
      }
      if (webAuthn.isRegistered) {
        const ok = await webAuthn.authenticate();
        if (!ok) return;
      }
      if (!offlineWallet.isOnline && !fields.length) {
        const cached = await offlineWallet.getOfflineQr(selectedCard.id);
        if (cached) {
          setPresentation({
            presentationId: cached.presentationId,
            format: "jwt-vp",
            mode: "offline_cached",
            credentialCount: 1,
            selectedFields: [],
            expiresAt: cached.expiresAt ?? new Date().toISOString(),
            qrData: cached.qrData,
          });
          setQrDataUrl(cached.qrDataUrl);
          return;
        }
      }
      const result = await walletApi.present(apiOptions, {
        cardId: selectedCard.id,
        selectedFields: fields,
        audience: "TrustCare credential verifier",
        validMinutes: 10,
      });
      const scannableQr = createScannableWebUrl(result.qrData);
      const presentationWithWebQr = { ...result, qrData: scannableQr };
      setPresentation(presentationWithWebQr);
      const nextQr = await toQrDataUrl(scannableQr, { margin: 1, width: 260 });
      setQrDataUrl(nextQr);
      await offlineWallet.cacheQr(
        selectedCard.id,
        scannableQr,
        result.presentationId,
        result.expiresAt,
      );
      setSelectiveOpen(false);
    },
    [apiOptions, offlineWallet, selectedCard, webAuthn],
  );

  const importPayload = useCallback(
    (value: string) => {
      const payload = extractScannablePayload(value);
      const result = importWalletExchange(payload, allCards);
      if (result.object) addStoredObject(result.object);
      setLastImportMessage(
        result.ok
          ? `นำเข้า ${result.format}${result.matchedCredentialIds?.length ? ` / ตรงกับเอกสาร ${result.matchedCredentialIds.length} รายการ` : ""}`
          : result.errors.join(", "),
      );
      return result;
    },
    [addStoredObject, allCards],
  );

  const verifyScan = useCallback(
    async (value: string, contextOverride?: ScanOutcome["context"]) => {
      const descriptor = describeScannablePayload(value);
      const payload = descriptor.canonicalPayload;
      const imported = importPayload(payload);
      let manifestFetch: ShlManifestFetchResult | undefined;
      if (descriptor.payloadKind === "shl") {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4500);
        try {
          manifestFetch = await fetchShlManifest(payload, {
            recipient: activeUser.holderDid ?? activeUser.id,
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeout);
        }
      }
      const result = await verifierApi.verifyQr(apiOptions, payload);
      const mergedResult = {
        ...result,
        matchedCredentialIds:
          imported.matchedCredentialIds ?? result.matchedCredentialIds,
        warnings: [
          ...(result.warnings ?? []),
          ...(manifestFetch?.warnings ?? []),
        ],
        errors: [...(result.errors ?? []), ...(manifestFetch?.errors ?? [])],
      };
      const outcome = {
        id: `scan_${selectedUserId}_${Date.now().toString(36)}`,
        userId: selectedUserId,
        context:
          contextOverride ?? (view === "prepare" ? readinessContext : view),
        raw: value,
        payload,
        descriptor,
        manifestFetch,
        verifier: mergedResult,
        importResult: imported,
        scannedAt: new Date().toISOString(),
      } satisfies ScanOutcome;
      setVerifierResult(mergedResult);
      setScanOutcome(outcome);
      setScanResponseOpen(true);
      addScanHistory(outcome);
      setLastImportMessage(
        mergedResult.verified
          ? "สแกน QR และตรวจสอบผ่านแล้ว"
          : "สแกน QR แล้ว แต่ต้องตรวจสอบรายละเอียดเพิ่มเติม",
      );
      navigateTo("share");
    },
    [
      activeUser.holderDid,
      activeUser.id,
      addScanHistory,
      apiOptions,
      importPayload,
      navigateTo,
      readinessContext,
      selectedUserId,
      view,
    ],
  );

  const changeReadinessContext = useCallback((context: ReadinessContext) => {
    setReadinessContext(context);
    setImportJob(null);
    setLastImportMessage("");
  }, []);

  const getMissingRequirements = useCallback(
    (requirements?: ReadinessRequirement[]) => {
      if (requirements?.length) return requirements;
      const fallback = readiness?.readiness?.missing ?? [];
      return fallback as ReadinessRequirement[];
    },
    [readiness],
  );

  const openDocumentFlow = useCallback(
    (mode: DocumentFlowMode, requirements?: ReadinessRequirement[]) => {
      const missing = getMissingRequirements(requirements);
      if (!missing.length) {
        setLastImportMessage(
          mode === "import"
            ? "เอกสารจำเป็นครบแล้ว ยังไม่ต้องนำเข้าเพิ่ม"
            : "เอกสารจำเป็นครบแล้ว ไม่มีรายการที่ต้องขอเพิ่ม",
        );
        return;
      }
      setDocumentFlow({ mode, requirements: missing });
    },
    [getMissingRequirements],
  );

  const submitDocumentFlow = useCallback(
    async (draft: DocumentRequestDraft, mode: DocumentFlowMode) => {
      if (mode === "import") {
        const documentType = draft.requestedDocumentTypes[0] ?? "patient_summary";
        const result = await walletApi.importForService(apiOptions, {
          context: draft.context,
          patientId: activeUser.patientId,
          documentType,
          sourceType: draft.source,
          requestFormat: draft.format,
          returnChannel: draft.returnChannel,
        });
        setImportJob({
          ...(result as WalletImportJob),
          context: draft.context,
        } as WalletImportJob);
        addStoredObject({
          id: `import_job:${result.importId}`,
          type: "document_reference",
          title: `เอกสารนำเข้า: ${documentRequestFormatLabel(draft.format)}`,
          subtitle: documentRequestSourceLabel(draft.source),
          status: "needs_review",
          protocol:
            draft.format === "standard_shl" ||
            draft.format === "certified_shl_manifest"
              ? "shl"
              : draft.format.startsWith("fhir")
                ? "fhir"
                : "document_reference",
          createdAt: new Date().toISOString(),
          payload: {
            ...result,
            draft,
            trustPolicy: "patient_provided_unverified",
            note: "Imported evidence is stored as DocumentReference until a trusted issuer signs it.",
          },
        });
        setLastImportMessage(
          `สร้างงานนำเข้า ${result.importId} แล้ว · ${documentRequestFormatLabel(
            draft.format,
          )} · ยังไม่ยืนยันจนกว่า issuer จะลงนาม`,
        );
        setDocumentFlow(null);
        return;
      }

      const result = await walletApi.requestDocument(apiOptions, {
        context: draft.context,
        patientId: activeUser.patientId,
        documentTypes: draft.requestedDocumentTypes,
        sourceType: draft.source,
        requestFormat: draft.format,
        returnChannel: draft.returnChannel,
        accessPolicy: draft.accessPolicy,
        selectiveDisclosureFields: draft.selectiveDisclosureFields,
      });
      const requestId = (result as any).requestId ?? `wdr_demo_${Date.now()}`;
      setDocumentRequests((prev) => [
        {
          ...(result as WalletDocumentRequest),
          id: (result as any).id ?? requestId,
          requestId,
          context: draft.context,
          documentType: draft.requestedDocumentTypes.join(","),
          sourceType: draft.source,
          sourceName: draft.destinationLabel,
          status: (result as any).status ?? "requested",
          notes: [
            draft.formatLabel,
            documentRequestReturnChannelLabel(draft.returnChannel),
            ...draft.nextSteps,
          ].join(" · "),
          createdAt: new Date().toISOString(),
          requestFormat: draft.format,
          returnChannel: draft.returnChannel,
          packageScope: draft.scope,
          trustPolicy: draft.trustPolicy,
          requestedDocumentTypes: draft.requestedDocumentTypes,
        } as WalletDocumentRequest,
        ...prev,
      ]);
      setLastImportMessage(
        `ส่งคำขอเอกสาร ${requestId} ไปที่ ${draft.destinationLabel} แล้ว · ${draft.formatLabel}`,
      );
      setDocumentFlow(null);
    },
    [activeUser.patientId, addStoredObject, apiOptions],
  );

  const exportResult = useCallback((result: WalletExportResult) => {
    downloadExport(result);
    setLastImportMessage(`ส่งออก ${result.fileName} แล้ว`);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !pendingScanPayload || !allCards.length) return;
    if (
      allCards.some(
        (card) => card.ownerUserId && card.ownerUserId !== selectedUserId,
      )
    )
      return;
    const payload = pendingScanPayload;
    setPendingScanPayload("");
    clearScanPayloadFromLocation();
    void verifyScan(payload, "qr_scan");
  }, [
    allCards,
    isAuthenticated,
    pendingScanPayload,
    selectedUserId,
    verifyScan,
  ]);

  const loginAs = useCallback(
    (userId: string) => {
      window.localStorage.setItem(walletSessionKey, userId);
      setSelectedUserId(userId);
      setIsAuthenticated(true);
      setViewHistory([]);
      setView(pendingScanPayload ? "share" : "home");
    },
    [pendingScanPayload],
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(walletSessionKey);
    setIsAuthenticated(false);
    setViewHistory([]);
    setView("home");
    setSelectedCard(null);
    setDetailOpen(false);
    setVerifierResult(null);
    setScanOutcome(null);
    setScanResponseOpen(false);
  }, []);

  const pageCopy: Record<View, { title: string; subtitle: string }> = {
    home: {
      title: "TrustCare Wallet",
      subtitle: "เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้",
    },
    documents: {
      title: "เอกสารสุขภาพ",
      subtitle: "ค้นหา กรอง ปักหมุด และตรวจดูเอกสารสุขภาพที่ตรวจสอบได้",
    },
    receive: {
      title: "รับเอกสาร",
      subtitle:
        "สแกน วาง หรือ import OID4VCI offer, OID4VP request, SHL และ VC/VP",
    },
    share: {
      title: "แชร์เอกสาร",
      subtitle: "สร้าง VP QR และ selective disclosure ตามวัตถุประสงค์การใช้งาน",
    },
    prepare: {
      title: "เตรียมเข้ารับบริการ",
      subtitle:
        "ตรวจความพร้อมจากกติกา Contract Hub แล้วส่งต่อไปสร้าง QR ในหน้าแชร์",
    },
    store: {
      title: "คลังพกพา",
      subtitle:
        "ตรวจดูและส่งออก VC, VP, SHL, Manifest VP, Holder VC และ sync receipt ในเครื่อง",
    },
    history: {
      title: "ประวัติ",
      subtitle: "ประวัติการแสดงข้อมูล การตรวจสอบ และการแชร์",
    },
    settings: {
      title: "ตั้งค่า",
      subtitle: "ตัวตน ความปลอดภัย ภาษา ธีม และโหมดนักพัฒนา",
    },
  };
  const title = pageCopy[view].title;
  const breadcrumbs = [
    "TrustCare Wallet",
    viewBreadcrumbLabels[view],
    ...(view === "documents"
      ? [documentTabBreadcrumbLabels[documentsTab]]
      : []),
  ];
  const openDocumentsHub = (tab: DocumentsTab = "cards") => {
    navigateTo("documents");
    setDocumentsTab(tab);
  };

  if (!isAuthenticated) {
    return (
      <LoginView
        users={walletDemoUsers}
        pendingScan={Boolean(pendingScanPayload)}
        selectedUserId={selectedUserId}
        onSelect={setSelectedUserId}
        onLogin={loginAs}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="app-top-shell">
        <div className="brand-block">
          <div className="brand-mark">TC</div>
          <div className="brand-copy">
            <strong>TrustCare Wallet</strong>
            <small>เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้</small>
          </div>
        </div>
        <nav className="primary-tabs" aria-label="TrustCare Wallet">
          <NavButton
            active={view === "home"}
            icon={<Home />}
            label="หน้าแรก"
            onClick={() => navigateTo("home")}
          />
          <NavButton
            active={
              view === "documents" ||
              view === "receive" ||
              view === "store" ||
              view === "history"
            }
            icon={<FileText />}
            label="เอกสาร"
            onClick={() => openDocumentsHub("cards")}
          />
          <NavButton
            active={view === "share"}
            icon={<Share2 />}
            label="แชร์"
            onClick={() => navigateTo("share")}
          />
          <NavButton
            active={view === "prepare"}
            icon={<Activity />}
            label="เตรียมบริการ"
            onClick={() => navigateTo("prepare")}
          />
          <NavButton
            active={view === "settings"}
            icon={<Settings />}
            label="ตั้งค่า"
            onClick={() => navigateTo("settings")}
          />
        </nav>
      </header>
      <aside className="side-nav">
        <div className="brand-block">
          <div className="brand-mark">TC</div>
          <div className="brand-copy">
            <strong>TrustCare Wallet</strong>
            <small>เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้</small>
          </div>
        </div>
        <nav>
          <NavButton
            active={view === "home"}
            icon={<Home />}
            label="หน้าแรก"
            onClick={() => navigateTo("home")}
          />
          <NavButton
            active={view === "documents"}
            icon={<FileText />}
            label="เอกสาร"
            onClick={() => navigateTo("documents")}
          />
          <NavButton
            active={view === "receive"}
            icon={<Inbox />}
            label="รับเอกสาร"
            onClick={() => navigateTo("receive")}
          />
          <NavButton
            active={view === "share"}
            icon={<Share2 />}
            label="แชร์"
            onClick={() => navigateTo("share")}
          />
          <NavButton
            active={view === "prepare"}
            icon={<Activity />}
            label="เตรียมบริการ"
            onClick={() => navigateTo("prepare")}
          />
          <NavButton
            active={view === "store"}
            icon={<Database />}
            label="คลังข้อมูล"
            onClick={() => navigateTo("store")}
          />
          <NavButton
            active={view === "history"}
            icon={<History />}
            label="ประวัติ"
            onClick={() => navigateTo("history")}
          />
          <NavButton
            active={view === "settings"}
            icon={<Settings />}
            label="ตั้งค่า"
            onClick={() => navigateTo("settings")}
          />
        </nav>
        <UserScopePanel activeUser={activeUser} onLogout={logout} />
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div className="topbar-title-block">
            <div className="breadcrumb-row">
              <button
                type="button"
                className="back-button"
                onClick={goBack}
                disabled={view === "home" && viewHistory.length === 0}
              >
                <ArrowLeft size={15} /> กลับ
              </button>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                {breadcrumbs.map((item, index) => (
                  <span
                    key={`${item}-${index}`}
                    className={
                      index === breadcrumbs.length - 1 ? "current" : ""
                    }
                  >
                    {item}
                  </span>
                ))}
              </nav>
            </div>
            <h1>{title}</h1>
            <p>{pageCopy[view].subtitle}</p>
          </div>
          <div className="topbar-actions">
            <div className="top-user-session" aria-label="ผู้ใช้ที่เข้าสู่ระบบ">
              <img
                src={resolveAvatarUrl(activeUser.avatarUrl)}
                alt={activeUser.nameEn}
              />
              <span>
                <strong>{activeUser.nameTh}</strong>
                <small>
                  {activeUser.role === "staff" ? "เจ้าหน้าที่" : "ผู้ป่วย"} ·{" "}
                  {activeUser.source === "trustcare_portal"
                    ? "TrustCare Portal"
                    : "Wallet seed"}
                </small>
              </span>
            </div>
            <button className="round-action" aria-label="notification">
              <Bell size={22} />
            </button>
            <button
              className="round-action"
              aria-label="logout"
              onClick={logout}
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="status-strip">
          <div>
            <Wallet size={18} /> <strong>{allCards.length} เอกสาร</strong>
          </div>
          <div className="interop-ok">
            <Network size={18} />{" "}
            {activeUser.source === "trustcare_portal"
              ? "ผู้ใช้จาก TrustCare Portal"
              : "ผู้ใช้จาก Wallet นี้"}
          </div>
          <div>
            <Fingerprint size={18} />{" "}
            <strong>{shortDid(activeUser.holderDid)}</strong>
          </div>
          <div className={offlineWallet.isOnline ? "online" : "offline"}>
            {offlineWallet.isOnline ? t("wallet.online") : t("wallet.offline")}
          </div>
          {developerMode && (
            <div className="developer-chip">
              <KeyRound size={16} /> โหมดนักพัฒนา
            </div>
          )}
          {canSyncPortalWallet && (
            <button
              type="button"
              className="portal-sync-button"
              onClick={syncActiveWalletFromPortal}
              disabled={portalSyncBusy}
            >
              <RefreshCw
                size={18}
                className={portalSyncBusy ? "spin-icon" : undefined}
              />{" "}
              {portalSyncBusy ? "กำลัง Sync" : "Sync Portal"}
            </button>
          )}
          <button type="button" onClick={() => openDocumentsHub("receive")}>
            <Camera size={18} /> {t("wallet.scanQr")}
          </button>
          <button
            type="button"
            onClick={() => exportResult(exportWalletObjects(storedObjects))}
          >
            <Download size={18} /> ส่งออกทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />} ธีม
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === "th" ? "en" : "th")}
          >
            <Languages size={18} /> {lang.toUpperCase()}
          </button>
        </div>

        {lastImportMessage && (
          <div className="toast-line">{lastImportMessage}</div>
        )}
        {portalSyncMessage && (
          <div className="toast-line portal-sync-line">{portalSyncMessage}</div>
        )}

        {view === "home" && (
          <HomeView
            cards={allCards}
            user={activeUser}
            readiness={readiness}
            history={history}
            offlineOnline={offlineWallet.isOnline}
            onOpenCard={(card) => {
              setSelectedCard(card);
              setQrDataUrl("");
              setPresentation(null);
              setDetailOpen(true);
            }}
            onView={navigateTo}
            serviceReadiness={serviceReadinessSummaries}
            activeReadinessContext={readinessContext}
            canSyncPortalWallet={canSyncPortalWallet}
            portalSyncBusy={portalSyncBusy}
            onSyncPortal={() => void syncActiveWalletFromPortal()}
            onPrepareContext={(context) => {
              changeReadinessContext(context);
              navigateTo("prepare");
            }}
          />
        )}
        {view === "documents" && (
          <DocumentsHubView
            tab={documentsTab}
            onTab={setDocumentsTab}
            cards={allCards}
            counts={counts}
            user={activeUser}
            fixtures={interopFixtures}
            livePortalSync={canSyncPortalWallet}
            developerMode={developerMode}
            canSyncPortal={canSyncPortalWallet}
            portalSyncBusy={portalSyncBusy}
            objects={filteredObjects}
            allObjects={storedObjects}
            filter={storeFilter}
            scanHistory={scanHistory}
            history={history}
            onOpenCard={(card) => {
              setSelectedCard(card);
              setQrDataUrl("");
              setPresentation(null);
              setDetailOpen(true);
            }}
            onOpenScanner={() => setScannerOpen(true)}
            onSyncPortal={() => void syncActiveWalletFromPortal()}
            onImportPayload={(value) => {
              importPayload(value);
              setDocumentsTab("store");
            }}
            onCopyFixture={(label, value) => {
              void copyText(value);
              setLastImportMessage(
                `คัดลอก ${label} สำหรับ ${activeUser.nameTh ?? activeUser.nameEn} แล้ว`,
              );
            }}
            onFilter={setStoreFilter}
            onExport={exportResult}
          />
        )}
        {view === "receive" && (
          <ReceiveView
            user={activeUser}
            fixtures={interopFixtures}
            livePortalSync={canSyncPortalWallet}
            developerMode={developerMode}
            canSyncPortal={canSyncPortalWallet}
            portalSyncBusy={portalSyncBusy}
            onOpenScanner={() => setScannerOpen(true)}
            onSyncPortal={() => void syncActiveWalletFromPortal()}
            onImportPayload={(value) => {
              importPayload(value);
              navigateTo("store");
            }}
            onCopyFixture={(label, value) => {
              void copyText(value);
              setLastImportMessage(
                `คัดลอก ${label} สำหรับ ${activeUser.nameTh ?? activeUser.nameEn} แล้ว`,
              );
            }}
          />
        )}
        {view === "share" && (
          <ShareView
            cards={allCards}
            user={activeUser}
            initialPurpose={readinessContext}
            shlPackages={shlPackages}
            verifierResult={verifierResult}
            scanOutcome={scanOutcome}
            biometricEnabled={webAuthn.isRegistered}
            onConfirmBiometric={async () =>
              webAuthn.isRegistered ? webAuthn.authenticate() : true
            }
            onOpenScanner={() => setScannerOpen(true)}
            onVerifyText={(value) => void verifyScan(value)}
            onExport={exportResult}
          />
        )}
        {view === "prepare" && (
          <PrepareView
            user={activeUser}
            cards={allCards}
            context={readinessContext}
            readiness={readiness}
            contractHub={contractHub}
            workbench={prepareWorkbench}
            requests={documentRequests}
            importJob={importJob}
            onContext={changeReadinessContext}
            onPrepareAll={() => navigateTo("share")}
            onRequestMissing={(requirements) =>
              openDocumentFlow("request", requirements)
            }
            onImportMissing={(requirements) =>
              openDocumentFlow("import", requirements)
            }
          />
        )}
        {view === "store" && (
          <StoreView
            user={activeUser}
            objects={filteredObjects}
            allObjects={storedObjects}
            filter={storeFilter}
            onFilter={setStoreFilter}
            onImport={importPayload}
            onExport={exportResult}
          />
        )}
        {view === "history" && (
          <HistoryView history={history} scanHistory={scanHistory} />
        )}
        {view === "settings" && (
          <SettingsView
            webAuthn={webAuthn}
            theme={theme}
            setTheme={setTheme}
            developerMode={developerMode}
            setDeveloperMode={setDeveloperMode}
            user={activeUser}
          />
        )}
      </section>

      {documentFlow && (
        <DocumentFlowDialog
          mode={documentFlow.mode}
          user={activeUser}
          context={readinessContext}
          requirements={documentFlow.requirements}
          onClose={() => setDocumentFlow(null)}
          onSubmit={(draft) => void submitDocumentFlow(draft, documentFlow.mode)}
        />
      )}

      <nav className="bottom-nav">
        <NavButton
          active={view === "home"}
          icon={<Home />}
          label="หน้าแรก"
          onClick={() => navigateTo("home")}
        />
        <NavButton
          active={
            view === "documents" ||
            view === "receive" ||
            view === "store" ||
            view === "history"
          }
          icon={<FileText />}
          label="เอกสาร"
          onClick={() => {
            openDocumentsHub("cards");
          }}
        />
        <NavButton
          active={view === "share"}
          icon={<Share2 />}
          label="แชร์"
          onClick={() => navigateTo("share")}
        />
        <NavButton
          active={view === "prepare"}
          icon={<Activity />}
          label="เตรียม"
          onClick={() => navigateTo("prepare")}
        />
        <NavButton
          active={view === "settings"}
          icon={<Settings />}
          label="ตั้งค่า"
          onClick={() => navigateTo("settings")}
        />
      </nav>

      <Suspense fallback={<DialogLoadingFallback />}>
        {detailOpen && (
          <CredentialDetailDialog
            card={selectedCard}
            open={detailOpen}
            qrDataUrl={qrDataUrl}
            presentation={presentation}
            history={history}
            onClose={() => setDetailOpen(false)}
            onGenerateQr={generateQr}
            onSelectiveDisclosure={() => setSelectiveOpen(true)}
          />
        )}
        {selectiveOpen && (
          <SelectiveDisclosureDialog
            card={selectedCard}
            open={selectiveOpen}
            onClose={() => setSelectiveOpen(false)}
            onConfirm={(fields) => void generateQr(fields)}
          />
        )}
        {scannerOpen && (
          <QrScannerDialog
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={(value) => void verifyScan(value)}
          />
        )}
      </Suspense>
      <ScanResponseDialog
        open={scanResponseOpen}
        outcome={scanOutcome}
        onClose={() => setScanResponseOpen(false)}
        onCopy={copyText}
      />
    </main>
  );
}

function DialogLoadingFallback() {
  return (
    <div className="modal-backdrop" role="status" aria-live="polite">
      <div className="dialog-loading">กำลังเปิดหน้าต่าง...</div>
    </div>
  );
}

function LoginView({
  users,
  pendingScan,
  selectedUserId,
  onSelect,
  onLogin,
}: {
  users: WalletDemoUser[];
  pendingScan: boolean;
  selectedUserId: string;
  onSelect: (userId: string) => void;
  onLogin: (userId: string) => void;
}) {
  const selectedUser = getDemoUser(selectedUserId);
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-block">
          <div className="brand-mark">TC</div>
          <div className="brand-copy">
            <strong>TrustCare Wallet</strong>
            <small>เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้</small>
          </div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">เข้าสู่ระบบทดสอบช่วงพัฒนา</span>
          <h1>เลือกผู้ใช้ทดสอบ</h1>
          <p>
            ช่วงพัฒนายังไม่ต้องใส่ password แต่ Wallet จะแยก scope เอกสาร
            ประวัติ VP, SHL และ Store ตามผู้ใช้ที่ login จริง
          </p>
          {pendingScan && (
            <Badge tone="blue">
              <QrCode size={14} /> มี QR รอประมวลผลหลัง login
            </Badge>
          )}
        </div>
        <div className="login-user-grid">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              className={
                selectedUserId === user.id
                  ? "login-user-card active"
                  : "login-user-card"
              }
              onClick={() => onSelect(user.id)}
            >
              <img src={resolveAvatarUrl(user.avatarUrl)} alt={user.nameEn} />
              <span>
                <strong>{user.nameTh}</strong>
                <small>
                  {user.role === "staff" ? "เจ้าหน้าที่" : "ผู้ป่วย"} ·{" "}
                  {user.sourceLabel}
                </small>
                <em>{user.id}</em>
              </span>
            </button>
          ))}
        </div>
        <Surface className="login-scope-preview">
          <UserCheck size={20} />
          <div>
            <strong>{selectedUser.nameTh}</strong>
            <p>
              {selectedUser.sourceLabel} · {selectedUser.hospitalNameTh}
            </p>
          </div>
          <Badge
            tone={selectedUser.source === "trustcare_portal" ? "green" : "blue"}
          >
            {selectedUser.role === "staff"
              ? "ขอบเขตเจ้าหน้าที่"
              : "ขอบเขตผู้ป่วย"}
          </Badge>
        </Surface>
        <Button onClick={() => onLogin(selectedUserId)}>
          <ShieldCheck size={18} /> เข้าสู่ระบบด้วยผู้ใช้นี้
        </Button>
      </section>
    </main>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactElement;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "nav-button active" : "nav-button"}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function UserScopePanel({
  activeUser,
  onLogout,
}: {
  activeUser: WalletDemoUser;
  onLogout: () => void;
}) {
  return (
    <section className="user-scope-panel">
      <div className="user-scope-card">
        <img
          src={resolveAvatarUrl(activeUser.avatarUrl)}
          alt={activeUser.nameEn}
        />
        <div>
          <strong>{activeUser.nameTh}</strong>
          <small>{activeUser.sourceLabel}</small>
        </div>
      </div>
      <div className="user-session-summary">
        <span>เข้าสู่ระบบแล้ว</span>
        <strong>
          {activeUser.role === "staff" ? "ขอบเขตเจ้าหน้าที่" : "ขอบเขตผู้ป่วย"}
        </strong>
        <small>{activeUser.id}</small>
      </div>
      <p>
        {activeUser.avatarSource === "trustcare_portal"
          ? "รูปภาพจาก TrustCare Portal เดิม"
          : "รูปภาพเสมือนจริงที่สร้างไว้สำหรับ seed ของ Wallet นี้"}
      </p>
      <Button className="secondary" onClick={onLogout}>
        <LogOut size={16} /> ออกจากระบบ
      </Button>
    </section>
  );
}

function HomeView({
  cards,
  user,
  readiness,
  history,
  offlineOnline,
  onOpenCard,
  onView,
  serviceReadiness,
  activeReadinessContext,
  canSyncPortalWallet,
  portalSyncBusy,
  onSyncPortal,
  onPrepareContext,
}: {
  cards: WalletCard[];
  user: WalletDemoUser;
  readiness: any;
  history: PresentationHistoryItem[];
  offlineOnline: boolean;
  onOpenCard: (card: WalletCard) => void;
  onView: (view: View) => void;
  serviceReadiness: ServiceReadinessSummary[];
  activeReadinessContext: ReadinessContext;
  canSyncPortalWallet: boolean;
  portalSyncBusy: boolean;
  onSyncPortal: () => void;
  onPrepareContext: (context: ReadinessContext) => void;
}) {
  const [readinessExpanded, setReadinessExpanded] = useState(false);
  const activeCards = cards.filter(
    (card) => card.credentialStatus === "active",
  );
  const criticalCards = activeCards
    .filter((card) => card.pinned || criticalCardTypes.has(card.cardType))
    .slice(0, 5);
  const recentCards = [...activeCards]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4);
  const nextAppointment = activeCards.find(
    (card) => card.cardType === "appointment",
  );
  const readinessScore = readiness?.readiness?.score ?? 0;
  const readyForService = Boolean(readiness?.readiness?.criticalReady);
  const sortedReadiness = [...serviceReadiness].sort((a, b) => {
    if (Number(b.criticalReady) !== Number(a.criticalReady))
      return Number(b.criticalReady) - Number(a.criticalReady);
    return b.score - a.score;
  });
  const visibleReadiness = readinessExpanded
    ? sortedReadiness
    : sortedReadiness.slice(0, 3);

  return (
    <div className="view-stack">
      <section className="home-hero-grid">
        <Surface className="health-passport-card">
          <span className="eyebrow">Health Passport ส่วนตัว</span>
          <h2>{user.nameEn}</h2>
          <p>{user.persona}</p>
          <div className="passport-chip-row">
            <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>
              {user.sourceLabel}
            </Badge>
            <Badge tone="neutral">{user.hospitalCode}</Badge>
            <Badge tone={offlineOnline ? "green" : "yellow"}>
              {offlineOnline ? "แคชพร้อมใช้งาน" : "โหมดใช้งานออฟไลน์"}
            </Badge>
          </div>
          <div
            className="passport-summary-grid"
            aria-label="ภาพรวม Health Passport"
          >
            <div>
              <span>เอกสารพร้อมใช้</span>
              <strong>{activeCards.length}</strong>
            </div>
            <div>
              <span>เอกสารสำคัญ</span>
              <strong>{criticalCards.length}</strong>
            </div>
            <div>
              <span>นัดหมายถัดไป</span>
              <strong>{nextAppointment ? "มีนัด" : "ไม่มี"}</strong>
            </div>
          </div>
          <div className="home-action-row">
            <Button onClick={() => onView("documents")}>
              <FileText size={18} /> เอกสาร
            </Button>
            {canSyncPortalWallet && (
              <Button
                className="secondary portal-sync-primary"
                onClick={onSyncPortal}
                disabled={portalSyncBusy}
              >
                <RefreshCw
                  size={18}
                  className={portalSyncBusy ? "spin-icon" : undefined}
                />{" "}
                {portalSyncBusy ? "กำลัง Sync" : "Sync Portal"}
              </Button>
            )}
            <Button className="secondary" onClick={() => onView("receive")}>
              <Inbox size={18} /> รับเอกสาร
            </Button>
            <Button className="secondary" onClick={() => onView("share")}>
              <Share2 size={18} /> แชร์
            </Button>
          </div>
        </Surface>
        <Surface className="home-readiness-panel">
          <div className="readiness-ring">{readinessScore}%</div>
          <div className="home-readiness-copy">
            <h3>{readyForService ? "พร้อมเข้ารับบริการ" : "ยังขาดเอกสาร"}</h3>
            <p>
              {readyForService
                ? "เอกสารจำเป็นสำหรับบริบทบริการนี้พร้อมแล้ว"
                : "ตรวจเอกสารที่ขาดก่อนสร้างชุดเอกสารบริการ"}
            </p>
            <div
              className="service-readiness-list"
              aria-label="ความพร้อมแยกตามเรื่องบริการ"
            >
              {visibleReadiness.map((item) => (
                <button
                  key={item.context}
                  type="button"
                  className={`service-readiness-row ${item.context === activeReadinessContext ? "active" : ""}`}
                  onClick={() => onPrepareContext(item.context)}
                >
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.purpose}</small>
                  </span>
                  <span className="service-readiness-meta">
                    <Badge tone={item.criticalReady ? "green" : "yellow"}>
                      {item.criticalReady
                        ? "พร้อม"
                        : `ขาด ${item.missingRequired}`}
                    </Badge>
                    <small>
                      {item.requiredReady}/{item.requiredTotal} จำเป็น
                    </small>
                  </span>
                  <i className="service-readiness-meter" aria-hidden="true">
                    <b style={{ width: `${item.score}%` }} />
                  </i>
                  {readinessExpanded && (
                    <em>
                      พร้อม: {item.readyLabels.join(", ") || "ยังไม่มี"} · ขาด:{" "}
                      {item.missingLabels.join(", ") || "ไม่มี"}
                    </em>
                  )}
                </button>
              ))}
            </div>
            <div className="readiness-action-row">
              <button
                type="button"
                className="link-button"
                onClick={() => setReadinessExpanded((value) => !value)}
              >
                {readinessExpanded
                  ? "ย่อรายละเอียด"
                  : `ดูรายละเอียดทั้งหมด ${serviceReadiness.length} เรื่อง`}
              </button>
              <Button
                className={readyForService ? "green" : "purple"}
                onClick={() => onView("prepare")}
              >
                <ListChecks size={18} /> เตรียมบริการ
              </Button>
            </div>
          </div>
        </Surface>
      </section>

      <section className="critical-strip">
        <div className="section-title-row">
          <div>
            <h2>เอกสารสำคัญที่ปักหมุด</h2>
            <p>
              บัตรตัวตน ประวัติแพ้ยา รายการยา นัดหมาย
              และสิทธิ์รักษาอยู่ใกล้มือเสมอ
            </p>
          </div>
          <Badge tone="green">{criticalCards.length} พร้อมใช้</Badge>
        </div>
        <div className="critical-card-row">
          {criticalCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="critical-card"
              onClick={() => onOpenCard(card)}
            >
              <Pin size={16} />
              <strong>{card.displayNameEn ?? card.displayName}</strong>
              <small>
                {card.expiresAt
                  ? `หมดอายุ ${new Date(card.expiresAt).toLocaleDateString("th-TH")}`
                  : "ไม่มีวันหมดอายุ"}
              </small>
              <Badge
                tone={card.credentialStatus === "active" ? "green" : "red"}
              >
                {statusLabel(card.credentialStatus)}
              </Badge>
            </button>
          ))}
        </div>
      </section>

      <div className="home-two-column">
        <Surface>
          <div className="section-title-row">
            <h2>เอกสารล่าสุด</h2>
            <button
              type="button"
              className="link-button"
              onClick={() => onView("documents")}
            >
              ดูทั้งหมด
            </button>
          </div>
          <div className="compact-list">
            {recentCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpenCard(card)}
              >
                <FileText size={18} />
                <span>
                  <strong>{card.displayNameEn ?? card.displayName}</strong>
                  <small>{categoryLabel(card.documentCategory)}</small>
                </span>
                <Badge tone="green">ตรวจสอบแล้ว</Badge>
              </button>
            ))}
          </div>
        </Surface>
        <Surface>
          <div className="section-title-row">
            <h2>สิ่งที่ควรทำต่อ</h2>
            <Badge tone={nextAppointment ? "blue" : "neutral"}>
              {nextAppointment ? "นัดหมาย" : "พร้อมใช้งาน"}
            </Badge>
          </div>
          {nextAppointment ? (
            <div className="next-action-card">
              <Clock size={20} />
              <strong>
                {nextAppointment.displayNameEn ?? nextAppointment.displayName}
              </strong>
              <span>
                {nextAppointment.expiresAt
                  ? new Date(nextAppointment.expiresAt).toLocaleString("th-TH")
                  : "Upcoming service"}
              </span>
              <Button
                className="secondary"
                onClick={() => onOpenCard(nextAppointment)}
              >
                เปิดเอกสาร
              </Button>
            </div>
          ) : (
            <div className="next-action-card">
              <ShieldCheck size={20} />
              <strong>ยังไม่มีนัดหมายเร่งด่วน</strong>
              <span>แชร์ล่าสุด: {history[0]?.verifierName ?? "ยังไม่มี"}</span>
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}

function DocumentsHubView({
  tab,
  onTab,
  cards,
  counts,
  user,
  fixtures,
  livePortalSync,
  developerMode,
  canSyncPortal,
  portalSyncBusy,
  objects,
  allObjects,
  filter,
  scanHistory,
  history,
  onOpenCard,
  onOpenScanner,
  onSyncPortal,
  onImportPayload,
  onCopyFixture,
  onFilter,
  onExport,
}: {
  tab: DocumentsTab;
  onTab: (tab: DocumentsTab) => void;
  cards: WalletCard[];
  counts: Record<string, number>;
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  livePortalSync: boolean;
  developerMode: boolean;
  canSyncPortal: boolean;
  portalSyncBusy: boolean;
  objects: WalletStoredObject[];
  allObjects: WalletStoredObject[];
  filter: StoreFilter;
  scanHistory: ScanOutcome[];
  history: PresentationHistoryItem[];
  onOpenCard: (card: WalletCard) => void;
  onOpenScanner: () => void;
  onSyncPortal: () => void;
  onImportPayload: (value: string) => void;
  onCopyFixture: (label: string, value: string) => void;
  onFilter: (filter: StoreFilter) => void;
  onExport: (result: WalletExportResult) => void;
}) {
  return (
    <div className="view-stack documents-hub">
      <Surface className="document-hub-tabs">
        <div>
          <span className="eyebrow">ศูนย์เอกสารใน Wallet</span>
          <h2>เอกสาร รับเข้า คลัง และประวัติ</h2>
          <p>
            รวมงานที่เกี่ยวกับเอกสารไว้ในหน้าเดียว ลดเมนูซ้ำบนมือถือ และยังแยก
            scope ตามผู้ใช้ที่ login อยู่
          </p>
        </div>
        <div className="segmented document-tabs">
          <button
            type="button"
            className={tab === "cards" ? "active" : ""}
            onClick={() => onTab("cards")}
          >
            <FileText size={16} /> เอกสาร
          </button>
          <button
            type="button"
            className={tab === "receive" ? "active" : ""}
            onClick={() => onTab("receive")}
          >
            <Inbox size={16} /> รับ
          </button>
          <button
            type="button"
            className={tab === "store" ? "active" : ""}
            onClick={() => onTab("store")}
          >
            <Database size={16} /> คลัง
          </button>
          <button
            type="button"
            className={tab === "history" ? "active" : ""}
            onClick={() => onTab("history")}
          >
            <History size={16} /> ประวัติ
          </button>
        </div>
      </Surface>
      {tab === "cards" && (
        <DocumentsView
          cards={cards}
          counts={counts}
          user={user}
          onOpenCard={onOpenCard}
        />
      )}
      {tab === "receive" && (
        <ReceiveView
          user={user}
          fixtures={fixtures}
          livePortalSync={livePortalSync}
          developerMode={developerMode}
          canSyncPortal={canSyncPortal}
          portalSyncBusy={portalSyncBusy}
          onOpenScanner={onOpenScanner}
          onSyncPortal={onSyncPortal}
          onImportPayload={onImportPayload}
          onCopyFixture={onCopyFixture}
        />
      )}
      {tab === "store" && (
        <StoreView
          user={user}
          objects={objects}
          allObjects={allObjects}
          filter={filter}
          onFilter={onFilter}
          onImport={onImportPayload}
          onExport={onExport}
        />
      )}
      {tab === "history" && (
        <HistoryView history={history} scanHistory={scanHistory} />
      )}
    </div>
  );
}

function DocumentsView({
  cards,
  counts,
  user,
  onOpenCard,
}: {
  cards: WalletCard[];
  counts: Record<string, number>;
  user: WalletDemoUser;
  onOpenCard: (card: WalletCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "expired" | "pinned">(
    "all",
  );
  const categories = useMemo(
    () => ["all", ...Object.keys(counts).filter(Boolean)],
    [counts],
  );
  const pinnedCards = cards
    .filter((card) => card.pinned || criticalCardTypes.has(card.cardType))
    .slice(0, 6);
  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (category !== "all" && card.documentCategory !== category)
        return false;
      if (status === "active" && card.credentialStatus !== "active")
        return false;
      if (status === "expired" && card.credentialStatus !== "expired")
        return false;
      if (
        status === "pinned" &&
        !(card.pinned || criticalCardTypes.has(card.cardType))
      )
        return false;
      if (!needle) return true;
      return [
        card.displayName,
        card.displayNameEn,
        card.cardType,
        card.credentialType,
        card.issuerHospitalName,
        String(card.credentialId),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [cards, category, query, status]);

  return (
    <div className="view-stack">
      <Surface className="documents-command">
        <div>
          <span className="eyebrow">กระเป๋าเอกสารสุขภาพที่ตรวจสอบได้</span>
          <h2>{user.nameEn}</h2>
          <p>
            ค้นหาด้วยประเภทเอกสาร โรงพยาบาล Credential ID สถานะ หรือแหล่งที่มา
            เอกสารสำคัญจะถูกปักหมุดไว้สำหรับการเข้ารับบริการ
          </p>
        </div>
        <div className="trust-chip-row">
          <Badge tone="green">
            <ShieldCheck size={14} /> เชื่อมกับ TrustCare Portal
          </Badge>
          <Badge tone="blue">
            <LockKeyhole size={14} /> พร้อมยืนยันตัวตน
          </Badge>
          <Badge tone="neutral">{cards.length} เอกสาร</Badge>
        </div>
      </Surface>

      <Surface className="document-controls">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาเอกสาร ผู้ออกเอกสาร หรือ Credential ID..."
          />
        </label>
        <label className="filter-box">
          <Filter size={18} />
          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as "all" | "active" | "expired" | "pinned",
              )
            }
          >
            <option value="all">ทุกสถานะ</option>
            <option value="active">ใช้งานได้</option>
            <option value="expired">หมดอายุ</option>
            <option value="pinned">ปักหมุด / สำคัญ</option>
          </select>
        </label>
      </Surface>

      <section className="category-rail" aria-label="Document categories">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            <span>{item === "all" ? "ทั้งหมด" : categoryLabel(item)}</span>
            <strong>
              {item === "all" ? cards.length : (counts[item] ?? 0)}
            </strong>
          </button>
        ))}
      </section>

      <section className="critical-strip compact">
        <div className="section-title-row">
          <h2>เอกสารสำคัญ</h2>
          <Badge tone="green">{pinnedCards.length}</Badge>
        </div>
        <div className="critical-card-row compact">
          {pinnedCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="critical-card"
              onClick={() => onOpenCard(card)}
            >
              <Pin size={16} />
              <strong>{card.displayNameEn ?? card.displayName}</strong>
              <small>{card.issuerHospitalName ?? card.scopeLabel}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="credential-section">
        <div className="section-title-row">
          <div>
            <h2>เอกสาร</h2>
            <p>
              พบ {filteredCards.length} รายการในขอบเขตของ {user.id}
            </p>
          </div>
          <Badge tone="blue">
            {
              filteredCards.filter((card) => card.credentialStatus === "active")
                .length
            }{" "}
            ใช้งานได้
          </Badge>
        </div>
        <div className="cards-grid wallet-grid">
          {filteredCards.map((card) => (
            <WalletCardView
              key={card.id}
              card={card}
              onClick={() => onOpenCard(card)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReceiveView({
  user,
  fixtures,
  livePortalSync,
  developerMode,
  canSyncPortal,
  portalSyncBusy,
  onOpenScanner,
  onSyncPortal,
  onImportPayload,
  onCopyFixture,
}: {
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  livePortalSync: boolean;
  developerMode: boolean;
  canSyncPortal: boolean;
  portalSyncBusy: boolean;
  onOpenScanner: () => void;
  onSyncPortal: () => void;
  onImportPayload: (value: string) => void;
  onCopyFixture: (label: string, value: string) => void;
}) {
  const [payload, setPayload] = useState("");
  return (
    <div className="view-stack">
      <section className="receive-grid">
        <Surface className="receive-card primary">
          <Camera size={26} />
          <div>
            <h2>สแกน QR เอกสารสุขภาพ</h2>
            <p>
              รองรับ SHL, OID4VCI offer, OID4VP request, VP link และ QR
              ตรวจสอบของ TrustCare
            </p>
          </div>
          <Button onClick={onOpenScanner}>
            <QrCode size={18} /> สแกน QR
          </Button>
        </Surface>
        <Surface className="receive-card">
          <Cloud size={26} />
          <div>
            <h2>เชื่อมกับ TrustCare Portal</h2>
            <p>
              {user.source === "trustcare_portal"
                ? "Seed จาก Portal ถูกเชื่อมไว้สำหรับทดสอบ interoperability แล้ว"
                : "ใช้ payload ตัวอย่างด้านล่างเพื่อทดสอบการเชื่อม Wallet นี้กลับไปที่ Portal"}
            </p>
          </div>
          <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>
            {user.sourceLabel}
          </Badge>
        </Surface>
      </section>

      <Surface>
        <ImportHub
          payload={payload}
          livePortalSync={livePortalSync}
          canSyncPortal={canSyncPortal}
          syncBusy={portalSyncBusy}
          onPayload={setPayload}
          onScan={onOpenScanner}
          onSyncPortal={onSyncPortal}
          onImport={() => {
            onImportPayload(payload);
            setPayload("");
          }}
        />
      </Surface>

      {livePortalSync ? (
        <Surface className="fixture-panel developer-panel">
          <div className="section-title-row">
            <div>
              <h2>Payload จาก Portal จริง</h2>
              <p>
                Wallet นี้ใช้ข้อมูลที่ Sync จาก TrustCare Portal โดยตรง
                จึงไม่แสดง fixture ที่สร้างจาก seed local
                เพื่อป้องกันผลทดสอบปนกัน
              </p>
            </div>
            <Badge tone="green">Live Portal Sync</Badge>
          </div>
        </Surface>
      ) : (
        <Surface
          className={
            developerMode
              ? "fixture-panel developer-panel enabled"
              : "fixture-panel developer-panel"
          }
        >
          <div className="section-title-row">
            <div>
              <h2>ชุดทดสอบจาก TrustCare Portal</h2>
              <p>
                สร้างจาก login ที่ใช้งานอยู่เท่านั้น
                ใช้ทดสอบการส่งข้อมูลไปกลับระหว่าง TrustCare Portal และ Wallet
              </p>
            </div>
            <Badge tone={developerMode ? "green" : "neutral"}>
              {developerMode ? "โหมดนักพัฒนา" : "เครื่องมือรับเอกสาร"}
            </Badge>
          </div>
          <div className="fixture-grid">
            <button
              type="button"
              onClick={() => onImportPayload(fixtures.credentialOfferUrl)}
            >
              <KeyRound size={18} />
              <span>
                <strong>Import OID4VCI</strong>
                <small>offer {fixtures.counts.cards} เอกสาร</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onImportPayload(fixtures.presentationRequestUrl)}
            >
              <QrCode size={18} />
              <span>
                <strong>Import OID4VP</strong>
                <small>request ตรงกับเอกสารที่ใช้งานได้</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                onCopyFixture("OID4VP request", fixtures.presentationRequestUrl)
              }
            >
              <Copy size={18} />
              <span>
                <strong>คัดลอก VP Request</strong>
                <small>วางใน Portal verifier</small>
              </span>
            </button>
            <button
              type="button"
              disabled={!fixtures.shlQrPayload}
              onClick={() =>
                fixtures.shlQrPayload &&
                onCopyFixture("SHL payload", fixtures.shlQrPayload)
              }
            >
              <Network size={18} />
              <span>
                <strong>คัดลอก SHL</strong>
                <small>
                  {fixtures.shlQrPayload ? "พร้อมใช้งาน" : "ไม่มีสำหรับ staff"}
                </small>
              </span>
            </button>
          </div>
        </Surface>
      )}
    </div>
  );
}

function WalletView({
  cards,
  counts,
  user,
  fixtures,
  onImportFixture,
  onCopyFixture,
  onOpenCard,
}: {
  cards: WalletCard[];
  counts: Record<string, number>;
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  onImportFixture: (value: string) => void;
  onCopyFixture: (label: string, value: string) => void;
  onOpenCard: (card: WalletCard) => void;
}) {
  const readyCount = cards.filter(
    (card) => card.credentialStatus === "active",
  ).length;
  const interopRows = [
    {
      icon: <Cloud size={18} />,
      label: "TrustCare Portal",
      value:
        user.source === "trustcare_portal" ? "นำเข้าแล้ว" : "ทดสอบเชื่อมโยง",
      detail: user.sourceLabel,
    },
    {
      icon: <Layers3 size={18} />,
      label: "Contract Hub",
      value: "พร้อม",
      detail: "mapping สำหรับเตรียมบริการ",
    },
    {
      icon: <KeyRound size={18} />,
      label: "OID4VCI / OID4VP",
      value: "เปิดใช้งาน",
      detail: "รับ offer และสร้าง VP request",
    },
    {
      icon: <BadgeCheck size={18} />,
      label: "คลัง SHL / VC-VP",
      value: "พร้อมใช้",
      detail: "portable objects",
    },
  ];

  return (
    <div className="view-stack">
      <section className="partner-overview">
        <div className="partner-copy">
          <span className="eyebrow">TrustCare Wallet ส่วนตัว</span>
          <h2>{user.nameEn}</h2>
          <p>
            {user.sourceLabel} · {user.hospitalName}
          </p>
          <div className="scope-grid" aria-label="Active wallet scope">
            <span>
              <small>ผู้ใช้</small>
              <strong>{user.id}</strong>
            </span>
            <span>
              <small>Holder DID</small>
              <strong>{shortDid(user.holderDid)}</strong>
            </span>
            <span>
              <small>รหัสผู้ป่วย</small>
              <strong>{user.patientId}</strong>
            </span>
          </div>
          <div className="chip-row">
            <span>
              {user.source === "trustcare_portal"
                ? "นำเข้าจาก Portal"
                : "สร้างใน Wallet"}
            </span>
            <span>{user.hospitalCode}</span>
            <span>Contract Hub</span>
            <span>OID4VCI</span>
            <span>OID4VP</span>
            <span>SHL</span>
          </div>
        </div>
        <div className="interop-panel">
          {interopRows.map((row) => (
            <div className="interop-row" key={row.label}>
              <span className="interop-icon">{row.icon}</span>
              <span>
                <strong>{row.label}</strong>
                <small>{row.detail}</small>
              </span>
              <b>{row.value}</b>
            </div>
          ))}
        </div>
      </section>
      <Surface className="fixture-panel">
        <div className="section-title-row">
          <div>
            <h2>Payload สำหรับทดสอบเชื่อมต่อ</h2>
            <p>
              {user.id} · สร้าง OID4VCI, OID4VP และ SHL จาก scope
              ผู้ใช้ที่กำลังใช้งาน
            </p>
          </div>
          <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>
            {user.sourceLabel}
          </Badge>
        </div>
        <div className="fixture-grid">
          <button
            type="button"
            onClick={() => onImportFixture(fixtures.credentialOfferUrl)}
          >
            <KeyRound size={18} />
            <span>
              <strong>Import OID4VCI</strong>
              <small>offer {fixtures.counts.cards} เอกสาร</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onImportFixture(fixtures.presentationRequestUrl)}
          >
            <QrCode size={18} />
            <span>
              <strong>Import OID4VP</strong>
              <small>request ตรงกับเอกสารที่ใช้งานได้</small>
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              onCopyFixture("OID4VP request", fixtures.presentationRequestUrl)
            }
          >
            <Copy size={18} />
            <span>
              <strong>คัดลอก VP Request</strong>
              <small>วางใน scanner/import</small>
            </span>
          </button>
          <button
            type="button"
            disabled={!fixtures.shlQrPayload}
            onClick={() =>
              fixtures.shlQrPayload &&
              onCopyFixture("SHL payload", fixtures.shlQrPayload)
            }
          >
            <Network size={18} />
            <span>
              <strong>คัดลอก SHL</strong>
              <small>
                {fixtures.shlQrPayload ? "พร้อมใช้งาน" : "ไม่มีสำหรับ staff"}
              </small>
            </span>
          </button>
        </div>
      </Surface>
      <div className="metric-grid compact">
        <Surface>
          <Wallet size={20} />
          <strong>{cards.length}</strong>
          <span>เอกสารทั้งหมด</span>
        </Surface>
        <Surface>
          <Shield size={20} />
          <strong>{readyCount}</strong>
          <span>พร้อมสร้าง VP</span>
        </Surface>
        <Surface>
          <CheckCircle2 size={20} />
          <strong>{counts.identity_and_access ?? 0}</strong>
          <span>ตัวตนและสิทธิ์</span>
        </Surface>
        <Surface>
          <RefreshCw size={20} />
          <strong>{counts.sharing_and_sync ?? 0}</strong>
          <span>SHL / Sync</span>
        </Surface>
      </div>
      <section className="credential-section">
        <div className="section-title-row">
          <div>
            <h2>เอกสาร</h2>
            <p>
              เลือกเอกสารเพื่อสร้าง VP, QR, selective disclosure หรือ export
              ไปยัง partner flow
            </p>
          </div>
          <Badge tone="blue">{readyCount} พร้อมใช้</Badge>
        </div>
        <div className="cards-grid wallet-grid">
          {cards.map((card) => (
            <WalletCardView
              key={card.id}
              card={card}
              onClick={() => onOpenCard(card)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ShareView({
  cards,
  user,
  initialPurpose,
  shlPackages,
  verifierResult,
  scanOutcome,
  biometricEnabled,
  onConfirmBiometric,
  onOpenScanner,
  onVerifyText,
  onExport,
}: {
  cards: WalletCard[];
  user: WalletDemoUser;
  initialPurpose?: ReadinessContext;
  shlPackages: ShlPackage[];
  verifierResult: VerifierResult | null;
  scanOutcome: ScanOutcome | null;
  biometricEnabled: boolean;
  onConfirmBiometric: () => Promise<boolean>;
  onOpenScanner: () => void;
  onVerifyText: (value: string) => void;
  onExport: (result: WalletExportResult) => void;
}) {
  const [mode, setMode] = useState<"full" | "sd" | "zkp">("full");
  const [credentialInput, setCredentialInput] = useState("");
  const [requestType, setRequestType] = useState("PatientSummaryCredential");
  const [requestQrDataUrl, setRequestQrDataUrl] = useState("");
  const [requestPayload, setRequestPayload] = useState("");
  const shareableCards = useMemo(
    () => cards.filter((card) => card.credentialStatus === "active"),
    [cards],
  );
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [purpose, setPurpose] = useState<ReadinessContext>(
    initialPurpose ?? "opd_visit",
  );
  const [recipient, setRecipient] = useState(
    sharePurposeProfiles.opd_visit.recipient,
  );
  const [expiryMinutes, setExpiryMinutes] = useState(
    sharePurposeProfiles.opd_visit.expiryMinutes,
  );
  const [selectedFields, setSelectedFields] = useState(
    sharePurposeProfiles.opd_visit.fields.map((field) => field.key),
  );
  const [packageProtocol, setPackageProtocol] = useState<PackageProtocol>(
    protocolForTransport(sharePurposeProfiles.opd_visit.transport),
  );
  const [shlPolicy, setShlPolicy] = useState<ShlAccessPolicyState>(
    defaultShlPolicyForContext("opd_visit"),
  );
  const [timeAnchor, setTimeAnchor] = useState<TimeAnchor>("record");
  const [shareQrDataUrl, setShareQrDataUrl] = useState("");
  const [sharePayload, setSharePayload] = useState("");
  const [shareExportPayload, setShareExportPayload] = useState("");
  const [sharePublication, setSharePublication] =
    useState<SharePublicationState>({
      state: "idle",
      message: "",
      warnings: [],
    });
  const shareProfile = sharePurposeProfiles[purpose];
  const previousInitialPurpose = useRef(initialPurpose);

  useEffect(() => {
    if (initialPurpose && initialPurpose !== previousInitialPurpose.current) {
      setPurpose(initialPurpose);
    }
    previousInitialPurpose.current = initialPurpose;
  }, [initialPurpose]);
  const purposeReadiness = useMemo(
    () => assessLocalReadiness(shareableCards, purpose),
    [purpose, shareableCards],
  );
  const purposeSelectedKey = purposeReadiness.selectedCardIds.join("|");

  useEffect(() => {
    const recommendedIds = purposeReadiness.selectedCardIds.length
      ? purposeReadiness.selectedCardIds
      : shareableCards
          .filter((card) => card.pinned || criticalCardTypes.has(card.cardType))
          .slice(0, 3)
          .map((card) => card.id);
    setSelectedCardIds(recommendedIds);
    setSelectedFields(shareProfile.fields.map((field) => field.key));
    setRecipient(shareProfile.recipient);
    setExpiryMinutes(shareProfile.expiryMinutes);
    setPackageProtocol(protocolForTransport(shareProfile.transport));
    setShlPolicy(defaultShlPolicyForContext(purpose));
    setTimeAnchor("record");
    setSharePayload("");
    setShareExportPayload("");
    setShareQrDataUrl("");
    setSharePublication({ state: "idle", message: "", warnings: [] });
  }, [purpose, purposeSelectedKey, shareProfile, shareableCards]);

  const selectedCards = useMemo(
    () => shareableCards.filter((card) => selectedCardIds.includes(card.id)),
    [selectedCardIds, shareableCards],
  );
  const shareGatewayReady = Boolean(currentShareGatewayBaseUrl());
  const sharePackageMode = sharePackageModeForUi(
    packageProtocol,
    mode,
    selectedCards.length,
  );
  const sharePolicy = useMemo<ShareAccessPolicy>(
    () =>
      createSharePolicy({
        mode: sharePackageMode,
        disclosureMode: mode,
        selectedFields: protocolRequiresVp(packageProtocol)
          ? mode === "full"
            ? ["full_vc"]
            : selectedFields
          : [],
        expiryMinutes,
        timelineAnchor: timeAnchor,
        shl: protocolRequiresShl(packageProtocol)
          ? {
              passcodeRequired: shlPolicy.passcodeRequired,
              passcode: shlPolicy.passcode,
              expiryHours: shlPolicy.expiryHours,
              maxAccessCount: shlPolicy.maxAccessCount,
              longTermAccess: shlPolicy.longTermAccess,
            }
          : undefined,
      }),
    [
      expiryMinutes,
      mode,
      packageProtocol,
      selectedFields,
      sharePackageMode,
      shlPolicy,
      timeAnchor,
    ],
  );
  const shareDraft = useMemo(
    () =>
      createShareDraftFromPrepare({
        context: purpose,
        cards: shareableCards,
        readiness: purposeReadiness,
        selectedCardIds,
        ownerUserId: user.id,
        holderDid: user.holderDid,
        recipient,
        purpose: readinessContextLabels[purpose].th,
      }),
    [
      purpose,
      purposeReadiness,
      recipient,
      selectedCardIds,
      shareableCards,
      user.holderDid,
      user.id,
    ],
  );
  const packetRecommendation = useMemo(
    () =>
      recommendPolicyForDraft(shareDraft, {
        recipientSupportsShl: true,
        trustcareCertificationAvailable: shareGatewayReady,
      }),
    [shareDraft, shareGatewayReady],
  );
  const shareValidation = useMemo<ShareValidationResult>(
    () =>
      validateShareDraft(shareDraft, sharePolicy, {
        shareGatewayReady,
        requireResolvableQr: true,
        biometricRequired: shareProfile.biometricRequired,
        biometricReady: biometricEnabled,
        certifiedShlReady: shareGatewayReady,
      }),
    [
      biometricEnabled,
      shareDraft,
      shareGatewayReady,
      sharePolicy,
      shareProfile.biometricRequired,
    ],
  );
  const shareDisabledReason = shareValidation.primaryDisabledReason;
  const selectedTimeline = useMemo(
    () =>
      buildTimelineItems(selectedCards, new Date().toISOString(), timeAnchor),
    [selectedCards, timeAnchor],
  );
  const shareCopyLabel =
    packageProtocol === "vp"
      ? "คัดลอก VP"
      : packageProtocol === "shl"
        ? "คัดลอก SHL"
        : "คัดลอก Hybrid";

  const toggleSelectedCard = (cardId: number) => {
    setSelectedCardIds((previous) =>
      previous.includes(cardId)
        ? previous.filter((id) => id !== cardId)
        : [...previous, cardId],
    );
  };

  const toggleField = (field: string) => {
    setSelectedFields((previous) =>
      previous.includes(field)
        ? previous.filter((item) => item !== field)
        : [...previous, field],
    );
  };

  const createSharePacket = useCallback(async () => {
    if (!selectedCards.length) return;
    if (!shareValidation.ok) {
      setSharePublication({
        state: "blocked",
        message:
          shareValidation.blockers[0]?.message ??
          "ยังสร้างชุดแชร์เอกสารไม่ได้",
        warnings: shareValidation.blockers.map((issue) => issue.fix),
      });
      return;
    }
    const ok = await onConfirmBiometric();
    if (!ok) return;
    setSharePublication({
      state: "publishing",
      message: protocolRequiresShl(packageProtocol)
        ? "กำลัง publish SHL manifest ไปยัง Share Gateway"
        : "กำลัง publish VP ไปยัง Share Gateway",
      warnings: [],
    });
    const createdAt = new Date().toISOString();
    const expiresAt = protocolRequiresShl(packageProtocol)
      ? shlPolicyExpiry(shlPolicy)
      : new Date(Date.now() + expiryMinutes * 60_000).toISOString();
    const shareGatewayBaseUrl = currentShareGatewayBaseUrl();
    if (packageProtocol === "vp" && !shareGatewayBaseUrl) {
      setSharePayload("");
      setShareExportPayload("");
      setShareQrDataUrl("");
      setSharePublication({
        state: "blocked",
        message:
          "ยังไม่ได้ตั้งค่า Share Gateway สำหรับ publish VP ให้เครื่องอื่นสแกนได้",
        warnings: [
          "ตั้งค่า VITE_TRUSTCARE_SHARE_GATEWAY_URL ให้ชี้ TrustCare Portal Backend หรือใช้ local dev gateway ก่อนสร้าง QR ใช้งานจริง.",
        ],
      });
      return;
    }
    const result = buildSharePackage({
      mode: sharePackageMode,
      context: purpose,
      cards: selectedCards,
      selectedCardIds: selectedCards.map((card) => card.id),
      holderDid: user.holderDid,
      recipient,
      purpose: readinessContextLabels[purpose].th,
      selectedFields: sharePolicy.selectedFields,
      expiresAt,
      origin: currentAppBaseUrl(),
      gatewayBaseUrl: shareGatewayBaseUrl ?? undefined,
      viewerBaseUrl: currentAppBaseUrl(),
      shlPolicy: protocolRequiresShl(packageProtocol)
        ? {
            passcodeRequired: shlPolicy.passcodeRequired,
            passcodeHint: shlPolicy.passcodeRequired
              ? maskShlPasscode(shlPolicy.passcode)
              : null,
            maxAccessCount: shlPolicy.maxAccessCount,
            accessCodeDelivery: shlPolicy.passcodeRequired
              ? "separate_channel"
              : "not_required",
          }
        : undefined,
    });
    const exportPayload = JSON.stringify(
      {
        ...result.payload,
        timeline: buildTimelineItems(selectedCards, createdAt, timeAnchor),
        trustcareReadiness: {
          context: purpose,
          label: purposeReadiness.label,
          score: purposeReadiness.score,
          requiredReady: purposeReadiness.requiredReady,
          requiredTotal: purposeReadiness.requiredTotal,
          recommendedReady: purposeReadiness.recommendedReady,
          recommendedTotal: purposeReadiness.recommendedTotal,
          purposeScope: shareProfile.help,
          biometricConfirmed: biometricEnabled,
        },
      },
      null,
      2,
    );
    try {
      if ("presentation" in result) {
        if (!shareGatewayBaseUrl) {
          throw new Error("ยังไม่ได้ตั้งค่า Share Gateway สำหรับ publish VP");
        }
        const publication = await publishVpSharePackage({
          gatewayBaseUrl: shareGatewayBaseUrl,
          result,
          userId: user.id,
          holderDid: user.holderDid,
          purpose,
          recipient,
          expiresAt,
        });
        if (!publication.qrPayload) {
          throw new Error("Share Gateway ไม่ได้ส่ง VP resolver URL กลับมา");
        }
        setSharePayload(publication.qrPayload);
        setShareExportPayload(exportPayload);
        setShareQrDataUrl(
          await toQrDataUrl(publication.qrPayload, { margin: 1, width: 240 }),
        );
        setSharePublication({
          state: "published",
          message:
            "สร้าง VP และ publish เป็น resolver URL แล้ว verifier จะ fetch และตรวจ proof/signature จาก backend ก่อนให้ผลยืนยัน",
          warnings: publication.warnings,
          artifactUrl: publication.publicUrl,
        });
        return;
      }

      const shlPublication = shareGatewayBaseUrl
        ? await publishShlSharePackage({
            gatewayBaseUrl: shareGatewayBaseUrl,
            result,
            userId: user.id,
            holderDid: user.holderDid,
            purpose,
            recipient,
            expiresAt,
          })
        : null;
      const shlQrPayload = shlPublication?.qrPayload ?? result.shl.qrPayload;
      setSharePayload(shlQrPayload);
      setShareExportPayload(exportPayload);
      setShareQrDataUrl(
        await toQrDataUrl(shlQrPayload, { margin: 1, width: 240 }),
      );
      setSharePublication({
        state: "published",
        message: shlPublication
          ? "สร้าง SHL และ publish manifest ให้เครื่องอื่น fetch ได้แล้ว"
          : "สร้าง SHL แบบ static demo resolver แล้ว",
        warnings: shlPublication?.warnings ?? result.shl.warnings ?? [],
        artifactUrl:
          shlPublication?.publicUrl ??
          result.shl.manifestUrl ??
          result.shl.viewerUrl ??
          result.shl.webViewerUrl,
      });
    } catch (error) {
      setSharePayload("");
      setShareExportPayload(exportPayload);
      setShareQrDataUrl("");
      setSharePublication({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Publish share package ไม่สำเร็จ",
        warnings: [],
      });
    }
  }, [
    biometricEnabled,
    expiryMinutes,
    mode,
    onConfirmBiometric,
    packageProtocol,
    purpose,
    purposeReadiness,
    recipient,
    selectedCards,
    sharePolicy,
    sharePackageMode,
    shareProfile,
    shareValidation,
    shlPolicy,
    timeAnchor,
    user,
  ]);

  const createRequest = useCallback(async () => {
    const payload = JSON.stringify({
      response_type: "vp_token",
      response_mode: "direct_post",
      client_id: "did:web:trustcare-wallet.example:verifier",
      nonce: `trustcare-${Date.now().toString(36)}`,
      state: `state-${Date.now().toString(36)}`,
      presentation_definition: {
        id: "trustcare-wallet-request",
        name: "TrustCare Wallet Verification",
        input_descriptors: [
          {
            id: requestType,
            name: requestType,
            constraints: {
              fields: [
                {
                  path: ["$.type"],
                  filter: { const: requestType },
                },
              ],
            },
          },
        ],
      },
    });
    setRequestPayload(payload);
    setRequestQrDataUrl(
      await toQrDataUrl(
        createScannableWebUrl(
          `openid4vp://?request=${encodeURIComponent(payload)}`,
        ),
        { margin: 1, width: 220 },
      ),
    );
  }, [requestType]);

  return (
    <div className="view-stack">
      {scanOutcome && <ScanOutcomePanel outcome={scanOutcome} />}
      <SharePacketComposer
        purpose={purpose}
        recipient={recipient}
        readiness={purposeReadiness}
        selectedCount={selectedCards.length}
        biometricRequired={shareProfile.biometricRequired}
        biometricReady={biometricEnabled}
        recommendation={packetRecommendation}
        mode={sharePackageMode}
        modeLabel={shareModePatientLabel(sharePackageMode)}
        modeDescription={shareModePatientDescription(sharePackageMode)}
        validation={shareValidation}
      />
      <Surface className="share-flow premium-share-flow">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Share flow</span>
            <h2>สร้างชุดแชร์เอกสาร</h2>
            <p>
              เลือกผู้รับ วัตถุประสงค์ เอกสาร และเงื่อนไขการเปิดอ่าน
              ระบบจะแนะนำรูปแบบ QR/VP หรือ SHL ที่เหมาะสม
            </p>
          </div>
          <Badge tone={shareValidation.publishEnabled ? "green" : "yellow"}>
            {shareValidation.publishEnabled
              ? "พร้อมตรวจทาน"
              : "ยังต้องแก้ไข"}
          </Badge>
        </div>
        <div className="share-workspace premium-share-workspace">
          <div className="share-form-column">
            <div className="share-step share-intent-card">
              <span className="step-number">1</span>
              <strong>ตั้งค่าการแชร์</strong>
              <label>
                ผู้รับ
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                />
              </label>
              <label>
                วัตถุประสงค์
                <select
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value as ReadinessContext)
                  }
                >
                  {readinessContextValues.map((context) => (
                    <option key={context} value={context}>
                      {readinessContextLabels[context].th}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                อายุการใช้งาน
                <select
                  value={expiryMinutes}
                  onChange={(event) =>
                    setExpiryMinutes(Number(event.target.value))
                  }
                >
                  <option value={10}>10 นาที</option>
                  <option value={60}>1 ชั่วโมง</option>
                  <option value={1440}>24 ชั่วโมง</option>
                </select>
              </label>
              <div className="share-purpose-summary">
                <Badge
                  tone={purposeReadiness.criticalReady ? "green" : "yellow"}
                >
                  พร้อม {purposeReadiness.requiredReady}/
                  {purposeReadiness.requiredTotal}
                </Badge>
                <span>{shareProfile.help}</span>
              </div>
              <div className="protocol-mini-grid">
                {(Object.keys(protocolProfiles) as PackageProtocol[]).map(
                  (item) => {
                    const itemMode = sharePackageModeForUi(
                      item,
                      mode,
                      selectedCards.length,
                    );
                    const itemDisabled = item === "hybrid" && !shareGatewayReady;
                    return (
                    <button
                      key={item}
                      type="button"
                      className={packageProtocol === item ? "active" : ""}
                      disabled={itemDisabled}
                      onClick={() => setPackageProtocol(item)}
                      title={
                        itemDisabled
                          ? "ต้องมี Share Gateway และ TrustCare manifest service ก่อนสร้าง Certified SHL"
                          : protocolProfiles[item].description
                      }
                    >
                      <strong>{shareModePatientLabel(itemMode)}</strong>
                      <small>{protocolProfiles[item].description}</small>
                    </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="share-step share-document-step">
              <span className="step-number">2</span>
              <strong>
                เอกสารที่เลือกสำหรับ {readinessContextLabels[purpose].th}
              </strong>
              <div className="share-select-list purpose-doc-list">
                {shareDraft.documents.map((document) => {
                  const card = document.card;
                  const trust = shareTrustStatusLabel(document.trustStatus);
                  if (document.status === "missing" || !card) {
                    return (
                      <div key={document.key} className="share-missing-doc-row">
                        <AlertTriangle size={18} />
                        <span>
                          <b>{document.label}</b>
                          <small>
                            {document.labelEn} ·{" "}
                            {document.required ? "จำเป็น" : "แนะนำ"} ·
                            ยังไม่มีใน Wallet
                          </small>
                          {document.sourceHint && (
                            <small>แนะนำขอจาก {document.sourceHint}</small>
                          )}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <label key={document.key} className="share-document-row">
                      <input
                        type="checkbox"
                        checked={Boolean(document.selected)}
                        disabled={document.locked || document.status === "unsupported"}
                        onChange={() => toggleSelectedCard(card.id)}
                      />
                      <span>
                        <b>{document.label}</b>
                        <small>
                          {document.labelEn} ·{" "}
                          {document.required ? "จำเป็น" : "แนะนำ"}
                        </small>
                        <small>
                          {document.locked
                            ? "กำหนดโดยคำขอ verifier"
                            : document.status === "unsupported"
                              ? "รูปแบบนี้ยังไม่รองรับใน flow นี้"
                              : card.issuerHospitalName ?? categoryLabel(card.documentCategory)}
                        </small>
                      </span>
                      <Badge tone={trust.tone}>{trust.label}</Badge>
                    </label>
                  );
                })}
              </div>
              {purposeReadiness.missing.length > 0 && (
                <div className="share-missing-list">
                  <strong>ยังขาดตามวัตถุประสงค์นี้</strong>
                  {purposeReadiness.missing.map((item) => (
                    <span key={item.key}>
                      {item.required ? "จำเป็น" : "แนะนำ"}: {item.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="share-step">
              <span className="step-number">3</span>
              <strong>ข้อมูลที่จะเปิดเผย</strong>
              <p className="share-step-hint">
                {shareProfile.help}{" "}
                เงื่อนไขด้านล่างจะเปลี่ยนตามชนิดชุดเอกสารที่เลือก
              </p>
              {protocolRequiresVp(packageProtocol) && (
                <>
                  <div className="segmented compact">
                    {(["full", "sd", "zkp"] as DisclosureMode[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={mode === item ? "active" : ""}
                        onClick={() => setMode(item)}
                      >
                        {item === "full"
                          ? "Full VC"
                          : item === "sd"
                            ? "SD"
                            : "ZKP"}
                      </button>
                    ))}
                  </div>
                  <div
                    className="field-chip-grid disclosure-field-grid"
                    role="group"
                    aria-label="ข้อมูลที่จะเปิดเผย"
                  >
                    {shareProfile.fields.map((field) => (
                      <button
                        key={field.key}
                        type="button"
                        className={
                          selectedFields.includes(field.key) || mode === "full"
                            ? "active"
                            : ""
                        }
                        disabled={mode === "full"}
                        onClick={() => toggleField(field.key)}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {protocolRequiresShl(packageProtocol) && (
                <div className="shl-policy-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={shlPolicy.passcodeRequired}
                      onChange={(event) =>
                        setShlPolicy({
                          ...shlPolicy,
                          passcodeRequired: event.target.checked,
                          passcode: event.target.checked
                            ? shlPolicy.passcode ||
                              defaultShlPolicyForContext(purpose).passcode
                            : "",
                        })
                      }
                    />{" "}
                    ใช้ PIN/Passcode
                  </label>
                  {shlPolicy.passcodeRequired && (
                    <label className="pin-code-field">
                      PIN ที่ส่งแยกจาก QR
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={shlPolicy.passcode}
                        placeholder="ตั้ง PIN 4-8 หลัก"
                        onChange={(event) =>
                          setShlPolicy({
                            ...shlPolicy,
                            passcode: normalizeShlPasscode(event.target.value),
                          })
                        }
                      />
                      <small>
                        {shlPasscodeReady(shlPolicy)
                          ? `ตั้งค่าแล้ว ${maskShlPasscode(shlPolicy.passcode)} · ส่ง PIN แยกจาก QR`
                          : "กรุณาตั้ง PIN อย่างน้อย 4 หลัก"}
                      </small>
                    </label>
                  )}
                  <label>
                    หมดอายุ
                    <select
                      value={shlPolicy.expiryHours}
                      onChange={(event) =>
                        setShlPolicy({
                          ...shlPolicy,
                          expiryHours: Number(event.target.value),
                        })
                      }
                    >
                      <option value={1}>1 ชม.</option>
                      <option value={4}>4 ชม.</option>
                      <option value={24}>24 ชม.</option>
                      <option value={72}>72 ชม.</option>
                      <option value={720}>30 วัน</option>
                    </select>
                  </label>
                  <label>
                    เปิดได้
                    <select
                      value={shlPolicy.maxAccessCount}
                      onChange={(event) =>
                        setShlPolicy({
                          ...shlPolicy,
                          maxAccessCount: Number(event.target.value),
                        })
                      }
                    >
                      <option value={1}>1 ครั้ง</option>
                      <option value={3}>3 ครั้ง</option>
                      <option value={5}>5 ครั้ง</option>
                      <option value={8}>8 ครั้ง</option>
                      <option value={20}>20 ครั้ง</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="share-review-card">
                <span className="eyebrow">ตรวจทานก่อนสร้าง QR</span>
                <div>
                  <strong>{shareModePatientLabel(sharePackageMode)}</strong>
                  <small>{shareModePatientDescription(sharePackageMode)}</small>
                </div>
                <dl>
                  <div>
                    <dt>ผู้รับ</dt>
                    <dd>{recipient}</dd>
                  </div>
                  <div>
                    <dt>วัตถุประสงค์</dt>
                    <dd>{readinessContextLabels[purpose].th}</dd>
                  </div>
                  <div>
                    <dt>เอกสารที่เลือก</dt>
                    <dd>{shareValidation.selectedReadyCount} รายการ</dd>
                  </div>
                  <div>
                    <dt>หมดอายุ</dt>
                    <dd>
                      {protocolRequiresShl(packageProtocol)
                        ? `${shlPolicy.expiryHours} ชั่วโมง`
                        : `${expiryMinutes} นาที`}
                    </dd>
                  </div>
                </dl>
                {(shareValidation.blockers.length > 0 ||
                  shareValidation.warnings.length > 0) && (
                  <div className="share-validation-list">
                    {shareValidation.blockers.map((issue) => (
                      <span key={issue.key} className="blocked">
                        {issue.message}
                      </span>
                    ))}
                    {shareValidation.warnings.map((issue) => (
                      <span key={issue.key} className="warning">
                        {issue.message}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="segmented compact">
                <button
                  type="button"
                  className={timeAnchor === "record" ? "active" : ""}
                  onClick={() => setTimeAnchor("record")}
                >
                  Record time
                </button>
                <button
                  type="button"
                  className={timeAnchor === "package" ? "active" : ""}
                  onClick={() => setTimeAnchor("package")}
                >
                  Package time
                </button>
              </div>
              <div className="biometric-note">
                <Fingerprint size={18} />
                {shareProfile.biometricRequired
                  ? "วัตถุประสงค์นี้ต้องยืนยัน Biometric ก่อนสร้าง VP"
                  : biometricEnabled
                    ? "จะยืนยัน Biometric ก่อนแสดง QR"
                    : "สามารถเปิด Biometric เพื่อเพิ่มความปลอดภัย"}
              </div>
              <Button
                onClick={() => void createSharePacket()}
                disabled={!shareValidation.publishEnabled}
              >
                <UserCheck size={18} /> ยืนยันและสร้าง QR
              </Button>
              <DisabledReason reason={shareDisabledReason} />
            </div>
          </div>

          <aside className="share-live-panel">
            <div className="share-step output share-result-card">
              <span className="step-number">4</span>
              <strong>ผลลัพธ์ {shareModePatientLabel(sharePackageMode)}</strong>
              <p className="share-step-hint">
                {shareModePatientDescription(sharePackageMode)}
              </p>
              <div
                className={`share-result-readiness ${
                  shareValidation.publishEnabled ? "ready" : "blocked"
                }`}
              >
                {shareValidation.publishEnabled
                  ? "พร้อมตรวจทานและสร้าง QR"
                  : shareValidation.blockers[0]?.message ?? "ยังไม่พร้อมสร้าง QR"}
              </div>
              {sharePublication.state !== "idle" && (
                <div className={`publication-status ${sharePublication.state}`}>
                  <strong>
                    {sharePublication.state === "publishing"
                      ? "กำลัง publish"
                      : sharePublication.state === "published"
                        ? "พร้อมให้สแกน"
                        : sharePublication.state === "blocked"
                          ? "ยังไม่พร้อม"
                          : "publish ไม่สำเร็จ"}
                  </strong>
                  <span>{sharePublication.message}</span>
                  {sharePublication.artifactUrl && (
                    <small className="mono">
                      {sharePublication.artifactUrl}
                    </small>
                  )}
                  {sharePublication.warnings.map((warning) => (
                    <small key={warning}>{warning}</small>
                  ))}
                </div>
              )}
              {shareQrDataUrl ? (
                <img src={shareQrDataUrl} alt="Share package QR" />
              ) : (
                <div className="qr-placeholder">
                  <QrCode size={54} />
                  <span>QR จะแสดงหลังตรวจเงื่อนไขสำเร็จ</span>
                </div>
              )}
              <div className="button-row">
                <Button
                  className="secondary"
                  disabled={!sharePayload}
                  onClick={() => void copyText(sharePayload)}
                >
                  <Copy size={18} /> {shareCopyLabel}
                </Button>
                <Button
                  className="secondary"
                  disabled={!sharePayload}
                  onClick={() =>
                    onExport({
                      ok: true,
                      format:
                        packageProtocol === "vp"
                          ? "trustcare-vp-json"
                          : packageProtocol === "shl"
                            ? "shl-json"
                            : "trustcare-hybrid-vp-shl-json",
                      fileName: `trustcare-${packageProtocol}-share-${Date.now()}.json`,
                      mimeType:
                        packageProtocol === "shl"
                          ? "application/shl+json"
                          : "application/vp+json",
                      data: shareExportPayload || sharePayload,
                      warnings: [],
                    })
                  }
                >
                  <Download size={18} /> ส่งออก
                </Button>
              </div>
            </div>
            <div className="timeline-panel share-timeline-panel">
              <div>
                <span className="eyebrow">Timeline ที่จะส่ง</span>
                <strong>
                  {timeAnchor === "record"
                    ? "ยึดเวลาของ record"
                    : "ยึดเวลาที่จัด package"}
                </strong>
              </div>
              <div className="timeline-list">
                {selectedTimeline.map((item) => (
                  <div
                    key={`${item.id}-${item.recordTimestamp}`}
                    className="timeline-row"
                  >
                    <span>{item.displayDate}</span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.source} · record {item.recordDate} · package{" "}
                      {item.packageDate}
                    </small>
                  </div>
                ))}
                {!selectedTimeline.length && (
                  <p className="muted">เลือกเอกสารเพื่อดู timeline ก่อนแชร์</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </Surface>

      <details className="share-secondary-tools">
        <summary>เครื่องมือตรวจสอบและรายละเอียดทางเทคนิค</summary>
        <Surface className="portal-section verifier-mode-section">
          <div className="portal-card-header">
            <div className="portal-card-title">
              <ShieldCheck size={22} />
              <span>เลือก Mode การตรวจสอบ</span>
            </div>
            <Badge tone="blue">Full VC / SD / ZKP</Badge>
          </div>
          <div className="mode-grid">
            <button
              type="button"
              className={mode === "full" ? "mode-card selected" : "mode-card"}
              aria-pressed={mode === "full"}
              onClick={() => setMode("full")}
            >
              <FileJson size={26} />
              <strong>Full VC</strong>
              <span>ตรวจสอบ VC ทั้งฉบับ เปิดเผยข้อมูลครบ</span>
            </button>
            <button
              type="button"
              className={mode === "sd" ? "mode-card selected" : "mode-card"}
              aria-pressed={mode === "sd"}
              onClick={() => setMode("sd")}
            >
              <Eye size={26} />
              <strong>Selective Disclosure</strong>
              <span>เลือกเปิดเผยเฉพาะฟิลด์ที่ต้องการ</span>
            </button>
            <button
              type="button"
              className={mode === "zkp" ? "mode-card selected" : "mode-card"}
              aria-pressed={mode === "zkp"}
              onClick={() => setMode("zkp")}
            >
              <Fingerprint size={26} />
              <strong>Zero Knowledge Proof</strong>
              <span>พิสูจน์เงื่อนไขโดยไม่เปิดเผยข้อมูลจริง</span>
            </button>
          </div>
        </Surface>

        <div className="verifier-grid">
          <Surface className="portal-section">
          <div className="portal-card-header">
            <div className="portal-card-title">
              <Shield size={22} />
              <span>ตรวจสอบด้วย Credential ID</span>
            </div>
          </div>
          <div className="credential-id-panel">
            <label>Credential ID</label>
            <input
              value={credentialInput}
              onChange={(event) => setCredentialInput(event.target.value)}
              placeholder="vc-studentid-6501001001... หรือ VP URL/JWT/JSON"
            />
            <div className="button-row">
              <Button
                disabled={!credentialInput.trim()}
                onClick={() => onVerifyText(credentialInput.trim())}
              >
                <ShieldCheck size={18} /> ตรวจสอบ
              </Button>
              <Button className="secondary" onClick={onOpenScanner}>
                <Camera size={18} /> สแกน QR
              </Button>
            </div>
            <p>
              {mode === "full"
                ? "ตรวจสอบเอกสารเต็มฉบับ"
                : mode === "sd"
                  ? "เตรียมตรวจแบบ selective disclosure"
                  : "เตรียมตรวจแบบ proof-only"}
            </p>
          </div>
        </Surface>

        <Surface className="portal-section">
          <div className="portal-card-header">
            <div className="portal-card-title">
              <QrCode size={22} />
              <span>สร้าง QR Verification Request</span>
            </div>
          </div>
          <div className="credential-id-panel">
            <label>ประเภท VC ที่ต้องการตรวจ</label>
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
            >
              <option value="PatientSummaryCredential">Patient Summary</option>
              <option value="PatientIdentityCredential">
                Patient Identity
              </option>
              <option value="PrescriptionCredential">Prescription</option>
            </select>
            <Button className="purple" onClick={() => void createRequest()}>
              <QrCode size={18} /> สร้าง QR Request
            </Button>
            {requestQrDataUrl && (
              <div className="request-preview">
                <div className="qr-inline">
                  <img src={requestQrDataUrl} alt="OID4VP request QR" />
                </div>
                <button
                  type="button"
                  onClick={() => void copyText(requestPayload)}
                  className="link-button"
                >
                  คัดลอก OID4VP request
                </button>
              </div>
            )}
          </div>
        </Surface>
      </div>

      {verifierResult && (
        <Surface className="verification-result">
          <div className="result-heading">
            <Badge tone={verifierBadgeTone(verifierResult)}>
              {verifierBadgeLabel(verifierResult)}
            </Badge>
            {verifierResult.protocol && (
              <Badge tone="blue">{verifierResult.protocol}</Badge>
            )}
          </div>
          <h3>{verifierResult.issuer}</h3>
          <p>{verifierResult.requestSummary ?? verifierResult.holderDid}</p>
          {!!verifierResult.matchedCredentialIds?.length && (
            <p className="mono">
              Matched: {verifierResult.matchedCredentialIds.join(", ")}
            </p>
          )}
          {verifierResult.warnings?.map((item) => (
            <small key={item}>{item}</small>
          ))}
          {verifierResult.errors?.map((item) => (
            <small className="error" key={item}>
              {item}
            </small>
          ))}
          {Array.isArray(verifierResult.verificationChecklist) && (
            <TrustChecklist
              title="ผลตรวจความน่าเชื่อถือ"
              items={verifierResult.verificationChecklist}
            />
          )}
        </Surface>
      )}
      <section className="shl-grid">
        {shlPackages.map((shl) => {
          const stored = walletObjectsFromShl([shl])[0];
          return (
            <Surface key={shl.id} className="shl-card">
              <Badge tone={shl.status === "active" ? "green" : "yellow"}>
                {statusLabel(shl.status)}
              </Badge>
              <h3>{shl.label}</h3>
              <p>
                {shl.purpose} / {shl.context}
              </p>
              <ul>
                {shlAccessSummary(shl).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <dl className="details-grid compact">
                <div>
                  <dt>Manifest VC</dt>
                  <dd className="mono">{shl.manifestCredentialId ?? "-"}</dd>
                </div>
                <div>
                  <dt>Holder VP</dt>
                  <dd className="mono">{shl.presentationId ?? "-"}</dd>
                </div>
              </dl>
              {stored && (
                <Button
                  className="secondary"
                  onClick={() => onExport(exportWalletObject(stored))}
                >
                  <Download size={18} /> ส่งออก SHL
                </Button>
              )}
            </Surface>
          );
        })}
      </section>
      </details>
    </div>
  );
}

function DocumentFlowDialog({
  mode,
  user,
  context,
  requirements,
  onClose,
  onSubmit,
}: {
  mode: DocumentFlowMode;
  user: WalletDemoUser;
  context: ReadinessContext;
  requirements: ReadinessRequirement[];
  onClose: () => void;
  onSubmit: (draft: DocumentRequestDraft) => void;
}) {
  const [source, setSource] = useState<DocumentRequestSource | undefined>(
    mode === "import" ? "patient_upload" : undefined,
  );
  const [format, setFormat] = useState<DocumentRequestFormat | undefined>();
  const [scope, setScope] = useState<DocumentPackageScope>(
    requirements.flatMap((item) => item.cardTypes ?? []).length > 1
      ? "document_bundle"
      : "single_document",
  );
  const [returnChannel, setReturnChannel] =
    useState<DocumentRequestReturnChannel | undefined>();
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [expiryHours, setExpiryHours] = useState(24);
  const [maxAccessCount, setMaxAccessCount] = useState(5);
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "identity",
    "clinical_summary",
  ]);

  const plan = useMemo(
    () =>
      buildDocumentRequestPlan({
        context,
        requirements,
        source,
        format,
        scope,
      }),
    [context, format, requirements, scope, source],
  );
  const fallbackReturnChannel =
    plan.returnChannelOptions.find(
      (option) => option.enabled && option.recommended,
    )?.id ??
    plan.returnChannelOptions.find((option) => option.enabled)?.id ??
    "manual_upload";
  const selectedReturnChannel =
    plan.returnChannelOptions.find(
      (option) => option.id === returnChannel && option.enabled,
    )?.id ?? fallbackReturnChannel;
  const hasShlPasscodeError =
    plan.controls.shlAccessPolicy && passcodeRequired && maxAccessCount < 1;

  const submit = () => {
    if (hasShlPasscodeError) return;
    onSubmit(
      createDocumentRequestDraft({
        context,
        requirements,
        source: plan.selectedSource,
        format: plan.selectedFormat,
        scope: plan.selectedScope,
        returnChannel: selectedReturnChannel,
        patientId: user.patientId,
        accessPolicy: plan.controls.shlAccessPolicy
          ? {
              passcodeRequired,
              expiryHours,
              maxAccessCount,
            }
          : undefined,
        selectiveDisclosureFields: plan.controls.selectiveDisclosure
          ? selectedFields
          : undefined,
      }),
    );
  };

  const title = mode === "import" ? "นำเข้าเอกสาร" : "ขอเอกสารที่ขาด";
  const subtitle =
    mode === "import"
      ? "เลือกแหล่งที่มาและรูปแบบไฟล์ ระบบจะเก็บเป็น DocumentReference ก่อน จนกว่าจะมี issuer ลงนาม"
      : "เลือกว่าจะขอเอกสารจากระบบไหน รับกลับมาเป็นรูปแบบใด และต้องมีเงื่อนไขอะไรบ้าง";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="credential-dialog document-flow-dialog">
        <div className="modal-header">
          <div className="dialog-title-stack">
            <div className="breadcrumb-row">
              <button className="dialog-back-button" onClick={onClose}>
                <ArrowLeft size={16} /> กลับ
              </button>
              <span>เตรียมบริการ / {title}</span>
            </div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </div>

        <div className="document-flow-body">
          <AcquisitionPlanner
            mode={mode}
            plan={plan}
            scope={scope}
            selectedReturnChannel={selectedReturnChannel}
            onSource={(id) => {
              setSource(id);
              setFormat(undefined);
              setReturnChannel(undefined);
            }}
            onFormat={(id) => {
              setFormat(id);
              setReturnChannel(undefined);
            }}
            onScope={(nextScope) => {
              setScope(nextScope);
              setFormat(undefined);
              setReturnChannel(undefined);
            }}
            onReturnChannel={setReturnChannel}
            controls={
              <DocumentFlowControls
                plan={plan}
                selectedFields={selectedFields}
                setSelectedFields={setSelectedFields}
                passcodeRequired={passcodeRequired}
                setPasscodeRequired={setPasscodeRequired}
                expiryHours={expiryHours}
                setExpiryHours={setExpiryHours}
                maxAccessCount={maxAccessCount}
                setMaxAccessCount={setMaxAccessCount}
              />
            }
            onCancel={onClose}
            onSubmit={submit}
            submitDisabled={hasShlPasscodeError}
          />
        </div>
      </div>
    </div>
  );
}

function DocumentFlowControls({
  plan,
  selectedFields,
  setSelectedFields,
  passcodeRequired,
  setPasscodeRequired,
  expiryHours,
  setExpiryHours,
  maxAccessCount,
  setMaxAccessCount,
}: {
  plan: ReturnType<typeof buildDocumentRequestPlan>;
  selectedFields: string[];
  setSelectedFields: (fields: string[]) => void;
  passcodeRequired: boolean;
  setPasscodeRequired: (value: boolean) => void;
  expiryHours: number;
  setExpiryHours: (value: number) => void;
  maxAccessCount: number;
  setMaxAccessCount: (value: number) => void;
}) {
  const toggleField = (field: string) => {
    setSelectedFields(
      selectedFields.includes(field)
        ? selectedFields.filter((item) => item !== field)
        : [...selectedFields, field],
    );
  };
  return (
    <div className="document-flow-control-stack">
      {plan.controls.selectiveDisclosure && (
        <div className="document-flow-control-panel">
          <strong>Selective Disclosure</strong>
          <p>
            เลือก claim ที่จำเป็นต่อวัตถุประสงค์นี้เท่านั้น
            ไม่รวม technical properties เช่น watermark, payload hash หรือ UI state
          </p>
          <div className="field-chip-grid">
            {[
              ["identity", "ตัวตน"],
              ["birthdate", "วันเกิด"],
              ["clinical_summary", "สรุปสุขภาพ"],
              ["medication", "ยา"],
              ["allergy", "ภูมิแพ้"],
              ["coverage", "สิทธิรักษา"],
            ].map(([field, label]) => (
              <button
                key={field}
                className={selectedFields.includes(field) ? "active" : ""}
                onClick={() => toggleField(field)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {plan.controls.shlAccessPolicy && (
        <div className="document-flow-control-panel">
          <strong>SHL Access Policy</strong>
          <p>
            PIN/Passcode ต้องส่งแยกจาก QR ตามแนวทาง SHL
            และใช้ควบคุมการเปิด manifest หรือไฟล์ที่เข้ารหัสไว้
          </p>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={passcodeRequired}
              onChange={(event) => setPasscodeRequired(event.target.checked)}
            />
            ต้องใช้ PIN / Passcode
          </label>
          <div className="document-flow-field-grid">
            <label>
              หมดอายุ
              <select
                value={expiryHours}
                onChange={(event) => setExpiryHours(Number(event.target.value))}
              >
                <option value={1}>1 ชั่วโมง</option>
                <option value={24}>24 ชั่วโมง</option>
                <option value={72}>3 วัน</option>
                <option value={168}>7 วัน</option>
              </select>
            </label>
            <label>
              จำนวนครั้งที่เปิดได้
              <select
                value={maxAccessCount}
                onChange={(event) =>
                  setMaxAccessCount(Number(event.target.value))
                }
              >
                <option value={1}>1 ครั้ง</option>
                <option value={3}>3 ครั้ง</option>
                <option value={5}>5 ครั้ง</option>
                <option value={8}>8 ครั้ง</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {plan.controls.fhirEndpoint && (
        <div className="document-flow-control-panel">
          <strong>FHIR Source Scope</strong>
          <p>
            ต้องมี consent และ scope ที่ระบุ resource เช่น DocumentReference,
            Bundle, DiagnosticReport, Observation หรือ MedicationRequest
          </p>
          <input value="patient/*.read documentreference.read" readOnly />
        </div>
      )}
      {plan.controls.trustCareCertification && (
        <div className="document-flow-control-panel">
          <strong>TrustCare Certification</strong>
          <p>
            ต้องผ่าน Maker/Checker จาก TrustCare Portal ก่อน SHL
            จึงจะกลายเป็น Certified SHL+Manifest VP
          </p>
        </div>
      )}
      {plan.controls.manualFileUpload && (
        <div className="document-flow-control-panel">
          <strong>Manual Import</strong>
          <p>
            รองรับ PDF, รูปภาพ, FHIR JSON หรือ Bundle
            และเก็บเป็นหลักฐานที่ยังไม่ยืนยันก่อน
          </p>
          <div className="manual-drop-zone">
            <Upload size={18} />
            เลือกไฟล์หรือวาง JSON ในขั้นตอนนำเข้าจริง
          </div>
        </div>
      )}
      {!Object.values(plan.controls).some(Boolean) && (
        <p className="muted">ไม่มีเงื่อนไขพิเศษสำหรับรูปแบบนี้</p>
      )}
    </div>
  );
}

function PrepareView({
  user,
  cards,
  context,
  readiness,
  contractHub,
  workbench,
  requests,
  importJob,
  onContext,
  onPrepareAll,
  onRequestMissing,
  onImportMissing,
}: {
  user: WalletDemoUser;
  cards: WalletCard[];
  context: ReadinessContext;
  readiness: any;
  contractHub: ContractHubCatalog | null;
  workbench: any;
  requests: WalletDocumentRequest[];
  importJob: WalletImportJob | null;
  onContext: (context: ReadinessContext) => void;
  onPrepareAll: () => void;
  onRequestMissing: (requirements?: ReadinessRequirement[]) => void;
  onImportMissing: (requirements?: ReadinessRequirement[]) => void;
}) {
  const activeContract = contractHub?.contracts.find(
    (item) => item.context === context,
  );
  const localReadiness = useMemo(
    () => assessLocalReadiness(cards, context),
    [cards, context],
  );
  const responseReadiness =
    readiness?.readiness?.context === context ? readiness.readiness : null;
  const readinessResult = cards.length
    ? localReadiness
    : (responseReadiness ?? localReadiness);
  const missing = readinessResult.missing ?? [];
  const ready = readinessResult.ready ?? [];
  const missingRequired = missing.filter((item: any) => item.required);
  const canCreateFullPacket = missingRequired.length === 0;
  const packetContents = ready.flatMap((item: any) => item.matchedCards ?? []);
  const isPrepared = canCreateFullPacket;
  const contextRequests = requests.filter(
    (request: any) => !request.context || request.context === context,
  );
  const contextImportJob =
    importJob &&
    ((importJob as any).context ? (importJob as any).context === context : true)
      ? importJob
      : null;
  const serviceDocumentSummary = [...ready, ...missing].slice(0, 6);
  const selectedServiceLabel = readinessContextLabels[context].th;
  const serviceDocumentCaption = `เอกสารที่ใช้ในบริการนี้ - ${selectedServiceLabel}`;
  const serviceDocumentDescription = activeContract
    ? `${activeContract.patientLabel} · ${activeContract.bundleTypes.patient}`
    : readinessPurposeTh[context];
  const purposeCards = useMemo(
    () => buildPurposePickerCards(context),
    [context],
  );
  const readinessSummary = useMemo(
    () => buildReadinessSummary(readinessResult),
    [readinessResult],
  );
  const missingDocumentCards = useMemo(
    () =>
      buildMissingDocumentCards(
        context,
        missing as ReadinessRequirement[],
      ),
    [context, missing],
  );
  const primaryAction = () => {
    if (!canCreateFullPacket) {
      onRequestMissing(missing as ReadinessRequirement[]);
      return;
    }
    onPrepareAll();
  };
  const prepSteps = [
    {
      title: "เลือกประเภทบริการ",
      description: readinessContextLabels[context].th,
      status: "เสร็จแล้ว",
      complete: true,
    },
    {
      title: "ตรวจเอกสารที่ต้องใช้",
      description: canCreateFullPacket
        ? `พร้อม ${readinessResult.requiredReady ?? 0}/${readinessResult.requiredTotal ?? 0} รายการจำเป็น`
        : `ยังขาด ${missingRequired.length} รายการจำเป็น`,
      status: canCreateFullPacket ? "พร้อม" : "ต้องแก้ไข",
      complete: canCreateFullPacket,
    },
    {
      title: "ไปหน้าแชร์เอกสาร",
      description: isPrepared
        ? "พร้อมเลือกผู้รับ วัตถุประสงค์ รูปแบบ VP/SHL และเงื่อนไขการเปิดเผย"
        : "เตรียมเอกสารจำเป็นให้ครบก่อนแชร์",
      status: isPrepared ? "พร้อมแชร์" : "รอข้อมูล",
      complete: isPrepared,
    },
  ];
  return (
    <div className="view-stack">
      <ReadinessSummaryCard
        summary={readinessSummary}
        onPrimary={primaryAction}
        onImport={() => onImportMissing(missing as ReadinessRequirement[])}
      />

      <section className="prepare-decision-grid">
        <Surface className="service-context-panel">
          <div className="section-title-row">
            <div>
              <h2>1. เลือกบริการที่จะไป</h2>
              <p>
                {activeContract?.patientLabel ?? readinessPurposeTh[context]}
              </p>
            </div>
            <Badge tone="blue">
              Contract Hub {contractHub?.version ?? "demo"}
            </Badge>
          </div>
          <div className="service-context-grid">
            {purposeCards.map((card) => (
              <PurposePickerCard
                key={card.context}
                card={card}
                onSelect={onContext}
              />
            ))}
          </div>
        </Surface>

        <Surface className="package-policy-panel readiness-route-panel">
          <div className="section-title-row">
            <div>
              <h2>2. ตรวจเอกสารที่ระบบจะใช้</h2>
              <p>
                รายการนี้เปลี่ยนตามบริการที่เลือก ส่วนการเลือก VP, SHL, Manifest
                VP และเงื่อนไขการเปิดเผยอยู่ในหน้าแชร์
              </p>
            </div>
            <Badge tone={canCreateFullPacket ? "green" : "yellow"}>
              {canCreateFullPacket ? "ครบตามบริการ" : "ยังขาดเอกสาร"}
            </Badge>
          </div>
          <div className="interop-bridge-strip document-summary-strip">
            <span className="summary-heading">
              <FileText size={16} /> {serviceDocumentCaption}
            </span>
            {serviceDocumentSummary.map((item: any) => (
              <span
                key={item.key}
                className={
                  item.matchedCards?.length
                    ? "ready"
                    : item.required
                      ? "missing required"
                      : "missing"
                }
              >
                {item.matchedCards?.length ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <AlertTriangle size={14} />
                )}
                {item.label}
              </span>
            ))}
            {serviceDocumentSummary.length === 0 && (
              <span>ยังไม่มีเงื่อนไขเอกสาร</span>
            )}
          </div>
        </Surface>
      </section>

      <section className="prep-main-grid">
        <Surface className="prep-checklist">
          <div className="section-title-row">
            <div>
              <h2>3. ตรวจความพร้อม</h2>
              <p>ขั้นตอนทั้งหมดที่ผู้ป่วยต้องทำก่อนส่งข้อมูลให้โรงพยาบาล</p>
            </div>
            <Badge
              tone={
                isPrepared ? "green" : canCreateFullPacket ? "blue" : "yellow"
              }
            >
              {isPrepared
                ? "พร้อมใช้"
                : canCreateFullPacket
                  ? "พร้อมสร้าง"
                  : "ต้องแก้ไข"}
            </Badge>
          </div>
          <div className="prep-task-list">
            {prepSteps.map((step, index) => (
              <PrepTaskRow key={step.title} index={index + 1} {...step} />
            ))}
          </div>
        </Surface>

        <Surface className="prep-documents-panel">
          <div className="section-title-row">
            <div>
              <h2>{serviceDocumentCaption}</h2>
              <p>{serviceDocumentDescription}</p>
            </div>
            <Badge tone={canCreateFullPacket ? "green" : "yellow"}>
              {packetContents.length} รายการตรงเงื่อนไข
            </Badge>
          </div>
          {!canCreateFullPacket && (
            <div className="prep-warning-inline">
              <AlertTriangle size={18} />
              <span>
                ยังขาดเอกสารจำเป็น {missingRequired.length} รายการ
                ควรขอจากโรงพยาบาลหรือนำเข้าเอกสารก่อนสร้างชุดพร้อมรับบริการ
              </span>
            </div>
          )}
          {!!missingDocumentCards.length && (
            <div className="missing-document-grid">
              {missingDocumentCards.map((card) => (
                <MissingDocumentCard
                  key={card.key}
                  card={card}
                  onRequest={() =>
                    onRequestMissing(
                      (missing as ReadinessRequirement[]).filter(
                        (item) => item.key === card.key,
                      ),
                    )
                  }
                  onImport={() =>
                    onImportMissing(
                      (missing as ReadinessRequirement[]).filter(
                        (item) => item.key === card.key,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
          <div className="readiness-doc-list">
            {ready.map((item: any) => (
              <div key={item.key} className="readiness-doc-row ready">
                <CheckCircle2 size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.required ? "จำเป็น" : "แนะนำ"}</small>
                </span>
                <Badge tone="green">พร้อม</Badge>
              </div>
            ))}
            {missing.map((item: any) => (
              <div key={item.key} className="readiness-doc-row missing">
                <AlertTriangle size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.required ? "จำเป็น" : "แนะนำ"}</small>
                </span>
                <Badge tone={item.required ? "red" : "yellow"}>ยังขาด</Badge>
              </div>
            ))}
          </div>
          <div className="prep-doc-actions">
            <Button
              onClick={() => onRequestMissing(missing as ReadinessRequirement[])}
              disabled={!missing.length}
            >
              <FilePlus2 size={18} /> ขอเอกสารที่ขาด
            </Button>
            <Button
              className="secondary"
              onClick={() => onImportMissing(missing as ReadinessRequirement[])}
              disabled={!missing.length}
            >
              <Upload size={18} /> นำเข้าเอกสาร
            </Button>
          </div>
        </Surface>
      </section>

      <Surface className="bundle-dashboard service-output-panel">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">ขั้นตอนถัดไป</span>
            <h2>4. ไปหน้าแชร์เอกสาร</h2>
            <p>
              หน้าเตรียมบริการตรวจความพร้อมเท่านั้น
              หลังจากนี้หน้าแชร์จะให้เลือกผู้รับ วัตถุประสงค์ รูปแบบ VP/SHL
              และเงื่อนไขการเปิดเผยก่อนสร้าง QR
            </p>
          </div>
          <Badge tone={isPrepared ? "green" : "yellow"}>
            {isPrepared ? "พร้อมแชร์" : "ยังไม่พร้อม"}
          </Badge>
        </div>
        <div className="prep-primary-row">
          <Button
            className={canCreateFullPacket ? "purple" : "secondary"}
            onClick={onPrepareAll}
            disabled={!canCreateFullPacket}
          >
            <Send size={18} /> ไปหน้าแชร์เอกสาร
          </Button>
          {!canCreateFullPacket && (
            <span>ไปหน้าแชร์ได้หลังเอกสารจำเป็นครบ</span>
          )}
        </div>
        <div className="share-route-summary">
          <div>
            <strong>{selectedServiceLabel}</strong>
            <small>{serviceDocumentDescription}</small>
          </div>
          <div>
            <strong>เลือก Package ในหน้าแชร์</strong>
            <small>Direct VP, Purpose VP, SHL หรือ SHL + Manifest VP</small>
          </div>
          <div>
            <strong>
              จำเป็น {readinessResult.requiredReady ?? 0}/
              {readinessResult.requiredTotal ?? 0}
            </strong>
            <small>
              แนะนำ {readinessResult.recommendedReady ?? 0}/
              {readinessResult.recommendedTotal ?? 0}
            </small>
          </div>
        </div>
      </Surface>

      <Surface className="packet-content-preview">
        <div className="section-title-row">
          <div>
            <h3>5. รายการเอกสารที่พร้อมใช้</h3>
            <p>
              รายการด้านล่างคือเอกสารที่ตรงเงื่อนไขของบริการนี้
              และจะถูกส่งต่อไปเป็นค่าเริ่มต้นในหน้าแชร์
            </p>
          </div>
          <Badge tone={canCreateFullPacket ? "green" : "yellow"}>
            {canCreateFullPacket ? "ครบถ้วน" : "ยังไม่ครบ"}
          </Badge>
        </div>
        <div className="compact-list">
          {packetContents.map((card: WalletCard) => (
            <div key={card.id} className="packet-content-row">
              <ShieldCheck size={18} />
              <span>
                <strong>{card.displayNameEn ?? card.displayName}</strong>
                <small>{categoryLabel(card.documentCategory)}</small>
              </span>
              <Badge tone="green">{statusLabel(card.credentialStatus)}</Badge>
            </div>
          ))}
          {!packetContents.length && (
            <p className="muted">ยังไม่มีเอกสารที่ตรงเงื่อนไข</p>
          )}
        </div>
      </Surface>

      <div className="prepare-support-grid">
        <Surface>
          <h3>คำขอเอกสาร</h3>
          {contextRequests.length ? (
            <div className="request-list">
              {contextRequests.map((request: any) => (
                <div
                  key={request.requestId ?? request.id}
                  className="request-row"
                >
                  <FilePlus2 size={18} />
                  <span>
                    <strong>{request.documentType ?? "เอกสารที่ขาด"}</strong>
                    <small>
                      {statusLabel(request.status)} ·{" "}
                      {request.sourceType ?? "hospital"}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>
              ยังไม่มีคำขอค้างอยู่สำหรับ {readinessContextLabels[context].th}
            </p>
          )}
        </Surface>
        <Surface>
          <h3>งานนำเข้าเอกสาร</h3>
          {contextImportJob ? (
            <div className="request-row">
              <Upload size={18} />
              <span>
                <strong>
                  {contextImportJob.documentType ?? contextImportJob.sourceType}
                </strong>
                <small>
                  {contextImportJob.importId} ·{" "}
                  {statusLabel(contextImportJob.status)}
                </small>
              </span>
            </div>
          ) : (
            <p>ยังไม่มีงานนำเข้าสำหรับบริการนี้</p>
          )}
        </Surface>
        <Surface>
          <h3>สถานะ Contract Hub</h3>
          <p>
            {workbench?.tasks?.length ?? workbench?.actions?.length ?? 0} งานจาก
            Contract Hub พร้อมตรวจสอบ
          </p>
        </Surface>
      </div>
    </div>
  );
}

function PrepTaskRow({
  index,
  title,
  description,
  status,
  complete,
}: {
  index: number;
  title: string;
  description: string;
  status: string;
  complete: boolean;
}) {
  return (
    <div className={complete ? "prep-task-row complete" : "prep-task-row"}>
      <div className="prep-task-index">
        {complete ? <CheckCircle2 size={18} /> : index}
      </div>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Badge tone={complete ? "green" : "yellow"}>{status}</Badge>
    </div>
  );
}

function StoreView({
  user,
  objects,
  allObjects,
  filter,
  onFilter,
  onImport,
  onExport,
}: {
  user: WalletDemoUser;
  objects: WalletStoredObject[];
  allObjects: WalletStoredObject[];
  filter: StoreFilter;
  onFilter: (filter: StoreFilter) => void;
  onImport: (value: string) => unknown;
  onExport: (result: WalletExportResult) => void;
}) {
  const [payload, setPayload] = useState("");
  const [selectedObject, setSelectedObject] =
    useState<WalletStoredObject | null>(null);
  return (
    <div className="view-stack">
      <Surface className="share-command">
        <div>
          <h2>คลัง VC/VP/SHL</h2>
          <p>
            เก็บ VC, VP, SHL, Manifest VP, Holder VC, sync receipts, OID4VCI
            offers และ OID4VP requests ใน wallet เดียว
          </p>
        </div>
        <Button onClick={() => onExport(exportWalletObjects(allObjects))}>
          <Download size={18} /> ส่งออก Wallet
        </Button>
      </Surface>

      <Surface>
        <h3>นำเข้า SHL / VC / VP / OID4VC</h3>
        <div className="import-panel">
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder="วาง shlink:/..., OID4VCI offer, OID4VP request, VC/VP JSON, JWT หรือ verifier URL"
          />
          <Button
            onClick={() => {
              onImport(payload);
              setPayload("");
            }}
            disabled={!payload.trim()}
          >
            <FileJson size={18} /> นำเข้า
          </Button>
        </div>
      </Surface>

      <Surface>
        <div className="segmented">
          {(["all", "vc", "vp", "shl", "oid", "service"] as StoreFilter[]).map(
            (item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                onClick={() => onFilter(item)}
              >
                {item.toUpperCase()}
              </button>
            ),
          )}
        </div>
      </Surface>

      <div className="store-grid">
        {objects.map((object) => (
          <Surface key={object.id} className="store-object">
            <div className="store-object-header">
              <Badge tone={toneForObject(object)}>{object.type}</Badge>
              {object.protocol && <Badge tone="blue">{object.protocol}</Badge>}
              {object.type === "shl" && (
                <Badge
                  tone={
                    getShlTrustProfile(object.payload as ShlPackageDetail).tone
                  }
                >
                  {getShlTrustProfile(object.payload as ShlPackageDetail).label}
                </Badge>
              )}
            </div>
            <h3>{object.title}</h3>
            <p>{object.subtitle ?? object.source ?? object.id}</p>
            <small>{new Date(object.createdAt).toLocaleString("th-TH")}</small>
            <div className="object-actions">
              <Button
                className="secondary"
                onClick={() => setSelectedObject(object)}
              >
                <Eye size={18} /> รายละเอียด
              </Button>
              <Button
                className="secondary"
                onClick={() =>
                  void copyText(JSON.stringify(object.payload, null, 2))
                }
              >
                <Copy size={18} /> คัดลอก
              </Button>
              <Button onClick={() => onExport(exportWalletObject(object))}>
                <Download size={18} /> ส่งออก
              </Button>
            </div>
          </Surface>
        ))}
      </div>
      <StoredObjectDialog
        user={user}
        object={selectedObject}
        onClose={() => setSelectedObject(null)}
        onExport={onExport}
      />
    </div>
  );
}

function StoredObjectDialog({
  user,
  object,
  onClose,
  onExport,
}: {
  user: WalletDemoUser;
  object: WalletStoredObject | null;
  onClose: () => void;
  onExport: (result: WalletExportResult) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manifestQrDataUrl, setManifestQrDataUrl] = useState("");
  const [selectedManifestDocId, setSelectedManifestDocId] = useState("");
  const payloadText = useMemo(
    () => JSON.stringify(object?.payload ?? {}, null, 2),
    [object],
  );
  const scanPayload = useMemo(
    () => (object ? getObjectScanPayload(object) : ""),
    [object],
  );
  const shlDetail =
    object?.type === "shl" ? (object.payload as ShlPackageDetail) : null;
  const manifestDocuments = shlDetail?.documentBundle?.documents ?? [];
  const selectedManifestDoc =
    manifestDocuments.find(
      (document) => document.id === selectedManifestDocId,
    ) ??
    manifestDocuments[0] ??
    null;
  const hasManifestExtension = Boolean(
    shlDetail && hasTrustCareShlManifestExtension(shlDetail),
  );
  const manifestScanPayload =
    shlDetail && hasManifestExtension
      ? createScannableWebUrl(buildShlManifestVerificationPayload(shlDetail))
      : "";
  const rawShlPayload = shlDetail?.qrPayload ?? shlDetail?.shlUrl ?? "";
  const storedPass = useMemo(
    () => (object ? describeStoredObjectPass(object, user) : null),
    [object, user],
  );

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    if (!object || !scanPayload) return;
    void toQrDataUrl(scanPayload, { margin: 1, width: 220 }).then((value) => {
      if (!cancelled) setQrDataUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [object, scanPayload]);

  useEffect(() => {
    let cancelled = false;
    setManifestQrDataUrl("");
    if (!manifestScanPayload) return;
    void toQrDataUrl(manifestScanPayload, { margin: 1, width: 220 }).then(
      (value) => {
        if (!cancelled) setManifestQrDataUrl(value);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [manifestScanPayload]);

  useEffect(() => {
    setSelectedManifestDocId("");
  }, [object?.id]);

  if (!object) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="stored-object-dialog">
        <header className="credential-dialog-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button
                type="button"
                className="dialog-back-button"
                onClick={onClose}
              >
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">คลังข้อมูล / {object.type}</span>
            </div>
            <div className="dialog-heading-row">
              <p className="eyebrow">
                {object.protocol ?? "trustcare"} / {object.type}
              </p>
              <h2>{object.title}</h2>
              <Badge tone={toneForObject(object)}>
                {statusLabel(object.status)}
              </Badge>
              {shlDetail && (
                <Badge tone={getShlTrustProfile(shlDetail).tone}>
                  {getShlTrustProfile(shlDetail).label}
                </Badge>
              )}
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิดรายละเอียด"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="stored-object-body">
          <section className="stored-object-summary">
            {storedPass && (
              <BrandedSharePass
                kind={storedPass.kind}
                title={object.title}
                subtitle={storedPass.subtitle}
                ownerLabel={storedPass.ownerLabel}
                sourceLabel={storedPass.sourceLabel}
                issuerLabel={storedPass.issuerLabel}
                protocolLabel={storedPass.protocolLabel}
                accessLabel={storedPass.accessLabel}
                status={statusLabel(object.status)}
                qrDataUrl={qrDataUrl}
                isReady={Boolean(scanPayload)}
                items={storedPass.items}
              />
            )}
            <dl className="details-grid compact">
              <div>
                <dt>ประเภท</dt>
                <dd>{object.type}</dd>
              </div>
              <div>
                <dt>Protocol</dt>
                <dd>{object.protocol ?? "-"}</dd>
              </div>
              <div>
                <dt>แหล่งที่มา</dt>
                <dd>{object.source ?? object.subtitle ?? "-"}</dd>
              </div>
              <div>
                <dt>วันที่บันทึก</dt>
                <dd>{new Date(object.createdAt).toLocaleString("th-TH")}</dd>
              </div>
              <div>
                <dt>หมดอายุ</dt>
                <dd>
                  {object.expiresAt
                    ? new Date(object.expiresAt).toLocaleString("th-TH")
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd className="mono">{object.id}</dd>
              </div>
            </dl>
          </section>
          {shlDetail && (
            <ShlManifestViewer
              shl={shlDetail}
              documents={manifestDocuments}
              selectedDocument={selectedManifestDoc}
              onSelectDocument={setSelectedManifestDocId}
              manifestQrDataUrl={manifestQrDataUrl}
            />
          )}
          <div className="credential-action-grid">
            <Button
              className="secondary"
              onClick={() => void copyText(scanPayload)}
            >
              <QrCode size={18} />{" "}
              {shlDetail ? "คัดลอก Web Scan URL" : "คัดลอก QR URL"}
            </Button>
            {shlDetail && rawShlPayload && (
              <Button
                className="secondary"
                onClick={() => void copyText(rawShlPayload)}
              >
                <Link2 size={18} /> คัดลอก SHL ดิบ
              </Button>
            )}
            {hasManifestExtension && (
              <Button
                className="secondary"
                onClick={() => void copyText(manifestScanPayload)}
              >
                <ShieldCheck size={18} /> คัดลอก Manifest VP QR
              </Button>
            )}
            <Button
              className="secondary"
              onClick={() => void copyText(payloadText)}
            >
              <Copy size={18} /> คัดลอก Payload
            </Button>
            <Button onClick={() => onExport(exportWalletObject(object))}>
              <Download size={18} /> ส่งออก
            </Button>
          </div>
          <details className="developer-payload">
            <summary>ดู Payload สำหรับนักพัฒนา</summary>
            <pre className="payload">{payloadText}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function ShlManifestViewer({
  shl,
  documents,
  selectedDocument,
  onSelectDocument,
  manifestQrDataUrl,
}: {
  shl: ShlPackageDetail;
  documents: ShlManifestDocument[];
  selectedDocument: ShlManifestDocument | null;
  onSelectDocument: (id: string) => void;
  manifestQrDataUrl?: string;
}) {
  const trustProfile = getShlTrustProfile(shl);
  const hasManifestExtension = trustProfile.kind === "trustcare-certified";
  if (!hasManifestExtension) {
    return (
      <section className="shl-manifest-viewer standard-shl-viewer">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">{trustProfile.label}</span>
            <h3>
              {trustProfile.kind === "trustcare-pending"
                ? "รอการยืนยัน Maker/Checker"
                : "SHL มาตรฐานที่ไม่มี Manifest VP/VC"}
            </h3>
            <p>{trustProfile.description}</p>
          </div>
          <Badge tone={trustProfile.tone}>{trustProfile.label}</Badge>
        </div>
        <div className="manifest-trust-grid">
          <div>
            <span>SHL URL</span>
            <strong className="mono">
              {shl.shlUrl ?? shl.qrPayload ?? "-"}
            </strong>
          </div>
          <div>
            <span>Viewer URL</span>
            <strong className="mono">{shl.viewerUrl ?? "-"}</strong>
          </div>
          <div>
            <span>Access policy</span>
            <strong>
              {shl.passcodeRequired
                ? "ต้องใช้ passcode"
                : "ไม่ต้องใช้ passcode"}{" "}
              · {shl.currentAccessCount ?? 0}/{shl.maxAccessCount ?? "-"}
            </strong>
          </div>
          <div>
            <span>Maker/Checker</span>
            <strong>
              {shl.trustcareCertification?.status ??
                "ไม่เกี่ยวข้องกับ TrustCare"}
            </strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="shl-manifest-viewer">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">SMART Health Link Manifest</span>
          <h3>เอกสารใน Manifest และหลักฐาน VP</h3>
          <p>
            SHL เป็น transport ส่วนความน่าเชื่อถือมาจาก Manifest VC, Holder VP
            และ FHIR DocumentReference ของแต่ละเอกสาร
          </p>
        </div>
        <Badge tone="green">TrustCare Verified SHL</Badge>
      </div>
      <div className="manifest-trust-grid">
        <div>
          <span>Manifest VC</span>
          <strong className="mono">{shl.manifestCredentialId ?? "-"}</strong>
        </div>
        <div>
          <span>Holder VP</span>
          <strong className="mono">{shl.presentationId ?? "-"}</strong>
        </div>
        <div>
          <span>Maker/Checker</span>
          <strong>
            {shl.trustcareCertification?.makerName ?? "-"} →{" "}
            {shl.trustcareCertification?.checkerName ?? "-"}
          </strong>
        </div>
        <div>
          <span>Access policy</span>
          <strong>
            {shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode"}{" "}
            · {shl.currentAccessCount ?? 0}/{shl.maxAccessCount ?? "-"}
          </strong>
        </div>
        <div>
          <span>มาตรฐาน</span>
          <strong>
            {shl.documentBundle?.standards?.join(" · ") ?? "SHL · VC/VP · FHIR"}
          </strong>
        </div>
      </div>
      {manifestQrDataUrl && (
        <div className="manifest-vp-qr-panel">
          <div className="qr-inline large">
            <img src={manifestQrDataUrl} alt="Manifest VP verification QR" />
          </div>
          <div>
            <span className="eyebrow">Manifest VP Verification QR</span>
            <h4>สแกนเพื่อตรวจ TrustCare Manifest VP/VC</h4>
            <p>
              ใช้กับ TrustCare verifier เพื่อตรวจ Manifest VC, Holder VP,
              Maker/Checker approval และ DocumentReference evidence ของเอกสารใน
              SHL นี้
            </p>
          </div>
        </div>
      )}
      <div className="manifest-layout">
        <div className="manifest-doc-list" aria-label="Manifest documents">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              className={selectedDocument?.id === document.id ? "active" : ""}
              onClick={() => onSelectDocument(document.id)}
            >
              <span className="manifest-sequence">{document.sequence}</span>
              <span>
                <strong>{document.title}</strong>
                <small>
                  {document.fhirResource} · {document.contentType}
                </small>
              </span>
              <Badge
                tone={
                  document.status === "available_in_manifest"
                    ? "green"
                    : "yellow"
                }
              >
                {document.status === "available_in_manifest"
                  ? "พร้อมใน Manifest"
                  : document.status}
              </Badge>
            </button>
          ))}
          {!documents.length && (
            <p className="muted">
              Manifest นี้ยังไม่มีรายการเอกสารที่อ่านได้ใน seed
            </p>
          )}
        </div>
        {selectedDocument && (
          <div className="manifest-doc-detail">
            <span className="eyebrow">DocumentReference</span>
            <h4>{selectedDocument.title}</h4>
            <dl className="details-grid compact">
              <div>
                <dt>ประเภท</dt>
                <dd>{selectedDocument.documentType}</dd>
              </div>
              <div>
                <dt>หมวดหมู่</dt>
                <dd>{categoryLabel(selectedDocument.category)}</dd>
              </div>
              <div>
                <dt>FHIR resource</dt>
                <dd>{selectedDocument.fhirResource}</dd>
              </div>
              <div>
                <dt>Manifest file</dt>
                <dd className="mono">
                  {selectedDocument.manifestFileId ?? "-"}
                </dd>
              </div>
              <div>
                <dt>Content hash</dt>
                <dd className="mono">
                  {selectedDocument.hash?.contentHash ?? "-"}
                </dd>
              </div>
              <div>
                <dt>Source bundle</dt>
                <dd className="mono">
                  {selectedDocument.hash?.sourceBundleHash ?? "-"}
                </dd>
              </div>
            </dl>
            <div className="manifest-link-list">
              {Object.entries(selectedDocument.objectLinks ?? {}).map(
                ([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void copyText(String(value))}
                  >
                    <Link2 size={15} />
                    <span>
                      <strong>{key}</strong>
                      <small>{String(value)}</small>
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type BrandedPassKind = "bundle" | "vp" | "shl" | "store";

function BrandedSharePass({
  kind,
  title,
  subtitle,
  ownerLabel,
  sourceLabel,
  issuerLabel,
  protocolLabel,
  accessLabel,
  status,
  qrDataUrl,
  isReady,
  items,
}: {
  kind: BrandedPassKind;
  title: string;
  subtitle: string;
  ownerLabel: string;
  sourceLabel: string;
  issuerLabel: string;
  protocolLabel: string;
  accessLabel: string;
  status: string;
  qrDataUrl: string;
  isReady: boolean;
  items: string[];
}) {
  const sourceInitials = initials(sourceLabel);
  const ownerInitials = initials(ownerLabel);
  return (
    <section
      className={`branded-share-pass ${kind} ${isReady ? "ready" : "empty"}`}
      aria-label={`${title} branded QR pass`}
    >
      <div className="branded-pass-main">
        <div className="branded-pass-logos" aria-hidden="true">
          <span className="pass-logo owner">{ownerInitials}</span>
          <span className="pass-from">from</span>
          <span className="pass-logo source">{sourceInitials}</span>
        </div>
        <div className="branded-pass-copy">
          <span className="eyebrow">{protocolLabel}</span>
          <h4>{ownerLabel}</h4>
          <p>{subtitle}</p>
          <dl>
            <div>
              <dt>เจ้าของข้อมูล</dt>
              <dd>{ownerLabel}</dd>
            </div>
            <div>
              <dt>แหล่งที่มา</dt>
              <dd>{sourceLabel}</dd>
            </div>
            <div>
              <dt>ผู้ออก/โฮสต์</dt>
              <dd>{issuerLabel}</dd>
            </div>
            <div>
              <dt>การเข้าถึง</dt>
              <dd>{accessLabel}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="branded-pass-qr">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`${title} QR`} />
        ) : (
          <QrCode size={46} />
        )}
        <small>
          {isReady
            ? "สแกนเพื่อเปิด Web view หรือส่งต่อให้ระบบที่รองรับ"
            : "สร้างก่อนจึงจะแสดง QR จริง"}
        </small>
      </div>
      <div className="branded-pass-items">
        <strong>{title}</strong>
        <ul>
          {items.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {items.length > 5 && <li>+{items.length - 5} รายการเพิ่มเติม</li>}
          {!items.length && <li>รอสร้าง payload</li>}
        </ul>
        <Badge tone={isReady ? "green" : "yellow"}>{status}</Badge>
      </div>
    </section>
  );
}

function ScanOutcomePanel({ outcome }: { outcome: ScanOutcome }) {
  const matched =
    outcome.verifier.matchedCredentialIds ??
    outcome.importResult.matchedCredentialIds ??
    [];
  const checklist = Array.isArray(outcome.verifier.verificationChecklist)
    ? outcome.verifier.verificationChecklist.filter(
        (
          item,
        ): item is {
          key?: string;
          label?: string;
          ok?: boolean;
          detail?: string;
        } => Boolean(item) && typeof item === "object",
      )
    : [];
  return (
    <Surface className="scan-result-card">
      <div className="scan-result-main">
        <div
          className={
            outcome.verifier.verified
              ? "scan-result-icon ok"
              : "scan-result-icon warn"
          }
        >
          {outcome.verifier.verified ? (
            <ShieldCheck size={22} />
          ) : (
            <AlertTriangle size={22} />
          )}
        </div>
        <div>
          <span className="eyebrow">ผลการสแกนล่าสุด</span>
          <h2>
            {outcome.verifier.verified ? "ตรวจสอบผ่าน" : "ต้องตรวจสอบเพิ่มเติม"}
          </h2>
          <p>
            {outcome.verifier.requestSummary ?? outcome.importResult.format} ·{" "}
            {new Date(outcome.scannedAt).toLocaleString("th-TH")}
          </p>
        </div>
      </div>
      <div className="scan-result-grid">
        <div>
          <small>บริบท</small>
          <strong>{contextLabel(outcome.context)}</strong>
        </div>
        <div>
          <small>Protocol</small>
          <strong>
            {outcome.verifier.protocol ?? outcome.importResult.protocol ?? "-"}
          </strong>
        </div>
        <div>
          <small>Issuer / Verifier</small>
          <strong>{outcome.verifier.issuer ?? "-"}</strong>
        </div>
        <div>
          <small>ตรงกับเอกสาร</small>
          <strong>{matched.length ? `${matched.length} รายการ` : "-"}</strong>
        </div>
      </div>
      {!!checklist.length && (
        <div
          className="scan-checklist"
          aria-label="หลักฐานที่ตรวจสอบจากการสแกน"
        >
          <div className="scan-checklist-heading">
            <ListChecks size={18} />
            <span>หลักฐานที่ตรวจสอบ</span>
          </div>
          <div className="scan-checklist-grid">
            {checklist.map((item, index) => (
              <div
                className={
                  item.ok ? "scan-check-item ok" : "scan-check-item warn"
                }
                key={item.key ?? `${item.label}-${index}`}
              >
                {item.ok ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <AlertTriangle size={17} />
                )}
                <span>
                  <strong>{item.label ?? "หลักฐาน"}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!matched.length && (
        <p className="mono scan-matched">{matched.join(", ")}</p>
      )}
      {!!outcome.verifier.errors?.length && (
        <p className="error-text">{outcome.verifier.errors.join(", ")}</p>
      )}
      {!!outcome.verifier.warnings?.length && (
        <p className="warning-text">{outcome.verifier.warnings.join(", ")}</p>
      )}
    </Surface>
  );
}

function ScanResponseDialog({
  open,
  outcome,
  onClose,
  onCopy,
}: {
  open: boolean;
  outcome: ScanOutcome | null;
  onClose: () => void;
  onCopy: (value: string) => void | Promise<void>;
}) {
  if (!open || !outcome) return null;
  const descriptor = outcome.descriptor;
  const manifest = outcome.manifestFetch;
  const importedTitle =
    outcome.importResult.object?.title ?? outcome.importResult.format;
  const shlNeedsPasscode =
    descriptor?.payloadKind === "shl" && descriptor.passcodeRequired;
  const manifestStatus = manifest
    ? manifest.ok
      ? `อ่าน manifest สำเร็จ (${manifest.fileCount} ไฟล์, ${manifest.requestMethod})`
      : (manifest.errors[0] ??
        manifest.warnings[0] ??
        "ยังอ่าน manifest ไม่สำเร็จ")
    : descriptor?.payloadKind === "shl"
      ? "ยังไม่ได้ resolve manifest"
      : "ไม่ใช่ SHL manifest";
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="scan-response-dialog">
        <header className="modal-header">
          <div>
            <ShieldCheck size={22} />
            <span>
              <strong>ผลการสแกน QR</strong>
              <small>
                บันทึกประวัติใน Wallet และแยก scope ตามผู้ใช้ที่ login
              </small>
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Close scan response"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="scan-response-body">
          <ScanOutcomePanel outcome={outcome} />
          <section className="scan-standard-card">
            <div>
              <span className="eyebrow">ผลลัพธ์หลังสแกน</span>
              <h3>
                {descriptor?.payloadKind === "shl"
                  ? "SMART Health Link ถูกนำเข้าแล้ว"
                  : "นำเข้า payload แล้ว"}
              </h3>
              <p>
                {descriptor?.payloadKind === "shl"
                  ? "Wallet เก็บ canonical SHL เดิมไว้เพื่อ compatibility และสร้าง TrustCare Manifest VP binding เป็นสถานะรอ Maker/Checker ก่อนใช้เป็นหลักฐาน TrustCare."
                  : "Payload ถูกบันทึกตาม protocol ที่ตรวจพบ และต้องตรวจสอบความน่าเชื่อถือก่อนนำไปใช้ต่อ."}
              </p>
            </div>
            <Badge tone={outcome.importResult.ok ? "green" : "yellow"}>
              {outcome.importResult.ok ? "นำเข้าแล้ว" : "ตรวจเพิ่ม"}
            </Badge>
          </section>
          <div className="scan-response-meta">
            <div>
              <small>เอกสาร/วัตถุที่นำเข้า</small>
              <strong>{importedTitle}</strong>
            </div>
            <div>
              <small>Transport</small>
              <strong>{scanTransportLabel(descriptor?.transport)}</strong>
            </div>
            <div>
              <small>Manifest endpoint</small>
              <strong className="mono">{descriptor?.manifestUrl ?? "-"}</strong>
            </div>
            <div>
              <small>ผลการอ่าน manifest</small>
              <strong>{manifestStatus}</strong>
            </div>
            <div>
              <small>PIN / Passcode</small>
              <strong>
                {shlNeedsPasscode
                  ? "ต้องส่งแยกจาก QR"
                  : "ไม่ต้องใช้ หรือไม่พบเงื่อนไข PIN"}
              </strong>
            </div>
            <div>
              <small>TrustCare binding</small>
              <strong>
                {trustcareBindingLabel(descriptor?.trustcareBinding)}
              </strong>
            </div>
          </div>
          {shlNeedsPasscode && (
            <div className="scan-spec-note">
              <LockKeyhole size={18} />
              <span>
                ตาม SHL spec QR จะไม่ฝัง PIN/passcode ไว้ใน payload
                ผู้รับต้องได้รับรหัสจากช่องทางอื่นก่อนเรียก manifest endpoint.
              </span>
            </div>
          )}
          <div className="scan-payload-preview">
            <span>Canonical SHL payload</span>
            <code>{shortPayload(outcome.payload)}</code>
          </div>
          <div className="dialog-actions">
            <Button
              className="secondary"
              onClick={() => void onCopy(outcome.payload)}
            >
              <Copy size={17} /> คัดลอก payload
            </Button>
            {descriptor?.webViewerUrl && (
              <Button
                className="secondary"
                onClick={() => void onCopy(descriptor.webViewerUrl ?? "")}
              >
                <Link2 size={17} /> คัดลอก Web URL
              </Button>
            )}
            <Button onClick={onClose}>
              <CheckCircle2 size={17} /> เข้าใจแล้ว
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function HistoryView({
  history,
  scanHistory,
}: {
  history: PresentationHistoryItem[];
  scanHistory: ScanOutcome[];
}) {
  return (
    <div className="history-list large">
      {scanHistory.map((item) => (
        <Surface className="history-row scan-history-row" key={item.id}>
          <QrCode size={22} />
          <span>
            <strong>
              {item.verifier.protocol ?? item.importResult.format}
            </strong>
            <small>
              {new Date(item.scannedAt).toLocaleString("th-TH")} · บริบท:{" "}
              {contextLabel(item.context)}
            </small>
          </span>
          <Badge tone={item.verifier.verified ? "green" : "yellow"}>
            {item.verifier.verified ? "สแกนผ่าน" : "ตรวจเพิ่ม"}
          </Badge>
        </Surface>
      ))}
      {history.map((item) => (
        <Surface className="history-row" key={item.id}>
          <History size={22} />
          <span>
            <strong>{item.verifierName}</strong>
            <small>
              {item.presentedAt
                ? new Date(item.presentedAt).toLocaleString("th-TH")
                : item.purpose}
            </small>
          </span>
          <Badge
            tone={item.verificationResult === "valid" ? "green" : "neutral"}
          >
            {statusLabel(item.verificationResult ?? "recorded")}
          </Badge>
        </Surface>
      ))}
    </div>
  );
}

function SettingsView({
  webAuthn,
  theme,
  setTheme,
  developerMode,
  setDeveloperMode,
  user,
}: {
  webAuthn: ReturnType<typeof useWebAuthn>;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  developerMode: boolean;
  setDeveloperMode: (enabled: boolean) => void;
  user: WalletDemoUser;
}) {
  return (
    <div className="settings-grid">
      <Surface>
        <Smartphone size={28} />
        <h3>พร้อมใช้งานบนมือถือ</h3>
        <p>
          รองรับ SecureStore, SQLite, LocalAuthentication, Camera QR, SHL
          และการนำเข้า-ส่งออก VC/VP ใน Expo app
        </p>
      </Surface>
      <Surface>
        <Shield size={28} />
        <h3>ยืนยันตัวตนด้วย Biometric</h3>
        <p>
          {webAuthn.isRegistered
            ? "เปิดการยืนยันก่อนแสดง QR แล้ว"
            : "ยังไม่ได้ตั้งค่า biometric gate"}
        </p>
        <Button
          onClick={() =>
            webAuthn.isRegistered
              ? webAuthn.unregister()
              : void webAuthn.register(String(user.patientId), user.nameTh)
          }
        >
          {webAuthn.isRegistered ? "ปิด Biometric" : "ตั้งค่า Biometric"}
        </Button>
      </Surface>
      <Surface>
        <Globe2 size={28} />
        <h3>ธีม</h3>
        <Button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? "โหมดมืด" : "โหมดสว่าง"}
        </Button>
      </Surface>
      <Surface>
        <KeyRound size={28} />
        <h3>โหมดนักพัฒนา</h3>
        <p>
          แสดง payload และเครื่องมือทดสอบ protocol ในหน้ารับเอกสาร
          โดยไม่ปนกับประสบการณ์ใช้งานปกติของ Wallet
        </p>
        <Button
          className={developerMode ? "green" : "secondary"}
          onClick={() => setDeveloperMode(!developerMode)}
        >
          {developerMode ? "เปิดโหมดนักพัฒนา" : "ปิดโหมดนักพัฒนา"}
        </Button>
      </Surface>
    </div>
  );
}

function categoryLabel(category?: string): string {
  if (!category) return "-";
  return categoryLabels[category]?.th ?? category;
}

function transportLabel(transport: ShareTransport): string {
  const labels = {
    vp_qr: "VP QR",
    shl_recommended: "SHL/VP Bundle",
    shl_manifest: "SHL พร้อม TrustCare Manifest",
  };
  return labels[transport];
}

function getCardRecordTimestamp(card: WalletCard): string {
  const data = card.credentialData ?? {};
  const candidates = [
    data.recordedAt,
    data.recordDate,
    data.serviceDate,
    data.encounterDate,
    data.effectiveDate,
    data.issuedDate,
    data.date,
    data.timestamp,
    card.issuedAt,
    card.createdAt,
  ];
  const value = candidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  return typeof value === "string" ? value : card.createdAt;
}

function formatTimelineDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTimelineItems(
  cards: WalletCard[],
  packageTimestamp: string,
  anchor: TimeAnchor,
) {
  return cards
    .map((card) => {
      const recordTimestamp = getCardRecordTimestamp(card);
      const sortTimestamp =
        anchor === "record" ? recordTimestamp : packageTimestamp;
      return {
        id: card.id,
        title:
          card.displayName ?? card.displayNameEn ?? String(card.credentialId),
        source: card.sourceSystem ?? card.issuerHospitalName ?? "wallet",
        recordTimestamp,
        packageTimestamp,
        sortTimestamp,
        displayDate: formatTimelineDate(sortTimestamp),
        recordDate: formatTimelineDate(recordTimestamp),
        packageDate: formatTimelineDate(packageTimestamp),
      };
    })
    .sort(
      (left, right) =>
        new Date(right.sortTimestamp).getTime() -
        new Date(left.sortTimestamp).getTime(),
    );
}

function contextLabel(context: ScanOutcome["context"]): string {
  if (context in readinessContextLabels) {
    return readinessContextLabels[context as ReadinessContext].th;
  }
  const labels: Record<string, string> = {
    home: "หน้าแรก",
    documents: "เอกสาร",
    receive: "รับเอกสาร",
    share: "แชร์/ตรวจสอบ",
    prepare: "เตรียมเข้ารับบริการ",
    store: "คลังพกพา",
    history: "ประวัติ",
    settings: "ตั้งค่า",
    qr_scan: "สแกน QR",
  };
  return labels[String(context)] ?? String(context);
}

function statusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    active: "ใช้งานได้",
    verified: "ตรวจสอบแล้ว",
    valid: "ถูกต้อง",
    pending: "รอดำเนินการ",
    expired: "หมดอายุ",
    revoked: "ถูกเพิกถอน",
    invalid: "ไม่ถูกต้อง",
    suspended: "ระงับชั่วคราว",
    superseded: "มีเอกสารใหม่แทนแล้ว",
    ready: "พร้อม",
    partial: "บางส่วน",
    imported: "นำเข้าแล้ว",
    recorded: "บันทึกแล้ว",
  };
  return labels[String(status ?? "")] ?? String(status ?? "-");
}

function verifierBadgeTone(
  result: VerifierResult,
): "green" | "yellow" | "blue" | "red" {
  if (result.trustLevel === "green") return "green";
  if (result.trustLevel === "blue") return "blue";
  if (result.trustLevel === "yellow") return "yellow";
  return "red";
}

function verifierBadgeLabel(result: VerifierResult): string {
  if (result.trustLevel === "green" || result.verified) {
    return "ตรวจสอบผ่าน";
  }
  if (result.trustLevel === "blue") {
    return "ตรวจสอบ transport แล้ว";
  }
  if (result.trustLevel === "yellow") {
    return "ต้องตรวจสอบเพิ่มเติม";
  }
  return "ตรวจสอบไม่ผ่าน";
}

function scanTransportLabel(
  transport?: ScanPayloadDescriptor["transport"],
): string {
  const labels: Record<ScanPayloadDescriptor["transport"], string> = {
    standard_shl: "Canonical shlink",
    shl_web_viewer: "SHL Web Viewer",
    wallet_scan_url: "Wallet scan URL",
    raw_payload: "Raw payload",
  };
  return transport ? labels[transport] : "-";
}

function trustcareBindingLabel(
  binding?: ScanPayloadDescriptor["trustcareBinding"],
): string {
  const labels: Record<
    NonNullable<ScanPayloadDescriptor["trustcareBinding"]>,
    string
  > = {
    pending_manifest_vp: "รอ Maker/Checker",
    certified_manifest_vp: "TrustCare Manifest VP",
    standard_only: "SHL มาตรฐาน",
  };
  return binding ? labels[binding] : "-";
}

function shortPayload(value: string, maxLength = 520): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function describeScannablePayload(value: string): ScanPayloadDescriptor {
  const raw = value.trim();
  const canonicalPayload = extractScannablePayload(raw);
  const shl = parseShlLink(canonicalPayload);
  if (shl) {
    const webViewerUrl =
      /^https?:\/\//.test(raw) && raw.includes("#") ? raw : undefined;
    return {
      transport: webViewerUrl ? "shl_web_viewer" : "standard_shl",
      payloadKind: "shl",
      canonicalPayload: shl.raw,
      webViewerUrl,
      manifestUrl: shl.url,
      label: shl.label,
      passcodeRequired: shl.passcodeRequired,
      expiresAt: shl.expiresAt,
      trustcareBinding: "pending_manifest_vp",
    };
  }
  let transport: ScanPayloadDescriptor["transport"] = "raw_payload";
  try {
    const url = new URL(raw);
    if (url.searchParams.has("scan")) transport = "wallet_scan_url";
  } catch {
    // Raw payload.
  }
  const payloadKind: ScanPayloadDescriptor["payloadKind"] =
    canonicalPayload.startsWith("openid4vp://")
      ? "oid4vp"
      : canonicalPayload.startsWith("openid-credential-offer://")
        ? "oid4vci"
        : canonicalPayload.startsWith("{")
          ? detectJsonPayloadKind(canonicalPayload)
          : canonicalPayload.startsWith("eyJ")
            ? "vp"
            : "unknown";
  return { transport, payloadKind, canonicalPayload };
}

function detectJsonPayloadKind(
  payload: string,
): ScanPayloadDescriptor["payloadKind"] {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const type = String(parsed.type ?? "");
    if (type.includes("Presentation") || type.includes("VP")) return "vp";
    if (type.includes("SHL") || type.includes("SmartHealthLink")) return "shl";
    return "json";
  } catch {
    return "unknown";
  }
}

function createScannableWebUrl(payload: string): string {
  const raw = payload.trim();
  if (!raw) return raw;
  const shl = parseShlLink(raw);
  if (shl) {
    if (/^https?:\/\//.test(raw)) return raw;
    return createShlViewerUrl(currentAppBaseUrl(), shl.raw);
  }
  try {
    const url = new URL(raw);
    if (url.searchParams.has("scan")) return raw;
  } catch {
    // Raw VC/VP/SHL payloads are wrapped below so another device can open this web app.
  }
  const encoded = encodeURIComponent(payload);
  return `${currentAppBaseUrl()}?scan=${encoded}`;
}

function getObjectScanPayload(object: WalletStoredObject): string {
  const payload = object.payload as any;
  if (object.type === "shl" && payload) {
    const directShlPayload =
      typeof payload?.qrPayload === "string"
        ? payload.qrPayload
        : typeof payload?.shlUrl === "string"
          ? payload.shlUrl
          : typeof payload?.viewerUrl === "string"
            ? payload.viewerUrl
            : "";
    if (directShlPayload) return createScannableWebUrl(directShlPayload);
  }
  if (payload?.bundleId && payload?.contractId) {
    return "";
  }
  const directPayload =
    typeof payload?.qrPayload === "string"
      ? payload.qrPayload
      : typeof payload?.qrData === "string"
        ? payload.qrData
        : typeof payload?.shlUrl === "string"
          ? payload.shlUrl
          : typeof payload?.url === "string"
            ? payload.url
            : "";
  if (directPayload) return createScannableWebUrl(directPayload);
  return createScannableWebUrl(
    JSON.stringify({
      type: object.type,
      protocol: object.protocol,
      id: object.id,
      payload: object.payload,
    }),
  );
}

function describeStoredObjectPass(
  object: WalletStoredObject,
  user: WalletDemoUser,
) {
  const payload = (object.payload ?? {}) as any;
  const kind: BrandedPassKind =
    object.type === "shl"
      ? "shl"
      : object.type === "vp" || object.type === "oid4vp_request"
        ? "vp"
        : object.type === "service_packet"
          ? "bundle"
          : "store";
  const ownerLabel = user.nameEn || user.nameTh || "Wallet owner";
  const sourceLabel =
    object.source ||
    payload.issuerHospitalName ||
    payload.source ||
    payload.viewerUrl ||
    user.hospitalName ||
    "TrustCare Wallet";
  const issuerLabel =
    payload.issuerHospitalName ||
    payload.issuer ||
    payload.verifier ||
    payload.receiver ||
    object.subtitle ||
    sourceLabel;
  const protocolLabel =
    object.type === "shl"
      ? getShlTrustProfile(payload as ShlPackageDetail).label
      : object.protocol === "oid4vci"
        ? "OID4VCI Offer"
        : object.protocol === "oid4vp"
          ? "OID4VP Request"
          : object.type === "vp"
            ? "Verifiable Presentation"
            : object.type === "vc"
              ? "Verifiable Credential"
              : "Wallet Object";
  const expiresAt = object.expiresAt
    ? new Date(object.expiresAt).toLocaleString("th-TH")
    : "";
  const accessLabel = [
    object.type === "shl" && payload.passcodeRequired
      ? "ต้องใช้ passcode"
      : "เปิดผ่าน Web view",
    expiresAt ? `หมดอายุ ${expiresAt}` : "",
    object.protocol ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind,
    ownerLabel,
    sourceLabel: String(sourceLabel),
    issuerLabel: String(issuerLabel),
    protocolLabel,
    accessLabel,
    subtitle: object.subtitle || object.title,
    items: extractPassItems(payload, kind),
  };
}

function extractPassItems(payload: any, kind: BrandedPassKind): string[] {
  if (!payload) return [];
  if (Array.isArray(payload.items)) {
    return payload.items
      .map(
        (item: any) =>
          item?.label || item?.labelEn || item?.documentType || item?.key,
      )
      .filter(Boolean)
      .map(String);
  }
  if (Array.isArray(payload.readiness?.ready)) {
    return payload.readiness.ready
      .map((item: any) => item?.label || item?.documentType || item?.key)
      .filter(Boolean)
      .map(String);
  }
  if (Array.isArray(payload.documents)) {
    return payload.documents
      .map((item: any) => item?.title || item?.documentType || item?.id)
      .filter(Boolean)
      .map(String);
  }
  if (Array.isArray(payload.documentBundle?.documents)) {
    return payload.documentBundle.documents
      .map((item: any) => item?.title || item?.documentType || item?.id)
      .filter(Boolean)
      .map(String);
  }
  if (kind === "shl") return ["FHIR manifest", "Web viewer", "Access policy"];
  if (kind === "vp")
    return ["VP proof", "Selected credentials", "Verifier request"];
  return ["Contract context", "Document references", "Trust layer"];
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "TC";
  const ascii = words
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (ascii.length)
    return ascii
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  return value.trim().slice(0, 2).toUpperCase();
}

function getShlTrustProfile(shl: ShlPackageDetail | null | undefined): {
  kind: "trustcare-certified" | "trustcare-pending" | "standard-shl";
  label: string;
  tone: "green" | "yellow" | "blue" | "neutral";
  description: string;
} {
  const hasManifestBinding = Boolean(
    shl?.manifestCredentialId &&
    shl?.presentationId &&
    shl?.documentBundle?.documents?.length,
  );
  const certification = shl?.trustcareCertification;
  const makerCheckerApproved = Boolean(
    certification?.status === "maker_checker_approved" &&
    certification.ownerConfirmed &&
    certification.makerApprovedAt &&
    certification.checkerApprovedAt,
  );
  if (hasManifestBinding && makerCheckerApproved) {
    return {
      kind: "trustcare-certified",
      label: "TrustCare Verified SHL",
      tone: "green",
      description:
        "ผ่านการยืนยันเจ้าของข้อมูลและ Maker/Checker ของโรงพยาบาลในเครือข่าย TrustCare แล้ว",
    };
  }
  if (hasManifestBinding) {
    return {
      kind: "trustcare-pending",
      label: "รอ Maker/Checker",
      tone: "yellow",
      description:
        "พบ Manifest VP/VC แต่ยังไม่ผ่านขั้นตอน Maker/Checker จึงใช้เป็น SHL มาตรฐานเท่านั้น",
    };
  }
  return {
    kind: "standard-shl",
    label: "Standard SHL",
    tone: "blue",
    description:
      "SHL มาตรฐานจากภายนอก อ่านและแชร์ต่อได้โดยไม่ต้องมี Manifest VP/VC",
  };
}

function hasTrustCareShlManifestExtension(shl: ShlPackageDetail): boolean {
  return getShlTrustProfile(shl).kind === "trustcare-certified";
}

function buildShlManifestVerificationPayload(shl: ShlPackageDetail): string {
  const trustProfile = getShlTrustProfile(shl);
  const documents = shl.documentBundle?.documents ?? [];
  return JSON.stringify({
    type: "TrustCareShlManifestVP",
    trustProfile: trustProfile.kind,
    trustProfileLabel: trustProfile.label,
    protocol: "shl",
    id: `shl-manifest-vp:${shl.id}`,
    shlId: shl.id,
    label: shl.label,
    purpose: shl.purpose,
    context: shl.context,
    status: shl.status,
    shlUrl: shl.shlUrl,
    qrPayload: shl.qrPayload,
    viewerUrl: shl.viewerUrl,
    manifestCredentialId: shl.manifestCredentialId,
    holderPresentationId: shl.presentationId,
    expiresAt: shl.expiresAt,
    passcodeRequired: shl.passcodeRequired,
    trustcareCertification: shl.trustcareCertification,
    access: {
      current: shl.currentAccessCount ?? 0,
      max: shl.maxAccessCount ?? null,
    },
    source: shl.documentBundle?.source,
    bindingModel: shl.documentBundle?.bindingModel,
    standards: shl.documentBundle?.standards ?? [
      "SMART Health Links",
      "W3C VC/VP",
      "HL7 FHIR R4 DocumentReference",
    ],
    documents: documents.map((document) => ({
      id: document.id,
      sequence: document.sequence,
      title: document.title,
      documentType: document.documentType,
      category: document.category,
      status: document.status,
      fhirResource: document.fhirResource,
      contentType: document.contentType,
      manifestFileId: document.manifestFileId,
      hash: document.hash,
      manifestCredentialId: document.vcBinding?.manifestCredentialId,
      presentationId: document.vcBinding?.presentationId,
    })),
  });
}

function extractScannablePayload(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  const directShl = parseShlLink(raw);
  if (directShl) return directShl.raw;
  try {
    const url = new URL(raw);
    const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
    const hashShl = parseShlLink(hashPayload);
    if (hashShl) return hashShl.raw;
    const scanPayload = url.searchParams.get("scan");
    if (scanPayload) return extractScannablePayload(scanPayload);
  } catch {
    // Not a URL; keep the raw payload.
  }
  return raw;
}

function readScanPayloadFromLocation(): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
  const hashShl = parseShlLink(hashPayload);
  if (hashShl) return hashShl.raw;
  const payload = url.searchParams.get("scan");
  return payload ? extractScannablePayload(payload) : "";
}

function clearScanPayloadFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("scan");
  const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
  if (parseShlLink(hashPayload)) url.hash = "";
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function currentShareGatewayBaseUrl(): string | null {
  const configured = env.shareGatewayUrl;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") return null;
  if (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost"
  ) {
    return `${window.location.origin}/api/share-gateway`;
  }
  return null;
}

async function publishVpSharePackage(input: {
  gatewayBaseUrl: string;
  result: Extract<BuiltSharePackage, { presentation: unknown }>;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  recipient: string;
  expiresAt: string;
}): Promise<ShareGatewayPublicationResponse> {
  return publishShareArtifact(input.gatewayBaseUrl, {
    artifactId: input.result.presentation.presentationId,
    kind: "vp",
    contentType: "application/vp+json",
    payload: input.result.payload,
    ownerUserId: input.userId,
    holderDid: input.holderDid,
    context: input.purpose,
    purpose: readinessContextLabels[input.purpose].th,
    recipient: input.recipient,
    expiresAt: input.expiresAt,
    trustcare: {
      signingStatus: "pending_backend_signature",
      expectedProof: ["ES256", "EdDSA", "DataIntegrityProof"],
    },
  });
}

async function publishShlSharePackage(input: {
  gatewayBaseUrl: string;
  result: Extract<BuiltSharePackage, { shl: unknown }>;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  recipient: string;
  expiresAt: string;
}): Promise<ShareGatewayPublicationResponse> {
  const shl = input.result.shl;
  const manifest = recordValue(shl.manifest);
  if (!manifest) {
    throw new Error("SHL package ไม่มี manifest สำหรับ publish");
  }
  const publicationId = String(
    shl.gatewayPublicationId ?? shl.shlId ?? input.result.payload.shlUrl,
  );
  const certified = shl.trustLayerStatus === "certified_manifest_vp";
  const manifestPublication = await publishShareArtifact(input.gatewayBaseUrl, {
    artifactId: publicationId,
    kind: certified ? "certified_shl_manifest" : "standard_shl_manifest",
    contentType: "application/json",
    payload: manifest,
    ownerUserId: input.userId,
    holderDid: input.holderDid,
    context: input.purpose,
    purpose: readinessContextLabels[input.purpose].th,
    recipient: input.recipient,
    expiresAt: input.expiresAt,
    accessPolicy: {
      expiresAt: shl.expiresAt,
      passcodeRequired: shl.passcodeRequired,
      passcodeHint: shl.passcodeHint,
      maxAccessCount: shl.maxAccessCount,
      accessCodeDelivery: shl.accessCodeDelivery,
    },
    trustcare: {
      trustLayerStatus: shl.trustLayerStatus,
      manifestUrl: shl.manifestUrl,
      canonicalShlUrl: shl.canonicalShlUrl ?? shl.shlUrl,
    },
  });

  const trustcare = recordValue(manifest.trustcare);
  const supportPublications = certified
    ? await publishCertifiedShlTrustArtifacts({
        gatewayBaseUrl: input.gatewayBaseUrl,
        publicationId,
        trustcare,
        userId: input.userId,
        holderDid: input.holderDid,
        purpose: input.purpose,
        recipient: input.recipient,
        expiresAt: input.expiresAt,
      })
    : [];

  return {
    ...manifestPublication,
    publicUrl: manifestPublication.publicUrl ?? shl.manifestUrl,
    qrPayload: shl.qrPayload,
    warnings: [
      ...(manifestPublication.warnings ?? []),
      ...supportPublications.flatMap(
        (publication) => publication.warnings ?? [],
      ),
      ...(shl.warnings ?? []),
    ],
  };
}

async function publishCertifiedShlTrustArtifacts(input: {
  gatewayBaseUrl: string;
  publicationId: string;
  trustcare: Record<string, unknown> | null;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  recipient: string;
  expiresAt: string;
}): Promise<ShareGatewayPublicationResponse[]> {
  if (!input.trustcare) return [];
  const artifactInputs: Array<{
    key: "manifestVp" | "manifestCredential" | "holderAuthorizationCredential";
    kind: "manifest_vp" | "manifest_credential" | "holder_authorization";
    contentType: string;
  }> = [
    {
      key: "manifestVp",
      kind: "manifest_vp",
      contentType: "application/vp+json",
    },
    {
      key: "manifestCredential",
      kind: "manifest_credential",
      contentType: "application/vc+json",
    },
    {
      key: "holderAuthorizationCredential",
      kind: "holder_authorization",
      contentType: "application/vc+json",
    },
  ];

  const publications: ShareGatewayPublicationResponse[] = [];
  for (const artifact of artifactInputs) {
    const payload = recordValue(input.trustcare[artifact.key]);
    if (!payload) continue;
    publications.push(
      await publishShareArtifact(input.gatewayBaseUrl, {
        artifactId: input.publicationId,
        kind: artifact.kind,
        contentType: artifact.contentType,
        payload,
        ownerUserId: input.userId,
        holderDid: input.holderDid,
        context: input.purpose,
        purpose: readinessContextLabels[input.purpose].th,
        recipient: input.recipient,
        expiresAt: input.expiresAt,
      }),
    );
  }
  return publications;
}

async function publishShareArtifact(
  gatewayBaseUrl: string,
  request: Parameters<typeof createShareGatewayPublicationRequest>[0],
): Promise<ShareGatewayPublicationResponse> {
  const response = await fetch(
    `${gatewayBaseUrl.replace(/\/$/, "")}/artifacts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(createShareGatewayPublicationRequest(request)),
    },
  );
  const payload = (await response
    .json()
    .catch(() => null)) as ShareGatewayPublicationResponse | null;
  if (!response.ok || !payload?.ok) {
    const errors = payload?.errors?.length
      ? payload.errors.join(" ")
      : response.statusText;
    throw new Error(`Share Gateway publish failed: ${errors}`);
  }
  return payload;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function currentAppBaseUrl(): string {
  if (typeof window === "undefined")
    return baseApiOptions.demoOrigin.replace(/\/$/, "");
  return `${window.location.origin}${window.location.pathname.replace(/\/?$/, "/")}`.replace(
    /\/$/,
    "",
  );
}

function readScanHistory(): Record<string, ScanOutcome[]> {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(scanHistoryStorageKey);
    return value ? (JSON.parse(value) as Record<string, ScanOutcome[]>) : {};
  } catch {
    return {};
  }
}

function writeScanHistory(value: Record<string, ScanOutcome[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scanHistoryStorageKey, JSON.stringify(value));
}

function readStoredExtras(): Record<string, WalletStoredObject[]> {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(storedExtrasStorageKey);
    return value ? (JSON.parse(value) as Record<string, WalletStoredObject[]>) : {};
  } catch {
    return {};
  }
}

function writeStoredExtras(value: Record<string, WalletStoredObject[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storedExtrasStorageKey, JSON.stringify(value));
}

function toneForObject(
  object: WalletStoredObject,
): "neutral" | "green" | "yellow" | "red" | "blue" {
  if (
    object.status === "active" ||
    object.status === "verified" ||
    object.status === "valid"
  )
    return "green";
  if (object.status === "expired" || object.status === "invalid") return "red";
  if (object.status === "pending") return "yellow";
  return "neutral";
}

function downloadExport(result: WalletExportResult) {
  const blob = new Blob([result.data], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyText(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard?.writeText(value);
    return;
  } catch {
    // Fall through to the legacy selection path for browser contexts without clipboard permission.
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function friendlyWalletRuntimeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function friendlyPortalSyncError(error: unknown): string {
  const message = friendlyWalletRuntimeError(
    error,
    "ไม่สามารถ Sync จาก TrustCare Portal ได้",
  );
  if (/load failed|failed to fetch|networkerror|cors/i.test(message)) {
    return [
      "Browser ติดต่อ TrustCare Portal ไม่สำเร็จ",
      "กรุณาตรวจ CORS/Network ของ Portal สำหรับ GitHub Pages และ localhost",
      "โดยต้องอนุญาต /api/auth/demo-login, /api/wallet/sync และ /api/wallet/sync/verify",
    ].join(" · ");
  }
  return message;
}

function resolveAvatarUrl(url: string): string {
  const normalized = normalizePhotoUrl(url);
  if (
    /^https?:\/\//i.test(normalized) ||
    normalized.startsWith("data:") ||
    normalized.startsWith("/")
  )
    return normalized;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${normalized.replace(/^\//, "")}`;
}

function shortDid(did: string): string {
  if (did.length <= 22) return did;
  return `${did.slice(0, 12)}...${did.slice(-6)}`;
}

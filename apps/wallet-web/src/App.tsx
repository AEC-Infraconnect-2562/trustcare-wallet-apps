import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import QRCode from "qrcode";
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
  Image,
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
  Wallet
} from "lucide-react";
import { shlApi, verifierApi, walletApi } from "@trustcare/api-client";
import { useLanguage } from "@trustcare/i18n/src/provider.web";
import { Badge, Button, Surface, WalletCardView } from "@trustcare/ui-web";
import {
  buildPortalInteroperabilityFixtures,
  buildServiceBundleEnvelope,
  countCardsByCategory,
  assessLocalReadiness,
  createDemoCheckinQr,
  credentialTypeForDocument,
  exportWalletObject,
  exportWalletObjects,
  flattenCardsByCategory,
  getDemoUser,
  importWalletExchange,
  mergeWalletObjects,
  readinessContextLabels,
  readinessContextValues,
  shlAccessSummary,
  walletObjectFromServicePacket,
  walletObjectsFromCards,
  walletObjectsFromHistory,
  walletObjectsFromShl,
  walletDemoUsers,
  type CheckinQrResponse,
  type ContractHubCatalog,
  type PresentationHistoryItem,
  type ReadinessContext,
  type ServiceBundleEnvelope,
  type ServicePacketResponse,
  type ShlPackage,
  type ShlPackageDetail,
  type ShlManifestDocument,
  type WalletCard,
  type WalletCardsByCategory,
  type WalletDocumentRequest,
  type WalletDemoUser,
  type WalletExportResult,
  type WalletImportResult,
  type WalletImportJob,
  type WalletPresentationResponse,
  type WalletStoredObject,
  type VerifierResult
} from "@trustcare/wallet-core";
import { env } from "./env";
import { useOfflineWallet } from "./hooks/useOfflineWallet";
import { useWebAuthn } from "./hooks/useWebAuthn";
import { CredentialDetailDialog } from "./components/CredentialDetailDialog";
import { QrScannerDialog } from "./components/QrScannerDialog";
import { SelectiveDisclosureDialog } from "./components/SelectiveDisclosureDialog";

type View = "home" | "documents" | "receive" | "share" | "prepare" | "store" | "history" | "settings";
type DocumentsTab = "cards" | "receive" | "store" | "history";
type StoreFilter = "all" | "vc" | "vp" | "shl" | "oid" | "service";

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
  verifier: VerifierResult;
  importResult: WalletImportResult;
  scannedAt: string;
};

const baseApiOptions = {
  url: env.apiUrl,
  demoMode: env.demoMode,
  demoOrigin: typeof window !== "undefined" ? window.location.origin : "https://trustcare.example.com"
};

const walletSessionKey = "trustcare-wallet-active-user";
const defaultLoginUserId = "demo-patient-complete-001";
const scanHistoryStorageKey = "trustcare-wallet-scan-history";

const categoryLabels: Record<string, { th: string; en: string }> = {
  identity_and_access: { th: "ตัวตนและสิทธิ์", en: "Identity & Access" },
  clinical_summary: { th: "สรุปทางคลินิก", en: "Clinical Summary" },
  medication_and_pharmacy: { th: "ยาและเภสัชกรรม", en: "Medication & Pharmacy" },
  diagnostics_and_results: { th: "ผลตรวจและวินิจฉัย", en: "Diagnostics & Results" },
  care_transition: { th: "ส่งต่อการดูแล", en: "Care Transition" },
  claims_and_finance: { th: "เคลมและการเงิน", en: "Claims & Finance" },
  medical_tourism: { th: "รักษาต่างประเทศ", en: "Medical Tourism" },
  sharing_and_sync: { th: "แชร์และซิงก์", en: "Sharing & Sync" },
  operations: { th: "ปฏิบัติการ", en: "Operations" }
};

const criticalCardTypes = new Set([
  "patient_identity",
  "staff_identity",
  "allergy_alert",
  "medication_summary",
  "prescription",
  "insurance_eligibility",
  "appointment"
]);

const readinessPurposeTh: Record<ReadinessContext, string> = {
  opd_visit: "เตรียมเอกสารขั้นต่ำสำหรับลงทะเบียนและเริ่มรับบริการตรวจรักษา",
  emergency: "เตรียมข้อมูลตัวตน แพ้ยา รายการยา และโรคสำคัญให้เข้าถึงได้รวดเร็ว",
  referral: "รวบรวมใบส่งต่อและสรุปข้อมูลทางคลินิกให้โรงพยาบาลปลายทางตรวจรับ",
  cross_border: "เตรียมเอกสารที่ตรวจสอบได้สำหรับการรักษาข้ามเครือข่ายหรือข้ามแดน",
  medical_tourist: "เตรียมตัวตน เอกสารเดินทาง การเงิน และข้อมูลคลินิกสำหรับ pre-review",
  insurance_claim: "เตรียมสิทธิ์รักษา ข้อมูลคลินิก และเอกสารประกอบการเคลม",
  pharmacy_dispense: "เตรียมใบสั่งยา รายการยา การแพ้ยา และตัวตนสำหรับรับยาหรือต่อยา"
};

const sharePurposeProfiles: Record<ReadinessContext, {
  recipient: string;
  expiryMinutes: number;
  help: string;
  transport: "vp_qr" | "shl_recommended" | "shl_manifest";
  biometricRequired: boolean;
  fields: Array<{ key: string; label: string }>;
}> = {
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
      { key: "coverage", label: "สิทธิ์/ประกัน" }
    ]
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
      { key: "emergency_contact", label: "ติดต่อฉุกเฉิน" }
    ]
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
      { key: "coverage", label: "สิทธิ์/ประกัน" }
    ]
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
      { key: "consent", label: "ความยินยอม" }
    ]
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
      { key: "visa", label: "วีซ่า" }
    ]
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
      { key: "receipt", label: "ใบเสร็จ" }
    ]
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
      { key: "dispense_history", label: "ประวัติจ่ายยา" }
    ]
  }
};

const readinessContexts = Object.keys(readinessContextLabels) as ReadinessContext[];

const viewBreadcrumbLabels: Record<View, string> = {
  home: "หน้าแรก",
  documents: "เอกสาร",
  receive: "รับเอกสาร",
  share: "แชร์",
  prepare: "เตรียมบริการ",
  store: "คลังข้อมูล",
  history: "ประวัติ",
  settings: "ตั้งค่า"
};

const documentTabBreadcrumbLabels: Record<DocumentsTab, string> = {
  cards: "รายการเอกสาร",
  receive: "รับเอกสาร",
  store: "คลังข้อมูล",
  history: "ประวัติ"
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
  const [bundleQrDataUrl, setBundleQrDataUrl] = useState("");
  const [servicePacketQrDataUrl, setServicePacketQrDataUrl] = useState("");
  const [checkinQrDataUrl, setCheckinQrDataUrl] = useState("");
  const [presentation, setPresentation] = useState<WalletPresentationResponse | null>(null);
  const [verifierResult, setVerifierResult] = useState<VerifierResult | null>(null);
  const [scanOutcome, setScanOutcome] = useState<ScanOutcome | null>(null);
  const [scanHistoryByUser, setScanHistoryByUser] = useState<Record<string, ScanOutcome[]>>(() => readScanHistory());
  const [pendingScanPayload, setPendingScanPayload] = useState(() => readScanPayloadFromLocation());
  const [readinessContext, setReadinessContext] = useState<ReadinessContext>("opd_visit");
  const [readiness, setReadiness] = useState<any>(null);
  const [contractHub, setContractHub] = useState<ContractHubCatalog | null>(null);
  const [prepareWorkbench, setPrepareWorkbench] = useState<any>(null);
  const [documentRequests, setDocumentRequests] = useState<WalletDocumentRequest[]>([]);
  const [serviceBundle, setServiceBundle] = useState<ServiceBundleEnvelope | null>(null);
  const [servicePacket, setServicePacket] = useState<ServicePacketResponse | null>(null);
  const [checkinQr, setCheckinQr] = useState<CheckinQrResponse | null>(null);
  const [importJob, setImportJob] = useState<WalletImportJob | null>(null);
  const [storedExtrasByUser, setStoredExtrasByUser] = useState<Record<string, WalletStoredObject[]>>({});
  const [lastImportMessage, setLastImportMessage] = useState("");
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const offlineWallet = useOfflineWallet();
  const webAuthn = useWebAuthn();
  const activeUser = useMemo(() => getDemoUser(selectedUserId), [selectedUserId]);
  const apiOptions = useMemo(() => ({ ...baseApiOptions, userId: selectedUserId }), [selectedUserId]);
  const interopFixtures = useMemo(() => buildPortalInteroperabilityFixtures(selectedUserId, baseApiOptions.demoOrigin), [selectedUserId]);
  const storedExtras = storedExtrasByUser[selectedUserId] ?? [];
  const scanHistory = scanHistoryByUser[selectedUserId] ?? [];
  const navigateTo = useCallback((nextView: View, options?: { replace?: boolean }) => {
    if (nextView === view) return;
    if (!options?.replace) {
      setViewHistory(previous => [...previous.slice(-7), view]);
    }
    setView(nextView);
  }, [view]);
  const goBack = useCallback(() => {
    setViewHistory(previous => {
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
    void Promise.all([
      walletApi.cardsByCategory(apiOptions),
      walletApi.history(apiOptions),
      shlApi.listShl(apiOptions),
      walletApi.contractHub(apiOptions)
    ]).then(([cards, walletHistory, shl, hub]) => {
      setGrouped(cards);
      setHistory(walletHistory);
      setShlPackages(shl);
      setContractHub(hub);
      void offlineWallet.syncCards(flattenCardsByCategory(cards));
    });
    setSelectedCard(null);
    setDetailOpen(false);
    setQrDataUrl("");
    setBundleQrDataUrl("");
    setServicePacketQrDataUrl("");
    setCheckinQrDataUrl("");
    setPresentation(null);
    setVerifierResult(null);
    setScanOutcome(null);
    setServiceBundle(null);
    setServicePacket(null);
    setCheckinQr(null);
    setImportJob(null);
    setLastImportMessage("");
  }, [apiOptions, selectedUserId]);

  useEffect(() => {
    void Promise.all([
      walletApi.readiness(apiOptions, { context: readinessContext }),
      walletApi.prepareWorkbench(apiOptions, { context: readinessContext }),
      walletApi.documentRequests(apiOptions, { context: readinessContext })
    ]).then(([nextReadiness, workbench, requests]) => {
      setReadiness(nextReadiness);
      setPrepareWorkbench(workbench);
      setDocumentRequests(requests);
    });
  }, [apiOptions, readinessContext]);

  const allCards = useMemo(() => {
    const online = flattenCardsByCategory(grouped);
    return online.length ? online : offlineWallet.offlineCards.filter(card => card.ownerUserId === selectedUserId);
  }, [grouped, offlineWallet.offlineCards, selectedUserId]);

  useEffect(() => {
    if (!allCards.length) return;
    const nextReadiness = assessLocalReadiness(allCards, readinessContext);
    setReadiness((previous: any) => previous
      ? { ...previous, readiness: nextReadiness }
      : { patientId: activeUser.patientId, readiness: nextReadiness, requests: [], previousChecks: [] }
    );
    setPrepareWorkbench((previous: any) => previous
      ? { ...previous, patient: { ...previous.patient, readiness: nextReadiness } }
      : previous
    );
  }, [activeUser.patientId, allCards, readinessContext]);

  const counts = useMemo(() => countCardsByCategory(grouped), [grouped]);
  const serviceReadinessSummaries = useMemo<ServiceReadinessSummary[]>(() => readinessContexts.map(context => {
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
      missingRequired: (result.missing ?? []).filter(item => item.required).length,
      readyLabels: (result.ready ?? []).map(item => item.label).slice(0, 4),
      missingLabels: (result.missing ?? []).map(item => item.label).slice(0, 4)
    };
  }), [allCards]);
  const serviceObjects = useMemo(() => {
    const objects: WalletStoredObject[] = [];
    if (servicePacket) objects.push(walletObjectFromServicePacket(servicePacket));
    if (checkinQr) objects.push(walletObjectFromServicePacket(checkinQr));
    if (serviceBundle) {
      objects.push({
        id: `service_bundle:${serviceBundle.bundleId}`,
        type: "document_reference",
        title: "ซอง Service Bundle",
        subtitle: serviceBundle.contractId,
        status: serviceBundle.status,
        protocol: "trustcare",
        createdAt: serviceBundle.createdAt,
        expiresAt: serviceBundle.expiresAt,
        payload: serviceBundle
      });
    }
    return objects;
  }, [checkinQr, serviceBundle, servicePacket]);

  const scanHistoryObjects = useMemo<WalletStoredObject[]>(() => scanHistory.map(item => ({
    id: `scan_history:${item.id}`,
    type: "document_reference",
    title: `ประวัติการสแกน ${item.verifier.protocol ?? item.importResult.format}`,
    subtitle: item.verifier.requestSummary ?? item.importResult.format,
    status: item.verifier.verified ? "verified" : "pending",
    protocol: item.importResult.protocol === "shl" ? "shl" : item.importResult.protocol === "oid4vci" ? "oid4vci" : item.importResult.protocol === "oid4vp" ? "oid4vp" : "trustcare",
    createdAt: item.scannedAt,
    payload: item
  })), [scanHistory]);

  const storedObjects = useMemo(
    () => mergeWalletObjects(
      walletObjectsFromCards(allCards),
      walletObjectsFromHistory(history),
      walletObjectsFromShl(shlPackages),
      serviceObjects,
      scanHistoryObjects,
      storedExtras
    ),
    [allCards, history, scanHistoryObjects, serviceObjects, shlPackages, storedExtras]
  );

  const filteredObjects = useMemo(() => {
    if (storeFilter === "all") return storedObjects;
    if (storeFilter === "oid") return storedObjects.filter(item => item.type === "oid4vci_offer" || item.type === "oid4vp_request");
    if (storeFilter === "service") return storedObjects.filter(item => item.type === "service_packet" || item.id.startsWith("service_bundle:"));
    return storedObjects.filter(item => item.type === storeFilter);
  }, [storeFilter, storedObjects]);

  const addStoredObject = useCallback((object: WalletStoredObject) => {
    setStoredExtrasByUser(previous => ({
      ...previous,
      [selectedUserId]: mergeWalletObjects(previous[selectedUserId] ?? [], [object])
    }));
  }, [selectedUserId]);

  const addScanHistory = useCallback((outcome: ScanOutcome) => {
    setScanHistoryByUser(previous => {
      const next = {
        ...previous,
        [outcome.userId]: [outcome, ...(previous[outcome.userId] ?? [])].slice(0, 80)
      };
      writeScanHistory(next);
      return next;
    });
  }, []);

  const generateQr = useCallback(async (fields: string[] = []) => {
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
          qrData: cached.qrData
        });
        setQrDataUrl(cached.qrDataUrl);
        return;
      }
    }
    const result = await walletApi.present(apiOptions, {
      cardId: selectedCard.id,
      selectedFields: fields,
      audience: "TrustCare credential verifier",
      validMinutes: 10
    });
    const scannableQr = createScannableWebUrl(result.qrData);
    const presentationWithWebQr = { ...result, qrData: scannableQr };
    setPresentation(presentationWithWebQr);
    const nextQr = await QRCode.toDataURL(scannableQr, { margin: 1, width: 260 });
    setQrDataUrl(nextQr);
    await offlineWallet.cacheQr(selectedCard.id, scannableQr, result.presentationId, result.expiresAt);
    setSelectiveOpen(false);
  }, [apiOptions, offlineWallet, selectedCard, webAuthn]);

  const importPayload = useCallback((value: string) => {
    const payload = extractScannablePayload(value);
    const result = importWalletExchange(payload, allCards);
    if (result.object) addStoredObject(result.object);
    setLastImportMessage(result.ok ? `นำเข้า ${result.format}${result.matchedCredentialIds?.length ? ` / ตรงกับเอกสาร ${result.matchedCredentialIds.length} รายการ` : ""}` : result.errors.join(", "));
    return result;
  }, [addStoredObject, allCards]);

  const verifyScan = useCallback(async (value: string, contextOverride?: ScanOutcome["context"]) => {
    const payload = extractScannablePayload(value);
    const imported = importPayload(payload);
    const result = await verifierApi.verifyQr(apiOptions, payload);
    const mergedResult = { ...result, matchedCredentialIds: imported.matchedCredentialIds ?? result.matchedCredentialIds };
    const outcome = {
      id: `scan_${selectedUserId}_${Date.now().toString(36)}`,
      userId: selectedUserId,
      context: contextOverride ?? (view === "prepare" ? readinessContext : view),
      raw: value,
      payload,
      verifier: mergedResult,
      importResult: imported,
      scannedAt: new Date().toISOString()
    } satisfies ScanOutcome;
    setVerifierResult(mergedResult);
    setScanOutcome(outcome);
    addScanHistory(outcome);
    setLastImportMessage(mergedResult.verified ? "สแกน QR และตรวจสอบผ่านแล้ว" : "สแกน QR แล้ว แต่ต้องตรวจสอบรายละเอียดเพิ่มเติม");
    navigateTo("share");
  }, [addScanHistory, apiOptions, importPayload, navigateTo, readinessContext, selectedUserId, view]);

  const buildBundle = useCallback(async () => {
    const result = buildServiceBundleEnvelope({
      context: readinessContext,
      cards: allCards,
      audience: "patient",
      patientId: activeUser.patientId,
      receiver: "โรงพยาบาลที่รองรับ TrustCare"
    });
    setServiceBundle(result);
    const bundlePayload = createScannableWebUrl(compactBundlePayload(result));
    setBundleQrDataUrl(await QRCode.toDataURL(bundlePayload, { margin: 1, width: 220 }));
    setLastImportMessage(`สร้าง Service Bundle ${result.bundleId} และเก็บเข้าคลังแล้ว`);
  }, [activeUser.patientId, allCards, readinessContext]);

  const buildPacket = useCallback(async () => {
    const localReadiness = assessLocalReadiness(allCards, readinessContext);
    const presentationId = `vp_service_${readinessContext}_${Date.now().toString(36)}`;
    const result: ServicePacketResponse = {
      checkId: `check_${Date.now().toString(36)}`,
      patientId: activeUser.patientId,
      readiness: localReadiness,
      presentationId,
      expiresAt: new Date(Date.now() + 1440 * 60_000).toISOString(),
      credentialCount: localReadiness.selectedCardIds.length,
      qrData: `${baseApiOptions.demoOrigin}/verifier?vp=${presentationId}`
    };
    const scannableQr = createScannableWebUrl(result.qrData);
    setServicePacket({ ...result, qrData: scannableQr });
    setServicePacketQrDataUrl(await QRCode.toDataURL(scannableQr, { margin: 1, width: 220 }));
    setLastImportMessage(`สร้าง Service VP ${result.presentationId} แล้ว`);
  }, [activeUser.patientId, allCards, readinessContext]);

  const buildCheckinQr = useCallback(async () => {
    const localReadiness = assessLocalReadiness(allCards, readinessContext);
    const result = createDemoCheckinQr(readinessContext, localReadiness.selectedCardIds.length);
    const scannableQr = createScannableWebUrl(result.qrPayload);
    setCheckinQr({ ...result, qrPayload: scannableQr, shlUrl: scannableQr });
    setCheckinQrDataUrl(await QRCode.toDataURL(scannableQr, { margin: 1, width: 220 }));
    setLastImportMessage(`สร้าง Check-in SHL ${result.shlId} แล้ว`);
  }, [allCards, readinessContext]);

  const prepareAllServiceArtifacts = useCallback(async () => {
    await buildBundle();
    await buildPacket();
    await buildCheckinQr();
    setLastImportMessage("เตรียมชุดเอกสารเข้ารับบริการครบแล้ว สามารถส่ง QR ให้โรงพยาบาลได้");
  }, [buildBundle, buildCheckinQr, buildPacket]);

  const changeReadinessContext = useCallback((context: ReadinessContext) => {
    setReadinessContext(context);
    setServiceBundle(null);
    setServicePacket(null);
    setCheckinQr(null);
    setBundleQrDataUrl("");
    setServicePacketQrDataUrl("");
    setCheckinQrDataUrl("");
    setImportJob(null);
    setLastImportMessage("");
  }, []);

  const importMissing = useCallback(async () => {
    const missing = readiness?.readiness?.missing?.[0];
    if (!missing) {
      setLastImportMessage("เอกสารจำเป็นครบแล้ว ยังไม่ต้องนำเข้าเพิ่ม");
      return;
    }
    const documentType = missing.cardTypes?.[0] ?? missing.key ?? "patient_summary";
    const documentCategory = missing.category ?? "clinical_summary";
    const result = await walletApi.importForService(apiOptions, {
      context: readinessContext,
      patientId: activeUser.patientId,
      documentType,
      sourceType: "patient_upload"
    });
    setImportJob({ ...(result as WalletImportJob), context: readinessContext } as WalletImportJob);
    const now = new Date();
    const importedCard: WalletCard = {
      id: now.getTime(),
      cardType: documentType,
      displayName: missing.label ?? documentType,
      displayNameEn: missing.labelEn ?? documentType,
      documentCategory,
      credentialId: `imported:${selectedUserId}:${result.importId}`,
      credentialStatus: "active",
      credentialType: credentialTypeForDocument(documentType),
      issuerHospitalName: activeUser.hospitalName,
      issuerDid: activeUser.issuerDid,
      holderDid: activeUser.holderDid,
      patientAvatarUrl: activeUser.avatarUrl,
      ownerUserId: activeUser.id,
      patientId: activeUser.patientId,
      sourceSystem: "partner_wallet",
      scopeLabel: "นำเข้าใน TrustCare Wallet",
      createdAt: now.toISOString(),
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60_000).toISOString(),
      credentialData: {
        "@context": ["https://www.w3.org/ns/credentials/v2", "https://trustcare.network/contexts/service-readiness/v1"],
        type: ["VerifiableCredential", credentialTypeForDocument(documentType)],
        id: `urn:uuid:${selectedUserId}:${result.importId}`,
        issuer: activeUser.issuerDid,
        validFrom: now.toISOString(),
        credentialSubject: {
          id: activeUser.holderDid,
          patientId: activeUser.patientId,
          documentType,
          serviceContext: readinessContext,
          importedFor: readinessContextLabels[readinessContext].th,
          evidence: result.documentReference
        },
        evidence: [
          {
            type: "DocumentReference",
            source: result.sourceType,
            resource: result.documentReference
          }
        ],
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "eddsa-rdfc-2022",
          proofPurpose: "assertionMethod",
          verificationMethod: activeUser.issuerDid,
          created: now.toISOString()
        }
      }
    };
    setGrouped(previous => ({
      ...previous,
      [documentCategory]: [
        ...(previous[documentCategory] ?? []).filter(card => card.cardType !== documentType),
        importedCard
      ]
    }));
    addStoredObject({
      id: `import_job:${result.importId}`,
      type: "document_reference",
      title: "เอกสารบริการที่นำเข้า",
      subtitle: result.documentType ?? result.sourceType,
      status: result.status,
      protocol: "trustcare",
      createdAt: new Date().toISOString(),
      payload: result
    });
    setLastImportMessage(`สร้างงานนำเข้า ${result.importId} แล้ว`);
  }, [activeUser, addStoredObject, apiOptions, readiness, readinessContext, selectedUserId]);

  const requestMissing = useCallback(async () => {
    const missing = readiness?.readiness?.missing?.[0];
    if (!missing) {
      setLastImportMessage("เอกสารจำเป็นครบแล้ว ไม่มีรายการที่ต้องขอเพิ่ม");
      return;
    }
    const result = await walletApi.requestDocument(apiOptions, {
      context: readinessContext,
      documentType: missing.cardTypes?.[0] ?? missing.key ?? "patient_summary",
      sourceType: "hospital",
      patientId: activeUser.patientId
    });
    const requestId = (result as any).requestId ?? `wdr_demo_${Date.now()}`;
    setDocumentRequests(prev => [
      {
        ...(result as WalletDocumentRequest),
        id: (result as any).id ?? requestId,
        requestId,
        context: readinessContext,
        documentType: missing.cardTypes?.[0] ?? missing.key ?? "patient_summary",
        sourceType: "hospital",
        status: (result as any).status ?? "requested",
        createdAt: new Date().toISOString()
      } as WalletDocumentRequest,
      ...prev
    ]);
    setLastImportMessage(`สร้างคำขอเอกสาร ${(result as any).requestId ?? (result as any).id} แล้ว`);
  }, [activeUser.patientId, apiOptions, readiness, readinessContext]);

  const exportResult = useCallback((result: WalletExportResult) => {
    downloadExport(result);
    setLastImportMessage(`ส่งออก ${result.fileName} แล้ว`);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !pendingScanPayload || !allCards.length) return;
    if (allCards.some(card => card.ownerUserId && card.ownerUserId !== selectedUserId)) return;
    const payload = pendingScanPayload;
    setPendingScanPayload("");
    clearScanPayloadFromLocation();
    void verifyScan(payload, "qr_scan");
  }, [allCards, isAuthenticated, pendingScanPayload, selectedUserId, verifyScan]);

  const loginAs = useCallback((userId: string) => {
    window.localStorage.setItem(walletSessionKey, userId);
    setSelectedUserId(userId);
    setIsAuthenticated(true);
    setViewHistory([]);
    setView(pendingScanPayload ? "share" : "home");
  }, [pendingScanPayload]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(walletSessionKey);
    setIsAuthenticated(false);
    setViewHistory([]);
    setView("home");
    setSelectedCard(null);
    setDetailOpen(false);
    setVerifierResult(null);
    setScanOutcome(null);
  }, []);

  const pageCopy: Record<View, { title: string; subtitle: string }> = {
    home: {
      title: "TrustCare Wallet",
      subtitle: "เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้"
    },
    documents: {
      title: "เอกสารสุขภาพ",
      subtitle: "ค้นหา กรอง ปักหมุด และตรวจดูเอกสารสุขภาพที่ตรวจสอบได้"
    },
    receive: {
      title: "รับเอกสาร",
      subtitle: "สแกน วาง หรือ import OID4VCI offer, OID4VP request, SHL และ VC/VP"
    },
    share: {
      title: "แชร์เอกสาร",
      subtitle: "สร้าง VP QR และ selective disclosure ตามวัตถุประสงค์การใช้งาน"
    },
    prepare: {
      title: "เตรียมเข้ารับบริการ",
      subtitle: "สร้างชุดเอกสารบริการจากกติกา Contract Hub"
    },
    store: {
      title: "คลังพกพา",
      subtitle: "ตรวจดูและส่งออก VC, VP, SHL และ service object ในเครื่อง"
    },
    history: {
      title: "ประวัติ",
      subtitle: "ประวัติการแสดงข้อมูล การตรวจสอบ และการแชร์"
    },
    settings: {
      title: "ตั้งค่า",
      subtitle: "ตัวตน ความปลอดภัย ภาษา ธีม และโหมดนักพัฒนา"
    }
  };
  const title = pageCopy[view].title;
  const breadcrumbs = [
    "TrustCare Wallet",
    viewBreadcrumbLabels[view],
    ...(view === "documents" ? [documentTabBreadcrumbLabels[documentsTab]] : [])
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
          <NavButton active={view === "home"} icon={<Home />} label="หน้าแรก" onClick={() => navigateTo("home")} />
          <NavButton
            active={view === "documents" || view === "receive" || view === "store" || view === "history"}
            icon={<FileText />}
            label="เอกสาร"
            onClick={() => openDocumentsHub("cards")}
          />
          <NavButton active={view === "share"} icon={<Share2 />} label="แชร์" onClick={() => navigateTo("share")} />
          <NavButton active={view === "prepare"} icon={<Activity />} label="เตรียมบริการ" onClick={() => navigateTo("prepare")} />
          <NavButton active={view === "settings"} icon={<Settings />} label="ตั้งค่า" onClick={() => navigateTo("settings")} />
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
          <NavButton active={view === "home"} icon={<Home />} label="หน้าแรก" onClick={() => navigateTo("home")} />
          <NavButton active={view === "documents"} icon={<FileText />} label="เอกสาร" onClick={() => navigateTo("documents")} />
          <NavButton active={view === "receive"} icon={<Inbox />} label="รับเอกสาร" onClick={() => navigateTo("receive")} />
          <NavButton active={view === "share"} icon={<Share2 />} label="แชร์" onClick={() => navigateTo("share")} />
          <NavButton active={view === "prepare"} icon={<Activity />} label="เตรียมบริการ" onClick={() => navigateTo("prepare")} />
          <NavButton active={view === "store"} icon={<Database />} label="คลังข้อมูล" onClick={() => navigateTo("store")} />
          <NavButton active={view === "history"} icon={<History />} label="ประวัติ" onClick={() => navigateTo("history")} />
          <NavButton active={view === "settings"} icon={<Settings />} label="ตั้งค่า" onClick={() => navigateTo("settings")} />
        </nav>
        <UserScopePanel
          activeUser={activeUser}
          onLogout={logout}
        />
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div className="topbar-title-block">
            <div className="breadcrumb-row">
              <button type="button" className="back-button" onClick={goBack} disabled={view === "home" && viewHistory.length === 0}>
                <ArrowLeft size={15} /> กลับ
              </button>
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                {breadcrumbs.map((item, index) => (
                  <span key={`${item}-${index}`} className={index === breadcrumbs.length - 1 ? "current" : ""}>
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
              <img src={resolveAvatarUrl(activeUser.avatarUrl)} alt={activeUser.nameEn} />
              <span>
                <strong>{activeUser.nameTh}</strong>
                <small>{activeUser.role === "staff" ? "เจ้าหน้าที่" : "ผู้ป่วย"} · {activeUser.source === "trustcare_portal" ? "TrustCare Portal" : "Wallet seed"}</small>
              </span>
            </div>
            <button className="round-action" aria-label="notification"><Bell size={22} /></button>
            <button className="round-action" aria-label="logout" onClick={logout}><LogOut size={20} /></button>
          </div>
        </header>

        <div className="status-strip">
          <div><Wallet size={18} /> <strong>{allCards.length} เอกสาร</strong></div>
          <div className="interop-ok"><Network size={18} /> {activeUser.source === "trustcare_portal" ? "ผู้ใช้จาก TrustCare Portal" : "ผู้ใช้จาก Wallet นี้"}</div>
          <div><Fingerprint size={18} /> <strong>{shortDid(activeUser.holderDid)}</strong></div>
          <div className={offlineWallet.isOnline ? "online" : "offline"}>{offlineWallet.isOnline ? t("wallet.online") : t("wallet.offline")}</div>
          {developerMode && <div className="developer-chip"><KeyRound size={16} /> โหมดนักพัฒนา</div>}
          <button type="button" onClick={() => openDocumentsHub("receive")}><Camera size={18} /> {t("wallet.scanQr")}</button>
          <button type="button" onClick={() => exportResult(exportWalletObjects(storedObjects))}><Download size={18} /> ส่งออกทั้งหมด</button>
          <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />} ธีม</button>
          <button type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}><Languages size={18} /> {lang.toUpperCase()}</button>
        </div>

        {lastImportMessage && <div className="toast-line">{lastImportMessage}</div>}

        {view === "home" && (
          <HomeView
            cards={allCards}
            user={activeUser}
            readiness={readiness}
            history={history}
            offlineOnline={offlineWallet.isOnline}
            onOpenCard={card => {
              setSelectedCard(card);
              setQrDataUrl("");
              setPresentation(null);
              setDetailOpen(true);
            }}
            onView={navigateTo}
            serviceReadiness={serviceReadinessSummaries}
            activeReadinessContext={readinessContext}
            onPrepareContext={context => {
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
            developerMode={developerMode}
            objects={filteredObjects}
            allObjects={storedObjects}
            filter={storeFilter}
            scanHistory={scanHistory}
            history={history}
            onOpenCard={card => {
              setSelectedCard(card);
              setQrDataUrl("");
              setPresentation(null);
              setDetailOpen(true);
            }}
            onOpenScanner={() => setScannerOpen(true)}
            onImportPayload={value => {
              importPayload(value);
              setDocumentsTab("store");
            }}
            onCopyFixture={(label, value) => {
              void copyText(value);
              setLastImportMessage(`คัดลอก ${label} สำหรับ ${activeUser.nameTh ?? activeUser.nameEn} แล้ว`);
            }}
            onFilter={setStoreFilter}
            onExport={exportResult}
          />
        )}
        {view === "receive" && (
          <ReceiveView
            user={activeUser}
            fixtures={interopFixtures}
            developerMode={developerMode}
            onOpenScanner={() => setScannerOpen(true)}
            onImportPayload={value => {
              importPayload(value);
              navigateTo("store");
            }}
            onCopyFixture={(label, value) => {
              void copyText(value);
              setLastImportMessage(`คัดลอก ${label} สำหรับ ${activeUser.nameTh ?? activeUser.nameEn} แล้ว`);
            }}
          />
        )}
        {view === "share" && (
          <ShareView
            cards={allCards}
            user={activeUser}
            shlPackages={shlPackages}
            verifierResult={verifierResult}
            scanOutcome={scanOutcome}
            biometricEnabled={webAuthn.isRegistered}
            onConfirmBiometric={async () => webAuthn.isRegistered ? webAuthn.authenticate() : true}
            onOpenScanner={() => setScannerOpen(true)}
            onVerifyText={value => void verifyScan(value)}
            onExport={exportResult}
          />
        )}
        {view === "prepare" && (
          <PrepareView
            user={activeUser}
            context={readinessContext}
            readiness={readiness}
            contractHub={contractHub}
            workbench={prepareWorkbench}
            requests={documentRequests}
            serviceBundle={serviceBundle}
            servicePacket={servicePacket}
            checkinQr={checkinQr}
            importJob={importJob}
            bundleQrDataUrl={bundleQrDataUrl}
            servicePacketQrDataUrl={servicePacketQrDataUrl}
            checkinQrDataUrl={checkinQrDataUrl}
            onContext={changeReadinessContext}
            onPrepareAll={() => void prepareAllServiceArtifacts()}
            onBuildBundle={() => void buildBundle()}
            onBuildPacket={() => void buildPacket()}
            onCheckinQr={() => void buildCheckinQr()}
            onRequestMissing={() => void requestMissing()}
            onImportMissing={() => void importMissing()}
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
        {view === "history" && <HistoryView history={history} scanHistory={scanHistory} />}
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

      <nav className="bottom-nav">
        <NavButton active={view === "home"} icon={<Home />} label="หน้าแรก" onClick={() => navigateTo("home")} />
        <NavButton active={view === "documents" || view === "receive" || view === "store" || view === "history"} icon={<FileText />} label="เอกสาร" onClick={() => {
          openDocumentsHub("cards");
        }} />
        <NavButton active={view === "share"} icon={<Share2 />} label="แชร์" onClick={() => navigateTo("share")} />
        <NavButton active={view === "prepare"} icon={<Activity />} label="เตรียม" onClick={() => navigateTo("prepare")} />
        <NavButton active={view === "settings"} icon={<Settings />} label="ตั้งค่า" onClick={() => navigateTo("settings")} />
      </nav>

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
      <SelectiveDisclosureDialog
        card={selectedCard}
        open={selectiveOpen}
        onClose={() => setSelectiveOpen(false)}
        onConfirm={fields => void generateQr(fields)}
      />
      <QrScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={value => void verifyScan(value)} />
    </main>
  );
}

function LoginView({
  users,
  pendingScan,
  selectedUserId,
  onSelect,
  onLogin
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
          <p>ช่วงพัฒนายังไม่ต้องใส่ password แต่ Wallet จะแยก scope เอกสาร ประวัติ VP, SHL และ Store ตามผู้ใช้ที่ login จริง</p>
          {pendingScan && <Badge tone="blue"><QrCode size={14} /> มี QR รอประมวลผลหลัง login</Badge>}
        </div>
        <div className="login-user-grid">
          {users.map(user => (
            <button
              key={user.id}
              type="button"
              className={selectedUserId === user.id ? "login-user-card active" : "login-user-card"}
              onClick={() => onSelect(user.id)}
            >
              <img src={resolveAvatarUrl(user.avatarUrl)} alt={user.nameEn} />
              <span>
                <strong>{user.nameTh}</strong>
                <small>{user.role === "staff" ? "เจ้าหน้าที่" : "ผู้ป่วย"} · {user.sourceLabel}</small>
                <em>{user.id}</em>
              </span>
            </button>
          ))}
        </div>
        <Surface className="login-scope-preview">
          <UserCheck size={20} />
          <div>
            <strong>{selectedUser.nameTh}</strong>
            <p>{selectedUser.sourceLabel} · {selectedUser.hospitalNameTh}</p>
          </div>
          <Badge tone={selectedUser.source === "trustcare_portal" ? "green" : "blue"}>{selectedUser.role === "staff" ? "ขอบเขตเจ้าหน้าที่" : "ขอบเขตผู้ป่วย"}</Badge>
        </Surface>
        <Button onClick={() => onLogin(selectedUserId)}><ShieldCheck size={18} /> เข้าสู่ระบบด้วยผู้ใช้นี้</Button>
      </section>
    </main>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactElement; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function UserScopePanel({
  activeUser,
  onLogout
}: {
  activeUser: WalletDemoUser;
  onLogout: () => void;
}) {
  return (
    <section className="user-scope-panel">
      <div className="user-scope-card">
        <img src={resolveAvatarUrl(activeUser.avatarUrl)} alt={activeUser.nameEn} />
        <div>
          <strong>{activeUser.nameTh}</strong>
          <small>{activeUser.sourceLabel}</small>
        </div>
      </div>
      <div className="user-session-summary">
        <span>เข้าสู่ระบบแล้ว</span>
        <strong>{activeUser.role === "staff" ? "ขอบเขตเจ้าหน้าที่" : "ขอบเขตผู้ป่วย"}</strong>
        <small>{activeUser.id}</small>
      </div>
      <p>{activeUser.avatarSource === "trustcare_portal" ? "รูปภาพจาก TrustCare Portal เดิม" : "รูปภาพเสมือนจริงที่สร้างไว้สำหรับ seed ของ Wallet นี้"}</p>
      <Button className="secondary" onClick={onLogout}><LogOut size={16} /> ออกจากระบบ</Button>
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
  onPrepareContext
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
  onPrepareContext: (context: ReadinessContext) => void;
}) {
  const [readinessExpanded, setReadinessExpanded] = useState(false);
  const activeCards = cards.filter(card => card.credentialStatus === "active");
  const criticalCards = activeCards.filter(card => card.pinned || criticalCardTypes.has(card.cardType)).slice(0, 5);
  const recentCards = [...activeCards].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4);
  const nextAppointment = activeCards.find(card => card.cardType === "appointment");
  const readinessScore = readiness?.readiness?.score ?? 0;
  const readyForService = Boolean(readiness?.readiness?.criticalReady);
  const sortedReadiness = [...serviceReadiness].sort((a, b) => {
    if (Number(b.criticalReady) !== Number(a.criticalReady)) return Number(b.criticalReady) - Number(a.criticalReady);
    return b.score - a.score;
  });
  const visibleReadiness = readinessExpanded ? sortedReadiness : sortedReadiness.slice(0, 3);

  return (
    <div className="view-stack">
      <section className="home-hero-grid">
        <Surface className="health-passport-card">
          <span className="eyebrow">Health Passport ส่วนตัว</span>
          <h2>{user.nameEn}</h2>
          <p>{user.persona}</p>
          <div className="passport-chip-row">
            <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>{user.sourceLabel}</Badge>
            <Badge tone="neutral">{user.hospitalCode}</Badge>
            <Badge tone={offlineOnline ? "green" : "yellow"}>{offlineOnline ? "แคชพร้อมใช้งาน" : "โหมดใช้งานออฟไลน์"}</Badge>
          </div>
          <div className="home-action-row">
            <Button onClick={() => onView("documents")}><FileText size={18} /> เอกสาร</Button>
            <Button className="secondary" onClick={() => onView("receive")}><Inbox size={18} /> รับเอกสาร</Button>
            <Button className="secondary" onClick={() => onView("share")}><Share2 size={18} /> แชร์</Button>
          </div>
        </Surface>
        <Surface className="home-readiness-panel">
          <div className="readiness-ring">{readinessScore}%</div>
          <div className="home-readiness-copy">
            <h3>{readyForService ? "พร้อมเข้ารับบริการ" : "ยังขาดเอกสาร"}</h3>
            <p>{readyForService ? "เอกสารจำเป็นสำหรับบริบทบริการนี้พร้อมแล้ว" : "ตรวจเอกสารที่ขาดก่อนสร้างชุดเอกสารบริการ"}</p>
            <div className="service-readiness-list" aria-label="ความพร้อมแยกตามเรื่องบริการ">
              {visibleReadiness.map(item => (
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
                      {item.criticalReady ? "พร้อม" : `ขาด ${item.missingRequired}`}
                    </Badge>
                    <small>{item.requiredReady}/{item.requiredTotal} จำเป็น</small>
                  </span>
                  <i className="service-readiness-meter" aria-hidden="true"><b style={{ width: `${item.score}%` }} /></i>
                  {readinessExpanded && (
                    <em>
                      พร้อม: {item.readyLabels.join(", ") || "ยังไม่มี"} · ขาด: {item.missingLabels.join(", ") || "ไม่มี"}
                    </em>
                  )}
                </button>
              ))}
            </div>
            <div className="readiness-action-row">
              <button type="button" className="link-button" onClick={() => setReadinessExpanded(value => !value)}>
                {readinessExpanded ? "ย่อรายละเอียด" : `ดูรายละเอียดทั้งหมด ${serviceReadiness.length} เรื่อง`}
              </button>
              <Button className={readyForService ? "green" : "purple"} onClick={() => onView("prepare")}><ListChecks size={18} /> เตรียมบริการ</Button>
            </div>
          </div>
        </Surface>
      </section>

      <section className="critical-strip">
        <div className="section-title-row">
          <div>
            <h2>เอกสารสำคัญที่ปักหมุด</h2>
            <p>บัตรตัวตน ประวัติแพ้ยา รายการยา นัดหมาย และสิทธิ์รักษาอยู่ใกล้มือเสมอ</p>
          </div>
          <Badge tone="green">{criticalCards.length} พร้อมใช้</Badge>
        </div>
        <div className="critical-card-row">
          {criticalCards.map(card => (
            <button key={card.id} type="button" className="critical-card" onClick={() => onOpenCard(card)}>
              <Pin size={16} />
              <strong>{card.displayNameEn ?? card.displayName}</strong>
              <small>{card.expiresAt ? `หมดอายุ ${new Date(card.expiresAt).toLocaleDateString("th-TH")}` : "ไม่มีวันหมดอายุ"}</small>
              <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>{statusLabel(card.credentialStatus)}</Badge>
            </button>
          ))}
        </div>
      </section>

      <div className="home-two-column">
        <Surface>
          <div className="section-title-row">
            <h2>เอกสารล่าสุด</h2>
            <button type="button" className="link-button" onClick={() => onView("documents")}>ดูทั้งหมด</button>
          </div>
          <div className="compact-list">
            {recentCards.map(card => (
              <button key={card.id} type="button" onClick={() => onOpenCard(card)}>
                <FileText size={18} />
                <span><strong>{card.displayNameEn ?? card.displayName}</strong><small>{categoryLabel(card.documentCategory)}</small></span>
                <Badge tone="green">ตรวจสอบแล้ว</Badge>
              </button>
            ))}
          </div>
        </Surface>
        <Surface>
          <div className="section-title-row">
            <h2>สิ่งที่ควรทำต่อ</h2>
            <Badge tone={nextAppointment ? "blue" : "neutral"}>{nextAppointment ? "นัดหมาย" : "พร้อมใช้งาน"}</Badge>
          </div>
          {nextAppointment ? (
            <div className="next-action-card">
              <Clock size={20} />
              <strong>{nextAppointment.displayNameEn ?? nextAppointment.displayName}</strong>
              <span>{nextAppointment.expiresAt ? new Date(nextAppointment.expiresAt).toLocaleString("th-TH") : "Upcoming service"}</span>
              <Button className="secondary" onClick={() => onOpenCard(nextAppointment)}>เปิดเอกสาร</Button>
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
  developerMode,
  objects,
  allObjects,
  filter,
  scanHistory,
  history,
  onOpenCard,
  onOpenScanner,
  onImportPayload,
  onCopyFixture,
  onFilter,
  onExport
}: {
  tab: DocumentsTab;
  onTab: (tab: DocumentsTab) => void;
  cards: WalletCard[];
  counts: Record<string, number>;
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  developerMode: boolean;
  objects: WalletStoredObject[];
  allObjects: WalletStoredObject[];
  filter: StoreFilter;
  scanHistory: ScanOutcome[];
  history: PresentationHistoryItem[];
  onOpenCard: (card: WalletCard) => void;
  onOpenScanner: () => void;
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
          <p>รวมงานที่เกี่ยวกับเอกสารไว้ในหน้าเดียว ลดเมนูซ้ำบนมือถือ และยังแยก scope ตามผู้ใช้ที่ login อยู่</p>
        </div>
        <div className="segmented document-tabs">
          <button type="button" className={tab === "cards" ? "active" : ""} onClick={() => onTab("cards")}><FileText size={16} /> เอกสาร</button>
          <button type="button" className={tab === "receive" ? "active" : ""} onClick={() => onTab("receive")}><Inbox size={16} /> รับ</button>
          <button type="button" className={tab === "store" ? "active" : ""} onClick={() => onTab("store")}><Database size={16} /> คลัง</button>
          <button type="button" className={tab === "history" ? "active" : ""} onClick={() => onTab("history")}><History size={16} /> ประวัติ</button>
        </div>
      </Surface>
      {tab === "cards" && <DocumentsView cards={cards} counts={counts} user={user} onOpenCard={onOpenCard} />}
      {tab === "receive" && (
        <ReceiveView
          user={user}
          fixtures={fixtures}
          developerMode={developerMode}
          onOpenScanner={onOpenScanner}
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
      {tab === "history" && <HistoryView history={history} scanHistory={scanHistory} />}
    </div>
  );
}

function DocumentsView({ cards, counts, user, onOpenCard }: {
  cards: WalletCard[];
  counts: Record<string, number>;
  user: WalletDemoUser;
  onOpenCard: (card: WalletCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "expired" | "pinned">("all");
  const categories = useMemo(() => ["all", ...Object.keys(counts).filter(Boolean)], [counts]);
  const pinnedCards = cards.filter(card => card.pinned || criticalCardTypes.has(card.cardType)).slice(0, 6);
  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter(card => {
      if (category !== "all" && card.documentCategory !== category) return false;
      if (status === "active" && card.credentialStatus !== "active") return false;
      if (status === "expired" && card.credentialStatus !== "expired") return false;
      if (status === "pinned" && !(card.pinned || criticalCardTypes.has(card.cardType))) return false;
      if (!needle) return true;
      return [
        card.displayName,
        card.displayNameEn,
        card.cardType,
        card.credentialType,
        card.issuerHospitalName,
        String(card.credentialId)
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
    });
  }, [cards, category, query, status]);

  return (
    <div className="view-stack">
      <Surface className="documents-command">
        <div>
          <span className="eyebrow">กระเป๋าเอกสารสุขภาพที่ตรวจสอบได้</span>
          <h2>{user.nameEn}</h2>
          <p>ค้นหาด้วยประเภทเอกสาร โรงพยาบาล Credential ID สถานะ หรือแหล่งที่มา เอกสารสำคัญจะถูกปักหมุดไว้สำหรับการเข้ารับบริการ</p>
        </div>
        <div className="trust-chip-row">
          <Badge tone="green"><ShieldCheck size={14} /> เชื่อมกับ TrustCare Portal</Badge>
          <Badge tone="blue"><LockKeyhole size={14} /> พร้อมยืนยันตัวตน</Badge>
          <Badge tone="neutral">{cards.length} เอกสาร</Badge>
        </div>
      </Surface>

      <Surface className="document-controls">
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาเอกสาร ผู้ออกเอกสาร หรือ Credential ID..." />
        </label>
        <label className="filter-box">
          <Filter size={18} />
          <select value={status} onChange={event => setStatus(event.target.value as "all" | "active" | "expired" | "pinned")}>
            <option value="all">ทุกสถานะ</option>
            <option value="active">ใช้งานได้</option>
            <option value="expired">หมดอายุ</option>
            <option value="pinned">ปักหมุด / สำคัญ</option>
          </select>
        </label>
      </Surface>

      <section className="category-rail" aria-label="Document categories">
        {categories.map(item => (
          <button key={item} type="button" className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
            <span>{item === "all" ? "ทั้งหมด" : categoryLabel(item)}</span>
            <strong>{item === "all" ? cards.length : counts[item] ?? 0}</strong>
          </button>
        ))}
      </section>

      <section className="critical-strip compact">
        <div className="section-title-row">
          <h2>เอกสารสำคัญ</h2>
          <Badge tone="green">{pinnedCards.length}</Badge>
        </div>
        <div className="critical-card-row compact">
          {pinnedCards.map(card => (
            <button key={card.id} type="button" className="critical-card" onClick={() => onOpenCard(card)}>
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
            <p>พบ {filteredCards.length} รายการในขอบเขตของ {user.id}</p>
          </div>
          <Badge tone="blue">{filteredCards.filter(card => card.credentialStatus === "active").length} ใช้งานได้</Badge>
        </div>
        <div className="cards-grid wallet-grid">
          {filteredCards.map(card => <WalletCardView key={card.id} card={card} onClick={() => onOpenCard(card)} />)}
        </div>
      </section>
    </div>
  );
}

function ReceiveView({ user, fixtures, developerMode, onOpenScanner, onImportPayload, onCopyFixture }: {
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  developerMode: boolean;
  onOpenScanner: () => void;
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
            <p>รองรับ SHL, OID4VCI offer, OID4VP request, VP link และ QR ตรวจสอบของ TrustCare</p>
          </div>
          <Button onClick={onOpenScanner}><QrCode size={18} /> สแกน QR</Button>
        </Surface>
        <Surface className="receive-card">
          <Cloud size={26} />
          <div>
            <h2>เชื่อมกับ TrustCare Portal</h2>
            <p>{user.source === "trustcare_portal" ? "Seed จาก Portal ถูกเชื่อมไว้สำหรับทดสอบ interoperability แล้ว" : "ใช้ payload ตัวอย่างด้านล่างเพื่อทดสอบการเชื่อม Wallet นี้กลับไปที่ Portal"}</p>
          </div>
          <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>{user.sourceLabel}</Badge>
        </Surface>
      </section>

      <Surface>
        <div className="section-title-row">
          <div>
            <h2>วางหรือ import payload</h2>
            <p>วาง OID4VCI offer, OID4VP request, SHL link, VC/VP JSON, JWT หรือ TrustCare QR URL</p>
          </div>
          <Badge tone="blue">กล่องรับเอกสาร</Badge>
        </div>
        <div className="import-panel">
          <textarea value={payload} onChange={event => setPayload(event.target.value)} placeholder="openid-credential-offer://..., openid4vp://..., shlink:/..., VC/VP JSON or JWT" />
          <Button disabled={!payload.trim()} onClick={() => {
            onImportPayload(payload);
            setPayload("");
          }}><Inbox size={18} /> Import เข้าคลัง</Button>
        </div>
      </Surface>

      <Surface className={developerMode ? "fixture-panel developer-panel enabled" : "fixture-panel developer-panel"}>
        <div className="section-title-row">
          <div>
            <h2>ชุดทดสอบจาก TrustCare Portal</h2>
            <p>สร้างจาก login ที่ใช้งานอยู่เท่านั้น ใช้ทดสอบการส่งข้อมูลไปกลับระหว่าง TrustCare Portal และ Wallet</p>
          </div>
          <Badge tone={developerMode ? "green" : "neutral"}>{developerMode ? "โหมดนักพัฒนา" : "เครื่องมือรับเอกสาร"}</Badge>
        </div>
        <div className="fixture-grid">
          <button type="button" onClick={() => onImportPayload(fixtures.credentialOfferUrl)}>
            <KeyRound size={18} />
            <span><strong>Import OID4VCI</strong><small>offer {fixtures.counts.cards} เอกสาร</small></span>
          </button>
          <button type="button" onClick={() => onImportPayload(fixtures.presentationRequestUrl)}>
            <QrCode size={18} />
            <span><strong>Import OID4VP</strong><small>request ตรงกับเอกสารที่ใช้งานได้</small></span>
          </button>
          <button type="button" onClick={() => onCopyFixture("OID4VP request", fixtures.presentationRequestUrl)}>
            <Copy size={18} />
            <span><strong>คัดลอก VP Request</strong><small>วางใน Portal verifier</small></span>
          </button>
          <button type="button" disabled={!fixtures.shlQrPayload} onClick={() => fixtures.shlQrPayload && onCopyFixture("SHL payload", fixtures.shlQrPayload)}>
            <Network size={18} />
            <span><strong>คัดลอก SHL</strong><small>{fixtures.shlQrPayload ? "พร้อมใช้งาน" : "ไม่มีสำหรับ staff"}</small></span>
          </button>
        </div>
      </Surface>
    </div>
  );
}

function WalletView({ cards, counts, user, fixtures, onImportFixture, onCopyFixture, onOpenCard }: {
  cards: WalletCard[];
  counts: Record<string, number>;
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  onImportFixture: (value: string) => void;
  onCopyFixture: (label: string, value: string) => void;
  onOpenCard: (card: WalletCard) => void;
}) {
  const readyCount = cards.filter(card => card.credentialStatus === "active").length;
  const interopRows = [
    { icon: <Cloud size={18} />, label: "TrustCare Portal", value: user.source === "trustcare_portal" ? "นำเข้าแล้ว" : "ทดสอบเชื่อมโยง", detail: user.sourceLabel },
    { icon: <Layers3 size={18} />, label: "Contract Hub", value: "พร้อม", detail: "mapping สำหรับเตรียมบริการ" },
    { icon: <KeyRound size={18} />, label: "OID4VCI / OID4VP", value: "เปิดใช้งาน", detail: "รับ offer และสร้าง VP request" },
    { icon: <BadgeCheck size={18} />, label: "คลัง SHL / VC-VP", value: "พร้อมใช้", detail: "portable objects" }
  ];

  return (
    <div className="view-stack">
      <section className="partner-overview">
        <div className="partner-copy">
          <span className="eyebrow">TrustCare Wallet ส่วนตัว</span>
          <h2>{user.nameEn}</h2>
          <p>{user.sourceLabel} · {user.hospitalName}</p>
          <div className="scope-grid" aria-label="Active wallet scope">
            <span><small>ผู้ใช้</small><strong>{user.id}</strong></span>
            <span><small>Holder DID</small><strong>{shortDid(user.holderDid)}</strong></span>
            <span><small>รหัสผู้ป่วย</small><strong>{user.patientId}</strong></span>
          </div>
          <div className="chip-row">
            <span>{user.source === "trustcare_portal" ? "นำเข้าจาก Portal" : "สร้างใน Wallet"}</span>
            <span>{user.hospitalCode}</span>
            <span>Contract Hub</span>
            <span>OID4VCI</span>
            <span>OID4VP</span>
            <span>SHL</span>
          </div>
        </div>
        <div className="interop-panel">
          {interopRows.map(row => (
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
            <p>{user.id} · สร้าง OID4VCI, OID4VP และ SHL จาก scope ผู้ใช้ที่กำลังใช้งาน</p>
          </div>
          <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>{user.sourceLabel}</Badge>
        </div>
        <div className="fixture-grid">
          <button type="button" onClick={() => onImportFixture(fixtures.credentialOfferUrl)}>
            <KeyRound size={18} />
            <span><strong>Import OID4VCI</strong><small>offer {fixtures.counts.cards} เอกสาร</small></span>
          </button>
          <button type="button" onClick={() => onImportFixture(fixtures.presentationRequestUrl)}>
            <QrCode size={18} />
            <span><strong>Import OID4VP</strong><small>request ตรงกับเอกสารที่ใช้งานได้</small></span>
          </button>
          <button type="button" onClick={() => onCopyFixture("OID4VP request", fixtures.presentationRequestUrl)}>
            <Copy size={18} />
            <span><strong>คัดลอก VP Request</strong><small>วางใน scanner/import</small></span>
          </button>
          <button type="button" disabled={!fixtures.shlQrPayload} onClick={() => fixtures.shlQrPayload && onCopyFixture("SHL payload", fixtures.shlQrPayload)}>
            <Network size={18} />
            <span><strong>คัดลอก SHL</strong><small>{fixtures.shlQrPayload ? "พร้อมใช้งาน" : "ไม่มีสำหรับ staff"}</small></span>
          </button>
        </div>
      </Surface>
      <div className="metric-grid compact">
        <Surface><Wallet size={20} /><strong>{cards.length}</strong><span>เอกสารทั้งหมด</span></Surface>
        <Surface><Shield size={20} /><strong>{readyCount}</strong><span>พร้อมสร้าง VP</span></Surface>
        <Surface><CheckCircle2 size={20} /><strong>{counts.identity_and_access ?? 0}</strong><span>ตัวตนและสิทธิ์</span></Surface>
        <Surface><RefreshCw size={20} /><strong>{counts.sharing_and_sync ?? 0}</strong><span>SHL / Sync</span></Surface>
      </div>
      <section className="credential-section">
        <div className="section-title-row">
          <div>
            <h2>เอกสาร</h2>
            <p>เลือกเอกสารเพื่อสร้าง VP, QR, selective disclosure หรือ export ไปยัง partner flow</p>
          </div>
          <Badge tone="blue">{readyCount} พร้อมใช้</Badge>
        </div>
        <div className="cards-grid wallet-grid">
          {cards.map(card => <WalletCardView key={card.id} card={card} onClick={() => onOpenCard(card)} />)}
        </div>
      </section>
    </div>
  );
}

function ShareView({ cards, user, shlPackages, verifierResult, scanOutcome, biometricEnabled, onConfirmBiometric, onOpenScanner, onVerifyText, onExport }: {
  cards: WalletCard[];
  user: WalletDemoUser;
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
  const shareableCards = useMemo(() => cards.filter(card => card.credentialStatus === "active"), [cards]);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [purpose, setPurpose] = useState<ReadinessContext>("opd_visit");
  const [recipient, setRecipient] = useState(sharePurposeProfiles.opd_visit.recipient);
  const [expiryMinutes, setExpiryMinutes] = useState(sharePurposeProfiles.opd_visit.expiryMinutes);
  const [selectedFields, setSelectedFields] = useState(sharePurposeProfiles.opd_visit.fields.map(field => field.key));
  const [shareQrDataUrl, setShareQrDataUrl] = useState("");
  const [sharePayload, setSharePayload] = useState("");
  const shareProfile = sharePurposeProfiles[purpose];
  const purposeReadiness = useMemo(() => assessLocalReadiness(shareableCards, purpose), [purpose, shareableCards]);
  const purposeRequirements = useMemo(() => [...purposeReadiness.ready, ...purposeReadiness.missing], [purposeReadiness]);
  const purposeCardIds = useMemo(() => new Set(purposeReadiness.selectedCardIds), [purposeReadiness.selectedCardIds]);
  const purposeCards = useMemo(
    () => shareableCards.filter(card => purposeCardIds.has(card.id)),
    [purposeCardIds, shareableCards]
  );
  const visibleShareCards = purposeCards.length ? purposeCards : shareableCards.slice(0, 8);

  useEffect(() => {
    const recommendedIds = purposeReadiness.selectedCardIds.length
      ? purposeReadiness.selectedCardIds
      : shareableCards.filter(card => card.pinned || criticalCardTypes.has(card.cardType)).slice(0, 3).map(card => card.id);
    setSelectedCardIds(recommendedIds);
    setSelectedFields(shareProfile.fields.map(field => field.key));
    setRecipient(shareProfile.recipient);
    setExpiryMinutes(shareProfile.expiryMinutes);
    setSharePayload("");
    setShareQrDataUrl("");
  }, [purpose, purposeReadiness.selectedCardIds, shareProfile, shareableCards]);

  const selectedCards = useMemo(
    () => shareableCards.filter(card => selectedCardIds.includes(card.id)),
    [selectedCardIds, shareableCards]
  );

  const toggleSelectedCard = (cardId: number) => {
    setSelectedCardIds(previous => previous.includes(cardId) ? previous.filter(id => id !== cardId) : [...previous, cardId]);
  };

  const toggleField = (field: string) => {
    setSelectedFields(previous => previous.includes(field) ? previous.filter(item => item !== field) : [...previous, field]);
  };

  const createSharePacket = useCallback(async () => {
    if (!selectedCards.length) return;
    const ok = await onConfirmBiometric();
    if (!ok) return;
    const payload = {
      type: "TrustCarePurposeBoundPresentation",
      holder: user.holderDid,
      recipient,
      purpose,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiryMinutes * 60_000).toISOString(),
      selectedFields,
      credentials: selectedCards.map(card => ({
        id: card.credentialId,
        cardType: card.cardType,
        credentialType: card.credentialType,
        issuer: card.issuerDid,
        documentCategory: card.documentCategory
      })),
      trustcare: {
        sourceUser: user.id,
        biometricConfirmed: biometricEnabled,
        biometricRequired: shareProfile.biometricRequired,
        consent: "explicit_demo_consent",
        transport: selectedCards.length > 4 ? "shl_recommended" : shareProfile.transport,
        readiness: {
          context: purpose,
          label: purposeReadiness.label,
          score: purposeReadiness.score,
          requiredReady: purposeReadiness.requiredReady,
          requiredTotal: purposeReadiness.requiredTotal,
          recommendedReady: purposeReadiness.recommendedReady,
          recommendedTotal: purposeReadiness.recommendedTotal
        },
        purposeScope: shareProfile.help
      }
    };
    const encoded = JSON.stringify(payload);
    const scannablePayload = createScannableWebUrl(encoded);
    setSharePayload(scannablePayload);
    setShareQrDataUrl(await QRCode.toDataURL(scannablePayload, { margin: 1, width: 240 }));
  }, [biometricEnabled, expiryMinutes, onConfirmBiometric, purpose, purposeReadiness, recipient, selectedCards, selectedFields, shareProfile, user]);

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
                  filter: { const: requestType }
                }
              ]
            }
          }
        ]
      }
    });
    setRequestPayload(payload);
    setRequestQrDataUrl(await QRCode.toDataURL(createScannableWebUrl(`openid4vp://?request=${encodeURIComponent(payload)}`), { margin: 1, width: 220 }));
  }, [requestType]);

  return (
    <div className="view-stack">
      {scanOutcome && <ScanOutcomePanel outcome={scanOutcome} />}
      <Surface className="share-flow">
        <div className="section-title-row">
          <div>
            <h2>แชร์เอกสารสุขภาพที่ตรวจสอบได้</h2>
            <p>เลือกผู้รับ วัตถุประสงค์ ข้อมูลที่จะเปิดเผย อายุการใช้งาน และเอกสารก่อนสร้าง VP QR</p>
          </div>
          <Badge tone={biometricEnabled ? "green" : "yellow"}>{biometricEnabled ? "ป้องกันด้วย Biometric" : "ยังไม่บังคับ Biometric"}</Badge>
        </div>
        <div className="share-flow-grid">
          <div className="share-step">
            <span className="step-number">1</span>
            <label>ผู้รับ
              <input value={recipient} onChange={event => setRecipient(event.target.value)} />
            </label>
            <label>วัตถุประสงค์
              <select value={purpose} onChange={event => setPurpose(event.target.value as ReadinessContext)}>
                {readinessContextValues.map(context => (
                  <option key={context} value={context}>{readinessContextLabels[context].th}</option>
                ))}
              </select>
            </label>
            <label>อายุการใช้งาน
              <select value={expiryMinutes} onChange={event => setExpiryMinutes(Number(event.target.value))}>
                <option value={10}>10 นาที</option>
                <option value={60}>1 ชั่วโมง</option>
                <option value={1440}>24 ชั่วโมง</option>
              </select>
            </label>
            <div className="share-purpose-summary">
              <Badge tone={purposeReadiness.criticalReady ? "green" : "yellow"}>
                พร้อม {purposeReadiness.requiredReady}/{purposeReadiness.requiredTotal}
              </Badge>
              <span>{shareProfile.help}</span>
            </div>
          </div>

          <div className="share-step">
            <span className="step-number">2</span>
            <strong>เอกสารที่เลือกสำหรับ {readinessContextLabels[purpose].th}</strong>
            <div className="share-select-list">
              {visibleShareCards.map(card => {
                const requirement = requirementForCard(purposeRequirements, card);
                return (
                <label key={card.id}>
                  <input type="checkbox" checked={selectedCardIds.includes(card.id)} onChange={() => toggleSelectedCard(card.id)} />
                  <span>
                    <b>{card.displayNameEn ?? card.displayName}</b>
                    <small>{requirement?.label ?? categoryLabel(card.documentCategory)} · {requirement?.required ? "จำเป็น" : "แนะนำ"}</small>
                  </span>
                </label>
                );
              })}
            </div>
            {purposeReadiness.missing.length > 0 && (
              <div className="share-missing-list">
                <strong>ยังขาดตามวัตถุประสงค์นี้</strong>
                {purposeReadiness.missing.map(item => (
                  <span key={item.key}>{item.required ? "จำเป็น" : "แนะนำ"}: {item.label}</span>
                ))}
              </div>
            )}
          </div>

          <div className="share-step">
            <span className="step-number">3</span>
            <strong>ข้อมูลที่จะเปิดเผย</strong>
            <p className="share-step-hint">{shareProfile.help} รายการที่เลือกจะถูกใส่ใน VP QR เท่านั้น</p>
            <div className="field-chip-grid disclosure-field-grid" role="group" aria-label="ข้อมูลที่จะเปิดเผย">
              {shareProfile.fields.map(field => (
                <button key={field.key} type="button" className={selectedFields.includes(field.key) ? "active" : ""} onClick={() => toggleField(field.key)}>
                  {field.label}
                </button>
              ))}
            </div>
            <div className="biometric-note">
              <Fingerprint size={18} />
              {shareProfile.biometricRequired
                ? "วัตถุประสงค์นี้ต้องยืนยัน Biometric ก่อนสร้าง VP"
                : biometricEnabled ? "จะยืนยัน Biometric ก่อนแสดง QR" : "สามารถเปิด Biometric เพื่อเพิ่มความปลอดภัย"}
            </div>
            <Button onClick={() => void createSharePacket()} disabled={!selectedCards.length}><UserCheck size={18} /> ยืนยันและสร้าง VP QR</Button>
          </div>

          <div className="share-step output">
            <span className="step-number">4</span>
            <strong>ผลลัพธ์ VP</strong>
            <p className="share-step-hint">
              รูปแบบแนะนำ: {selectedCards.length > 4 ? "SHL/Bundle" : transportLabel(shareProfile.transport)}
            </p>
            {shareQrDataUrl ? <img src={shareQrDataUrl} alt="Share VP QR" /> : <div className="qr-placeholder"><QrCode size={54} /></div>}
            <div className="button-row">
              <Button className="secondary" disabled={!sharePayload} onClick={() => void copyText(sharePayload)}><Copy size={18} /> คัดลอก VP</Button>
              <Button className="secondary" disabled={!sharePayload} onClick={() => onExport({
                ok: true,
                format: "trustcare-vp-json",
                fileName: `trustcare-share-${Date.now()}.json`,
                mimeType: "application/vp+json",
                data: sharePayload,
                warnings: []
              })}><Download size={18} /> ส่งออก</Button>
            </div>
          </div>
        </div>
      </Surface>

      <Surface className="portal-section verifier-mode-section">
        <div className="portal-card-header">
          <div className="portal-card-title">
            <ShieldCheck size={22} />
            <span>เลือก Mode การตรวจสอบ</span>
          </div>
          <Badge tone="blue">Full VC / SD / ZKP</Badge>
        </div>
        <div className="mode-grid">
          <button type="button" className={mode === "full" ? "mode-card selected" : "mode-card"} aria-pressed={mode === "full"} onClick={() => setMode("full")}>
            <FileJson size={26} />
            <strong>Full VC</strong>
            <span>ตรวจสอบ VC ทั้งฉบับ เปิดเผยข้อมูลครบ</span>
          </button>
          <button type="button" className={mode === "sd" ? "mode-card selected" : "mode-card"} aria-pressed={mode === "sd"} onClick={() => setMode("sd")}>
            <Eye size={26} />
            <strong>Selective Disclosure</strong>
            <span>เลือกเปิดเผยเฉพาะฟิลด์ที่ต้องการ</span>
          </button>
          <button type="button" className={mode === "zkp" ? "mode-card selected" : "mode-card"} aria-pressed={mode === "zkp"} onClick={() => setMode("zkp")}>
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
            <input value={credentialInput} onChange={event => setCredentialInput(event.target.value)} placeholder="vc-studentid-6501001001... หรือ VP URL/JWT/JSON" />
            <div className="button-row">
              <Button disabled={!credentialInput.trim()} onClick={() => onVerifyText(credentialInput.trim())}><ShieldCheck size={18} /> ตรวจสอบ</Button>
              <Button className="secondary" onClick={onOpenScanner}><Camera size={18} /> สแกน QR</Button>
            </div>
            <p>{mode === "full" ? "ตรวจสอบเอกสารเต็มฉบับ" : mode === "sd" ? "เตรียมตรวจแบบ selective disclosure" : "เตรียมตรวจแบบ proof-only"}</p>
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
            <select value={requestType} onChange={event => setRequestType(event.target.value)}>
              <option value="PatientSummaryCredential">Patient Summary</option>
              <option value="PatientIdentityCredential">Patient Identity</option>
              <option value="PrescriptionCredential">Prescription</option>
              <option value="OpenBadgeCredential">Open Badge</option>
            </select>
            <Button className="purple" onClick={() => void createRequest()}><QrCode size={18} /> สร้าง QR Request</Button>
            {requestQrDataUrl && (
              <div className="request-preview">
                <div className="qr-inline"><img src={requestQrDataUrl} alt="OID4VP request QR" /></div>
                <button type="button" onClick={() => void copyText(requestPayload)} className="link-button">คัดลอก OID4VP request</button>
              </div>
            )}
          </div>
        </Surface>
      </div>

      <Surface className="portal-section">
        <div className="portal-card-header">
          <div className="portal-card-title">
            <Image size={22} />
            <span>ตรวจสอบจาก Baked Badge Image</span>
          </div>
          <Badge tone="neutral">Open Badge</Badge>
        </div>
        <button type="button" className="upload-zone" onClick={onOpenScanner}>
          <Upload size={34} />
          <span>อัปโหลดภาพ badge หรือสแกน QR เพื่อ import เข้า Store</span>
        </button>
      </Surface>

      {verifierResult && (
        <Surface className="verification-result">
          <div className="result-heading">
            <Badge tone={verifierResult.verified ? "green" : "red"}>{verifierResult.verified ? "Verified" : "Invalid"}</Badge>
            {verifierResult.protocol && <Badge tone="blue">{verifierResult.protocol}</Badge>}
          </div>
          <h3>{verifierResult.issuer}</h3>
          <p>{verifierResult.requestSummary ?? verifierResult.holderDid}</p>
          {!!verifierResult.matchedCredentialIds?.length && <p className="mono">Matched: {verifierResult.matchedCredentialIds.join(", ")}</p>}
          {verifierResult.warnings?.map(item => <small key={item}>{item}</small>)}
          {verifierResult.errors?.map(item => <small className="error" key={item}>{item}</small>)}
        </Surface>
      )}
      <section className="shl-grid">
        {shlPackages.map(shl => {
          const stored = walletObjectsFromShl([shl])[0];
          return (
            <Surface key={shl.id} className="shl-card">
              <Badge tone={shl.status === "active" ? "green" : "yellow"}>{statusLabel(shl.status)}</Badge>
              <h3>{shl.label}</h3>
              <p>{shl.purpose} / {shl.context}</p>
              <ul>
                {shlAccessSummary(shl).map(line => <li key={line}>{line}</li>)}
              </ul>
              <dl className="details-grid compact">
                <div><dt>Manifest VC</dt><dd className="mono">{shl.manifestCredentialId ?? "-"}</dd></div>
                <div><dt>Holder VP</dt><dd className="mono">{shl.presentationId ?? "-"}</dd></div>
              </dl>
              {stored && <Button className="secondary" onClick={() => onExport(exportWalletObject(stored))}><Download size={18} /> ส่งออก SHL</Button>}
            </Surface>
          );
        })}
      </section>
    </div>
  );
}

function PrepareView({
  user,
  context,
  readiness,
  contractHub,
  workbench,
  requests,
  serviceBundle,
  servicePacket,
  checkinQr,
  importJob,
  bundleQrDataUrl,
  servicePacketQrDataUrl,
  checkinQrDataUrl,
  onContext,
  onPrepareAll,
  onBuildBundle,
  onBuildPacket,
  onCheckinQr,
  onRequestMissing,
  onImportMissing
}: {
  user: WalletDemoUser;
  context: ReadinessContext;
  readiness: any;
  contractHub: ContractHubCatalog | null;
  workbench: any;
  requests: WalletDocumentRequest[];
  serviceBundle: ServiceBundleEnvelope | null;
  servicePacket: ServicePacketResponse | null;
  checkinQr: CheckinQrResponse | null;
  importJob: WalletImportJob | null;
  bundleQrDataUrl: string;
  servicePacketQrDataUrl: string;
  checkinQrDataUrl: string;
  onContext: (context: ReadinessContext) => void;
  onPrepareAll: () => void;
  onBuildBundle: () => void;
  onBuildPacket: () => void;
  onCheckinQr: () => void;
  onRequestMissing: () => void;
  onImportMissing: () => void;
}) {
  const activeContract = contractHub?.contracts.find(item => item.context === context);
  const readinessResult = readiness?.readiness ?? {};
  const missing = readinessResult.missing ?? [];
  const ready = readinessResult.ready ?? [];
  const missingRequired = missing.filter((item: any) => item.required);
  const canCreateFullPacket = missingRequired.length === 0;
  const packetContents = ready.flatMap((item: any) => item.matchedCards ?? []);
  const generatedCount = [serviceBundle, servicePacket, checkinQr].filter(Boolean).length;
  const isPrepared = generatedCount === 3;
  const contextRequests = requests.filter((request: any) => !request.context || request.context === context);
  const contextImportJob = importJob && ((importJob as any).context ? (importJob as any).context === context : true) ? importJob : null;
  const serviceBundleScanPayload = serviceBundle ? createScannableWebUrl(compactBundlePayload(serviceBundle)) : "";
  const servicePacketScanPayload = servicePacket?.qrData ?? "";
  const checkinScanPayload = checkinQr?.qrPayload ?? checkinQr?.shlUrl ?? "";
  const primaryActionText = !canCreateFullPacket
    ? "ขอเอกสารที่ขาด"
    : isPrepared
      ? "คัดลอก QR สำหรับเข้าโรงพยาบาล"
      : "สร้างชุดพร้อมเข้ารับบริการ";
  const primaryAction = () => {
    if (!canCreateFullPacket) {
      onRequestMissing();
      return;
    }
    if (!isPrepared) {
      onPrepareAll();
      return;
    }
    const payload = checkinQr ? getPreparedArtifactScanPayload(checkinQr) : "";
    if (payload) void copyText(payload);
  };
  const prepSteps = [
    {
      title: "เลือกประเภทบริการ",
      description: readinessContextLabels[context].th,
      status: "เสร็จแล้ว",
      complete: true
    },
    {
      title: "ตรวจเอกสารที่ต้องใช้",
      description: canCreateFullPacket
        ? `พร้อม ${readinessResult.requiredReady ?? 0}/${readinessResult.requiredTotal ?? 0} รายการจำเป็น`
        : `ยังขาด ${missingRequired.length} รายการจำเป็น`,
      status: canCreateFullPacket ? "พร้อม" : "ต้องแก้ไข",
      complete: canCreateFullPacket
    },
    {
      title: "สร้างชุดส่งให้โรงพยาบาล",
      description: isPrepared ? "สร้าง Service Bundle, VP และ SHL แล้ว" : `สร้างแล้ว ${generatedCount}/3 รายการ`,
      status: isPrepared ? "พร้อมส่ง" : "ยังไม่ครบ",
      complete: isPrepared
    },
    {
      title: "ส่งหรือสแกนที่จุดบริการ",
      description: isPrepared ? "ใช้ QR ด้านล่างเพื่อส่งให้โรงพยาบาลตรวจ" : "สร้างชุดเอกสารก่อนใช้งาน",
      status: isPrepared ? "ใช้งานได้" : "รอสร้าง",
      complete: isPrepared
    }
  ];
  return (
    <div className="view-stack">
      <Surface className="service-prep-hero">
        <div className="service-prep-copy">
          <span className="eyebrow">เตรียมบริการ</span>
          <h2>เตรียมเอกสารก่อนเข้ารับบริการ</h2>
          <p>ตรวจว่ามีเอกสารจำเป็นครบหรือไม่ แล้วสร้าง QR/VP ที่โรงพยาบาลใช้ตรวจรับบริการได้ทันที</p>
          <div className="prep-hero-actions">
            <Button className={isPrepared ? "green" : "purple"} onClick={primaryAction}>
              {isPrepared ? <QrCode size={18} /> : canCreateFullPacket ? <Layers3 size={18} /> : <FilePlus2 size={18} />}
              {primaryActionText}
            </Button>
            {!canCreateFullPacket && <Button className="secondary" onClick={onImportMissing}><Upload size={18} /> นำเข้าเอกสาร</Button>}
          </div>
        </div>
        <div className="prep-score-card">
          <div className={canCreateFullPacket ? "prep-score-ring ready" : "prep-score-ring warning"}>{readinessResult.score ?? 0}%</div>
          <div>
            <strong>{canCreateFullPacket ? "พร้อมเข้ารับบริการ" : "ยังขาดเอกสาร"}</strong>
            <span>จำเป็น {readinessResult.requiredReady ?? 0}/{readinessResult.requiredTotal ?? 0} · แนะนำ {readinessResult.recommendedReady ?? 0}/{readinessResult.recommendedTotal ?? 0}</span>
          </div>
        </div>
      </Surface>

      <Surface className="service-context-panel">
        <div className="section-title-row">
          <div>
            <h2>1. เลือกบริการที่จะไป</h2>
            <p>{activeContract?.patientLabel ?? readinessPurposeTh[context]}</p>
          </div>
          <Badge tone="blue">Contract Hub {contractHub?.version ?? "demo"}</Badge>
        </div>
        <div className="service-context-grid">
          {(Object.keys(readinessContextLabels) as ReadinessContext[]).map(key => (
            <button key={key} className={context === key ? "service-context-card active" : "service-context-card"} onClick={() => onContext(key)}>
              <span>{readinessContextLabels[key].th}</span>
              <small>{readinessPurposeTh[key]}</small>
            </button>
          ))}
        </div>
      </Surface>

      <section className="prep-main-grid">
        <Surface className="prep-checklist">
          <div className="section-title-row">
            <div>
              <h2>2. ตรวจความพร้อม</h2>
              <p>ขั้นตอนทั้งหมดที่ผู้ป่วยต้องทำก่อนส่งข้อมูลให้โรงพยาบาล</p>
            </div>
            <Badge tone={isPrepared ? "green" : canCreateFullPacket ? "blue" : "yellow"}>{isPrepared ? "พร้อมใช้" : canCreateFullPacket ? "พร้อมสร้าง" : "ต้องแก้ไข"}</Badge>
          </div>
          <div className="prep-task-list">
            {prepSteps.map((step, index) => <PrepTaskRow key={step.title} index={index + 1} {...step} />)}
          </div>
        </Surface>

        <Surface className="prep-documents-panel">
          <div className="section-title-row">
            <div>
              <h2>เอกสารที่ใช้ในบริการนี้</h2>
              <p>{activeContract?.patientDirection ?? "patient_outbound"}</p>
            </div>
            <Badge tone={canCreateFullPacket ? "green" : "yellow"}>{packetContents.length} รายการตรงเงื่อนไข</Badge>
          </div>
          {!canCreateFullPacket && (
            <div className="prep-warning-inline">
              <AlertTriangle size={18} />
              <span>ยังขาดเอกสารจำเป็น {missingRequired.length} รายการ ควรขอจากโรงพยาบาลหรือนำเข้าเอกสารก่อนสร้างชุดพร้อมรับบริการ</span>
            </div>
          )}
          <div className="readiness-doc-list">
            {ready.map((item: any) => (
              <div key={item.key} className="readiness-doc-row ready">
                <CheckCircle2 size={18} />
                <span><strong>{item.label}</strong><small>{item.required ? "จำเป็น" : "แนะนำ"}</small></span>
                <Badge tone="green">พร้อม</Badge>
              </div>
            ))}
            {missing.map((item: any) => (
              <div key={item.key} className="readiness-doc-row missing">
                <AlertTriangle size={18} />
                <span><strong>{item.label}</strong><small>{item.required ? "จำเป็น" : "แนะนำ"}</small></span>
                <Badge tone={item.required ? "red" : "yellow"}>ยังขาด</Badge>
              </div>
            ))}
          </div>
          <div className="prep-doc-actions">
            <Button onClick={onRequestMissing} disabled={!missing.length}><FilePlus2 size={18} /> ขอเอกสารที่ขาด</Button>
            <Button className="secondary" onClick={onImportMissing} disabled={!missing.length}><Upload size={18} /> นำเข้าเอกสาร</Button>
          </div>
        </Surface>
      </section>

      <Surface className="bundle-dashboard service-output-panel">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">ชุดเอกสารบริการ</span>
            <h2>3. สร้างชุดส่งให้โรงพยาบาล</h2>
            <p>ระบบจะสร้างซองข้อมูล, VP และ Check-in QR ให้ครบในครั้งเดียว ผู้ใช้ยังสร้างแยกรายการได้ในกรณีทดสอบ integration</p>
          </div>
          <Badge tone={isPrepared ? "green" : generatedCount ? "blue" : "yellow"}>
            {isPrepared ? "สร้างครบแล้ว" : generatedCount ? `สร้างแล้ว ${generatedCount}/3` : "ยังไม่ได้สร้าง"}
          </Badge>
        </div>
        <div className="prep-primary-row">
          <Button className={canCreateFullPacket ? "purple" : "secondary"} onClick={onPrepareAll} disabled={!canCreateFullPacket}>
            <Layers3 size={18} /> สร้างชุดพร้อมเข้ารับบริการ
          </Button>
          {!canCreateFullPacket && <span>สร้างชุดสมบูรณ์ได้หลังเอกสารจำเป็นครบ</span>}
        </div>
        <div className="bundle-card-grid">
          <BundleCard
            user={user}
            passType="bundle"
            title="Service Bundle"
            subtitle="ซองข้อมูลสำหรับ Contract Hub และระบบหลังบ้าน"
            status={serviceBundle ? "สร้างแล้ว" : "ยังไม่ได้สร้าง"}
            qrDataUrl={bundleQrDataUrl}
            onCreate={onBuildBundle}
            data={serviceBundle}
            copyPayload={serviceBundleScanPayload}
            detailsTargetId="service-bundle-details"
          />
          <BundleCard
            user={user}
            passType="vp"
            title="Service VP Packet"
            subtitle="เอกสารแสดงสิทธิ์ที่ส่งให้หน่วยบริการตรวจ"
            status={servicePacket ? "สร้างแล้ว" : "ยังไม่ได้สร้าง"}
            qrDataUrl={servicePacketQrDataUrl}
            onCreate={onBuildPacket}
            data={servicePacket}
            copyPayload={servicePacketScanPayload}
            detailsTargetId="service-vp-details"
          />
          <BundleCard
            user={user}
            passType="shl"
            title="Check-in SHL"
            subtitle="QR สำหรับเช็กอินหรือส่งต่อที่จุดบริการ"
            status={checkinQr ? "สร้างแล้ว" : "ยังไม่ได้สร้าง"}
            qrDataUrl={checkinQrDataUrl}
            onCreate={onCheckinQr}
            data={checkinQr}
            copyPayload={checkinScanPayload}
            detailsTargetId="checkin-shl-details"
          />
        </div>
      </Surface>

      <Surface className="packet-content-preview">
        <div className="section-title-row">
          <div>
            <h3>4. ตรวจรายการก่อนส่ง</h3>
            <p>รายการด้านล่างคือเอกสารที่จะถูกใช้ในชุด VP/SHL ของบริการนี้</p>
          </div>
          <Badge tone={canCreateFullPacket ? "green" : "yellow"}>{canCreateFullPacket ? "ครบถ้วน" : "ยังไม่ครบ"}</Badge>
        </div>
        <div className="compact-list">
          {packetContents.map((card: WalletCard) => (
            <div key={card.id} className="packet-content-row">
              <ShieldCheck size={18} />
              <span><strong>{card.displayNameEn ?? card.displayName}</strong><small>{categoryLabel(card.documentCategory)}</small></span>
              <Badge tone="green">{statusLabel(card.credentialStatus)}</Badge>
            </div>
          ))}
          {!packetContents.length && <p className="muted">ยังไม่มีเอกสารที่ตรงเงื่อนไข</p>}
        </div>
      </Surface>

      {(serviceBundle || servicePacket || checkinQr) && (
        <div className="prepare-grid wide">
          {serviceBundle && <PacketPreview id="service-bundle-details" title="รายละเอียด Service Bundle" data={serviceBundle} qrDataUrl={bundleQrDataUrl} />}
          {servicePacket && <PacketPreview id="service-vp-details" title="รายละเอียด Service VP Packet" data={servicePacket} qrDataUrl={servicePacketQrDataUrl} />}
          {checkinQr && <PacketPreview id="checkin-shl-details" title="รายละเอียด Check-in SHL" data={checkinQr} qrDataUrl={checkinQrDataUrl} />}
        </div>
      )}

      <div className="prepare-support-grid">
        <Surface>
          <h3>คำขอเอกสาร</h3>
          {contextRequests.length ? (
            <div className="request-list">
              {contextRequests.map((request: any) => (
                <div key={request.requestId ?? request.id} className="request-row">
                  <FilePlus2 size={18} />
                  <span>
                    <strong>{request.documentType ?? "เอกสารที่ขาด"}</strong>
                    <small>{statusLabel(request.status)} · {request.sourceType ?? "hospital"}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : <p>ยังไม่มีคำขอค้างอยู่สำหรับ {readinessContextLabels[context].th}</p>}
        </Surface>
        <Surface>
          <h3>งานนำเข้าเอกสาร</h3>
          {contextImportJob ? (
            <div className="request-row">
              <Upload size={18} />
              <span>
                <strong>{contextImportJob.documentType ?? contextImportJob.sourceType}</strong>
                <small>{contextImportJob.importId} · {statusLabel(contextImportJob.status)}</small>
              </span>
            </div>
          ) : <p>ยังไม่มีงานนำเข้าสำหรับบริการนี้</p>}
        </Surface>
        <Surface>
          <h3>สถานะ Contract Hub</h3>
          <p>{workbench?.tasks?.length ?? workbench?.actions?.length ?? 0} งานจาก Contract Hub พร้อมตรวจสอบ</p>
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
  complete
}: {
  index: number;
  title: string;
  description: string;
  status: string;
  complete: boolean;
}) {
  return (
    <div className={complete ? "prep-task-row complete" : "prep-task-row"}>
      <div className="prep-task-index">{complete ? <CheckCircle2 size={18} /> : index}</div>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Badge tone={complete ? "green" : "yellow"}>{status}</Badge>
    </div>
  );
}

function StoreView({ user, objects, allObjects, filter, onFilter, onImport, onExport }: {
  user: WalletDemoUser;
  objects: WalletStoredObject[];
  allObjects: WalletStoredObject[];
  filter: StoreFilter;
  onFilter: (filter: StoreFilter) => void;
  onImport: (value: string) => unknown;
  onExport: (result: WalletExportResult) => void;
}) {
  const [payload, setPayload] = useState("");
  const [selectedObject, setSelectedObject] = useState<WalletStoredObject | null>(null);
  return (
    <div className="view-stack">
      <Surface className="share-command">
        <div>
          <h2>คลัง VC/VP/SHL</h2>
          <p>เก็บ VC, VP, SHL, service packets, OID4VCI offers และ OID4VP requests ใน wallet เดียว</p>
        </div>
        <Button onClick={() => onExport(exportWalletObjects(allObjects))}><Download size={18} /> ส่งออก Wallet</Button>
      </Surface>

      <Surface>
        <h3>นำเข้า SHL / VC / VP / OID4VC</h3>
        <div className="import-panel">
          <textarea value={payload} onChange={event => setPayload(event.target.value)} placeholder="วาง shlink:/..., OID4VCI offer, OID4VP request, VC/VP JSON, JWT หรือ verifier URL" />
          <Button onClick={() => {
            onImport(payload);
            setPayload("");
          }} disabled={!payload.trim()}><FileJson size={18} /> นำเข้า</Button>
        </div>
      </Surface>

      <Surface>
        <div className="segmented">
          {(["all", "vc", "vp", "shl", "oid", "service"] as StoreFilter[]).map(item => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => onFilter(item)}>{item.toUpperCase()}</button>
          ))}
        </div>
      </Surface>

      <div className="store-grid">
        {objects.map(object => (
          <Surface key={object.id} className="store-object">
            <div className="store-object-header">
              <Badge tone={toneForObject(object)}>{object.type}</Badge>
              {object.protocol && <Badge tone="blue">{object.protocol}</Badge>}
              {object.type === "shl" && <Badge tone={getShlTrustProfile(object.payload as ShlPackageDetail).tone}>{getShlTrustProfile(object.payload as ShlPackageDetail).label}</Badge>}
            </div>
            <h3>{object.title}</h3>
            <p>{object.subtitle ?? object.source ?? object.id}</p>
            <small>{new Date(object.createdAt).toLocaleString("th-TH")}</small>
            <div className="object-actions">
              <Button className="secondary" onClick={() => setSelectedObject(object)}><Eye size={18} /> รายละเอียด</Button>
              <Button className="secondary" onClick={() => void copyText(JSON.stringify(object.payload, null, 2))}><Copy size={18} /> คัดลอก</Button>
              <Button onClick={() => onExport(exportWalletObject(object))}><Download size={18} /> ส่งออก</Button>
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
  onExport
}: {
  user: WalletDemoUser;
  object: WalletStoredObject | null;
  onClose: () => void;
  onExport: (result: WalletExportResult) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manifestQrDataUrl, setManifestQrDataUrl] = useState("");
  const [selectedManifestDocId, setSelectedManifestDocId] = useState("");
  const payloadText = useMemo(() => JSON.stringify(object?.payload ?? {}, null, 2), [object]);
  const scanPayload = useMemo(() => object ? getObjectScanPayload(object) : "", [object]);
  const shlDetail = object?.type === "shl" ? object.payload as ShlPackageDetail : null;
  const manifestDocuments = shlDetail?.documentBundle?.documents ?? [];
  const selectedManifestDoc = manifestDocuments.find(document => document.id === selectedManifestDocId) ?? manifestDocuments[0] ?? null;
  const hasManifestExtension = Boolean(shlDetail && hasTrustCareShlManifestExtension(shlDetail));
  const manifestScanPayload = shlDetail && hasManifestExtension
    ? createScannableWebUrl(buildShlManifestVerificationPayload(shlDetail))
    : "";
  const rawShlPayload = shlDetail?.qrPayload ?? shlDetail?.shlUrl ?? "";
  const storedPass = useMemo(
    () => object ? describeStoredObjectPass(object, user) : null,
    [object, user]
  );

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    if (!object || !scanPayload) return;
    void QRCode.toDataURL(scanPayload, { margin: 1, width: 220 }).then(value => {
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
    void QRCode.toDataURL(manifestScanPayload, { margin: 1, width: 220 }).then(value => {
      if (!cancelled) setManifestQrDataUrl(value);
    });
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
              <button type="button" className="dialog-back-button" onClick={onClose}>
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">คลังข้อมูล / {object.type}</span>
            </div>
            <div className="dialog-heading-row">
              <p className="eyebrow">{object.protocol ?? "trustcare"} / {object.type}</p>
              <h2>{object.title}</h2>
              <Badge tone={toneForObject(object)}>{statusLabel(object.status)}</Badge>
              {shlDetail && <Badge tone={getShlTrustProfile(shlDetail).tone}>{getShlTrustProfile(shlDetail).label}</Badge>}
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="ปิดรายละเอียด" onClick={onClose}>×</button>
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
              <div><dt>ประเภท</dt><dd>{object.type}</dd></div>
              <div><dt>Protocol</dt><dd>{object.protocol ?? "-"}</dd></div>
              <div><dt>แหล่งที่มา</dt><dd>{object.source ?? object.subtitle ?? "-"}</dd></div>
              <div><dt>วันที่บันทึก</dt><dd>{new Date(object.createdAt).toLocaleString("th-TH")}</dd></div>
              <div><dt>หมดอายุ</dt><dd>{object.expiresAt ? new Date(object.expiresAt).toLocaleString("th-TH") : "-"}</dd></div>
              <div><dt>ID</dt><dd className="mono">{object.id}</dd></div>
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
            <Button className="secondary" onClick={() => void copyText(scanPayload)}><QrCode size={18} /> {shlDetail ? "คัดลอก Web Scan URL" : "คัดลอก QR URL"}</Button>
            {shlDetail && rawShlPayload && <Button className="secondary" onClick={() => void copyText(rawShlPayload)}><Link2 size={18} /> คัดลอก SHL ดิบ</Button>}
            {hasManifestExtension && <Button className="secondary" onClick={() => void copyText(manifestScanPayload)}><ShieldCheck size={18} /> คัดลอก Manifest VP QR</Button>}
            <Button className="secondary" onClick={() => void copyText(payloadText)}><Copy size={18} /> คัดลอก Payload</Button>
            <Button onClick={() => onExport(exportWalletObject(object))}><Download size={18} /> ส่งออก</Button>
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
  manifestQrDataUrl
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
            <h3>{trustProfile.kind === "trustcare-pending" ? "รอการยืนยัน Maker/Checker" : "SHL มาตรฐานที่ไม่มี Manifest VP/VC"}</h3>
            <p>{trustProfile.description}</p>
          </div>
          <Badge tone={trustProfile.tone}>{trustProfile.label}</Badge>
        </div>
        <div className="manifest-trust-grid">
          <div><span>SHL URL</span><strong className="mono">{shl.shlUrl ?? shl.qrPayload ?? "-"}</strong></div>
          <div><span>Viewer URL</span><strong className="mono">{shl.viewerUrl ?? "-"}</strong></div>
          <div><span>Access policy</span><strong>{shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode"} · {shl.currentAccessCount ?? 0}/{shl.maxAccessCount ?? "-"}</strong></div>
          <div><span>Maker/Checker</span><strong>{shl.trustcareCertification?.status ?? "ไม่เกี่ยวข้องกับ TrustCare"}</strong></div>
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
          <p>SHL เป็น transport ส่วนความน่าเชื่อถือมาจาก Manifest VC, Holder VP และ FHIR DocumentReference ของแต่ละเอกสาร</p>
        </div>
        <Badge tone="green">TrustCare Verified SHL</Badge>
      </div>
      <div className="manifest-trust-grid">
        <div><span>Manifest VC</span><strong className="mono">{shl.manifestCredentialId ?? "-"}</strong></div>
        <div><span>Holder VP</span><strong className="mono">{shl.presentationId ?? "-"}</strong></div>
        <div><span>Maker/Checker</span><strong>{shl.trustcareCertification?.makerName ?? "-"} → {shl.trustcareCertification?.checkerName ?? "-"}</strong></div>
        <div><span>Access policy</span><strong>{shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode"} · {shl.currentAccessCount ?? 0}/{shl.maxAccessCount ?? "-"}</strong></div>
        <div><span>มาตรฐาน</span><strong>{shl.documentBundle?.standards?.join(" · ") ?? "SHL · VC/VP · FHIR"}</strong></div>
      </div>
      {manifestQrDataUrl && (
        <div className="manifest-vp-qr-panel">
          <div className="qr-inline large"><img src={manifestQrDataUrl} alt="Manifest VP verification QR" /></div>
          <div>
            <span className="eyebrow">Manifest VP Verification QR</span>
            <h4>สแกนเพื่อตรวจ TrustCare Manifest VP/VC</h4>
            <p>ใช้กับ TrustCare verifier เพื่อตรวจ Manifest VC, Holder VP, Maker/Checker approval และ DocumentReference evidence ของเอกสารใน SHL นี้</p>
          </div>
        </div>
      )}
      <div className="manifest-layout">
        <div className="manifest-doc-list" aria-label="Manifest documents">
          {documents.map(document => (
            <button
              key={document.id}
              type="button"
              className={selectedDocument?.id === document.id ? "active" : ""}
              onClick={() => onSelectDocument(document.id)}
            >
              <span className="manifest-sequence">{document.sequence}</span>
              <span>
                <strong>{document.title}</strong>
                <small>{document.fhirResource} · {document.contentType}</small>
              </span>
              <Badge tone={document.status === "available_in_manifest" ? "green" : "yellow"}>{document.status === "available_in_manifest" ? "พร้อมใน Manifest" : document.status}</Badge>
            </button>
          ))}
          {!documents.length && <p className="muted">Manifest นี้ยังไม่มีรายการเอกสารที่อ่านได้ใน seed</p>}
        </div>
        {selectedDocument && (
          <div className="manifest-doc-detail">
            <span className="eyebrow">DocumentReference</span>
            <h4>{selectedDocument.title}</h4>
            <dl className="details-grid compact">
              <div><dt>ประเภท</dt><dd>{selectedDocument.documentType}</dd></div>
              <div><dt>หมวดหมู่</dt><dd>{categoryLabel(selectedDocument.category)}</dd></div>
              <div><dt>FHIR resource</dt><dd>{selectedDocument.fhirResource}</dd></div>
              <div><dt>Manifest file</dt><dd className="mono">{selectedDocument.manifestFileId ?? "-"}</dd></div>
              <div><dt>Content hash</dt><dd className="mono">{selectedDocument.hash?.contentHash ?? "-"}</dd></div>
              <div><dt>Source bundle</dt><dd className="mono">{selectedDocument.hash?.sourceBundleHash ?? "-"}</dd></div>
            </dl>
            <div className="manifest-link-list">
              {Object.entries(selectedDocument.objectLinks ?? {}).map(([key, value]) => (
                <button key={key} type="button" onClick={() => void copyText(String(value))}>
                  <Link2 size={15} />
                  <span><strong>{key}</strong><small>{String(value)}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PacketPreview({ id, title, data, qrDataUrl }: { id?: string; title: string; data: unknown; qrDataUrl?: string }) {
  return (
    <Surface id={id} className="packet-preview">
      <h3>{title}</h3>
      {qrDataUrl && <div className="qr-inline"><img src={qrDataUrl} alt={`${title} QR`} /></div>}
      <details>
        <summary>ดู Payload สำหรับนักพัฒนา</summary>
        <pre className="payload">{data ? JSON.stringify(data, null, 2) : "ยังไม่ได้สร้าง"}</pre>
      </details>
    </Surface>
  );
}

type BrandedPassKind = "bundle" | "vp" | "shl" | "store";

function BundleCard({
  user,
  passType,
  title,
  subtitle,
  status,
  qrDataUrl,
  data,
  copyPayload,
  detailsTargetId,
  onCreate
}: {
  user: WalletDemoUser;
  passType: BrandedPassKind;
  title: string;
  subtitle: string;
  status: string;
  qrDataUrl: string;
  data: unknown;
  copyPayload?: string;
  detailsTargetId?: string;
  onCreate: () => void;
}) {
  const scanPayload = copyPayload ?? (data ? getPreparedArtifactScanPayload(data) : "");
  const pass = describePreparedPass(data, passType, user, title, subtitle);
  const viewDetails = () => {
    if (!detailsTargetId) return;
    document.getElementById(detailsTargetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className={data ? "bundle-card generated" : "bundle-card"}>
      <div className="bundle-card-copy">
        <Badge tone={data ? "green" : "yellow"}>{status}</Badge>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <BrandedSharePass
        kind={passType}
        title={title}
        subtitle={pass.subtitle}
        ownerLabel={pass.ownerLabel}
        sourceLabel={pass.sourceLabel}
        issuerLabel={pass.issuerLabel}
        protocolLabel={pass.protocolLabel}
        accessLabel={pass.accessLabel}
        status={data ? status : "ยังไม่ได้สร้าง"}
        qrDataUrl={qrDataUrl}
        isReady={Boolean(data)}
        items={pass.items}
      />
      <div className="bundle-actions">
        <Button className={data ? "secondary" : ""} onClick={onCreate}><Layers3 size={16} /> {data ? "สร้างใหม่" : "สร้างเฉพาะรายการ"}</Button>
        <Button className="secondary" disabled={!data || !detailsTargetId} onClick={viewDetails}>
          <Eye size={16} /> ดูรายละเอียด
        </Button>
        <Button
          className="secondary"
          disabled={!data}
          onClick={() => scanPayload && void copyText(scanPayload)}
        >
          <Copy size={16} /> คัดลอก QR URL
        </Button>
      </div>
    </div>
  );
}

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
  items
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
    <section className={`branded-share-pass ${kind} ${isReady ? "ready" : "empty"}`} aria-label={`${title} branded QR pass`}>
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
            <div><dt>เจ้าของข้อมูล</dt><dd>{ownerLabel}</dd></div>
            <div><dt>แหล่งที่มา</dt><dd>{sourceLabel}</dd></div>
            <div><dt>ผู้ออก/โฮสต์</dt><dd>{issuerLabel}</dd></div>
            <div><dt>การเข้าถึง</dt><dd>{accessLabel}</dd></div>
          </dl>
        </div>
      </div>
      <div className="branded-pass-qr">
        {qrDataUrl ? <img src={qrDataUrl} alt={`${title} QR`} /> : <QrCode size={46} />}
        <small>{isReady ? "สแกนเพื่อเปิด Web view หรือส่งต่อให้ระบบที่รองรับ" : "สร้างก่อนจึงจะแสดง QR จริง"}</small>
      </div>
      <div className="branded-pass-items">
        <strong>{title}</strong>
        <ul>
          {items.slice(0, 5).map(item => <li key={item}>{item}</li>)}
          {items.length > 5 && <li>+{items.length - 5} รายการเพิ่มเติม</li>}
          {!items.length && <li>รอสร้าง payload</li>}
        </ul>
        <Badge tone={isReady ? "green" : "yellow"}>{status}</Badge>
      </div>
    </section>
  );
}

function ScanOutcomePanel({ outcome }: { outcome: ScanOutcome }) {
  const matched = outcome.verifier.matchedCredentialIds ?? outcome.importResult.matchedCredentialIds ?? [];
  const checklist = Array.isArray(outcome.verifier.verificationChecklist)
    ? outcome.verifier.verificationChecklist
        .filter((item): item is { key?: string; label?: string; ok?: boolean; detail?: string } => Boolean(item) && typeof item === "object")
    : [];
  return (
    <Surface className="scan-result-card">
      <div className="scan-result-main">
        <div className={outcome.verifier.verified ? "scan-result-icon ok" : "scan-result-icon warn"}>
          {outcome.verifier.verified ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
        </div>
        <div>
          <span className="eyebrow">ผลการสแกนล่าสุด</span>
          <h2>{outcome.verifier.verified ? "ตรวจสอบผ่าน" : "ต้องตรวจสอบเพิ่มเติม"}</h2>
          <p>{outcome.verifier.requestSummary ?? outcome.importResult.format} · {new Date(outcome.scannedAt).toLocaleString("th-TH")}</p>
        </div>
      </div>
      <div className="scan-result-grid">
        <div><small>บริบท</small><strong>{contextLabel(outcome.context)}</strong></div>
        <div><small>Protocol</small><strong>{outcome.verifier.protocol ?? outcome.importResult.protocol ?? "-"}</strong></div>
        <div><small>Issuer / Verifier</small><strong>{outcome.verifier.issuer ?? "-"}</strong></div>
        <div><small>ตรงกับเอกสาร</small><strong>{matched.length ? `${matched.length} รายการ` : "-"}</strong></div>
      </div>
      {!!checklist.length && (
        <div className="scan-checklist" aria-label="หลักฐานที่ตรวจสอบจากการสแกน">
          <div className="scan-checklist-heading">
            <ListChecks size={18} />
            <span>หลักฐานที่ตรวจสอบ</span>
          </div>
          <div className="scan-checklist-grid">
            {checklist.map((item, index) => (
              <div className={item.ok ? "scan-check-item ok" : "scan-check-item warn"} key={item.key ?? `${item.label}-${index}`}>
                {item.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                <span>
                  <strong>{item.label ?? "หลักฐาน"}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!matched.length && <p className="mono scan-matched">{matched.join(", ")}</p>}
      {!!outcome.verifier.errors?.length && <p className="error-text">{outcome.verifier.errors.join(", ")}</p>}
      {!!outcome.verifier.warnings?.length && <p className="warning-text">{outcome.verifier.warnings.join(", ")}</p>}
    </Surface>
  );
}

function HistoryView({ history, scanHistory }: { history: PresentationHistoryItem[]; scanHistory: ScanOutcome[] }) {
  return (
    <div className="history-list large">
      {scanHistory.map(item => (
        <Surface className="history-row scan-history-row" key={item.id}>
          <QrCode size={22} />
          <span>
            <strong>{item.verifier.protocol ?? item.importResult.format}</strong>
            <small>{new Date(item.scannedAt).toLocaleString("th-TH")} · บริบท: {contextLabel(item.context)}</small>
          </span>
          <Badge tone={item.verifier.verified ? "green" : "yellow"}>{item.verifier.verified ? "สแกนผ่าน" : "ตรวจเพิ่ม"}</Badge>
        </Surface>
      ))}
      {history.map(item => (
        <Surface className="history-row" key={item.id}>
          <History size={22} />
          <span><strong>{item.verifierName}</strong><small>{item.presentedAt ? new Date(item.presentedAt).toLocaleString("th-TH") : item.purpose}</small></span>
          <Badge tone={item.verificationResult === "valid" ? "green" : "neutral"}>{statusLabel(item.verificationResult ?? "recorded")}</Badge>
        </Surface>
      ))}
    </div>
  );
}

function SettingsView({ webAuthn, theme, setTheme, developerMode, setDeveloperMode, user }: {
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
        <p>รองรับ SecureStore, SQLite, LocalAuthentication, Camera QR, SHL และการนำเข้า-ส่งออก VC/VP ใน Expo app</p>
      </Surface>
      <Surface>
        <Shield size={28} />
        <h3>ยืนยันตัวตนด้วย Biometric</h3>
        <p>{webAuthn.isRegistered ? "เปิดการยืนยันก่อนแสดง QR แล้ว" : "ยังไม่ได้ตั้งค่า biometric gate"}</p>
        <Button onClick={() => webAuthn.isRegistered ? webAuthn.unregister() : void webAuthn.register(String(user.patientId), user.nameTh)}>
          {webAuthn.isRegistered ? "ปิด Biometric" : "ตั้งค่า Biometric"}
        </Button>
      </Surface>
      <Surface>
        <Globe2 size={28} />
        <h3>ธีม</h3>
        <Button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "โหมดมืด" : "โหมดสว่าง"}</Button>
      </Surface>
      <Surface>
        <KeyRound size={28} />
        <h3>โหมดนักพัฒนา</h3>
        <p>แสดง payload และเครื่องมือทดสอบ protocol ในหน้ารับเอกสาร โดยไม่ปนกับประสบการณ์ใช้งานปกติของ Wallet</p>
        <Button className={developerMode ? "green" : "secondary"} onClick={() => setDeveloperMode(!developerMode)}>
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

function requirementForCard(
  requirements: Array<{ cardTypes: string[]; label: string; required: boolean }>,
  card: WalletCard
) {
  return requirements.find(requirement => requirement.cardTypes.includes(String(card.cardType)));
}

function transportLabel(transport: "vp_qr" | "shl_recommended" | "shl_manifest"): string {
  const labels = {
    vp_qr: "VP QR",
    shl_recommended: "SHL/VP Bundle",
    shl_manifest: "SHL พร้อม TrustCare Manifest"
  };
  return labels[transport];
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
    qr_scan: "สแกน QR"
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
    recorded: "บันทึกแล้ว"
  };
  return labels[String(status ?? "")] ?? String(status ?? "-");
}

function createScannableWebUrl(payload: string): string {
  const raw = payload.trim();
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (url.searchParams.has("scan")) return raw;
  } catch {
    // Raw VC/VP/SHL payloads are wrapped below so another device can open this web app.
  }
  const encoded = encodeURIComponent(payload);
  const base = typeof window === "undefined" ? baseApiOptions.demoOrigin : `${window.location.origin}${window.location.pathname}`;
  return `${base.replace(/\/$/, "")}?scan=${encoded}`;
}

function getObjectScanPayload(object: WalletStoredObject): string {
  const payload = object.payload as any;
  if (object.type === "shl" && payload) {
    const directShlPayload =
      typeof payload?.qrPayload === "string" ? payload.qrPayload :
      typeof payload?.shlUrl === "string" ? payload.shlUrl :
      typeof payload?.viewerUrl === "string" ? payload.viewerUrl :
      "";
    if (directShlPayload) return createScannableWebUrl(directShlPayload);
  }
  if (payload?.bundleId && payload?.contractId) {
    return createScannableWebUrl(compactBundlePayload(payload as ServiceBundleEnvelope));
  }
  const directPayload =
    typeof payload?.qrPayload === "string" ? payload.qrPayload :
    typeof payload?.qrData === "string" ? payload.qrData :
    typeof payload?.shlUrl === "string" ? payload.shlUrl :
    typeof payload?.url === "string" ? payload.url :
    "";
  if (directPayload) return createScannableWebUrl(directPayload);
  return createScannableWebUrl(JSON.stringify({
    type: object.type,
    protocol: object.protocol,
    id: object.id,
    payload: object.payload
  }));
}

function getPreparedArtifactScanPayload(data: unknown): string {
  const payload = data as any;
  if (!payload) return "";
  if (payload?.bundleId && payload?.contractId) {
    return createScannableWebUrl(compactBundlePayload(payload as ServiceBundleEnvelope));
  }
  const directPayload =
    typeof payload?.qrPayload === "string" ? payload.qrPayload :
    typeof payload?.qrData === "string" ? payload.qrData :
    typeof payload?.shlUrl === "string" ? payload.shlUrl :
    typeof payload?.url === "string" ? payload.url :
    "";
  if (directPayload) return createScannableWebUrl(directPayload);
  return createScannableWebUrl(JSON.stringify(payload));
}

function describePreparedPass(
  data: unknown,
  kind: BrandedPassKind,
  user: WalletDemoUser,
  title: string,
  fallbackSubtitle: string
): {
  ownerLabel: string;
  sourceLabel: string;
  issuerLabel: string;
  protocolLabel: string;
  accessLabel: string;
  subtitle: string;
  items: string[];
} {
  const payload = (data ?? {}) as any;
  const ownerLabel = user.nameEn || user.nameTh || "Wallet owner";
  const sourceLabel = user.hospitalName || user.sourceLabel || "TrustCare Wallet";
  const issuerLabel =
    payload.receiver ||
    payload.verifier ||
    payload.viewerUrl ||
    payload.source ||
    user.hospitalName ||
    "TrustCare Network";
  const items = extractPassItems(payload, kind);
  const expiresAt = typeof payload.expiresAt === "string" ? new Date(payload.expiresAt).toLocaleString("th-TH") : "";
  const credentialCount =
    typeof payload.credentialCount === "number" ? payload.credentialCount :
    Array.isArray(payload.items) ? payload.items.length :
    items.length;
  const kindLabels: Record<BrandedPassKind, string> = {
    bundle: "Service Bundle",
    vp: "Verifiable Presentation",
    shl: "SMART Health Link",
    store: "Wallet Object"
  };
  const accessLabel = [
    payload.passcodeRequired ? "ต้องใช้ passcode" : kind === "shl" ? "SHL มาตรฐาน" : "Purpose-bound",
    expiresAt ? `หมดอายุ ${expiresAt}` : "",
    credentialCount ? `${credentialCount} เอกสาร` : ""
  ].filter(Boolean).join(" · ");
  const subtitle = data
    ? `${kindLabels[kind]} สำหรับ ${readinessPurposeTh[payload.context as ReadinessContext] ?? payload.context ?? title}`
    : fallbackSubtitle;
  return {
    ownerLabel,
    sourceLabel,
    issuerLabel: String(issuerLabel),
    protocolLabel: kindLabels[kind],
    accessLabel,
    subtitle,
    items
  };
}

function describeStoredObjectPass(object: WalletStoredObject, user: WalletDemoUser) {
  const payload = (object.payload ?? {}) as any;
  const kind: BrandedPassKind =
    object.type === "shl" ? "shl" :
    object.type === "vp" || object.type === "oid4vp_request" ? "vp" :
    object.type === "service_packet" ? "bundle" :
    "store";
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
    object.type === "shl" ? getShlTrustProfile(payload as ShlPackageDetail).label :
    object.protocol === "oid4vci" ? "OID4VCI Offer" :
    object.protocol === "oid4vp" ? "OID4VP Request" :
    object.type === "vp" ? "Verifiable Presentation" :
    object.type === "vc" ? "Verifiable Credential" :
    "Wallet Object";
  const expiresAt = object.expiresAt ? new Date(object.expiresAt).toLocaleString("th-TH") : "";
  const accessLabel = [
    object.type === "shl" && payload.passcodeRequired ? "ต้องใช้ passcode" : "เปิดผ่าน Web view",
    expiresAt ? `หมดอายุ ${expiresAt}` : "",
    object.protocol ?? ""
  ].filter(Boolean).join(" · ");
  return {
    kind,
    ownerLabel,
    sourceLabel: String(sourceLabel),
    issuerLabel: String(issuerLabel),
    protocolLabel,
    accessLabel,
    subtitle: object.subtitle || object.title,
    items: extractPassItems(payload, kind)
  };
}

function extractPassItems(payload: any, kind: BrandedPassKind): string[] {
  if (!payload) return [];
  if (Array.isArray(payload.items)) {
    return payload.items
      .map((item: any) => item?.label || item?.labelEn || item?.documentType || item?.key)
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
  if (kind === "vp") return ["VP proof", "Selected credentials", "Verifier request"];
  return ["Contract context", "Document references", "Trust layer"];
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "TC";
  const ascii = words.map(word => word.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
  if (ascii.length) return ascii.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return value.trim().slice(0, 2).toUpperCase();
}

function getShlTrustProfile(shl: ShlPackageDetail | null | undefined): {
  kind: "trustcare-certified" | "trustcare-pending" | "standard-shl";
  label: string;
  tone: "green" | "yellow" | "blue" | "neutral";
  description: string;
} {
  const hasManifestBinding = Boolean(shl?.manifestCredentialId && shl?.presentationId && shl?.documentBundle?.documents?.length);
  const certification = shl?.trustcareCertification;
  const makerCheckerApproved = Boolean(
    certification?.status === "maker_checker_approved" &&
    certification.ownerConfirmed &&
    certification.makerApprovedAt &&
    certification.checkerApprovedAt
  );
  if (hasManifestBinding && makerCheckerApproved) {
    return {
      kind: "trustcare-certified",
      label: "TrustCare Verified SHL",
      tone: "green",
      description: "ผ่านการยืนยันเจ้าของข้อมูลและ Maker/Checker ของโรงพยาบาลในเครือข่าย TrustCare แล้ว"
    };
  }
  if (hasManifestBinding) {
    return {
      kind: "trustcare-pending",
      label: "รอ Maker/Checker",
      tone: "yellow",
      description: "พบ Manifest VP/VC แต่ยังไม่ผ่านขั้นตอน Maker/Checker จึงใช้เป็น SHL มาตรฐานเท่านั้น"
    };
  }
  return {
    kind: "standard-shl",
    label: "Standard SHL",
    tone: "blue",
    description: "SHL มาตรฐานจากภายนอก อ่านและแชร์ต่อได้โดยไม่ต้องมี Manifest VP/VC"
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
      max: shl.maxAccessCount ?? null
    },
    source: shl.documentBundle?.source,
    bindingModel: shl.documentBundle?.bindingModel,
    standards: shl.documentBundle?.standards ?? ["SMART Health Links", "W3C VC/VP", "HL7 FHIR R4 DocumentReference"],
    documents: documents.map(document => ({
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
      presentationId: document.vcBinding?.presentationId
    }))
  });
}

function compactBundlePayload(bundle: ServiceBundleEnvelope): string {
  const matchedCardIds = Array.from(new Set(
    (bundle.items ?? []).flatMap((item: any) => Array.isArray(item.matchedCardIds) ? item.matchedCardIds : [])
  ));
  const fhirIdentifier = (bundle.fhirBundle as any)?.identifier;
  return JSON.stringify({
    type: "TrustCareServiceBundleReference",
    bundleId: bundle.bundleId,
    contractId: bundle.contractId,
    templateId: bundle.templateId,
    bundleType: bundle.bundleType,
    context: bundle.context,
    audience: bundle.audience,
    direction: bundle.direction,
    status: bundle.status,
    readinessScore: bundle.readinessScore,
    receiver: bundle.receiver,
    createdAt: bundle.createdAt,
    expiresAt: bundle.expiresAt,
    requiredMissing: bundle.requiredMissing,
    itemCount: bundle.items?.length ?? 0,
    matchedCardIds,
    integrityHash: bundle.trustLayer?.integrityHash,
    fhirBundleId: typeof fhirIdentifier?.value === "string" ? fhirIdentifier.value : undefined
  });
}

function extractScannablePayload(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const scanPayload = url.searchParams.get("scan");
    if (scanPayload) return scanPayload;
  } catch {
    // Not a URL; keep the raw payload.
  }
  return raw;
}

function readScanPayloadFromLocation(): string {
  if (typeof window === "undefined") return "";
  const payload = new URLSearchParams(window.location.search).get("scan");
  return payload ?? "";
}

function clearScanPayloadFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("scan");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function readScanHistory(): Record<string, ScanOutcome[]> {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(scanHistoryStorageKey);
    return value ? JSON.parse(value) as Record<string, ScanOutcome[]> : {};
  } catch {
    return {};
  }
}

function writeScanHistory(value: Record<string, ScanOutcome[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scanHistoryStorageKey, JSON.stringify(value));
}

function toneForObject(object: WalletStoredObject): "neutral" | "green" | "yellow" | "red" | "blue" {
  if (object.status === "active" || object.status === "verified" || object.status === "valid") return "green";
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

function resolveAvatarUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/")) return url;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

function shortDid(did: string): string {
  if (did.length <= 22) return did;
  return `${did.slice(0, 12)}...${did.slice(-6)}`;
}

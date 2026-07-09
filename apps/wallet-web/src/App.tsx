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
  ArrowLeft,
  Bell,
  Camera,
  Database,
  Download,
  Fingerprint,
  FileText,
  History,
  Home,
  Inbox,
  KeyRound,
  Languages,
  LogOut,
  Moon,
  Network,
  RefreshCw,
  Settings,
  Share2,
  Sun,
  Wallet,
} from "lucide-react";
import {
  portalSyncApi,
  shareGatewayApi,
  shlApi,
  verifierApi,
  walletApi,
} from "@trustcare/api-client";
import { useLanguage } from "@trustcare/i18n/src/provider.web";
import {
  buildPortalInteroperabilityFixtures,
  countCardsByCategory,
  assessLocalReadiness,
  createDocumentRequestDraft,
  credentialPresentationPolicy,
  documentRequestFormatLabel,
  documentRequestReturnChannelLabel,
  documentRequestSourceLabel,
  exportWalletObjects,
  flattenCardsByCategory,
  getDemoUser,
  groupCardsByCategory,
  importWalletExchange,
  assertPrimaryVerifierQrPayload,
  buildSharePackage,
  parseShlLink,
  fetchShlManifest,
  mergePortalSyncedCards,
  mergeWalletObjects,
  normalizePhotoUrl,
  readinessContextLabels,
  walletObjectsFromCards,
  walletObjectsFromHistory,
  walletObjectsFromShl,
  walletDemoUsers,
  type ContractHubCatalog,
  type DocumentRequestDraft,
  type PresentationHistoryItem,
  type ReadinessContext,
  type ReadinessRequirement,
  type ShlPackage,
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
} from "@trustcare/wallet-core";
import { env } from "./env";
import { useOfflineWallet } from "./hooks/useOfflineWallet";
import { useScanHistory } from "./hooks/useScanHistory";
import { useStoredExtras } from "./hooks/useStoredExtras";
import { useWebAuthn } from "./hooks/useWebAuthn";
import { toQrDataUrl } from "./utils/qrCode";
import {
  readStringStorage,
  removeStorageValue,
  writeStringStorage,
} from "./utils/storage";
import {
  DialogLoadingFallback,
  DocumentFlowDialog,
  DocumentsHubView,
  HistoryView,
  HomeView,
  LoginView,
  NavButton,
  PrepareView,
  PublicVerifierView,
  ReceiveView,
  ScanResponseDialog,
  SettingsView,
  ShareView,
  StoreView,
  UserAvatarImage,
  UserScopePanel,
  clearScanPayloadFromLocation,
  copyText,
  createScannableWebUrl,
  currentAppBaseUrl,
  currentShareGatewayBaseUrl,
  describeScannablePayload,
  downloadExport,
  extractScannablePayload,
  friendlyPortalSyncError,
  friendlyWalletRuntimeError,
  isPublicVerifierScanLocation,
  readScanPayloadFromLocation,
  shortDid,
} from "./views/AppViews";
import {
  documentTabBreadcrumbLabels,
  emptyPortalInteropFixtures,
  readinessContexts,
  readinessPurposeTh,
  viewBreadcrumbLabels,
  type DocumentFlowState,
  type DocumentFlowMode,
  type DocumentsTab,
  type ScanOutcome,
  type ServiceReadinessSummary,
  type StoreFilter,
  type View,
} from "./views/appViewModel";

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

const walletSessionKey = "trustcare-wallet-active-user:v1";
const legacyWalletSessionKey = "trustcare-wallet-active-user";
const defaultLoginUserId = "demo-patient-001";
const walletRuntimeRelease = "authoritative-photo-sources";

function isResolverBackedQrPayload(payload: string): boolean {
  const canonical = extractScannablePayload(payload);
  const shareGatewayBaseUrl = currentShareGatewayBaseUrl();
  if (!shareGatewayBaseUrl) return false;
  try {
    const url = new URL(canonical);
    const gateway = new URL(`${shareGatewayBaseUrl.replace(/\/$/, "")}/`);
    return (
      url.origin === gateway.origin &&
      url.pathname.startsWith(`${gateway.pathname}presentations/`) &&
      url.pathname.endsWith(".jwt")
    );
  } catch {
    return false;
  }
}

function readWalletSessionUserId() {
  return readStringStorage(walletSessionKey, [legacyWalletSessionKey]);
}

export default function App() {
  const { lang, setLang, t } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<View>("home");
  const [viewHistory, setViewHistory] = useState<View[]>([]);
  const [documentsTab, setDocumentsTab] = useState<DocumentsTab>("cards");
  const [developerMode, setDeveloperMode] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    return readWalletSessionUserId() ?? defaultLoginUserId;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(readWalletSessionUserId());
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
  const [publicVerifyOutcome, setPublicVerifyOutcome] =
    useState<ScanOutcome | null>(null);
  const [publicVerifyBusy, setPublicVerifyBusy] = useState(false);
  const [publicVerifyError, setPublicVerifyError] = useState("");
  const [pendingScanPayload, setPendingScanPayload] = useState(() =>
    readScanPayloadFromLocation(),
  );
  const lastPublicVerifyPayload = useRef("");
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
  const [lastImportMessage, setLastImportMessage] = useState("");
  const [portalSyncMessage, setPortalSyncMessage] = useState("");
  const [portalSyncBusy, setPortalSyncBusy] = useState(false);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const offlineWallet = useOfflineWallet();
  const webAuthn = useWebAuthn();
  const { scanHistory, setScanHistoryByUser } =
    useScanHistory<ScanOutcome>(selectedUserId);
  const { storedExtras, setStoredExtrasByUser } =
    useStoredExtras(selectedUserId);
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
  const canSyncPortalWallet =
    portalSyncApi.canUsePortalDemoSync(selectedUserId);
  const interopFixtures = useMemo(() => {
    if (canSyncPortalWallet) return emptyPortalInteropFixtures(activeUser);
    return buildPortalInteroperabilityFixtures(
      selectedUserId,
      baseApiOptions.demoOrigin,
    );
  }, [activeUser, canSyncPortalWallet, selectedUserId]);
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
      const cachedUserCards = offlineWallet.offlineCards.filter(
        (card) => card.ownerUserId === selectedUserId,
      );
      const activeCards =
        offlineWallet.isLoaded && cachedUserCards.length
          ? groupCardsByCategory(cachedUserCards)
          : cards;
      setGrouped(activeCards);
      setHistory(walletHistory);
      setShlPackages(shl);
      setContractHub(hub);
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
  }, [
    apiOptions,
    offlineWallet.isLoaded,
    offlineWallet.offlineCards,
    selectedUserId,
  ]);

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
      setPortalSyncMessage(
        "Wallet นี้ไม่ได้ผูกกับ TrustCare Portal จึงไม่สามารถ Sync จาก Portal ได้",
      );
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
        throw new Error(
          "Portal sync returned credentials for another wallet user",
        );
      }
      const existingPortalCards = allCards.filter(
        (card) =>
          card.ownerUserId === selectedUserId &&
          card.sourceSystem === "trustcare_portal",
      );
      const preservedWalletCards = allCards.filter(
        (card) => card.sourceSystem !== "trustcare_portal",
      );
      const mergedSync = mergePortalSyncedCards({
        existingCards: existingPortalCards,
        incomingCards: syncedCards,
        syncedAt: result.report.syncedAt,
        authoritativeSnapshot: true,
      });
      const activeCards = [...preservedWalletCards, ...mergedSync.cards];
      const activeCardsByCategory = groupCardsByCategory(activeCards);
      setGrouped(activeCardsByCategory);
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
      await offlineWallet.syncCards(activeCards);
      const warningText = result.report.warnings.length
        ? ` (${result.report.warnings.join(" / ")})`
        : "";
      setPortalSyncMessage(
        [
          `Sync จาก TrustCare Portal สำเร็จ: ใช้งาน VC ${mergedSync.report.active} รายการ`,
          `เพิ่ม ${mergedSync.report.added}`,
          `อัปเดต ${mergedSync.report.updated}`,
          `ซ้ำเดิม ${mergedSync.report.unchanged}`,
          mergedSync.report.archived
            ? `เก็บเวอร์ชันเดิม ${mergedSync.report.archived}`
            : null,
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

  const addScanHistory = useCallback(
    (outcome: ScanOutcome) => {
      setScanHistoryByUser((previous) => ({
        ...previous,
        [outcome.userId]: [outcome, ...(previous[outcome.userId] ?? [])].slice(
          0,
          80,
        ),
      }));
    },
    [setScanHistoryByUser],
  );

  const generateQr = useCallback(
    async (fields: string[] = []) => {
      if (!selectedCard) return;
      const presentationPolicy = credentialPresentationPolicy(selectedCard);
      if (!presentationPolicy.presentable) {
        alert(
          presentationPolicy.reason ??
            "Credential นี้ไม่ได้อยู่ในสถานะใช้งานได้",
        );
        return;
      }
      if (webAuthn.isRegistered) {
        const ok = await webAuthn.authenticate();
        if (!ok) return;
      }
      if (!offlineWallet.isOnline && !fields.length) {
        const cached = await offlineWallet.getOfflineQr(selectedCard.id);
        if (cached && isResolverBackedQrPayload(cached.qrData)) {
          const scannableCachedQr = createScannableWebUrl(cached.qrData);
          setPresentation({
            presentationId: cached.presentationId,
            format: "jwt-vp",
            mode: "offline_cached_gateway_resolver",
            credentialCount: 1,
            selectedFields: [],
            expiresAt: cached.expiresAt ?? new Date().toISOString(),
            qrData: scannableCachedQr,
            verificationChecklist: [
              {
                key: "gateway",
                label: "Public resolver URL",
                ok: true,
                detail: extractScannablePayload(scannableCachedQr),
              },
            ],
          });
          setQrDataUrl(
            await toQrDataUrl(scannableCachedQr, { margin: 1, width: 260 }),
          );
          await offlineWallet.cacheQr(
            selectedCard.id,
            scannableCachedQr,
            cached.presentationId,
            cached.expiresAt,
          );
          return;
        }
      }
      const shareGatewayBaseUrl = currentShareGatewayBaseUrl();
      if (!shareGatewayBaseUrl) {
        alert(
          "ยังไม่ได้ตั้งค่า Share Gateway สำหรับสร้าง QR ที่สแกนข้ามเครื่องและตรวจ proof ได้",
        );
        return;
      }
      try {
        const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
        const context: ReadinessContext = readinessContext;
        const purposeLabel = readinessContextLabels[context]?.th ?? context;
        const holderDid = selectedCard.holderDid ?? activeUser.holderDid;
        const result = buildSharePackage({
          mode: "PurposeVP",
          context,
          cards: [selectedCard],
          selectedCardIds: [selectedCard.id],
          holderDid,
          recipient: "TrustCare credential verifier",
          purpose: `${selectedCard.displayName} · ${purposeLabel}`,
          selectedFields: fields,
          expiresAt,
          origin: currentAppBaseUrl(),
          gatewayBaseUrl: shareGatewayBaseUrl,
          viewerBaseUrl: currentAppBaseUrl(),
        });
        if (!("presentation" in result)) {
          throw new Error("สร้าง VP package ไม่สำเร็จ");
        }
        const publication = await shareGatewayApi.publishVpSharePackage({
          gatewayBaseUrl: shareGatewayBaseUrl,
          result,
          userId: selectedUserId,
          holderDid,
          purpose: context,
          purposeLabel,
          recipient: "TrustCare credential verifier",
          expiresAt,
        });
        const resolverPayload =
          publication.qrPayload ??
          publication.publicUrl ??
          result.presentation.qrData;
        assertPrimaryVerifierQrPayload(resolverPayload);
        const scannableQr = createScannableWebUrl(resolverPayload);
        const presentationWithWebQr: WalletPresentationResponse = {
          ...result.presentation,
          mode: "gateway_resolver_vp",
          qrData: scannableQr,
          transportDecision: {
            mode: "share_gateway_resolver",
            label: "Public verifier URL",
            reason:
              "Credential detail QR is published through the Share Gateway so another device opens the public verifier and resolves the backend-signed VP.",
          },
          verificationChecklist: [
            ...(Array.isArray(result.presentation.verificationChecklist)
              ? result.presentation.verificationChecklist
              : []),
            {
              key: "gateway",
              label: "Public resolver URL",
              ok: true,
              detail: resolverPayload,
            },
            {
              key: "proof",
              label: "Backend signed VP",
              ok: true,
              detail: publication.jwksUrl ?? publication.publicUrl,
            },
          ],
        };
        setPresentation(presentationWithWebQr);
        const nextQr = await toQrDataUrl(scannableQr, {
          margin: 1,
          width: 260,
        });
        setQrDataUrl(nextQr);
        await offlineWallet.cacheQr(
          selectedCard.id,
          scannableQr,
          result.presentation.presentationId,
          result.presentation.expiresAt,
        );
        setSelectiveOpen(false);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "สร้าง QR Code สำหรับ VP ไม่สำเร็จ";
        alert(message);
      }
    },
    [
      activeUser.holderDid,
      offlineWallet,
      readinessContext,
      selectedCard,
      selectedUserId,
      webAuthn,
    ],
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

  const acceptCredentialOffer = useCallback(
    async (value: string) => {
      const payload = extractScannablePayload(value);
      const result = await walletApi.acceptCredentialOffer(apiOptions, {
        offerPayload: payload,
      });
      const mergedCards = [
        ...allCards.filter(
          (card) =>
            String(card.credentialId) !==
            String(result.credential.credentialId),
        ),
        result.credential,
      ];
      setGrouped(groupCardsByCategory(mergedCards));
      addStoredObject(result.storedObject);
      await offlineWallet.syncCards(mergedCards);
      setLastImportMessage(
        `รับ VC ผ่าน OID4VCI สำเร็จ: ${result.credential.displayName}`,
      );
      return result;
    },
    [addStoredObject, allCards, apiOptions, offlineWallet],
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

  const verifyPublicScan = useCallback(async (value: string) => {
    const descriptor = describeScannablePayload(value);
    const payload = descriptor.canonicalPayload;
    setPublicVerifyBusy(true);
    setPublicVerifyError("");
    try {
      let manifestFetch: ShlManifestFetchResult | undefined;
      if (descriptor.payloadKind === "shl") {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4500);
        try {
          manifestFetch = await fetchShlManifest(payload, {
            recipient: "TrustCare public verifier",
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeout);
        }
      }
      const verifier = await verifierApi.verifyQr(
        {
          ...baseApiOptions,
          demoMode: true,
        },
        payload,
      );
      const outcome = {
        id: `public_scan_${Date.now().toString(36)}`,
        userId: "public-verifier",
        context: "qr_scan",
        raw: value,
        payload,
        descriptor,
        manifestFetch,
        verifier: {
          ...verifier,
          warnings: [
            ...(verifier.warnings ?? []),
            ...(manifestFetch?.warnings ?? []),
          ],
          errors: [
            ...(verifier.errors ?? []),
            ...(manifestFetch?.errors ?? []),
          ],
        },
        importResult: {
          ok: verifier.verified,
          format:
            descriptor.payloadKind === "vp"
              ? "trustcare-vp-json"
              : descriptor.payloadKind === "shl"
                ? "shl-link"
                : descriptor.payloadKind === "oid4vci"
                  ? "oid4vci-offer"
                  : descriptor.payloadKind === "oid4vp"
                    ? "oid4vp-request"
                    : "unknown",
          protocol:
            descriptor.payloadKind === "shl"
              ? "shl"
              : descriptor.payloadKind === "oid4vci"
                ? "oid4vci"
                : descriptor.payloadKind === "oid4vp"
                  ? "oid4vp"
                  : "trustcare",
          warnings: [],
          errors: [],
        },
        scannedAt: new Date().toISOString(),
      } satisfies ScanOutcome;
      setPublicVerifyOutcome(outcome);
    } catch (error) {
      setPublicVerifyError(
        error instanceof Error
          ? error.message
          : "Public verifier could not verify this QR payload.",
      );
      setPublicVerifyOutcome(null);
    } finally {
      setPublicVerifyBusy(false);
    }
  }, []);

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
        const documentType =
          draft.requestedDocumentTypes[0] ?? "patient_summary";
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
    if (isPublicVerifierScanLocation()) return;
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

  useEffect(() => {
    if (isAuthenticated || !pendingScanPayload) return;
    if (lastPublicVerifyPayload.current === pendingScanPayload) return;
    lastPublicVerifyPayload.current = pendingScanPayload;
    void verifyPublicScan(pendingScanPayload);
  }, [isAuthenticated, pendingScanPayload, verifyPublicScan]);

  useEffect(() => {
    if (!pendingScanPayload || !isPublicVerifierScanLocation()) return;
    if (lastPublicVerifyPayload.current === pendingScanPayload) return;
    lastPublicVerifyPayload.current = pendingScanPayload;
    void verifyPublicScan(pendingScanPayload);
  }, [pendingScanPayload, verifyPublicScan]);

  const loginAs = useCallback(
    (userId: string) => {
      writeStringStorage(walletSessionKey, userId);
      setSelectedUserId(userId);
      setIsAuthenticated(true);
      setViewHistory([]);
      setView(pendingScanPayload ? "share" : "home");
    },
    [pendingScanPayload],
  );

  const logout = useCallback(() => {
    removeStorageValue(walletSessionKey, [legacyWalletSessionKey]);
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

  if (
    pendingScanPayload &&
    (!isAuthenticated || isPublicVerifierScanLocation())
  ) {
    return (
      <>
        <PublicVerifierView
          payload={pendingScanPayload}
          outcome={publicVerifyOutcome}
          busy={publicVerifyBusy}
          error={publicVerifyError}
          onRetry={() => void verifyPublicScan(pendingScanPayload)}
          onCopy={copyText}
          onOpenScanner={() => setScannerOpen(true)}
          onOpenWallet={() => loginAs(selectedUserId)}
        />
        <Suspense fallback={<DialogLoadingFallback />}>
          {scannerOpen && (
            <QrScannerDialog
              open={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onScan={(value) => {
                const payload = extractScannablePayload(value);
                lastPublicVerifyPayload.current = "";
                setPendingScanPayload(payload);
                window.location.hash = `scan=${encodeURIComponent(payload)}`;
              }}
            />
          )}
        </Suspense>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginView
          users={walletDemoUsers}
          pendingScan={Boolean(pendingScanPayload)}
          selectedUserId={selectedUserId}
          onSelect={setSelectedUserId}
          onLogin={loginAs}
          onOpenScanner={() => setScannerOpen(true)}
        />
        <Suspense fallback={<DialogLoadingFallback />}>
          {scannerOpen && (
            <QrScannerDialog
              open={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onScan={(value) => {
                setPendingScanPayload(extractScannablePayload(value));
              }}
            />
          )}
        </Suspense>
      </>
    );
  }

  return (
    <main
      className="app-shell"
      data-release={walletRuntimeRelease}
      data-view={view}
    >
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
        <UserScopePanel
          activeUser={activeUser}
          cards={allCards}
          onLogout={logout}
        />
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
              <UserAvatarImage user={activeUser} cards={allCards} />
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
            <button
              type="button"
              className="shell-scan-button"
              title="สแกน QR"
              aria-label="สแกน QR"
              onClick={() => setScannerOpen(true)}
            >
              <Camera size={18} />
              <span>สแกน QR</span>
            </button>
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
            onAcceptCredentialOffer={(value) => {
              void acceptCredentialOffer(value).then(() =>
                setDocumentsTab("store"),
              );
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
            onAcceptCredentialOffer={(value) => {
              void acceptCredentialOffer(value).then(() => navigateTo("store"));
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
          onSubmit={(draft) =>
            void submitDocumentFlow(draft, documentFlow.mode)
          }
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

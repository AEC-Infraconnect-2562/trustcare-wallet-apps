import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Camera,
  Download,
  Fingerprint,
  KeyRound,
  Languages,
  LogOut,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sun,
  Wallet,
} from "lucide-react";
import {
  payerApi,
  shlApi,
  verifierApi,
  walletApi,
} from "@trustcare/api-client";
import { useLanguage } from "@trustcare/i18n/src/provider.web";
import {
  buildPortalInteroperabilityFixtures,
  assessLocalReadiness,
  documentRequestFormatLabel,
  documentRequestSourceLabel,
  exportWalletObjects,
  flattenCardsByCategory,
  getDemoUser,
  groupCardsByCategory,
  importWalletExchange,
  fetchShlManifest,
  mergePayerArtifactCards,
  mergeWalletObjects,
  readinessContextLabels,
  walletObjectsFromCards,
  walletObjectsFromHistory,
  walletObjectsFromShl,
  walletCardForDocumentRendering,
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
  type WalletDocumentRecordV2,
  type WalletExportResult,
  type WalletImportJob,
  type WalletStoredObject,
  type VerifierResult,
} from "@trustcare/wallet-core";
import { env } from "./env";
import {
  baseApiOptions,
  defaultLoginUserId,
  legacyWalletSessionKey,
  preserveDesktopScrollPosition,
  readWalletSessionUserId,
  sidebarCollapsedKey,
  walletRuntimeRelease,
  walletSessionKey,
} from "./appRuntime";
import {
  RecordsV2View,
  type PortalHospitalCode,
} from "./components/records/RecordsV2View";
import { RoutePlaceholderView } from "./components/shell/RoutePlaceholderView";
import {
  AppPrimaryNavigation,
  AppSideNavigation,
} from "./components/shell/AppNavigation";
import { useOfflineWallet } from "./hooks/useOfflineWallet";
import { useScanHistory } from "./hooks/useScanHistory";
import { useStoredExtras } from "./hooks/useStoredExtras";
import { useWebAuthn } from "./hooks/useWebAuthn";
import { useWalletExchange } from "./hooks/useWalletExchange";
import {
  credentialRequestStatusLabel,
  createMissingCredentialRequestInput,
  createdCredentialRequestViewModel,
  mergeCredentialRequestStatus,
  persistedCredentialRequestViewModel,
  type WalletCredentialRequestViewModel,
} from "./walletExchangeCredentialRequest";
import {
  defaultPortalHospitalCode,
  refreshWalletExchangeSubmission,
  submitWalletExchangeRecord,
} from "./walletExchangeSubmission";
import {
  isPlaceholderRouteId,
  pathForView,
  resolveWalletRoute,
} from "./routing/appRoutes";
import {
  readStringStorage,
  removeStorageValue,
  writeStringStorage,
} from "./utils/storage";
import {
  DialogLoadingFallback,
  DocumentFlowDialog,
  HomeView,
  PrepareView,
  PublicVerifierView,
  ReceiveView,
  ScanResponseDialog,
  ShareView,
  StoreView,
  clearScanPayloadFromLocation,
  copyText,
  describeScannablePayload,
  downloadExport,
  extractScannablePayload,
  friendlyPortalSyncError,
  friendlyWalletRuntimeError,
  isPublicVerifierScanLocation,
  readScanPayloadFromLocation,
} from "./views/AppViews";
import { LoginView, UserScopePanel } from "./views/IdentityViews";
import {
  UserAvatarImage,
  shortDid,
} from "./views/identityPresentation";
import {
  documentTabBreadcrumbLabels,
  emptyPortalInteropFixtures,
  readinessContexts,
  readinessPurposeTh,
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
const HistoryView = lazy(() =>
  import("./views/SecondaryViews").then((module) => ({
    default: module.HistoryView,
  })),
);
const SettingsView = lazy(() =>
  import("./views/SecondaryViews").then((module) => ({
    default: module.SettingsView,
  })),
);
export default function App() {
  const { lang, setLang, t } = useLanguage();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const routeMatch = useMemo(
    () => resolveWalletRoute(location.pathname),
    [location.pathname],
  );
  const routeView = routeMatch.route.view;
  const view: View = routeView ?? "home";
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = readStringStorage(sidebarCollapsedKey);
    return stored === null ? true : stored === "true";
  });
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
  const detailReturnPathRef = useRef("/home");
  const [scannerOpen, setScannerOpen] = useState(false);
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
  const [payerShareSelection, setPayerShareSelection] = useState<{
    context: ReadinessContext;
    cardIds: number[];
  } | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [contractHub, setContractHub] = useState<ContractHubCatalog | null>(
    null,
  );
  const [prepareWorkbench, setPrepareWorkbench] = useState<any>(null);
  const [documentRequests, setDocumentRequests] = useState<
    WalletCredentialRequestViewModel[]
  >([]);
  const [documentFlow, setDocumentFlow] = useState<DocumentFlowState | null>(
    null,
  );
  const [documentFlowError, setDocumentFlowError] = useState("");
  const [importJob, setImportJob] = useState<WalletImportJob | null>(null);
  const [lastImportMessage, setLastImportMessage] = useState("");
  const [portalSyncMessage, setPortalSyncMessage] = useState("");
  const [portalSyncBusy, setPortalSyncBusy] = useState(false);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");
  const offlineWallet = useOfflineWallet(env.demoMode);
  const webAuthn = useWebAuthn();
  const { scanHistory, setScanHistoryByUser } =
    useScanHistory<ScanOutcome>(selectedUserId);
  const { storedExtras, setStoredExtrasByUser } =
    useStoredExtras(selectedUserId);

  useEffect(() => {
    writeStringStorage(sidebarCollapsedKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const activeUser = useMemo(
    () => getDemoUser(selectedUserId),
    [selectedUserId],
  );
  const walletExchange = useWalletExchange({
    enabled:
      isAuthenticated &&
      routeMatch.route.id !== "verify" &&
      !(pendingScanPayload && isPublicVerifierScanLocation()),
    portalBaseUrl: env.portalBaseUrl,
    appId: env.walletExchangeAppId,
    runtimeEnvironment: env.runtimeEnvironment,
    walletVersion: "0.1.0",
    localUserKey: selectedUserId,
  });
  const apiOptions = useMemo(
    () => ({
      ...baseApiOptions,
      userId: selectedUserId,
    }),
    [selectedUserId],
  );

  useEffect(() => {
    setDocumentRequests([]);
  }, [selectedUserId]);

  useEffect(() => {
    if (!walletExchange.requestLinks.length) return;
    setDocumentRequests((previous) => {
      const byClientId = new Map(
        previous
          .filter((request) => request.clientRequestId)
          .map((request) => [request.clientRequestId!, request] as const),
      );
      for (const link of walletExchange.requestLinks) {
        if (!byClientId.has(link.clientRequestId)) {
          byClientId.set(
            link.clientRequestId,
            persistedCredentialRequestViewModel(link),
          );
        }
      }
      return [
        ...byClientId.values(),
        ...previous.filter((request) => !request.clientRequestId),
      ];
    });
  }, [walletExchange.requestLinks]);

  const canSyncPortalWallet = Boolean(walletExchange.workflow);
  const interopFixtures = useMemo(() => {
    if (canSyncPortalWallet || !env.demoMode) {
      return emptyPortalInteropFixtures(activeUser);
    }
    return buildPortalInteroperabilityFixtures(
      selectedUserId,
      baseApiOptions.demoOrigin,
    );
  }, [activeUser, canSyncPortalWallet, selectedUserId]);
  const navigateTo = useCallback(
    (nextView: View, options?: { replace?: boolean }) => {
      setDetailOpen(false);
      setSelectedCard(null);
      routerNavigate(pathForView(nextView), { replace: options?.replace });
    },
    [routerNavigate],
  );
  const goBack = useCallback(() => {
    routerNavigate(-1);
  }, [routerNavigate]);

  useEffect(() => {
    if (!routeMatch.redirectTo) return;
    routerNavigate(
      {
        pathname: routeMatch.redirectTo,
        search: location.search,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.search, routeMatch.redirectTo, routerNavigate]);
  useEffect(() => {
    const serviceProfileId = routeMatch.params.serviceProfileId;
    if (serviceProfileId && serviceProfileId in readinessContextLabels) {
      setReadinessContext(serviceProfileId as ReadinessContext);
    }
  }, [routeMatch.params.serviceProfileId]);
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
    if (!isAuthenticated) return;
    if (!env.demoMode) {
      setGrouped({});
      setHistory([]);
      setShlPackages([]);
      setContractHub(null);
      setSelectedCard(null);
      setDetailOpen(false);
      setVerifierResult(null);
      setScanOutcome(null);
      setScanResponseOpen(false);
      setImportJob(null);
      setLastImportMessage("");
      setPayerShareSelection(null);
      return;
    }
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
    setVerifierResult(null);
    setScanOutcome(null);
    setScanResponseOpen(false);
    setImportJob(null);
    setLastImportMessage("");
    setPayerShareSelection(null);
    return () => {
      cancelled = true;
    };
  }, [
    apiOptions,
    isAuthenticated,
    offlineWallet.isLoaded,
    offlineWallet.offlineCards,
    selectedUserId,
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!env.demoMode) {
      setReadiness(null);
      setPrepareWorkbench(null);
      setDocumentRequests((previous) =>
        previous.filter((request) => request.clientRequestId),
      );
      return;
    }
    let cancelled = false;
    const existingRequestPromise =
      env.demoMode && !canSyncPortalWallet
        ? walletApi.documentRequests(apiOptions, {
            context: readinessContext,
          })
        : Promise.resolve([] as WalletDocumentRequest[]);
    void Promise.all([
      walletApi.readiness(apiOptions, { context: readinessContext }),
      walletApi.prepareWorkbench(apiOptions, { context: readinessContext }),
      existingRequestPromise,
    ])
      .then(([nextReadiness, workbench, requests]) => {
        if (cancelled) return;
        setReadiness(nextReadiness);
        setPrepareWorkbench(workbench);
        setDocumentRequests((previous) => [
          ...previous.filter((request) => request.clientRequestId),
          ...requests,
        ]);
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
  }, [apiOptions, canSyncPortalWallet, isAuthenticated, readinessContext]);

  const exchangeCards = useMemo(
    () =>
      walletExchange.documents.map((record) =>
        walletCardForDocumentRendering(record),
      ),
    [walletExchange.documents],
  );

  const allCards = useMemo(() => {
    if (!env.demoMode) return exchangeCards;
    const online = flattenCardsByCategory(grouped);
    return online.length
      ? online
      : offlineWallet.offlineCards.filter(
          (card) => card.ownerUserId === selectedUserId,
        );
  }, [exchangeCards, grouped, offlineWallet.offlineCards, selectedUserId]);

  const openRecord = useCallback(
    (card: WalletCard) => {
      preserveDesktopScrollPosition();
      detailReturnPathRef.current = location.pathname;
      setSelectedCard(card);
      setDetailOpen(true);
    },
    [location.pathname],
  );

  const openV2Record = useCallback(
    (record: WalletDocumentRecordV2) => {
      preserveDesktopScrollPosition();
      detailReturnPathRef.current = "/records";
      setSelectedCard(null);
      setDetailOpen(false);
      const routeId = record.credential.credentialId ?? record.id;
      routerNavigate(`/records/${encodeURIComponent(routeId)}`);
    },
    [routerNavigate],
  );

  const submitExchangeRecord = useCallback(
    async (
      record: WalletDocumentRecordV2,
      targetHospitalCode: PortalHospitalCode,
    ) => {
      const workflow = walletExchange.workflow;
      if (!workflow) {
        throw new Error(
          walletExchange.error ||
            "Wallet Exchange V2 ยังไม่พร้อม ระบบจะไม่ส่งเอกสารผ่านช่องทางเดิม",
        );
      }
      return submitWalletExchangeRecord({
        workflow,
        record,
        targetHospitalCode,
        context: readinessContext,
        purpose: readinessPurposeTh[readinessContext],
        reload: walletExchange.reload,
      });
    },
    [
      readinessContext,
      walletExchange.error,
      walletExchange.reload,
      walletExchange.workflow,
    ],
  );

  const refreshExchangeSubmission = useCallback(
    async (clientSubmissionId: string) => {
      const workflow = walletExchange.workflow;
      if (!workflow) {
        throw new Error(
          walletExchange.error ||
            "Wallet Exchange V2 ยังไม่พร้อม ระบบจะไม่ตรวจสถานะจากช่องทางเดิม",
        );
      }
      return refreshWalletExchangeSubmission({
        workflow,
        clientSubmissionId,
        reload: walletExchange.reload,
      });
    },
    [walletExchange.error, walletExchange.reload, walletExchange.workflow],
  );

  const closeCredentialInspector = useCallback(() => {
    preserveDesktopScrollPosition();
    setDetailOpen(false);
    if (routeMatch.params.recordId) {
      routerNavigate(detailReturnPathRef.current, { replace: true });
    }
  }, [routeMatch.params.recordId, routerNavigate]);

  const shareCredentialFromInspector = useCallback(
    (card: WalletCard) => {
      setPayerShareSelection({
        context: readinessContext,
        cardIds: [card.id],
      });
      setDetailOpen(false);
      routerNavigate(pathForView("share"));
    },
    [readinessContext, routerNavigate],
  );

  useEffect(() => {
    if (!allCards.length) return;
    const nextReadiness = assessLocalReadiness(allCards, readinessContext);
    setReadiness((previous: any) =>
      previous
        ? { ...previous, readiness: nextReadiness }
        : {
            patientId: env.demoMode ? activeUser.patientId : undefined,
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

  const runActivePayerLifecycle = useCallback(
    async (input: {
      context: "insurance_claim" | "cross_border" | "medical_tourist";
      selectedCardIds: number[];
      consentReceiptId: string;
    }) => {
      if (!env.demoMode) {
        throw new Error(
          "Payer sandbox adapters are disabled in Wallet Exchange runtime; configure a real Portal/Contract Hub adapter instead of falling back to demo data.",
        );
      }
      const result = await payerApi.runPayerLifecycle(apiOptions, {
        ...input,
        patientId: activeUser.id,
        cards: allCards,
        createdAt: new Date().toISOString(),
        requireSignedArtifacts: true,
      });
      if (
        result.artifactCards.some(
          (card) =>
            card.ownerUserId !== activeUser.id ||
            card.sourceSystem !== "payer_adapter" ||
            card.credentialStatus !== "active" ||
            !card.credentialJwt ||
            !card.issuerDid?.startsWith("did:web:"),
        )
      ) {
        throw new Error(
          "Demo payer issuer returned an unsigned artifact or another wallet user's data.",
        );
      }
      const mergedCards = mergePayerArtifactCards(
        allCards,
        result.artifactCards,
      );
      setGrouped(groupCardsByCategory(mergedCards));
      await offlineWallet.syncCards(mergedCards);
      return result;
    },
    [activeUser.id, allCards, apiOptions, offlineWallet],
  );

  const syncActiveWalletFromPortal = useCallback(async () => {
    if (!canSyncPortalWallet) {
      setPortalSyncMessage(
        "Wallet นี้ไม่ได้ผูกกับ TrustCare Portal จึงไม่สามารถ Sync จาก Portal ได้",
      );
      return;
    }
    setPortalSyncBusy(true);
    setPortalSyncMessage(
      "กำลังตรวจ Contract, DPoP และ Sync VC จาก TrustCare Portal...",
    );
    try {
      const result = await walletExchange.synchronize();
      setPortalSyncMessage(
        [
          `Sync Wallet Exchange V2 สำเร็จ ${result.pages} หน้า`,
          `รับ/อัปเดต ${result.applied}`,
          `เก็บประวัติสถานะ ${result.archived}`,
          result.rejected ? `กักกัน ${result.rejected}` : null,
          result.pendingAckRecovered ? "กู้คืน ACK ที่ค้างแล้ว" : null,
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
  }, [canSyncPortalWallet, walletExchange]);

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
      if (!env.demoMode) {
        throw new Error(
          "OID4VCI receive is not enabled for the live Portal contract; Wallet will not fall back to the legacy API.",
        );
      }
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
      const verifier = await verifierApi.verifyQr(baseApiOptions, payload);
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
    setPayerShareSelection(null);
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
      setDocumentFlowError("");
      setDocumentFlow({ mode, requirements: missing });
    },
    [getMissingRequirements],
  );

  const submitDocumentFlow = useCallback(
    async (draft: DocumentRequestDraft, mode: DocumentFlowMode) => {
      if (mode === "import") {
        if (!env.demoMode) {
          throw new Error(
            "Document import is not defined by Wallet Exchange V2; Wallet will not send a Portal patientId or fall back to the legacy API.",
          );
        }
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

      const workflow = walletExchange.workflow;
      if (!workflow) {
        throw new Error(
          walletExchange.error ||
            "Wallet Exchange V2 ยังไม่พร้อม ระบบจะไม่ส่งคำขอผ่านช่องทางเดิม",
        );
      }
      const requestInput = createMissingCredentialRequestInput({
        draft,
        hospitalCode: activeUser.hospitalCode,
      });
      const result = await workflow.requestMissingCredentials(requestInput);
      const requestView = createdCredentialRequestViewModel({
        response: result,
        context: draft.context,
        documentTypes: draft.requestedDocumentTypes,
        hospitalCode: requestInput.targetHospitalCode,
        hospitalName: activeUser.hospitalNameTh,
      });
      setDocumentRequests((previous) => [
        requestView,
        ...previous.filter(
          (request) => request.clientRequestId !== result.clientRequestId,
        ),
      ]);
      await walletExchange.reload();
      setLastImportMessage(
        `ส่งคำขอเอกสาร ${result.requestId} ไปที่ ${activeUser.hospitalNameTh} แล้ว · ${credentialRequestStatusLabel(result.status)}`,
      );
      setDocumentFlow(null);
    },
    [
      activeUser.hospitalCode,
      activeUser.hospitalNameTh,
      activeUser.patientId,
      addStoredObject,
      apiOptions,
      walletExchange.error,
      walletExchange.reload,
      walletExchange.workflow,
    ],
  );

  const refreshDocumentRequest = useCallback(
    async (request: WalletCredentialRequestViewModel) => {
      const workflow = walletExchange.workflow;
      if (!workflow || !request.clientRequestId) {
        throw new Error(
          walletExchange.error ||
            "ไม่พบคำขอ Wallet Exchange V2 ที่ตรวจสอบสถานะได้",
        );
      }
      setDocumentRequests((previous) =>
        previous.map((candidate) =>
          candidate.clientRequestId === request.clientRequestId
            ? { ...candidate, refreshing: true, refreshError: undefined }
            : candidate,
        ),
      );
      try {
        const status = await workflow.refreshCredentialRequest(
          request.clientRequestId,
        );
        setDocumentRequests((previous) =>
          previous.map((candidate) =>
            candidate.clientRequestId === request.clientRequestId
              ? mergeCredentialRequestStatus(candidate, status)
              : candidate,
          ),
        );
        await walletExchange.reload();
        setLastImportMessage(
          `อัปเดตคำขอ ${status.requestId} แล้ว · ${credentialRequestStatusLabel(status.status)}`,
        );
      } catch (error) {
        const message = friendlyWalletRuntimeError(
          error,
          "ตรวจสอบสถานะคำขอไม่สำเร็จ",
        );
        setDocumentRequests((previous) =>
          previous.map((candidate) =>
            candidate.clientRequestId === request.clientRequestId
              ? { ...candidate, refreshing: false, refreshError: message }
              : candidate,
          ),
        );
        throw error;
      }
    },
    [walletExchange.error, walletExchange.reload, walletExchange.workflow],
  );

  const exportResult = useCallback((result: WalletExportResult) => {
    downloadExport(result);
    setLastImportMessage(`ส่งออก ${result.fileName} แล้ว`);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !pendingScanPayload || !allCards.length) return;
    if (routeMatch.route.id === "verify" || isPublicVerifierScanLocation())
      return;
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
    routeMatch.route.id,
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
    if (
      !pendingScanPayload ||
      (routeMatch.route.id !== "verify" && !isPublicVerifierScanLocation())
    )
      return;
    if (lastPublicVerifyPayload.current === pendingScanPayload) return;
    lastPublicVerifyPayload.current = pendingScanPayload;
    void verifyPublicScan(pendingScanPayload);
  }, [pendingScanPayload, routeMatch.route.id, verifyPublicScan]);

  const loginAs = useCallback(
    (userId: string) => {
      writeStringStorage(walletSessionKey, userId);
      setSelectedUserId(userId);
      setIsAuthenticated(true);
      navigateTo(pendingScanPayload ? "share" : "home", { replace: true });
    },
    [navigateTo, pendingScanPayload],
  );

  const logout = useCallback(() => {
    removeStorageValue(
      walletSessionKey,
      env.runtimeEnvironment === "demo" ? [legacyWalletSessionKey] : [],
    );
    setIsAuthenticated(false);
    navigateTo("home", { replace: true });
    setSelectedCard(null);
    setDetailOpen(false);
    setVerifierResult(null);
    setScanOutcome(null);
    setScanResponseOpen(false);
  }, [navigateTo]);

  const title = routeMatch.route.title;
  const placeholderRouteId = isPlaceholderRouteId(routeMatch.route.id)
    ? routeMatch.route.id
    : null;
  const canGoBack =
    typeof window !== "undefined" &&
    Number((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  const breadcrumbs = [
    "TrustCare Wallet",
    routeMatch.route.breadcrumb,
    ...(routeView === "documents"
      ? [documentTabBreadcrumbLabels[documentsTab]]
      : []),
  ];
  const openDocumentsHub = (tab: DocumentsTab = "cards") => {
    navigateTo("documents");
    setDocumentsTab(tab);
  };

  if (
    routeMatch.route.id === "verify" ||
    (pendingScanPayload && (!isAuthenticated || isPublicVerifierScanLocation()))
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

  if (!isAuthenticated && env.runtimeEnvironment !== "demo") {
    return (
      <main className="runtime-auth-boundary">
        <section role="alert">
          <span className="eyebrow">{env.environmentBanner.labelTh}</span>
          <h1>ยังไม่ได้เชื่อมต่อระบบยืนยันตัวตน</h1>
          <p>
            Wallet จะไม่เปิดข้อมูลสาธิตแทนข้อมูลจริง กรุณาตั้งค่าระบบเข้าสู่ระบบ
            และการเชื่อมต่อ TrustCare Portal สำหรับระบบนี้
          </p>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {env.environmentBanner.bannerVisible && (
          <div className="login-runtime-banner" role="status">
            <strong>{env.environmentBanner.labelTh}</strong>
            <span>{env.environmentBanner.descriptionTh}</span>
          </div>
        )}
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
      data-view={routeMatch.route.id}
      data-runtime={env.runtimeEnvironment}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      data-inspector-open={detailOpen && selectedCard ? "true" : "false"}
    >
      <header className="app-top-shell">
        <div className="brand-block">
          <img
            className="brand-mark-image"
            src="/assets/brand/trustcare-shield.png"
            alt=""
          />
          <div className="brand-copy">
            <strong>TrustCare Wallet</strong>
            <small>เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้</small>
          </div>
        </div>
        <nav className="primary-tabs" aria-label="TrustCare Wallet">
          <AppPrimaryNavigation
            routeId={routeMatch.route.id}
            routeView={view}
            onNavigate={navigateTo}
            onOpenDocuments={() => openDocumentsHub("cards")}
          />
        </nav>
      </header>
      <aside className="side-nav">
        <div className="brand-block">
          <img
            className="brand-mark-image"
            src="/assets/brand/trustcare-shield.png"
            alt=""
          />
          <div className="brand-copy">
            <strong>TrustCare Wallet</strong>
            <small>เอกสารสุขภาพส่วนตัวที่ตรวจสอบได้</small>
          </div>
        </div>
        <nav>
          <AppSideNavigation
            routeId={routeMatch.route.id}
            routeView={view}
            onNavigate={navigateTo}
          />
        </nav>
        <button
          type="button"
          className="side-nav-toggle"
          aria-label={sidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
          title={sidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
          aria-expanded={!sidebarCollapsed}
          onClick={() => {
            preserveDesktopScrollPosition();
            setSidebarCollapsed((value) => !value);
          }}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={19} />
          ) : (
            <PanelLeftClose size={19} />
          )}
          <span>{sidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}</span>
        </button>
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
                disabled={!canGoBack}
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
            <p>{routeMatch.route.subtitle}</p>
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

        {env.environmentBanner.bannerVisible && (
          <div
            className={`environment-banner tone-${env.environmentBanner.tone}`}
            role="status"
          >
            <strong>{env.environmentBanner.labelTh}</strong>
            <span>{env.environmentBanner.descriptionTh}</span>
          </div>
        )}

        <div className="status-strip">
          <div className="status-documents">
            <Wallet size={18} />{" "}
            <strong>
              {allCards.length + walletExchange.documents.length} เอกสาร
            </strong>
          </div>
          <div className="interop-ok status-source">
            <Network size={18} />{" "}
            {activeUser.source === "trustcare_portal"
              ? "ผู้ใช้จาก TrustCare Portal"
              : "ผู้ใช้จาก Wallet นี้"}
          </div>
          <div className="status-holder">
            <Fingerprint size={18} />{" "}
            <strong>
              {shortDid(walletExchange.holderDid ?? activeUser.holderDid)}
            </strong>
          </div>
          <div
            className={`status-connectivity ${offlineWallet.isOnline ? "online" : "offline"}`}
          >
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
            className="status-export"
            onClick={() => exportResult(exportWalletObjects(storedObjects))}
          >
            <Download size={18} /> ส่งออกทั้งหมด
          </button>
          <button
            type="button"
            className="status-theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />} ธีม
          </button>
          <button
            type="button"
            className="status-language"
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

        {placeholderRouteId && (
          <RoutePlaceholderView
            routeId={placeholderRouteId}
            onNavigate={navigateTo}
          />
        )}
        {routeView === "home" && (
          <HomeView
            cards={allCards}
            user={activeUser}
            offlineOnline={offlineWallet.isOnline}
            onOpenCard={openRecord}
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
        {routeView === "documents" && (
          <RecordsV2View
            runtimeEnvironment={env.runtimeEnvironment}
            userId={selectedUserId}
            apiUrl={env.apiUrl}
            exchangeRecords={walletExchange.documents}
            exchangeLoading={walletExchange.initializing}
            exchangeError={walletExchange.error}
            onReloadExchange={() => void walletExchange.reload()}
            pendingShareCount={walletExchange.pendingSubmissions.length}
            onRecoverPendingShares={async () => {
              await walletExchange.recoverPendingSubmissions();
            }}
            defaultTargetHospitalCode={defaultPortalHospitalCode(
              activeUser.hospitalCode,
            )}
            onSubmitExchangeRecord={submitExchangeRecord}
            onRefreshExchangeSubmission={refreshExchangeSubmission}
            selectedRecordId={routeMatch.params.recordId}
            onOpenRecord={openV2Record}
            onCloseRecord={() => routerNavigate("/records")}
          />
        )}
        {routeView === "receive" && (
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
        {routeView === "share" && (
          <ShareView
            cards={allCards}
            user={activeUser}
            initialPurpose={readinessContext}
            initialSelectedCardIds={
              payerShareSelection?.context === readinessContext
                ? payerShareSelection.cardIds
                : undefined
            }
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
        {routeView === "prepare" && (
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
            onPrepareAll={(selectedCardIds) => {
              setPayerShareSelection(
                selectedCardIds?.length
                  ? { context: readinessContext, cardIds: selectedCardIds }
                  : null,
              );
              navigateTo("share");
            }}
            onRunPayerLifecycle={runActivePayerLifecycle}
            onRequestMissing={(requirements) =>
              openDocumentFlow("request", requirements)
            }
            onImportMissing={(requirements) =>
              openDocumentFlow("import", requirements)
            }
            onRefreshRequest={(request) =>
              void refreshDocumentRequest(request).catch(() => undefined)
            }
          />
        )}
        {routeView === "store" && (
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
        {routeView === "history" && (
          <Suspense fallback={<DialogLoadingFallback />}>
            <HistoryView history={history} scanHistory={scanHistory} />
          </Suspense>
        )}
        {routeView === "settings" && (
          <Suspense fallback={<DialogLoadingFallback />}>
            <SettingsView
              webAuthn={webAuthn}
              theme={theme}
              setTheme={setTheme}
              developerMode={developerMode}
              setDeveloperMode={setDeveloperMode}
              user={activeUser}
            />
          </Suspense>
        )}
      </section>

      <Suspense fallback={<DialogLoadingFallback />}>
        {detailOpen && selectedCard ? (
          <CredentialDetailDialog
            card={selectedCard}
            open={detailOpen}
            onClose={closeCredentialInspector}
            onShare={shareCredentialFromInspector}
          />
        ) : null}
      </Suspense>

      {documentFlow && (
        <DocumentFlowDialog
          mode={documentFlow.mode}
          user={activeUser}
          context={readinessContext}
          requirements={documentFlow.requirements}
          errorMessage={documentFlowError}
          onClose={() => {
            setDocumentFlow(null);
            setDocumentFlowError("");
          }}
          onSubmit={(draft) => {
            setDocumentFlowError("");
            void submitDocumentFlow(draft, documentFlow.mode).catch((error) => {
              const message = friendlyWalletRuntimeError(
                error,
                "ส่งคำขอเอกสารไม่สำเร็จ",
              );
              setLastImportMessage(message);
              setDocumentFlowError(message);
            });
          }}
        />
      )}

      <nav className="bottom-nav">
        <AppPrimaryNavigation
          compact
          routeId={routeMatch.route.id}
          routeView={view}
          onNavigate={navigateTo}
          onOpenDocuments={() => openDocumentsHub("cards")}
        />
      </nav>

      <Suspense fallback={<DialogLoadingFallback />}>
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

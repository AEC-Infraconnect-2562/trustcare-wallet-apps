import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import QRCode from "qrcode";
import {
  Activity,
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
  FilePlus2,
  Globe2,
  History,
  Image,
  KeyRound,
  Languages,
  Layers3,
  Moon,
  Network,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Upload,
  Wallet
} from "lucide-react";
import { shlApi, verifierApi, walletApi } from "@trustcare/api-client";
import { useLanguage } from "@trustcare/i18n/src/provider.web";
import { Badge, Button, Surface, WalletCardView } from "@trustcare/ui-web";
import {
  buildPortalInteroperabilityFixtures,
  countCardsByCategory,
  demoPatient,
  exportWalletObject,
  exportWalletObjects,
  flattenCardsByCategory,
  getDemoUser,
  importWalletExchange,
  mergeWalletObjects,
  readinessContextLabels,
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
  type WalletCard,
  type WalletCardsByCategory,
  type WalletDocumentRequest,
  type WalletDemoUser,
  type WalletExportResult,
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

type View = "wallet" | "share" | "prepare" | "store" | "history" | "settings";
type StoreFilter = "all" | "vc" | "vp" | "shl" | "oid" | "service";

const baseApiOptions = {
  url: env.apiUrl,
  demoMode: env.demoMode,
  demoOrigin: typeof window !== "undefined" ? window.location.origin : "https://trustcare.example.com"
};

export default function App() {
  const { lang, setLang, t } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<View>("wallet");
  const [selectedUserId, setSelectedUserId] = useState<string>(demoPatient.id);
  const [grouped, setGrouped] = useState<WalletCardsByCategory>({});
  const [history, setHistory] = useState<PresentationHistoryItem[]>([]);
  const [shlPackages, setShlPackages] = useState<ShlPackage[]>([]);
  const [selectedCard, setSelectedCard] = useState<WalletCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [serviceQrDataUrl, setServiceQrDataUrl] = useState("");
  const [presentation, setPresentation] = useState<WalletPresentationResponse | null>(null);
  const [verifierResult, setVerifierResult] = useState<VerifierResult | null>(null);
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
    setPresentation(null);
    setVerifierResult(null);
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

  const counts = useMemo(() => countCardsByCategory(grouped), [grouped]);
  const serviceObjects = useMemo(() => {
    const objects: WalletStoredObject[] = [];
    if (servicePacket) objects.push(walletObjectFromServicePacket(servicePacket));
    if (checkinQr) objects.push(walletObjectFromServicePacket(checkinQr));
    if (serviceBundle) {
      objects.push({
        id: `service_bundle:${serviceBundle.bundleId}`,
        type: "document_reference",
        title: "Service Bundle Envelope",
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

  const storedObjects = useMemo(
    () => mergeWalletObjects(
      walletObjectsFromCards(allCards),
      walletObjectsFromHistory(history),
      walletObjectsFromShl(shlPackages),
      serviceObjects,
      storedExtras
    ),
    [allCards, history, serviceObjects, shlPackages, storedExtras]
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

  const generateQr = useCallback(async (fields: string[] = []) => {
    if (!selectedCard) return;
    if (selectedCard.credentialStatus !== "active") {
      alert("Credential นี้ไม่ได้อยู่ในสถานะ active");
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
    setPresentation(result);
    const nextQr = await QRCode.toDataURL(result.qrData, { margin: 1, width: 260 });
    setQrDataUrl(nextQr);
    await offlineWallet.cacheQr(selectedCard.id, result.qrData, result.presentationId, result.expiresAt);
    setSelectiveOpen(false);
  }, [apiOptions, offlineWallet, selectedCard, webAuthn]);

  const importPayload = useCallback((value: string) => {
    const result = importWalletExchange(value, allCards);
    if (result.object) addStoredObject(result.object);
    setLastImportMessage(result.ok ? `Imported ${result.format}${result.matchedCredentialIds?.length ? ` / matched ${result.matchedCredentialIds.length}` : ""}` : result.errors.join(", "));
    return result;
  }, [addStoredObject, allCards]);

  const verifyScan = useCallback(async (value: string) => {
    const imported = importPayload(value);
    const result = await verifierApi.verifyQr(apiOptions, value);
    setVerifierResult({ ...result, matchedCredentialIds: imported.matchedCredentialIds ?? result.matchedCredentialIds });
    setView("share");
  }, [apiOptions, importPayload]);

  const buildBundle = useCallback(async () => {
    const result = await walletApi.buildServiceBundle(apiOptions, {
      context: readinessContext,
      patientId: activeUser.patientId,
      audience: "patient",
      receiver: "TrustCare compatible hospital"
    });
    setServiceBundle(result);
    setLastImportMessage(`Service bundle ${result.bundleId} created and stored.`);
  }, [activeUser.patientId, apiOptions, readinessContext]);

  const buildPacket = useCallback(async () => {
    const result = await walletApi.buildServicePacket(apiOptions, {
      context: readinessContext,
      patientId: activeUser.patientId,
      consentAttested: true,
      receiverName: "TrustCare compatible hospital",
      selectedCardIds: readiness?.readiness?.selectedCardIds,
      validMinutes: 1440
    });
    setServicePacket(result);
    setServiceQrDataUrl(await QRCode.toDataURL(result.qrData, { margin: 1, width: 220 }));
    setLastImportMessage(`Service VP ${result.presentationId} created.`);
  }, [activeUser.patientId, apiOptions, readiness, readinessContext]);

  const buildCheckinQr = useCallback(async () => {
    const result = await walletApi.generateCheckinQR(apiOptions, {
      context: readinessContext,
      patientId: activeUser.patientId,
      consentAttested: true,
      selectedCardIds: readiness?.readiness?.selectedCardIds
    });
    setCheckinQr(result);
    setServiceQrDataUrl(await QRCode.toDataURL(result.qrPayload, { margin: 1, width: 220 }));
    setLastImportMessage(`Check-in SHL ${result.shlId} created.`);
  }, [activeUser.patientId, apiOptions, readiness, readinessContext]);

  const importMissing = useCallback(async () => {
    const missing = readiness?.readiness?.missing?.[0];
    const result = await walletApi.importForService(apiOptions, {
      context: readinessContext,
      patientId: activeUser.patientId,
      documentType: missing?.key ?? "patient_summary",
      sourceType: "patient_upload"
    });
    setImportJob(result);
    addStoredObject({
      id: `import_job:${result.importId}`,
      type: "document_reference",
      title: "Imported Service Document",
      subtitle: result.documentType ?? result.sourceType,
      status: result.status,
      protocol: "trustcare",
      createdAt: new Date().toISOString(),
      payload: result
    });
    setLastImportMessage(`Import job ${result.importId} created.`);
  }, [activeUser.patientId, addStoredObject, apiOptions, readiness, readinessContext]);

  const requestMissing = useCallback(async () => {
    const missing = readiness?.readiness?.missing?.[0];
    const result = await walletApi.requestDocument(apiOptions, {
      context: readinessContext,
      documentType: missing?.key ?? "patient_summary",
      sourceType: "hospital",
      patientId: activeUser.patientId
    });
    setLastImportMessage(`Document request ${(result as any).requestId ?? (result as any).id} created.`);
  }, [activeUser.patientId, apiOptions, readiness, readinessContext]);

  const exportResult = useCallback((result: WalletExportResult) => {
    downloadExport(result);
    setLastImportMessage(`Exported ${result.fileName}`);
  }, []);

  const title =
    view === "wallet" ? "Partner Wallet" :
    view === "share" ? "Verifier & VP" :
    view === "prepare" ? "Service Readiness" :
    view === "store" ? "Credential Store" :
    view === "history" ? "Activity" :
    "Settings";

  return (
    <main className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <div className="brand-mark">PX</div>
          <div className="brand-copy">
            <strong>Partner Wallet</strong>
            <small>External simulator</small>
          </div>
        </div>
        <nav>
          <NavButton active={view === "wallet"} icon={<Wallet />} label="Wallet" onClick={() => setView("wallet")} />
          <NavButton active={view === "share"} icon={<QrCode />} label="Verify" onClick={() => setView("share")} />
          <NavButton active={view === "prepare"} icon={<Activity />} label="Prepare" onClick={() => setView("prepare")} />
          <NavButton active={view === "store"} icon={<Database />} label="Store" onClick={() => setView("store")} />
          <NavButton active={view === "history"} icon={<History />} label="Activity" onClick={() => setView("history")} />
          <NavButton active={view === "settings"} icon={<Settings />} label="Settings" onClick={() => setView("settings")} />
        </nav>
        <UserScopePanel activeUser={activeUser} users={walletDemoUsers} onChange={setSelectedUserId} />
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p>External partner wallet for TrustCare Portal interoperability</p>
          </div>
          <div className="topbar-actions">
            <button className="round-action" aria-label="notification"><Bell size={22} /></button>
            <button className="round-action avatar user-photo" aria-label="profile">
              <img src={resolveAvatarUrl(activeUser.avatarUrl)} alt={activeUser.nameEn} />
            </button>
          </div>
        </header>

        <div className="status-strip">
          <div><Wallet size={18} /> <strong>{allCards.length} credentials</strong></div>
          <div className="interop-ok"><Network size={18} /> {activeUser.source === "trustcare_portal" ? "Portal user" : "Wallet-native user"}</div>
          <div><Fingerprint size={18} /> <strong>{shortDid(activeUser.holderDid)}</strong></div>
          <div className={offlineWallet.isOnline ? "online" : "offline"}>{offlineWallet.isOnline ? t("wallet.online") : t("wallet.offline")}</div>
          <button type="button" onClick={() => setScannerOpen(true)}><Camera size={18} /> {t("wallet.scanQr")}</button>
          <button type="button" onClick={() => exportResult(exportWalletObjects(storedObjects))}><Download size={18} /> Export All</button>
          <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />} Theme</button>
          <button type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}><Languages size={18} /> {lang.toUpperCase()}</button>
        </div>

        {lastImportMessage && <div className="toast-line">{lastImportMessage}</div>}

        {view === "wallet" && (
          <WalletView
            cards={allCards}
            counts={counts}
            user={activeUser}
            fixtures={interopFixtures}
            onImportFixture={value => {
              importPayload(value);
              setView("store");
            }}
            onCopyFixture={(label, value) => {
              void copyText(value);
              setLastImportMessage(`${label} copied for ${activeUser.nameEn}.`);
            }}
            onOpenCard={card => {
              setSelectedCard(card);
              setQrDataUrl("");
              setPresentation(null);
              setDetailOpen(true);
            }}
          />
        )}
        {view === "share" && (
          <ShareView
            shlPackages={shlPackages}
            verifierResult={verifierResult}
            onOpenScanner={() => setScannerOpen(true)}
            onVerifyText={value => void verifyScan(value)}
            onExport={exportResult}
          />
        )}
        {view === "prepare" && (
          <PrepareView
            context={readinessContext}
            readiness={readiness}
            contractHub={contractHub}
            workbench={prepareWorkbench}
            requests={documentRequests}
            serviceBundle={serviceBundle}
            servicePacket={servicePacket}
            checkinQr={checkinQr}
            importJob={importJob}
            qrDataUrl={serviceQrDataUrl}
            onContext={setReadinessContext}
            onBuildBundle={() => void buildBundle()}
            onBuildPacket={() => void buildPacket()}
            onCheckinQr={() => void buildCheckinQr()}
            onRequestMissing={() => void requestMissing()}
            onImportMissing={() => void importMissing()}
          />
        )}
        {view === "store" && (
          <StoreView
            objects={filteredObjects}
            allObjects={storedObjects}
            filter={storeFilter}
            onFilter={setStoreFilter}
            onImport={importPayload}
            onExport={exportResult}
          />
        )}
        {view === "history" && <HistoryView history={history} />}
        {view === "settings" && (
          <SettingsView
            webAuthn={webAuthn}
            theme={theme}
            setTheme={setTheme}
            user={activeUser}
          />
        )}
      </section>

      <nav className="bottom-nav">
        <NavButton active={view === "wallet"} icon={<Wallet />} label="Wallet" onClick={() => setView("wallet")} />
        <NavButton active={view === "share"} icon={<QrCode />} label="Verify" onClick={() => setView("share")} />
        <NavButton active={view === "prepare"} icon={<Activity />} label="Prepare" onClick={() => setView("prepare")} />
        <NavButton active={view === "store"} icon={<Database />} label="Store" onClick={() => setView("store")} />
        <NavButton active={view === "history"} icon={<History />} label="Activity" onClick={() => setView("history")} />
        <NavButton active={view === "settings"} icon={<Settings />} label="Settings" onClick={() => setView("settings")} />
      </nav>

      <CredentialDetailDialog
        card={selectedCard}
        open={detailOpen}
        qrDataUrl={qrDataUrl}
        presentation={presentation}
        history={history}
        onClose={() => setDetailOpen(false)}
        onGenerateQr={() => void generateQr()}
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

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactElement; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function UserScopePanel({ activeUser, users, onChange }: { activeUser: WalletDemoUser; users: WalletDemoUser[]; onChange: (userId: string) => void }) {
  return (
    <section className="user-scope-panel">
      <div className="user-scope-card">
        <img src={resolveAvatarUrl(activeUser.avatarUrl)} alt={activeUser.nameEn} />
        <div>
          <strong>{activeUser.nameTh}</strong>
          <small>{activeUser.sourceLabel}</small>
        </div>
      </div>
      <label>
        Test login
        <select value={activeUser.id} onChange={event => onChange(event.target.value)}>
          <optgroup label="TrustCare Portal users">
            {users.filter(user => user.source === "trustcare_portal").map(user => (
              <option key={user.id} value={user.id}>{user.nameTh} · {user.role}</option>
            ))}
          </optgroup>
          <optgroup label="Wallet-native users">
            {users.filter(user => user.source === "partner_wallet").map(user => (
              <option key={user.id} value={user.id}>{user.nameTh}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <p>{activeUser.avatarSource === "trustcare_portal" ? "Photo source: original TrustCare Portal asset." : "Photo source: synthetic wallet-native seed."}</p>
    </section>
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
    { icon: <Cloud size={18} />, label: "TrustCare Portal", value: user.source === "trustcare_portal" ? "Imported" : "Link test", detail: user.sourceLabel },
    { icon: <Layers3 size={18} />, label: "Contract Hub", value: "Ready", detail: "Prepare-for-service mapping" },
    { icon: <KeyRound size={18} />, label: "OID4VCI / OID4VP", value: "Enabled", detail: "Offer import + VP request" },
    { icon: <BadgeCheck size={18} />, label: "SHL / VC-VP Store", value: "Available", detail: "Portable objects" }
  ];

  return (
    <div className="view-stack">
      <section className="partner-overview">
        <div className="partner-copy">
          <span className="eyebrow">External Partner Wallet</span>
          <h2>{user.nameEn}</h2>
          <p>{user.sourceLabel} · {user.hospitalName}</p>
          <div className="scope-grid" aria-label="Active wallet scope">
            <span><small>User</small><strong>{user.id}</strong></span>
            <span><small>Holder DID</small><strong>{shortDid(user.holderDid)}</strong></span>
            <span><small>Patient ID</small><strong>{user.patientId}</strong></span>
          </div>
          <div className="chip-row">
            <span>{user.source === "trustcare_portal" ? "Portal imported" : "Wallet native"}</span>
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
            <h2>Interop payloads</h2>
            <p>{user.id} · OID4VCI, OID4VP and SHL payloads are generated from this active scope.</p>
          </div>
          <Badge tone={user.source === "trustcare_portal" ? "green" : "blue"}>{user.sourceLabel}</Badge>
        </div>
        <div className="fixture-grid">
          <button type="button" onClick={() => onImportFixture(fixtures.credentialOfferUrl)}>
            <KeyRound size={18} />
            <span><strong>Import OID4VCI</strong><small>{fixtures.counts.cards} credential offer</small></span>
          </button>
          <button type="button" onClick={() => onImportFixture(fixtures.presentationRequestUrl)}>
            <QrCode size={18} />
            <span><strong>Import OID4VP</strong><small>request matches active cards</small></span>
          </button>
          <button type="button" onClick={() => onCopyFixture("OID4VP request", fixtures.presentationRequestUrl)}>
            <Copy size={18} />
            <span><strong>Copy VP Request</strong><small>paste into scanner/import</small></span>
          </button>
          <button type="button" disabled={!fixtures.shlQrPayload} onClick={() => fixtures.shlQrPayload && onCopyFixture("SHL payload", fixtures.shlQrPayload)}>
            <Network size={18} />
            <span><strong>Copy SHL</strong><small>{fixtures.shlQrPayload ? "ready" : "not available for staff"}</small></span>
          </button>
        </div>
      </Surface>
      <div className="metric-grid compact">
        <Surface><Wallet size={20} /><strong>{cards.length}</strong><span>Total credentials</span></Surface>
        <Surface><Shield size={20} /><strong>{readyCount}</strong><span>Presentation ready</span></Surface>
        <Surface><CheckCircle2 size={20} /><strong>{counts.identity_and_access ?? 0}</strong><span>Identity</span></Surface>
        <Surface><RefreshCw size={20} /><strong>{counts.sharing_and_sync ?? 0}</strong><span>SHL / Sync</span></Surface>
      </div>
      <section className="credential-section">
        <div className="section-title-row">
          <div>
            <h2>Credentials</h2>
            <p>เลือกเอกสารเพื่อสร้าง VP, QR, selective disclosure หรือ export ไปยัง partner flow</p>
          </div>
          <Badge tone="blue">{readyCount} ready</Badge>
        </div>
        <div className="cards-grid wallet-grid">
          {cards.map(card => <WalletCardView key={card.id} card={card} onClick={() => onOpenCard(card)} />)}
        </div>
      </section>
    </div>
  );
}

function ShareView({ shlPackages, verifierResult, onOpenScanner, onVerifyText, onExport }: {
  shlPackages: ShlPackage[];
  verifierResult: VerifierResult | null;
  onOpenScanner: () => void;
  onVerifyText: (value: string) => void;
  onExport: (result: WalletExportResult) => void;
}) {
  const [mode, setMode] = useState<"full" | "sd" | "zkp">("full");
  const [credentialInput, setCredentialInput] = useState("");
  const [requestType, setRequestType] = useState("PatientSummaryCredential");
  const [requestQrDataUrl, setRequestQrDataUrl] = useState("");
  const [requestPayload, setRequestPayload] = useState("");

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
    setRequestQrDataUrl(await QRCode.toDataURL(`openid4vp://?request=${encodeURIComponent(payload)}`, { margin: 1, width: 220 }));
  }, [requestType]);

  return (
    <div className="view-stack">
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
                <button type="button" onClick={() => void copyText(requestPayload)} className="link-button">Copy OID4VP request</button>
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
              <Badge tone={shl.status === "active" ? "green" : "yellow"}>{shl.status}</Badge>
              <h3>{shl.label}</h3>
              <p>{shl.purpose} / {shl.context}</p>
              <ul>
                {shlAccessSummary(shl).map(line => <li key={line}>{line}</li>)}
              </ul>
              <dl className="details-grid compact">
                <div><dt>Manifest VC</dt><dd className="mono">{shl.manifestCredentialId ?? "-"}</dd></div>
                <div><dt>Holder VP</dt><dd className="mono">{shl.presentationId ?? "-"}</dd></div>
              </dl>
              {stored && <Button className="secondary" onClick={() => onExport(exportWalletObject(stored))}><Download size={18} /> Export SHL</Button>}
            </Surface>
          );
        })}
      </section>
    </div>
  );
}

function PrepareView({ context, readiness, contractHub, workbench, requests, serviceBundle, servicePacket, checkinQr, importJob, qrDataUrl, onContext, onBuildBundle, onBuildPacket, onCheckinQr, onRequestMissing, onImportMissing }: {
  context: ReadinessContext;
  readiness: any;
  contractHub: ContractHubCatalog | null;
  workbench: any;
  requests: WalletDocumentRequest[];
  serviceBundle: ServiceBundleEnvelope | null;
  servicePacket: ServicePacketResponse | null;
  checkinQr: CheckinQrResponse | null;
  importJob: WalletImportJob | null;
  qrDataUrl: string;
  onContext: (context: ReadinessContext) => void;
  onBuildBundle: () => void;
  onBuildPacket: () => void;
  onCheckinQr: () => void;
  onRequestMissing: () => void;
  onImportMissing: () => void;
}) {
  const activeContract = contractHub?.contracts.find(item => item.context === context);
  const missing = readiness?.readiness?.missing ?? [];
  const ready = readiness?.readiness?.ready ?? [];
  return (
    <div className="view-stack">
      <Surface>
        <div className="section-title-row">
          <div>
            <h2>Service Readiness Contract</h2>
            <p>{activeContract?.patientLabel ?? readinessContextLabels[context].th}</p>
          </div>
          <Badge tone="blue">Contract Hub {contractHub?.version ?? "demo"}</Badge>
        </div>
        <div className="segmented">
          {(Object.keys(readinessContextLabels) as ReadinessContext[]).map(key => (
            <button key={key} className={context === key ? "active" : ""} onClick={() => onContext(key)}>
              {readinessContextLabels[key].th}
            </button>
          ))}
        </div>
      </Surface>

      <Surface className="readiness-card">
        <div className="readiness-score">{readiness?.readiness?.score ?? 0}%</div>
        <div>
          <h3>{readiness?.readiness?.criticalReady ? "พร้อมสร้าง Service VP Packet" : "ยังขาดเอกสารสำคัญ"}</h3>
          <p>Required {readiness?.readiness?.requiredReady ?? 0}/{readiness?.readiness?.requiredTotal ?? 0} / Recommended {readiness?.readiness?.recommendedReady ?? 0}/{readiness?.readiness?.recommendedTotal ?? 0}</p>
          <p>{activeContract?.patientDirection}</p>
        </div>
        <Button onClick={onRequestMissing}><FilePlus2 size={18} /> ขอเอกสารที่ขาด</Button>
        <Button className="secondary" onClick={onImportMissing}><Upload size={18} /> Import เอกสาร</Button>
      </Surface>

      <div className="prepare-grid">
        <Surface>
          <h3>Ready VC</h3>
          <div className="pill-list">
            {ready.map((item: any) => <Badge key={item.key} tone="green">{item.label}</Badge>)}
            {!ready.length && <span className="muted">ยังไม่มีเอกสารที่ตรง contract</span>}
          </div>
        </Surface>
        <Surface>
          <h3>Missing / Request</h3>
          <div className="pill-list">
            {missing.map((item: any) => <Badge key={item.key} tone={item.required ? "red" : "yellow"}>{item.label}</Badge>)}
            {!missing.length && <Badge tone="green">ครบถ้วน</Badge>}
          </div>
        </Surface>
        <Surface>
          <h3>Contract Actions</h3>
          <div className="action-stack">
            <Button onClick={onBuildBundle}><Layers3 size={18} /> Build Service Bundle</Button>
            <Button className="purple" onClick={onBuildPacket}><Send size={18} /> สร้าง Service VP</Button>
            <Button className="green" onClick={onCheckinQr}><QrCode size={18} /> สร้าง Check-in SHL QR</Button>
          </div>
        </Surface>
      </div>

      <div className="prepare-grid wide">
        <PacketPreview title="Service Bundle" data={serviceBundle} />
        <PacketPreview title="Service VP Packet" data={servicePacket} />
        <PacketPreview title="Check-in SHL" data={checkinQr} qrDataUrl={qrDataUrl} />
      </div>

      <div className="prepare-grid">
        <Surface>
          <h3>Document Requests</h3>
          <p>{requests.length ? `${requests.length} active request(s)` : "ไม่มี request ค้างอยู่"}</p>
        </Surface>
        <Surface>
          <h3>Import Job</h3>
          <p className="mono">{importJob ? `${importJob.importId} / ${importJob.status}` : "ยังไม่มี import job"}</p>
        </Surface>
        <Surface>
          <h3>Workbench</h3>
          <p>{workbench?.tasks?.length ?? workbench?.actions?.length ?? 0} task(s) from Contract Hub</p>
        </Surface>
      </div>
    </div>
  );
}

function StoreView({ objects, allObjects, filter, onFilter, onImport, onExport }: {
  objects: WalletStoredObject[];
  allObjects: WalletStoredObject[];
  filter: StoreFilter;
  onFilter: (filter: StoreFilter) => void;
  onImport: (value: string) => unknown;
  onExport: (result: WalletExportResult) => void;
}) {
  const [payload, setPayload] = useState("");
  return (
    <div className="view-stack">
      <Surface className="share-command">
        <div>
          <h2>VC/VP/SHL Store</h2>
          <p>เก็บ VC, VP, SHL, service packets, OID4VCI offers และ OID4VP requests ใน wallet เดียว</p>
        </div>
        <Button onClick={() => onExport(exportWalletObjects(allObjects))}><Download size={18} /> Export Wallet</Button>
      </Surface>

      <Surface>
        <h3>Import SHL / VC / VP / OID4VC</h3>
        <div className="import-panel">
          <textarea value={payload} onChange={event => setPayload(event.target.value)} placeholder="Paste shlink:/..., OID4VCI offer, OID4VP request, VC/VP JSON, JWT, or verifier URL" />
          <Button onClick={() => {
            onImport(payload);
            setPayload("");
          }} disabled={!payload.trim()}><FileJson size={18} /> Import</Button>
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
            </div>
            <h3>{object.title}</h3>
            <p>{object.subtitle ?? object.source ?? object.id}</p>
            <small>{new Date(object.createdAt).toLocaleString("th-TH")}</small>
            <div className="object-actions">
              <Button className="secondary" onClick={() => void copyText(JSON.stringify(object.payload, null, 2))}><Copy size={18} /> Copy</Button>
              <Button onClick={() => onExport(exportWalletObject(object))}><Download size={18} /> Export</Button>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

function PacketPreview({ title, data, qrDataUrl }: { title: string; data: unknown; qrDataUrl?: string }) {
  return (
    <Surface className="packet-preview">
      <h3>{title}</h3>
      {qrDataUrl && <div className="qr-inline"><img src={qrDataUrl} alt={`${title} QR`} /></div>}
      <pre className="payload">{data ? JSON.stringify(data, null, 2) : "ยังไม่ได้สร้าง"}</pre>
    </Surface>
  );
}

function HistoryView({ history }: { history: PresentationHistoryItem[] }) {
  return (
    <div className="history-list large">
      {history.map(item => (
        <Surface className="history-row" key={item.id}>
          <History size={22} />
          <span><strong>{item.verifierName}</strong><small>{item.presentedAt ? new Date(item.presentedAt).toLocaleString("th-TH") : item.purpose}</small></span>
          <Badge tone={item.verificationResult === "valid" ? "green" : "neutral"}>{item.verificationResult ?? "recorded"}</Badge>
        </Surface>
      ))}
    </div>
  );
}

function SettingsView({ webAuthn, theme, setTheme, user }: { webAuthn: ReturnType<typeof useWebAuthn>; theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void; user: WalletDemoUser }) {
  return (
    <div className="settings-grid">
      <Surface>
        <Smartphone size={28} />
        <h3>Mobile Wallet Ready</h3>
        <p>รองรับ SecureStore, SQLite, LocalAuthentication, Camera QR, SHL และ VC/VP import-export ใน Expo app</p>
      </Surface>
      <Surface>
        <Shield size={28} />
        <h3>Biometric</h3>
        <p>{webAuthn.isRegistered ? "เปิดการยืนยันก่อนแสดง QR แล้ว" : "ยังไม่ได้ตั้งค่า biometric gate"}</p>
        <Button onClick={() => webAuthn.isRegistered ? webAuthn.unregister() : void webAuthn.register(String(user.patientId), user.nameTh)}>
          {webAuthn.isRegistered ? "ปิด Biometric" : "ตั้งค่า Biometric"}
        </Button>
      </Surface>
      <Surface>
        <Globe2 size={28} />
        <h3>Theme</h3>
        <Button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "Dark mode" : "Light mode"}</Button>
      </Surface>
    </div>
  );
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
  await navigator.clipboard?.writeText(value);
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

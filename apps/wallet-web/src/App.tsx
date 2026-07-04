import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Activity,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  FilePlus2,
  Globe2,
  History,
  Languages,
  Moon,
  QrCode,
  RefreshCw,
  Settings,
  Shield,
  Smartphone,
  Sun,
  Upload,
  Wallet
} from "lucide-react";
import { shlApi, verifierApi, walletApi } from "@trustcare/api-client";
import { useLanguage } from "@trustcare/i18n/src/provider.web";
import { Badge, Button, Surface, WalletCardView } from "@trustcare/ui-web";
import {
  countCardsByCategory,
  demoPatient,
  flattenCardsByCategory,
  readinessContextLabels,
  shlAccessSummary,
  type PresentationHistoryItem,
  type ReadinessContext,
  type ShlPackage,
  type WalletCard,
  type WalletCardsByCategory,
  type WalletPresentationResponse,
  type VerifierResult
} from "@trustcare/wallet-core";
import { env } from "./env";
import { useOfflineWallet } from "./hooks/useOfflineWallet";
import { useWebAuthn } from "./hooks/useWebAuthn";
import { CredentialDetailDialog } from "./components/CredentialDetailDialog";
import { QrScannerDialog } from "./components/QrScannerDialog";
import { SelectiveDisclosureDialog } from "./components/SelectiveDisclosureDialog";

type View = "wallet" | "share" | "prepare" | "history" | "settings";

const apiOptions = {
  url: env.apiUrl,
  demoMode: env.demoMode,
  demoOrigin: typeof window !== "undefined" ? window.location.origin : "https://trustcare.example.com"
};

export default function App() {
  const { lang, setLang, t } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<View>("wallet");
  const [grouped, setGrouped] = useState<WalletCardsByCategory>({});
  const [history, setHistory] = useState<PresentationHistoryItem[]>([]);
  const [shlPackages, setShlPackages] = useState<ShlPackage[]>([]);
  const [selectedCard, setSelectedCard] = useState<WalletCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [presentation, setPresentation] = useState<WalletPresentationResponse | null>(null);
  const [verifierResult, setVerifierResult] = useState<VerifierResult | null>(null);
  const [readinessContext, setReadinessContext] = useState<ReadinessContext>("opd_visit");
  const [readiness, setReadiness] = useState<any>(null);
  const offlineWallet = useOfflineWallet();
  const webAuthn = useWebAuthn();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    void Promise.all([
      walletApi.cardsByCategory(apiOptions),
      walletApi.history(apiOptions),
      shlApi.listShl(apiOptions)
    ]).then(([cards, walletHistory, shl]) => {
      setGrouped(cards);
      setHistory(walletHistory);
      setShlPackages(shl);
      void offlineWallet.syncCards(flattenCardsByCategory(cards));
    });
  }, []);

  useEffect(() => {
    void walletApi.readiness(apiOptions, { context: readinessContext }).then(setReadiness);
  }, [readinessContext]);

  const allCards = useMemo(() => {
    const online = flattenCardsByCategory(grouped);
    return online.length ? online : offlineWallet.offlineCards;
  }, [grouped, offlineWallet.offlineCards]);
  const counts = useMemo(() => countCardsByCategory(grouped), [grouped]);

  const generateQr = useCallback(async (fields: string[] = []) => {
    if (!selectedCard) return;
    if (selectedCard.credentialStatus !== "active") {
      alert("Credential นี้ไม่อยู่ในสถานะ active");
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
  }, [offlineWallet, selectedCard, webAuthn]);

  const verifyScan = useCallback(async (value: string) => {
    const result = await verifierApi.verifyQr(apiOptions, value);
    setVerifierResult(result);
    setView("share");
  }, []);

  return (
    <main className="app-shell">
      <aside className="side-nav">
        <div className="brand-mark">TC</div>
        <strong>TrustCare Wallet</strong>
        <nav>
          <NavButton active={view === "wallet"} icon={<Wallet />} label="กระเป๋า" onClick={() => setView("wallet")} />
          <NavButton active={view === "share"} icon={<QrCode />} label="แชร์/สแกน" onClick={() => setView("share")} />
          <NavButton active={view === "prepare"} icon={<Activity />} label="เตรียมบริการ" onClick={() => setView("prepare")} />
          <NavButton active={view === "history"} icon={<History />} label="ประวัติ" onClick={() => setView("history")} />
          <NavButton active={view === "settings"} icon={<Settings />} label="ตั้งค่า" onClick={() => setView("settings")} />
        </nav>
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div>
            <h1>{view === "wallet" ? t("wallet.title") : view === "share" ? "แชร์และตรวจสอบ VP" : view === "prepare" ? "เตรียมเข้ารับบริการ" : view === "history" ? "ประวัติการใช้งาน" : "ตั้งค่า"}</h1>
            <p>{demoPatient.nameTh}</p>
          </div>
          <div className="topbar-actions">
            <button className="round-action" aria-label="notification"><Bell size={22} /></button>
            <button className="round-action avatar" aria-label="profile">{demoPatient.initials}</button>
          </div>
        </header>

        <div className="status-strip">
          <div><Wallet size={22} /> <strong>{allCards.length} เอกสาร</strong></div>
          <div className={offlineWallet.isOnline ? "online" : "offline"}>{offlineWallet.isOnline ? t("wallet.online") : t("wallet.offline")}</div>
          <button type="button" onClick={() => setScannerOpen(true)}><Camera size={18} /> {t("wallet.scanQr")}</button>
          <button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />} Theme</button>
          <button type="button" onClick={() => setLang(lang === "th" ? "en" : "th")}><Languages size={18} /> {lang.toUpperCase()}</button>
        </div>

        {view === "wallet" && (
          <WalletView
            cards={allCards}
            counts={counts}
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
          />
        )}
        {view === "prepare" && (
          <PrepareView
            context={readinessContext}
            readiness={readiness}
            onContext={setReadinessContext}
          />
        )}
        {view === "history" && <HistoryView history={history} />}
        {view === "settings" && (
          <SettingsView
            webAuthn={webAuthn}
            theme={theme}
            setTheme={setTheme}
          />
        )}
      </section>

      <nav className="bottom-nav">
        <NavButton active={view === "wallet"} icon={<Wallet />} label="กระเป๋า" onClick={() => setView("wallet")} />
        <NavButton active={view === "share"} icon={<QrCode />} label="แชร์" onClick={() => setView("share")} />
        <NavButton active={view === "history"} icon={<Clock />} label="กิจกรรม" onClick={() => setView("history")} />
        <NavButton active={view === "settings"} icon={<Settings />} label="ตั้งค่า" onClick={() => setView("settings")} />
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

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactElement; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function WalletView({ cards, counts, onOpenCard }: { cards: WalletCard[]; counts: Record<string, number>; onOpenCard: (card: WalletCard) => void }) {
  return (
    <div className="view-stack">
      <section className="wallet-hero">
        <div>
          <h2>กระเป๋า VC</h2>
          <p>เอกสารสุขภาพที่ตรวจสอบได้และพร้อมแสดงให้หน่วยบริการ</p>
        </div>
        <div className="hero-stat"><strong>{cards.length}</strong><span>เอกสารพร้อมใช้</span></div>
      </section>
      <div className="metric-grid">
        <Surface><Wallet size={22} /><strong>{counts.identity_and_access ?? 0}</strong><span>Identity</span></Surface>
        <Surface><Shield size={22} /><strong>{counts.clinical_summary ?? 0}</strong><span>Clinical</span></Surface>
        <Surface><RefreshCw size={22} /><strong>{counts.sharing_and_sync ?? 0}</strong><span>SHL / Sync</span></Surface>
      </div>
      <div className="cards-grid">
        {cards.map(card => <WalletCardView key={card.id} card={card} onClick={() => onOpenCard(card)} />)}
      </div>
    </div>
  );
}

function ShareView({ shlPackages, verifierResult, onOpenScanner }: { shlPackages: ShlPackage[]; verifierResult: VerifierResult | null; onOpenScanner: () => void }) {
  return (
    <div className="view-stack">
      <Surface className="share-command">
        <div>
          <h2>สร้าง/ตรวจสอบ QR</h2>
          <p>รองรับ VP URL, presentation ID, JWT/JSON VC/VP และ SHL transport</p>
        </div>
        <Button onClick={onOpenScanner}><Camera size={18} /> สแกน QR Code</Button>
      </Surface>
      {verifierResult && (
        <Surface className="verification-result">
          <Badge tone={verifierResult.verified ? "green" : "red"}>{verifierResult.verified ? "Verified" : "Invalid"}</Badge>
          <h3>{verifierResult.issuer}</h3>
          <p>{verifierResult.holderDid}</p>
          {verifierResult.warnings?.map(item => <small key={item}>{item}</small>)}
          {verifierResult.errors?.map(item => <small className="error" key={item}>{item}</small>)}
        </Surface>
      )}
      <section className="shl-grid">
        {shlPackages.map(shl => (
          <Surface key={shl.id} className="shl-card">
            <Badge tone={shl.status === "active" ? "green" : "yellow"}>{shl.status}</Badge>
            <h3>{shl.label}</h3>
            <p>{shl.purpose} · {shl.context}</p>
            <ul>
              {shlAccessSummary(shl).map(line => <li key={line}>{line}</li>)}
            </ul>
            <dl className="details-grid compact">
              <div><dt>Manifest VC</dt><dd className="mono">{shl.manifestCredentialId ?? "-"}</dd></div>
              <div><dt>Holder VP</dt><dd className="mono">{shl.presentationId ?? "-"}</dd></div>
            </dl>
          </Surface>
        ))}
      </section>
    </div>
  );
}

function PrepareView({ context, readiness, onContext }: { context: ReadinessContext; readiness: any; onContext: (context: ReadinessContext) => void }) {
  return (
    <div className="view-stack">
      <Surface>
        <h2>Service Readiness</h2>
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
          <p>Required: {readiness?.readiness?.required?.join(", ")}</p>
          <p>Missing: {readiness?.readiness?.missing?.join(", ") || "ไม่มี"}</p>
        </div>
        <Button><FilePlus2 size={18} /> ขอเอกสารเพิ่ม</Button>
        <Button className="secondary"><Upload size={18} /> อัปโหลดเอกสาร</Button>
      </Surface>
    </div>
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

function SettingsView({ webAuthn, theme, setTheme }: { webAuthn: ReturnType<typeof useWebAuthn>; theme: "light" | "dark"; setTheme: (theme: "light" | "dark") => void }) {
  return (
    <div className="settings-grid">
      <Surface>
        <Smartphone size={28} />
        <h3>Mobile Wallet Ready</h3>
        <p>รองรับ SecureStore, SQLite, LocalAuthentication, Camera QR และ screen-capture protection ใน Expo app</p>
      </Surface>
      <Surface>
        <Shield size={28} />
        <h3>Biometric</h3>
        <p>{webAuthn.isRegistered ? "เปิดการยืนยันก่อนแสดง QR แล้ว" : "ยังไม่ได้ตั้งค่า biometric gate"}</p>
        <Button onClick={() => webAuthn.isRegistered ? webAuthn.unregister() : void webAuthn.register(String(demoPatient.id), demoPatient.nameTh)}>
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


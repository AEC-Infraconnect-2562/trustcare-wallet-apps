import type { ReactNode } from "react";
import {
  Download,
  History as HistoryIcon,
  KeyRound,
  Languages,
  Moon,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sun,
} from "lucide-react";
import { Badge, Surface } from "@trustcare/ui-web";
import type {
  PresentationHistoryItem,
  WalletDemoUser,
  WalletTestUserProfile,
} from "@trustcare/wallet-core";
import type { SandboxTestSession } from "../sandbox/sandboxTestSessionStore";
import type { useWebAuthn } from "../hooks/useWebAuthn";
import type { ScanOutcome } from "./appViewModel";
import { contextLabel, statusLabel } from "./appViewLabels";

export function HistoryView({
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
          <HistoryIcon size={22} />
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

function SettingsRow({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action: ReactNode;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-row-copy">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="settings-row-action">{action}</span>
    </div>
  );
}

export function SettingsView({
  webAuthn,
  theme,
  setTheme,
  lang,
  setLang,
  onExportAll,
  developerMode,
  setDeveloperMode,
  user,
  testProfile,
  testSession,
  testSessions,
}: {
  webAuthn: ReturnType<typeof useWebAuthn>;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  lang: string;
  setLang: (lang: "th" | "en") => void;
  onExportAll: () => void;
  developerMode: boolean;
  setDeveloperMode: (enabled: boolean) => void;
  user: WalletDemoUser;
  testProfile?: WalletTestUserProfile;
  testSession?: SandboxTestSession | null;
  testSessions?: SandboxTestSession[];
}) {
  return (
    <div className="settings-list">
      <section className="settings-group">
        <h3 className="settings-group-title">ความปลอดภัย</h3>
        <Surface className="settings-group-body">
          <SettingsRow
            icon={<ShieldCheck size={20} />}
            title="ยืนยันตัวตนก่อนแสดง QR"
            description={
              webAuthn.isRegistered
                ? "เปิดใช้งานอยู่ · ต้องยืนยันตัวตนทุกครั้งก่อนแชร์เอกสาร"
                : "ปิดอยู่ · แนะนำให้เปิดเพื่อป้องกันการแชร์โดยไม่ตั้งใจ"
            }
            action={
              <button
                type="button"
                role="switch"
                aria-checked={webAuthn.isRegistered}
                className={`settings-switch${webAuthn.isRegistered ? " is-on" : ""}`}
                onClick={() =>
                  webAuthn.isRegistered
                    ? webAuthn.unregister()
                    : void webAuthn.register(
                        String(user.patientId),
                        user.nameTh,
                      )
                }
              >
                <i aria-hidden="true" />
                {webAuthn.isRegistered ? "เปิด" : "ปิด"}
              </button>
            }
          />
        </Surface>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">การแสดงผล</h3>
        <Surface className="settings-group-body">
          <SettingsRow
            icon={theme === "light" ? <Sun size={20} /> : <Moon size={20} />}
            title="ธีม"
            description={theme === "light" ? "โหมดสว่าง" : "โหมดมืด"}
            action={
              <button
                type="button"
                className="settings-choice"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? "เปลี่ยนเป็นโหมดมืด" : "เปลี่ยนเป็นโหมดสว่าง"}
              </button>
            }
          />
          <SettingsRow
            icon={<Languages size={20} />}
            title="ภาษา"
            description={lang === "th" ? "ไทย" : "English"}
            action={
              <button
                type="button"
                className="settings-choice"
                onClick={() => setLang(lang === "th" ? "en" : "th")}
              >
                {lang === "th" ? "English" : "ไทย"}
              </button>
            }
          />
        </Surface>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">ข้อมูลของฉัน</h3>
        <Surface className="settings-group-body">
          <SettingsRow
            icon={<Download size={20} />}
            title="ส่งออกเอกสารทั้งหมด"
            description="ดาวน์โหลดสำเนาเอกสาร ประวัติ และลิงก์สุขภาพเก็บไว้เอง"
            action={
              <button
                type="button"
                className="settings-choice"
                onClick={onExportAll}
              >
                ส่งออก
              </button>
            }
          />
          <SettingsRow
            icon={<Smartphone size={20} />}
            title="ใช้งานบนมือถือ"
            description="TrustCare Wallet มีแอปมือถือ รองรับการสแกน QR และใช้งานออฟไลน์"
            action={<Badge tone="blue">พร้อมใช้งาน</Badge>}
          />
        </Surface>
      </section>

      <section className="settings-group">
        <h3 className="settings-group-title">สำหรับนักพัฒนา</h3>
        <Surface className="settings-group-body">
          <SettingsRow
            icon={<KeyRound size={20} />}
            title="โหมดนักพัฒนา"
            description="แสดงเครื่องมือทดสอบโปรโตคอลและข้อมูลทางเทคนิค"
            action={
              <button
                type="button"
                role="switch"
                aria-checked={developerMode}
                className={`settings-switch${developerMode ? " is-on" : ""}`}
                onClick={() => setDeveloperMode(!developerMode)}
              >
                <i aria-hidden="true" />
                {developerMode ? "เปิด" : "ปิด"}
              </button>
            }
          />
          {testProfile && testSession ? (
            <details className="settings-advanced">
              <summary>
                <HistoryIcon size={16} aria-hidden="true" /> รายละเอียด test
                session
              </summary>
              <p>
                Session นี้เก็บเฉพาะ metadata และ state ของการทดสอบ ไม่เก็บ
                token, password หรือ private key
              </p>
              <dl className="test-session-details">
                <dt>Session ID</dt>
                <dd>{testSession.id}</dd>
                <dt>Portal fixture</dt>
                <dd>{testProfile.portalFixtureOpenId ?? "external wallet"}</dd>
                <dt>Role scope</dt>
                <dd>
                  {testProfile.portalRole} · {testProfile.dataScope}
                </dd>
                <dt>Wallet Exchange</dt>
                <dd>{testSession.snapshot.walletExchangeState}</dd>
                <dt>เอกสาร / Store</dt>
                <dd>
                  {testSession.snapshot.documentCount} /{" "}
                  {testSession.snapshot.storedObjectCount}
                </dd>
                <dt>Request / Pending submission</dt>
                <dd>
                  {testSession.snapshot.credentialRequestCount} /{" "}
                  {testSession.snapshot.pendingSubmissionCount}
                </dd>
                <dt>Sessions ที่ติดตาม</dt>
                <dd>{testSessions?.length ?? 1}</dd>
              </dl>
            </details>
          ) : null}
        </Surface>
      </section>
    </div>
  );
}

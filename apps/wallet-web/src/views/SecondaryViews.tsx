import {
  Globe2,
  History as HistoryIcon,
  KeyRound,
  QrCode,
  Shield,
  Smartphone,
} from "lucide-react";
import { Badge, Button, Surface } from "@trustcare/ui-web";
import type {
  PresentationHistoryItem,
  WalletDemoUser,
} from "@trustcare/wallet-core";
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
            <strong>{item.verifier.protocol ?? item.importResult.format}</strong>
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

export function SettingsView({
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

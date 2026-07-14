import { useMemo } from "react";
import { Camera, LogOut, QrCode, ShieldCheck, UserCheck } from "lucide-react";
import { Badge, Button, Surface } from "@trustcare/ui-web";
import {
  getDemoUser,
  getDemoWalletCards,
  readinessContextLabels,
  walletTestUserProfile,
  type WalletCard,
  type WalletDemoUser,
} from "@trustcare/wallet-core";
import { UserAvatarImage } from "./identityPresentation";

export function LoginView({
  users,
  pendingScan,
  selectedUserId,
  onSelect,
  onLogin,
  onOpenScanner,
  error,
}: {
  users: WalletDemoUser[];
  pendingScan: boolean;
  selectedUserId: string;
  onSelect: (userId: string) => void;
  onLogin: (userId: string) => void;
  onOpenScanner: () => void;
  error?: string;
}) {
  const selectedUser =
    users.find((user) => user.id === selectedUserId) ??
    users[0] ??
    getDemoUser(selectedUserId);
  const loginCardsByUser = useMemo(
    () =>
      new Map(
        users.map((user) => [
          user.id,
          getDemoWalletCards(user.id).filter(
            (card) => card.ownerUserId === user.id,
          ),
        ]),
      ),
    [users],
  );
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
            กดผู้ใช้เพื่อเข้าสู่ระบบได้ทันทีโดยไม่ต้องกรอก username/password
            Wallet จะแยกเอกสาร ประวัติ VP/SHL และ state ของแต่ละ test session
          </p>
          {pendingScan && (
            <Badge tone="blue">
              <QrCode size={14} /> มี QR รอประมวลผลหลัง login
            </Badge>
          )}
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="login-scan-button"
            onClick={onOpenScanner}
          >
            <Camera size={18} />
            สแกน QR Code
          </button>
        </div>
        <div className="login-user-grid">
          {!users.length && (
            <p className="login-error" role="status">
              Portal ยังไม่ได้ประกาศผู้ใช้ทดสอบที่ Wallet รองรับ
            </p>
          )}
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              className={
                selectedUserId === user.id
                  ? "login-user-card active"
                  : "login-user-card"
              }
              onClick={() => {
                onSelect(user.id);
                void onLogin(user.id);
              }}
            >
              <UserAvatarImage
                user={user}
                cards={loginCardsByUser.get(user.id) ?? []}
              />
              <span>
                <strong>{user.nameTh}</strong>
                <small>
                  {user.role === "staff" ? "เจ้าหน้าที่" : "ผู้ป่วย"} ·{" "}
                  {user.sourceLabel}
                </small>
                <em>
                  {walletTestUserProfile(user.id)
                    ?.useCases.map(
                      (context) =>
                        readinessContextLabels[context]?.th ?? context,
                    )
                    .join(" · ") ?? user.id}
                </em>
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
            tone={
              selectedUser.source === "trustcare_portal" ? "blue" : "neutral"
            }
          >
            {selectedUser.role === "staff"
              ? "ขอบเขตเจ้าหน้าที่"
              : "ขอบเขตผู้ป่วย"}
          </Badge>
        </Surface>
        <Button
          disabled={!users.length}
          onClick={() => void onLogin(selectedUser.id)}
        >
          <ShieldCheck size={18} /> เข้าสู่ระบบด้วยผู้ใช้นี้
        </Button>
      </section>
    </main>
  );
}

export function UserScopePanel({
  activeUser,
  cards = [],
  onLogout,
}: {
  activeUser: WalletDemoUser;
  cards?: WalletCard[];
  onLogout: () => void;
}) {
  return (
    <section className="user-scope-panel">
      <div className="user-scope-card">
        <UserAvatarImage user={activeUser} cards={cards} />
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

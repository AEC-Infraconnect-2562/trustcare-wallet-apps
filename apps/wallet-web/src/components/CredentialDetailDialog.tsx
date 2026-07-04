import { useEffect, useMemo, useState } from "react";
import { Clipboard, Download, Eye, FileJson, History, QrCode, ShieldCheck, X } from "lucide-react";
import { Badge, Button, CredentialDocument, IconButton } from "@trustcare/ui-web";
import type { PresentationHistoryItem, WalletCard, WalletPresentationResponse } from "@trustcare/wallet-core";

type DetailTab = "preview" | "details" | "trust" | "payload" | "history";

export function CredentialDetailDialog({
  card,
  open,
  qrDataUrl,
  presentation,
  history,
  onClose,
  onGenerateQr,
  onSelectiveDisclosure
}: {
  card: WalletCard | null;
  open: boolean;
  qrDataUrl: string;
  presentation: WalletPresentationResponse | null;
  history: PresentationHistoryItem[];
  onClose: () => void;
  onGenerateQr: () => void;
  onSelectiveDisclosure: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("preview");
  const payloadText = useMemo(() => JSON.stringify(card?.credentialData ?? {}, null, 2), [card]);
  const credential = card?.credentialData as any;
  const evidence = Array.isArray(credential?.evidence) ? credential.evidence : credential?.evidence ? [credential.evidence] : [];
  const contexts = Array.isArray(credential?.["@context"]) ? credential["@context"] : [];

  useEffect(() => {
    setTab("preview");
  }, [card?.id]);

  if (!open || !card) return null;

  const checklist = presentation?.verificationChecklist as any[] | undefined;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="credential-dialog">
        <header className="credential-dialog-header">
          <div>
            <p className="eyebrow">{card.issuerHospitalName ?? "TrustCare Issuer"}</p>
            <h2>{card.displayName}</h2>
            <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>{statusLabel(card.credentialStatus)}</Badge>
          </div>
          <IconButton aria-label="ปิดรายละเอียดเอกสาร" onClick={onClose}><X size={20} /></IconButton>
        </header>

        <div className="credential-dialog-body">
          <nav className="detail-tabs" aria-label="Credential detail tabs">
            <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>ตัวอย่าง</button>
            <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>รายละเอียด</button>
            <button className={tab === "trust" ? "active" : ""} onClick={() => setTab("trust")}>Trust</button>
            <button className={tab === "payload" ? "active" : ""} onClick={() => setTab("payload")}>Payload</button>
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>ประวัติ</button>
          </nav>

          <section className="tab-panel credential-tab-panel">
            {tab === "preview" && (
              <>
                <CredentialDocument card={card} qrDataUrl={qrDataUrl} />
                {presentation && (
                  <section className="vp-summary">
                    <div className="vp-qr-box">
                      {qrDataUrl ? <img src={qrDataUrl} alt="VP QR" /> : <QrCode size={72} />}
                    </div>
                    <div>
                      <h3>Verifiable Presentation</h3>
                      <p className="mono">{presentation.presentationId}</p>
                      <p>หมดอายุ {new Date(presentation.expiresAt).toLocaleString("th-TH")}</p>
                      <p>{presentation.mode} / {presentation.credentialCount} credential / {presentation.selectedFields.length || "Full"} fields</p>
                    </div>
                  </section>
                )}
              </>
            )}

            {tab === "details" && (
              <dl className="details-grid">
                <div><dt>ประเภท</dt><dd>{card.displayName}</dd></div>
                <div><dt>หมวดหมู่</dt><dd>{card.documentCategory}</dd></div>
                <div><dt>Credential ID</dt><dd className="mono">{card.credentialId}</dd></div>
                <div><dt>สถานะ</dt><dd>{statusLabel(card.credentialStatus)}</dd></div>
                <div><dt>Issuer DID</dt><dd className="mono">{card.issuerDid ?? "-"}</dd></div>
                <div><dt>Holder DID</dt><dd className="mono">{card.holderDid ?? "-"}</dd></div>
                <div><dt>วันที่ออก</dt><dd>{card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("th-TH") : "-"}</dd></div>
                <div><dt>หมดอายุ</dt><dd>{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("th-TH") : "-"}</dd></div>
              </dl>
            )}

            {tab === "trust" && (
              <div className="checklist trust-panel">
                <div className="check-row">
                  <ShieldCheck size={18} />
                  <span><strong>Issuer DID</strong><small className="mono">{card.issuerDid ?? "-"}</small></span>
                  <Badge tone={card.issuerDid ? "green" : "red"}>{card.issuerDid ? "พบข้อมูล" : "ไม่มีข้อมูล"}</Badge>
                </div>
                <div className="check-row">
                  <ShieldCheck size={18} />
                  <span><strong>Holder DID</strong><small className="mono">{card.holderDid ?? "-"}</small></span>
                  <Badge tone={card.holderDid ? "green" : "red"}>{card.holderDid ? "พบข้อมูล" : "ไม่มีข้อมูล"}</Badge>
                </div>
                <div className="check-row">
                  <ShieldCheck size={18} />
                  <span><strong>DocumentReference Evidence</strong><small>{evidence.length ? `${evidence.length} รายการ` : "ไม่พบหลักฐานอ้างอิง"}</small></span>
                  <Badge tone={evidence.length ? "green" : "red"}>{evidence.length ? "ครบ" : "ขาด"}</Badge>
                </div>
                <div className="check-row">
                  <ShieldCheck size={18} />
                  <span><strong>VC Context</strong><small>{contexts.length ? `${contexts.length} context` : "ไม่มี context"}</small></span>
                  <Badge tone={contexts.length ? "green" : "red"}>{contexts.length ? "ครบ" : "ขาด"}</Badge>
                </div>
                {checklist?.map(item => (
                  <div key={item.key ?? item.label} className="check-row">
                    <ShieldCheck size={18} />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    <Badge tone={item.ok ? "green" : "red"}>{item.ok ? "ผ่าน" : "ไม่ผ่าน"}</Badge>
                  </div>
                )) ?? <p className="muted">สร้าง VP QR เพื่อดู trust checklist จาก verifier เพิ่มเติม</p>}
              </div>
            )}

            {tab === "payload" && (
              <pre className="payload"><FileJson size={16} />{payloadText}</pre>
            )}

            {tab === "history" && (
              <div className="history-list">
                {history.length ? history.map(item => (
                  <div className="history-row" key={item.id}>
                    <History size={18} />
                    <span><strong>{item.verifierName ?? "Verifier"}</strong><small>{item.presentedAt ? new Date(item.presentedAt).toLocaleString("th-TH") : item.purpose}</small></span>
                    <Badge tone={item.verificationResult === "valid" ? "green" : "neutral"}>{statusLabel(item.verificationResult ?? "recorded")}</Badge>
                  </div>
                )) : <p className="muted">ยังไม่มีประวัติการแสดงเอกสารนี้</p>}
              </div>
            )}
          </section>

          <div className="credential-action-grid credential-sticky-actions">
            <Button onClick={onGenerateQr}><QrCode size={18} /> QR Code</Button>
            <Button className="purple" onClick={onSelectiveDisclosure}><Eye size={18} /> SD / ZKP</Button>
            <Button
              className="secondary"
              onClick={() => void navigator.clipboard?.writeText(String(card.credentialId))}
            >
              <Clipboard size={18} /> คัดลอก ID
            </Button>
            <Button className="green" onClick={() => window.print()}><Download size={18} /> PDF</Button>
          </div>
        </div>
      </div>
    </div>
  );
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
    recorded: "บันทึกแล้ว"
  };
  return labels[String(status ?? "")] ?? String(status ?? "-");
}

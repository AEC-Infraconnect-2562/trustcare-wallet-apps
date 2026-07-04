import { useMemo, useState } from "react";
import { Clipboard, Download, Eye, FileJson, History, QrCode, ShieldCheck, X } from "lucide-react";
import { Badge, Button, CredentialDocument, IconButton } from "@trustcare/ui-web";
import type { PresentationHistoryItem, WalletCard, WalletPresentationResponse } from "@trustcare/wallet-core";

type DetailTab = "details" | "trust" | "payload" | "history";

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
  const [tab, setTab] = useState<DetailTab>("details");
  const payloadText = useMemo(() => JSON.stringify(card?.credentialData ?? {}, null, 2), [card]);

  if (!open || !card) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="credential-dialog">
        <header className="credential-dialog-header">
          <div>
            <h2>{card.displayName}</h2>
            <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>{card.credentialStatus}</Badge>
          </div>
          <IconButton aria-label="Close credential detail" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="credential-dialog-body">
          <CredentialDocument card={card} qrDataUrl={qrDataUrl} />
          <div className="credential-action-grid">
            <Button onClick={onGenerateQr}><QrCode size={18} /> QR Code</Button>
            <Button className="purple" onClick={onSelectiveDisclosure}><Eye size={18} /> SD (ZKP)</Button>
            <Button
              className="secondary"
              onClick={() => void navigator.clipboard?.writeText(String(card.credentialId))}
            >
              <Clipboard size={18} /> คัดลอก ID
            </Button>
            <Button className="green" onClick={() => window.print()}><Download size={18} /> PDF</Button>
          </div>
          {presentation && (
            <section className="vp-summary">
              <div className="vp-qr-box">
                {qrDataUrl ? <img src={qrDataUrl} alt="VP QR" /> : <QrCode size={72} />}
              </div>
              <div>
                <h3>Verifiable Presentation</h3>
                <p className="mono">{presentation.presentationId}</p>
                <p>หมดอายุ {new Date(presentation.expiresAt).toLocaleString("th-TH")}</p>
                <p>{presentation.mode} · {presentation.credentialCount} credential · {presentation.selectedFields.length || "Full"} fields</p>
              </div>
            </section>
          )}
          <nav className="detail-tabs" aria-label="Credential detail tabs">
            <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>รายละเอียด</button>
            <button className={tab === "trust" ? "active" : ""} onClick={() => setTab("trust")}>Trust</button>
            <button className={tab === "payload" ? "active" : ""} onClick={() => setTab("payload")}>Payload</button>
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>ประวัติ</button>
          </nav>
          <section className="tab-panel">
            {tab === "details" && (
              <dl className="details-grid">
                <div><dt>ประเภท</dt><dd>{card.displayName}</dd></div>
                <div><dt>Credential ID</dt><dd className="mono">{card.credentialId}</dd></div>
                <div><dt>Issuer DID</dt><dd className="mono">{card.issuerDid ?? "-"}</dd></div>
                <div><dt>Holder DID</dt><dd className="mono">{card.holderDid ?? "-"}</dd></div>
                <div><dt>วันที่ออก</dt><dd>{card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("th-TH") : "-"}</dd></div>
                <div><dt>หมดอายุ</dt><dd>{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("th-TH") : "-"}</dd></div>
              </dl>
            )}
            {tab === "trust" && (
              <div className="checklist">
                {(presentation?.verificationChecklist as any[] | undefined)?.map(item => (
                  <div key={item.key ?? item.label} className="check-row">
                    <ShieldCheck size={18} />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    <Badge tone={item.ok ? "green" : "red"}>{item.ok ? "ผ่าน" : "ไม่ผ่าน"}</Badge>
                  </div>
                )) ?? <p className="muted">สร้าง VP QR เพื่อดู trust checklist</p>}
              </div>
            )}
            {tab === "payload" && (
              <pre className="payload"><FileJson size={16} />{payloadText}</pre>
            )}
            {tab === "history" && (
              <div className="history-list">
                {history.map(item => (
                  <div className="history-row" key={item.id}>
                    <History size={18} />
                    <span><strong>{item.verifierName ?? "Verifier"}</strong><small>{item.presentedAt ? new Date(item.presentedAt).toLocaleString("th-TH") : item.purpose}</small></span>
                    <Badge tone={item.verificationResult === "valid" ? "green" : "neutral"}>{item.verificationResult ?? "recorded"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}


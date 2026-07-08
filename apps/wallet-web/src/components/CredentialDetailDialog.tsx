import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Clipboard,
  Download,
  Eye,
  FileJson,
  History,
  QrCode,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  CredentialDocument,
  IconButton,
  PortablePresentationDocument,
} from "@trustcare/ui-web";
import {
  presentationEnvelopeFromPresentation,
  presentationEnvelopeFromWalletCard,
  type PortablePresentationEnvelope,
  type PresentationHistoryItem,
  type WalletCard,
  type WalletPresentationResponse,
} from "@trustcare/wallet-core";

type DetailTab = "preview" | "details" | "trust" | "payload" | "history";

export function CredentialDetailDialog({
  card,
  open,
  qrDataUrl,
  presentation,
  history,
  onClose,
  onGenerateQr,
  onSelectiveDisclosure,
}: {
  card: WalletCard | null;
  open: boolean;
  qrDataUrl: string;
  presentation: WalletPresentationResponse | null;
  history: PresentationHistoryItem[];
  onClose: () => void;
  onGenerateQr: () => void | Promise<void>;
  onSelectiveDisclosure: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("preview");
  const [qrPopupOpen, setQrPopupOpen] = useState(false);
  const printSourceRef = useRef<HTMLDivElement | null>(null);

  const envelope = useMemo(() => {
    if (!card) return null;
    return presentation
      ? presentationEnvelopeFromPresentation(card, presentation)
      : presentationEnvelopeFromWalletCard(card);
  }, [card, presentation]);

  const payloadText = useMemo(
    () => JSON.stringify(card?.credentialData ?? {}, null, 2),
    [card],
  );

  useEffect(() => {
    setTab("preview");
    setQrPopupOpen(false);
  }, [card?.id]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !card || !envelope) return null;

  async function handleGenerateQr() {
    await onGenerateQr();
    setQrPopupOpen(true);
  }

  function openPrintView() {
    const sourceHtml = printSourceRef.current?.innerHTML;
    if (!sourceHtml || !card) return;

    const styles = Array.from(
      document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
        'link[rel="stylesheet"], style',
      ),
    )
      .map((node) => node.outerHTML)
      .join("\n");
    const printWindow = window.open("", "_blank", "width=920,height=1120");
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(card.displayName)} - TrustCare Wallet</title>
  ${styles}
  <style>
    body { margin: 0; background: #fff; color: #111827; padding: 24px; }
    .print-shell { max-width: 920px; margin: 0 auto; }
    .print-toolbar { display: flex; justify-content: flex-end; gap: 10px; margin: 0 0 16px; }
    .print-toolbar button { border: 1px solid #d8dee9; border-radius: 9px; background: #fff; padding: 9px 14px; font: 600 13px system-ui, sans-serif; cursor: pointer; }
    .print-toolbar button.primary { background: #4f61d9; color: #fff; border-color: #4f61d9; }
    .print-shell .credential-doc { max-width: 100%; box-shadow: none; }
    @media print {
      body { padding: 0; }
      .print-toolbar { display: none !important; }
      .print-shell { max-width: none; }
      .credential-doc { border-radius: 0 !important; box-shadow: none !important; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="print-shell">
    <div class="print-toolbar">
      <button type="button" onclick="window.close()">ปิด</button>
      <button type="button" class="primary" onclick="window.print()">พิมพ์ / Save as PDF</button>
    </div>
    ${sourceHtml}
  </main>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  return (
    <div
      className="modal-backdrop credential-modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="credential-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="credential-dialog-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button type="button" className="dialog-back-button" onClick={onClose}>
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">เอกสาร / {card.displayName}</span>
            </div>
            <div className="dialog-heading-row">
              <p className="eyebrow">{hospitalName(card, envelope)}</p>
              <h2>{card.displayName}</h2>
              <Badge tone={credentialStatusTone(card.credentialStatus)}>
                {statusLabel(card.credentialStatus)}
              </Badge>
            </div>
          </div>
          <IconButton aria-label="ปิดรายละเอียดเอกสาร" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>

        <div className="credential-dialog-body">
          <nav className="detail-tabs" aria-label="Credential detail tabs">
            <button
              className={tab === "preview" ? "active" : ""}
              onClick={() => setTab("preview")}
            >
              ตัวอย่าง
            </button>
            <button
              className={tab === "details" ? "active" : ""}
              onClick={() => setTab("details")}
            >
              รายละเอียด
            </button>
            <button
              className={tab === "trust" ? "active" : ""}
              onClick={() => setTab("trust")}
            >
              Trust
            </button>
            <button
              className={tab === "payload" ? "active" : ""}
              onClick={() => setTab("payload")}
            >
              Payload
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              ประวัติ
            </button>
          </nav>

          <section className="tab-panel credential-tab-panel">
            {tab === "preview" && (
              <>
                <div ref={printSourceRef} className="credential-print-source">
                  <CredentialDocument card={card} qrDataUrl={qrDataUrl} />
                </div>
                {presentation ? (
                  <PortablePresentationDocument envelope={envelope} compact />
                ) : null}
              </>
            )}

            {tab === "details" && (
              <PortablePresentationDocument envelope={envelope} />
            )}

            {tab === "trust" && <TrustPanel envelope={envelope} />}

            {tab === "payload" && (
              <pre className="payload">
                <FileJson size={16} />
                {payloadText}
              </pre>
            )}

            {tab === "history" && <HistoryPanel history={history} />}
          </section>
        </div>

        <footer className="credential-action-grid credential-sticky-actions">
          <Button onClick={() => void handleGenerateQr()}>
            <QrCode size={18} /> QR Code
          </Button>
          <Button type="button" className="purple" onClick={onSelectiveDisclosure}>
            <Eye size={18} /> SD / ZKP
          </Button>
          <Button
            className="secondary"
            onClick={() => void navigator.clipboard?.writeText(String(card.credentialId))}
          >
            <Clipboard size={18} /> คัดลอก ID
          </Button>
          <Button className="green" onClick={openPrintView}>
            <Download size={18} /> PDF
          </Button>
        </footer>
      </div>

      {qrPopupOpen ? (
        <QrPopup
          card={card}
          presentation={presentation}
          qrDataUrl={qrDataUrl}
          onClose={() => setQrPopupOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TrustPanel({ envelope }: { envelope: PortablePresentationEnvelope }) {
  return (
    <div className="checklist trust-panel">
      <div className="check-row">
        <ShieldCheck size={18} />
        <span>
          <strong>{trustStatusLabel(envelope.trust.status)}</strong>
          <small>{envelope.trust.warnings[0] ?? envelope.trust.errors[0] ?? "Trust evidence normalized from portable presentation envelope."}</small>
        </span>
        <Badge tone={badgeTone(envelope.trust.badge)}>{envelope.trust.badge}</Badge>
      </div>
      {envelope.trust.checklist.map((item) => (
        <div key={item.key} className="check-row">
          <ShieldCheck size={18} />
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <Badge tone={item.ok ? "green" : "red"}>
            {item.status ?? (item.ok ? "present" : "missing")}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function HistoryPanel({ history }: { history: PresentationHistoryItem[] }) {
  if (!history.length) {
    return <p className="muted">ยังไม่มีประวัติการแสดงเอกสารนี้</p>;
  }

  return (
    <div className="history-list">
      {history.map((item) => (
        <div className="history-row" key={item.id}>
          <History size={18} />
          <span>
            <strong>{item.verifierName ?? "Verifier"}</strong>
            <small>
              {item.presentedAt
                ? new Date(item.presentedAt).toLocaleString("th-TH")
                : (item.purpose ?? "-")}
            </small>
          </span>
          <Badge tone={item.verificationResult === "valid" ? "green" : "neutral"}>
            {statusLabel(item.verificationResult ?? "recorded")}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function QrPopup({
  card,
  presentation,
  qrDataUrl,
  onClose,
}: {
  card: WalletCard;
  presentation: WalletPresentationResponse | null;
  qrDataUrl: string;
  onClose: () => void;
}) {
  const qrPayload = presentation?.qrData ?? "";
  return (
    <div
      className="qr-popup-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="VP QR Code"
      onClick={onClose}
    >
      <section className="qr-popup" onClick={(event) => event.stopPropagation()}>
        <header className="qr-popup-header">
          <div>
            <p className="eyebrow">VERIFIABLE PRESENTATION</p>
            <h3>QR Code สำหรับแสดงเอกสาร</h3>
            <span>{card.displayName}</span>
          </div>
          <IconButton aria-label="ปิด QR Code" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        <div className="qr-popup-frame">
          {qrDataUrl ? <img src={qrDataUrl} alt="VP QR Code" /> : <QrCode size={120} />}
        </div>
        <p className="qr-popup-help">
          {qrDataUrl
            ? "ให้ผู้ตรวจสอบสแกน QR นี้เพื่อรับ VP ตามเอกสารและขอบเขตข้อมูลที่เลือก"
            : "กำลังสร้าง QR Code สำหรับ VP..."}
        </p>
        {presentation ? (
          <dl className="qr-popup-meta">
            <div>
              <dt>VP ID</dt>
              <dd className="mono">{presentation.presentationId}</dd>
            </div>
            <div>
              <dt>หมดอายุ</dt>
              <dd>{new Date(presentation.expiresAt).toLocaleString("th-TH")}</dd>
            </div>
          </dl>
        ) : null}
        <div className="qr-popup-actions">
          <Button
            className="secondary"
            disabled={!qrPayload}
            onClick={() => void navigator.clipboard?.writeText(qrPayload)}
          >
            <Clipboard size={18} /> คัดลอก QR URL
          </Button>
          <Button onClick={onClose}>เสร็จสิ้น</Button>
        </div>
      </section>
    </div>
  );
}

function hospitalName(
  card: WalletCard,
  envelope: PortablePresentationEnvelope,
): string {
  return envelope.issuer?.name ?? card.issuerHospitalName ?? "TrustCare Issuer";
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
    recorded: "บันทึกแล้ว",
  };
  return labels[String(status ?? "")] ?? String(status ?? "-");
}

function credentialStatusTone(status?: string | null): "green" | "yellow" | "red" | "neutral" {
  const normalized = String(status ?? "").toLowerCase();
  if (["active", "verified", "valid"].includes(normalized)) return "green";
  if (["pending", "superseded", "suspended"].includes(normalized)) return "yellow";
  if (["revoked", "expired", "invalid"].includes(normalized)) return "red";
  return "neutral";
}

function trustStatusLabel(status: PortablePresentationEnvelope["trust"]["status"]) {
  const labels: Record<PortablePresentationEnvelope["trust"]["status"], string> = {
    issuer_signed: "ลงนามแล้ว",
    transport_valid: "ขนส่งถูกต้อง",
    trustcare_pending: "รอรับรอง",
    trustcare_certified: "TrustCare certified",
    patient_provided_unverified: "ผู้ใช้เพิ่มเอง",
    invalid_or_revoked: "ใช้ไม่ได้",
    metadata_only: "metadata only",
    proof_missing: "ยังไม่มี proof",
  };
  return labels[status];
}

function badgeTone(badge: PortablePresentationEnvelope["trust"]["badge"]) {
  if (badge === "green") return "green";
  if (badge === "red") return "red";
  if (badge === "yellow") return "yellow";
  return "neutral";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return replacements[char] ?? char;
  });
}

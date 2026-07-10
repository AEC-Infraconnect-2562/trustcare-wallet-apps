import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Eye,
  FileJson,
  History,
  Printer,
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
  credentialRenderModelFromCard,
  credentialStatusLabel,
  credentialStatusTone,
  presentationEnvelopeFromPresentation,
  presentationEnvelopeFromWalletCard,
  trustBadgeTone,
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
  const [printPending, setPrintPending] = useState(false);
  const printSourceRef = useRef<HTMLDivElement | null>(null);
  const pendingPrintWindowRef = useRef<Window | null>(null);

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
    setPrintPending(false);
  }, [card?.id]);

  useEffect(() => {
    if (!printPending || tab !== "preview") return;
    const frame = window.requestAnimationFrame(() => {
      openPrintView(pendingPrintWindowRef.current ?? undefined);
      pendingPrintWindowRef.current = null;
      setPrintPending(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printPending, tab]);

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
  const lifecycleStatus = lifecycleStatusFromEnvelope(envelope, card);

  async function handleGenerateQr() {
    await onGenerateQr();
    setQrPopupOpen(true);
  }

  function openPrintView(existingWindow?: Window) {
    const sourceHtml = printSourceRef.current?.innerHTML;
    if (!sourceHtml || !card) return;
    const printFormFactor =
      credentialRenderModelFromCard(card).paper.formFactor;
    const printShellClass =
      printFormFactor.kind === "iso_id_1"
        ? "print-shell print-shell-id-card"
        : "print-shell print-shell-a4";

    const styles = Array.from(
      document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
        'link[rel="stylesheet"], style',
      ),
    )
      .map((node) => node.outerHTML)
      .join("\n");
    const printWindow =
      existingWindow ?? window.open("", "_blank", "width=980,height=1180");
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
    @page { size: A4 portrait; margin: 14mm 16mm; }
    body { margin: 0; background: #eef1f4; color: #111827; padding: 10mm 0; }
    .print-shell { width: min(210mm, 100%); margin: 0 auto; }
    .print-shell-id-card { min-height: 269mm; display: grid; place-items: center; }
    .print-toolbar { display: flex; justify-content: flex-end; gap: 10px; width: min(210mm, calc(100% - 32px)); margin: 0 auto 16px; }
    .print-toolbar button { border: 1px solid #cbd5e1; border-radius: 9px; background: #fff; padding: 9px 14px; color: #1f2937; font: 650 13px system-ui, sans-serif; cursor: pointer; }
    .print-toolbar button:disabled { cursor: wait; opacity: .58; }
    .print-toolbar button.primary { background: #4f61d9; color: #fff; border-color: #4f61d9; }
    .print-shell .credential-doc { width: min(210mm, 100%); max-width: 100%; margin: 0 auto; }
    @media print {
      body { padding: 0; }
      .print-toolbar { display: none !important; }
      .print-shell { width: auto; max-width: none; }
      .print-shell-id-card { min-height: 269mm; display: grid; place-items: center; }
      .credential-doc { width: auto !important; min-height: auto !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
      .credential-doc.tc-form-iso-id-1 { width: 85.6mm !important; max-width: 85.6mm !important; height: 53.98mm !important; min-height: 53.98mm !important; padding: 3.2mm !important; border: 0.25mm solid #666 !important; border-top-width: 1.2mm !important; border-radius: 4mm !important; }
    }
  </style>
</head>
<body>
  <main class="${printShellClass}">
    <div class="print-toolbar">
      <button type="button" onclick="window.close()">ปิด</button>
      <button id="print-action" type="button" class="primary" onclick="window.print()" disabled>กำลังเตรียมเอกสาร…</button>
    </div>
    ${sourceHtml}
  </main>
  <script>
    (async function preparePrintDocument() {
      var fontReady = document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(function () {})
        : Promise.resolve();
      var imageReady = Promise.all(Array.from(document.images).map(function (image) {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        if (typeof image.decode === "function") return image.decode().catch(function () {});
        return new Promise(function (resolve) {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }));
      await Promise.all([fontReady, imageReady]);
      var action = document.getElementById("print-action");
      if (action) {
        action.disabled = false;
        action.textContent = "พิมพ์ / บันทึก PDF";
        action.focus();
      }
    })();
  </script>
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
      <div
        className="credential-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="credential-dialog-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button
                type="button"
                className="dialog-back-button"
                onClick={onClose}
              >
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">
                เอกสาร / {envelope.display.title}
              </span>
            </div>
            <div className="dialog-heading-row">
              <p className="eyebrow">{hospitalName(card, envelope)}</p>
              <h2>{envelope.display.title}</h2>
              <Badge tone={credentialStatusTone(lifecycleStatus)}>
                {credentialStatusLabel(lifecycleStatus)}
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
          <CredentialProofSummary
            card={card}
            envelope={envelope}
            presentation={presentation}
          />

          <section className="tab-panel credential-tab-panel">
            {tab === "preview" && (
              <>
                <div ref={printSourceRef} className="credential-print-source">
                  <CredentialDocument
                    card={card}
                    envelope={envelope}
                    qrDataUrl={qrDataUrl}
                  />
                </div>
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
          <Button
            type="button"
            className="purple"
            onClick={onSelectiveDisclosure}
          >
            <Eye size={18} /> ตรวจข้อมูลก่อนแชร์
          </Button>
          <Button
            className="secondary"
            onClick={() => void copyToClipboard(String(card.credentialId))}
          >
            <Clipboard size={18} /> คัดลอก ID
          </Button>
          <Button
            className="green"
            onClick={() => {
              if (tab === "preview") {
                openPrintView();
                return;
              }
              pendingPrintWindowRef.current = window.open(
                "",
                "_blank",
                "width=980,height=1180",
              );
              setPrintPending(true);
              setTab("preview");
            }}
          >
            <Printer size={18} /> พิมพ์ / บันทึก PDF
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

function CredentialProofSummary({
  card,
  envelope,
  presentation,
}: {
  card: WalletCard;
  envelope: PortablePresentationEnvelope;
  presentation: WalletPresentationResponse | null;
}) {
  const checklist = new Map(
    envelope.trust.checklist.map((item) => [item.key, item]),
  );
  const issuer = checklist.get("issuer");
  const holder = checklist.get("holder");
  const proof = checklist.get("proof");
  const status = checklist.get("status");
  const proofFormat =
    card.credentialProof?.format ??
    presentation?.format ??
    (card.credentialJwt ? "vc+jwt" : (proof?.detail ?? "proof missing"));
  const selectedFields = presentation?.selectedFields?.length ?? 0;
  const proofTone = proof?.ok ? "green" : "yellow";
  const statusTone = status?.ok ? "green" : "yellow";
  const standards: Array<{ label: string; tone: "blue" | "green" | "yellow" }> =
    [
      {
        label: envelope.kind === "presentation" ? "W3C VP" : "W3C VC",
        tone: "blue",
      },
      { label: proofFormat, tone: proofTone },
      ...(selectedFields
        ? [{ label: `SD ${selectedFields} fields`, tone: "green" as const }]
        : []),
    ];

  return (
    <section
      className="credential-proof-strip"
      aria-label="Credential proof and disclosure summary"
    >
      <div className="credential-proof-heading">
        <span>
          <ShieldCheck size={18} />
          Proof & standards
        </span>
        <div className="credential-standard-badges">
          {standards.map((standard) => (
            <Badge
              key={`${standard.label}-${standard.tone}`}
              tone={standard.tone}
              className="credential-standard-badge"
            >
              {standard.label}
            </Badge>
          ))}
        </div>
      </div>
      <div className="credential-proof-grid">
        <ProofMiniCard
          label="Issuer DID"
          value={envelope.issuer?.did ?? issuer?.detail ?? "-"}
          ok={Boolean(issuer?.ok)}
        />
        <ProofMiniCard
          label="Holder binding"
          value={envelope.holder?.did ?? holder?.detail ?? "-"}
          ok={Boolean(holder?.ok)}
        />
        <ProofMiniCard
          label="Proof format"
          value={proofFormat}
          ok={Boolean(proof?.ok)}
        />
        <ProofMiniCard
          label="Status / expiry"
          value={status?.detail ?? card.expiresAt ?? card.credentialStatus}
          ok={statusTone === "green"}
        />
      </div>
    </section>
  );
}

function ProofMiniCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className={`credential-proof-card ${ok ? "ok" : "warn"}`}>
      <CheckCircle2 size={16} />
      <span>
        <small>{label}</small>
        <strong className="mono">{value || "-"}</strong>
      </span>
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
          <small>
            {trustEvidenceMessage(
              envelope.trust.warnings[0] ?? envelope.trust.errors[0],
            ) ??
              "Trust evidence normalized from portable presentation envelope."}
          </small>
        </span>
        <Badge tone={trustBadgeTone(envelope.trust.badge)}>
          {envelope.trust.badge}
        </Badge>
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
          <Badge
            tone={item.verificationResult === "valid" ? "green" : "neutral"}
          >
            {credentialStatusLabel(item.verificationResult ?? "recorded")}
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
      <section
        className="qr-popup"
        onClick={(event) => event.stopPropagation()}
      >
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
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="VP QR Code" />
          ) : (
            <QrCode size={120} />
          )}
        </div>
        <p className="qr-popup-help">
          {qrDataUrl
            ? "ให้ผู้ตรวจสอบสแกน QR นี้เพื่อรับ VP ตามเอกสารและขอบเขตข้อมูลที่เลือก"
            : "กำลังสร้าง QR Code สำหรับ VP..."}
        </p>
        {presentation ? (
          <>
            <div className="qr-disclosure-summary">
              <span>
                <Eye size={16} />
                เปิดเผย {presentation.selectedFields.length || "ทุก"} ฟิลด์
              </span>
              <span>{presentation.format}</span>
            </div>
            <dl className="qr-popup-meta">
              <div>
                <dt>VP ID</dt>
                <dd className="mono">{presentation.presentationId}</dd>
              </div>
              <div>
                <dt>หมดอายุ</dt>
                <dd>
                  {new Date(presentation.expiresAt).toLocaleString("th-TH")}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
        <div className="qr-popup-actions">
          <Button
            className="secondary"
            disabled={!qrPayload}
            onClick={() => void copyToClipboard(qrPayload)}
          >
            <Clipboard size={18} /> คัดลอก QR URL
          </Button>
          <Button onClick={onClose}>เสร็จสิ้น</Button>
        </div>
      </section>
    </div>
  );
}

async function copyToClipboard(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard?.writeText(value);
    return;
  } catch {
    // Fall back below for browsers that deny clipboard access outside HTTPS/user gesture contexts.
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function lifecycleStatusFromEnvelope(
  envelope: PortablePresentationEnvelope,
  card: WalletCard,
): string {
  const status = envelope.sections
    .find((section) => section.key === "metadata")
    ?.fields.find((field) => field.path === "document.status")?.value;
  return typeof status === "string" && status.trim()
    ? status
    : String(card.credentialStatus);
}

function hospitalName(
  card: WalletCard,
  envelope: PortablePresentationEnvelope,
): string {
  return envelope.issuer?.name ?? card.issuerHospitalName ?? "TrustCare Issuer";
}

function trustStatusLabel(
  status: PortablePresentationEnvelope["trust"]["status"],
) {
  const labels: Record<
    PortablePresentationEnvelope["trust"]["status"],
    string
  > = {
    issuer_signed: "ลงนามแล้ว",
    transport_valid: "ขนส่งถูกต้อง",
    trustcare_pending: "รอรับรอง",
    trustcare_certified: "TrustCare certified",
    patient_provided_unverified: "ผู้ใช้เพิ่มเอง",
    invalid_or_revoked: "ใช้ไม่ได้",
    metadata_only: "metadata only",
    proof_missing: "รอ proof จาก issuer",
  };
  return labels[status];
}

function trustEvidenceMessage(message?: string): string | undefined {
  const messages: Record<string, string> = {
    portal_issuer_proof_missing:
      "Credential นี้ระบุว่ามาจาก TrustCare Portal แต่ยังไม่มี VC JWT/proof จาก issuer จึงต้อง Sync หรือรับ credential ที่ลงนามจาก Portal ก่อน",
    cryptographic_proof_missing:
      "Credential นี้ยังไม่มี cryptographic proof สำหรับตรวจลายเซ็น issuer",
    holder_binding_missing: "Credential นี้ยังไม่มี holder DID binding",
    metadata_only_record_skipped_for_readiness:
      "รายการนี้เป็น metadata-only จึงยังใช้เป็น VC สำหรับ readiness ไม่ได้",
    patient_provided_document_requires_trusted_signature:
      "เอกสารที่ผู้ใช้เพิ่มเองต้องมี trusted issuer signature ก่อนใช้ยืนยัน",
  };
  if (!message) return undefined;
  return messages[message] ?? message;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[char] ?? char;
  });
}

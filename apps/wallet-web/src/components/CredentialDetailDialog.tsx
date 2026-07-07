import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Download,
  Eye,
  FileJson,
  History,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  UserRound,
  X
} from "lucide-react";
import { Badge, Button, CredentialDocument, IconButton } from "@trustcare/ui-web";
import type { PresentationHistoryItem, TrustLayerChecklistItem, WalletCard, WalletPresentationResponse } from "@trustcare/wallet-core";

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
  onGenerateQr: () => void | Promise<void>;
  onSelectiveDisclosure: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("preview");
  const [qrPopupOpen, setQrPopupOpen] = useState(false);
  const printSourceRef = useRef<HTMLDivElement | null>(null);
  const payloadText = useMemo(() => JSON.stringify(card?.credentialData ?? {}, null, 2), [card]);
  const credential = card?.credentialData as any;
  const evidence = Array.isArray(credential?.evidence) ? credential.evidence : credential?.evidence ? [credential.evidence] : [];
  const contexts = Array.isArray(credential?.["@context"]) ? credential["@context"] : [];

  useEffect(() => {
    setTab("preview");
    setQrPopupOpen(false);
  }, [card?.id]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !card) return null;

  const detailCard = card;
  const checklist = presentation?.verificationChecklist as any[] | undefined;
  const qrPayload = presentation?.qrData ?? "";

  async function handleGenerateQr() {
    await onGenerateQr();
    setQrPopupOpen(true);
  }

  function handleSelectiveDisclosure() {
    onSelectiveDisclosure();
  }

  function openPrintView() {
    const sourceHtml = printSourceRef.current?.innerHTML;
    if (!sourceHtml) return;

    const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
      .map(node => node.outerHTML)
      .join("\n");
    const printWindow = window.open("", "_blank", "width=920,height=1120");
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(detailCard.displayName)} - TrustCare Wallet</title>
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
    <div className="modal-backdrop credential-modal-backdrop" role="dialog" aria-modal="true">
      <div className="credential-dialog" onClick={event => event.stopPropagation()}>
        <header className="credential-dialog-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button type="button" className="dialog-back-button" onClick={onClose}>
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">เอกสาร / {card.displayName}</span>
            </div>
            <div className="dialog-heading-row">
              <p className="eyebrow">{issuerNameTh(card)}</p>
              <h2>{card.displayName}</h2>
              <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>{statusLabel(card.credentialStatus)}</Badge>
            </div>
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
                <div ref={printSourceRef} className="credential-print-source">
                  <CredentialDocument card={card} qrDataUrl={qrDataUrl} />
                </div>
                {presentation && (
                  <VpRendererPanel
                    card={card}
                    presentation={presentation}
                    qrDataUrl={qrDataUrl}
                    evidenceCount={evidence.length}
                    contextCount={contexts.length}
                  />
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

        </div>
        <footer className="credential-action-grid credential-sticky-actions">
          <Button onClick={() => void handleGenerateQr()}><QrCode size={18} /> QR Code</Button>
          <Button type="button" className="purple" onClick={handleSelectiveDisclosure}><Eye size={18} /> SD / ZKP</Button>
          <Button
            className="secondary"
            onClick={() => void navigator.clipboard?.writeText(String(card.credentialId))}
          >
            <Clipboard size={18} /> คัดลอก ID
          </Button>
          <Button className="green" onClick={openPrintView}><Download size={18} /> PDF</Button>
        </footer>
      </div>
      {qrPopupOpen && (
        <div className="qr-popup-backdrop" role="dialog" aria-modal="true" aria-label="VP QR Code" onClick={() => setQrPopupOpen(false)}>
          <section className="qr-popup" onClick={event => event.stopPropagation()}>
            <header className="qr-popup-header">
              <div>
                <p className="eyebrow">VERIFIABLE PRESENTATION</p>
                <h3>QR Code สำหรับแสดงเอกสาร</h3>
                <span>{card.displayName}</span>
              </div>
              <IconButton aria-label="ปิด QR Code" onClick={() => setQrPopupOpen(false)}><X size={20} /></IconButton>
            </header>
            <div className="qr-popup-frame">
              {qrDataUrl ? <img src={qrDataUrl} alt="VP QR Code" /> : <QrCode size={120} />}
            </div>
            <p className="qr-popup-help">
              {qrDataUrl
                ? "ให้ผู้ตรวจสอบสแกน QR นี้เพื่อรับ VP ตามเอกสารและขอบเขตข้อมูลที่เลือก"
                : "กำลังสร้าง QR Code สำหรับ VP..."}
            </p>
            {presentation && (
              <dl className="qr-popup-meta">
                <div><dt>VP ID</dt><dd className="mono">{presentation.presentationId}</dd></div>
                <div><dt>หมดอายุ</dt><dd>{new Date(presentation.expiresAt).toLocaleString("th-TH")}</dd></div>
              </dl>
            )}
            <div className="qr-popup-actions">
              <Button
                className="secondary"
                disabled={!qrPayload}
                onClick={() => void navigator.clipboard?.writeText(qrPayload)}
              >
                <Clipboard size={18} /> คัดลอก QR URL
              </Button>
              <Button onClick={() => setQrPopupOpen(false)}>เสร็จสิ้น</Button>
            </div>
          </section>
        </div>
      )}
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

function issuerNameTh(card: WalletCard): string {
  const data = extractCredentialRenderData(card);
  const value =
    textValue(data.hospital.nameTh) ??
    textValue(data.issuer.nameTh) ??
    textValue(data.issuer.name);
  if (value) return value;
  return card.issuerHospitalName ?? "TrustCare Issuer";
}

function VpRendererPanel({
  card,
  presentation,
  qrDataUrl,
  evidenceCount,
  contextCount
}: {
  card: WalletCard;
  presentation: WalletPresentationResponse;
  qrDataUrl: string;
  evidenceCount: number;
  contextCount: number;
}) {
  const data = extractCredentialRenderData(card);
  const checklist = normalizeChecklist(presentation.verificationChecklist);
  const trust = resolveTrustTone(card, checklist);
  const clinicalCards = credentialContextCards(card, data.subject);
  const selectedFieldLabel = presentation.selectedFields.length
    ? `${presentation.selectedFields.length} fields`
    : "Full disclosure";

  return (
    <section className="vp-renderer-panel" aria-label="VP renderer preview">
      <div className={`vp-trust-banner vp-trust-${trust.tone}`}>
        <div className="vp-trust-icon">{trust.icon}</div>
        <div>
          <p className="eyebrow">VERIFIABLE PRESENTATION</p>
          <h3>{trust.title}</h3>
          <span>{trust.description}</span>
        </div>
        <Badge tone={trust.badgeTone}>{trust.badge}</Badge>
      </div>

      <div className="vp-renderer-grid">
        <section className="vp-result-card">
          <h4><ShieldCheck size={17} /> Trust layer decision</h4>
          <VpDecisionRow label="Presentation type" detail={presentation.mode || "direct_vp"} status="present" />
          <VpDecisionRow label="Issuer trusted" detail={data.issuerName || card.issuerHospitalName || "Issuer DID available for resolver"} status={card.issuerDid ? "present" : "pending"} />
          <VpDecisionRow label="Holder binding" detail={card.holderDid ?? "Holder DID is not available"} status={card.holderDid ? "present" : "pending"} />
          <VpDecisionRow label="Schema and claims" detail={`${card.displayNameEn ?? card.cardType} / ${selectedFieldLabel}`} status="present" />
          <VpDecisionRow label="Status and expiry" detail={`หมดอายุ ${new Date(presentation.expiresAt).toLocaleString("th-TH")}`} status={card.credentialStatus === "active" ? "present" : "warning"} />
          {checklist.map(item => (
            <VpDecisionRow
              key={item.key}
              label={item.label}
              detail={item.detail || (item.ok ? "passed" : "not passed")}
              status={item.ok ? "present" : "warning"}
            />
          ))}
        </section>

        <section className="vp-result-card">
          <h4><UserRound size={17} /> Subject</h4>
          <dl className="vp-subject-list">
            <div><dt>Name</dt><dd>{data.subjectName}</dd></div>
            <div><dt>Holder DID</dt><dd className="mono">{card.holderDid ?? "-"}</dd></div>
            <div><dt>Issuer</dt><dd>{data.issuerName || card.issuerHospitalName || "-"}</dd></div>
            <div><dt>Credentials</dt><dd>{presentation.credentialCount}</dd></div>
          </dl>
        </section>

        <section className="vp-result-card vp-context-result">
          <h4><FileJson size={17} /> Context ที่เปิดเผย</h4>
          {clinicalCards.length ? (
            <div className="vp-context-list">
              {clinicalCards.map(item => (
                <div key={item.label} className={`vp-context-chip ${item.tone ?? ""}`}>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">VP นี้เปิดเผยเฉพาะข้อมูลตัวตนและ metadata ที่จำเป็นตามวัตถุประสงค์</p>
          )}
        </section>

        <section className="vp-result-card vp-payload-result">
          <h4><QrCode size={17} /> QR / Payload</h4>
          <div className="vp-payload-qr">
            {qrDataUrl ? <img src={qrDataUrl} alt="VP QR" /> : <QrCode size={64} />}
          </div>
          <dl className="vp-subject-list">
            <div><dt>VP ID</dt><dd className="mono">{presentation.presentationId}</dd></div>
            <div><dt>Format</dt><dd>{presentation.format}</dd></div>
            <div><dt>Evidence</dt><dd>{evidenceCount ? `${evidenceCount} DocumentReference` : "ไม่พบ"}</dd></div>
            <div><dt>VC Context</dt><dd>{contextCount ? `${contextCount} context` : "ไม่พบ"}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}

function VpDecisionRow({ label, detail, status }: { label: string; detail: string; status: "present" | "pending" | "warning" }) {
  const tone = status === "present" ? "blue" : status === "warning" ? "yellow" : "neutral";
  const text = status === "present" ? "present" : status === "warning" ? "review" : "pending";
  return (
    <div className="vp-decision-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <Badge tone={tone}>{text}</Badge>
    </div>
  );
}

function normalizeChecklist(value: unknown): TrustLayerChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item, index) => ({
    key: textValue(item.key) ?? textValue(item.label) ?? `check-${index + 1}`,
    label: textValue(item.label) ?? textValue(item.key) ?? `Check ${index + 1}`,
    ok: item.ok === true,
    detail: textValue(item.detail) ?? undefined
  }));
}

function resolveTrustTone(card: WalletCard, checklist: TrustLayerChecklistItem[]): {
  tone: "green" | "yellow" | "red";
  title: string;
  description: string;
  badge: string;
  badgeTone: "green" | "yellow" | "red";
  icon: ReactElement;
} {
  const checksFailed = checklist.some(item => !item.ok);
  if (card.credentialStatus !== "active") {
    return {
      tone: "red",
      title: "ต้องตรวจสอบสถานะเอกสาร",
      description: "Credential นี้ไม่ได้อยู่ในสถานะ active ผู้ตรวจควรตรวจ signature, status และ registry ก่อนใช้งาน",
      badge: "red",
      badgeTone: "red",
      icon: <ShieldX size={22} />
    };
  }
  if (checksFailed || !card.issuerDid || !card.holderDid) {
    return {
      tone: "yellow",
      title: "พร้อมส่งตรวจ แต่ยังมีเงื่อนไขต้องยืนยัน",
      description: "Wallet สร้าง VP ได้แล้ว แต่ verifier ต้องตรวจ trust registry, holder binding หรือ checklist เพิ่มเติม",
      badge: "yellow",
      badgeTone: "yellow",
      icon: <ShieldAlert size={22} />
    };
  }
  return {
    tone: "green",
    title: "พร้อมตรวจสอบแบบ green path",
    description: "Signature, issuer, holder binding, status และ schema พร้อมให้ verifier ตรวจตาม trust layer",
    badge: "green",
    badgeTone: "green",
    icon: <CheckCircle2 size={22} />
  };
}

function extractCredentialRenderData(card: WalletCard): {
  subject: Record<string, unknown>;
  hospital: Record<string, unknown>;
  issuer: Record<string, unknown>;
  patient: Record<string, unknown>;
  issuerName: string;
  subjectName: string;
} {
  const credential = isRecord(card.credentialData) ? card.credentialData : {};
  const subject = isRecord(credential.credentialSubject) ? credential.credentialSubject : credential;
  const humanDocument = isRecord(subject.humanDocument) ? subject.humanDocument : {};
  const renderData = isRecord(humanDocument.renderData) ? humanDocument.renderData : humanDocument;
  const hospital =
    pickRecord(renderData.hospital) ??
    pickRecord(renderData.issuer) ??
    pickRecord(subject.organization) ??
    pickRecord(subject.issuer) ??
    pickRecord(credential.issuer) ??
    {};
  const issuer = pickRecord(renderData.issuer) ?? pickRecord(credential.issuer) ?? hospital;
  const patient =
    pickRecord(renderData.patient) ??
    pickRecord(subject.patient) ??
    pickRecord(subject.staff) ??
    pickRecord(subject.holder) ??
    pickRecord(subject.person) ??
    {};
  const issuerName =
    textValue(hospital.nameTh) ??
    textValue(issuer.nameTh) ??
    textValue(hospital.nameEn) ??
    textValue(issuer.nameEn) ??
    textValue(issuer.name) ??
    "";
  const subjectName =
    textValue(patient.fullNameTh) ??
    textValue(patient.nameTh) ??
    textValue(patient.name) ??
    textValue(patient.fullNameEn) ??
    textValue(patient.nameEn) ??
    "Wallet holder";

  return { subject, hospital, issuer, patient, issuerName, subjectName };
}

function credentialContextCards(card: WalletCard, subject: Record<string, unknown>): Array<{ label: string; value: string; tone?: "critical" }> {
  const summary = pickRecord(subject.summary) ?? pickRecord(subject.clinical) ?? {};
  const coverage = pickRecord(subject.coverage) ?? pickRecord(subject.payer) ?? {};
  const referral = pickRecord(subject.referral) ?? {};
  const labReport = pickRecord(subject.labReport) ?? {};
  const contextMap: Record<string, Array<{ label: string; value: unknown; tone?: "critical" }>> = {
    patient_summary: [
      { label: "Allergies", value: summarizeList(summary.allergies) || summarizeList(subject.allergies), tone: "critical" },
      { label: "Medications", value: summarizeList(summary.medications) },
      { label: "Conditions", value: summarizeList(summary.conditions) }
    ],
    allergy_alert: [
      { label: "Allergies", value: summarizeList(subject.allergyIntolerances) || summarizeList(subject.allergies), tone: "critical" },
      { label: "Emergency instruction", value: subject.emergencyInstruction }
    ],
    medication_summary: [
      { label: "Medications", value: summarizeList(pickRecord(subject.medicationSummary)?.medications) }
    ],
    prescription: [
      { label: "Prescription items", value: summarizeList(pickRecord(subject.prescription)?.items) }
    ],
    lab_result: [
      { label: "Laboratory", value: labReport.laboratory },
      { label: "Observations", value: summarizeList(labReport.observations) }
    ],
    referral_vc: [
      { label: "From", value: referral.fromHospital ?? referral.from },
      { label: "To", value: referral.toHospital ?? referral.to },
      { label: "Reason", value: referral.reason }
    ],
    insurance_eligibility: [
      { label: "Payer", value: pickRecord(coverage.payer)?.nameEn ?? pickRecord(coverage.payer)?.name ?? coverage.payer },
      { label: "Status", value: coverage.status },
      { label: "Network", value: coverage.network }
    ]
  };

  return (contextMap[card.cardType] ?? [
    { label: "Document type", value: card.displayName },
    { label: "Credential status", value: card.credentialStatus }
  ])
    .map(item => ({ label: item.label, value: formatContextValue(item.value), tone: item.tone }))
    .filter(item => item.value && item.value !== "-");
}

function summarizeList(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.slice(0, 3).map(item => {
    if (!isRecord(item)) return String(item);
    return textValue(item.display) ??
      textValue(item.name) ??
      textValue(item.substance) ??
      textValue(item.medicationName) ??
      textValue(item.value) ??
      textValue(item.code) ??
      "record";
  }).join(", ");
}

function formatContextValue(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return summarizeList(value) ?? "-";
  if (isRecord(value)) {
    return textValue(value.nameTh) ??
      textValue(value.nameEn) ??
      textValue(value.name) ??
      textValue(value.display) ??
      Object.entries(value).slice(0, 3).map(([key, item]) => `${key}: ${formatContextValue(item)}`).join(" · ");
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return replacements[char] ?? char;
  });
}

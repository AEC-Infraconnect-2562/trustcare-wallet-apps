import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  Printer,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button, CredentialDocument } from "@trustcare/ui-web";
import {
  credentialRenderModelFromCard,
  walletDocumentRecordV2FromCard,
  walletDocumentTrustPresentation,
  type CredentialRenderField,
  type WalletCard,
} from "@trustcare/wallet-core";

export function CredentialDetailDialog({
  card,
  open,
  onClose,
  onShare,
}: {
  card: WalletCard | null;
  open: boolean;
  onClose: () => void;
  onShare: (card: WalletCard) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const paperViewportRef = useRef<HTMLDivElement | null>(null);
  const paperFrameRef = useRef<HTMLDivElement | null>(null);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [documentExpanded, setDocumentExpanded] = useState(false);
  const [paperLayout, setPaperLayout] = useState({
    scale: 1,
    width: 0,
    height: 0,
  });
  const renderModel = useMemo(
    () => (card ? credentialRenderModelFromCard(card) : null),
    [card],
  );
  const isIdentity = renderModel?.paper.formFactor.kind === "iso_id_1";
  const record = useMemo(
    () => (card ? walletDocumentRecordV2FromCard(card) : null),
    [card],
  );
  const trust = useMemo(
    () => (record ? walletDocumentTrustPresentation(record) : null),
    [record],
  );
  const details = useMemo(
    () =>
      renderModel
        ? uniqueDisplayFields([
            ...renderModel.paper.patientFields,
            ...renderModel.paper.metadataFields,
          ]).slice(0, 10)
        : [],
    [renderModel],
  );

  useLayoutEffect(() => {
    if (
      !open ||
      isIdentity ||
      !paperViewportRef.current ||
      !paperFrameRef.current
    ) {
      return;
    }
    const viewport = paperViewportRef.current;
    const frame = paperFrameRef.current;
    let frameId = 0;

    const updatePaperLayout = () => {
      const naturalWidth = frame.offsetWidth;
      if (!naturalWidth || !viewport.clientWidth) return;
      const scale = Math.min(1, viewport.clientWidth / naturalWidth);
      const naturalHeight = Math.max(frame.offsetHeight, frame.scrollHeight);
      const next = {
        scale,
        width: naturalWidth * scale,
        height: naturalHeight * scale,
      };
      setPaperLayout((previous) =>
        Math.abs(previous.scale - next.scale) < 0.001 &&
        Math.abs(previous.width - next.width) < 0.5 &&
        Math.abs(previous.height - next.height) < 0.5
          ? previous
          : next,
      );
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePaperLayout);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(viewport);
    observer.observe(frame);
    scheduleUpdate();
    void document.fonts?.ready.then(scheduleUpdate);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [card?.id, isIdentity, open]);

  useEffect(() => {
    setDocumentExpanded(false);
  }, [card?.id]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 940px)");
    const update = () => setMobileInspector(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement as HTMLElement | null;
    const mainPane = document.querySelector<HTMLElement>(".main-pane");
    document.body.classList.add("has-credential-inspector");
    if (mobileInspector) mainPane?.setAttribute("inert", "");
    const focusFrame = window.requestAnimationFrame(() => {
      (mobileInspector ? backButtonRef : closeButtonRef).current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      mainPane?.removeAttribute("inert");
      document.body.classList.remove("has-credential-inspector");
      window.removeEventListener("keydown", handleKeyDown);
      returnFocus?.focus?.();
    };
  }, [mobileInspector, onClose, open]);

  if (!open || !card || !renderModel || !record || !trust) return null;

  const issuerName =
    renderModel.paper.letterhead.nameTh ??
    renderModel.paper.letterhead.nameEn ??
    card.issuerHospitalName ??
    card.issuerDid ??
    "ไม่พบชื่อผู้ออกเอกสารในข้อมูลต้นฉบับ";
  const sourceLabel = credentialSourceLabel(card.sourceSystem);
  const checkedAt = record.trust.verifiedAt
    ? formatThaiDate(record.trust.verifiedAt)
    : null;

  function printCredential() {
    document.body.classList.add("printing-credential-inspector");
    const cleanup = () =>
      document.body.classList.remove("printing-credential-inspector");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  }

  return (
    <aside
      className="credential-inspector"
      role={mobileInspector ? "dialog" : "complementary"}
      aria-modal={mobileInspector || undefined}
      data-document-form-factor={renderModel.paper.formFactor.kind}
      aria-label={`รายละเอียด ${card.displayName}`}
      data-testid="credential-inspector"
    >
      <header className="credential-inspector-header">
        <button
          ref={backButtonRef}
          type="button"
          className="credential-inspector-back"
          aria-label="กลับไปหน้าก่อนหน้า"
          onClick={onClose}
        >
          <ArrowLeft size={20} />
          <span>กลับ</span>
        </button>
        <div>
          <p>เอกสารสุขภาพ</p>
          <h2>{card.displayName}</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="credential-inspector-close"
          aria-label="ปิดรายละเอียดเอกสาร"
          title="ปิดรายละเอียดเอกสาร"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>

      <div className="credential-inspector-scroll">
        <section
          ref={isIdentity ? undefined : paperViewportRef}
          className={`credential-inspector-preview${
            isIdentity ? " is-id-card" : " is-paper"
          }${documentExpanded ? " is-expanded" : ""}`}
          aria-label="ตัวอย่างเอกสารจากข้อมูลจริง"
        >
          {isIdentity ? (
            <CredentialDocument card={card} />
          ) : (
            <div
              className="credential-paper-scaled-viewport"
              style={{
                width: paperLayout.width
                  ? `${paperLayout.width}px`
                  : "100%",
                height: paperLayout.height
                  ? `${paperLayout.height}px`
                  : undefined,
              }}
            >
              <div
                ref={paperFrameRef}
                className="credential-paper-scaled-frame"
                style={{ transform: `scale(${paperLayout.scale})` }}
              >
                <CredentialDocument card={card} />
              </div>
            </div>
          )}
        </section>
        {!isIdentity ? (
          <button
            type="button"
            className="credential-open-full"
            onClick={() => setDocumentExpanded((value) => !value)}
          >
            <ExternalLink size={16} />
            {documentExpanded ? "ย่อเอกสาร" : "เปิดเอกสารเต็ม"}
          </button>
        ) : null}

        {details.length ? (
          <section className="credential-inspector-section">
            <div className="credential-inspector-section-title">
              <FileText size={18} />
              <h3>รายละเอียด</h3>
            </div>
            <dl className="credential-claim-list">
              {details.map((field) => (
                <div key={`${field.path ?? field.label}:${field.label}`}>
                  <dt>{field.label}</dt>
                  <dd>{displayValue(field.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="credential-inspector-section credential-provenance">
          <div className="credential-inspector-section-title">
            <ShieldCheck size={18} />
            <h3>ที่มาและการตรวจสอบ</h3>
          </div>
          <div className="credential-provenance-grid">
            <div>
              <span className="credential-provenance-icon" aria-hidden="true">
                <FileText />
              </span>
              <span>
                <small>ออกโดย</small>
                <strong>{issuerName}</strong>
              </span>
            </div>
            <div>
              <span className="credential-provenance-icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span>
                <small>รับจาก</small>
                <strong>{sourceLabel}</strong>
              </span>
            </div>
            <div className={`tone-${trust.tone}`}>
              <span className="credential-provenance-icon" aria-hidden="true">
                <CheckCircle2 />
              </span>
              <span>
                <small>สถานะการตรวจสอบ</small>
                <strong>{trust.labelTh}</strong>
                {trust.state === "verified" && checkedAt ? (
                  <em>{checkedAt}</em>
                ) : null}
              </span>
            </div>
          </div>
        </section>

        <details className="credential-security-details">
          <summary>
            <span>
              <ShieldCheck size={18} /> การตรวจสอบและความปลอดภัย
            </span>
            <ChevronDown size={18} />
          </summary>
          <div>
            {record.trust.checks.length ? (
              record.trust.checks.map((check) => (
                <p key={`${check.key}:${check.checkedAt ?? "pending"}`}>
                  <span>
                    <strong>{trustCheckName(check.key)}</strong>
                    <small>{check.detail ?? "ไม่มีรายละเอียดเพิ่มเติม"}</small>
                  </span>
                  <em className={`status-${check.status}`}>
                    {trustCheckLabel(check.status)}
                  </em>
                </p>
              ))
            ) : (
              <p>
                <span>
                  <strong>ยังไม่มีผลการตรวจสอบ</strong>
                  <small>Wallet จะไม่แสดงว่าเอกสารตรวจสอบแล้ว</small>
                </span>
              </p>
            )}
          </div>
        </details>
      </div>

      <footer className="credential-inspector-actions">
        <Button onClick={() => onShare(card)}>
          <Share2 size={18} /> แชร์เอกสารนี้
        </Button>
        <Button className="secondary" onClick={printCredential}>
          <Printer size={18} /> พิมพ์ / บันทึก PDF
        </Button>
      </footer>
    </aside>
  );
}

function uniqueDisplayFields(fields: CredentialRenderField[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (!isDisplayValue(field.value)) return false;
    const key = field.label.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDisplayValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(isDisplayValue);
  return false;
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (typeof value === "number") return new Intl.NumberFormat("th-TH").format(value);
  return String(value ?? "-");
}

function credentialSourceLabel(source?: string | null): string {
  const labels: Record<string, string> = {
    trustcare_portal: "TrustCare Portal",
    payer_adapter: "Payer / ผู้รับผิดชอบเอกสาร",
    wallet: "Wallet นี้",
    imported: "นำเข้าโดยผู้ใช้",
    shl: "Smart Health Link",
  };
  if (!source) return "ไม่พบแหล่งที่มาในข้อมูลต้นฉบับ";
  return labels[source] ?? source;
}

function trustCheckLabel(status: string): string {
  const labels: Record<string, string> = {
    passed: "ผ่าน",
    failed: "ไม่ผ่าน",
    pending: "รอตรวจ",
    warning: "ต้องตรวจเพิ่ม",
  };
  return labels[status] ?? status;
}

function trustCheckName(key: string): string {
  const labels: Record<string, string> = {
    proof: "ลายเซ็นและหลักฐาน",
    issuer: "ผู้ออกเอกสาร",
    status: "สถานะเอกสาร",
    expiry: "วันหมดอายุ",
    holder: "ผู้ถือเอกสาร",
    policy: "นโยบายการใช้งาน",
  };
  return labels[key] ?? key;
}

function formatThaiDate(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

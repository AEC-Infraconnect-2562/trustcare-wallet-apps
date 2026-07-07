import { AlertTriangle, CheckCircle2, FilePlus2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@trustcare/ui-web";
import { getCanonicalDocumentTypeCopy } from "@trustcare/wallet-core";
import type {
  DocumentPackageScope,
  DocumentRequestFormat,
  DocumentRequestOption,
  DocumentRequestReturnChannel,
  DocumentRequestSource,
  buildDocumentRequestPlan,
} from "@trustcare/wallet-core";

type PlannerPlan = ReturnType<typeof buildDocumentRequestPlan>;

export function AcquisitionPlanner({
  mode,
  plan,
  scope,
  selectedReturnChannel,
  onSource,
  onFormat,
  onScope,
  onReturnChannel,
  controls,
  onCancel,
  onSubmit,
  submitDisabled,
}: {
  mode: "request" | "import";
  plan: PlannerPlan;
  scope: DocumentPackageScope;
  selectedReturnChannel: DocumentRequestReturnChannel;
  onSource: (source: DocumentRequestSource) => void;
  onFormat: (format: DocumentRequestFormat) => void;
  onScope: (scope: DocumentPackageScope) => void;
  onReturnChannel: (channel: DocumentRequestReturnChannel) => void;
  controls: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
}) {
  const requestMode = mode === "request";
  return (
    <div className="acquisition-planner">
      <section className="acquisition-hero">
        <div>
          <span className="eyebrow">{requestMode ? "ขอเอกสาร" : "นำเข้าเอกสาร"}</span>
          <h3>{plan.serviceLabel}</h3>
          <p>
            {requestMode
              ? "เลือกแหล่งข้อมูลและรูปแบบผลลัพธ์ก่อนส่งคำขอ เอกสารที่ได้จะกลับเข้ากระเป๋านี้ตามช่องทางที่เลือก"
              : "เลือกวิธีนำเข้าและตรวจ trust state ก่อนบันทึกเป็นเอกสารใน Wallet"}
          </p>
        </div>
        <span className="acquisition-count">{plan.selectedRequirements.length} รายการ</span>
      </section>

      <section className="acquisition-section">
        <span className="eyebrow">เอกสารในงานนี้</span>
        <div className="acquisition-requirements">
          {plan.selectedRequirements.map((requirement) => (
            <article key={requirement.key}>
              <strong>{requirement.label}</strong>
              <small>{requirement.required ? "จำเป็น" : "แนะนำ"}</small>
              <em title={requirement.documentTypes.join(", ")}>
                {requirement.documentTypes
                  .map((type) => getCanonicalDocumentTypeCopy(type).label)
                  .join(", ")}
              </em>
            </article>
          ))}
        </div>
      </section>

      <section className="acquisition-grid">
        <PlannerOptionSection
          title={requestMode ? "ขอไปที่ไหน" : "นำเข้าจากที่ไหน"}
          options={plan.sourceOptions}
          activeId={plan.selectedSource}
          onSelect={onSource}
        />
        <div className="acquisition-section">
          <span className="eyebrow">รูปแบบเอกสาร</span>
          <div className="mini-toggle-group">
            <button
              type="button"
              className={scope === "single_document" ? "active" : ""}
              onClick={() => onScope("single_document")}
            >
              เอกสารเดี่ยว
            </button>
            <button
              type="button"
              className={scope === "document_bundle" ? "active" : ""}
              onClick={() => onScope("document_bundle")}
            >
              Document Bundle
            </button>
          </div>
          <PlannerOptionGrid
            options={plan.formatOptions}
            activeId={plan.selectedFormat}
            onSelect={onFormat}
          />
        </div>
      </section>

      <section className="acquisition-grid">
        <PlannerOptionSection
          title="รับกลับอย่างไร"
          options={plan.returnChannelOptions}
          activeId={selectedReturnChannel}
          onSelect={onReturnChannel}
        />
        <section className="acquisition-section">
          <span className="eyebrow">เงื่อนไขตามรูปแบบ</span>
          {controls}
        </section>
      </section>

      <section className="acquisition-review">
        <div>
          <span className="eyebrow">ตรวจสอบก่อนส่ง</span>
          <h3>{requestMode ? "ส่งคำขอเอกสาร" : "สร้างงานนำเข้า"}</h3>
          <p>
            เอกสารที่ผู้ใช้ให้มาเองจะยังไม่ถือว่า verified จนกว่า trusted issuer จะลงนาม
            ส่วน Certified SHL ต้องมี Manifest VP และ Holder VC หลังผ่าน TrustCare Maker/Checker
          </p>
        </div>
        <div className="acquisition-message-stack">
          {plan.warnings.map((warning) => (
            <p key={warning} className="warning">
              <AlertTriangle size={16} />
              {warning}
            </p>
          ))}
          {plan.nextSteps.map((step) => (
            <p key={step}>
              <CheckCircle2 size={16} />
              {step}
            </p>
          ))}
        </div>
        <div className="document-flow-actions">
          <Button className="secondary" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {requestMode ? <FilePlus2 size={18} /> : <Upload size={18} />}
            {requestMode ? "ส่งคำขอเอกสาร" : "สร้างงานนำเข้า"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function PlannerOptionSection<T extends string>({
  title,
  options,
  activeId,
  onSelect,
}: {
  title: string;
  options: DocumentRequestOption<T>[];
  activeId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <section className="acquisition-section">
      <span className="eyebrow">{title}</span>
      <PlannerOptionGrid options={options} activeId={activeId} onSelect={onSelect} />
    </section>
  );
}

function PlannerOptionGrid<T extends string>({
  options,
  activeId,
  onSelect,
}: {
  options: DocumentRequestOption<T>[];
  activeId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="planner-option-grid">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={[
            "planner-option",
            option.id === activeId ? "active" : "",
            option.enabled ? "" : "disabled",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={!option.enabled}
          onClick={() => option.enabled && onSelect(option.id)}
          aria-label={
            option.enabled
              ? `${option.label}: ${option.description}`
              : `${option.label}: ${option.reasonDisabled ?? "ใช้ไม่ได้กับตัวเลือกนี้"}`
          }
        >
          <span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </span>
          {option.recommended && <em>แนะนำ</em>}
          {!option.enabled && option.reasonDisabled && <small>{option.reasonDisabled}</small>}
        </button>
      ))}
    </div>
  );
}

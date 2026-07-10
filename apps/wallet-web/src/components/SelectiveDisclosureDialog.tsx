import { useMemo } from "react";
import { AlertTriangle, ArrowLeft, FileText, Shield, X } from "lucide-react";
import { Button, IconButton } from "@trustcare/ui-web";
import {
  extractSelectableFields,
  type WalletCard,
} from "@trustcare/wallet-core";

export function SelectiveDisclosureDialog({
  card,
  open,
  onClose,
  onConfirm,
}: {
  card: WalletCard | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (fields: string[]) => void;
}) {
  const fields = useMemo(
    () => extractSelectableFields(card?.credentialData),
    [card],
  );

  if (!open || !card) return null;

  return (
    <div
      className="modal-backdrop selective-modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="compact-dialog">
        <header className="modal-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button
                type="button"
                className="dialog-back-button"
                onClick={onClose}
              >
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">เอกสาร / ตรวจข้อมูลก่อนแชร์</span>
            </div>
            <div className="dialog-heading-row">
              <Shield size={22} />
              <strong>ตรวจข้อมูลก่อนแชร์</strong>
            </div>
          </div>
          <IconButton aria-label="ปิดหน้าตรวจข้อมูลก่อนแชร์" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>

        <section className="selective-disclosure-intro disclosure-capability-warning">
          <div>
            <span className="eyebrow">รูปแบบการแชร์ของเอกสารนี้</span>
            <strong>ส่งเอกสารที่เลือกทั้งฉบับ</strong>
            <p>
              ผู้ออกเอกสารยังไม่ได้ให้ credential ที่เลือกเปิดเผยบางส่วนได้
              ระบบจึงไม่ตัดข้อมูลหรือสร้างหลักฐานรูปแบบอื่นแทนโดยพลการ
            </p>
          </div>
          <AlertTriangle size={24} />
        </section>

        <div className="selective-disclosure-summary" aria-live="polite">
          <span>
            <FileText size={16} />
            ข้อมูลในเอกสาร <strong>{fields.length}</strong> รายการ
          </span>
        </div>

        <div className="field-list disclosure-readonly-list">
          {fields.map((field) => (
            <div className="field-row selected" key={field.path}>
              <span className="field-row-content">
                <strong>{field.label}</strong>
                <small className="field-row-value">
                  {field.valuePreview || "-"}
                </small>
              </span>
              <span className="field-row-state">รวมในเอกสาร</span>
            </div>
          ))}
          {!fields.length ? (
            <p className="muted">
              ไม่พบรายการข้อมูลสำหรับแสดงตัวอย่าง แต่ระบบจะคง credential
              ต้นฉบับไว้ครบถ้วน
            </p>
          ) : null}
        </div>

        <div className="dialog-actions">
          <Button className="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => onConfirm([])}>สร้าง QR เอกสารทั้งฉบับ</Button>
        </div>
      </div>
    </div>
  );
}

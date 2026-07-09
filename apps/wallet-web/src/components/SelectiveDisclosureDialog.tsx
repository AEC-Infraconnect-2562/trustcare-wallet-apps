import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Shield,
  Unlock,
  X,
} from "lucide-react";
import { Button, IconButton } from "@trustcare/ui-web";
import {
  extractSelectableFields,
  requireAtLeastOneField,
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  if (!open || !card) return null;

  const checkedFor = (path: string, recommended: boolean) =>
    selected[path] ?? recommended;
  const currentSelected = fields
    .filter((field) => checkedFor(field.path, field.recommended))
    .map((field) => field.path);
  const selectedCount = currentSelected.length;
  const hiddenCount = Math.max(fields.length - selectedCount, 0);

  function applyAll(value: boolean) {
    setError("");
    setSelected(Object.fromEntries(fields.map((field) => [field.path, value])));
  }

  function applyRecommended() {
    setError("");
    setSelected(
      Object.fromEntries(
        fields.map((field) => [field.path, field.recommended]),
      ),
    );
  }

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
              <span className="dialog-crumbs">เอกสาร / เลือกข้อมูลเปิดเผย</span>
            </div>
            <div className="dialog-heading-row">
              <Shield size={22} />
              <strong>Selective Disclosure</strong>
            </div>
          </div>
          <IconButton aria-label="Close selective disclosure" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        <section className="selective-disclosure-intro">
          <div>
            <span className="eyebrow">VP DISCLOSURE POLICY</span>
            <p>
              เลือกเฉพาะ claim ที่จะรวมใน VP สำหรับ verifier
              ข้อมูลที่ไม่เลือกจะไม่ถูกส่งใน payload นี้
            </p>
          </div>
          <Shield size={24} />
        </section>
        <div className="selective-disclosure-summary" aria-live="polite">
          <span>
            <Eye size={16} />
            เปิดเผย <strong>{selectedCount}</strong>
          </span>
          <span>
            <EyeOff size={16} />
            ซ่อน <strong>{hiddenCount}</strong>
          </span>
          <span>
            <CheckCircle2 size={16} />
            ทั้งหมด <strong>{fields.length}</strong>
          </span>
        </div>
        <div className="selective-disclosure-controls">
          <Button
            type="button"
            className="secondary"
            onClick={() => applyAll(true)}
          >
            เลือกทั้งหมด
          </Button>
          <Button
            type="button"
            className="secondary"
            onClick={applyRecommended}
          >
            ตามคำแนะนำ
          </Button>
          <Button
            type="button"
            className="secondary"
            onClick={() => applyAll(false)}
          >
            ซ่อนทั้งหมด
          </Button>
        </div>
        <div className="field-list">
          {fields.map((field) => {
            const checked = checkedFor(field.path, field.recommended);
            return (
              <label
                key={field.path}
                className={`field-row ${checked ? "selected" : "locked"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    setError("");
                    setSelected((previous) => ({
                      ...previous,
                      [field.path]: event.target.checked,
                    }));
                  }}
                />
                <span className="field-row-content">
                  <strong>{field.label}</strong>
                  <small className="field-row-path">{field.path}</small>
                  <small className="field-row-value">
                    {field.valuePreview}
                  </small>
                </span>
                <span className="field-row-state">
                  {checked ? <Unlock size={16} /> : <Lock size={16} />}
                  {checked ? "เปิดเผย" : "ซ่อน"}
                </span>
              </label>
            );
          })}
        </div>
        {error ? <p className="selective-error">{error}</p> : null}
        <div className="dialog-actions">
          <Button className="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => {
              try {
                onConfirm(requireAtLeastOneField(currentSelected));
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "กรุณาเลือกข้อมูล",
                );
              }
            }}
          >
            แชร์ VP
          </Button>
        </div>
      </div>
    </div>
  );
}

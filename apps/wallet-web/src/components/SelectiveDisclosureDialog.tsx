import { useMemo, useState } from "react";
import { Shield, X } from "lucide-react";
import { Button, IconButton } from "@trustcare/ui-web";
import { extractSelectableFields, requireAtLeastOneField, type WalletCard } from "@trustcare/wallet-core";

export function SelectiveDisclosureDialog({
  card,
  open,
  onClose,
  onConfirm
}: {
  card: WalletCard | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (fields: string[]) => void;
}) {
  const fields = useMemo(() => extractSelectableFields(card?.credentialData), [card]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  if (!open || !card) return null;

  const currentSelected = fields.filter(field => selected[field.path] ?? field.recommended).map(field => field.path);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="compact-dialog">
        <header className="modal-header">
          <div>
            <Shield size={22} />
            <strong>Selective Disclosure</strong>
          </div>
          <IconButton aria-label="Close selective disclosure" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <p className="muted">เลือกเฉพาะข้อมูลที่ต้องการเปิดเผยให้ verifier เห็น</p>
        <div className="field-list">
          {fields.map(field => (
            <label key={field.path} className="field-row">
              <input
                type="checkbox"
                checked={selected[field.path] ?? field.recommended}
                onChange={event => setSelected(previous => ({ ...previous, [field.path]: event.target.checked }))}
              />
              <span>
                <strong>{field.label}</strong>
                <small>{field.valuePreview}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <Button className="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button
            onClick={() => {
              try {
                onConfirm(requireAtLeastOneField(currentSelected));
              } catch (error) {
                alert(error instanceof Error ? error.message : "กรุณาเลือกข้อมูล");
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


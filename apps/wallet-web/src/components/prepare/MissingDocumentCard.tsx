import { AlertTriangle, FilePlus2, Upload } from "lucide-react";
import type { MissingDocumentCardModel } from "@trustcare/wallet-core";

export function MissingDocumentCard({
  card,
  onRequest,
  onImport,
}: {
  card: MissingDocumentCardModel;
  onRequest: () => void;
  onImport: () => void;
}) {
  const prefersImport = card.source === "patient_upload";
  return (
    <article className="missing-document-card" aria-label={card.ariaLabel}>
      <div className="missing-document-icon">
        <AlertTriangle size={18} />
      </div>
      <div>
        <strong>{card.label}</strong>
        <small>{card.helperText}</small>
        <div className="missing-document-meta">
          <span>{card.sourceLabel}</span>
          <span>{card.formatLabel}</span>
        </div>
      </div>
      <div className="missing-document-actions">
        <button type="button" onClick={prefersImport ? onImport : onRequest}>
          {prefersImport ? <Upload size={16} /> : <FilePlus2 size={16} />}
          {card.primaryActionLabel}
        </button>
        {!prefersImport && (
          <button type="button" className="secondary" onClick={onImport}>
            <Upload size={16} />
            นำเข้าแทน
          </button>
        )}
      </div>
    </article>
  );
}

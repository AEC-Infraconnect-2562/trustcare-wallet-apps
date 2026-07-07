import { AlertTriangle, CheckCircle2, FileSearch } from "lucide-react";
import type { ImportDetectionModel } from "@trustcare/wallet-core";

export function ImportDetectionPanel({
  detection,
}: {
  detection: ImportDetectionModel;
}) {
  const icon =
    detection.canImport && detection.trustState !== "pending_review" ? (
      <CheckCircle2 size={18} />
    ) : detection.canImport ? (
      <FileSearch size={18} />
    ) : (
      <AlertTriangle size={18} />
    );

  return (
    <aside className={`import-detection-panel ${detection.trustState}`}>
      <div className="import-detection-heading">
        {icon}
        <span>
          <strong>{detection.formatLabel}</strong>
          <small>{detection.trustLabel}</small>
        </span>
      </div>
      <p>{detection.trustDescription}</p>
      <div className="import-detection-action">
        <strong>ขั้นตอนถัดไป</strong>
        <span>{detection.recommendedAction}</span>
      </div>
      {detection.technicalHint && (
        <details className="technical-details">
          <summary>รายละเอียดทางเทคนิค</summary>
          <p>{detection.technicalHint}</p>
        </details>
      )}
    </aside>
  );
}

import { FilePlus2, Send } from "lucide-react";
import type { CSSProperties } from "react";
import type { ReadinessSummaryModel } from "@trustcare/wallet-core";
import { Button } from "@trustcare/ui-web";

export function ReadinessSummaryCard({
  summary,
  onPrimary,
  onImport,
}: {
  summary: ReadinessSummaryModel;
  onPrimary: () => void;
  onImport: () => void;
}) {
  return (
    <section className="readiness-summary-card" aria-label={summary.label}>
      <div
        className={
          summary.criticalReady
            ? "readiness-ring ready"
            : "readiness-ring warning"
        }
        style={{ "--score": summary.score } as CSSProperties}
      >
        {summary.score}%
      </div>
      <div className="readiness-summary-copy">
        <span className="eyebrow">ความพร้อมบริการ</span>
        <h3>{summary.label}</h3>
        <p>{summary.readyText}</p>
        <div className="readiness-stat-row">
          <span>{summary.requiredText}</span>
          <span>{summary.recommendedText}</span>
        </div>
      </div>
      <div className="readiness-summary-actions">
        <Button
          onClick={onPrimary}
          className={summary.criticalReady ? "green" : "purple"}
        >
          {summary.criticalReady ? <Send size={18} /> : <FilePlus2 size={18} />}
          {summary.primaryCtaLabel}
        </Button>
        {!summary.criticalReady && (
          <Button className="secondary" onClick={onImport}>
            นำเข้าเอกสาร
          </Button>
        )}
      </div>
    </section>
  );
}

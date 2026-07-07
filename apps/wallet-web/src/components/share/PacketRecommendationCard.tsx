import { AlertTriangle, CheckCircle2, Layers3 } from "lucide-react";
import type { PacketRecommendation } from "@trustcare/wallet-core";

export function PacketRecommendationCard({
  recommendation,
}: {
  recommendation: PacketRecommendation;
}) {
  return (
    <article className={`packet-recommendation-card ${recommendation.mode}`}>
      <div className="packet-recommendation-icon">
        <Layers3 size={20} />
      </div>
      <div>
        <span className="eyebrow">รูปแบบที่แนะนำ</span>
        <h3>{recommendation.label}</h3>
        <p>{recommendation.description}</p>
        <small>{recommendation.reason}</small>
        {recommendation.warnings.map((warning) => (
          <span key={warning} className="packet-warning">
            <AlertTriangle size={15} />
            {warning}
          </span>
        ))}
        {!recommendation.warnings.length && (
          <span className="packet-ok">
            <CheckCircle2 size={15} />
            เหมาะกับเอกสารและวัตถุประสงค์ที่เลือก
          </span>
        )}
      </div>
    </article>
  );
}

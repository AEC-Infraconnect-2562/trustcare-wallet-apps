import { Fingerprint, QrCode, Send } from "lucide-react";
import type {
  PacketRecommendation,
  ReadinessContext,
  ReadinessResult,
  SharePackageMode,
  ShareValidationResult,
} from "@trustcare/wallet-core";
import { readinessContextLabels } from "@trustcare/wallet-core";
import { PacketRecommendationCard } from "./PacketRecommendationCard";

export function SharePacketComposer({
  purpose,
  recipient,
  readiness,
  selectedCount,
  biometricRequired,
  biometricReady,
  recommendation,
  mode,
  modeLabel,
  modeDescription,
  validation,
}: {
  purpose: ReadinessContext;
  recipient: string;
  readiness: Pick<ReadinessResult, "requiredReady" | "requiredTotal" | "recommendedReady" | "recommendedTotal" | "criticalReady">;
  selectedCount: number;
  biometricRequired: boolean;
  biometricReady: boolean;
  recommendation: PacketRecommendation;
  mode: SharePackageMode;
  modeLabel: string;
  modeDescription: string;
  validation: Pick<
    ShareValidationResult,
    | "publishEnabled"
    | "requiredMissingCount"
    | "optionalMissingCount"
    | "blockers"
    | "warnings"
  >;
}) {
  const hasIssues = validation.blockers.length > 0 || validation.warnings.length > 0;
  return (
    <section className="share-packet-composer">
      <div className="share-packet-summary">
        <span className="eyebrow">ชุดแชร์เอกสาร</span>
        <h2>ส่งข้อมูลให้ {recipient || "ผู้รับปลายทาง"}</h2>
        <p>{readinessContextLabels[purpose].purpose}</p>
        <div className="share-packet-facts">
          <span>
            <Send size={16} />
            {readinessContextLabels[purpose].th}
          </span>
          <span>
            <QrCode size={16} />
            เลือกแล้ว {selectedCount} เอกสาร
          </span>
          <span>
            <Send size={16} />
            {modeLabel}
          </span>
          <span className={biometricRequired && !biometricReady ? "warning" : ""}>
            <Fingerprint size={16} />
            {biometricRequired
              ? biometricReady
                ? "ยืนยันตัวตนพร้อม"
                : "ต้องยืนยันตัวตน"
            : "Biometric เป็นตัวเลือก"}
          </span>
        </div>
        <div className={`share-mode-summary ${mode}`}>
          <strong>{modeLabel}</strong>
          <small>{modeDescription}</small>
        </div>
        <div className="readiness-mini-progress">
          <strong>
            จำเป็น {readiness.requiredReady}/{readiness.requiredTotal}
          </strong>
          <strong>
            แนะนำ {readiness.recommendedReady}/{readiness.recommendedTotal}
          </strong>
          <em>{readiness.criticalReady ? "พร้อมแชร์" : "ยังขาดเอกสารจำเป็น"}</em>
        </div>
        {hasIssues && (
          <div className="share-validation-summary">
            {validation.blockers.map((issue) => (
              <span key={issue.key} className="blocked">
                {issue.message}
              </span>
            ))}
            {validation.warnings.map((issue) => (
              <span key={issue.key} className="warning">
                {issue.message}
              </span>
            ))}
          </div>
        )}
      </div>
      <PacketRecommendationCard recommendation={recommendation} />
    </section>
  );
}

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { DisabledReason as DisabledReasonModel } from "@trustcare/wallet-core";

export function DisabledReason({
  reason,
}: {
  reason: DisabledReasonModel | null;
}) {
  if (!reason) {
    return (
      <div className="disabled-reason ok" aria-live="polite">
        <CheckCircle2 size={16} />
        <span>พร้อมดำเนินการ</span>
      </div>
    );
  }

  return (
    <div
      className={`disabled-reason ${reason.severity}`}
      aria-label={reason.ariaLabel}
      aria-live="polite"
    >
      <AlertTriangle size={16} />
      <span>
        <strong>{reason.reason}</strong>
        <small>{reason.fix}</small>
      </span>
    </div>
  );
}

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { TrustLayerChecklistItem } from "@trustcare/wallet-core";

export function TrustChecklist({
  items,
  title = "Trust checklist",
}: {
  items: TrustLayerChecklistItem[];
  title?: string;
}) {
  return (
    <section className="trust-checklist">
      <div className="trust-checklist-title">
        <ShieldCheck size={18} />
        <strong>{title}</strong>
      </div>
      <div className="trust-checklist-items">
        {items.map((item) => (
          <article key={item.key} className={item.ok ? "ok" : "warning"}>
            {item.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>
              <strong>{item.label}</strong>
              {item.detail && <small>{item.detail}</small>}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

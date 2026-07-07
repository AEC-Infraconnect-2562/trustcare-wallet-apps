import { CheckCircle2 } from "lucide-react";
import type {
  PurposePickerCardModel,
  ReadinessContext,
} from "@trustcare/wallet-core";
import { getCanonicalDocumentTypeCopy } from "@trustcare/wallet-core";

export function PurposePickerCard({
  card,
  onSelect,
}: {
  card: PurposePickerCardModel;
  onSelect: (context: ReadinessContext) => void;
}) {
  return (
    <button
      type="button"
      className={card.selected ? "purpose-picker-card selected" : "purpose-picker-card"}
      onClick={() => onSelect(card.context)}
      aria-label={card.ariaLabel}
      aria-pressed={card.selected}
    >
      <span className="purpose-picker-card-header">
        <strong>{card.label}</strong>
        {card.selected && <CheckCircle2 size={17} />}
      </span>
      <small>{card.purpose}</small>
      <span className="purpose-type-row">
        {card.primaryDocumentTypes.map((type) => (
          <em key={type} title={type}>
            {getCanonicalDocumentTypeCopy(type).label}
          </em>
        ))}
      </span>
    </button>
  );
}

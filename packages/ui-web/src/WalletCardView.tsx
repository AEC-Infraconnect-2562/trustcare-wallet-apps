import { gradientForCardType } from "@trustcare/design-tokens";
import type { WalletCard } from "@trustcare/wallet-core";
import { labelForCredentialType } from "@trustcare/wallet-core";
import { BadgeCheck, QrCode } from "lucide-react";

export function WalletCardView({ card, onClick }: { card: WalletCard; onClick?: () => void }) {
  const [from, to] = gradientForCardType(card.cardType);
  const disabled = card.credentialStatus !== "active";
  return (
    <button
      type="button"
      className={`wallet-card-tile${disabled ? " wallet-card-disabled" : ""}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      onClick={onClick}
    >
      <span className="wallet-card-icon"><BadgeCheck size={24} /></span>
      <span className="wallet-card-issuer">{card.issuerHospitalName ?? "TrustCare Network"}</span>
      <strong>{card.displayName || labelForCredentialType(card.cardType)}</strong>
      <span className="wallet-card-meta">
        {card.expiresAt ? `หมดอายุ ${new Date(card.expiresAt).toLocaleDateString("th-TH")}` : "ไม่มีวันหมดอายุ"}
      </span>
      <span className="wallet-card-verified"><QrCode size={16} /> VP</span>
    </button>
  );
}


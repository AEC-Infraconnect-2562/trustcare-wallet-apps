import { gradientForCardType } from "@trustcare/design-tokens";
import type { PhotoCandidate, WalletCard } from "@trustcare/wallet-core";
import { initialsFromName, labelForCredentialType, photoCandidatesForCard } from "@trustcare/wallet-core";
import { BadgeCheck, QrCode } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";

const photoDocumentTypes = new Set(["patient_identity", "staff_identity", "travel_document_verification"]);

export function WalletCardView({ card, onClick }: { card: WalletCard; onClick?: () => void }) {
  const [from, to] = gradientForCardType(card.cardType);
  const disabled = card.credentialStatus !== "active";
  const photoCandidates = photoDocumentTypes.has(card.cardType) ? photoCandidatesForCard(card) : [];
  const photoInitials = initialsFromName(card.displayNameEn ?? card.displayName ?? labelForCredentialType(card.cardType));
  return (
    <button
      type="button"
      className={`wallet-card-tile${disabled ? " wallet-card-disabled" : ""}`}
      style={{ "--card-accent": from, "--card-accent-2": to } as CSSProperties}
      onClick={onClick}
    >
      <span className="wallet-card-top">
        <span className={photoCandidates.length ? "wallet-card-icon wallet-card-photo" : "wallet-card-icon"}>
          {photoCandidates.length ? (
            <WalletCardPhoto candidates={photoCandidates} initials={photoInitials} />
          ) : (
            <BadgeCheck size={20} />
          )}
        </span>
        <span className="wallet-card-status">active</span>
      </span>
      <span className="wallet-card-body">
        <span className="wallet-card-issuer">{card.issuerHospitalName ?? "TrustCare Network"}</span>
        <strong>{card.displayName || labelForCredentialType(card.cardType)}</strong>
      </span>
      <span className="wallet-card-footer">
        <span className="wallet-card-meta">
          {card.expiresAt ? `หมดอายุ ${new Date(card.expiresAt).toLocaleDateString("th-TH")}` : "ไม่มีวันหมดอายุ"}
        </span>
        <span className="wallet-card-verified"><QrCode size={14} /> VP</span>
      </span>
    </button>
  );
}

function WalletCardPhoto({ candidates, initials }: { candidates: PhotoCandidate[]; initials: string }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidate = candidates[candidateIndex];

  if (!candidate) {
    return <span className="wallet-card-photo-fallback">{initials || "TC"}</span>;
  }

  return (
    <img
      key={candidate.url}
      src={candidate.url}
      alt=""
      onError={() => setCandidateIndex((index) => index + 1)}
    />
  );
}

import { gradientForCardType } from "@trustcare/design-tokens";
import type { PhotoCandidate, WalletCard } from "@trustcare/wallet-core";
import {
  canPresentCredential,
  credentialStatusLabel,
  initialsFromName,
  labelForCredentialType,
  photoCandidatesForCard,
} from "@trustcare/wallet-core";
import { BadgeCheck, QrCode } from "lucide-react";
import type { CSSProperties } from "react";
import { useLoadedPhotoCandidate } from "./useLoadedPhotoCandidate";

const photoDocumentTypes = new Set([
  "patient_identity",
  "staff_identity",
  "travel_document_verification",
]);

export function WalletCardView({
  card,
  onClick,
}: {
  card: WalletCard;
  onClick?: () => void;
}) {
  const [from, to] = gradientForCardType(card.cardType);
  const disabled = !canPresentCredential(card);
  const photoCandidates = photoDocumentTypes.has(card.cardType)
    ? photoCandidatesForCard(card)
    : [];
  const photoInitials = initialsFromName(
    card.displayNameEn ??
      card.displayName ??
      labelForCredentialType(card.cardType),
  );
  return (
    <button
      type="button"
      className={`wallet-card-tile${disabled ? " wallet-card-disabled" : ""}`}
      style={{ "--card-accent": from, "--card-accent-2": to } as CSSProperties}
      onClick={onClick}
    >
      <span className="wallet-card-top">
        <span
          className={
            photoCandidates.length
              ? "wallet-card-icon wallet-card-photo"
              : "wallet-card-icon"
          }
        >
          {photoCandidates.length ? (
            <WalletCardPhoto
              candidates={photoCandidates}
              initials={photoInitials}
            />
          ) : (
            <BadgeCheck size={20} />
          )}
        </span>
        <span className="wallet-card-status">
          {credentialStatusLabel(card.credentialStatus)}
        </span>
      </span>
      <span className="wallet-card-body">
        <span className="wallet-card-issuer">
          {card.issuerHospitalName ?? "TrustCare Network"}
        </span>
        <strong>
          {card.displayName || labelForCredentialType(card.cardType)}
        </strong>
      </span>
      <span className="wallet-card-footer">
        <span className="wallet-card-meta">
          {card.expiresAt
            ? `หมดอายุ ${new Date(card.expiresAt).toLocaleDateString("th-TH")}`
            : "ไม่มีวันหมดอายุ"}
        </span>
        <span className="wallet-card-verified">
          <QrCode size={14} /> VP
        </span>
      </span>
    </button>
  );
}

function WalletCardPhoto({
  candidates,
  initials,
}: {
  candidates: PhotoCandidate[];
  initials: string;
}) {
  const { candidate, imageSrc, isLoaded, markFailed, markLoaded } =
    useLoadedPhotoCandidate(candidates);

  if (!candidate || !imageSrc) {
    return (
      <span className="wallet-card-photo-fallback">{initials || "TC"}</span>
    );
  }

  return (
    <>
      <span className="wallet-card-photo-fallback">{initials || "TC"}</span>
      <img
        className={isLoaded ? "loaded" : ""}
        key={imageSrc}
        src={imageSrc}
        alt=""
        onLoad={markLoaded}
        onError={markFailed}
      />
    </>
  );
}

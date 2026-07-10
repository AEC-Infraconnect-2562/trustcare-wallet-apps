import { gradientForCardType } from "@trustcare/design-tokens";
import type { PhotoCandidate, WalletCard } from "@trustcare/wallet-core";
import {
  canPresentCredential,
  credentialRenderModelFromCard,
  credentialStatusLabel,
  initialsFromName,
  labelForCredentialType,
  photoBearingCredentialTypes,
  photoCandidatesForCard,
  presentationEnvelopeFromWalletCard,
} from "@trustcare/wallet-core";
import { BadgeCheck, QrCode } from "lucide-react";
import type { CSSProperties } from "react";
import { useLoadedPhotoCandidate } from "./useLoadedPhotoCandidate";

const photoDocumentTypes = new Set<string>(photoBearingCredentialTypes);

export function WalletCardView({
  card,
  onClick,
}: {
  card: WalletCard;
  onClick?: () => void;
}) {
  const [from, to] = gradientForCardType(card.cardType);
  const renderModel = credentialRenderModelFromCard(card);
  const envelope = presentationEnvelopeFromWalletCard(card);
  const lifecycleStatus =
    textValue(renderModel.document.status) ?? String(card.credentialStatus);
  const expiresAt = textValue(renderModel.document.expiresAt) ?? card.expiresAt;
  const disabled = !canPresentCredential({
    credentialStatus: lifecycleStatus,
    expiresAt,
  });
  const title =
    textValue(renderModel.document.titleTh) ??
    textValue(renderModel.document.title) ??
    envelope.display.title ??
    card.displayName;
  const issuerName =
    textValue(renderModel.hospital.nameTh) ??
    textValue(renderModel.hospital.nameEn) ??
    envelope.issuer?.name ??
    card.issuerHospitalName ??
    "TrustCare Network";
  const photoCandidates = photoDocumentTypes.has(renderModel.documentType)
    ? photoCandidatesForCard(card)
    : [];
  const photoInitials = initialsFromName(
    envelope.subject.displayName ??
      card.displayNameEn ??
      title ??
      labelForCredentialType(renderModel.documentType),
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
        <span
          className={`wallet-card-status tone-${envelope.trust.badge}`}
          title={`Lifecycle: ${credentialStatusLabel(lifecycleStatus)}`}
        >
          {trustStatusLabel(envelope.trust.status)}
        </span>
      </span>
      <span className="wallet-card-body">
        <span className="wallet-card-issuer">
          {issuerName}
        </span>
        <strong>
          {title || labelForCredentialType(renderModel.documentType)}
        </strong>
      </span>
      <span className="wallet-card-footer">
        <span className="wallet-card-meta">
          {expiresAt
            ? `หมดอายุ ${new Date(expiresAt).toLocaleDateString("th-TH")}`
            : "ไม่มีวันหมดอายุ"}
        </span>
        <span className="wallet-card-verified">
          <QrCode size={14} /> VP
        </span>
      </span>
    </button>
  );
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function trustStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    issuer_signed: "ตรวจ proof แล้ว",
    trustcare_certified: "TrustCare certified",
    transport_valid: "ขนส่งถูกต้อง",
    trustcare_pending: "รอรับรอง",
    patient_provided_unverified: "ผู้ใช้เพิ่มเอง",
    invalid_or_revoked: "ใช้ไม่ได้",
    metadata_only: "Metadata only",
    proof_missing: "รอตรวจ proof",
  };
  return labels[status] ?? status;
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

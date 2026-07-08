import { normalizeDocumentType } from "./canonicalDocuments";
import type { WalletCard } from "./models";
import {
  buildPortalKnownCredentials,
  type PortalKnownCredential,
} from "./portalSyncMerge";

export type PortalWalletPushCredential = {
  walletCredentialId: string;
  documentType: string;
  documentCategory: string;
  credentialStatus: string;
  credentialData: Record<string, unknown>;
  credentialJwt?: string | null;
  credentialProof?: WalletCard["credentialProof"];
  issuerDid?: string | null;
  holderDid?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  patientAvatarUrl?: string | null;
  versionHint?: number | string | null;
};

export type PortalWalletPushDraft = {
  schema: "trustcare.wallet.push.v1";
  walletUserId: string;
  holderDid?: string | null;
  sourceWallet: "trustcare-wallet-apps";
  createdAt: string;
  credentials: PortalWalletPushCredential[];
  knownCredentials: PortalKnownCredential[];
  policy: {
    operation: "upsert_with_version_check";
    duplicateMatch: "lineage_key_then_credential_id";
    staleCredentialAction: "reject";
    supersededCredentialAction: "archive";
  };
};

export function buildPortalWalletPushDraft(input: {
  ownerUserId: string;
  holderDid?: string | null;
  cards: WalletCard[];
  createdAt?: string;
}): PortalWalletPushDraft {
  const ownedCards = input.cards.filter(
    (card) => card.ownerUserId === input.ownerUserId,
  );
  return {
    schema: "trustcare.wallet.push.v1",
    walletUserId: input.ownerUserId,
    holderDid:
      input.holderDid ??
      ownedCards.find((card) => card.holderDid)?.holderDid ??
      null,
    sourceWallet: "trustcare-wallet-apps",
    createdAt: input.createdAt ?? new Date().toISOString(),
    credentials: ownedCards
      .filter(
        (card) =>
          card.credentialData && typeof card.credentialData === "object",
      )
      .map((card) => ({
        walletCredentialId: String(card.credentialId),
        documentType: normalizeDocumentType(card.cardType) ?? card.cardType,
        documentCategory: card.documentCategory,
        credentialStatus: card.credentialStatus,
        credentialData: card.credentialData as Record<string, unknown>,
        credentialJwt: card.credentialJwt,
        credentialProof: card.credentialProof,
        issuerDid: card.issuerDid,
        holderDid: card.holderDid,
        issuedAt: card.issuedAt,
        expiresAt: card.expiresAt,
        patientAvatarUrl: card.patientAvatarUrl,
        versionHint: credentialVersionHint(card),
      })),
    knownCredentials: buildPortalKnownCredentials(ownedCards),
    policy: {
      operation: "upsert_with_version_check",
      duplicateMatch: "lineage_key_then_credential_id",
      staleCredentialAction: "reject",
      supersededCredentialAction: "archive",
    },
  };
}

function credentialVersionHint(card: WalletCard): number | string | null {
  const data = card.credentialData;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const subject = data.credentialSubject;
  const subjectRecord =
    subject && typeof subject === "object" && !Array.isArray(subject)
      ? (subject as Record<string, unknown>)
      : {};
  for (const candidate of [
    data.version,
    data.credentialVersion,
    data.schemaVersion,
    subjectRecord.version,
    subjectRecord.credentialVersion,
  ]) {
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return candidate;
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return null;
}

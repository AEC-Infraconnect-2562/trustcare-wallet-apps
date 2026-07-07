import type { CheckinQrResponse, ReadinessContext, WalletCard, WalletPresentationResponse } from "./models";
import { canonicalServiceProfiles, type SharePackageMode, walletDocumentRecordFromCard } from "./canonicalDocuments";
import { hashJson } from "./demoResolvers";
import { assertPrimaryVerifierQrPayload } from "./qrContracts";
import { shareGatewayArtifactUrl } from "./shareGateway";
import { createTrustCareShlGatewayPublication } from "./shlGateway";

export type SharePackageBuildInput = {
  mode: SharePackageMode;
  context: ReadinessContext;
  cards: WalletCard[];
  selectedCardIds?: Array<number | string>;
  holderDid?: string;
  recipient?: string;
  purpose?: string;
  selectedFields?: string[];
  expiresAt?: string;
  origin?: string;
  gatewayBaseUrl?: string;
  viewerBaseUrl?: string;
  shlPolicy?: {
    passcodeRequired?: boolean;
    passcodeHint?: string | null;
    maxAccessCount?: number;
    accessCodeDelivery?: "separate_channel" | "not_required" | "sms" | "in_person" | "secure_message";
  };
};

export type DirectVpSharePackage = {
  mode: "DirectVP" | "PurposeVP";
  presentation: WalletPresentationResponse;
  payload: Record<string, unknown>;
};

export type ShlSharePackage = {
  mode: "StandardSHL" | "CertifiedSHLManifestPackage";
  shl: CheckinQrResponse;
  payload: Record<string, unknown>;
};

export type BuiltSharePackage = DirectVpSharePackage | ShlSharePackage;

export function recommendedSharePackageMode(context: ReadinessContext, selectedCount: number): SharePackageMode {
  const profile = canonicalServiceProfiles[context];
  if (profile.recommendedWhenLarge && selectedCount > 2) return profile.recommendedWhenLarge;
  return profile.defaultSharePackage;
}

export function buildSharePackage(input: SharePackageBuildInput): BuiltSharePackage {
  const selectedCards = filterSelectedCards(input.cards, input.selectedCardIds);
  const purpose = input.purpose ?? canonicalServiceProfiles[input.context]?.label ?? input.context;
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString();
  if (input.mode === "StandardSHL" || input.mode === "CertifiedSHLManifestPackage") {
    const publication = createTrustCareShlGatewayPublication({
      context: input.context,
      cards: selectedCards,
      selectedCardIds: selectedCards.map(card => card.id),
      ownerUserId: selectedCards.find(card => card.ownerUserId != null)?.ownerUserId ?? undefined,
      patientId: selectedCards.find(card => card.patientId != null)?.patientId ?? undefined,
      receiver: input.recipient,
      purpose,
      origin: input.origin,
      gatewayBaseUrl: input.gatewayBaseUrl,
      viewerBaseUrl: input.viewerBaseUrl,
      includeTrustCareManifestVp: input.mode === "CertifiedSHLManifestPackage",
      policy: {
        expiresAt,
        passcodeRequired: input.shlPolicy?.passcodeRequired,
        passcodeHint: input.shlPolicy?.passcodeHint,
        maxAccessCount: input.shlPolicy?.maxAccessCount,
        accessCodeDelivery: input.shlPolicy?.accessCodeDelivery
      }
    });
    return {
      mode: input.mode,
      shl: publication,
      payload: {
        type: input.mode,
        purpose,
        shlUrl: publication.shlUrl,
        qrPayload: publication.qrPayload,
        manifestUrl: publication.manifestUrl,
        trustLayerStatus: publication.trustLayerStatus,
        manifestVpUrl: publication.manifest.trustcare.manifestVpUrl,
        manifestVpHash: publication.manifest.trustcare.manifestVpHash
      }
    };
  }

  const records = selectedCards.map(walletDocumentRecordFromCard);
  const credentialPayloads = selectedCards
    .map((card, index) =>
      card.credentialProof?.jwt ??
      card.credentialJwt ??
      records[index]?.credentialData
    )
    .filter((value): value is string | Record<string, unknown> => Boolean(value));
  const presentationId = `vp_${stableId({
    mode: input.mode,
    context: input.context,
    cards: records.map(record => record.credentialId),
    recipient: input.recipient,
    purpose,
    selectedFields: input.selectedFields,
    expiresAt
  })}`;
  const holderDid = input.holderDid ?? selectedCards.find(card => card.holderDid)?.holderDid ?? records[0]?.holderDid ?? "did:key:wallet-holder";
  const directCredentialJwt = selectedCards.length === 1
    ? selectedCards[0]?.credentialProof?.jwt ?? selectedCards[0]?.credentialJwt ?? null
    : null;
  const payload = {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://trustcare.network/contexts/share-package/v1"],
    id: presentationId,
    type: ["VerifiablePresentation", input.mode],
    holder: holderDid,
    purpose,
    recipient: input.recipient,
    validUntil: expiresAt,
    selectedFields: input.selectedFields ?? [],
    verifiableCredential: credentialPayloads,
    trustcare: {
      mode: input.mode,
      context: input.context,
      documentTypes: records.map(record => record.documentType),
      documentReferences: records.map(record => record.documentReference),
      credentialJwtCount: credentialPayloads.filter(value => typeof value === "string").length,
      payloadHash: hashJson(records.map(record => record.credentialId))
    }
  };
  const qrData = input.gatewayBaseUrl
    ? shareGatewayArtifactUrl(input.gatewayBaseUrl, "vp", presentationId)
    : directCredentialJwt ?? "";
  if (qrData) assertPrimaryVerifierQrPayload(qrData);
  return {
    mode: input.mode,
    payload,
    presentation: {
      presentationId,
      format: "jwt-vp",
      mode: input.mode,
      credentialCount: selectedCards.length,
      selectedFields: input.selectedFields ?? [],
      expiresAt,
      qrData,
      verificationChecklist: [
        { key: "holder", label: "Holder DID", ok: Boolean(holderDid), detail: holderDid },
        { key: "purpose", label: "Purpose bound", ok: Boolean(purpose), detail: purpose },
        { key: "documents", label: "Selected documents", ok: selectedCards.length > 0, detail: String(selectedCards.length) },
        { key: "expiry", label: "Time limited", ok: Boolean(expiresAt), detail: expiresAt }
      ]
    }
  };
}

function filterSelectedCards(cards: WalletCard[], selectedCardIds?: Array<number | string>): WalletCard[] {
  if (!selectedCardIds?.length) return cards;
  const selected = new Set(selectedCardIds.map(String));
  return cards.filter(card => selected.has(String(card.id)));
}

function stableId(value: unknown): string {
  return hashJson(value).replace(/^sha256:/, "").slice(0, 16);
}

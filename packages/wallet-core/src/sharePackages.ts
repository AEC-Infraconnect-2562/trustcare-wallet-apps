import type {
  CheckinQrResponse,
  ReadinessContext,
  WalletCard,
  WalletPresentationResponse,
} from "./models";
import {
  canonicalServiceProfiles,
  type SharePackageMode,
  walletDocumentRecordFromCard,
} from "./canonicalDocuments";
import { hashJson } from "./demoResolvers";
import {
  envelopedVerifiableCredentialFromJwt,
  looksLikeJwt,
} from "./credentialProof";
import { credentialLifecyclePolicy } from "./credentialLifecycle";
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
    accessCodeDelivery?:
      | "separate_channel"
      | "not_required"
      | "sms"
      | "in_person"
      | "secure_message";
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

export function recommendedSharePackageMode(
  context: ReadinessContext,
  selectedCount: number,
): SharePackageMode {
  const profile = canonicalServiceProfiles[context];
  if (profile.recommendedWhenLarge && selectedCount > 2)
    return profile.recommendedWhenLarge;
  return profile.defaultSharePackage;
}

export function buildSharePackage(
  input: SharePackageBuildInput,
): BuiltSharePackage {
  const selectedCards = filterSelectedCards(input.cards, input.selectedCardIds);
  const purpose =
    input.purpose ??
    canonicalServiceProfiles[input.context]?.label ??
    input.context;
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString();
  if (
    input.mode === "StandardSHL" ||
    input.mode === "CertifiedSHLManifestPackage"
  ) {
    const publication = createTrustCareShlGatewayPublication({
      context: input.context,
      cards: selectedCards,
      selectedCardIds: selectedCards.map((card) => card.id),
      ownerUserId:
        selectedCards.find((card) => card.ownerUserId != null)?.ownerUserId ??
        undefined,
      receiver: input.recipient,
      purpose,
      origin: input.origin,
      gatewayBaseUrl: input.gatewayBaseUrl,
      viewerBaseUrl: input.viewerBaseUrl,
      requestHospitalCertification:
        input.mode === "CertifiedSHLManifestPackage",
      policy: {
        expiresAt,
        passcodeRequired: input.shlPolicy?.passcodeRequired,
        passcodeHint: input.shlPolicy?.passcodeHint,
        maxAccessCount: input.shlPolicy?.maxAccessCount,
        accessCodeDelivery: input.shlPolicy?.accessCodeDelivery,
      },
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
      },
    };
  }

  const records = selectedCards.map(walletDocumentRecordFromCard);
  const credentialPayloads = selectedCards
    .map((card, index) => {
      const jwt = card.credentialProof?.jwt ?? card.credentialJwt;
      if (jwt && looksLikeJwt(jwt))
        return envelopedVerifiableCredentialFromJwt(jwt);
      const credentialData = records[index]?.credentialData;
      return credentialData
        ? credentialPayloadForShare(card, credentialData)
        : undefined;
    })
    .filter((value): value is Record<string, unknown> => Boolean(value));
  const presentationId = createSharingEventArtifactId("vp");
  const holderDid =
    input.holderDid ??
    selectedCards.find((card) => card.holderDid)?.holderDid ??
    records[0]?.holderDid;
  if (!holderDid) {
    throw new Error(
      "Holder DID is required to create a verifier-ready VP package.",
    );
  }
  const directCredentialJwt =
    selectedCards.length === 1
      ? validJwtOrNull(
          selectedCards[0]?.credentialProof?.jwt ??
            selectedCards[0]?.credentialJwt,
        )
      : null;
  const payload = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare.network/contexts/share-package/v1",
    ],
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
      documentTypes: records.map((record) => record.documentType),
      documentReferences: records.map((record) => record.documentReference),
      credentialJwtCount: credentialPayloads.filter(isEnvelopedCredentialJwt)
        .length,
      payloadHash: hashJson(records.map((record) => record.credentialId)),
    },
  };
  const qrData = input.gatewayBaseUrl
    ? shareGatewayArtifactUrl(input.gatewayBaseUrl, "vp", presentationId)
    : directCredentialJwt;
  if (!qrData) {
    throw new Error(
      "Share gateway base URL is required to create a resolver-backed VP QR for multi-credential or unsigned presentation packages.",
    );
  }
  assertPrimaryVerifierQrPayload(qrData);
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
        {
          key: "holder",
          label: "Holder DID",
          ok: Boolean(holderDid),
          detail: holderDid,
        },
        {
          key: "purpose",
          label: "Purpose bound",
          ok: Boolean(purpose),
          detail: purpose,
        },
        {
          key: "documents",
          label: "Selected documents",
          ok: selectedCards.length > 0,
          detail: String(selectedCards.length),
        },
        {
          key: "expiry",
          label: "Time limited",
          ok: Boolean(expiresAt),
          detail: expiresAt,
        },
      ],
    },
  };
}

function filterSelectedCards(
  cards: WalletCard[],
  selectedCardIds?: Array<number | string>,
): WalletCard[] {
  if (!selectedCardIds?.length) return cards;
  const selected = new Set(selectedCardIds.map(String));
  return cards.filter((card) => selected.has(String(card.id)));
}

export function createSharingEventArtifactId(prefix = "vp"): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error(
      "Web Crypto getRandomValues is required to create a secure sharing-event ID.",
    );
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const randomId = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix.replace(/[^a-zA-Z0-9_-]/g, "_")}_${randomId}`;
}

function credentialPayloadForShare(
  card: WalletCard,
  credentialData: Record<string, unknown>,
): Record<string, unknown> {
  const lifecycle = credentialLifecyclePolicy(card);
  const trustcare = recordValue(credentialData.trustcare);
  return {
    ...credentialData,
    trustcare: {
      ...trustcare,
      shareSource: {
        authority: lifecycle.sourceAuthority,
        signingOwner: lifecycle.signingOwner,
        sourceSystem: card.sourceSystem ?? undefined,
        credentialId: String(card.credentialId),
      },
    },
  };
}

function validJwtOrNull(value: string | null | undefined): string | null {
  return value && looksLikeJwt(value) ? value : null;
}

function isEnvelopedCredentialJwt(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    value.id.startsWith("data:application/vc+jwt,")
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

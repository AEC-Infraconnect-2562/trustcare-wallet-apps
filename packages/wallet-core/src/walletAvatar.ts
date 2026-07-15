import type { WalletDocumentRecordV2 } from "./walletDocumentV2";

export const WALLET_AVATAR_SCHEMA = "trustcare.wallet.avatar.v1" as const;

export type WalletAvatarIdentityBinding = {
  walletUserId: string;
  holderDid: string;
  credentialSubjectId: string;
};

export type WalletAvatarSource = {
  binding: WalletAvatarIdentityBinding;
  sourceUrl: string;
  sourceCredentialId: string;
  sourceDocumentId: string;
  signedDigest?: `sha256:${string}`;
};

export type WalletAvatarAssetRecord = {
  schema: typeof WALLET_AVATAR_SCHEMA;
  binding: WalletAvatarIdentityBinding;
  status: "ready" | "unavailable" | "validation_failed";
  sourceUrl?: string;
  sourceCredentialId?: string;
  sourceDocumentId?: string;
  mediaType?: string;
  httpStatus?: number;
  fetchedAt: string;
  localSha256?: `sha256:${string}`;
  signedDigest?: `sha256:${string}`;
  proofScope?: "issuer_signed_digest" | "cache_integrity_only";
  contentBase64?: string;
  errorCode?: string;
  requestId?: string;
  correlationId?: string;
};

export function walletAvatarBindingKey(
  binding: WalletAvatarIdentityBinding,
): string {
  return [
    requireText(binding.walletUserId, "walletUserId"),
    requireDidKey(binding.holderDid, "holderDid"),
    requireDidKey(binding.credentialSubjectId, "credentialSubjectId"),
  ].join("\u0000");
}

/**
 * Selects a portrait only from a persisted, verified Portal credential. The
 * sandbox catalog may constrain the URL, but is never promoted to a signed
 * portrait source itself.
 */
export function walletAvatarSourceFromDocuments(input: {
  walletUserId: string;
  holderDid: string;
  documents: readonly WalletDocumentRecordV2[];
  expectedSandboxPortraitUrl?: string | null;
}): WalletAvatarSource | undefined {
  const expectedUrl = input.expectedSandboxPortraitUrl
    ? requireHttpsUrl(input.expectedSandboxPortraitUrl, "sandbox portrait URL")
    : undefined;
  const candidates = input.documents
    .filter(
      (document) =>
        document.provenance.sourceKind === "trustcare_portal" &&
        document.owner.holderDid === input.holderDid,
    )
    .flatMap((document) => {
      const credential = record(document.content.credentialPayload);
      const subject = record(credential.credentialSubject);
      if (subject.id !== input.holderDid) return [];
      const humanDocument = record(record(subject.data).humanDocument);
      if (humanDocument.noPortrait === true) return [];
      const nestedRenderData = record(humanDocument.renderData);
      const renderData =
        Object.keys(nestedRenderData).length > 0
          ? nestedRenderData
          : humanDocument;
      const patient = record(renderData.patient);
      const rawUrl = firstText(
        patient.photoUrl,
        patient.portraitUrl,
        patient.avatarUrl,
        patient.imageUrl,
        record(patient.photo).url,
        record(patient.avatar).url,
      );
      if (!rawUrl) return [];
      const sourceUrl = requireHttpsUrl(
        rawUrl,
        "signed portrait URL",
        document.provenance.sourceEndpoint,
      );
      const signedDigest = optionalSha256Digest(
        firstText(
          patient.photoDigest,
          patient.portraitDigest,
          patient.avatarDigest,
          record(patient.photo).digest,
          record(patient.photo).sha256,
          record(patient.avatar).digest,
        ),
      );
      return [
        {
          source: {
            binding: {
              walletUserId: requireText(input.walletUserId, "walletUserId"),
              holderDid: requireDidKey(input.holderDid, "holderDid"),
              credentialSubjectId: requireDidKey(
                String(subject.id),
                "credentialSubjectId",
              ),
            },
            sourceUrl,
            sourceCredentialId:
              document.credential.credentialId ?? String(credential.id ?? document.id),
            sourceDocumentId: document.id,
            signedDigest,
          } satisfies WalletAvatarSource,
          priority: portraitDocumentPriority(document.documentType),
          updatedAt:
            document.lifecycle.updatedAt ??
            document.lifecycle.issuedAt ??
            document.provenance.receivedAt,
        },
      ];
    });

  const matching = expectedUrl
    ? candidates.filter((candidate) => candidate.source.sourceUrl === expectedUrl)
    : candidates;
  if (expectedUrl && candidates.length > 0 && matching.length === 0) {
    throw new Error(
      "Signed credential portrait does not match the Portal sandbox identity catalog.",
    );
  }
  return matching.sort(
    (left, right) =>
      right.priority - left.priority ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.source.sourceDocumentId.localeCompare(right.source.sourceDocumentId),
  )[0]?.source;
}

export function walletAvatarDataUrl(
  record: WalletAvatarAssetRecord | undefined,
): string | undefined {
  if (
    record?.status !== "ready" ||
    !record.mediaType?.startsWith("image/") ||
    !record.contentBase64
  ) {
    return undefined;
  }
  return `data:${record.mediaType};base64,${record.contentBase64}`;
}

function portraitDocumentPriority(documentType: string): number {
  if (documentType === "patient_identity") return 30;
  if (documentType === "travel_document_verification") return 20;
  if (documentType === "staff_identity") return 10;
  return 0;
}

function optionalSha256Digest(
  value: string | undefined,
): `sha256:${string}` | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Signed portrait digest is invalid.");
  }
  return normalized as `sha256:${string}`;
}

function requireHttpsUrl(value: string, label: string, baseUrl?: string): string {
  const absolute = /^https:\/\//i.test(value);
  if (!absolute && !value.startsWith("/")) {
    throw new Error(`${label} must be an absolute HTTPS URL or root path.`);
  }
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label} must be an HTTPS URL without credentials or fragment.`);
  }
  return url.toString();
}

function requireDidKey(value: string, label: string): string {
  const text = requireText(value, label);
  if (!text.startsWith("did:key:")) throw new Error(`${label} must be a did:key.`);
  return text;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function firstText(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  )?.trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

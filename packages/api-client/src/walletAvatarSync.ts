import {
  WALLET_AVATAR_SCHEMA,
  walletAvatarSourceFromDocuments,
  type WalletAvatarAssetRecord,
  type WalletDocumentRecordV2,
} from "@trustcare/wallet-core";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function synchronizeWalletAvatar(input: {
  walletUserId: string;
  holderDid: string;
  documents: readonly WalletDocumentRecordV2[];
  expectedSandboxPortraitUrl?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<WalletAvatarAssetRecord> {
  const fetchedAt = (input.now ?? (() => new Date()))().toISOString();
  const binding = {
    walletUserId: input.walletUserId,
    holderDid: input.holderDid,
    credentialSubjectId: input.holderDid,
  };
  let source;
  try {
    source = walletAvatarSourceFromDocuments(input);
  } catch (error) {
    return {
      schema: WALLET_AVATAR_SCHEMA,
      binding,
      status: "validation_failed",
      fetchedAt,
      errorCode:
        error instanceof Error && error.message.includes("sandbox identity catalog")
          ? "avatar_catalog_mismatch"
          : "avatar_signed_source_invalid",
    };
  }
  if (!source) {
    return {
      schema: WALLET_AVATAR_SCHEMA,
      binding,
      status: "unavailable",
      fetchedAt,
      errorCode: "avatar_signed_source_missing",
    };
  }

  const fetcher = (input.fetchImpl ?? globalThis.fetch).bind(globalThis);
  let response: Response;
  try {
    response = await fetcher(source.sourceUrl, {
      method: "GET",
      headers: { accept: "image/*" },
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return failedAsset(source, fetchedAt, "avatar_fetch_failed");
  }
  const trace = {
    requestId: response.headers.get("x-request-id") ?? undefined,
    correlationId: response.headers.get("x-correlation-id") ?? undefined,
  };
  if (!response.ok) {
    return failedAsset(
      source,
      fetchedAt,
      "avatar_http_error",
      response.status,
      trace,
    );
  }
  if (response.url) {
    try {
      if (new URL(response.url).protocol !== "https:") {
        return failedAsset(
          source,
          fetchedAt,
          "avatar_redirect_not_https",
          response.status,
          trace,
        );
      }
    } catch {
      return failedAsset(
        source,
        fetchedAt,
        "avatar_response_url_invalid",
        response.status,
        trace,
      );
    }
  }
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!mediaType?.startsWith("image/")) {
    return failedAsset(
      source,
      fetchedAt,
      "avatar_media_type_invalid",
      response.status,
      trace,
    );
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_BYTES) {
    return failedAsset(
      source,
      fetchedAt,
      "avatar_too_large",
      response.status,
      trace,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) {
    return failedAsset(
      source,
      fetchedAt,
      bytes.length === 0 ? "avatar_empty" : "avatar_too_large",
      response.status,
      trace,
    );
  }
  const localSha256 = `sha256:${await sha256Hex(bytes)}` as const;
  if (source.signedDigest && source.signedDigest !== localSha256) {
    return failedAsset(
      source,
      fetchedAt,
      "avatar_signed_digest_mismatch",
      response.status,
      trace,
    );
  }
  return {
    schema: WALLET_AVATAR_SCHEMA,
    binding: source.binding,
    status: "ready",
    sourceUrl: source.sourceUrl,
    sourceCredentialId: source.sourceCredentialId,
    sourceDocumentId: source.sourceDocumentId,
    mediaType,
    httpStatus: response.status,
    fetchedAt,
    localSha256,
    signedDigest: source.signedDigest,
    proofScope: source.signedDigest
      ? "issuer_signed_digest"
      : "cache_integrity_only",
    contentBase64: bytesToBase64(bytes),
    ...trace,
  };
}

function failedAsset(
  source: NonNullable<
    ReturnType<typeof walletAvatarSourceFromDocuments>
  >,
  fetchedAt: string,
  errorCode: string,
  httpStatus?: number,
  trace: { requestId?: string; correlationId?: string } = {},
): WalletAvatarAssetRecord {
  return {
    schema: WALLET_AVATAR_SCHEMA,
    binding: source.binding,
    status: "validation_failed",
    sourceUrl: source.sourceUrl,
    sourceCredentialId: source.sourceCredentialId,
    sourceDocumentId: source.sourceDocumentId,
    signedDigest: source.signedDigest,
    fetchedAt,
    errorCode,
    httpStatus,
    ...trace,
  };
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(value);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes.buffer),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

import { assertShareGatewayPublicationResponse } from "@trustcare/contracts";
import {
  createShareGatewayPublicationRequest,
  normalizeShareGatewayBaseUrl,
  readinessContextLabels,
  type BuiltSharePackage,
  type CredentialSigningOwner,
  type CredentialSourceAuthority,
  type ReadinessContext,
  type ShareGatewayPublicationRequest,
  type ShareGatewayPublicationResponse,
} from "@trustcare/wallet-core";

export type ShareGatewayFetch = typeof fetch;

export type ShareGatewayClientOptions = {
  gatewayBaseUrl: string;
  fetchImpl?: ShareGatewayFetch;
};

export type PublishVpSharePackageInput = {
  result: Extract<BuiltSharePackage, { presentation: unknown }>;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  purposeLabel?: string;
  recipient: string;
  expiresAt: string;
};

export type PublishShlSharePackageInput = {
  result: Extract<BuiltSharePackage, { shl: unknown }>;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  purposeLabel?: string;
  recipient: string;
  expiresAt: string;
};

export type SignCredentialWithGatewayInput = {
  issuerServiceOperation: "demo_issuer_reissue";
  sourceAuthority: CredentialSourceAuthority;
  signingOwner: CredentialSigningOwner;
  sourceSystem?: string | null;
  cardId?: string | number;
  credentialId?: string | number;
  credential: Record<string, unknown>;
  credentialType?: string | null;
  holderDid?: string | null;
  expiresAt?: string | null;
  audience?: string;
};

export type SignCredentialWithGatewayResponse = {
  ok: boolean;
  credentialId: string;
  credentialJwt: string;
  credentialProof: {
    type?: string | null;
    format?: string | null;
    jwt?: string | null;
    alg?: string | null;
    kid?: string | null;
    source?: string | null;
  };
  issuerDid?: string | null;
  jwksUrl?: string | null;
  signedCredential?: Record<string, unknown>;
  warnings: string[];
  errors: string[];
};

export type IssuePayerCredentialWithGatewayInput = {
  payerId: string;
  credential: Record<string, unknown>;
  credentialType?: string | null;
  holderDid?: string | null;
  expiresAt?: string | null;
  audience?: string;
  sourceSystem?: string | null;
};

export type IssuePayerCredentialWithGatewayResponse =
  SignCredentialWithGatewayResponse & {
    payerId: string;
  };

export type ShareGatewayClient = {
  publishVp(
    input: PublishVpSharePackageInput,
  ): Promise<ShareGatewayPublicationResponse>;
  publishShl(
    input: PublishShlSharePackageInput,
  ): Promise<ShareGatewayPublicationResponse>;
  resolvePresentation(presentationId: string): Promise<string>;
  jwksUrl(): string;
};

type PublishRequestInput = Parameters<
  typeof createShareGatewayPublicationRequest
>[0];

export function createShareGatewayClient(
  options: ShareGatewayClientOptions,
): ShareGatewayClient {
  const gatewayBaseUrl = normalizeShareGatewayBaseUrl(options.gatewayBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    publishVp: (input) =>
      publishVpSharePackage({ ...input, gatewayBaseUrl, fetchImpl }),
    publishShl: (input) =>
      publishShlSharePackage({ ...input, gatewayBaseUrl, fetchImpl }),
    resolvePresentation: (presentationId) =>
      resolvePresentation(gatewayBaseUrl, presentationId, fetchImpl),
    jwksUrl: () => shareGatewayJwksUrl(gatewayBaseUrl),
  };
}

export async function publishVpSharePackage(
  input: PublishVpSharePackageInput & ShareGatewayClientOptions,
): Promise<ShareGatewayPublicationResponse> {
  return publishShareArtifact({
    gatewayBaseUrl: input.gatewayBaseUrl,
    fetchImpl: input.fetchImpl,
    request: {
      artifactId: input.result.presentation.presentationId,
      kind: "vp",
      contentType: "application/vp+json",
      payload: input.result.payload,
      ownerUserId: input.userId,
      holderDid: input.holderDid,
      context: input.purpose,
      purpose: purposeLabel(input.purpose, input.purposeLabel),
      recipient: input.recipient,
      expiresAt: input.expiresAt,
      trustcare: {
        signingStatus: "pending_backend_signature",
        expectedProof: ["ES256", "EdDSA", "DataIntegrityProof"],
      },
    },
  });
}

export async function publishShlSharePackage(
  input: PublishShlSharePackageInput & ShareGatewayClientOptions,
): Promise<ShareGatewayPublicationResponse> {
  const shl = input.result.shl;
  const manifest = recordValue(shl.manifest);
  if (!manifest) {
    throw new Error("SHL package ไม่มี manifest สำหรับ publish");
  }
  const publicationId = String(
    shl.gatewayPublicationId ?? shl.shlId ?? input.result.payload.shlUrl,
  );
  const certified = shl.trustLayerStatus === "certified_manifest_vp";
  const manifestPublication = await publishShareArtifact({
    gatewayBaseUrl: input.gatewayBaseUrl,
    fetchImpl: input.fetchImpl,
    request: {
      artifactId: publicationId,
      kind: certified ? "certified_shl_manifest" : "standard_shl_manifest",
      contentType: "application/json",
      payload: manifest,
      ownerUserId: input.userId,
      holderDid: input.holderDid,
      context: input.purpose,
      purpose: purposeLabel(input.purpose, input.purposeLabel),
      recipient: input.recipient,
      expiresAt: input.expiresAt,
      accessPolicy: {
        expiresAt: shl.expiresAt,
        passcodeRequired: shl.passcodeRequired,
        passcodeHint: shl.passcodeHint,
        maxAccessCount: shl.maxAccessCount,
        accessCodeDelivery: shl.accessCodeDelivery,
      },
      trustcare: {
        trustLayerStatus: shl.trustLayerStatus,
        manifestUrl: shl.manifestUrl,
        canonicalShlUrl: shl.canonicalShlUrl ?? shl.shlUrl,
      },
    },
  });

  const trustcare = recordValue(manifest.trustcare);
  const supportPublications = certified
    ? await publishCertifiedShlTrustArtifacts({
        gatewayBaseUrl: input.gatewayBaseUrl,
        fetchImpl: input.fetchImpl,
        publicationId,
        trustcare,
        userId: input.userId,
        holderDid: input.holderDid,
        purpose: input.purpose,
        purposeLabel: input.purposeLabel,
        recipient: input.recipient,
        expiresAt: input.expiresAt,
      })
    : [];

  return {
    ...manifestPublication,
    publicUrl: manifestPublication.publicUrl ?? shl.manifestUrl,
    qrPayload: shl.qrPayload,
    warnings: [
      ...(manifestPublication.warnings ?? []),
      ...supportPublications.flatMap(
        (publication) => publication.warnings ?? [],
      ),
      ...(shl.warnings ?? []),
    ],
  };
}

export async function publishCertifiedShlTrustArtifacts(input: {
  gatewayBaseUrl: string;
  fetchImpl?: ShareGatewayFetch;
  publicationId: string;
  trustcare: Record<string, unknown> | null;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  purposeLabel?: string;
  recipient: string;
  expiresAt: string;
}): Promise<ShareGatewayPublicationResponse[]> {
  if (!input.trustcare) return [];
  const artifactInputs: Array<{
    key: "manifestVp" | "manifestCredential" | "holderAuthorizationCredential";
    kind: "manifest_vp" | "manifest_credential" | "holder_authorization";
    contentType: string;
  }> = [
    {
      key: "manifestVp",
      kind: "manifest_vp",
      contentType: "application/vp+json",
    },
    {
      key: "manifestCredential",
      kind: "manifest_credential",
      contentType: "application/vc+json",
    },
    {
      key: "holderAuthorizationCredential",
      kind: "holder_authorization",
      contentType: "application/vc+json",
    },
  ];

  const publications: ShareGatewayPublicationResponse[] = [];
  for (const artifact of artifactInputs) {
    const payload = recordValue(input.trustcare[artifact.key]);
    if (!payload) continue;
    publications.push(
      await publishShareArtifact({
        gatewayBaseUrl: input.gatewayBaseUrl,
        fetchImpl: input.fetchImpl,
        request: {
          artifactId: input.publicationId,
          kind: artifact.kind,
          contentType: artifact.contentType,
          payload,
          ownerUserId: input.userId,
          holderDid: input.holderDid,
          context: input.purpose,
          purpose: purposeLabel(input.purpose, input.purposeLabel),
          recipient: input.recipient,
          expiresAt: input.expiresAt,
        },
      }),
    );
  }
  return publications;
}

export async function publishShareArtifact(input: {
  gatewayBaseUrl: string;
  request: PublishRequestInput;
  fetchImpl?: ShareGatewayFetch;
}): Promise<ShareGatewayPublicationResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${normalizeShareGatewayBaseUrl(input.gatewayBaseUrl)}/artifacts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(createShareGatewayPublicationRequest(input.request)),
    },
  );
  const payload = await response.json().catch(() => null);
  const gatewayPayload = payload
    ? assertShareGatewayPublicationResponse(payload)
    : null;
  if (!response.ok || !gatewayPayload?.ok) {
    const errors = gatewayPayload?.errors?.length
      ? gatewayPayload.errors.join(" ")
      : response.statusText;
    throw new Error(`Share Gateway publish failed: ${errors}`);
  }
  return gatewayPayload as ShareGatewayPublicationResponse;
}

export async function signCredentialWithShareGateway(
  input: SignCredentialWithGatewayInput & ShareGatewayClientOptions,
): Promise<SignCredentialWithGatewayResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${normalizeShareGatewayBaseUrl(input.gatewayBaseUrl)}/credentials/sign`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        issuerServiceOperation: input.issuerServiceOperation,
        sourceAuthority: input.sourceAuthority,
        signingOwner: input.signingOwner,
        sourceSystem: input.sourceSystem,
        cardId: input.cardId,
        credentialId: input.credentialId,
        credential: input.credential,
        credentialType: input.credentialType,
        holderDid: input.holderDid,
        expiresAt: input.expiresAt,
        audience: input.audience,
      }),
    },
  );
  const payload = (await response
    .json()
    .catch(() => null)) as SignCredentialWithGatewayResponse | null;
  if (!response.ok || !payload?.ok || !payload.credentialJwt) {
    const errors = payload?.errors?.length
      ? payload.errors.join(" ")
      : response.statusText;
    throw new Error(`Share Gateway credential signing failed: ${errors}`);
  }
  return payload;
}

export async function issuePayerCredentialWithShareGateway(
  input: IssuePayerCredentialWithGatewayInput & ShareGatewayClientOptions,
): Promise<IssuePayerCredentialWithGatewayResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${normalizeShareGatewayBaseUrl(input.gatewayBaseUrl)}/payer/credentials/issue`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        issuerServiceOperation: "demo_payer_integration_issue",
        sourceAuthority: "payer_adapter",
        signingOwner: "payer_adapter",
        sourceSystem: input.sourceSystem ?? "payer_adapter",
        payerId: input.payerId,
        credential: input.credential,
        credentialType: input.credentialType,
        holderDid: input.holderDid,
        expiresAt: input.expiresAt,
        audience: input.audience,
      }),
    },
  );
  const payload = (await response
    .json()
    .catch(() => null)) as IssuePayerCredentialWithGatewayResponse | null;
  if (!response.ok || !payload?.ok || !payload.credentialJwt) {
    const errors = payload?.errors?.length
      ? payload.errors.join(" ")
      : response.statusText;
    throw new Error(`Demo payer credential issuance failed: ${errors}`);
  }
  return payload;
}

export async function resolvePresentation(
  gatewayBaseUrl: string,
  presentationId: string,
  fetchImpl: ShareGatewayFetch = fetch,
): Promise<string> {
  const encoded = encodeURIComponent(presentationId);
  const response = await fetchImpl(
    `${normalizeShareGatewayBaseUrl(gatewayBaseUrl)}/presentations/${encoded}.jwt`,
    {
      method: "GET",
      headers: { accept: "application/vp+jwt, text/plain" },
    },
  );
  const payload = await response.text();
  if (!response.ok || !payload.trim()) {
    throw new Error(
      `Share Gateway presentation resolve failed: ${response.statusText}`,
    );
  }
  return payload;
}

export function shareGatewayJwksUrl(gatewayBaseUrl: string): string {
  return `${normalizeShareGatewayBaseUrl(gatewayBaseUrl)}/.well-known/jwks.json`;
}

export function requestBodyForShareGateway(
  input: PublishRequestInput,
): ShareGatewayPublicationRequest {
  return createShareGatewayPublicationRequest(input);
}

function purposeLabel(
  context: ReadinessContext,
  explicitLabel?: string,
): string {
  return explicitLabel ?? readinessContextLabels[context]?.th ?? context;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

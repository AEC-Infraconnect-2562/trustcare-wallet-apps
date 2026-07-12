import { assertShareGatewayPublicationResponse } from "@trustcare/contracts";
import {
  createShareGatewayPublicationRequest,
  createShlLinkPayload,
  createShlViewerUrl,
  normalizeShareGatewayBaseUrl,
  readinessContextLabels,
  type BuiltSharePackage,
  type CertifiedShlPublication,
  type PreparedHolderAttestedShl,
  type ReadinessContext,
  type ShareGatewayPublicationRequest,
  type ShareGatewayPublicationResponse,
} from "@trustcare/wallet-core";

export type PublishedHolderAttestedShl = {
  trustMode: "holder_attested";
  shlPackageId: string;
  manifestUrl: string;
  canonicalShlUrl: string;
  qrPayload: string;
  holderPresentationUrl: string;
  warnings: string[];
};

export type PublishedHospitalCertifiedShl = {
  trustMode: "hospital_certified";
  shlPackageId: string;
  manifestUrl: string;
  holderPresentationUrl?: string;
  manifestCredentialUrl?: string;
  warnings: string[];
};

export type ShareGatewayFetch = typeof fetch;

export type ShareGatewayClientOptions = {
  gatewayBaseUrl: string;
  fetchImpl?: ShareGatewayFetch;
};

export type PublishVpSharePackageInput = {
  result: Extract<BuiltSharePackage, { presentation: unknown }>;
  holderPresentationJwt: string;
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

export type IssueCredentialWithGatewayResponse = {
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
  IssueCredentialWithGatewayResponse & {
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
      contentType: "application/vp+jwt",
      payload: input.holderPresentationJwt,
      ownerUserId: input.userId,
      holderDid: input.holderDid,
      context: input.purpose,
      purpose: purposeLabel(input.purpose, input.purposeLabel),
      recipient: input.recipient,
      expiresAt: input.expiresAt,
      trustcare: {
        signingStatus: "wallet_holder_signed",
        expectedProof: ["ES256", "EdDSA"],
        portalResignAllowed: false,
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
  const certified = shl.trustLayerStatus === "hospital_certified";
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
  if (!input.trustcare) {
    throw new Error(
      "Hospital-certified SHL requires verified holder VP and Manifest VC JWT artifacts.",
    );
  }
  const artifactInputs: Array<{
    key: "holderPresentationJwt" | "manifestCredentialJwt";
    kind: "manifest_vp" | "manifest_credential";
    contentType: string;
  }> = [
    {
      key: "holderPresentationJwt",
      kind: "manifest_vp",
      contentType: "application/vp+jwt",
    },
    {
      key: "manifestCredentialJwt",
      kind: "manifest_credential",
      contentType: "application/vc+jwt",
    },
  ];

  const publications: ShareGatewayPublicationResponse[] = [];
  for (const artifact of artifactInputs) {
    const payload = input.trustcare[artifact.key];
    if (typeof payload !== "string" || !looksLikeCompactJwt(payload)) {
      throw new Error(
        `Hospital-certified SHL ${artifact.key} must be a signed compact JWT.`,
      );
    }
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

export async function publishHolderAttestedShl(input: {
  gatewayBaseUrl: string;
  viewerBaseUrl: string;
  prepared: PreparedHolderAttestedShl;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  purposeLabel?: string;
  recipient: string;
  fetchImpl?: ShareGatewayFetch;
}): Promise<PublishedHolderAttestedShl> {
  if (
    input.prepared.trustMode !== "holder_attested" ||
    input.prepared.manifest.holderDid !== input.holderDid
  ) {
    throw new Error(
      "Holder-attested SHL publication does not match the Wallet holder key.",
    );
  }
  const common = {
    gatewayBaseUrl: input.gatewayBaseUrl,
    fetchImpl: input.fetchImpl,
  };
  const filePublications = await Promise.all(
    input.prepared.files.map((file) =>
      publishShareArtifact({
        ...common,
        request: {
          artifactId: file.id,
          kind: "shl_file",
          contentType: "application/jose",
          payload: file.jwe,
          ownerUserId: input.userId,
          holderDid: input.holderDid,
          context: input.purpose,
          purpose: purposeLabel(input.purpose, input.purposeLabel),
          recipient: input.recipient,
          expiresAt: input.prepared.manifest.expiresAt,
        },
      }),
    ),
  );
  const holderPresentation = await publishShareArtifact({
    ...common,
    request: {
      artifactId: input.prepared.manifest.publicationId,
      kind: "manifest_vp",
      contentType: "application/vp+jwt",
      payload: input.prepared.holderPresentationJwt,
      ownerUserId: input.userId,
      holderDid: input.holderDid,
      context: input.purpose,
      purpose: purposeLabel(input.purpose, input.purposeLabel),
      recipient: input.recipient,
      expiresAt: input.prepared.manifest.expiresAt,
    },
  });
  const manifestPayload = {
    resourceType: "TrustCareShlManifest",
    manifestVersion: 2,
    ...input.prepared.manifest,
    files: input.prepared.manifest.documents.map((document) => ({
      id: document.id,
      contentType: "application/jose",
      location: document.location,
      hash: document.jweSha256,
      plaintextHash: document.plaintextSha256,
    })),
    trustcare: {
      trustLayerStatus: "holder_attested",
      makerCheckerStatus: "not_required",
      shlPackageId: input.prepared.manifest.publicationId,
      manifestHash: input.prepared.manifestHash,
      fileHashes:
        input.prepared.expectedManifestCredentialBinding.fileHashes,
      holderPresentationId: input.prepared.holderPresentationId,
      holderPresentationJwt: input.prepared.holderPresentationJwt,
      holderPresentationUrl: holderPresentation.publicUrl,
      purpose: input.prepared.manifest.accessPolicy.purpose,
      recipient: input.prepared.manifest.accessPolicy.recipient,
      audience: input.prepared.manifest.accessPolicy.audience,
      consentRef: input.prepared.manifest.accessPolicy.consentRef,
    },
  };
  const manifestPublication = await publishShareArtifact({
    ...common,
    request: {
      artifactId: input.prepared.manifest.publicationId,
      kind: "standard_shl_manifest",
      contentType: "application/json",
      payload: manifestPayload,
      ownerUserId: input.userId,
      holderDid: input.holderDid,
      context: input.purpose,
      purpose: purposeLabel(input.purpose, input.purposeLabel),
      recipient: input.recipient,
      expiresAt: input.prepared.manifest.expiresAt,
    },
  });
  const manifestUrl =
    manifestPublication.publicUrl ?? input.prepared.manifest.manifestUrl;
  const canonicalShlUrl = createShlLinkPayload({
    url: manifestUrl,
    key: input.prepared.shlContentKey,
    label: input.prepared.manifest.accessPolicy.purpose,
    flag: "L",
    passcodeRequired:
      input.prepared.manifest.accessPolicy.passcodeRequired,
    expiresAt: input.prepared.manifest.expiresAt,
    version: 1,
  });
  return {
    trustMode: "holder_attested",
    shlPackageId: input.prepared.manifest.publicationId,
    manifestUrl,
    canonicalShlUrl,
    qrPayload: createShlViewerUrl(input.viewerBaseUrl, canonicalShlUrl),
    holderPresentationUrl:
      holderPresentation.publicUrl ??
      `${normalizeShareGatewayBaseUrl(input.gatewayBaseUrl)}/manifest-vps/${encodeURIComponent(input.prepared.manifest.publicationId)}.jwt`,
    warnings: [
      ...filePublications.flatMap((publication) => publication.warnings ?? []),
      ...(holderPresentation.warnings ?? []),
      ...(manifestPublication.warnings ?? []),
    ],
  };
}

export async function publishHospitalCertifiedShl(input: {
  gatewayBaseUrl: string;
  publication: CertifiedShlPublication;
  userId: string | number;
  holderDid: string;
  purpose: ReadinessContext;
  purposeLabel?: string;
  recipient: string;
  fetchImpl?: ShareGatewayFetch;
}): Promise<PublishedHospitalCertifiedShl> {
  if (
    input.publication.trustMode !== "hospital_certified" ||
    input.publication.manifest.holderDid !== input.holderDid
  ) {
    throw new Error(
      "Hospital-certified SHL publication does not match the Wallet holder.",
    );
  }
  const support = await publishCertifiedShlTrustArtifacts({
    gatewayBaseUrl: input.gatewayBaseUrl,
    fetchImpl: input.fetchImpl,
    publicationId: input.publication.manifest.publicationId,
    trustcare: {
      holderPresentationJwt: input.publication.holderPresentationJwt,
      manifestCredentialJwt: input.publication.manifestCredentialJwt,
    },
    userId: input.userId,
    holderDid: input.holderDid,
    purpose: input.purpose,
    purposeLabel: input.purposeLabel,
    recipient: input.recipient,
    expiresAt: input.publication.manifest.expiresAt,
  });
  return {
    trustMode: "hospital_certified",
    shlPackageId: input.publication.manifest.publicationId,
    // The immutable Standard SHL manifest remains Wallet-owned transport.
    // Hospital certification is the separately signed Manifest VC below; a
    // browser caller must never publish a self-asserted certified manifest.
    manifestUrl: input.publication.manifest.manifestUrl,
    holderPresentationUrl: support.find(
      (artifact) => artifact.kind === "manifest_vp",
    )?.publicUrl,
    manifestCredentialUrl: support.find(
      (artifact) => artifact.kind === "manifest_credential",
    )?.publicUrl,
    warnings: [
      ...support.flatMap((artifact) => artifact.warnings ?? []),
    ],
  };
}

function looksLikeCompactJwt(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 3 &&
    parts.every((part) => Boolean(part) && /^[A-Za-z0-9_-]+$/.test(part))
  );
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
  const failure = shareGatewayFailureMessage(payload);
  if (!response.ok || failure) {
    const fallback = [response.status, response.statusText]
      .filter(Boolean)
      .join(" ");
    throw new Error(
      `Share Gateway publish failed: ${failure || fallback || "Unknown error"}`,
    );
  }
  const gatewayPayload = assertShareGatewayPublicationResponse(payload);
  return gatewayPayload;
}

function shareGatewayFailureMessage(payload: unknown): string | null {
  const object = recordValue(payload);
  if (!object) return null;
  const errors = Array.isArray(object.errors)
    ? object.errors.filter(
        (error): error is string =>
          typeof error === "string" && Boolean(error.trim()),
      )
    : [];
  if (errors.length) return errors.join(" ");
  if (object.ok === false) {
    for (const key of ["detail", "message", "title"] as const) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "Gateway rejected the publication request.";
  }
  return null;
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

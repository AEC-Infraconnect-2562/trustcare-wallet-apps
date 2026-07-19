import { assertShareGatewayPublicationResponse } from "@trustcare/contracts";
import {
  assertImmutablePresentationResolverQrPayload,
  assertTrustCareDirectPresentation,
  createShareGatewayPublicationRequest,
  assertPlainShlManifest,
  createShlLinkPayload,
  normalizeShareGatewayBaseUrl,
  publicJwkFromDidKey,
  readinessContextLabels,
  type BuiltSharePackage,
  type CertifiedShlPublication,
  type PreparedHolderAttestedShl,
  type ReadinessContext,
  type ShareGatewayPublicationRequest,
  type ShareGatewayPublicationResponse,
  verificationMethodKidFromDidKey,
} from "@trustcare/wallet-core";
import {
  compactVerify,
  decodeProtectedHeader,
  importJWK,
} from "jose";
import { PortalInteroperabilityProblemError } from "./qrInteroperability";

export type PublishedHolderAttestedShl = {
  trustMode: "holder_attested";
  shlPackageId: string;
  manifestUrl: string;
  canonicalShlUrl: string;
  qrPayload: string;
  warnings: string[];
};

export type PublishedHospitalCertifiedShl = {
  trustMode: "hospital_certified";
  shlPackageId: string;
  manifestUrl: string;
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
  audience: string;
  consentRef: string;
  purpose: ReadinessContext;
  purposeLabel?: string;
  recipient: string;
  expiresAt: string;
};

export type PublicPresentationVerificationEvidence = {
  version: "1";
  providerId: string;
  artifactId: string;
  resolverUrl: string;
  packageDigest: `sha256:${string}`;
  contextDigest: `sha256:${string}`;
  subjects: Array<{
    role: "vc" | "vp" | "manifest_vc";
    digest: `sha256:${string}`;
    contentHash?: `sha256:${string}`;
    issuerDid?: string;
    holderDid?: string;
    validUntil?: string;
    statusReference?: unknown;
  }>;
  policy: { id: string; version: string };
  checkedAt: string;
  expiresAt: string;
  verified: true;
  checks: Array<{
    key: "proof" | "issuer" | "status" | "expiry" | "policy" | "binding";
    state: "pass";
    subjectDigests: `sha256:${string}`[];
    checkedAt: string;
    authority: string;
    detail?: string;
  }>;
  requestId: string;
  correlationId: string;
};

export type VerifiedVpShareGatewayPublication =
  ShareGatewayPublicationResponse & {
    publicUrl: string;
    qrPayload: string;
    verificationEvidence: PublicPresentationVerificationEvidence;
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
  ): Promise<VerifiedVpShareGatewayPublication>;
  publishShl(
    input: PublishShlSharePackageInput,
  ): Promise<ShareGatewayPublicationResponse>;
  resolvePresentation(presentationId: string): Promise<string>;
  verifyPresentationPublication(input: {
    artifactId: string;
    expectedJwt: string;
    holderDid: string;
    audience?: string;
    recipient?: string;
    purpose?: string;
    consentRef?: string;
  }): Promise<PublicPresentationVerificationEvidence>;
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
    verifyPresentationPublication: (input) =>
      verifyPublishedPresentation({
        ...input,
        gatewayBaseUrl,
        fetchImpl,
      }),
    jwksUrl: () => shareGatewayJwksUrl(gatewayBaseUrl),
  };
}

export async function publishVpSharePackage(
  input: PublishVpSharePackageInput & ShareGatewayClientOptions,
): Promise<VerifiedVpShareGatewayPublication> {
  const publication = await publishShareArtifact({
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
  if (!publication.publicUrl || !publication.qrPayload) {
    throw new Error(
      "Share Gateway did not return an immutable presentation resolver URL.",
    );
  }
  assertImmutablePresentationResolverQrPayload(publication.publicUrl, {
    origin: input.gatewayBaseUrl,
    artifactId: input.result.presentation.presentationId,
  });
  assertImmutablePresentationResolverQrPayload(publication.qrPayload, {
    origin: input.gatewayBaseUrl,
    artifactId: input.result.presentation.presentationId,
  });
  if (publication.publicUrl !== publication.qrPayload) {
    throw new Error(
      "Share Gateway QR must be the exact immutable presentation resolver URL.",
    );
  }
  const verificationEvidence = await verifyPublishedPresentation({
    gatewayBaseUrl: input.gatewayBaseUrl,
    fetchImpl: input.fetchImpl,
    artifactId: input.result.presentation.presentationId,
    expectedJwt: input.holderPresentationJwt,
    holderDid: input.holderDid,
    audience: input.audience,
    recipient: input.recipient,
    purpose: purposeLabel(input.purpose, input.purposeLabel),
    consentRef: input.consentRef,
  });
  return {
    ...publication,
    publicUrl: publication.publicUrl,
    qrPayload: publication.qrPayload,
    verificationEvidence,
  };
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
  if (certified) {
    throw new Error(
      "Certified SHL trust artifacts must be associated through Wallet Exchange v2, not the generic Share Gateway.",
    );
  }
  const plainManifest = assertPlainShlManifest(manifest);
  const manifestPublication = await publishShareArtifact({
    gatewayBaseUrl: input.gatewayBaseUrl,
    fetchImpl: input.fetchImpl,
    request: {
      artifactId: publicationId,
      kind: "standard_shl_manifest",
      contentType: "application/json",
      payload: plainManifest,
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

  return {
    ...manifestPublication,
    publicUrl: manifestPublication.publicUrl ?? shl.manifestUrl,
    qrPayload: shl.qrPayload,
    warnings: [
      ...(manifestPublication.warnings ?? []),
      ...(shl.warnings ?? []),
    ],
  };
}

export async function publishHolderAttestedShl(input: {
  gatewayBaseUrl: string;
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
    input.prepared.packageBinding.holderDid !== input.holderDid
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
          expiresAt: input.prepared.packageBinding.expiresAt,
        },
      }),
    ),
  );
  const manifestPublication = await publishShareArtifact({
    ...common,
    request: {
      artifactId: input.prepared.packageBinding.publicationId,
      kind: "standard_shl_manifest",
      contentType: "application/json",
      payload: input.prepared.manifest,
      ownerUserId: input.userId,
      holderDid: input.holderDid,
      context: input.purpose,
      purpose: purposeLabel(input.purpose, input.purposeLabel),
      recipient: input.recipient,
      expiresAt: input.prepared.packageBinding.expiresAt,
    },
  });
  const manifestUrl = manifestPublication.publicUrl;
  if (!manifestUrl || manifestUrl !== input.prepared.packageBinding.manifestUrl) {
    throw new Error(
      "Share Gateway did not return the exact canonical Plain SHL manifest URL.",
    );
  }
  const canonicalShlUrl = createShlLinkPayload({
    url: manifestUrl,
    key: input.prepared.shlContentKey,
    label: input.prepared.packageBinding.accessPolicy.purpose,
    flag: "L",
    passcodeRequired:
      input.prepared.packageBinding.accessPolicy.passcodeRequired,
    expiresAt: input.prepared.packageBinding.expiresAt,
    version: 1,
  });
  return {
    trustMode: "holder_attested",
    shlPackageId: input.prepared.packageBinding.publicationId,
    manifestUrl,
    canonicalShlUrl,
    qrPayload: canonicalShlUrl,
    warnings: [
      ...filePublications.flatMap((publication) => publication.warnings ?? []),
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
    input.publication.packageBinding.holderDid !== input.holderDid
  ) {
    throw new Error(
      "Hospital-certified SHL publication does not match the Wallet holder.",
    );
  }
  return {
    trustMode: "hospital_certified",
    shlPackageId: input.publication.packageBinding.publicationId,
    // The immutable Standard SHL manifest remains Wallet-owned transport.
    // Hospital certification is the separately signed Manifest VC below; a
    // browser caller must never publish a self-asserted certified manifest.
    manifestUrl: input.publication.packageBinding.manifestUrl,
    warnings: [],
  };
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
  if (!response.ok) {
    throw await shareGatewayProblem(response);
  }
  const payload = await response.json().catch(() => null);
  const gatewayPayload = assertShareGatewayPublicationResponse(payload);
  return gatewayPayload;
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

export async function verifyPublishedPresentation(input: {
  gatewayBaseUrl: string;
  artifactId: string;
  expectedJwt: string;
  holderDid: string;
  audience?: string;
  recipient?: string;
  purpose?: string;
  consentRef?: string;
  fetchImpl?: ShareGatewayFetch;
}): Promise<PublicPresentationVerificationEvidence> {
  const gatewayBaseUrl = normalizeShareGatewayBaseUrl(input.gatewayBaseUrl);
  const resolverUrl = `${gatewayBaseUrl}/presentations/${encodeURIComponent(input.artifactId)}.jwt`;
  assertImmutablePresentationResolverQrPayload(resolverUrl, {
    origin: gatewayBaseUrl,
    artifactId: input.artifactId,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  const resolvedResponse = await fetchImpl(resolverUrl, {
    headers: {
      accept: "application/vp+jwt, text/plain, application/problem+json",
    },
    cache: "no-store",
  });
  if (!resolvedResponse.ok) {
    throw await shareGatewayProblem(resolvedResponse);
  }
  const resolved = await resolvedResponse.text();
  if (resolved !== input.expectedJwt) {
    throw new PortalInteroperabilityProblemError(
      "Share Gateway resolver changed the exact Wallet-signed Holder VP bytes.",
      {
        status: resolvedResponse.status,
        code: "share_gateway_holder_vp_bytes_changed",
        requestId: resolvedResponse.headers.get("x-request-id") ?? undefined,
        correlationId:
          resolvedResponse.headers.get("x-correlation-id") ?? undefined,
      },
    );
  }
  await verifyHolderVpLocally(input);
  const evidenceUrl = `${gatewayBaseUrl}/presentations/${encodeURIComponent(input.artifactId)}/verification-evidence`;
  const evidenceResponse = await fetchImpl(evidenceUrl, {
    headers: { accept: "application/json, application/problem+json" },
    cache: "no-store",
  });
  if (!evidenceResponse.ok) {
    throw await shareGatewayProblem(evidenceResponse);
  }
  const evidence = recordValue(await evidenceResponse.json().catch(() => null));
  if (!evidence) {
    throw new PortalInteroperabilityProblemError(
      "Share Gateway verification evidence is malformed.",
      {
        status: evidenceResponse.status,
        code: "share_gateway_evidence_invalid",
        requestId: evidenceResponse.headers.get("x-request-id") ?? undefined,
        correlationId:
          evidenceResponse.headers.get("x-correlation-id") ?? undefined,
      },
    );
  }
  const expectedVpContentHash = await sha256Digest(input.expectedJwt);
  assertPublicEvidence({
    evidence,
    artifactId: input.artifactId,
    resolverUrl,
    expectedVpContentHash,
  });
  return evidence as PublicPresentationVerificationEvidence;
}

async function verifyHolderVpLocally(input: {
  expectedJwt: string;
  holderDid: string;
  audience?: string;
  recipient?: string;
  purpose?: string;
  consentRef?: string;
}): Promise<void> {
  const header = decodeProtectedHeader(input.expectedJwt);
  if (
    !["EdDSA", "ES256"].includes(String(header.alg)) ||
    header.typ !== "vp+jwt" ||
    header.cty !== "vp" ||
    header.kid !== verificationMethodKidFromDidKey(input.holderDid)
  ) {
    throw new Error("Holder VP protected header is invalid.");
  }
  const verified = await compactVerify(
    input.expectedJwt,
    await importJWK(publicJwkFromDidKey(input.holderDid), String(header.alg)),
    { algorithms: [String(header.alg)] },
  );
  const payload = JSON.parse(
    new TextDecoder().decode(verified.payload),
  ) as Record<string, unknown>;
  assertTrustCareDirectPresentation({
    payload,
    expectedHolderDid: input.holderDid,
    expectedAudience: input.audience,
    expectedRecipient: input.recipient,
    expectedPurpose: input.purpose,
    expectedConsentRef: input.consentRef,
  });
}

function assertPublicEvidence(input: {
  evidence: Record<string, unknown>;
  artifactId: string;
  resolverUrl: string;
  expectedVpContentHash: `sha256:${string}`;
}): void {
  const checks = Array.isArray(input.evidence.checks)
    ? input.evidence.checks.map(recordValue)
    : [];
  const expectedChecks = [
    "proof",
    "issuer",
    "status",
    "expiry",
    "policy",
    "binding",
  ];
  const subjects = Array.isArray(input.evidence.subjects)
    ? input.evidence.subjects.map(recordValue)
    : [];
  const vpSubject = subjects.find(
    (subject) =>
      subject?.role === "vp" &&
      subject.contentHash === input.expectedVpContentHash,
  );
  if (
    input.evidence.version !== "1" ||
    input.evidence.verified !== true ||
    input.evidence.artifactId !== input.artifactId ||
    input.evidence.resolverUrl !== input.resolverUrl ||
    typeof input.evidence.requestId !== "string" ||
    typeof input.evidence.correlationId !== "string" ||
    !vpSubject ||
    checks.length !== expectedChecks.length ||
    expectedChecks.some(
      (key) =>
        checks.filter(
          (check) => check?.key === key && check.state === "pass",
        ).length !== 1,
    )
  ) {
    throw new PortalInteroperabilityProblemError(
      "Share Gateway public evidence is not an exact six-check pass for the published Holder VP.",
      {
        code: "share_gateway_evidence_not_verified",
        requestId:
          typeof input.evidence.requestId === "string"
            ? input.evidence.requestId
            : undefined,
        correlationId:
          typeof input.evidence.correlationId === "string"
            ? input.evidence.correlationId
            : undefined,
        problem: input.evidence,
      },
    );
  }
}

async function shareGatewayProblem(
  response: Response,
): Promise<PortalInteroperabilityProblemError> {
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const problem = recordValue(await response.clone().json().catch(() => null));
  return new PortalInteroperabilityProblemError(
    typeof problem?.detail === "string"
      ? problem.detail
      : `Share Gateway request failed with HTTP ${response.status}.`,
    {
      status: response.status,
      code:
        contentType === "application/problem+json" &&
        typeof problem?.code === "string"
          ? problem.code
          : "share_gateway_problem_invalid",
      requestId: response.headers.get("x-request-id") ?? undefined,
      correlationId:
        response.headers.get("x-correlation-id") ?? undefined,
      problem: problem ?? undefined,
    },
  );
}

async function sha256Digest(value: string): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return `sha256:${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
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

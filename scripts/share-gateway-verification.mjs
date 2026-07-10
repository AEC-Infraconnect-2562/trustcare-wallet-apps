import {
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
} from "../packages/wallet-core/node_modules/jose/dist/webapi/index.js";

const CHECK_KEYS = [
  "proof",
  "issuer",
  "status",
  "expiry",
  "policy",
  "binding",
];
const ACTIVE_STATUS_VALUES = new Set(["active", "current", "valid", "final"]);
const TRUSTCARE_STATUS_TYPES = new Set([
  "TrustCareStatusList2026",
  "TrustCareCredentialStatus2026",
  "TrustCareDemoPayerStatus",
]);
const DEFAULT_AUDIENCE = "https://trustcare.network/verifier";

/**
 * Independently evaluates an immutable, stored VP JWT with gateway-controlled
 * key material. The request is used only as a binding input; no pass/fail flag
 * from either the VP or request is trusted as evidence.
 */
export async function evaluateStoredVpVerificationEvidence(input) {
  const checkedAt = dateValue(input.now) ?? new Date();
  const checkedAtIso = checkedAt.toISOString();
  const request = recordValue(input.request) ?? {};
  const vpResult = await verifyGatewayJwt({
    jwt: input.jwt,
    kind: "vp",
    resolveSigningContext: input.resolveSigningContext,
  });
  const vp = vpResult.payload;
  const nestedValues = Array.isArray(vp.verifiableCredential)
    ? vp.verifiableCredential
    : [];
  const nestedResults = await Promise.all(
    nestedValues.map(async (value) => {
      const jwt = extractCredentialJwt(value);
      if (!jwt) {
        return failedNestedCredential(
          value,
          "Credential is not an issuer-signed vc+jwt envelope.",
        );
      }
      return verifyGatewayJwt({
        jwt,
        kind: "vc",
        resolveSigningContext: input.resolveSigningContext,
      });
    }),
  );

  const subjects = await buildSubjects(vpResult, nestedResults);
  const subjectDigests = subjects.map((subject) => subject.digest);
  const packageDigest = await sha256Digest(
    subjects.map(({ role, digest, issuerDid, holderDid, validUntil }) => ({
      role,
      digest,
      issuerDid,
      holderDid,
      validUntil,
    })),
  );
  const context = {
    recipient: stringOrUndefined(vp.recipient),
    purpose: stringOrUndefined(vp.purpose),
    audience: audienceSummary(vp.aud),
    selectedClaims: Array.isArray(vp.selectedFields)
      ? vp.selectedFields.map(String)
      : undefined,
    policyVersion: stringOrUndefined(recordValue(vp.trustcare)?.policyVersion),
  };
  const contextDigest = await sha256Digest(context);

  const hasCredentials = nestedResults.length > 0;
  const proofPassed =
    vpResult.proofVerified &&
    hasCredentials &&
    nestedResults.every((result) => result.proofVerified);
  const issuerPassed =
    vpResult.issuerVerified &&
    hasCredentials &&
    nestedResults.every((result) => result.issuerVerified);
  const expiryPassed =
    temporalCheck(vp, checkedAt).ok &&
    hasCredentials &&
    nestedResults.every((result) => temporalCheck(result.payload, checkedAt).ok);
  const statusResults = nestedResults.map((result) =>
    signedStatusCheck(result.payload.credentialStatus),
  );
  const statusPassed =
    hasCredentials &&
    nestedResults.every((result) => result.proofVerified) &&
    statusResults.every((result) => result.ok);

  const purpose = stringOrUndefined(vp.purpose);
  const recipient = stringOrUndefined(vp.recipient);
  const audience = audienceSummary(vp.aud);
  const allowedAudience =
    stringOrUndefined(input.allowedAudience) ?? DEFAULT_AUDIENCE;
  const requestContextMatches =
    stringOrUndefined(request.purpose) === purpose &&
    stringOrUndefined(request.recipient) === recipient &&
    stringOrUndefined(request.audience) === audience;
  const policyPassed = Boolean(
    purpose &&
      (recipient || audience) &&
      audience === allowedAudience &&
      requestContextMatches,
  );

  const holder = stringOrUndefined(vp.holder);
  const subject = stringOrUndefined(vp.sub);
  const presentationId = stringOrUndefined(vp.jti ?? vp.id);
  const bindingPassed = Boolean(
    input.artifactId &&
      presentationId === input.artifactId &&
      holder &&
      subject === holder &&
      stringOrUndefined(request.subjectDigest) === subjects[0]?.digest &&
      stringOrUndefined(request.packageDigest) === packageDigest &&
      stringOrUndefined(request.contextDigest) === contextDigest,
  );

  const states = {
    proof: proofPassed,
    issuer: issuerPassed,
    status: statusPassed,
    expiry: expiryPassed,
    policy: policyPassed,
    binding: bindingPassed,
  };
  const details = {
    proof: verificationDetail(vpResult, nestedResults, "proof"),
    issuer: verificationDetail(vpResult, nestedResults, "issuer"),
    status: statusResults.length
      ? statusResults.map((result) => result.detail).join(" ")
      : "No nested VC status reference was available.",
    expiry: [temporalCheck(vp, checkedAt), ...nestedResults.map((result) => temporalCheck(result.payload, checkedAt))]
      .map((result) => result.detail)
      .join(" "),
    policy: policyPassed
      ? `Purpose, recipient and audience are bound to ${allowedAudience}.`
      : "Purpose/recipient/audience policy or request context binding failed.",
    binding: bindingPassed
      ? "Artifact id, holder subject and recomputed request digests match."
      : "Artifact id, holder subject or a recomputed request digest does not match.",
  };

  return {
    version: "1",
    providerId:
      stringOrUndefined(input.providerId) ??
      "trustcare-wallet-share-gateway:verification-evidence",
    packageDigest,
    contextDigest,
    subjects,
    policy: {
      id: stringOrUndefined(input.policyId) ?? "trustcare-purpose-bound-vp",
      version:
        stringOrUndefined(input.policyVersion) ??
        context.policyVersion ??
        "2026.07",
    },
    checkedAt: checkedAtIso,
    expiresAt: evidenceExpiry(checkedAt, [vp, ...nestedResults.map((result) => result.payload)]),
    checks: CHECK_KEYS.map((key) => ({
      key,
      state: states[key] ? "pass" : "fail",
      subjectDigests,
      checkedAt: checkedAtIso,
      authority: authorityForCheck(key),
      detail: details[key],
    })),
  };
}

async function verifyGatewayJwt(input) {
  const jwt = issuerJwt(input.jwt);
  let header = {};
  let payload = {};
  const errors = [];
  try {
    header = decodeProtectedHeader(jwt);
    payload = decodeJwt(jwt);
  } catch (error) {
    return {
      kind: input.kind,
      header,
      payload,
      signingContext: null,
      proofVerified: false,
      issuerVerified: false,
      errors: [errorMessage(error, "JWT cannot be decoded.")],
    };
  }

  const signingContext =
    (await input.resolveSigningContext?.({
      kind: input.kind,
      header,
      payload,
    })) ?? null;
  const expectedType = input.kind === "vp" ? "vp+jwt" : "vc+jwt";
  const headerValid =
    header.alg === "ES256" &&
    header.typ === expectedType &&
    typeof header.kid === "string";
  if (!headerValid) {
    errors.push(`JWT header must use ES256, ${expectedType}, and an allowlisted kid.`);
  }

  let signatureVerified = false;
  if (signingContext && headerValid) {
    try {
      const key = await importJWK(signingContext.publicJwk, "ES256");
      const verified = await compactVerify(jwt, key, {
        algorithms: ["ES256"],
        typ: expectedType,
      });
      payload = JSON.parse(new TextDecoder().decode(verified.payload));
      signatureVerified = true;
    } catch (error) {
      errors.push(errorMessage(error, "JWT signature verification failed."));
    }
  } else if (!signingContext) {
    errors.push("JWT kid is not controlled by this Share Gateway.");
  }

  const kid = stringOrUndefined(header.kid);
  const issuerDid = stringOrUndefined(payload.iss);
  const controllerMatches = Boolean(
    signingContext &&
      kid === signingContext.kid &&
      controllerDid(kid) === signingContext.issuerDid,
  );
  const issuerClaim = credentialIssuerDid(payload);
  const issuerMatches = Boolean(
    signingContext &&
      issuerDid === signingContext.issuerDid &&
      (input.kind === "vp" || issuerClaim === signingContext.issuerDid),
  );
  const proofMetadataMatches =
    input.kind !== "vp" || vpProofMetadataMatches(payload, kid);
  if (!controllerMatches) errors.push("JWT kid/controller binding failed.");
  if (!issuerMatches) errors.push("JWT issuer is not bound to the signing controller.");
  if (!proofMetadataMatches) {
    errors.push("VP Data Integrity proof metadata is not bound to the JWT signer.");
  }

  return {
    kind: input.kind,
    header,
    payload,
    signingContext,
    proofVerified:
      signatureVerified && controllerMatches && proofMetadataMatches,
    issuerVerified: signatureVerified && controllerMatches && issuerMatches,
    errors,
  };
}

async function buildSubjects(vpResult, nestedResults) {
  const vp = vpResult.payload;
  const vpSubject = {
    role: "vp",
    digest: await sha256Digest(vp),
    issuerDid: vpResult.issuerVerified
      ? vpResult.signingContext?.issuerDid
      : stringOrUndefined(vp.iss),
    holderDid: stringOrUndefined(vp.holder),
    validUntil: artifactValidUntil(vp),
  };
  const vcSubjects = await Promise.all(
    nestedResults.map(async (result) => ({
      role: "vc",
      digest: await sha256Digest(result.payload),
      issuerDid: credentialIssuerDid(result.payload),
      holderDid: credentialSubjectDid(result.payload),
      validUntil: artifactValidUntil(result.payload),
      statusReference: result.payload.credentialStatus,
    })),
  );
  return [vpSubject, ...vcSubjects];
}

function failedNestedCredential(value, message) {
  return {
    kind: "vc",
    header: {},
    payload: recordValue(value) ?? { id: String(value ?? "credential") },
    signingContext: null,
    proofVerified: false,
    issuerVerified: false,
    errors: [message],
  };
}

function signedStatusCheck(statusReference) {
  const status = recordValue(statusReference);
  if (!status) {
    return {
      ok: false,
      detail: "VC has no governed, issuer-signed status reference.",
    };
  }
  const type = stringOrUndefined(status.type);
  const id = stringOrUndefined(status.id);
  const statusValue = stringOrUndefined(status.status)?.toLowerCase();
  const governed = Boolean(type && id && TRUSTCARE_STATUS_TYPES.has(type));
  const active = Boolean(statusValue && ACTIVE_STATUS_VALUES.has(statusValue));
  return {
    ok: governed && active,
    detail:
      governed && active
        ? `Issuer-signed ${type} reference ${id} reports ${statusValue}; no VP self-asserted status flag was used.`
        : "VC status reference is missing, inactive, or not an allowlisted TrustCare status scheme.",
  };
}

function temporalCheck(payload, now) {
  const exp = Number(payload.exp);
  const expMs = Number.isFinite(exp) ? exp * 1000 : Number.NaN;
  const validUntil = artifactValidUntil(payload);
  const validUntilMs = validUntil ? Date.parse(validUntil) : Number.NaN;
  const iat = Number(payload.iat);
  const issuedInPast = !Number.isFinite(iat) || iat * 1000 <= now.getTime();
  const ok =
    Number.isFinite(expMs) &&
    expMs > now.getTime() &&
    Number.isFinite(validUntilMs) &&
    validUntilMs > now.getTime() &&
    issuedInPast;
  return {
    ok,
    detail: ok
      ? `Signed exp and validUntil are active through ${validUntil}.`
      : "Signed exp/validUntil is missing, expired, invalid, or iat is in the future.",
  };
}

function vpProofMetadataMatches(payload, kid) {
  const proof = recordValue(payload.proof);
  if (!proof) return false;
  return (
    proof.type === "DataIntegrityProof" &&
    proof.proofPurpose === "authentication" &&
    proof.verificationMethod === kid &&
    typeof proof.proofValue === "string" &&
    proof.proofValue.length > 1
  );
}

function verificationDetail(vpResult, nestedResults, kind) {
  const failures = [vpResult, ...nestedResults]
    .filter((result) =>
      kind === "proof" ? !result.proofVerified : !result.issuerVerified,
    )
    .flatMap((result) => result.errors);
  if (failures.length) return failures.join(" ");
  return kind === "proof"
    ? "VP JWT and every nested VC JWT passed ES256 signature and controller verification."
    : "Every issuer is bound to an allowlisted gateway, hospital, or payer integration DID controller.";
}

function authorityForCheck(key) {
  if (key === "proof") return "trustcare-share-gateway:cryptographic-verifier";
  if (key === "issuer") return "trustcare-share-gateway:allowlisted-did-controller";
  if (key === "status") return "trustcare-share-gateway:signed-status-policy";
  if (key === "expiry") return "trustcare-share-gateway:temporal-policy";
  if (key === "policy") return "trustcare-share-gateway:purpose-bound-policy";
  return "trustcare-share-gateway:artifact-binding-policy";
}

function evidenceExpiry(now, payloads) {
  const maximum = now.getTime() + 5 * 60_000;
  const futureExpiries = payloads
    .flatMap((payload) => {
      const exp = Number(payload.exp);
      const validUntil = artifactValidUntil(payload);
      return [
        Number.isFinite(exp) ? exp * 1000 : Number.NaN,
        validUntil ? Date.parse(validUntil) : Number.NaN,
      ];
    })
    .filter((value) => Number.isFinite(value) && value > now.getTime());
  return new Date(Math.min(maximum, ...futureExpiries, maximum)).toISOString();
}

function extractCredentialJwt(value) {
  if (typeof value === "string") {
    return jwtFromDataUrl(value) ?? (looksLikeJwt(value) ? issuerJwt(value) : null);
  }
  const object = recordValue(value);
  if (!object) return null;
  if (typeof object.id === "string") {
    const fromId = jwtFromDataUrl(object.id);
    if (fromId) return fromId;
  }
  for (const key of ["jwt", "vcJwt", "sdJwtVc"]) {
    const candidate = object[key];
    if (typeof candidate !== "string") continue;
    const fromDataUrl = jwtFromDataUrl(candidate);
    if (fromDataUrl) return fromDataUrl;
    if (looksLikeJwt(candidate)) return issuerJwt(candidate);
  }
  return null;
}

function jwtFromDataUrl(value) {
  if (!value.startsWith("data:")) return null;
  const comma = value.indexOf(",");
  if (comma < 0) return null;
  const metadata = value.slice(5, comma).toLowerCase().split(";");
  if (metadata[0] !== "application/vc+jwt") return null;
  try {
    const encoded = value.slice(comma + 1);
    const jwt = metadata.includes("base64")
      ? Buffer.from(encoded, "base64").toString("utf8")
      : decodeURIComponent(encoded);
    return looksLikeJwt(jwt) ? issuerJwt(jwt) : null;
  } catch {
    return null;
  }
}

function looksLikeJwt(value) {
  return issuerJwt(String(value)).split(".").length === 3;
}

function issuerJwt(value) {
  return String(value ?? "").trim().split("~")[0];
}

function credentialIssuerDid(payload) {
  if (typeof payload.issuer === "string") return stringOrUndefined(payload.issuer);
  return stringOrUndefined(recordValue(payload.issuer)?.id);
}

function credentialSubjectDid(payload) {
  return stringOrUndefined(recordValue(payload.credentialSubject)?.id);
}

function artifactValidUntil(payload) {
  return stringOrUndefined(payload.validUntil ?? payload.expirationDate);
}

function controllerDid(kid) {
  return typeof kid === "string" ? kid.split("#")[0] : undefined;
}

function audienceSummary(value) {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) {
    const audience = value.map(String).filter(Boolean);
    return audience.length ? audience.join(", ") : undefined;
  }
  return undefined;
}

async function sha256Digest(value) {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

export function stableStringify(value) {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function dateValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const parsed = new Date(value ?? Number.NaN);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

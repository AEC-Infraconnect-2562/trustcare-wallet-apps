import { createHash, timingSafeEqual } from "node:crypto";

export const GATEWAY_MUTATION_PATHS = new Set([
  "/api/share-gateway/artifacts",
  "/api/share-gateway/payer/credentials/issue",
]);

export const SUPPORTED_SHARE_ARTIFACT_KINDS = new Set([
  "vp",
  "standard_shl_manifest",
  "shl_file",
]);

const PROTECTED_CREDENTIAL_SOURCES = new Set([
  "portal_synced",
  "payer_adapter",
]);

export const DEMO_PAYER_ISSUER_PROFILES = Object.freeze({
  nhso_mock: Object.freeze({
    payerId: "nhso_mock",
    name: "NHSO Demo Integration Issuer",
    payerType: "public",
  }),
  global_care_insurance_demo: Object.freeze({
    payerId: "global_care_insurance_demo",
    name: "Global Care Insurance Demo Integration Issuer",
    payerType: "private_insurer",
  }),
  international_tpa_mock: Object.freeze({
    payerId: "international_tpa_mock",
    name: "International TPA Demo Integration Issuer",
    payerType: "international_tpa",
  }),
});

export function isGatewayMutationRequest(method, pathname) {
  return (
    String(method || "").toUpperCase() === "POST" &&
    GATEWAY_MUTATION_PATHS.has(String(pathname || ""))
  );
}

export function authorizeGatewayMutation(input) {
  if (!isGatewayMutationRequest(input.method, input.pathname)) {
    return { ok: true, reason: "not_gateway_mutation" };
  }

  if (serviceTokenMatches(input.authorization, input.configuredServiceToken)) {
    return { ok: true, reason: "service_token" };
  }

  const origin = normalizeOrigin(input.origin);
  const trustedOrigins = new Set(
    [...(input.trustedOrigins ?? [])].map(normalizeOrigin).filter(Boolean),
  );
  if (origin && trustedOrigins.has(origin)) {
    return { ok: true, reason: "trusted_origin" };
  }

  if (!input.production && !origin) {
    return { ok: true, reason: "local_non_browser" };
  }

  return {
    ok: false,
    reason: origin ? "untrusted_origin" : "missing_origin_or_service_token",
  };
}

export function credentialSourceMetadata(body, credential) {
  const trustcare = recordValue(credential?.trustcare);
  const shareSource = recordValue(trustcare?.shareSource);
  const explicitAuthority = lowerText(
    body?.sourceAuthority ??
      shareSource?.authority ??
      trustcare?.shareSourceAuthority,
  );
  const sourceSystem = lowerText(
    body?.sourceSystem ?? shareSource?.sourceSystem ?? trustcare?.sourceSystem,
  );
  const issuerId = lowerText(issuerIdFromCredential(credential));
  const credentialTypes = credentialTypeText(credential);

  if (
    explicitAuthority === "portal_synced" ||
    sourceSystem.includes("portal") ||
    lowerText(trustcare?.portalCredentialId).length > 0
  ) {
    return {
      authority: "portal_synced",
      sourceSystem,
      signingOwner: lowerText(body?.signingOwner ?? shareSource?.signingOwner),
    };
  }

  if (
    explicitAuthority === "payer_adapter" ||
    sourceSystem.includes("payer") ||
    sourceSystem.includes("insurance") ||
    issuerId.includes(":payer:") ||
    /(^|\s)(payer|eligibility|claim|guarantee)(\s|$)/.test(credentialTypes)
  ) {
    return {
      authority: "payer_adapter",
      sourceSystem,
      signingOwner: lowerText(body?.signingOwner ?? shareSource?.signingOwner),
    };
  }

  return {
    authority: explicitAuthority || "unknown",
    sourceSystem,
    signingOwner: lowerText(body?.signingOwner ?? shareSource?.signingOwner),
  };
}

export function validateDemoPayerIssuanceRequest(body, credential) {
  const source = credentialSourceMetadata(body, credential);
  if (source.authority === "portal_synced") {
    return {
      ok: false,
      status: 422,
      source,
      message:
        "Portal-synced credentials cannot enter the demo payer issuance operation.",
    };
  }
  if (body?.issuerServiceOperation !== "demo_payer_integration_issue") {
    return {
      ok: false,
      status: 422,
      source,
      message:
        "issuerServiceOperation=demo_payer_integration_issue is required.",
    };
  }
  if (
    source.authority !== "payer_adapter" ||
    source.signingOwner !== "payer_adapter"
  ) {
    return {
      ok: false,
      status: 422,
      source,
      message:
        "Only a payer_adapter artifact may use the demo payer integration issuer.",
    };
  }

  const payerId = lowerText(body?.payerId);
  const profile = DEMO_PAYER_ISSUER_PROFILES[payerId];
  if (!profile) {
    return {
      ok: false,
      status: 422,
      source,
      message: "payerId is not an allowlisted demo payer integration profile.",
    };
  }

  const credentialPayerId = payerIdFromCredential(credential);
  if (credentialPayerId && credentialPayerId !== payerId) {
    return {
      ok: false,
      status: 422,
      source,
      message:
        "Credential payerId does not match the requested demo payer integration profile.",
    };
  }

  return { ok: true, status: 200, source, payerId, profile };
}

export function unsignedCredentialPublicationPolicy(input) {
  const source = credentialSourceMetadata({}, input.credential);
  if (PROTECTED_CREDENTIAL_SOURCES.has(source.authority)) {
    return {
      ok: false,
      source,
      message:
        source.authority === "portal_synced"
          ? "Unsigned Portal-synced credential cannot be published. Sync the original issuer-signed vc+jwt before sharing."
          : "Unsigned payer credential cannot be published. Obtain a payer/integration-issuer vc+jwt before sharing.",
    };
  }
  if (input.production) {
    return {
      ok: false,
      source,
      message: `Unsigned ${source.authority} credential cannot be published by the production gateway; an existing issuer-signed vc+jwt is required.`,
    };
  }
  return { ok: true, source };
}

export function publicationRequestDigest(value) {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function immutableArtifactDecision(existing, requestDigest) {
  if (!existing) return { status: "create" };
  if (
    typeof existing.requestDigest === "string" &&
    existing.requestDigest.length > 0 &&
    existing.requestDigest === requestDigest
  ) {
    return { status: "idempotent", artifact: existing };
  }
  return { status: "conflict", artifact: existing };
}

function serviceTokenMatches(authorization, configuredServiceToken) {
  const expected = String(configuredServiceToken ?? "").trim();
  const header = String(authorization ?? "");
  if (!expected || !header.startsWith("Bearer ")) return false;
  const actual = header.slice("Bearer ".length).trim();
  if (!actual) return false;
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function normalizeOrigin(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    return new URL(text).origin;
  } catch {
    return text.replace(/\/+$/, "");
  }
}

function canonicalJson(value) {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function issuerIdFromCredential(credential) {
  const issuer = credential?.issuer;
  if (typeof issuer === "string") return issuer;
  return recordValue(issuer)?.id ?? "";
}

function credentialTypeText(credential) {
  const type = credential?.type;
  const values = Array.isArray(type) ? type : [type];
  return values.map(lowerText).filter(Boolean).join(" ");
}

function payerIdFromCredential(credential) {
  const subject = recordValue(credential?.credentialSubject);
  const payer = recordValue(subject?.payer);
  const trustcare = recordValue(credential?.trustcare);
  return lowerText(
    credential?.payerId ??
      subject?.payerId ??
      payer?.payerId ??
      trustcare?.payerId,
  );
}

function recordValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function lowerText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

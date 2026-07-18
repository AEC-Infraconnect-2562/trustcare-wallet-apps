import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  SignJWT,
  calculateJwkThumbprint,
} from "../packages/wallet-core/node_modules/jose/dist/webapi/index.js";
import {
  createLocalDevelopmentSigningKey,
  loadConfiguredSigningKey,
  sanitizePublicJwk,
} from "./share-gateway-signing.mjs";
import {
  createArtifactStore,
  validIsoDateOrNull,
} from "./share-gateway-store.mjs";
import {
  DEMO_PAYER_ISSUER_PROFILES,
  SUPPORTED_SHARE_ARTIFACT_KINDS,
  authorizeGatewayMutation,
  immutableArtifactDecision,
  publicationRequestDigest,
  validateDemoPayerIssuanceRequest,
} from "./share-gateway-policy.mjs";
import { evaluateStoredVpVerificationEvidence } from "./share-gateway-verification.mjs";
import {
  resolvePortalHospitalVerificationContext,
  TRUSTCARE_PORTAL_SANDBOX_ORIGIN,
} from "./portal-hospital-issuer.mjs";

const root = resolve("apps/wallet-web/dist");
const port = positiveIntegerFromEnv("PORT", 3000);
const maxJsonBodyBytes = positiveIntegerFromEnv(
  "TRUSTCARE_GATEWAY_MAX_BODY_BYTES",
  1_000_000,
);
const signingContexts = new Map();
const payerIssuerSigningContexts = new Map();
const productionGateway = isProductionGatewayRuntime();
const configuredSigningKey = await loadConfiguredSigningKey(productionGateway);
const artifactStore = await createArtifactStore(productionGateway);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
]);

function resolveAssetPath(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0] ?? "/");
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relative =
    normalized === sep ? "index.html" : normalized.replace(/^[/\\]+/, "");
  const candidate = resolve(join(root, relative));
  if (!candidate.startsWith(root)) return join(root, "index.html");
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(root, "index.html");
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    const requestUrl = new URL(request.url ?? "/", requestOrigin(request));
    if (handleCorsPreflight(request, response, requestUrl)) return;
    setCorsHeaders(request, response, requestUrl);

    if (!isRequestOriginAllowed(request, requestUrl)) {
      json(response, 403, {
        ok: false,
        errors: [
          "A trusted Origin or valid Share Gateway service token is required for this mutation.",
        ],
      });
      return;
    }

    if (
      requestUrl.pathname === "/.well-known/jwks.json" ||
      requestUrl.pathname === "/api/share-gateway/.well-known/jwks.json"
    ) {
      const context = await getSigningContext(requestOrigin(request));
      json(response, 200, publicJwksForContext(context));
      return;
    }
    if (
      requestUrl.pathname === "/.well-known/did.json" ||
      requestUrl.pathname === "/api/share-gateway/.well-known/did.json" ||
      requestUrl.pathname === "/api/share-gateway/did.json"
    ) {
      const context = await getSigningContext(requestOrigin(request));
      json(response, 200, didDocumentForContext(context));
      return;
    }
    const payerDocumentRoute = matchPayerIssuerDidRoute(requestUrl.pathname);
    if (payerDocumentRoute) {
      const context = await getPayerIssuerSigningContext(
        requestOrigin(request),
        payerDocumentRoute.payerId,
      );
      json(
        response,
        200,
        payerDocumentRoute.kind === "jwks"
          ? publicJwksForContext(context)
          : didDocumentForContext(context),
      );
      return;
    }

    if (/^\/s\/[A-Za-z0-9_-]{43}$/.test(requestUrl.pathname)) {
      await handlePlainShlManifestRequest(request, response, requestUrl);
      return;
    }

    if (requestUrl.pathname.startsWith("/api/share-gateway")) {
      await handleShareGatewayRequest(request, response, requestUrl);
      return;
    }

    const filePath = resolveAssetPath(requestUrl.pathname);
    const extension = extname(filePath);
    response.setHeader(
      "Cache-Control",
      extension === ".html"
        ? "no-store"
        : "public, max-age=31536000, immutable",
    );
    response.setHeader(
      "Content-Type",
      contentTypes.get(extension) ?? "application/octet-stream",
    );
    createReadStream(filePath).pipe(response);
  } catch (error) {
    const status = httpStatusFromError(error);
    json(response, status, {
      ok: false,
      errors: [safeErrorMessage(error, status)],
    });
  }
});

async function handlePlainShlManifestRequest(request, response, requestUrl) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, {
      ok: false,
      errors: ["Plain SHL manifest retrieval requires POST."],
    });
    return;
  }
  if (!isJsonRequest(request)) {
    json(response, 415, {
      ok: false,
      errors: ["Content-Type must be application/json."],
    });
    return;
  }
  const requestBody = await readJsonBody(request);
  const allowedKeys = new Set(["recipient", "passcode", "embeddedLengthMax"]);
  const unknownKey = Object.keys(requestBody).find(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKey) {
    json(response, 400, {
      ok: false,
      errors: [`Plain SHL manifest request field ${unknownKey} is not allowed.`],
    });
    return;
  }
  if (!stringValue(requestBody.recipient)) {
    json(response, 400, {
      ok: false,
      errors: ["Plain SHL manifest request recipient is required."],
    });
    return;
  }
  if (
    requestBody.passcode !== undefined &&
    typeof requestBody.passcode !== "string"
  ) {
    json(response, 400, {
      ok: false,
      errors: ["Plain SHL manifest request passcode must be a string."],
    });
    return;
  }
  if (
    requestBody.embeddedLengthMax !== undefined &&
    (!Number.isSafeInteger(requestBody.embeddedLengthMax) ||
      requestBody.embeddedLengthMax < 0)
  ) {
    json(response, 400, {
      ok: false,
      errors: [
        "Plain SHL manifest request embeddedLengthMax must be a non-negative integer.",
      ],
    });
    return;
  }

  const artifactId = requestUrl.pathname.slice("/s/".length);
  const stored = await artifactStore.get("standard_shl_manifest", artifactId);
  if (!stored) {
    json(response, 404, { ok: false, errors: ["SHL manifest not found."] });
    return;
  }
  if (respondIfArtifactExpired(response, stored)) return;
  json(response, 200, stored.payload);
}

async function handleShareGatewayRequest(request, response, requestUrl) {
  const origin = requestOrigin(request);
  const pathname =
    requestUrl.pathname.replace(/^\/api\/share-gateway/, "") || "/";

  const payerDocumentRoute = matchPayerIssuerDidRoute(pathname);
  if (request.method === "GET" && payerDocumentRoute) {
    const context = await getPayerIssuerSigningContext(
      origin,
      payerDocumentRoute.payerId,
    );
    json(
      response,
      200,
      payerDocumentRoute.kind === "jwks"
        ? publicJwksForContext(context)
        : didDocumentForContext(context),
    );
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    const context = await getSigningContext(origin);
    json(response, 200, {
      ok: true,
      mode: gatewayModeLabel(),
      storage: artifactStore.kind,
      persistent: artifactStore.persistent,
      issuer: context.issuerDid,
      jwksUrl: context.jku,
      didUrl: `${origin}/.well-known/did.json`,
      portalHospitalIssuerOrigin: portalBaseOrigin(),
      payerIntegrationIssuerProfiles: Object.values(
        DEMO_PAYER_ISSUER_PROFILES,
      ).map((profile) => {
        const didBaseOrigin = issuerDidBaseOrigin(origin);
        return {
          payerId: profile.payerId,
          name: profile.name,
          did: didWebFromPath(didBaseOrigin, ["payer", profile.payerId]),
          didUrl: `${didBaseOrigin}/payer/${encodeURIComponent(
            profile.payerId,
          )}/did.json`,
          jwksUrl: `${didBaseOrigin}/payer/${encodeURIComponent(
            profile.payerId,
          )}/jwks.json`,
        };
      }),
      keySource: context.keySource,
      revision: stringValue(process.env.RAILWAY_GIT_COMMIT_SHA) || null,
      branch: stringValue(process.env.RAILWAY_GIT_BRANCH) || null,
      deploymentId: stringValue(process.env.RAILWAY_DEPLOYMENT_ID) || null,
      runtimeNodeVersion: process.version,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/verification-evidence") {
    if (!isJsonRequest(request)) {
      json(response, 415, {
        ok: false,
        errors: ["Content-Type must be application/json."],
      });
      return;
    }

    const body = await readJsonBody(request);
    const artifactId = stringValue(body.artifactId);
    const evidenceRequest = isRecord(body.request) ? body.request : null;
    if (!artifactId || !evidenceRequest) {
      json(response, 400, {
        ok: false,
        errors: ["artifactId and request are required."],
      });
      return;
    }
    const stored = await artifactStore.get("vp", artifactId);
    if (!stored) {
      json(response, 404, {
        ok: false,
        errors: ["VP artifact not found."],
      });
      return;
    }
    if (
      typeof stored.payload !== "string" ||
      !String(stored.contentType).toLowerCase().includes("jwt")
    ) {
      json(response, 422, {
        ok: false,
        errors: ["Stored VP artifact is not an immutable signed VP JWT."],
      });
      return;
    }

    const evidence = await evaluateStoredVpVerificationEvidence({
      artifactId,
      jwt: stored.payload,
      request: evidenceRequest,
      now: new Date(),
      providerId: `trustcare-wallet-share-gateway:${gatewayModeLabel()}`,
      resolveSigningContext: (candidate) =>
        resolveGatewayVerificationContext(origin, candidate),
    });
    json(response, 200, evidence);
    return;
  }

  if (request.method === "POST" && pathname === "/payer/credentials/issue") {
    if (!isJsonRequest(request)) {
      json(response, 415, {
        ok: false,
        errors: ["Content-Type must be application/json."],
      });
      return;
    }

    const body = await readJsonBody(request);
    const credential = isRecord(body.credential) ? body.credential : null;
    if (!credential) {
      json(response, 400, {
        ok: false,
        errors: ["credential is required."],
      });
      return;
    }
    const issuancePolicy = validateDemoPayerIssuanceRequest(body, credential);
    if (!issuancePolicy.ok) {
      json(response, issuancePolicy.status, {
        ok: false,
        sourceAuthority: issuancePolicy.source.authority,
        errors: [issuancePolicy.message],
      });
      return;
    }

    const context = await getPayerIssuerSigningContext(
      origin,
      issuancePolicy.payerId,
    );
    const expiresAt =
      stringValue(body.expiresAt) ||
      stringValue(credential.validUntil) ||
      new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
    const signed = await signCredentialJwt({
      credential: buildPayerIssuerSignedCredential(
        credential,
        context,
        issuancePolicy.profile,
        expiresAt,
      ),
      context,
      audience:
        stringValue(body.audience) || "https://trustcare.network/verifier",
      expiresAt,
    });

    json(response, 201, {
      ok: true,
      payerId: issuancePolicy.payerId,
      credentialId: signed.credentialId,
      credentialJwt: signed.jwt,
      credentialProof: {
        type: "W3C VC JWT",
        format: "vc+jwt",
        jwt: signed.jwt,
        alg: "ES256",
        kid: context.kid,
        source: "trustcare_demo_payer_integration_issuer",
      },
      issuerDid: context.issuerDid,
      jwksUrl: context.jku,
      signedCredential: signed.credential,
      warnings: [
        "Demo payer integration issuer only; this is not a real payer adjudication or production payer endpoint.",
      ],
      errors: [],
    });
    return;
  }

  if (request.method === "POST" && pathname === "/artifacts") {
    if (!isJsonRequest(request)) {
      json(response, 415, {
        ok: false,
        errors: ["Content-Type must be application/json."],
      });
      return;
    }

    const body = await readJsonBody(request);
    const artifactId = stringValue(body.artifactId);
    const kind = stringValue(body.kind);
    if (!artifactId || !kind) {
      json(response, 400, {
        ok: false,
        errors: ["artifactId and kind are required."],
      });
      return;
    }
    if (!SUPPORTED_SHARE_ARTIFACT_KINDS.has(kind)) {
      json(response, 400, {
        ok: false,
        errors: [`Unsupported share artifact kind: ${kind}.`],
      });
      return;
    }
    if (!Object.hasOwn(body, "payload")) {
      json(response, 400, {
        ok: false,
        errors: ["payload is required."],
      });
      return;
    }
    if (
      body.expiresAt !== undefined &&
      (typeof body.expiresAt !== "string" ||
        !validIsoDateOrNull(body.expiresAt))
    ) {
      json(response, 400, {
        ok: false,
        errors: ["expiresAt must be a valid ISO date string."],
      });
      return;
    }
    if (kind === "vp" && !looksLikeJwt(body.payload)) {
      json(response, 400, {
        ok: false,
        errors: ["VP payload must be the exact Wallet-signed compact JWT."],
      });
      return;
    }
    if (kind === "standard_shl_manifest") {
      if (!/^[A-Za-z0-9_-]{43}$/.test(artifactId)) {
        json(response, 400, {
          ok: false,
          errors: [
            "Plain SHL artifactId must be a 43-character base64url token.",
          ],
        });
        return;
      }
      try {
        assertPlainShlManifest(body.payload);
      } catch (error) {
        json(response, 400, {
          ok: false,
          errors: [safeErrorMessage(error, 400)],
        });
        return;
      }
    }
    if (kind === "shl_file" && !looksLikeCompactJwe(body.payload)) {
      json(response, 400, {
        ok: false,
        errors: ["SHL file payload must be a compact JWE."],
      });
      return;
    }

    const requestDigest = publicationRequestDigest(body);
    const existing = await artifactStore.get(kind, artifactId);
    const existingDecision = immutableArtifactDecision(existing, requestDigest);
    if (existingDecision.status === "conflict") {
      json(response, 409, {
        ok: false,
        artifactId,
        kind,
        errors: [
          "artifactId already exists with different content; create a new sharing-event artifactId.",
        ],
      });
      return;
    }
    if (existingDecision.status === "idempotent") {
      sendArtifactPublicationResponse(response, 200, {
        origin,
        artifactId,
        kind,
        warnings: [
          "Idempotent retry returned the existing immutable artifact.",
        ],
      });
      return;
    }

    const now = new Date();
    const warnings = artifactStore.persistent
      ? []
      : [
          "Local development gateway uses process-local artifact storage. Railway production requires DATABASE_URL-backed storage.",
        ];
    let payload = body.payload;
    let contentType = stringValue(body.contentType) || "application/json";

    if (kind === "vp") {
      payload = body.payload;
      contentType = "application/vp+jwt";
    } else if (kind === "shl_file") {
      payload = body.payload;
      contentType = "application/jose";
    } else if (kind === "standard_shl_manifest") {
      payload = assertPlainShlManifest(body.payload);
      contentType = "application/json";
    }

    const writeResult = await artifactStore.set({
      artifactId,
      kind,
      contentType,
      payload,
      sourcePayload: body.payload,
      requestDigest,
      createdAt: now.toISOString(),
      expiresAt: stringValue(body.expiresAt) || undefined,
    });
    if (writeResult.status === "conflict") {
      json(response, 409, {
        ok: false,
        artifactId,
        kind,
        errors: [
          "artifactId was concurrently published with different content; create a new sharing-event artifactId.",
        ],
      });
      return;
    }
    if (writeResult.status === "idempotent") {
      warnings.push(
        "Idempotent retry returned the existing immutable artifact.",
      );
    }

    sendArtifactPublicationResponse(
      response,
      writeResult.status === "idempotent" ? 200 : 201,
      { origin, artifactId, kind, warnings },
    );
    return;
  }

  const artifactRoute = matchArtifactRoute(pathname);
  if (artifactRoute) {
    const stored = await artifactStore.get(
      artifactRoute.kind,
      artifactRoute.artifactId,
    );
    if (!stored) {
      json(response, 404, {
        ok: false,
        errors: [`${artifactRoute.kind} not found.`],
      });
      return;
    }
    if (respondIfArtifactExpired(response, stored)) return;
    if (
      artifactRoute.extension === "jwt" ||
      artifactRoute.extension === "jwe" ||
      stored.contentType.includes("jwt")
    ) {
      text(response, 200, String(stored.payload), stored.contentType);
      return;
    }
    json(response, 200, stored.payload);
    return;
  }

  json(response, 404, { ok: false, errors: ["Unknown share gateway route."] });
}

async function signCredentialJwt(input) {
  const now = input.now ?? new Date();
  const credential = sanitizeCredential(
    input.credential,
    input.context,
    input.expiresAt,
  );
  const credentialId = stringValue(
    credential.id,
    `urn:uuid:railway-vc-${now.getTime().toString(36)}`,
  );
  const credentialType =
    lastType(credential.type) ?? "WalletDocumentCredential";
  const expiresAt =
    stringValue(credential.validUntil) ||
    input.expiresAt ||
    new Date(now.getTime() + 365 * 24 * 60 * 60_000).toISOString();
  const disclosureDigests = await buildDisclosureDigests(
    objectValue(credential.credentialSubject),
  );
  const jwtCredential = stripUndefined({
    ...credential,
    id: credentialId,
    trustcare: {
      ...objectValue(credential.trustcare),
      jwtProfile: "w3c-vc-jose-cose",
      credentialType,
      claimDigest: await sha256Hex(credential),
      disclosureDigests,
    },
  });
  const jwt = await new SignJWT(jwtCredential)
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      kid: input.context.kid,
      jku: input.context.jku,
    })
    .setIssuer(input.context.issuerDid)
    .setSubject(subjectFromCredential(jwtCredential) ?? credentialId)
    .setAudience(input.audience)
    .setJti(credentialId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(new Date(expiresAt).getTime() / 1000))
    .sign(input.context.privateKey);
  return { jwt, credential: jwtCredential, credentialId };
}

async function getSigningContext(origin) {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const cached = signingContexts.get(normalizedOrigin);
  if (cached) return cached;
  const didBaseOrigin = issuerDidBaseOrigin(normalizedOrigin);
  const issuerDid = didWebFromOrigin(didBaseOrigin);
  const keyMaterial =
    configuredSigningKey ?? (await createLocalDevelopmentSigningKey());
  const publicJwk = sanitizePublicJwk(keyMaterial.publicJwk);
  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  const effectiveIssuerDid =
    stringValue(process.env.TRUSTCARE_GATEWAY_ISSUER_DID) || issuerDid;
  const kid =
    stringValue(process.env.TRUSTCARE_GATEWAY_SIGNING_KID) ||
    stringValue(publicJwk.kid) ||
    `${effectiveIssuerDid}#wallet-signing-key-${thumbprint.slice(0, 12)}`;
  const context = {
    issuerDid: effectiveIssuerDid,
    kid,
    jku:
      stringValue(process.env.TRUSTCARE_GATEWAY_JWKS_URL) ||
      `${didBaseOrigin}/api/share-gateway/.well-known/jwks.json`,
    privateKey: keyMaterial.privateKey,
    publicJwk: sanitizePublicJwk({
      ...publicJwk,
      alg: "ES256",
      kid,
      use: "sig",
    }),
    keySource: keyMaterial.source,
  };
  signingContexts.set(normalizedOrigin, context);
  return context;
}

async function getPayerIssuerSigningContext(origin, payerIdInput) {
  const payerId = normalizePayerId(payerIdInput);
  const profile = DEMO_PAYER_ISSUER_PROFILES[payerId];
  if (!profile) {
    throw httpError(404, "Unknown demo payer integration issuer profile.");
  }
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const cacheKey = `${normalizedOrigin}:payer:${payerId}`;
  const cached = payerIssuerSigningContexts.get(cacheKey);
  if (cached) return cached;

  const didBaseOrigin = issuerDidBaseOrigin(normalizedOrigin);
  const issuerDid = didWebFromPath(didBaseOrigin, ["payer", payerId]);
  const keyMaterial =
    configuredSigningKey ?? (await createLocalDevelopmentSigningKey());
  const publicJwk = sanitizePublicJwk(keyMaterial.publicJwk);
  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  const kid = `${issuerDid}#payer-integration-signing-key-${thumbprint.slice(
    0,
    12,
  )}`;
  const context = {
    issuerDid,
    kid,
    jku: `${didBaseOrigin}/payer/${encodeURIComponent(payerId)}/jwks.json`,
    privateKey: keyMaterial.privateKey,
    publicJwk: sanitizePublicJwk({
      ...publicJwk,
      alg: "ES256",
      kid,
      use: "sig",
    }),
    keySource: `${keyMaterial.source}:demo-payer-integration:${payerId}`,
    payerProfile: profile,
  };
  payerIssuerSigningContexts.set(cacheKey, context);
  return context;
}

async function resolveGatewayVerificationContext(origin, candidate) {
  const kid = stringValue(candidate?.header?.kid);
  const controller = kid.split("#")[0] || "";
  if (!kid || !controller) return null;

  const gatewayContext = await getSigningContext(origin);
  if (controller === gatewayContext.issuerDid && kid === gatewayContext.kid) {
    return gatewayContext;
  }
  if (candidate?.kind !== "vc") return null;

  const portalContext = await resolvePortalHospitalVerificationContext({
    portalBaseUrl: portalBaseOrigin(),
    controller,
    kid,
  });
  if (portalContext) return portalContext;

  const payerMatch = /:payer:([^:#/?]+)$/i.exec(controller);
  if (payerMatch) {
    const payerId = normalizePayerId(decodeURIComponent(payerMatch[1]));
    if (!payerId || !DEMO_PAYER_ISSUER_PROFILES[payerId]) return null;
    const context = await getPayerIssuerSigningContext(origin, payerId);
    return context.issuerDid === controller && context.kid === kid
      ? context
      : null;
  }
  return null;
}

function publicJwksForContext(context) {
  return {
    keys: [context.publicJwk],
    issuer: context.issuerDid,
    updated: new Date().toISOString(),
    mode: gatewayModeLabel(),
    storage: artifactStore.kind,
    persistent: artifactStore.persistent,
    keySource: context.keySource,
  };
}

function didDocumentForContext(context) {
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/jwk/v1",
    ],
    id: context.issuerDid,
    verificationMethod: [
      {
        id: context.kid,
        type: "JsonWebKey",
        controller: context.issuerDid,
        publicKeyJwk: context.publicJwk,
      },
    ],
    assertionMethod: [context.kid],
    authentication: [context.kid],
  };
}

function buildPayerIssuerSignedCredential(
  credential,
  context,
  payerProfile,
  expiresAt,
) {
  const originalIssuer = credential.issuer;
  return stripUndefined({
    ...credential,
    issuer: {
      id: context.issuerDid,
      name: payerProfile.name,
      trustDomain: "payer-integration",
      payerId: payerProfile.payerId,
      payerType: payerProfile.payerType,
      demo: true,
    },
    validUntil: credential.validUntil ?? expiresAt,
    evidence: [
      ...arrayValue(credential.evidence),
      {
        type: "PayerAdapterIssuance",
        payerId: payerProfile.payerId,
        sourceIssuer: originalIssuer,
        signingIssuer: context.issuerDid,
        demo: true,
      },
    ],
    trustcare: {
      ...objectValue(credential.trustcare),
      sourceAuthority: "payer_adapter",
      signingOwner: "payer_adapter",
      payerId: payerProfile.payerId,
      originalIssuer,
      signingIssuerDid: context.issuerDid,
      signingJwksUrl: context.jku,
      demoPayerIntegrationIssuer: true,
    },
  });
}

function sanitizeCredential(credential, context, expiresAt) {
  const cleaned = stripProofLikeFields(credential);
  return stripUndefined({
    ...cleaned,
    "@context": cleaned["@context"] ?? [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare.network/contexts/health/v1",
    ],
    type: ensureArray(cleaned.type, "VerifiableCredential"),
    issuer: cleaned.issuer ?? {
      id: context.issuerDid,
      name: "TrustCare Wallet Share Gateway",
    },
    validFrom:
      cleaned.validFrom ?? cleaned.issuedAt ?? new Date().toISOString(),
    validUntil: cleaned.validUntil ?? expiresAt,
  });
}

function looksLikeJwt(value) {
  if (typeof value !== "string") return false;
  const issuerJwt = value.trim().split("~")[0];
  const parts = issuerJwt.split(".");
  return parts.length === 3 && parts[0]?.startsWith("eyJ");
}

function looksLikeCompactJwe(value) {
  if (typeof value !== "string") return false;
  const parts = value.trim().split(".");
  if (parts.length !== 5 || !parts.every((part, index) => index === 1 || part)) {
    return false;
  }
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return (
      header.alg === "dir" &&
      header.enc === "A256GCM" &&
      [
        "application/smart-health-card",
        "application/fhir+json",
        "application/smart-api-access",
      ].includes(header.cty)
    );
  } catch {
    return false;
  }
}

function assertPlainShlManifest(value) {
  if (!isRecord(value)) {
    throw httpError(400, "Plain SHL manifest must be a JSON object.");
  }
  assertExactObjectKeys(value, ["status", "list", "files"], "Plain SHL manifest");
  if (
    value.status !== undefined &&
    !["finalized", "can-change", "no-longer-valid"].includes(value.status)
  ) {
    throw httpError(400, "Plain SHL manifest status is invalid.");
  }
  if (value.list !== undefined) {
    if (!isRecord(value.list) || value.list.resourceType !== "List") {
      throw httpError(400, "Plain SHL list must be a FHIR List resource.");
    }
  }
  if (!Array.isArray(value.files)) {
    throw httpError(400, "Plain SHL manifest files must be an array.");
  }
  const files = value.files.map((entry, index) => {
    const label = `Plain SHL manifest file ${index + 1}`;
    if (!isRecord(entry)) {
      throw httpError(400, `${label} must be a JSON object.`);
    }
    assertExactObjectKeys(
      entry,
      ["contentType", "location", "embedded", "lastUpdated"],
      label,
    );
    if (
      ![
        "application/smart-health-card",
        "application/fhir+json",
        "application/smart-api-access",
      ].includes(entry.contentType)
    ) {
      throw httpError(400, `${label} contentType is invalid.`);
    }
    const hasLocation = Boolean(stringValue(entry.location));
    const hasEmbedded = Boolean(stringValue(entry.embedded));
    if (hasLocation === hasEmbedded) {
      throw httpError(
        400,
        `${label} must contain exactly one of location or embedded.`,
      );
    }
    if (hasLocation) {
      let location;
      try {
        location = new URL(entry.location);
      } catch {
        throw httpError(400, `${label} location is invalid.`);
      }
      if (location.protocol !== "https:") {
        throw httpError(400, `${label} location must use HTTPS.`);
      }
    }
    if (
      entry.lastUpdated !== undefined &&
      (typeof entry.lastUpdated !== "string" ||
        !validIsoDateOrNull(entry.lastUpdated))
    ) {
      throw httpError(400, `${label} lastUpdated is invalid.`);
    }
    return stripUndefined({
      contentType: entry.contentType,
      location: hasLocation ? entry.location : undefined,
      embedded: hasEmbedded ? entry.embedded : undefined,
      lastUpdated: entry.lastUpdated,
    });
  });
  return stripUndefined({
    status: value.status,
    list: value.list,
    files,
  });
}

function assertExactObjectKeys(value, allowedKeys, label) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw httpError(400, `${label} field ${unknown} is not allowed.`);
  }
}

function matchArtifactRoute(pathname) {
  const routes = [
    [/^\/presentations\/([^/]+)\.jwt$/, "vp", "jwt"],
    [/^\/files\/([^/]+)$/, "shl_file", "jwe"],
  ];
  for (const [pattern, kind, extension] of routes) {
    const match = pattern.exec(pathname);
    if (match)
      return { kind, artifactId: decodeURIComponent(match[1]), extension };
  }
  return null;
}

function publicArtifactPath(kind, artifactId) {
  const encoded = encodeURIComponent(artifactId);
  switch (kind) {
    case "vp":
      return `/api/share-gateway/presentations/${encoded}.jwt`;
    case "shl_file":
      return `/api/share-gateway/files/${encoded}`;
    case "standard_shl_manifest":
      return `/s/${encoded}`;
    default:
      return `/api/share-gateway/artifacts/${encoded}.json`;
  }
}

function sendArtifactPublicationResponse(response, status, input) {
  const publicUrl = `${input.origin}${publicArtifactPath(
    input.kind,
    input.artifactId,
  )}`;
  json(response, status, {
    ok: true,
    mode: gatewayModeLabel(),
    artifactId: input.artifactId,
    kind: input.kind,
    publicUrl,
    qrPayload: publicUrl,
    jwksUrl:
      input.kind === "vp"
        ? `${input.origin}/api/share-gateway/.well-known/jwks.json`
        : undefined,
    warnings: input.warnings ?? [],
    errors: [],
  });
}

function isProductionGatewayRuntime() {
  const explicitMode = String(process.env.TRUSTCARE_GATEWAY_MODE ?? "")
    .trim()
    .toLowerCase();
  if (explicitMode === "local" || explicitMode === "development") return false;
  if (explicitMode === "production") return true;
  return Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);
}

function gatewayModeLabel() {
  return productionGateway
    ? "trustcare_production_gateway"
    : "trustcare_local_development_gateway";
}

async function readJsonBody(request) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > maxJsonBodyBytes) {
      throw httpError(
        413,
        `JSON request body exceeds ${maxJsonBodyBytes} bytes.`,
      );
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

async function buildDisclosureDigests(claims) {
  const digests = {};
  if (!claims) return digests;
  for (const [key, value] of Object.entries(claims)) {
    digests[key] = await sha256Hex(value);
  }
  return digests;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(
    typeof value === "string" ? value : stableStringify(value),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value) {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function stripProofLikeFields(value) {
  const copy = { ...value };
  delete copy.proof;
  delete copy.jwt;
  delete copy.sdJwtVc;
  return copy;
}

function didWebFromOrigin(origin) {
  try {
    const url = new URL(origin);
    return `did:web:${url.host.replace(/:/g, "%3A")}`;
  } catch {
    return "did:web:wallet-demo.trustcare.local";
  }
}

function didWebFromPath(origin, pathSegments) {
  try {
    const url = new URL(origin);
    const host = url.host.replace(/:/g, "%3A");
    const path = pathSegments
      .map((segment) => encodeURIComponent(String(segment).toLowerCase()))
      .join(":");
    return `did:web:${host}${path ? `:${path}` : ""}`;
  } catch {
    return `did:web:wallet-demo.trustcare.local:${pathSegments
      .map(String)
      .join(":")}`;
  }
}

function issuerDidBaseOrigin(origin) {
  return (
    stringValue(process.env.TRUSTCARE_DID_WEB_BASE_URL) || origin
  ).replace(/\/+$/, "");
}

function portalBaseOrigin() {
  return (
    stringValue(process.env.TRUSTCARE_PORTAL_BASE_URL) ||
    TRUSTCARE_PORTAL_SANDBOX_ORIGIN
  ).replace(/\/+$/, "");
}

function matchPayerIssuerDidRoute(pathname) {
  const match =
    /^(?:\/api\/share-gateway)?\/payer\/([^/]+)\/(did\.json|jwks\.json)$/.exec(
      pathname,
    );
  if (!match) return null;
  const payerId = normalizePayerId(decodeURIComponent(match[1]));
  if (!payerId || !DEMO_PAYER_ISSUER_PROFILES[payerId]) return null;
  return {
    payerId,
    kind: match[2] === "jwks.json" ? "jwks" : "did",
  };
}

function normalizePayerId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function subjectFromCredential(credential) {
  const subject = objectValue(credential.credentialSubject);
  return (
    stringValue(
      subject?.id,
      stringValue(subject?.trustcareSubjectId, stringValue(credential.id, "")),
    ) || undefined
  );
}

function lastType(type) {
  if (Array.isArray(type)) {
    const values = type
      .map(String)
      .filter(
        (item) =>
          item !== "VerifiableCredential" && item !== "VerifiablePresentation",
      );
    return values[values.length - 1];
  }
  return typeof type === "string" &&
    type !== "VerifiableCredential" &&
    type !== "VerifiablePresentation"
    ? type
    : undefined;
}

function ensureArray(value, requiredType) {
  const items = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? [value]
      : [];
  return Array.from(new Set([requiredType, ...items]));
}

function stripUndefined(value) {
  if (Array.isArray(value))
    return value.map(stripUndefined).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]),
  );
}

function objectValue(value) {
  return isRecord(value) ? value : null;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function positiveIntegerFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requestOrigin(request) {
  const host = request.headers.host ?? `127.0.0.1:${port}`;
  const proto =
    typeof request.headers["x-forwarded-proto"] === "string"
      ? request.headers["x-forwarded-proto"]
      : request.socket.encrypted
        ? "https"
        : "http";
  return `${proto}://${host}`;
}

function handleCorsPreflight(request, response, requestUrl) {
  if (request.method !== "OPTIONS") return false;
  setCorsHeaders(request, response, requestUrl);
  if (!isRequestOriginAllowed(request, requestUrl)) {
    json(response, 403, {
      ok: false,
      errors: [
        "A trusted Origin or valid Share Gateway service token is required for this mutation.",
      ],
    });
    return true;
  }
  response.writeHead(204);
  response.end();
  return true;
}

function setCorsHeaders(request, response, requestUrl) {
  const allowedOrigin = corsAllowedOrigin(request, requestUrl);
  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    if (allowedOrigin !== "*") appendVaryHeader(response, "Origin");
  }
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, accept, authorization",
  );
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, HEAD, POST, OPTIONS",
  );
  response.setHeader("Access-Control-Max-Age", "600");
}

function corsAllowedOrigin(request, requestUrl) {
  const origin = stringValue(request.headers.origin);
  if (!origin || isPublicReadRequest(request, requestUrl)) return "*";
  return trustedMutationOrigins(request).has(normalizeOrigin(origin))
    ? origin
    : "";
}

function isRequestOriginAllowed(request, requestUrl) {
  return authorizeGatewayMutation({
    method: effectiveCorsMethod(request),
    pathname: requestUrl.pathname,
    production: productionGateway,
    origin: stringValue(request.headers.origin),
    trustedOrigins: trustedMutationOrigins(request),
    authorization: stringValue(request.headers.authorization),
    configuredServiceToken: stringValue(
      process.env.TRUSTCARE_GATEWAY_SERVICE_TOKEN,
    ),
  }).ok;
}

function trustedMutationOrigins(request) {
  return new Set(
    [
      requestOrigin(request),
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://aec-infraconnect-2562.github.io",
      ...String(process.env.TRUSTCARE_GATEWAY_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ].map(normalizeOrigin),
  );
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
}

function isPublicReadRequest(request, requestUrl) {
  const method = effectiveCorsMethod(request);
  if (
    method === "POST" &&
    requestUrl.pathname === "/api/share-gateway/verification-evidence"
  ) {
    return true;
  }
  return (
    (method === "GET" || method === "HEAD") &&
    (requestUrl.pathname === "/.well-known/jwks.json" ||
      requestUrl.pathname === "/.well-known/did.json" ||
      requestUrl.pathname.startsWith("/api/share-gateway"))
  );
}

function effectiveCorsMethod(request) {
  if (request.method !== "OPTIONS") return request.method;
  return stringValue(
    request.headers["access-control-request-method"],
    request.method,
  ).toUpperCase();
}

function appendVaryHeader(response, value) {
  const existing = response.getHeader("Vary");
  if (!existing) {
    response.setHeader("Vary", value);
    return;
  }
  const values = String(existing)
    .split(",")
    .map((item) => item.trim().toLowerCase());
  if (!values.includes(value.toLowerCase())) {
    response.setHeader("Vary", `${existing}, ${value}`);
  }
}

function isJsonRequest(request) {
  const contentType = stringValue(
    request.headers["content-type"],
  ).toLowerCase();
  return contentType.startsWith("application/json");
}

function respondIfArtifactExpired(response, artifact) {
  if (!isArtifactExpired(artifact)) return false;
  json(response, 410, {
    ok: false,
    errors: [`${artifact.kind} has expired.`],
  });
  return true;
}

function isArtifactExpired(artifact) {
  if (!artifact.expiresAt) return false;
  const expiresAt = Date.parse(artifact.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Permissions-Policy",
    "camera=(self), geolocation=(), microphone=(), payment=(), usb=(), serial=()",
  );
}

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function httpStatusFromError(error) {
  const status = Number(error?.statusCode);
  return Number.isSafeInteger(status) && status >= 400 && status < 600
    ? status
    : 500;
}

function safeErrorMessage(error, status) {
  if (status >= 500 && productionGateway) return "Wallet server error.";
  return error instanceof Error ? error.message : "Wallet server error.";
}

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function text(response, status, payload, contentType) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Type",
    contentType.includes(";") ? contentType : `${contentType}; charset=utf-8`,
  );
  response.end(payload);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`TrustCare Wallet web demo listening on port ${port}`);
  console.log(`Share Gateway available at /api/share-gateway`);
});

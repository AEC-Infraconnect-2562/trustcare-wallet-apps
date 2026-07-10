import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
} from "../packages/wallet-core/node_modules/jose/dist/webapi/index.js";
import {
  DEMO_PAYER_ISSUER_PROFILES,
  SUPPORTED_SHARE_ARTIFACT_KINDS,
  authorizeGatewayMutation,
  immutableArtifactDecision,
  publicationRequestDigest,
  unsignedCredentialPublicationPolicy,
  validateDemoPayerIssuanceRequest,
  validateIssuerSigningRequest,
} from "./share-gateway-policy.mjs";

const root = resolve("apps/wallet-web/dist");
const port = positiveIntegerFromEnv("PORT", 3000);
const maxJsonBodyBytes = positiveIntegerFromEnv(
  "TRUSTCARE_GATEWAY_MAX_BODY_BYTES",
  1_000_000,
);
const signingContexts = new Map();
const issuerSigningContexts = new Map();
const payerIssuerSigningContexts = new Map();
const productionGateway = isProductionGatewayRuntime();
const configuredSigningKey = await loadConfiguredSigningKey();
const artifactStore = await createArtifactStore();

const demoHospitalIssuerProfiles = new Map([
  [
    "tcc",
    {
      code: "tcc",
      name: "TrustCare Central Hospital",
      nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
      trustDomain: "hospital",
      country: "TH",
    },
  ],
  [
    "tcp",
    {
      code: "tcp",
      name: "TrustCare Phuket International Hospital",
      nameTh: "โรงพยาบาลทรัสต์แคร์ ภูเก็ต อินเตอร์เนชันแนล",
      trustDomain: "hospital",
      country: "TH",
    },
  ],
  [
    "tcm",
    {
      code: "tcm",
      name: "TrustCare Chiang Mai Cross-Border Hospital",
      nameTh: "โรงพยาบาลทรัสต์แคร์ เชียงใหม่",
      trustDomain: "hospital",
      country: "TH",
    },
  ],
]);

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
    const issuerDocumentRoute = matchIssuerDidRoute(requestUrl.pathname);
    if (issuerDocumentRoute) {
      const context = await getCredentialIssuerSigningContext(
        requestOrigin(request),
        { kind: "hospital", code: issuerDocumentRoute.code },
      );
      json(
        response,
        200,
        issuerDocumentRoute.kind === "jwks"
          ? publicJwksForContext(context)
          : didDocumentForContext(context),
      );
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

async function handleShareGatewayRequest(request, response, requestUrl) {
  const origin = requestOrigin(request);
  const pathname =
    requestUrl.pathname.replace(/^\/api\/share-gateway/, "") || "/";

  const issuerDocumentRoute = matchIssuerDidRoute(pathname);
  if (request.method === "GET" && issuerDocumentRoute) {
    const context = await getCredentialIssuerSigningContext(origin, {
      kind: "hospital",
      code: issuerDocumentRoute.code,
    });
    json(
      response,
      200,
      issuerDocumentRoute.kind === "jwks"
        ? publicJwksForContext(context)
        : didDocumentForContext(context),
    );
    return;
  }
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
      hospitalIssuerProfiles: [...demoHospitalIssuerProfiles.keys()].map(
        (code) => {
          const didBaseOrigin = issuerDidBaseOrigin(origin);
          return {
            code,
            did: didWebFromPath(didBaseOrigin, ["hospital", code]),
            didUrl: `${didBaseOrigin}/hospital/${code}/did.json`,
            jwksUrl: `${didBaseOrigin}/hospital/${code}/jwks.json`,
          };
        },
      ),
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

  if (request.method === "POST" && pathname === "/credentials/sign") {
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

    const signingPolicy = validateIssuerSigningRequest(body, credential);
    if (!signingPolicy.ok) {
      json(response, signingPolicy.status, {
        ok: false,
        sourceAuthority: signingPolicy.source.authority,
        errors: [signingPolicy.message],
      });
      return;
    }

    const issuerProfile = issuerProfileFromCredential(credential);
    if (issuerProfile.kind !== "hospital") {
      json(response, 422, {
        ok: false,
        sourceAuthority: signingPolicy.source.authority,
        errors: [
          "The demo issuer service only re-issues credentials for an explicit hospital issuer profile.",
        ],
      });
      return;
    }
    const context = await getCredentialIssuerSigningContext(
      origin,
      issuerProfile,
    );
    const expiresAt =
      stringValue(body.expiresAt) ||
      stringValue(credential.validUntil) ||
      new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
    const signed = await signCredentialJwt({
      credential: buildIssuerSignedCredential(
        credential,
        context,
        issuerProfile,
        expiresAt,
      ),
      context,
      audience:
        stringValue(body.audience) || "https://trustcare.network/verifier",
      expiresAt,
    });

    json(response, 201, {
      ok: true,
      credentialId: signed.credentialId,
      credentialJwt: signed.jwt,
      credentialProof: {
        type: "W3C VC JWT",
        format: "vc+jwt",
        jwt: signed.jwt,
        alg: "ES256",
        kid: context.kid,
        source:
          issuerProfile.kind === "hospital"
            ? "trustcare_hospital_issuer_profile"
            : "trustcare_system_issuer_profile",
      },
      issuerDid: context.issuerDid,
      jwksUrl: context.jku,
      signedCredential: signed.credential,
      warnings: [],
      errors: [],
    });
    return;
  }

  if (
    request.method === "POST" &&
    pathname === "/payer/credentials/issue"
  ) {
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
    if (kind === "vp" && !isRecord(body.payload)) {
      json(response, 400, {
        ok: false,
        errors: ["VP payload must be a JSON object."],
      });
      return;
    }

    const requestDigest = publicationRequestDigest(body);
    const existing = await artifactStore.get(kind, artifactId);
    const existingDecision = immutableArtifactDecision(
      existing,
      requestDigest,
    );
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
        warnings: ["Idempotent retry returned the existing immutable artifact."],
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
      const context = await getSigningContext(origin);
      const signed = await signPresentationJwt({
        vp: isRecord(body.payload) ? body.payload : {},
        context,
        origin,
        purpose: stringValue(body.purpose),
        expiresAt: stringValue(body.expiresAt),
        audience: "https://trustcare.network/verifier",
      });
      payload = signed.jwt;
      contentType = "application/vp+jwt";
      warnings.push(...signed.warnings);
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
      warnings.push("Idempotent retry returned the existing immutable artifact.");
    }

    sendArtifactPublicationResponse(
      response,
      writeResult.status === "idempotent" ? 200 : 201,
      { origin, artifactId, kind, warnings },
    );
    return;
  }

  const manifestMatch = /^\/manifests\/([^/]+)\.json$/.exec(pathname);
  if (manifestMatch) {
    const artifactId = decodeURIComponent(manifestMatch[1]);
    const stored =
      (await artifactStore.get("certified_shl_manifest", artifactId)) ??
      (await artifactStore.get("standard_shl_manifest", artifactId));
    if (!stored) {
      json(response, 404, { ok: false, errors: ["SHL manifest not found."] });
      return;
    }
    if (respondIfArtifactExpired(response, stored)) return;
    json(response, 200, stored.payload);
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
      stored.contentType.includes("jwt")
    ) {
      text(response, 200, String(stored.payload), stored.contentType);
      return;
    }
    json(response, 200, stored.payload);
    return;
  }

  const fileMatch = /^\/files\/([^/]+)\/([^/]+)\.jwe$/.exec(pathname);
  if (fileMatch) {
    const publicationId = decodeURIComponent(fileMatch[1]);
    const fileId = decodeURIComponent(fileMatch[2]);
    json(response, 200, {
      resourceType: "Bundle",
      id: `${publicationId}:${fileId}`,
      type: "document",
      note: productionGateway
        ? "TrustCare Wallet share gateway does not publish SHL file payloads here. Use the Portal SHL backend for encrypted file delivery."
        : "Local wallet gateway returns plaintext FHIR-like content for development verification only.",
    });
    return;
  }

  json(response, 404, { ok: false, errors: ["Unknown share gateway route."] });
}

async function signPresentationJwt(input) {
  const now = new Date();
  const expiresAt =
    input.expiresAt ||
    stringValue(input.vp.validUntil) ||
    new Date(now.getTime() + 10 * 60_000).toISOString();
  const rawCredentials = Array.isArray(input.vp.verifiableCredential)
    ? input.vp.verifiableCredential
    : [];
  const credentialJwts = [];
  const warnings = [];

  for (const credential of rawCredentials) {
    const existingJwt = extractCredentialJwt(credential);
    if (existingJwt) {
      credentialJwts.push(existingJwt);
      continue;
    }
    if (!isRecord(credential)) {
      throw httpError(
        422,
        "Every VP credential must be an issuer-signed vc+jwt envelope or a source-aware JSON credential.",
      );
    }
    const unsignedPolicy = unsignedCredentialPublicationPolicy({
      production: productionGateway,
      credential,
    });
    if (!unsignedPolicy.ok) {
      throw httpError(422, unsignedPolicy.message);
    }
    const issuerProfile = issuerProfileFromCredential(credential);
    const credentialSigningContext = await getCredentialIssuerSigningContext(
      input.origin ?? "",
      issuerProfile,
    );
    const signed = await signCredentialJwt({
      credential: buildIssuerSignedCredential(
        credential,
        credentialSigningContext,
        issuerProfile,
        expiresAt,
      ),
      context: credentialSigningContext,
      audience: input.audience,
      now,
      expiresAt: stringValue(credential.validUntil) || expiresAt,
    });
    credentialJwts.push(signed.jwt);
    warnings.push(
      "Unsigned wallet credential was re-signed by its issuer DID profile.",
    );
  }

  const credentialJwtDigests = await Promise.all(credentialJwts.map(sha256Hex));
  const vp = stripUndefined({
    ...input.vp,
    type: ensureArray(input.vp.type, "VerifiablePresentation"),
    holder: stringValue(
      input.vp.holder,
      stringValue(input.vp.holderDid, input.context.issuerDid),
    ),
    purpose: input.purpose || input.vp.purpose,
    validUntil: expiresAt,
    verifiableCredential: credentialJwts.map(envelopedCredentialFromJwt),
    trustcare: {
      ...objectValue(input.vp.trustcare),
      jwtProfile: "w3c-vc-jose-cose",
      signingStatus: "jwt_signed",
      signingAlgorithm: "ES256",
      signingKid: input.context.kid,
      signingJwksUrl: input.context.jku,
      credentialJwtCount: credentialJwts.length,
      credentialJwtDigests,
    },
  });
  const presentationHash = await sha256Hex({
    holder: vp.holder,
    credentialJwts,
    expiresAt,
  });
  const presentationId = stringValue(
    vp.id,
    `vp_${presentationHash.slice(0, 16)}`,
  );
  const jwtPresentation = stripUndefined({ ...vp, id: presentationId });
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expirationTime = Math.floor(new Date(expiresAt).getTime() / 1000);
  const jwtSubject = stringValue(vp.holder, input.context.issuerDid);
  const proofReadyPresentation = stripUndefined({
    ...jwtPresentation,
    iss: input.context.issuerDid,
    sub: jwtSubject,
    aud: input.audience,
    jti: presentationId,
    iat: issuedAt,
    exp: expirationTime,
    trustcare: {
      ...objectValue(jwtPresentation.trustcare),
      dataIntegrityCryptosuite: "ecdsa-jcs-2019",
      dataIntegrityProofPurpose: "authentication",
      dataIntegrityVerificationMethod: input.context.kid,
    },
  });
  const proof = await createDataIntegrityProof(proofReadyPresentation, {
    context: input.context,
    created: now.toISOString(),
    expires: expiresAt,
  });
  const signedPresentation = stripUndefined({
    ...proofReadyPresentation,
    proof,
  });
  const jwt = await new SignJWT(signedPresentation)
    .setProtectedHeader({
      alg: "ES256",
      typ: "vp+jwt",
      kid: input.context.kid,
      jku: input.context.jku,
    })
    .setIssuer(input.context.issuerDid)
    .setSubject(jwtSubject)
    .setAudience(input.audience)
    .setJti(presentationId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expirationTime)
    .sign(input.context.privateKey);

  return { jwt, vp: signedPresentation, credentialJwts, warnings };
}

async function createDataIntegrityProof(document, input) {
  const proof = stripUndefined({
    type: "DataIntegrityProof",
    cryptosuite: "ecdsa-jcs-2019",
    created: input.created,
    expires: input.expires,
    verificationMethod: input.context.kid,
    proofPurpose: "authentication",
    "@context": document["@context"],
  });
  const signingData = await buildDataIntegritySigningData(document, proof);
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      input.context.privateKey,
      signingData,
    ),
  );
  return {
    ...proof,
    proofValue: `z${base58Encode(signature)}`,
  };
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

async function getCredentialIssuerSigningContext(origin, profile) {
  if (profile.kind === "system") return getSigningContext(origin);
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const code = normalizeHospitalCode(profile.code);
  const cacheKey = `${normalizedOrigin}:hospital:${code}`;
  const cached = issuerSigningContexts.get(cacheKey);
  if (cached) return cached;

  const didBaseOrigin = issuerDidBaseOrigin(normalizedOrigin);
  const issuerDid = didWebFromPath(didBaseOrigin, ["hospital", code]);
  const issuer = demoHospitalIssuerProfiles.get(code) ?? {
    code,
    name: `TrustCare Hospital ${code.toUpperCase()}`,
    nameTh: `โรงพยาบาล TrustCare ${code.toUpperCase()}`,
    trustDomain: "hospital",
    country: "TH",
  };
  const keyMaterial =
    configuredSigningKey ?? (await createLocalDevelopmentSigningKey());
  const publicJwk = sanitizePublicJwk(keyMaterial.publicJwk);
  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  const kid = `${issuerDid}#hospital-${code}-signing-key-${thumbprint.slice(
    0,
    12,
  )}`;
  const context = {
    issuerDid,
    kid,
    jku: `${didBaseOrigin}/hospital/${code}/jwks.json`,
    privateKey: keyMaterial.privateKey,
    publicJwk: sanitizePublicJwk({
      ...publicJwk,
      alg: "ES256",
      kid,
      use: "sig",
    }),
    keySource: `${keyMaterial.source}:issuer-profile:${code}`,
    issuerProfile: issuer,
  };
  issuerSigningContexts.set(cacheKey, context);
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

function buildIssuerSignedCredential(
  credential,
  context,
  issuerProfile,
  expiresAt,
) {
  const originalIssuer = credential.issuer;
  const currentProfile =
    issuerProfile.kind === "hospital"
      ? demoHospitalIssuerProfiles.get(
          normalizeHospitalCode(issuerProfile.code),
        )
      : null;
  const issuer =
    issuerProfile.kind === "hospital"
      ? {
          id: context.issuerDid,
          name: currentProfile?.name ?? "TrustCare Hospital",
          nameTh: currentProfile?.nameTh,
          trustDomain: currentProfile?.trustDomain ?? "hospital",
          country: currentProfile?.country ?? "TH",
        }
      : {
          id: context.issuerDid,
          name: "TrustCare Wallet System",
          trustDomain: "wallet-system",
          country: "TH",
        };
  return stripUndefined({
    ...credential,
    issuer,
    validUntil: credential.validUntil ?? expiresAt,
    evidence: [
      ...arrayValue(credential.evidence),
      {
        type: "SourceCredentialIssuer",
        sourceIssuer: originalIssuer,
        signingIssuer: context.issuerDid,
      },
    ],
    trustcare: {
      ...objectValue(credential.trustcare),
      issuerSignedCredential: true,
      issuerProfile:
        issuerProfile.kind === "hospital"
          ? `hospital:${normalizeHospitalCode(issuerProfile.code)}`
          : "system",
      originalIssuer,
      signingIssuerDid: context.issuerDid,
      signingJwksUrl: context.jku,
    },
  });
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

function extractCredentialJwt(value) {
  if (typeof value === "string") {
    return jwtFromDataUrl(value, "vc") ?? (looksLikeJwt(value) ? value : null);
  }
  if (!isRecord(value)) return null;
  if (typeof value.id === "string") {
    const fromId = jwtFromDataUrl(value.id, "vc");
    if (fromId) return fromId;
  }
  for (const key of ["jwt", "vcJwt", "sdJwtVc"]) {
    const candidate = value[key];
    if (typeof candidate !== "string") continue;
    const fromDataUrl = jwtFromDataUrl(candidate, "vc");
    if (fromDataUrl) return fromDataUrl;
    if (looksLikeJwt(candidate)) return candidate;
  }
  return null;
}

function jwtFromDataUrl(value, kind) {
  if (!value.startsWith("data:")) return null;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const metadata = value.slice("data:".length, commaIndex).toLowerCase();
  const encoded = value.slice(commaIndex + 1);
  const [mediaType, ...parameters] = metadata.split(";");
  const expected = kind === "vc" ? "application/vc+jwt" : "application/vp+jwt";
  if (mediaType !== expected) return null;
  const jwt = parameters.includes("base64")
    ? Buffer.from(encoded, "base64").toString("utf8")
    : decodeURIComponent(encoded);
  return looksLikeJwt(jwt) ? jwt : null;
}

function looksLikeJwt(value) {
  const issuerJwt = value.trim().split("~")[0];
  const parts = issuerJwt.split(".");
  return parts.length === 3 && parts[0]?.startsWith("eyJ");
}

function envelopedCredentialFromJwt(jwt) {
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: `data:application/vc+jwt,${encodeURIComponent(jwt)}`,
    type: ["VerifiableCredential", "EnvelopedVerifiableCredential"],
  };
}

function matchArtifactRoute(pathname) {
  const routes = [
    [/^\/presentations\/([^/]+)\.json$/, "vp", "json"],
    [/^\/presentations\/([^/]+)\.jwt$/, "vp", "jwt"],
    [/^\/manifest-vps\/([^/]+)\.json$/, "manifest_vp", "json"],
    [/^\/manifest-credentials\/([^/]+)\.json$/, "manifest_credential", "json"],
    [
      /^\/holder-authorizations\/([^/]+)\.json$/,
      "holder_authorization",
      "json",
    ],
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
    case "manifest_vp":
      return `/api/share-gateway/manifest-vps/${encoded}.json`;
    case "manifest_credential":
      return `/api/share-gateway/manifest-credentials/${encoded}.json`;
    case "holder_authorization":
      return `/api/share-gateway/holder-authorizations/${encoded}.json`;
    case "standard_shl_manifest":
    case "certified_shl_manifest":
      return `/api/share-gateway/manifests/${encoded}.json`;
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

function artifactKey(kind, artifactId) {
  return `${kind}:${artifactId}`;
}

async function loadConfiguredSigningKey() {
  const raw = process.env.TRUSTCARE_GATEWAY_SIGNING_KEY_JWK;
  if (!raw) {
    if (productionGateway) {
      throw new Error(
        "TRUSTCARE_GATEWAY_SIGNING_KEY_JWK is required for the Railway production share gateway.",
      );
    }
    return null;
  }
  let privateJwk;
  try {
    privateJwk = JSON.parse(raw);
  } catch {
    throw new Error("TRUSTCARE_GATEWAY_SIGNING_KEY_JWK must be valid JSON.");
  }
  if (
    !isRecord(privateJwk) ||
    privateJwk.kty !== "EC" ||
    privateJwk.crv !== "P-256" ||
    typeof privateJwk.d !== "string"
  ) {
    throw new Error(
      "TRUSTCARE_GATEWAY_SIGNING_KEY_JWK must be a private P-256 JWK for ES256 signing.",
    );
  }
  return {
    source: "env_persistent_jwk",
    privateKey: await importJWK(privateJwk, "ES256"),
    publicJwk: sanitizePublicJwk(privateJwk),
  };
}

async function createLocalDevelopmentSigningKey() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  return {
    source: "local_ephemeral_jwk",
    privateKey,
    publicJwk: await exportJWK(publicKey),
  };
}

async function createArtifactStore() {
  if (process.env.DATABASE_URL) {
    return createPostgresArtifactStore(process.env.DATABASE_URL);
  }
  if (productionGateway) {
    throw new Error(
      "DATABASE_URL is required for the Railway production share gateway.",
    );
  }
  return createMemoryArtifactStore();
}

function createMemoryArtifactStore() {
  const artifacts = new Map();
  return {
    kind: "memory",
    persistent: false,
    async set(artifact) {
      const existing = artifacts.get(
        artifactKey(artifact.kind, artifact.artifactId),
      );
      const decision = immutableArtifactDecision(
        existing,
        artifact.requestDigest,
      );
      if (decision.status !== "create") return decision;
      artifacts.set(artifactKey(artifact.kind, artifact.artifactId), artifact);
      return { status: "created", artifact };
    },
    async get(kind, artifactId) {
      return artifacts.get(artifactKey(kind, artifactId)) ?? null;
    },
  };
}

async function createPostgresArtifactStore(connectionString) {
  const pgModule = await import("pg");
  const Pool = pgModule.Pool ?? pgModule.default?.Pool;
  if (!Pool) {
    throw new Error("pg Pool constructor was not available.");
  }
  const pool = new Pool({
    connectionString,
    max: positiveIntegerFromEnv("TRUSTCARE_GATEWAY_DB_POOL_MAX", 5),
    ssl:
      process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trustcare_wallet_share_artifacts (
      artifact_key text PRIMARY KEY,
      artifact_id text NOT NULL,
      kind text NOT NULL,
      content_type text NOT NULL,
      payload_json jsonb,
      payload_text text,
      source_payload_json jsonb,
      request_digest text,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz
    )
  `);
  await pool.query(`
    ALTER TABLE trustcare_wallet_share_artifacts
    ADD COLUMN IF NOT EXISTS request_digest text
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS trustcare_wallet_share_artifacts_kind_id_idx
    ON trustcare_wallet_share_artifacts(kind, artifact_id)
  `);

  const readArtifact = async (kind, artifactId) => {
    const result = await pool.query(
      `
        SELECT artifact_id, kind, content_type, payload_json, payload_text,
               source_payload_json, request_digest, created_at, expires_at
        FROM trustcare_wallet_share_artifacts
        WHERE artifact_key = $1
        LIMIT 1
      `,
      [artifactKey(kind, artifactId)],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      artifactId: row.artifact_id,
      kind: row.kind,
      contentType: row.content_type,
      payload:
        row.payload_text !== null
          ? row.payload_text
          : deserializeJson(row.payload_json),
      sourcePayload: deserializeJson(row.source_payload_json),
      requestDigest: row.request_digest ? String(row.request_digest) : null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      expiresAt:
        row.expires_at instanceof Date
          ? row.expires_at.toISOString()
          : row.expires_at
            ? String(row.expires_at)
            : undefined,
    };
  };

  return {
    kind: "postgres",
    persistent: true,
    async set(artifact) {
      const payloadIsText = typeof artifact.payload === "string";
      const insertResult = await pool.query(
        `
          INSERT INTO trustcare_wallet_share_artifacts (
            artifact_key,
            artifact_id,
            kind,
            content_type,
            payload_json,
            payload_text,
            source_payload_json,
            request_digest,
            created_at,
            expires_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (artifact_key) DO NOTHING
          RETURNING artifact_key
        `,
        [
          artifactKey(artifact.kind, artifact.artifactId),
          artifact.artifactId,
          artifact.kind,
          artifact.contentType,
          payloadIsText ? null : JSON.stringify(artifact.payload ?? null),
          payloadIsText ? artifact.payload : null,
          artifact.sourcePayload === undefined
            ? null
            : JSON.stringify(artifact.sourcePayload),
          artifact.requestDigest,
          artifact.createdAt,
          validIsoDateOrNull(artifact.expiresAt),
        ],
      );
      if (insertResult.rowCount === 1) {
        return { status: "created", artifact };
      }
      const existing = await readArtifact(artifact.kind, artifact.artifactId);
      const decision = immutableArtifactDecision(
        existing,
        artifact.requestDigest,
      );
      return decision.status === "idempotent"
        ? decision
        : { status: "conflict", artifact: existing };
    },
    async get(kind, artifactId) {
      return readArtifact(kind, artifactId);
    },
  };
}

function deserializeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function validIsoDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

async function buildDataIntegritySigningData(document, proof) {
  const unsecuredDocument = stripProofForDataIntegrity(document);
  const proofConfig = stripUndefined({ ...proof });
  delete proofConfig.proofValue;
  delete proofConfig.jws;
  if (proofConfig["@context"]) {
    unsecuredDocument["@context"] = proofConfig["@context"];
  }
  const proofConfigHash = await sha256Bytes(
    new TextEncoder().encode(jcsCanonicalize(proofConfig)),
  );
  const documentHash = await sha256Bytes(
    new TextEncoder().encode(jcsCanonicalize(unsecuredDocument)),
  );
  return concatBytes(proofConfigHash, documentHash);
}

async function sha256Bytes(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function concatBytes(left, right) {
  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

function stripProofForDataIntegrity(value) {
  const copy = deepJsonClone(value);
  delete copy.proof;
  return copy;
}

function deepJsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jcsCanonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("JCS cannot canonicalize non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcsCanonicalize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jcsCanonicalize(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`JCS cannot canonicalize ${typeof value}.`);
}

function base58Encode(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let output = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    output += "1";
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += alphabet[digits[index]];
  }
  return output;
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

function sanitizePublicJwk(jwk) {
  const publicJwk = { ...jwk };
  for (const field of [
    "d",
    "p",
    "q",
    "dp",
    "dq",
    "qi",
    "oth",
    "k",
    "key_ops",
  ]) {
    delete publicJwk[field];
  }
  return publicJwk;
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
    stringValue(process.env.TRUSTCARE_ISSUER_DID_WEB_BASE_URL) ||
    stringValue(process.env.TRUSTCARE_DID_WEB_BASE_URL) ||
    origin
  ).replace(/\/+$/, "");
}

function matchIssuerDidRoute(pathname) {
  const match =
    /^(?:\/api\/share-gateway)?\/hospital\/([^/]+)\/(?:did(?:\.json|\/jwks\.json)|jwks\.json)$/.exec(
      pathname,
    );
  if (!match) return null;
  const kind = pathname.endsWith("/jwks.json") ? "jwks" : "did";
  const code = normalizeHospitalCode(decodeURIComponent(match[1]));
  return code ? { code, kind } : null;
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

function issuerProfileFromCredential(credential) {
  const trustcare = objectValue(credential.trustcare);
  const issuer = credential.issuer;
  const issuerId =
    typeof issuer === "string"
      ? issuer
      : isRecord(issuer)
        ? stringValue(issuer.id)
        : "";
  const candidates = [
    stringValue(trustcare?.issuerHospitalCode),
    stringValue(trustcare?.issuerHospitalId),
    hospitalCodeFromDid(issuerId),
    hospitalCodeFromName(stringValue(credential.issuerHospitalName)),
    hospitalCodeFromName(
      isRecord(issuer)
        ? stringValue(issuer.name, stringValue(issuer.nameTh))
        : "",
    ),
  ].filter(Boolean);
  const code = normalizeHospitalCode(candidates[0] ?? "");
  if (code) {
    return { kind: "hospital", code };
  }
  const didCode = hospitalCodeFromDid(issuerId);
  if (didCode) {
    return { kind: "hospital", code: didCode };
  }
  return { kind: "system" };
}

function hospitalCodeFromDid(value) {
  const match = /:hospital:([^:#/?]+)/i.exec(value);
  return match ? normalizeHospitalCode(match[1]) : "";
}

function hospitalCodeFromName(value) {
  const normalized = value.toLowerCase();
  if (normalized.includes("phuket")) return "tcp";
  if (normalized.includes("chiang mai") || normalized.includes("เชียงใหม่")) {
    return "tcm";
  }
  if (normalized.includes("trustcare") || normalized.includes("ทรัสต์แคร์")) {
    return "tcc";
  }
  return "";
}

function normalizeHospitalCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
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

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

const root = resolve("apps/wallet-web/dist");
const port = Number(process.env.PORT ?? 3000);
const signingContexts = new Map();
const productionGateway = isProductionGatewayRuntime();
const configuredSigningKey = await loadConfiguredSigningKey();
const artifactStore = await createArtifactStore();

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
  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const requestUrl = new URL(request.url ?? "/", requestOrigin(request));
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
    json(response, 500, {
      ok: false,
      errors: [error instanceof Error ? error.message : "Wallet server error."],
    });
  }
});

async function handleShareGatewayRequest(request, response, requestUrl) {
  const origin = requestOrigin(request);
  const pathname =
    requestUrl.pathname.replace(/^\/api\/share-gateway/, "") || "/";

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
      keySource: context.keySource,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/artifacts") {
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
        purpose: stringValue(body.purpose),
        expiresAt: stringValue(body.expiresAt),
        audience: "https://trustcare.network/verifier",
      });
      payload = signed.jwt;
      contentType = "application/vp+jwt";
      warnings.push(...signed.warnings);
    }

    await artifactStore.set({
      artifactId,
      kind,
      contentType,
      payload,
      sourcePayload: body.payload,
      createdAt: now.toISOString(),
      expiresAt: stringValue(body.expiresAt) || undefined,
    });

    const publicUrl = `${origin}${publicArtifactPath(kind, artifactId)}`;
    json(response, 201, {
      ok: true,
      mode: gatewayModeLabel(),
      artifactId,
      kind,
      publicUrl,
      qrPayload: publicUrl,
      jwksUrl:
        kind === "vp"
          ? `${origin}/api/share-gateway/.well-known/jwks.json`
          : undefined,
      warnings,
      errors: [],
    });
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
      warnings.push("Skipped non-object credential without a JWT envelope.");
      continue;
    }
    const signed = await signCredentialJwt({
      credential: buildGatewayIssuedCredentialAttestation(
        credential,
        input.context,
        expiresAt,
      ),
      context: input.context,
      audience: input.audience,
      now,
      expiresAt: stringValue(credential.validUntil) || expiresAt,
    });
    credentialJwts.push(signed.jwt);
    warnings.push(
      "Unsigned wallet credential was converted to a gateway-issued W3C VC JWT attestation.",
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
  const jwt = await new SignJWT(jwtPresentation)
    .setProtectedHeader({
      alg: "ES256",
      typ: "vp+jwt",
      kid: input.context.kid,
      jku: input.context.jku,
    })
    .setIssuer(input.context.issuerDid)
    .setSubject(stringValue(vp.holder, input.context.issuerDid))
    .setAudience(input.audience)
    .setJti(presentationId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(new Date(expiresAt).getTime() / 1000))
    .sign(input.context.privateKey);

  return { jwt, vp: jwtPresentation, credentialJwts, warnings };
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
  const issuerDid = didWebFromOrigin(normalizedOrigin);
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
      `${normalizedOrigin}/api/share-gateway/.well-known/jwks.json`,
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

function buildGatewayIssuedCredentialAttestation(
  credential,
  context,
  expiresAt,
) {
  const originalIssuer = credential.issuer;
  return stripUndefined({
    ...credential,
    issuer: {
      id: context.issuerDid,
      name: "TrustCare Wallet Share Gateway",
      trustDomain: "wallet-share-gateway",
      country: "TH",
    },
    validUntil: credential.validUntil ?? expiresAt,
    evidence: [
      ...arrayValue(credential.evidence),
      { type: "SourceCredentialHash", sourceIssuer: originalIssuer },
    ],
    trustcare: {
      ...objectValue(credential.trustcare),
      gatewayIssuedAttestation: true,
      originalIssuer,
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
      artifacts.set(artifactKey(artifact.kind, artifact.artifactId), artifact);
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
    max: Number(process.env.TRUSTCARE_GATEWAY_DB_POOL_MAX ?? 5),
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
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS trustcare_wallet_share_artifacts_kind_id_idx
    ON trustcare_wallet_share_artifacts(kind, artifact_id)
  `);
  return {
    kind: "postgres",
    persistent: true,
    async set(artifact) {
      const payloadIsText = typeof artifact.payload === "string";
      await pool.query(
        `
          INSERT INTO trustcare_wallet_share_artifacts (
            artifact_key,
            artifact_id,
            kind,
            content_type,
            payload_json,
            payload_text,
            source_payload_json,
            created_at,
            expires_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (artifact_key) DO UPDATE SET
            content_type = EXCLUDED.content_type,
            payload_json = EXCLUDED.payload_json,
            payload_text = EXCLUDED.payload_text,
            source_payload_json = EXCLUDED.source_payload_json,
            created_at = EXCLUDED.created_at,
            expires_at = EXCLUDED.expires_at
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
          artifact.createdAt,
          validIsoDateOrNull(artifact.expiresAt),
        ],
      );
    },
    async get(kind, artifactId) {
      const result = await pool.query(
        `
          SELECT artifact_id, kind, content_type, payload_json, payload_text,
                 source_payload_json, created_at, expires_at
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
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : {};
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

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, accept, authorization",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function text(response, status, payload, contentType) {
  response.statusCode = status;
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

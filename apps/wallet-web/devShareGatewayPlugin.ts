import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createEphemeralEs256SigningKey,
  publicJwksForSigningKey,
  signTrustCareCredentialJwt,
  signTrustCarePresentationJwt,
  type TrustCareSigningKey,
} from "../../packages/wallet-core/src/trustcareJwt.ts";
import {
  DEMO_PAYER_ISSUER_PROFILES,
  validateDemoPayerIssuanceRequest,
} from "../../scripts/share-gateway-policy.mjs";
import type { Plugin } from "vite";

type StoredArtifact = {
  kind: string;
  artifactId: string;
  contentType: string;
  payload: unknown;
  createdAt: string;
};

export function devShareGatewayPlugin(): Plugin {
  const artifacts = new Map<string, StoredArtifact>();
  let signingKeyPromise: Promise<TrustCareSigningKey> | undefined;

  const installGatewayMiddleware = (server: {
    middlewares: {
      use: (
        handler: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void,
      ) => void;
    };
  }) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", requestOrigin(req));
      if (url.pathname === "/.well-known/jwks.json") {
        const baseSigningKey = await localSigningKey(signingKeyPromise, "");
        signingKeyPromise = Promise.resolve(baseSigningKey);
        const signingKey = issuerSigningKeyForProfile(
          baseSigningKey,
          requestOrigin(req),
          { kind: "system" },
        );
        json(res, 200, publicJwksForSigningKey(signingKey));
        return;
      }
      if (url.pathname === "/.well-known/did.json") {
        const baseSigningKey = await localSigningKey(signingKeyPromise, "");
        signingKeyPromise = Promise.resolve(baseSigningKey);
        const signingKey = issuerSigningKeyForProfile(
          baseSigningKey,
          requestOrigin(req),
          { kind: "system" },
        );
        json(res, 200, didDocumentForSigningKey(signingKey));
        return;
      }
      const payerDocumentRoute = matchPayerIssuerDidRoute(url.pathname);
      if (payerDocumentRoute) {
        const baseSigningKey = await localSigningKey(signingKeyPromise, "");
        signingKeyPromise = Promise.resolve(baseSigningKey);
        const payerKey = issuerSigningKeyForProfile(
          baseSigningKey,
          requestOrigin(req),
          { kind: "payer", payerId: payerDocumentRoute.payerId },
        );
        json(
          res,
          200,
          payerDocumentRoute.kind === "jwks"
            ? publicJwksForSigningKey(payerKey)
            : didDocumentForSigningKey(payerKey),
        );
        return;
      }
      if (!url.pathname.startsWith("/api/share-gateway")) {
        next();
        return;
      }

      try {
        await handleGatewayRequest(req, res, url, artifacts, async () => {
          const signingKey = await localSigningKey(signingKeyPromise, "");
          signingKeyPromise = Promise.resolve(signingKey);
          return signingKey;
        });
      } catch (error) {
        json(res, 500, {
          ok: false,
          errors: [
            error instanceof Error
              ? error.message
              : "Local share gateway error.",
          ],
        });
      }
    });
  };

  return {
    name: "trustcare-local-share-gateway",
    configureServer(server) {
      installGatewayMiddleware(server);
    },
    configurePreviewServer(server) {
      installGatewayMiddleware(server);
    },
  };
}

async function handleGatewayRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  artifacts: Map<string, StoredArtifact>,
  getSigningKey: () => Promise<TrustCareSigningKey>,
) {
  const origin = requestOrigin(req);
  const pathname = url.pathname.replace(/^\/api\/share-gateway/, "") || "/";

  const payerDocumentRoute = matchPayerIssuerDidRoute(pathname);
  if (req.method === "GET" && payerDocumentRoute) {
    const payerKey = issuerSigningKeyForProfile(await getSigningKey(), origin, {
      kind: "payer",
      payerId: payerDocumentRoute.payerId,
    });
    json(
      res,
      200,
      payerDocumentRoute.kind === "jwks"
        ? publicJwksForSigningKey(payerKey)
        : didDocumentForSigningKey(payerKey),
    );
    return;
  }

  if (req.method === "GET" && pathname === "/.well-known/jwks.json") {
    const signingKey = issuerSigningKeyForProfile(
      await getSigningKey(),
      origin,
      { kind: "system" },
    );
    json(res, 200, publicJwksForSigningKey(signingKey));
    return;
  }
  if (req.method === "GET" && pathname === "/.well-known/did.json") {
    const signingKey = issuerSigningKeyForProfile(
      await getSigningKey(),
      origin,
      { kind: "system" },
    );
    json(res, 200, didDocumentForSigningKey(signingKey));
    return;
  }

  if (req.method === "POST" && pathname === "/payer/credentials/issue") {
    const body = await readJsonBody(req);
    const credential = isRecord(body.credential) ? body.credential : null;
    if (!credential) {
      json(res, 400, {
        ok: false,
        errors: ["credential is required."],
      });
      return;
    }
    const issuancePolicy = validateDemoPayerIssuanceRequest(body, credential);
    if (!issuancePolicy.ok) {
      json(res, issuancePolicy.status, {
        ok: false,
        sourceAuthority: issuancePolicy.source.authority,
        errors: [issuancePolicy.message],
      });
      return;
    }
    const signingKey = issuerSigningKeyForProfile(
      await getSigningKey(),
      origin,
      { kind: "payer", payerId: issuancePolicy.payerId },
    );
    const expiresAt =
      stringValue(body.expiresAt) ||
      stringValue(credential.validUntil) ||
      new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
    const signed = await signTrustCareCredentialJwt({
      credential: buildPayerIssuerSignedCredential(
        credential,
        signingKey,
        issuancePolicy.profile,
        expiresAt,
      ),
      signingKey,
      credentialType: stringValue(body.credentialType) || undefined,
      subject: stringValue(body.holderDid) || undefined,
      audience: stringValue(body.audience) || undefined,
      expiresAt,
    });
    json(res, 201, {
      ok: true,
      payerId: issuancePolicy.payerId,
      credentialId: signed.credentialId,
      credentialJwt: signed.jwt,
      credentialProof: {
        type: "W3C VC JWT",
        format: "vc+jwt",
        jwt: signed.jwt,
        alg: "ES256",
        kid: signingKey.kid,
        source: "trustcare_demo_payer_integration_issuer",
      },
      issuerDid: signingKey.issuerDid,
      jwksUrl: signingKey.jku,
      signedCredential: signed.credential,
      warnings: [
        "Demo payer integration issuer only; this is not a real payer adjudication or production payer endpoint.",
      ],
      errors: [],
    });
    return;
  }

  if (req.method === "POST" && pathname === "/artifacts") {
    const body = await readJsonBody(req);
    const artifactId = stringValue(body.artifactId);
    const kind = stringValue(body.kind);
    if (!artifactId || !kind) {
      json(res, 400, {
        ok: false,
        errors: ["artifactId and kind are required."],
      });
      return;
    }
    const contentType = stringValue(body.contentType) || "application/json";
    let storedPayload = body.payload;
    let storedContentType = contentType;
    const warnings = [
      "Local dev gateway ใช้ contract เดียวกับ Portal Backend แต่เก็บ artifact ใน memory ของ Vite server สำหรับทดสอบเท่านั้น.",
    ];
    const jku = `${origin}/api/share-gateway/.well-known/jwks.json`;
    if (kind === "vp") {
      const baseSigningKey = await getSigningKey();
      const signed = await signTrustCarePresentationJwt({
        vp: isRecord(body.payload) ? body.payload : {},
        signingKey: {
          ...baseSigningKey,
          jku,
        },
        purpose: stringValue(body.purpose),
        expiresAt: stringValue(body.expiresAt) || undefined,
        signUnsignedCredentials: false,
      });
      storedPayload = signed.jwt;
      storedContentType = "application/vp+jwt";
      warnings.push(
        "VP ถูก sign ด้วย ES256 ใน local gateway และเปิด public JWKS สำหรับ verifier ที่ต้องตรวจลายเซ็นจริง.",
        ...signed.warnings,
      );
    }
    artifacts.set(artifactKey(kind, artifactId), {
      kind,
      artifactId,
      contentType: storedContentType,
      payload: storedPayload,
      createdAt: new Date().toISOString(),
    });
    const publicUrl = `${origin}${publicArtifactPath(kind, artifactId)}`;
    json(res, 201, {
      ok: true,
      mode: "local_dev_gateway",
      artifactId,
      kind,
      publicUrl,
      qrPayload: publicUrl,
      jwksUrl: kind === "vp" ? jku : undefined,
      warnings,
      errors: [],
    });
    return;
  }

  const manifestMatch = /^\/manifests\/([^/]+)\.json$/.exec(pathname);
  if (manifestMatch) {
    const artifactId = decodeURIComponent(manifestMatch[1]);
    if (req.method === "POST" || req.method === "PUT") {
      const body = await readJsonBody(req);
      if (body?.resourceType === "TrustCareShlManifest") {
        artifacts.set(artifactKey("certified_shl_manifest", artifactId), {
          kind: "certified_shl_manifest",
          artifactId,
          contentType: "application/json",
          payload: body,
          createdAt: new Date().toISOString(),
        });
        json(res, 201, {
          ok: true,
          artifactId,
          kind: "certified_shl_manifest",
        });
        return;
      }
    }
    const stored =
      artifacts.get(artifactKey("certified_shl_manifest", artifactId)) ??
      artifacts.get(artifactKey("standard_shl_manifest", artifactId));
    if (!stored) {
      json(res, 404, { ok: false, errors: ["SHL manifest not found."] });
      return;
    }
    json(res, 200, stored.payload);
    return;
  }

  const artifactRoute = matchArtifactRoute(pathname);
  if (artifactRoute) {
    const stored = artifacts.get(
      artifactKey(artifactRoute.kind, artifactRoute.artifactId),
    );
    if (!stored) {
      json(res, 404, {
        ok: false,
        errors: [`${artifactRoute.kind} not found.`],
      });
      return;
    }
    if (
      artifactRoute.extension === "jwt" ||
      stored.contentType.includes("jwt")
    ) {
      text(res, 200, String(stored.payload), stored.contentType);
      return;
    }
    json(res, 200, stored.payload);
    return;
  }

  const fileMatch = /^\/files\/([^/]+)\/([^/]+)\.jwe$/.exec(pathname);
  if (fileMatch) {
    const publicationId = decodeURIComponent(fileMatch[1]);
    const fileId = decodeURIComponent(fileMatch[2]);
    json(res, 200, {
      resourceType: "Bundle",
      id: `${publicationId}:${fileId}`,
      type: "document",
      note: "Local dev gateway returns a plaintext FHIR-like document for demo. Portal Backend must return encrypted SHL file content.",
    });
    return;
  }

  json(res, 404, { ok: false, errors: ["Unknown local share gateway route."] });
}

function matchArtifactRoute(
  pathname: string,
): { kind: string; artifactId: string; extension: "json" | "jwt" } | null {
  const routes: Array<[RegExp, string, "json" | "jwt"]> = [
    [/^\/presentations\/([^/]+)\.json$/, "vp", "json"],
    [/^\/presentations\/([^/]+)\.jwt$/, "vp", "jwt"],
    [/^\/manifest-vps\/([^/]+)\.jwt$/, "manifest_vp", "jwt"],
    [/^\/manifest-credentials\/([^/]+)\.jwt$/, "manifest_credential", "jwt"],
  ];
  for (const [pattern, kind, extension] of routes) {
    const match = pattern.exec(pathname);
    if (match)
      return { kind, artifactId: decodeURIComponent(match[1]), extension };
  }
  return null;
}

function publicArtifactPath(kind: string, artifactId: string): string {
  const encoded = encodeURIComponent(artifactId);
  switch (kind) {
    case "vp":
      return `/api/share-gateway/presentations/${encoded}.jwt`;
    case "manifest_vp":
      return `/api/share-gateway/manifest-vps/${encoded}.jwt`;
    case "manifest_credential":
      return `/api/share-gateway/manifest-credentials/${encoded}.jwt`;
    case "standard_shl_manifest":
    case "certified_shl_manifest":
      return `/api/share-gateway/manifests/${encoded}.json`;
    default:
      return `/api/share-gateway/artifacts/${encoded}.json`;
  }
}

function issuerSigningKeyForProfile(
  baseSigningKey: TrustCareSigningKey,
  origin: string,
  profile: { kind: "system" } | { kind: "payer"; payerId: string },
): TrustCareSigningKey {
  const baseOrigin = issuerDidBaseOrigin(origin);
  if (profile.kind === "system") {
    const issuerDid = didWebFromOrigin(baseOrigin);
    return withSigningKeyIdentity({
      ...baseSigningKey,
      issuerDid,
      kid: `${issuerDid}#wallet-signing-key`,
      jku: `${baseOrigin}/api/share-gateway/.well-known/jwks.json`,
    });
  }
  if (profile.kind === "payer") {
    const payerId = normalizePayerId(profile.payerId);
    const issuerDid = didWebFromPath(baseOrigin, ["payer", payerId]);
    return withSigningKeyIdentity({
      ...baseSigningKey,
      issuerDid,
      kid: `${issuerDid}#payer-integration-signing-key`,
      jku: `${baseOrigin}/payer/${payerId}/jwks.json`,
    });
  }
  return withSigningKeyIdentity(baseSigningKey);
}

function withSigningKeyIdentity(
  signingKey: TrustCareSigningKey,
): TrustCareSigningKey {
  return {
    ...signingKey,
    publicJwk: {
      ...signingKey.publicJwk,
      alg: signingKey.alg,
      kid: signingKey.kid,
      use: "sig",
    },
    privateJwk: {
      ...signingKey.privateJwk,
      alg: signingKey.alg,
      kid: signingKey.kid,
      use: "sig",
    },
  };
}

function didDocumentForSigningKey(signingKey: TrustCareSigningKey) {
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/jwk/v1",
    ],
    id: signingKey.issuerDid,
    verificationMethod: [
      {
        id: signingKey.kid,
        type: "JsonWebKey",
        controller: signingKey.issuerDid,
        publicKeyJwk: signingKey.publicJwk,
      },
    ],
    assertionMethod: [signingKey.kid],
    authentication: [signingKey.kid],
  };
}

function buildPayerIssuerSignedCredential(
  credential: Record<string, unknown>,
  signingKey: TrustCareSigningKey,
  payerProfile: {
    payerId: string;
    name: string;
    payerType: string;
  },
  expiresAt: string,
): Record<string, unknown> {
  const originalIssuer = credential.issuer;
  return stripUndefined({
    ...credential,
    issuer: {
      id: signingKey.issuerDid,
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
        signingIssuer: signingKey.issuerDid,
        demo: true,
      },
    ],
    trustcare: {
      ...(objectValue(credential.trustcare) ?? {}),
      sourceAuthority: "payer_adapter",
      signingOwner: "payer_adapter",
      payerId: payerProfile.payerId,
      originalIssuer,
      signingIssuerDid: signingKey.issuerDid,
      signingJwksUrl: signingKey.jku,
      demoPayerIntegrationIssuer: true,
    },
  });
}

function matchPayerIssuerDidRoute(
  pathname: string,
): { payerId: string; kind: "did" | "jwks" } | null {
  const match =
    /^(?:\/api\/share-gateway)?\/payer\/([^/]+)\/(did\.json|jwks\.json)$/.exec(
      pathname,
    );
  if (!match) return null;
  const payerId = normalizePayerId(decodeURIComponent(match[1] ?? ""));
  if (!payerId || !DEMO_PAYER_ISSUER_PROFILES[payerId]) return null;
  return {
    payerId,
    kind: match[2] === "jwks.json" ? "jwks" : "did",
  };
}

function didWebFromOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `did:web:${url.host.replace(/:/g, "%3A")}`;
  } catch {
    return "did:web:wallet-demo.trustcare.local";
  }
}

function didWebFromPath(origin: string, pathSegments: string[]): string {
  try {
    const url = new URL(origin);
    const host = url.host.replace(/:/g, "%3A");
    const path = pathSegments
      .map((segment) => encodeURIComponent(segment.toLowerCase()))
      .join(":");
    return `did:web:${host}${path ? `:${path}` : ""}`;
  } catch {
    return `did:web:wallet-demo.trustcare.local:${pathSegments.join(":")}`;
  }
}

function issuerDidBaseOrigin(origin: string): string {
  return (
    stringValue(process.env.TRUSTCARE_DID_WEB_BASE_URL) || origin
  ).replace(/\/+$/, "");
}

function normalizePayerId(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined) as T;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]),
  ) as T;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function artifactKey(kind: string, artifactId: string): string {
  return `${kind}:${artifactId}`;
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, any>;
}

function requestOrigin(req: IncomingMessage): string {
  const host = req.headers.host ?? "127.0.0.1:5173";
  const proto =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"]
      : "http";
  return `${proto}://${host}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function text(
  res: ServerResponse,
  status: number,
  payload: string,
  contentType: string,
) {
  res.statusCode = status;
  res.setHeader(
    "content-type",
    contentType.includes(";") ? contentType : `${contentType}; charset=utf-8`,
  );
  res.end(payload);
}

async function localSigningKey(
  existing: Promise<TrustCareSigningKey> | undefined,
  jku: string,
): Promise<TrustCareSigningKey> {
  if (existing) return existing;
  return createEphemeralEs256SigningKey({
    issuerDid: "did:web:wallet.trustcare.local",
    kidPrefix: "did:web:wallet.trustcare.local",
    jku: jku || undefined,
  });
}

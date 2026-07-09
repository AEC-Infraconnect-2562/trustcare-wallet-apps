import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createEphemeralEs256SigningKey,
  publicJwksForSigningKey,
  signTrustCareCredentialJwt,
  signTrustCarePresentationJwt,
  type TrustCareSigningKey,
} from "../../packages/wallet-core/src/trustcareJwt.ts";
import type { Plugin } from "vite";

type StoredArtifact = {
  kind: string;
  artifactId: string;
  contentType: string;
  payload: unknown;
  createdAt: string;
};

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
      const issuerDocumentRoute = matchIssuerDidRoute(url.pathname);
      if (issuerDocumentRoute) {
        const baseSigningKey = await localSigningKey(signingKeyPromise, "");
        signingKeyPromise = Promise.resolve(baseSigningKey);
        const issuerKey = issuerSigningKeyForProfile(
          baseSigningKey,
          requestOrigin(req),
          { kind: "hospital", code: issuerDocumentRoute.code },
        );
        json(
          res,
          200,
          issuerDocumentRoute.kind === "jwks"
            ? publicJwksForSigningKey(issuerKey)
            : didDocumentForSigningKey(issuerKey),
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

  const issuerDocumentRoute = matchIssuerDidRoute(pathname);
  if (req.method === "GET" && issuerDocumentRoute) {
    const baseSigningKey = await getSigningKey();
    const issuerKey = issuerSigningKeyForProfile(baseSigningKey, origin, {
      kind: "hospital",
      code: issuerDocumentRoute.code,
    });
    json(
      res,
      200,
      issuerDocumentRoute.kind === "jwks"
        ? publicJwksForSigningKey(issuerKey)
        : didDocumentForSigningKey(issuerKey),
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

  if (req.method === "POST" && pathname === "/credentials/sign") {
    const body = await readJsonBody(req);
    const credential = isRecord(body.credential) ? body.credential : null;
    if (!credential) {
      json(res, 400, {
        ok: false,
        errors: ["credential is required."],
      });
      return;
    }
    const issuerProfile = issuerProfileFromCredential(credential);
    const baseSigningKey = await getSigningKey();
    const signingKey = issuerSigningKeyForProfile(
      baseSigningKey,
      origin,
      issuerProfile,
    );
    const expiresAt =
      stringValue(body.expiresAt) ||
      stringValue(credential.validUntil) ||
      new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
    const signed = await signTrustCareCredentialJwt({
      credential: buildIssuerSignedCredential(
        credential,
        signingKey,
        issuerProfile,
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
      credentialId: signed.credentialId,
      credentialJwt: signed.jwt,
      credentialProof: {
        type: "W3C VC JWT",
        format: "vc+jwt",
        jwt: signed.jwt,
        alg: "ES256",
        kid: signingKey.kid,
        source:
          issuerProfile.kind === "hospital"
            ? "trustcare_hospital_issuer_profile"
            : "trustcare_system_issuer_profile",
      },
      issuerDid: signingKey.issuerDid,
      jwksUrl: signingKey.jku,
      signedCredential: signed.credential,
      warnings: [],
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

function publicArtifactPath(kind: string, artifactId: string): string {
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

function issuerSigningKeyForProfile(
  baseSigningKey: TrustCareSigningKey,
  origin: string,
  profile: { kind: "system" } | { kind: "hospital"; code: string },
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
  const code = normalizeHospitalCode(profile.code);
  const issuerDid = didWebFromPath(baseOrigin, ["hospital", code]);
  return withSigningKeyIdentity({
    ...baseSigningKey,
    issuerDid,
    kid: `${issuerDid}#hospital-${code}-signing-key`,
    jku: `${baseOrigin}/hospital/${code}/jwks.json`,
  });
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

function buildIssuerSignedCredential(
  credential: Record<string, unknown>,
  signingKey: TrustCareSigningKey,
  issuerProfile: { kind: "system" } | { kind: "hospital"; code: string },
  expiresAt: string,
): Record<string, unknown> {
  const originalIssuer = credential.issuer;
  const code =
    issuerProfile.kind === "hospital"
      ? normalizeHospitalCode(issuerProfile.code)
      : "";
  const profile = code ? demoHospitalIssuerProfiles.get(code) : null;
  const issuer =
    issuerProfile.kind === "hospital"
      ? {
          id: signingKey.issuerDid,
          name: profile?.name ?? `TrustCare Hospital ${code.toUpperCase()}`,
          nameTh: profile?.nameTh,
          trustDomain: profile?.trustDomain ?? "hospital",
          country: profile?.country ?? "TH",
        }
      : {
          id: signingKey.issuerDid,
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
        signingIssuer: signingKey.issuerDid,
      },
    ],
    trustcare: {
      ...(objectValue(credential.trustcare) ?? {}),
      issuerSignedCredential: true,
      issuerProfile:
        issuerProfile.kind === "hospital" ? `hospital:${code}` : "system",
      originalIssuer,
      signingIssuerDid: signingKey.issuerDid,
      signingJwksUrl: signingKey.jku,
    },
  });
}

function issuerProfileFromCredential(
  credential: Record<string, unknown>,
): { kind: "system" } | { kind: "hospital"; code: string } {
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
  if (code) return { kind: "hospital", code };
  return { kind: "system" };
}

function matchIssuerDidRoute(
  pathname: string,
): { code: string; kind: "did" | "jwks" } | null {
  const match =
    /^(?:\/api\/share-gateway)?\/hospital\/([^/]+)\/(?:did(?:\.json|\/jwks\.json)|jwks\.json)$/.exec(
      pathname,
    );
  if (!match) return null;
  const code = normalizeHospitalCode(decodeURIComponent(match[1] ?? ""));
  if (!code) return null;
  return {
    code,
    kind: pathname.endsWith("/jwks.json") ? "jwks" : "did",
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
    stringValue(process.env.TRUSTCARE_ISSUER_DID_WEB_BASE_URL) ||
    stringValue(process.env.TRUSTCARE_DID_WEB_BASE_URL) ||
    origin
  ).replace(/\/+$/, "");
}

function hospitalCodeFromDid(value: string): string {
  const match = /:hospital:([^:#/?]+)/i.exec(value);
  return match ? normalizeHospitalCode(match[1]) : "";
}

function hospitalCodeFromName(value: string): string {
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

function normalizeHospitalCode(value: string): string {
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

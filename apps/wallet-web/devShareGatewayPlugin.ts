import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createEphemeralEs256SigningKey,
  publicJwksForSigningKey,
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
        const signingKey = await localSigningKey(signingKeyPromise, "");
        signingKeyPromise = Promise.resolve(signingKey);
        json(res, 200, publicJwksForSigningKey(signingKey));
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

  if (req.method === "GET" && pathname === "/.well-known/jwks.json") {
    const signingKey = await getSigningKey();
    json(res, 200, publicJwksForSigningKey(signingKey));
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
        signUnsignedCredentials: true,
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

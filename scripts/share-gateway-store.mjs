import { immutableArtifactDecision } from "./share-gateway-policy.mjs";

function artifactKey(kind, artifactId) {
  return `${kind}:${artifactId}`;
}

export async function createArtifactStore(productionGateway) {
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

export function createMemoryArtifactStore() {
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

export function validIsoDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function positiveIntegerFromEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

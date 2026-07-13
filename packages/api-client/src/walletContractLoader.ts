import {
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
  assertWalletExchangeDiscovery,
  type WalletExchangeDiscovery,
} from "@trustcare/contracts";
import type { RuntimeEnvironment } from "@trustcare/wallet-core";
import { TrustCareApiError } from "./errors";

export {
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
};
export const TRUSTCARE_RENDER_VERSION = "trustcare-render-contract-v2";
export type { WalletExchangeDiscovery } from "@trustcare/contracts";

export type WalletExchangeHealth = {
  status: string;
  contractVersion: string;
  persistent: boolean;
  holderProof: string;
  tokenBinding: string;
  credentialSync: string;
  documentIntake: string[];
  rendererAuthority: Record<string, unknown>;
};

export type PortalWalletManifest = Record<string, unknown> & {
  version: string;
  status: string;
  minimumWalletVersion: string;
  compatibilityRules: string[];
  integrity: {
    algorithm: string;
    canonicalization: string;
    scope: string;
    digest: string;
  };
};

export type PortalRenderContract = Record<string, unknown> & {
  version: string;
  renderVersion: string;
  authority: string;
  implementationRepository: string;
  referenceCommit: string;
  referenceCommitRole: "provenance_only";
  compatibilityGate: "contract_profile_and_schema";
  modelPackage: string;
  webPackage: string;
  portalUsage: string;
  primaryPath: string;
  requiredBlocks: string[];
  optionalBlocks: string[];
  legacyReadCompatibility: string[];
  legacyWriteAllowed: boolean;
};

export type PortalWalletSchema = Record<string, unknown> & {
  $id: string;
  contractVersion: string;
  schema: Record<string, unknown>;
};

export type VerifiedContractResource<T> = {
  payload: T;
  etag: string;
  contentDigest: string;
  sha256: string;
};

export type WalletExchangeContractSet = {
  portalOrigin: string;
  discovery: WalletExchangeDiscovery;
  health: WalletExchangeHealth;
  manifest: VerifiedContractResource<PortalWalletManifest>;
  renderContract: VerifiedContractResource<PortalRenderContract>;
  schema: VerifiedContractResource<PortalWalletSchema>;
  loadedAt: string;
};

const requiredCompatibilityRules = [
  "wallet_owns_holder_vp_creation_and_selective_disclosure",
  "wallet_renderer_is_authoritative_for_human_documents",
  "portal_never_accepts_patient_id_from_wallet_requests",
  "unknown_required_fields_fail_closed",
  "shl_is_transport_not_a_verifiable_credential",
] as const;

const supportedSchemaRootBlocks = [
  "manifest",
  "documentTypes",
  "serviceProfiles",
  "sharePackages",
  "renderContract",
  "clinicalDocumentGraph",
  "problemDetails",
] as const;

const supportedRequiredRenderBlocks = ["document"] as const;

export async function loadWalletExchangeContracts(input: {
  portalBaseUrl: string;
  runtimeEnvironment: RuntimeEnvironment;
  walletVersion?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<WalletExchangeContractSet> {
  const portalOrigin = normalizePortalOrigin(input.portalBaseUrl);
  const fetcher = input.fetchImpl ?? fetch;
  const [discoveryResponse, healthResponse, manifest, renderContract, schema] =
    await Promise.all([
      fetcher(`${portalOrigin}/api/wallet/v2`, {
        headers: { accept: "application/json" },
      }),
      fetcher(`${portalOrigin}/api/wallet/v2/health`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      }),
      fetchVerifiedContractResource<PortalWalletManifest>(
        fetcher,
        `${portalOrigin}/api/public/wallet-contracts/manifest`,
      ),
      fetchVerifiedContractResource<PortalRenderContract>(
        fetcher,
        `${portalOrigin}/api/public/wallet-contracts/render-contract`,
      ),
      fetchVerifiedContractResource<PortalWalletSchema>(
        fetcher,
        `${portalOrigin}/api/public/wallet-contracts/schema`,
      ),
    ]);

  const discoveryPayload = await readJson<unknown>(
    discoveryResponse,
    "Wallet Exchange discovery",
  );
  let discovery: WalletExchangeDiscovery;
  try {
    discovery = assertWalletExchangeDiscovery(discoveryPayload);
  } catch (error) {
    throw new TrustCareApiError(
      error instanceof Error
        ? `Wallet Exchange discovery contract failed: ${error.message}`
        : "Wallet Exchange discovery contract failed.",
      { code: "wallet_contract_incompatible" },
    );
  }
  const health = await readJson<WalletExchangeHealth>(
    healthResponse,
    "Wallet Exchange health",
  );
  assertDiscoveryCompatibility(discovery, discoveryResponse, portalOrigin);
  assertHealthCompatibility(health);
  await assertManifestCompatibility(
    manifest.payload,
    input.runtimeEnvironment,
    input.walletVersion ?? "0.1.0",
  );
  assertRenderContractCompatibility(renderContract.payload);
  assertSchemaCompatibility(schema.payload);

  return {
    portalOrigin,
    discovery,
    health,
    manifest,
    renderContract,
    schema,
    loadedAt: (input.now?.() ?? new Date()).toISOString(),
  };
}

export async function fetchVerifiedContractResource<T>(
  fetcher: typeof fetch,
  url: string,
): Promise<VerifiedContractResource<T>> {
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response, `Contract fetch failed: ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new TrustCareApiError(`Contract endpoint is not JSON: ${url}`, {
      status: response.status,
      code: "contract_content_type_invalid",
    });
  }
  const body = await response.text();
  const bytes = new TextEncoder().encode(body);
  const digestBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  const sha256 = hex(digestBytes);
  const etag = response.headers.get("etag") ?? "";
  const contentDigest = response.headers.get("content-digest") ?? "";
  const expectedEtag = `"sha256-${sha256}"`;
  const expectedContentDigest = `sha-256=:${base64(digestBytes)}:`;
  if (etag !== expectedEtag && etag !== `W/${expectedEtag}`) {
    throw new TrustCareApiError(`Contract ETag integrity failed for ${url}`, {
      status: response.status,
      code: "contract_etag_mismatch",
    });
  }
  if (contentDigest !== expectedContentDigest) {
    throw new TrustCareApiError(
      `Contract Content-Digest integrity failed for ${url}`,
      {
        status: response.status,
        code: "contract_content_digest_mismatch",
      },
    );
  }
  let payload: T;
  try {
    payload = JSON.parse(body) as T;
  } catch {
    throw new TrustCareApiError(`Contract JSON is malformed: ${url}`, {
      status: response.status,
      code: "contract_json_invalid",
    });
  }
  return { payload, etag, contentDigest, sha256 };
}

export function normalizePortalOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new TrustCareApiError("Portal base URL must use HTTPS.", {
      code: "portal_origin_invalid",
    });
  }
  if (
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new TrustCareApiError(
      "Portal base URL must not contain credentials, path, query, or fragment.",
      { code: "portal_origin_invalid" },
    );
  }
  return url.origin;
}

export async function verifyManifestCanonicalIntegrity(
  manifest: PortalWalletManifest,
): Promise<boolean> {
  const integrity = manifest.integrity;
  if (
    integrity?.algorithm !== "sha-256" ||
    integrity?.canonicalization !== "json-sorted-keys-v1" ||
    integrity?.scope !== "manifest_without_integrity_and_signature"
  ) {
    return false;
  }
  const unsigned: Record<string, unknown> = { ...manifest };
  delete unsigned.integrity;
  delete unsigned.signature;
  const digest = await sha256Hex(canonicalJson(unsigned));
  return integrity.digest === `sha256:${digest}`;
}

function assertDiscoveryCompatibility(
  discovery: WalletExchangeDiscovery,
  response: Response,
  portalOrigin: string,
): void {
  if (discovery.contractVersion !== WALLET_EXCHANGE_V2_CONTRACT_VERSION) {
    incompatible("Wallet Exchange discovery version is not supported.");
  }
  if (
    response.headers.get("x-trustcare-contract-version") !==
    WALLET_EXCHANGE_V2_CONTRACT_VERSION
  ) {
    incompatible("Wallet Exchange discovery header version is not supported.");
  }
  if (
    discovery.ownership?.holderKeys !== "wallet" ||
    discovery.ownership?.vpCreation !== "wallet" ||
    discovery.ownership?.renderer !== "wallet" ||
    discovery.ownership?.hospitalIssuerKeys !== "portal"
  ) {
    incompatible("Wallet Exchange authority ownership is incompatible.");
  }
  const requiredEndpoints = [
    discovery.authorization?.challengeEndpoint,
    discovery.authorization?.sessionEndpoint,
    discovery.endpoints?.credentialSync,
    discovery.endpoints?.credentialSyncAck,
    discovery.endpoints?.credentialRequests,
    discovery.endpoints?.documentSubmissions,
  ];
  if (
    requiredEndpoints.some(
      (value) =>
        typeof value !== "string" || new URL(value).origin !== portalOrigin,
    )
  ) {
    incompatible("Wallet Exchange endpoint origin is incompatible.");
  }
  if (
    discovery.authorization?.holderProofType !==
      "trustcare-wallet-session+jwt" ||
    discovery.authorization?.accessTokenType !== "DPoP" ||
    discovery.authorization?.dpopSpecification !== "RFC 9449"
  ) {
    incompatible("Wallet Exchange proof profile is incompatible.");
  }
}

function assertHealthCompatibility(health: WalletExchangeHealth): void {
  if (
    health.status !== "ok" ||
    health.contractVersion !== WALLET_EXCHANGE_V2_CONTRACT_VERSION ||
    health.persistent !== true ||
    health.holderProof !== "did:key" ||
    health.tokenBinding !== "DPoP" ||
    health.credentialSync !== "durable_cursor"
  ) {
    incompatible("Wallet Exchange health capabilities are incompatible.");
  }
  if (
    !Array.isArray(health.documentIntake) ||
    !health.documentIntake.includes("direct_vp") ||
    !health.documentIntake.includes("share_gateway")
  ) {
    incompatible(
      "Wallet Exchange document intake capabilities are incomplete.",
    );
  }
}

async function assertManifestCompatibility(
  manifest: PortalWalletManifest,
  runtimeEnvironment: RuntimeEnvironment,
  walletVersion: string,
): Promise<void> {
  if (
    manifest.version !== PORTAL_WALLET_V2_CONTRACT_VERSION ||
    manifest.status !== "active" ||
    !Array.isArray(manifest.compatibilityRules)
  ) {
    incompatible("Portal Wallet manifest is incompatible.");
  }
  if (!isVersionAtLeast(walletVersion, manifest.minimumWalletVersion)) {
    incompatible("Wallet version is below the Contract Hub minimum.");
  }
  for (const rule of requiredCompatibilityRules) {
    if (!manifest.compatibilityRules.includes(rule)) {
      incompatible(
        `Portal Wallet manifest is missing compatibility rule ${rule}.`,
      );
    }
  }
  if (!(await verifyManifestCanonicalIntegrity(manifest))) {
    incompatible("Portal Wallet manifest canonical integrity failed.");
  }
  if (runtimeEnvironment === "pilot" || runtimeEnvironment === "production") {
    incompatible(
      "Contract Hub manifest signatures cannot be trusted until the live contract defines a cryptographic verification profile and trust anchor.",
    );
  }
}

function assertRenderContractCompatibility(
  contract: PortalRenderContract,
): void {
  const requiredBlocks = strictStringArray(contract.requiredBlocks);
  const optionalBlocks = strictStringArray(contract.optionalBlocks);
  if (
    contract.version !== PORTAL_WALLET_V2_CONTRACT_VERSION ||
    contract.renderVersion !== TRUSTCARE_RENDER_VERSION ||
    contract.authority !== "wallet" ||
    contract.implementationRepository !==
      "AEC-Infraconnect-2562/trustcare-wallet-apps" ||
    contract.modelPackage !== "@trustcare/wallet-core" ||
    contract.webPackage !== "@trustcare/ui-web" ||
    contract.portalUsage !== "shared_wallet_renderer_only" ||
    contract.primaryPath !== "credentialSubject.data.humanDocument" ||
    !requiredBlocks ||
    !optionalBlocks ||
    requiredBlocks.length !== supportedRequiredRenderBlocks.length ||
    supportedRequiredRenderBlocks.some(
      (block) => !requiredBlocks.includes(block),
    ) ||
    !Array.isArray(contract.legacyReadCompatibility) ||
    contract.legacyReadCompatibility.length !== 0 ||
    contract.legacyWriteAllowed !== false ||
    contract.compatibilityGate !== "contract_profile_and_schema" ||
    contract.referenceCommitRole !== "provenance_only" ||
    !/^[a-f0-9]{40}$/.test(contract.referenceCommit)
  ) {
    incompatible("Portal renderer contract is incompatible.");
  }
}

function assertSchemaCompatibility(schema: PortalWalletSchema): void {
  const rootSchema = schema.schema;
  if (
    schema.$id !==
      `urn:trustcare:schema:${PORTAL_WALLET_V2_CONTRACT_VERSION}` ||
    schema.contractVersion !== PORTAL_WALLET_V2_CONTRACT_VERSION ||
    rootSchema?.$schema !== "https://json-schema.org/draft/2020-12/schema"
  ) {
    incompatible("Portal Wallet JSON Schema is incompatible.");
  }
  const properties = objectRecord(rootSchema.properties);
  const requiredBlocks = strictStringArray(rootSchema.required);
  if (
    rootSchema.type !== "object" ||
    rootSchema.additionalProperties !== false ||
    !requiredBlocks ||
    requiredBlocks.length === 0
  ) {
    incompatible("Portal Wallet JSON Schema root policy is incompatible.");
  }
  for (const required of supportedSchemaRootBlocks) {
    if (!objectRecord(properties[required])) {
      incompatible(`Portal Wallet JSON Schema is missing ${required}.`);
    }
    if (!requiredBlocks.includes(required)) {
      incompatible(
        `Portal Wallet JSON Schema does not require ${required}.`,
      );
    }
  }
  for (const required of requiredBlocks) {
    if (!(supportedSchemaRootBlocks as readonly string[]).includes(required)) {
      incompatible(
        `Portal Wallet JSON Schema adds unsupported required block ${required}.`,
      );
    }
  }
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw await apiErrorFromResponse(response, `${label} failed`, payload);
  }
  return payload as T;
}

async function apiErrorFromResponse(
  response: Response,
  fallback: string,
  parsed?: unknown,
): Promise<TrustCareApiError> {
  const payload =
    parsed ??
    (await response
      .clone()
      .json()
      .catch(() => null));
  const record = objectRecord(payload);
  return new TrustCareApiError(
    stringValue(record.detail) ?? stringValue(record.title) ?? fallback,
    {
      status: response.status,
      code: stringValue(record.code),
    },
  );
}

function incompatible(message: string): never {
  throw new TrustCareApiError(message, {
    code: "wallet_contract_incompatible",
  });
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function strictStringArray(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    return undefined;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isVersionAtLeast(current: string, minimum: string): boolean {
  const parse = (value: string) => {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1).map(Number) : null;
  };
  const currentParts = parse(current);
  const minimumParts = parse(minimum);
  if (!currentParts || !minimumParts) return false;
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] > minimumParts[index]) return true;
    if (currentParts[index] < minimumParts[index]) return false;
  }
  return true;
}

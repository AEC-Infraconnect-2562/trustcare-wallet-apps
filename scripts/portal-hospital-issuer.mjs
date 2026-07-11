import walletExchangeConfig from "../config/wallet-exchange-v2.json" with { type: "json" };

const HOSPITAL_CODES = Object.freeze(["TCC", "TCP", "TCM"]);

export const TRUSTCARE_PORTAL_SANDBOX_ORIGIN =
  walletExchangeConfig.portalBaseUrl;

/**
 * Resolve an issuer key only when the controller is exactly one of the live
 * Portal TCC/TCP/TCM did:web identifiers and both the DID document and JWKS
 * agree on the active ES256 assertion key. Wallet-origin hospital DIDs are not
 * recognized and therefore cannot enter the Share Gateway trust path.
 */
export async function resolvePortalHospitalVerificationContext(input) {
  const portalOrigin = normalizePortalOrigin(
    input.portalBaseUrl || TRUSTCARE_PORTAL_SANDBOX_ORIGIN,
  );
  const hospitalCode = HOSPITAL_CODES.find(
    (code) => portalHospitalDid(portalOrigin, code) === input.controller,
  );
  if (!hospitalCode) return null;

  const code = hospitalCode.toLowerCase();
  const didUrl = `${portalOrigin}/hospital/${code}/did.json`;
  const jwksUrl = `${portalOrigin}/hospital/${code}/did/jwks.json`;
  const fetcher = input.fetchImpl ?? fetch;
  const [didResponse, jwksResponse] = await Promise.all([
    fetcher(didUrl, {
      headers: { accept: "application/did+json, application/json" },
    }),
    fetcher(jwksUrl, { headers: { accept: "application/json" } }),
  ]);
  const didDocument = await strictJson(didResponse, "Portal DID document");
  const jwks = await strictJson(jwksResponse, "Portal JWKS");

  if (
    didDocument.id !== input.controller ||
    didDocument.trustcare?.hospitalCode !== hospitalCode ||
    didDocument.trustcare?.syntheticTestData === true ||
    jwks.issuer !== input.controller ||
    jwks.hospitalCode !== hospitalCode
  ) {
    throw new Error(
      "Portal hospital issuer identity does not match its origin.",
    );
  }
  if (
    !Array.isArray(didDocument.verificationMethod) ||
    !Array.isArray(didDocument.assertionMethod) ||
    didDocument.assertionMethod.length !== 1 ||
    didDocument.assertionMethod[0] !== input.kid ||
    !Array.isArray(jwks.keys)
  ) {
    throw new Error(
      "Portal hospital DID/JWKS active assertion shape is invalid.",
    );
  }

  const method = didDocument.verificationMethod.find(
    (candidate) => candidate?.id === input.kid,
  );
  const didJwk = method?.publicKeyJwk;
  const jwksJwk = jwks.keys.find((candidate) => candidate?.kid === input.kid);
  if (
    !input.kid.startsWith(`${input.controller}#`) ||
    method?.controller !== input.controller ||
    !validEs256PublicJwk(didJwk) ||
    !validEs256PublicJwk(jwksJwk) ||
    !samePublicJwk(didJwk, jwksJwk)
  ) {
    throw new Error(
      "Portal hospital DID and JWKS assertion keys do not match.",
    );
  }

  return {
    issuerDid: input.controller,
    kid: input.kid,
    publicJwk: jwksJwk,
    keySource: `portal:${hospitalCode}`,
    didUrl,
    jku: jwksUrl,
  };
}

export function portalHospitalDid(portalBaseUrl, hospitalCode) {
  const origin = new URL(normalizePortalOrigin(portalBaseUrl));
  return `did:web:${origin.host.replace(/:/g, "%3A")}:hospital:${String(
    hospitalCode,
  ).toLowerCase()}`;
}

function normalizePortalOrigin(value) {
  const parsed = new URL(String(value || "").trim());
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Portal base URL must be an HTTPS origin without a path.");
  }
  return parsed.origin;
}

async function strictJson(response, label) {
  const contentType = response.headers.get("content-type") || "";
  const payload = await response.json().catch(() => null);
  if (
    !response.ok ||
    !contentType.toLowerCase().includes("json") ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error(`${label} is unavailable or invalid.`);
  }
  return payload;
}

function validEs256PublicJwk(jwk) {
  return Boolean(
    jwk &&
    typeof jwk === "object" &&
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    jwk.alg === "ES256" &&
    jwk.use === "sig" &&
    typeof jwk.kid === "string" &&
    typeof jwk.x === "string" &&
    typeof jwk.y === "string" &&
    !("d" in jwk),
  );
}

function samePublicJwk(left, right) {
  return (
    left.kty === right.kty &&
    left.crv === right.crv &&
    left.x === right.x &&
    left.y === right.y &&
    left.alg === right.alg &&
    left.use === right.use &&
    left.kid === right.kid
  );
}

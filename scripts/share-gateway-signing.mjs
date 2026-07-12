import {
  exportJWK,
  generateKeyPair,
  importJWK,
} from "../packages/wallet-core/node_modules/jose/dist/webapi/index.js";

export async function loadConfiguredSigningKey(productionGateway) {
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

export async function createLocalDevelopmentSigningKey() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  return {
    source: "local_ephemeral_jwk",
    privateKey,
    publicJwk: await exportJWK(publicKey),
  };
}

export function sanitizePublicJwk(jwk) {
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

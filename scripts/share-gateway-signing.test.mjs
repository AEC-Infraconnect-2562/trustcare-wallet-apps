import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalDevelopmentSigningKey,
  loadConfiguredSigningKey,
  sanitizePublicJwk,
} from "./share-gateway-signing.mjs";

test("production signing fails closed without persistent key material", async () => {
  const previous = process.env.TRUSTCARE_GATEWAY_SIGNING_KEY_JWK;
  delete process.env.TRUSTCARE_GATEWAY_SIGNING_KEY_JWK;
  try {
    await assert.rejects(
      loadConfiguredSigningKey(true),
      /TRUSTCARE_GATEWAY_SIGNING_KEY_JWK is required/,
    );
    assert.equal(await loadConfiguredSigningKey(false), null);
  } finally {
    restoreEnv("TRUSTCARE_GATEWAY_SIGNING_KEY_JWK", previous);
  }
});

test("local signing key is ES256-compatible and never exposes private fields", async () => {
  const key = await createLocalDevelopmentSigningKey();
  const publicJwk = sanitizePublicJwk({
    ...key.publicJwk,
    d: "private-value",
    key_ops: ["sign"],
  });

  assert.equal(key.source, "local_ephemeral_jwk");
  assert.equal(publicJwk.kty, "EC");
  assert.equal(publicJwk.crv, "P-256");
  assert.equal("d" in publicJwk, false);
  assert.equal("key_ops" in publicJwk, false);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

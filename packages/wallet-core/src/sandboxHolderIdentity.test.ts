import { compactVerify, decodeProtectedHeader, importJWK } from "jose";
import { describe, expect, it } from "vitest";
import { holderJwsProtectedHeader, signHolderCompactJws } from "./holderIdentity";
import { sandboxHolderIdentityForUser } from "./sandboxHolderIdentity";

describe("sandbox Wallet holder identities", () => {
  it("returns a stable self-custody did:key only for sandbox test users", async () => {
    const first = await sandboxHolderIdentityForUser({ userId: "demo-patient-004", sandboxRuntime: true });
    const second = await sandboxHolderIdentityForUser({ userId: "demo-patient-004", sandboxRuntime: true });
    expect(first?.did).toBe(second?.did);
    expect(first?.did).toMatch(/^did:key:/);
    expect(first?.jwsAlgorithm).toBe("EdDSA");
    expect(first?.privateKey).toMatchObject({ type: "private", extractable: false });
    expect(await sandboxHolderIdentityForUser({ userId: "demo-patient-004", sandboxRuntime: false })).toBeUndefined();
    expect(await sandboxHolderIdentityForUser({ userId: "real-patient", sandboxRuntime: true })).toBeUndefined();
  });

  it("signs with the fixture key while exposing only its public JWK", async () => {
    const identity = await sandboxHolderIdentityForUser({ userId: "demo-patient-006", sandboxRuntime: true });
    expect(identity).toBeDefined();
    const jwt = await signHolderCompactJws({
      identity: identity!,
      protectedHeader: holderJwsProtectedHeader(identity!, "vp"),
      payload: JSON.stringify({ iss: identity!.did, sub: identity!.did }),
    });
    expect(decodeProtectedHeader(jwt)).toMatchObject({ typ: "vp+jwt", alg: "EdDSA", kid: identity!.kid });
    const publicKey = await importJWK(identity!.publicJwk, "EdDSA");
    await expect(compactVerify(jwt, publicKey)).resolves.toBeDefined();
  });
});

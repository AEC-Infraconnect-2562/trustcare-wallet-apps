import {
  compactVerify,
  exportJWK,
  generateKeyPair,
  type CompactJWSHeaderParameters,
} from "jose";
import { describe, expect, it } from "vitest";
import {
  didKeyFromPublicJwk,
  generateHolderIdentity,
  holderIdentityFromKeyPair,
  holderIdentityFromPublicKey,
  holderJwsProtectedHeader,
  publicKeyMultibaseFromJwk,
  publicJwkFromDidKey,
  signHolderCompactJws,
  verificationMethodKidFromDidKey,
  type HolderJwsPurpose,
} from "./holderIdentity";

describe("holder identity", () => {
  it("derives the published Ed25519 did:key test vector and verification method", async () => {
    const publicJwk = {
      kty: "OKP",
      crv: "Ed25519",
      x: "Lm_M42cB3HkUiODQsXRcweM6TByfzEHGO9ND274JcOY",
    };
    const expectedDid =
      "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";

    expect(didKeyFromPublicJwk(publicJwk)).toBe(expectedDid);
    expect(publicKeyMultibaseFromJwk(publicJwk)).toBe(
      expectedDid.slice("did:key:".length),
    );
    expect(verificationMethodKidFromDidKey(expectedDid)).toBe(
      `${expectedDid}#${expectedDid.slice("did:key:".length)}`,
    );
    expect(publicJwkFromDidKey(expectedDid)).toEqual(publicJwk);

    const identity = await holderIdentityFromPublicKey(publicJwk);
    expect(identity.did).toBe(expectedDid);
    expect(identity.keyAlgorithm).toBe("Ed25519");
    expect(identity.jwsAlgorithm).toBe("EdDSA");
    expect(identity.publicJwk).not.toHaveProperty("d");
    expect(identity).not.toHaveProperty("patientId");
  });

  it.each([
    ["Ed25519" as const, "did:key:z6Mk"],
    ["P-256" as const, "did:key:zDn"],
  ])(
    "generates a non-extractable %s holder key and matching did:key",
    async (algorithm, didPrefix) => {
      const identity = await generateHolderIdentity({ algorithm });

      expect(identity.privateKey.type).toBe("private");
      expect(identity.privateKey.extractable).toBe(false);
      expect(identity.publicKey.type).toBe("public");
      expect(identity.did.startsWith(didPrefix)).toBe(true);
      expect(identity.kid).toBe(
        `${identity.did}#${identity.publicKeyMultibase}`,
      );
      expect(identity.publicJwk).not.toHaveProperty("d");
    },
  );

  it.each(["Ed25519" as const, "P-256" as const])(
    "round-trips a %s did:key back to its public JWK",
    async (algorithm) => {
      const identity = await generateHolderIdentity({ algorithm });

      expect(publicJwkFromDidKey(identity.did)).toEqual(identity.publicJwk);
    },
  );

  it("rejects unsupported and malformed did:key material", () => {
    expect(() => publicJwkFromDidKey("did:key:z0invalid")).toThrow();
    expect(() => publicJwkFromDidKey("did:web:holder.example")).toThrow();
  });

  it("signs exact session, DPoP and VP compact JWS payload bytes", async () => {
    const identity = await generateHolderIdentity({ algorithm: "Ed25519" });
    const payload = '{ "nonce": "challenge-01", "scope": "wallet" }\n';
    const purposes: HolderJwsPurpose[] = ["session", "dpop", "vp"];

    for (const purpose of purposes) {
      const protectedHeader = holderJwsProtectedHeader(identity, purpose);
      const compact = await signHolderCompactJws({
        identity,
        payload,
        protectedHeader,
      });
      const verified = await compactVerify(compact, identity.publicKey);

      expect(new TextDecoder().decode(verified.payload)).toBe(payload);
      expect(verified.protectedHeader.alg).toBe("EdDSA");
      expect(verified.protectedHeader.typ).toBe(
        purpose === "session"
          ? "trustcare-wallet-session+jwt"
          : purpose === "dpop"
            ? "dpop+jwt"
            : "vp+jwt",
      );
      if (purpose === "dpop") {
        expect(verified.protectedHeader.jwk).toEqual(identity.publicJwk);
        expect(verified.protectedHeader.kid).toBeUndefined();
      } else {
        expect(verified.protectedHeader.kid).toBe(identity.kid);
      }
    }
  });

  it("loads extractable P-256 JWK key material supplied by a platform store", async () => {
    const pair = await generateKeyPair("ES256", { extractable: true });
    const privateJwk = await exportJWK(pair.privateKey);
    const publicJwk = await exportJWK(pair.publicKey);
    const identity = await holderIdentityFromKeyPair({
      privateKey: privateJwk,
      publicKey: publicJwk,
    });
    const payload = new TextEncoder().encode("binary-safe\u0000payload");
    const compact = await signHolderCompactJws({
      identity,
      payload,
      protectedHeader: holderJwsProtectedHeader(identity, "dpop"),
    });
    const verified = await compactVerify(compact, pair.publicKey);

    expect(verified.payload).toEqual(payload);
    expect(identity.did.startsWith("did:key:zDn")).toBe(true);
    expect(identity.publicJwkThumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects protected headers bound to another holder key", async () => {
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const other = await generateHolderIdentity({ algorithm: "P-256" });
    const wrongJwkHeader: CompactJWSHeaderParameters = {
      alg: "ES256",
      typ: "dpop+jwt",
      jwk: other.publicJwk,
    };

    await expect(
      signHolderCompactJws({
        identity,
        payload: "{}",
        protectedHeader: wrongJwkHeader,
      }),
    ).rejects.toThrow("does not match the holder did:key");
    await expect(
      signHolderCompactJws({
        identity,
        payload: "{}",
        protectedHeader: {
          alg: "ES256",
          typ: "vp+jwt",
          kid: other.kid,
        },
      }),
    ).rejects.toThrow("kid does not match");
  });

  it("rejects a private JWK that does not match the holder public key", async () => {
    const first = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    const second = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });

    await expect(
      holderIdentityFromKeyPair({
        privateKey: await exportJWK(first.privateKey),
        publicKey: await exportJWK(second.publicKey),
      }),
    ).rejects.toThrow("does not match the public did:key");
  });
});

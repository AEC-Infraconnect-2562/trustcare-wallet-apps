import { base64url, compactVerify, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { generateHolderIdentity } from "@trustcare/wallet-core";
import {
  calculateDpopAccessTokenHash,
  canonicalizeDpopHtu,
  createDpopProof,
  type DpopProofClaims,
} from "./dpop";

const fixedNow = new Date("2026-07-11T12:00:00.900Z");

describe("RFC 9449 DPoP", () => {
  it("canonicalizes htu without query or fragment", () => {
    expect(
      canonicalizeDpopHtu(
        "HTTPS://Portal.Example:443/api/wallet/v2/credentials/sync?cursor=opaque#result",
      ),
    ).toBe("https://portal.example/api/wallet/v2/credentials/sync");
    expect(canonicalizeDpopHtu(new URL("http://EXAMPLE.test:80"))).toBe(
      "http://example.test/",
    );

    expect(() => canonicalizeDpopHtu("/relative/path")).toThrow(
      "absolute HTTP(S)",
    );
    expect(() => canonicalizeDpopHtu("ftp://portal.example/file")).toThrow(
      "HTTP or HTTPS",
    );
    expect(() =>
      canonicalizeDpopHtu("https://user:secret@portal.example"),
    ).toThrow("must not contain user credentials");
  });

  it("signs request binding claims with the holder public JWK", async () => {
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const proof = await createDpopProof({
      identity,
      accessToken: "portal-access-token",
      method: "post",
      url: "https://portal.example/api/wallet/v2/credentials/sync?cursor=hidden#fragment",
      now: () => fixedNow,
      clockOffsetSeconds: 90,
    });
    const verified = await compactVerify(proof, identity.publicKey);
    const claims = JSON.parse(
      new TextDecoder().decode(verified.payload),
    ) as DpopProofClaims;

    expect(decodeProtectedHeader(proof)).toEqual({
      alg: "ES256",
      typ: "dpop+jwt",
      jwk: identity.publicJwk,
    });
    expect(claims).toMatchObject({
      htm: "POST",
      htu: "https://portal.example/api/wallet/v2/credentials/sync",
      iat: Math.floor(fixedNow.getTime() / 1_000) + 90,
      ath: "lZ4iyz-df3PweAnWAs2RN2Lzj0BZmKWy_0TST8WZB0k",
    });
    expect(claims.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(claims.htm).not.toBe("GET");
    expect(claims.htu).not.toContain("cursor");
    expect(claims.ath).not.toBe(
      await calculateDpopAccessTokenHash("wrong-access-token"),
    );
  });

  it("creates a fresh jti for every proof, even with identical inputs", async () => {
    const identity = await generateHolderIdentity({ algorithm: "Ed25519" });
    const input = {
      identity,
      accessToken: "same-token",
      method: "GET",
      url: "https://portal.example/api/wallet/v2/credential-requests/request-1",
      now: () => fixedNow,
    };
    const [first, second] = await Promise.all([
      createDpopProof(input),
      createDpopProof(input),
    ]);
    const firstClaims = decodeClaims(first);
    const secondClaims = decodeClaims(second);

    expect(first).not.toBe(second);
    expect(new Set([firstClaims.jti, secondClaims.jti]).size).toBe(2);
    expect({ ...firstClaims, jti: undefined }).toEqual({
      ...secondClaims,
      jti: undefined,
    });
  });

  it("applies positive and negative server clock offsets before flooring iat", async () => {
    const identity = await generateHolderIdentity({ algorithm: "Ed25519" });
    const shared = {
      identity,
      accessToken: "clock-bound-token",
      method: "PATCH",
      url: "https://portal.example/api/wallet/v2/resource",
      now: () => fixedNow,
    };
    const ahead = decodeClaims(
      await createDpopProof({ ...shared, clockOffsetSeconds: 120 }),
    );
    const behind = decodeClaims(
      await createDpopProof({ ...shared, clockOffsetSeconds: -75 }),
    );

    expect(ahead.iat).toBe(Math.floor(fixedNow.getTime() / 1_000) + 120);
    expect(behind.iat).toBe(Math.floor(fixedNow.getTime() / 1_000) - 75);
  });

  it.each([
    ["access token", { accessToken: "" }, "access token is required"],
    ["method", { method: "   " }, "HTTP method is required"],
    ["URL", { url: "" }, "target URL is required"],
  ])("fails closed when %s is missing", async (_name, override, message) => {
    const identity = await generateHolderIdentity({ algorithm: "Ed25519" });
    await expect(
      createDpopProof({
        identity,
        accessToken: "token",
        method: "GET",
        url: "https://portal.example/api/wallet/v2",
        ...override,
      }),
    ).rejects.toThrow(message);
  });

  it("rejects invalid clocks, offsets, methods and URL credentials", async () => {
    const identity = await generateHolderIdentity({ algorithm: "Ed25519" });
    const valid = {
      identity,
      accessToken: "token",
      method: "GET",
      url: "https://portal.example/api/wallet/v2",
    };

    await expect(
      createDpopProof({ ...valid, method: "GET /resource" }),
    ).rejects.toThrow("valid HTTP token");
    await expect(
      createDpopProof({ ...valid, now: () => new Date(Number.NaN) }),
    ).rejects.toThrow("invalid time");
    await expect(
      createDpopProof({
        ...valid,
        clockOffsetSeconds: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow("offset must be finite");
    await expect(
      createDpopProof({
        ...valid,
        url: "https://holder:private@portal.example",
      }),
    ).rejects.toThrow("must not contain user credentials");
  });
});

function decodeClaims(compact: string): DpopProofClaims {
  const payload = compact.split(".")[1];
  if (!payload) throw new Error("Missing compact JWS payload.");
  const decoded = JSON.parse(
    new TextDecoder().decode(base64url.decode(payload)),
  );
  return decoded as DpopProofClaims;
}

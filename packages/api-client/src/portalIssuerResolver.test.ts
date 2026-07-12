import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  portalHospitalDid,
  resolvePortalHospitalIssuer,
  verifyPortalHospitalCredentialJwt,
} from "./portalIssuerResolver";

const portalOrigin = "https://portal.example";

describe("Portal hospital did:web resolver", () => {
  it("cross-checks the Portal DID document and JWKS without fallback", async () => {
    const fixture = await issuerFixture("TCC");
    const issuer = await resolvePortalHospitalIssuer({
      portalBaseUrl: portalOrigin,
      hospitalCode: "tcc",
      fetchImpl: fixture.fetchImpl,
    });

    expect(issuer.issuerDid).toBe("did:web:portal.example:hospital:tcc");
    expect(issuer.activeAssertionMethod.id).toBe(fixture.kid);
    expect(fixture.calls).toEqual([
      `${portalOrigin}/hospital/tcc/did.json`,
      `${portalOrigin}/hospital/tcc/did/jwks.json`,
    ]);
  });

  it("rejects HTML or missing JWKS instead of using a legacy key", async () => {
    const fixture = await issuerFixture("TCP");
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/did/jwks.json")) {
        return new Response("<html>not jwks</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return fixture.fetchImpl(url);
    };
    await expect(
      resolvePortalHospitalIssuer({
        portalBaseUrl: portalOrigin,
        hospitalCode: "TCP",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "portal_issuer_resolution_failed" });
  });

  it("rejects a synthetic hospital issuer document in the live issuer path", async () => {
    const fixture = await issuerFixture("TCC");
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/did.json")) {
        return jsonResponse({
          ...fixture.did,
          trustcare: { ...fixture.did.trustcare, syntheticTestData: true },
        });
      }
      return fixture.fetchImpl(url);
    };
    await expect(
      resolvePortalHospitalIssuer({
        portalBaseUrl: portalOrigin,
        hospitalCode: "TCC",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "portal_issuer_resolution_failed" });
  });

  it("verifies a holder-bound active Portal VC and fails old issuer identity", async () => {
    const fixture = await issuerFixture("TCM");
    const issuer = await resolvePortalHospitalIssuer({
      portalBaseUrl: portalOrigin,
      hospitalCode: "TCM",
      fetchImpl: fixture.fetchImpl,
    });
    const now = new Date("2026-07-11T12:00:00.000Z");
    const credential = {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      credentialSubject: { id: "did:key:zHolder" },
      credentialStatus: { status: "active" },
      validUntil: "2027-07-11T12:00:00.000Z",
    };
    const jwt = await new SignJWT({
      vc: credential,
      trustcare_claim_digest: await sha256Canonical(credential),
    })
      .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", kid: fixture.kid })
      .setIssuer(issuer.issuerDid)
      .setSubject("did:key:zHolder")
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 600)
      .sign(fixture.privateKey);

    await expect(
      verifyPortalHospitalCredentialJwt({
        jwt,
        issuer,
        expectedHolderDid: "did:key:zHolder",
        now,
      }),
    ).resolves.toMatchObject({ verified: true, status: "active" });

    const oldIssuerJwt = await new SignJWT({
      credentialSubject: { id: "did:key:zHolder" },
      credentialStatus: { status: "active" },
    })
      .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", kid: fixture.kid })
      .setIssuer("did:web:trustcare.network:hospital:tcm")
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 600)
      .sign(fixture.privateKey);
    await expect(
      verifyPortalHospitalCredentialJwt({
        jwt: oldIssuerJwt,
        issuer,
        expectedHolderDid: "did:key:zHolder",
        now,
      }),
    ).resolves.toMatchObject({ verified: false, status: "unknown" });
  });

  it("requires both JWT sub and credentialSubject.id to bind the same holder", async () => {
    const fixture = await issuerFixture("TCC");
    const issuer = await resolvePortalHospitalIssuer({
      portalBaseUrl: portalOrigin,
      hospitalCode: "TCC",
      fetchImpl: fixture.fetchImpl,
    });
    const now = new Date("2026-07-11T12:00:00.000Z");
    const holderDid = "did:key:zExpectedHolder";

    const sign = async (
      subjectDid: string,
      jwtSubject: string,
      typ = "vc+jwt",
    ) => {
      const credential = {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiableCredential", "PatientIdentityCredential"],
        credentialSubject: { id: subjectDid },
        credentialStatus: { status: "active" },
        validUntil: "2027-07-11T12:00:00.000Z",
      };
      return new SignJWT({
        vc: credential,
        trustcare_claim_digest: await sha256Canonical(credential),
      })
        .setProtectedHeader({ alg: "ES256", typ, kid: fixture.kid })
        .setIssuer(issuer.issuerDid)
        .setSubject(jwtSubject)
        .setIssuedAt(Math.floor(now.getTime() / 1000))
        .setExpirationTime(Math.floor(now.getTime() / 1000) + 600)
        .sign(fixture.privateKey);
    };

    for (const jwt of [
      await sign("did:key:zWrongSubject", holderDid),
      await sign(holderDid, "did:key:zWrongSubject"),
      await sign(holderDid, holderDid, "JWT"),
    ]) {
      await expect(
        verifyPortalHospitalCredentialJwt({
          jwt,
          issuer,
          expectedHolderDid: holderDid,
          now,
        }),
      ).resolves.toMatchObject({ verified: false });
    }
  });
});

async function issuerFixture(codeInput: "TCC" | "TCP" | "TCM") {
  const issuerDid = portalHospitalDid(portalOrigin, codeInput);
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const kid = `${issuerDid}#vc-signing-active`;
  const jwk = { ...publicJwk, alg: "ES256", use: "sig", kid };
  const did = {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: issuerDid,
    verificationMethod: [
      { id: kid, type: "JsonWebKey", controller: issuerDid, publicKeyJwk: jwk },
    ],
    assertionMethod: [kid],
    authentication: [kid],
    trustcare: { hospitalCode: codeInput, syntheticTestData: false },
  };
  const jwks = { keys: [jwk], issuer: issuerDid, hospitalCode: codeInput };
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/did.json")) {
      return jsonResponse(did, 200, "application/did+ld+json");
    }
    if (String(url).endsWith("/did/jwks.json")) return jsonResponse(jwks);
    return jsonResponse({ title: "Not found" }, 404);
  };
  return { fetchImpl, calls, did, jwks, kid, privateKey };
}

function jsonResponse(
  value: unknown,
  status = 200,
  contentType = "application/json",
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": contentType },
  });
}

async function sha256Canonical(value: unknown): Promise<string> {
  const canonical = canonicalJson(value);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

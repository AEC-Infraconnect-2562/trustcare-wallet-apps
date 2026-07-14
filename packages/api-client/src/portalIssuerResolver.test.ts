import { base64url, exportJWK, generateKeyPair, SignJWT } from "jose";
import { gzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  resolvePortalHospitalIssuer,
  verifyPortalHospitalCredentialJwt,
} from "./portalIssuerResolver";
import { portalDirectCredentialFixture } from "./testFixtures/portalDirectCredential";

const portalOrigin = "https://portal.example";

describe("Portal hospital did:web resolver", () => {
  it("uses the issuer DID returned by Portal instead of deriving it from the hostname", async () => {
    const discoveredDid = "did:web:issuer-authority.example:tcc";
    const fixture = await issuerFixture("TCC", discoveredDid);
    const issuer = await resolvePortalHospitalIssuer({
      portalBaseUrl: portalOrigin,
      hospitalCode: "TCC",
      fetchImpl: fixture.fetchImpl,
    });

    expect(issuer.issuerDid).toBe(discoveredDid);
  });

  it("uses a valid issuer returned by discovery without a local namespace gate", async () => {
    const fixture = await issuerFixture(
      "TCC",
      "did:web:issuer-registry.example:authority:tcc",
    );
    await expect(
      resolvePortalHospitalIssuer({
        portalBaseUrl: portalOrigin,
        hospitalCode: "TCC",
        fetchImpl: fixture.fetchImpl,
      }),
    ).resolves.toMatchObject({
      issuerDid: "did:web:issuer-registry.example:authority:tcc",
    });
  });

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

  it("accepts a standard DID document without proprietary trustcare metadata", async () => {
    const fixture = await issuerFixture("TCC");
    const { trustcare: _trustcare, ...standardDid } = fixture.did;
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/did.json")) {
        return jsonResponse(standardDid, 200, "application/did+ld+json");
      }
      return fixture.fetchImpl(url);
    };

    await expect(
      resolvePortalHospitalIssuer({
        portalBaseUrl: portalOrigin,
        hospitalCode: "TCC",
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      issuerDid: "did:web:portal.example:hospital:tcc",
      hospitalCode: "TCC",
    });
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
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        `${portalOrigin}/contexts/trustcare-credentials-v1.jsonld`,
      ],
      id: "urn:trustcare:vc:patient-identity:1",
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: issuer.issuerDid,
      credentialSubject: { id: "did:key:zHolder", data: {} },
      credentialStatus: statusEntries(issuer.issuerDid),
      validFrom: "2026-07-11T11:00:00.000Z",
      validUntil: "2027-07-11T12:00:00.000Z",
    };
    const jwt = await new SignJWT(credential)
      .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", cty: "vc", kid: fixture.kid })
      .sign(fixture.privateKey);
    const fetchImpl = statusFetch(fixture, issuer.issuerDid, now);

    await expect(
      verifyPortalHospitalCredentialJwt({
        jwt,
        issuer,
        expectedHolderDid: "did:key:zHolder",
        now,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ verified: true, status: "active" });

    const wrongIssuerJwt = await new SignJWT({
      ...credential,
      issuer: "did:web:untrusted-issuer.example:hospital:tcm",
    })
      .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", cty: "vc", kid: fixture.kid })
      .sign(fixture.privateKey);
    await expect(
      verifyPortalHospitalCredentialJwt({
        jwt: wrongIssuerJwt,
        issuer,
        expectedHolderDid: "did:key:zHolder",
        now,
        fetchImpl,
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
        "@context": [
          "https://www.w3.org/ns/credentials/v2",
          `${portalOrigin}/contexts/trustcare-credentials-v1.jsonld`,
        ],
        id: `urn:trustcare:vc:holder:${subjectDid}`,
        type: ["VerifiableCredential", "PatientIdentityCredential"],
        issuer: issuer.issuerDid,
        credentialSubject: { id: subjectDid, data: {} },
        credentialStatus: statusEntries(issuer.issuerDid),
        validFrom: "2026-07-11T11:00:00.000Z",
        validUntil: "2027-07-11T12:00:00.000Z",
      };
      return new SignJWT({ ...credential, sub: jwtSubject })
        .setProtectedHeader({ alg: "ES256", typ, cty: "vc", kid: fixture.kid })
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
          fetchImpl: statusFetch(fixture, issuer.issuerDid, now),
        }),
      ).resolves.toMatchObject({ verified: false });
    }
  });

  it("rejects cryptographically valid credentials reported revoked or suspended", async () => {
    const fixture = await issuerFixture("TCC");
    const issuer = await resolvePortalHospitalIssuer({
      portalBaseUrl: portalOrigin,
      hospitalCode: "TCC",
      fetchImpl: fixture.fetchImpl,
    });
    const now = new Date("2026-07-11T12:00:00.000Z");
    const holderDid = "did:key:zStatusListHolder";
    const credential = portalDirectCredentialFixture({
      issuerDid: issuer.issuerDid,
      holderDid,
      portalOrigin,
      now,
    });
    const jwt = await new SignJWT(credential)
      .setProtectedHeader({
        alg: "ES256",
        typ: "vc+jwt",
        cty: "vc",
        kid: fixture.kid,
      })
      .sign(fixture.privateKey);

    for (const purpose of ["revocation", "suspension"] as const) {
      await expect(
        verifyPortalHospitalCredentialJwt({
          jwt,
          issuer,
          expectedHolderDid: holderDid,
          now,
          fetchImpl: statusFetch(fixture, issuer.issuerDid, now, purpose),
        }),
      ).resolves.toMatchObject({
        verified: false,
        status: purpose === "revocation" ? "revoked" : "suspended",
        errors: [
          `credential_status_${
            purpose === "revocation" ? "revoked" : "suspended"
          }`,
        ],
      });
    }
  });

  it("rejects conflicting iss, wrong kid/controller, wrapper claims, and unsigned payloads", async () => {
    const fixture = await issuerFixture("TCC");
    const issuer = await resolvePortalHospitalIssuer({
      portalBaseUrl: portalOrigin,
      hospitalCode: "TCC",
      fetchImpl: fixture.fetchImpl,
    });
    const now = new Date("2026-07-11T12:00:00.000Z");
    const holderDid = "did:key:zPortalCompatibilityHolder";
    const credential = portalDirectCredentialFixture({
      issuerDid: issuer.issuerDid,
      holderDid,
      portalOrigin,
      now,
    });
    const sign = (payload: Record<string, unknown>, kid = fixture.kid) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", cty: "vc", kid })
        .sign(fixture.privateKey);
    const fetchImpl = statusFetch(fixture, issuer.issuerDid, now);

    const candidates = [
      await sign({ ...credential, iss: "did:web:conflicting.example" }),
      await sign(credential, `${issuer.issuerDid}#unknown-key`),
      await sign({ ...credential, vc: credential }),
      JSON.stringify(credential),
    ];
    for (const jwt of candidates) {
      await expect(
        verifyPortalHospitalCredentialJwt({
          jwt,
          issuer,
          expectedHolderDid: holderDid,
          now,
          fetchImpl,
        }),
      ).resolves.toMatchObject({ verified: false });
    }

    const wrongControllerFetch: typeof fetch = async (url) => {
      if (String(url).endsWith("/did.json")) {
        return jsonResponse({
          ...fixture.did,
          verificationMethod: fixture.did.verificationMethod.map((method) => ({
            ...method,
            controller: "did:web:wrong-controller.example",
          })),
        });
      }
      return fixture.fetchImpl(url);
    };
    await expect(
      resolvePortalHospitalIssuer({
        portalBaseUrl: portalOrigin,
        hospitalCode: "TCC",
        fetchImpl: wrongControllerFetch,
      }),
    ).rejects.toThrow("controller");
  });
});

async function issuerFixture(
  codeInput: "TCC" | "TCP" | "TCM",
  issuerDid = testIssuerDid(codeInput),
) {
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

function testIssuerDid(code: "TCC" | "TCP" | "TCM"): string {
  return `did:web:portal.example:hospital:${code.toLowerCase()}`;
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

function statusEntries(issuerDid: string) {
  return (["revocation", "suspension"] as const).map((purpose) => {
    const url = `${portalOrigin}/api/credentials/status-lists/${encodeURIComponent(issuerDid)}/${purpose}`;
    return {
      id: `${url}#1`,
      type: "BitstringStatusListEntry",
      statusPurpose: purpose,
      statusListIndex: "1",
      statusListCredential: url,
    };
  });
}

function statusFetch(
  fixture: Awaited<ReturnType<typeof issuerFixture>>,
  issuerDid: string,
  now: Date,
  activePurpose?: "revocation" | "suspension",
): typeof fetch {
  return async (url) => {
    const parsed = new URL(String(url));
    const purpose = parsed.pathname.endsWith("/suspension")
      ? "suspension"
      : parsed.pathname.endsWith("/revocation")
        ? "revocation"
        : undefined;
    if (!purpose) return fixture.fetchImpl(url);
    const statusUrl = parsed.toString();
    const bitstring = new Uint8Array(16_384);
    if (purpose === activePurpose) bitstring[0] = 0x40;
    const jwt = await new SignJWT({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: statusUrl,
      type: ["VerifiableCredential", "BitstringStatusListCredential"],
      issuer: issuerDid,
      validFrom: new Date(now.getTime() - 60_000).toISOString(),
      validUntil: new Date(now.getTime() + 86_400_000).toISOString(),
      credentialSubject: {
        id: `${statusUrl}#list`,
        type: "BitstringStatusList",
        statusPurpose: purpose,
        encodedList: `u${base64url.encode(gzipSync(bitstring))}`,
      },
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: "vc+jwt",
        cty: "vc",
        kid: fixture.kid,
      })
      .sign(fixture.privateKey);
    return new Response(jwt, {
      status: 200,
      headers: { "content-type": "application/vc+jwt" },
    });
  };
}

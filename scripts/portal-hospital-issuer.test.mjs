import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePortalHospitalVerificationContext,
} from "./portal-hospital-issuer.mjs";

const portalOrigin =
  "https://trustcare-hospital-network-production.up.railway.app";
const issuerDid = "did:web:issuer-authority.example:tcc";
const kid = `${issuerDid}#active-key`;
const publicJwk = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  use: "sig",
  kid,
  x: "x-coordinate",
  y: "y-coordinate",
};

test("resolves only the live Portal hospital DID and active JWKS key", async () => {
  const requests = [];
  const result = await resolvePortalHospitalVerificationContext({
    portalBaseUrl: portalOrigin,
    controller: issuerDid,
    kid,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return jsonResponse(
        String(url).endsWith("did.json")
          ? {
              id: issuerDid,
              verificationMethod: [
                { id: kid, controller: issuerDid, publicKeyJwk: publicJwk },
              ],
              assertionMethod: [kid],
              trustcare: { hospitalCode: "TCC", syntheticTestData: false },
            }
          : {
              issuer: issuerDid,
              hospitalCode: "TCC",
              keys: [publicJwk],
            },
      );
    },
  });

  assert.equal(result.issuerDid, issuerDid);
  assert.equal(result.kid, kid);
  assert.deepEqual(requests, [
    `${portalOrigin}/hospital/tcc/did.json`,
    `${portalOrigin}/hospital/tcc/did/jwks.json`,
  ]);
});

test("rejects the retired hospital DID authority without fetching", async () => {
  let calls = 0;
  const result = await resolvePortalHospitalVerificationContext({
    portalBaseUrl: portalOrigin,
    controller: "did:web:trustcare.network:hospital:tcc",
    kid: "did:web:trustcare.network:hospital:tcc#key-1",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not fetch");
    },
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("fails closed when Portal reports synthetic issuer data", async () => {
  await assert.rejects(
    resolvePortalHospitalVerificationContext({
      portalBaseUrl: portalOrigin,
      controller: issuerDid,
      kid,
      fetchImpl: async (url) =>
        jsonResponse(
          String(url).endsWith("did.json")
            ? {
                id: issuerDid,
                verificationMethod: [
                  { id: kid, controller: issuerDid, publicKeyJwk: publicJwk },
                ],
                assertionMethod: [kid],
                trustcare: { hospitalCode: "TCC", syntheticTestData: true },
              }
            : {
                issuer: issuerDid,
                hospitalCode: "TCC",
                keys: [publicJwk],
              },
        ),
    }),
    /does not match its trust registry entry/,
  );
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
} from "../packages/wallet-core/node_modules/jose/dist/webapi/index.js";
import { evaluateStoredVpVerificationEvidence } from "./share-gateway-verification.mjs";

const now = new Date("2026-07-10T06:00:00.000Z");
const expiresAt = "2026-07-10T07:00:00.000Z";
const audience = "https://trustcare.network/verifier";

test("returns bound V1 evidence only after independently verifying VP and every VC", async () => {
  const fixture = await signedFixture();
  const evidence = await evaluateWithBoundRequest(fixture);

  assert.equal(evidence.version, "1");
  assert.equal(evidence.subjects.length, 2);
  assert.deepEqual(
    evidence.subjects.map((subject) => subject.role),
    ["vp", "vc"],
  );
  assert.equal(evidence.subjects[0].issuerDid, fixture.gateway.issuerDid);
  assert.equal(evidence.subjects[0].holderDid, fixture.holderDid);
  assert.ok(
    evidence.subjects.every((subject) => subject.digest.startsWith("sha256:")),
  );
  assert.deepEqual(
    Object.fromEntries(
      evidence.checks.map((check) => [check.key, check.state]),
    ),
    {
      proof: "pass",
      issuer: "pass",
      status: "pass",
      expiry: "pass",
      policy: "pass",
      binding: "pass",
    },
  );
  assert.ok(
    evidence.checks.every(
      (check) => check.subjectDigests.length === evidence.subjects.length,
    ),
  );
});

test("does not trust request pass flags or mismatched client digests", async () => {
  const fixture = await signedFixture();
  const preliminary = await evaluateStoredVpVerificationEvidence({
    ...fixture.input,
    request: {},
  });
  const evidence = await evaluateStoredVpVerificationEvidence({
    ...fixture.input,
    request: {
      purpose: fixture.purpose,
      recipient: fixture.recipient,
      audience,
      subjectDigest: preliminary.subjects[0].digest,
      packageDigest: preliminary.packageDigest,
      contextDigest: "sha256:request-cannot-self-assert-a-pass",
      verified: true,
      checks: { proof: true, status: true },
    },
  });

  assert.equal(checkState(evidence, "proof"), "pass");
  assert.equal(checkState(evidence, "binding"), "fail");
});

test("fails proof, issuer and status when a nested VC signature is corrupted", async () => {
  const fixture = await signedFixture({ corruptCredentialSignature: true });
  const evidence = await evaluateWithBoundRequest(fixture);

  assert.equal(checkState(evidence, "proof"), "fail");
  assert.equal(checkState(evidence, "issuer"), "fail");
  assert.equal(checkState(evidence, "status"), "fail");
  assert.equal(checkState(evidence, "expiry"), "pass");
});

test("fails governed status instead of falling back to an active-looking string", async () => {
  const fixture = await signedFixture({ statusReference: "active" });
  const evidence = await evaluateWithBoundRequest(fixture);

  assert.equal(checkState(evidence, "proof"), "pass");
  assert.equal(checkState(evidence, "status"), "fail");
});

test("accepts the explicitly governed demo payer status scheme", async () => {
  const fixture = await signedFixture({
    statusReference: {
      id: "urn:trustcare:payer-demo:eligibility:fixture#status",
      type: "TrustCareDemoPayerStatus",
      status: "active",
    },
  });
  const evidence = await evaluateWithBoundRequest(fixture);

  assert.equal(checkState(evidence, "proof"), "pass");
  assert.equal(checkState(evidence, "issuer"), "pass");
  assert.equal(checkState(evidence, "status"), "pass");
});

async function evaluateWithBoundRequest(fixture) {
  const preliminary = await evaluateStoredVpVerificationEvidence({
    ...fixture.input,
    request: {},
  });
  return evaluateStoredVpVerificationEvidence({
    ...fixture.input,
    request: {
      purpose: fixture.purpose,
      recipient: fixture.recipient,
      audience,
      subjectDigest: preliminary.subjects[0].digest,
      packageDigest: preliminary.packageDigest,
      contextDigest: preliminary.contextDigest,
    },
  });
}

async function signedFixture(options = {}) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const gateway = context(
    "did:web:wallet.example",
    "wallet-signing-key",
    publicJwk,
    privateKey,
  );
  const hospital = context(
    "did:web:trustcare-hospital-network-production.up.railway.app:hospital:tcc",
    "active-key",
    publicJwk,
    privateKey,
  );
  const holderDid = "did:key:z6MkhFixtureHolder";
  const artifactId = "vp-fixture-001";
  const purpose = "insurance_claim";
  const recipient = "did:web:payer.example";
  const statusReference = options.statusReference ?? {
    id: "urn:uuid:vc-fixture-001#status",
    type: "TrustCareStatusList2026",
    statusPurpose: "revocation",
    status: "active",
  };
  const credential = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "urn:uuid:vc-fixture-001",
    type: ["VerifiableCredential", "MedicalCertificateCredential"],
    issuer: { id: hospital.issuerDid },
    validFrom: now.toISOString(),
    validUntil: expiresAt,
    credentialSubject: { id: holderDid, diagnosis: "fixture" },
    credentialStatus: statusReference,
  };
  let credentialJwt = await new SignJWT(credential)
    .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", kid: hospital.kid })
    .setIssuer(hospital.issuerDid)
    .setSubject(holderDid)
    .setAudience(audience)
    .setJti(credential.id)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(Date.parse(expiresAt) / 1000))
    .sign(hospital.privateKey);
  if (options.corruptCredentialSignature) {
    const [header, payload] = credentialJwt.split(".");
    credentialJwt = `${header}.${payload}.AAAA`;
  }
  const presentation = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: artifactId,
    type: ["VerifiablePresentation"],
    holder: holderDid,
    purpose,
    recipient,
    selectedFields: ["diagnosis"],
    validUntil: expiresAt,
    verifiableCredential: [
      {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        id: `data:application/vc+jwt,${encodeURIComponent(credentialJwt)}`,
        type: ["VerifiableCredential", "EnvelopedVerifiableCredential"],
      },
    ],
    trustcare: { policyVersion: "2026.07" },
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "ecdsa-jcs-2019",
      proofPurpose: "authentication",
      verificationMethod: gateway.kid,
      proofValue: "zFixtureProofValueBoundByTheVpJwt",
    },
  };
  const jwt = await new SignJWT(presentation)
    .setProtectedHeader({ alg: "ES256", typ: "vp+jwt", kid: gateway.kid })
    .setIssuer(gateway.issuerDid)
    .setSubject(holderDid)
    .setAudience(audience)
    .setJti(artifactId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(Date.parse(expiresAt) / 1000))
    .sign(gateway.privateKey);
  const contexts = new Map([
    [gateway.kid, gateway],
    [hospital.kid, hospital],
  ]);
  return {
    gateway,
    holderDid,
    purpose,
    recipient,
    input: {
      artifactId,
      jwt,
      now,
      resolveSigningContext({ header }) {
        return contexts.get(header.kid) ?? null;
      },
    },
  };
}

function context(issuerDid, fragment, publicJwk, privateKey) {
  const kid = `${issuerDid}#${fragment}`;
  return {
    issuerDid,
    kid,
    publicJwk: { ...publicJwk, alg: "ES256", kid, use: "sig" },
    privateKey,
  };
}

function checkState(evidence, key) {
  return evidence.checks.find((check) => check.key === key)?.state;
}

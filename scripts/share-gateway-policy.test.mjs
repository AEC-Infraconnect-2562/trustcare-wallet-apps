import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPPORTED_SHARE_ARTIFACT_KINDS,
  authorizeGatewayMutation,
  credentialSourceMetadata,
  immutableArtifactDecision,
  publicationRequestDigest,
  unsignedCredentialPublicationPolicy,
  validateDemoPayerIssuanceRequest,
} from "./share-gateway-policy.mjs";

const artifactPath = "/api/share-gateway/artifacts";

test("generic gateway exposes only hard-cutover artifact kinds", () => {
  assert.deepEqual([...SUPPORTED_SHARE_ARTIFACT_KINDS], [
    "vp",
    "standard_shl_manifest",
    "shl_file",
  ]);
});

test("production mutations require a trusted Origin or configured service token", () => {
  for (const pathname of [
    artifactPath,
    "/api/share-gateway/payer/credentials/issue",
  ]) {
    assert.equal(
      authorizeGatewayMutation({
        method: "POST",
        pathname,
        production: true,
        origin: "",
        trustedOrigins: ["https://wallet.example"],
        authorization: "",
        configuredServiceToken: "service-secret",
      }).ok,
      false,
    );
    assert.equal(
      authorizeGatewayMutation({
        method: "POST",
        pathname,
        production: true,
        origin: "https://wallet.example",
        trustedOrigins: ["https://wallet.example"],
      }).ok,
      true,
    );
    assert.equal(
      authorizeGatewayMutation({
        method: "POST",
        pathname,
        production: true,
        origin: "",
        trustedOrigins: [],
        authorization: "Bearer service-secret",
        configuredServiceToken: "service-secret",
      }).ok,
      true,
    );
  }
});

test("demo payer issuance accepts only allowlisted matching payer profiles", () => {
  const accepted = validateDemoPayerIssuanceRequest(
    {
      issuerServiceOperation: "demo_payer_integration_issue",
      sourceAuthority: "payer_adapter",
      sourceSystem: "payer_adapter",
      signingOwner: "payer_adapter",
      payerId: "international_tpa_mock",
    },
    {
      type: ["VerifiableCredential", "GuaranteeLetterCredential"],
      credentialSubject: { payerId: "international_tpa_mock" },
    },
  );
  assert.equal(accepted.ok, true);
  assert.equal(
    accepted.profile.name,
    "International TPA Demo Integration Issuer",
  );

  const arbitrary = validateDemoPayerIssuanceRequest(
    {
      issuerServiceOperation: "demo_payer_integration_issue",
      sourceAuthority: "payer_adapter",
      signingOwner: "payer_adapter",
      payerId: "arbitrary_insurer",
    },
    { credentialSubject: { payerId: "arbitrary_insurer" } },
  );
  assert.equal(arbitrary.ok, false);

  const mismatch = validateDemoPayerIssuanceRequest(
    {
      issuerServiceOperation: "demo_payer_integration_issue",
      sourceAuthority: "payer_adapter",
      signingOwner: "payer_adapter",
      payerId: "nhso_mock",
    },
    { credentialSubject: { payerId: "international_tpa_mock" } },
  );
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.message, /does not match/);
});

test("production VP publication rejects every raw credential with source-aware errors", () => {
  const portalCredential = {
    trustcare: {
      shareSource: { authority: "portal_synced", sourceSystem: "portal" },
    },
  };
  const payerCredential = {
    issuer: "did:web:payer.example:payer:demo",
  };
  const issuerCredential = {
    trustcare: {
      shareSource: { authority: "issuer_signed" },
    },
  };

  assert.match(
    unsignedCredentialPublicationPolicy({
      production: true,
      credential: portalCredential,
    }).message,
    /Portal-synced/,
  );
  assert.match(
    unsignedCredentialPublicationPolicy({
      production: true,
      credential: payerCredential,
    }).message,
    /payer credential/,
  );
  assert.equal(
    unsignedCredentialPublicationPolicy({
      production: true,
      credential: issuerCredential,
    }).ok,
    false,
  );
  assert.equal(
    unsignedCredentialPublicationPolicy({
      production: false,
      credential: issuerCredential,
    }).ok,
    true,
  );
});

test("publication digests are canonical and immutable writes are idempotent only for the same request", () => {
  const left = publicationRequestDigest({
    artifactId: "vp_secure",
    kind: "vp",
    payload: { holder: "did:key:holder", purpose: "opd" },
  });
  const reordered = publicationRequestDigest({
    payload: { purpose: "opd", holder: "did:key:holder" },
    kind: "vp",
    artifactId: "vp_secure",
  });
  const changed = publicationRequestDigest({
    artifactId: "vp_secure",
    kind: "vp",
    payload: { holder: "did:key:holder", purpose: "claim" },
  });

  assert.equal(left, reordered);
  assert.notEqual(left, changed);
  assert.equal(immutableArtifactDecision(null, left).status, "create");
  assert.equal(
    immutableArtifactDecision({ requestDigest: left }, left).status,
    "idempotent",
  );
  assert.equal(
    immutableArtifactDecision({ requestDigest: left }, changed).status,
    "conflict",
  );
});

test("source metadata is carried by raw share credentials", () => {
  assert.deepEqual(
    credentialSourceMetadata(
      {},
      {
        trustcare: {
          shareSource: {
            authority: "payer_adapter",
            signingOwner: "payer_adapter",
            sourceSystem: "payer_adapter",
          },
        },
      },
    ),
    {
      authority: "payer_adapter",
      signingOwner: "payer_adapter",
      sourceSystem: "payer_adapter",
    },
  );
});

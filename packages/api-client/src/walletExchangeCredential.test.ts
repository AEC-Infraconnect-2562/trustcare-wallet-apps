import {
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
  WALLET_RENDERER_REFERENCE_COMMIT,
  type WalletSyncUpsertChange,
} from "@trustcare/contracts";
import {
  createWalletExchangeState,
  prepareWalletExchangeSyncCommit,
  type WalletExchangePreparedUpsertChange,
} from "@trustcare/wallet-core";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { describe, expect, it } from "vitest";
import {
  portalHospitalDid,
  type ResolvedPortalHospitalIssuer,
} from "./portalIssuerResolver";
import { prepareWalletExchangeCredential } from "./walletExchangeCredential";

const portalOrigin = "https://portal.example";
const holderDid = "did:key:z6MknTrustCareHolder";
const now = new Date("2026-07-11T12:00:00.000Z");

describe("Wallet Exchange credential normalization", () => {
  it("preserves the live Portal VC, renderData, holder, and source without claiming full trust", async () => {
    const fixture = await signedPortalCredential();

    const prepared = await prepare(fixture);

    expect(prepared.issuerEvidence).toMatchObject({
      hospitalCode: "TCC",
      expectedIssuerDid: fixture.issuer.issuerDid,
      didDocumentId: fixture.issuer.issuerDid,
      credentialIssuerDid: fixture.issuer.issuerDid,
      proofVerified: true,
      issuerActive: true,
      checkedAt: now.toISOString(),
    });
    expect(prepared.document).toBeDefined();
    expect(prepared.document?.content.credentialPayload).toEqual(
      fixture.credentialData,
    );
    expect(
      objectRecord(
        objectRecord(fixture.credentialData.credentialSubject).humanDocument,
      ).renderData,
    ).toEqual(fixture.renderData);
    expect(
      objectRecord(
        objectRecord(
          prepared.document?.content.credentialPayload?.credentialSubject,
        ).humanDocument,
      ).renderData,
    ).toEqual(fixture.renderData);
    expect(prepared.document?.credential.jwt).toBe(fixture.jwt);
    expect(prepared.document?.owner).toEqual({ id: holderDid, holderDid });
    expect(prepared.document?.provenance).toMatchObject({
      sourceKind: "trustcare_portal",
      issuerDid: fixture.issuer.issuerDid,
      sourceEndpoint: `${portalOrigin}/api/wallet/v2/credentials/sync`,
    });
    expect(prepared.document?.trust.state).toBe("issuer_signed_untrusted");
    expect(String(prepared.document?.trust.state)).not.toBe("verified");
    expect(
      prepared.document?.trust.checks.find((check) => check.key === "policy"),
    ).toMatchObject({ status: "pending" });

    const reduced = reduce(prepared);
    expect(reduced.plan.documents.put).toHaveLength(1);
    expect(reduced.plan.pendingAck.results).toEqual([
      { eventId: fixture.change.eventId, outcome: "applied" },
    ]);
    expect(reduced.plan.quarantine.put).toHaveLength(0);
  });

  it("quarantines a legacy Wallet issuer DID instead of retaining it as fallback", async () => {
    const legacyIssuerDid = "did:web:trustcare.network:hospital:tcc";
    const fixture = await signedPortalCredential({
      syncIssuerDid: legacyIssuerDid,
      proofIssuer: legacyIssuerDid,
    });

    const prepared = await prepare(fixture);

    expect(prepared.issuerEvidence).toMatchObject({
      expectedIssuerDid: fixture.issuer.issuerDid,
      credentialIssuerDid: legacyIssuerDid,
    });
    expect(reduce(prepared).plan.quarantine.put[0]).toMatchObject({
      reason: "issuer_conflict",
      issuerDid: legacyIssuerDid,
    });
  });

  it("does not normalize a VC whose signed subject is a different holder", async () => {
    const fixture = await signedPortalCredential({
      signedHolderDid: "did:key:z6MknDifferentPatient",
    });

    const prepared = await prepare(fixture);

    expect(prepared.document).toBeUndefined();
    expect(prepared.issuerEvidence?.proofVerified).toBe(false);
    assertRejectedToQuarantine(prepared);
  });

  it("quarantines proof metadata that conflicts with the actual issuer JWT", async () => {
    const fixture = await signedPortalCredential({
      proofIssuer: "did:web:portal.example:hospital:tcp",
    });

    const prepared = await prepare(fixture);

    expect(prepared.document).toBeUndefined();
    expect(prepared.issuerEvidence?.proofVerified).toBe(false);
    assertRejectedToQuarantine(prepared);
  });

  it.each([
    ["alg", { proofAlg: "ES384" }],
    ["kid", { proofKid: "did:web:portal.example:hospital:tcc#wrong-key" }],
  ] as const)(
    "fails closed when sync proof %s metadata differs from the signed JWT",
    async (_field, fixtureInput) => {
      const fixture = await signedPortalCredential(fixtureInput);

      const prepared = await prepare(fixture);

      expect(prepared.document).toBeUndefined();
      expect(prepared.issuerEvidence?.proofVerified).toBe(false);
      assertRejectedToQuarantine(prepared);
    },
  );

  it("does not normalize credentialData that differs from the signed VC", async () => {
    const fixture = await signedPortalCredential();
    const changedRenderData = {
      ...fixture.renderData,
      patient: { name: "ข้อมูลที่ไม่ได้ลงนาม" },
    };
    const changedCredentialData = {
      ...fixture.credentialData,
      credentialSubject: {
        ...objectRecord(fixture.credentialData.credentialSubject),
        humanDocument: { renderData: changedRenderData },
      },
    };
    fixture.change.credential.credentialData = changedCredentialData;
    const contentHash = await walletExchangeContentHash({
      credentialData: changedCredentialData,
      proofJwt: fixture.jwt,
      status: fixture.change.status,
    });
    fixture.change.contentHash = contentHash;
    fixture.change.credential.contentHash = contentHash;

    const prepared = await prepare(fixture);

    expect(prepared.document).toBeUndefined();
    expect(prepared.issuerEvidence?.proofVerified).toBe(false);
    assertRejectedToQuarantine(prepared);
  });

  it("fails closed when the sync content hash does not cover the signed envelope", async () => {
    const fixture = await signedPortalCredential();
    fixture.change.contentHash = `sha256:${"0".repeat(64)}`;
    fixture.change.credential.contentHash = fixture.change.contentHash;

    const prepared = await prepare(fixture);

    expect(prepared.document).toBeUndefined();
    expect(prepared.issuerEvidence?.proofVerified).toBe(false);
    assertRejectedToQuarantine(prepared);
  });

  it("fails closed for an unknown document type even when the VC signature is valid", async () => {
    const fixture = await signedPortalCredential({
      cardType: "future_portal_document",
      credentialType: "FuturePortalCredential",
    });

    const prepared = await prepare(fixture);

    expect(prepared.issuerEvidence?.proofVerified).toBe(false);
    expect(prepared.document).toBeUndefined();
    assertRejectedToQuarantine(prepared);
  });

  it.each([
    [
      "credentialSubject.documentType",
      { signedDocumentType: "medication_summary" },
    ],
    ["VC type", { signedCredentialType: "MedicationSummaryCredential" }],
  ] as const)(
    "fails closed when signed %s conflicts with the sync document type",
    async (_field, fixtureInput) => {
      const fixture = await signedPortalCredential(fixtureInput);

      const prepared = await prepare(fixture);

      expect(prepared.document).toBeUndefined();
      expect(prepared.issuerEvidence?.proofVerified).toBe(false);
      assertRejectedToQuarantine(prepared);
    },
  );

  it("fails closed when signed delivery has no issuer proof JWT", async () => {
    const fixture = await signedPortalCredential({ omitProof: true });

    const prepared = await prepare(fixture);

    expect(prepared.document).toBeUndefined();
    expect(prepared.issuerEvidence?.proofVerified).toBe(false);
    assertRejectedToQuarantine(prepared);
  });
});

type PortalCredentialFixture = {
  change: WalletSyncUpsertChange;
  credentialData: Record<string, unknown>;
  issuer: ResolvedPortalHospitalIssuer;
  jwt: string;
  renderData: Record<string, unknown>;
};

async function signedPortalCredential(input?: {
  signedHolderDid?: string;
  syncIssuerDid?: string;
  proofIssuer?: string;
  proofAlg?: string;
  proofKid?: string;
  cardType?: string;
  credentialType?: string;
  signedDocumentType?: string;
  signedCredentialType?: string;
  omitProof?: boolean;
}): Promise<PortalCredentialFixture> {
  const issuerDid = portalHospitalDid(portalOrigin, "TCC");
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const kid = `${issuerDid}#vc-signing-active`;
  const jwk: JWK = {
    ...publicJwk,
    alg: "ES256",
    use: "sig",
    kid,
  };
  const issuer = resolvedIssuer(issuerDid, kid, jwk);
  const signedHolderDid = input?.signedHolderDid ?? holderDid;
  const renderData = {
    document: {
      titleTh: "บัตรประจำตัวผู้ป่วย",
      titleEn: "PATIENT ID CARD",
      layout: "photo_identity_card",
    },
    patient: {
      nameTh: "นายสมชาย ใจดี",
      nameEn: "Mr. Somchai Jaidee",
      hn: "HN-TCC-00100001",
      photoUrl: "https://portal.example/test-assets/patients/somchai.jpg",
    },
    issuer: {
      nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
      nameEn: "TrustCare Central Hospital",
    },
  };
  const credentialData: Record<string, unknown> = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "urn:trustcare:credential:patient-identity:001",
    type: [
      "VerifiableCredential",
      input?.signedCredentialType ?? "PatientIdentityCredential",
    ],
    issuer: { id: issuerDid },
    validFrom: "2026-07-11T11:55:00.000Z",
    validUntil: "2027-07-11T12:00:00.000Z",
    credentialStatus: {
      id: `${portalOrigin}/api/wallet/v2/credential-status/001`,
      type: "TrustCareCredentialStatus2026",
      status: "active",
    },
    credentialSubject: {
      id: signedHolderDid,
      documentType: input?.signedDocumentType ?? "patient_identity",
      humanDocument: { renderData },
    },
  };
  const jwt = await new SignJWT({
    vc: credentialData,
    trustcare_claim_digest: await sha256Canonical(credentialData),
  })
    .setProtectedHeader({ alg: "ES256", typ: "vc+jwt", kid })
    .setIssuer(issuerDid)
    .setSubject(signedHolderDid)
    .setIssuedAt(Math.floor(now.getTime() / 1000) - 60)
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 3_600)
    .sign(privateKey);
  const proofJwt = input?.omitProof ? null : jwt;
  const contentHash = await walletExchangeContentHash({
    credentialData,
    proofJwt,
    status: "active",
  });
  const syncIssuerDid = input?.syncIssuerDid ?? issuerDid;
  const credentialId = "portal-vc-patient-identity-001";
  const change: WalletSyncUpsertChange = {
    eventId: "wallet-event-patient-identity-001",
    type: "credential.upsert",
    credentialId,
    status: "active",
    occurredAt: "2026-07-11T12:00:00.000Z",
    contentHash,
    credential: {
      credentialId,
      cardType: input?.cardType ?? "patient_identity",
      credentialType: input?.credentialType ?? "PatientIdentityCredential",
      displayName: "บัตรประจำตัวผู้ป่วย",
      displayNameEn: "Patient ID Card",
      documentCategory: "identity_and_access",
      credentialStatus: "active",
      credentialData,
      proof: input?.omitProof
        ? null
        : {
            type: "jwt",
            jwt,
            alg: input?.proofAlg ?? "ES256",
            kid: input?.proofKid ?? kid,
            issuer: input?.proofIssuer ?? syncIssuerDid,
          },
      selectiveDisclosure: null,
      issuerDid: syncIssuerDid,
      issuerHospitalName: "TrustCare Central Hospital",
      holderDid,
      sourceSystem: "trustcare_portal",
      lineageKey: "portal-lineage-patient-identity-001",
      version: "1",
      contentHash,
      issuedAt: "2026-07-11T11:55:00.000Z",
      expiresAt: "2027-07-11T12:00:00.000Z",
      updatedAt: "2026-07-11T12:00:00.000Z",
      deliveryState: "signed",
      renderer: {
        authority: "trustcare_wallet",
        repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
        referenceCommit: WALLET_RENDERER_REFERENCE_COMMIT,
        renderVersion: "2.0",
      },
    },
  };
  return { change, credentialData, issuer, jwt, renderData };
}

async function prepare(
  fixture: PortalCredentialFixture,
): Promise<WalletExchangePreparedUpsertChange> {
  return prepareWalletExchangeCredential({
    change: fixture.change,
    portalBaseUrl: portalOrigin,
    holderDid,
    resolvedIssuer: fixture.issuer,
    now,
  });
}

function reduce(change: WalletExchangePreparedUpsertChange) {
  return prepareWalletExchangeSyncCommit(
    createWalletExchangeState({ portalOrigin, holderDid }),
    {
      schema: "trustcare.wallet.sync.v2",
      contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
      syncId: "sync-credential-normalization-001",
      mode: "initial",
      changes: [change],
      nextCursor: "opaque-wallet-cursor-credential-normalization-001",
      hasMore: false,
      serverTime: "2026-07-11T12:00:01.000Z",
      ackIdempotencyKey: "ack-credential-normalization-001",
    },
  );
}

function assertRejectedToQuarantine(
  prepared: WalletExchangePreparedUpsertChange,
): void {
  const reduced = reduce(prepared);
  expect(reduced.plan.documents.put).toHaveLength(0);
  expect(reduced.plan.pendingAck.results[0]).toMatchObject({
    eventId: prepared.eventId,
    outcome: "rejected",
  });
  expect(reduced.plan.quarantine.put).toHaveLength(1);
}

function resolvedIssuer(
  issuerDid: string,
  kid: string,
  jwk: JWK,
): ResolvedPortalHospitalIssuer {
  const verificationMethod = {
    id: kid,
    type: "JsonWebKey",
    controller: issuerDid,
    publicKeyJwk: jwk,
  };
  return {
    portalOrigin,
    hospitalCode: "TCC",
    issuerDid,
    didUrl: `${portalOrigin}/hospital/tcc/did.json`,
    jwksUrl: `${portalOrigin}/hospital/tcc/did/jwks.json`,
    didDocument: {
      id: issuerDid,
      verificationMethod: [verificationMethod],
      assertionMethod: [kid],
      authentication: [kid],
      trustcare: { hospitalCode: "TCC", syntheticTestData: false },
    },
    jwks: { keys: [jwk], issuer: issuerDid, hospitalCode: "TCC" },
    activeAssertionMethod: verificationMethod,
  };
}

async function walletExchangeContentHash(input: {
  credentialData: Record<string, unknown>;
  proofJwt: string | null;
  status: WalletSyncUpsertChange["status"];
}): Promise<`sha256:${string}`> {
  return `sha256:${await sha256Canonical(input)}`;
}

async function sha256Canonical(value: unknown): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalJson(value)),
    ),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

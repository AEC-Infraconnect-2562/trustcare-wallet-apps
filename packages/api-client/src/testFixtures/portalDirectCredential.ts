export type PortalDirectCredentialFixtureInput = {
  issuerDid: string;
  holderDid: string;
  portalOrigin: string;
  now?: Date;
};

export const PORTAL_ISSUANCE_AUTHORITY_DIGEST = "a".repeat(64);

export function portalIssuanceAuthorityFixture(): Record<string, unknown> {
  return {
    issuanceAuthority: {
      version: "trustcare-issuance-authority-v1",
      authority: "sandbox_wallet_identity_catalog",
      snapshotDigest: PORTAL_ISSUANCE_AUTHORITY_DIGEST,
      identityCatalogVersion: "2026.07.test-identities.v4",
      sourcePayloadDigest: "b".repeat(64),
    },
  };
}

export function portalIssuanceAuthorityEvidenceFixture(
  credentialId: string,
): Record<string, unknown>[] {
  return [
    {
      id: `${credentialId}#evidence-1`,
      type:
        "https://trustcare.network/credentials/v1#IssuanceAuthoritySnapshot",
      evidenceData: {
        type: "IssuanceAuthoritySnapshot",
        digest: PORTAL_ISSUANCE_AUTHORITY_DIGEST,
        resourceId: "demo-patient-001",
      },
    },
  ];
}

/**
 * Compatibility fixture matching the Portal 115e53e direct secured-document
 * profile. It is test-only and deliberately contains no vc wrapper or required
 * top-level JWT iss claim.
 */
export function portalDirectCredentialFixture(
  input: PortalDirectCredentialFixtureInput,
): Record<string, unknown> {
  const now = input.now ?? new Date("2026-07-11T12:00:00.000Z");
  const credentialId =
    "urn:trustcare:vc:portal-compatibility:patient-identity:1";
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      `${input.portalOrigin}/contexts/trustcare-credentials-v1.jsonld`,
    ],
    id: credentialId,
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: input.issuerDid,
    credentialSubject: {
      id: input.holderDid,
      data: {
        documentType: "patient_identity",
        ...portalIssuanceAuthorityFixture(),
        humanDocument: {
          rendererVersion: "trustcare-portable-render-v2",
          renderData: { titleEn: "Patient identity" },
        },
      },
    },
    evidence: portalIssuanceAuthorityEvidenceFixture(credentialId),
    credentialStatus: (["revocation", "suspension"] as const).map(
      (purpose) => {
        const statusListCredential =
          `${input.portalOrigin}/api/credentials/status-lists/` +
          `${encodeURIComponent(input.issuerDid)}/${purpose}`;
        return {
          id: `${statusListCredential}#1`,
          type: "BitstringStatusListEntry",
          statusPurpose: purpose,
          statusListIndex: "1",
          statusListCredential,
        };
      },
    ),
    credentialSchema: {
      id: `${input.portalOrigin}/api/public/wallet-contracts/schema`,
      type: "JsonSchema",
    },
    validFrom: new Date(now.getTime() - 60_000).toISOString(),
    validUntil: new Date(now.getTime() + 86_400_000).toISOString(),
  };
}

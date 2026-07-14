export type PortalDirectCredentialFixtureInput = {
  issuerDid: string;
  holderDid: string;
  portalOrigin: string;
  now?: Date;
};

/**
 * Compatibility fixture matching the Portal 115e53e direct secured-document
 * profile. It is test-only and deliberately contains no vc wrapper or required
 * top-level JWT iss claim.
 */
export function portalDirectCredentialFixture(
  input: PortalDirectCredentialFixtureInput,
): Record<string, unknown> {
  const now = input.now ?? new Date("2026-07-11T12:00:00.000Z");
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      `${input.portalOrigin}/contexts/trustcare-credentials-v1.jsonld`,
    ],
    id: "urn:trustcare:vc:portal-compatibility:patient-identity:1",
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: input.issuerDid,
    credentialSubject: {
      id: input.holderDid,
      data: {
        documentType: "patient_identity",
        humanDocument: {
          rendererVersion: "trustcare-portable-render-v2",
          renderData: { titleEn: "Patient identity" },
        },
      },
    },
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

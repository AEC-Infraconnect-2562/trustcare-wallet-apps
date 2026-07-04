import { describe, expect, it } from "vitest";
import {
  assessLocalReadiness,
  buildContractHubCatalog,
  buildPortalInteroperabilityFixtures,
  demoShlPackages,
  demoWalletCards,
  exportShlPackage,
  exportWalletCard,
  exportWalletObjects,
  extractSelectableFields,
  importWalletExchange,
  isExpired,
  matchCardsForOid4vp,
  parseOid4vcCredentialOffer,
  parseOid4vpRequest,
  parseShlLink,
  parseTrustCareQr,
  sortIdentityFirst,
  getDemoUser,
  getDemoWalletCards,
  walletDemoUsers,
  walletObjectsFromCards
} from "../src";

describe("wallet-core", () => {
  it("sorts identity credentials first", () => {
    const sorted = sortIdentityFirst([...demoWalletCards].reverse());
    expect(sorted[0]?.cardType).toBe("patient_identity");
  });

  it("parses TrustCare VP URLs", () => {
    const parsed = parseTrustCareQr("https://trustcare.example.com/verifier?vp=vp_123");
    expect(parsed.kind).toBe("vp-url");
    expect(parsed.presentationId).toBe("vp_123");
  });

  it("rejects expired QR timestamps", () => {
    expect(isExpired("2026-01-01T00:00:00.000Z", new Date("2026-07-04T00:00:00.000Z"))).toBe(true);
  });

  it("extracts selective disclosure fields while hiding proof-like paths", () => {
    const fields = extractSelectableFields({
      credentialSubject: { patient: { name: "A", nationalId: "123" } },
      proof: { jwt: "secret" }
    });
    expect(fields.map(field => field.path)).toContain("credentialSubject.patient.name");
    expect(fields.some(field => field.path.includes("proof"))).toBe(false);
  });

  it("assesses service readiness for the active Portal patient seed", () => {
    const readiness = assessLocalReadiness(demoWalletCards, "opd_visit");
    expect(readiness.requiredTotal).toBe(3);
    expect(readiness.requiredReady).toBe(3);
    expect(readiness.criticalReady).toBe(true);
    expect(readiness.ready.map(item => item.key)).toContain("allergy");
  });

  it("parses OID4VCI credential offers", () => {
    const offer = {
      credential_issuer: "https://issuer.example",
      credential_configuration_ids: ["PatientSummaryCredential"],
      grants: { "urn:ietf:params:oauth:grant-type:pre-authorized_code": { "pre-authorized_code": "abc" } }
    };
    const parsed = parseOid4vcCredentialOffer(`openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`);
    expect(parsed?.kind).toBe("oid4vci");
    expect(parsed?.issuer).toBe("https://issuer.example");
    expect(parsed?.configurationIds).toContain("PatientSummaryCredential");
  });

  it("parses and matches OID4VP presentation requests", () => {
    const request = {
      response_type: "vp_token",
      client_id: "did:web:verifier.example",
      nonce: "nonce-123",
      presentation_definition: {
        input_descriptors: [
          {
            id: "summary",
            name: "PatientSummaryCredential",
            constraints: { fields: [{ path: ["$.type"], filter: { const: "PatientSummaryCredential" } }] }
          }
        ]
      }
    };
    const parsed = parseOid4vpRequest(JSON.stringify(request));
    expect(parsed?.kind).toBe("oid4vp");
    expect(parsed?.requestedCredentialTypes).toContain("PatientSummaryCredential");
    expect(matchCardsForOid4vp(demoWalletCards, parsed!).map(card => card.cardType)).toContain("patient_summary");
  });

  it("imports and exports SHL, VC, VP and wallet bundles", () => {
    const shlExport = exportShlPackage(demoShlPackages[0]);
    expect(shlExport.ok).toBe(true);
    expect(parseShlLink(shlExport.qrPayload!)).toMatchObject({ kind: "shl" });

    const shlImport = importWalletExchange(shlExport.qrPayload!, demoWalletCards);
    expect(shlImport.object?.type).toBe("shl");

    const vcExport = exportWalletCard(demoWalletCards[0]);
    const vcImport = importWalletExchange(vcExport.data, demoWalletCards);
    expect(vcImport.object?.type).toBe("vc");

    const walletExport = exportWalletObjects(walletObjectsFromCards(demoWalletCards));
    expect(walletExport.data).toContain("TrustCareWalletExport");
  });

  it("builds Contract Hub catalog for all prepare service contexts", () => {
    const hub = buildContractHubCatalog();
    expect(hub.contracts).toHaveLength(7);
    expect(hub.contracts.map(contract => contract.context)).toContain("opd_visit");
    expect(hub.compatibilityRules.join(" ")).toContain("OID4VP");
  });

  it("scopes demo wallet data per login user", () => {
    const somchai = getDemoUser("demo-patient-001");
    const malee = getDemoUser("demo-patient-002");
    const somchaiCards = getDemoWalletCards(somchai.id);
    const maleeCards = getDemoWalletCards(malee.id);

    expect(somchai.nameEn).toBe("Mr. Somchai Jaidee");
    expect(somchai.nameEn).not.toContain("Thanakorn");
    expect(somchaiCards.every(card => card.ownerUserId === somchai.id)).toBe(true);
    expect(maleeCards.every(card => card.ownerUserId === malee.id)).toBe(true);
    expect(new Set([...somchaiCards, ...maleeCards].map(card => card.holderDid)).size).toBe(2);
  });

  it("keeps TrustCare Portal photos separate from wallet-native generated photos", () => {
    const portalUser = getDemoUser("demo-patient-001");
    const nativeUser = getDemoUser("partner-patient-001");

    expect(portalUser.avatarSource).toBe("trustcare_portal");
    expect(portalUser.avatarUrl).toContain("/api/storage-proxy/patient_male_realistic_opt_e9b1630b.jpg");
    expect(nativeUser.avatarSource).toBe("wallet_generated");
    expect(nativeUser.avatarUrl).toBe("assets/users/wallet-native-01.png");
  });

  it("creates Portal interoperability fixtures for wallet-native users", () => {
    const nativeUser = walletDemoUsers.find(user => user.id === "partner-patient-001")!;
    const fixtures = buildPortalInteroperabilityFixtures(nativeUser.id, "https://wallet.example");
    const offer = parseOid4vcCredentialOffer(fixtures.credentialOfferUrl);
    const request = parseOid4vpRequest(fixtures.presentationRequestUrl);

    expect(fixtures.scope.ownerUserId).toBe(nativeUser.id);
    expect(offer?.kind).toBe("oid4vci");
    expect(request?.kind).toBe("oid4vp");
    expect(request?.requestedCredentialTypes.length).toBeGreaterThan(0);
  });
});

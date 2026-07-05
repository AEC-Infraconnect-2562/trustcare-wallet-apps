import { describe, expect, it } from "vitest";
import {
  assessLocalReadiness,
  buildContractHubCatalog,
  buildPortalInteroperabilityFixtures,
  createDemoCheckinQr,
  createDemoShlKey,
  createShlLinkPayload,
  createShlViewerUrl,
  createTrustCareShlGatewayPublication,
  completeWalletSeedCards,
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

  it("uses credential allowlists for selective disclosure without exposing renderer metadata", () => {
    const fields = extractSelectableFields({
      issuer: { name: "TrustCare" },
      validUntil: "2027-01-01T00:00:00.000Z",
      credentialSubject: {
        patient: { fullNameTh: "นายทดสอบ", phone: "081-000-0000" },
        appointment: { start: "2026-08-12T02:00:00.000Z", status: "booked" },
        display: { watermark: "DEMO ONLY" },
        audit: { sourceSystem: "EHR" }
      },
      trustcare: {
        selectiveDisclosureRecommendedFields: [
          "credentialSubject.patient.fullNameTh",
          "credentialSubject.appointment.start",
          "issuer",
          "validUntil",
          "credentialSubject.display.watermark",
          "credentialSubject.audit.sourceSystem"
        ]
      }
    });

    expect(fields.map(field => field.path)).toEqual([
      "credentialSubject.patient.fullNameTh",
      "credentialSubject.appointment.start"
    ]);
  });

  it("limits selective disclosure to holder claims and excludes technical VC properties", () => {
    const cards = [...demoWalletCards, ...completeWalletSeedCards];
    const forbiddenFragments = [
      "@context",
      "issuer",
      "proof",
      "evidence",
      "credentialStatus",
      "documentReference",
      "humanDocument",
      "watermark",
      "trustcare",
      "display",
      "source",
      "metadata",
      "provenance",
      "jwt",
      "base64",
      "photo"
    ];

    for (const card of cards) {
      const fields = extractSelectableFields(card.credentialData);
      expect(fields.length, String(card.id)).toBeGreaterThan(0);
      expect(fields.every(field => field.path.startsWith("credentialSubject.")), String(card.id)).toBe(true);
      for (const fragment of forbiddenFragments) {
        expect(
          fields.some(field => field.path.toLowerCase().includes(fragment.toLowerCase())),
          `${card.id}:${fragment}`
        ).toBe(false);
      }
    }
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

  it("imports standard SHL without requiring TrustCare Manifest VP/VC", () => {
    const standardShl = "shlink:/eyJ1cmwiOiJodHRwczovL2V4YW1wbGUub3JnL3NobCIsImsiOiJzaGwtZXhhbXBsZS1rZXkiLCJmbGFncyI6IkxQIn0";
    const parsed = parseShlLink(standardShl);
    const imported = importWalletExchange(standardShl, demoWalletCards);

    expect(parsed?.url).toBe("https://example.org/shl");
    expect(imported.ok).toBe(true);
    expect(imported.object?.type).toBe("shl");
    expect((imported.object?.payload as any).canonicalShlUrl).toBe(standardShl);
    expect((imported.object?.payload as any).manifestUrl).toBe("https://example.org/shl");
    expect((imported.object?.payload as any).manifestCredentialId).toContain("pending:trustcare:vc:shl-manifest");
    expect((imported.object?.payload as any).presentationId).toContain("pending:trustcare:vp:shl-manifest");
    expect((imported.object?.payload as any).trustcareCertification.status).toBe("pending_maker_checker");
    expect((imported.object?.payload as any).documentBundle.bindingModel).toContain("Standard SHL");
    expect((imported.object?.payload as any).qrPayload).toBe(standardShl);
  });

  it("keeps SHL passcodes out of QR payloads and parses web viewer fragments", () => {
    const expiresAt = "2026-07-07T08:00:00.000Z";
    const shl = createShlLinkPayload({
      url: "https://example.org/manifest",
      key: createDemoShlKey("unit-test"),
      label: "Unit test SHL",
      flag: "L",
      passcodeRequired: true,
      expiresAt,
      version: 1
    });
    const viewer = createShlViewerUrl("https://wallet.example/viewer", shl);
    const parsed = parseShlLink(viewer);
    const decodedPayload = JSON.parse(Buffer.from(shl.slice("shlink:/".length), "base64url").toString("utf8"));

    expect(parsed?.raw).toBe(shl);
    expect(parsed?.passcodeRequired).toBe(true);
    expect(parsed?.flag).toContain("P");
    expect(decodedPayload.passcode).toBeUndefined();
    expect(decodedPayload.passcodeRequired).toBeUndefined();
    expect(decodedPayload.flag).toContain("P");
  });

  it("creates check-in SHL QR as a web viewer URL while retaining canonical shlink", () => {
    const checkin = createDemoCheckinQr("opd_visit", 3, { passcodeRequired: true });
    const parsedQr = parseTrustCareQr(checkin.qrPayload);

    expect(checkin.shlUrl.startsWith("shlink:/")).toBe(true);
    expect(checkin.canonicalShlUrl).toBe(checkin.shlUrl);
    expect(checkin.qrPayload).toContain("#shlink:/");
    expect(parsedQr.kind).toBe("shlink");
    expect(parsedQr.token).toBe(checkin.shlUrl);
  });

  it("publishes production-shaped SHL gateway metadata without embedding passcodes in QR", () => {
    const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 3);
    const publication = createTrustCareShlGatewayPublication({
      context: "cross_border",
      ownerUserId: "demo-patient-complete-001",
      patientId: 6501001001,
      cards,
      selectedCardIds: cards.map(card => card.id),
      origin: "https://wallet.example",
      gatewayBaseUrl: "https://portal.example/api/shl",
      includeTrustCareManifestVp: true,
      policy: {
        expiresAt: "2026-07-10T00:00:00.000Z",
        maxAccessCount: 3,
        passcodeRequired: true,
        passcodeHint: "****",
        accessCodeDelivery: "separate_channel"
      }
    });
    const decodedPayload = JSON.parse(Buffer.from(publication.canonicalShlUrl!.slice("shlink:/".length), "base64url").toString("utf8"));

    expect(publication.gatewayMode).toBe("portal_backend");
    expect(publication.storageProvider).toBe("s3");
    expect(publication.manifestUrl).toContain("https://portal.example/api/shl/manifests/");
    expect(publication.qrPayload).toContain("#shlink:/");
    expect(decodedPayload.flag).toContain("P");
    expect(JSON.stringify(decodedPayload)).not.toContain("****");
    expect(publication.manifest.documentBundle.bindingModel).toBe("standard_shl_plus_trustcare_manifest_vp");
    expect(publication.manifest.documentBundle.documents).toHaveLength(cards.length);
    expect(publication.manifest.documentBundle.documents.every(document => document.fhirResource)).toBe(true);
    expect(publication.portalRequest.endpoint).toBe("POST /api/wallet/shl-packages");
    expect(JSON.stringify(publication.portalRequest)).toContain("s3://trustcare-shl");
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

  it("keeps Thai issuer names as the primary credential display label", () => {
    for (const user of walletDemoUsers) {
      for (const card of getDemoWalletCards(user.id)) {
        const issuer = card.credentialData?.issuer as Record<string, unknown> | undefined;
        const message = String(card.id);
        expect(card.issuerHospitalName, message).toMatch(/[ก-๙]/);
        expect(card.issuerHospitalName, message).toBe(issuer?.nameTh);
        if (typeof issuer?.name === "string" && issuer.name !== issuer.nameTh) {
          expect(card.issuerHospitalName, message).not.toBe(issuer.name);
        }
      }
    }
  });

  it("keeps TrustCare Portal photos separate from wallet-native generated photos", () => {
    const portalUser = getDemoUser("demo-patient-001");
    const nativeUser = getDemoUser("partner-patient-001");

    expect(portalUser.avatarSource).toBe("trustcare_portal");
    expect(portalUser.avatarUrl).toContain("/api/storage-proxy/patient_male_realistic_opt_e9b1630b.jpg");
    expect(nativeUser.avatarSource).toBe("wallet_generated");
    expect(nativeUser.avatarUrl).toBe("assets/users/wallet-native-02.png");
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

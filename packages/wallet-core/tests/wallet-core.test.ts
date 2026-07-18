import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  assessLocalReadiness,
  buildContractHubCatalog,
  buildPortalInteroperabilityFixtures,
  createDemoCheckinQr,
  createShlContentKey,
  createShlLinkPayload,
  createShlViewerUrl,
  createTrustCareShlGatewayPublication,
  buildIpsDocumentBundle,
  buildSharePackage,
  buildDocumentRequestPlan,
  createAutomaticDocumentRequestDraft,
  createDocumentRequestDraft,
  buildMissingDocumentCards,
  buildPurposePickerCards,
  buildReadinessSummary,
  detectImportPayload,
  classifyQrPayload,
  documentReferenceFromCard,
  getDisabledReason,
  recommendSharePacket,
  normalizeDocumentType,
  validateDocumentReference,
  canonicalServiceProfiles,
  CANONICAL_DOCUMENT_CATEGORIES,
  CANONICAL_DOCUMENT_TYPES,
  completeWalletSeedCards,
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
  fetchShlManifest,
  getDemoShlPackages,
  sortIdentityFirst,
  getDemoUser,
  getDemoWalletCards,
  walletDemoUsers,
  walletObjectsFromCards,
} from "../src";

describe("wallet-core", () => {
  it("sorts identity credentials first", () => {
    const sorted = sortIdentityFirst([...demoWalletCards].reverse());
    expect(sorted[0]?.cardType).toBe("patient_identity");
  });

  it("parses TrustCare VP URLs", () => {
    const parsed = parseTrustCareQr(
      "https://trustcare.example.com/verifier?vp=vp_123",
    );
    expect(parsed.kind).toBe("vp-url");
    expect(parsed.presentationId).toBe("vp_123");
  });

  it("rejects expired QR timestamps", () => {
    expect(
      isExpired(
        "2026-01-01T00:00:00.000Z",
        new Date("2026-07-04T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("extracts selective disclosure fields while hiding proof-like paths", () => {
    const fields = extractSelectableFields({
      credentialSubject: { patient: { name: "A", nationalId: "123" } },
      proof: { jwt: "secret" },
    });
    expect(fields.map((field) => field.path)).toContain(
      "credentialSubject.patient.name",
    );
    expect(fields.some((field) => field.path.includes("proof"))).toBe(false);
  });

  it("uses credential allowlists for selective disclosure without exposing renderer metadata", () => {
    const fields = extractSelectableFields({
      issuer: { name: "TrustCare" },
      validUntil: "2027-01-01T00:00:00.000Z",
      credentialSubject: {
        patient: { fullNameTh: "นายทดสอบ", phone: "081-000-0000" },
        appointment: { start: "2026-08-12T02:00:00.000Z", status: "booked" },
        display: { watermark: "DEMO ONLY" },
        audit: { sourceSystem: "EHR" },
      },
      trustcare: {
        selectiveDisclosureRecommendedFields: [
          "credentialSubject.patient.fullNameTh",
          "credentialSubject.appointment.start",
          "issuer",
          "validUntil",
          "credentialSubject.display.watermark",
          "credentialSubject.audit.sourceSystem",
        ],
      },
    });

    expect(fields.map((field) => field.path)).toEqual([
      "credentialSubject.patient.fullNameTh",
      "credentialSubject.appointment.start",
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
      "photo",
    ];

    for (const card of cards) {
      const fields = extractSelectableFields(card.credentialData);
      expect(fields.length, String(card.id)).toBeGreaterThan(0);
      expect(
        fields.every((field) => field.path.startsWith("credentialSubject.")),
        String(card.id),
      ).toBe(true);
      for (const fragment of forbiddenFragments) {
        expect(
          fields.some((field) =>
            field.path.toLowerCase().includes(fragment.toLowerCase()),
          ),
          `${card.id}:${fragment}`,
        ).toBe(false);
      }
    }
  });

  it("assesses service readiness for the active Portal patient seed", () => {
    const readiness = assessLocalReadiness(demoWalletCards, "opd_visit");
    expect(readiness.requiredTotal).toBe(3);
    expect(readiness.requiredReady).toBe(3);
    expect(readiness.criticalReady).toBe(true);
    expect(readiness.ready.map((item) => item.key)).toContain("allergy");
  });

  it("parses OID4VCI credential offers", () => {
    const offer = {
      credential_issuer: "https://issuer.example",
      credential_configuration_ids: ["PatientSummaryCredential"],
      grants: {
        "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
          "pre-authorized_code": "abc",
        },
      },
    };
    const parsed = parseOid4vcCredentialOffer(
      `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`,
    );
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
            constraints: {
              fields: [
                {
                  path: ["$.type"],
                  filter: { const: "PatientSummaryCredential" },
                },
              ],
            },
          },
        ],
      },
    };
    const parsed = parseOid4vpRequest(JSON.stringify(request));
    expect(parsed?.kind).toBe("oid4vp");
    expect(parsed?.requestedCredentialTypes).toContain(
      "PatientSummaryCredential",
    );
    expect(
      matchCardsForOid4vp(demoWalletCards, parsed!).map(
        (card) => card.cardType,
      ),
    ).toContain("patient_summary");
  });

  it("imports and exports SHL, VC, VP and wallet bundles", () => {
    const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 1);
    const packageToExport = createTrustCareShlGatewayPublication({
      context: "opd_visit",
      ownerUserId: "demo-patient-complete-001",
      cards,
      selectedCardIds: cards.map((card) => card.id),
      gatewayBaseUrl: "https://portal.example/api/shl",
    });
    const shlExport = exportShlPackage({
      ...packageToExport,
      id: 1,
    });
    expect(shlExport.ok).toBe(true);
    expect(parseShlLink(shlExport.qrPayload!)).toMatchObject({ kind: "shl" });

    const shlImport = importWalletExchange(
      shlExport.qrPayload!,
      demoWalletCards,
    );
    expect(shlImport.object?.type).toBe("shl");

    const vcExport = exportWalletCard(demoWalletCards[0]);
    const vcImport = importWalletExchange(vcExport.data, demoWalletCards);
    expect(vcImport.object?.type).toBe("vc");

    const walletExport = exportWalletObjects(
      walletObjectsFromCards(demoWalletCards),
    );
    expect(walletExport.data).toContain("TrustCareWalletExport");
  });

  it("imports standard SHL without requiring TrustCare certification artifacts", () => {
    const standardShl =
      "shlink:/eyJ1cmwiOiJodHRwczovL2V4YW1wbGUub3JnL3NobCIsImsiOiJzaGwtZXhhbXBsZS1rZXkiLCJmbGFncyI6IkxQIn0";
    const parsed = parseShlLink(standardShl);
    const imported = importWalletExchange(standardShl, demoWalletCards);

    expect(parsed?.url).toBe("https://example.org/shl");
    expect(imported.ok).toBe(true);
    expect(imported.object?.type).toBe("shl");
    expect((imported.object?.payload as any).canonicalShlUrl).toBe(standardShl);
    expect((imported.object?.payload as any).manifestUrl).toBe(
      "https://example.org/shl",
    );
    expect(
      (imported.object?.payload as any).manifestCredentialId,
    ).toBeUndefined();
    expect((imported.object?.payload as any).presentationId).toBeUndefined();
    expect(
      (imported.object?.payload as any).trustcareCertification.status,
    ).toBe("pending_maker_checker");
    expect(
      (imported.object?.payload as any).documentBundle.bindingModel,
    ).toContain("transport-valid");
    expect((imported.object?.payload as any).qrPayload).toBe(standardShl);
  });

  it("keeps SHL passcodes out of QR payloads and parses web viewer fragments", () => {
    const expiresAt = "2026-07-07T08:00:00.000Z";
    const shl = createShlLinkPayload({
      url: `https://example.org/s/${"a".repeat(43)}`,
      key: createShlContentKey(),
      label: "Unit test SHL",
      flag: "L",
      passcodeRequired: true,
      expiresAt,
      version: 1,
    });
    const viewer = createShlViewerUrl("https://wallet.example/viewer", shl);
    const parsed = parseShlLink(viewer);
    const decodedPayload = JSON.parse(
      Buffer.from(shl.slice("shlink:/".length), "base64url").toString("utf8"),
    );

    expect(parsed?.raw).toBe(shl);
    expect(parsed?.passcodeRequired).toBe(true);
    expect(parsed?.flag).toContain("P");
    expect(decodedPayload.passcode).toBeUndefined();
    expect(decodedPayload.passcodeRequired).toBeUndefined();
    expect(decodedPayload.flag).toContain("P");
  });

  it("creates check-in SHL QR as the canonical shlink", () => {
    const checkin = createDemoCheckinQr("opd_visit", 3, {
      passcodeRequired: true,
    });
    const parsedQr = parseTrustCareQr(checkin.qrPayload);

    expect(checkin.shlUrl.startsWith("shlink:/")).toBe(true);
    expect(checkin.canonicalShlUrl).toBe(checkin.shlUrl);
    expect(checkin.qrPayload).toBe(checkin.shlUrl);
    expect(parsedQr.kind).toBe("shlink");
    expect(parsedQr.token).toBe(checkin.shlUrl);
  });

  it("publishes production-shaped SHL gateway metadata without embedding passcodes in QR", () => {
    const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 3);
    const publication = createTrustCareShlGatewayPublication({
      context: "cross_border",
      ownerUserId: "demo-patient-complete-001",
      cards,
      selectedCardIds: cards.map((card) => card.id),
      origin: "https://wallet.example",
      gatewayBaseUrl: "https://portal.example/api/shl",
      requestHospitalCertification: true,
      policy: {
        expiresAt: "2026-07-10T00:00:00.000Z",
        maxAccessCount: 3,
        passcodeRequired: true,
        passcodeHint: "****",
        accessCodeDelivery: "separate_channel",
      },
    });
    const decodedPayload = JSON.parse(
      Buffer.from(
        publication.canonicalShlUrl!.slice("shlink:/".length),
        "base64url",
      ).toString("utf8"),
    );

    expect(publication.gatewayMode).toBe("portal_backend");
    expect(publication.storageProvider).toBe("s3");
    expect(publication.manifestUrl).toMatch(
      /^https:\/\/portal\.example\/s\/[A-Za-z0-9_-]{43}$/,
    );
    expect(publication.qrPayload).toBe(publication.canonicalShlUrl);
    expect(decodedPayload.flag).toContain("P");
    expect(JSON.stringify(decodedPayload)).not.toContain("****");
    expect(publication.manifest.documentBundle.bindingModel).toBe(
      "hospital_certification_pending",
    );
    expect(publication.manifest.documentBundle.documents).toHaveLength(
      cards.length,
    );
    expect(
      publication.manifest.documentBundle.documents.every(
        (document) => document.fhirResource,
      ),
    ).toBe(true);
    expect(JSON.stringify(publication)).not.toContain("patientId");
    expect(publication.trustLayerStatus).toBe(
      "pending_hospital_certification",
    );
    expect(publication.manifest.trustcare.makerCheckerStatus).toBe(
      "pending_maker_checker",
    );
    expect(
      publication.manifest.files.every(
        (file) => "location" in file || "embedded" in file,
      ),
    ).toBe(true);
    expect(JSON.stringify(publication.manifest)).not.toContain(
      "pending:trustcare",
    );
  });

  it("keeps canonical service profiles free of legacy aliases and trust artifacts", () => {
    const canonical = new Set(CANONICAL_DOCUMENT_TYPES);
    for (const profile of Object.values(canonicalServiceProfiles)) {
      for (const requirement of profile.requirements) {
        expect(
          requirement.documentTypes.every((type) => canonical.has(type)),
        ).toBe(true);
        expect(requirement.documentTypes).not.toContain("shl_manifest");
        expect(requirement.documentTypes).not.toContain("sync_receipt");
      }
    }
  });

  it("plans missing-document requests with format and source guardrails", () => {
    const coverageRequirement =
      canonicalServiceProfiles.opd_visit.requirements.find(
        (item) => item.key === "coverage",
      )!;
    const plan = buildDocumentRequestPlan({
      context: "opd_visit",
      requirements: [coverageRequirement],
      source: "patient_upload",
      format: "certified_shl_package",
      scope: "single_document",
    });

    expect(
      plan.sourceOptions.find((option) => option.id === "payer")?.enabled,
    ).toBe(true);
    expect(
      plan.formatOptions.find(
        (option) => option.id === "certified_shl_package",
      )?.enabled,
    ).toBe(false);
    expect(
      plan.formatOptions.find((option) => option.id === "vc_vp")?.enabled,
    ).toBe(false);
    expect(plan.selectedFormat).toBe("pdf_image");
    expect(plan.controls.manualFileUpload).toBe(true);
    expect(plan.trustPolicy).toBe("patient_provided_unverified");
  });

  it("keeps patient uploads as unverified DocumentReference imports", () => {
    const allergyRequirement =
      canonicalServiceProfiles.opd_visit.requirements.find(
        (item) => item.key === "allergy",
      )!;
    const draft = createDocumentRequestDraft({
      context: "opd_visit",
      requirements: [allergyRequirement],
      source: "patient_upload",
      format: "pdf_image",
      scope: "single_document",
      patientId: 9501,
    });

    expect(draft.returnChannel).toBe("manual_upload");
    expect(draft.trustPolicy).toBe("patient_provided_unverified");
    expect(draft.requestedDocumentTypes).toContain("allergy_alert");
    expect(draft.nextSteps.join(" ")).toContain("DocumentReference");
  });

  it("normalizes incompatible document request drafts instead of preserving invalid fallbacks", () => {
    const requirement = canonicalServiceProfiles.opd_visit.requirements.find(
      (item) => item.key === "allergy",
    )!;
    const draft = createDocumentRequestDraft({
      context: "opd_visit",
      requirements: [requirement],
      source: "patient_upload",
      format: "certified_shl_package",
      scope: "single_document",
      patientId: 9501,
      returnChannel: "shl_link",
    });

    expect(draft.source).toBe("patient_upload");
    expect(draft.format).toBe("pdf_image");
    expect(draft.returnChannel).toBe("manual_upload");
    expect(draft.destinationLabel).toContain("นำเข้าเอง");
    expect(draft.formatLabel).toContain("PDF");
  });

  it("selects a missing-document route automatically from the semantic requirement", () => {
    const requirement = canonicalServiceProfiles.opd_visit.requirements.find(
      (item) => item.key === "allergy",
    )!;
    const draft = createAutomaticDocumentRequestDraft({
      context: "opd_visit",
      requirements: [requirement],
      patientId: 9501,
    });

    expect(draft.routeSelection).toBe("automatic");
    expect(draft.source).toBe("connected_fhir");
    expect(draft.format).toBe("fhir_document_reference");
    expect(draft.returnChannel).toBe("fhir_pull");
    expect(draft.scope).toBe("single_document");
  });

  it("routes payer documents through the payer exchange without a patient format choice", () => {
    const requirement = canonicalServiceProfiles.opd_visit.requirements.find(
      (item) => item.key === "coverage",
    )!;
    const draft = createAutomaticDocumentRequestDraft({
      context: "opd_visit",
      requirements: [requirement],
      patientId: 9501,
    });

    expect(draft.routeSelection).toBe("automatic");
    expect(draft.source).toBe("payer");
    expect(draft.format).toBe("vc_vp");
    expect(draft.returnChannel).toBe("payer_exchange");
    expect(draft.trustPolicy).toBe("issuer_signed");
  });

  it("enables SHL policy controls only for SHL formats", () => {
    const requirements = canonicalServiceProfiles.referral.requirements.slice(
      0,
      3,
    );
    const certifiedPlan = buildDocumentRequestPlan({
      context: "referral",
      requirements,
      source: "trustcare_portal",
      format: "certified_shl_package",
      scope: "document_bundle",
    });
    const vpPlan = buildDocumentRequestPlan({
      context: "referral",
      requirements,
      source: "trustcare_portal",
      format: "vc_vp",
      scope: "document_bundle",
    });

    expect(certifiedPlan.controls.shlAccessPolicy).toBe(true);
    expect(certifiedPlan.controls.trustCareCertification).toBe(true);
    expect(vpPlan.controls.shlAccessPolicy).toBe(false);
    expect(vpPlan.controls.selectiveDisclosure).toBe(true);
  });

  it("keeps all wallet seed cards canonical with VC-like payloads and DocumentReference evidence", () => {
    const canonicalTypes = new Set<string>(CANONICAL_DOCUMENT_TYPES);
    const canonicalCategories = new Set<string>(CANONICAL_DOCUMENT_CATEGORIES);
    const seedCards = [
      ...completeWalletSeedCards,
      ...walletDemoUsers.flatMap((user) => getDemoWalletCards(user.id)),
    ];

    for (const card of seedCards) {
      const credential = card.credentialData as any;
      const evidence = Array.isArray(credential?.evidence)
        ? credential.evidence
        : [];
      const documentReferences = evidence
        .map((item: any) => item?.resource ?? item?.documentReference)
        .filter((item: any) => item?.resourceType === "DocumentReference");

      expect(
        canonicalTypes.has(card.cardType),
        `cardType:${card.id}:${card.cardType}`,
      ).toBe(true);
      expect(
        canonicalCategories.has(card.documentCategory),
        `category:${card.id}:${card.documentCategory}`,
      ).toBe(true);
      expect(credential?.credentialSubject, `subject:${card.id}`).toBeTruthy();
      expect(
        JSON.stringify(credential?.type ?? ""),
        `vc-type:${card.id}`,
      ).toContain("VerifiableCredential");
      expect(
        documentReferences.length,
        `document-reference:${card.id}`,
      ).toBeGreaterThan(0);
      expect(
        documentReferences[0]?.content?.length ?? 0,
        `document-reference-content:${card.id}`,
      ).toBeGreaterThan(0);
    }
  });

  it("normalizes only known document aliases and rejects service-profile names as document types", () => {
    expect(normalizeDocumentType("patient_id")).toBe("patient_identity");
    expect(normalizeDocumentType("identity")).toBe("patient_identity");
    expect(normalizeDocumentType("patient_outbound")).toBeNull();
    expect(normalizeDocumentType("opd_readiness_bundle")).toBeNull();
  });

  it("rejects static demo SHL seed packages without a Portal gateway", async () => {
    const shlPackages = walletDemoUsers.flatMap((user) =>
      getDemoShlPackages(user.id),
    );

    for (const shl of shlPackages) {
      const qrPayload = shl.qrPayload ?? shl.shlUrl ?? shl.canonicalShlUrl;
      expect(JSON.stringify(shl), String(shl.id)).not.toContain(
        "pending:trustcare",
      );
      expect(shl.canonicalShlUrl ?? shl.shlUrl, String(shl.id)).toMatch(
        /^shlink:\//,
      );
      expect(qrPayload, String(shl.id)).toBeTruthy();
      expect(parseShlLink(qrPayload!)?.kind, String(shl.id)).toBe("shl");
      const fetched = await fetchShlManifest(qrPayload!);
      expect(fetched.ok, String(shl.id)).toBe(false);
      expect(fetched.errors.length, String(shl.id)).toBeGreaterThan(0);
      if (
        (shl as any).manifest?.trustcare?.trustLayerStatus === "standard_shl"
      ) {
        expect(shl.manifestCredentialId, String(shl.id)).toBeUndefined();
        expect(shl.holderPresentationJwt, String(shl.id)).toBeUndefined();
      }
    }
  });

  it("builds exactly one share package and requires an explicit Portal SHL gateway", async () => {
    const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 4);
    const vp = buildSharePackage({
      mode: "PurposeVP",
      context: "opd_visit",
      cards,
      selectedCardIds: cards.slice(0, 2).map((card) => card.id),
      recipient: "TrustCare demo verifier",
      origin: "https://wallet.example",
      gatewayBaseUrl: "https://wallet.example/api/share-gateway",
    });
    expect(vp.mode).toBe("PurposeVP");
    expect("presentation" in vp).toBe(true);
    expect(JSON.stringify(vp.payload)).not.toContain("ServiceBundleEnvelope");
    if ("presentation" in vp) {
      const classified = classifyQrPayload(vp.presentation.qrData);
      expect(classified.kind).toBe("vp_resolver");
      expect(classified.verifierResolvable).toBe(true);
      expect(classified.productionResolvable).toBe(true);
      expect(vp.presentation.qrData).toContain("/presentations/");
      expect(JSON.stringify(vp)).not.toContain("tc_payload");
    }

    const shl = buildSharePackage({
      mode: "CertifiedSHLPackage",
      context: "referral",
      cards,
      selectedCardIds: cards.map((card) => card.id),
      recipient: "TrustCare referral verifier",
      origin: "https://wallet.example",
      gatewayBaseUrl: "https://portal.example/api/shl",
      shlPolicy: { maxAccessCount: 3 },
    });
    expect(shl.mode).toBe("CertifiedSHLPackage");
    expect("shl" in shl).toBe(true);
    if ("shl" in shl) {
      expect(shl.shl.qrPayload.length).toBeLessThan(2000);
      await expect(QRCode.toDataURL(shl.shl.qrPayload)).resolves.toContain(
        "data:image/png;base64,",
      );
      expect(shl.shl.gatewayMode).toBe("portal_backend");
      expect(shl.shl.gatewayBaseUrl).toBe("https://portal.example/api/shl");
      expect(shl.shl.manifestUrl).toMatch(
        /^https:\/\/portal\.example\/s\/[A-Za-z0-9_-]{43}$/,
      );
      expect(shl.shl.trustLayerStatus).toBe("pending_hospital_certification");
    }
  });

  it("models patient summary records as MHD DocumentReference plus IPS document Bundle", () => {
    const cards = getDemoWalletCards("demo-patient-complete-001");
    const patientSummary = cards.find(
      (card) => card.cardType === "patient_summary",
    );
    expect(patientSummary).toBeTruthy();

    const documentReference = documentReferenceFromCard(patientSummary!);
    const validation = validateDocumentReference(documentReference);
    const ipsBundle = buildIpsDocumentBundle({
      id: "ips-test",
      subjectId: patientSummary!.holderDid,
      author: patientSummary!.issuerHospitalName,
      timestamp: patientSummary!.issuedAt ?? patientSummary!.createdAt,
      cards: [patientSummary!],
    });

    expect(validation.ok).toBe(true);
    expect(documentReference.resourceType).toBe("DocumentReference");
    expect(documentReference.content.length).toBeGreaterThan(0);
    expect(ipsBundle.resourceType).toBe("Bundle");
    expect(ipsBundle.type).toBe("document");
    expect(ipsBundle.entry[0]?.resource?.resourceType).toBe("Composition");
    expect(JSON.stringify(ipsBundle.entry)).toContain("DocumentReference");
  });

  it("builds Contract Hub catalog for all prepare service contexts", () => {
    const hub = buildContractHubCatalog();
    expect(hub.contracts).toHaveLength(7);
    expect(hub.contracts.map((contract) => contract.context)).toContain(
      "opd_visit",
    );
    expect(hub.compatibilityRules.join(" ")).toContain("OID4VP");
  });

  it("scopes demo wallet data per login user", () => {
    const somchai = getDemoUser("demo-patient-001");
    const malee = getDemoUser("demo-patient-002");
    const somchaiCards = getDemoWalletCards(somchai.id);
    const maleeCards = getDemoWalletCards(malee.id);

    expect(somchai.nameEn).toBe("Mr. Somchai Jaidee");
    expect(somchai.nameEn).not.toContain("Thanakorn");
    expect(somchaiCards.every((card) => card.ownerUserId === somchai.id)).toBe(
      true,
    );
    expect(maleeCards.every((card) => card.ownerUserId === malee.id)).toBe(
      true,
    );
    expect(
      new Set([...somchaiCards, ...maleeCards].map((card) => card.holderDid))
        .size,
    ).toBe(2);
  });

  it("keeps Thai issuer names as the primary credential display label", () => {
    for (const user of walletDemoUsers) {
      for (const card of getDemoWalletCards(user.id)) {
        const issuer = card.credentialData?.issuer as
          Record<string, unknown> | undefined;
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
    expect(portalUser.avatarUrl).toContain(
      "https://trustcare-hospital-network-production.up.railway.app/manus-storage/",
    );
    expect(portalUser.avatarUrl).toContain("patient_somsak");
    expect(nativeUser.avatarSource).toBe("wallet_generated");
    expect(nativeUser.avatarUrl).toBe("assets/users/wallet-native-02.png");
  });

  it("creates Portal interoperability fixtures for wallet-native users", () => {
    const nativeUser = walletDemoUsers.find(
      (user) => user.id === "partner-patient-001",
    )!;
    const fixtures = buildPortalInteroperabilityFixtures(
      nativeUser.id,
      "https://wallet.example",
    );
    const offer = parseOid4vcCredentialOffer(fixtures.credentialOfferUrl);
    const request = parseOid4vpRequest(fixtures.presentationRequestUrl);

    expect(fixtures.scope.ownerUserId).toBe(nativeUser.id);
    expect(offer?.kind).toBe("oid4vci");
    expect(request?.kind).toBe("oid4vp");
    expect(request?.requestedCredentialTypes.length).toBeGreaterThan(0);
  });

  it("provides human disabled reasons with fixes for blocked actions", () => {
    const noSelection = getDisabledReason({
      action: "create_share_package",
      packageMode: "PurposeVP",
      selectedDocumentCount: 0,
      shareGatewayReady: true,
    });
    const noGateway = getDisabledReason({
      action: "create_share_package",
      packageMode: "PurposeVP",
      selectedDocumentCount: 1,
      shareGatewayReady: false,
    });
    const noPasscode = getDisabledReason({
      action: "create_share_package",
      packageMode: "StandardSHL",
      selectedDocumentCount: 3,
      shlPasscodeRequired: true,
      shlPasscodeReady: false,
    });

    expect(noSelection?.reason).toContain("ยังไม่ได้เลือกเอกสาร");
    expect(noSelection?.fix).toContain("เลือกเอกสาร");
    expect(noGateway?.fix).toContain("Share Gateway");
    expect(noPasscode?.fix).toContain("PIN");
    expect(noPasscode?.ariaLabel).toContain("วิธีแก้");
  });

  it("recommends VP for OPD/pharmacy and certified SHL for large TrustCare service bundles", () => {
    const opd = recommendSharePacket({
      context: "opd_visit",
      selectedDocumentTypes: ["patient_identity", "allergy_alert"],
      selectedCount: 2,
      trustcareCertificationAvailable: true,
    });
    const pharmacy = recommendSharePacket({
      context: "pharmacy_dispense",
      selectedDocumentTypes: ["patient_identity", "prescription"],
      selectedCount: 2,
      trustcareCertificationAvailable: true,
    });
    const referral = recommendSharePacket({
      context: "referral",
      selectedDocumentTypes: [
        "patient_identity",
        "referral_vc",
        "patient_summary",
        "lab_result",
      ],
      selectedCount: 4,
      hasLargeRecordSet: true,
      trustcareCertificationAvailable: true,
    });
    const fallback = recommendSharePacket({
      context: "cross_border",
      selectedDocumentTypes: [
        "patient_identity",
        "patient_summary",
        "lab_result",
      ],
      selectedCount: 3,
      hasLargeRecordSet: true,
      trustcareCertificationAvailable: false,
    });

    expect(opd.mode).toBe("PurposeVP");
    expect(pharmacy.mode).toBe("PurposeVP");
    expect(referral.mode).toBe("CertifiedSHLPackage");
    expect(fallback.mode).toBe("StandardSHL");
    expect(fallback.warnings.join(" ")).toContain("Manifest Credential");
  });

  it("builds Thai-first purpose and readiness UX models with accessibility labels", () => {
    const readiness = assessLocalReadiness(
      getDemoWalletCards("demo-patient-complete-001"),
      "opd_visit",
    );
    const summary = buildReadinessSummary(readiness);
    const purposeCards = buildPurposePickerCards("opd_visit");
    const missingCards = buildMissingDocumentCards(
      "opd_visit",
      readiness.missing,
    );

    expect(summary.requiredText).toContain("จำเป็น");
    expect(summary.primaryCtaLabel).toBe("ไปหน้าแชร์เอกสาร");
    expect(
      purposeCards.find((card) => card.context === "opd_visit")?.ariaLabel,
    ).toContain("OPD");
    expect(
      purposeCards.every((card) => card.ariaLabel.length > card.label.length),
    ).toBe(true);
    expect(missingCards.every((card) => card.ariaLabel.length > 0)).toBe(true);
  });

  it("detects import payload states with patient-friendly labels", () => {
    const shl = detectImportPayload("shlink:/abc");
    const offer = detectImportPayload(
      "openid-credential-offer://?credential_offer_uri=https://issuer.example/offer",
    );
    const fhir = detectImportPayload(
      JSON.stringify({ resourceType: "DocumentReference", status: "current" }),
    );
    const unknown = detectImportPayload("not-a-supported-payload");

    expect(shl.formatLabel).toContain("SMART Health Link");
    expect(shl.trustLabel).toContain("อ่านได้");
    expect(offer.recommendedAction).toContain("credential offer");
    expect(fhir.trustLabel).toContain("รอตรวจสอบ");
    expect(unknown.canImport).toBe(false);
    expect(unknown.trustLabel).toContain("ไม่รู้จักรูปแบบ");
  });
});

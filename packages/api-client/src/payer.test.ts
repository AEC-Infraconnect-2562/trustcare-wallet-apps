import { describe, expect, it, vi } from "vitest";
import * as authBrokerApi from "./authBroker";
import * as payerApi from "./payer";

describe("payer API facade", () => {
  const options = {
    url: "https://wallet.example/trpc",
    demoMode: true,
    userId: "demo-patient-complete-001",
  } satisfies payerApi.PayerApiOptions;

  it("lists demo payer adapters without configured production endpoints", async () => {
    const payers = await payerApi.listPayers(options);

    expect(payers.map((payer) => payer.payerId)).toContain("nhso_mock");
    expect(payers.every((payer) => payer.demo)).toBe(true);
    expect(payers.every((payer) => !payer.endpointConfigured)).toBe(true);
  });

  it("discovers coverage and verifies eligibility through the demo adapter", async () => {
    const coverage = await payerApi.discoverCoverage(options, {
      patientId: "demo-patient-complete-001",
      payerId: "global_care_insurance_demo",
      context: "insurance_claim",
      consentReceiptId: "consent_api_coverage",
    });
    const eligibility = await payerApi.verifyEligibility(options, {
      payerId: "global_care_insurance_demo",
      patientId: "demo-patient-complete-001",
      context: "insurance_claim",
      consentReceiptId: "consent_api_eligibility",
      requestedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(coverage.candidates[0]?.payerId).toBe("global_care_insurance_demo");
    expect(eligibility.status).toBe("eligible");
  });

  it("creates claim evidence packages from wallet cards with certified SHL recommendation", async () => {
    const packageResult = await payerApi.createClaimEvidencePackage(options, {
      payerId: "global_care_insurance_demo",
      context: "insurance_claim",
      consentReceiptId: "consent_api_claim_package",
      createdAt: "2026-07-10T00:00:00.000Z",
    });

    expect(packageResult.documentTypes).toContain("claim_package");
    expect(packageResult.recommendedPackageMode).toBe(
      "CertifiedSHLManifestPackage",
    );
  });

  it("keeps public e-Claim demo submission as manual follow-up", async () => {
    const receipt = await payerApi.submitClaimPackage(options, {
      claimCaseId: "claim-api-public",
      payerId: "nhso_mock",
      patientId: "demo-patient-complete-001",
      context: "insurance_claim",
      claimType: "public_eclaim",
      evidencePackageId: "claim_pkg_api_public",
      consentReceiptId: "consent_api_public",
      credentialIds: ["TC-demo-patient-001-1"],
    });

    expect(receipt.status).toBe("manual_followup_required");
    expect(receipt.manualFollowUpRequired).toBe(true);
    expect(receipt.warnings?.join(" ")).toContain("No real NHSO");
  });

  it("runs the ordered demo lifecycle and stores only explicitly payer-issued JWT artifacts", async () => {
    const issuerCalls: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      issuerCalls.push(body);
      const credential = body.credential as Record<string, unknown>;
      const payerId = String(body.payerId);
      const issuerDid = `did:web:wallet.example:payer:${payerId}`;
      return new Response(
        JSON.stringify({
          ok: true,
          payerId,
          credentialId: String(credential.id),
          credentialJwt: `eyJhbGciOiJFUzI1NiJ9.${payerId}.signature`,
          credentialProof: {
            type: "W3C VC JWT",
            format: "vc+jwt",
            jwt: `eyJhbGciOiJFUzI1NiJ9.${payerId}.signature`,
            alg: "ES256",
            kid: `${issuerDid}#payer-key-1`,
            source: "trustcare_demo_payer_integration_issuer",
          },
          issuerDid,
          jwksUrl: `https://wallet.example/payer/${payerId}/jwks.json`,
          signedCredential: {
            ...credential,
            issuer: { id: issuerDid, name: "Configured demo payer issuer" },
          },
          warnings: [],
          errors: [],
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });

    const result = await payerApi.runPayerLifecycle(
      {
        ...options,
        shareGatewayUrl: "https://wallet.example/api/share-gateway",
        fetchImpl,
      },
      {
        context: "insurance_claim",
        selectedCardIds: [1001, 1005, 1008],
        consentReceiptId: "consent-api-lifecycle",
        patientId: "demo-patient-001",
        createdAt: "2026-07-10T08:00:00.000Z",
        requireSignedArtifacts: true,
      },
    );

    expect(result.steps.map((step) => step.key)).toEqual([
      "eligibility",
      "package",
      "submission",
      "status",
    ]);
    expect(issuerCalls).toHaveLength(result.artifactCards.length);
    expect(
      issuerCalls.every(
        (call) =>
          call.issuerServiceOperation === "demo_payer_integration_issue" &&
          call.sourceAuthority === "payer_adapter" &&
          call.sourceSystem === "payer_adapter",
      ),
    ).toBe(true);
    expect(
      result.artifactCards.every(
        (card) =>
          card.credentialStatus === "active" &&
          card.sourceSystem === "payer_adapter" &&
          card.credentialProof?.source === "payer_adapter_issuer" &&
          card.credentialJwt?.startsWith("eyJ"),
      ),
    ).toBe(true);
  });

  it("fails closed for unknown users instead of falling back to another patient's cards", async () => {
    await expect(
      payerApi.createClaimEvidencePackage(options, {
        payerId: "global_care_insurance_demo",
        patientId: "unknown-patient",
        context: "insurance_claim",
        consentReceiptId: "consent-unknown",
      }),
    ).rejects.toThrow("Unknown demo wallet user");
  });

  it("does not mark payer artifacts active when no explicit payer issuer is configured", async () => {
    await expect(
      payerApi.runPayerLifecycle(options, {
        context: "insurance_claim",
        selectedCardIds: [1001, 1005, 1008],
        consentReceiptId: "consent-requires-issuer",
        patientId: "demo-patient-001",
        requireSignedArtifacts: true,
      }),
    ).rejects.toThrow("configured demo payer issuer");
  });

  it("routes non-demo calls to configured procedure contracts only", async () => {
    const fetchCalls: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      fetchCalls.push(String(input));
      return new Response(
        JSON.stringify({
          result: {
            data: {
              json: [
                {
                  payerId: "configured_payer",
                  payerName: "Configured payer",
                  payerType: "private_insurer",
                  adapterKind: "configured",
                  supportedContexts: ["insurance_claim"],
                  supportedTransports: ["payer_rest_json"],
                  endpointConfigured: true,
                },
              ],
            },
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    const payers = await payerApi.listPayers({
      url: "https://wallet.example/trpc",
      demoMode: false,
      fetchImpl,
    });

    const [configuredPayer] = payers;
    expect(configuredPayer?.payerId).toBe("configured_payer");
    expect(fetchCalls[0]).toBe("https://wallet.example/trpc/payer.listPayers");
  });
});

describe("auth broker API facade", () => {
  it("creates demo broker sessions without real identity-provider endpoints", async () => {
    const providers = await authBrokerApi.listProviders({
      url: "https://wallet.example/trpc",
      demoMode: true,
    });
    const session = await authBrokerApi.startSession(
      {
        url: "https://wallet.example/trpc",
        demoMode: true,
        userId: "demo-patient-001",
      },
      {
        providerId: "payer_sso_mock",
        purpose: "payer_consent",
        redirectUri: "https://wallet.example/auth/callback",
      },
    );
    const tokenSet = await authBrokerApi.exchangeCallback(
      {
        url: "https://wallet.example/trpc",
        demoMode: true,
        userId: "demo-patient-001",
      },
      {
        sessionId: session.sessionId,
        providerId: "payer_sso_mock",
        code: "demo_code",
        state: session.state,
      },
    );

    expect(providers.every((provider) => !provider.endpointConfigured)).toBe(
      true,
    );
    expect(session.authorizationUrl).toContain("demo_auth=1");
    expect(tokenSet.tokenType).toBe("brokered_assertion");
    expect(tokenSet.consentReceiptId).toContain("consent_");
  });
});

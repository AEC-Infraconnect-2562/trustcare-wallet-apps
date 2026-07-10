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

    expect(coverage.candidates[0]?.payerId).toBe(
      "global_care_insurance_demo",
    );
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

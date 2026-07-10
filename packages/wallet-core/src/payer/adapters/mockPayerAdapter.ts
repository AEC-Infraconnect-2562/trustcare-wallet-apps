import type {
  ClaimStatus,
  ClaimSubmissionReceipt,
  CoverageDiscoveryInput,
  CoverageDiscoveryResult,
  EligibilityDecision,
  PayerProfile,
  PayerTransport,
  PreAuthDecision,
} from "../types";
import type { PayerAdapter } from "./base";

const demoNow = "2026-07-10T08:00:00.000Z";
const demoValidUntil = "2026-12-31T23:59:59.000Z";

export const mockPayerProfiles: PayerProfile[] = [
  {
    payerId: "nhso_mock",
    payerName: "NHSO Demo",
    payerNameEn: "NHSO Demo",
    payerType: "public",
    adapterKind: "mock_demo",
    supportedContexts: ["insurance_claim", "opd_visit", "emergency"],
    supportedTransports: ["mock_demo", "nhso_eclaim_portal"],
    endpointConfigured: false,
    demo: true,
    trustedIssuerDid: "did:web:trustcare.network:payer:nhso-demo",
    notes: [
      "Demo adapter only. Production NHSO integration requires an official contract.",
    ],
  },
  {
    payerId: "global_care_insurance_demo",
    payerName: "บริษัทประกันสุขภาพสากล เดโม จำกัด",
    payerNameEn: "Global Care Insurance Demo Co., Ltd.",
    payerType: "private_insurer",
    adapterKind: "mock_demo",
    supportedContexts: ["insurance_claim", "opd_visit", "emergency"],
    supportedTransports: ["mock_demo", "payer_rest_json"],
    endpointConfigured: false,
    demo: true,
    trustedIssuerDid: "did:web:trustcare.network:payer:global-care-demo",
  },
  {
    payerId: "international_tpa_mock",
    payerName: "International TPA Demo",
    payerNameEn: "International TPA Demo",
    payerType: "international_tpa",
    adapterKind: "mock_demo",
    supportedContexts: ["medical_tourist", "cross_border", "insurance_claim"],
    supportedTransports: ["mock_demo", "payer_fhir_rest"],
    endpointConfigured: false,
    demo: true,
    trustedIssuerDid: "did:web:trustcare.network:payer:intl-tpa-demo",
  },
  {
    payerId: "self_pay_mock",
    payerName: "Self-pay Demo",
    payerNameEn: "Self-pay Demo",
    payerType: "self_pay",
    adapterKind: "mock_demo",
    supportedContexts: ["medical_tourist", "opd_visit"],
    supportedTransports: ["mock_demo", "payer_manual_portal"],
    endpointConfigured: false,
    demo: true,
  },
];

export function discoverMockCoverage(
  input: CoverageDiscoveryInput,
): CoverageDiscoveryResult {
  assertConsentReceipt(input.consentReceiptId);
  const selectedProfiles = input.payerId
    ? mockPayerProfiles.filter((item) => item.payerId === input.payerId)
    : mockPayerProfiles.filter((item) => item.payerType !== "self_pay");
  return {
    candidates: selectedProfiles.map((item) => ({
      payerId: item.payerId,
      payerName: item.payerName,
      policyNumberMasked:
        item.payerType === "public" ? "UCS-****-2026" : "GCI-DEMO-****-7788",
      memberNumberMasked: `MBR-${maskSeed(input.patientId ?? "demo")}`,
      planName:
        item.payerType === "international_tpa"
          ? "International care guarantee"
          : item.payerType === "public"
            ? "Public e-Claim demo"
            : "International Comprehensive Plus",
      status: "found",
      confidence: item.payerType === "international_tpa" ? "medium" : "high",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: demoValidUntil,
    })),
    warnings: [
      "Mock payer coverage discovery. Configure a production payer adapter before connecting real payers.",
    ],
  };
}

export function createMockPayerAdapter(profile: PayerProfile): PayerAdapter {
  const submittedClaims = new Set<string>();
  return {
    profile,
    async discoverCoverage(input) {
      return discoverMockCoverage(input);
    },
    async verifyEligibility(input) {
      assertConsentReceipt(input.consentReceiptId);
      return decisionForEligibility(
        profile,
        input.patientId,
        input.serviceCode,
        input.context,
      );
    },
    async requestPreAuth(input) {
      assertConsentReceipt(input.consentReceiptId);
      const procedureCodes =
        input.procedureCodes ?? (input.serviceCode ? [input.serviceCode] : []);
      const preAuthCaseId =
        input.preAuthCaseId ??
        `pa_case_${stableSuffix({
          payerId: input.payerId,
          patientId: input.patientId,
          serviceCode: input.serviceCode,
          evidencePackageId: input.evidencePackageId,
        })}`;
      return decisionForPreAuth(
        profile,
        preAuthCaseId,
        procedureCodes,
        input.estimatedAmount ?? input.requestedAmount,
        input.currency,
      );
    },
    async submitClaimPackage(input) {
      assertConsentReceipt(input.consentReceiptId);
      if (!input.evidencePackageId.trim()) {
        throw new Error("Claim submission requires an evidence package ID.");
      }
      submittedClaims.add(input.claimCaseId);
      return receiptForClaim(profile, input.claimCaseId, input.claimType);
    },
    async getClaimStatus(input) {
      if (!submittedClaims.has(input.claimCaseId)) {
        return {
          claimCaseId: input.claimCaseId,
          status: "draft",
          payerStatusCode: "NOT_SUBMITTED",
          payerStatusText:
            "No demo submission receipt exists for this claim case.",
          updatedAt: demoNow,
        };
      }
      return statusForClaim(input.claimCaseId, input.payerId);
    },
    async requestGuaranteeLetter(input) {
      assertConsentReceipt(input.consentReceiptId);
      if (profile.payerType === "international_tpa") {
        if (!input.quotationCredentialId && !input.evidencePackageId) {
          return {
            guaranteeCaseId: input.guaranteeCaseId,
            status: "need_more_evidence",
          };
        }
        return {
          guaranteeCaseId: input.guaranteeCaseId,
          status: "approved",
          guaranteeNumber: `GL-${stableSuffix(input.guaranteeCaseId)}`,
          approvedAmount: input.estimatedAmount ?? 100000,
          currency: input.currency ?? "THB",
          validUntil: demoValidUntil,
          guaranteeLetterCredentialId: `glc_${stableSuffix(input.guaranteeCaseId)}`,
        };
      }
      if (!input.evidencePackageId && profile.payerType !== "self_pay") {
        return {
          guaranteeCaseId: input.guaranteeCaseId,
          status: "need_more_evidence",
        };
      }
      return {
        guaranteeCaseId: input.guaranteeCaseId,
        status: profile.payerType === "self_pay" ? "rejected" : "pending",
      };
    },
    async submitAdditionalEvidence(input) {
      assertConsentReceipt(input.consentReceiptId);
      return {
        claimCaseId: input.claimCaseId,
        requestId: input.requestId,
        submittedAt: demoNow,
        status: input.evidenceDocumentIds.length ? "accepted" : "rejected",
      };
    },
    async reconcilePayment(input) {
      return {
        claimCaseId: input.claimCaseId,
        payerId: input.payerId,
        status: input.paymentReference ? "matched" : "pending",
        reconciledAt: demoNow,
        currency: "THB",
      };
    },
  };
}

function decisionForEligibility(
  profile: PayerProfile,
  patientId: string | number,
  serviceCode: string | undefined,
  context: string,
): EligibilityDecision {
  const requiresPreAuth =
    profile.payerType === "international_tpa" ||
    serviceCode?.toLowerCase().includes("preauth") ||
    serviceCode?.toLowerCase().includes("surgery");
  if (profile.payerType === "self_pay") {
    return {
      eligibilityCheckId: `elig_${stableSuffix(`${profile.payerId}:${patientId}:${context}`)}`,
      payerId: profile.payerId,
      status: "unknown",
      benefitSummary:
        "Self-pay profile has no payer eligibility. Use quotation and payment readiness instead.",
      requiresPreAuth: false,
      guaranteeLetterAvailable: false,
      warnings: ["Self-pay is not an insurance coverage decision."],
    };
  }
  return {
    eligibilityCheckId: `elig_${stableSuffix(`${profile.payerId}:${patientId}:${context}:${serviceCode ?? ""}`)}`,
    payerId: profile.payerId,
    status: requiresPreAuth ? "requires_preauth" : "eligible",
    benefitSummary:
      profile.payerType === "public"
        ? "Public e-Claim demo eligibility. Manual/official e-Claim connector required for production."
        : "Demo coverage is active for the selected context.",
    requiresPreAuth,
    guaranteeLetterAvailable: profile.payerType === "international_tpa",
    validUntil: demoValidUntil,
    sourceResponseRef: `mock:${profile.payerId}:eligibility`,
    credentialId: `eligcred_${stableSuffix(`${profile.payerId}:${patientId}:${context}:${serviceCode ?? ""}`)}`,
    warnings: profile.payerType === "public" ? publicPayerWarnings() : [],
  };
}

function decisionForPreAuth(
  profile: PayerProfile,
  preAuthCaseId: string,
  procedureCodes: string[],
  estimatedAmount: number | undefined,
  currency: string | undefined,
): PreAuthDecision {
  if (procedureCodes.some((code) => code.toUpperCase().includes("MORE"))) {
    return {
      preAuthCaseId,
      status: "need_more_evidence",
      conditions: ["Payer requests recent lab result and physician summary."],
      additionalEvidenceRequested: ["lab_result", "patient_summary"],
      payerDecisionRef: `mock:${profile.payerId}:preauth:more-evidence`,
      warnings: [
        "Pre-authorization result returned by mock payer adapter. Configure a production payer adapter before submitting real requests.",
      ],
    };
  }
  if (procedureCodes.some((code) => code.toUpperCase().includes("DENY"))) {
    return {
      preAuthCaseId,
      status: "rejected",
      conditions: ["Mock payer rejected this pre-auth request."],
      payerDecisionRef: `mock:${profile.payerId}:preauth:rejected`,
      warnings: [
        "Pre-authorization result returned by mock payer adapter. Configure a production payer adapter before submitting real requests.",
      ],
    };
  }
  return {
    preAuthCaseId,
    status: "approved",
    authorizationNumber: `PA-${stableSuffix(preAuthCaseId)}`,
    approvedAmount: estimatedAmount,
    currency: currency ?? "THB",
    validUntil: demoValidUntil,
    conditions: ["Approval returned by mock payer adapter."],
    payerDecisionRef: `mock:${profile.payerId}:preauth:approved`,
    credentialId: `pacred_${stableSuffix(preAuthCaseId)}`,
    warnings: [
      "Pre-authorization result returned by mock payer adapter. Configure a production payer adapter before submitting real requests.",
    ],
  };
}

function receiptForClaim(
  profile: PayerProfile,
  claimCaseId: string,
  claimType: string,
): ClaimSubmissionReceipt {
  const publicManual =
    claimType === "public_eclaim" || profile.payerType === "public";
  const channel: PayerTransport = publicManual
    ? "payer_manual_portal"
    : "mock_demo";
  return {
    claimCaseId,
    externalSubmissionId: publicManual
      ? undefined
      : `SUB-${stableSuffix(claimCaseId)}`,
    payerId: profile.payerId,
    submittedAt: demoNow,
    channel,
    status: publicManual ? "manual_followup_required" : "accepted",
    manualFollowUpRequired: publicManual,
    receiptCredentialId: `claimreceipt_${stableSuffix(claimCaseId)}`,
    warnings: publicManual ? publicPayerWarnings() : [],
  };
}

function statusForClaim(claimCaseId: string, payerId: string): ClaimStatus {
  if (claimCaseId.toLowerCase().includes("more")) {
    return {
      claimCaseId,
      status: "need_more_evidence",
      payerStatusCode: "RFE",
      payerStatusText: "Additional evidence requested",
      updatedAt: demoNow,
      needMoreEvidence: [
        {
          requestId: `rfe_${stableSuffix(claimCaseId)}`,
          requestedByPayerId: payerId,
          requiredDocumentTypes: ["lab_result", "medical_certificate"],
          reason: "Mock payer requests lab evidence and physician certificate.",
          dueAt: demoValidUntil,
        },
      ],
      credentialId: `claimstatus_${stableSuffix(claimCaseId)}`,
    };
  }
  return {
    claimCaseId,
    status: "accepted",
    payerStatusCode: "ACK",
    payerStatusText: "Package accepted by mock payer adapter",
    updatedAt: demoNow,
    credentialId: `claimstatus_${stableSuffix(claimCaseId)}`,
  };
}

function publicPayerWarnings(): string[] {
  return [
    "No real NHSO endpoint is configured. This is a mock e-Claim adapter response.",
  ];
}

function assertConsentReceipt(value: string): void {
  if (!value.trim()) {
    throw new Error(
      "Payer adapter request requires an explicit consent receipt ID.",
    );
  }
}

function maskSeed(value: string | number): string {
  return stableSuffix(String(value)).slice(0, 4).toUpperCase();
}

function stableSuffix(value: unknown): string {
  const source =
    (typeof value === "string" ? value : JSON.stringify(value)) ??
    String(value ?? "unknown");
  let hash = 0;
  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36).padStart(6, "0").slice(0, 8);
}

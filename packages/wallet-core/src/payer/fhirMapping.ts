import type {
  ClaimStatus,
  ClaimSubmission,
  EligibilityDecision,
  EligibilityRequest,
  PreAuthRequest,
} from "./types";

export function eligibilityRequestToFhir(
  input: EligibilityRequest,
): Record<string, unknown> {
  return {
    resourceType: "CoverageEligibilityRequest",
    id: `cer-${input.payerId}-${input.patientId}`,
    status: "active",
    purpose: ["benefits", "validation"],
    created: input.requestedAt,
    patient: { reference: `Patient/${input.patientId}` },
    insurer: { identifier: { value: input.payerId } },
    provider: input.hospitalId
      ? { reference: `Organization/${input.hospitalId}` }
      : undefined,
    facility: input.branchId
      ? { reference: `Location/${input.branchId}` }
      : undefined,
    item: [
      {
        category: { coding: [{ code: input.context }] },
        productOrService: input.serviceCode
          ? { coding: [{ code: input.serviceCode }] }
          : undefined,
        diagnosis: input.diagnosisCodes?.map((code) => ({
          diagnosisCodeableConcept: { coding: [{ code }] },
        })),
      },
    ],
    supportingInfo: [
      {
        sequence: 1,
        information: { identifier: { value: input.consentReceiptId } },
        appliesToAll: true,
      },
    ],
  };
}

export function eligibilityDecisionToFhir(
  decision: EligibilityDecision,
): Record<string, unknown> {
  return {
    resourceType: "CoverageEligibilityResponse",
    id: decision.eligibilityCheckId,
    status: "active",
    outcome:
      decision.status === "eligible" || decision.status === "requires_preauth"
        ? "complete"
        : decision.status === "pending"
          ? "queued"
          : "error",
    insurer: { identifier: { value: decision.payerId } },
    disposition: decision.benefitSummary,
    preAuthRequired: Boolean(decision.requiresPreAuth),
    insurance: [
      {
        inforce: decision.status !== "not_eligible",
        item: [
          {
            name: decision.benefitSummary,
            authorizationRequired: Boolean(decision.requiresPreAuth),
          },
        ],
      },
    ],
    extension: [
      {
        url: "https://trustcare.network/fhir/eligibility-status",
        valueCode: decision.status,
      },
      {
        url: "https://trustcare.network/fhir/source-response-ref",
        valueString: decision.sourceResponseRef,
      },
    ],
  };
}

export function preAuthRequestToFhir(
  input: PreAuthRequest,
): Record<string, unknown> {
  return claimLikeToFhir({
    id:
      input.preAuthCaseId ??
      `preauth-${input.payerId}-${String(input.patientId)}-${input.serviceCode ?? input.evidencePackageId ?? "request"}`,
    use: "preauthorization",
    payerId: input.payerId,
    patientId: input.patientId,
    encounterId: input.encounterId,
    diagnosisCodes: input.diagnosisCodes,
    procedureCodes: input.procedureCodes,
    totalAmount: input.estimatedAmount ?? input.requestedAmount,
    currency: input.currency,
    evidencePackageId: input.evidencePackageId,
    shlPackageId: input.shlPackageId,
    consentReceiptId: input.consentReceiptId,
  });
}

export function claimSubmissionToFhir(
  input: ClaimSubmission,
): Record<string, unknown> {
  return claimLikeToFhir({
    id: input.claimCaseId,
    use: "claim",
    payerId: input.payerId,
    patientId: input.patientId,
    encounterId: input.encounterId,
    totalAmount: input.totalAmount,
    currency: input.currency,
    evidencePackageId: input.evidencePackageId,
    shlPackageId: input.shlPackageId,
    consentReceiptId: input.consentReceiptId,
    claimType: input.claimType,
  });
}

export function claimStatusToFhirResponse(
  input: ClaimStatus,
): Record<string, unknown> {
  return {
    resourceType: "ClaimResponse",
    id: input.claimCaseId,
    status: "active",
    outcome:
      input.status === "approved" || input.status === "accepted"
        ? "complete"
        : input.status === "rejected"
          ? "error"
          : "queued",
    disposition: input.payerStatusText,
    processNote: input.needMoreEvidence?.map((request) => ({
      text: `${request.reason} (${request.requiredDocumentTypes.join(", ")})`,
    })),
    extension: [
      {
        url: "https://trustcare.network/fhir/payer-status",
        valueCode: input.status,
      },
      {
        url: "https://trustcare.network/fhir/payer-status-code",
        valueString: input.payerStatusCode,
      },
    ],
  };
}

function claimLikeToFhir(input: {
  id: string;
  use: "claim" | "preauthorization";
  payerId: string;
  patientId: string | number;
  encounterId?: string;
  diagnosisCodes?: string[];
  procedureCodes?: string[];
  totalAmount?: number;
  currency?: string;
  evidencePackageId?: string;
  shlPackageId?: string;
  consentReceiptId: string;
  claimType?: string;
}): Record<string, unknown> {
  return {
    resourceType: "Claim",
    id: input.id,
    status: "active",
    use: input.use,
    type: { coding: [{ code: input.claimType ?? input.use }] },
    patient: { reference: `Patient/${input.patientId}` },
    insurer: { identifier: { value: input.payerId } },
    encounter: input.encounterId
      ? [{ reference: `Encounter/${input.encounterId}` }]
      : undefined,
    diagnosis: input.diagnosisCodes?.map((code, index) => ({
      sequence: index + 1,
      diagnosisCodeableConcept: { coding: [{ code }] },
    })),
    procedure: input.procedureCodes?.map((code, index) => ({
      sequence: index + 1,
      procedureCodeableConcept: { coding: [{ code }] },
    })),
    total: input.totalAmount
      ? { value: input.totalAmount, currency: input.currency ?? "THB" }
      : undefined,
    supportingInfo: [
      {
        sequence: 1,
        category: { coding: [{ code: "consent" }] },
        valueReference: { identifier: { value: input.consentReceiptId } },
      },
      input.evidencePackageId
        ? {
            sequence: 2,
            category: { coding: [{ code: "evidence-package" }] },
            valueReference: { identifier: { value: input.evidencePackageId } },
          }
        : null,
      input.shlPackageId
        ? {
            sequence: 3,
            category: { coding: [{ code: "smart-health-link" }] },
            valueReference: { identifier: { value: input.shlPackageId } },
          }
        : null,
    ].filter(Boolean),
  };
}

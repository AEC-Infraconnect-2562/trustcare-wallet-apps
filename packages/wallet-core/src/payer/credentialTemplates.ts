import type {
  ClaimStatus,
  ClaimSubmissionReceipt,
  EligibilityDecision,
  GuaranteeLetterDecision,
  MedicalTouristCase,
  PayerProfile,
  PreAuthDecision,
} from "./types";

export type DemoCredentialInput<TSubject extends Record<string, unknown>> = {
  id: string;
  issuerDid: string;
  issuerName: string;
  holderDid?: string;
  validFrom?: string;
  validUntil?: string;
  subject: TSubject;
};

export function eligibilityResultCredential(
  input: DemoCredentialInput<EligibilityDecision>,
): Record<string, unknown> {
  return vc(input, ["VerifiableCredential", "EligibilityResultCredential"]);
}

export function payerGuaranteeLetterCredential(
  input: DemoCredentialInput<GuaranteeLetterDecision>,
): Record<string, unknown> {
  return vc(input, ["VerifiableCredential", "PayerGuaranteeLetterCredential"]);
}

export function claimSubmissionReceiptCredential(
  input: DemoCredentialInput<ClaimSubmissionReceipt>,
): Record<string, unknown> {
  return vc(input, [
    "VerifiableCredential",
    "ClaimSubmissionReceiptCredential",
  ]);
}

export function claimStatusCredential(
  input: DemoCredentialInput<ClaimStatus>,
): Record<string, unknown> {
  return vc(input, ["VerifiableCredential", "ClaimStatusCredential"]);
}

export function preAuthDecisionCredential(
  input: DemoCredentialInput<PreAuthDecision>,
): Record<string, unknown> {
  return vc(input, ["VerifiableCredential", "PreAuthDecisionCredential"]);
}

export function coverageMembershipCredential(
  input: DemoCredentialInput<{
    payer: PayerProfile;
    memberNumberMasked: string;
  }>,
): Record<string, unknown> {
  return vc(input, ["VerifiableCredential", "CoverageMembershipCredential"]);
}

export function treatmentQuotationCredential(
  input: DemoCredentialInput<{
    quotationId: string;
    patientId: string | number;
    estimatedAmount: number;
    currency: string;
    serviceSummary: string;
  }>,
): Record<string, unknown> {
  return vc(input, ["VerifiableCredential", "TreatmentQuotationCredential"]);
}

export function medicalVisaSupportLetterCredential(
  input: DemoCredentialInput<MedicalTouristCase>,
): Record<string, unknown> {
  return vc(input, [
    "VerifiableCredential",
    "MedicalVisaSupportLetterCredential",
  ]);
}

function vc(
  input: DemoCredentialInput<Record<string, unknown>>,
  type: string[],
): Record<string, unknown> {
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare.network/contexts/payer/v1",
    ],
    id: input.id,
    type,
    issuer: {
      id: input.issuerDid,
      name: input.issuerName,
    },
    validFrom: input.validFrom ?? new Date().toISOString(),
    validUntil: input.validUntil,
    credentialSubject: {
      id: input.holderDid,
      ...input.subject,
    },
  };
}

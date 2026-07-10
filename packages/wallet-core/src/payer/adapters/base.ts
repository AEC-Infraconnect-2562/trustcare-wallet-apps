import type {
  AdditionalEvidenceReceipt,
  AdditionalEvidenceSubmission,
  ClaimStatus,
  ClaimStatusRequest,
  ClaimSubmission,
  ClaimSubmissionReceipt,
  CoverageDiscoveryInput,
  CoverageDiscoveryResult,
  EligibilityDecision,
  EligibilityRequest,
  GuaranteeLetterDecision,
  GuaranteeLetterRequest,
  PaymentReconciliationRequest,
  PaymentReconciliationResult,
  PayerProfile,
  PreAuthDecision,
  PreAuthRequest,
} from "../types";

export type PayerAdapter = {
  profile: PayerProfile;
  discoverCoverage(
    input: CoverageDiscoveryInput,
  ): Promise<CoverageDiscoveryResult>;
  verifyEligibility(input: EligibilityRequest): Promise<EligibilityDecision>;
  requestPreAuth(input: PreAuthRequest): Promise<PreAuthDecision>;
  submitClaimPackage(input: ClaimSubmission): Promise<ClaimSubmissionReceipt>;
  getClaimStatus(input: ClaimStatusRequest): Promise<ClaimStatus>;
  requestGuaranteeLetter(
    input: GuaranteeLetterRequest,
  ): Promise<GuaranteeLetterDecision>;
  submitAdditionalEvidence?(
    input: AdditionalEvidenceSubmission,
  ): Promise<AdditionalEvidenceReceipt>;
  reconcilePayment?(
    input: PaymentReconciliationRequest,
  ): Promise<PaymentReconciliationResult>;
};

export type PayerAdapterRegistry = {
  listProfiles(): PayerProfile[];
  getAdapter(payerId: string): PayerAdapter | null;
};

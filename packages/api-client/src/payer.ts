import {
  buildClaimEvidencePackage,
  createMockPayerRegistry,
  getDemoWalletCards,
  listMockPayerProfiles,
  type AdditionalEvidenceReceipt,
  type AdditionalEvidenceSubmission,
  type ClaimEvidencePackage,
  type ClaimEvidencePackageBuildInput,
  type ClaimStatus,
  type ClaimStatusRequest,
  type ClaimSubmission,
  type ClaimSubmissionReceipt,
  type CoverageDiscoveryInput,
  type CoverageDiscoveryResult,
  type EligibilityDecision,
  type EligibilityRequest,
  type GuaranteeLetterDecision,
  type GuaranteeLetterRequest,
  type PayerAdapter,
  type PayerProfile,
  type PaymentReconciliationRequest,
  type PaymentReconciliationResult,
  type PreAuthDecision,
  type PreAuthRequest,
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type PayerApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
  userId?: string | number;
};

export type WalletClaimEvidencePackageInput = Omit<
  ClaimEvidencePackageBuildInput,
  "cards" | "patientId"
> & {
  patientId?: string | number;
  selectedCardIds?: Array<number | string>;
};

export async function listPayers(
  options: PayerApiOptions,
): Promise<PayerProfile[]> {
  if (options.demoMode ?? true) return listMockPayerProfiles();
  return callTrpcProcedure<PayerProfile[]>(options, "payer.listPayers", {});
}

export async function discoverCoverage(
  options: PayerApiOptions,
  input: CoverageDiscoveryInput,
): Promise<CoverageDiscoveryResult> {
  if (options.demoMode ?? true) {
    return demoDiscoveryAdapter(input).discoverCoverage(input);
  }
  return callTrpcProcedure<CoverageDiscoveryResult>(
    options,
    "payer.discoverCoverage",
    input,
  );
}

export async function verifyEligibility(
  options: PayerApiOptions,
  input: EligibilityRequest,
): Promise<EligibilityDecision> {
  if (options.demoMode ?? true) {
    return demoAdapter(input.payerId).verifyEligibility(input);
  }
  return callTrpcProcedure<EligibilityDecision>(
    options,
    "payer.verifyEligibility",
    input,
  );
}

export async function requestPreAuth(
  options: PayerApiOptions,
  input: PreAuthRequest,
): Promise<PreAuthDecision> {
  if (options.demoMode ?? true) {
    return demoAdapter(input.payerId).requestPreAuth(input);
  }
  return callTrpcProcedure<PreAuthDecision>(
    options,
    "payer.requestPreAuth",
    input,
  );
}

export async function createClaimEvidencePackage(
  options: PayerApiOptions,
  input: WalletClaimEvidencePackageInput,
): Promise<ClaimEvidencePackage> {
  if (options.demoMode ?? true) {
    const patientId = input.patientId ?? options.userId ?? "demo-patient-001";
    return buildClaimEvidencePackage({
      ...input,
      patientId: String(patientId),
      cards: getDemoWalletCards(patientId),
    });
  }
  return callTrpcProcedure<ClaimEvidencePackage>(
    options,
    "payer.createClaimEvidencePackage",
    input,
  );
}

export async function submitClaimPackage(
  options: PayerApiOptions,
  input: ClaimSubmission,
): Promise<ClaimSubmissionReceipt> {
  if (options.demoMode ?? true) {
    return demoAdapter(input.payerId).submitClaimPackage(input);
  }
  return callTrpcProcedure<ClaimSubmissionReceipt>(
    options,
    "payer.submitClaimPackage",
    input,
  );
}

export async function getClaimStatus(
  options: PayerApiOptions,
  input: ClaimStatusRequest,
): Promise<ClaimStatus> {
  if (options.demoMode ?? true) {
    return demoAdapter(input.payerId).getClaimStatus(input);
  }
  return callTrpcProcedure<ClaimStatus>(options, "payer.getClaimStatus", input);
}

export async function requestGuaranteeLetter(
  options: PayerApiOptions,
  input: GuaranteeLetterRequest,
): Promise<GuaranteeLetterDecision> {
  if (options.demoMode ?? true) {
    return demoAdapter(input.payerId).requestGuaranteeLetter(input);
  }
  return callTrpcProcedure<GuaranteeLetterDecision>(
    options,
    "payer.requestGuaranteeLetter",
    input,
  );
}

export async function submitAdditionalEvidence(
  options: PayerApiOptions,
  input: AdditionalEvidenceSubmission,
): Promise<AdditionalEvidenceReceipt> {
  if (options.demoMode ?? true) {
    const adapter = demoAdapter(input.payerId);
    if (!adapter.submitAdditionalEvidence) {
      throw new Error("Payer adapter does not support additional evidence");
    }
    return adapter.submitAdditionalEvidence(input);
  }
  return callTrpcProcedure<AdditionalEvidenceReceipt>(
    options,
    "payer.submitAdditionalEvidence",
    input,
  );
}

export async function reconcilePayment(
  options: PayerApiOptions,
  input: PaymentReconciliationRequest,
): Promise<PaymentReconciliationResult> {
  if (options.demoMode ?? true) {
    const adapter = demoAdapter(input.payerId);
    if (!adapter.reconcilePayment) {
      throw new Error("Payer adapter does not support payment reconciliation");
    }
    return adapter.reconcilePayment(input);
  }
  return callTrpcProcedure<PaymentReconciliationResult>(
    options,
    "payer.reconcilePayment",
    input,
  );
}

function demoAdapter(payerId: string): PayerAdapter {
  const adapter = createMockPayerRegistry().getAdapter(payerId);
  if (!adapter) throw new Error(`Unknown payer adapter: ${payerId}`);
  return adapter;
}

function demoDiscoveryAdapter(input: CoverageDiscoveryInput): PayerAdapter {
  if (input.payerId) return demoAdapter(input.payerId);
  const adapter = createMockPayerRegistry().listAdapters()[0];
  if (!adapter) throw new Error("No payer adapters configured");
  return adapter;
}

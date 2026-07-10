import {
  buildClaimEvidencePackage,
  createMockPayerRegistry,
  discoverMockCoverage,
  executePayerLifecycle as executeCorePayerLifecycle,
  getDemoWalletCards,
  listMockPayerProfiles,
  walletDemoUsers,
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
  type PayerLifecycleInput,
  type PayerLifecycleResult,
  type PayerProfile,
  type PaymentReconciliationRequest,
  type PaymentReconciliationResult,
  type PreAuthDecision,
  type PreAuthRequest,
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { issuePayerCredentialWithShareGateway } from "./shareGatewayClient";

export type PayerApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
  userId?: string | number;
  shareGatewayUrl?: string;
};

export type WalletClaimEvidencePackageInput = Omit<
  ClaimEvidencePackageBuildInput,
  "cards" | "patientId"
> & {
  patientId?: string | number;
  selectedCardIds?: Array<number | string>;
};

export type WalletPayerLifecycleInput = Omit<
  PayerLifecycleInput,
  "cards" | "patientId" | "ownerUserId" | "holderDid"
> & {
  cards?: PayerLifecycleInput["cards"];
  patientId?: string | number;
  requireSignedArtifacts?: boolean;
};

const demoPayerRegistry = createMockPayerRegistry();

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
    return discoverMockCoverage(input);
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
    const user = requireDemoUser(patientId);
    return buildClaimEvidencePackage({
      ...input,
      patientId: String(user.id),
      cards: getDemoWalletCards(user.id),
    });
  }
  return callTrpcProcedure<ClaimEvidencePackage>(
    options,
    "payer.createClaimEvidencePackage",
    input,
  );
}

export async function runPayerLifecycle(
  options: PayerApiOptions,
  input: WalletPayerLifecycleInput,
): Promise<PayerLifecycleResult> {
  if (!(options.demoMode ?? true)) {
    const {
      cards: _cards,
      requireSignedArtifacts: _required,
      ...request
    } = input;
    return callTrpcProcedure<PayerLifecycleResult>(
      options,
      "payer.runLifecycle",
      request,
    );
  }

  const user = requireDemoUser(input.patientId ?? options.userId);
  const payerId = payerIdForContext(input.context);
  const adapter = demoAdapter(payerId);
  const result = await executeCorePayerLifecycle(adapter, {
    ...input,
    patientId: user.id,
    ownerUserId: user.id,
    holderDid: user.holderDid,
    cards: input.cards ?? getDemoWalletCards(user.id),
  });

  const requireSignedArtifacts = input.requireSignedArtifacts ?? false;
  if (!options.shareGatewayUrl) {
    if (requireSignedArtifacts) {
      throw new Error(
        "A configured demo payer issuer is required before payer artifacts can be stored or shared.",
      );
    }
    return {
      ...result,
      warnings: [
        ...result.warnings,
        "Payer artifacts remain pending because no demo payer issuer URL was configured.",
      ],
    };
  }

  const signedCards = await Promise.all(
    result.artifactCards.map((card) =>
      issueDemoPayerCredential(options, result.profile, card),
    ),
  );
  const signedById = new Map(
    signedCards.map((card) => [String(card.id), card] as const),
  );
  return {
    ...result,
    artifactCards: signedCards,
    evidencePackage: {
      ...result.evidencePackage,
      cards: result.evidencePackage.cards.map(
        (card) => signedById.get(String(card.id)) ?? card,
      ),
    },
  };
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
  const adapter = demoPayerRegistry.getAdapter(payerId);
  if (!adapter) throw new Error(`Unknown payer adapter: ${payerId}`);
  return adapter;
}

function requireDemoUser(userId: string | number | undefined) {
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error(
      "A known demo wallet user is required for payer orchestration.",
    );
  }
  const user = walletDemoUsers.find(
    (candidate) =>
      String(candidate.id) === String(userId) ||
      String(candidate.patientId) === String(userId),
  );
  if (!user) {
    throw new Error(`Unknown demo wallet user: ${String(userId)}`);
  }
  return user;
}

function payerIdForContext(
  context: WalletPayerLifecycleInput["context"],
): string {
  return context === "insurance_claim"
    ? "global_care_insurance_demo"
    : "international_tpa_mock";
}

async function issueDemoPayerCredential(
  options: PayerApiOptions,
  profile: PayerLifecycleResult["profile"],
  card: PayerLifecycleResult["artifactCards"][number],
) {
  const baseUrl = options.shareGatewayUrl?.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Demo payer issuer URL is not configured.");
  const payload = await issuePayerCredentialWithShareGateway({
    gatewayBaseUrl: baseUrl,
    fetchImpl: options.fetchImpl,
    payerId: profile.payerId,
    credential: card.credentialData ?? {},
    credentialType: card.credentialType,
    holderDid: card.holderDid,
    expiresAt: card.expiresAt,
    audience: "https://trustcare.network/verifier",
    sourceSystem: card.sourceSystem,
  });
  if (
    !payload.ok ||
    !payload.credentialJwt ||
    !payload.issuerDid ||
    !payload.signedCredential
  ) {
    const detail = payload.errors?.join(" ") || "invalid issuer response";
    throw new Error(`Demo payer credential issuance failed: ${detail}`);
  }
  return {
    ...card,
    credentialStatus: "active",
    credentialJwt: payload.credentialJwt,
    credentialProof: {
      ...payload.credentialProof,
      source: "payer_adapter_issuer",
    },
    issuerDid: payload.issuerDid,
    credentialData: payload.signedCredential,
    scopeLabel: `${profile.payerNameEn ?? profile.payerName} · explicit demo payer issuer`,
  };
}

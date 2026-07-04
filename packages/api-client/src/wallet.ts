import {
  buildContractHubCatalog,
  buildPrepareWorkbench,
  buildServiceBundleEnvelope,
  createDemoCheckinQr,
  createDemoPresentation,
  getDemoCardsByCategory,
  getDemoHistory,
  getDemoUser,
  getDemoWalletCards,
  simulateImportForService,
  type ReadinessContext,
  type CheckinQrResponse,
  type ContractHubCatalog,
  type PresentationHistoryItem,
  type ServiceBundleEnvelope,
  type ServicePacketResponse,
  type WalletDocumentRequest,
  type WalletImportJob,
  type WalletCardsByCategory,
  type WalletPresentationRequest,
  type WalletPresentationResponse,
  assessLocalReadiness,
  buildPortalInteroperabilityFixtures
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type WalletApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
  demoOrigin?: string;
  userId?: string | number;
};

export async function cardsByCategory(options: WalletApiOptions): Promise<WalletCardsByCategory> {
  if (options.demoMode ?? true) return getDemoCardsByCategory(options.userId);
  return callTrpcProcedure<WalletCardsByCategory>(options, "wallet.cardsByCategory");
}

export async function superseded(options: WalletApiOptions): Promise<unknown[]> {
  if (options.demoMode ?? true) return [];
  return callTrpcProcedure<unknown[]>(options, "wallet.superseded");
}

export async function history(options: WalletApiOptions): Promise<PresentationHistoryItem[]> {
  if (options.demoMode ?? true) return getDemoHistory(options.userId);
  return callTrpcProcedure<PresentationHistoryItem[]>(options, "wallet.history");
}

export async function present(options: WalletApiOptions, input: WalletPresentationRequest): Promise<WalletPresentationResponse> {
  if (options.demoMode ?? true) {
    const cards = getDemoWalletCards(options.userId);
    const card = cards.find(item => item.id === input.cardId);
    if (!card) throw new Error("Wallet card not found");
    if (card.credentialStatus !== "active") throw new Error("This wallet card is not active");
    return createDemoPresentation(card, input.selectedFields, options.demoOrigin);
  }
  return callTrpcProcedure<WalletPresentationResponse>(options, "wallet.present", input);
}

export async function readiness(options: WalletApiOptions, input: { context: ReadinessContext; patientId?: number }) {
  const user = getDemoUser(options.userId ?? input.patientId);
  const cards = getDemoWalletCards(user.id);
  if (options.demoMode ?? true) {
    return {
      patientId: input.patientId ?? user.patientId,
      readiness: assessLocalReadiness(cards, input.context),
      requests: [],
      previousChecks: []
    };
  }
  return callTrpcProcedure(options, "wallet.readiness", input);
}

export async function prepareWorkbench(options: WalletApiOptions, input: { context: ReadinessContext; patientId?: number }) {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    return buildPrepareWorkbench(input.context, getDemoWalletCards(user.id), input.patientId ?? user.patientId);
  }
  return callTrpcProcedure(options, "wallet.prepareWorkbench", input);
}

export async function prepareContracts(options: WalletApiOptions) {
  if (options.demoMode ?? true) return buildContractHubCatalog().contracts;
  return callTrpcProcedure(options, "wallet.prepareContracts");
}

export async function contractHub(options: WalletApiOptions): Promise<ContractHubCatalog> {
  if (options.demoMode ?? true) return buildContractHubCatalog();
  return callTrpcProcedure<ContractHubCatalog>(options, "wallet.contractHub");
}

export async function dataMappingV2(options: WalletApiOptions) {
  if (options.demoMode ?? true) {
    const hub = buildContractHubCatalog();
    return {
      version: hub.version,
      principle: "Map source data to a service contract first, then emit FHIR, DocumentReference, VC, VP, SHL, or tasks.",
      sourceConnectors: ["his_fhir_rest", "patient_upload", "native_vc_vp", "smart_health_link"],
      profiles: hub.contracts.map(contract => ({ mappingProfileId: `map.${contract.context}.contract.v1`, contractId: contract.contractId, context: contract.context }))
    };
  }
  return callTrpcProcedure(options, "wallet.dataMappingV2");
}

export async function prepareApiExamples(options: WalletApiOptions, input: { context: ReadinessContext }) {
  if (options.demoMode ?? true) return { basePath: "/api/public/prepare-service/v1", context: input.context };
  return callTrpcProcedure(options, "wallet.prepareApiExamples", input);
}

export async function buildServiceBundle(options: WalletApiOptions, input: {
  context: ReadinessContext;
  patientId?: number;
  audience?: "patient" | "hospital" | "integration_engineer" | "partner";
  receiver?: string;
}): Promise<ServiceBundleEnvelope> {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    return buildServiceBundleEnvelope({
      context: input.context,
      cards: getDemoWalletCards(user.id),
      audience: input.audience,
      patientId: input.patientId ?? user.patientId,
      receiver: input.receiver
    });
  }
  return callTrpcProcedure<ServiceBundleEnvelope>(options, "wallet.buildServiceBundle", input);
}

export async function deployBundleToWallet(options: WalletApiOptions, input: {
  context: ReadinessContext;
  hospitalId?: number;
  targetPatientIds?: number[];
  targetWalletMode?: "single" | "appointment_list" | "cohort" | "walk_in" | "external_wallet";
  issueDocuments?: string[];
}) {
  if (options.demoMode ?? true) {
    return {
      deploymentId: `dep_demo_${Date.now().toString(36)}`,
      context: input.context,
      contractId: buildContractHubCatalog().contracts.find(item => item.context === input.context)?.contractId,
      targetWalletSelection: {
        mode: input.targetWalletMode ?? "single",
        patientIds: input.targetPatientIds ?? [getDemoUser(options.userId).patientId],
        supportsWalkInWallet: true,
        externalWalletHandshake: ["scan_did_qr", "send_wallet_invitation", "verify_holder_binding", "capture_consent"]
      },
      counts: { targets: input.targetPatientIds?.length ?? 1, queued: input.issueDocuments?.length ?? 1, requiresChecker: input.issueDocuments?.length ?? 1 }
    };
  }
  return callTrpcProcedure(options, "wallet.deployBundleToWallet", input);
}

export async function connectWalkInWallet(options: WalletApiOptions, input: { patientName?: string; phone?: string; passport?: string; consentAttested: boolean }) {
  if (options.demoMode ?? true) {
    return {
      connectionId: `walkin_${Date.now().toString(36)}`,
      holderDid: `did:key:walkin-${Date.now().toString(36)}`,
      status: input.consentAttested ? "ready_to_link" : "pending_consent",
      patientIdentityConfidence: input.passport || input.phone ? "medium" : "low"
    };
  }
  return callTrpcProcedure(options, "wallet.connectWalkInWallet", input);
}

export async function importForService(options: WalletApiOptions, input: {
  context: ReadinessContext;
  patientId?: number;
  sourceType?: string;
  documentType?: string;
  consentRef?: string;
}): Promise<WalletImportJob> {
  if (options.demoMode ?? true) return simulateImportForService(input.context, input.documentType ?? "patient_summary", input.sourceType);
  return callTrpcProcedure<WalletImportJob>(options, "wallet.importForService", input);
}

export async function documentRequests(options: WalletApiOptions, input?: { context?: ReadinessContext; patientId?: number; status?: string }): Promise<WalletDocumentRequest[]> {
  if (options.demoMode ?? true) return [];
  return callTrpcProcedure<WalletDocumentRequest[]>(options, "wallet.documentRequests", input);
}

export async function requestDocument(options: WalletApiOptions, input: unknown) {
  if (options.demoMode ?? true) {
    return { id: Date.now(), requestId: `wdr_demo_${Date.now()}`, status: "requested" };
  }
  return callTrpcProcedure(options, "wallet.requestDocument", input);
}

export async function uploadDocument(options: WalletApiOptions, input: unknown) {
  if (options.demoMode ?? true) {
    return { id: Date.now(), uploadId: `pud_demo_${Date.now()}`, fileUrl: "demo://uploaded-document" };
  }
  return callTrpcProcedure(options, "wallet.uploadDocument", input);
}

export async function buildServicePacket(options: WalletApiOptions, input: {
  context: ReadinessContext;
  patientId?: number;
  hospitalId?: number;
  serviceName?: string;
  receiverName?: string;
  selectedCardIds?: number[];
  consentAttested: boolean;
  validMinutes?: number;
}): Promise<ServicePacketResponse> {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    const cards = getDemoWalletCards(user.id);
    const readiness = assessLocalReadiness(cards, input.context);
    const presentationId = `vp_service_${input.context}_${Date.now().toString(36)}`;
    return {
      checkId: `check_${Date.now().toString(36)}`,
      patientId: input.patientId ?? user.patientId,
      readiness,
      presentationId,
      expiresAt: new Date(Date.now() + (input.validMinutes ?? 1440) * 60_000).toISOString(),
      credentialCount: input.selectedCardIds?.length ?? readiness.selectedCardIds.length,
      qrData: `${options.demoOrigin ?? "https://trustcare.example.com"}/verifier?vp=${presentationId}`
    };
  }
  return callTrpcProcedure<ServicePacketResponse>(options, "wallet.buildServicePacket", input);
}

export async function generateCheckinQR(options: WalletApiOptions, input: {
  context: ReadinessContext;
  patientId?: number;
  hospitalId?: number;
  selectedCardIds?: number[];
  uploadedDocumentIds?: number[];
  serviceName?: string;
  consentAttested: boolean;
}): Promise<CheckinQrResponse> {
  if (options.demoMode ?? true) return createDemoCheckinQr(input.context, input.selectedCardIds?.length ?? 1);
  return callTrpcProcedure<CheckinQrResponse>(options, "wallet.generateCheckinQR", input);
}

export async function interoperabilityFixtures(options: WalletApiOptions) {
  if (options.demoMode ?? true) return buildPortalInteroperabilityFixtures(options.userId, options.demoOrigin);
  return callTrpcProcedure(options, "wallet.interoperabilityFixtures", { userId: options.userId });
}

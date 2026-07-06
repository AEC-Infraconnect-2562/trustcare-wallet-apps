import {
  buildContractHubCatalog,
  buildPrepareWorkbench,
  buildServiceBundleEnvelope,
  createDemoPresentation,
  createTrustCareShlGatewayPublication,
  getDemoCardsByCategory,
  getDemoHistory,
  getDemoUser,
  getDemoWalletCards,
  simulateImportForService,
  type ReadinessContext,
  type ReadinessResult,
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
  buildSharePackage,
  buildPortalInteroperabilityFixtures,
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import {
  canUsePortalDemoSync,
  syncTrustCarePortalCardsByCategory,
  type PortalSyncMode,
} from "./portalSync";

export type WalletApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
  demoOrigin?: string;
  shlGatewayUrl?: string;
  shlViewerUrl?: string;
  userId?: string | number;
  portalSyncMode?: PortalSyncMode;
  portalOrigin?: string;
};

export type WalletReadinessResponse = {
  patientId: number | string | null | undefined;
  readiness: ReadinessResult;
  requests: unknown[];
  previousChecks: unknown[];
};

export type WalletInteroperabilityFixtures = ReturnType<
  typeof buildPortalInteroperabilityFixtures
>;

function usesPortalLiveSync(
  options: Pick<WalletApiOptions, "portalSyncMode" | "userId">,
): boolean {
  return (
    options.portalSyncMode === "live_demo" &&
    canUsePortalDemoSync(options.userId)
  );
}

export async function cardsByCategory(
  options: WalletApiOptions,
): Promise<WalletCardsByCategory> {
  if (options.demoMode ?? true) return demoCardsByCategory(options);
  return callTrpcProcedure<WalletCardsByCategory>(
    options,
    "wallet.cardsByCategory",
  );
}

export async function superseded(
  options: WalletApiOptions,
): Promise<unknown[]> {
  if (options.demoMode ?? true) return [];
  return callTrpcProcedure<unknown[]>(options, "wallet.superseded");
}

export async function history(
  options: WalletApiOptions,
): Promise<PresentationHistoryItem[]> {
  if (options.demoMode ?? true) {
    if (usesPortalLiveSync(options)) return [];
    return getDemoHistory(options.userId);
  }
  return callTrpcProcedure<PresentationHistoryItem[]>(
    options,
    "wallet.history",
  );
}

export async function present(
  options: WalletApiOptions,
  input: WalletPresentationRequest,
): Promise<WalletPresentationResponse> {
  if (options.demoMode ?? true) {
    const cards = await demoWalletCards(options);
    const card = cards.find((item) => item.id === input.cardId);
    if (!card) throw new Error("Wallet card not found");
    if (card.credentialStatus !== "active")
      throw new Error("This wallet card is not active");
    return createDemoPresentation(
      card,
      input.selectedFields,
      options.demoOrigin,
    );
  }
  return callTrpcProcedure<WalletPresentationResponse>(
    options,
    "wallet.present",
    input,
  );
}

export async function readiness(
  options: WalletApiOptions,
  input: { context: ReadinessContext; patientId?: number },
): Promise<WalletReadinessResponse> {
  const user = getDemoUser(options.userId ?? input.patientId);
  if (options.demoMode ?? true) {
    const cards = await demoWalletCards({ ...options, userId: user.id });
    return {
      patientId: input.patientId ?? user.patientId,
      readiness: assessLocalReadiness(cards, input.context),
      requests: [],
      previousChecks: [],
    };
  }
  return callTrpcProcedure<WalletReadinessResponse>(
    options,
    "wallet.readiness",
    input,
  );
}

export async function prepareWorkbench(
  options: WalletApiOptions,
  input: { context: ReadinessContext; patientId?: number },
) {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    return buildPrepareWorkbench(
      input.context,
      await demoWalletCards({ ...options, userId: user.id }),
      input.patientId ?? user.patientId,
    );
  }
  return callTrpcProcedure(options, "wallet.prepareWorkbench", input);
}

export async function prepareContracts(options: WalletApiOptions) {
  if (options.demoMode ?? true) return buildContractHubCatalog().contracts;
  return callTrpcProcedure(options, "wallet.prepareContracts");
}

export async function contractHub(
  options: WalletApiOptions,
): Promise<ContractHubCatalog> {
  if (options.demoMode ?? true) return buildContractHubCatalog();
  return callTrpcProcedure<ContractHubCatalog>(options, "wallet.contractHub");
}

export async function dataMappingV2(options: WalletApiOptions) {
  if (options.demoMode ?? true) {
    const hub = buildContractHubCatalog();
    return {
      version: hub.version,
      principle:
        "Map source data to a service contract first, then emit FHIR, DocumentReference, VC, VP, SHL, or tasks.",
      sourceConnectors: [
        "his_fhir_rest",
        "patient_upload",
        "native_vc_vp",
        "smart_health_link",
      ],
      profiles: hub.contracts.map((contract) => ({
        mappingProfileId: `map.${contract.context}.contract.v1`,
        contractId: contract.contractId,
        context: contract.context,
      })),
    };
  }
  return callTrpcProcedure(options, "wallet.dataMappingV2");
}

export async function prepareApiExamples(
  options: WalletApiOptions,
  input: { context: ReadinessContext },
) {
  if (options.demoMode ?? true)
    return {
      basePath: "/api/public/prepare-service/v1",
      context: input.context,
    };
  return callTrpcProcedure(options, "wallet.prepareApiExamples", input);
}

export async function buildServiceBundle(
  options: WalletApiOptions,
  input: {
    context: ReadinessContext;
    patientId?: number;
    audience?: "patient" | "hospital" | "integration_engineer" | "partner";
    receiver?: string;
  },
): Promise<ServiceBundleEnvelope> {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id });
    return buildServiceBundleEnvelope({
      context: input.context,
      cards,
      audience: input.audience,
      patientId: input.patientId ?? user.patientId,
      receiver: input.receiver,
    });
  }
  return callTrpcProcedure<ServiceBundleEnvelope>(
    options,
    "wallet.buildServiceBundle",
    input,
  );
}

export async function deployBundleToWallet(
  options: WalletApiOptions,
  input: {
    context: ReadinessContext;
    hospitalId?: number;
    targetPatientIds?: number[];
    targetWalletMode?:
      "single" | "appointment_list" | "cohort" | "walk_in" | "external_wallet";
    issueDocuments?: string[];
  },
) {
  if (options.demoMode ?? true) {
    return {
      deploymentId: `dep_demo_${Date.now().toString(36)}`,
      context: input.context,
      contractId: buildContractHubCatalog().contracts.find(
        (item) => item.context === input.context,
      )?.contractId,
      targetWalletSelection: {
        mode: input.targetWalletMode ?? "single",
        patientIds: input.targetPatientIds ?? [
          getDemoUser(options.userId).patientId,
        ],
        supportsWalkInWallet: true,
        externalWalletHandshake: [
          "scan_did_qr",
          "send_wallet_invitation",
          "verify_holder_binding",
          "capture_consent",
        ],
      },
      counts: {
        targets: input.targetPatientIds?.length ?? 1,
        queued: input.issueDocuments?.length ?? 1,
        requiresChecker: input.issueDocuments?.length ?? 1,
      },
    };
  }
  return callTrpcProcedure(options, "wallet.deployBundleToWallet", input);
}

export async function connectWalkInWallet(
  options: WalletApiOptions,
  input: {
    patientName?: string;
    phone?: string;
    passport?: string;
    consentAttested: boolean;
  },
) {
  if (options.demoMode ?? true) {
    return {
      connectionId: `walkin_${Date.now().toString(36)}`,
      holderDid: `did:key:walkin-${Date.now().toString(36)}`,
      status: input.consentAttested ? "ready_to_link" : "pending_consent",
      patientIdentityConfidence:
        input.passport || input.phone ? "medium" : "low",
    };
  }
  return callTrpcProcedure(options, "wallet.connectWalkInWallet", input);
}

export async function importForService(
  options: WalletApiOptions,
  input: {
    context: ReadinessContext;
    patientId?: number;
    sourceType?: string;
    documentType?: string;
    consentRef?: string;
  },
): Promise<WalletImportJob> {
  if (options.demoMode ?? true)
    return simulateImportForService(
      input.context,
      input.documentType ?? "patient_summary",
      input.sourceType,
    );
  return callTrpcProcedure<WalletImportJob>(
    options,
    "wallet.importForService",
    input,
  );
}

export async function documentRequests(
  options: WalletApiOptions,
  input?: { context?: ReadinessContext; patientId?: number; status?: string },
): Promise<WalletDocumentRequest[]> {
  if (options.demoMode ?? true) return [];
  return callTrpcProcedure<WalletDocumentRequest[]>(
    options,
    "wallet.documentRequests",
    input,
  );
}

export async function requestDocument(
  options: WalletApiOptions,
  input: unknown,
) {
  if (options.demoMode ?? true) {
    return {
      id: Date.now(),
      requestId: `wdr_demo_${Date.now()}`,
      status: "requested",
    };
  }
  return callTrpcProcedure(options, "wallet.requestDocument", input);
}

export async function uploadDocument(
  options: WalletApiOptions,
  input: unknown,
) {
  if (options.demoMode ?? true) {
    return {
      id: Date.now(),
      uploadId: `pud_demo_${Date.now()}`,
      fileUrl: "demo://uploaded-document",
    };
  }
  return callTrpcProcedure(options, "wallet.uploadDocument", input);
}

export async function buildServicePacket(
  options: WalletApiOptions,
  input: {
    context: ReadinessContext;
    patientId?: number;
    hospitalId?: number;
    serviceName?: string;
    receiverName?: string;
    selectedCardIds?: number[];
    consentAttested: boolean;
    validMinutes?: number;
  },
): Promise<ServicePacketResponse> {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id });
    const readiness = assessLocalReadiness(cards, input.context);
    const selectedCardIds = input.selectedCardIds?.length
      ? input.selectedCardIds
      : readiness.selectedCardIds;
    const packageResult = buildSharePackage({
      mode: "PurposeVP",
      context: input.context,
      cards,
      selectedCardIds,
      recipient:
        input.receiverName ?? input.serviceName ?? "TrustCare service intake",
      purpose: input.serviceName ?? readiness.label,
      expiresAt: new Date(
        Date.now() + (input.validMinutes ?? 1440) * 60_000,
      ).toISOString(),
      origin: options.demoOrigin,
    });
    const presentation =
      "presentation" in packageResult ? packageResult.presentation : undefined;
    return {
      checkId: `check_${Date.now().toString(36)}`,
      patientId: input.patientId ?? user.patientId,
      readiness,
      presentationId:
        presentation?.presentationId ?? `vp_service_${input.context}`,
      expiresAt:
        presentation?.expiresAt ??
        new Date(
          Date.now() + (input.validMinutes ?? 1440) * 60_000,
        ).toISOString(),
      credentialCount: selectedCardIds.length,
      qrData: presentation?.qrData ?? "",
    };
  }
  return callTrpcProcedure<ServicePacketResponse>(
    options,
    "wallet.buildServicePacket",
    input,
  );
}

export async function generateCheckinQR(
  options: WalletApiOptions,
  input: {
    context: ReadinessContext;
    patientId?: number;
    hospitalId?: number;
    selectedCardIds?: number[];
    uploadedDocumentIds?: number[];
    serviceName?: string;
    consentAttested: boolean;
    expiresAt?: string;
    maxAccessCount?: number;
    passcodeRequired?: boolean;
    passcodeHint?: string | null;
    accessCodeDelivery?:
      | "separate_channel"
      | "not_required"
      | "sms"
      | "in_person"
      | "secure_message";
    protocol?: "shl" | "hybrid";
  },
): Promise<CheckinQrResponse> {
  if (options.demoMode ?? true) {
    const user = getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id });
    const selected = input.selectedCardIds?.length
      ? cards.filter((card) => input.selectedCardIds?.includes(card.id))
      : cards;
    return createTrustCareShlGatewayPublication({
      context: input.context,
      ownerUserId: user.id,
      patientId: input.patientId ?? user.patientId,
      selectedCardIds: input.selectedCardIds,
      cards: selected,
      receiver: input.serviceName ?? "TrustCare service intake",
      purpose: buildContractHubCatalog().contracts.find(
        (item) => item.context === input.context,
      )?.patientLabel,
      gatewayBaseUrl: options.shlGatewayUrl,
      viewerBaseUrl: options.shlViewerUrl ?? options.demoOrigin,
      origin: options.demoOrigin,
      includeTrustCareManifestVp: input.protocol === "hybrid",
      policy: {
        expiresAt: input.expiresAt,
        maxAccessCount: input.maxAccessCount,
        passcodeRequired: input.passcodeRequired,
        passcodeHint: input.passcodeHint,
        accessCodeDelivery: input.accessCodeDelivery,
      },
    });
  }
  return callTrpcProcedure<CheckinQrResponse>(
    options,
    "wallet.generateCheckinQR",
    input,
  );
}

export async function interoperabilityFixtures(
  options: WalletApiOptions,
): Promise<WalletInteroperabilityFixtures> {
  if (options.demoMode ?? true) {
    if (usesPortalLiveSync(options)) {
      const user = getDemoUser(options.userId);
      return {
        user,
        counts: {
          cards: 0,
          shlPackages: 0,
          oid4vciOffers: 0,
          oid4vpRequests: 0,
        },
        credentialOfferUrl: "",
        presentationRequestUrl: "",
        shlQrPayload: undefined,
        sampleCredentialIds: [],
        samplePresentationIds: [],
        scope: {
          ownerUserId: user.id,
          patientId: user.patientId,
          holderDid: user.holderDid,
          sourceSystem: "trustcare_portal",
          portalOpenId: user.portalOpenId,
        },
      };
    }
    return buildPortalInteroperabilityFixtures(
      options.userId,
      options.demoOrigin,
    );
  }
  return callTrpcProcedure(options, "wallet.interoperabilityFixtures", {
    userId: options.userId,
  });
}

async function demoCardsByCategory(
  options: WalletApiOptions,
): Promise<WalletCardsByCategory> {
  if (usesPortalLiveSync(options)) {
    return syncTrustCarePortalCardsByCategory(options);
  }
  return getDemoCardsByCategory(options.userId);
}

async function demoWalletCards(options: WalletApiOptions) {
  if (usesPortalLiveSync(options)) {
    return Object.values(
      await syncTrustCarePortalCardsByCategory(options),
    ).flat();
  }
  return getDemoWalletCards(options.userId);
}

import {
  buildContractHubCatalog,
  buildPrepareWorkbench,
  buildServiceBundleEnvelope,
  canPresentCredential,
  createDemoPresentation,
  createTrustCareShlGatewayPublication,
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
  classifyQrPayload,
  fetchShlManifest,
  buildPortalInteroperabilityFixtures,
  evaluateCredentialLifecycle,
  mhdDocumentReferenceFromRecord,
  recordFromMhdDocumentReference,
  validateDocumentReference,
  verifyShlManifestTrust,
  walletDocumentRecordFromCard,
  issueDemoOid4vciCredential,
  parseOid4vcCredentialOffer,
  type BuiltSharePackage,
  type CanonicalDocumentCategory,
  type CanonicalDocumentType,
  type DemoOid4vciIssuedCredential,
  type FhirDocumentReferenceLike,
  type SharePackageBuildInput,
  type WalletCard,
  type WalletDocumentRecord,
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { verifyQr } from "./verifier";
import {
  canUsePortalDemoSync,
  syncTrustCarePortalCardsByCategory,
  type PortalSyncMode,
} from "./portalSync";
import { signCredentialWithShareGateway } from "./shareGatewayClient";
import { usesDemoRuntime } from "./runtime";

export type WalletApiOptions = TrustCareClientOptions & {
  demoOrigin?: string;
  shareGatewayUrl?: string;
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

export type WalletDocumentListOptions = {
  category?: CanonicalDocumentCategory | "all";
  documentTypes?: CanonicalDocumentType[];
};

export type WalletMhdImportInput = {
  documentReference: FhirDocumentReferenceLike;
  documentType: CanonicalDocumentType;
  category: CanonicalDocumentCategory;
  title?: string;
  titleEn?: string;
  repositoryEndpoint?: string;
};

export type WalletShlImportInput = {
  payload: string;
  passcode?: string;
};

export type WalletCreateSharePackageInput = Omit<
  SharePackageBuildInput,
  "cards"
>;

export type WalletAcceptCredentialOfferInput = {
  offerPayload: string;
  sourceCardId?: number | string;
};

export type WalletCredentialOfferAcceptance = DemoOid4vciIssuedCredential;

export type WalletShlImportResult = {
  classification: ReturnType<typeof classifyQrPayload>;
  manifest: Awaited<ReturnType<typeof fetchShlManifest>>;
  trust?: ReturnType<typeof verifyShlManifestTrust>;
  importedAt: string;
};

export type WalletSharePackageResolution = {
  classification: ReturnType<typeof classifyQrPayload>;
  shl: Awaited<ReturnType<typeof fetchShlManifest>> | null;
  resolvedAt: string;
};

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
  if (usesDemoRuntime(options)) return demoCardsByCategory(options);
  return callTrpcProcedure<WalletCardsByCategory>(
    options,
    "wallet.cardsByCategory",
  );
}

export async function listDocuments(
  options: WalletApiOptions,
  input: WalletDocumentListOptions = {},
): Promise<WalletDocumentRecord[]> {
  if (usesDemoRuntime(options)) {
    const cards = await demoWalletCards(options);
    const documentTypes = input.documentTypes?.map(String);
    return cards
      .map(walletDocumentRecordFromCard)
      .filter((record) =>
        input.category && input.category !== "all"
          ? record.category === input.category
          : true,
      )
      .filter((record) =>
        documentTypes?.length
          ? documentTypes.includes(record.documentType)
          : true,
      );
  }
  return callTrpcProcedure<WalletDocumentRecord[]>(
    options,
    "wallet.listDocuments",
    input,
  );
}

export async function importFromMhd(
  options: WalletApiOptions,
  input: WalletMhdImportInput,
): Promise<WalletDocumentRecord> {
  const validation = validateDocumentReference(input.documentReference);
  if (!validation.ok) {
    throw new Error(
      `MHD DocumentReference import failed: ${validation.errors.join("; ")}`,
    );
  }
  if (usesDemoRuntime(options)) {
    const user = getDemoUser(options.userId);
    return recordFromMhdDocumentReference(input.documentReference, {
      id: `mhd:${input.documentReference.id}`,
      ownerUserId: user.id,
      holderDid: user.holderDid,
      patientId: user.patientId,
      documentType: input.documentType,
      category: input.category,
      title: input.title,
      titleEn: input.titleEn,
      repositoryEndpoint: input.repositoryEndpoint,
      importedAt: new Date().toISOString(),
    });
  }
  return callTrpcProcedure<WalletDocumentRecord>(
    options,
    "wallet.importFromMhd",
    input,
  );
}

export async function importFromShl(
  options: WalletApiOptions,
  input: WalletShlImportInput,
): Promise<WalletShlImportResult> {
  if (usesDemoRuntime(options)) {
    const classification = classifyQrPayload(input.payload);
    const manifest = await fetchShlManifest(input.payload);
    const trust = manifest.ok
      ? verifyShlManifestTrust(manifest.manifest)
      : undefined;
    return {
      classification,
      manifest,
      trust,
      importedAt: new Date().toISOString(),
    };
  }
  return callTrpcProcedure<WalletShlImportResult>(
    options,
    "wallet.importFromShl",
    input,
  );
}

export async function createSharePackage(
  options: WalletApiOptions,
  input: WalletCreateSharePackageInput,
): Promise<BuiltSharePackage> {
  if (usesDemoRuntime(options)) {
    const cards = await demoWalletCards(options);
    const vpMode = input.mode === "DirectVP" || input.mode === "PurposeVP";
    const defaultShareGatewayUrl =
      options.demoOrigin && vpMode
        ? `${options.demoOrigin.replace(/\/$/, "")}/api/share-gateway`
        : undefined;
    return buildSharePackage({
      ...input,
      cards,
      origin: input.origin ?? options.demoOrigin,
      gatewayBaseUrl:
        input.gatewayBaseUrl ??
        (vpMode
          ? (options.shareGatewayUrl ?? defaultShareGatewayUrl)
          : options.shlGatewayUrl),
      viewerBaseUrl:
        input.viewerBaseUrl ?? options.shlViewerUrl ?? options.demoOrigin,
    });
  }
  return callTrpcProcedure<BuiltSharePackage>(
    options,
    "wallet.createSharePackage",
    input,
  );
}

export async function resolveSharePackage(
  options: WalletApiOptions,
  input: { qrPayload: string },
): Promise<WalletSharePackageResolution> {
  if (usesDemoRuntime(options)) {
    const classification = classifyQrPayload(input.qrPayload);
    const shl =
      classification.kind === "standard_shl" ||
      classification.kind === "certified_shl"
        ? await fetchShlManifest(input.qrPayload)
        : null;
    return {
      classification,
      shl,
      resolvedAt: new Date().toISOString(),
    };
  }
  return callTrpcProcedure<WalletSharePackageResolution>(
    options,
    "wallet.resolveSharePackage",
    input,
  );
}

export async function acceptCredentialOffer(
  options: WalletApiOptions,
  input: WalletAcceptCredentialOfferInput,
): Promise<WalletCredentialOfferAcceptance> {
  const parsed = parseOid4vcCredentialOffer(input.offerPayload);
  if (!parsed) throw new Error("OID4VCI credential offer ไม่ถูกต้อง");
  if (usesDemoRuntime(options)) {
    const user = getDemoUser(options.userId);
    const cards = await demoWalletCards({ ...options, userId: user.id });
    const sourceCard =
      cards.find((card) => String(card.id) === String(input.sourceCardId)) ??
      cards[0];
    if (!sourceCard) {
      throw new Error("Wallet ไม่มี credential ต้นทางสำหรับ demo issuer");
    }
    return issueDemoOid4vciCredential({
      sourceCard,
      offer: parsed,
      holderDid: user.holderDid,
      userId: user.id,
      issuerOrigin: parsed.issuer ?? options.demoOrigin,
    });
  }
  return callTrpcProcedure<WalletCredentialOfferAcceptance>(
    options,
    "wallet.acceptCredentialOffer",
    input,
  );
}

export async function verifySharePackage(
  options: WalletApiOptions,
  input: { qrPayload: string },
) {
  if (usesDemoRuntime(options)) {
    return verifyQr(options, input.qrPayload);
  }
  return callTrpcProcedure(options, "wallet.verifySharePackage", input);
}

export async function superseded(
  options: WalletApiOptions,
): Promise<unknown[]> {
  if (usesDemoRuntime(options)) return [];
  return callTrpcProcedure<unknown[]>(options, "wallet.superseded");
}

export async function history(
  options: WalletApiOptions,
): Promise<PresentationHistoryItem[]> {
  if (usesDemoRuntime(options)) {
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
  const { cardSnapshot, ...requestInput } = input;
  if (usesDemoRuntime(options)) {
    const cards = await demoWalletCards(options);
    const card =
      cards.find((item) => item.id === input.cardId) ??
      presentationCardSnapshot(options, cardSnapshot, input.cardId);
    if (!card) throw new Error("Wallet card not found");
    if (!canPresentCredential(card))
      throw new Error("This wallet card is not active");
    const signedCredentialPresentation = createSignedCredentialPresentation(
      card,
      input,
    );
    if (signedCredentialPresentation) return signedCredentialPresentation;
    return createDemoPresentation(
      card,
      input.selectedFields,
      options.demoOrigin,
      input.validMinutes,
    );
  }
  return callTrpcProcedure<WalletPresentationResponse>(
    options,
    "wallet.present",
    requestInput,
  );
}

export async function readiness(
  options: WalletApiOptions,
  input: { context: ReadinessContext; patientId?: number },
): Promise<WalletReadinessResponse> {
  if (usesDemoRuntime(options)) {
    const user = getDemoUser(options.userId ?? input.patientId);
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) return buildContractHubCatalog().contracts;
  return callTrpcProcedure(options, "wallet.prepareContracts");
}

export async function contractHub(
  options: WalletApiOptions,
): Promise<ContractHubCatalog> {
  if (usesDemoRuntime(options)) return buildContractHubCatalog();
  return callTrpcProcedure<ContractHubCatalog>(options, "wallet.contractHub");
}

export async function dataMappingV2(options: WalletApiOptions) {
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options))
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) {
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
    requestFormat?: string;
    returnChannel?: string;
    consentRef?: string;
  },
): Promise<WalletImportJob> {
  if (usesDemoRuntime(options))
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
  if (usesDemoRuntime(options)) return [];
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) {
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
  if (usesDemoRuntime(options)) {
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
  return groupCardsByCategory(await demoWalletCards(options));
}

async function demoWalletCards(options: WalletApiOptions) {
  const cards = usesPortalLiveSync(options)
    ? Object.values(await syncTrustCarePortalCardsByCategory(options)).flat()
    : getDemoWalletCards(options.userId);
  return hydrateIssuerSignedCredentials(options, cards);
}

async function hydrateIssuerSignedCredentials(
  options: WalletApiOptions,
  cards: WalletCard[],
): Promise<WalletCard[]> {
  const gatewayBaseUrl = demoCredentialSigningGatewayBaseUrl(options);
  const signableCards = cards.filter(shouldRequestIssuerSignature);
  if (!gatewayBaseUrl || !signableCards.length) return cards;
  const signedCards = new Map<string | number, WalletCard>();
  await Promise.all(
    signableCards.map(async (card) => {
      const lifecycle = evaluateCredentialLifecycle({ card });
      const signed = await signCredentialWithShareGateway({
        gatewayBaseUrl,
        issuerServiceOperation: "demo_issuer_reissue",
        sourceAuthority: lifecycle.sourceAuthority,
        signingOwner: lifecycle.signingOwner,
        sourceSystem: card.sourceSystem,
        credential: card.credentialData ?? {},
        cardId: card.id,
        credentialId: card.credentialId,
        credentialType: card.credentialType,
        holderDid: card.holderDid,
        expiresAt: card.expiresAt,
        audience: TRUSTCARE_WALLET_VERIFIER_AUDIENCE,
      });
      signedCards.set(card.id, {
        ...card,
        credentialJwt: signed.credentialJwt,
        credentialProof: signed.credentialProof,
        issuerDid: signed.issuerDid ?? card.issuerDid,
        credentialData: signed.signedCredential ?? card.credentialData,
      });
    }),
  );
  return cards.map((card) => signedCards.get(card.id) ?? card);
}

function shouldRequestIssuerSignature(card: WalletCard): boolean {
  const lifecycle = evaluateCredentialLifecycle({ card });
  return Boolean(
    card.credentialData &&
    card.credentialStatus === "active" &&
    lifecycle.action === "issue_and_sign" &&
    lifecycle.signingOwner === "source_issuer",
  );
}

function demoCredentialSigningGatewayBaseUrl(
  options: WalletApiOptions,
): string | undefined {
  if (!isBrowserRuntime()) return undefined;
  if (options.shareGatewayUrl) return options.shareGatewayUrl;
  if (!options.demoOrigin) return undefined;
  try {
    const origin = new URL(options.demoOrigin);
    if (origin.hostname.endsWith("github.io")) return undefined;
    return `${origin.origin}/api/share-gateway`;
  } catch {
    return undefined;
  }
}

function isBrowserRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.document !== "undefined" &&
    typeof fetch === "function"
  );
}

function groupCardsByCategory(cards: WalletCard[]): WalletCardsByCategory {
  return cards.reduce<WalletCardsByCategory>((grouped, card) => {
    grouped[card.documentCategory] ??= [];
    grouped[card.documentCategory].push(card);
    return grouped;
  }, {});
}

const TRUSTCARE_WALLET_VERIFIER_AUDIENCE = "https://trustcare.network/verifier";

function presentationCardSnapshot(
  options: WalletApiOptions,
  card: WalletPresentationRequest["cardSnapshot"],
  cardId: number,
) {
  if (!card || card.id !== cardId) return null;
  if (
    options.userId &&
    card.ownerUserId &&
    String(card.ownerUserId) !== String(options.userId)
  ) {
    return null;
  }
  return card;
}

function createSignedCredentialPresentation(
  card: Awaited<ReturnType<typeof demoWalletCards>>[number],
  input: WalletPresentationRequest,
): WalletPresentationResponse | null {
  const credentialJwt = card.credentialProof?.jwt ?? card.credentialJwt;
  if (!credentialJwt) return null;
  const presentationId = `vc_${String(card.credentialId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const expiresAt =
    card.expiresAt ??
    new Date(Date.now() + (input.validMinutes ?? 10) * 60_000).toISOString();
  return {
    presentationId,
    format: "vc+jwt",
    mode: input.selectedFields?.length ? "direct_vc_jwt" : "direct_vc_jwt",
    credentialCount: 1,
    selectedFields: input.selectedFields ?? [],
    expiresAt,
    qrData: credentialJwt,
    transportDecision: {
      mode: "direct_vc_jwt",
      label: "Signed credential JWT",
      reason:
        "Single synced credential already has an issuer-signed ES256/EdDSA JWT envelope, so the QR can be verified directly without a legacy resolver fallback.",
    },
    verificationChecklist: [
      {
        key: "issuer",
        label: "Issuer DID",
        ok: Boolean(card.issuerDid),
        detail: card.issuerDid ?? "",
      },
      {
        key: "proof",
        label: "Signed VC JWT",
        ok: true,
        detail:
          card.credentialProof?.kid ??
          card.credentialProof?.alg ??
          "credential proof",
      },
      {
        key: "portal_status",
        label: "Portal verification status",
        ok: card.portalVerification?.verified !== false,
        detail:
          card.portalVerification?.status ??
          card.portalVerification?.trustLevel ??
          "pending verifier check",
      },
      {
        key: "status",
        label: "Credential active",
        ok: card.credentialStatus === "active",
        detail: card.credentialStatus,
      },
    ],
  };
}

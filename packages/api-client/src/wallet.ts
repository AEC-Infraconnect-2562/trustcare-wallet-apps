import type {
  CanonicalDocumentCategory,
  CanonicalDocumentType,
  FhirDocumentReferenceLike,
  ReadinessContext,
  ReadinessResult,
  WalletCardsByCategory,
  WalletDocumentRecord,
  WalletDocumentRequest,
  WalletImportJob,
  WalletPresentationRequest,
  WalletPresentationResponse,
  PresentationHistoryItem,
  ServiceBundleEnvelope,
  ServicePacketResponse,
  CheckinQrResponse,
  ContractHubCatalog,
  BuiltSharePackage,
  SharePackageBuildInput,
} from "@trustcare/wallet-core";
import { validateDocumentReference } from "@trustcare/wallet-core/src/mhd";
import type { DemoWalletCard, DemoWalletRuntime } from "./demoRuntime";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { verifyQr } from "./verifier";
import { usesDemoRuntime } from "./runtime";

let demoRuntimePromise: Promise<typeof import("./demoRuntime")> | undefined;

async function loadDemoRuntime(): Promise<typeof import("./demoRuntime")> {
  return (demoRuntimePromise ??= import("./demoRuntime"));
}

export type WalletApiOptions = TrustCareClientOptions & {
  demoOrigin?: string;
  shareGatewayUrl?: string;
  shlGatewayUrl?: string;
  shlViewerUrl?: string;
  userId?: string | number;
};

export type WalletReadinessResponse = {
  patientId: number | string | null | undefined;
  readiness: ReadinessResult;
  requests: unknown[];
  previousChecks: unknown[];
};

export type WalletInteroperabilityFixtures = ReturnType<
  DemoWalletRuntime["buildPortalInteroperabilityFixtures"]
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

export type WalletCredentialOfferAcceptance = Awaited<
  ReturnType<DemoWalletRuntime["issueDemoOid4vciCredential"]>
>;

export type WalletShlImportResult = {
  classification: ReturnType<DemoWalletRuntime["classifyQrPayload"]>;
  manifest: Awaited<ReturnType<DemoWalletRuntime["fetchShlManifest"]>>;
  trust?: ReturnType<DemoWalletRuntime["verifyShlManifestTrust"]>;
  importedAt: string;
};

export type WalletSharePackageResolution = {
  classification: ReturnType<DemoWalletRuntime["classifyQrPayload"]>;
  shl: Awaited<ReturnType<DemoWalletRuntime["fetchShlManifest"]>> | null;
  resolvedAt: string;
};

export async function cardsByCategory(
  options: WalletApiOptions,
): Promise<WalletCardsByCategory> {
  if (usesDemoRuntime(options)) {
    const demo = await loadDemoRuntime();
    return demoCardsByCategory(options, demo);
  }
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
    const demo = await loadDemoRuntime();
    const cards = await demoWalletCards(options, demo);
    const documentTypes = input.documentTypes?.map(String);
    return cards
      .map(demo.walletDocumentRecordFromCard)
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
    const demo = await loadDemoRuntime();
    const user = demo.getDemoUser(options.userId);
    return demo.recordFromMhdDocumentReference(input.documentReference, {
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
    const demo = await loadDemoRuntime();
    const classification = demo.classifyQrPayload(input.payload);
    const manifest = await demo.fetchShlManifest(input.payload);
    const trust = manifest.ok
      ? demo.verifyShlManifestTrust(manifest.manifest)
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
    const demo = await loadDemoRuntime();
    const cards = await demoWalletCards(options, demo);
    const vpMode = input.mode === "DirectVP" || input.mode === "PurposeVP";
    const defaultShareGatewayUrl =
      options.demoOrigin && vpMode
        ? `${options.demoOrigin.replace(/\/$/, "")}/api/share-gateway`
        : undefined;
    return demo.buildSharePackage({
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
    const demo = await loadDemoRuntime();
    const classification = demo.classifyQrPayload(input.qrPayload);
    const shl =
      classification.kind === "standard_shl" ||
      classification.kind === "certified_shl"
        ? await demo.fetchShlManifest(input.qrPayload)
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
  if (usesDemoRuntime(options)) {
    const demo = await loadDemoRuntime();
    const parsed = demo.parseOid4vcCredentialOffer(input.offerPayload);
    if (!parsed) throw new Error("OID4VCI credential offer ไม่ถูกต้อง");
    const user = demo.getDemoUser(options.userId);
    const cards = await demoWalletCards({ ...options, userId: user.id }, demo);
    const sourceCard =
      cards.find((card) => String(card.id) === String(input.sourceCardId)) ??
      cards[0];
    if (!sourceCard) {
      throw new Error("Wallet ไม่มี credential ต้นทางสำหรับ demo issuer");
    }
    return demo.issueDemoOid4vciCredential({
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
    const demo = await loadDemoRuntime();
    return demo.getDemoHistory(options.userId);
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
    const demo = await loadDemoRuntime();
    const cards = await demoWalletCards(options, demo);
    const card =
      cards.find((item) => item.id === input.cardId) ??
      presentationCardSnapshot(options, cardSnapshot, input.cardId);
    if (!card) throw new Error("Wallet card not found");
    if (!demo.canPresentCredential(card))
      throw new Error("This wallet card is not active");
    const signedCredentialPresentation = createSignedCredentialPresentation(
      card,
      input,
    );
    if (signedCredentialPresentation) return signedCredentialPresentation;
    return demo.createDemoPresentation(
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
    const demo = await loadDemoRuntime();
    const user = demo.getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id }, demo);
    return {
      patientId: input.patientId ?? user.patientId,
      readiness: demo.assessLocalReadiness(cards, input.context),
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
    const demo = await loadDemoRuntime();
    const user = demo.getDemoUser(options.userId ?? input.patientId);
    return demo.buildPrepareWorkbench(
      input.context,
      await demoWalletCards({ ...options, userId: user.id }, demo),
      input.patientId ?? user.patientId,
    );
  }
  return callTrpcProcedure(options, "wallet.prepareWorkbench", input);
}

export async function prepareContracts(options: WalletApiOptions) {
  if (usesDemoRuntime(options)) {
    const demo = await loadDemoRuntime();
    return demo.buildContractHubCatalog().contracts;
  }
  return callTrpcProcedure(options, "wallet.prepareContracts");
}

export async function contractHub(
  options: WalletApiOptions,
): Promise<ContractHubCatalog> {
  if (usesDemoRuntime(options)) {
    const demo = await loadDemoRuntime();
    return demo.buildContractHubCatalog();
  }
  return callTrpcProcedure<ContractHubCatalog>(options, "wallet.contractHub");
}

export async function dataMappingV2(options: WalletApiOptions) {
  if (usesDemoRuntime(options)) {
    const demo = await loadDemoRuntime();
    const hub = demo.buildContractHubCatalog();
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
    const demo = await loadDemoRuntime();
    const user = demo.getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id }, demo);
    return demo.buildServiceBundleEnvelope({
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
    const demo = await loadDemoRuntime();
    return {
      deploymentId: `dep_demo_${Date.now().toString(36)}`,
      context: input.context,
      contractId: demo.buildContractHubCatalog().contracts.find(
        (item) => item.context === input.context,
      )?.contractId,
      targetWalletSelection: {
        mode: input.targetWalletMode ?? "single",
        patientIds: input.targetPatientIds ?? [
          demo.getDemoUser(options.userId).patientId,
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
    // A walk-in that is only `ready_to_link`/`pending_consent` has not bound a
    // holder key yet, so it has no did:key. Emitting `did:key:walkin-<ts>` would
    // masquerade as a real key-derived DID (see holderIdentity.ts, which encodes
    // did:key from an actual public key). Use a pre-binding URN reference so the
    // demo response never claims a cryptographic identity it does not hold; the
    // real did:key is minted only when the wallet is actually linked.
    const connectionId = `walkin_${Date.now().toString(36)}`;
    return {
      connectionId,
      holderReference: `urn:trustcare:demo-walkin:${connectionId}`,
      holderDid: null,
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
    return (await loadDemoRuntime()).simulateImportForService(
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
    const demo = await loadDemoRuntime();
    const user = demo.getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id }, demo);
    const readiness = demo.assessLocalReadiness(cards, input.context);
    const selectedCardIds = input.selectedCardIds?.length
      ? input.selectedCardIds
      : readiness.selectedCardIds;
    const packageResult = demo.buildSharePackage({
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
    const demo = await loadDemoRuntime();
    const user = demo.getDemoUser(options.userId ?? input.patientId);
    const cards = await demoWalletCards({ ...options, userId: user.id }, demo);
    const selected = input.selectedCardIds?.length
      ? cards.filter((card) => input.selectedCardIds?.includes(card.id))
      : cards;
    return demo.createTrustCareShlGatewayPublication({
      context: input.context,
      ownerUserId: user.id,
      selectedCardIds: input.selectedCardIds,
      cards: selected,
      receiver: input.serviceName ?? "TrustCare service intake",
      purpose: demo.buildContractHubCatalog().contracts.find(
        (item) => item.context === input.context,
      )?.patientLabel,
      gatewayBaseUrl: options.shlGatewayUrl,
      viewerBaseUrl: options.shlViewerUrl ?? options.demoOrigin,
      origin: options.demoOrigin,
      requestHospitalCertification: input.protocol === "hybrid",
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
    const demo = await loadDemoRuntime();
    return demo.buildPortalInteroperabilityFixtures(
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
  demo: DemoWalletRuntime,
): Promise<WalletCardsByCategory> {
  return demo.groupCardsByCategory(await demoWalletCards(options, demo));
}

async function demoWalletCards(
  options: WalletApiOptions,
  demo: DemoWalletRuntime,
) {
  return demo.getDemoWalletCards(options.userId);
}

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
  card: DemoWalletCard,
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

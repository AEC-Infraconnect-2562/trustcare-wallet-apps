import type {
  CheckinQrResponse,
  ReadinessContext,
  ServiceBundleEnvelope,
  ShlManifestDocument,
  WalletCard
} from "./models";
import { readinessContextLabels } from "./readiness";
import { createDemoShlKey, createShlLinkPayload, createShlViewerUrl } from "./shl";

export type TrustCareShlGatewayMode = "portal_backend" | "static_demo_gateway" | "local_preview";
export type TrustCareShlStorageProvider = "s3" | "static" | "local";
export type TrustCareShlAccessCodeDelivery = "separate_channel" | "not_required" | "sms" | "in_person" | "secure_message";
export type TrustCareShlTrustLayerStatus = "standard_shl" | "pending_manifest_vp" | "certified_manifest_vp";

export type TrustCareShlGatewayPolicy = {
  expiresAt?: string;
  maxAccessCount?: number;
  passcodeRequired?: boolean;
  passcodeHint?: string | null;
  accessCodeDelivery?: TrustCareShlAccessCodeDelivery;
};

export type TrustCareShlGatewayCreateRequest = {
  context: ReadinessContext;
  ownerUserId?: string | number;
  patientId?: number | string | null;
  selectedCardIds?: Array<number | string>;
  cards?: WalletCard[];
  serviceBundle?: ServiceBundleEnvelope | null;
  receiver?: string;
  purpose?: string;
  gatewayBaseUrl?: string;
  viewerBaseUrl?: string;
  origin?: string;
  mode?: TrustCareShlGatewayMode;
  policy?: TrustCareShlGatewayPolicy;
  storageProvider?: TrustCareShlStorageProvider;
  includeTrustCareManifestVp?: boolean;
};

export type TrustCareShlGatewayManifest = {
  resourceType: "TrustCareShlManifest";
  manifestVersion: number;
  gatewayPublicationId: string;
  shlId: string;
  label: string;
  context: ReadinessContext;
  purpose: string;
  createdAt: string;
  expiresAt: string;
  receiver: string;
  files: Array<Record<string, unknown>>;
  documentBundle: {
    bundleId: string;
    manifestVersion: number;
    source: string;
    bindingModel: string;
    standards: string[];
    status: "standard_shl" | "pending_manifest_vp" | "certified_manifest_vp";
    documents: ShlManifestDocument[];
    files: Array<Record<string, unknown>>;
  };
  access: {
    passcodeRequired: boolean;
    accessCodeDelivery: TrustCareShlAccessCodeDelivery;
    expiresAt: string;
    maxAccessCount: number;
  };
  trustcare: {
    gatewayMode: TrustCareShlGatewayMode;
    storageProvider: TrustCareShlStorageProvider;
    manifestEndpointMethod: "POST" | "GET" | "BOTH";
    trustLayerStatus: TrustCareShlTrustLayerStatus;
    makerCheckerStatus: "not_required" | "pending_maker_checker" | "approved";
    manifestCredentialId?: string;
    holderPresentationId?: string;
    contractHubVersion: string;
  };
};

export type TrustCareShlGatewayPublication = CheckinQrResponse & {
  gatewayMode: TrustCareShlGatewayMode;
  gatewayPublicationId: string;
  gatewayBaseUrl: string;
  storageProvider: TrustCareShlStorageProvider;
  manifestEndpointMethod: "POST" | "GET" | "BOTH";
  trustLayerStatus: TrustCareShlTrustLayerStatus;
  manifest: TrustCareShlGatewayManifest;
  portalRequest: Record<string, unknown>;
  warnings: string[];
};

export function createTrustCareShlGatewayPublication(input: TrustCareShlGatewayCreateRequest): TrustCareShlGatewayPublication {
  const createdAt = new Date().toISOString();
  const label = readinessContextLabels[input.context]?.th ?? input.context;
  const purpose = input.purpose ?? label;
  const selectedCards = filterSelectedCards(input.cards ?? [], input.selectedCardIds);
  const publicationId = buildPublicationId(input, selectedCards);
  const gatewayMode = input.mode ?? (input.gatewayBaseUrl ? "portal_backend" : "static_demo_gateway");
  const storageProvider = input.storageProvider ?? (gatewayMode === "portal_backend" ? "s3" : gatewayMode === "static_demo_gateway" ? "static" : "local");
  const gatewayBaseUrl = normalizeBaseUrl(
    input.gatewayBaseUrl ??
      (input.origin ? `${input.origin.replace(/\/$/, "")}/shl-gateway` : "https://trustcare.example.com/shl-gateway")
  );
  const viewerBaseUrl = normalizeBaseUrl(input.viewerBaseUrl ?? input.origin ?? "https://trustcare.example.com/wallet");
  const expiresAt = input.policy?.expiresAt ?? new Date(Date.now() + 4 * 60 * 60_000).toISOString();
  const passcodeRequired = Boolean(input.policy?.passcodeRequired);
  const accessCodeDelivery: TrustCareShlAccessCodeDelivery = passcodeRequired
    ? input.policy?.accessCodeDelivery ?? "separate_channel"
    : "not_required";
  const maxAccessCount = input.policy?.maxAccessCount ?? 5;
  const manifestUrl = `${gatewayBaseUrl}/manifests/${publicationId}.json`;
  const canonicalShlUrl = createShlLinkPayload({
    url: manifestUrl,
    key: createDemoShlKey(publicationId),
    label: purpose,
    flag: "L",
    passcodeRequired,
    expiresAt,
    version: 1
  });
  const webViewerUrl = createShlViewerUrl(viewerBaseUrl, canonicalShlUrl);
  const trustLayerStatus: TrustCareShlTrustLayerStatus = input.includeTrustCareManifestVp ? "pending_manifest_vp" : "standard_shl";
  const manifest = buildTrustCareShlGatewayManifest({
    publicationId,
    context: input.context,
    label,
    purpose,
    createdAt,
    expiresAt,
    receiver: input.receiver ?? "TrustCare service intake",
    gatewayBaseUrl,
    selectedCards,
    gatewayMode,
    storageProvider,
    passcodeRequired,
    accessCodeDelivery,
    maxAccessCount,
    trustLayerStatus,
    includeTrustCareManifestVp: Boolean(input.includeTrustCareManifestVp),
    serviceBundle: input.serviceBundle ?? null
  });
  const warnings = buildGatewayWarnings(gatewayMode, passcodeRequired);
  return {
    checkId: `chk_${publicationId}`,
    shlId: publicationId,
    shlUrl: canonicalShlUrl,
    qrPayload: webViewerUrl,
    manifestUrl,
    viewerUrl: webViewerUrl,
    canonicalShlUrl,
    webViewerUrl,
    expiresAt,
    maxAccessCount,
    passcodeRequired,
    passcodeHint: input.policy?.passcodeHint ?? null,
    accessCodeDelivery,
    readinessScore: input.serviceBundle?.readinessScore ?? 100,
    credentialCount: selectedCards.length || input.selectedCardIds?.length || 1,
    status: "ready",
    gatewayMode,
    gatewayPublicationId: publicationId,
    gatewayBaseUrl,
    storageProvider,
    manifestEndpointMethod: passcodeRequired ? "POST" : "BOTH",
    trustLayerStatus,
    manifest,
    portalRequest: buildPortalGatewayRequest({
      input,
      publicationId,
      manifestUrl,
      canonicalShlUrl,
      webViewerUrl,
      gatewayBaseUrl,
      storageProvider,
      passcodeRequired,
      accessCodeDelivery,
      maxAccessCount,
      expiresAt,
      selectedCards
    }),
    warnings
  };
}

export function buildTrustCareShlGatewayManifest(input: {
  publicationId: string;
  context: ReadinessContext;
  label: string;
  purpose: string;
  createdAt: string;
  expiresAt: string;
  receiver: string;
  gatewayBaseUrl: string;
  selectedCards: WalletCard[];
  gatewayMode: TrustCareShlGatewayMode;
  storageProvider: TrustCareShlStorageProvider;
  passcodeRequired: boolean;
  accessCodeDelivery: TrustCareShlAccessCodeDelivery;
  maxAccessCount: number;
  trustLayerStatus: TrustCareShlTrustLayerStatus;
  includeTrustCareManifestVp: boolean;
  serviceBundle?: ServiceBundleEnvelope | null;
}): TrustCareShlGatewayManifest {
  const bundleId = input.serviceBundle?.bundleId ?? `shl_bundle_${input.publicationId}`;
  const files = input.selectedCards.map((card, index) => buildManifestFile(input.gatewayBaseUrl, input.publicationId, card, index));
  const documents = input.selectedCards.map((card, index) => buildManifestDocument(input, card, index));
  return {
    resourceType: "TrustCareShlManifest",
    manifestVersion: 1,
    gatewayPublicationId: input.publicationId,
    shlId: input.publicationId,
    label: input.label,
    context: input.context,
    purpose: input.purpose,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    receiver: input.receiver,
    files,
    documentBundle: {
      bundleId,
      manifestVersion: 1,
      source: input.gatewayBaseUrl,
      bindingModel: input.includeTrustCareManifestVp ? "standard_shl_plus_trustcare_manifest_vp" : "standard_shl",
      standards: input.includeTrustCareManifestVp
        ? ["SMART Health Links", "FHIR DocumentReference", "W3C VC/VP"]
        : ["SMART Health Links", "FHIR DocumentReference"],
      status: input.trustLayerStatus,
      documents,
      files
    },
    access: {
      passcodeRequired: input.passcodeRequired,
      accessCodeDelivery: input.accessCodeDelivery,
      expiresAt: input.expiresAt,
      maxAccessCount: input.maxAccessCount
    },
    trustcare: {
      gatewayMode: input.gatewayMode,
      storageProvider: input.storageProvider,
      manifestEndpointMethod: input.passcodeRequired ? "POST" : "BOTH",
      trustLayerStatus: input.trustLayerStatus,
      makerCheckerStatus: input.includeTrustCareManifestVp ? "pending_maker_checker" : "not_required",
      manifestCredentialId: input.includeTrustCareManifestVp ? `pending:trustcare:vc:shl-manifest:${input.publicationId}` : undefined,
      holderPresentationId: input.includeTrustCareManifestVp ? `pending:trustcare:vp:shl-manifest:${input.publicationId}` : undefined,
      contractHubVersion: "2026.07.prepare-service.v1"
    }
  };
}

function buildPortalGatewayRequest(input: {
  input: TrustCareShlGatewayCreateRequest;
  publicationId: string;
  manifestUrl: string;
  canonicalShlUrl: string;
  webViewerUrl: string;
  gatewayBaseUrl: string;
  storageProvider: TrustCareShlStorageProvider;
  passcodeRequired: boolean;
  accessCodeDelivery: TrustCareShlAccessCodeDelivery;
  maxAccessCount: number;
  expiresAt: string;
  selectedCards: WalletCard[];
}): Record<string, unknown> {
  return {
    endpoint: "POST /api/wallet/shl-packages",
    responseContract: "TrustCareShlGatewayPublication",
    body: {
      publicationId: input.publicationId,
      context: input.input.context,
      ownerUserId: input.input.ownerUserId,
      patientId: input.input.patientId,
      selectedCardIds: input.selectedCards.map(card => card.id),
      receiver: input.input.receiver,
      purpose: input.input.purpose,
      accessPolicy: {
        passcodeRequired: input.passcodeRequired,
        accessCodeDelivery: input.accessCodeDelivery,
        expiresAt: input.expiresAt,
        maxAccessCount: input.maxAccessCount
      },
      publish: {
        storageProvider: input.storageProvider,
        manifestUrl: input.manifestUrl,
        gatewayBaseUrl: input.gatewayBaseUrl,
        fileStorage: input.storageProvider === "s3" ? "s3://trustcare-shl/{tenant}/{publicationId}/" : "static-demo",
        return: ["canonicalShlUrl", "webViewerUrl", "manifestUrl", "documentBundle"]
      }
    },
    demoReturn: {
      canonicalShlUrl: input.canonicalShlUrl,
      webViewerUrl: input.webViewerUrl,
      manifestUrl: input.manifestUrl
    }
  };
}

function buildManifestFile(gatewayBaseUrl: string, publicationId: string, card: WalletCard, index: number): Record<string, unknown> {
  const fileId = `${publicationId}:file:${index + 1}:${card.cardType}`;
  return {
    id: fileId,
    contentType: "application/fhir+json",
    hash: `sha256-${stableHash([publicationId, card.id, card.credentialId, card.cardType].join(":"))}`,
    url: `${gatewayBaseUrl}/files/${publicationId}/${encodeURIComponent(String(card.id))}.jwe`,
    title: card.displayName,
    documentType: card.cardType,
    credentialId: card.credentialId
  };
}

function buildManifestDocument(
  input: Parameters<typeof buildTrustCareShlGatewayManifest>[0],
  card: WalletCard,
  index: number
): ShlManifestDocument {
  const fileId = `${input.publicationId}:file:${index + 1}:${card.cardType}`;
  const credentialId = String(card.credentialId);
  return {
    id: `${input.publicationId}:doc:${index + 1}:${card.cardType}`,
    sequence: index + 1,
    title: card.displayName,
    documentType: card.cardType,
    category: card.documentCategory,
    status: "available_in_manifest",
    sourceRole: card.sourceSystem === "partner_wallet" ? "external_wallet" : "issuer",
    fhirResource: fhirResourceForCard(card),
    contentType: "application/fhir+json",
    manifestFileId: fileId,
    manifestVersion: 1,
    hash: {
      contentHash: `sha256:${stableHash(`${input.publicationId}:${credentialId}:content`)}`,
      plaintextHash: `sha256:${stableHash(`${input.publicationId}:${credentialId}:plain`)}`,
      sourceBundleHash: `sha256:${stableHash(`${input.publicationId}:${card.cardType}:bundle`)}`
    },
    objectLinks: {
      manifest: `${input.gatewayBaseUrl}/manifests/${input.publicationId}.json`,
      shlFile: `${input.gatewayBaseUrl}/files/${input.publicationId}/${encodeURIComponent(String(card.id))}.jwe`,
      fhirDocumentReference: `DocumentReference/${credentialId}`,
      fhirBundle: `Bundle/${input.publicationId}`,
      manifestCredential: input.includeTrustCareManifestVp ? `Credential/pending-${input.publicationId}` : undefined,
      holderPresentation: input.includeTrustCareManifestVp ? `Presentation/pending-${input.publicationId}` : undefined
    },
    vcBinding: {
      recommendedCredentialType: card.credentialType ?? `${card.cardType}Credential`,
      manifestCredentialId: input.includeTrustCareManifestVp ? `pending:trustcare:vc:shl-manifest:${input.publicationId}` : undefined,
      presentationId: input.includeTrustCareManifestVp ? `pending:trustcare:vp:shl-manifest:${input.publicationId}` : undefined
    },
    accessBinding: {
      passcodeRequired: input.passcodeRequired,
      expiresAt: input.expiresAt,
      currentAccessCount: 0,
      maxAccessCount: input.maxAccessCount
    }
  };
}

function filterSelectedCards(cards: WalletCard[], selectedCardIds?: Array<number | string>): WalletCard[] {
  if (!selectedCardIds?.length) return cards;
  const selected = new Set(selectedCardIds.map(String));
  return cards.filter(card => selected.has(String(card.id)));
}

function buildPublicationId(input: TrustCareShlGatewayCreateRequest, selectedCards: WalletCard[]): string {
  const subject = input.ownerUserId ?? input.patientId ?? "wallet";
  const cards = selectedCards.length ? selectedCards.map(card => card.id).join(".") : (input.selectedCardIds ?? ["all"]).join(".");
  const seed = `${input.context}:${subject}:${cards}:${input.policy?.expiresAt ?? ""}:${input.policy?.maxAccessCount ?? ""}`;
  return `shl-${input.context}-${stableHash(seed).slice(0, 12)}`;
}

function buildGatewayWarnings(mode: TrustCareShlGatewayMode, passcodeRequired: boolean): string[] {
  const warnings: string[] = [];
  if (mode !== "portal_backend") {
    warnings.push("Demo gateway นี้สร้าง contract และ payload ให้ทดสอบได้ แต่ production ต้องให้ TrustCare Portal Backend publish manifest/files และ enforce access policy.");
  }
  if (mode === "static_demo_gateway" && passcodeRequired) {
    warnings.push("Static demo manifest ไม่สามารถตรวจ passcode/access count ได้จริง ต้องใช้ Portal Backend endpoint แบบ POST ก่อนเปิดใช้กับข้อมูลจริง.");
  }
  return warnings;
}

function fhirResourceForCard(card: WalletCard): string {
  const type = card.cardType;
  if (type.includes("identity") || type.includes("travel")) return "Patient";
  if (type.includes("allergy")) return "AllergyIntolerance";
  if (type.includes("medication") || type.includes("prescription") || type.includes("dispense")) return "MedicationRequest";
  if (type.includes("lab") || type.includes("diagnostic")) return "DiagnosticReport";
  if (type.includes("claim")) return "Claim";
  if (type.includes("insurance")) return "Coverage";
  if (type.includes("referral")) return "ServiceRequest";
  if (type.includes("appointment")) return "Appointment";
  return "DocumentReference";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

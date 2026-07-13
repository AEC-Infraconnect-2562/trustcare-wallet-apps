import type {
  CheckinQrResponse,
  ReadinessContext,
  ServiceBundleEnvelope,
  ShlManifestDocument,
  WalletCard,
} from "./models";
import { readinessContextLabels } from "./readiness";
import {
  createShlContentKey,
  createShlLinkPayload,
  createShlViewerUrl,
  evaluateShlAccessPolicy,
} from "./shl";

export type TrustCareShlGatewayMode = "portal_backend";
export type TrustCareShlStorageProvider = "s3";
export type TrustCareShlAccessCodeDelivery =
  "separate_channel" | "not_required" | "sms" | "in_person" | "secure_message";
export type TrustCareShlTrustLayerStatus =
  | "standard_shl"
  | "holder_attested"
  | "pending_hospital_certification"
  | "hospital_certified";
type TrustCareShlGatewayTransportStatus =
  | "standard_shl"
  | "pending_hospital_certification";

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
  requestHospitalCertification?: boolean;
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
    status: TrustCareShlTrustLayerStatus;
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
    trustLayerStatus: TrustCareShlGatewayTransportStatus;
    makerCheckerStatus: "not_required" | "pending_maker_checker" | "approved";
    contractHubVersion: string;
  };
};

export type TrustCareShlGatewayPublication = CheckinQrResponse & {
  gatewayMode: TrustCareShlGatewayMode;
  gatewayPublicationId: string;
  gatewayBaseUrl: string;
  storageProvider: TrustCareShlStorageProvider;
  manifestEndpointMethod: "POST" | "GET" | "BOTH";
  trustLayerStatus: TrustCareShlGatewayTransportStatus;
  manifest: TrustCareShlGatewayManifest;
  warnings: string[];
};

export type TrustCareShlGatewayAccessAttempt = {
  publication: Pick<
    TrustCareShlGatewayPublication,
    | "gatewayPublicationId"
    | "shlId"
    | "expiresAt"
    | "maxAccessCount"
    | "passcodeRequired"
    | "accessCodeDelivery"
    | "manifestUrl"
  > & {
    currentAccessCount?: number | null;
    status?: string;
  };
  passcodeProvided?: boolean;
  recipient?: string;
  now?: Date;
};

export type TrustCareShlGatewayAccessDecision = {
  allowed: boolean;
  requestMethod: "POST" | "GET";
  warnings: string[];
  errors: string[];
  auditEvent: {
    type: "TrustCareShlAccessDecision";
    publicationId: string | number;
    shlId: string | number;
    recipient: string;
    decidedAt: string;
    outcome: "allowed" | "blocked";
    reasons: string[];
  };
};

export function evaluateTrustCareShlGatewayAccess(
  input: TrustCareShlGatewayAccessAttempt,
): TrustCareShlGatewayAccessDecision {
  const policy = evaluateShlAccessPolicy(
    {
      status: input.publication.status ?? "active",
      expiresAt: input.publication.expiresAt,
      currentAccessCount: input.publication.currentAccessCount ?? 0,
      maxAccessCount: input.publication.maxAccessCount ?? null,
      passcodeRequired: input.publication.passcodeRequired,
    },
    input.now ?? new Date(),
  );
  const errors = [...policy.errors];
  if (input.publication.passcodeRequired && !input.passcodeProvided) {
    errors.push("SHL requires passcode before manifest access.");
  }
  const allowed = errors.length === 0;
  return {
    allowed,
    requestMethod: input.publication.passcodeRequired ? "POST" : "GET",
    warnings: policy.warnings,
    errors,
    auditEvent: {
      type: "TrustCareShlAccessDecision",
      publicationId: input.publication.gatewayPublicationId,
      shlId: input.publication.shlId,
      recipient: input.recipient ?? "unknown",
      decidedAt: (input.now ?? new Date()).toISOString(),
      outcome: allowed ? "allowed" : "blocked",
      reasons: allowed ? policy.warnings : errors,
    },
  };
}

export function createTrustCareShlGatewayPublication(
  input: TrustCareShlGatewayCreateRequest,
): TrustCareShlGatewayPublication {
  if (!input.gatewayBaseUrl?.trim()) {
    throw new Error(
      "A Portal Share Gateway URL is required; unsigned or static SHL fallback is disabled.",
    );
  }
  if (input.mode && input.mode !== "portal_backend") {
    throw new Error(
      "Only the Portal Share Gateway is supported for SHL publication.",
    );
  }
  if (input.storageProvider && input.storageProvider !== "s3") {
    throw new Error(
      "Only the Portal-managed S3 SHL storage provider is supported.",
    );
  }
  const createdAt = new Date().toISOString();
  const label = readinessContextLabels[input.context]?.th ?? input.context;
  const purpose = input.purpose ?? label;
  const selectedCards = filterSelectedCards(
    input.cards ?? [],
    input.selectedCardIds,
  );
  if (
    input.requestHospitalCertification &&
    !selectedCards.some((card) => Boolean(card.holderDid))
  ) {
    throw new Error(
      "Holder DID is required before requesting hospital SHL certification.",
    );
  }
  const publicationId = buildPublicationId(input, selectedCards);
  const gatewayMode: TrustCareShlGatewayMode = "portal_backend";
  const storageProvider =
    input.storageProvider ??
    "s3";
  const gatewayBaseUrl = normalizeBaseUrl(input.gatewayBaseUrl);
  const viewerBaseUrl = normalizeBaseUrl(
    input.viewerBaseUrl ?? input.origin ?? gatewayBaseUrl,
  );
  const expiresAt =
    input.policy?.expiresAt ??
    new Date(Date.now() + 4 * 60 * 60_000).toISOString();
  const passcodeRequired = Boolean(input.policy?.passcodeRequired);
  const accessCodeDelivery: TrustCareShlAccessCodeDelivery = passcodeRequired
    ? (input.policy?.accessCodeDelivery ?? "separate_channel")
    : "not_required";
  const maxAccessCount = input.policy?.maxAccessCount ?? 5;
  const initialManifestUrl = `${gatewayBaseUrl}/manifests/${publicationId}.json`;
  const trustLayerStatus: TrustCareShlTrustLayerStatus =
    input.requestHospitalCertification
      ? "pending_hospital_certification"
      : "standard_shl";
  const manifest = buildTrustCareShlGatewayManifest({
    publicationId,
    context: input.context,
    label,
    purpose,
    createdAt,
    expiresAt,
    receiver: input.receiver ?? "TrustCare service intake",
    gatewayBaseUrl,
    manifestUrl: initialManifestUrl,
    viewerBaseUrl,
    selectedCards,
    gatewayMode,
    storageProvider,
    passcodeRequired,
    accessCodeDelivery,
    maxAccessCount,
    trustLayerStatus,
    requestHospitalCertification: Boolean(input.requestHospitalCertification),
    serviceBundle: input.serviceBundle ?? null,
  });
  const manifestUrl = initialManifestUrl;
  const canonicalShlUrl = createShlLinkPayload({
    url: manifestUrl,
    key: createShlContentKey(),
    label: purpose,
    flag: "L",
    passcodeRequired,
    expiresAt,
    version: 1,
  });
  const webViewerUrl = createShlViewerUrl(viewerBaseUrl, canonicalShlUrl);
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
    warnings,
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
  manifestUrl: string;
  viewerBaseUrl: string;
  selectedCards: WalletCard[];
  gatewayMode: TrustCareShlGatewayMode;
  storageProvider: TrustCareShlStorageProvider;
  passcodeRequired: boolean;
  accessCodeDelivery: TrustCareShlAccessCodeDelivery;
  maxAccessCount: number;
  trustLayerStatus: TrustCareShlGatewayTransportStatus;
  requestHospitalCertification: boolean;
  serviceBundle?: ServiceBundleEnvelope | null;
}): TrustCareShlGatewayManifest {
  const bundleId =
    input.serviceBundle?.bundleId ?? `shl_bundle_${input.publicationId}`;
  const files = input.selectedCards.map((card, index) =>
    buildManifestFile(input, card, index),
  );
  const documents = input.selectedCards.map((card, index) =>
    buildManifestDocument(input, card, index),
  );
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
      bindingModel: input.requestHospitalCertification
        ? "hospital_certification_pending"
        : "standard_shl",
      standards: ["SMART Health Links", "FHIR DocumentReference"],
      status: input.trustLayerStatus,
      documents,
      files,
    },
    access: {
      passcodeRequired: input.passcodeRequired,
      accessCodeDelivery: input.accessCodeDelivery,
      expiresAt: input.expiresAt,
      maxAccessCount: input.maxAccessCount,
    },
    trustcare: {
      gatewayMode: input.gatewayMode,
      storageProvider: input.storageProvider,
      manifestEndpointMethod: input.passcodeRequired ? "POST" : "BOTH",
      trustLayerStatus: input.trustLayerStatus,
      makerCheckerStatus: input.requestHospitalCertification
        ? "pending_maker_checker"
        : "not_required",
      contractHubVersion: "2026.07.prepare-service.v1",
    },
  };
}

function buildManifestFile(
  input: Pick<
    Parameters<typeof buildTrustCareShlGatewayManifest>[0],
    | "gatewayBaseUrl"
    | "publicationId"
    | "storageProvider"
    | "createdAt"
    | "expiresAt"
  >,
  card: WalletCard,
  index: number,
): Record<string, unknown> {
  const fileId = `${input.publicationId}:file:${index + 1}:${card.cardType}`;
  return {
    id: fileId,
    contentType: "application/fhir+json",
    hash: hashJson({
      credentialId: card.credentialId,
      cardType: card.cardType,
      fileId,
    }),
    location: `${input.gatewayBaseUrl}/files/${input.publicationId}/${encodeURIComponent(String(card.id))}.jwe`,
    title: card.displayName,
    documentType: card.cardType,
    credentialId: card.credentialId,
  };
}

function buildManifestDocument(
  input: Parameters<typeof buildTrustCareShlGatewayManifest>[0],
  card: WalletCard,
  index: number,
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
    sourceRole:
      card.sourceSystem === "partner_wallet" ? "external_wallet" : "issuer",
    fhirResource: fhirResourceForCard(card),
    contentType: "application/fhir+json",
    manifestFileId: fileId,
    manifestVersion: 1,
    hash: {
      contentHash: `sha256:${stableHash(`${input.publicationId}:${credentialId}:content`)}`,
      plaintextHash: `sha256:${stableHash(`${input.publicationId}:${credentialId}:plain`)}`,
      sourceBundleHash: `sha256:${stableHash(`${input.publicationId}:${card.cardType}:bundle`)}`,
    },
    objectLinks: {
      manifest: input.manifestUrl,
      shlFile: `${input.gatewayBaseUrl}/files/${input.publicationId}/${encodeURIComponent(String(card.id))}.jwe`,
      fhirDocumentReference: `DocumentReference/${credentialId}`,
      fhirBundle: `Bundle/${input.publicationId}`,
    },
    vcBinding: {
      recommendedCredentialType:
        card.credentialType ?? `${card.cardType}Credential`,
    },
    accessBinding: {
      passcodeRequired: input.passcodeRequired,
      expiresAt: input.expiresAt,
      currentAccessCount: 0,
      maxAccessCount: input.maxAccessCount,
    },
  };
}

function filterSelectedCards(
  cards: WalletCard[],
  selectedCardIds?: Array<number | string>,
): WalletCard[] {
  if (!selectedCardIds?.length) return cards;
  const selected = new Set(selectedCardIds.map(String));
  return cards.filter((card) => selected.has(String(card.id)));
}

function buildPublicationId(
  input: TrustCareShlGatewayCreateRequest,
  selectedCards: WalletCard[],
): string {
  const subject = input.ownerUserId ?? "wallet";
  const cards = selectedCards.length
    ? selectedCards.map((card) => card.id).join(".")
    : (input.selectedCardIds ?? ["all"]).join(".");
  const seed = `${input.context}:${subject}:${cards}:${input.policy?.expiresAt ?? ""}:${input.policy?.maxAccessCount ?? ""}`;
  return `shl-${input.context}-${stableHash(seed).slice(0, 12)}`;
}

function buildGatewayWarnings(
  mode: TrustCareShlGatewayMode,
  passcodeRequired: boolean,
): string[] {
  const warnings: string[] = [];
  void mode;
  if (passcodeRequired) {
    warnings.push(
      "Passcode ต้องส่งผ่านช่องทางแยก และ Portal Share Gateway เป็นผู้บังคับใช้นโยบายการเข้าถึง.",
    );
  }
  return warnings;
}

function fhirResourceForCard(card: WalletCard): string {
  const type = card.cardType;
  if (type.includes("identity") || type.includes("travel")) return "Patient";
  if (type.includes("allergy")) return "AllergyIntolerance";
  if (
    type.includes("medication") ||
    type.includes("prescription") ||
    type.includes("dispense")
  )
    return "MedicationRequest";
  if (type.includes("lab") || type.includes("diagnostic"))
    return "DiagnosticReport";
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

function hashJson(value: unknown): string {
  return `sha256:${stableHash(JSON.stringify(value))}`;
}

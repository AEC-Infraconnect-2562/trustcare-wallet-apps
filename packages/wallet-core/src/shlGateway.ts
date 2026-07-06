import type {
  CheckinQrResponse,
  ReadinessContext,
  ServiceBundleEnvelope,
  ShlManifestDocument,
  WalletCard
} from "./models";
import { readinessContextLabels } from "./readiness";
import { createDemoShlKey, createShlLinkPayload, createShlViewerUrl } from "./shl";
import { createDemoManifestUrl, hashJson } from "./demoResolvers";
import { shareGatewayArtifactUrl } from "./shareGateway";

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
    holderAuthorizationCredentialId?: string;
    manifestVpUrl?: string;
    manifestVpHash?: string;
    manifestCredential?: Record<string, unknown>;
    holderAuthorizationCredential?: Record<string, unknown>;
    manifestVp?: Record<string, unknown>;
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
  const initialManifestUrl = `${gatewayBaseUrl}/manifests/${publicationId}.json`;
  const trustLayerStatus: TrustCareShlTrustLayerStatus = input.includeTrustCareManifestVp ? "certified_manifest_vp" : "standard_shl";
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
    includeTrustCareManifestVp: Boolean(input.includeTrustCareManifestVp),
    serviceBundle: input.serviceBundle ?? null
  });
  const manifestUrl =
    gatewayMode === "static_demo_gateway"
      ? createDemoManifestUrl(viewerBaseUrl, publicationId, manifest as unknown as Record<string, unknown>)
      : initialManifestUrl;
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
  manifestUrl: string;
  viewerBaseUrl: string;
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
  const files = input.selectedCards.map((card, index) => buildManifestFile(input, card, index));
  const documents = input.selectedCards.map((card, index) => buildManifestDocument(input, card, index));
  const certification = input.includeTrustCareManifestVp
    ? buildTrustCareManifestCertification({
        publicationId: input.publicationId,
        context: input.context,
        purpose: input.purpose,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        receiver: input.receiver,
        manifestUrl: input.manifestUrl,
        files,
        documents,
        selectedCards: input.selectedCards,
        gatewayBaseUrl: input.gatewayBaseUrl
      })
    : null;
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
      makerCheckerStatus: input.includeTrustCareManifestVp ? "approved" : "not_required",
      manifestCredentialId: certification?.manifestCredential.id as string | undefined,
      holderPresentationId: certification?.manifestVp.id as string | undefined,
      holderAuthorizationCredentialId: certification?.holderAuthorizationCredential.id as string | undefined,
      manifestVpUrl: certification?.manifestVpUrl,
      manifestVpHash: certification?.manifestVpHash,
      manifestCredential: certification?.manifestCredential,
      holderAuthorizationCredential: certification?.holderAuthorizationCredential,
      manifestVp: certification?.manifestVp,
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

function buildManifestFile(
  input: Pick<
    Parameters<typeof buildTrustCareShlGatewayManifest>[0],
    "gatewayBaseUrl" | "publicationId" | "storageProvider" | "createdAt" | "expiresAt"
  >,
  card: WalletCard,
  index: number
): Record<string, unknown> {
  const fileId = `${input.publicationId}:file:${index + 1}:${card.cardType}`;
  const embeddedResource = {
    resourceType: "Bundle",
    type: "document",
    id: fileId,
    timestamp: input.createdAt,
    entry: [
      {
        fullUrl: `urn:trustcare:credential:${card.credentialId}`,
        resource: {
          resourceType: "DocumentReference",
          id: String(card.credentialId),
          status: "current",
          type: { text: card.displayName },
          date: card.issuedAt ?? card.createdAt,
          content: [{ attachment: { contentType: "application/vc+json", title: card.displayName } }]
        }
      }
    ]
  };
  return {
    id: fileId,
    contentType: "application/fhir+json",
    hash: hashJson({ credentialId: card.credentialId, cardType: card.cardType, fileId }),
    ...(input.storageProvider === "static"
      ? { embedded: embeddedResource }
      : { location: `${input.gatewayBaseUrl}/files/${input.publicationId}/${encodeURIComponent(String(card.id))}.jwe` }),
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
      manifest: input.manifestUrl,
      shlFile: input.storageProvider === "static" ? undefined : `${input.gatewayBaseUrl}/files/${input.publicationId}/${encodeURIComponent(String(card.id))}.jwe`,
      fhirDocumentReference: `DocumentReference/${credentialId}`,
      fhirBundle: `Bundle/${input.publicationId}`,
      manifestCredential: input.includeTrustCareManifestVp ? `Credential/manifest-${input.publicationId}` : undefined,
      holderPresentation: input.includeTrustCareManifestVp ? `Presentation/manifest-${input.publicationId}` : undefined
    },
    vcBinding: {
      recommendedCredentialType: card.credentialType ?? `${card.cardType}Credential`,
      manifestCredentialId: input.includeTrustCareManifestVp ? `urn:trustcare:vc:manifest:${input.publicationId}` : undefined,
      presentationId: input.includeTrustCareManifestVp ? `urn:trustcare:vp:manifest:${input.publicationId}` : undefined
    },
    accessBinding: {
      passcodeRequired: input.passcodeRequired,
      expiresAt: input.expiresAt,
      currentAccessCount: 0,
      maxAccessCount: input.maxAccessCount
    }
  };
}

function buildTrustCareManifestCertification(input: {
  publicationId: string;
  context: ReadinessContext;
  purpose: string;
  createdAt: string;
  expiresAt: string;
  receiver: string;
  manifestUrl: string;
  files: Array<Record<string, unknown>>;
  documents: ShlManifestDocument[];
  selectedCards: WalletCard[];
  gatewayBaseUrl: string;
}) {
  const holderDid = input.selectedCards.find(card => card.holderDid)?.holderDid ?? `did:key:holder:${input.publicationId}`;
  const issuerDid = input.selectedCards.find(card => card.issuerDid)?.issuerDid ?? "did:web:trustcare.network:contract-hub";
  const fileHashes = input.files.map(file => file.hash).filter(Boolean);
  const manifestCredential = removeUndefined({
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://trustcare.network/contexts/shl-manifest/v1"],
    id: `urn:trustcare:vc:manifest:${input.publicationId}`,
    type: ["VerifiableCredential", "TrustCareShlManifestCredential"],
    issuer: issuerDid,
    validFrom: input.createdAt,
    validUntil: input.expiresAt,
    credentialSubject: {
      id: holderDid,
      shlPublicationId: input.publicationId,
      manifestUrl: input.manifestUrl,
      manifestHash: hashJson({ files: input.files, documents: input.documents }),
      fileHashes,
      documentCount: input.documents.length,
      context: input.context,
      purpose: input.purpose
    },
    credentialStatus: {
      id: `urn:trustcare:status:manifest:${input.publicationId}`,
      type: "TrustCareStatus",
      status: "active"
    }
  });
  const holderAuthorizationCredential = removeUndefined({
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://trustcare.network/contexts/holder-authorization/v1"],
    id: `urn:trustcare:vc:holder-authorization:${input.publicationId}`,
    type: ["VerifiableCredential", "HolderAuthorizationCredential"],
    issuer: holderDid,
    validFrom: input.createdAt,
    validUntil: input.expiresAt,
    credentialSubject: {
      id: holderDid,
      authorizedRecipient: input.receiver,
      purpose: input.purpose,
      shlPublicationId: input.publicationId,
      minimumNecessary: true,
      accessPolicyConfirmed: true
    },
    credentialStatus: {
      id: `urn:trustcare:status:holder-auth:${input.publicationId}`,
      type: "TrustCareStatus",
      status: "active"
    }
  });
  const manifestVp = removeUndefined({
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://trustcare.network/contexts/shl-manifest-presentation/v1"],
    id: `urn:trustcare:vp:manifest:${input.publicationId}`,
    type: ["VerifiablePresentation", "TrustCareShlManifestPresentation"],
    holder: holderDid,
    verifiableCredential: [manifestCredential, holderAuthorizationCredential],
    trustcare: {
      certification: "certified_manifest_vp",
      makerCheckerStatus: "approved",
      shlPublicationId: input.publicationId,
      manifestUrl: input.manifestUrl,
      documentIds: input.documents.map(document => document.id),
      fileHashes
    }
  });
  const manifestVpHash = hashJson(manifestVp);
  const manifestVpUrl = shareGatewayArtifactUrl(input.gatewayBaseUrl, "manifest_vp", input.publicationId);
  return {
    manifestCredential,
    holderAuthorizationCredential,
    manifestVp,
    manifestVpHash,
    manifestVpUrl
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

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

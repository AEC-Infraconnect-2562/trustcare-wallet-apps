import type {
  CanonicalDocumentCategory,
  CanonicalDocumentType,
} from "./canonicalDocuments";
import type {
  WalletDocumentRecordV2,
  WalletDocumentTrustState,
} from "./walletDocumentV2";
import type { FhirDocumentReferenceLike } from "./mhd";
import type {
  ContractHubCatalog,
  ServiceReadinessContract,
  VerifierResult,
} from "./models";
import type {
  ShareGatewayPublicationRequest,
  ShareGatewayPublicationResponse,
} from "./shareGateway";

export type WalletDocumentQuery = {
  ownerUserId?: string;
  documentTypes?: CanonicalDocumentType[];
  categories?: CanonicalDocumentCategory[];
  statuses?: string[];
  trustStates?: WalletDocumentTrustState[];
  sourceSystems?: string[];
  search?: string;
  offset?: number;
  limit?: number;
};

export type WalletActivityEvent = {
  id: string;
  type:
    | "document_received"
    | "document_opened"
    | "document_saved_offline"
    | "share_created"
    | "share_accessed"
    | "share_revoked"
    | "connection_synced";
  occurredAt: string;
  ownerUserId?: string;
  documentId?: string;
  artifactId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type ActivityQuery = {
  ownerUserId?: string;
  types?: WalletActivityEvent["type"][];
  from?: string;
  to?: string;
  limit?: number;
};

export type ActiveShare = {
  id: string;
  artifactId: string;
  recipient: string;
  purpose: string;
  documentIds: string[];
  createdAt: string;
  expiresAt?: string;
  status: "active" | "expired" | "revoked" | "exhausted" | "invalid";
  accessCount?: number;
  maxAccessCount?: number;
  lastAccessedAt?: string;
};

export interface WalletRepository {
  listDocuments(query?: WalletDocumentQuery): Promise<WalletDocumentRecordV2[]>;
  getDocument(id: string): Promise<WalletDocumentRecordV2 | null>;
  saveDocuments(records: WalletDocumentRecordV2[]): Promise<void>;
  markOffline(id: string, enabled: boolean): Promise<void>;
  listActivity(query?: ActivityQuery): Promise<WalletActivityEvent[]>;
  listActiveShares(): Promise<ActiveShare[]>;
}

export type PortalDiscoveryInput = {
  issuerOrPortalUrl: string;
};

export type PortalCapabilities = {
  providerId: string;
  displayName?: string;
  walletSyncEndpoint?: string;
  contractHubManifestUrl?: string;
  fhirBaseUrl?: string;
  mhdEndpoint?: string;
  credentialIssuerUrl?: string;
  shareGatewayUrl?: string;
  verifierUrl?: string;
  supportedScopes: string[];
  metadata?: Record<string, unknown>;
};

export type PortalAuthorizationInput = {
  capabilities: PortalCapabilities;
  authorizationCode?: string;
  redirectUri?: string;
  requestedScopes: string[];
};

export type PortalConnection = {
  id: string;
  providerId: string;
  status: "connected" | "reauthorization_required" | "disconnected" | "error";
  scopes: string[];
  connectedAt: string;
  lastSyncedAt?: string;
  capabilities: PortalCapabilities;
};

export type WalletSyncRequest = {
  connectionId: string;
  cursor?: string;
  etag?: string;
  limit?: number;
};

export type WalletSyncTombstone = {
  recordId: string;
  status: "deleted" | "revoked" | "superseded";
  changedAt: string;
};

export type WalletSyncPage = {
  records: WalletDocumentRecordV2[];
  tombstones: WalletSyncTombstone[];
  nextCursor?: string;
  etag?: string;
  hasMore: boolean;
  syncedAt: string;
  conflicts?: Array<{ recordId: string; reason: string }>;
};

export interface PortalConnectionProvider {
  discover(input: PortalDiscoveryInput): Promise<PortalCapabilities>;
  connect(input: PortalAuthorizationInput): Promise<PortalConnection>;
  sync(input: WalletSyncRequest): Promise<WalletSyncPage>;
  disconnect(connectionId: string): Promise<void>;
}

// Phase 1 reuses the current readiness contract. Phase 6 will replace this
// alias with the generated, versioned Contract Hub schema.
export type ServiceProfile = ServiceReadinessContract;

export type ContractHubManifest = ContractHubCatalog & {
  contractHubId: string;
  generatedAt: string;
  effectiveFrom: string;
  expiresAt?: string;
  minimumWalletVersion?: string;
  signature?: Record<string, unknown>;
};

export interface ContractHubClient {
  getManifest(): Promise<ContractHubManifest>;
  listServiceProfiles(): Promise<ServiceProfile[]>;
  getServiceProfile(id: string, version?: string): Promise<ServiceProfile>;
}

export type ProvideDocumentBundleInput = {
  patientId: string;
  submissionSet?: Record<string, unknown>;
  documents: Array<{
    documentReference: FhirDocumentReferenceLike;
    content: Uint8Array;
    contentType: string;
    hash?: string;
  }>;
};

export type ProvideDocumentResult = {
  submissionSetId?: string;
  documentIds: string[];
  warnings: string[];
};

export type MhdListQuery = {
  patientId: string;
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  author?: string;
  facility?: string;
  cursor?: string;
  limit?: number;
};

export type MhdListPage = {
  lists: Record<string, unknown>[];
  nextCursor?: string;
};

export type MhdDocumentQuery = MhdListQuery & {
  documentTypes?: string[];
  categories?: string[];
  identifiers?: string[];
};

export type MhdDocumentPage = {
  documents: FhirDocumentReferenceLike[];
  nextCursor?: string;
  etag?: string;
};

export type RetrievedDocument = {
  reference: string;
  content: Uint8Array;
  contentType: string;
  hash?: string;
  etag?: string;
};

export interface MhdDocumentRepositoryClient {
  provide(input: ProvideDocumentBundleInput): Promise<ProvideDocumentResult>;
  findLists(query: MhdListQuery): Promise<MhdListPage>;
  findDocumentReferences(query: MhdDocumentQuery): Promise<MhdDocumentPage>;
  retrieve(reference: string): Promise<RetrievedDocument>;
}

export type PublishVpRequest = ShareGatewayPublicationRequest & { kind: "vp" };

export type PublishShlRequest = ShareGatewayPublicationRequest & {
  kind: "standard_shl_manifest" | "certified_shl_manifest";
};

export type PublishedShareArtifact = ShareGatewayPublicationResponse;

export type ShareAccessEvent = {
  id: string;
  artifactId: string;
  occurredAt: string;
  outcome: "allowed" | "denied" | "expired" | "exhausted";
  recipient?: string;
  metadata?: Record<string, unknown>;
};

export interface ShareGatewayClient {
  publishVp(input: PublishVpRequest): Promise<PublishedShareArtifact>;
  publishShl(input: PublishShlRequest): Promise<PublishedShareArtifact>;
  revoke(artifactId: string): Promise<void>;
  getAccessHistory(artifactId: string): Promise<ShareAccessEvent[]>;
}

export type ResolvedArtifact = {
  input: string;
  kind: "vp" | "vc" | "shl" | "oid4vci" | "oid4vp" | "unknown";
  payload: unknown;
  resolvedAt: string;
  sourceUrl?: string;
};

export interface VerifierClient {
  resolve(input: string): Promise<ResolvedArtifact>;
  verify(input: ResolvedArtifact): Promise<VerifierResult>;
}

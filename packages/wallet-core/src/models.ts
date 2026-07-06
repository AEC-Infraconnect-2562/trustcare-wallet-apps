export type Language = "th" | "en";
export type ThemeMode = "light" | "dark" | "system";

export type CredentialStatus = "active" | "revoked" | "expired" | "superseded" | "suspended" | string;

export type TrustLevel = "green" | "yellow" | "red" | "blue" | "verified" | "warning" | "unknown";

export type WalletCard = {
  id: number;
  cardType: string;
  displayName: string;
  displayNameEn?: string | null;
  documentCategory: string;
  credentialId: number | string;
  credentialStatus: CredentialStatus;
  credentialData?: Record<string, unknown> | null;
  credentialJwt?: string | null;
  credentialProof?: {
    type?: string | null;
    format?: string | null;
    jwt?: string | null;
    alg?: string | null;
    kid?: string | null;
    disclosures?: unknown;
    selectiveDisclosure?: unknown;
    source?: string | null;
  } | null;
  portalVerification?: {
    verified?: boolean;
    trustLevel?: TrustLevel | string;
    status?: string;
    message?: string;
    checkedAt?: string;
    payload?: unknown;
  } | null;
  credentialType?: string | null;
  issuerHospitalName?: string | null;
  issuerDid?: string | null;
  holderDid?: string | null;
  patientAvatarUrl?: string | null;
  ownerUserId?: string | null;
  patientId?: number | string | null;
  sourceSystem?: "trustcare_portal" | "partner_wallet" | string | null;
  scopeLabel?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  lastPresentedAt?: string | null;
  pinned?: boolean;
};

export type WalletCardsByCategory = Record<string, WalletCard[]>;

export type WalletPresentationRequest = {
  cardId: number;
  selectedFields?: string[];
  audience?: string;
  validMinutes?: number;
};

export type TrustLayerChecklistItem = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type WalletPresentationResponse = {
  presentationId: string;
  format: "jwt-vp" | string;
  mode: string;
  credentialCount: number;
  selectedFields: string[];
  transportDecision?: {
    mode?: string;
    label?: string;
    reason?: string;
  } | unknown;
  verificationChecklist?: TrustLayerChecklistItem[] | unknown;
  expiresAt: string;
  qrData: string;
};

export type PresentationHistoryItem = {
  id: number | string;
  verifierName?: string | null;
  purpose?: string | null;
  presentedAt?: string | null;
  createdAt?: string | null;
  verificationResult?: string | null;
  presentationId?: string | null;
  payload?: unknown;
};

export type ShlManifestDocument = {
  id: string;
  sequence: number;
  title: string;
  documentType: string;
  category: string;
  status: "available_in_manifest" | "linked_to_inactive_shl" | string;
  sourceRole: string;
  fhirResource: string;
  contentType: string;
  manifestFileId?: string;
  manifestFileDbId?: number;
  manifestVersion: number;
  hash?: {
    contentHash?: string;
    plaintextHash?: string;
    sourceBundleHash?: string;
  };
  objectLinks?: {
    manifest?: string;
    shlFile?: string;
    fhirDocumentReference?: string;
    fhirBundle?: string;
    manifestCredential?: string;
    holderPresentation?: string;
    futureApi?: string;
  };
  vcBinding?: {
    recommendedCredentialType?: string;
    manifestCredentialId?: string;
    presentationId?: string;
  };
  accessBinding?: {
    passcodeRequired: boolean;
    expiresAt?: string;
    currentAccessCount: number;
    maxAccessCount?: number;
  };
};

export type ShlPackage = {
  id: number;
  label?: string | null;
  purpose?: string | null;
  context?: string | null;
  status: string;
  manifestUrl?: string | null;
  viewerUrl?: string | null;
  shlUrl?: string | null;
  qrPayload?: string | null;
  canonicalShlUrl?: string | null;
  webViewerUrl?: string | null;
  manifestCredentialId?: string | null;
  presentationId?: string | null;
  manifestCredential?: Record<string, unknown> | null;
  holderAuthorizationCredential?: Record<string, unknown> | null;
  manifestVp?: Record<string, unknown> | null;
  manifestVpUrl?: string | null;
  manifestVpHash?: string | null;
  passcodeRequired?: boolean;
  currentAccessCount?: number;
  maxAccessCount?: number | null;
  expiresAt?: string | null;
  trustcareCertification?: {
    status: "maker_checker_approved" | "pending_maker_checker" | "rejected" | "not_applicable" | string;
    ownerConfirmed?: boolean;
    makerId?: string;
    makerName?: string;
    makerApprovedAt?: string;
    checkerId?: string;
    checkerName?: string;
    checkerApprovedAt?: string;
    networkHospitalDid?: string;
    consentReceiptId?: string;
    policyVersion?: string;
  };
};

export type ShlPackageDetail = ShlPackage & {
  files?: unknown[];
  versions?: unknown[];
  accessLogs?: unknown[];
  documentBundle?: {
    bundleId: string;
    manifestVersion: number;
    source: string;
    bindingModel: string;
    standards: string[];
    status: string;
    documents: ShlManifestDocument[];
    files: unknown[];
  };
};

export type VerifierResult = {
  verified: boolean;
  trustLevel: TrustLevel;
  issuer?: string;
  holderDid?: string;
  protocol?: "trustcare-vp" | "oid4vp" | "oid4vci" | "shl" | "jwt" | "json" | "unknown";
  requestSummary?: string;
  matchedCredentialIds?: Array<number | string>;
  credentials?: unknown[];
  credential?: unknown;
  warnings?: string[];
  errors?: string[];
  transportDecision?: unknown;
  verificationChecklist?: unknown;
};

export type ReadinessContext =
  | "opd_visit"
  | "emergency"
  | "referral"
  | "cross_border"
  | "medical_tourist"
  | "insurance_claim"
  | "pharmacy_dispense";

export type ReadinessRequirement = {
  key: string;
  label: string;
  labelEn: string;
  category: string;
  required: boolean;
  cardTypes: string[];
  action: string;
  sourceHint: string;
};

export type ReadinessResult = {
  context: ReadinessContext;
  label: string;
  labelEn: string;
  score: number;
  criticalReady: boolean;
  requiredTotal: number;
  requiredReady: number;
  recommendedTotal: number;
  recommendedReady: number;
  ready: Array<ReadinessRequirement & { status: "ready"; matchedCards: WalletCard[] }>;
  missing: Array<ReadinessRequirement & { status: "missing" }>;
  selectedCardIds: number[];
  recommendedActions: string[];
};

export type ServiceReadinessContract = {
  contractId: string;
  context: ReadinessContext;
  version: string;
  status: "active" | "draft" | "deprecated" | string;
  label: string;
  labelEn: string;
  patientLabel: string;
  patientLabelEn: string;
  hospitalLabel: string;
  hospitalLabelEn: string;
  patientVisible: boolean;
  hospitalVisible: boolean;
  patientDirection: string;
  hospitalDirection: string;
  bundleTypes: { patient: string; hospital: string };
  recommendedTransports: string[];
  packetTrustPolicy?: Record<string, unknown>;
  requirements: ReadinessRequirement[];
  questionnaire?: Record<string, unknown>;
  vcTypes: string[];
  fhirResources: string[];
  consentPolicy: {
    legalBasis: string[];
    pdpaControls: string[];
    minimumNecessary: string;
    defaultExpiryMinutes: number;
  };
};

export type ContractHubCatalog = {
  version: string;
  status: string;
  contracts: ServiceReadinessContract[];
  singleDocumentCredentialContracts: unknown[];
  artifactTypes: Array<{ type: string; purpose: string; owner: string }>;
  compatibilityRules: string[];
};

export type ServiceBundleEnvelope = {
  bundleId: string;
  contractId: string;
  templateId: string;
  bundleType: string;
  context: ReadinessContext;
  audience: string;
  direction: string;
  status: "ready" | "partial" | "building" | string;
  readinessScore: number;
  requiredMissing: string[];
  createdAt: string;
  expiresAt: string;
  receiver: string;
  items: Array<{
    key: string;
    documentType: string;
    category: string;
    label: string;
    labelEn: string;
    required: boolean;
    status: "ready" | "missing" | string;
    matchedCardIds: Array<number | string>;
  }>;
  trustLayer?: Record<string, unknown>;
  fhirBundle?: Record<string, unknown>;
  operationOutcome?: Record<string, unknown>;
};

export type ServicePacketResponse = {
  checkId: number | string;
  patientId: number;
  readiness: ReadinessResult;
  presentationId: string;
  expiresAt: string;
  credentialCount: number;
  qrData: string;
  mode?: string;
  selectedFields?: string[];
};

export type CheckinQrResponse = {
  checkId: number | string;
  shlId: number | string;
  shlUrl: string;
  qrPayload: string;
  manifestUrl?: string;
  viewerUrl?: string;
  canonicalShlUrl?: string;
  webViewerUrl?: string;
  expiresAt: string;
  maxAccessCount?: number;
  passcodeRequired: boolean;
  passcodeHint?: string | null;
  accessCodeDelivery?: "separate_channel" | "not_required" | string;
  readinessScore: number;
  credentialCount: number;
  status: "ready" | "pending_review" | string;
  gatewayMode?: "portal_backend" | "static_demo_gateway" | "local_preview" | string;
  gatewayPublicationId?: string;
  gatewayBaseUrl?: string;
  storageProvider?: "s3" | "static" | "local" | string;
  manifestEndpointMethod?: "POST" | "GET" | "BOTH" | string;
  trustLayerStatus?: "standard_shl" | "pending_manifest_vp" | "certified_manifest_vp" | string;
  manifest?: Record<string, unknown>;
  portalRequest?: Record<string, unknown>;
  warnings?: string[];
};

export type WalletDocumentRequest = {
  id?: number | string;
  requestId?: string;
  context?: ReadinessContext;
  documentType: string;
  documentCategory?: string | null;
  sourceType?: string;
  sourceName?: string | null;
  requestFormat?: string;
  returnChannel?: string;
  packageScope?: string;
  trustPolicy?: string;
  requestedDocumentTypes?: string[];
  accessPolicy?: Record<string, unknown>;
  status: string;
  notes?: string | null;
  createdAt?: string | null;
};

export type WalletImportJob = {
  importId: string;
  status: string;
  context: ReadinessContext;
  sourceType: string;
  documentType?: string;
  dqiScore?: number;
  hash?: string;
  documentReference?: Record<string, unknown>;
};

export type WalletStoredObjectType =
  | "vc"
  | "vp"
  | "shl"
  | "shl_manifest"
  | "manifest_vp"
  | "holder_vc"
  | "sync_receipt"
  | "document_reference"
  | "oid4vci_offer"
  | "oid4vp_request"
  | "service_packet";

export type WalletStoredObject = {
  id: string;
  type: WalletStoredObjectType;
  title: string;
  subtitle?: string;
  status: "active" | "pending" | "expired" | "verified" | "invalid" | string;
  protocol?: "trustcare" | "oid4vci" | "oid4vp" | "shl" | "fhir" | "document_reference";
  createdAt: string;
  expiresAt?: string | null;
  source?: string;
  payload: unknown;
};

export type WalletExchangeFormat =
  | "trustcare-vc-json"
  | "trustcare-vp-json"
  | "trustcare-hybrid-vp-shl-json"
  | "shl-link"
  | "shl-json"
  | "oid4vci-offer"
  | "oid4vp-request"
  | "jwt"
  | "raw-json"
  | "unknown";

export type WalletImportResult = {
  ok: boolean;
  format: WalletExchangeFormat;
  protocol?: "trustcare" | "oid4vci" | "oid4vp" | "shl";
  object?: WalletStoredObject;
  matchedCredentialIds?: Array<number | string>;
  warnings: string[];
  errors: string[];
};

export type WalletExportResult = {
  ok: boolean;
  format: WalletExchangeFormat;
  fileName: string;
  mimeType: string;
  data: string;
  qrPayload?: string;
  warnings: string[];
};

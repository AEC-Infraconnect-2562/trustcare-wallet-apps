export type Language = "th" | "en";
export type ThemeMode = "light" | "dark" | "system";

export type CredentialStatus = "active" | "revoked" | "expired" | "superseded" | "suspended" | string;

export type TrustLevel = "green" | "yellow" | "red" | "verified" | "warning" | "unknown";

export type WalletCard = {
  id: number;
  cardType: string;
  displayName: string;
  displayNameEn?: string | null;
  documentCategory: string;
  credentialId: number;
  credentialStatus: CredentialStatus;
  credentialData?: Record<string, unknown> | null;
  credentialType?: string | null;
  issuerHospitalName?: string | null;
  issuerDid?: string | null;
  holderDid?: string | null;
  patientAvatarUrl?: string | null;
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
  viewerUrl?: string | null;
  shlUrl?: string | null;
  qrPayload?: string | null;
  manifestCredentialId?: string | null;
  presentationId?: string | null;
  passcodeRequired?: boolean;
  currentAccessCount?: number;
  maxAccessCount?: number | null;
  expiresAt?: string | null;
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


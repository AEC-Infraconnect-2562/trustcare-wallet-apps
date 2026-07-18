import {
  TrustCareContractError,
  type TrustCareValidationIssue,
} from "./validation";

export const WALLET_EXCHANGE_V2_CONTRACT_VERSION =
  "2026.07.wallet-exchange.v2.1.strict-w3c" as const;
export const PORTAL_WALLET_V2_CONTRACT_VERSION =
  "2026.07.portal-wallet.v4" as const;
/** Inspected Wallet baseline for provenance only; never a compatibility gate. */
export const WALLET_RENDERER_REFERENCE_COMMIT =
  "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f" as const;

export const WALLET_EXCHANGE_V2_SCOPES = [
  "credentials:read",
  "credentials:request",
  "credentials:present",
  "documents:read",
  "documents:write",
] as const;

export const WALLET_EXCHANGE_V2_CONTEXTS = [
  "opd_visit",
  "emergency",
  "referral",
  "cross_border",
  "medical_tourist",
  "insurance_claim",
  "pharmacy_dispense",
] as const;

export const WALLET_EXCHANGE_V2_HOSPITAL_CODES = ["TCC", "TCP", "TCM"] as const;

export type WalletExchangeScope = (typeof WALLET_EXCHANGE_V2_SCOPES)[number];
export type WalletExchangeServiceContext =
  (typeof WALLET_EXCHANGE_V2_CONTEXTS)[number];
export type WalletExchangeHospitalCode =
  (typeof WALLET_EXCHANGE_V2_HOSPITAL_CODES)[number];

export type WalletExchangeDiscovery = {
  name: "TrustCare Portal Wallet Exchange API";
  version: "2.0.1";
  contractVersion: typeof WALLET_EXCHANGE_V2_CONTRACT_VERSION;
  authorization: {
    challengeEndpoint: string;
    sessionEndpoint: string;
    holderProofType: "trustcare-wallet-session+jwt";
    accessTokenType: "DPoP";
    dpopSpecification: "RFC 9449";
    scopes: WalletExchangeScope[];
  };
  endpoints: {
    credentialSync: string;
    credentialSyncAck: string;
    clinicalDocumentGraphChanges: string;
    credentialRequests: string;
    documentSubmissions: string;
    publicContracts: string;
    shareGateway: string;
    issuerJwks: string;
    shlAssociations: string;
    shlCertificationRequests: string;
  };
  protocols: {
    credentialLifecycle: string;
    presentation: "Wallet-created VP JWT or Certified SHL package association with a separate Holder VP";
    certifiedShl: string;
    manifestUrl: "Plain SHL HTTPS /s/{256-bit-token} URL, maximum 128 characters; no alternate manifest route is accepted";
    plainShlManifestUrlMaxLength: 128;
    compactJwsDigest: "SHA-256 over the exact UTF-8 bytes of the compact JWS string";
    documentMetadata: string;
    errors: "RFC 9457 problem details";
  };
  ownership: {
    holderKeys: "wallet";
    vpCreation: "wallet";
    renderer: "wallet";
    hospitalIssuerKeys: "portal";
    makerChecker: "portal";
    incomingVerification: "portal";
  };
  renderer: {
    repository: "AEC-Infraconnect-2562/trustcare-wallet-apps";
    referenceCommit: string;
    referenceCommitRole: "provenance_only";
    compatibilityGate: "contract_profile_and_schema";
    renderVersion: string;
    modelPackage: "@trustcare/wallet-core";
    webPackage: "@trustcare/ui-web";
    rule: string;
  };
};

export type WalletSessionChallengeRequest = {
  appId: string;
  holderDid: string;
  requestedScopes: WalletExchangeScope[];
};

export type WalletSessionChallenge = {
  challengeId: string;
  expiresAt: string;
  proof: {
    protectedHeader: {
      typ: "trustcare-wallet-session+jwt";
      alg: "EdDSA" | "ES256";
      kid: string;
    };
    payload: {
      iss: string;
      sub: string;
      aud: string;
      jti: string;
      nonce: string;
      purpose: "trustcare-wallet-exchange-session";
      iat: number;
      exp: number;
    };
  };
};

export type WalletSessionCompletionRequest = {
  challengeId: string;
  proofJwt: string;
};

export type WalletSession = {
  access_token: string;
  token_type: "DPoP";
  expires_in: number;
  scope: string;
  cnf: { jkt: string };
};

export type WalletKnownCredential = {
  credentialId: string;
  contentHash: string;
  status: string;
};

export type WalletSyncRequest = {
  cursor?: string;
  limit?: number;
  knownCredentials?: WalletKnownCredential[];
};

export type WalletCredentialProof = {
  type: "jwt";
  jwt: string;
  alg: string | null;
  kid: string | null;
  issuer: string | null;
};

export type WalletSyncedCredential = {
  credentialId: string;
  cardType: string;
  credentialType: string;
  displayName: string;
  displayNameEn: string | null;
  documentCategory: string | null;
  credentialStatus: "active";
  credentialData: Record<string, unknown> | null;
  proof: WalletCredentialProof | null;
  issuerDid: string | null;
  issuerHospitalName: string | null;
  holderDid: string;
  sourceSystem: "trustcare_portal";
  lineageKey: string;
  version: string;
  contentHash: string;
  issuedAt: string;
  expiresAt: string | null;
  updatedAt: string;
  deliveryState: "signed";
  renderer: {
    authority: "trustcare_wallet";
    repository: "AEC-Infraconnect-2562/trustcare-wallet-apps";
    referenceCommit: string;
    referenceCommitRole: "provenance_only";
    compatibilityGate: "contract_profile_and_schema";
    renderVersion: string;
  };
};

export type WalletSyncUpsertChange = {
  eventId: string;
  type: "credential.upsert";
  credentialId: string;
  status: "active";
  occurredAt: string;
  contentHash: string;
  credential: WalletSyncedCredential;
};

export type WalletSyncStatusChange = {
  eventId: string;
  type: "credential.status";
  credentialId: string;
  status: "suspended" | "revoked" | "expired";
  occurredAt: string;
  lifecycle: {
    effectiveAt: string;
    reasonCode: string;
  };
};

export type WalletSyncChange = WalletSyncUpsertChange | WalletSyncStatusChange;

export type WalletSyncPage = {
  schema: "trustcare.wallet.sync.v2";
  contractVersion: typeof WALLET_EXCHANGE_V2_CONTRACT_VERSION;
  syncId: string;
  mode: "initial" | "delta";
  changes: WalletSyncChange[];
  nextCursor: string;
  hasMore: boolean;
  serverTime: string;
};

export type WalletSyncAckOutcome =
  | "applied"
  | "already_current"
  | "archived"
  | "rejected";

export type WalletSyncAckRequest = {
  syncId: string;
  cursor: string;
  results: Array<{
    eventId: string;
    outcome: WalletSyncAckOutcome;
    reasonCode?: string;
  }>;
};

export type WalletSyncAck = {
  schema: "trustcare.wallet.sync-ack.v1";
  receiptId: string;
  syncId: string;
  acceptedAt: string;
  summary: {
    applied: number;
    alreadyCurrent: number;
    archived: number;
    rejected: number;
  };
  idempotent: boolean;
  note: string;
};

export type WalletCredentialRequestInput = {
  clientRequestId: string;
  targetHospitalCode: WalletExchangeHospitalCode;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  credentialTypes: string[];
  notes?: string;
};

export type WalletCredentialRequestState =
  | "received"
  | "pending_review"
  | "in_progress"
  | "ready"
  | "partial"
  | "completed"
  | "rejected"
  | "cancelled";

export type WalletCredentialRequest = {
  schema: "trustcare.wallet.credential-request.v1";
  requestId: string;
  clientRequestId: string;
  status: WalletCredentialRequestState;
  credentialTypes: string[];
  statusUrl: string;
  nextAction: "wait_for_maker_checker";
  sandboxRunId?: string;
  createdAt: string;
  idempotent: boolean;
};

export type WalletCredentialRequestItemState =
  | "draft"
  | "requested"
  | "pending_consent"
  | "imported"
  | "needs_review"
  | "converted_to_vc"
  | "rejected"
  | "cancelled";

export type WalletCredentialRequestStatus = {
  schema: "trustcare.wallet.credential-request-status.v1";
  requestId: string;
  clientRequestId: string;
  status: "pending_review" | "in_progress" | "ready" | "partial" | "rejected";
  items: Array<{
    requestId: string;
    documentType: string;
    status: WalletCredentialRequestItemState;
    reasonCode: string;
    nextAction:
      | "wait_for_provider"
      | "complete_consent"
      | "sync_credentials"
      | "review_provider_outcome";
    updatedAt: string;
  }>;
  nextAction: "wait_for_maker_checker" | "sync_credentials";
  sandboxRunId?: string;
  updatedAt: string;
};

export type WalletDirectVpTransport = {
  mode: "direct_vp";
  vpJwt: string;
};

export type WalletShareGatewayBinding = {
  purpose: string;
  recipient: string;
  audience: string;
  subjectDigest: string;
  packageDigest: string;
  contextDigest: string;
};

export type WalletShareGatewayTransport = {
  mode: "share_gateway";
  artifactId: string;
  binding: WalletShareGatewayBinding;
};

export type WalletSubmissionRequest = {
  clientSubmissionId: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  consentRef: string;
  transport: WalletDirectVpTransport | WalletShareGatewayTransport;
};

export type WalletSubmissionResultStatus =
  | "queued"
  | "processing"
  | "needs_review"
  | "ready"
  | "rejected"
  | "cancelled";

export type WalletSubmissionResult = {
  credentialId: string;
  documentType: string;
  status: WalletSubmissionResultStatus;
  importId?: string;
  reasonCode?: string;
};

export type WalletSubmission = {
  schema: "trustcare.wallet.document-submission.v1";
  submissionId: string;
  clientSubmissionId: string;
  status: "received" | "needs_review" | "accepted" | "partial" | "rejected";
  presentationId: string;
  results: WalletSubmissionResult[];
  statusUrl: string;
  createdAt: string;
  updatedAt: string;
  idempotent: boolean;
};

export type WalletShlAssociationRequest = {
  clientAssociationId: string;
  consentRef: string;
  holderVpJwt: string;
};

export type WalletShlAssociation = {
  schema: "trustcare.wallet.shl-association.v2";
  shlId: number;
  packageId: string;
  status:
    | "pending_hospital_certification"
    | "pending_holder_presentation"
    | "active"
    | "suspended"
    | "revoked"
    | "expired"
    | "disabled"
    | "max_accessed";
  trustLevel: "hospital_certified" | "pending";
  appId: string | null;
  manifestCredentialId: string | null;
  manifestHash: string | null;
  sourceBundleHash: string | null;
  holderPresentationId: string;
  holderPresentationJwt: string;
  holderPresentationDigest: string;
  holderDid: string;
  consentRef: string | null;
  context: WalletExchangeServiceContext | null;
  purpose: string | null;
  recipient: string | null;
  audience: string | null;
  associatedAt: string;
  issuedAt: string;
  expiresAt: string | null;
  holderPresentationExpiresAt: string | null;
  lifecycle: {
    status: string;
    effectiveAt: string;
    reasonCode: string | null;
    holderPresentationStatus: "verified_at_association" | "proof_expired";
  };
  idempotent: boolean;
};

export type WalletProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  correlationId: string;
  retryable?: boolean;
};

export function assertWalletExchangeDiscovery(value: unknown): WalletExchangeDiscovery {
  const contract = "WalletExchangeDiscovery";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["name", "version", "contractVersion", "authorization", "endpoints", "protocols", "ownership", "renderer"], "$", issues);
  literalString(object, "name", "TrustCare Portal Wallet Exchange API", "$", issues);
  literalString(object, "version", "2.0.1", "$", issues);
  literalString(object, "contractVersion", WALLET_EXCHANGE_V2_CONTRACT_VERSION, "$", issues);

  validateDiscoveryAuthorization(object.authorization, issues);
  validateDiscoveryEndpoints(object.endpoints, issues);
  validateDiscoveryProtocols(object.protocols, issues);
  validateDiscoveryOwnership(object.ownership, issues);
  validateDiscoveryRenderer(object.renderer, issues);
  validateDiscoveryOriginCoherence(object, issues);
  return finish(contract, value, issues);
}

export function assertWalletSessionChallengeRequest(value: unknown): WalletSessionChallengeRequest {
  const contract = "WalletSessionChallengeRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["appId", "holderDid", "requestedScopes"], "$", issues);
  pathSafeString(object, "appId", "$", issues, 1, 128);
  didKeyString(object, "holderDid", "$", issues, 700);
  enumArray(object.requestedScopes, WALLET_EXCHANGE_V2_SCOPES, "$.requestedScopes", issues, 1, WALLET_EXCHANGE_V2_SCOPES.length);
  return finish(contract, value, issues);
}

export function assertWalletSessionChallenge(value: unknown): WalletSessionChallenge {
  const contract = "WalletSessionChallenge";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["challengeId", "expiresAt", "proof"], "$", issues);
  pathSafeString(object, "challengeId", "$", issues, 1, 100);
  isoDateString(object, "expiresAt", "$", issues);

  const proof = nestedObject(object.proof, "$.proof", issues);
  if (proof) {
    exactKeys(proof, ["protectedHeader", "payload"], "$.proof", issues);
    const header = nestedObject(proof.protectedHeader, "$.proof.protectedHeader", issues);
    const payload = nestedObject(proof.payload, "$.proof.payload", issues);
    if (header) {
      exactKeys(header, ["typ", "alg", "kid"], "$.proof.protectedHeader", issues);
      literalString(header, "typ", "trustcare-wallet-session+jwt", "$.proof.protectedHeader", issues);
      enumString(header, "alg", ["EdDSA", "ES256"], "$.proof.protectedHeader", issues);
      nonEmptyString(header, "kid", "$.proof.protectedHeader", issues, 1, 800);
    }
    if (payload) {
      exactKeys(payload, ["iss", "sub", "aud", "jti", "nonce", "purpose", "iat", "exp"], "$.proof.payload", issues);
      didKeyString(payload, "iss", "$.proof.payload", issues, 700);
      didKeyString(payload, "sub", "$.proof.payload", issues, 700);
      absoluteUrlString(payload, "aud", "$.proof.payload", issues);
      pathSafeString(payload, "jti", "$.proof.payload", issues, 1, 100);
      nonEmptyString(payload, "nonce", "$.proof.payload", issues, 20, 200);
      literalString(payload, "purpose", "trustcare-wallet-exchange-session", "$.proof.payload", issues);
      integer(payload, "iat", "$.proof.payload", issues, 0);
      integer(payload, "exp", "$.proof.payload", issues, 0);
      if (payload.iss !== payload.sub) issue(issues, "$.proof.payload.sub", "must equal iss");
      if (payload.jti !== object.challengeId) issue(issues, "$.proof.payload.jti", "must equal challengeId");
      if (typeof payload.iat === "number" && typeof payload.exp === "number" && payload.exp <= payload.iat) {
        issue(issues, "$.proof.payload.exp", "must be later than iat");
      }
      if (typeof payload.aud === "string" && !payload.aud.endsWith("/api/wallet/v2/sessions")) {
        issue(issues, "$.proof.payload.aud", "must target the Wallet Exchange sessions endpoint");
      }
      if (header && typeof header.kid === "string" && typeof payload.iss === "string" && !header.kid.startsWith(`${payload.iss}#`)) {
        issue(issues, "$.proof.protectedHeader.kid", "must be controlled by the holder DID");
      }
    }
  }
  return finish(contract, value, issues);
}

export function assertWalletSessionCompletionRequest(value: unknown): WalletSessionCompletionRequest {
  const contract = "WalletSessionCompletionRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["challengeId", "proofJwt"], "$", issues);
  pathSafeString(object, "challengeId", "$", issues, 1, 100);
  compactJwtString(object, "proofJwt", "$", issues, 80, 20_000);
  return finish(contract, value, issues);
}

export function assertWalletSession(value: unknown): WalletSession {
  const contract = "WalletSession";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["access_token", "token_type", "expires_in", "scope", "cnf"], "$", issues);
  regexString(object, "access_token", /^wxt_[A-Za-z0-9_-]+$/, "$", issues, "must be a Wallet Exchange access token");
  literalString(object, "token_type", "DPoP", "$", issues);
  integer(object, "expires_in", "$", issues, 300, 3_600);
  nonEmptyString(object, "scope", "$", issues, 1, 500);
  if (typeof object.scope === "string") {
    enumArray(object.scope.split(/\s+/), WALLET_EXCHANGE_V2_SCOPES, "$.scope", issues, 1, WALLET_EXCHANGE_V2_SCOPES.length);
  }
  const cnf = nestedObject(object.cnf, "$.cnf", issues);
  if (cnf) {
    exactKeys(cnf, ["jkt"], "$.cnf", issues);
    regexString(cnf, "jkt", /^[A-Za-z0-9_-]{43}$/, "$.cnf", issues, "must be a base64url SHA-256 JWK thumbprint");
  }
  return finish(contract, value, issues);
}

export function assertWalletSyncRequest(value: unknown): WalletSyncRequest {
  const contract = "WalletSyncRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["cursor", "limit", "knownCredentials"], "$", issues);
  optionalString(object, "cursor", "$", issues, 20, 2_000);
  optionalInteger(object, "limit", "$", issues, 1, 200);
  if (object.knownCredentials !== undefined) {
    const known = arrayValue(object.knownCredentials, "$.knownCredentials", issues, 0, 2_000);
    known?.forEach((entry, index) => validateKnownCredential(entry, `$.knownCredentials[${index}]`, issues));
  }
  return finish(contract, value, issues);
}

export function assertWalletSyncPage(value: unknown): WalletSyncPage {
  const contract = "WalletSyncPage";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["schema", "contractVersion", "syncId", "mode", "changes", "nextCursor", "hasMore", "serverTime"], "$", issues);
  literalString(object, "schema", "trustcare.wallet.sync.v2", "$", issues);
  literalString(object, "contractVersion", WALLET_EXCHANGE_V2_CONTRACT_VERSION, "$", issues);
  pathSafeString(object, "syncId", "$", issues, 1, 100);
  enumString(object, "mode", ["initial", "delta"], "$", issues);
  const changes = arrayValue(object.changes, "$.changes", issues, 0, 200);
  changes?.forEach((change, index) => validateSyncChange(change, `$.changes[${index}]`, issues));
  nonEmptyString(object, "nextCursor", "$", issues, 20, 2_000);
  booleanValue(object, "hasMore", "$", issues);
  isoDateString(object, "serverTime", "$", issues);
  return finish(contract, value, issues);
}

export function assertWalletSyncAckRequest(value: unknown): WalletSyncAckRequest {
  const contract = "WalletSyncAckRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["syncId", "cursor", "results"], "$", issues);
  pathSafeString(object, "syncId", "$", issues, 1, 100);
  nonEmptyString(object, "cursor", "$", issues, 20, 2_000);
  const results = arrayValue(object.results, "$.results", issues, 0, 500);
  results?.forEach((result, index) => {
    const path = `$.results[${index}]`;
    const entry = nestedObject(result, path, issues);
    if (!entry) return;
    exactKeys(entry, ["eventId", "outcome", "reasonCode"], path, issues);
    pathSafeString(entry, "eventId", path, issues, 1, 100);
    enumString(entry, "outcome", ["applied", "already_current", "archived", "rejected"], path, issues);
    optionalString(entry, "reasonCode", path, issues, 0, 80);
  });
  return finish(contract, value, issues);
}

export function assertWalletSyncAck(value: unknown): WalletSyncAck {
  const contract = "WalletSyncAck";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["schema", "receiptId", "syncId", "acceptedAt", "summary", "idempotent", "note"], "$", issues);
  literalString(object, "schema", "trustcare.wallet.sync-ack.v1", "$", issues);
  pathSafeString(object, "receiptId", "$", issues, 1, 100);
  pathSafeString(object, "syncId", "$", issues, 1, 100);
  isoDateString(object, "acceptedAt", "$", issues);
  const summary = nestedObject(object.summary, "$.summary", issues);
  if (summary) {
    exactKeys(summary, ["applied", "alreadyCurrent", "archived", "rejected"], "$.summary", issues);
    for (const key of ["applied", "alreadyCurrent", "archived", "rejected"]) integer(summary, key, "$.summary", issues, 0);
  }
  booleanValue(object, "idempotent", "$", issues);
  nonEmptyString(object, "note", "$", issues, 1, 500);
  return finish(contract, value, issues);
}

export function assertWalletCredentialRequestInput(value: unknown): WalletCredentialRequestInput {
  const contract = "WalletCredentialRequestInput";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["clientRequestId", "targetHospitalCode", "context", "purpose", "consentRef", "credentialTypes", "notes"], "$", issues);
  pathSafeString(object, "clientRequestId", "$", issues, 1, 100);
  enumString(object, "targetHospitalCode", WALLET_EXCHANGE_V2_HOSPITAL_CODES, "$", issues);
  enumString(object, "context", WALLET_EXCHANGE_V2_CONTEXTS, "$", issues);
  nonEmptyString(object, "purpose", "$", issues, 1, 128);
  nonEmptyString(object, "consentRef", "$", issues, 1, 255);
  stringArray(object.credentialTypes, "$.credentialTypes", issues, 1, 24, 1, 100);
  optionalString(object, "notes", "$", issues, 0, 1_000);
  return finish(contract, value, issues);
}

export function assertWalletCredentialRequest(value: unknown): WalletCredentialRequest {
  const contract = "WalletCredentialRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["schema", "requestId", "clientRequestId", "status", "credentialTypes", "statusUrl", "nextAction", "sandboxRunId", "createdAt", "idempotent"], "$", issues);
  literalString(object, "schema", "trustcare.wallet.credential-request.v1", "$", issues);
  pathSafeString(object, "requestId", "$", issues, 1, 100);
  pathSafeString(object, "clientRequestId", "$", issues, 1, 100);
  enumString(object, "status", ["received", "pending_review", "in_progress", "ready", "partial", "completed", "rejected", "cancelled"], "$", issues);
  stringArray(object.credentialTypes, "$.credentialTypes", issues, 1, 24, 1, 100);
  absoluteUrlString(object, "statusUrl", "$", issues);
  literalString(object, "nextAction", "wait_for_maker_checker", "$", issues);
  optionalSandboxRunId(object, "sandboxRunId", "$", issues);
  isoDateString(object, "createdAt", "$", issues);
  booleanValue(object, "idempotent", "$", issues);
  return finish(contract, value, issues);
}

export function assertWalletCredentialRequestStatus(value: unknown): WalletCredentialRequestStatus {
  const contract = "WalletCredentialRequestStatus";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["schema", "requestId", "clientRequestId", "status", "items", "nextAction", "sandboxRunId", "updatedAt"], "$", issues);
  literalString(object, "schema", "trustcare.wallet.credential-request-status.v1", "$", issues);
  pathSafeString(object, "requestId", "$", issues, 1, 100);
  pathSafeString(object, "clientRequestId", "$", issues, 1, 100);
  enumString(object, "status", ["pending_review", "in_progress", "ready", "partial", "rejected"], "$", issues);
  const items = arrayValue(object.items, "$.items", issues, 1, 24);
  items?.forEach((item, index) => validateCredentialRequestItem(item, `$.items[${index}]`, issues));
  enumString(object, "nextAction", ["wait_for_maker_checker", "sync_credentials"], "$", issues);
  if ((object.status === "ready" || object.status === "partial") && object.nextAction !== "sync_credentials") {
    issue(issues, "$.nextAction", "must be sync_credentials when status is ready or partial");
  }
  if (object.status !== "ready" && object.status !== "partial" && object.nextAction !== "wait_for_maker_checker") {
    issue(issues, "$.nextAction", "must wait for Maker/Checker until credentials are ready");
  }
  optionalSandboxRunId(object, "sandboxRunId", "$", issues);
  isoDateString(object, "updatedAt", "$", issues);
  return finish(contract, value, issues);
}

export function assertWalletSubmissionRequest(value: unknown): WalletSubmissionRequest {
  const contract = "WalletSubmissionRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["clientSubmissionId", "context", "purpose", "consentRef", "transport"], "$", issues);
  pathSafeString(object, "clientSubmissionId", "$", issues, 1, 100);
  enumString(object, "context", WALLET_EXCHANGE_V2_CONTEXTS, "$", issues);
  nonEmptyString(object, "purpose", "$", issues, 1, 128);
  nonEmptyString(object, "consentRef", "$", issues, 1, 255);
  validateSubmissionTransport(object.transport, issues);
  const transport = recordOrNull(object.transport);
  const binding = recordOrNull(transport?.binding);
  if (
    transport?.mode === "share_gateway" &&
    binding &&
    binding.purpose !== object.purpose
  ) {
    issue(
      issues,
      "$.transport.binding.purpose",
      "must equal the submission purpose",
    );
  }
  return finish(contract, value, issues);
}

export function assertWalletSubmission(value: unknown): WalletSubmission {
  return assertSubmissionResponse(value, "WalletSubmission");
}

export function assertWalletSubmissionStatus(value: unknown): WalletSubmission {
  return assertSubmissionResponse(value, "WalletSubmissionStatus");
}

export function assertWalletShlAssociationRequest(
  value: unknown,
): WalletShlAssociationRequest {
  const contract = "WalletShlAssociationRequest";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(
    object,
    ["clientAssociationId", "consentRef", "holderVpJwt"],
    "$",
    issues,
  );
  pathSafeString(object, "clientAssociationId", "$", issues, 1, 100);
  nonEmptyString(object, "consentRef", "$", issues, 1, 255);
  compactJwtString(object, "holderVpJwt", "$", issues, 80, 1_500_000);
  return finish(contract, value, issues);
}

export function assertWalletShlAssociation(
  value: unknown,
): WalletShlAssociation {
  const contract = "WalletShlAssociation";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(
    object,
    [
      "schema",
      "shlId",
      "packageId",
      "status",
      "trustLevel",
      "appId",
      "manifestCredentialId",
      "manifestHash",
      "sourceBundleHash",
      "holderPresentationId",
      "holderPresentationJwt",
      "holderPresentationDigest",
      "holderDid",
      "consentRef",
      "context",
      "purpose",
      "recipient",
      "audience",
      "associatedAt",
      "issuedAt",
      "expiresAt",
      "holderPresentationExpiresAt",
      "lifecycle",
      "idempotent",
    ],
    "$",
    issues,
  );
  literalString(
    object,
    "schema",
    "trustcare.wallet.shl-association.v2",
    "$",
    issues,
  );
  integer(object, "shlId", "$", issues, 1);
  nonEmptyString(object, "packageId", "$", issues, 1, 255);
  enumString(
    object,
    "status",
    [
      "pending_hospital_certification",
      "pending_holder_presentation",
      "active",
      "suspended",
      "revoked",
      "expired",
      "disabled",
      "max_accessed",
    ],
    "$",
    issues,
  );
  enumString(
    object,
    "trustLevel",
    ["hospital_certified", "pending"],
    "$",
    issues,
  );
  nullableString(object, "appId", "$", issues, 1, 128);
  nullableString(object, "manifestCredentialId", "$", issues, 1, 500);
  nullableSha256String(object, "manifestHash", "$", issues);
  nullableSha256String(object, "sourceBundleHash", "$", issues);
  nonEmptyString(object, "holderPresentationId", "$", issues, 1, 255);
  compactJwtString(object, "holderPresentationJwt", "$", issues, 80, 1_500_000);
  sha256String(object, "holderPresentationDigest", "$", issues);
  didKeyString(object, "holderDid", "$", issues, 700);
  nullableString(object, "consentRef", "$", issues, 1, 255);
  if (object.context !== null) {
    enumString(object, "context", WALLET_EXCHANGE_V2_CONTEXTS, "$", issues);
  }
  nullableString(object, "purpose", "$", issues, 1, 500);
  nullableString(object, "recipient", "$", issues, 1, 700);
  nullableAbsoluteUrlString(object, "audience", "$", issues);
  isoDateString(object, "associatedAt", "$", issues);
  isoDateString(object, "issuedAt", "$", issues);
  nullableIsoDateString(object, "expiresAt", "$", issues);
  nullableIsoDateString(object, "holderPresentationExpiresAt", "$", issues);
  const lifecycle = nestedObject(object.lifecycle, "$.lifecycle", issues);
  if (lifecycle) {
    exactKeys(
      lifecycle,
      [
        "status",
        "effectiveAt",
        "reasonCode",
        "holderPresentationStatus",
      ],
      "$.lifecycle",
      issues,
    );
    nonEmptyString(lifecycle, "status", "$.lifecycle", issues, 1, 80);
    isoDateString(lifecycle, "effectiveAt", "$.lifecycle", issues);
    nullableString(lifecycle, "reasonCode", "$.lifecycle", issues, 1, 100);
    enumString(
      lifecycle,
      "holderPresentationStatus",
      ["verified_at_association", "proof_expired"],
      "$.lifecycle",
      issues,
    );
    if (lifecycle.status !== object.status) {
      issue(issues, "$.lifecycle.status", "must equal the SHL status");
    }
  }
  if (
    (object.status === "active") !==
    (object.trustLevel === "hospital_certified")
  ) {
    issue(issues, "$.trustLevel", "must reflect the active SHL lifecycle");
  }
  booleanValue(object, "idempotent", "$", issues);
  return finish(contract, value, issues);
}

export function assertWalletProblemDetails(value: unknown): WalletProblemDetails {
  const contract = "WalletProblemDetails";
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["type", "title", "status", "detail", "code", "instance", "correlationId", "retryable"], "$", issues);
  absoluteUrlString(object, "type", "$", issues);
  nonEmptyString(object, "title", "$", issues, 1, 500);
  integer(object, "status", "$", issues, 400, 599);
  nonEmptyString(object, "detail", "$", issues, 1, 4_000);
  nonEmptyString(object, "code", "$", issues, 1, 200);
  optionalString(object, "instance", "$", issues, 1, 1_000);
  pathSafeString(object, "correlationId", "$", issues, 1, 100);
  optionalBoolean(object, "retryable", "$", issues);
  return finish(contract, value, issues);
}

function validateDiscoveryAuthorization(value: unknown, issues: TrustCareValidationIssue[]) {
  const path = "$.authorization";
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["challengeEndpoint", "sessionEndpoint", "holderProofType", "accessTokenType", "dpopSpecification", "scopes"], path, issues);
  absoluteUrlString(object, "challengeEndpoint", path, issues);
  absoluteUrlString(object, "sessionEndpoint", path, issues);
  literalString(object, "holderProofType", "trustcare-wallet-session+jwt", path, issues);
  literalString(object, "accessTokenType", "DPoP", path, issues);
  literalString(object, "dpopSpecification", "RFC 9449", path, issues);
  enumArray(object.scopes, WALLET_EXCHANGE_V2_SCOPES, `${path}.scopes`, issues, WALLET_EXCHANGE_V2_SCOPES.length, WALLET_EXCHANGE_V2_SCOPES.length);
}

function validateDiscoveryEndpoints(value: unknown, issues: TrustCareValidationIssue[]) {
  const path = "$.endpoints";
  const object = nestedObject(value, path, issues);
  if (!object) return;
  const requiredKeys = ["credentialSync", "credentialSyncAck", "clinicalDocumentGraphChanges", "credentialRequests", "documentSubmissions", "shlAssociations", "shlCertificationRequests", "publicContracts", "shareGateway", "issuerJwks"];
  exactKeys(object, requiredKeys, path, issues);
  requiredKeys.forEach((key) =>
    absoluteUrlString(object, key, path, issues),
  );
  if (typeof object.issuerJwks === "string") {
    try {
      if (new URL(object.issuerJwks).pathname !== "/.well-known/jwks.json") {
        issue(
          issues,
          `${path}.issuerJwks`,
          "must use the live Portal network JWKS endpoint",
        );
      }
    } catch {
      // The field-level URL validator reports malformed values.
    }
  }
}

function validateDiscoveryOriginCoherence(
  discovery: Record<string, unknown>,
  issues: TrustCareValidationIssue[],
) {
  const authorization = recordOrNull(discovery.authorization);
  const endpoints = recordOrNull(discovery.endpoints);
  const urls = [
    authorization?.challengeEndpoint,
    authorization?.sessionEndpoint,
    endpoints?.credentialSync,
    endpoints?.credentialSyncAck,
    endpoints?.clinicalDocumentGraphChanges,
    endpoints?.credentialRequests,
    endpoints?.documentSubmissions,
    endpoints?.publicContracts,
    endpoints?.shareGateway,
    endpoints?.issuerJwks,
    endpoints?.shlAssociations,
    endpoints?.shlCertificationRequests,
  ].filter((value): value is string => typeof value === "string");
  const origins = new Set<string>();
  for (const value of urls) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // The field-level URL validator reports malformed values.
    }
  }
  if (origins.size > 1) {
    issue(
      issues,
      "$.endpoints",
      "must all resolve from the same live Portal origin",
    );
  }
}

function validateDiscoveryProtocols(value: unknown, issues: TrustCareValidationIssue[]) {
  const path = "$.protocols";
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["credentialLifecycle", "presentation", "certifiedShl", "manifestUrl", "plainShlManifestUrlMaxLength", "compactJwsDigest", "documentMetadata", "errors"], path, issues);
  nonEmptyString(object, "credentialLifecycle", path, issues, 1, 300);
  literalString(
    object,
    "presentation",
    "Wallet-created VP JWT or Certified SHL package association with a separate Holder VP",
    path,
    issues,
  );
  nonEmptyString(object, "certifiedShl", path, issues, 1, 300);
  literalString(
    object,
    "manifestUrl",
    "Plain SHL HTTPS /s/{256-bit-token} URL, maximum 128 characters; no alternate manifest route is accepted",
    path,
    issues,
  );
  literalNumber(object, "plainShlManifestUrlMaxLength", 128, path, issues);
  literalString(
    object,
    "compactJwsDigest",
    "SHA-256 over the exact UTF-8 bytes of the compact JWS string",
    path,
    issues,
  );
  nonEmptyString(object, "documentMetadata", path, issues, 1, 300);
  literalString(object, "errors", "RFC 9457 problem details", path, issues);
}

function validateDiscoveryOwnership(value: unknown, issues: TrustCareValidationIssue[]) {
  const path = "$.ownership";
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["holderKeys", "vpCreation", "renderer", "hospitalIssuerKeys", "makerChecker", "incomingVerification"], path, issues);
  literalString(object, "holderKeys", "wallet", path, issues);
  literalString(object, "vpCreation", "wallet", path, issues);
  literalString(object, "renderer", "wallet", path, issues);
  literalString(object, "hospitalIssuerKeys", "portal", path, issues);
  literalString(object, "makerChecker", "portal", path, issues);
  literalString(object, "incomingVerification", "portal", path, issues);
}

function validateDiscoveryRenderer(value: unknown, issues: TrustCareValidationIssue[]) {
  const path = "$.renderer";
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["repository", "referenceCommit", "referenceCommitRole", "compatibilityGate", "renderVersion", "modelPackage", "webPackage", "rule"], path, issues);
  literalString(object, "repository", "AEC-Infraconnect-2562/trustcare-wallet-apps", path, issues);
  gitCommitString(object, "referenceCommit", path, issues);
  literalString(object, "referenceCommitRole", "provenance_only", path, issues);
  literalString(object, "compatibilityGate", "contract_profile_and_schema", path, issues);
  nonEmptyString(object, "renderVersion", path, issues, 1, 100);
  literalString(object, "modelPackage", "@trustcare/wallet-core", path, issues);
  literalString(object, "webPackage", "@trustcare/ui-web", path, issues);
  nonEmptyString(object, "rule", path, issues, 1, 500);
}

function validateKnownCredential(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["credentialId", "contentHash", "status"], path, issues);
  nonEmptyString(object, "credentialId", path, issues, 1, 255);
  sha256String(object, "contentHash", path, issues);
  nonEmptyString(object, "status", path, issues, 1, 32);
}

function validateSyncChange(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  const object = nestedObject(value, path, issues);
  if (!object) return;
  enumString(object, "type", ["credential.upsert", "credential.status"], path, issues);
  if (object.type === "credential.upsert") {
    exactKeys(object, ["eventId", "type", "credentialId", "status", "occurredAt", "contentHash", "credential"], path, issues);
    literalString(object, "status", "active", path, issues);
    sha256String(object, "contentHash", path, issues);
    validateSyncedCredential(object.credential, `${path}.credential`, issues);
    const credential = recordOrNull(object.credential);
    if (credential && credential.credentialId !== object.credentialId) issue(issues, `${path}.credential.credentialId`, "must equal the change credentialId");
    if (credential && credential.contentHash !== object.contentHash) issue(issues, `${path}.credential.contentHash`, "must equal the change contentHash");
  } else if (object.type === "credential.status") {
    exactKeys(object, ["eventId", "type", "credentialId", "status", "occurredAt", "lifecycle"], path, issues);
    enumString(object, "status", ["suspended", "revoked", "expired"], path, issues);
    const lifecycle = nestedObject(object.lifecycle, `${path}.lifecycle`, issues);
    if (lifecycle) {
      exactKeys(lifecycle, ["effectiveAt", "reasonCode"], `${path}.lifecycle`, issues);
      isoDateString(lifecycle, "effectiveAt", `${path}.lifecycle`, issues);
      nonEmptyString(lifecycle, "reasonCode", `${path}.lifecycle`, issues, 1, 80);
    }
  } else {
    exactKeys(object, ["eventId", "type", "credentialId", "status", "occurredAt", "contentHash", "credential", "lifecycle"], path, issues);
  }
  pathSafeString(object, "eventId", path, issues, 1, 100);
  nonEmptyString(object, "credentialId", path, issues, 1, 255);
  isoDateString(object, "occurredAt", path, issues);
}

function validateSyncedCredential(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["credentialId", "cardType", "credentialType", "displayName", "displayNameEn", "documentCategory", "credentialStatus", "credentialData", "proof", "issuerDid", "issuerHospitalName", "holderDid", "sourceSystem", "lineageKey", "version", "contentHash", "issuedAt", "expiresAt", "updatedAt", "deliveryState", "renderer"], path, issues);
  nonEmptyString(object, "credentialId", path, issues, 1, 255);
  nonEmptyString(object, "cardType", path, issues, 1, 100);
  nonEmptyString(object, "credentialType", path, issues, 1, 100);
  nonEmptyString(object, "displayName", path, issues, 1, 500);
  nullableString(object, "displayNameEn", path, issues, 0, 500);
  nullableString(object, "documentCategory", path, issues, 0, 200);
  literalString(object, "credentialStatus", "active", path, issues);
  nullableObject(object.credentialData, `${path}.credentialData`, issues);
  validateCredentialProof(object.proof, `${path}.proof`, issues);
  nullableString(object, "issuerDid", path, issues, 0, 700);
  nullableString(object, "issuerHospitalName", path, issues, 0, 500);
  didKeyString(object, "holderDid", path, issues, 700);
  literalString(object, "sourceSystem", "trustcare_portal", path, issues);
  nonEmptyString(object, "lineageKey", path, issues, 1, 1_000);
  nonEmptyString(object, "version", path, issues, 1, 100);
  sha256String(object, "contentHash", path, issues);
  isoDateString(object, "issuedAt", path, issues);
  nullableIsoDateString(object, "expiresAt", path, issues);
  isoDateString(object, "updatedAt", path, issues);
  literalString(object, "deliveryState", "signed", path, issues);
  const renderer = nestedObject(object.renderer, `${path}.renderer`, issues);
  if (renderer) {
    exactKeys(renderer, ["authority", "repository", "referenceCommit", "referenceCommitRole", "compatibilityGate", "renderVersion"], `${path}.renderer`, issues);
    literalString(renderer, "authority", "trustcare_wallet", `${path}.renderer`, issues);
    literalString(renderer, "repository", "AEC-Infraconnect-2562/trustcare-wallet-apps", `${path}.renderer`, issues);
    gitCommitString(renderer, "referenceCommit", `${path}.renderer`, issues);
    literalString(renderer, "referenceCommitRole", "provenance_only", `${path}.renderer`, issues);
    literalString(renderer, "compatibilityGate", "contract_profile_and_schema", `${path}.renderer`, issues);
    nonEmptyString(renderer, "renderVersion", `${path}.renderer`, issues, 1, 100);
  }
  if (object.proof === null) issue(issues, `${path}.proof`, "is required for a strict signed VC delivery");
}

function validateCredentialProof(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  if (value === null) return;
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["type", "jwt", "alg", "kid", "issuer"], path, issues);
  literalString(object, "type", "jwt", path, issues);
  compactJwtString(object, "jwt", path, issues, 20, 1_500_000);
  nullableString(object, "alg", path, issues, 0, 100);
  nullableString(object, "kid", path, issues, 0, 1_000);
  nullableString(object, "issuer", path, issues, 0, 700);
}

function validateCredentialRequestItem(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["requestId", "documentType", "status", "reasonCode", "nextAction", "updatedAt"], path, issues);
  pathSafeString(object, "requestId", path, issues, 1, 100);
  nonEmptyString(object, "documentType", path, issues, 1, 100);
  enumString(object, "status", ["draft", "pending_consent", "requested", "imported", "needs_review", "converted_to_vc", "rejected", "cancelled"], path, issues);
  nonEmptyString(object, "reasonCode", path, issues, 1, 100);
  enumString(
    object,
    "nextAction",
    [
      "wait_for_provider",
      "complete_consent",
      "sync_credentials",
      "review_provider_outcome",
    ],
    path,
    issues,
  );
  isoDateString(object, "updatedAt", path, issues);
}

function validateSubmissionTransport(value: unknown, issues: TrustCareValidationIssue[]) {
  const path = "$.transport";
  const object = nestedObject(value, path, issues);
  if (!object) return;
  enumString(object, "mode", ["direct_vp", "share_gateway"], path, issues);
  if (object.mode === "direct_vp") {
    exactKeys(object, ["mode", "vpJwt"], path, issues);
    compactJwtString(object, "vpJwt", path, issues, 80, 1_500_000);
    return;
  }
  if (object.mode === "share_gateway") {
    exactKeys(object, ["mode", "artifactId", "binding"], path, issues);
    pathSafeString(object, "artifactId", path, issues, 1, 100);
    const binding = nestedObject(object.binding, `${path}.binding`, issues);
    if (!binding) return;
    exactKeys(binding, ["purpose", "recipient", "audience", "subjectDigest", "packageDigest", "contextDigest"], `${path}.binding`, issues);
    nonEmptyString(binding, "purpose", `${path}.binding`, issues, 1, 500);
    nonEmptyString(binding, "recipient", `${path}.binding`, issues, 1, 500);
    absoluteUrlString(binding, "audience", `${path}.binding`, issues, 700);
    sha256String(binding, "subjectDigest", `${path}.binding`, issues);
    sha256String(binding, "packageDigest", `${path}.binding`, issues);
    sha256String(binding, "contextDigest", `${path}.binding`, issues);
    return;
  }
  exactKeys(object, ["mode", "vpJwt", "artifactId", "binding"], path, issues);
}

function assertSubmissionResponse(value: unknown, contract: string): WalletSubmission {
  const issues: TrustCareValidationIssue[] = [];
  const object = rootObject(value, contract);
  exactKeys(object, ["schema", "submissionId", "clientSubmissionId", "status", "presentationId", "results", "statusUrl", "createdAt", "updatedAt", "idempotent"], "$", issues);
  literalString(object, "schema", "trustcare.wallet.document-submission.v1", "$", issues);
  pathSafeString(object, "submissionId", "$", issues, 1, 100);
  pathSafeString(object, "clientSubmissionId", "$", issues, 1, 100);
  enumString(object, "status", ["received", "needs_review", "accepted", "partial", "rejected"], "$", issues);
  pathSafeString(object, "presentationId", "$", issues, 1, 255);
  const results = arrayValue(object.results, "$.results", issues, 1, 200);
  results?.forEach((result, index) => validateSubmissionResult(result, `$.results[${index}]`, issues));
  absoluteUrlString(object, "statusUrl", "$", issues);
  isoDateString(object, "createdAt", "$", issues);
  isoDateString(object, "updatedAt", "$", issues);
  booleanValue(object, "idempotent", "$", issues);
  return finish(contract, value, issues);
}

function validateSubmissionResult(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  const object = nestedObject(value, path, issues);
  if (!object) return;
  exactKeys(object, ["credentialId", "documentType", "status", "importId", "reasonCode"], path, issues);
  nonEmptyString(object, "credentialId", path, issues, 1, 255);
  nonEmptyString(object, "documentType", path, issues, 1, 100);
  enumString(object, "status", ["queued", "processing", "needs_review", "ready", "rejected", "cancelled"], path, issues);
  optionalString(object, "importId", path, issues, 1, 100);
  optionalString(object, "reasonCode", path, issues, 1, 100);
  if (object.status === "rejected" && object.importId === undefined && object.reasonCode === undefined) {
    issue(issues, `${path}.reasonCode`, "is required for a rejected credential without an importId");
  }
  if (object.status !== "rejected" && object.status !== "cancelled" && object.importId === undefined) {
    issue(issues, `${path}.importId`, "is required for an accepted credential review item");
  }
}

function rootObject(value: unknown, contract: string): Record<string, unknown> {
  const object = recordOrNull(value);
  if (!object) throw new TrustCareContractError(contract, [{ path: "$", message: "must be an object" }]);
  return object;
}

function nestedObject(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  const object = recordOrNull(value);
  if (!object) issue(issues, path, "must be an object");
  return object;
}

function nullableObject(value: unknown, path: string, issues: TrustCareValidationIssue[]) {
  if (value !== null && !recordOrNull(value)) issue(issues, path, "must be an object or null");
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(object: Record<string, unknown>, allowed: readonly string[], path: string, issues: TrustCareValidationIssue[]) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) issue(issues, `${path === "$" ? "$" : path}.${key}`, "is not allowed by this contract version");
  }
}

function nonEmptyString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = object[key];
  if (typeof value !== "string" || value.length < min || value.length > max) issue(issues, `${path}.${key}`, `must be a string between ${min} and ${max} characters`);
}

function optionalString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (object[key] === undefined) return;
  nonEmptyString(object, key, path, issues, min, max);
}

function nullableString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (object[key] === null) return;
  nonEmptyString(object, key, path, issues, min, max);
}

function literalString(object: Record<string, unknown>, key: string, expected: string, path: string, issues: TrustCareValidationIssue[]) {
  if (object[key] !== expected) issue(issues, `${path}.${key}`, `must equal ${expected}`);
}

function literalNumber(object: Record<string, unknown>, key: string, expected: number, path: string, issues: TrustCareValidationIssue[]) {
  if (object[key] !== expected) issue(issues, `${path}.${key}`, `must equal ${expected}`);
}

function enumString<const T extends readonly string[]>(object: Record<string, unknown>, key: string, allowed: T, path: string, issues: TrustCareValidationIssue[]) {
  if (typeof object[key] !== "string" || !allowed.includes(object[key] as T[number])) issue(issues, `${path}.${key}`, `must be one of ${allowed.join(", ")}`);
}

function integer(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const value = object[key];
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) issue(issues, `${path}.${key}`, `must be an integer between ${min} and ${max}`);
}

function optionalInteger(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min: number, max: number) {
  if (object[key] === undefined) return;
  integer(object, key, path, issues, min, max);
}

function booleanValue(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[]) {
  if (typeof object[key] !== "boolean") issue(issues, `${path}.${key}`, "must be a boolean");
}

function optionalBoolean(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[]) {
  if (object[key] !== undefined) booleanValue(object, key, path, issues);
}

function isoDateString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[]) {
  const value = object[key];
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    issue(issues, `${path}.${key}`, "must be an ISO-8601 UTC date-time");
  }
}

function nullableIsoDateString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[]) {
  if (object[key] === null) return;
  isoDateString(object, key, path, issues);
}

function absoluteUrlString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], max = 2_000) {
  const value = object[key];
  if (typeof value !== "string" || value.length > max) {
    issue(issues, `${path}.${key}`, "must be an absolute HTTP(S) URL");
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    issue(issues, `${path}.${key}`, "must be an absolute HTTP(S) URL");
  }
}

function didKeyString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], max: number) {
  const value = object[key];
  if (typeof value !== "string" || !value.startsWith("did:key:") || value.length > max) issue(issues, `${path}.${key}`, "must be a did:key identifier");
}

function pathSafeString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min: number, max: number) {
  const value = object[key];
  if (typeof value !== "string" || value.length < min || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    issue(issues, `${path}.${key}`, `must be ${min}-${max} path-safe characters`);
  }
}

function regexString(object: Record<string, unknown>, key: string, pattern: RegExp, path: string, issues: TrustCareValidationIssue[], message: string) {
  if (typeof object[key] !== "string" || !pattern.test(object[key])) issue(issues, `${path}.${key}`, message);
}

function sha256String(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[]) {
  regexString(object, key, /^sha256:[a-f0-9]{64}$/, path, issues, "must be a lowercase sha256: digest");
}

function nullableSha256String(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== null) sha256String(object, key, path, issues);
}

function optionalSandboxRunId(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] === undefined) return;
  regexString(
    object,
    key,
    /^sandbox:v1:[a-f0-9]{64}$/,
    path,
    issues,
    "must be an opaque sandbox:v1 namespace",
  );
}

function nullableAbsoluteUrlString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== null) absoluteUrlString(object, key, path, issues, 2_000);
}

function gitCommitString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[]) {
  regexString(object, key, /^[a-f0-9]{40}$/, path, issues, "must be a lowercase 40-character Git commit for provenance");
}

function compactJwtString(object: Record<string, unknown>, key: string, path: string, issues: TrustCareValidationIssue[], min: number, max: number) {
  const value = object[key];
  if (typeof value !== "string" || value.length < min || value.length > max || value.split(".").length !== 3) {
    issue(issues, `${path}.${key}`, "must be a compact three-part JWT within the allowed size");
  }
}

function arrayValue(value: unknown, path: string, issues: TrustCareValidationIssue[], min: number, max: number): unknown[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    issue(issues, path, `must be an array with ${min}-${max} items`);
    return null;
  }
  return value;
}

function stringArray(value: unknown, path: string, issues: TrustCareValidationIssue[], minItems: number, maxItems: number, minLength: number, maxLength: number) {
  const array = arrayValue(value, path, issues, minItems, maxItems);
  if (!array) return;
  array.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.length < minLength || entry.length > maxLength) issue(issues, `${path}[${index}]`, `must be a string between ${minLength} and ${maxLength} characters`);
  });
}

function enumArray<const T extends readonly string[]>(value: unknown, allowed: T, path: string, issues: TrustCareValidationIssue[], min: number, max: number) {
  const array = arrayValue(value, path, issues, min, max);
  if (!array) return;
  const seen = new Set<string>();
  array.forEach((entry, index) => {
    if (typeof entry !== "string" || !allowed.includes(entry as T[number])) issue(issues, `${path}[${index}]`, `must be one of ${allowed.join(", ")}`);
    if (typeof entry === "string" && seen.has(entry)) issue(issues, `${path}[${index}]`, "must not duplicate another value");
    if (typeof entry === "string") seen.add(entry);
  });
}

function issue(issues: TrustCareValidationIssue[], path: string, message: string) {
  issues.push({ path: path.replace(/^\$\./, ""), message });
}

function finish<T>(contract: string, value: unknown, issues: TrustCareValidationIssue[]): T {
  if (issues.length) throw new TrustCareContractError(contract, issues);
  return value as T;
}

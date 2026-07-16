import {
  CLINICAL_DOCUMENT_GRAPH_CHANGES_MEDIA_TYPE,
  assertClinicalDocumentGraphChangeSet,
  assertWalletCredentialRequest,
  assertWalletCredentialRequestInput,
  assertWalletCredentialRequestStatus,
  assertWalletProblemDetails,
  assertWalletSession,
  assertWalletSessionChallenge,
  assertWalletSessionChallengeRequest,
  assertWalletSessionCompletionRequest,
  assertWalletShlAssociation,
  assertWalletShlAssociationRequest,
  assertWalletSubmission,
  assertWalletSubmissionRequest,
  assertWalletSubmissionStatus,
  assertWalletSyncAck,
  assertWalletSyncAckRequest,
  assertWalletSyncPage,
  assertWalletSyncRequest,
  type WalletCredentialRequest,
  type WalletCredentialRequestInput,
  type WalletCredentialRequestStatus,
  type WalletExchangeScope,
  type WalletProblemDetails,
  type WalletSession,
  type WalletSessionChallenge,
  type WalletShlAssociation,
  type WalletShlAssociationRequest,
  type WalletSubmission,
  type WalletSubmissionRequest,
  type WalletSyncAck,
  type WalletSyncAckRequest,
  type WalletSyncPage,
  type WalletSyncRequest,
  type ClinicalDocumentGraphChangeSet,
} from "@trustcare/contracts";
import {
  signHolderCompactJws,
  type HolderSigningIdentity,
  type ShlCertificationRequest,
} from "@trustcare/wallet-core";
import { createDpopProof } from "./dpop";
import { TrustCareApiError } from "./errors";
import type { WalletExchangeContractSet } from "./walletContractLoader";
import {
  assertShlCertificationRequest,
} from "./shlCertification";

export type WalletExchangeSessionState = {
  accessToken: string;
  tokenType: "DPoP";
  scopes: WalletExchangeScope[];
  expiresAt: number;
  holderDid: string;
  publicJwkThumbprint: string;
};

export type WalletExchangeRetryPolicy = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export type WalletExchangeV2ClientOptions = {
  contracts: WalletExchangeContractSet;
  identity: HolderSigningIdentity;
  appId: string;
  requestedScopes: WalletExchangeScope[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  retryPolicy?: WalletExchangeRetryPolicy;
  randomUUID?: () => string;
};

export class WalletExchangeProblemError extends TrustCareApiError {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly retryable?: boolean;
  readonly problem?: WalletProblemDetails;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      correlationId?: string;
      retryable?: boolean;
      problem?: WalletProblemDetails;
    } = {},
  ) {
    super(message, { status: options.status, code: options.code });
    this.name = "WalletExchangeProblemError";
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable;
    this.problem = options.problem;
  }
}

type ProtectedRequest = {
  method: "GET" | "POST";
  url: string;
  body?: string;
  accept?: string;
  idempotencyKey?: string;
  requestId: string;
};

export type WalletExchangeResponseTrace = {
  requestId: string;
  correlationId?: string;
};

const SESSION_EXPIRY_SAFETY_SECONDS = 30;
const MAX_CHALLENGE_LIFETIME_SECONDS = 5 * 60;
const MAX_CHALLENGE_CLOCK_SKEW_SECONDS = 5 * 60;

/**
 * Live Wallet Exchange v2 transport. It keeps the short-lived access token in
 * memory and never accepts a Portal patient identifier.
 */
export class WalletExchangeV2Client {
  private readonly fetcher: typeof fetch;
  private readonly clock: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly randomUUID: () => string;
  private session?: WalletExchangeSessionState;
  private clockOffsetSeconds = 0;
  private responseTrace?: WalletExchangeResponseTrace;

  constructor(private readonly options: WalletExchangeV2ClientOptions) {
    this.fetcher = resolveWalletExchangeFetch(options.fetchImpl);
    this.clock = options.now ?? (() => new Date());
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
    this.maxAttempts = boundedInteger(
      options.retryPolicy?.maxAttempts ?? 3,
      1,
      5,
      "maxAttempts",
    );
    this.baseDelayMs = boundedInteger(
      options.retryPolicy?.baseDelayMs ?? 500,
      0,
      30_000,
      "baseDelayMs",
    );
    this.maxDelayMs = boundedInteger(
      options.retryPolicy?.maxDelayMs ?? 30_000,
      this.baseDelayMs,
      30_000,
      "maxDelayMs",
    );
    this.randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
    assertClientConfiguration(options);
  }

  get activeSession(): WalletExchangeSessionState | undefined {
    return this.session
      ? { ...this.session, scopes: [...this.session.scopes] }
      : undefined;
  }

  get lastResponseTrace(): WalletExchangeResponseTrace | undefined {
    return this.responseTrace ? { ...this.responseTrace } : undefined;
  }

  clearSession(): void {
    this.session = undefined;
  }

  async createSession(): Promise<WalletExchangeSessionState> {
    const challengeRequest = assertWalletSessionChallengeRequest({
      appId: this.options.appId,
      holderDid: this.options.identity.did,
      requestedScopes: [...this.options.requestedScopes],
    });
    const challengeEndpoint =
      this.options.contracts.discovery.authorization.challengeEndpoint;
    const challengeRequestId = this.requestIdentifier();
    const challengeResponse = await this.fetcher(challengeEndpoint, {
      method: "POST",
      headers: jsonHeaders(challengeRequestId),
      body: JSON.stringify(challengeRequest),
      cache: "no-store",
    });
    this.updateClockOffset(challengeResponse);
    this.responseTrace = responseTrace(challengeResponse, challengeRequestId);
    const challengePayload = await readResponseJson(
      challengeResponse,
      this.responseTrace,
    );
    if (!challengeResponse.ok) {
      throw problemError(challengeResponse, challengePayload, challengeRequestId);
    }
    const challenge = assertWalletSessionChallenge(challengePayload);
    this.assertChallenge(challenge);

    const proofJwt = await signHolderCompactJws({
      identity: this.options.identity,
      protectedHeader: challenge.proof.protectedHeader,
      payload: JSON.stringify(challenge.proof.payload),
    });
    const completion = assertWalletSessionCompletionRequest({
      challengeId: challenge.challengeId,
      proofJwt,
    });
    const sessionEndpoint =
      this.options.contracts.discovery.authorization.sessionEndpoint;
    const sessionRequestId = this.requestIdentifier();
    const sessionResponse = await this.fetcher(sessionEndpoint, {
      method: "POST",
      headers: jsonHeaders(sessionRequestId),
      body: JSON.stringify(completion),
      cache: "no-store",
    });
    this.updateClockOffset(sessionResponse);
    this.responseTrace = responseTrace(sessionResponse, sessionRequestId);
    const sessionPayload = await readResponseJson(
      sessionResponse,
      this.responseTrace,
    );
    if (!sessionResponse.ok) {
      throw problemError(sessionResponse, sessionPayload, sessionRequestId);
    }
    const wireSession = assertWalletSession(sessionPayload);
    const state = this.acceptSession(wireSession);
    this.session = state;
    return { ...state, scopes: [...state.scopes] };
  }

  async syncCredentials(input: WalletSyncRequest): Promise<WalletSyncPage> {
    const request = assertWalletSyncRequest(input);
    return this.protectedJson(
      {
        method: "POST",
        url: this.options.contracts.discovery.endpoints.credentialSync,
        body: JSON.stringify(request),
        requestId: this.requestIdentifier(),
      },
      assertWalletSyncPage,
    );
  }

  async syncClinicalDocumentGraph(
    input: {
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<ClinicalDocumentGraphChangeSet> {
    const limit = input.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new TrustCareApiError(
        "Clinical Document Graph sync limit must be 1-1000.",
        { code: "clinical_document_graph_sync_limit_invalid" },
      );
    }
    const endpoint = new URL(
      this.options.contracts.discovery.endpoints.clinicalDocumentGraphChanges,
    );
    endpoint.searchParams.set("limit", String(limit));
    if (input.cursor !== undefined) {
      const cursor = input.cursor.trim();
      if (!cursor || cursor.length > 2_000) {
        throw new TrustCareApiError(
          "Clinical Document Graph cursor is invalid.",
          { code: "clinical_document_graph_cursor_invalid" },
        );
      }
      endpoint.searchParams.set("cursor", cursor);
    }
    return this.protectedJson(
      {
        method: "GET",
        url: endpoint.toString(),
        accept: `${CLINICAL_DOCUMENT_GRAPH_CHANGES_MEDIA_TYPE}, application/problem+json`,
        requestId: this.requestIdentifier(),
      },
      assertClinicalDocumentGraphChangeSet,
    );
  }

  async acknowledgeSync(
    input: WalletSyncAckRequest,
    idempotencyKey: string,
  ): Promise<WalletSyncAck> {
    const request = assertWalletSyncAckRequest(input);
    return this.protectedJson(
      {
        method: "POST",
        url: this.options.contracts.discovery.endpoints.credentialSyncAck,
        body: JSON.stringify(request),
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        requestId: this.requestIdentifier(),
      },
      assertWalletSyncAck,
    );
  }

  async requestCredential(
    input: WalletCredentialRequestInput,
    idempotencyKey: string,
  ): Promise<WalletCredentialRequest> {
    const request = assertWalletCredentialRequestInput(input);
    return this.protectedJson(
      {
        method: "POST",
        url: this.options.contracts.discovery.endpoints.credentialRequests,
        body: JSON.stringify(request),
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        requestId: this.requestIdentifier(),
      },
      assertWalletCredentialRequest,
    );
  }

  async getCredentialRequestStatus(
    requestId: string,
  ): Promise<WalletCredentialRequestStatus> {
    return this.protectedJson(
      {
        method: "GET",
        url: childEndpoint(
          this.options.contracts.discovery.endpoints.credentialRequests,
          requestId,
        ),
        requestId: this.requestIdentifier(),
      },
      assertWalletCredentialRequestStatus,
    );
  }

  async submitDocuments(
    input: WalletSubmissionRequest,
    idempotencyKey: string,
  ): Promise<WalletSubmission> {
    const request = assertWalletSubmissionRequest(input);
    return this.submitDocumentsSerialized(
      JSON.stringify(request),
      idempotencyKey,
    );
  }

  /**
   * Sends the exact durable request bytes produced before the first network
   * attempt. This is intentionally narrow: callers cannot bypass contract
   * validation or substitute a differently serialized body on retry.
   */
  async submitDocumentsSerialized(
    requestBody: string,
    idempotencyKey: string,
  ): Promise<WalletSubmission> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(requestBody);
    } catch {
      throw new TrustCareApiError(
        "Durable Wallet submission body is not valid JSON.",
        { code: "wallet_submission_outbox_invalid" },
      );
    }
    const request = assertWalletSubmissionRequest(parsed);
    if (JSON.stringify(request) !== requestBody) {
      throw new TrustCareApiError(
        "Durable Wallet submission body is not the exact validated request serialization.",
        { code: "wallet_submission_outbox_invalid" },
      );
    }
    return this.protectedJson(
      {
        method: "POST",
        url: this.options.contracts.discovery.endpoints.documentSubmissions,
        body: requestBody,
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        requestId: this.requestIdentifier(),
      },
      assertWalletSubmission,
    );
  }

  async getSubmissionStatus(submissionId: string): Promise<WalletSubmission> {
    return this.protectedJson(
      {
        method: "GET",
        url: childEndpoint(
          this.options.contracts.discovery.endpoints.documentSubmissions,
          submissionId,
        ),
        requestId: this.requestIdentifier(),
      },
      assertWalletSubmissionStatus,
    );
  }

  async requestShlCertification(
    input: ShlCertificationRequest,
    idempotencyKey: string,
  ): Promise<WalletCredentialRequest> {
    const endpoint =
      this.options.contracts.discovery.endpoints.shlCertificationRequests;
    const request = assertShlCertificationRequest(input);
    return this.protectedJson(
      {
        method: "POST",
        url: endpoint,
        body: JSON.stringify(request),
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        requestId: this.requestIdentifier(),
      },
      assertWalletCredentialRequest,
    );
  }

  async associateShlPresentation(
    shlId: number,
    input: WalletShlAssociationRequest,
    idempotencyKey: string,
  ): Promise<WalletShlAssociation> {
    const endpoint = shlAssociationEndpoint(
      this.options.contracts.discovery.endpoints.shlAssociations,
      shlId,
    );
    const request = assertWalletShlAssociationRequest(input);
    return this.protectedJson(
      {
        method: "POST",
        url: endpoint,
        body: JSON.stringify(request),
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        requestId: this.requestIdentifier(),
      },
      assertWalletShlAssociation,
    );
  }

  async getShlAssociation(shlId: number): Promise<WalletShlAssociation> {
    return this.protectedJson(
      {
        method: "GET",
        url: shlAssociationEndpoint(
          this.options.contracts.discovery.endpoints.shlAssociations,
          shlId,
        ),
        requestId: this.requestIdentifier(),
      },
      assertWalletShlAssociation,
    );
  }

  private async protectedJson<T>(
    request: ProtectedRequest,
    assertResponse: (value: unknown) => T,
  ): Promise<T> {
    const body = request.body;
    let sessionRenewed = false;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const session = await this.ensureSession();
        const dpop = await createDpopProof({
          identity: this.options.identity,
          accessToken: session.accessToken,
          method: request.method,
          url: request.url,
          now: this.clock,
          clockOffsetSeconds: this.clockOffsetSeconds,
        });
        const headers: Record<string, string> = {
          accept:
            request.accept ?? "application/json, application/problem+json",
          authorization: `DPoP ${session.accessToken}`,
          dpop,
          "x-request-id": request.requestId,
        };
        if (body !== undefined) headers["content-type"] = "application/json";
        if (request.idempotencyKey) {
          headers["idempotency-key"] = request.idempotencyKey;
        }
        const response = await this.fetcher(request.url, {
          method: request.method,
          headers,
          body,
          cache: "no-store",
        });
        this.updateClockOffset(response);
        this.responseTrace = responseTrace(response, request.requestId);
        const payload = await readResponseJson(response, this.responseTrace);
        if (response.ok) return assertResponse(payload);

        const error = problemError(response, payload, request.requestId);
        lastError = error;
        if (response.status === 401 && !sessionRenewed) {
          this.clearSession();
          await this.createSession();
          sessionRenewed = true;
          continue;
        }
        if (
          !isRetryableResponse(response, error) ||
          attempt >= this.maxAttempts
        ) {
          throw error;
        }
        await this.sleep(this.retryDelay(response, attempt));
      } catch (error) {
        lastError = error;
        if (
          error instanceof WalletExchangeProblemError ||
          attempt >= this.maxAttempts ||
          !isReplaySafe(request)
        ) {
          throw error;
        }
        await this.sleep(this.retryDelay(undefined, attempt));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new WalletExchangeProblemError("Wallet Exchange request failed.");
  }

  private async ensureSession(): Promise<WalletExchangeSessionState> {
    const now = Math.floor(this.clock().getTime() / 1_000);
    if (
      !this.session ||
      this.session.expiresAt <= now + SESSION_EXPIRY_SAFETY_SECONDS
    ) {
      return this.createSession();
    }
    return this.session;
  }

  private assertChallenge(challenge: WalletSessionChallenge): void {
    const expectedSessionEndpoint =
      this.options.contracts.discovery.authorization.sessionEndpoint;
    const header = challenge.proof.protectedHeader;
    const payload = challenge.proof.payload;
    if (
      header.typ !== "trustcare-wallet-session+jwt" ||
      header.alg !== this.options.identity.jwsAlgorithm ||
      header.kid !== this.options.identity.kid ||
      payload.iss !== this.options.identity.did ||
      payload.sub !== this.options.identity.did ||
      payload.aud !== expectedSessionEndpoint
    ) {
      throw new WalletExchangeProblemError(
        "Portal session challenge is not bound to this holder and endpoint.",
        { code: "session_challenge_binding_invalid" },
      );
    }
    const expiresAt = Date.parse(challenge.expiresAt) / 1_000;
    const effectiveNow =
      this.clock().getTime() / 1_000 + this.clockOffsetSeconds;
    if (
      !Number.isFinite(expiresAt) ||
      Math.abs(expiresAt - payload.exp) > 1 ||
      payload.exp - payload.iat > MAX_CHALLENGE_LIFETIME_SECONDS ||
      payload.exp <= effectiveNow - MAX_CHALLENGE_CLOCK_SKEW_SECONDS ||
      payload.iat > effectiveNow + MAX_CHALLENGE_CLOCK_SKEW_SECONDS
    ) {
      throw new WalletExchangeProblemError(
        "Portal session challenge is stale or has an invalid lifetime.",
        { code: "session_challenge_stale" },
      );
    }
  }

  private acceptSession(wire: WalletSession): WalletExchangeSessionState {
    if (wire.cnf.jkt !== this.options.identity.publicJwkThumbprint) {
      throw new WalletExchangeProblemError(
        "Portal session is bound to a different holder key.",
        { code: "session_key_binding_invalid" },
      );
    }
    const scopes = wire.scope
      .split(/\s+/)
      .filter(Boolean) as WalletExchangeScope[];
    for (const required of this.options.requestedScopes) {
      if (!scopes.includes(required)) {
        throw new WalletExchangeProblemError(
          `Portal session omitted requested scope ${required}.`,
          { code: "session_scope_invalid" },
        );
      }
    }
    return {
      accessToken: wire.access_token,
      tokenType: wire.token_type,
      scopes,
      expiresAt: Math.floor(this.clock().getTime() / 1_000) + wire.expires_in,
      holderDid: this.options.identity.did,
      publicJwkThumbprint: wire.cnf.jkt,
    };
  }

  private updateClockOffset(response: Response): void {
    const value = response.headers.get("date");
    if (!value) return;
    const serverTime = Date.parse(value);
    const localTime = this.clock().getTime();
    if (Number.isFinite(serverTime) && Number.isFinite(localTime)) {
      const offset = (serverTime - localTime) / 1_000;
      if (Math.abs(offset) <= 24 * 60 * 60) this.clockOffsetSeconds = offset;
    }
  }

  private retryDelay(response: Response | undefined, attempt: number): number {
    const retryAfter = response?.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(this.maxDelayMs, Math.round(seconds * 1_000));
      }
      const timestamp = Date.parse(retryAfter);
      if (Number.isFinite(timestamp)) {
        return Math.min(
          this.maxDelayMs,
          Math.max(0, timestamp - this.clock().getTime()),
        );
      }
    }
    const exponential = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** Math.max(0, attempt - 1),
    );
    const jitter = Math.floor(exponential * 0.2 * Math.random());
    return Math.min(this.maxDelayMs, exponential + jitter);
  }

  private requestIdentifier(): string {
    return `wallet-${this.randomUUID()}`.slice(0, 100);
  }
}

export function resolveWalletExchangeFetch(
  fetchImpl?: typeof fetch,
  runtimeFetch: typeof fetch = globalThis.fetch,
): typeof fetch {
  return fetchImpl ?? runtimeFetch.bind(globalThis);
}

export function createWalletExchangeV2Client(
  options: WalletExchangeV2ClientOptions,
): WalletExchangeV2Client {
  return new WalletExchangeV2Client(options);
}

function assertClientConfiguration(
  options: WalletExchangeV2ClientOptions,
): void {
  const appId = options.appId.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(appId)) {
    throw new TrustCareApiError("Wallet Exchange appId is invalid.", {
      code: "wallet_app_id_invalid",
    });
  }
  if (!options.requestedScopes.length) {
    throw new TrustCareApiError(
      "Wallet Exchange requires at least one scope.",
      {
        code: "wallet_scope_invalid",
      },
    );
  }
  if (
    options.contracts.portalOrigin !==
    new URL(options.contracts.discovery.authorization.sessionEndpoint).origin
  ) {
    throw new TrustCareApiError("Wallet Exchange contract origin changed.", {
      code: "wallet_contract_incompatible",
    });
  }
}

function childEndpoint(base: string, id: string): string {
  const normalized = id.trim();
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(normalized)) {
    throw new TrustCareApiError("Wallet Exchange resource id is invalid.", {
      code: "wallet_resource_id_invalid",
    });
  }
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(normalized)}`;
}

function shlAssociationEndpoint(template: string, shlId: number): string {
  if (!Number.isInteger(shlId) || shlId < 1) {
    throw new TrustCareApiError(
      "SHL association id must be a positive integer.",
      { code: "shl_association_id_invalid" },
    );
  }
  const encoded = String(shlId);
  if (template.includes("{shlId}")) {
    return template.replace("{shlId}", encoded);
  }
  return childEndpoint(template, encoded);
}

function requireIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(normalized)) {
    throw new TrustCareApiError("Wallet Exchange Idempotency-Key is invalid.", {
      code: "wallet_idempotency_key_invalid",
    });
  }
  return normalized;
}

function jsonHeaders(requestId: string): Record<string, string> {
  return {
    accept: "application/json, application/problem+json",
    "content-type": "application/json",
    "x-request-id": requestId,
  };
}

async function readResponseJson(
  response: Response,
  trace?: WalletExchangeResponseTrace,
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType !== "application/json" && !mediaType.endsWith("+json")) {
    if (!response.ok) return null;
    throw new WalletExchangeProblemError(
      "Wallet Exchange response is not JSON.",
      {
        status: response.status,
        code: "wallet_response_content_type_invalid",
        requestId: trace?.requestId,
        correlationId: trace?.correlationId,
      },
    );
  }
  return response.json().catch(() => {
    throw new WalletExchangeProblemError(
      "Wallet Exchange response JSON is malformed.",
      {
        status: response.status,
        code: "wallet_response_json_invalid",
        requestId: trace?.requestId,
        correlationId: trace?.correlationId,
      },
    );
  });
}

function problemError(
  response: Response,
  payload: unknown,
  fallbackRequestId?: string,
): WalletExchangeProblemError {
  let problem: WalletProblemDetails | undefined;
  try {
    problem = assertWalletProblemDetails(payload);
  } catch {
    problem = undefined;
  }
  const record = objectRecord(payload);
  const requestId = response.headers.get("x-request-id") ?? fallbackRequestId;
  const correlationId =
    problem?.correlationId ??
    response.headers.get("x-correlation-id") ??
    stringValue(record.correlationId);
  return new WalletExchangeProblemError(
    problem?.detail ??
      stringValue(record.detail) ??
      stringValue(record.title) ??
      `Wallet Exchange request failed with HTTP ${response.status}.`,
    {
      status: response.status,
      code: problem?.code ?? stringValue(record.code),
      requestId,
      correlationId,
      retryable: problem?.retryable,
      problem,
    },
  );
}

function responseTrace(
  response: Response,
  fallbackRequestId: string,
): WalletExchangeResponseTrace {
  return {
    requestId: response.headers.get("x-request-id") ?? fallbackRequestId,
    correlationId: response.headers.get("x-correlation-id") ?? undefined,
  };
}

function isRetryableResponse(
  response: Response,
  error: WalletExchangeProblemError,
): boolean {
  return (
    response.status === 429 ||
    response.status === 503 ||
    error.retryable === true
  );
}

function isReplaySafe(request: ProtectedRequest): boolean {
  return (
    request.method === "GET" ||
    Boolean(request.idempotencyKey) ||
    request.url.endsWith("/credentials/sync")
  );
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TrustCareApiError(
      `Wallet Exchange ${label} must be ${minimum}-${maximum}.`,
      { code: "wallet_retry_policy_invalid" },
    );
  }
  return value;
}

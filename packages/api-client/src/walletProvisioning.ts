import {
  didKeyFromPublicJwk,
  signHolderCompactJws,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import { decodeJwt } from "jose";
import { TrustCareApiError } from "./errors";
import { normalizePortalOrigin } from "./walletContractLoader";

export type WalletProvisioningConfiguration = {
  schema: "trustcare.wallet.provisioning-configuration.v1";
  appId: string;
  oidc: {
    issuer: string | null;
    audience: string;
    requiredRole: string;
    clients: { web: string; mobile: string };
  };
  endpoints: {
    identity: string;
    provisioning: string;
    holderBindingChallenge: string;
    holderBindingCompletionTemplate: string;
    sandboxTestLogin: string | null;
    sandboxTestIdentities: string | null;
    walletExchangeDiscovery: string;
  };
  holder: {
    didMethod: "did:key";
    algorithms: Array<"EdDSA" | "ES256">;
    privateKeyOwner: "wallet";
  };
};

export type WalletProvisioningStatus = {
  schema: "trustcare.wallet.provisioning.v1";
  identityLinked: true;
  portalSession: false;
  app: {
    appId: string;
    status: string;
    trustLevel: string;
    scopes: string[];
    oidcClientAllowed: boolean;
  } | null;
  holder: {
    holderDid: string;
    bound: boolean;
    proofVerifiedAt: string | null;
  } | null;
  ready: boolean;
  nextAction:
    | "contact_portal_administrator"
    | "await_application_approval"
    | "complete_holder_binding"
    | "create_exchange_session";
};

export type WalletOidcIdentity = {
  linked: true;
  identityId: string;
  username: string | null;
  oidcClientId: string;
  portalSession: false;
  holderBindingRequired: true;
  walletExchangeAppId: string;
  provisioningConfigurationEndpoint: string;
  provisioningEndpoint: string;
};

export type WalletTestIdentity = {
  walletUserId: string;
  username: string;
  name: string;
  nameEn: string | null;
  email: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  preferredLocale: string | null;
  scenario: string;
  homeHospitalCode: string | null;
  connectedHospitalCodes: string[];
  useCases: string[];
  expectedCredentialTypes: string[];
  expectedObjectTypes: string[];
  expectedFlowStates: string[];
  portraitUrl: string | null;
  holder: {
    did: string;
    algorithm: "EdDSA";
    publicJwk: Record<string, unknown>;
    privateKeyOwner: "wallet";
  } | null;
  expectedProvisioningState:
    | "holder_binding_required"
    | "patient_reference_required";
  patientReferenceProvisioned: boolean;
  /** Unknown optional catalog fields are retained for forward-compatible UI. */
  extensions: Readonly<Record<string, unknown>>;
};

export type WalletTestIdentityCatalog = {
  schema: "trustcare.wallet.test-identities.v1";
  catalogVersion: string;
  identities: WalletTestIdentity[];
  extensions: Readonly<Record<string, unknown>>;
};

export type WalletOidcTokenSet = {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  scope?: string;
  testOnly?: boolean;
  username?: string;
};

export class WalletProvisioningProblemError extends TrustCareApiError {
  readonly requestId?: string;
  readonly correlationId?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      correlationId?: string;
    } = {},
  ) {
    super(message, { status: options.status, code: options.code });
    this.name = "WalletProvisioningProblemError";
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
  }
}

export type WalletProvisioningClientOptions = {
  portalBaseUrl: string;
  appId: string;
  identity?: HolderSigningIdentity;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

/**
 * Wallet OIDC and holder-binding bootstrap. The OIDC token is supplied per
 * call and is never retained by this client. Portal patient identifiers are
 * neither accepted nor returned by this boundary.
 */
export class WalletProvisioningClient {
  private readonly portalOrigin: string;
  private readonly fetcher: typeof fetch;
  private readonly clock: () => Date;
  private configurationPromise?: Promise<WalletProvisioningConfiguration>;

  constructor(private readonly options: WalletProvisioningClientOptions) {
    this.portalOrigin = normalizePortalOrigin(options.portalBaseUrl);
    this.fetcher = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.clock = options.now ?? (() => new Date());
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.appId)) {
      throw new TrustCareApiError("Wallet provisioning appId is invalid.", {
        code: "wallet_app_id_invalid",
      });
    }
  }

  loadConfiguration(): Promise<WalletProvisioningConfiguration> {
    this.configurationPromise ??= this.fetchConfiguration();
    return this.configurationPromise;
  }

  reloadConfiguration(): Promise<WalletProvisioningConfiguration> {
    this.configurationPromise = this.fetchConfiguration();
    return this.configurationPromise;
  }

  async listSandboxTestIdentities(): Promise<WalletTestIdentity[]> {
    return (await this.loadSandboxTestIdentityCatalog()).identities;
  }

  async loadSandboxTestIdentityCatalog(): Promise<WalletTestIdentityCatalog> {
    const configuration = await this.loadConfiguration();
    const endpoint = configuration.endpoints.sandboxTestIdentities;
    if (!endpoint) {
      throw new WalletProvisioningProblemError(
        "Portal does not advertise sandbox Wallet identities.",
        { code: "wallet_sandbox_login_unavailable" },
      );
    }
    const payload = await this.requestJson(endpoint, {
      method: "GET",
    });
    const object = record(payload, "Wallet test identity catalog");
    const knownKeys = ["schema", "catalogVersion", "identities"] as const;
    requireLiteral(
      object.schema,
      "trustcare.wallet.test-identities.v1",
      "Wallet test identity catalog schema",
    );
    const catalogVersion = requireOpaqueVersion(
      object.catalogVersion,
      "Wallet test catalog version",
    );
    if (!Array.isArray(object.identities)) {
      invalid("Wallet test identity catalog is invalid.");
    }
    return {
      schema: "trustcare.wallet.test-identities.v1",
      catalogVersion,
      identities: object.identities.map(assertTestIdentity),
      extensions: optionalExtensions(object, knownKeys),
    };
  }

  async sandboxTestLogin(username: string): Promise<WalletOidcTokenSet> {
    const configuration = await this.loadConfiguration();
    const endpoint = configuration.endpoints.sandboxTestLogin;
    if (!endpoint) {
      throw new WalletProvisioningProblemError(
        "Portal does not advertise sandbox Wallet login.",
        { code: "wallet_sandbox_login_unavailable" },
      );
    }
    const normalized = username.trim();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(normalized)) {
      invalid("Wallet sandbox username is invalid.");
    }
    const payload = await this.requestJson(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: normalized }),
    });
    const object = record(payload, "Wallet sandbox token response");
    if (object.testOnly !== true || object.username !== normalized) {
      invalid("Wallet sandbox token response is not bound to the selected identity.");
    }
    const tokenSet = assertTokenSet(object);
    assertSandboxOidcTokenClaims({
      tokenSet,
      configuration,
      now: this.clock(),
    });
    return tokenSet;
  }

  async getProvisioningStatus(
    oidcAccessToken: string,
  ): Promise<WalletProvisioningStatus> {
    const identity = this.requireIdentity();
    const configuration = await this.loadConfiguration();
    const endpoint = new URL(configuration.endpoints.provisioning);
    endpoint.searchParams.set("appId", this.options.appId);
    endpoint.searchParams.set("holderDid", identity.did);
    const payload = await this.requestJson(endpoint.toString(), {
      method: "GET",
      headers: bearerHeaders(oidcAccessToken),
    });
    return assertProvisioningStatus(payload, this.options.appId, identity.did);
  }

  async getWalletIdentity(oidcAccessToken: string): Promise<WalletOidcIdentity> {
    const configuration = await this.loadConfiguration();
    const object = record(
      await this.requestJson(configuration.endpoints.identity, {
        method: "GET",
        headers: bearerHeaders(oidcAccessToken),
      }),
      "Wallet OIDC identity",
    );
    exactKeys(object, [
      "linked",
      "identityId",
      "username",
      "oidcClientId",
      "portalSession",
      "holderBindingRequired",
      "walletExchangeAppId",
      "provisioningConfigurationEndpoint",
      "provisioningEndpoint",
    ]);
    if (
      object.linked !== true ||
      object.portalSession !== false ||
      object.holderBindingRequired !== true ||
      object.walletExchangeAppId !== this.options.appId
    ) {
      invalid("Wallet OIDC identity is not linked to this Wallet application.");
    }
    requirePathSafe(object.identityId, "Wallet OIDC identity ID");
    if (object.username !== null) requireString(object.username, "Wallet OIDC username");
    requireString(object.oidcClientId, "Wallet OIDC client ID");
    if (
      object.provisioningConfigurationEndpoint !==
        `${this.portalOrigin}/api/wallet/provisioning/configuration` ||
      object.provisioningEndpoint !== configuration.endpoints.provisioning
    ) {
      invalid("Wallet OIDC identity returned incompatible provisioning endpoints.");
    }
    return object as WalletOidcIdentity;
  }

  async bindHolder(input: {
    oidcAccessToken: string;
    consentRef: string;
  }): Promise<WalletProvisioningStatus> {
    const identity = this.requireIdentity();
    const configuration = await this.loadConfiguration();
    const consentRef = input.consentRef.trim();
    if (!consentRef || consentRef.length > 255) {
      invalid("Holder binding consent reference is invalid.");
    }
    if (didKeyFromPublicJwk(identity.publicJwk) !== identity.did) {
      invalid("Holder DID is not derived from its public JWK.");
    }
    if ("d" in identity.publicJwk) {
      invalid("Holder binding must never upload a private JWK.");
    }

    const challengePayload = await this.requestJson(
      configuration.endpoints.holderBindingChallenge,
      {
        method: "POST",
        headers: {
          ...bearerHeaders(input.oidcAccessToken),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          appId: this.options.appId,
          holderDid: identity.did,
          publicJwk: identity.publicJwk,
          consentRef,
        }),
      },
    );
    const challenge = assertHolderBindingChallenge(
      challengePayload,
      this.portalOrigin,
      this.options.appId,
      identity,
      this.clock,
    );
    const proofJwt = await signHolderCompactJws({
      identity,
      protectedHeader: {
        alg: challenge.algorithm,
        kid: challenge.verificationMethodId,
      },
      payload: JSON.stringify(challenge.payload),
    });
    const completionEndpoint = configuration.endpoints
      .holderBindingCompletionTemplate.replace(
        "{challengeId}",
        encodeURIComponent(challenge.challengeId),
      );
    if (completionEndpoint.includes("{challengeId}")) {
      invalid("Holder binding completion endpoint template is invalid.");
    }
    const completion = record(
      await this.requestJson(completionEndpoint, {
        method: "POST",
        headers: {
          ...bearerHeaders(input.oidcAccessToken),
          "content-type": "application/json",
        },
        body: JSON.stringify({ proofJwt }),
      }),
      "Holder binding completion",
    );
    if (completion.bound !== true) {
      invalid("Portal did not confirm the holder key binding.");
    }
    const status = await this.getProvisioningStatus(input.oidcAccessToken);
    if (!status.ready || status.nextAction !== "create_exchange_session") {
      invalid("Portal holder binding completed but provisioning is not ready.");
    }
    return status;
  }

  private requireIdentity(): HolderSigningIdentity {
    if (!this.options.identity) {
      throw new TrustCareApiError(
        "Holder identity is required for Wallet provisioning.",
        { code: "wallet_holder_identity_required" },
      );
    }
    return this.options.identity;
  }

  private async fetchConfiguration(): Promise<WalletProvisioningConfiguration> {
    const endpoint = `${this.portalOrigin}/api/wallet/provisioning/configuration`;
    const payload = await this.requestJson(endpoint, {
      method: "GET",
    });
    return assertProvisioningConfiguration(payload, this.portalOrigin);
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        accept: "application/json, application/problem+json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const object = recordOrEmpty(payload);
      throw new WalletProvisioningProblemError(
        stringValue(object.detail) ??
          stringValue(object.message) ??
          stringValue(object.title) ??
          "Wallet provisioning request failed.",
        {
          status: response.status,
          code: stringValue(object.code) ?? stringValue(object.error),
          requestId: response.headers.get("x-request-id") ?? undefined,
          correlationId:
            stringValue(object.correlationId) ??
            response.headers.get("x-correlation-id") ??
            undefined,
        },
      );
    }
    if (!payload || typeof payload !== "object") {
      invalid("Wallet provisioning response is not JSON.");
    }
    return payload;
  }
}

export function createWalletProvisioningClient(
  options: WalletProvisioningClientOptions,
): WalletProvisioningClient {
  return new WalletProvisioningClient(options);
}

function assertProvisioningConfiguration(
  value: unknown,
  portalOrigin: string,
): WalletProvisioningConfiguration {
  const object = record(value, "Wallet provisioning configuration");
  exactKeys(object, ["schema", "appId", "oidc", "endpoints", "holder"]);
  requireLiteral(
    object.schema,
    "trustcare.wallet.provisioning-configuration.v1",
    "Wallet provisioning configuration schema",
  );
  requirePathSafe(object.appId, "Wallet provisioning appId");
  const oidc = record(object.oidc, "Wallet OIDC configuration");
  exactKeys(oidc, ["issuer", "audience", "requiredRole", "clients"]);
  if (oidc.issuer !== null) requireAbsoluteUrl(oidc.issuer, "Wallet OIDC issuer");
  requireString(oidc.audience, "Wallet OIDC audience");
  requireString(oidc.requiredRole, "Wallet OIDC required role");
  const clients = record(oidc.clients, "Wallet OIDC clients");
  exactKeys(clients, ["web", "mobile"]);
  requireString(clients.web, "Wallet OIDC web client");
  requireString(clients.mobile, "Wallet OIDC mobile client");

  const endpoints = record(object.endpoints, "Wallet provisioning endpoints");
  exactKeys(endpoints, [
    "identity",
    "provisioning",
    "holderBindingChallenge",
    "holderBindingCompletionTemplate",
    "sandboxTestLogin",
    "sandboxTestIdentities",
    "walletExchangeDiscovery",
  ]);
  for (const key of [
    "identity",
    "provisioning",
    "holderBindingChallenge",
    "walletExchangeDiscovery",
  ] as const) {
    requireSameOriginUrl(endpoints[key], portalOrigin, `Wallet endpoint ${key}`);
  }
  const completion = requireString(
    endpoints.holderBindingCompletionTemplate,
    "Holder binding completion template",
  );
  if (!completion.includes("{challengeId}")) {
    invalid("Holder binding completion template has no challenge placeholder.");
  }
  requireSameOriginUrl(
    completion.replace("{challengeId}", "challenge"),
    portalOrigin,
    "Holder binding completion template",
  );
  for (const key of ["sandboxTestLogin", "sandboxTestIdentities"] as const) {
    if (endpoints[key] !== null) {
      requireSameOriginUrl(endpoints[key], portalOrigin, `Wallet endpoint ${key}`);
    }
  }

  const holder = record(object.holder, "Wallet holder configuration");
  exactKeys(holder, ["didMethod", "algorithms", "privateKeyOwner"]);
  requireLiteral(holder.didMethod, "did:key", "Wallet holder DID method");
  requireLiteral(holder.privateKeyOwner, "wallet", "Wallet private key owner");
  if (
    !Array.isArray(holder.algorithms) ||
    holder.algorithms.some((value) => value !== "EdDSA" && value !== "ES256") ||
    !holder.algorithms.length
  ) {
    invalid("Wallet holder algorithms are invalid.");
  }
  return value as WalletProvisioningConfiguration;
}

function assertProvisioningStatus(
  value: unknown,
  appId: string,
  holderDid: string,
): WalletProvisioningStatus {
  const object = record(value, "Wallet provisioning status");
  exactKeys(object, [
    "schema",
    "identityLinked",
    "portalSession",
    "app",
    "holder",
    "ready",
    "nextAction",
  ]);
  requireLiteral(
    object.schema,
    "trustcare.wallet.provisioning.v1",
    "Wallet provisioning status schema",
  );
  if (object.identityLinked !== true || object.portalSession !== false) {
    invalid("Wallet provisioning identity boundary is invalid.");
  }
  if (object.app !== null) {
    const app = record(object.app, "Wallet provisioning application");
    exactKeys(app, [
      "appId",
      "status",
      "trustLevel",
      "scopes",
      "oidcClientAllowed",
    ]);
    if (app.appId !== appId) invalid("Wallet provisioning appId changed.");
    requireString(app.status, "Wallet application status");
    requireString(app.trustLevel, "Wallet application trust level");
    if (!Array.isArray(app.scopes) || app.scopes.some((scope) => typeof scope !== "string")) {
      invalid("Wallet application scopes are invalid.");
    }
    if (typeof app.oidcClientAllowed !== "boolean") {
      invalid("Wallet OIDC client policy is invalid.");
    }
  }
  if (object.holder !== null) {
    const holder = record(object.holder, "Wallet provisioning holder");
    exactKeys(holder, ["holderDid", "bound", "proofVerifiedAt"]);
    if (holder.holderDid !== holderDid) invalid("Wallet provisioning holder DID changed.");
    if (typeof holder.bound !== "boolean") invalid("Wallet holder binding state is invalid.");
    if (holder.proofVerifiedAt !== null) {
      requireIsoDate(holder.proofVerifiedAt, "Wallet holder proof time");
    }
  }
  if (typeof object.ready !== "boolean") invalid("Wallet provisioning readiness is invalid.");
  const nextActions = [
    "contact_portal_administrator",
    "await_application_approval",
    "complete_holder_binding",
    "create_exchange_session",
  ];
  if (!nextActions.includes(String(object.nextAction))) {
    invalid("Wallet provisioning next action is invalid.");
  }
  if (object.ready === true) {
    const app = record(object.app, "Ready Wallet application");
    const holder = record(object.holder, "Ready Wallet holder");
    if (
      app.status !== "active" ||
      app.oidcClientAllowed !== true ||
      holder.bound !== true ||
      object.nextAction !== "create_exchange_session"
    ) {
      invalid("Wallet provisioning readiness is internally inconsistent.");
    }
  }
  return value as WalletProvisioningStatus;
}

function assertHolderBindingChallenge(
  value: unknown,
  portalOrigin: string,
  appId: string,
  identity: HolderSigningIdentity,
  now: () => Date,
) {
  const object = record(value, "Holder binding challenge");
  exactKeys(object, [
    "challengeId",
    "appId",
    "holderDid",
    "verificationMethodId",
    "algorithm",
    "payload",
    "expiresAt",
  ]);
  const challengeId = requirePathSafe(object.challengeId, "Holder binding challenge ID");
  if (object.appId !== appId || object.holderDid !== identity.did) {
    invalid("Holder binding challenge is not bound to this Wallet application and DID.");
  }
  if (
    object.verificationMethodId !== identity.kid ||
    object.algorithm !== identity.jwsAlgorithm
  ) {
    invalid("Holder binding challenge is not bound to this holder key.");
  }
  const expiresAt = requireIsoDate(object.expiresAt, "Holder binding challenge expiry");
  const payload = record(object.payload, "Holder binding challenge payload");
  exactKeys(payload, ["iss", "sub", "aud", "jti", "nonce", "purpose", "iat", "exp"]);
  if (
    payload.iss !== identity.did ||
    payload.sub !== identity.did ||
    payload.jti !== challengeId ||
    payload.purpose !== "trustcare-wallet-key-binding" ||
    payload.aud !== `${portalOrigin}/api/wallet/keys/bind`
  ) {
    invalid("Holder binding challenge intent is invalid.");
  }
  requireString(payload.nonce, "Holder binding nonce");
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) {
    invalid("Holder binding challenge timestamps are invalid.");
  }
  const issuedAt = payload.iat as number;
  const expiresAtSeconds = payload.exp as number;
  const nowSeconds = Math.floor(now().getTime() / 1_000);
  if (
    expiresAtSeconds !== Math.floor(expiresAt.getTime() / 1_000) ||
    expiresAtSeconds <= issuedAt ||
    expiresAtSeconds - issuedAt > 300 ||
    expiresAtSeconds <= nowSeconds - 60 ||
    issuedAt > nowSeconds + 60
  ) {
    invalid("Holder binding challenge is stale or has an invalid lifetime.");
  }
  return {
    challengeId,
    algorithm: object.algorithm as "EdDSA" | "ES256",
    verificationMethodId: object.verificationMethodId as string,
    payload,
  };
}

function assertTestIdentity(value: unknown): WalletTestIdentity {
  const object = record(value, "Wallet test identity");
  const knownKeys = [
    "walletUserId",
    "username",
    "name",
    "nameEn",
    "email",
    "phone",
    "birthDate",
    "gender",
    "nationality",
    "preferredLocale",
    "scenario",
    "homeHospitalCode",
    "connectedHospitalCodes",
    "useCases",
    "expectedCredentialTypes",
    "expectedObjectTypes",
    "expectedFlowStates",
    "portraitUrl",
    "holder",
    "expectedProvisioningState",
    "patientReferenceProvisioned",
  ] as const;
  const walletUserId = requirePathSafe(object.walletUserId, "Wallet test user ID");
  requirePathSafe(object.username, "Wallet test username");
  if (object.username !== walletUserId) {
    invalid("Wallet test identity username is not bound to walletUserId.");
  }
  requireString(object.name, "Wallet test identity name");
  requireString(object.email, "Wallet test identity email");
  requireString(object.scenario, "Wallet test identity scenario");
  if (
    object.expectedProvisioningState !== "holder_binding_required" &&
    object.expectedProvisioningState !== "patient_reference_required"
  ) {
    invalid("Wallet test identity provisioning state is invalid.");
  }
  if (typeof object.patientReferenceProvisioned !== "boolean") {
    invalid("Wallet test identity patient reference flag is invalid.");
  }
  const holder = assertTestIdentityHolder(object.holder);
  const portraitUrl = nullableHttpsUrl(object.portraitUrl, "Wallet portrait URL");
  if (object.patientReferenceProvisioned) {
    if (!holder || !portraitUrl || object.expectedProvisioningState !== "holder_binding_required") {
      invalid("Linked Wallet test identity is missing holder or portrait metadata.");
    }
  } else if (holder || portraitUrl || object.expectedProvisioningState !== "patient_reference_required") {
    invalid("Negative Wallet test identity unexpectedly has linked holder metadata.");
  }
  return {
    walletUserId,
    username: object.username as string,
    name: object.name as string,
    nameEn: nullableString(object.nameEn),
    email: object.email as string,
    phone: nullableString(object.phone),
    birthDate: nullableDate(object.birthDate, "Wallet birth date"),
    gender: nullableString(object.gender),
    nationality: nullableString(object.nationality),
    preferredLocale: nullableString(object.preferredLocale),
    scenario: object.scenario as string,
    homeHospitalCode: nullableString(object.homeHospitalCode),
    connectedHospitalCodes: stringArray(object.connectedHospitalCodes, "connected hospitals"),
    useCases: stringArray(object.useCases, "use cases"),
    expectedCredentialTypes: stringArray(object.expectedCredentialTypes, "credential types"),
    expectedObjectTypes: stringArray(object.expectedObjectTypes, "object types"),
    expectedFlowStates: stringArray(object.expectedFlowStates, "flow states"),
    portraitUrl,
    holder,
    expectedProvisioningState: object.expectedProvisioningState as WalletTestIdentity["expectedProvisioningState"],
    patientReferenceProvisioned: object.patientReferenceProvisioned,
    extensions: optionalExtensions(object, knownKeys),
  };
}

function assertTestIdentityHolder(
  value: unknown,
): WalletTestIdentity["holder"] {
  if (value === null) return null;
  const object = record(value, "Wallet test holder");
  exactKeys(object, ["did", "algorithm", "publicJwk", "privateKeyOwner"]);
  const did = requirePathSafe(object.did, "Wallet test holder DID");
  if (object.algorithm !== "EdDSA" || object.privateKeyOwner !== "wallet") {
    invalid("Wallet test holder ownership or algorithm is invalid.");
  }
  const publicJwk = record(object.publicJwk, "Wallet test holder public JWK");
  if ("d" in publicJwk) invalid("Portal test catalog exposed holder private key material.");
  let derivedDid: string;
  try {
    derivedDid = didKeyFromPublicJwk(publicJwk);
  } catch {
    invalid("Wallet test holder public JWK is invalid.");
  }
  if (did !== derivedDid) {
    invalid("Wallet test holder DID does not match its public JWK.");
  }
  return { did, algorithm: "EdDSA", publicJwk, privateKeyOwner: "wallet" };
}

function assertTokenSet(object: Record<string, unknown>): WalletOidcTokenSet {
  const accessToken = requireString(object.access_token, "Wallet OIDC access token");
  const tokenType = requireString(object.token_type, "Wallet OIDC token type");
  if (!Number.isInteger(object.expires_in) || Number(object.expires_in) <= 0) {
    invalid("Wallet OIDC token expiry is invalid.");
  }
  return {
    tokenType,
    accessToken,
    expiresIn: Number(object.expires_in),
    refreshToken: stringValue(object.refresh_token),
    refreshExpiresIn: Number.isInteger(object.refresh_expires_in)
      ? Number(object.refresh_expires_in)
      : undefined,
    scope: stringValue(object.scope),
    testOnly: object.testOnly === true,
    username: stringValue(object.username),
  };
}

function assertSandboxOidcTokenClaims(input: {
  tokenSet: WalletOidcTokenSet;
  configuration: WalletProvisioningConfiguration;
  now: Date;
}): void {
  if (input.tokenSet.tokenType.toLowerCase() !== "bearer") {
    invalid("Wallet sandbox OIDC token type is invalid.");
  }
  const issuer = input.configuration.oidc.issuer;
  if (!issuer) {
    invalid("Wallet sandbox OIDC issuer is not configured.");
  }
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwt(input.tokenSet.accessToken) as Record<string, unknown>;
  } catch {
    invalid("Wallet sandbox OIDC access token is not a compact JWT.");
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const authorizedParty = stringValue(claims.azp) ?? stringValue(claims.client_id);
  const realmAccess = recordOrEmpty(claims.realm_access);
  const roles = Array.isArray(realmAccess.roles) ? realmAccess.roles : [];
  const nowSeconds = Math.floor(input.now.getTime() / 1_000);
  if (
    claims.iss !== issuer ||
    !audience.includes(input.configuration.oidc.audience) ||
    authorizedParty !== "trustcare-wallet-test-broker" ||
    !stringValue(claims.sub) ||
    !Number.isInteger(claims.exp) ||
    Number(claims.exp) <= nowSeconds - 60 ||
    !roles.includes(input.configuration.oidc.requiredRole)
  ) {
    invalid("Wallet sandbox OIDC access token claims are incompatible.");
  }
}

function bearerHeaders(token: string): Record<string, string> {
  const normalized = token.trim();
  if (!normalized || /\s/.test(normalized)) {
    invalid("Wallet OIDC access token is invalid.");
  }
  return { authorization: `Bearer ${normalized}` };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function exactKeys(object: Record<string, unknown>, allowed: string[]): void {
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length) invalid(`Unknown Wallet provisioning field: ${extras[0]}.`);
}

function requireLiteral(value: unknown, expected: string, label: string): void {
  if (value !== expected) invalid(`${label} is invalid.`);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(`${label} is invalid.`);
  return value;
}

function requireOpaqueVersion(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (text.length > 200 || /[\u0000-\u001f\u007f]/.test(text)) {
    invalid(`${label} is invalid.`);
  }
  return text;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return requireString(value, "Wallet test identity text");
}

function nullableDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  const text = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) {
    invalid(`${label} is invalid.`);
  }
  return text;
}

function nullableHttpsUrl(value: unknown, label: string): string | null {
  if (value === null) return null;
  const url = requireAbsoluteUrl(value, label);
  if (url.protocol !== "https:") invalid(`${label} must use HTTPS.`);
  return url.toString();
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    invalid(`Wallet test identity ${label} are invalid.`);
  }
  return [...new Set(value as string[])];
}

function optionalExtensions<const T extends readonly string[]>(
  object: Record<string, unknown>,
  knownKeys: T,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(object).filter(([key]) => !knownKeys.includes(key)),
    ),
  );
}

function requirePathSafe(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,699}$/.test(text)) invalid(`${label} is invalid.`);
  return text;
}

function requireAbsoluteUrl(value: unknown, label: string): URL {
  const text = requireString(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    invalid(`${label} is invalid.`);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    invalid(`${label} must use HTTPS.`);
  }
  return url!;
}

function requireSameOriginUrl(value: unknown, origin: string, label: string): URL {
  const url = requireAbsoluteUrl(value, label);
  if (url.origin !== origin || url.username || url.password || url.hash) {
    invalid(`${label} changed Portal origin.`);
  }
  return url;
}

function requireIsoDate(value: unknown, label: string): Date {
  const text = requireString(value, label);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== text) {
    invalid(`${label} is invalid.`);
  }
  return date;
}

function invalid(message: string): never {
  throw new TrustCareApiError(message, {
    code: "wallet_provisioning_contract_invalid",
  });
}

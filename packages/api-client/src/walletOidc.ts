import { decodeJwt } from "jose";
import { TrustCareApiError } from "./errors";
import {
  WalletProvisioningProblemError,
  type WalletOidcTokenSet,
  type WalletProvisioningConfiguration,
} from "./walletProvisioning";

export type WalletOidcPlatform = "web" | "mobile";

export type WalletOidcAuthorizationRequest = Readonly<{
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: string;
  expiresAt: string;
}>;

export type WalletOidcClientOptions = {
  configuration: WalletProvisioningConfiguration;
  platform: WalletOidcPlatform;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
};

/**
 * Shared public-client OIDC boundary for Wallet Web and Mobile.
 *
 * The caller owns secure transient storage for the returned PKCE verifier and
 * tokens. This class never assumes that the OIDC issuer shares the Portal API
 * origin and never sends a client secret.
 */
export class WalletOidcClient {
  private readonly fetcher: typeof fetch;
  private readonly clock: () => Date;
  private readonly random: (length: number) => Uint8Array;

  constructor(private readonly options: WalletOidcClientOptions) {
    this.fetcher = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.clock = options.now ?? (() => new Date());
    this.random = options.randomBytes ?? secureRandomBytes;
    requireOidcConfiguration(options.configuration);
  }

  async createAuthorizationRequest(input: {
    redirectUri?: string;
    scope?: string[];
    prompt?: "login" | "consent" | "select_account";
  } = {}): Promise<WalletOidcAuthorizationRequest> {
    const oidc = this.options.configuration.oidc;
    const authorizationEndpoint = requiredEndpoint(
      oidc.authorizationEndpoint,
      "authorization",
    );
    const clientId = oidc.clients[this.options.platform];
    const redirectUri = this.resolveRedirectUri(input.redirectUri);
    const codeVerifier = randomBase64Url(this.random, 64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomBase64Url(this.random, 32);
    const nonce = randomBase64Url(this.random, 32);
    const createdAt = this.clock();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60_000);
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set(
      "scope",
      Array.from(new Set(["openid", ...(input.scope ?? ["profile", "email"])]))
        .join(" "),
    );
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (input.prompt) url.searchParams.set("prompt", input.prompt);
    return {
      authorizationUrl: url.toString(),
      clientId,
      redirectUri,
      state,
      nonce,
      codeVerifier,
      codeChallenge,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri?: string;
  }): Promise<WalletOidcTokenSet> {
    requireOpaque(input.code, "OIDC authorization code", 4, 4_096);
    requirePkceVerifier(input.codeVerifier);
    return this.tokenRequest({
      grant_type: "authorization_code",
      client_id: this.options.configuration.oidc.clients[this.options.platform],
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: this.resolveRedirectUri(input.redirectUri),
    });
  }

  async refresh(refreshToken: string): Promise<WalletOidcTokenSet> {
    requireOpaque(refreshToken, "OIDC refresh token", 20, 16_384);
    return this.tokenRequest({
      grant_type: "refresh_token",
      client_id: this.options.configuration.oidc.clients[this.options.platform],
      refresh_token: refreshToken,
    });
  }

  async revokeToken(input: {
    token: string;
    tokenTypeHint?: "access_token" | "refresh_token";
  }): Promise<void> {
    requireOpaque(input.token, "OIDC token", 20, 16_384);
    const endpoint = requiredEndpoint(
      this.options.configuration.oidc.revocationEndpoint,
      "revocation",
    );
    const body = new URLSearchParams({
      client_id:
        this.options.configuration.oidc.clients[this.options.platform],
      token: input.token,
    });
    if (input.tokenTypeHint) {
      body.set("token_type_hint", input.tokenTypeHint);
    }
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!response.ok) throw await oidcProblem(response, "OIDC token revocation failed.");
  }

  createEndSessionUrl(input: {
    idTokenHint?: string;
    postLogoutRedirectUri?: string;
    state?: string;
  } = {}): string {
    const endpoint = requiredEndpoint(
      this.options.configuration.oidc.endSessionEndpoint,
      "end-session",
    );
    const url = new URL(endpoint);
    if (input.idTokenHint) {
      requireOpaque(input.idTokenHint, "OIDC ID token", 20, 16_384);
      url.searchParams.set("id_token_hint", input.idTokenHint);
    }
    const redirectUri =
      input.postLogoutRedirectUri ??
      (this.options.platform === "mobile"
        ? this.options.configuration.oidc.clientMetadata.mobile
            .postLogoutRedirectUri
        : undefined);
    if (redirectUri) {
      requireUrl(redirectUri, "OIDC post-logout redirect URI");
      url.searchParams.set("post_logout_redirect_uri", redirectUri);
    }
    if (input.state) {
      requireOpaque(input.state, "OIDC logout state", 16, 512);
      url.searchParams.set("state", input.state);
    }
    url.searchParams.set(
      "client_id",
      this.options.configuration.oidc.clients[this.options.platform],
    );
    return url.toString();
  }

  private resolveRedirectUri(configured?: string): string {
    const redirectUri =
      configured ??
      (this.options.platform === "mobile"
        ? this.options.configuration.oidc.clientMetadata.mobile.redirectUri
        : undefined);
    if (!redirectUri) {
      throw new TrustCareApiError(
        "Wallet Web OIDC requires an explicit deployment redirect URI.",
        { code: "wallet_oidc_redirect_uri_required" },
      );
    }
    requireUrl(redirectUri, "OIDC redirect URI");
    if (
      this.options.platform === "mobile" &&
      redirectUri !==
        this.options.configuration.oidc.clientMetadata.mobile.redirectUri
    ) {
      throw new TrustCareApiError(
        "Wallet Mobile OIDC redirect URI differs from live provisioning metadata.",
        { code: "wallet_oidc_redirect_uri_mismatch" },
      );
    }
    return redirectUri;
  }

  private async tokenRequest(
    fields: Record<string, string>,
  ): Promise<WalletOidcTokenSet> {
    const endpoint = requiredEndpoint(
      this.options.configuration.oidc.tokenEndpoint,
      "token",
    );
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, application/problem+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
      cache: "no-store",
    });
    if (!response.ok) throw await oidcProblem(response, "OIDC token request failed.");
    const value = await response.json().catch(() => null);
    const token = parseTokenSet(value);
    validateAccessTokenClaims({
      accessToken: token.accessToken,
      configuration: this.options.configuration,
      clientId:
        this.options.configuration.oidc.clients[this.options.platform],
      now: this.clock(),
    });
    return token;
  }
}

export function createWalletOidcClient(
  options: WalletOidcClientOptions,
): WalletOidcClient {
  return new WalletOidcClient(options);
}

function requireOidcConfiguration(
  configuration: WalletProvisioningConfiguration,
): void {
  const oidc = configuration.oidc;
  if (
    oidc.flow !== "authorization_code" ||
    oidc.responseType !== "code" ||
    oidc.pkce.required !== true ||
    oidc.pkce.method !== "S256" ||
    oidc.clientMetadata.web.tokenEndpointAuthMethod !== "none" ||
    oidc.clientMetadata.mobile.tokenEndpointAuthMethod !== "none"
  ) {
    throw new TrustCareApiError(
      "Wallet OIDC provisioning policy is not a supported PKCE public-client profile.",
      { code: "wallet_oidc_profile_unsupported" },
    );
  }
}

function requiredEndpoint(value: string | null, label: string): string {
  if (!value) {
    throw new TrustCareApiError(`Wallet OIDC ${label} endpoint is unavailable.`, {
      code: "wallet_oidc_endpoint_unavailable",
    });
  }
  requireUrl(value, `OIDC ${label} endpoint`);
  return value;
}

function parseTokenSet(value: unknown): WalletOidcTokenSet {
  const object = isRecord(value) ? value : {};
  const tokenType = stringValue(object.token_type);
  const accessToken = stringValue(object.access_token);
  const expiresIn = numberValue(object.expires_in);
  if (!tokenType || !accessToken || !expiresIn || expiresIn <= 0) {
    throw new TrustCareApiError("OIDC token response is incomplete.", {
      code: "wallet_oidc_token_response_invalid",
    });
  }
  return {
    tokenType,
    accessToken,
    expiresIn,
    refreshToken: stringValue(object.refresh_token),
    refreshExpiresIn: numberValue(object.refresh_expires_in),
    idToken: stringValue(object.id_token),
    scope: stringValue(object.scope),
  };
}

function validateAccessTokenClaims(input: {
  accessToken: string;
  configuration: WalletProvisioningConfiguration;
  clientId: string;
  now: Date;
}): void {
  let claims: ReturnType<typeof decodeJwt>;
  try {
    claims = decodeJwt(input.accessToken);
  } catch {
    throw new TrustCareApiError("OIDC access token is not a compact JWT.", {
      code: "wallet_oidc_token_invalid",
    });
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const roles = isRecord(claims.realm_access)
    ? claims.realm_access.roles
    : undefined;
  if (
    !input.configuration.oidc.issuer ||
    claims.iss !== input.configuration.oidc.issuer ||
    !audience.includes(input.configuration.oidc.audience) ||
    (claims.azp !== input.clientId && claims.client_id !== input.clientId) ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.exp !== "number" ||
    claims.exp <= Math.floor(input.now.getTime() / 1_000) ||
    !Array.isArray(roles) ||
    !roles.includes(input.configuration.oidc.requiredRole)
  ) {
    throw new TrustCareApiError(
      "OIDC access token does not match live Wallet provisioning policy.",
      { code: "wallet_oidc_claims_invalid" },
    );
  }
}

async function oidcProblem(
  response: Response,
  fallback: string,
): Promise<WalletProvisioningProblemError> {
  const value = await response.json().catch(() => null);
  const object = isRecord(value) ? value : {};
  return new WalletProvisioningProblemError(
    stringValue(object.error_description) ??
      stringValue(object.detail) ??
      stringValue(object.message) ??
      fallback,
    {
      status: response.status,
      code: stringValue(object.code) ?? stringValue(object.error),
      requestId: response.headers.get("x-request-id") ?? undefined,
      correlationId: response.headers.get("x-correlation-id") ?? undefined,
    },
  );
}

function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomBase64Url(
  random: (length: number) => Uint8Array,
  length: number,
): string {
  return toBase64Url(random(length));
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function requirePkceVerifier(value: string): void {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(value)) {
    throw new TrustCareApiError("OIDC PKCE verifier is invalid.", {
      code: "wallet_oidc_pkce_invalid",
    });
  }
}

function requireOpaque(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\r\n]/.test(value)
  ) {
    throw new TrustCareApiError(`${label} is invalid.`, {
      code: "wallet_oidc_value_invalid",
    });
  }
}

function requireUrl(value: string, label: string): void {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.hostname) throw new Error("host missing");
  } catch {
    throw new TrustCareApiError(`${label} is invalid.`, {
      code: "wallet_oidc_url_invalid",
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

import {
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
  WALLET_EXCHANGE_V2_CONTEXTS,
  assertWalletExchangeDiscovery,
  type WalletExchangeDiscovery,
  type WalletExchangeServiceContext,
} from "@trustcare/contracts";
import {
  createHolderSignedDirectVp,
  credentialStatusEntries,
  signHolderCompactJws,
  trustCareCredentialIssuerDid,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import {
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
} from "jose";
import { TrustCareApiError } from "./errors";
import {
  type PortalCredentialJwtVerification,
  type ResolvedPortalHospitalIssuer,
  verifyPortalHospitalCredentialJwt,
} from "./portalIssuerResolver";
import {
  fetchVerifiedContractResource,
  normalizePortalOrigin,
  type PortalWalletManifest,
  type VerifiedContractResource,
} from "./walletContractLoader";

export const QR_INTEROPERABILITY_CONTRACT_VERSION =
  "2026.07.qr-interoperability.v1" as const;
export const OID4VP_FINAL_PROFILE = "openid4vp-1.0-final" as const;
export const OID4VCI_FINAL_PROFILE = "openid4vci-1.0-final" as const;
export const TRUSTCARE_DIRECT_VC_FORMAT =
  "trustcare_vc2_compact_jws" as const;

const OID4VP_AUDIENCE = "https://self-issued.me/v2";
const PRE_AUTHORIZED_CODE_GRANT =
  "urn:ietf:params:oauth:grant-type:pre-authorized_code";
const REQUIRED_EVIDENCE_CHECKS = [
  "proof",
  "issuer",
  "status",
  "expiry",
  "policy",
  "binding",
] as const;

export type QrInteroperabilityDiscovery = {
  name: string;
  version: "1.0.0";
  contractVersion: typeof QR_INTEROPERABILITY_CONTRACT_VERSION;
  profiles: {
    oid4vp: {
      status: "active";
      profile: typeof OID4VP_FINAL_PROFILE;
      format: typeof TRUSTCARE_DIRECT_VC_FORMAT;
    };
    oid4vci: {
      status: "active";
      profile: typeof OID4VCI_FINAL_PROFILE;
      format: typeof TRUSTCARE_DIRECT_VC_FORMAT;
    };
    directHolderVp: { status: "active"; profile: string };
    smartHealthLinks: { status: "active"; profile: string };
    certifiedShlSidecars: {
      status: "active";
      profile: string;
      transportConformance: false;
    };
  };
  acceptedSchemes: string[];
  endpoints: {
    oid4vpCreate: string;
    oid4vpRequestUri: string;
    oid4vpDirectPost: string;
    oid4vciOfferCreate: string;
    oid4vciOfferUri: string;
    oid4vciToken: string;
    oid4vciNonce: string;
    oid4vciCredential: string;
    directHolderVpResolver: string;
    standardShlManifest: string;
  };
  limits: {
    requestObjectBytes: number;
    holderVpBytes: number;
    referenceUrlCharacters: number;
    oid4vpTtlSeconds: { min: number; max: number };
    oid4vciTtlSeconds: { min: number; max: number };
  };
  requiredBindings: string[];
  prohibitedUses: string[];
};

export type Oid4vciIssuerMetadata = {
  credential_issuer: string;
  authorization_servers: string[];
  credential_endpoint: string;
  nonce_endpoint: string;
  credential_configurations_supported: Record<
    string,
    {
      format: typeof TRUSTCARE_DIRECT_VC_FORMAT;
      cryptographic_binding_methods_supported: string[];
      credential_signing_alg_values_supported: string[];
      proof_types_supported: Record<string, unknown>;
      credential_definition: { type: string[] };
    }
  >;
};

export type OAuthAuthorizationServerMetadata = {
  issuer: string;
  token_endpoint: string;
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  pre_authorized_grant_anonymous_access_supported: boolean;
};

export type PortalInteroperabilityDiscovery = {
  portalOrigin: string;
  portalRevision: string;
  catalog: VerifiedContractResource<PortalWalletManifest>;
  qr: QrInteroperabilityDiscovery;
  credentialIssuer: Oid4vciIssuerMetadata;
  authorizationServer: OAuthAuthorizationServerMetadata;
  provisioning: Record<string, unknown>;
  walletExchange: WalletExchangeDiscovery;
  loadedAt: string;
};

export class PortalInteroperabilityProblemError extends TrustCareApiError {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly problem?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      correlationId?: string;
      problem?: Record<string, unknown>;
    } = {},
  ) {
    super(message, { status: options.status, code: options.code });
    this.name = "PortalInteroperabilityProblemError";
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.problem = options.problem;
  }
}

export async function loadPortalInteroperabilityDiscovery(input: {
  portalBaseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<PortalInteroperabilityDiscovery> {
  const portalOrigin = normalizePortalOrigin(input.portalBaseUrl);
  const fetcher = input.fetchImpl ?? fetch;
  const [
    health,
    catalog,
    qr,
    credentialIssuer,
    authorizationServer,
    provisioning,
    walletExchange,
  ] = await Promise.all([
    getJson(fetcher, `${portalOrigin}/api/health`),
    fetchVerifiedContractResource<PortalWalletManifest>(
      fetcher,
      `${portalOrigin}/api/public/wallet-contracts`,
    ),
    getJson(fetcher, `${portalOrigin}/api/qr/v1`),
    getJson(fetcher, `${portalOrigin}/.well-known/openid-credential-issuer`),
    getJson(fetcher, `${portalOrigin}/.well-known/oauth-authorization-server`),
    getJson(
      fetcher,
      `${portalOrigin}/api/wallet/provisioning/configuration`,
    ),
    getJson(fetcher, `${portalOrigin}/api/wallet/v2`),
  ]);

  const healthObject = record(health, "Portal health");
  if (
    healthObject.status !== "ok" ||
    typeof healthObject.version !== "string" ||
    !/^[a-f0-9]{40}$/.test(healthObject.version)
  ) {
    incompatible("Portal health revision is unavailable or invalid.");
  }
  if (
    catalog.payload.version !== PORTAL_WALLET_V2_CONTRACT_VERSION ||
    catalog.payload.status !== "active"
  ) {
    incompatible("Portal Wallet catalog version is not supported.");
  }

  const validatedQr = assertQrDiscovery(qr, portalOrigin);
  const validatedCredentialIssuer = assertCredentialIssuerMetadata(
    credentialIssuer,
    validatedQr,
    portalOrigin,
  );
  const validatedAuthorizationServer = assertAuthorizationServerMetadata(
    authorizationServer,
    validatedQr,
    portalOrigin,
  );
  const validatedProvisioning = assertProvisioningConfiguration(
    provisioning,
    portalOrigin,
  );
  const validatedExchange = assertWalletExchangeDiscovery(walletExchange);
  if (
    validatedExchange.contractVersion !==
      WALLET_EXCHANGE_V2_CONTRACT_VERSION ||
    validatedExchange.version !== "2.0.1"
  ) {
    incompatible("Wallet Exchange version is not supported.");
  }

  return {
    portalOrigin,
    portalRevision: healthObject.version,
    catalog,
    qr: validatedQr,
    credentialIssuer: validatedCredentialIssuer,
    authorizationServer: validatedAuthorizationServer,
    provisioning: validatedProvisioning,
    walletExchange: validatedExchange,
    loadedAt: (input.now?.() ?? new Date()).toISOString(),
  };
}

export type VerifiedOid4vpRequest = {
  transactionId: string;
  requestUri: string;
  requestObjectJwt: string;
  issuer: ResolvedPortalHospitalIssuer;
  payload: Record<string, unknown>;
  state: string;
  nonce: string;
  responseUri: string;
  recipient: string;
  audience: string;
  context: WalletExchangeServiceContext;
  purpose: string;
  requiredCredentialTypes: string[];
  expiresAt: string;
  requestId?: string;
  correlationId?: string;
};

export type Oid4vpPassReceipt = {
  transactionId: string;
  artifactId: string;
  holderVpJwt: string;
  verifiedAt: string;
  checks: Array<{ key: (typeof REQUIRED_EVIDENCE_CHECKS)[number]; state: "pass" }>;
  requestId?: string;
  correlationId?: string;
};

export type ResolvedOid4vciOffer = {
  offerUri: string;
  credentialIssuer: string;
  credentialConfigurationId: string;
  preAuthorizedCode: string;
  transactionCodeRequired: boolean;
  transactionCodeLength?: number;
  requestId?: string;
  correlationId?: string;
};

export type RedeemedOid4vciCredential = {
  credentialJwt: string;
  credentialId?: string;
  notificationId: string;
  issuerDid: string;
  verification: PortalCredentialJwtVerification & { status: "active" };
  statusPurposes: ["revocation", "suspension"] | ["suspension", "revocation"];
  requestId?: string;
  correlationId?: string;
};

export class PortalQrInteroperabilityClient {
  private readonly fetcher: typeof fetch;
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      discovery: PortalInteroperabilityDiscovery;
      identity: HolderSigningIdentity;
      issuers: ResolvedPortalHospitalIssuer[];
      fetchImpl?: typeof fetch;
      now?: () => Date;
      randomUUID?: () => string;
    },
  ) {
    this.fetcher = options.fetchImpl ?? fetch;
    this.clock = options.now ?? (() => new Date());
  }

  async resolveOid4vpRequest(
    qrPayload: string,
    walletNonce: string,
  ): Promise<VerifiedOid4vpRequest> {
    if (!/^[A-Za-z0-9._~-]{16,200}$/.test(walletNonce)) {
      throw new TrustCareApiError("OID4VP Wallet nonce is invalid.", {
        code: "oid4vp_wallet_nonce_invalid",
      });
    }
    const parsed = parseOid4vpQr(qrPayload);
    assertSamePortalUrl(parsed.requestUri, this.options.discovery.portalOrigin);
    const requestTemplate = this.options.discovery.qr.endpoints.oid4vpRequestUri;
    const transactionId = templateIdentifier(requestTemplate, parsed.requestUri);
    const response = await this.fetcher(parsed.requestUri, {
      method: "POST",
      headers: {
        accept: "application/oauth-authz-req+jwt, application/problem+json",
        "content-type": "application/x-www-form-urlencoded",
        "x-request-id": `wallet-oid4vp-${this.randomId()}`,
      },
      body: new URLSearchParams({ wallet_nonce: walletNonce }).toString(),
      cache: "no-store",
    });
    const trace = responseTrace(response);
    if (!response.ok) throw await problemFromResponse(response, trace.requestId);
    if (!mediaType(response).includes("application/oauth-authz-req+jwt")) {
      throw tracedError("OID4VP request object media type is invalid.", {
        status: response.status,
        code: "oid4vp_request_media_type_invalid",
        ...trace,
      });
    }
    const requestObjectJwt = await response.text();
    const verified = await verifyOid4vpRequestObject({
      jwt: requestObjectJwt,
      issuers: this.options.issuers,
      clientId: parsed.clientId,
      requestUri: parsed.requestUri,
      responseUri: this.options.discovery.qr.endpoints.oid4vpDirectPost,
      transactionId,
      walletNonce,
      now: this.clock(),
    });
    return { ...verified, requestObjectJwt, requestId: trace.requestId, correlationId: trace.correlationId };
  }

  async completeOid4vp(input: {
    request: VerifiedOid4vpRequest;
    consentRef: string;
    credentialJwts: string[];
  }): Promise<Oid4vpPassReceipt> {
    const requestExpiry = new Date(input.request.expiresAt);
    const maxVpExpiry = new Date(this.clock().getTime() + 15 * 60_000);
    const expiresAt =
      requestExpiry.getTime() < maxVpExpiry.getTime()
        ? requestExpiry
        : maxVpExpiry;
    const holderVp = await createHolderSignedDirectVp({
      identity: this.options.identity,
      audience: input.request.audience,
      recipient: input.request.recipient,
      context: input.request.context,
      purpose: input.request.purpose,
      consentRef: input.consentRef,
      credentialJwts: input.credentialJwts,
      nonce: input.request.nonce,
      expiresAt,
      now: this.clock(),
    });
    const response = await this.fetcher(input.request.responseUri, {
      method: "POST",
      headers: {
        accept: "application/json, application/problem+json",
        "content-type": "application/x-www-form-urlencoded",
        "x-request-id": `wallet-oid4vp-post-${this.randomId()}`,
      },
      body: new URLSearchParams({
        state: input.request.state,
        vp_token: holderVp.vpJwt,
      }).toString(),
      cache: "no-store",
    });
    const posted = await readJsonResponse(response);
    const postedObject = record(posted, "OID4VP direct-post receipt");
    if (
      postedObject.status !== "accepted" ||
      postedObject.transaction_id !== input.request.transactionId ||
      typeof postedObject.receipt_uri !== "string"
    ) {
      incompatible("OID4VP direct-post receipt is incompatible.");
    }
    assertSamePortalUrl(
      postedObject.receipt_uri,
      this.options.discovery.portalOrigin,
    );
    const receiptResponse = await this.fetcher(postedObject.receipt_uri, {
      headers: {
        accept: "application/json, application/problem+json",
        "x-request-id": `wallet-oid4vp-receipt-${this.randomId()}`,
      },
      cache: "no-store",
    });
    const receipt = record(
      await readJsonResponse(receiptResponse),
      "OID4VP verification receipt",
    );
    const checks = assertSixPassChecks(receipt.checks);
    if (
      receipt.transactionId !== input.request.transactionId ||
      receipt.status !== "completed" ||
      receipt.verified !== true ||
      typeof receipt.artifactId !== "string" ||
      typeof receipt.verifiedAt !== "string"
    ) {
      throw tracedError("OID4VP verification receipt is not a six-check pass.", {
        status: receiptResponse.status,
        code: "oid4vp_receipt_not_verified",
        ...responseTrace(receiptResponse),
      });
    }
    const trace = responseTrace(receiptResponse);
    return {
      transactionId: input.request.transactionId,
      artifactId: receipt.artifactId,
      holderVpJwt: holderVp.vpJwt,
      verifiedAt: receipt.verifiedAt,
      checks,
      requestId: trace.requestId,
      correlationId: trace.correlationId,
    };
  }

  async resolveOid4vciOffer(qrPayload: string): Promise<ResolvedOid4vciOffer> {
    const offerUri = parseOid4vciOfferUri(qrPayload);
    assertSamePortalUrl(offerUri, this.options.discovery.portalOrigin);
    templateIdentifier(
      this.options.discovery.qr.endpoints.oid4vciOfferUri,
      offerUri,
    );
    const response = await this.fetcher(offerUri, {
      headers: {
        accept: "application/json, application/problem+json",
        "x-request-id": `wallet-oid4vci-offer-${this.randomId()}`,
      },
      cache: "no-store",
    });
    const offer = record(await readJsonResponse(response), "OID4VCI offer");
    if (offer.credential_issuer !== this.options.discovery.credentialIssuer.credential_issuer) {
      incompatible("OID4VCI offer issuer does not match discovery.");
    }
    const configurationIds = stringArray(
      offer.credential_configuration_ids,
      "OID4VCI credential_configuration_ids",
    );
    if (configurationIds.length !== 1 || !this.options.discovery.credentialIssuer.credential_configurations_supported[configurationIds[0]]) {
      incompatible("OID4VCI offer credential configuration is not supported.");
    }
    const grants = record(offer.grants, "OID4VCI grants");
    const grant = record(grants[PRE_AUTHORIZED_CODE_GRANT], "OID4VCI pre-authorized grant");
    const preAuthorizedCode = text(grant["pre-authorized_code"], "OID4VCI pre-authorized code");
    const txCode = optionalRecord(grant.tx_code);
    const trace = responseTrace(response);
    return {
      offerUri,
      credentialIssuer: offer.credential_issuer,
      credentialConfigurationId: configurationIds[0],
      preAuthorizedCode,
      transactionCodeRequired: Boolean(txCode),
      transactionCodeLength: typeof txCode?.length === "number" ? txCode.length : undefined,
      requestId: trace.requestId,
      correlationId: trace.correlationId,
    };
  }

  async redeemOid4vciOffer(input: {
    offer: ResolvedOid4vciOffer;
    transactionCode?: string;
    expectedHolderDid?: string;
  }): Promise<RedeemedOid4vciCredential> {
    if (input.offer.transactionCodeRequired && !input.transactionCode) {
      throw new TrustCareApiError("OID4VCI transaction code is required.", {
        code: "oid4vci_transaction_code_required",
      });
    }
    const tokenResponse = await this.fetcher(
      this.options.discovery.authorizationServer.token_endpoint,
      {
        method: "POST",
        headers: {
          accept: "application/json, application/problem+json",
          "content-type": "application/x-www-form-urlencoded",
          "x-request-id": `wallet-oid4vci-token-${this.randomId()}`,
        },
        body: new URLSearchParams({
          grant_type: PRE_AUTHORIZED_CODE_GRANT,
          "pre-authorized_code": input.offer.preAuthorizedCode,
          ...(input.transactionCode ? { tx_code: input.transactionCode } : {}),
        }).toString(),
        cache: "no-store",
      },
    );
    const token = record(await readJsonResponse(tokenResponse), "OID4VCI token response");
    const accessToken = text(token.access_token, "OID4VCI access token");
    if (token.token_type !== "Bearer" || Number(token.expires_in) < 1) {
      incompatible("OID4VCI token response is incompatible.");
    }

    const nonceResponse = await this.fetcher(
      this.options.discovery.credentialIssuer.nonce_endpoint,
      {
        method: "POST",
        headers: {
          accept: "application/json, application/problem+json",
          "x-request-id": `wallet-oid4vci-nonce-${this.randomId()}`,
        },
        cache: "no-store",
      },
    );
    const noncePayload = record(
      await readJsonResponse(nonceResponse),
      "OID4VCI nonce response",
    );
    const nonce = text(noncePayload.c_nonce, "OID4VCI credential nonce");
    if (Number(noncePayload.c_nonce_expires_in) < 1) {
      incompatible("OID4VCI nonce lifetime is invalid.");
    }
    const proofJwt = await signHolderCompactJws({
      identity: this.options.identity,
      protectedHeader: {
        alg: this.options.identity.jwsAlgorithm,
        typ: "openid4vci-proof+jwt",
        kid: this.options.identity.kid,
      },
      payload: JSON.stringify({
        iss: this.options.identity.did,
        aud: this.options.discovery.credentialIssuer.credential_issuer,
        iat: Math.floor(this.clock().getTime() / 1_000),
        nonce,
        jti: this.randomId(),
      }),
    });
    const credentialResponse = await this.fetcher(
      this.options.discovery.credentialIssuer.credential_endpoint,
      {
        method: "POST",
        headers: {
          accept: "application/json, application/problem+json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-request-id": `wallet-oid4vci-credential-${this.randomId()}`,
        },
        body: JSON.stringify({
          credential_configuration_id: input.offer.credentialConfigurationId,
          proofs: { jwt: [proofJwt] },
        }),
        cache: "no-store",
      },
    );
    const responsePayload = record(
      await readJsonResponse(credentialResponse),
      "OID4VCI credential response",
    );
    const credentials = Array.isArray(responsePayload.credentials)
      ? responsePayload.credentials
      : [];
    const credential = optionalRecord(credentials[0]);
    const credentialJwt = text(
      credential?.credential,
      "OID4VCI compact credential",
    );
    const header = decodeProtectedHeader(credentialJwt);
    const payload = decodeJwt(credentialJwt) as Record<string, unknown>;
    if (
      header.typ !== "vc+jwt" ||
      header.cty !== "vc" ||
      Object.prototype.hasOwnProperty.call(payload, "vc") ||
      Object.prototype.hasOwnProperty.call(payload, "vp")
    ) {
      throw tracedError("OID4VCI credential is not a direct W3C VC compact JWS.", {
        status: credentialResponse.status,
        code: "oid4vci_credential_format_invalid",
        ...responseTrace(credentialResponse),
      });
    }
    const issuerDid = trustCareCredentialIssuerDid(payload.issuer);
    const issuer = this.options.issuers.find(
      (candidate) => candidate.issuerDid === issuerDid,
    );
    if (!issuer) incompatible("OID4VCI credential issuer is not in the Portal Trust Registry.");
    const expectedHolderDid = input.expectedHolderDid ?? this.options.identity.did;
    const verification = await verifyPortalHospitalCredentialJwt({
      jwt: credentialJwt,
      issuer,
      expectedHolderDid,
      fetchImpl: this.fetcher,
      now: this.clock(),
    });
    if (!verification.verified || verification.status !== "active" || !verification.payload) {
      throw tracedError("OID4VCI credential failed strict Wallet verification.", {
        status: credentialResponse.status,
        code: verification.errors[0] ?? "oid4vci_credential_verification_failed",
        ...responseTrace(credentialResponse),
      });
    }
    const purposes = credentialStatusEntries(
      verification.payload.credentialStatus,
    ).map((entry) => entry.statusPurpose);
    if (
      purposes.length !== 2 ||
      !purposes.includes("revocation") ||
      !purposes.includes("suspension")
    ) {
      throw tracedError("OID4VCI credential must carry revocation and suspension status entries.", {
        status: credentialResponse.status,
        code: "oid4vci_status_entries_incomplete",
        ...responseTrace(credentialResponse),
      });
    }
    const trace = responseTrace(credentialResponse);
    return {
      credentialJwt,
      credentialId: typeof payload.id === "string" ? payload.id : undefined,
      notificationId: text(responsePayload.notification_id, "OID4VCI notification id"),
      issuerDid,
      verification: verification as PortalCredentialJwtVerification & { status: "active" },
      statusPurposes: purposes as RedeemedOid4vciCredential["statusPurposes"],
      requestId: trace.requestId,
      correlationId: trace.correlationId,
    };
  }

  private randomId(): string {
    return this.options.randomUUID?.() ?? crypto.randomUUID();
  }
}

async function verifyOid4vpRequestObject(input: {
  jwt: string;
  issuers: ResolvedPortalHospitalIssuer[];
  clientId: string;
  requestUri: string;
  responseUri: string;
  transactionId: string;
  walletNonce: string;
  now: Date;
}): Promise<Omit<VerifiedOid4vpRequest, "requestObjectJwt" | "requestId" | "correlationId">> {
  const prefix = "decentralized_identifier:";
  if (!input.clientId.startsWith(prefix)) {
    incompatible("OID4VP client_id is not a decentralized identifier.");
  }
  const issuerDid = input.clientId.slice(prefix.length);
  const issuer = input.issuers.find((candidate) => candidate.issuerDid === issuerDid);
  if (!issuer) incompatible("OID4VP verifier DID is not in the Portal Trust Registry.");
  const header = decodeProtectedHeader(input.jwt);
  if (header.alg !== "ES256" || header.typ !== "oauth-authz-req+jwt" || typeof header.kid !== "string") {
    incompatible("OID4VP request object protected header is invalid.");
  }
  const method = issuer.didDocument.verificationMethod.find(
    (candidate) => candidate.id === header.kid,
  );
  const jwk = issuer.jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!method || !jwk || method.controller !== issuerDid || !header.kid.startsWith(`${issuerDid}#`)) {
    incompatible("OID4VP request object kid is not controlled by its hospital DID.");
  }
  const verified = await compactVerify(input.jwt, await importJWK(jwk, "ES256"), {
    algorithms: ["ES256"],
  });
  const payload = JSON.parse(
    new TextDecoder().decode(verified.payload),
  ) as Record<string, unknown>;
  if (Object.hasOwn(payload, "vc") || Object.hasOwn(payload, "vp")) {
    incompatible("OID4VP request object contains a legacy wrapper.");
  }
  const trustcare = record(payload.trustcare, "OID4VP trustcare binding");
  const context = text(trustcare.context, "OID4VP context") as WalletExchangeServiceContext;
  if (!WALLET_EXCHANGE_V2_CONTEXTS.includes(context)) incompatible("OID4VP context is unsupported.");
  const recipient = text(trustcare.recipient, "OID4VP recipient");
  const audience = text(trustcare.audience, "OID4VP audience");
  const purpose = text(payload.purpose, "OID4VP purpose");
  const state = text(payload.state, "OID4VP state");
  const nonce = text(payload.nonce, "OID4VP nonce");
  const responseUri = text(payload.response_uri, "OID4VP response_uri");
  const iat = Number(payload.iat);
  const exp = Number(payload.exp);
  const nowSeconds = Math.floor(input.now.getTime() / 1_000);
  if (
    payload.iss !== input.clientId ||
    payload.client_id !== input.clientId ||
    payload.aud !== OID4VP_AUDIENCE ||
    payload.response_type !== "vp_token" ||
    payload.response_mode !== "direct_post" ||
    responseUri !== input.responseUri ||
    audience !== input.responseUri ||
    trustcare.contractVersion !== QR_INTEROPERABILITY_CONTRACT_VERSION ||
    trustcare.transactionId !== input.transactionId ||
    trustcare.consentRequired !== true ||
    payload.wallet_nonce !== input.walletNonce ||
    payload.jti !== input.transactionId ||
    !Number.isSafeInteger(iat) ||
    !Number.isSafeInteger(exp) ||
    iat > nowSeconds + 120 ||
    exp <= nowSeconds - 60 ||
    exp - iat > 600
  ) {
    incompatible("OID4VP request object binding or validity is incompatible.");
  }
  const dcqlCredentials = Array.isArray(record(payload.dcql_query, "OID4VP DCQL query").credentials)
    ? (record(payload.dcql_query, "OID4VP DCQL query").credentials as unknown[])
    : [];
  const requiredCredentialTypes = dcqlCredentials.map((candidate) => {
    const query = record(candidate, "OID4VP DCQL credential query");
    if (query.format !== TRUSTCARE_DIRECT_VC_FORMAT) incompatible("OID4VP DCQL format is unsupported.");
    const definition = record(record(query.meta, "OID4VP DCQL meta").credential_definition, "OID4VP credential definition");
    const types = stringArray(definition.type, "OID4VP credential types");
    const required = types.find((type) => type !== "VerifiableCredential");
    if (!required) incompatible("OID4VP DCQL credential type is missing.");
    return required;
  });
  if (!requiredCredentialTypes.length) incompatible("OID4VP request contains no credential query.");
  return {
    transactionId: input.transactionId,
    requestUri: input.requestUri,
    issuer,
    payload,
    state,
    nonce,
    responseUri,
    recipient,
    audience,
    context,
    purpose,
    requiredCredentialTypes,
    expiresAt: new Date(exp * 1_000).toISOString(),
  };
}

function assertQrDiscovery(
  value: unknown,
  portalOrigin: string,
): QrInteroperabilityDiscovery {
  const object = record(value, "QR interoperability discovery");
  const profiles = record(object.profiles, "QR interoperability profiles");
  const oid4vp = record(profiles.oid4vp, "OID4VP profile");
  const oid4vci = record(profiles.oid4vci, "OID4VCI profile");
  const directHolderVp = record(profiles.directHolderVp, "Direct Holder VP profile");
  const smartHealthLinks = record(profiles.smartHealthLinks, "SHL profile");
  const certifiedShlSidecars = record(profiles.certifiedShlSidecars, "Certified SHL sidecar profile");
  const endpoints = record(object.endpoints, "QR interoperability endpoints");
  const limits = record(object.limits, "QR interoperability limits");
  const oid4vpTtlSeconds = record(limits.oid4vpTtlSeconds, "OID4VP TTL limits");
  const oid4vciTtlSeconds = record(limits.oid4vciTtlSeconds, "OID4VCI TTL limits");
  if (
    object.version !== "1.0.0" ||
    object.contractVersion !== QR_INTEROPERABILITY_CONTRACT_VERSION ||
    oid4vp.status !== "active" ||
    oid4vp.profile !== OID4VP_FINAL_PROFILE ||
    oid4vp.format !== TRUSTCARE_DIRECT_VC_FORMAT ||
    oid4vci.status !== "active" ||
    oid4vci.profile !== OID4VCI_FINAL_PROFILE ||
    oid4vci.format !== TRUSTCARE_DIRECT_VC_FORMAT ||
    directHolderVp.status !== "active" ||
    smartHealthLinks.status !== "active" ||
    certifiedShlSidecars.status !== "active" ||
    certifiedShlSidecars.transportConformance !== false
  ) {
    incompatible("QR interoperability profile is not supported.");
  }
  const acceptedSchemes = stringArray(object.acceptedSchemes, "QR accepted schemes");
  for (const scheme of ["openid4vp", "openid-credential-offer", "https", "shlink"]) {
    if (!acceptedSchemes.includes(scheme)) incompatible(`QR discovery is missing ${scheme}.`);
  }
  const typedEndpoints = Object.fromEntries(
    [
      "oid4vpCreate",
      "oid4vpRequestUri",
      "oid4vpDirectPost",
      "oid4vciOfferCreate",
      "oid4vciOfferUri",
      "oid4vciToken",
      "oid4vciNonce",
      "oid4vciCredential",
      "directHolderVpResolver",
      "standardShlManifest",
    ].map((key) => [key, text(endpoints[key], `QR endpoint ${key}`)]),
  ) as QrInteroperabilityDiscovery["endpoints"];
  Object.values(typedEndpoints).forEach((endpoint) => {
    const normalized = endpoint
      .replace("{transactionId}", "probe")
      .replace("{artifactId}", "probe")
      .replace("{256-bit-token}", "probe");
    assertSamePortalUrl(normalized, portalOrigin);
  });
  if (
    !typedEndpoints.directHolderVpResolver.endsWith(
      "/api/share-gateway/presentations/{artifactId}.jwt",
    )
  ) {
    incompatible("Direct Holder VP resolver template is incompatible.");
  }
  const requiredBindings = stringArray(object.requiredBindings, "QR required bindings");
  REQUIRED_EVIDENCE_CHECKS.forEach(() => undefined);
  for (const binding of ["holder", "recipient", "audience", "purpose", "consentRef", "context", "nonce", "expiry"]) {
    if (!requiredBindings.includes(binding)) incompatible(`QR binding ${binding} is required.`);
  }
  return {
    name: text(object.name, "QR discovery name"),
    version: "1.0.0",
    contractVersion: QR_INTEROPERABILITY_CONTRACT_VERSION,
    profiles: {
      oid4vp: oid4vp as QrInteroperabilityDiscovery["profiles"]["oid4vp"],
      oid4vci: oid4vci as QrInteroperabilityDiscovery["profiles"]["oid4vci"],
      directHolderVp: directHolderVp as QrInteroperabilityDiscovery["profiles"]["directHolderVp"],
      smartHealthLinks: smartHealthLinks as QrInteroperabilityDiscovery["profiles"]["smartHealthLinks"],
      certifiedShlSidecars: certifiedShlSidecars as QrInteroperabilityDiscovery["profiles"]["certifiedShlSidecars"],
    },
    acceptedSchemes,
    endpoints: typedEndpoints,
    limits: {
      requestObjectBytes: positiveNumber(limits.requestObjectBytes, "QR request object limit"),
      holderVpBytes: positiveNumber(limits.holderVpBytes, "QR Holder VP limit"),
      referenceUrlCharacters: positiveNumber(limits.referenceUrlCharacters, "QR URL limit"),
      oid4vpTtlSeconds: {
        min: positiveNumber(oid4vpTtlSeconds.min, "OID4VP minimum TTL"),
        max: positiveNumber(oid4vpTtlSeconds.max, "OID4VP maximum TTL"),
      },
      oid4vciTtlSeconds: {
        min: positiveNumber(oid4vciTtlSeconds.min, "OID4VCI minimum TTL"),
        max: positiveNumber(oid4vciTtlSeconds.max, "OID4VCI maximum TTL"),
      },
    },
    requiredBindings,
    prohibitedUses: stringArray(object.prohibitedUses, "QR prohibited uses"),
  };
}

function assertCredentialIssuerMetadata(
  value: unknown,
  qr: QrInteroperabilityDiscovery,
  portalOrigin: string,
): Oid4vciIssuerMetadata {
  const object = record(value, "OID4VCI issuer metadata");
  const configurations = record(
    object.credential_configurations_supported,
    "OID4VCI credential configurations",
  ) as Oid4vciIssuerMetadata["credential_configurations_supported"];
  if (
    object.credential_issuer !== portalOrigin ||
    object.credential_endpoint !== qr.endpoints.oid4vciCredential ||
    object.nonce_endpoint !== qr.endpoints.oid4vciNonce ||
    !stringArray(object.authorization_servers, "OID4VCI authorization servers").includes(portalOrigin) ||
    !Object.keys(configurations).length
  ) {
    incompatible("OID4VCI issuer metadata is incompatible.");
  }
  for (const [id, configuration] of Object.entries(configurations)) {
    const candidate = record(configuration, `OID4VCI configuration ${id}`);
    if (
      candidate.format !== TRUSTCARE_DIRECT_VC_FORMAT ||
      !stringArray(candidate.cryptographic_binding_methods_supported, `${id} binding methods`).includes("did:key") ||
      !stringArray(candidate.credential_signing_alg_values_supported, `${id} signing algorithms`).includes("ES256")
    ) {
      incompatible(`OID4VCI configuration ${id} is incompatible.`);
    }
  }
  return object as Oid4vciIssuerMetadata;
}

function assertAuthorizationServerMetadata(
  value: unknown,
  qr: QrInteroperabilityDiscovery,
  portalOrigin: string,
): OAuthAuthorizationServerMetadata {
  const object = record(value, "OAuth authorization server metadata");
  if (
    object.issuer !== portalOrigin ||
    object.token_endpoint !== qr.endpoints.oid4vciToken ||
    !stringArray(object.grant_types_supported, "OAuth grant types").includes(PRE_AUTHORIZED_CODE_GRANT) ||
    !stringArray(object.token_endpoint_auth_methods_supported, "OAuth token auth methods").includes("none") ||
    object.pre_authorized_grant_anonymous_access_supported !== true
  ) {
    incompatible("OID4VCI authorization server metadata is incompatible.");
  }
  return object as OAuthAuthorizationServerMetadata;
}

function assertProvisioningConfiguration(
  value: unknown,
  portalOrigin: string,
): Record<string, unknown> {
  const object = record(value, "Wallet provisioning configuration");
  const oidc = record(object.oidc, "Wallet OIDC provisioning");
  const endpoints = record(object.endpoints, "Wallet provisioning endpoints");
  const oidcIssuer = new URL(text(oidc.issuer, "OIDC issuer"));
  if (
    object.schema !== "trustcare.wallet.provisioning-configuration.v1" ||
    oidcIssuer.protocol !== "https:" ||
    typeof oidc.audience !== "string" ||
    typeof oidc.requiredRole !== "string"
  ) {
    incompatible("Wallet provisioning configuration is incompatible.");
  }
  for (const key of ["identity", "provisioning", "holderBindingChallenge", "sandboxTestLogin", "sandboxTestIdentities", "walletExchangeDiscovery"]) {
    assertSamePortalUrl(text(endpoints[key], `Wallet provisioning endpoint ${key}`), portalOrigin);
  }
  return object;
}

function parseOid4vpQr(value: string): {
  clientId: string;
  requestUri: string;
} {
  const parsed = new URL(value.trim());
  if (
    parsed.protocol !== "openid4vp:" ||
    parsed.hostname !== "authorize" ||
    parsed.searchParams.get("request_uri_method") !== "post" ||
    parsed.searchParams.has("request") ||
    parsed.searchParams.has("presentation_definition")
  ) {
    throw new TrustCareApiError("OID4VP QR must use a POST request_uri reference.", {
      code: "oid4vp_qr_invalid",
    });
  }
  return {
    clientId: text(parsed.searchParams.get("client_id"), "OID4VP client_id"),
    requestUri: text(parsed.searchParams.get("request_uri"), "OID4VP request_uri"),
  };
}

function parseOid4vciOfferUri(value: string): string {
  const parsed = new URL(value.trim());
  if (
    parsed.protocol !== "openid-credential-offer:" ||
    parsed.searchParams.has("credential_offer")
  ) {
    throw new TrustCareApiError("OID4VCI QR must use a reference offer URI.", {
      code: "oid4vci_qr_invalid",
    });
  }
  return text(
    parsed.searchParams.get("credential_offer_uri"),
    "OID4VCI credential_offer_uri",
  );
}

function templateIdentifier(template: string, value: string): string {
  const token = template.includes("{transactionId}")
    ? "{transactionId}"
    : "{artifactId}";
  const [prefix, suffix = ""] = template.split(token);
  if (!prefix || !value.startsWith(prefix) || !value.endsWith(suffix)) {
    incompatible("Reference URL does not match the discovered immutable template.");
  }
  const identifier = value.slice(prefix.length, value.length - suffix.length);
  if (!/^[A-Za-z0-9._:-]{8,255}$/.test(identifier)) {
    incompatible("Reference URL identifier is invalid.");
  }
  return identifier;
}

function assertSamePortalUrl(value: string, portalOrigin: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== portalOrigin ||
    url.username ||
    url.password ||
    url.hash
  ) {
    incompatible("Portal interoperability URL is outside the discovered HTTPS origin.");
  }
}

async function getJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { accept: "application/json, application/problem+json" },
    cache: "no-store",
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw await problemFromResponse(response);
  if (!mediaType(response).endsWith("json")) {
    throw tracedError("Portal response is not JSON.", {
      status: response.status,
      code: "portal_response_content_type_invalid",
      ...responseTrace(response),
    });
  }
  return response.json().catch(() => {
    throw tracedError("Portal response JSON is malformed.", {
      status: response.status,
      code: "portal_response_json_invalid",
      ...responseTrace(response),
    });
  });
}

async function problemFromResponse(
  response: Response,
  fallbackRequestId?: string,
): Promise<PortalInteroperabilityProblemError> {
  const trace = responseTrace(response, fallbackRequestId);
  const contentType = mediaType(response);
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  const problem = optionalRecord(payload) ?? {};
  const code =
    typeof problem.code === "string"
      ? problem.code
      : "portal_problem_content_type_invalid";
  const detail =
    typeof problem.detail === "string"
      ? problem.detail
      : typeof problem.title === "string"
        ? problem.title
        : `Portal request failed with HTTP ${response.status}.`;
  return tracedError(detail, {
    status: response.status,
    code:
      contentType === "application/problem+json"
        ? code
        : "portal_problem_content_type_invalid",
    requestId: trace.requestId,
    correlationId: trace.correlationId,
    problem,
  });
}

function tracedError(
  message: string,
  options: ConstructorParameters<typeof PortalInteroperabilityProblemError>[1],
): PortalInteroperabilityProblemError {
  return new PortalInteroperabilityProblemError(message, options);
}

function responseTrace(response: Response, fallbackRequestId?: string): {
  requestId?: string;
  correlationId?: string;
} {
  return {
    requestId: response.headers.get("x-request-id") ?? fallbackRequestId,
    correlationId: response.headers.get("x-correlation-id") ?? undefined,
  };
}

function mediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}

function assertSixPassChecks(
  value: unknown,
): Oid4vpPassReceipt["checks"] {
  if (!Array.isArray(value)) incompatible("Verification receipt checks are missing.");
  const checks = value.map((entry) => record(entry, "Verification receipt check"));
  for (const key of REQUIRED_EVIDENCE_CHECKS) {
    const matches = checks.filter((check) => check.key === key && check.state === "pass");
    if (matches.length !== 1) incompatible(`Verification receipt check ${key} did not pass exactly once.`);
  }
  if (checks.length !== REQUIRED_EVIDENCE_CHECKS.length) {
    incompatible("Verification receipt contains unknown check semantics.");
  }
  return checks as Oid4vpPassReceipt["checks"];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    incompatible(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    incompatible(`${label} must be a non-empty string.`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry)
  ) {
    incompatible(`${label} must be a string array.`);
  }
  return value as string[];
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    incompatible(`${label} must be positive.`);
  }
  return value;
}

function incompatible(message: string): never {
  throw new TrustCareApiError(message, {
    code: "portal_interoperability_contract_incompatible",
  });
}

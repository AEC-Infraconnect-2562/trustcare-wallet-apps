import { describe, expect, it, vi } from "vitest";
import {
  generateHolderIdentity,
  sandboxHolderIdentityForUser,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import {
  WalletProvisioningClient,
  WalletProvisioningProblemError,
  type WalletProvisioningConfiguration,
} from "./walletProvisioning";

const PORTAL =
  "https://trustcare-hospital-network-production.up.railway.app";
const APP_ID = "trustcare-wallet-production";
const OIDC_ISSUER = "https://iam.example/realms/trustcare-wallet";
const NOW = new Date("2026-07-16T01:00:00.000Z");

describe("WalletProvisioningClient", () => {
  it("reloads the live configuration without cache or invented sandbox endpoints", async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse(configuration({ oidcIssuer: null })),
    ]);
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl,
    });

    const result = await client.reloadConfiguration();

    expect(result.oidc.issuer).toBeNull();
    expect(result.endpoints.sandboxTestLogin).toBeNull();
    expect(result.holder.privateKeyOwner).toBe("wallet");
    expect(fetchImpl).toHaveBeenCalledWith(
      `${PORTAL}/api/wallet/provisioning/configuration`,
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    const requestHeaders = new Headers(
      vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers,
    );
    expect(requestHeaders.has("cache-control")).toBe(false);
    expect(requestHeaders.has("pragma")).toBe(false);
  });

  it("rejects a configuration endpoint that changes Portal origin", async () => {
    const value = configuration({ oidcIssuer: null });
    value.endpoints.provisioning = "https://attacker.example/api/wallet/provisioning";
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([jsonResponse(value)]),
    });

    await expect(client.loadConfiguration()).rejects.toMatchObject({
      code: "wallet_provisioning_contract_invalid",
    });
  });

  it("fails closed when sandbox login is not advertised", async () => {
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([
        jsonResponse(configuration({ oidcIssuer: null })),
      ]),
    });

    await expect(client.sandboxTestLogin("demo-patient-001")).rejects.toBeInstanceOf(
      WalletProvisioningProblemError,
    );
  });

  it("accepts an opaque sandbox catalog generation after schema validation", async () => {
    const holder = await sandboxHolderIdentityForUser({
      userId: "demo-patient-004",
      sandboxRuntime: true,
    });
    expect(holder).toBeDefined();
    const config = configuration({ oidcIssuer: null });
    config.endpoints.sandboxTestIdentities = `${PORTAL}/api/wallet/test-identities`;
    const linked = linkedCatalogIdentity(holder!);
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([
        jsonResponse(config),
        jsonResponse({
          schema: "trustcare.wallet.test-identities.v1",
          catalogVersion: "2026.07.test-identities.v7",
          identities: [{ ...linked, futureOptionalLabel: "preserved" }],
          futureCatalogMetadata: { optional: true },
        }),
      ]),
    });

    const catalog = await client.loadSandboxTestIdentityCatalog();

    expect(catalog.catalogVersion).toBe("2026.07.test-identities.v7");
    expect(catalog.extensions).toEqual({
      futureCatalogMetadata: { optional: true },
    });
    expect(catalog.identities[0]).toMatchObject({
      walletUserId: "demo-patient-004",
      portraitUrl: `${PORTAL}/seed-avatars/patient-004.jpg`,
      holder: {
        did: holder!.did,
        publicJwk: holder!.publicJwk,
        privateKeyOwner: "wallet",
      },
      extensions: { futureOptionalLabel: "preserved" },
    });
  });

  it("validates every required sandbox OIDC access-token claim", async () => {
    const config = configuration({ oidcIssuer: OIDC_ISSUER });
    config.endpoints.sandboxTestLogin = `${PORTAL}/api/wallet/test-login`;
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([
        jsonResponse(config),
        jsonResponse(sandboxTokenResponse(sandboxTokenClaims())),
      ]),
      now: () => NOW,
    });

    const token = await client.sandboxTestLogin("demo-patient-001");

    expect(token).toMatchObject({
      tokenType: "Bearer",
      testOnly: true,
      username: "demo-patient-001",
    });
  });

  it.each([
    ["issuer", (claims: Record<string, any>) => (claims.iss = "https://attacker.example")],
    ["audience", (claims: Record<string, any>) => (claims.aud = ["wrong-api"])],
    ["authorized party", (claims: Record<string, any>) => (claims.azp = "unknown-client")],
    ["subject", (claims: Record<string, any>) => delete claims.sub],
    ["expiry", (claims: Record<string, any>) => (claims.exp = 1)],
    ["wallet role", (claims: Record<string, any>) => (claims.realm_access.roles = ["patient"])],
  ])("rejects a sandbox OIDC token with wrong %s", async (_label, mutate) => {
    const claims = sandboxTokenClaims();
    mutate(claims);
    const config = configuration({ oidcIssuer: OIDC_ISSUER });
    config.endpoints.sandboxTestLogin = `${PORTAL}/api/wallet/test-login`;
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([
        jsonResponse(config),
        jsonResponse(sandboxTokenResponse(claims)),
      ]),
      now: () => NOW,
    });

    await expect(client.sandboxTestLogin("demo-patient-001")).rejects.toMatchObject({
      code: "wallet_provisioning_contract_invalid",
    });
  });

  it("rejects a catalog holder DID that is not derived from its public JWK", async () => {
    const holder = await sandboxHolderIdentityForUser({
      userId: "demo-patient-004",
      sandboxRuntime: true,
    });
    const config = configuration({ oidcIssuer: null });
    config.endpoints.sandboxTestIdentities = `${PORTAL}/api/wallet/test-identities`;
    const linked = linkedCatalogIdentity(holder!);
    linked.holder.did = "did:key:z6MkWrongCatalogHolder";
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([
        jsonResponse(config),
        jsonResponse({
          schema: "trustcare.wallet.test-identities.v1",
          catalogVersion: "2026.07.test-identities.v4",
          identities: [linked],
        }),
      ]),
    });

    await expect(client.listSandboxTestIdentities()).rejects.toMatchObject({
      code: "wallet_provisioning_contract_invalid",
    });
  });

  it("keeps request and correlation identifiers separate on Portal failures", async () => {
    const config = configuration({ oidcIssuer: null });
    config.endpoints.sandboxTestLogin = `${PORTAL}/api/wallet/test-login`;
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      fetchImpl: sequenceFetch([
        jsonResponse(config),
        jsonResponse(
          { error: "wallet_identity_not_linked", message: "Identity is not linked." },
          {
            status: 409,
            headers: {
              "x-request-id": "request-001",
              "x-correlation-id": "correlation-001",
            },
          },
        ),
      ]),
    });

    await expect(client.sandboxTestLogin("demo-patient-001")).rejects.toMatchObject({
      code: "wallet_identity_not_linked",
      requestId: "request-001",
      correlationId: "correlation-001",
    });
  });

  it("signs the exact holder challenge and requires ready provisioning before exchange", async () => {
    const identity = await generateHolderIdentity({
      algorithm: "P-256",
      extractable: true,
    });
    const now = new Date("2026-07-13T10:00:00.000Z");
    const challengeId = "3cf2693d-3d7a-4d98-9f83-96027e3033b8";
    const challenge = {
      challengeId,
      appId: APP_ID,
      holderDid: identity.did,
      verificationMethodId: identity.kid,
      algorithm: "ES256",
      payload: {
        iss: identity.did,
        sub: identity.did,
        aud: `${PORTAL}/api/wallet/keys/bind`,
        jti: challengeId,
        nonce: "FBI5SYzGb-axafzRSxFoBBLjfYv0HkPMvECXmrzznuM",
        purpose: "trustcare-wallet-key-binding",
        iat: 1783936800,
        exp: 1783937100,
      },
      expiresAt: "2026-07-13T10:05:00.000Z",
    };
    const fetchImpl = sequenceFetch([
      jsonResponse(configuration({ oidcIssuer: "https://iam.example/realms/wallet" })),
      jsonResponse(challenge, { status: 201 }),
      jsonResponse({ bound: true, holderKey: { holderDid: identity.did } }),
      jsonResponse(readyProvisioning(identity)),
    ]);
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      identity,
      fetchImpl,
      now: () => now,
    });

    const result = await client.bindHolder({
      oidcAccessToken: "wallet-oidc-access-token",
      consentRef: "wallet-consent:3cf2693d-3d7a-4d98-9f83-96027e3033b8",
    });

    expect(result.ready).toBe(true);
    const calls = vi.mocked(fetchImpl).mock.calls;
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      appId: APP_ID,
      holderDid: identity.did,
      publicJwk: identity.publicJwk,
      consentRef: "wallet-consent:3cf2693d-3d7a-4d98-9f83-96027e3033b8",
      supersedesHolderDid: null,
    });
    expect(String(calls[1]?.[1]?.body)).not.toContain('"d"');
    const completion = JSON.parse(String(calls[2]?.[1]?.body));
    expect(completion.proofJwt.split(".")).toHaveLength(3);
    expect(calls[2]?.[0]).toBe(
      `${PORTAL}/api/wallet/keys/challenges/${challengeId}/complete`,
    );
  });

  it.each([
    ["holder DID", (challenge: any) => (challenge.holderDid = "did:key:zWrong")],
    ["issuer", (challenge: any) => (challenge.payload.iss = "did:key:zWrong")],
    ["kid", (challenge: any) => (challenge.verificationMethodId = `${challenge.holderDid}#wrong`)],
    ["audience", (challenge: any) => (challenge.payload.aud = "https://attacker.example/bind")],
    ["purpose", (challenge: any) => (challenge.payload.purpose = "issue-hospital-vc")],
    ["expiry", (challenge: any) => (challenge.payload.exp = challenge.payload.iat - 1)],
  ])("rejects a holder binding challenge with wrong %s", async (_label, mutate) => {
    const identity = await generateHolderIdentity({
      algorithm: "P-256",
      extractable: true,
    });
    const challenge = holderChallenge(identity);
    mutate(challenge);
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      identity,
      fetchImpl: sequenceFetch([
        jsonResponse(configuration({ oidcIssuer: "https://iam.example/realms/wallet" })),
        jsonResponse(challenge, { status: 201 }),
      ]),
      now: () => new Date("2026-07-13T10:00:00.000Z"),
    });

    await expect(
      client.bindHolder({
        oidcAccessToken: "wallet-oidc-access-token",
        consentRef: "wallet-consent:test",
      }),
    ).rejects.toMatchObject({ code: "wallet_provisioning_contract_invalid" });
  });

  it("never accepts patientId in holder binding input", () => {
    type BindingInput = Parameters<WalletProvisioningClient["bindHolder"]>[0];
    const forbidden: BindingInput = {
      oidcAccessToken: "token",
      consentRef: "wallet-consent:test",
      // @ts-expect-error Portal patient identifiers are not part of the Wallet API.
      patientId: 42,
    };
    expect(forbidden).toHaveProperty("patientId", 42);
  });

  it("revokes only the exact Wallet-owned holder binding without a Portal patient id", async () => {
    const identity = await generateHolderIdentity({
      algorithm: "P-256",
      extractable: true,
    });
    const fetchImpl = sequenceFetch([
      jsonResponse(configuration({ oidcIssuer: OIDC_ISSUER })),
      jsonResponse({
        schema: "trustcare.wallet.holder-binding-revocation.v1",
        status: "revoked",
        revokedAt: "2026-07-16T01:00:00.000Z",
        nextAction: "restart_holder_provisioning",
      }),
    ]);
    const client = new WalletProvisioningClient({
      portalBaseUrl: PORTAL,
      appId: APP_ID,
      identity,
      fetchImpl,
    });

    const result = await client.revokeHolderBinding({
      oidcAccessToken: "wallet-oidc-access-token",
      reason: "security_reset",
    });

    expect(result.nextAction).toBe("restart_holder_provisioning");
    const body = JSON.parse(
      String(vi.mocked(fetchImpl).mock.calls[1]?.[1]?.body),
    );
    expect(body).toEqual({
      appId: APP_ID,
      holderDid: identity.did,
      reason: "security_reset",
    });
    expect(body).not.toHaveProperty("patientId");
  });
});

function configuration(input: {
  oidcIssuer: string | null;
}): WalletProvisioningConfiguration {
  return {
    schema: "trustcare.wallet.provisioning-configuration.v1" as const,
    appId: APP_ID,
    oidc: {
      issuer: input.oidcIssuer,
      audience: "trustcare-wallet-api",
      requiredRole: "wallet_access",
      flow: "authorization_code",
      responseType: "code",
      pkce: { required: true, method: "S256" },
      discovery: input.oidcIssuer
        ? `${input.oidcIssuer}/.well-known/openid-configuration`
        : null,
      authorizationEndpoint: input.oidcIssuer
        ? `${input.oidcIssuer}/protocol/openid-connect/auth`
        : null,
      tokenEndpoint: input.oidcIssuer
        ? `${input.oidcIssuer}/protocol/openid-connect/token`
        : null,
      revocationEndpoint: input.oidcIssuer
        ? `${input.oidcIssuer}/protocol/openid-connect/revoke`
        : null,
      endSessionEndpoint: input.oidcIssuer
        ? `${input.oidcIssuer}/protocol/openid-connect/logout`
        : null,
      clients: { web: "trustcare-wallet-web", mobile: "trustcare-wallet-mobile" },
      clientMetadata: {
        web: { tokenEndpointAuthMethod: "none" },
        mobile: {
          tokenEndpointAuthMethod: "none",
          redirectUri: "trustcare-wallet://oidc/callback",
          postLogoutRedirectUri: "trustcare-wallet://oidc/logout",
        },
      },
    },
    endpoints: {
      identity: `${PORTAL}/api/wallet/identity`,
      provisioning: `${PORTAL}/api/wallet/provisioning`,
      holderBindingChallenge: `${PORTAL}/api/wallet/keys/challenges`,
      holderBindingCompletionTemplate: `${PORTAL}/api/wallet/keys/challenges/{challengeId}/complete`,
      holderBindingRevocation: `${PORTAL}/api/wallet/provisioning/revocations`,
      sandboxTestLogin: null,
      sandboxTestIdentities: null,
      walletExchangeDiscovery: `${PORTAL}/api/wallet/v2`,
    },
    holder: {
      didMethod: "did:key" as const,
      algorithms: ["EdDSA", "ES256"],
      privateKeyOwner: "wallet" as const,
      keyRecovery: {
        policyVersion: "2026.07.wallet-holder-key-recovery.v1",
        restoredKey: "Wallet secure backup only",
        replacementKey: "OIDC re-authentication and holder proof",
        oldBinding: "revoked after replacement proof succeeds",
        crossDeviceSessionRecovery: "DPoP session is recreated",
      },
    },
  };
}

function holderChallenge(identity: HolderSigningIdentity) {
  return {
    challengeId: "3cf2693d-3d7a-4d98-9f83-96027e3033b8",
    appId: APP_ID,
    holderDid: identity.did,
    verificationMethodId: identity.kid,
    algorithm: identity.jwsAlgorithm,
    payload: {
      iss: identity.did,
      sub: identity.did,
      aud: `${PORTAL}/api/wallet/keys/bind`,
      jti: "3cf2693d-3d7a-4d98-9f83-96027e3033b8",
      nonce: "FBI5SYzGb-axafzRSxFoBBLjfYv0HkPMvECXmrzznuM",
      purpose: "trustcare-wallet-key-binding",
      iat: 1783936800,
      exp: 1783937100,
    },
    expiresAt: "2026-07-13T10:05:00.000Z",
  };
}

function linkedCatalogIdentity(identity: HolderSigningIdentity) {
  return {
    walletUserId: "demo-patient-004",
    username: "demo-patient-004",
    name: "นางสาวฮารุกะ ทานากะ",
    nameEn: "Ms. Haruka Tanaka",
    email: "haruka@example.test",
    phone: null,
    birthDate: "1992-04-18",
    gender: "female",
    nationality: "JPN",
    preferredLocale: "ja-JP",
    scenario: "cross_border_missing_documents",
    homeHospitalCode: "TCM",
    connectedHospitalCodes: ["TCM"],
    useCases: ["cross_border"],
    expectedCredentialTypes: ["patient_identity"],
    expectedObjectTypes: ["credential:patient_identity"],
    expectedFlowStates: ["holder_binding_required"],
    portraitUrl: `${PORTAL}/seed-avatars/patient-004.jpg`,
    holder: {
      did: identity.did,
      algorithm: "EdDSA",
      publicJwk: identity.publicJwk,
      privateKeyOwner: "wallet",
    },
    expectedProvisioningState: "holder_binding_required",
    patientReferenceProvisioned: true,
  };
}

function readyProvisioning(identity: HolderSigningIdentity) {
  return {
    schema: "trustcare.wallet.provisioning.v1",
    identityLinked: true,
    portalSession: false,
    app: {
      appId: APP_ID,
      status: "active",
      trustLevel: "verified",
      scopes: [
        "credentials:read",
        "credentials:request",
        "credentials:present",
        "documents:read",
        "documents:write",
      ],
      oidcClientAllowed: true,
    },
    holder: {
      holderDid: identity.did,
      bound: true,
      proofVerifiedAt: "2026-07-13T10:00:01.000Z",
    },
    ready: true,
    nextAction: "create_exchange_session",
  };
}

function sequenceFetch(responses: Response[]): typeof fetch {
  return vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch");
    return response;
  }) as unknown as typeof fetch;
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function sandboxTokenClaims(): Record<string, any> {
  return {
    iss: OIDC_ISSUER,
    aud: ["trustcare-wallet-api"],
    azp: "trustcare-wallet-test-broker",
    sub: "sandbox-oidc-subject-001",
    exp: Math.floor(NOW.getTime() / 1_000) + 300,
    realm_access: { roles: ["wallet_access", "patient"] },
  };
}

function sandboxTokenResponse(claims: Record<string, any>) {
  return {
    testOnly: true,
    username: "demo-patient-001",
    token_type: "Bearer",
    access_token: compactJwt(claims),
    expires_in: 300,
  };
}

function compactJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.test-signature`;
}

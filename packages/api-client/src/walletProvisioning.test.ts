import { describe, expect, it, vi } from "vitest";
import {
  generateHolderIdentity,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import {
  WalletProvisioningClient,
  WalletProvisioningProblemError,
} from "./walletProvisioning";

const PORTAL =
  "https://trustcare-hospital-network-production.up.railway.app";
const APP_ID = "trustcare-wallet-production";

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
});

function configuration(input: { oidcIssuer: string | null }) {
  return {
    schema: "trustcare.wallet.provisioning-configuration.v1" as const,
    appId: APP_ID,
    oidc: {
      issuer: input.oidcIssuer,
      audience: "trustcare-wallet-api",
      requiredRole: "wallet_access",
      clients: { web: "trustcare-wallet-web", mobile: "trustcare-wallet-mobile" },
    },
    endpoints: {
      identity: `${PORTAL}/api/wallet/identity`,
      provisioning: `${PORTAL}/api/wallet/provisioning`,
      holderBindingChallenge: `${PORTAL}/api/wallet/keys/challenges`,
      holderBindingCompletionTemplate: `${PORTAL}/api/wallet/keys/challenges/{challengeId}/complete`,
      sandboxTestLogin: null,
      sandboxTestIdentities: null,
      walletExchangeDiscovery: `${PORTAL}/api/wallet/v2`,
    },
    holder: {
      didMethod: "did:key" as const,
      algorithms: ["EdDSA", "ES256"] as const,
      privateKeyOwner: "wallet" as const,
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

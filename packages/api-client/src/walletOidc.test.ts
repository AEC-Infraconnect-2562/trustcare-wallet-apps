import { describe, expect, it, vi } from "vitest";
import { WalletOidcClient } from "./walletOidc";
import type { WalletProvisioningConfiguration } from "./walletProvisioning";

const PORTAL = "https://portal.example";
const ISSUER = "https://iam.example/realms/trustcare-wallet";
const NOW = new Date("2026-07-16T01:00:00.000Z");

describe("WalletOidcClient", () => {
  it("builds a public-client PKCE request from the independent live OIDC issuer", async () => {
    const client = new WalletOidcClient({
      configuration: configuration(),
      platform: "web",
      now: () => NOW,
      randomBytes: (length) => new Uint8Array(length).fill(7),
    });

    const request = await client.createAuthorizationRequest({
      redirectUri: "https://wallet.example/oidc/callback",
    });
    const url = new URL(request.authorizationUrl);

    expect(url.origin).toBe("https://iam.example");
    expect(url.searchParams.get("client_id")).toBe("trustcare-wallet-web");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(request.codeChallenge);
    expect(request.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(request.expiresAt).toBe("2026-07-16T01:10:00.000Z");
  });

  it("exchanges and refreshes tokens without a client secret and validates issuer claims", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        tokenResponse(
          accessToken({ azp: "trustcare-wallet-web" }),
          "refresh-token-value-that-is-long-enough",
        ),
      )
      .mockResolvedValueOnce(
        tokenResponse(
          accessToken({ azp: "trustcare-wallet-web" }),
          "rotated-refresh-token-that-is-long-enough",
        ),
      );
    const client = new WalletOidcClient({
      configuration: configuration(),
      platform: "web",
      fetchImpl,
      now: () => NOW,
    });

    const exchanged = await client.exchangeAuthorizationCode({
      code: "authorization-code",
      codeVerifier: "a".repeat(64),
      redirectUri: "https://wallet.example/oidc/callback",
    });
    const refreshed = await client.refresh(exchanged.refreshToken!);

    expect(exchanged.accessToken.split(".")).toHaveLength(3);
    expect(refreshed.refreshToken).toContain("rotated");
    for (const call of fetchImpl.mock.calls) {
      expect(call[0]).toBe(`${ISSUER}/protocol/openid-connect/token`);
      const body = String(call[1]?.body);
      expect(body).toContain("client_id=trustcare-wallet-web");
      expect(body).not.toContain("client_secret");
      expect(body).not.toContain(PORTAL);
    }
  });

  it("fails closed on a wrong authorized party and uses published revocation/logout endpoints", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse(accessToken({ azp: "wrong-app" })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new WalletOidcClient({
      configuration: configuration(),
      platform: "mobile",
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.exchangeAuthorizationCode({
        code: "authorization-code",
        codeVerifier: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "wallet_oidc_claims_invalid" });

    await client.revokeToken({
      token: "refresh-token-value-that-is-long-enough",
      tokenTypeHint: "refresh_token",
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `${ISSUER}/protocol/openid-connect/revoke`,
    );
    const logout = new URL(
      client.createEndSessionUrl({ state: "logout-state-value" }),
    );
    expect(logout.toString()).toContain("protocol/openid-connect/logout");
    expect(logout.searchParams.get("post_logout_redirect_uri")).toBe(
      "trustcare-wallet://oidc/logout",
    );
  });
});

function configuration(): WalletProvisioningConfiguration {
  return {
    schema: "trustcare.wallet.provisioning-configuration.v1",
    appId: "trustcare-wallet-production",
    oidc: {
      issuer: ISSUER,
      audience: "trustcare-wallet-api",
      requiredRole: "wallet_access",
      flow: "authorization_code",
      responseType: "code",
      pkce: { required: true, method: "S256" },
      discovery: `${ISSUER}/.well-known/openid-configuration`,
      authorizationEndpoint: `${ISSUER}/protocol/openid-connect/auth`,
      tokenEndpoint: `${ISSUER}/protocol/openid-connect/token`,
      revocationEndpoint: `${ISSUER}/protocol/openid-connect/revoke`,
      endSessionEndpoint: `${ISSUER}/protocol/openid-connect/logout`,
      clients: {
        web: "trustcare-wallet-web",
        mobile: "trustcare-wallet-mobile",
      },
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
      sandboxTestLogin: `${PORTAL}/api/wallet/test-login`,
      sandboxTestIdentities: `${PORTAL}/api/wallet/test-identities`,
      walletExchangeDiscovery: `${PORTAL}/api/wallet/v2`,
    },
    holder: {
      didMethod: "did:key",
      algorithms: ["EdDSA", "ES256"],
      privateKeyOwner: "wallet",
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

function accessToken(input: { azp: string }): string {
  const claims = {
    iss: ISSUER,
    aud: ["trustcare-wallet-api"],
    azp: input.azp,
    sub: "oidc-subject-001",
    exp: Math.floor(NOW.getTime() / 1_000) + 300,
    realm_access: { roles: ["wallet_access"] },
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

function tokenResponse(
  accessTokenValue: string,
  refreshToken = "refresh-token-value-that-is-long-enough",
): Response {
  return new Response(
    JSON.stringify({
      token_type: "Bearer",
      access_token: accessTokenValue,
      refresh_token: refreshToken,
      expires_in: 300,
      refresh_expires_in: 1800,
      scope: "openid profile email",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

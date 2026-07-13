import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  sandboxHolderIdentityForUser,
  type HolderSigningIdentity,
} from "@trustcare/wallet-core";
import { loadWalletExchangeContracts } from "./walletContractLoader";
import { WalletExchangeV2Client } from "./walletExchangeV2";
import {
  WalletProvisioningClient,
  WalletProvisioningProblemError,
} from "./walletProvisioning";

const liveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_BINDING_TEST === "1";
const portalBaseUrl =
  process.env.TRUSTCARE_PORTAL_BASE_URL ??
  "https://trustcare-hospital-network-production.up.railway.app";
const username =
  process.env.TRUSTCARE_WALLET_TEST_USERNAME ?? "demo-patient-003";
const appId = "trustcare-wallet-production";

describe.skipIf(!liveEnabled)("live Portal Wallet binding and sync", () => {
  it("reloads configuration then completes test-login -> binding -> DPoP session -> sync", async () => {
    const identity = await sandboxHolderIdentityForUser({
      userId: username,
      sandboxRuntime: true,
    });
    expect(identity).toBeDefined();
    const holder = identity as HolderSigningIdentity;
    const provisioning = new WalletProvisioningClient({
      portalBaseUrl,
      appId,
      identity: holder,
    });

    const configuration = await provisioning.reloadConfiguration();
    expect(configuration.endpoints.sandboxTestLogin).toContain(
      "/api/wallet/test-login",
    );
    const catalog = await provisioning.listSandboxTestIdentities();
    expect(catalog.some((entry) => entry.username === username)).toBe(true);

    const oidc = await provisioning.sandboxTestLogin(username);
    expect(oidc.testOnly).toBe(true);
    let walletIdentity;
    try {
      walletIdentity = await provisioning.getWalletIdentity(oidc.accessToken);
    } catch (reason) {
      const claims = decodeJwt(oidc.accessToken);
      const problem =
        reason instanceof WalletProvisioningProblemError ? reason : undefined;
      throw new Error(
        [
          "Portal rejected the sandbox OIDC access token before holder binding.",
          `status=${problem?.status ?? "unknown"}`,
          `code=${problem?.code ?? "unknown"}`,
          `correlationId=${problem?.correlationId ?? "missing"}`,
          `sub=${typeof claims.sub === "string" && claims.sub ? "present" : "missing"}`,
          `iss=${String(claims.iss ?? "missing")}`,
          `azp=${String(claims.azp ?? "missing")}`,
        ].join(" "),
      );
    }
    expect(walletIdentity).toMatchObject({
      linked: true,
      username,
      portalSession: false,
      walletExchangeAppId: appId,
    });
    let status = await provisioning.getProvisioningStatus(oidc.accessToken);
    if (!status.ready) {
      expect(status.nextAction).toBe("complete_holder_binding");
      status = await provisioning.bindHolder({
        oidcAccessToken: oidc.accessToken,
        consentRef: `wallet-consent:live-e2e:${username}`,
      });
    }
    expect(status).toMatchObject({
      identityLinked: true,
      ready: true,
      holder: { holderDid: holder.did, bound: true },
      nextAction: "create_exchange_session",
    });

    const contracts = await loadWalletExchangeContracts({
      portalBaseUrl,
      runtimeEnvironment: "sandbox",
      walletVersion: "0.1.0",
    });
    const exchange = new WalletExchangeV2Client({
      contracts,
      identity: holder,
      appId,
      requestedScopes: [
        "credentials:read",
        "credentials:request",
        "credentials:present",
        "documents:read",
        "documents:write",
      ],
    });
    const session = await exchange.createSession();
    expect(session).toMatchObject({
      tokenType: "DPoP",
      holderDid: holder.did,
      publicJwkThumbprint: holder.publicJwkThumbprint,
    });

    const page = await exchange.syncCredentials({ limit: 100 });
    expect(page.schema).toBe("trustcare.wallet.sync.v2");
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.changes.length).toBeGreaterThan(0);
    console.info(
      `Live Portal sync returned ${page.changes.length} credential changes for ${username}.`,
    );
    for (const change of page.changes) {
      if (change.type === "credential.upsert") {
        expect(change.credential).toMatchObject({
          holderDid: holder.did,
          sourceSystem: "trustcare_portal",
          deliveryState: "signed",
          proof: { type: "jwt" },
        });
      }
    }
  }, 60_000);
});

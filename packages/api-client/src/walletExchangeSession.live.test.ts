import { describe, expect, it } from "vitest";
import { sandboxHolderIdentityForUser } from "@trustcare/wallet-core";
import { loadWalletExchangeContracts } from "./walletContractLoader";
import { createWalletExchangeV2Client } from "./walletExchangeV2";

const portalBaseUrl =
  process.env.TRUSTCARE_PORTAL_BASE_URL ??
  "https://trustcare-hospital-network-production.up.railway.app";
const liveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_EXCHANGE_TEST === "1";

describe.skipIf(!liveEnabled)("live Portal Wallet Exchange session", () => {
  it("creates a holder-bound DPoP session and reads the durable sync stream", async () => {
    const identity = await sandboxHolderIdentityForUser({
      userId: "demo-patient-001",
      sandboxRuntime: true,
    });
    expect(identity).toBeDefined();

    const contracts = await loadWalletExchangeContracts({
      portalBaseUrl,
      runtimeEnvironment: "sandbox",
      walletVersion: "0.1.0",
    });
    const client = createWalletExchangeV2Client({
      contracts,
      identity: identity!,
      appId: "trustcare-wallet-production",
      requestedScopes: ["credentials:read"],
    });

    const session = await client.createSession();
    expect(session).toMatchObject({
      tokenType: "DPoP",
      holderDid: identity!.did,
      publicJwkThumbprint: identity!.publicJwkThumbprint,
    });

    const page = await client.syncCredentials({ limit: 25 }).catch((error) => {
      const record = error as Record<string, unknown>;
      throw new Error(
        JSON.stringify({
          message: record.message,
          status: record.status,
          code: record.code,
          correlationId: record.correlationId,
          retryable: record.retryable,
        }),
      );
    });
    expect(page.syncId).toBeTruthy();
    expect(page.cursor).toBeTruthy();
    expect(Array.isArray(page.changes)).toBe(true);
  }, 45_000);
});

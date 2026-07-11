import { describe, expect, it } from "vitest";
import { loadWalletExchangeContracts } from "./walletContractLoader";

const portalBaseUrl =
  process.env.TRUSTCARE_PORTAL_BASE_URL ??
  "https://trustcare-hospital-network-production.up.railway.app";
const liveEnabled = process.env.TRUSTCARE_PORTAL_LIVE_CONTRACT_TEST === "1";

describe.skipIf(!liveEnabled)("live Portal Wallet Exchange contracts", () => {
  it("loads only integrity-checked compatible sandbox contracts", async () => {
    const contracts = await loadWalletExchangeContracts({
      portalBaseUrl,
      runtimeEnvironment: "sandbox",
    });

    expect(contracts.health).toMatchObject({
      status: "ok",
      persistent: true,
      tokenBinding: "DPoP",
      credentialSync: "durable_cursor",
    });
    expect(contracts.manifest.etag).toBe(
      `"sha256-${contracts.manifest.sha256}"`,
    );
    expect(contracts.renderContract.payload).toMatchObject({
      authority: "wallet",
      primaryPath: "credentialSubject.humanDocument.renderData",
      legacyWriteAllowed: false,
    });
  }, 30_000);
});

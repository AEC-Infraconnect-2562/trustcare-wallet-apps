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
      primaryPath: "credentialSubject.data.humanDocument",
      requiredBlocks: ["document"],
      legacyReadCompatibility: [],
      legacyWriteAllowed: false,
    });
    expect(contracts.schema.payload.schema.required).toEqual(
      expect.arrayContaining([
        "manifest",
        "documentTypes",
        "serviceProfiles",
        "sharePackages",
        "renderContract",
        "clinicalDocumentGraph",
        "problemDetails",
      ]),
    );
    expect(contracts.clinicalDocumentGraph.payload).toMatchObject({
      graphContractVersion: "2026.07.pcdg.v2",
      trustDecisionOwnership: "portal",
      holderPresentationOwnership: "wallet",
      rendererAuthority: "wallet",
    });
    expect(
      contracts.clinicalDocumentGraph.payload.presentationProtocol.stageKeys,
    ).toEqual([
      "source",
      "fhir",
      "document",
      "retrieval",
      "attestation",
      "vc",
      "shl",
      "vp",
    ]);
    expect(contracts.graphPresentationSchema.payload.$id).toBe(
      "urn:trustcare:schema:graph-presentation:2026.07.pcdg.v2",
    );
    for (const resource of [
      contracts.clinicalDocumentGraph,
      contracts.graphPresentationSchema,
    ]) {
      expect(resource.etag).toBe(`"sha256-${resource.sha256}"`);
      expect(resource.contentDigest).toMatch(/^sha-256=:[A-Za-z0-9+/]+=*:$/);
    }
  }, 30_000);
});

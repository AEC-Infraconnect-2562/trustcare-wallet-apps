import { describe, expect, it, vi } from "vitest";
import {
  fetchVerifiedContractResource,
  loadWalletExchangeContracts,
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  TRUSTCARE_RENDER_VERSION,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
} from "./walletContractLoader";

const origin = "https://portal.example";

describe("Wallet Exchange live contract loader", () => {
  it("bypasses intermediary caches before validating contract integrity", async () => {
    const response = await integrityResponse({ version: "test" });
    const fetchImpl = vi.fn(async () => response.clone()) as unknown as typeof fetch;

    await fetchVerifiedContractResource(fetchImpl, `${origin}/contract`);

    expect(fetchImpl).toHaveBeenCalledWith(`${origin}/contract`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  });

  it("accepts a compression-generated weak ETag only when its digest is exact", async () => {
    const original = await integrityResponse({ version: "compressed" });
    const response = new Response(await original.clone().text(), {
      status: 200,
      headers: {
        "content-type": "application/json",
        etag: `W/${original.headers.get("etag")!}`,
        "content-digest": original.headers.get("content-digest")!,
      },
    });

    await expect(
      fetchVerifiedContractResource(async () => response.clone(), `${origin}/contract`),
    ).resolves.toMatchObject({ etag: expect.stringMatching(/^W\/"sha256-/) });
  });
  it("accepts integrity-bound sandbox contracts with Wallet authority", async () => {
    const fixture = await contractFixture();
    const result = await loadWalletExchangeContracts({
      portalBaseUrl: origin,
      runtimeEnvironment: "sandbox",
      fetchImpl: fixture.fetchImpl,
      now: () => new Date("2026-07-11T12:00:00.000Z"),
    });

    expect(result.portalOrigin).toBe(origin);
    expect(result.discovery.ownership).toMatchObject({
      holderKeys: "wallet",
      vpCreation: "wallet",
      renderer: "wallet",
      hospitalIssuerKeys: "portal",
    });
    expect(result.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.renderContract.payload.primaryPath).toBe(
      "credentialSubject.humanDocument.renderData",
    );
    expect(result.renderContract.payload.inspectedBaselineCommit).toBe(
      "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
    );
  });

  it("treats renderer Git commit as provenance rather than a compatibility gate", async () => {
    const fixture = await contractFixture();
    const url = `${origin}/api/public/wallet-contracts/render-contract`;
    const payload = JSON.parse(
      await fixture.responses.get(url)!.clone().text(),
    ) as Record<string, unknown>;
    fixture.responses.set(
      url,
      await integrityResponse({
        ...payload,
        inspectedBaselineCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        compatibilityGate: "contract_and_schema_version",
      }),
    );

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: fixture.fetchImpl,
      }),
    ).resolves.toMatchObject({
      renderContract: {
        payload: {
          inspectedBaselineCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          compatibilityGate: "contract_and_schema_version",
        },
      },
    });
  });

  it("fails closed when the body digest and ETag do not match", async () => {
    const fixture = await contractFixture();
    const original = fixture.responses.get(
      `${origin}/api/public/wallet-contracts/manifest`,
    )!;
    fixture.responses.set(
      `${origin}/api/public/wallet-contracts/manifest`,
      new Response(await original.clone().text(), {
        status: 200,
        headers: {
          "content-type": "application/json",
          etag: '"sha256-deadbeef"',
          "content-digest": original.headers.get("content-digest")!,
        },
      }),
    );

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "contract_etag_mismatch" });
  });

  it("rejects unsigned manifests outside demo or sandbox", async () => {
    const fixture = await contractFixture();
    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "production",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });
  });

  it("rejects mere signature field presence in pilot without a live cryptographic verification profile", async () => {
    const fixture = await contractFixture();
    const url = `${origin}/api/public/wallet-contracts/manifest`;
    const payload = JSON.parse(
      await fixture.responses.get(url)!.clone().text(),
    ) as Record<string, unknown>;
    fixture.responses.set(
      url,
      await integrityResponse({
        ...payload,
        signature: {
          algorithm: "ES256",
          value: "field-presence-is-not-verification",
        },
      }),
    );

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "pilot",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });
  });

  it("rejects discovery endpoints that escape the configured Portal origin", async () => {
    const fixture = await contractFixture({
      credentialSyncOrigin: "https://evil.example",
    });
    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });
  });
});

async function contractFixture(
  input: { credentialSyncOrigin?: string } = {},
): Promise<{
  fetchImpl: typeof fetch;
  responses: Map<string, Response>;
}> {
  const endpointOrigin = input.credentialSyncOrigin ?? origin;
  const discovery = {
    name: "TrustCare Portal Wallet Exchange API",
    version: "2.0.0",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    authorization: {
      challengeEndpoint: `${origin}/api/wallet/v2/session-challenges`,
      sessionEndpoint: `${origin}/api/wallet/v2/sessions`,
      holderProofType: "trustcare-wallet-session+jwt",
      accessTokenType: "DPoP",
      dpopSpecification: "RFC 9449",
      scopes: [
        "credentials:read",
        "credentials:request",
        "credentials:present",
        "documents:read",
        "documents:write",
      ],
    },
    endpoints: {
      credentialSync: `${endpointOrigin}/api/wallet/v2/credentials/sync`,
      credentialSyncAck: `${origin}/api/wallet/v2/credentials/sync/ack`,
      credentialRequests: `${origin}/api/wallet/v2/credential-requests`,
      documentSubmissions: `${origin}/api/wallet/v2/submissions`,
      publicContracts: `${origin}/api/public/wallet-contracts/manifest`,
      shareGateway: `${origin}/api/share-gateway`,
      issuerJwks: `${origin}/.well-known/jwks.json`,
    },
    protocols: {
      credentialLifecycle: "Wallet Exchange lifecycle v2",
      presentation: "W3C Verifiable Presentation",
      documentMetadata: "FHIR DocumentReference",
      errors: "RFC 9457 problem details",
    },
    ownership: {
      holderKeys: "wallet",
      vpCreation: "wallet",
      renderer: "wallet",
      hospitalIssuerKeys: "portal",
      makerChecker: "portal",
      incomingVerification: "portal",
    },
    renderer: {
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      inspectedBaselineCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
      compatibilityGate: "contract_and_schema_version",
      modelPackage: "@trustcare/wallet-core",
      webPackage: "@trustcare/ui-web",
      rule: "Render human documents from credentialSubject.humanDocument.renderData.",
    },
  };
  const health = {
    status: "ok",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    persistent: true,
    holderProof: "did:key",
    tokenBinding: "DPoP",
    credentialSync: "durable_cursor",
    documentIntake: ["direct_vp", "share_gateway"],
    rendererAuthority: {},
  };
  const manifestWithoutIntegrity = {
    contractHubId: "urn:trustcare:contract-hub:network",
    version: PORTAL_WALLET_V2_CONTRACT_VERSION,
    status: "active",
    generatedAt: "2026-07-11T00:00:00.000Z",
    effectiveFrom: "2026-07-11T00:00:00.000Z",
    minimumWalletVersion: "0.1.0",
    contracts: [],
    compatibilityRules: [
      "wallet_owns_holder_vp_creation_and_selective_disclosure",
      "wallet_renderer_is_authoritative_for_human_documents",
      "portal_never_accepts_patient_id_from_wallet_requests",
      "unknown_required_fields_fail_closed",
      "shl_is_transport_not_a_verifiable_credential",
    ],
  };
  const canonicalDigest = await sha256Hex(
    canonicalJson(manifestWithoutIntegrity),
  );
  const manifest = {
    ...manifestWithoutIntegrity,
    integrity: {
      algorithm: "sha-256",
      canonicalization: "json-sorted-keys-v1",
      scope: "manifest_without_integrity_and_signature",
      digest: `sha256:${canonicalDigest}`,
    },
  };
  const renderContract = {
    version: PORTAL_WALLET_V2_CONTRACT_VERSION,
    renderVersion: TRUSTCARE_RENDER_VERSION,
    authority: "wallet",
    implementationRepository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
    inspectedBaselineCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
    compatibilityGate: "contract_and_schema_version",
    modelPackage: "@trustcare/wallet-core",
    webPackage: "@trustcare/ui-web",
    portalUsage: "shared_wallet_renderer_only",
    primaryPath: "credentialSubject.humanDocument.renderData",
    requiredBlocks: ["document"],
    optionalBlocks: [],
    legacyReadCompatibility: [],
    legacyWriteAllowed: false,
  };
  const contractSchema = {
    $id: `urn:trustcare:schema:${PORTAL_WALLET_V2_CONTRACT_VERSION}`,
    contractVersion: PORTAL_WALLET_V2_CONTRACT_VERSION,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: Object.fromEntries(
        [
          "manifest",
          "documentTypes",
          "serviceProfiles",
          "sharePackages",
          "renderContract",
          "problemDetails",
        ].map((key) => [key, { type: "object" }]),
      ),
    },
  };
  const responses = new Map<string, Response>([
    [
      `${origin}/api/wallet/v2`,
      jsonResponse(discovery, {
        "x-trustcare-contract-version": WALLET_EXCHANGE_V2_CONTRACT_VERSION,
      }),
    ],
    [`${origin}/api/wallet/v2/health`, jsonResponse(health)],
    [
      `${origin}/api/public/wallet-contracts/manifest`,
      await integrityResponse(manifest),
    ],
    [
      `${origin}/api/public/wallet-contracts/render-contract`,
      await integrityResponse(renderContract),
    ],
    [
      `${origin}/api/public/wallet-contracts/schema`,
      await integrityResponse(contractSchema),
    ],
  ]);
  const fetchImpl: typeof fetch = async (url) => {
    const response = responses.get(String(url));
    return response?.clone() ?? jsonResponse({ title: "Not found" }, {}, 404);
  };
  return { fetchImpl, responses };
}

function jsonResponse(
  value: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function integrityResponse(value: unknown): Promise<Response> {
  const body = JSON.stringify(value);
  const bytes = new TextEncoder().encode(body);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      etag: `"sha256-${sha}"`,
      "content-digest": `sha-256=:${btoa(binary)}:`,
    },
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

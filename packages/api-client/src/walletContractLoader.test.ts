import { describe, expect, it, vi } from "vitest";
import {
  fetchVerifiedContractResource,
  loadWalletExchangeContracts,
  PORTAL_WALLET_V2_CONTRACT_VERSION,
  TRUSTCARE_RENDER_VERSION,
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
} from "./walletContractLoader";
import {
  clinicalDocumentGraphContractFixture,
  graphPresentationSchemaFixture,
} from "./testFixtures/clinicalDocumentGraph";

const origin = "https://portal.example";

describe("Wallet Exchange live contract loader", () => {
  it("bypasses intermediary caches before validating contract integrity", async () => {
    const response = await integrityResponse({ version: "test" });
    const fetchImpl = vi.fn(async () =>
      response.clone(),
    ) as unknown as typeof fetch;

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
      fetchVerifiedContractResource(
        async () => response.clone(),
        `${origin}/contract`,
      ),
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
      "credentialSubject.data.humanDocument",
    );
    expect(result.renderContract.payload.referenceCommit).toBe(
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
        referenceCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        referenceCommitRole: "provenance_only",
        compatibilityGate: "contract_profile_and_schema",
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
          referenceCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          referenceCommitRole: "provenance_only",
          compatibilityGate: "contract_profile_and_schema",
        },
      },
    });
  });

  it("accepts additive optional schema and render blocks", async () => {
    const fixture = await contractFixture();
    const schemaUrl = `${origin}/api/public/wallet-contracts/schema`;
    const schemaPayload = JSON.parse(
      await fixture.responses.get(schemaUrl)!.clone().text(),
    ) as Record<string, any>;
    schemaPayload.schema.properties.futureOptionalContract = {
      type: "object",
    };
    fixture.responses.set(schemaUrl, await integrityResponse(schemaPayload));

    const renderUrl = `${origin}/api/public/wallet-contracts/render-contract`;
    const renderPayload = JSON.parse(
      await fixture.responses.get(renderUrl)!.clone().text(),
    ) as Record<string, any>;
    renderPayload.optionalBlocks = [
      ...renderPayload.optionalBlocks,
      "future_optional_section",
    ];
    fixture.responses.set(renderUrl, await integrityResponse(renderPayload));

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: fixture.fetchImpl,
      }),
    ).resolves.toMatchObject({
      renderContract: {
        payload: {
          optionalBlocks: ["future_optional_section"],
        },
      },
    });
  });

  it("fails closed when schema evolution adds an unsupported required root block", async () => {
    const fixture = await contractFixture();
    const url = `${origin}/api/public/wallet-contracts/schema`;
    const payload = JSON.parse(
      await fixture.responses.get(url)!.clone().text(),
    ) as Record<string, any>;
    payload.schema.properties.futureRequiredContract = { type: "object" };
    payload.schema.required.push("futureRequiredContract");
    fixture.responses.set(url, await integrityResponse(payload));

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });
  });

  it("fails closed when the render contract adds an unsupported required block", async () => {
    const fixture = await contractFixture();
    const url = `${origin}/api/public/wallet-contracts/render-contract`;
    const payload = JSON.parse(
      await fixture.responses.get(url)!.clone().text(),
    ) as Record<string, any>;
    payload.requiredBlocks.push("future_required_section");
    fixture.responses.set(url, await integrityResponse(payload));

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });
  });

  it("fails closed when compatibility arrays contain non-string entries", async () => {
    const renderFixture = await contractFixture();
    const renderUrl = `${origin}/api/public/wallet-contracts/render-contract`;
    const renderPayload = JSON.parse(
      await renderFixture.responses.get(renderUrl)!.clone().text(),
    ) as Record<string, any>;
    renderPayload.optionalBlocks.push({ name: "not-a-contract-block" });
    renderFixture.responses.set(
      renderUrl,
      await integrityResponse(renderPayload),
    );

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: renderFixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });

    const schemaFixture = await contractFixture();
    const schemaUrl = `${origin}/api/public/wallet-contracts/schema`;
    const schemaPayload = JSON.parse(
      await schemaFixture.responses.get(schemaUrl)!.clone().text(),
    ) as Record<string, any>;
    schemaPayload.schema.required.push(42);
    schemaFixture.responses.set(
      schemaUrl,
      await integrityResponse(schemaPayload),
    );

    await expect(
      loadWalletExchangeContracts({
        portalBaseUrl: origin,
        runtimeEnvironment: "sandbox",
        fetchImpl: schemaFixture.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "wallet_contract_incompatible" });
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
    version: "2.0.1",
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
      clinicalDocumentGraphChanges: `${origin}/api/wallet/v2/clinical-document-graph/changes`,
      credentialRequests: `${origin}/api/wallet/v2/credential-requests`,
      documentSubmissions: `${origin}/api/wallet/v2/submissions`,
      publicContracts: `${origin}/api/public/wallet-contracts/manifest`,
      shareGateway: `${origin}/api/share-gateway`,
      issuerJwks: `${origin}/.well-known/jwks.json`,
      shlAssociations: `${origin}/api/wallet/v2/shl-associations`,
      shlCertificationRequests: `${origin}/api/wallet/v2/shl-certification-requests`,
    },
    protocols: {
      credentialLifecycle: "Wallet Exchange lifecycle v2",
      presentation:
        "Wallet-created VP JWT or Certified SHL package association with a separate Holder VP",
      certifiedShl: "Portal KMS manifest VC with holder authorization and VP",
      manifestUrl:
        "Plain SHL HTTPS /s/{256-bit-token} URL, maximum 128 characters; no alternate manifest route is accepted",
      plainShlManifestUrlMaxLength: 128,
      compactJwsDigest:
        "SHA-256 over the exact UTF-8 bytes of the compact JWS string",
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
      referenceCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
      referenceCommitRole: "provenance_only",
      compatibilityGate: "contract_profile_and_schema",
      renderVersion: TRUSTCARE_RENDER_VERSION,
      modelPackage: "@trustcare/wallet-core",
      webPackage: "@trustcare/ui-web",
      rule: "Render human documents from credentialSubject.data.humanDocument.",
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
      "certified_shl_manifest_credential_hospital_did_must_match_authorized_recipient",
      "certified_shl_transport_purpose_is_not_holder_authorization_purpose",
      "certified_shl_manifest_and_holder_vp_purpose_must_equal_verified_holder_authorization",
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
    referenceCommit: "d45a8283e6440fb722cb6774ceb4f17bad0d9d4f",
    referenceCommitRole: "provenance_only",
    compatibilityGate: "contract_profile_and_schema",
    modelPackage: "@trustcare/wallet-core",
    webPackage: "@trustcare/ui-web",
    portalUsage: "shared_wallet_renderer_only",
    primaryPath: "credentialSubject.data.humanDocument",
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
      type: "object",
      properties: Object.fromEntries(
        [
          "manifest",
          "documentTypes",
          "serviceProfiles",
          "sharePackages",
          "renderContract",
          "clinicalDocumentGraph",
          "problemDetails",
        ].map((key) => [key, { type: "object" }]),
      ),
      required: [
        "manifest",
        "documentTypes",
        "serviceProfiles",
        "sharePackages",
        "renderContract",
        "clinicalDocumentGraph",
        "problemDetails",
      ],
      additionalProperties: false,
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
    [
      `${origin}/api/public/wallet-contracts/clinical-document-graph`,
      await integrityResponse(clinicalDocumentGraphContractFixture(origin)),
    ],
    [
      `${origin}/api/public/wallet-contracts/clinical-document-graph/presentation-schema`,
      await integrityResponse(graphPresentationSchemaFixture()),
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

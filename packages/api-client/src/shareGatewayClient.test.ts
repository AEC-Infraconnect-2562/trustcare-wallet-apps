import { describe, expect, it } from "vitest";
import {
  buildSharePackage,
  getDemoWalletCards,
  type ShareGatewayArtifactKind,
  type ShareGatewayPublicationResponse,
} from "@trustcare/wallet-core";
import {
  createShareGatewayClient,
  issuePayerCredentialWithShareGateway,
  publishCertifiedShlTrustArtifacts,
  publishShareArtifact,
  publishVpSharePackage,
  requestBodyForShareGateway,
  shareGatewayJwksUrl,
} from "./shareGatewayClient";

describe("shareGatewayClient", () => {
  const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 3);
  const gatewayBaseUrl = "https://portal.example/api/share-gateway";

  it("publishes VP packages with the shared ShareGatewayPublicationRequest shape", async () => {
    const packageResult = buildSharePackage({
      mode: "PurposeVP",
      context: "opd_visit",
      cards,
      selectedCardIds: cards.slice(0, 2).map((card) => card.id),
      holderDid: "did:key:holder",
      recipient: "Verifier",
      purpose: "เตรียมเข้ารับบริการ OPD",
      expiresAt: "2026-07-08T09:00:00.000Z",
      gatewayBaseUrl,
    });
    if (!("presentation" in packageResult)) {
      throw new Error("Expected VP package.");
    }
    const requests: Array<{
      url: string;
      init?: RequestInit;
      body: Record<string, unknown>;
    }> = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      requests.push({ url: String(url), init, body });
      return jsonResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: String(body.artifactId),
        kind: body.kind as ShareGatewayArtifactKind,
        publicUrl: `${gatewayBaseUrl}/presentations/${body.artifactId}.jwt`,
        qrPayload: `${gatewayBaseUrl}/presentations/${body.artifactId}.jwt`,
        warnings: [],
        errors: [],
      });
    };

    const response = await publishVpSharePackage({
      gatewayBaseUrl,
      fetchImpl: fetchImpl as typeof fetch,
      result: packageResult,
      userId: "demo-patient-complete-001",
      holderDid: "did:key:holder",
      purpose: "opd_visit",
      recipient: "Verifier",
      expiresAt: "2026-07-08T09:00:00.000Z",
    });

    expect(response.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${gatewayBaseUrl}/artifacts`);
    expect(requests[0]?.body).toEqual(
      requestBodyForShareGateway({
        artifactId: packageResult.presentation.presentationId,
        kind: "vp",
        contentType: "application/vp+json",
        payload: packageResult.payload,
        ownerUserId: "demo-patient-complete-001",
        holderDid: "did:key:holder",
        context: "opd_visit",
        purpose: "เตรียมเข้ารับบริการ OPD",
        recipient: "Verifier",
        expiresAt: "2026-07-08T09:00:00.000Z",
        trustcare: {
          signingStatus: "pending_backend_signature",
          expectedProof: ["ES256", "EdDSA", "DataIntegrityProof"],
        },
      }),
    );
  });

  it("publishes SHL manifests and certified trust artifacts through the same client", async () => {
    const packageResult = buildSharePackage({
      mode: "CertifiedSHLManifestPackage",
      context: "cross_border",
      cards,
      selectedCardIds: cards.map((card) => card.id),
      holderDid: "did:key:holder",
      recipient: "Verifier",
      purpose: "ส่งต่อข้ามเครือข่าย/ข้ามแดน",
      expiresAt: "2026-07-08T09:00:00.000Z",
      gatewayBaseUrl,
      viewerBaseUrl: "https://wallet.example/trustcare-wallet-apps/",
      shlPolicy: { maxAccessCount: 3, accessCodeDelivery: "not_required" },
    });
    if (!("shl" in packageResult)) {
      throw new Error("Expected SHL package.");
    }
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      bodies.push(body);
      return jsonResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: String(body.artifactId),
        kind: body.kind as ShareGatewayArtifactKind,
        publicUrl: `${gatewayBaseUrl}/manifests/${body.artifactId}.json`,
        qrPayload: `${gatewayBaseUrl}/manifests/${body.artifactId}.json`,
        warnings: [],
        errors: [],
      });
    };
    const client = createShareGatewayClient({
      gatewayBaseUrl,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const response = await client.publishShl({
      result: packageResult,
      userId: "demo-patient-complete-001",
      holderDid: "did:key:holder",
      purpose: "cross_border",
      recipient: "Verifier",
      expiresAt: "2026-07-08T09:00:00.000Z",
    });

    expect(response.ok).toBe(true);
    expect(bodies.map((body) => body.kind)).toEqual([
      "certified_shl_manifest",
      "manifest_vp",
      "manifest_credential",
      "holder_authorization",
    ]);
    expect(bodies[0]?.accessPolicy).toMatchObject({
      maxAccessCount: 3,
      accessCodeDelivery: "not_required",
    });
  });

  it("exposes resolver and JWKS helpers for platform clients", async () => {
    const fetchImpl = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(`${gatewayBaseUrl}/presentations/vp_123.jwt`);
      return new Response("signed.jwt.value", {
        status: 200,
        headers: { "content-type": "application/vp+jwt" },
      });
    };
    const client = createShareGatewayClient({
      gatewayBaseUrl: `${gatewayBaseUrl}/`,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.resolvePresentation("vp_123")).resolves.toBe(
      "signed.jwt.value",
    );
    expect(client.jwksUrl()).toBe(`${gatewayBaseUrl}/.well-known/jwks.json`);
    expect(shareGatewayJwksUrl(`${gatewayBaseUrl}/`)).toBe(
      `${gatewayBaseUrl}/.well-known/jwks.json`,
    );
  });

  it("surfaces gateway error details before validating the success contract", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          errors: ["JSON request body exceeds 1000000 bytes."],
        }),
        {
          status: 413,
          headers: { "content-type": "application/json" },
        },
      );

    await expect(
      publishShareArtifact({
        gatewayBaseUrl,
        fetchImpl: fetchImpl as typeof fetch,
        request: {
          artifactId: "vp-too-large",
          kind: "vp",
          contentType: "application/vp+json",
          payload: { type: ["VerifiablePresentation"] },
        },
      }),
    ).rejects.toThrow("JSON request body exceeds 1000000 bytes.");
  });

  it("issues payer artifacts only through the explicit demo payer integration endpoint", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      requests.push({ url: String(url), body });
      return jsonResponse({
        ok: true,
        mode: "portal_backend",
        payerId: body.payerId,
        credentialId: "payer-vc-001",
        credentialJwt: "payer.signed.jwt",
        issuerDid: "did:web:wallet.example:payer:international_tpa_mock",
        jwksUrl:
          "https://wallet.example/payer/international_tpa_mock/jwks.json",
        signedCredential: body.credential,
        credentialProof: {
          type: "W3C VC JWT",
          format: "vc+jwt",
          jwt: "payer.signed.jwt",
          alg: "ES256",
          kid: "did:web:wallet.example:payer:international_tpa_mock#key-1",
          source: "trustcare_demo_payer_integration_issuer",
        },
        warnings: [],
        errors: [],
      });
    };

    const response = await issuePayerCredentialWithShareGateway({
      gatewayBaseUrl,
      fetchImpl: fetchImpl as typeof fetch,
      payerId: "international_tpa_mock",
      credential: {
        type: ["VerifiableCredential", "GuaranteeLetterCredential"],
        credentialSubject: { payerId: "international_tpa_mock" },
      },
      sourceSystem: "payer_adapter",
    });

    expect(requests[0]?.url).toBe(`${gatewayBaseUrl}/payer/credentials/issue`);
    expect(requests[0]?.body).toMatchObject({
      issuerServiceOperation: "demo_payer_integration_issue",
      sourceAuthority: "payer_adapter",
      signingOwner: "payer_adapter",
      payerId: "international_tpa_mock",
    });
    expect(response.credentialProof.source).toBe(
      "trustcare_demo_payer_integration_issuer",
    );
  });

  it("can publish certified trust artifacts directly for focused tests", async () => {
    const kinds: unknown[] = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      kinds.push(body.kind);
      return jsonResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: String(body.artifactId),
        kind: body.kind as ShareGatewayArtifactKind,
        warnings: [],
        errors: [],
      });
    };

    await publishCertifiedShlTrustArtifacts({
      gatewayBaseUrl,
      fetchImpl: fetchImpl as typeof fetch,
      publicationId: "shl_123",
      trustcare: {
        manifestVp: { type: "vp" },
        manifestCredential: { type: "vc" },
      },
      userId: "demo",
      holderDid: "did:key:holder",
      purpose: "referral",
      recipient: "Verifier",
      expiresAt: "2026-07-08T09:00:00.000Z",
    });

    expect(kinds).toEqual(["manifest_vp", "manifest_credential"]);
  });
});

function jsonResponse(
  input: Partial<ShareGatewayPublicationResponse> &
    Pick<ShareGatewayPublicationResponse, "ok" | "mode"> &
    Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(input), {
    status: input.ok ? 201 : 500,
    headers: { "content-type": "application/json" },
  });
}

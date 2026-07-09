import { describe, expect, it } from "vitest";
import {
  buildSharePackage,
  getDemoWalletCards,
  type ShareGatewayArtifactKind,
  type ShareGatewayPublicationResponse,
} from "@trustcare/wallet-core";
import {
  createShareGatewayClient,
  publishCertifiedShlTrustArtifacts,
  publishVpSharePackage,
  requestBodyForShareGateway,
  shareGatewayJwksUrl,
  signCredentialWithShareGateway,
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

  it("requests issuer-profile VC signing from the share gateway", async () => {
    const card = cards[0]!;
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
        credentialId: String(body.credentialId),
        credentialJwt: "issuer.signed.jwt",
        issuerDid: "did:web:wallet.example:hospital:tcc",
        jwksUrl: "https://wallet.example/hospital/tcc/jwks.json",
        signedCredential: {
          ...(body.credential as Record<string, unknown>),
          issuer: { id: "did:web:wallet.example:hospital:tcc" },
        },
        credentialProof: {
          type: "W3C VC JWT",
          format: "vc+jwt",
          jwt: "issuer.signed.jwt",
          alg: "ES256",
          kid: "did:web:wallet.example:hospital:tcc#hospital-tcc-signing-key",
          source: "trustcare_hospital_issuer_profile",
        },
        warnings: [],
        errors: [],
      });
    };

    const response = await signCredentialWithShareGateway({
      gatewayBaseUrl,
      fetchImpl: fetchImpl as typeof fetch,
      cardId: card.id,
      credentialId: card.credentialId,
      credential: card.credentialData ?? {},
      credentialType: card.credentialType,
      holderDid: card.holderDid,
      expiresAt: card.expiresAt,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${gatewayBaseUrl}/credentials/sign`);
    expect(requests[0]?.body).toMatchObject({
      cardId: card.id,
      credentialId: card.credentialId,
      credentialType: card.credentialType,
      holderDid: card.holderDid,
    });
    expect(response.issuerDid).toBe("did:web:wallet.example:hospital:tcc");
    expect(response.credentialProof.source).toBe(
      "trustcare_hospital_issuer_profile",
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

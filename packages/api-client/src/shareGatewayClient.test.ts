import { describe, expect, it } from "vitest";
import {
  buildSharePackage,
  getDemoWalletCards,
  type PreparedHolderAttestedShl,
  type ShareGatewayArtifactKind,
  type ShareGatewayPublicationResponse,
} from "@trustcare/wallet-core";
import {
  createShareGatewayClient,
  issuePayerCredentialWithShareGateway,
  publishCertifiedShlTrustArtifacts,
  publishHolderAttestedShl,
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

  it("keeps a certification request pending without publishing unsigned trust artifacts", async () => {
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
      "standard_shl_manifest",
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
        holderPresentationJwt: "eyJoIjp0cnVlfQ.eyJ2cCI6e319.c2ln",
        manifestCredentialJwt: "eyJoIjp0cnVlfQ.eyJ2YyI6e319.c2ln",
      },
      userId: "demo",
      holderDid: "did:key:holder",
      purpose: "referral",
      recipient: "Verifier",
      expiresAt: "2026-07-08T09:00:00.000Z",
    });

    expect(kinds).toEqual(["manifest_vp", "manifest_credential"]);
  });

  it("publishes holder-attested SHL files, holder VP, and manifest without a fake hospital credential", async () => {
    const holderDid = "did:key:zHolder";
    const holderPresentationJwt =
      "eyJhbGciOiJFUzI1NiJ9.eyJ2cCI6e319.c2ln";
    const requests: Record<string, unknown>[] = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      requests.push(body);
      const suffix =
        body.kind === "manifest_vp"
          ? ".jwt"
          : body.kind === "standard_shl_manifest"
            ? ".json"
            : "";
      return jsonResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: String(body.artifactId),
        kind: body.kind as ShareGatewayArtifactKind,
        publicUrl: `${gatewayBaseUrl}/${String(body.kind)}/${String(body.artifactId)}${suffix}`,
        warnings: [],
        errors: [],
      });
    };
    const prepared = {
      trustMode: "holder_attested",
      manifest: {
        schema: "trustcare.certified-shl.manifest.v1",
        publicationId: "shl-holder-1",
        holderDid,
        manifestUrl: `${gatewayBaseUrl}/manifests/shl-holder-1.json`,
        createdAt: "2026-07-12T00:00:00.000Z",
        expiresAt: "2026-07-12T00:30:00.000Z",
        accessPolicy: {
          purpose: "OPD registration",
          recipient: "Verifier",
          audience: "https://portal.example/api/wallet/v2/submissions",
          context: "opd_visit",
          consentRef: "consent:1",
          issuedAt: "2026-07-12T00:00:00.000Z",
          expiresAt: "2026-07-12T00:30:00.000Z",
          passcodeRequired: false,
          maxAccessCount: 3,
        },
        documents: [
          {
            id: "shl-holder-1:file:1",
            documentId: "document-1",
            credentialId: "credential-1",
            credentialType: "PatientIdentityCredential",
            documentType: "patient_identity",
            issuerDid: "did:web:issuer.example:hospital:tcc",
            holderDid,
            contentType: "application/vc+jwt",
            encryption: { alg: "dir", enc: "A256GCM" },
            location: `${gatewayBaseUrl}/files/shl-holder-1%3Afile%3A1.jwe`,
            plaintextSha256: `sha256:${"a".repeat(64)}`,
            jweSha256: `sha256:${"b".repeat(64)}`,
          },
        ],
      },
      manifestHash: `sha256:${"c".repeat(64)}`,
      expectedManifestCredentialBinding: {
        fileHashes: [
          {
            fileId: "shl-holder-1:file:1",
            documentId: "document-1",
            plaintextSha256: `sha256:${"a".repeat(64)}`,
            jweSha256: `sha256:${"b".repeat(64)}`,
          },
        ],
      },
      files: [
        {
          id: "shl-holder-1:file:1",
          jwe: "protected.iv.ciphertext.tag",
        },
      ],
      shlContentKey: "A".repeat(43),
      holderPresentationId: "urn:uuid:holder-vp-1",
      holderPresentationJwt,
    } as unknown as PreparedHolderAttestedShl;

    const publication = await publishHolderAttestedShl({
      gatewayBaseUrl,
      viewerBaseUrl: "https://wallet.example/",
      prepared,
      userId: "demo",
      holderDid,
      purpose: "opd_visit",
      recipient: "Verifier",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(publication.trustMode).toBe("holder_attested");
    expect(requests.map((request) => request.kind)).toEqual([
      "shl_file",
      "manifest_vp",
      "standard_shl_manifest",
    ]);
    expect(requests[0]?.payload).toBe("protected.iv.ciphertext.tag");
    expect(requests[1]).toMatchObject({
      contentType: "application/vp+jwt",
      payload: holderPresentationJwt,
    });
    expect(requests[2]).toMatchObject({
      kind: "standard_shl_manifest",
      contentType: "application/json",
    });
    expect(JSON.stringify(requests)).not.toContain("manifestCredentialJwt");
    expect(publication.canonicalShlUrl).toMatch(/^shlink:\//);
  });

  it("rejects raw JSON objects as certified trust artifacts", async () => {
    const kinds: unknown[] = [];
    await expect(
      publishCertifiedShlTrustArtifacts({
        gatewayBaseUrl,
        fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
          kinds.push(JSON.parse(String(init?.body ?? "{}")).kind);
          return jsonResponse({ ok: true, mode: "portal_backend" });
        }) as typeof fetch,
        publicationId: "shl_raw",
        trustcare: {
          holderPresentationJwt: { type: "unsigned-vp" },
          manifestCredentialJwt: { type: "unsigned-vc" },
        },
        userId: "demo",
        holderDid: "did:key:holder",
        purpose: "referral",
        recipient: "Verifier",
        expiresAt: "2026-07-08T09:00:00.000Z",
      }),
    ).rejects.toThrow("signed compact JWT");
    expect(kinds).toEqual([]);
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

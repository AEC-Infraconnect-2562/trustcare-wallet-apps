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
  publishHospitalCertifiedShl,
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
      holderPresentationJwt: "eyJhbGciOiJFZERTQSIsInR5cCI6InZwK2p3dCIsImtpZCI6ImRpZDprZXk6dGVzdCN0ZXN0In0.eyJpc3MiOiJkaWQ6a2V5OnRlc3QifQ.c2lnbmF0dXJl",
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
      JSON.parse(JSON.stringify(requestBodyForShareGateway({
        artifactId: packageResult.presentation.presentationId,
        kind: "vp",
        contentType: "application/vp+jwt",
        payload: "eyJhbGciOiJFZERTQSIsInR5cCI6InZwK2p3dCIsImtpZCI6ImRpZDprZXk6dGVzdCN0ZXN0In0.eyJpc3MiOiJkaWQ6a2V5OnRlc3QifQ.c2lnbmF0dXJl",
        ownerUserId: "demo-patient-complete-001",
        holderDid: "did:key:holder",
        context: "opd_visit",
        purpose: "เตรียมเข้ารับบริการ OPD",
        recipient: "Verifier",
        expiresAt: "2026-07-08T09:00:00.000Z",
        trustcare: {
          signingStatus: "wallet_holder_signed",
          expectedProof: ["ES256", "EdDSA"],
          portalResignAllowed: false,
        },
      }))),
    );
  });

  it("keeps a certification request pending without publishing unsigned trust artifacts", async () => {
    const packageResult = {
      mode: "CertifiedSHLPackage",
      shl: {
        trustLayerStatus: "hospital_certified",
        manifest: { status: "finalized", files: [] },
      },
      payload: { purpose: "cross_border" },
    } as never;
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
        publicUrl: `${gatewayBaseUrl}/artifacts/${body.artifactId}`,
        qrPayload: `${gatewayBaseUrl}/artifacts/${body.artifactId}`,
        warnings: [],
        errors: [],
      });
    };
    const client = createShareGatewayClient({
      gatewayBaseUrl,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.publishShl({
        result: packageResult,
        userId: "demo-patient-complete-001",
        holderDid: "did:key:holder",
        purpose: "cross_border",
        recipient: "Verifier",
        expiresAt: "2026-07-08T09:00:00.000Z",
      }),
    ).rejects.toThrow("Wallet Exchange v2");
    expect(bodies).toEqual([]);
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

  it("keeps certified trust artifacts on Wallet Exchange and never sends them to the generic gateway", async () => {
    const bodies: Record<string, unknown>[] = [];
    const packageId = "C".repeat(43);
    const standardManifestUrl = `https://portal.example/s/${packageId}`;
    const publication = {
      trustMode: "hospital_certified",
      manifest: { status: "finalized", files: [] },
      packageBinding: {
        publicationId: packageId,
        holderDid: "did:key:holder",
        manifestUrl: standardManifestUrl,
        expiresAt: "2026-07-13T09:00:00.000Z",
        accessPolicy: { passcodeRequired: true, maxAccessCount: 3 },
      },
      holderPresentationJwt: "eyJoIjp0cnVlfQ.eyJ2cCI6e319.c2ln",
      manifestCredentialJwt: "eyJoIjp0cnVlfQ.eyJ2YyI6e319.c2ln",
      objectLinks: { manifestCredentialId: "urn:vc:manifest:1" },
    } as never;

    const result = await publishHospitalCertifiedShl({
      gatewayBaseUrl,
      publication,
      userId: "demo",
      holderDid: "did:key:holder",
      purpose: "referral",
      recipient: "Verifier",
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        bodies.push(body);
        return jsonResponse({
          ok: true,
          mode: "portal_backend",
          artifactId: String(body.artifactId),
          kind: body.kind,
          publicUrl: `${gatewayBaseUrl}/${String(body.kind)}/${String(body.artifactId)}`,
          warnings: [],
          errors: [],
        });
      }) as typeof fetch,
    });

    expect(bodies).toEqual([]);
    expect(result.manifestUrl).toBe(standardManifestUrl);
  });

  it("publishes holder-attested SHL files and a strict standard manifest only", async () => {
    const holderDid = "did:key:zHolder";
    const packageId = "H".repeat(43);
    const manifestUrl = `https://portal.example/s/${packageId}`;
    const holderPresentationJwt =
      "eyJhbGciOiJFUzI1NiJ9.eyJ2cCI6e319.c2ln";
    const requests: Record<string, unknown>[] = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      requests.push(body);
      return jsonResponse({
        ok: true,
        mode: "portal_backend",
        artifactId: String(body.artifactId),
        kind: body.kind as ShareGatewayArtifactKind,
        publicUrl:
          body.kind === "standard_shl_manifest"
            ? manifestUrl
            : `${gatewayBaseUrl}/files/${String(body.artifactId)}`,
        warnings: [],
        errors: [],
      });
    };
    const prepared = {
      trustMode: "holder_attested",
      manifest: {
        status: "finalized",
        files: [
          {
            contentType: "application/smart-health-card",
            location: `${gatewayBaseUrl}/files/${packageId}%3Afile%3A1.jwe`,
          },
        ],
      },
      packageBinding: {
        publicationId: packageId,
        holderDid,
        manifestUrl,
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
            id: `${packageId}:file:1`,
            documentId: "document-1",
            credentialId: "credential-1",
            credentialType: "PatientIdentityCredential",
            documentType: "patient_identity",
            issuerDid: "did:web:issuer.example:hospital:tcc",
            holderDid,
            contentType: "application/vc+jwt",
            encryption: { alg: "dir", enc: "A256GCM" },
            location: `${gatewayBaseUrl}/files/${packageId}%3Afile%3A1.jwe`,
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
          id: `${packageId}:file:1`,
          location: `${gatewayBaseUrl}/files/${packageId}%3Afile%3A1.jwe`,
          contentType: "application/jose",
          documentId: "document-1",
          jwe: "protected.iv.ciphertext.tag",
          plaintextSha256: `sha256:${"a".repeat(64)}`,
          jweSha256: `sha256:${"b".repeat(64)}`,
        },
      ],
      shlContentKey: "A".repeat(43),
      holderPresentationId: "urn:uuid:holder-vp-1",
      holderPresentationJwt,
    } as unknown as PreparedHolderAttestedShl;

    const publication = await publishHolderAttestedShl({
      gatewayBaseUrl,
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
      "standard_shl_manifest",
    ]);
    expect(requests[0]?.payload).toBe("protected.iv.ciphertext.tag");
    expect(requests[1]).toMatchObject({
      kind: "standard_shl_manifest",
      contentType: "application/json",
    });
    expect(JSON.stringify(requests)).not.toContain("manifestCredentialJwt");
    expect(publication.canonicalShlUrl).toMatch(/^shlink:\//);
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

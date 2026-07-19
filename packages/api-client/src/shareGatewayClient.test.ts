import { describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import {
  buildSharePackage,
  createHolderSignedDirectVp,
  generateHolderIdentity,
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
import { PortalInteroperabilityProblemError } from "./qrInteroperability";

describe("shareGatewayClient", () => {
  const cards = getDemoWalletCards("demo-patient-complete-001").slice(0, 3);
  const gatewayBaseUrl = "https://portal.example/api/share-gateway";

  it("publishes VP packages with the shared ShareGatewayPublicationRequest shape", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const purpose = "เตรียมเข้ารับบริการ OPD";
    const recipient = "did:web:verifier.example";
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const holderPresentation = await createHolderSignedDirectVp({
      identity,
      audience: "https://portal.example/verifier",
      recipient,
      context: "opd_visit",
      purpose,
      consentRef: "urn:trustcare:consent:share-gateway-test",
      credentialJwts: [await issuerCredentialJwt(identity.did, now)],
      expiresAt,
      now,
    });
    const vpDigest = await sha256Digest(holderPresentation.vpJwt);
    const packageResult = buildSharePackage({
      mode: "PurposeVP",
      context: "opd_visit",
      cards,
      selectedCardIds: cards.slice(0, 2).map((card) => card.id),
      holderDid: identity.did,
      recipient,
      purpose,
      expiresAt,
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
      if (String(url).endsWith(".jwt")) {
        return new Response(holderPresentation.vpJwt, {
          status: 200,
          headers: { "content-type": "application/vp+jwt" },
        });
      }
      if (String(url).endsWith("/verification-evidence")) {
        return jsonResponse({
          version: "1",
          providerId: "portal-test",
          artifactId: packageResult.presentation.presentationId,
          resolverUrl: `${gatewayBaseUrl}/presentations/${packageResult.presentation.presentationId}.jwt`,
          packageDigest: vpDigest,
          contextDigest: vpDigest,
          subjects: [
            {
              role: "vp",
              digest: "sha256:canonical-payload-digest",
              contentHash: vpDigest,
              holderDid: identity.did,
            },
          ],
          policy: { id: "trustcare", version: "1" },
          checkedAt: now.toISOString(),
          expiresAt,
          verified: true,
          checks: [
            "proof",
            "issuer",
            "status",
            "expiry",
            "policy",
            "binding",
          ].map((key) => ({
            key,
            state: "pass",
            subjectDigests: [vpDigest],
            checkedAt: now.toISOString(),
            authority: "portal-test",
          })),
          requestId: "request-test",
          correlationId: "correlation-test",
          ok: true,
          mode: "portal_backend",
        });
      }
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
      holderPresentationJwt: holderPresentation.vpJwt,
      userId: "demo-patient-complete-001",
      holderDid: identity.did,
      audience: "https://portal.example/verifier",
      consentRef: "urn:trustcare:consent:share-gateway-test",
      purpose: "opd_visit",
      purposeLabel: purpose,
      recipient,
      expiresAt,
    });

    expect(response.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${gatewayBaseUrl}/artifacts`);
    expect(requests[0]?.body).toEqual(
      JSON.parse(JSON.stringify(requestBodyForShareGateway({
        artifactId: packageResult.presentation.presentationId,
        kind: "vp",
        contentType: "application/vp+jwt",
        payload: holderPresentation.vpJwt,
        ownerUserId: "demo-patient-complete-001",
        holderDid: identity.did,
        context: "opd_visit",
        purpose,
        recipient,
        expiresAt,
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

  it("preserves RFC 9457 gateway failure status, code, and trace identifiers", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          type: "https://trustcare.example/problems/payload-too-large",
          title: "Payload too large",
          status: 413,
          code: "share_gateway_payload_too_large",
          detail: "JSON request body exceeds 1000000 bytes.",
        }),
        {
          status: 413,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": "req-share-413",
            "x-correlation-id": "corr-share-413",
          },
        },
      );

    const failure = await publishShareArtifact({
        gatewayBaseUrl,
        fetchImpl: fetchImpl as typeof fetch,
        request: {
          artifactId: "vp-too-large",
          kind: "vp",
          contentType: "application/vp+json",
          payload: { type: ["VerifiablePresentation"] },
        },
      }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PortalInteroperabilityProblemError);
    expect(failure).toMatchObject({
      status: 413,
      code: "share_gateway_payload_too_large",
      requestId: "req-share-413",
      correlationId: "corr-share-413",
    });
    expect((failure as Error).message).toContain(
      "JSON request body exceeds 1000000 bytes.",
    );
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

async function issuerCredentialJwt(
  holderDid: string,
  now: Date,
): Promise<string> {
  const issuerDid = "did:web:portal.example:hospital:tcc";
  const keyPair = await generateKeyPair("ES256");
  return new SignJWT({
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://portal.example/contexts/trustcare-credentials-v1.jsonld",
    ],
    id: "urn:uuid:share-gateway-test-credential",
    type: ["VerifiableCredential", "PatientIdentityCredential"],
    issuer: issuerDid,
    credentialSubject: { id: holderDid, data: {} },
    validFrom: now.toISOString(),
    validUntil: new Date(now.getTime() + 60 * 60_000).toISOString(),
    credentialStatus: [
      {
        id: "https://portal.example/status/1#0",
        type: "BitstringStatusListEntry",
        statusPurpose: "revocation",
        statusListIndex: "0",
        statusListCredential: "https://portal.example/status/1",
      },
    ],
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "vc+jwt",
      cty: "vc",
      kid: `${issuerDid}#test`,
    })
    .sign(keyPair.privateKey);
}

async function sha256Digest(value: string): Promise<`sha256:${string}`> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return `sha256:${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

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

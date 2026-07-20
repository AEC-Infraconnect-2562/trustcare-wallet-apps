import {
  WALLET_EXCHANGE_V2_CONTRACT_VERSION,
  WALLET_RENDERER_REFERENCE_COMMIT,
  type WalletSessionChallenge,
  type WalletSubmissionRequest,
  type WalletSyncAckRequest,
} from "@trustcare/contracts";
import {
  generateHolderIdentity,
  type GeneratedHolderIdentity,
  type ShlCertificationRequest,
} from "@trustcare/wallet-core";
import { compactVerify, decodeProtectedHeader } from "jose";
import { describe, expect, it, vi } from "vitest";
import { calculateDpopAccessTokenHash, type DpopProofClaims } from "./dpop";
import type { WalletExchangeContractSet } from "./walletContractLoader";
import {
  clinicalDocumentGraphContractFixture,
  graphPresentationSchemaFixture,
} from "./testFixtures/clinicalDocumentGraph";
import {
  WalletExchangeProblemError,
  createWalletExchangeV2Client,
  resolveWalletExchangeFetch,
} from "./walletExchangeV2";

const PORTAL_ORIGIN = "https://portal.example";
const FIXED_NOW = new Date("2026-07-11T12:00:00.000Z");
const ALL_SCOPES = [
  "credentials:read",
  "credentials:request",
  "credentials:present",
  "documents:read",
  "documents:write",
] as const;
const REQUESTED_SCOPES = [
  "credentials:read",
  "credentials:request",
  "credentials:present",
] as const;
const CONTENT_HASH = `sha256:${"a".repeat(64)}`;
const VP_JWT = `${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}`;

describe("Wallet Exchange v2 client", () => {
  it("binds the browser fetch implementation before storing it on the client", async () => {
    const runtimeFetch = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as unknown as typeof fetch;

    const fetcher = resolveWalletExchangeFetch(undefined, runtimeFetch);
    await fetcher(`${PORTAL_ORIGIN}/health`);

    expect(runtimeFetch).toHaveBeenCalledTimes(1);
  });
  it("signs the exact Portal session challenge and accepts only the holder cnf", async () => {
    const harness = await createHarness();
    const session = await harness.client.createSession();

    expect(harness.challengeRequests).toEqual([
      {
        appId: "trustcare-wallet-test",
        holderDid: harness.identity.did,
        requestedScopes: REQUESTED_SCOPES,
      },
    ]);
    expect(harness.challengeRequests[0]).not.toHaveProperty("patientId");
    expect(harness.sessionCompletions).toHaveLength(1);
    expect(harness.sessionCompletions[0]?.challengeId).toBe("challenge-001");
    expect(harness.sessionProofs[0]?.header).toEqual(
      harness.challenges[0]?.proof.protectedHeader,
    );
    expect(harness.sessionProofs[0]?.payloadText).toBe(
      JSON.stringify(harness.challenges[0]?.proof.payload),
    );
    expect(session).toEqual({
      accessToken: "wxt_access_token_1",
      tokenType: "DPoP",
      scopes: REQUESTED_SCOPES,
      expiresAt: Math.floor(FIXED_NOW.getTime() / 1_000) + 900,
      holderDid: harness.identity.did,
      publicJwkThumbprint: harness.identity.publicJwkThumbprint,
    });
    expect(harness.client.activeSession).toEqual(session);
  });

  it("rejects a stale challenge before sending a holder proof", async () => {
    const harness = await createHarness({
      mutateChallenge: (challenge) => {
        const exp = Math.floor(FIXED_NOW.getTime() / 1_000) - 360;
        return {
          ...challenge,
          expiresAt: new Date(exp * 1_000).toISOString(),
          proof: {
            ...challenge.proof,
            payload: {
              ...challenge.proof.payload,
              iat: exp - 60,
              exp,
            },
          },
        };
      },
    });

    await expect(harness.client.createSession()).rejects.toMatchObject({
      code: "session_challenge_stale",
    });
    expect(harness.sessionCompletions).toHaveLength(0);
  });

  it.each(["holder", "audience", "kid"] as const)(
    "rejects a challenge bound to the wrong %s",
    async (mismatch) => {
      const other = await generateHolderIdentity({ algorithm: "P-256" });
      const harness = await createHarness({
        mutateChallenge: (challenge, identity) => {
          if (mismatch === "holder") {
            return {
              ...challenge,
              proof: {
                protectedHeader: {
                  ...challenge.proof.protectedHeader,
                  kid: other.kid,
                },
                payload: {
                  ...challenge.proof.payload,
                  iss: other.did,
                  sub: other.did,
                },
              },
            };
          }
          if (mismatch === "audience") {
            return {
              ...challenge,
              proof: {
                ...challenge.proof,
                payload: {
                  ...challenge.proof.payload,
                  aud: "https://other.example/api/wallet/v2/sessions",
                },
              },
            };
          }
          return {
            ...challenge,
            proof: {
              protectedHeader: {
                ...challenge.proof.protectedHeader,
                kid: `${identity.did}#zWrongHolderKey`,
              },
              payload: challenge.proof.payload,
            },
          };
        },
      });

      await expect(harness.client.createSession()).rejects.toMatchObject({
        code: "session_challenge_binding_invalid",
      });
      expect(harness.sessionCompletions).toHaveLength(0);
    },
  );

  it("rejects a session whose cnf thumbprint is not the holder key", async () => {
    const other = await generateHolderIdentity({ algorithm: "P-256" });
    const harness = await createHarness({
      sessionThumbprint: other.publicJwkThumbprint,
    });

    await expect(harness.client.createSession()).rejects.toMatchObject({
      code: "session_key_binding_invalid",
    });
    expect(harness.sessionCompletions).toHaveLength(1);
    expect(harness.client.activeSession).toBeUndefined();
  });

  it("sends a strict sync request with RFC 9449 DPoP binding", async () => {
    const harness = await createHarness({
      protectedHandler: async () => jsonResponse(syncPage()),
    });
    const request = {
      cursor: "opaque_cursor_0123456789abcdef",
      limit: 50,
      knownCredentials: [
        {
          credentialId: "credential-001",
          contentHash: CONTENT_HASH,
          status: "active",
        },
      ],
    };

    await expect(harness.client.syncCredentials(request)).resolves.toEqual(
      syncPage(),
    );

    const protectedRequest = harness.protectedRequests[0];
    expect(protectedRequest).toBeDefined();
    expect(protectedRequest?.url).toBe(
      `${PORTAL_ORIGIN}/api/wallet/v2/credentials/sync`,
    );
    expect(protectedRequest?.method).toBe("POST");
    expect(JSON.parse(protectedRequest?.body ?? "null")).toEqual(request);
    expect(protectedRequest?.headers.get("authorization")).toBe(
      "DPoP wxt_access_token_1",
    );

    const proof = await verifyDpop(protectedRequest!, harness.identity);
    expect(proof.header).toEqual({
      alg: "ES256",
      typ: "dpop+jwt",
      jwk: harness.identity.publicJwk,
    });
    expect(proof.claims).toMatchObject({
      htm: "POST",
      htu: `${PORTAL_ORIGIN}/api/wallet/v2/credentials/sync`,
      iat: Math.floor(FIXED_NOW.getTime() / 1_000),
      ath: await calculateDpopAccessTokenHash("wxt_access_token_1"),
    });
    expect(proof.claims.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("reads the holder-bound graph delta with vendor JSON and exact GET DPoP htu", async () => {
    const harness = await createHarness({
      protectedHandler: async () =>
        jsonResponse(graphChangePage(), {
          "content-type":
            "application/vnd.trustcare.pcdg-changes+json;version=2",
        }),
    });
    await expect(
      harness.client.syncClinicalDocumentGraph({
        cursor: "opaque+cursor/value=",
        limit: 200,
      }),
    ).resolves.toEqual(graphChangePage());

    const request = harness.protectedRequests[0]!;
    const expectedUrl = `${PORTAL_ORIGIN}/api/wallet/v2/clinical-document-graph/changes?limit=200&cursor=opaque%2Bcursor%2Fvalue%3D`;
    expect(request.url).toBe(expectedUrl);
    expect(request.method).toBe("GET");
    expect(request.body).toBeUndefined();
    expect(request.headers.get("accept")).toBe(
      "application/vnd.trustcare.pcdg-changes+json;version=2, application/problem+json",
    );
    const proof = await verifyDpop(request, harness.identity);
    expect(proof.claims).toMatchObject({
      htm: "GET",
      htu: `${PORTAL_ORIGIN}/api/wallet/v2/clinical-document-graph/changes`,
    });
  });

  it("sends the holder-signed SHL certification request through DPoP without patientId", async () => {
    const response = {
      schema: "trustcare.wallet.credential-request.v1" as const,
      requestId: "wxr_shl_certification_001",
      clientRequestId: "wallet-shl-certification-001",
      status: "received" as const,
      credentialTypes: ["shl_manifest"],
      statusUrl: `${PORTAL_ORIGIN}/api/wallet/v2/credential-requests/wxr_shl_certification_001`,
      nextAction: "wait_for_maker_checker" as const,
      createdAt: FIXED_NOW.toISOString(),
      idempotent: false,
    };
    const harness = await createHarness({
      protectedHandler: async () => jsonResponse(response),
    });
    const shlPackageId = "A".repeat(43);
    const request = {
      clientRequestId: "wallet-shl-certification-001",
      shlPackageId,
      targetHospitalCode: "TCC" as const,
      context: "opd_visit" as const,
      purpose: "OPD registration",
      consentRef: "consent:001",
      manifestUrl: `${PORTAL_ORIGIN}/s/${shlPackageId}`,
      manifestHash: `sha256:${"b".repeat(64)}`,
      sourceBundleHash: `sha256:${"c".repeat(64)}`,
      fileHashes: [`sha256:${"d".repeat(64)}`],
      expiresAt: new Date(FIXED_NOW.getTime() + 600_000).toISOString(),
      holderAuthorizationVpJwt: VP_JWT,
    } satisfies ShlCertificationRequest;

    await expect(
      harness.client.requestShlCertification(request, "idempotency-shl-001"),
    ).resolves.toEqual(response);

    const protectedRequest = harness.protectedRequests[0]!;
    expect(protectedRequest.url).toBe(
      `${PORTAL_ORIGIN}/api/wallet/v2/shl-certification-requests`,
    );
    expect(protectedRequest.headers.get("idempotency-key")).toBe(
      "idempotency-shl-001",
    );
    expect(protectedRequest.body).not.toContain("patientId");
    const proof = await verifyDpop(protectedRequest, harness.identity);
    expect(proof.claims).toMatchObject({
      htm: "POST",
      htu: `${PORTAL_ORIGIN}/api/wallet/v2/shl-certification-requests`,
      ath: await calculateDpopAccessTokenHash("wxt_access_token_1"),
    });
  });

  it("associates an exact holder VP with a Portal-created SHL through DPoP", async () => {
    const response = {
      schema: "trustcare.wallet.shl-association.v2" as const,
      shlId: 42,
      packageId: "42",
      status: "active" as const,
      trustLevel: "hospital_certified" as const,
      appId: "trustcare-wallet-test",
      manifestCredentialId: "urn:trustcare:vc:shl:42",
      manifestHash: CONTENT_HASH,
      sourceBundleHash: CONTENT_HASH,
      holderPresentationId: "urn:uuid:holder-presentation-42",
      holderPresentationJwt: VP_JWT,
      holderPresentationDigest: CONTENT_HASH,
      holderDid: "did:key:z6MkholderForWalletExchangeTest",
      consentRef: "urn:trustcare:consent:shl:42",
      context: "opd_visit" as const,
      purpose: "patient_summary",
      recipient: "did:web:portal.example:hospital:tcc",
      audience: `${PORTAL_ORIGIN}/api/wallet/v2/shl-associations/42`,
      associatedAt: FIXED_NOW.toISOString(),
      issuedAt: FIXED_NOW.toISOString(),
      expiresAt: "2026-07-11T12:10:00.000Z",
      holderPresentationExpiresAt: "2026-07-11T12:05:00.000Z",
      lifecycle: {
        status: "active",
        effectiveAt: FIXED_NOW.toISOString(),
        reasonCode: null,
        holderPresentationStatus: "verified_at_association" as const,
      },
      idempotent: false,
    };
    const harness = await createHarness({
      protectedHandler: async () => jsonResponse(response),
    });
    const request = {
      clientAssociationId: "wallet-shl-association-42",
      consentRef: "urn:trustcare:consent:shl:42",
      holderVpJwt: VP_JWT,
    };

    await expect(
      harness.client.associateShlPresentation(
        42,
        request,
        "idempotency-shl-association-42",
      ),
    ).resolves.toEqual(response);

    const protectedRequest = harness.protectedRequests[0]!;
    expect(protectedRequest.url).toBe(
      `${PORTAL_ORIGIN}/api/wallet/v2/shl-associations/42`,
    );
    expect(JSON.parse(protectedRequest.body ?? "null")).toEqual(request);
    expect(protectedRequest.headers.get("idempotency-key")).toBe(
      "idempotency-shl-association-42",
    );
    const proof = await verifyDpop(protectedRequest, harness.identity);
    expect(proof.claims).toMatchObject({
      htm: "POST",
      htu: `${PORTAL_ORIGIN}/api/wallet/v2/shl-associations/42`,
      ath: await calculateDpopAccessTokenHash("wxt_access_token_1"),
    });

    await expect(harness.client.getShlAssociation(42)).resolves.toEqual(
      response,
    );
    const recoveryRequest = harness.protectedRequests[1]!;
    expect(recoveryRequest.method).toBe("GET");
    expect(recoveryRequest.body).toBeUndefined();
    expect(recoveryRequest.headers.has("idempotency-key")).toBe(false);
    const recoveryProof = await verifyDpop(recoveryRequest, harness.identity);
    expect(recoveryProof.claims).toMatchObject({
      htm: "GET",
      htu: `${PORTAL_ORIGIN}/api/wallet/v2/shl-associations/42`,
    });
  });

  it("keeps ack body and idempotency stable across a 503 retry but creates fresh DPoP", async () => {
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    let attempt = 0;
    const harness = await createHarness({
      sleep,
      protectedHandler: async () => {
        attempt += 1;
        if (attempt === 1) {
          return problemResponse(503, "portal_unavailable", "corr-503", {
            "retry-after": "2",
          });
        }
        return jsonResponse(syncAck());
      },
    });
    const input: WalletSyncAckRequest = {
      syncId: "sync-001",
      cursor: "opaque_cursor_0123456789abcdef",
      results: [
        { eventId: "event-001", outcome: "applied" },
        {
          eventId: "event-002",
          outcome: "rejected",
          reasonCode: "proof_invalid",
        },
      ],
    };

    await expect(
      harness.client.acknowledgeSync(input, "ack-sync-001-fixed"),
    ).resolves.toEqual(syncAck());

    expect(harness.protectedRequests).toHaveLength(2);
    const [first, second] = harness.protectedRequests;
    expect(first?.body).toBe(JSON.stringify(input));
    expect(second?.body).toBe(first?.body);
    expect(first?.headers.get("idempotency-key")).toBe("ack-sync-001-fixed");
    expect(second?.headers.get("idempotency-key")).toBe(
      first?.headers.get("idempotency-key"),
    );
    expect(second?.headers.get("x-request-id")).toBe(
      first?.headers.get("x-request-id"),
    );
    const [firstProof, secondProof] = await Promise.all([
      verifyDpop(first!, harness.identity),
      verifyDpop(second!, harness.identity),
    ]);
    expect(firstProof.claims.jti).not.toBe(secondProof.claims.jti);
    expect({ ...firstProof.claims, jti: undefined }).toEqual({
      ...secondProof.claims,
      jti: undefined,
    });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("tracks credential requests and holder-signed document submissions", async () => {
    const harness = await createHarness({
      protectedHandler: async (request) => {
        if (
          request.method === "POST" &&
          request.url.endsWith("/credential-requests")
        ) {
          return jsonResponse(credentialRequestResponse());
        }
        if (
          request.method === "GET" &&
          request.url.endsWith("/credential-requests/request-001")
        ) {
          return jsonResponse(credentialRequestStatus());
        }
        if (request.method === "POST" && request.url.endsWith("/submissions")) {
          return jsonResponse(submissionResponse("received"));
        }
        if (
          request.method === "GET" &&
          request.url.endsWith("/submissions/submission-001")
        ) {
          return jsonResponse(submissionResponse("accepted"));
        }
        return problemResponse(404, "not_found", "corr-not-found");
      },
    });
    const credentialInput = {
      clientRequestId: "client-request-001",
      targetHospitalCode: "TCC" as const,
      context: "opd_visit" as const,
      purpose: "Prepare for OPD registration",
      consentRef: "consent:request:001",
      credentialTypes: ["PatientIdentityCredential", "CoverageCredential"],
      notes: "Need current hospital documents",
    };
    const submissionInput: WalletSubmissionRequest = {
      clientSubmissionId: "client-submission-001",
      context: "opd_visit",
      purpose: "Register for OPD",
      consentRef: "consent:submission:001",
      transport: { mode: "direct_vp", vpJwt: VP_JWT },
    };

    await expect(
      harness.client.requestCredential(
        credentialInput,
        "credential-request-001",
      ),
    ).resolves.toEqual(credentialRequestResponse());
    await expect(
      harness.client.getCredentialRequestStatus("request-001"),
    ).resolves.toEqual(credentialRequestStatus());
    await expect(
      harness.client.submitDocuments(submissionInput, "submission-key-001"),
    ).resolves.toEqual(submissionResponse("received"));
    await expect(
      harness.client.getSubmissionStatus("submission-001"),
    ).resolves.toEqual(submissionResponse("accepted"));

    expect(harness.sessionCompletions).toHaveLength(1);
    expect(
      harness.protectedRequests.map(({ method, url }) => [method, url]),
    ).toEqual([
      ["POST", `${PORTAL_ORIGIN}/api/wallet/v2/credential-requests`],
      ["GET", `${PORTAL_ORIGIN}/api/wallet/v2/credential-requests/request-001`],
      ["POST", `${PORTAL_ORIGIN}/api/wallet/v2/submissions`],
      ["GET", `${PORTAL_ORIGIN}/api/wallet/v2/submissions/submission-001`],
    ]);
    expect(JSON.parse(harness.protectedRequests[0]?.body ?? "null")).toEqual(
      credentialInput,
    );
    expect(harness.protectedRequests[0]?.headers.get("idempotency-key")).toBe(
      "credential-request-001",
    );
    expect(JSON.parse(harness.protectedRequests[2]?.body ?? "null")).toEqual(
      submissionInput,
    );
    expect(harness.protectedRequests[2]?.headers.get("idempotency-key")).toBe(
      "submission-key-001",
    );
    for (const request of harness.protectedRequests) {
      expect(request.headers.get("dpop")).toBeTruthy();
      expect(request.headers.get("authorization")).toBe(
        "DPoP wxt_access_token_1",
      );
    }
  });

  it("renews a rejected session once and binds the retry to the new token", async () => {
    let protectedAttempt = 0;
    const harness = await createHarness({
      protectedHandler: async () => {
        protectedAttempt += 1;
        if (protectedAttempt === 1) {
          return problemResponse(401, "session_expired", "corr-expired");
        }
        return jsonResponse(syncPage());
      },
    });

    await expect(
      harness.client.syncCredentials({ limit: 25 }),
    ).resolves.toEqual(syncPage());

    expect(harness.challengeRequests).toHaveLength(2);
    expect(harness.sessionCompletions).toHaveLength(2);
    expect(harness.protectedRequests).toHaveLength(2);
    expect(harness.protectedRequests[0]?.headers.get("authorization")).toBe(
      "DPoP wxt_access_token_1",
    );
    expect(harness.protectedRequests[1]?.headers.get("authorization")).toBe(
      "DPoP wxt_access_token_2",
    );
    const first = await verifyDpop(
      harness.protectedRequests[0]!,
      harness.identity,
    );
    const second = await verifyDpop(
      harness.protectedRequests[1]!,
      harness.identity,
    );
    expect(first.claims.ath).toBe(
      await calculateDpopAccessTokenHash("wxt_access_token_1"),
    );
    expect(second.claims.ath).toBe(
      await calculateDpopAccessTokenHash("wxt_access_token_2"),
    );
    expect(first.claims.jti).not.toBe(second.claims.jti);
  });

  it("retries a replay-safe sync after a network failure", async () => {
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    let protectedAttempt = 0;
    const harness = await createHarness({
      sleep,
      retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      protectedHandler: async () => {
        protectedAttempt += 1;
        if (protectedAttempt === 1) throw new TypeError("network unavailable");
        return jsonResponse(syncPage());
      },
    });

    await expect(
      harness.client.syncCredentials({ limit: 20 }),
    ).resolves.toEqual(syncPage());
    expect(harness.protectedRequests).toHaveLength(2);
    expect(harness.protectedRequests[0]?.body).toBe(
      harness.protectedRequests[1]?.body,
    );
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("does not retry the unprotected session challenge after a network failure", async () => {
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });
    const client = createWalletExchangeV2Client({
      contracts: contractSet(),
      identity,
      appId: "trustcare-wallet-test",
      requestedScopes: [...REQUESTED_SCOPES],
      fetchImpl,
      now: () => FIXED_NOW,
      retryPolicy: { maxAttempts: 5 },
    });

    await expect(client.createSession()).rejects.toThrow("network unavailable");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects patientId and unknown request fields before any fetch", async () => {
    const identity = await generateHolderIdentity({ algorithm: "P-256" });
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createWalletExchangeV2Client({
      contracts: contractSet(),
      identity,
      appId: "trustcare-wallet-test",
      requestedScopes: [...REQUESTED_SCOPES],
      fetchImpl,
      now: () => FIXED_NOW,
    });

    await expect(
      client.syncCredentials({ patientId: "portal-patient-001" } as never),
    ).rejects.toThrow("patientId is not allowed");
    await expect(
      client.syncCredentials({ limit: 20, futureRequiredField: true } as never),
    ).rejects.toThrow("futureRequiredField is not allowed");
    await expect(
      client.requestCredential(
        {
          clientRequestId: "client-request-001",
          targetHospitalCode: "TCC",
          context: "opd_visit",
          purpose: "OPD registration",
          consentRef: "consent:001",
          credentialTypes: ["PatientIdentityCredential"],
          patientId: "portal-patient-001",
        } as never,
        "credential-request-001",
      ),
    ).rejects.toThrow("patientId is not allowed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([400, 403, 409, 410, 422])(
    "does not retry HTTP %i and preserves its correlationId",
    async (status) => {
      const sleep = vi.fn(async (_milliseconds: number) => undefined);
      const harness = await createHarness({
        sleep,
        protectedHandler: async () =>
          problemResponse(status, `portal_${status}`, `corr-${status}`),
      });

      await expect(
        harness.client.syncCredentials({ limit: 20 }),
      ).rejects.toMatchObject({
        name: "WalletExchangeProblemError",
        status,
        code: `portal_${status}`,
        correlationId: `corr-${status}`,
        retryable: false,
      });
      expect(harness.protectedRequests).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it("exposes correlationId from an RFC 9457 error instance", async () => {
    const harness = await createHarness({
      protectedHandler: async () =>
        problemResponse(409, "cursor_conflict", "corr-cursor-001"),
    });

    let error: unknown;
    try {
      await harness.client.syncCredentials({
        cursor: "opaque_cursor_0123456789abcdef",
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(WalletExchangeProblemError);
    expect(error).toMatchObject({
      status: 409,
      code: "cursor_conflict",
      correlationId: "corr-cursor-001",
      contentType: "application/problem+json",
      problem: {
        type: `${PORTAL_ORIGIN}/problems/cursor_conflict`,
        status: 409,
        correlationId: "corr-cursor-001",
      },
    });
  });
});

type CapturedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
};

type SessionProof = {
  header: Record<string, unknown>;
  payloadText: string;
};

type HarnessOptions = {
  mutateChallenge?: (
    challenge: WalletSessionChallenge,
    identity: GeneratedHolderIdentity,
  ) => WalletSessionChallenge;
  sessionThumbprint?: string;
  protectedHandler?: (
    request: CapturedRequest,
    attempt: number,
  ) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
  retryPolicy?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
};

async function createHarness(options: HarnessOptions = {}) {
  const identity = await generateHolderIdentity({ algorithm: "P-256" });
  const contracts = contractSet();
  const requests: CapturedRequest[] = [];
  const protectedRequests: CapturedRequest[] = [];
  const challengeRequests: Array<Record<string, unknown>> = [];
  const challenges: WalletSessionChallenge[] = [];
  const sessionCompletions: Array<{
    challengeId: string;
    proofJwt: string;
  }> = [];
  const sessionProofs: SessionProof[] = [];
  let challengeCount = 0;
  let sessionCount = 0;
  let protectedAttempt = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = captureRequest(input, init);
    requests.push(request);

    if (request.url === contracts.discovery.authorization.challengeEndpoint) {
      challengeCount += 1;
      const challengeRequest = parseBody(request);
      challengeRequests.push(challengeRequest);
      const challenge =
        options.mutateChallenge?.(
          makeChallenge(identity, challengeCount),
          identity,
        ) ?? makeChallenge(identity, challengeCount);
      challenges.push(challenge);
      return jsonResponse(challenge);
    }

    if (request.url === contracts.discovery.authorization.sessionEndpoint) {
      sessionCount += 1;
      const completion = parseBody(request) as {
        challengeId: string;
        proofJwt: string;
      };
      sessionCompletions.push(completion);
      const verified = await compactVerify(
        completion.proofJwt,
        identity.publicKey,
      );
      sessionProofs.push({
        header: verified.protectedHeader as Record<string, unknown>,
        payloadText: new TextDecoder().decode(verified.payload),
      });
      return jsonResponse({
        access_token: `wxt_access_token_${sessionCount}`,
        token_type: "DPoP",
        expires_in: 900,
        scope: REQUESTED_SCOPES.join(" "),
        cnf: {
          jkt: options.sessionThumbprint ?? identity.publicJwkThumbprint,
        },
      });
    }

    protectedAttempt += 1;
    protectedRequests.push(request);
    return (
      (await options.protectedHandler?.(request, protectedAttempt)) ??
      problemResponse(500, "missing_test_handler", "corr-test-handler")
    );
  };

  let requestId = 0;
  const client = createWalletExchangeV2Client({
    contracts,
    identity,
    appId: "trustcare-wallet-test",
    requestedScopes: [...REQUESTED_SCOPES],
    fetchImpl,
    now: () => FIXED_NOW,
    sleep: options.sleep,
    retryPolicy: options.retryPolicy,
    randomUUID: () => `request-${String(++requestId).padStart(4, "0")}`,
  });

  return {
    client,
    contracts,
    identity,
    requests,
    protectedRequests,
    challengeRequests,
    challenges,
    sessionCompletions,
    sessionProofs,
  };
}

function makeChallenge(
  identity: GeneratedHolderIdentity,
  sequence: number,
): WalletSessionChallenge {
  const challengeId = `challenge-${String(sequence).padStart(3, "0")}`;
  const iat = Math.floor(FIXED_NOW.getTime() / 1_000);
  const exp = iat + 120;
  return {
    challengeId,
    expiresAt: new Date(exp * 1_000).toISOString(),
    proof: {
      protectedHeader: {
        typ: "trustcare-wallet-session+jwt",
        alg: identity.jwsAlgorithm,
        kid: identity.kid,
      },
      payload: {
        iss: identity.did,
        sub: identity.did,
        aud: `${PORTAL_ORIGIN}/api/wallet/v2/sessions`,
        jti: challengeId,
        nonce: `nonce-${String(sequence).padStart(3, "0")}-0123456789abcdef`,
        purpose: "trustcare-wallet-exchange-session",
        iat,
        exp,
      },
    },
  };
}

function contractSet(): WalletExchangeContractSet {
  const discovery = {
    name: "TrustCare Portal Wallet Exchange API" as const,
    version: "2.0.1" as const,
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    authorization: {
      challengeEndpoint: `${PORTAL_ORIGIN}/api/wallet/v2/session-challenges`,
      sessionEndpoint: `${PORTAL_ORIGIN}/api/wallet/v2/sessions`,
      holderProofType: "trustcare-wallet-session+jwt" as const,
      accessTokenType: "DPoP" as const,
      dpopSpecification: "RFC 9449" as const,
      scopes: [...ALL_SCOPES],
    },
    endpoints: {
      credentialSync: `${PORTAL_ORIGIN}/api/wallet/v2/credentials/sync`,
      credentialSyncAck: `${PORTAL_ORIGIN}/api/wallet/v2/credentials/sync/ack`,
      clinicalDocumentGraphChanges: `${PORTAL_ORIGIN}/api/wallet/v2/clinical-document-graph/changes`,
      credentialRequests: `${PORTAL_ORIGIN}/api/wallet/v2/credential-requests`,
      documentSubmissions: `${PORTAL_ORIGIN}/api/wallet/v2/submissions`,
      shlAssociations: `${PORTAL_ORIGIN}/api/wallet/v2/shl-associations/{shlId}`,
      shlCertificationRequests: `${PORTAL_ORIGIN}/api/wallet/v2/shl-certification-requests`,
      publicContracts: `${PORTAL_ORIGIN}/api/public/wallet-contracts/manifest`,
      shareGateway: `${PORTAL_ORIGIN}/api/share-gateway`,
      issuerJwks: `${PORTAL_ORIGIN}/.well-known/jwks.json`,
    },
    protocols: {
      credentialLifecycle: "Wallet Exchange lifecycle v2",
      presentation:
        "Wallet-created VP JWT or Certified SHL package association with a separate Holder VP" as const,
      certifiedShl: "Portal KMS manifest VC and holder VP association",
      manifestUrl:
        "Plain SHL HTTPS /s/{256-bit-token} URL, maximum 128 characters; no alternate manifest route is accepted" as const,
      plainShlManifestUrlMaxLength: 128 as const,
      compactJwsDigest:
        "SHA-256 over the exact UTF-8 bytes of the compact JWS string" as const,
      documentMetadata: "FHIR DocumentReference",
      errors: "RFC 9457 problem details" as const,
    },
    ownership: {
      holderKeys: "wallet" as const,
      vpCreation: "wallet" as const,
      renderer: "wallet" as const,
      hospitalIssuerKeys: "portal" as const,
      makerChecker: "portal" as const,
      incomingVerification: "portal" as const,
    },
    renderer: {
      repository: "AEC-Infraconnect-2562/trustcare-wallet-apps" as const,
      referenceCommit: WALLET_RENDERER_REFERENCE_COMMIT,
      referenceCommitRole: "provenance_only" as const,
      compatibilityGate: "contract_profile_and_schema" as const,
      renderVersion: "trustcare-render-contract-v2",
      modelPackage: "@trustcare/wallet-core" as const,
      webPackage: "@trustcare/ui-web" as const,
      rule: "Render from credentialSubject.data.humanDocument.",
    },
  };
  const resource = <T>(payload: T) => ({
    payload,
    etag: `"sha256-${"0".repeat(64)}"`,
    contentDigest: "sha-256=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=:",
    sha256: "0".repeat(64),
  });
  return {
    portalOrigin: PORTAL_ORIGIN,
    discovery,
    health: {
      status: "ok",
      contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
      persistent: true,
      holderProof: "did:key",
      tokenBinding: "DPoP",
      credentialSync: "durable_cursor",
      documentIntake: ["direct_vp", "share_gateway"],
      rendererAuthority: { authority: "wallet" },
    },
    manifest: resource({
      version: "2026.07.portal-wallet.v4",
      status: "active",
      minimumWalletVersion: "0.1.0",
      compatibilityRules: [],
      integrity: {
        algorithm: "sha-256",
        canonicalization: "json-sorted-keys-v1",
        scope: "manifest_without_integrity_and_signature",
        digest: `sha256:${"0".repeat(64)}`,
      },
    }),
    renderContract: resource({
      version: "2026.07.portal-wallet.v4",
      renderVersion: "trustcare-render-contract-v2",
      authority: "wallet",
      implementationRepository: "AEC-Infraconnect-2562/trustcare-wallet-apps",
      referenceCommit: WALLET_RENDERER_REFERENCE_COMMIT,
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
    }),
    schema: resource({
      $id: "urn:trustcare:schema:2026.07.portal-wallet.v4",
      contractVersion: "2026.07.portal-wallet.v4",
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
      },
    }),
    clinicalDocumentGraph: resource(
      clinicalDocumentGraphContractFixture(PORTAL_ORIGIN),
    ),
    graphPresentationSchema: resource(graphPresentationSchemaFixture()),
    loadedAt: FIXED_NOW.toISOString(),
  };
}

function syncPage() {
  return {
    schema: "trustcare.wallet.sync.v2",
    contractVersion: WALLET_EXCHANGE_V2_CONTRACT_VERSION,
    syncId: "sync-001",
    mode: "initial",
    changes: [],
    nextCursor: "opaque_cursor_0123456789abcdef",
    hasMore: false,
    serverTime: FIXED_NOW.toISOString(),
  } as const;
}

function graphChangePage() {
  return {
    contractVersion: "2026.07.pcdg.v2",
    changeSetId: "graphset-001",
    tenantReference: "holder-authorized-multi-tenant-feed",
    subjectReference: "did:key:zGraphHolder",
    cursor: "opaque+cursor/value=",
    nextCursor: "opaque-next-cursor-001",
    correlationId: "corr-graph-001",
    idempotencyKey: "graph-feed:1:2",
    occurredAt: FIXED_NOW.toISOString(),
    compatibility: {
      minimumConsumerVersion: "2026.07.pcdg.v2",
      additiveUnknownFieldsAllowed: true,
      unknownRequiredFields: "quarantine",
      immutableArtifactUpdates: "supersede",
    },
    changes: [],
    hasMore: false,
  };
}

function syncAck() {
  return {
    schema: "trustcare.wallet.sync-ack.v1",
    receiptId: "receipt-001",
    syncId: "sync-001",
    acceptedAt: FIXED_NOW.toISOString(),
    summary: {
      applied: 1,
      alreadyCurrent: 0,
      archived: 0,
      rejected: 1,
    },
    idempotent: false,
    note: "Cursor and event outcomes accepted.",
  } as const;
}

function credentialRequestResponse() {
  return {
    schema: "trustcare.wallet.credential-request.v1",
    requestId: "request-001",
    clientRequestId: "client-request-001",
    status: "pending_review",
    credentialTypes: ["PatientIdentityCredential", "CoverageCredential"],
    statusUrl: `${PORTAL_ORIGIN}/api/wallet/v2/credential-requests/request-001`,
    nextAction: "wait_for_maker_checker",
    createdAt: FIXED_NOW.toISOString(),
    idempotent: false,
  } as const;
}

function credentialRequestStatus() {
  return {
    schema: "trustcare.wallet.credential-request-status.v1",
    requestId: "request-001",
    clientRequestId: "client-request-001",
    status: "ready",
    items: [
      {
        requestId: "item-001",
        documentType: "PatientIdentityCredential",
        status: "converted_to_vc",
        reasonCode: "credential_issued",
        nextAction: "sync_credentials",
        updatedAt: FIXED_NOW.toISOString(),
      },
    ],
    nextAction: "sync_credentials",
    updatedAt: FIXED_NOW.toISOString(),
  } as const;
}

function submissionResponse(status: "received" | "accepted") {
  return {
    schema: "trustcare.wallet.document-submission.v1",
    submissionId: "submission-001",
    clientSubmissionId: "client-submission-001",
    status,
    presentationId: "presentation-001",
    results: [
      {
        credentialId: "credential-001",
        documentType: "PatientIdentityCredential",
        status: status === "received" ? "queued" : "ready",
        importId: "import-001",
      },
    ],
    statusUrl: `${PORTAL_ORIGIN}/api/wallet/v2/submissions/submission-001`,
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    idempotent: false,
  } as const;
}

function captureRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): CapturedRequest {
  const request = input instanceof Request ? input : undefined;
  const body = init?.body ?? request?.body;
  if (body !== undefined && body !== null && typeof body !== "string") {
    throw new Error(
      "Test fixture expects Wallet Exchange bodies to be JSON strings.",
    );
  }
  return {
    url: request?.url ?? String(input),
    method: init?.method ?? request?.method ?? "GET",
    headers: new Headers(init?.headers ?? request?.headers),
    body: body ?? undefined,
  };
}

function parseBody(request: CapturedRequest): Record<string, unknown> {
  if (!request.body) throw new Error(`Missing JSON body for ${request.url}.`);
  return JSON.parse(request.body) as Record<string, unknown>;
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

function problemResponse(
  status: number,
  code: string,
  correlationId: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      type: `${PORTAL_ORIGIN}/problems/${code}`,
      title: "Wallet Exchange request rejected",
      status,
      detail: `Request rejected with ${code}.`,
      code,
      correlationId,
      retryable: false,
    }),
    {
      status,
      headers: {
        "content-type": "application/problem+json",
        ...headers,
      },
    },
  );
}

async function verifyDpop(
  request: CapturedRequest,
  identity: GeneratedHolderIdentity,
): Promise<{
  header: Record<string, unknown>;
  claims: DpopProofClaims;
}> {
  const compact = request.headers.get("dpop");
  if (!compact) throw new Error("Missing DPoP proof.");
  const verified = await compactVerify(compact, identity.publicKey);
  const claims = JSON.parse(
    new TextDecoder().decode(verified.payload),
  ) as DpopProofClaims;
  expect(decodeProtectedHeader(compact)).toEqual(verified.protectedHeader);
  return {
    header: verified.protectedHeader as Record<string, unknown>,
    claims,
  };
}

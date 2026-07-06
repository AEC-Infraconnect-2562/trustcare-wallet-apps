import { describe, expect, it } from "vitest";
import {
  getPortalWalletSyncStatus,
  resolveTrustCareDid,
  syncTrustCarePortalWallet,
  verifyPortalCredentialJwt,
} from "./portalSync";

describe("syncTrustCarePortalWallet", () => {
  it("uses the Wallet Sync API and imports only VC/VP scope", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      calls.push({ url: requestUrl, init });
      if (requestUrl.endsWith("/api/auth/demo-login")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          openId: "demo-patient-001",
        });
        return jsonResponse({ success: true, token: "demo-token" });
      }
      if (requestUrl.endsWith("/api/wallet/sync")) {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer demo-token",
        );
        expect(JSON.parse(String(init?.body))).toMatchObject({
          includePresentations: true,
        });
        return jsonResponse({
          credentials: [
            portalCard({
              id: 1,
              credentialId: 7001,
              cardType: "patient_identity",
              displayName: "บัตรประจำตัวผู้ป่วย",
              displayNameEn: "Patient ID Card",
              jwt: "ey.demo.patient.sd-jwt-vc",
            }),
            portalCard({
              id: 2,
              credentialId: 7002,
              cardType: "shl_manifest",
              displayName: "เอกสารกำกับ Smart Health Link",
              displayNameEn: "SHL Manifest",
            }),
            {
              id: 3,
              patientId: 414,
              credentialId: 7003,
              cardType: "patient_summary",
              displayName: "สรุปข้อมูลผู้ป่วย",
              displayNameEn: "Patient Summary",
              documentCategory: "clinical_summary",
              credentialStatus: "active",
              credentialData: null,
            },
          ],
          presentations: [
            {
              id: "vp-1",
              presentationId: "vp-portal-1",
              verifierName: "TrustCare Portal Verifier",
              purpose: "opd_visit",
              verificationResult: "valid",
              presentedAt: "2026-07-03T10:00:00.000Z",
              presentationData: { id: "vp-portal-1", type: ["VerifiablePresentation"] },
            },
          ],
          syncedAt: "2026-07-06T12:00:00.000Z",
          total: 3,
          hasMore: false,
        });
      }
      if (requestUrl.endsWith("/api/wallet/sync/verify")) {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer demo-token",
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          jwt: "ey.demo.patient.sd-jwt-vc",
        });
        return jsonResponse({
          verified: true,
          trustLevel: "green",
          status: "verified",
          message: "Signature, status, and trust checks passed.",
        });
      }
      return jsonResponse({}, 404);
    };

    const result = await syncTrustCarePortalWallet({
      url: "https://wallet.example/trpc",
      fetchImpl,
      userId: "demo-patient-001",
      portalOrigin: "https://trustcarehealth.live",
    });

    expect(calls[0]?.url).toBe(
      "https://trustcarehealth.live/api/auth/demo-login",
    );
    expect(calls[1]?.url).toBe(
      "https://trustcarehealth.live/api/wallet/sync",
    );
    expect(calls.some((call) => call.url.includes("/api/trpc/"))).toBe(false);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.credentialData?.id).toBe("urn:portal:vc:7001");
    expect(result.cards[0]?.credentialJwt).toBe("ey.demo.patient.sd-jwt-vc");
    expect(result.cards[0]?.credentialProof).toMatchObject({
      type: "jwt",
      alg: "ES256",
      kid: "did:web:trustcare.network:hospital:tcc#vc-signing-key",
      source: "trustcare_portal_sync_proof",
    });
    expect(result.cards[0]?.portalVerification?.trustLevel).toBe("green");
    expect(result.presentations).toHaveLength(1);
    expect(result.report.portalCardCount).toBe(3);
    expect(result.report.metadataOnlyCount).toBe(1);
    expect(result.report.skipped.map((item) => item.reason)).toContain(
      "out_of_scope",
    );
  });

  it("maps Portal staff identity to staff_identity", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/api/auth/demo-login")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          openId: "demo-hospadmin-001",
        });
        return jsonResponse({ success: true, accessToken: "staff-token" });
      }
      if (requestUrl.endsWith("/api/wallet/sync")) {
        return jsonResponse({
          credentials: [
            portalCard({
              id: 60007,
              credentialId: "urn:staff",
              cardType: "identity",
              displayName: "บัตรประจำตัวเจ้าหน้าที่โรงพยาบาล",
              displayNameEn: "Hospital Staff Identity",
              credentialTypes: [
                "VerifiableCredential",
                "HospitalStaffIdentityCredential",
              ],
            }),
          ],
          presentations: [],
        });
      }
      return jsonResponse({}, 404);
    };

    const result = await syncTrustCarePortalWallet({
      url: "https://wallet.example/trpc",
      fetchImpl,
      userId: "demo-hospadmin-001",
      portalOrigin: "https://trustcarehealth.live",
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.cardType).toBe("staff_identity");
  });

  it("does not fall back when Portal demo-login does not know a wallet user", async () => {
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/api/auth/demo-login")) {
        return jsonResponse(
          { error: "Demo user not found. Please run seed first." },
          404,
        );
      }
      return jsonResponse({}, 500);
    };

    await expect(
      syncTrustCarePortalWallet({
        url: "https://wallet.example/trpc",
        fetchImpl,
        userId: "portal-empty-patient-001",
        portalOrigin: "https://trustcarehealth.live",
      }),
    ).rejects.toThrow("TrustCare Portal demo-login failed");
  });

  it("supports status, DID resolve, and JWT verify endpoints", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/api/auth/demo-login")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          openId: "demo-patient-001",
        });
        return jsonResponse({ success: true, token: "demo-token" });
      }
      if (requestUrl.endsWith("/api/wallet/sync/status")) {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer demo-token",
        );
        return jsonResponse({
          available: true,
          stats: { totalCredentials: 16, totalPresentations: 5 },
        });
      }
      if (requestUrl.endsWith("/api/wallet/sync/did-resolve")) {
        return jsonResponse({
          did: "did:web:trustcare.network:hospital:tcc",
          resolved: true,
          verificationMethod: [{ id: "did:web:trustcare.network:hospital:tcc#vc-signing-key" }],
          hospitalCode: "TCC",
        });
      }
      if (requestUrl.endsWith("/api/wallet/sync/verify")) {
        return jsonResponse({ verified: true, trustLevel: "green" });
      }
      return jsonResponse({}, 404);
    };

    await expect(
      getPortalWalletSyncStatus({
        url: "https://wallet.example/trpc",
        fetchImpl,
        userId: "demo-patient-001",
        portalOrigin: "https://trustcarehealth.live",
      }),
    ).resolves.toMatchObject({ available: true });
    await expect(
      resolveTrustCareDid(
        { fetchImpl, portalOrigin: "https://trustcarehealth.live" },
        "did:web:trustcare.network:hospital:tcc",
      ),
    ).resolves.toMatchObject({ resolved: true, hospitalCode: "TCC" });
    await expect(
      verifyPortalCredentialJwt({
        fetchImpl,
        portalOrigin: "https://trustcarehealth.live",
        jwt: "ey.demo.jwt",
      }),
    ).resolves.toMatchObject({ verified: true, trustLevel: "green" });
  });
});

function portalCard(input: {
  id: number;
  credentialId: number | string;
  cardType: string;
  displayName: string;
  displayNameEn: string;
  jwt?: string;
  credentialTypes?: string[];
}) {
  return {
    id: input.id,
    patientId: 414,
    credentialId: input.credentialId,
    cardType: input.cardType,
    displayName: input.displayName,
    displayNameEn: input.displayNameEn,
    documentCategory: "identity_and_access",
    credentialStatus: "active",
    proof: input.jwt
      ? {
          type: "jwt",
          jwt: input.jwt,
          alg: "ES256",
          kid: "did:web:trustcare.network:hospital:tcc#vc-signing-key",
        }
      : undefined,
    credentialData: {
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: `urn:portal:vc:${input.credentialId}`,
      type: input.credentialTypes ?? [
        "VerifiableCredential",
        "PatientIdentityCredential",
      ],
      issuer: {
        id: "did:web:trustcare.network:hospital:tcc",
        name: "TrustCare Central Hospital",
        nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
      },
      credentialSubject: { id: "did:key:holder" },
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

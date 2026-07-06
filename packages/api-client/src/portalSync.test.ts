import { describe, expect, it } from "vitest";
import { syncTrustCarePortalWallet } from "./portalSync";

describe("syncTrustCarePortalWallet", () => {
  it("uses Portal demo-login and imports only VC-backed wallet cards", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      calls.push({ url: requestUrl, init });
      if (requestUrl.endsWith("/api/auth/demo-login")) {
        return jsonResponse({ success: true, token: "demo-token" });
      }
      if (requestUrl.includes("/api/trpc/wallet.cardsByCategory")) {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer demo-token",
        );
        return jsonResponse({
          result: {
            data: {
              json: {
                identity_and_access: [
                  {
                    id: 1,
                    patientId: 414,
                    credentialId: 7001,
                    cardType: "patient_identity",
                    displayName: "บัตรประจำตัวผู้ป่วย",
                    displayNameEn: "Patient ID Card",
                    documentCategory: "identity_and_access",
                    credentialStatus: "active",
                    credentialData: {
                      "@context": ["https://www.w3.org/ns/credentials/v2"],
                      id: "urn:portal:vc:7001",
                      type: [
                        "VerifiableCredential",
                        "PatientIdentityCredential",
                      ],
                      issuer: {
                        id: "did:web:trustcare.network:hospital:tcc",
                        name: "TrustCare Central Hospital",
                      },
                      credentialSubject: { id: "did:key:holder" },
                    },
                  },
                  {
                    id: 2,
                    patientId: 414,
                    credentialId: 7002,
                    cardType: "patient_summary",
                    displayName: "สรุปข้อมูลผู้ป่วย",
                    displayNameEn: "Patient Summary",
                    documentCategory: "clinical_summary",
                    credentialStatus: "active",
                    credentialData: null,
                  },
                ],
              },
            },
          },
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
    expect(calls[1]?.url).toContain(
      "https://trustcarehealth.live/api/trpc/wallet.cardsByCategory",
    );
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.credentialData?.id).toBe("urn:portal:vc:7001");
    expect(result.report.portalCardCount).toBe(2);
    expect(result.report.metadataOnlyCount).toBe(1);
  });

  it("accepts accessToken from Portal demo-login responses", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/api/auth/demo-login")) {
        return jsonResponse({
          success: true,
          accessToken: "access-only-token",
        });
      }
      if (requestUrl.includes("/api/trpc/wallet.cardsByCategory")) {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer access-only-token",
        );
        return jsonResponse({
          result: {
            data: {
              json: {
                identity_and_access: [
                  {
                    id: 1,
                    patientId: 414,
                    credentialId: 7001,
                    cardType: "patient_identity",
                    displayName: "บัตรประจำตัวผู้ป่วย",
                    displayNameEn: "Patient ID Card",
                    documentCategory: "identity_and_access",
                    credentialStatus: "active",
                    credentialData: {
                      "@context": ["https://www.w3.org/ns/credentials/v2"],
                      id: "urn:portal:vc:7001",
                      type: [
                        "VerifiableCredential",
                        "PatientIdentityCredential",
                      ],
                      issuer: {
                        id: "did:web:trustcare.network:hospital:tcc",
                        name: "TrustCare Central Hospital",
                      },
                      credentialSubject: { id: "did:key:holder" },
                    },
                  },
                ],
              },
            },
          },
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

    expect(result.cards).toHaveLength(1);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

import { describe, expect, it } from "vitest";
import * as shlApi from "./shl";
import * as walletApi from "./wallet";

describe("Portal live-demo wallet flow", () => {
  it("uses only synced Portal credentials and does not fall back to local seed data", async () => {
    const fetchImpl = createPortalFetch({
      identity_and_access: [
        portalCard({
          id: 41001,
          credentialId: 90001,
          cardType: "patient_identity",
          displayName: "บัตรประจำตัวผู้ป่วย",
          displayNameEn: "Patient ID Card",
        }),
        {
          id: 41002,
          credentialId: 90002,
          cardType: "patient_summary",
          displayName: "สรุปข้อมูลผู้ป่วย",
          displayNameEn: "Patient Summary",
          documentCategory: "clinical_summary",
          credentialStatus: "active",
          credentialData: null,
        },
      ],
    });
    const options = {
      url: "https://wallet.example/trpc",
      demoMode: true,
      portalSyncMode: "live_demo" as const,
      portalOrigin: "https://trustcarehealth.live",
      userId: "demo-patient-001",
      fetchImpl,
    };

    const cardsByCategory = await walletApi.cardsByCategory(options);
    const cards = Object.values(cardsByCategory).flat();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe(41001);
    expect(cards[0]?.sourceSystem).toBe("trustcare_portal");
    expect(cards[0]?.credentialJwt).toBe("ey.portal.live.patient.identity");
    expect(cards[0]?.portalVerification?.trustLevel).toBe("green");

    const readiness = await walletApi.readiness(options, {
      context: "opd_visit",
    });
    expect(readiness.readiness.criticalReady).toBe(false);
    expect(readiness.readiness.requiredReady).toBe(1);
    expect(readiness.readiness.selectedCardIds).toEqual([41001]);

    const presentation = await walletApi.present(options, {
      cardId: 41001,
      selectedFields: ["identity"],
    });
    expect(presentation.format).toBe("vc+jwt");
    expect(presentation.mode).toBe("direct_vc_jwt");
    expect(presentation.qrData).toBe("ey.portal.live.patient.identity");
    expect(presentation.credentialCount).toBe(1);
    expect(presentation.selectedFields).toEqual(["identity"]);

    await expect(walletApi.present(options, { cardId: 1 })).rejects.toThrow(
      "Wallet card not found",
    );
    await expect(shlApi.getShlById(options, 1)).rejects.toThrow(
      "SHL package not found in live Portal sync scope",
    );

    await expect(walletApi.history(options)).resolves.toEqual([]);
    await expect(shlApi.listShl(options)).resolves.toEqual([]);

    const fixtures = await walletApi.interoperabilityFixtures(options);
    expect(fixtures.counts).toEqual({
      cards: 0,
      shlPackages: 0,
      oid4vciOffers: 0,
      oid4vpRequests: 0,
    });
    expect(fixtures.credentialOfferUrl).toBe("");
    expect(fixtures.presentationRequestUrl).toBe("");
    expect(fixtures.sampleCredentialIds).toEqual([]);
    expect(fixtures.samplePresentationIds).toEqual([]);
    expect(fixtures.scope).toMatchObject({
      ownerUserId: "demo-patient-001",
      sourceSystem: "trustcare_portal",
      portalOpenId: "demo-patient-001",
    });
  });
});

function createPortalFetch(
  groupedCards: Record<string, unknown[]>,
): typeof fetch {
  return async (url, init) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/auth/demo-login")) {
      expect(JSON.parse(String(init?.body))).toEqual({
        openId: "demo-patient-001",
      });
      return jsonResponse({ success: true, token: "portal-token" });
    }
    if (requestUrl.endsWith("/api/wallet/sync")) {
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer portal-token",
      );
      return jsonResponse({
        credentials: Object.values(groupedCards).flat(),
        presentations: [],
        syncedAt: "2026-07-06T12:00:00.000Z",
        total: Object.values(groupedCards).flat().length,
        hasMore: false,
      });
    }
    if (requestUrl.endsWith("/api/wallet/sync/verify")) {
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer portal-token",
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        jwt: "ey.portal.live.patient.identity",
      });
      return jsonResponse({
        verified: true,
        trustLevel: "green",
        status: "verified",
      });
    }
    return jsonResponse({}, 404);
  };
}

function portalCard(input: {
  id: number;
  credentialId: number;
  cardType: string;
  displayName: string;
  displayNameEn: string;
}) {
  return {
    ...input,
    patientId: 414,
    documentCategory: "identity_and_access",
    credentialStatus: "active",
    issuedAt: "2026-07-01T02:00:00.000Z",
    expiresAt: "2027-07-01T02:00:00.000Z",
    proof: {
      type: "jwt",
      jwt: "ey.portal.live.patient.identity",
      alg: "ES256",
      kid: "did:web:trustcare.network:hospital:tcc#vc-signing-key",
    },
    credentialData: {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://trustcare.network/contexts/health/v1",
      ],
      id: `urn:portal:vc:${input.credentialId}`,
      type: ["VerifiableCredential", "PatientIdentityCredential"],
      issuer: {
        id: "did:web:trustcarehealth.live",
        name: "TrustCare Central Hospital",
        nameTh: "โรงพยาบาลทรัสต์แคร์ เซ็นทรัล",
      },
      validFrom: "2026-07-01T02:00:00.000Z",
      validUntil: "2027-07-01T02:00:00.000Z",
      credentialSubject: {
        id: "did:key:z6MkPortalHolder",
        patient: {
          name: "นายสมชาย ใจดี",
          nameEn: "Mr. Somchai Jaidee",
        },
        documentReference: {
          resourceType: "DocumentReference",
          status: "current",
          type: input.cardType,
        },
      },
      evidence: [
        {
          type: ["DocumentReference"],
          resource: {
            resourceType: "DocumentReference",
            status: "current",
          },
        },
      ],
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

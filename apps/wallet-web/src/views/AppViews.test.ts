import { afterEach, describe, expect, it, vi } from "vitest";
import { getDemoUser, getDemoWalletCards } from "@trustcare/wallet-core";
import {
  avatarUrlCandidatesForUser,
  createScannableWebUrl,
  currentAppBaseUrl,
  currentShareGatewayBaseUrl,
  extractScannablePayload,
  getShlTrustProfile,
  scanPayloadFromHash,
  trustcareBindingLabel,
  trustcareCertificationStatusLabel,
} from "./AppViews";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scan URL payload parsing", () => {
  it("preserves nested resolver query params inside hash scan URLs", () => {
    const payload =
      "https://wallet.example/?tc_resolver=vp&tc_id=vp_demo_1008_abc&tc_ref=1&tc_exp=2026-07-08T15%3A01%3A31.517Z";
    const hash = `#scan=${encodeURIComponent(payload)}`;

    expect(scanPayloadFromHash(hash)).toBe(payload);
    expect(extractScannablePayload(`https://wallet.example/${hash}`)).toBe(
      payload,
    );
  });

  it("wraps public resolver URLs so phone cameras open the public verifier page", () => {
    const resolverUrl =
      "https://wallet.example/api/share-gateway/presentations/vp_abc.jwt";
    const webScanUrl = createScannableWebUrl(resolverUrl);

    expect(webScanUrl).toContain("/verify#scan=");
    expect(webScanUrl).toContain("#scan=");
    expect(extractScannablePayload(webScanUrl)).toBe(resolverUrl);
    expect(createScannableWebUrl(webScanUrl)).toBe(webScanUrl);
  });
});

describe("share gateway URL resolution", () => {
  it("uses an application root instead of the active route for publication", () => {
    expect(currentAppBaseUrl()).toBe("https://trustcare.example.com");
  });

  it("uses the public Railway gateway when running as a GitHub Pages static app", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "aec-infraconnect-2562.github.io",
        origin: "https://aec-infraconnect-2562.github.io",
      },
    });

    expect(currentShareGatewayBaseUrl()).toBe(
      "https://wallet-web-production-6a00.up.railway.app/api/share-gateway",
    );
  });

  it("uses same-origin share gateway for full-stack public hosts", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "wallet-web-production-6a00.up.railway.app",
        origin: "https://wallet-web-production-6a00.up.railway.app",
      },
    });

    expect(currentShareGatewayBaseUrl()).toBe(
      "https://wallet-web-production-6a00.up.railway.app/api/share-gateway",
    );
  });
});

describe("login user photos", () => {
  it("keeps Portal user photos authoritative and does not add generic portrait candidates", () => {
    const user = getDemoUser("demo-patient-003");
    const candidates = avatarUrlCandidatesForUser(
      user,
      getDemoWalletCards(user.id),
    );

    expect(candidates.slice(0, 2)).toEqual([
      "https://trustcare-hospital-network-production.up.railway.app/manus-storage/patient_john_williams_b4e9e7f3.jpg",
      "https://trustcare-hospital-network-production.up.railway.app/api/storage-proxy/patient_john_williams_b4e9e7f3.jpg",
    ]);
    expect(
      candidates.some((candidate) => candidate.includes("wallet-native")),
    ).toBe(false);
  });

  it("keeps wallet-generated photos for wallet-native users", () => {
    const user = getDemoUser("partner-patient-001");
    const candidates = avatarUrlCandidatesForUser(
      user,
      getDemoWalletCards(user.id),
    );

    expect(candidates).toContain("/assets/users/wallet-native-02.png");
  });

  it("does not try stale credential photos before the catalog v4 portrait", () => {
    const user = {
      ...getDemoUser("demo-patient-003"),
      avatarUrl:
        "https://trustcare-hospital-network-production.up.railway.app/seed-avatars/patient_john_williams_b4e9e7f3.jpg",
      avatarSource: "trustcare_portal" as const,
    };

    expect(avatarUrlCandidatesForUser(user, getDemoWalletCards(user.id))).toEqual([
      user.avatarUrl,
    ]);
  });

  it("never falls back to a credential or catalog portrait while the bound avatar is unavailable", () => {
    const user = {
      ...getDemoUser("demo-patient-004"),
      avatarUrl: "https://portal.example/avatar-004.jpg",
      avatarState: "unavailable" as const,
    };

    expect(avatarUrlCandidatesForUser(user, getDemoWalletCards(user.id))).toEqual(
      [],
    );
  });

  it("uses only the atomically cached avatar bytes after validation succeeds", () => {
    const cached = "data:image/jpeg;base64,YXZhdGFyLTAwNA==";
    const user = {
      ...getDemoUser("demo-patient-004"),
      avatarUrl: cached,
      avatarState: "ready" as const,
    };

    expect(avatarUrlCandidatesForUser(user, getDemoWalletCards(user.id))).toEqual(
      [cached],
    );
  });
});

describe("TrustCare Manifest wallet copy", () => {
  it("does not show green from manifest metadata or an imported boolean", () => {
    const metadataOnly = {
      manifestCredentialId: "manifest-vc-1",
      presentationId: "holder-vp-1",
      documentBundle: { documents: [{ id: "doc-1" }] },
      trustcareCertification: {
        status: "maker_checker_approved",
        ownerConfirmed: true,
        makerApprovedAt: "2026-07-10T00:00:00.000Z",
        checkerApprovedAt: "2026-07-10T00:01:00.000Z",
      },
    } as any;

    expect(getShlTrustProfile(metadataOnly).tone).toBe("yellow");
    expect(
      getShlTrustProfile({
        ...metadataOnly,
        trustVerification: {
          verified: true,
          checkedAt: "2026-07-10T00:02:00.000Z",
        },
      } as any).tone,
    ).toBe("yellow");
  });

  it("shows hospital certification only after every verification signal passes", () => {
    const signed = {
      manifestCredentialId: "manifest-vc-1",
      presentationId: "holder-vp-1",
      manifestCredentialJwt: "header.payload.signature",
      holderPresentationJwt: "header.payload.signature",
      documentBundle: { documents: [{ id: "doc-1" }] },
      trustVerification: {
        verified: true,
        checkedAt: "2026-07-10T00:02:00.000Z",
        proof: true,
        issuer: true,
        status: true,
        expiry: true,
        subject: true,
        manifestHash: true,
        fileHashes: true,
        purpose: true,
        audience: true,
        policy: true,
      },
    } as any;

    expect(getShlTrustProfile(signed)).toMatchObject({
      kind: "trustcare-certified",
      tone: "green",
    });
    expect(
      getShlTrustProfile({
        ...signed,
        trustVerification: { ...signed.trustVerification, status: false },
      }).tone,
    ).toBe("yellow");
  });

  it("does not expose portal approval workflow labels in wallet trust states", () => {
    const pendingProfile = getShlTrustProfile({
      manifestCredentialId: "manifest-vc-1",
      presentationId: "holder-vp-1",
      documentBundle: { documents: [{ id: "doc-1" }] },
      trustcareCertification: { status: "pending_maker_checker" },
    } as any);

    const visibleCopy = [
      trustcareBindingLabel("pending_hospital_certification"),
      trustcareCertificationStatusLabel("pending_maker_checker"),
      pendingProfile.label,
      pendingProfile.description,
    ].join(" ");

    const forbiddenPortalRoleCopy = new RegExp(
      `${"Mak"}${"er"}|${"Check"}${"er"}`,
    );

    expect(visibleCopy).not.toMatch(forbiddenPortalRoleCopy);
    expect(visibleCopy).toContain("รอการรับรองจากโรงพยาบาล");
  });
});

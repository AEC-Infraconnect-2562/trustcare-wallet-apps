import { describe, expect, it } from "vitest";
import { getDemoUser, getDemoWalletCards } from "@trustcare/wallet-core";
import {
  avatarUrlCandidatesForUser,
  createScannableWebUrl,
  extractScannablePayload,
  getShlTrustProfile,
  scanPayloadFromHash,
  trustcareBindingLabel,
  trustcareCertificationStatusLabel,
} from "./AppViews";

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

    expect(webScanUrl).toContain("?verify=public#scan=");
    expect(webScanUrl).toContain("#scan=");
    expect(extractScannablePayload(webScanUrl)).toBe(resolverUrl);
    expect(createScannableWebUrl(webScanUrl)).toBe(webScanUrl);
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
      "https://trustcarehealth.live/manus-storage/patient_john_williams_b4e9e7f3.jpg",
      "https://trustcarehealth.live/api/storage-proxy/patient_john_williams_b4e9e7f3.jpg",
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
});

describe("TrustCare Manifest wallet copy", () => {
  it("does not expose portal approval workflow labels in wallet trust states", () => {
    const pendingProfile = getShlTrustProfile({
      manifestCredentialId: "manifest-vc-1",
      presentationId: "holder-vp-1",
      documentBundle: { documents: [{ id: "doc-1" }] },
      trustcareCertification: { status: "pending_maker_checker" },
    } as any);

    const visibleCopy = [
      trustcareBindingLabel("pending_manifest_vp"),
      trustcareCertificationStatusLabel("pending_maker_checker"),
      pendingProfile.label,
      pendingProfile.description,
    ].join(" ");

    const forbiddenPortalRoleCopy = new RegExp(
      `${"Mak"}${"er"}|${"Check"}${"er"}`,
    );

    expect(visibleCopy).not.toMatch(forbiddenPortalRoleCopy);
    expect(visibleCopy).toContain("TrustCare Manifest");
  });
});

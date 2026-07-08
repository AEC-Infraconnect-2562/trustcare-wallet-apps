import { describe, expect, it } from "vitest";
import { getDemoUser, getDemoWalletCards } from "@trustcare/wallet-core";
import {
  avatarUrlCandidatesForUser,
  extractScannablePayload,
  scanPayloadFromHash,
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
});

describe("login user photos", () => {
  it("uses credential photo candidates before the generic gender fallback", () => {
    const user = getDemoUser("demo-patient-003");
    const candidates = avatarUrlCandidatesForUser(
      user,
      getDemoWalletCards(user.id),
    );

    expect(candidates.slice(0, 2)).toEqual([
      "https://trustcarehealth.live/manus-storage/patient_john_williams_b4e9e7f3.jpg",
      "https://trustcarehealth.live/api/storage-proxy/patient_john_williams_b4e9e7f3.jpg",
    ]);
    expect(candidates).toContain("/assets/users/wallet-native-01.png");
  });
});

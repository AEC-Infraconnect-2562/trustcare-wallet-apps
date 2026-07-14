import { describe, expect, it } from "vitest";
import {
  getDemoWalletCards,
  walletDemoUsers,
  walletTestLoginUsers,
  walletTestLoginUsersForPortalCatalog,
} from "./demoData";
import {
  walletTestUserProfile,
  walletTestUserProfiles,
} from "./testUserProfiles";

describe("Wallet sandbox test-user profiles", () => {
  it("maps every Wallet login to a patient-only role and durable test scope", () => {
    expect(walletTestLoginUsers.length).toBe(walletTestUserProfiles.length);
    expect(new Set(walletTestLoginUsers.map((user) => user.id)).size).toBe(
      walletTestLoginUsers.length,
    );
    for (const user of walletTestLoginUsers) {
      const profile = walletTestUserProfile(user.id);
      expect(user.role).toBe("patient");
      expect(profile).toMatchObject({
        portalRole: "patient",
        dataScope: "holder_only",
        persistentState: true,
      });
      expect(profile?.functionScopes).toContain("portal_sync");
      expect(profile?.functionScopes).toContain("share_vp");
    }
    expect(walletDemoUsers.some((user) => user.role === "staff")).toBe(true);
    expect(walletTestLoginUsers.every((user) => user.role !== "staff")).toBe(
      true,
    );
  });

  it("matches the six Portal readiness-gap fixtures without inventing photos", () => {
    const expectedCardTypes = new Map([
      ["demo-patient-004", ["patient_identity", "consent_receipt"]],
      ["demo-patient-005", ["patient_identity", "allergy_alert"]],
      ["demo-patient-006", ["patient_identity"]],
      [
        "demo-patient-007",
        ["patient_identity", "allergy_alert", "medication_summary"],
      ],
      ["demo-patient-008", ["patient_identity", "patient_summary"]],
      ["demo-patient-009", ["patient_identity"]],
    ]);

    for (const [userId, cardTypes] of expectedCardTypes) {
      const user = walletDemoUsers.find((candidate) => candidate.id === userId);
      expect(user?.portalOpenId).toBe(userId);
      expect(user?.avatarUrl).toBe("");
      expect(getDemoWalletCards(userId).map((card) => card.cardType)).toEqual(
        cardTypes,
      );
      expect(JSON.stringify(getDemoWalletCards(userId))).not.toContain(
        '"portalOpenId"',
      );
      expect(
        JSON.stringify(
          getDemoWalletCards(userId).map((card) => card.credentialData),
        ),
      ).not.toContain('"patientId"');
      expect(walletTestUserProfile(userId)?.initialState).toBe("partial");
    }
  });

  it("uses the live Portal catalog as the production sandbox-login allowlist", () => {
    const users = walletTestLoginUsersForPortalCatalog([
      { username: "demo-patient-003" },
      { username: "portal-only-unknown" },
      { username: "partner-patient-001" },
    ]);

    expect(users.map((user) => user.id)).toEqual([
      "demo-patient-003",
      "partner-patient-001",
    ]);
    expect(
      walletTestUserProfile("demo-patient-complete-001")?.portalFixtureOpenId,
    ).toBeUndefined();
    expect(users.some((user) => user.id === "demo-patient-complete-001")).toBe(
      false,
    );
  });
});

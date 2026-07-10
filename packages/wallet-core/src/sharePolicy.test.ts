import { describe, expect, it } from "vitest";
import { resolveShareDisclosureIntent } from "./sharePolicy";

describe("share disclosure intent resolver", () => {
  it("fails closed to whole credentials when partial disclosure is unavailable", () => {
    const resolution = resolveShareDisclosureIntent({
      intent: "minimum_necessary",
      selectedFields: ["identity", "coverage"],
      credentials: [{ credentialId: "urn:vc:1" }, { credentialId: "urn:vc:2" }],
    });

    expect(resolution.disclosureMode).toBe("full");
    expect(resolution.mechanism).toBe("whole_credential");
    expect(resolution.selectedFields).toEqual(["full_vc"]);
    expect(resolution.requiresWholeDocumentConsent).toBe(true);
    expect(resolution.warnings[0]).toContain("เอกสาร 2 ใบ");
  });

  it("uses selective disclosure only when every credential and the recipient support it", () => {
    const resolution = resolveShareDisclosureIntent({
      intent: "custom_selection",
      selectedFields: ["identity", "identity", "coverage"],
      credentials: [
        {
          credentialId: "urn:vc:sd:1",
          canDeriveSelectiveDisclosure: true,
          recipientAcceptsSelectiveDisclosure: true,
        },
      ],
    });

    expect(resolution.disclosureMode).toBe("sd");
    expect(resolution.mechanism).toBe("sd_jwt_presentation");
    expect(resolution.selectedFields).toEqual(["identity", "coverage"]);
    expect(resolution.warnings).toEqual([]);
  });

  it("never selects a derived proof without an explicit predicate and capabilities", () => {
    const capability = {
      credentialId: "urn:vc:proof:1",
      canCreateDerivedProof: true,
      recipientAcceptsDerivedProof: true,
    };

    expect(
      resolveShareDisclosureIntent({
        intent: "minimum_necessary",
        selectedFields: ["age_over_18"],
        credentials: [capability],
      }).mechanism,
    ).toBe("whole_credential");
    expect(
      resolveShareDisclosureIntent({
        intent: "minimum_necessary",
        selectedFields: ["age_over_18"],
        credentials: [capability],
        predicateProofRequested: true,
      }).mechanism,
    ).toBe("derived_proof");
  });

  it("honors an explicit whole-document choice without a fallback warning", () => {
    const resolution = resolveShareDisclosureIntent({
      intent: "complete_documents",
      credentials: [{ credentialId: "urn:vc:1" }],
    });

    expect(resolution.selectedFields).toEqual(["full_vc"]);
    expect(resolution.requiresWholeDocumentConsent).toBe(false);
    expect(resolution.warnings).toEqual([]);
  });
});

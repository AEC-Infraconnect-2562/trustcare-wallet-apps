import { describe, expect, it } from "vitest";
import { demoWalletCards, extractSelectableFields, isExpired, parseTrustCareQr, sortIdentityFirst } from "../src";

describe("wallet-core", () => {
  it("sorts identity credentials first", () => {
    const sorted = sortIdentityFirst([...demoWalletCards].reverse());
    expect(sorted[0]?.cardType).toBe("patient_identity");
  });

  it("parses TrustCare VP URLs", () => {
    const parsed = parseTrustCareQr("https://trustcare.example.com/verifier?vp=vp_123");
    expect(parsed.kind).toBe("vp-url");
    expect(parsed.presentationId).toBe("vp_123");
  });

  it("rejects expired QR timestamps", () => {
    expect(isExpired("2026-01-01T00:00:00.000Z", new Date("2026-07-04T00:00:00.000Z"))).toBe(true);
  });

  it("extracts selective disclosure fields while hiding proof-like paths", () => {
    const fields = extractSelectableFields({
      credentialSubject: { patient: { name: "A", nationalId: "123" } },
      proof: { jwt: "secret" }
    });
    expect(fields.map(field => field.path)).toContain("credentialSubject.patient.name");
    expect(fields.some(field => field.path.includes("proof"))).toBe(false);
  });
});


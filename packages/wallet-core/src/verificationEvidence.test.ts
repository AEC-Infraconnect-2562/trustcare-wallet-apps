import { describe, expect, it } from "vitest";
import {
  assessVerificationEvidence,
  type LocallyVerifiedProof,
  type VerificationEvidenceV1,
  type VerificationSubject,
} from "./verificationEvidence";

const now = new Date("2026-07-10T10:00:00.000Z");
const subjects: VerificationSubject[] = [
  {
    role: "vp",
    digest: `sha256:${"a".repeat(64)}`,
    holderDid: "did:key:holder",
    validUntil: "2026-07-10T11:00:00.000Z",
  },
  {
    role: "vc",
    digest: `sha256:${"b".repeat(64)}`,
    issuerDid: "did:web:issuer.example",
    validUntil: "2026-07-10T11:00:00.000Z",
  },
];
const proofs: LocallyVerifiedProof[] = subjects.map((subject) => ({
  subjectDigest: subject.digest,
  verificationMethod:
    subject.role === "vp"
      ? "did:key:holder#key-1"
      : "did:web:issuer.example#key-1",
  controllerDid:
    subject.role === "vp" ? "did:key:holder" : "did:web:issuer.example",
  proofPurpose: subject.role === "vp" ? "authentication" : "assertionMethod",
}));
const packageDigest = `sha256:${"c".repeat(64)}` as const;
const contextDigest = `sha256:${"d".repeat(64)}` as const;

function completeEvidence(): VerificationEvidenceV1 {
  return {
    version: "1",
    providerId: "contract-hub:test",
    packageDigest,
    contextDigest,
    subjects,
    policy: { id: "purpose-share", version: "2026.07" },
    checkedAt: "2026-07-10T09:59:00.000Z",
    expiresAt: "2026-07-10T10:05:00.000Z",
    checks: ["proof", "issuer", "status", "expiry", "policy", "binding"].map(
      (key) => ({
        key: key as VerificationEvidenceV1["checks"][number]["key"],
        state: "pass" as const,
        subjectDigests: subjects.map((subject) => subject.digest),
        checkedAt: "2026-07-10T09:59:00.000Z",
        authority: "contract-hub:test",
      }),
    ),
  };
}

describe("verification evidence gate", () => {
  it("requires independent, digest-bound, current evidence for every check", () => {
    expect(
      assessVerificationEvidence({
        evidence: completeEvidence(),
        packageDigest,
        contextDigest,
        subjects,
        locallyVerifiedProofs: proofs,
        now,
      }),
    ).toMatchObject({ verified: true, trustLevel: "green" });
  });

  it.each([
    ["missing provider", null],
    [
      "context mismatch",
      {
        ...completeEvidence(),
        contextDigest: `sha256:${"e".repeat(64)}` as const,
      },
    ],
    [
      "expired evidence",
      { ...completeEvidence(), expiresAt: "2026-07-10T09:00:00.000Z" },
    ],
    [
      "missing status check",
      {
        ...completeEvidence(),
        checks: completeEvidence().checks.filter(
          (check) => check.key !== "status",
        ),
      },
    ],
  ])("keeps %s out of green", (_label, evidence) => {
    expect(
      assessVerificationEvidence({
        evidence,
        packageDigest,
        contextDigest,
        subjects,
        locallyVerifiedProofs: proofs,
        now,
      }).verified,
    ).toBe(false);
  });

  it("returns red for an explicit failure or expired artifact", () => {
    const evidence = completeEvidence();
    evidence.checks = evidence.checks.map((check) =>
      check.key === "issuer" ? { ...check, state: "fail" } : check,
    );
    expect(
      assessVerificationEvidence({
        evidence,
        packageDigest,
        contextDigest,
        subjects,
        locallyVerifiedProofs: proofs,
        now,
      }).trustLevel,
    ).toBe("red");
  });
});

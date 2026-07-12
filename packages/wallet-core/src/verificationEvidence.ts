export const VERIFICATION_EVIDENCE_VERSION = "1" as const;

export const REQUIRED_VERIFICATION_CHECK_KEYS = [
  "proof",
  "issuer",
  "status",
  "expiry",
  "policy",
  "binding",
] as const;

export type VerificationCheckKey =
  (typeof REQUIRED_VERIFICATION_CHECK_KEYS)[number];
export type VerificationCheckState = "pass" | "fail" | "indeterminate";
export type VerificationArtifactRole =
  "vc" | "vp" | "manifest_vc" | "manifest_vp";
export type Sha256Digest = `sha256:${string}`;

export type VerificationSubject = {
  role: VerificationArtifactRole;
  digest: Sha256Digest;
  issuerDid?: string;
  holderDid?: string;
  validUntil?: string;
  statusReference?: unknown;
};

export type LocallyVerifiedProof = {
  subjectDigest: Sha256Digest;
  verificationMethod: string;
  controllerDid: string;
  proofPurpose: "assertionMethod" | "authentication";
};

export type VerificationContext = {
  recipient?: string;
  purpose?: string;
  audience?: string | string[];
  selectedClaims?: string[];
  policyVersion?: string;
  access?: unknown;
};

export type VerificationEvidenceCheck = {
  key: VerificationCheckKey;
  state: VerificationCheckState;
  subjectDigests: Sha256Digest[];
  checkedAt: string;
  authority: string;
  detail?: string;
};

export type VerificationEvidenceV1 = {
  version: typeof VERIFICATION_EVIDENCE_VERSION;
  providerId: string;
  packageDigest: Sha256Digest;
  contextDigest: Sha256Digest;
  subjects: VerificationSubject[];
  policy: { id: string; version: string };
  checkedAt: string;
  expiresAt: string;
  checks: VerificationEvidenceCheck[];
};

export type VerificationEvidenceRequest = {
  subjects: VerificationSubject[];
  packageDigest: Sha256Digest;
  contextDigest: Sha256Digest;
  context: VerificationContext;
  locallyVerifiedProofs: LocallyVerifiedProof[];
  now: string;
};

/**
 * Provider-neutral boundary for TrustCare Portal, Contract Hub or another
 * governed trust service. Implementations must evaluate independently of the
 * artifact being verified; self-asserted issuer/status/policy flags are not
 * verification evidence.
 */
export interface VerificationEvidenceProvider {
  evaluate(
    request: VerificationEvidenceRequest,
  ): Promise<VerificationEvidenceV1>;
}

export type VerificationEvidenceAssessment = {
  verified: boolean;
  trustLevel: "green" | "yellow" | "red";
  passedChecks: VerificationCheckKey[];
  warnings: string[];
  errors: string[];
};

export function assessVerificationEvidence(input: {
  evidence?: VerificationEvidenceV1 | null;
  packageDigest: Sha256Digest;
  contextDigest: Sha256Digest;
  subjects: VerificationSubject[];
  locallyVerifiedProofs: LocallyVerifiedProof[];
  now?: Date;
}): VerificationEvidenceAssessment {
  const now = input.now ?? new Date();
  const warnings: string[] = [];
  const errors: string[] = [];
  const passedChecks: VerificationCheckKey[] = [];
  const evidence = input.evidence;
  const requiredDigests = unique(
    input.subjects.map((subject) => subject.digest),
  );

  for (const subject of input.subjects) {
    if (subject.validUntil && !isFuture(subject.validUntil, now)) {
      errors.push(`Artifact ${subject.digest} is expired.`);
    }
  }

  const locallyVerifiedDigests = new Set(
    input.locallyVerifiedProofs.map((proof) => proof.subjectDigest),
  );
  const locallyMissing = requiredDigests.filter(
    (digest) => !locallyVerifiedDigests.has(digest),
  );
  if (locallyMissing.length) {
    warnings.push(
      `Local proof verification is incomplete for ${locallyMissing.join(", ")}.`,
    );
  }

  if (!evidence) {
    warnings.push(
      "Independent issuer, status and policy verification evidence is unavailable.",
    );
    return assessment(false, warnings, errors, passedChecks);
  }
  if (evidence.version !== VERIFICATION_EVIDENCE_VERSION) {
    warnings.push(
      `Unsupported verification evidence version ${evidence.version}.`,
    );
  }
  if (!evidence.providerId.trim()) {
    warnings.push("Verification evidence has no provider identifier.");
  }
  if (!evidence.policy.id.trim() || !evidence.policy.version.trim()) {
    warnings.push("Verification evidence has no policy id/version.");
  }
  if (evidence.packageDigest !== input.packageDigest) {
    warnings.push(
      "Verification evidence does not match the artifact package digest.",
    );
  }
  if (evidence.contextDigest !== input.contextDigest) {
    warnings.push(
      "Verification evidence does not match the recipient/purpose context.",
    );
  }
  if (!isValidPastOrPresent(evidence.checkedAt, now)) {
    warnings.push(
      "Verification evidence has an invalid or future checkedAt value.",
    );
  }
  if (!isFuture(evidence.expiresAt, now)) {
    warnings.push("Verification evidence is expired.");
  }

  const evidenceDigests = new Set(
    evidence.subjects.map((subject) => subject.digest),
  );
  const missingSubjects = requiredDigests.filter(
    (digest) => !evidenceDigests.has(digest),
  );
  if (missingSubjects.length) {
    warnings.push(
      `Verification evidence does not cover ${missingSubjects.join(", ")}.`,
    );
  }

  for (const key of REQUIRED_VERIFICATION_CHECK_KEYS) {
    const checks = evidence.checks.filter((check) => check.key === key);
    const explicitFailure = checks.some((check) => check.state === "fail");
    if (explicitFailure) {
      errors.push(`Verification check ${key} failed.`);
      continue;
    }
    const coverageRequired = ["proof", "issuer", "status", "expiry"].includes(
      key,
    );
    const passed = checks.some(
      (check) =>
        check.state === "pass" &&
        isValidPastOrPresent(check.checkedAt, now) &&
        (!coverageRequired ||
          requiredDigests.every((digest) =>
            check.subjectDigests.includes(digest),
          )),
    );
    if (passed) passedChecks.push(key);
    else warnings.push(`Verification check ${key} is incomplete.`);
  }

  const structurallyBound =
    evidence.version === VERIFICATION_EVIDENCE_VERSION &&
    Boolean(evidence.providerId.trim()) &&
    Boolean(evidence.policy.id.trim()) &&
    Boolean(evidence.policy.version.trim()) &&
    evidence.packageDigest === input.packageDigest &&
    evidence.contextDigest === input.contextDigest &&
    isValidPastOrPresent(evidence.checkedAt, now) &&
    isFuture(evidence.expiresAt, now) &&
    missingSubjects.length === 0;
  const verified =
    structurallyBound &&
    errors.length === 0 &&
    locallyMissing.length === 0 &&
    passedChecks.length === REQUIRED_VERIFICATION_CHECK_KEYS.length &&
    warnings.length === 0;
  return assessment(verified, warnings, errors, passedChecks);
}

export function verificationEvidenceCheckPassed(
  assessment: VerificationEvidenceAssessment,
  key: VerificationCheckKey,
): boolean {
  return assessment.verified && assessment.passedChecks.includes(key);
}

function assessment(
  verified: boolean,
  warnings: string[],
  errors: string[],
  passedChecks: VerificationCheckKey[],
): VerificationEvidenceAssessment {
  return {
    verified,
    trustLevel: verified ? "green" : errors.length ? "red" : "yellow",
    passedChecks,
    warnings: unique(warnings),
    errors: unique(errors),
  };
}

function isValidPastOrPresent(value: string, now: Date): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function isFuture(value: string, now: Date): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

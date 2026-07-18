import { assertVerifierResult } from "@trustcare/contracts";
import {
  audienceSummary,
  assessVerificationEvidence,
  assessDataIntegrityProof,
  buildTrustCareJwksCandidateResult,
  credentialIssuerName as issuerName,
  documentTypesFromCredentials,
  extractCredentialJwt,
  extractPresentationJwt as extractJwtFromJson,
  firstCredentialIssuer as firstIssuer,
  jsonRecord as objectValue,
  jwksToKeys,
  keyMatchesKid,
  lastCredentialType,
  looksLikeJwt,
  parseJsonObject as parseJson,
  parseJwtPayload,
  parseOid4vcCredentialOffer,
  parseOid4vpRequest,
  parseShlLink,
  parseUrl,
  parseTrustCareQr,
  REQUIRED_VERIFICATION_CHECK_KEYS,
  sha256Hex,
  fetchShlManifest,
  resolveDemoResolverPayload,
  resolveDemoVpReferencePayload,
  splitJwtToken,
  stringOrUndefined,
  stringValue,
  unwrapVcPayload,
  unwrapVpPayload,
  validateOid4vpBinding,
  verifyDataIntegrityProof,
  verificationEvidenceCheckPassed,
  type LocallyVerifiedProof,
  type VerificationArtifactRole,
  type VerificationCheckKey,
  type VerificationContext,
  type VerificationEvidenceAssessment,
  type VerificationEvidenceProvider,
  type VerificationEvidenceV1,
  type VerificationSubject,
  type VerifierResult,
} from "@trustcare/wallet-core";
import {
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
} from "jose";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { usesDemoRuntime } from "./runtime";

export type VerifierApiOptions = TrustCareClientOptions & {
  verificationEvidenceProvider?: VerificationEvidenceProvider;
};

type ResolvedVpPayload = {
  id: string;
  payload: Record<string, any>;
  sourceUrl: string;
  warnings: string[];
  jwt?: string;
  jwtVerification?: JwtVerificationResult;
  nestedCredentialResults?: JwtVerificationResult[];
};

type JwtVerificationResult = {
  kind: "vp" | "vc";
  verified: boolean;
  alg?: string;
  kid?: string;
  jku?: string;
  disclosureCount?: number;
  issuer?: string;
  subject?: string;
  audience?: string;
  credentialId?: string;
  credentialType?: string;
  jwksUrl?: string;
  payload?: Record<string, any>;
  warnings: string[];
  errors: string[];
};

const verificationArtifactRoles = new Set<VerificationArtifactRole>([
  "vc",
  "vp",
  "manifest_vc",
]);
const verificationCheckKeys = new Set<string>(REQUIRED_VERIFICATION_CHECK_KEYS);

export async function verifyQr(
  options: VerifierApiOptions,
  qrData: string,
): Promise<VerifierResult> {
  return assertVerifierResult(
    await verifyQrUnsafe(options, qrData),
  ) as VerifierResult;
}

async function verifyQrUnsafe(
  options: VerifierApiOptions,
  qrData: string,
): Promise<VerifierResult> {
  const oid4vci = parseOid4vcCredentialOffer(qrData);
  if (oid4vci) {
    return {
      verified: false,
      trustLevel: "yellow",
      protocol: "oid4vci",
      issuer: oid4vci.issuer ?? oid4vci.credentialOfferUri ?? "OID4VCI issuer",
      requestSummary: `Credential offer: ${oid4vci.configurationIds.join(", ") || "metadata reference"}`,
      warnings: [
        "Credential offer parsed. Wallet must fetch issuer metadata over TLS and require user consent before storing any VC.",
      ],
      errors: [],
    };
  }
  const oid4vp = parseOid4vpRequest(qrData);
  if (oid4vp) {
    const binding = validateOid4vpBinding(oid4vp);
    return {
      verified: false,
      trustLevel: binding.ok ? "yellow" : "red",
      protocol: "oid4vp",
      issuer: oid4vp.verifier ?? "OID4VP verifier",
      requestSummary: `Requests ${oid4vp.requestedCredentialTypes.join(", ") || `${oid4vp.descriptorCount} descriptor(s)`}`,
      warnings: [
        "OID4VP request parsed. Select matching credentials and generate VP only after user consent.",
        ...binding.warnings,
      ],
      errors: binding.errors,
    };
  }
  const resolvedVp = await resolvePublishedVp(
    qrData,
    options.fetchImpl ?? fetch,
  );
  if (resolvedVp) {
    return verifyResolvedVpPayload(resolvedVp, options);
  }
  const demoReferencePayload = resolveDemoVpReferencePayload(qrData);
  if (demoReferencePayload?.kind === "vp") {
    return verifyResolvedVpPayload(
      {
        id: demoReferencePayload.id,
        payload: demoReferencePayload.payload,
        sourceUrl: qrData,
        warnings: [
          "Resolved deterministic TrustCare demo VP reference from the wallet seed dataset.",
        ],
      },
      options,
    );
  }
  const demoPayload = resolveDemoResolverPayload(qrData);
  if (demoPayload?.kind === "vp") {
    const payload = demoPayload.payload;
    const credentialCount = Array.isArray(payload.verifiableCredential)
      ? payload.verifiableCredential.length
      : 0;
    const dataIntegrity = assessDataIntegrityProof(payload);
    return {
      verified: false,
      trustLevel: credentialCount > 0 ? "yellow" : "red",
      protocol: "trustcare-vp",
      issuer: "TrustCare Wallet legacy demo resolver",
      holderDid:
        typeof payload.holder === "string" ? payload.holder : undefined,
      requestSummary: `VP ${demoPayload.id} / เอกสาร ${credentialCount} รายการ`,
      credentials: Array.isArray(payload.verifiableCredential)
        ? payload.verifiableCredential
        : [],
      verificationChecklist: [
        {
          key: "parsed",
          label: "อ่าน legacy VP resolver ได้",
          ok: true,
          detail: demoPayload.id,
        },
        {
          key: "holder",
          label: "มี Holder DID",
          ok: typeof payload.holder === "string",
          detail: String(payload.holder ?? "-"),
        },
        {
          key: "documents",
          label: "มีเอกสารที่เลือก",
          ok: credentialCount > 0,
          detail: String(credentialCount),
        },
        {
          key: "expiry",
          label: "มีวันหมดอายุ",
          ok: typeof payload.validUntil === "string",
          detail: String(payload.validUntil ?? "-"),
        },
        {
          key: "proof",
          label: "มี proof/signature ที่ตรวจสอบได้",
          ok: false,
          detail: dataIntegrity.present
            ? `${dataIntegrity.summary} present but not cryptographically verified`
            : "missing",
        },
      ],
      warnings: [
        "QR รูปแบบ legacy ที่ฝัง payload ใน URL ใช้ได้เฉพาะ backward compatibility เท่านั้น.",
        "ไม่ให้ green badge เพราะ legacy tc_payload ไม่ใช่ resolver-backed artifact ตาม production trust model.",
        ...dataIntegrity.warnings,
        ...(dataIntegrity.present
          ? [
              "พบ Data Integrity proof แต่ยังไม่ได้ verify cryptosuite/key material จริง จึงยังไม่ถือว่า verified.",
            ]
          : []),
        ...(!dataIntegrity.present
          ? [
              "ไม่ให้ green badge เพราะ VP ยังไม่มี proof/signature แบบ ES256/EdDSA/Data Integrity ที่ตรวจสอบได้.",
            ]
          : []),
      ],
      errors: credentialCount > 0 ? [] : ["VP ไม่มี verifiableCredential"],
    };
  }
  const directJwt = await verifyDirectJwtQr(
    qrData.trim(),
    options,
    options.fetchImpl ?? fetch,
  );
  if (directJwt) return directJwt;
  const shl = parseShlLink(qrData);
  if (shl) {
    const fetched = await fetchShlManifest(qrData, {
      recipient: "TrustCare Wallet Verifier",
      embeddedLengthMax: 2_000_000,
      expectedManifestOrigin: new URL(options.url).origin,
    });
    const passcodeMissing = shl.passcodeRequired && !fetched.ok;
    return {
      verified: false,
      trustLevel: fetched.ok || passcodeMissing ? "yellow" : "red",
      protocol: "shl",
      issuer: fetched.ok
        ? "SMART Health Links transport"
        : "SMART Health Links parser",
      requestSummary:
        fetched.ok
          ? `Standard SHL transport-valid / เอกสาร ${fetched.fileCount} รายการ`
          : "อ่าน SHL ได้ แต่ยังดึง manifest ไม่สำเร็จ",
      credentials: fetched.manifest ? [fetched.manifest] : [],
      verificationChecklist: [
        {
          key: "parsed",
          label: "อ่าน SHL QR ได้",
          ok: true,
          detail: shl.url ?? "-",
        },
        {
          key: "manifest",
          label: "ดึง manifest ได้",
          ok: fetched.ok,
          detail: fetched.requestMethod ?? "-",
        },
        {
          key: "transport_files",
          label: "ถอดรหัสไฟล์ SHL ได้",
          ok: fetched.ok,
          detail: `${fetched.decryptedFileCount}/${fetched.fileCount}`,
        },
        {
          key: "certification",
          label: "ตรวจหลักฐานการรับรองแยกต่างหาก",
          ok: false,
          detail: "requires Wallet Exchange Manifest VC and Holder VP association",
        },
      ],
      warnings: [
        ...fetched.warnings,
        ...(shl.passcodeRequired
          ? [
              "SHL นี้ต้องใช้ passcode โดย passcode ต้องส่งผ่านช่องทางแยกจาก QR.",
            ]
          : []),
        ...(fetched.ok
          ? [
              "Standard SHL เป็น transport เท่านั้น การรับรองต้องตรวจ Manifest VC และ Holder VP association ผ่าน Wallet Exchange แยกต่างหาก.",
            ]
          : []),
      ],
      errors: fetched.errors,
    };
  }
  if (usesDemoRuntime(options)) {
    const parsed = parseTrustCareQr(qrData);
    const isStandardShl = parsed.kind === "shlink";
    return {
      verified: false,
      trustLevel: isStandardShl
        ? "blue"
        : parsed.kind === "unknown" || parsed.kind === "json"
          ? "red"
          : "yellow",
      protocol:
        parsed.kind === "shlink"
          ? "shl"
          : parsed.kind === "jwt"
            ? "jwt"
            : parsed.kind === "json"
              ? "json"
              : parsed.kind === "unknown"
                ? "unknown"
                : "trustcare-vp",
      issuer:
        parsed.kind === "shlink"
          ? "SMART Health Link transport"
          : "TrustCare VP resolver",
      requestSummary: parsed.presentationId
        ? `Presentation ID ${parsed.presentationId}`
        : isStandardShl
          ? "อ่าน Standard SMART Health Link"
          : parsed.kind,
      warnings:
        parsed.kind === "shlink"
          ? [
              "อ่าน Standard SHL สำเร็จ; การรับรองของโรงพยาบาลต้องมี Manifest Credential และ holder VP ที่ตรวจ proof แหล่งที่มา hashes และ policy ครบ",
            ]
          : parsed.kind === "vp-url" || parsed.kind === "presentation-id"
            ? [
                "อ่านรูปแบบ VP resolver ได้ แต่ยัง fetch/verify payload ไม่สำเร็จ จึงยังไม่ให้ green badge.",
              ]
            : parsed.kind === "json"
              ? [
                  "Unsigned JSON is not a verifier artifact; use a signed direct VC/VP or a Standard SHL transport.",
                ]
            : [],
      errors:
        parsed.kind === "json"
          ? ["Unsigned JSON cannot be verified."]
          : parsed.kind === "unknown"
          ? ["QR code นี้ไม่ใช่รูปแบบ TrustCare VP ที่ระบบรู้จัก"]
          : [],
    };
  }
  return callTrpcProcedure<VerifierResult>(options, "verifier.verifyQrScan", {
    qrData,
    source: "camera",
  });
}

type ArtifactTrustInput = {
  role: VerificationArtifactRole;
  artifact: Record<string, unknown>;
  issuerDid?: string;
  holderDid?: string;
  validUntil?: string;
  statusReference?: unknown;
  localProof?: Omit<LocallyVerifiedProof, "subjectDigest">;
};

type ArtifactTrustEvaluation = {
  assessment: VerificationEvidenceAssessment;
  subjects: VerificationSubject[];
  locallyVerifiedProofs: LocallyVerifiedProof[];
  evidenceCheckedAt?: string;
};

async function evaluateArtifactTrust(
  options: VerifierApiOptions,
  artifacts: ArtifactTrustInput[],
  context: VerificationContext,
): Promise<ArtifactTrustEvaluation> {
  const subjects: VerificationSubject[] = await Promise.all(
    artifacts.map(async (artifact) => ({
      role: artifact.role,
      digest: await sha256Digest(artifact.artifact),
      issuerDid: artifact.issuerDid,
      holderDid: artifact.holderDid,
      validUntil: artifact.validUntil,
      statusReference: artifact.statusReference,
    })),
  );
  const locallyVerifiedProofs = artifacts.flatMap((artifact, index) =>
    artifact.localProof
      ? [
          {
            ...artifact.localProof,
            subjectDigest: subjects[index].digest,
          },
        ]
      : [],
  );
  const packageDigest = await sha256Digest(
    subjects.map(({ role, digest, issuerDid, holderDid, validUntil }) => ({
      role,
      digest,
      issuerDid,
      holderDid,
      validUntil,
    })),
  );
  const contextDigest = await sha256Digest(context);
  let evidence: VerificationEvidenceV1 | null = null;
  let providerWarning: string | undefined;
  if (options.verificationEvidenceProvider) {
    try {
      evidence = await options.verificationEvidenceProvider.evaluate({
        subjects,
        packageDigest,
        contextDigest,
        context,
        locallyVerifiedProofs,
        now: new Date().toISOString(),
      });
    } catch (error) {
      providerWarning =
        error instanceof Error
          ? `Verification evidence provider failed: ${error.message}`
          : "Verification evidence provider failed.";
    }
  }
  const assessed = assessVerificationEvidence({
    evidence,
    packageDigest,
    contextDigest,
    subjects,
    locallyVerifiedProofs,
  });
  return {
    assessment: providerWarning
      ? { ...assessed, warnings: [...assessed.warnings, providerWarning] }
      : assessed,
    subjects,
    locallyVerifiedProofs,
    evidenceCheckedAt: evidence?.checkedAt,
  };
}

async function sha256Digest(value: unknown) {
  return `sha256:${await sha256Hex(value)}` as const;
}

function localDataIntegrityProof(
  proof:
    | {
        verified: boolean;
        verificationMethod?: string;
        proofPurpose?: string;
      }
    | undefined,
  expectedControllerDid: string | undefined,
  proofPurpose: "assertionMethod" | "authentication",
): Omit<LocallyVerifiedProof, "subjectDigest"> | undefined {
  if (
    !proof?.verified ||
    !proof.verificationMethod ||
    !expectedControllerDid ||
    proof.proofPurpose !== proofPurpose ||
    controllerDid(proof.verificationMethod) !== expectedControllerDid
  ) {
    return undefined;
  }
  return {
    verificationMethod: proof.verificationMethod,
    controllerDid: expectedControllerDid,
    proofPurpose,
  };
}

function evidenceChecklistItem(
  assessment: VerificationEvidenceAssessment,
  key: VerificationCheckKey,
  label: string,
) {
  const passed = verificationEvidenceCheckPassed(assessment, key);
  return {
    key: `evidence_${key}`,
    label,
    ok: passed,
    detail: passed
      ? "verified by independent evidence provider"
      : (assessment.errors.find((error) => error.includes(key)) ??
        assessment.warnings.find((warning) => warning.includes(key)) ??
        "independent verification evidence unavailable"),
  };
}

function localJwtProof(
  verification: JwtVerificationResult | undefined,
  expectedControllerDid: string | undefined,
  proofPurpose: "assertionMethod" | "authentication",
): Omit<LocallyVerifiedProof, "subjectDigest"> | undefined {
  if (
    !verification?.verified ||
    !verification.kid ||
    !expectedControllerDid ||
    controllerDid(verification.kid) !== expectedControllerDid
  ) {
    return undefined;
  }
  return {
    verificationMethod: verification.kid,
    controllerDid: expectedControllerDid,
    proofPurpose,
  };
}

function controllerDid(verificationMethod: string): string | undefined {
  return verificationMethod.startsWith("did:")
    ? verificationMethod.split("#")[0]
    : undefined;
}

function artifactIssuerDid(
  artifact: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!artifact) return undefined;
  if (typeof artifact.issuer === "string") return artifact.issuer;
  return stringOrUndefined(objectValue(artifact.issuer)?.id);
}

function artifactSubjectDid(
  artifact: Record<string, unknown> | null | undefined,
): string | undefined {
  return stringOrUndefined(objectValue(artifact?.credentialSubject)?.id);
}

function artifactValidUntil(
  artifact: Record<string, unknown> | null | undefined,
): string | undefined {
  return stringOrUndefined(artifact?.validUntil ?? artifact?.expirationDate);
}

async function resolvePublishedVp(
  qrData: string,
  fetcher: typeof fetch,
): Promise<ResolvedVpPayload | null> {
  const directJson = parseJson(qrData);
  const directVp = unwrapVpPayload(directJson);
  if (directVp) {
    return {
      id: stringValue(directVp.id, "inline-json-vp"),
      payload: directVp,
      sourceUrl: "inline-json",
      warnings: [],
    };
  }

  const url = parseUrl(qrData);
  if (!url || !looksLikeVpResolverUrl(url)) return null;

  const candidates = buildVpResolverCandidates(url);
  for (const candidate of candidates) {
    const resolved = await fetchJsonVp(candidate, fetcher);
    if (resolved) return resolved;
  }
  return null;
}

function buildVpResolverCandidates(url: URL): string[] {
  const candidates = new Set<string>();
  candidates.add(url.toString());
  const presentationId =
    url.searchParams.get("vp") ?? url.searchParams.get("presentationId");
  const gatewayBase = url.searchParams.get("gateway");
  if (presentationId && gatewayBase) {
    candidates.add(
      `${gatewayBase.replace(/\/$/, "")}/presentations/${encodeURIComponent(presentationId)}.jwt`,
    );
    candidates.add(
      `${gatewayBase.replace(/\/$/, "")}/presentations/${encodeURIComponent(presentationId)}.json`,
    );
  }
  if (
    presentationId &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  ) {
    candidates.add(
      `${url.origin}/api/share-gateway/presentations/${encodeURIComponent(presentationId)}.jwt`,
    );
    candidates.add(
      `${url.origin}/api/share-gateway/presentations/${encodeURIComponent(presentationId)}.json`,
    );
  }
  if (url.pathname.includes("/verify") && presentationId) {
    candidates.add(
      `${url.origin}/api/share-gateway/presentations/${encodeURIComponent(presentationId)}.jwt`,
    );
    candidates.add(
      `${url.origin}/api/share-gateway/presentations/${encodeURIComponent(presentationId)}.json`,
    );
  }
  return Array.from(candidates);
}

async function fetchJsonVp(
  url: string,
  fetcher: typeof fetch,
): Promise<ResolvedVpPayload | null> {
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        accept:
          "application/vp+jwt, application/jwt;q=0.9, application/vp+json, application/json;q=0.8",
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (contentType.includes("text/html") || text.trim().startsWith("<"))
      return null;
    const jwtText = text.trim();
    if (looksLikeJwt(jwtText)) {
      const verification = await verifyJwtArtifact(jwtText, "vp", fetcher, url);
      const vp =
        unwrapVpPayload(verification.payload) ?? parseJwtPayload(jwtText) ?? {};
      const nestedCredentialResults = await verifyNestedCredentialJwts(
        vp,
        fetcher,
        url,
      );
      return {
        id: stringValue(vp.id, url),
        payload: vp,
        sourceUrl: url,
        jwt: jwtText,
        jwtVerification: verification,
        nestedCredentialResults,
        warnings: [
          ...verification.warnings,
          ...nestedCredentialResults.flatMap((result) => result.warnings),
        ],
      };
    }
    const json = parseJson(text);
    const jsonJwt = extractJwtFromJson(json);
    if (jsonJwt) {
      const verification = await verifyJwtArtifact(jsonJwt, "vp", fetcher, url);
      const vp =
        unwrapVpPayload(verification.payload) ?? parseJwtPayload(jsonJwt) ?? {};
      const nestedCredentialResults = await verifyNestedCredentialJwts(
        vp,
        fetcher,
        url,
      );
      return {
        id: stringValue(vp.id, url),
        payload: vp,
        sourceUrl: url,
        jwt: jsonJwt,
        jwtVerification: verification,
        nestedCredentialResults,
        warnings: [
          ...verification.warnings,
          ...nestedCredentialResults.flatMap((result) => result.warnings),
        ],
      };
    }
    const vp = unwrapVpPayload(json);
    if (!vp) return null;
    return {
      id: stringValue(vp.id, url),
      payload: vp,
      sourceUrl: url,
      warnings: [],
    };
  } catch {
    return null;
  }
}

async function verifyDirectJwtQr(
  jwt: string,
  options: VerifierApiOptions,
  fetcher: typeof fetch,
): Promise<VerifierResult | null> {
  if (!looksLikeJwt(jwt)) return null;
  const decodedPayload = parseJwtPayload(jwt) ?? {};
  const directVp = unwrapVpPayload(decodedPayload);
  if (directVp) {
    const verification = await verifyJwtArtifact(
      jwt,
      "vp",
      fetcher,
      "inline-jwt",
    );
    const vp = unwrapVpPayload(verification.payload) ?? directVp;
    const nestedCredentialResults = await verifyNestedCredentialJwts(
      vp,
      fetcher,
      "inline-jwt",
    );
    return verifyResolvedVpPayload(
      {
        id: stringValue(vp.id, verification.credentialId ?? "inline-vp-jwt"),
        payload: vp,
        sourceUrl: "inline-jwt",
        jwt,
        jwtVerification: verification,
        nestedCredentialResults,
        warnings: [
          ...verification.warnings,
          ...nestedCredentialResults.flatMap((result) => result.warnings),
        ],
      },
      options,
    );
  }

  const directVc = unwrapVcPayload(decodedPayload);
  if (!directVc) return null;
  const verification = await verifyJwtArtifact(
    jwt,
    "vc",
    fetcher,
    "inline-jwt",
  );
  const vc = unwrapVcPayload(verification.payload) ?? directVc;
  return buildDirectVcVerifierResult(jwt, vc, verification, options);
}

async function buildDirectVcVerifierResult(
  jwt: string,
  vc: Record<string, any>,
  verification: JwtVerificationResult,
  options: VerifierApiOptions,
): Promise<VerifierResult> {
  const expiresAt = artifactValidUntil(vc);
  const notExpired = !expiresAt || Date.parse(expiresAt) > Date.now();
  const issuerDid = artifactIssuerDid(vc) ?? verification.issuer;
  const holderDid = artifactSubjectDid(vc) ?? verification.subject;
  const localProof = localJwtProof(verification, issuerDid, "assertionMethod");
  const evidence = await evaluateArtifactTrust(
    options,
    [
      {
        role: "vc",
        artifact: vc,
        issuerDid,
        holderDid,
        validUntil: expiresAt,
        statusReference: vc.credentialStatus,
        localProof,
      },
    ],
    {
      recipient: stringOrUndefined(vc.recipient),
      purpose: stringOrUndefined(vc.purpose),
      audience: verification.audience,
      policyVersion: stringOrUndefined(
        objectValue(vc.trustcare)?.policyVersion,
      ),
    },
  );
  const verified =
    Boolean(localProof) && notExpired && evidence.assessment.verified;
  const trustLevel = verified
    ? "green"
    : !localProof || !notExpired || evidence.assessment.trustLevel === "red"
      ? "red"
      : "yellow";
  const credentialType =
    lastCredentialType(vc) ??
    verification.credentialType ??
    "VerifiableCredential";
  const issuer = issuerName(vc) ?? verification.issuer ?? "Signed credential";
  const subject = objectValue(vc.credentialSubject);
  const subjectName =
    stringOrUndefined(subject?.name) ??
    stringOrUndefined(objectValue(subject?.patient)?.fullNameEn) ??
    stringOrUndefined(objectValue(subject?.patient)?.fullNameTh) ??
    stringOrUndefined(objectValue(subject?.staff)?.fullNameEn) ??
    stringOrUndefined(objectValue(subject?.staff)?.fullNameTh);
  return {
    verified,
    trustLevel,
    protocol: "trustcare-vc",
    issuer,
    holderDid: stringOrUndefined(subject?.id) ?? verification.subject,
    requestSummary: `${credentialType} / ${verification.credentialId ?? vc.id ?? "signed credential"}`,
    matchedCredentialIds: [
      String(verification.credentialId ?? vc.id ?? ""),
    ].filter(Boolean),
    credentials: [vc],
    verificationChecklist: [
      {
        key: "jwt",
        label: "อ่าน VC JWT ได้",
        ok: true,
        detail: `${verification.alg ?? "-"} / ${verification.kid ?? "-"}`,
      },
      {
        key: "signature",
        label: "Signature status",
        ok: Boolean(localProof),
        detail: localProof
          ? `verified via ${verification.jwksUrl ?? verification.jku ?? "-"}`
          : verification.verified
            ? "Signature is valid but the key controller does not match the declared issuer."
            : verification.errors.join(" "),
      },
      {
        key: "schema",
        label: "Schema and claims",
        ok: Boolean(credentialType),
        detail: credentialType,
      },
      {
        key: "subject",
        label: "Subject",
        ok: Boolean(subject),
        detail: subjectName ?? stringOrUndefined(subject?.id) ?? "-",
      },
      {
        key: "expiry",
        label: "ยังไม่หมดอายุ",
        ok: notExpired,
        detail: expiresAt ?? "-",
      },
      evidenceChecklistItem(evidence.assessment, "issuer", "ตรวจผู้ออกเอกสาร"),
      evidenceChecklistItem(evidence.assessment, "status", "ตรวจสถานะล่าสุด"),
      evidenceChecklistItem(
        evidence.assessment,
        "policy",
        "ตรวจนโยบายการใช้งาน",
      ),
      evidenceChecklistItem(
        evidence.assessment,
        "binding",
        "ตรวจผู้รับและวัตถุประสงค์",
      ),
    ],
    warnings: [
      ...verification.warnings,
      ...verification.errors,
      ...(!notExpired ? ["VC หมดอายุแล้ว"] : []),
      ...evidence.assessment.warnings,
    ],
    errors: [
      ...(!localProof ? verification.errors : []),
      ...(!notExpired ? ["VC หมดอายุแล้ว"] : []),
      ...evidence.assessment.errors,
    ],
    verificationPayload: {
      trustLevel,
      verified,
      issuer,
      holderDid,
      credentials: [vc],
      jwt,
      evidenceAssessment: evidence.assessment,
    },
  };
}

async function verifyResolvedVpPayload(
  resolved: ResolvedVpPayload,
  options: VerifierApiOptions,
): Promise<VerifierResult> {
  const fetcher = options.fetchImpl ?? fetch;
  const payload = resolved.payload;
  const rawCredentials = Array.isArray(payload.verifiableCredential)
    ? payload.verifiableCredential
    : [];
  const nestedResults = resolved.nestedCredentialResults ?? [];
  const credentials = nestedResults.length
    ? nestedResults
        .map(
          (result) =>
            unwrapVcPayload(result.payload) ??
            result.payload ??
            result.credentialId ??
            "credential",
        )
        .filter(Boolean)
    : rawCredentials;
  const credentialCount = credentials.length;
  const holderDid = stringOrUndefined(payload.holder);
  const dataIntegrity = await verifyDataIntegrityProof(payload, {
    fetcher,
    expectedProofPurpose: "authentication",
  });
  const jwtSignerDid = resolved.jwtVerification?.verified
    ? resolved.jwtVerification.issuer
    : undefined;
  const dataIntegritySignerDid = dataIntegrity.verified
    ? controllerDid(dataIntegrity.verificationMethod ?? "")
    : undefined;
  const vpSignerDid = jwtSignerDid ?? dataIntegritySignerDid;
  const vpLocalProof =
    localJwtProof(resolved.jwtVerification, jwtSignerDid, "authentication") ??
    localDataIntegrityProof(
      dataIntegrity,
      dataIntegritySignerDid,
      "authentication",
    );
  const credentialArtifacts = credentials.map(
    (credential) => objectValue(credential) ?? { id: String(credential) },
  );
  const credentialDataIntegrity = nestedResults.length
    ? []
    : await Promise.all(
        credentialArtifacts.map((credential) =>
          verifyDataIntegrityProof(credential, {
            fetcher,
            expectedProofPurpose: "assertionMethod",
            expectedControllerDid: artifactIssuerDid(credential),
          }),
        ),
      );
  const credentialInputs: ArtifactTrustInput[] = credentialArtifacts.map(
    (credential, index) => {
      const issuerDid =
        artifactIssuerDid(credential) ?? nestedResults[index]?.issuer;
      const localProof = nestedResults.length
        ? localJwtProof(nestedResults[index], issuerDid, "assertionMethod")
        : localDataIntegrityProof(
            credentialDataIntegrity[index],
            issuerDid,
            "assertionMethod",
          );
      return {
        role: "vc",
        artifact: credential,
        issuerDid,
        holderDid: artifactSubjectDid(credential),
        validUntil: artifactValidUntil(credential),
        statusReference: credential.credentialStatus,
        localProof,
      };
    },
  );
  const nestedCredentialVerified =
    credentialInputs.length > 0 &&
    credentialInputs.every((credential) => Boolean(credential.localProof));
  const purpose = stringOrUndefined(payload.purpose);
  const recipient = stringOrUndefined(payload.recipient);
  const audience = resolved.jwtVerification?.audience;
  const purposeBound = Boolean(purpose && (recipient || audience));
  const evidence = await evaluateArtifactTrust(
    resolvedVpEvidenceOptions(options, resolved),
    [
      {
        role: "vp",
        artifact: payload,
        issuerDid: vpSignerDid,
        holderDid,
        validUntil: artifactValidUntil(payload),
        localProof: vpLocalProof,
      },
      ...credentialInputs,
    ],
    {
      recipient,
      purpose,
      audience,
      selectedClaims: Array.isArray(payload.selectedFields)
        ? payload.selectedFields.map(String)
        : undefined,
      policyVersion: stringOrUndefined(
        objectValue(payload.trustcare)?.policyVersion,
      ),
    },
  );
  const hasVerifiedProof = Boolean(vpLocalProof);
  const notExpired =
    !payload.validUntil || Date.parse(String(payload.validUntil)) > Date.now();
  const verified =
    credentialCount > 0 &&
    hasVerifiedProof &&
    nestedCredentialVerified &&
    notExpired &&
    purposeBound &&
    evidence.assessment.verified;
  const explicitProofFailure = Boolean(
    (resolved.jwt && !resolved.jwtVerification?.verified) ||
    (dataIntegrity.present && !dataIntegrity.verified) ||
    nestedResults.some((result) => !result.verified) ||
    credentialDataIntegrity.some(
      (result) => result.present && !result.verified,
    ),
  );
  const trustLevel = verified
    ? "green"
    : credentialCount === 0 ||
        !notExpired ||
        explicitProofFailure ||
        evidence.assessment.trustLevel === "red"
      ? "red"
      : "yellow";
  const issuer =
    firstIssuer(credentials) ??
    resolved.jwtVerification?.issuer ??
    (hasVerifiedProof
      ? "TrustCare signed VP resolver"
      : "TrustCare VP resolver");
  return {
    verified,
    trustLevel,
    protocol: "trustcare-vp",
    issuer,
    holderDid,
    requestSummary: `VP ${resolved.id} / เอกสาร ${credentialCount} รายการ`,
    credentials,
    verificationChecklist: [
      {
        key: "resolver",
        label: "ดึง VP จาก resolver URL ได้",
        ok: true,
        detail: resolved.sourceUrl,
      },
      {
        key: "signature",
        label: "Signature status",
        ok: hasVerifiedProof,
        detail: resolved.jwtVerification?.verified
          ? `ES256 / ${resolved.jwtVerification?.kid ?? "-"}`
          : dataIntegrity.verified
            ? `${dataIntegrity.cryptosuite ?? "Data Integrity"} / ${dataIntegrity.verificationMethod ?? "-"}`
            : dataIntegrity.present
              ? dataIntegrity.errors?.join(" ") ||
                `${dataIntegrity.summary} present but not cryptographically verified`
              : "missing",
      },
      {
        key: "data_integrity",
        label: "Data Integrity proof",
        ok: dataIntegrity.verified,
        detail: dataIntegrity.present
          ? dataIntegrity.verified
            ? `verified via ${dataIntegrity.jwksUrl ?? dataIntegrity.verificationMethod ?? "-"}`
            : dataIntegrity.errors?.join(" ") || "not verified"
          : "not present",
      },
      {
        key: "issuer_key",
        label: "Issuer key resolved",
        ok: hasVerifiedProof,
        detail:
          resolved.jwtVerification?.jwksUrl ??
          resolved.jwtVerification?.jku ??
          dataIntegrity.jwksUrl ??
          dataIntegrity.verificationMethod ??
          "-",
      },
      {
        key: "holder",
        label: "มี Holder DID",
        ok: typeof payload.holder === "string",
        detail: String(payload.holder ?? "-"),
      },
      {
        key: "documents",
        label: "มี Verifiable Credential",
        ok: credentialCount > 0,
        detail: String(credentialCount),
      },
      {
        key: "nested_vc",
        label: "ตรวจ nested VC JWT",
        ok: nestedCredentialVerified,
        detail: `${credentialInputs.filter((credential) => credential.localProof).length}/${credentialInputs.length}`,
      },
      {
        key: "expiry",
        label: "ยังไม่หมดอายุ",
        ok: notExpired,
        detail: String(payload.validUntil ?? "-"),
      },
      {
        key: "schema",
        label: "Schema and claims",
        ok: credentialCount > 0,
        detail: documentTypesFromCredentials(credentials).join(", ") || "-",
      },
      {
        key: "purpose",
        label: "Consent and audience",
        ok: purposeBound,
        detail: String(
          payload.purpose ?? resolved.jwtVerification?.audience ?? "-",
        ),
      },
      evidenceChecklistItem(evidence.assessment, "issuer", "ตรวจผู้ออกเอกสาร"),
      evidenceChecklistItem(evidence.assessment, "status", "ตรวจสถานะล่าสุด"),
      evidenceChecklistItem(
        evidence.assessment,
        "policy",
        "ตรวจนโยบายการใช้งาน",
      ),
      evidenceChecklistItem(
        evidence.assessment,
        "binding",
        "ตรวจผู้รับและวัตถุประสงค์",
      ),
    ],
    warnings: [
      ...resolved.warnings,
      ...(resolved.jwtVerification?.errors?.length
        ? resolved.jwtVerification.errors
        : []),
      ...nestedResults.flatMap((result) =>
        result.errors.map(
          (error) =>
            `Nested VC ${result.credentialId ?? result.kid ?? ""}: ${error}`,
        ),
      ),
      ...dataIntegrity.warnings,
      ...(dataIntegrity.errors ?? []),
      ...(!hasVerifiedProof
        ? [
            "VP resolver ดึง payload ได้แล้ว แต่ยังไม่มี ES256/EdDSA/Data Integrity proof ที่ตรวจสอบได้ จึงยังไม่ให้ green badge.",
          ]
        : []),
      ...(resolved.jwt && !nestedCredentialVerified
        ? [
            "VP JWT ตรวจได้ แต่ nested VC ยังตรวจไม่ครบ จึงยังไม่ให้ green badge.",
          ]
        : []),
      ...(!notExpired ? ["VP หมดอายุแล้ว"] : []),
      ...(!purposeBound
        ? ["VP ยังไม่มีวัตถุประสงค์และผู้รับ/audience ที่ผูกอยู่ในหลักฐาน."]
        : []),
      ...evidence.assessment.warnings,
    ],
    errors: [
      ...(credentialCount > 0 ? [] : ["VP ไม่มี verifiableCredential"]),
      ...(!notExpired ? ["VP หมดอายุแล้ว"] : []),
      ...evidence.assessment.errors,
    ],
    verificationPayload: {
      trustLevel,
      verified,
      presentationId: resolved.id,
      holderDid,
      purpose,
      recipient,
      audience,
      validFrom: stringOrUndefined(payload.validFrom),
      validUntil: stringOrUndefined(payload.validUntil),
      selectedFields: Array.isArray(payload.selectedFields)
        ? payload.selectedFields.map(String)
        : undefined,
      credentials,
      evidenceAssessment: evidence.assessment,
    },
  };
}

function resolvedVpEvidenceOptions(
  options: VerifierApiOptions,
  resolved: ResolvedVpPayload,
): VerifierApiOptions {
  if (options.verificationEvidenceProvider) return options;
  const endpoint = shareGatewayEvidenceEndpoint(resolved.sourceUrl);
  if (!endpoint) return options;
  return {
    ...options,
    verificationEvidenceProvider: shareGatewayEvidenceProvider({
      endpoint,
      artifactId: resolved.id,
      fetcher: options.fetchImpl ?? fetch,
    }),
  };
}

function shareGatewayEvidenceEndpoint(sourceUrl: string): string | null {
  const url = parseUrl(sourceUrl);
  if (!url) return null;
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !localHttp) return null;
  const gatewayPath = "/api/share-gateway";
  const gatewayIndex = url.pathname.indexOf(gatewayPath);
  if (
    gatewayIndex < 0 ||
    !url.pathname
      .slice(gatewayIndex + gatewayPath.length)
      .startsWith("/presentations/")
  ) {
    return null;
  }
  const basePath = url.pathname.slice(0, gatewayIndex + gatewayPath.length);
  return `${url.origin}${basePath}/verification-evidence`;
}

function shareGatewayEvidenceProvider(input: {
  endpoint: string;
  artifactId: string;
  fetcher: typeof fetch;
}): VerificationEvidenceProvider {
  return {
    async evaluate(request) {
      const vpSubject = request.subjects.find(
        (subject) => subject.role === "vp",
      );
      const fetcher = input.fetcher;
      const response = await fetcher(input.endpoint, {
        method: "POST",
        credentials: "omit",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          artifactId: input.artifactId,
          request: {
            purpose: request.context.purpose,
            recipient: request.context.recipient,
            audience: Array.isArray(request.context.audience)
              ? request.context.audience[0]
              : request.context.audience,
            subjectDigest: vpSubject?.digest,
            packageDigest: request.packageDigest,
            contextDigest: request.contextDigest,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          verificationEvidenceError(payload) ||
            `Share Gateway evidence request failed (${response.status}).`,
        );
      }
      return parseVerificationEvidence(payload);
    },
  };
}

function verificationEvidenceError(value: unknown): string | null {
  const record = objectValue(value);
  if (!record) return null;
  const errors = Array.isArray(record.errors)
    ? record.errors.filter(
        (error): error is string =>
          typeof error === "string" && Boolean(error.trim()),
      )
    : [];
  if (errors.length) return errors.join(" ");
  return stringOrUndefined(record.message ?? record.detail) ?? null;
}

function parseVerificationEvidence(value: unknown): VerificationEvidenceV1 {
  const evidence = objectValue(value);
  const policy = objectValue(evidence?.policy);
  const subjects = Array.isArray(evidence?.subjects) ? evidence.subjects : null;
  const checks = Array.isArray(evidence?.checks) ? evidence.checks : null;
  const validSubjects =
    subjects?.every((subject) => {
      const record = objectValue(subject);
      return Boolean(
        record &&
        verificationArtifactRoles.has(
          record.role as VerificationArtifactRole,
        ) &&
        isSha256Digest(record.digest),
      );
    }) ?? false;
  const validChecks =
    checks?.every((check) => {
      const record = objectValue(check);
      return Boolean(
        record &&
        verificationCheckKeys.has(String(record.key ?? "")) &&
        ["pass", "fail", "indeterminate"].includes(
          String(record.state ?? ""),
        ) &&
        Array.isArray(record.subjectDigests) &&
        record.subjectDigests.every(isSha256Digest) &&
        stringOrUndefined(record.checkedAt) &&
        stringOrUndefined(record.authority),
      );
    }) ?? false;
  if (
    !evidence ||
    evidence.version !== "1" ||
    !stringOrUndefined(evidence.providerId) ||
    !isSha256Digest(evidence.packageDigest) ||
    !isSha256Digest(evidence.contextDigest) ||
    !stringOrUndefined(evidence.checkedAt) ||
    !stringOrUndefined(evidence.expiresAt) ||
    !policy ||
    !stringOrUndefined(policy.id) ||
    !stringOrUndefined(policy.version) ||
    !validSubjects ||
    !validChecks
  ) {
    throw new Error("Share Gateway returned malformed verification evidence.");
  }
  return evidence as VerificationEvidenceV1;
}

function isSha256Digest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function looksLikeVpResolverUrl(url: URL): boolean {
  return Boolean(
    url.searchParams.get("vp") ||
    url.searchParams.get("presentationId") ||
    url.pathname.includes("/presentations/") ||
    url.pathname.includes("/verify") ||
    url.pathname.includes("/verifier"),
  );
}

async function verifyNestedCredentialJwts(
  vp: Record<string, any>,
  fetcher: typeof fetch,
  sourceUrl: string,
): Promise<JwtVerificationResult[]> {
  const credentials = Array.isArray(vp.verifiableCredential)
    ? vp.verifiableCredential
    : [];
  const jwtCredentials = credentials
    .map(extractCredentialJwt)
    .filter((jwt): jwt is string => Boolean(jwt));
  const results: JwtVerificationResult[] = [];
  for (const jwt of jwtCredentials) {
    results.push(await verifyJwtArtifact(jwt, "vc", fetcher, sourceUrl));
  }
  return results;
}

async function verifyJwtArtifact(
  jwt: string,
  kind: "vp" | "vc",
  fetcher: typeof fetch,
  sourceUrl: string,
): Promise<JwtVerificationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const token = splitJwtToken(jwt);
  if (!token) {
    return {
      kind,
      verified: false,
      warnings,
      errors: ["JWT decode failed."],
    };
  }
  if (token.disclosures.length > 0) {
    warnings.push(
      `SD-JWT-VC มี disclosure ${token.disclosures.length} รายการ; Wallet ตรวจลายเซ็น issuer JWT และส่ง token เต็มให้ Portal cross-check.`,
    );
  }
  let header: Record<string, any> = {};
  let decodedPayload: Record<string, any> = {};
  try {
    header = decodeProtectedHeader(token.issuerJwt) as Record<string, any>;
    decodedPayload = decodeJwt(token.issuerJwt) as Record<string, any>;
  } catch (error) {
    return {
      kind,
      verified: false,
      warnings,
      errors: [error instanceof Error ? error.message : "JWT decode failed."],
    };
  }

  const alg = typeof header.alg === "string" ? header.alg : undefined;
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  const jku = typeof header.jku === "string" ? header.jku : undefined;
  const issuer = stringOrUndefined(decodedPayload.iss);
  const portalHospitalCredential =
    kind === "vc" && isPortalHospitalIssuerDid(issuer);
  if (alg !== "ES256" && alg !== "EdDSA") {
    errors.push(
      `JWT alg ${alg ?? "-"} is not supported; production TrustCare verification only accepts ES256 or EdDSA.`,
    );
  }
  if (!kid) errors.push("JWT header has no kid.");
  if (portalHospitalCredential) {
    const credential = unwrapVcPayload(decodedPayload);
    const credentialIssuer = artifactIssuerDid(credential);
    if (alg !== "ES256") {
      errors.push("Portal hospital credential JWTs must use ES256.");
    }
    if (
      !kid ||
      controllerDid(kid) !== issuer ||
      !kid.startsWith(`${issuer}#`)
    ) {
      errors.push(
        "Portal hospital credential kid is not controlled by its declared issuer DID.",
      );
    }
    if (credentialIssuer && credentialIssuer !== issuer) {
      errors.push(
        "Portal hospital credential issuer does not match the JWT issuer claim.",
      );
    }
  }

  if (errors.length > 0) {
    return failedJwtVerification({
      kind,
      alg,
      kid,
      jku,
      token,
      payload: decodedPayload,
      warnings,
      errors,
    });
  }
  const verificationAlg = alg as "ES256" | "EdDSA";

  const jwksCandidateResult = buildTrustCareJwksCandidateResult({
    header,
    payload: decodedPayload,
    sourceUrl,
    issuerBound: portalHospitalCredential,
  });
  warnings.push(...jwksCandidateResult.warnings);
  const jwksCandidates = jwksCandidateResult.candidates;
  for (const jwksUrl of jwksCandidates) {
    const jwk = await fetchMatchingJwk(jwksUrl, kid, fetcher, {
      alg: verificationAlg,
      issuerDid: portalHospitalCredential ? issuer : undefined,
      strictKid: portalHospitalCredential,
    });
    if (!jwk) continue;
    try {
      const key = await importJWK(jwk, verificationAlg);
      const result = await jwtVerify(token.issuerJwt, key, {
        algorithms: [verificationAlg],
        ...(portalHospitalCredential ? { issuer } : {}),
      });
      const payload = result.payload as Record<string, any>;
      const timeErrors = artifactTimeErrors(payload, kind, new Date());
      if (timeErrors.length > 0) {
        errors.push(...timeErrors);
        break;
      }
      return {
        kind,
        verified: true,
        alg,
        kid,
        jku,
        disclosureCount: token.disclosures.length,
        issuer: stringOrUndefined(payload.iss),
        subject: stringOrUndefined(payload.sub),
        audience: audienceSummary(payload.aud),
        credentialId: stringOrUndefined(
          payload.jti ??
            unwrapVcPayload(payload)?.id ??
            unwrapVpPayload(payload)?.id,
        ),
        credentialType:
          kind === "vc"
            ? String(
                payload.vct ?? lastCredentialType(unwrapVcPayload(payload)),
              )
            : undefined,
        jwksUrl,
        payload,
        warnings,
        errors: [],
      };
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "JWT signature verification failed.",
      );
      break;
    }
  }

  if (!jwksCandidates.length)
    errors.push("No JWKS URL candidate is available for this JWT.");
  if (jwksCandidates.length && !errors.length) {
    errors.push(
      `No public JWK matched kid ${kid ?? "-"} from resolver candidates.`,
    );
  }
  return failedJwtVerification({
    kind,
    alg,
    kid,
    jku,
    token,
    payload: decodedPayload,
    warnings,
    errors,
  });
}

async function fetchMatchingJwk(
  jwksUrl: string,
  kid: string | undefined,
  fetcher: typeof fetch,
  binding: {
    alg?: "ES256" | "EdDSA";
    issuerDid?: string;
    strictKid?: boolean;
  } = {},
): Promise<JWK | null> {
  try {
    const response = await fetcher(jwksUrl, {
      method: "GET",
      headers: { accept: "application/json, application/jwk-set+json" },
    });
    if (!response.ok) return null;
    const jwks = (await response.json()) as Record<string, any>;
    if (binding.strictKid) {
      return strictIssuerBoundJwk(jwks, kid, binding.issuerDid, binding.alg);
    }
    const keys = jwksToKeys(jwks);
    if (!keys.length) return null;
    if (kid) {
      const matching = keys.find((key) => keyMatchesKid(key, kid));
      if (matching) return matching;
      if (keys.length === 1 && !stringOrUndefined(keys[0]?.kid)) {
        return keys[0];
      }
      return null;
    }
    return keys.length === 1 ? keys[0] : null;
  } catch {
    return null;
  }
}

function strictIssuerBoundJwk(
  payload: Record<string, any>,
  kid: string | undefined,
  issuerDid: string | undefined,
  alg: "ES256" | "EdDSA" | undefined,
): JWK | null {
  if (!kid || !issuerDid || !alg || controllerDid(kid) !== issuerDid) {
    return null;
  }

  const methods = Array.isArray(payload.verificationMethod)
    ? payload.verificationMethod
    : null;
  let jwk: JWK | null = null;
  if (methods) {
    if (payload.id !== issuerDid) return null;
    const assertionMethods = Array.isArray(payload.assertionMethod)
      ? payload.assertionMethod
          .map((method) =>
            typeof method === "string"
              ? method
              : stringOrUndefined(objectValue(method)?.id),
          )
          .filter((value): value is string => Boolean(value))
      : [];
    if (!assertionMethods.includes(kid)) return null;
    const method = methods
      .map(objectValue)
      .find(
        (candidate) =>
          candidate?.id === kid && candidate.controller === issuerDid,
      );
    jwk = objectValue(method?.publicKeyJwk) as JWK | null;
  } else {
    if (payload.issuer !== issuerDid) return null;
    const keys = Array.isArray(payload.keys) ? (payload.keys as JWK[]) : [];
    jwk = keys.find((candidate) => candidate.kid === kid) ?? null;
  }

  if (!jwk || (jwk.kid !== undefined && jwk.kid !== kid)) return null;
  if (jwk.alg !== alg || (jwk.use !== undefined && jwk.use !== "sig")) {
    return null;
  }
  if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes("verify"))
    return null;
  if (
    alg === "ES256" &&
    (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y)
  ) {
    return null;
  }
  return { ...jwk, kid };
}

function isPortalHospitalIssuerDid(value: string | undefined): boolean {
  if (!value?.startsWith("did:web:")) return false;
  try {
    const parts = value
      .slice("did:web:".length)
      .split(":")
      .map(decodeURIComponent);
    return (
      parts.length === 3 &&
      parts[1]?.toLowerCase() === "hospital" &&
      ["tcc", "tcp", "tcm"].includes(parts[2]?.toLowerCase() ?? "")
    );
  } catch {
    return false;
  }
}

function artifactTimeErrors(
  payload: Record<string, any>,
  kind: "vp" | "vc",
  now: Date,
): string[] {
  const artifact =
    kind === "vc" ? unwrapVcPayload(payload) : unwrapVpPayload(payload);
  if (!artifact) return [];
  const errors: string[] = [];
  const validFrom = stringOrUndefined(
    artifact.validFrom ?? artifact.issuanceDate,
  );
  const validUntil = stringOrUndefined(
    artifact.validUntil ?? artifact.expirationDate,
  );
  if (validFrom) {
    const startsAt = Date.parse(validFrom);
    if (!Number.isFinite(startsAt) || startsAt > now.getTime()) {
      errors.push("JWT artifact is not valid yet or has an invalid validFrom.");
    }
  }
  if (validUntil) {
    const expiresAt = Date.parse(validUntil);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      errors.push("JWT artifact is expired or has an invalid validUntil.");
    }
  }
  return errors;
}

function failedJwtVerification(input: {
  kind: "vp" | "vc";
  alg?: string;
  kid?: string;
  jku?: string;
  token: { disclosures: string[] };
  payload: Record<string, any>;
  warnings: string[];
  errors: string[];
}): JwtVerificationResult {
  return {
    kind: input.kind,
    verified: false,
    alg: input.alg,
    kid: input.kid,
    jku: input.jku,
    disclosureCount: input.token.disclosures.length,
    issuer: stringOrUndefined(input.payload.iss),
    subject: stringOrUndefined(input.payload.sub),
    audience: audienceSummary(input.payload.aud),
    credentialId: stringOrUndefined(
      input.payload.jti ??
        unwrapVcPayload(input.payload)?.id ??
        unwrapVpPayload(input.payload)?.id,
    ),
    credentialType:
      input.kind === "vc"
        ? String(
            input.payload.vct ??
              lastCredentialType(unwrapVcPayload(input.payload)) ??
              "",
          )
        : undefined,
    payload: input.payload,
    warnings: input.warnings,
    errors: input.errors,
  };
}

export async function verify(
  options: VerifierApiOptions,
  input: { token?: string; vpUrl?: string },
): Promise<VerifierResult> {
  if (usesDemoRuntime(options))
    return verifyQr(options, input.vpUrl ?? input.token ?? "");
  return callTrpcProcedure<VerifierResult>(options, "verifier.verify", input);
}

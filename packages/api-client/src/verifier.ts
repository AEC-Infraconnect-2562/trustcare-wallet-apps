import { assertVerifierResult } from "@trustcare/contracts";
import {
  audienceSummary,
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
  fetchShlManifest,
  resolveDemoResolverPayload,
  resolveDemoVpReferencePayload,
  splitJwtToken,
  stringOrUndefined,
  stringValue,
  unwrapVcPayload,
  unwrapVpPayload,
  validateOid4vpBinding,
  verifyShlManifestTrust,
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
import {
  verifyPortalCredentialJwt,
  type PortalCredentialVerifyResponse,
} from "./portalSync";

export type VerifierApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
  portalOrigin?: string;
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
      verified: true,
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
      verified: binding.ok,
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
    return verifyResolvedVpPayload(resolvedVp);
  }
  const demoReferencePayload = resolveDemoVpReferencePayload(qrData);
  if (demoReferencePayload?.kind === "vp") {
    return verifyResolvedVpPayload({
      id: demoReferencePayload.id,
      payload: demoReferencePayload.payload,
      sourceUrl: qrData,
      warnings: [
        "Resolved deterministic TrustCare demo VP reference from the wallet seed dataset.",
      ],
    });
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
    const fetched = await fetchShlManifest(qrData);
    const trustResult = fetched.ok
      ? verifyShlManifestTrust(fetched.manifest)
      : null;
    const trustcare = objectValue(fetched.manifest?.trustcare) ?? {};
    const manifestVp = objectValue(trustcare.manifestVp);
    const passcodeMissing = shl.passcodeRequired && !fetched.ok;
    return {
      verified: Boolean(trustResult?.verified),
      trustLevel:
        trustResult?.trustLevel ?? (passcodeMissing ? "yellow" : "red"),
      protocol: "shl",
      issuer:
        trustResult?.status === "trustcare_certified"
          ? "TrustCare Certified SHL"
          : fetched.ok
            ? "SMART Health Links transport"
            : "SMART Health Links parser",
      holderDid:
        typeof manifestVp?.holder === "string" ? manifestVp.holder : undefined,
      requestSummary:
        trustResult?.status === "trustcare_certified"
          ? `Certified SHL + Manifest VP / เอกสาร ${fetched.fileCount} รายการ`
          : fetched.ok
            ? `Standard SHL transport-valid / เอกสาร ${fetched.fileCount} รายการ`
            : "อ่าน SHL ได้ แต่ยังดึง manifest ไม่สำเร็จ",
      credentials: fetched.manifest ? [fetched.manifest] : [],
      verificationChecklist: trustResult?.checklist ?? [
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
      ],
      warnings: [
        ...fetched.warnings,
        ...(trustResult?.warnings ?? []),
        ...(shl.passcodeRequired
          ? [
              "SHL นี้ต้องใช้ passcode โดย passcode ต้องส่งผ่านช่องทางแยกจาก QR.",
            ]
          : []),
        ...(!trustResult?.verified && fetched.ok
          ? [
              "SHL นี้เป็น transport-valid เท่านั้น ยังไม่ถือเป็น TrustCare-certified จนกว่าจะมี Manifest VP + Manifest Credential + Holder VC ที่ verify ได้ครบ.",
            ]
          : []),
      ],
      errors: [...fetched.errors, ...(trustResult?.errors ?? [])],
    };
  }
  const jsonPayload = parseJson(qrData);
  if (jsonPayload?.type === "TrustCareShlManifestVP") {
    const documentCount = Array.isArray(jsonPayload.documents)
      ? jsonPayload.documents.length
      : 0;
    const certification =
      jsonPayload.trustcareCertification &&
      typeof jsonPayload.trustcareCertification === "object"
        ? (jsonPayload.trustcareCertification as Record<string, any>)
        : {};
    const makerCheckerApproved = Boolean(
      certification.status === "maker_checker_approved" &&
      certification.ownerConfirmed &&
      certification.makerApprovedAt &&
      certification.checkerApprovedAt,
    );
    const hasManifestBinding = Boolean(
      jsonPayload.manifestCredentialId &&
      jsonPayload.holderPresentationId &&
      !String(jsonPayload.manifestCredentialId).startsWith(
        "pending:trustcare",
      ) &&
      !String(jsonPayload.holderPresentationId).startsWith("pending:trustcare"),
    );
    return {
      verified: Boolean(hasManifestBinding && makerCheckerApproved),
      trustLevel:
        hasManifestBinding && makerCheckerApproved
          ? "green"
          : hasManifestBinding
            ? "yellow"
            : "red",
      protocol: "shl",
      issuer: "TrustCare SHL Manifest Verifier",
      holderDid:
        typeof jsonPayload.holderDid === "string"
          ? jsonPayload.holderDid
          : undefined,
      requestSummary: `Manifest VP ${jsonPayload.manifestCredentialId ?? "-"} / เอกสาร ${documentCount} รายการ`,
      matchedCredentialIds: Array.isArray(jsonPayload.documents)
        ? jsonPayload.documents
            .map((document: any) => document.manifestCredentialId)
            .filter(Boolean)
        : [],
      credentials: Array.isArray(jsonPayload.documents)
        ? jsonPayload.documents
        : [],
      verificationChecklist: [
        {
          key: "manifest_vc",
          label: "ผูกกับ Manifest VC",
          ok: Boolean(jsonPayload.manifestCredentialId),
          detail: String(jsonPayload.manifestCredentialId ?? "-"),
        },
        {
          key: "holder_vp",
          label: "ผูกกับ Holder VP",
          ok: Boolean(jsonPayload.holderPresentationId),
          detail: String(jsonPayload.holderPresentationId ?? "-"),
        },
        {
          key: "maker_checker",
          label: "ผ่าน Maker/Checker ของ TrustCare",
          ok: makerCheckerApproved,
          detail: certification.status ? String(certification.status) : "-",
        },
        {
          key: "document_reference",
          label: "มี FHIR DocumentReference",
          ok: documentCount > 0,
          detail: `เอกสารที่ผูกไว้ ${documentCount} รายการ`,
        },
      ],
      warnings: [
        ...(jsonPayload.passcodeRequired
          ? [
              "SHL นี้มี passcode/access policy; verifier ต้องบังคับใช้นโยบายก่อนดึงไฟล์",
            ]
          : []),
        ...(!makerCheckerApproved
          ? [
              "พบ TrustCare Manifest VP/VC แต่ยังไม่นับเป็น TrustCare verified จนกว่าเจ้าของข้อมูลและ Maker/Checker จะยืนยันครบ",
            ]
          : []),
        ...(JSON.stringify(jsonPayload).includes("pending:trustcare")
          ? [
              "พบ placeholder pending:trustcare จึงไม่ใช้เป็นหลักฐานความน่าเชื่อถือ",
            ]
          : []),
      ],
      errors: hasManifestBinding
        ? []
        : [
            "Manifest VP payload ขาด manifestCredentialId หรือ holderPresentationId",
          ],
    };
  }
  if (options.demoMode ?? true) {
    const parsed = parseTrustCareQr(qrData);
    const isStandardShl = parsed.kind === "shlink";
    return {
      verified: isStandardShl,
      trustLevel: isStandardShl
        ? "blue"
        : parsed.kind === "unknown"
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
      holderDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      requestSummary: parsed.presentationId
        ? `Presentation ID ${parsed.presentationId}`
        : isStandardShl
          ? "อ่าน Standard SMART Health Link"
          : parsed.kind,
      warnings:
        parsed.kind === "shlink"
          ? [
              "อ่าน Standard SHL สำเร็จ โดย Manifest VP/VC เป็นส่วนขยายของ TrustCare และจะเชื่อถือได้หลังเจ้าของข้อมูลกับ Maker/Checker ยืนยันครบเท่านั้น",
            ]
          : parsed.kind === "vp-url" || parsed.kind === "presentation-id"
            ? [
                "อ่านรูปแบบ VP resolver ได้ แต่ยัง fetch/verify payload ไม่สำเร็จ จึงยังไม่ให้ green badge.",
              ]
            : [],
      errors:
        parsed.kind === "unknown"
          ? ["QR code นี้ไม่ใช่รูปแบบ TrustCare VP ที่ระบบรู้จัก"]
          : [],
    };
  }
  return callTrpcProcedure<VerifierResult>(options, "verifier.verifyQrScan", {
    qrData,
    source: "camera",
  });
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
    return verifyResolvedVpPayload({
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
    });
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
  const portalStatus = await verifyPortalStatusIfTrustCare(
    options,
    jwt,
    verification,
  );
  return buildDirectVcVerifierResult(jwt, vc, verification, portalStatus);
}

async function verifyPortalStatusIfTrustCare(
  options: VerifierApiOptions,
  jwt: string,
  verification: JwtVerificationResult,
): Promise<PortalCredentialVerifyResponse | null> {
  const trustHints = [
    verification.issuer,
    verification.kid,
    verification.jku,
    verification.jwksUrl,
  ]
    .filter(Boolean)
    .join(" ");
  if (!/trustcare/i.test(trustHints)) return null;
  try {
    return await verifyPortalCredentialJwt({
      fetchImpl: options.fetchImpl,
      portalOrigin: options.portalOrigin,
      jwt,
    });
  } catch (error) {
    return {
      verified: false,
      trustLevel: "yellow",
      status: "portal_status_unavailable",
      message:
        error instanceof Error
          ? error.message
          : "TrustCare Portal status check unavailable",
    };
  }
}

function buildDirectVcVerifierResult(
  jwt: string,
  vc: Record<string, any>,
  verification: JwtVerificationResult,
  portalStatus: PortalCredentialVerifyResponse | null,
): VerifierResult {
  const expiresAt = stringOrUndefined(vc.validUntil);
  const notExpired = !expiresAt || new Date(expiresAt).getTime() >= Date.now();
  const portalChecked = Boolean(portalStatus);
  const portalOk = !portalStatus || Boolean(portalStatus.verified);
  const verified = verification.verified && portalOk && notExpired;
  const trustLevel = verified
    ? "green"
    : !verification.verified ||
        portalStatus?.trustLevel === "red" ||
        !notExpired
      ? "red"
      : "yellow";
  const portalError =
    portalStatus && !portalOk
      ? (portalStatus.message ?? portalStatus.error ?? portalStatus.status)
      : undefined;
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
        ok: verification.verified,
        detail: verification.verified
          ? `verified via ${verification.jwksUrl ?? verification.jku ?? "-"}`
          : verification.errors.join(" "),
      },
      {
        key: "portal_status",
        label: "TrustCare Portal status",
        ok: portalOk,
        detail: portalChecked
          ? `${portalStatus?.trustLevel ?? "unknown"} / ${portalStatus?.status ?? "-"}`
          : "not required for non-Portal issuer",
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
    ],
    warnings: [
      ...verification.warnings,
      ...verification.errors,
      ...(portalStatus?.message ? [portalStatus.message] : []),
      ...(!portalChecked &&
      /trustcare/i.test(
        `${verification.issuer ?? ""} ${verification.kid ?? ""}`,
      )
        ? [
            "ตรวจลายเซ็นได้แล้ว แต่ยังไม่ได้รับผล DB cross-check จาก TrustCare Portal.",
          ]
        : []),
      ...(!notExpired ? ["VC หมดอายุแล้ว"] : []),
    ],
    errors: [
      ...(!verification.verified ? verification.errors : []),
      ...(portalError ? [portalError] : []),
      ...(!notExpired ? ["VC หมดอายุแล้ว"] : []),
    ],
    verificationPayload: {
      trustLevel,
      verified,
      issuer,
      holderDid: stringOrUndefined(subject?.id) ?? verification.subject,
      credentials: [vc],
      jwt,
      portalStatus,
    },
  };
}

function verifyResolvedVpPayload(resolved: ResolvedVpPayload): VerifierResult {
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
  const jwtVerified = Boolean(resolved.jwtVerification?.verified);
  const nestedCredentialVerified =
    nestedResults.length > 0 &&
    nestedResults.every((result) => result.verified);
  const dataIntegrity = assessDataIntegrityProof(payload);
  const hasVerifiedProof = jwtVerified;
  const notExpired =
    !payload.validUntil ||
    new Date(String(payload.validUntil)).getTime() >= Date.now();
  const verified =
    credentialCount > 0 &&
    hasVerifiedProof &&
    (!resolved.jwt || nestedCredentialVerified) &&
    notExpired;
  const issuer =
    firstIssuer(credentials) ??
    resolved.jwtVerification?.issuer ??
    (hasVerifiedProof
      ? "TrustCare signed VP resolver"
      : "TrustCare VP resolver");
  return {
    verified,
    trustLevel: verified ? "green" : credentialCount > 0 ? "yellow" : "red",
    protocol: "trustcare-vp",
    issuer,
    holderDid: typeof payload.holder === "string" ? payload.holder : undefined,
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
        ok: jwtVerified,
        detail: jwtVerified
          ? `ES256 / ${resolved.jwtVerification?.kid ?? "-"}`
          : dataIntegrity.present
            ? `${dataIntegrity.summary} present but not cryptographically verified`
            : "missing",
      },
      {
        key: "data_integrity",
        label: "Data Integrity proof",
        ok: dataIntegrity.verified,
        detail: dataIntegrity.present
          ? "present; cryptosuite verification required"
          : "not present",
      },
      {
        key: "issuer_key",
        label: "Issuer key resolved",
        ok: jwtVerified,
        detail:
          resolved.jwtVerification?.jwksUrl ??
          resolved.jwtVerification?.jku ??
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
        ok: !resolved.jwt || nestedCredentialVerified,
        detail: nestedResults.length
          ? `${nestedResults.filter((result) => result.verified).length}/${nestedResults.length}`
          : "json-vp",
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
        ok: Boolean(
          payload.purpose ||
          payload.recipient ||
          resolved.jwtVerification?.audience,
        ),
        detail: String(
          payload.purpose ?? resolved.jwtVerification?.audience ?? "-",
        ),
      },
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
      ...(dataIntegrity.present && !jwtVerified
        ? [
            "พบ Data Integrity proof แต่ระบบยังไม่ถือว่า verified จนกว่าจะ verify cryptosuite/key material ตาม W3C Data Integrity ได้จริง.",
          ]
        : []),
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
    ],
    errors: credentialCount > 0 ? [] : ["VP ไม่มี verifiableCredential"],
  };
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
  if (alg !== "ES256" && alg !== "EdDSA") {
    warnings.push(
      `JWT alg ${alg ?? "-"} is parsed, but production TrustCare verification expects ES256 or EdDSA.`,
    );
  }
  if (!kid) errors.push("JWT header has no kid.");

  const jwksCandidateResult = buildTrustCareJwksCandidateResult({
    header,
    payload: decodedPayload,
    sourceUrl,
  });
  warnings.push(...jwksCandidateResult.warnings);
  const jwksCandidates = jwksCandidateResult.candidates;
  for (const jwksUrl of jwksCandidates) {
    const jwk = await fetchMatchingJwk(jwksUrl, kid, fetcher);
    if (!jwk) continue;
    try {
      const key = await importJWK(jwk, alg ?? String(jwk.alg ?? "ES256"));
      const result = await jwtVerify(token.issuerJwt, key);
      const payload = result.payload as Record<string, any>;
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
  return {
    kind,
    verified: false,
    alg,
    kid,
    jku,
    disclosureCount: token.disclosures.length,
    issuer: stringOrUndefined(decodedPayload.iss),
    subject: stringOrUndefined(decodedPayload.sub),
    audience: audienceSummary(decodedPayload.aud),
    credentialId: stringOrUndefined(
      decodedPayload.jti ??
        unwrapVcPayload(decodedPayload)?.id ??
        unwrapVpPayload(decodedPayload)?.id,
    ),
    credentialType:
      kind === "vc"
        ? String(
            decodedPayload.vct ??
              lastCredentialType(unwrapVcPayload(decodedPayload)) ??
              "",
          )
        : undefined,
    payload: decodedPayload,
    warnings,
    errors,
  };
}

async function fetchMatchingJwk(
  jwksUrl: string,
  kid: string | undefined,
  fetcher: typeof fetch,
): Promise<JWK | null> {
  try {
    const response = await fetcher(jwksUrl, {
      method: "GET",
      headers: { accept: "application/json, application/jwk-set+json" },
    });
    if (!response.ok) return null;
    const jwks = (await response.json()) as Record<string, any>;
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

function manifestFilesAreStandard(
  manifest: Record<string, unknown> | undefined,
): boolean {
  if (!manifest) return false;
  const files = manifest.files;
  if (!Array.isArray(files) || !files.length) return false;
  return files.every((file) => {
    if (!file || typeof file !== "object") return false;
    const object = file as Record<string, unknown>;
    return (
      typeof object.location === "string" ||
      Boolean(object.embedded && typeof object.embedded === "object")
    );
  });
}

export async function verify(
  options: VerifierApiOptions,
  input: { token?: string; vpUrl?: string },
): Promise<VerifierResult> {
  if (options.demoMode ?? true)
    return verifyQr(options, input.vpUrl ?? input.token ?? "");
  return callTrpcProcedure<VerifierResult>(options, "verifier.verify", input);
}

import {
  parseOid4vcCredentialOffer,
  parseOid4vpRequest,
  parseShlLink,
  parseTrustCareQr,
  fetchShlManifest,
  resolveDemoResolverPayload,
  type VerifierResult
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";

export type VerifierApiOptions = TrustCareClientOptions & {
  demoMode?: boolean;
};

type ResolvedVpPayload = {
  id: string;
  payload: Record<string, any>;
  sourceUrl: string;
  warnings: string[];
};

export async function verifyQr(options: VerifierApiOptions, qrData: string): Promise<VerifierResult> {
  const oid4vci = parseOid4vcCredentialOffer(qrData);
  if (oid4vci) {
    return {
      verified: true,
      trustLevel: "yellow",
      protocol: "oid4vci",
      issuer: oid4vci.issuer ?? oid4vci.credentialOfferUri ?? "OID4VCI issuer",
      requestSummary: `Credential offer: ${oid4vci.configurationIds.join(", ") || "metadata reference"}`,
      warnings: ["Credential offer parsed. Wallet must fetch issuer metadata over TLS and require user consent before storing any VC."],
      errors: []
    };
  }
  const oid4vp = parseOid4vpRequest(qrData);
  if (oid4vp) {
    return {
      verified: Boolean(oid4vp.nonce || oid4vp.requestUri),
      trustLevel: oid4vp.nonce || oid4vp.requestUri ? "yellow" : "red",
      protocol: "oid4vp",
      issuer: oid4vp.verifier ?? "OID4VP verifier",
      requestSummary: `Requests ${oid4vp.requestedCredentialTypes.join(", ") || `${oid4vp.descriptorCount} descriptor(s)`}`,
      warnings: ["OID4VP request parsed. Select matching credentials and generate VP only after user consent."],
      errors: oid4vp.nonce || oid4vp.requestUri ? [] : ["OID4VP request has no nonce/request_uri; treat as untrusted."]
    };
  }
  const resolvedVp = await resolvePublishedVp(qrData, options.fetchImpl ?? fetch);
  if (resolvedVp) {
    return verifyResolvedVpPayload(resolvedVp);
  }
  const demoPayload = resolveDemoResolverPayload(qrData);
  if (demoPayload?.kind === "vp") {
    const payload = demoPayload.payload;
    const credentialCount = Array.isArray(payload.verifiableCredential) ? payload.verifiableCredential.length : 0;
    const hasProof = hasVerifiableProof(payload);
    return {
      verified: credentialCount > 0 && hasProof,
      trustLevel: credentialCount > 0 && hasProof ? "green" : credentialCount > 0 ? "yellow" : "red",
      protocol: "trustcare-vp",
      issuer: "TrustCare Wallet legacy demo resolver",
      holderDid: typeof payload.holder === "string" ? payload.holder : undefined,
      requestSummary: `VP ${demoPayload.id} / เอกสาร ${credentialCount} รายการ`,
      credentials: Array.isArray(payload.verifiableCredential) ? payload.verifiableCredential : [],
      verificationChecklist: [
        { key: "parsed", label: "อ่าน legacy VP resolver ได้", ok: true, detail: demoPayload.id },
        { key: "holder", label: "มี Holder DID", ok: typeof payload.holder === "string", detail: String(payload.holder ?? "-") },
        { key: "documents", label: "มีเอกสารที่เลือก", ok: credentialCount > 0, detail: String(credentialCount) },
        { key: "expiry", label: "มีวันหมดอายุ", ok: typeof payload.validUntil === "string", detail: String(payload.validUntil ?? "-") },
        { key: "proof", label: "มี proof/signature ที่ตรวจสอบได้", ok: hasProof, detail: hasProof ? "proof present" : "missing" }
      ],
      warnings: [
        "QR รูปแบบ legacy ที่ฝัง payload ใน URL ใช้ได้เฉพาะ backward compatibility เท่านั้น.",
        ...(!hasProof ? ["ไม่ให้ green badge เพราะ VP ยังไม่มี proof/signature แบบ ES256/EdDSA/Data Integrity ที่ตรวจสอบได้."] : [])
      ],
      errors: credentialCount > 0 ? [] : ["VP ไม่มี verifiableCredential"]
    };
  }
  const shl = parseShlLink(qrData);
  if (shl) {
    const fetched = await fetchShlManifest(qrData);
    const trustcare = fetched.manifest?.trustcare && typeof fetched.manifest.trustcare === "object"
      ? fetched.manifest.trustcare as Record<string, any>
      : {};
    const manifestVp = trustcare.manifestVp && typeof trustcare.manifestVp === "object" ? trustcare.manifestVp as Record<string, any> : undefined;
    const manifestCredential = trustcare.manifestCredential && typeof trustcare.manifestCredential === "object" ? trustcare.manifestCredential as Record<string, any> : undefined;
    const holderAuthorizationCredential = trustcare.holderAuthorizationCredential && typeof trustcare.holderAuthorizationCredential === "object"
      ? trustcare.holderAuthorizationCredential as Record<string, any>
      : undefined;
    const certified = Boolean(
      fetched.ok &&
      trustcare.trustLayerStatus === "certified_manifest_vp" &&
      trustcare.manifestVpHash &&
      manifestVp &&
      manifestCredential &&
      holderAuthorizationCredential
    );
    const pendingTrustCare = Boolean(fetched.ok && trustcare.trustLayerStatus && trustcare.trustLayerStatus !== "certified_manifest_vp");
    const passcodeMissing = shl.passcodeRequired && !fetched.ok;
    return {
      verified: certified,
      trustLevel: certified ? "green" : fetched.ok ? (pendingTrustCare ? "yellow" : "blue") : passcodeMissing ? "yellow" : "red",
      protocol: "shl",
      issuer: certified ? "TrustCare Certified SHL" : fetched.ok ? "SMART Health Links transport" : "SMART Health Links parser",
      holderDid: typeof manifestVp?.holder === "string" ? manifestVp.holder : undefined,
      requestSummary: certified
        ? `Certified SHL + Manifest VP / เอกสาร ${fetched.fileCount} รายการ`
        : fetched.ok
          ? `Standard SHL transport-valid / เอกสาร ${fetched.fileCount} รายการ`
          : "อ่าน SHL ได้ แต่ยังดึง manifest ไม่สำเร็จ",
      credentials: fetched.manifest ? [fetched.manifest] : [],
      verificationChecklist: [
        { key: "parsed", label: "อ่าน SHL QR ได้", ok: true, detail: shl.url ?? "-" },
        { key: "manifest", label: "ดึง manifest ได้", ok: fetched.ok, detail: fetched.requestMethod ?? "-" },
        { key: "standard_files", label: "manifest มี files[].location หรือ files[].embedded", ok: manifestFilesAreStandard(fetched.manifest), detail: String(fetched.fileCount) },
        { key: "manifest_vp", label: "มี TrustCare Manifest VP", ok: Boolean(manifestVp), detail: String(trustcare.manifestVpHash ?? "-") },
        { key: "holder_vc", label: "มี Holder Authorization VC", ok: Boolean(holderAuthorizationCredential), detail: String(holderAuthorizationCredential?.id ?? "-") },
        { key: "manifest_vc", label: "มี Manifest Credential", ok: Boolean(manifestCredential), detail: String(manifestCredential?.id ?? "-") }
      ],
      warnings: [
        ...fetched.warnings,
        ...(shl.passcodeRequired ? ["SHL นี้ต้องใช้ passcode โดย passcode ต้องส่งผ่านช่องทางแยกจาก QR."] : []),
        ...(!certified && fetched.ok ? ["SHL นี้เป็น transport-valid เท่านั้น ยังไม่ถือเป็น TrustCare-certified จนกว่าจะมี Manifest VP + Manifest Credential + Holder VC ที่ verify ได้ครบ."] : [])
      ],
      errors: fetched.errors
    };
  }
  const jsonPayload = parseJson(qrData);
  if (jsonPayload?.type === "TrustCareShlManifestVP") {
    const documentCount = Array.isArray(jsonPayload.documents) ? jsonPayload.documents.length : 0;
    const certification = jsonPayload.trustcareCertification && typeof jsonPayload.trustcareCertification === "object"
      ? jsonPayload.trustcareCertification as Record<string, any>
      : {};
    const makerCheckerApproved = Boolean(
      certification.status === "maker_checker_approved" &&
      certification.ownerConfirmed &&
      certification.makerApprovedAt &&
      certification.checkerApprovedAt
    );
    const hasManifestBinding = Boolean(
      jsonPayload.manifestCredentialId &&
      jsonPayload.holderPresentationId &&
      !String(jsonPayload.manifestCredentialId).startsWith("pending:trustcare") &&
      !String(jsonPayload.holderPresentationId).startsWith("pending:trustcare")
    );
    return {
      verified: Boolean(hasManifestBinding && makerCheckerApproved),
      trustLevel: hasManifestBinding && makerCheckerApproved ? "green" : hasManifestBinding ? "yellow" : "red",
      protocol: "shl",
      issuer: "TrustCare SHL Manifest Verifier",
      holderDid: typeof jsonPayload.holderDid === "string" ? jsonPayload.holderDid : undefined,
      requestSummary: `Manifest VP ${jsonPayload.manifestCredentialId ?? "-"} / เอกสาร ${documentCount} รายการ`,
      matchedCredentialIds: Array.isArray(jsonPayload.documents)
        ? jsonPayload.documents.map((document: any) => document.manifestCredentialId).filter(Boolean)
        : [],
      credentials: Array.isArray(jsonPayload.documents) ? jsonPayload.documents : [],
      verificationChecklist: [
        { key: "manifest_vc", label: "ผูกกับ Manifest VC", ok: Boolean(jsonPayload.manifestCredentialId), detail: String(jsonPayload.manifestCredentialId ?? "-") },
        { key: "holder_vp", label: "ผูกกับ Holder VP", ok: Boolean(jsonPayload.holderPresentationId), detail: String(jsonPayload.holderPresentationId ?? "-") },
        { key: "maker_checker", label: "ผ่าน Maker/Checker ของ TrustCare", ok: makerCheckerApproved, detail: certification.status ? String(certification.status) : "-" },
        { key: "document_reference", label: "มี FHIR DocumentReference", ok: documentCount > 0, detail: `เอกสารที่ผูกไว้ ${documentCount} รายการ` }
      ],
      warnings: [
        ...(jsonPayload.passcodeRequired ? ["SHL นี้มี passcode/access policy; verifier ต้องบังคับใช้นโยบายก่อนดึงไฟล์"] : []),
        ...(!makerCheckerApproved ? ["พบ TrustCare Manifest VP/VC แต่ยังไม่นับเป็น TrustCare verified จนกว่าเจ้าของข้อมูลและ Maker/Checker จะยืนยันครบ"] : []),
        ...(JSON.stringify(jsonPayload).includes("pending:trustcare") ? ["พบ placeholder pending:trustcare จึงไม่ใช้เป็นหลักฐานความน่าเชื่อถือ"] : [])
      ],
      errors: hasManifestBinding ? [] : ["Manifest VP payload ขาด manifestCredentialId หรือ holderPresentationId"]
    };
  }
  if (options.demoMode ?? true) {
    const parsed = parseTrustCareQr(qrData);
    const isStandardShl = parsed.kind === "shlink";
    return {
      verified: isStandardShl,
      trustLevel: isStandardShl ? "blue" : parsed.kind === "unknown" ? "red" : "yellow",
      protocol: parsed.kind === "shlink" ? "shl" : parsed.kind === "jwt" ? "jwt" : parsed.kind === "json" ? "json" : parsed.kind === "unknown" ? "unknown" : "trustcare-vp",
      issuer: parsed.kind === "shlink" ? "SMART Health Link transport" : "TrustCare VP resolver",
      holderDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      requestSummary: parsed.presentationId ? `Presentation ID ${parsed.presentationId}` : isStandardShl ? "อ่าน Standard SMART Health Link" : parsed.kind,
      warnings: parsed.kind === "shlink"
        ? ["อ่าน Standard SHL สำเร็จ โดย Manifest VP/VC เป็นส่วนขยายของ TrustCare และจะเชื่อถือได้หลังเจ้าของข้อมูลกับ Maker/Checker ยืนยันครบเท่านั้น"]
        : parsed.kind === "vp-url" || parsed.kind === "presentation-id"
          ? ["อ่านรูปแบบ VP resolver ได้ แต่ยัง fetch/verify payload ไม่สำเร็จ จึงยังไม่ให้ green badge."]
          : [],
      errors: parsed.kind === "unknown" ? ["QR code นี้ไม่ใช่รูปแบบ TrustCare VP ที่ระบบรู้จัก"] : []
    };
  }
  return callTrpcProcedure<VerifierResult>(options, "verifier.verifyQrScan", {
    qrData,
    source: "camera"
  });
}

async function resolvePublishedVp(qrData: string, fetcher: typeof fetch): Promise<ResolvedVpPayload | null> {
  const directJson = parseJson(qrData);
  const directVp = unwrapVpPayload(directJson);
  if (directVp) {
    return {
      id: stringValue(directVp.id, "inline-json-vp"),
      payload: directVp,
      sourceUrl: "inline-json",
      warnings: []
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
  const presentationId = url.searchParams.get("vp") ?? url.searchParams.get("presentationId");
  const gatewayBase = url.searchParams.get("gateway");
  if (presentationId && gatewayBase) {
    candidates.add(`${gatewayBase.replace(/\/$/, "")}/presentations/${encodeURIComponent(presentationId)}.json`);
  }
  if (presentationId && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) {
    candidates.add(`${url.origin}/api/share-gateway/presentations/${encodeURIComponent(presentationId)}.json`);
  }
  if (url.pathname.includes("/verify") && presentationId) {
    candidates.add(`${url.origin}/api/share-gateway/presentations/${encodeURIComponent(presentationId)}.json`);
  }
  return Array.from(candidates);
}

async function fetchJsonVp(url: string, fetcher: typeof fetch): Promise<ResolvedVpPayload | null> {
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/vp+json, application/json, application/jwt;q=0.7" },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (contentType.includes("text/html") || text.trim().startsWith("<")) return null;
    const jwtPayload = parseJwtPayload(text.trim());
    if (jwtPayload) {
      const vp = unwrapVpPayload(jwtPayload) ?? jwtPayload;
      return {
        id: stringValue(vp.id, url),
        payload: vp,
        sourceUrl: url,
        warnings: ["VP อยู่ในรูปแบบ JWT; ตรวจ proof/signature เชิงลึกควรทำผ่าน verifier backend/JWKS."]
      };
    }
    const json = parseJson(text);
    const vp = unwrapVpPayload(json);
    if (!vp) return null;
    return {
      id: stringValue(vp.id, url),
      payload: vp,
      sourceUrl: url,
      warnings: []
    };
  } catch {
    return null;
  }
}

function verifyResolvedVpPayload(resolved: ResolvedVpPayload): VerifierResult {
  const payload = resolved.payload;
  const credentials = Array.isArray(payload.verifiableCredential) ? payload.verifiableCredential : [];
  const credentialCount = credentials.length;
  const hasProof = hasVerifiableProof(payload);
  const notExpired = !payload.validUntil || new Date(String(payload.validUntil)).getTime() >= Date.now();
  const verified = credentialCount > 0 && hasProof && notExpired;
  return {
    verified,
    trustLevel: verified ? "green" : credentialCount > 0 ? "yellow" : "red",
    protocol: "trustcare-vp",
    issuer: hasProof ? "TrustCare signed VP resolver" : "TrustCare VP resolver",
    holderDid: typeof payload.holder === "string" ? payload.holder : undefined,
    requestSummary: `VP ${resolved.id} / เอกสาร ${credentialCount} รายการ`,
    credentials,
    verificationChecklist: [
      { key: "resolver", label: "ดึง VP จาก resolver URL ได้", ok: true, detail: resolved.sourceUrl },
      { key: "holder", label: "มี Holder DID", ok: typeof payload.holder === "string", detail: String(payload.holder ?? "-") },
      { key: "documents", label: "มี Verifiable Credential", ok: credentialCount > 0, detail: String(credentialCount) },
      { key: "expiry", label: "ยังไม่หมดอายุ", ok: notExpired, detail: String(payload.validUntil ?? "-") },
      { key: "proof", label: "มี proof/signature สำหรับตรวจสอบ", ok: hasProof, detail: hasProof ? proofSummary(payload) : "missing" }
    ],
    warnings: [
      ...resolved.warnings,
      ...(!hasProof ? ["VP resolver ดึง payload ได้แล้ว แต่ยังรอ ES256/EdDSA/Data Integrity proof หรือ backend verifier จึงยังไม่ให้ green badge."] : []),
      ...(!notExpired ? ["VP หมดอายุแล้ว"] : [])
    ],
    errors: credentialCount > 0 ? [] : ["VP ไม่มี verifiableCredential"]
  };
}

function looksLikeVpResolverUrl(url: URL): boolean {
  return Boolean(
    url.searchParams.get("vp") ||
      url.searchParams.get("presentationId") ||
      url.pathname.includes("/presentations/") ||
      url.pathname.includes("/verify") ||
      url.pathname.includes("/verifier")
  );
}

function unwrapVpPayload(value: unknown): Record<string, any> | null {
  const object = objectValue(value);
  if (!object) return null;
  if (isVerifiablePresentation(object)) return object;

  const nestedKeys = [
    "payload",
    "presentation",
    "vp",
    "verifiablePresentation",
    "data",
    "json"
  ];
  for (const key of nestedKeys) {
    const nested = object[key];
    if (typeof nested === "string") {
      const json = parseJson(nested);
      const fromJson = unwrapVpPayload(json);
      if (fromJson) return fromJson;
      const fromJwt = parseJwtPayload(nested);
      const vpFromJwt = unwrapVpPayload(fromJwt);
      if (vpFromJwt) return vpFromJwt;
      continue;
    }
    const vp = unwrapVpPayload(nested);
    if (vp) return vp;
  }

  const result = object.result;
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>).data;
    const vp = unwrapVpPayload(data);
    if (vp) return vp;
  }
  return null;
}

function isVerifiablePresentation(value: Record<string, any>): boolean {
  const type = value.type;
  return Array.isArray(type)
    ? type.map(String).includes("VerifiablePresentation")
    : type === "VerifiablePresentation";
}

function hasVerifiableProof(value: Record<string, any>): boolean {
  const proof = value.proof;
  if (proofLooksUsable(proof)) return true;
  const trustcare = objectValue(value.trustcare);
  if (trustcare?.signatureStatus === "verified" || trustcare?.signingStatus === "verified") return true;
  if (trustcare?.proofStatus === "verified" || trustcare?.verificationStatus === "verified") return true;
  return false;
}

function proofLooksUsable(proof: unknown): boolean {
  if (!proof) return false;
  const proofs = Array.isArray(proof) ? proof : [proof];
  return proofs.some((entry) => {
    const object = objectValue(entry);
    if (!object) return false;
    const type = String(object.type ?? object.proofPurpose ?? "").toLowerCase();
    const value = String(object.proofValue ?? object.jws ?? object.signature ?? "").toLowerCase();
    if (!type && !value) return false;
    const joined = `${type} ${value}`;
    return !joined.includes("placeholder") && !joined.includes("test_proof_value_only");
  });
}

function proofSummary(value: Record<string, any>): string {
  const proof = Array.isArray(value.proof) ? value.proof[0] : value.proof;
  const proofObject = objectValue(proof);
  const trustcare = objectValue(value.trustcare);
  return String(proofObject?.type ?? trustcare?.signatureStatus ?? trustcare?.signingStatus ?? "proof present");
}

function parseJwtPayload(value: string): Record<string, any> | null {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return null;
  try {
    return parseJson(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function manifestFilesAreStandard(manifest: Record<string, unknown> | undefined): boolean {
  if (!manifest) return false;
  const files = manifest.files;
  if (!Array.isArray(files) || !files.length) return false;
  return files.every(file => {
    if (!file || typeof file !== "object") return false;
    const object = file as Record<string, unknown>;
    return typeof object.location === "string" || Boolean(object.embedded && typeof object.embedded === "object");
  });
}

function parseJson(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function verify(options: VerifierApiOptions, input: { token?: string; vpUrl?: string }): Promise<VerifierResult> {
  if (options.demoMode ?? true) return verifyQr(options, input.vpUrl ?? input.token ?? "");
  return callTrpcProcedure<VerifierResult>(options, "verifier.verify", input);
}

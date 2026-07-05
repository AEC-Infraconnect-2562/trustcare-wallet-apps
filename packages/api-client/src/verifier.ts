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
  const demoPayload = resolveDemoResolverPayload(qrData);
  if (demoPayload?.kind === "vp") {
    const payload = demoPayload.payload;
    const credentialCount = Array.isArray(payload.verifiableCredential) ? payload.verifiableCredential.length : 0;
    return {
      verified: credentialCount > 0,
      trustLevel: credentialCount > 0 ? "green" : "yellow",
      protocol: "trustcare-vp",
      issuer: "TrustCare Wallet demo resolver",
      holderDid: typeof payload.holder === "string" ? payload.holder : undefined,
      requestSummary: `VP ${demoPayload.id} / เอกสาร ${credentialCount} รายการ`,
      credentials: Array.isArray(payload.verifiableCredential) ? payload.verifiableCredential : [],
      verificationChecklist: [
        { key: "parsed", label: "อ่าน VP resolver ได้", ok: true, detail: demoPayload.id },
        { key: "holder", label: "มี Holder DID", ok: typeof payload.holder === "string", detail: String(payload.holder ?? "-") },
        { key: "documents", label: "มีเอกสารที่เลือก", ok: credentialCount > 0, detail: String(credentialCount) },
        { key: "expiry", label: "มีวันหมดอายุ", ok: typeof payload.validUntil === "string", detail: String(payload.validUntil ?? "-") }
      ],
      warnings: ["ผลนี้เป็น demo resolver สำหรับ GitHub Pages; production ต้อง verify ลายเซ็น VP/JWT และสถานะ VC ผ่าน verifier backend."],
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
      verified: parsed.kind === "vp-url" || parsed.kind === "presentation-id" || isStandardShl,
      trustLevel: isStandardShl ? "blue" : parsed.kind === "unknown" ? "red" : "green",
      protocol: parsed.kind === "shlink" ? "shl" : parsed.kind === "jwt" ? "jwt" : parsed.kind === "json" ? "json" : parsed.kind === "unknown" ? "unknown" : "trustcare-vp",
      issuer: parsed.kind === "shlink" ? "SMART Health Link transport" : "TrustCare Verifier",
      holderDid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      requestSummary: parsed.presentationId ? `Presentation ID ${parsed.presentationId}` : isStandardShl ? "อ่าน Standard SMART Health Link" : parsed.kind,
      warnings: parsed.kind === "shlink" ? ["อ่าน Standard SHL สำเร็จ โดย Manifest VP/VC เป็นส่วนขยายของ TrustCare และจะเชื่อถือได้หลังเจ้าของข้อมูลกับ Maker/Checker ยืนยันครบเท่านั้น"] : [],
      errors: parsed.kind === "unknown" ? ["QR code นี้ไม่ใช่รูปแบบ TrustCare VP ที่ระบบรู้จัก"] : []
    };
  }
  return callTrpcProcedure<VerifierResult>(options, "verifier.verifyQrScan", {
    qrData,
    source: "camera"
  });
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

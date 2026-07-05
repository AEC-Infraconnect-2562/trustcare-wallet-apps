import {
  parseOid4vcCredentialOffer,
  parseOid4vpRequest,
  parseTrustCareQr,
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
    const hasManifestBinding = Boolean(jsonPayload.manifestCredentialId && jsonPayload.holderPresentationId);
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
        ...(!makerCheckerApproved ? ["พบ TrustCare Manifest VP/VC แต่ยังไม่นับเป็น TrustCare verified จนกว่าเจ้าของข้อมูลและ Maker/Checker จะยืนยันครบ"] : [])
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
      requestSummary: parsed.presentationId ? `Presentation ID ${parsed.presentationId}` : isStandardShl ? "Standard SMART Health Link transport" : parsed.kind,
      warnings: parsed.kind === "shlink" ? ["อ่าน Standard SHL สำเร็จ โดย Manifest VP/VC เป็นส่วนขยายของ TrustCare และจะเชื่อถือได้หลังเจ้าของข้อมูลกับ Maker/Checker ยืนยันครบเท่านั้น"] : [],
      errors: parsed.kind === "unknown" ? ["QR code นี้ไม่ใช่รูปแบบ TrustCare VP ที่ระบบรู้จัก"] : []
    };
  }
  return callTrpcProcedure<VerifierResult>(options, "verifier.verifyQrScan", {
    qrData,
    source: "camera"
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

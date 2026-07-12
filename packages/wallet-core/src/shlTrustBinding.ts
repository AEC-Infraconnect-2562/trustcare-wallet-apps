import { hashJson } from "./demoResolvers";

export type ShlTrustVerificationStatus =
  | "parsed_only"
  | "transport_valid"
  | "trustcare_pending"
  | "trustcare_certified"
  | "invalid";

export type ShlTrustChecklistItem = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type ShlTrustVerificationResult = {
  status: ShlTrustVerificationStatus;
  verified: boolean;
  trustLevel: "green" | "blue" | "yellow" | "red";
  fileCount: number;
  checklist: ShlTrustChecklistItem[];
  warnings: string[];
  errors: string[];
};

export type ShlCryptographicVerificationEvidence = {
  manifestCredentialSignatureVerified: boolean;
  holderPresentationSignatureVerified: boolean;
  issuerTrusted: boolean;
  credentialStatusValid: boolean;
  subjectBindingVerified: boolean;
  manifestHashVerified: boolean;
  fileHashesVerified: boolean;
  purposeVerified: boolean;
  audienceVerified: boolean;
  expiryVerified: boolean;
  policyVerified: boolean;
  verifiedAt?: string;
};

export function verifyShlManifestTrust(
  manifest: unknown,
  now = new Date(),
  cryptographicEvidence?: ShlCryptographicVerificationEvidence,
): ShlTrustVerificationResult {
  const object = objectValue(manifest);
  if (!object) {
    return invalid("SHL manifest is missing or not a JSON object.");
  }
  const files = arrayValue(object.files)
    .map(objectValue)
    .filter(Boolean) as Array<Record<string, unknown>>;
  const access = objectValue(object.access) ?? {};
  const trustcare = objectValue(object.trustcare) ?? {};
  const standardChecks: ShlTrustChecklistItem[] = [
    {
      key: "manifest",
      label: "ดึง manifest ได้",
      ok: true,
      detail: String(object.resourceType ?? "manifest"),
    },
    {
      key: "standard_files",
      label: "manifest มี files[].location หรือ files[].embedded",
      ok: files.length > 0 && files.every(fileHasStandardLocation),
      detail: String(files.length),
    },
    {
      key: "expiry",
      label: "ยังไม่หมดอายุ",
      ok:
        !access.expiresAt ||
        new Date(String(access.expiresAt)).getTime() > now.getTime(),
      detail: String(access.expiresAt ?? object.expiresAt ?? "-"),
    },
  ];
  const standardOk = standardChecks.every((item) => item.ok);
  const trustLayerStatus = String(trustcare.trustLayerStatus ?? "standard_shl");
  if (!standardOk) {
    return {
      status: "invalid",
      verified: false,
      trustLevel: "red",
      fileCount: files.length,
      checklist: standardChecks,
      warnings: [],
      errors: standardChecks
        .filter((item) => !item.ok)
        .map((item) => item.label),
    };
  }
  if (trustLayerStatus !== "hospital_certified") {
    return {
      status:
        trustLayerStatus === "pending_hospital_certification"
          ? "trustcare_pending"
          : "transport_valid",
      verified: false,
      trustLevel:
        trustLayerStatus === "pending_hospital_certification"
          ? "yellow"
          : "blue",
      fileCount: files.length,
      checklist: [
        ...standardChecks,
        {
          key: "trustcare_certified",
          label: "ผ่าน TrustCare Manifest VP",
          ok: false,
          detail: trustLayerStatus,
        },
      ],
      warnings: [
        trustLayerStatus === "pending_hospital_certification"
          ? "SHL นี้กำลังรอ TrustCare Manifest verification และยังไม่เป็น TrustCare-certified."
          : "SHL นี้เป็น Standard SMART Health Link ที่อ่านได้ แต่ยังไม่เป็น TrustCare-certified.",
      ],
      errors: [],
    };
  }

  const manifestCredentialJwt = stringValue(
    trustcare.manifestCredentialJwt,
  );
  const holderPresentationJwt = stringValue(
    trustcare.holderPresentationJwt,
  );
  const expectedManifestHash = hashJson({
    files,
    documents: arrayValue(objectValue(object.documentBundle)?.documents),
  });
  const manifestHashOk = trustcare.manifestHash === expectedManifestHash;
  const certifiedChecks: ShlTrustChecklistItem[] = [
    ...standardChecks,
    {
      key: "manifest_vc",
      label: "มี Manifest Credential JWT",
      ok: looksLikeCompactJwt(manifestCredentialJwt) && manifestHashOk,
      detail: String(trustcare.manifestCredentialId ?? "-"),
    },
    {
      key: "holder_vp",
      label: "มี Holder Presentation JWT",
      ok: looksLikeCompactJwt(holderPresentationJwt),
      detail: String(trustcare.holderPresentationId ?? "-"),
    },
    {
      key: "maker_checker",
      label: "ผ่าน TrustCare Manifest policy",
      ok: trustcare.makerCheckerStatus === "approved",
      detail:
        trustcare.makerCheckerStatus === "approved"
          ? "approved"
          : trustcare.makerCheckerStatus === "pending_maker_checker"
            ? "pending_manifest_policy"
            : String(trustcare.makerCheckerStatus ?? "-"),
    },
    {
      key: "access_policy",
      label: "Access policy ตรวจสอบได้",
      ok: Boolean(
        access.expiresAt && typeof access.maxAccessCount === "number",
      ),
      detail: `${access.maxAccessCount ?? "-"} / ${access.expiresAt ?? "-"}`,
    },
    {
      key: "manifest_vc_signature",
      label: "ตรวจลายเซ็น Manifest Credential",
      ok: cryptographicEvidence?.manifestCredentialSignatureVerified === true,
      detail: cryptographicEvidence?.verifiedAt ?? "not_verified",
    },
    {
      key: "holder_vp_signature",
      label: "ตรวจลายเซ็น Holder Presentation",
      ok: cryptographicEvidence?.holderPresentationSignatureVerified === true,
      detail: cryptographicEvidence?.verifiedAt ?? "not_verified",
    },
    {
      key: "issuer_trust",
      label: "ตรวจความน่าเชื่อถือของผู้ออก",
      ok: cryptographicEvidence?.issuerTrusted === true,
      detail: cryptographicEvidence ? "checked" : "not_checked",
    },
    {
      key: "credential_status",
      label: "ตรวจสถานะ Credential",
      ok: cryptographicEvidence?.credentialStatusValid === true,
      detail: cryptographicEvidence ? "checked" : "not_checked",
    },
    {
      key: "subject_binding",
      label: "ตรวจ subject/holder binding",
      ok: cryptographicEvidence?.subjectBindingVerified === true,
    },
    {
      key: "manifest_hash",
      label: "ตรวจ manifest hash",
      ok: cryptographicEvidence?.manifestHashVerified === true,
    },
    {
      key: "file_hashes",
      label: "ตรวจ file hashes",
      ok: cryptographicEvidence?.fileHashesVerified === true,
    },
    {
      key: "purpose",
      label: "ตรวจวัตถุประสงค์",
      ok: cryptographicEvidence?.purposeVerified === true,
    },
    {
      key: "audience",
      label: "ตรวจผู้รับ/audience",
      ok: cryptographicEvidence?.audienceVerified === true,
    },
    {
      key: "certification_expiry",
      label: "ตรวจอายุการรับรอง",
      ok: cryptographicEvidence?.expiryVerified === true,
    },
    {
      key: "verification_policy",
      label: "ตรวจนโยบายผู้รับและการเข้าถึง",
      ok: cryptographicEvidence?.policyVerified === true,
      detail: cryptographicEvidence ? "checked" : "not_checked",
    },
  ];
  const certifiedOk =
    certifiedChecks.every((item) => item.ok) &&
    !JSON.stringify(trustcare).includes("pending:trustcare");
  return {
    status: certifiedOk ? "trustcare_certified" : "trustcare_pending",
    verified: certifiedOk,
    trustLevel: certifiedOk ? "green" : "yellow",
    fileCount: files.length,
    checklist: certifiedChecks,
    warnings: certifiedOk
      ? []
      : [
          "พบ TrustCare SHL extension แต่ยังตรวจ binding/hash/Holder/Manifest policy ไม่ครบ จึงยังไม่ให้ green badge.",
        ],
    errors: certifiedChecks
      .filter((item) => !item.ok)
      .map((item) => item.label),
  };
}

function invalid(error: string): ShlTrustVerificationResult {
  return {
    status: "invalid",
    verified: false,
    trustLevel: "red",
    fileCount: 0,
    checklist: [],
    warnings: [],
    errors: [error],
  };
}

function fileHasStandardLocation(file: Record<string, unknown>): boolean {
  return (
    typeof file.location === "string" || Boolean(objectValue(file.embedded))
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function looksLikeCompactJwt(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 3 &&
    parts.every((part) => Boolean(part) && /^[A-Za-z0-9_-]+$/.test(part))
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

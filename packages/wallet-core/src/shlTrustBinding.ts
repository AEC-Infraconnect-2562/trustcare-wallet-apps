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
  holderAuthorizationSignatureVerified: boolean;
  manifestVpSignatureVerified: boolean;
  issuerTrusted: boolean;
  credentialStatusValid: boolean;
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
  if (trustLayerStatus !== "certified_manifest_vp") {
    return {
      status:
        trustLayerStatus === "pending_manifest_vp"
          ? "trustcare_pending"
          : "transport_valid",
      verified: false,
      trustLevel:
        trustLayerStatus === "pending_manifest_vp" ? "yellow" : "blue",
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
        trustLayerStatus === "pending_manifest_vp"
          ? "SHL นี้กำลังรอ TrustCare Manifest verification และยังไม่เป็น TrustCare-certified."
          : "SHL นี้เป็น Standard SMART Health Link ที่อ่านได้ แต่ยังไม่เป็น TrustCare-certified.",
      ],
      errors: [],
    };
  }

  const manifestCredential = objectValue(trustcare.manifestCredential);
  const holderAuthorizationCredential = objectValue(
    trustcare.holderAuthorizationCredential,
  );
  const manifestVp = objectValue(trustcare.manifestVp);
  const expectedManifestHash = hashJson({
    files,
    documents: arrayValue(objectValue(object.documentBundle)?.documents),
  });
  const manifestCredentialSubject =
    objectValue(manifestCredential?.credentialSubject) ?? {};
  const manifestVpHashOk = Boolean(
    manifestVp && trustcare.manifestVpHash === hashJson(manifestVp),
  );
  const manifestHashOk =
    manifestCredentialSubject.manifestHash === expectedManifestHash;
  const holderDid = String(manifestVp?.holder ?? "");
  const holderSubject = String(
    objectValue(holderAuthorizationCredential?.credentialSubject)?.id ?? "",
  );
  const certifiedChecks: ShlTrustChecklistItem[] = [
    ...standardChecks,
    {
      key: "manifest_vc",
      label: "มี Manifest Credential",
      ok:
        hasType(manifestCredential, "TrustCareManifestCredential") &&
        manifestHashOk,
      detail: String(manifestCredential?.id ?? "-"),
    },
    {
      key: "holder_vc",
      label: "มี Holder Authorization Credential",
      ok:
        hasType(
          holderAuthorizationCredential,
          "HolderAuthorizationCredential",
        ) && Boolean(holderSubject),
      detail: String(holderAuthorizationCredential?.id ?? "-"),
    },
    {
      key: "manifest_vp",
      label: "มี Manifest VP",
      ok: hasType(manifestVp, "TrustCareManifestVP") && manifestVpHashOk,
      detail: String(trustcare.manifestVpHash ?? "-"),
    },
    {
      key: "holder_binding",
      label: "Holder binding ตรงกัน",
      ok: Boolean(holderDid && holderSubject && holderDid === holderSubject),
      detail: holderDid || "-",
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
      key: "holder_vc_signature",
      label: "ตรวจลายเซ็น Holder Authorization Credential",
      ok: cryptographicEvidence?.holderAuthorizationSignatureVerified === true,
      detail: cryptographicEvidence?.verifiedAt ?? "not_verified",
    },
    {
      key: "manifest_vp_signature",
      label: "ตรวจลายเซ็น Manifest VP",
      ok: cryptographicEvidence?.manifestVpSignatureVerified === true,
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

function hasType(
  value: Record<string, unknown> | null,
  expected: string,
): boolean {
  if (!value) return false;
  const type = value.type;
  const values = Array.isArray(type)
    ? type.map(String)
    : typeof type === "string"
      ? [type]
      : [];
  return values.includes(expected);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

import type { DisabledReason } from "./disabledReasons";
import { getDisabledReason } from "./disabledReasons";
import type { SharePackageMode } from "./canonicalDocuments";
import {
  missingRequiredDocuments,
  optionalMissingDocuments,
  selectedReadyDocuments,
  type ShareDraft,
} from "./shareDraft";
import { modeRequiresShl, type ShareAccessPolicy } from "./sharePolicy";

export type ShareValidationOptions = {
  shareGatewayReady?: boolean;
  requireResolvableQr?: boolean;
  biometricRequired?: boolean;
  biometricReady?: boolean;
  certifiedShlReady?: boolean;
  oid4vpLocked?: boolean;
};

export type ShareValidationIssue = {
  key: string;
  message: string;
  fix: string;
  severity: "blocked" | "warning";
};

export type ShareValidationResult = {
  ok: boolean;
  publishEnabled: boolean;
  selectedReadyCount: number;
  requiredMissingCount: number;
  optionalMissingCount: number;
  blockers: ShareValidationIssue[];
  warnings: ShareValidationIssue[];
  primaryDisabledReason: DisabledReason | null;
  disabledReasons: DisabledReason[];
};

export function validateShareDraft(
  draft: ShareDraft,
  policy: ShareAccessPolicy,
  options: ShareValidationOptions = {},
): ShareValidationResult {
  const selected = selectedReadyDocuments(draft);
  const requiredMissing = missingRequiredDocuments(draft);
  const optionalMissing = optionalMissingDocuments(draft);
  const blockers: ShareValidationIssue[] = [];
  const warnings: ShareValidationIssue[] = [];
  const disabledReasons: DisabledReason[] = [];
  const shareGatewayReady = options.shareGatewayReady ?? false;
  const requireResolvableQr = options.requireResolvableQr ?? true;

  if (!selected.length) {
    pushReason(disabledReasons, {
      action: "create_share_package",
      packageMode: policy.mode,
      selectedDocumentCount: selected.length,
    });
    blockers.push(
      issue(
        "no_documents",
        "ยังไม่ได้เลือกเอกสาร",
        "เลือกเอกสารอย่างน้อย 1 รายการ",
      ),
    );
  }

  if (requiredMissing.length > 0) {
    pushReason(disabledReasons, {
      action: "create_share_package",
      packageMode: policy.mode,
      selectedDocumentCount: selected.length,
      missingRequiredCount: requiredMissing.length,
    });
    blockers.push(
      issue(
        "missing_required",
        `ยังขาดเอกสารจำเป็น ${requiredMissing.length} รายการ`,
        "ขอเอกสารจากแหล่งข้อมูลที่แนะนำ หรือนำเข้าเอกสารก่อนสร้างชุดแชร์",
      ),
    );
  }

  if (optionalMissing.length > 0) {
    warnings.push(
      issue(
        "missing_optional",
        `ยังขาดเอกสารแนะนำ ${optionalMissing.length} รายการ`,
        "ยังแชร์ต่อได้ แต่ผู้รับอาจต้องขอข้อมูลเพิ่ม",
        "warning",
      ),
    );
  }

  if (options.biometricRequired && !options.biometricReady) {
    pushReason(disabledReasons, {
      action: "create_share_package",
      packageMode: policy.mode,
      selectedDocumentCount: selected.length,
      biometricRequired: true,
      biometricReady: false,
    });
    blockers.push(
      issue(
        "biometric_required",
        "วัตถุประสงค์นี้ต้องยืนยันตัวตนก่อนแชร์",
        "ตั้งค่าและยืนยัน Biometric ในเครื่องนี้ก่อนสร้าง QR",
      ),
    );
  }

  if (isVpMode(policy.mode)) {
    const nonIssuerSigned = selected.filter(
      (document) => document.trustStatus !== "issuer_signed",
    );
    if (nonIssuerSigned.length) {
      blockers.push(
        issue(
          "vp_requires_signed_vc",
          "VP ต้องใช้เอกสาร VC ที่ issuer ลงนามแล้วเท่านั้น",
          "ขอเอกสารจาก TrustCare Portal หรือ issuer ก่อนสร้าง VP",
        ),
      );
    }
    const inactive = selected.filter(
      (document) =>
        document.card &&
        String(document.card.credentialStatus ?? "active") !== "active",
    );
    if (inactive.length) {
      blockers.push(
        issue(
          "vp_requires_active_vc",
          "มีเอกสารที่ไม่อยู่ในสถานะใช้งาน",
          "เลือกเฉพาะเอกสาร active หรือ sync เอกสารเวอร์ชันล่าสุด",
        ),
      );
    }
    if (requireResolvableQr && !shareGatewayReady) {
      pushReason(disabledReasons, {
        action: "create_share_package",
        packageMode: policy.mode,
        selectedDocumentCount: selected.length,
        shareGatewayReady: false,
      });
      blockers.push(
        issue(
          "vp_gateway_missing",
          "ยังไม่มี Share Gateway สำหรับให้เครื่องอื่นสแกน VP ได้",
          "ตั้งค่า backend ที่ publish VP resolver ได้ก่อนสร้าง QR ใช้งานจริง",
        ),
      );
    }
  }

  if (modeRequiresShl(policy.mode)) {
    if (
      policy.shl?.passcodeRequired &&
      !isShlPasscodeReady(policy.shl.passcode)
    ) {
      pushReason(disabledReasons, {
        action: "create_share_package",
        packageMode: policy.mode,
        selectedDocumentCount: selected.length,
        shlPasscodeRequired: true,
        shlPasscodeReady: false,
      });
      blockers.push(
        issue(
          "shl_passcode_missing",
          "เปิดใช้ PIN/Passcode แต่ยังไม่ได้ตั้งค่าถูกต้อง",
          "ตั้ง PIN 4-8 หลัก และส่ง PIN แยกจาก QR ตามแนวทาง SHL",
        ),
      );
    }
    if (policy.mode === "CertifiedSHLManifestPackage") {
      const unverified = selected.filter(
        (document) => document.trustStatus === "patient_provided_unverified",
      );
      if (unverified.length) {
        blockers.push(
          issue(
            "certified_shl_no_unverified_upload",
            "Certified SHL ใช้เอกสารที่ผู้ใช้นำเข้าเองและยังไม่รับรองไม่ได้",
            "ให้ issuer ตรวจและลงนาม หรือแชร์เป็น Standard SHL พร้อมสถานะรอตรวจแทน",
          ),
        );
      }
      if (!options.certifiedShlReady) {
        pushReason(disabledReasons, {
          action: "create_share_package",
          packageMode: policy.mode,
          selectedDocumentCount: selected.length,
          trustcareCertificationAvailable: false,
        });
        blockers.push(
          issue(
            "certified_shl_not_ready",
            "ยังสร้าง Certified SHL ไม่ได้",
            "ต้องมี Manifest VP, Manifest Credential, Holder VC, hash และ gateway ที่ตรวจได้",
          ),
        );
      }
    }
  }

  if (options.oid4vpLocked) {
    const unlockedSelection = draft.documents.some(
      (document) => document.selected && !document.locked,
    );
    if (unlockedSelection) {
      blockers.push(
        issue(
          "oid4vp_request_locked",
          "คำขอ OID4VP กำหนดเอกสารและ claims ไว้แล้ว",
          "ใช้เฉพาะเอกสารและ fields ที่อยู่ใน request",
        ),
      );
    }
  }

  const primaryDisabledReason =
    disabledReasons.find((reason) => reason.severity === "blocked") ??
    issueToDisabledReason(blockers[0], policy.mode) ??
    null;

  return {
    ok: blockers.length === 0,
    publishEnabled: blockers.length === 0,
    selectedReadyCount: selected.length,
    requiredMissingCount: requiredMissing.length,
    optionalMissingCount: optionalMissing.length,
    blockers,
    warnings,
    primaryDisabledReason,
    disabledReasons,
  };
}

function pushReason(
  target: DisabledReason[],
  input: Parameters<typeof getDisabledReason>[0],
) {
  const reason = getDisabledReason(input);
  if (reason) target.push(reason);
}

function issue(
  key: string,
  message: string,
  fix: string,
  severity: ShareValidationIssue["severity"] = "blocked",
): ShareValidationIssue {
  return { key, message, fix, severity };
}

function issueToDisabledReason(
  validationIssue: ShareValidationIssue | undefined,
  packageMode: SharePackageMode,
): DisabledReason | null {
  if (!validationIssue) return null;
  return {
    action: "create_share_package",
    reason: validationIssue.message,
    fix: validationIssue.fix,
    severity: validationIssue.severity,
    ariaLabel: `${validationIssue.message} วิธีแก้: ${validationIssue.fix}`,
  };
}

function isVpMode(mode: SharePackageMode): boolean {
  return mode === "DirectVP" || mode === "PurposeVP";
}

function isShlPasscodeReady(passcode: string | undefined): boolean {
  return (passcode ?? "").replace(/\D/g, "").length >= 4;
}

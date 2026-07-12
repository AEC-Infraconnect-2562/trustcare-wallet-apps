import type { SharePackageMode } from "./canonicalDocuments";
import type { ReadinessContext } from "./models";

export type DisabledAction =
  | "request_missing_documents"
  | "import_document"
  | "create_share_package"
  | "create_vp"
  | "create_shl"
  | "create_certified_shl"
  | "verify_import";

export type DisabledReason = {
  action: DisabledAction;
  reason: string;
  fix: string;
  severity: "warning" | "blocked";
  ariaLabel: string;
};

export type DisabledReasonInput = {
  action: DisabledAction;
  context?: ReadinessContext;
  packageMode?: SharePackageMode;
  selectedDocumentCount?: number;
  missingRequiredCount?: number;
  unsupportedDocumentCount?: number;
  subjectMatchesWallet?: boolean;
  importFormatKnown?: boolean;
  trustcareCertificationAvailable?: boolean;
  shareGatewayReady?: boolean;
  biometricRequired?: boolean;
  biometricReady?: boolean;
  shlPasscodeRequired?: boolean;
  shlPasscodeReady?: boolean;
};

export function getDisabledReason(
  input: DisabledReasonInput,
): DisabledReason | null {
  if (input.action === "request_missing_documents") {
    if (!input.missingRequiredCount && !input.unsupportedDocumentCount) {
      return reason(
        input.action,
        "ยังไม่มีเอกสารที่ขาดสำหรับบริการนี้",
        "เลือกบริการอื่น หรือไปหน้าแชร์เอกสารหากเอกสารครบแล้ว",
        "warning",
      );
    }
    return null;
  }

  if (input.action === "import_document") {
    if (input.importFormatKnown === false) {
      return reason(
        input.action,
        "Wallet ยังไม่รู้จักรูปแบบเอกสารนี้",
        "ใช้ SHL, VC/VP JSON/JWT, OID4VCI offer, FHIR JSON, PDF หรือรูปภาพ",
        "blocked",
      );
    }
    if (input.subjectMatchesWallet === false) {
      return reason(
        input.action,
        "เอกสารนี้ไม่ใช่ของเจ้าของกระเป๋าที่เข้าสู่ระบบ",
        "ออกจากระบบ แล้วเข้าสู่ Wallet ของเจ้าของเอกสารก่อนนำเข้า",
        "blocked",
      );
    }
    return null;
  }

  if (
    input.action === "create_share_package" ||
    input.action === "create_vp" ||
    input.action === "create_shl" ||
    input.action === "create_certified_shl"
  ) {
    if (!input.selectedDocumentCount) {
      return reason(
        input.action,
        "ยังไม่ได้เลือกเอกสาร",
        "เลือกเอกสารอย่างน้อย 1 รายการ หรือกลับไปหน้าเตรียมบริการเพื่อดูเอกสารที่จำเป็น",
        "blocked",
      );
    }
    if (input.missingRequiredCount && input.missingRequiredCount > 0) {
      return reason(
        input.action,
        `ยังขาดเอกสารจำเป็น ${input.missingRequiredCount} รายการ`,
        "ขอเอกสารจากแหล่งข้อมูลที่แนะนำ หรือนำเข้าเอกสารก่อนสร้างชุดแชร์",
        "blocked",
      );
    }
    if (input.biometricRequired && !input.biometricReady) {
      return reason(
        input.action,
        "วัตถุประสงค์นี้ต้องยืนยันตัวตนก่อนแชร์",
        "ตั้งค่าและยืนยัน Biometric ในเครื่องนี้ก่อนสร้าง QR",
        "blocked",
      );
    }
    if (input.packageMode === "DirectVP" || input.packageMode === "PurposeVP") {
      if (!input.shareGatewayReady) {
        return reason(
          input.action,
          "ยังไม่มี Share Gateway สำหรับให้เครื่องอื่นสแกน VP ได้",
          "ตั้งค่า TrustCare Portal/Share Gateway หรือใช้ backend ที่ publish VP resolver ได้",
          "blocked",
        );
      }
    }
    if (
      input.packageMode === "StandardSHL" ||
      input.packageMode === "CertifiedSHLManifestPackage"
    ) {
      if (input.shlPasscodeRequired && !input.shlPasscodeReady) {
        return reason(
          input.action,
          "เปิดใช้ PIN/Passcode แต่ยังไม่ได้ตั้งค่าถูกต้อง",
          "ตั้ง PIN 4-8 หลัก และส่ง PIN แยกจาก QR ตามแนวทาง SHL",
          "blocked",
        );
      }
    }
    if (
      input.packageMode === "CertifiedSHLManifestPackage" &&
      !input.trustcareCertificationAvailable
    ) {
      return reason(
        input.action,
        "ยังสร้าง Certified SHL ไม่ได้",
        "ส่งคำขอผ่าน TrustCare Portal เพื่อรับ Manifest Credential ที่โรงพยาบาลลงนามและ Wallet ตรวจสอบได้",
        "blocked",
      );
    }
  }

  if (input.action === "verify_import" && input.importFormatKnown === false) {
    return reason(
      input.action,
      "ตรวจสอบ payload ไม่ได้",
      "ตรวจว่า QR/link เป็น SHL, VP resolver, VC/VP JSON/JWT หรือ FHIR DocumentReference",
      "blocked",
    );
  }

  return null;
}

function reason(
  action: DisabledAction,
  reasonText: string,
  fix: string,
  severity: DisabledReason["severity"],
): DisabledReason {
  return {
    action,
    reason: reasonText,
    fix,
    severity,
    ariaLabel: `${reasonText} วิธีแก้: ${fix}`,
  };
}

import type { BuiltSharePackage } from "./sharePackages";
import type { ShareValidationResult } from "./shareValidation";

export type ShareResultState =
  | "draft"
  | "blocked"
  | "publishing"
  | "ready"
  | "verification_failed"
  | "expired"
  | "revoked";

export type ShareResult = {
  state: ShareResultState;
  label: string;
  description: string;
  qrPayload?: string;
  artifactUrl?: string;
  warnings: string[];
  packageMode?: BuiltSharePackage["mode"];
};

export function createShareResult(
  validation: ShareValidationResult,
  packageResult?: BuiltSharePackage,
  publication?: {
    qrPayload?: string;
    artifactUrl?: string;
    warnings?: string[];
    selfVerified?: boolean;
  },
): ShareResult {
  if (!validation.ok) {
    return {
      state: "blocked",
      label: "ยังสร้าง QR ไม่ได้",
      description:
        validation.blockers[0]?.message ?? "ตรวจเงื่อนไขการแชร์ไม่ผ่าน",
      warnings: validation.blockers.map((issue) => issue.fix),
      packageMode: packageResult?.mode,
    };
  }

  if (!packageResult) {
    return {
      state: "draft",
      label: "พร้อมตรวจทานก่อนแชร์",
      description: "ตรวจผู้รับ เอกสาร เงื่อนไขการเปิดอ่าน และข้อมูลที่จะเปิดเผย",
      warnings: validation.warnings.map((issue) => issue.message),
    };
  }

  if (publication?.selfVerified === false) {
    return {
      state: "verification_failed",
      label: "สร้างแล้วแต่ยังตรวจตัวเองไม่ผ่าน",
      description: "อย่าใช้ QR นี้จนกว่าจะตรวจ resolver/signature ได้สำเร็จ",
      qrPayload: publication.qrPayload,
      artifactUrl: publication.artifactUrl,
      warnings: publication.warnings ?? [],
      packageMode: packageResult.mode,
    };
  }

  return {
    state: "ready",
    label: "พร้อมให้สแกน",
    description: "QR นี้ resolve ได้และผ่านการตรวจรูปแบบเบื้องต้นใน Wallet แล้ว",
    qrPayload: publication?.qrPayload,
    artifactUrl: publication?.artifactUrl,
    warnings: publication?.warnings ?? validation.warnings.map((issue) => issue.message),
    packageMode: packageResult.mode,
  };
}

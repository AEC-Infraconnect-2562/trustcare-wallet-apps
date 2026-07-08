import {
  canonicalServiceProfiles,
  type CanonicalDocumentType,
  type SharePackageMode,
} from "./canonicalDocuments";
import type { ReadinessContext } from "./models";
import { getSharePackageCopy } from "./uxCopy";

export type PacketRecommendationInput = {
  context: ReadinessContext;
  selectedDocumentTypes: CanonicalDocumentType[];
  selectedCount: number;
  hasLargeRecordSet?: boolean;
  recipientSupportsShl?: boolean;
  trustcareCertificationAvailable?: boolean;
  containsPatientProvidedUpload?: boolean;
};

export type PacketRecommendation = {
  mode: SharePackageMode;
  label: string;
  description: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  compatible: boolean;
};

const largeDocumentTypes = new Set<CanonicalDocumentType>([
  "immunization",
  "lab_result",
  "diagnostic_report",
  "discharge_summary",
  "claim_package",
  "medical_certificate",
]);

export function recommendSharePacket(
  input: PacketRecommendationInput,
): PacketRecommendation {
  const profile = canonicalServiceProfiles[input.context];
  const selectedCount = input.selectedCount;
  const hasLarge =
    Boolean(input.hasLargeRecordSet) ||
    input.selectedDocumentTypes.some((type) => largeDocumentTypes.has(type)) ||
    selectedCount > 3;
  const wantsCertified =
    profile.defaultSharePackage === "CertifiedSHLManifestPackage" ||
    profile.recommendedWhenLarge === "CertifiedSHLManifestPackage";

  let mode: SharePackageMode;
  const warnings: string[] = [];

  if (selectedCount <= 1 && !hasLarge) {
    mode = "DirectVP";
  } else if (profile.defaultSharePackage === "PurposeVP" && !wantsCertified) {
    mode = "PurposeVP";
  } else if (!hasLarge && !wantsCertified) {
    mode = "PurposeVP";
  } else if (wantsCertified && input.trustcareCertificationAvailable) {
    mode = "CertifiedSHLManifestPackage";
  } else if (input.recipientSupportsShl !== false) {
    mode = "StandardSHL";
    if (wantsCertified) {
      warnings.push(
        "ใช้ SHL มาตรฐานได้ แต่ยังไม่ขึ้นสถานะ TrustCare-certified จนกว่าจะมี Manifest VP และ Holder VC",
      );
    }
  } else {
    mode = "PurposeVP";
    warnings.push(
      "ผู้รับยังไม่รองรับ SHL จึงใช้ VP แทน แม้ชุดข้อมูลนี้อาจมีหลายรายการ",
    );
  }

  if (input.containsPatientProvidedUpload) {
    warnings.push(
      "เอกสารที่ผู้ใช้นำเข้าเองควรถือเป็นหลักฐานรอตรวจ ไม่ใช่เอกสารรับรองที่ issuer ลงนาม",
    );
  }

  const copy = getSharePackageCopy(mode);
  return {
    mode,
    label: copy.label,
    description: copy.description,
    reason: buildRecommendationReason(
      input.context,
      mode,
      selectedCount,
      hasLarge,
    ),
    confidence:
      warnings.length === 0 && selectedCount > 0
        ? "high"
        : selectedCount > 0
          ? "medium"
          : "low",
    warnings,
    compatible: selectedCount > 0,
  };
}

function buildRecommendationReason(
  context: ReadinessContext,
  mode: SharePackageMode,
  selectedCount: number,
  hasLarge: boolean,
): string {
  const serviceLabel = canonicalServiceProfiles[context]?.label ?? context;
  if (!selectedCount) {
    return `ยังไม่มีเอกสารที่เลือกสำหรับ ${serviceLabel}`;
  }
  if (mode === "DirectVP") {
    return "มีเอกสารเดียวและไม่ใช่ชุดข้อมูลขนาดใหญ่ จึงใช้ VP เอกสารเดียวได้ชัดเจนที่สุด";
  }
  if (mode === "PurposeVP") {
    return `${serviceLabel} ใช้เอกสารจำนวนไม่มาก จึงเหมาะกับ VP ตามวัตถุประสงค์และ selective disclosure`;
  }
  if (mode === "CertifiedSHLManifestPackage") {
    return hasLarge
      ? "ชุดข้อมูลมีหลายรายการหรือข้อมูลต่อเนื่อง จึงใช้ SHL เป็น transport และใช้ Manifest VP เป็น trust layer"
      : `${serviceLabel} ต้องตรวจแหล่งที่มาใน TrustCare ecosystem จึงแนะนำ SHL + Manifest VP`;
  }
  return "ชุดข้อมูลมีหลายรายการหรือใช้ต่อเนื่อง จึงเหมาะกับ SMART Health Link มาตรฐาน";
}

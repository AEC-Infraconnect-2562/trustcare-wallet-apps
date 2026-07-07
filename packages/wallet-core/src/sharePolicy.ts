import type { SharePackageMode } from "./canonicalDocuments";
import { recommendSharePacket, type PacketRecommendation } from "./packetRecommendation";
import {
  selectedReadyDocuments,
  type ShareDraft,
} from "./shareDraft";

export type ShareDisclosureMode = "full" | "sd" | "zkp";
export type ShareTimelineAnchor = "record" | "package";

export type ShareAccessPolicy = {
  mode: SharePackageMode;
  disclosureMode: ShareDisclosureMode;
  selectedFields: string[];
  expiryMinutes: number;
  timelineAnchor: ShareTimelineAnchor;
  shl?: {
    passcodeRequired: boolean;
    passcode?: string;
    expiryHours: number;
    maxAccessCount: number;
    longTermAccess?: boolean;
  };
};

export type CreateSharePolicyInput = {
  mode: SharePackageMode;
  disclosureMode?: ShareDisclosureMode;
  selectedFields?: string[];
  expiryMinutes?: number;
  timelineAnchor?: ShareTimelineAnchor;
  shl?: ShareAccessPolicy["shl"];
};

export function createSharePolicy(
  input: CreateSharePolicyInput,
): ShareAccessPolicy {
  return {
    mode: input.mode,
    disclosureMode: input.disclosureMode ?? "sd",
    selectedFields: input.selectedFields ?? [],
    expiryMinutes: input.expiryMinutes ?? 10,
    timelineAnchor: input.timelineAnchor ?? "record",
    shl: input.shl,
  };
}

export function recommendPolicyForDraft(
  draft: ShareDraft,
  options: {
    recipientSupportsShl?: boolean;
    trustcareCertificationAvailable?: boolean;
  } = {},
): PacketRecommendation {
  const selected = selectedReadyDocuments(draft);
  return recommendSharePacket({
    context: draft.context,
    selectedDocumentTypes: selected
      .map((document) => document.documentType)
      .filter(Boolean) as NonNullable<(typeof selected)[number]["documentType"]>[],
    selectedCount: selected.length,
    hasLargeRecordSet: selected.length > 3,
    recipientSupportsShl: options.recipientSupportsShl,
    trustcareCertificationAvailable: options.trustcareCertificationAvailable,
    containsPatientProvidedUpload: selected.some(
      (document) => document.trustStatus === "patient_provided_unverified",
    ),
  });
}

export function shareModePatientLabel(mode: SharePackageMode): string {
  if (mode === "DirectVP") return "QR เอกสารเดียว";
  if (mode === "PurposeVP") return "QR ชุดเอกสารขนาดเล็ก";
  if (mode === "StandardSHL") return "ลิงก์สุขภาพปลอดภัย";
  return "ลิงก์สุขภาพรับรองโดย TrustCare";
}

export function shareModePatientDescription(mode: SharePackageMode): string {
  if (mode === "DirectVP") {
    return "เหมาะเมื่อส่งเอกสารรับรองหนึ่งใบให้ตรวจทันที";
  }
  if (mode === "PurposeVP") {
    return "เหมาะกับ OPD หรือห้องยาที่ใช้เอกสารไม่มากและต้องเลือกเปิดเผยข้อมูล";
  }
  if (mode === "StandardSHL") {
    return "เหมาะกับชุดข้อมูลขนาดใหญ่หรือข้อมูลต่อเนื่อง และยังใช้ร่วมกับระบบที่รองรับ SMART Health Links";
  }
  return "เหมาะกับการส่งต่อ เคลม หรือข้ามเครือข่ายที่ต้องให้ TrustCare verifier ตรวจ Manifest VP และ Holder VC";
}

export function modeRequiresShl(mode: SharePackageMode): boolean {
  return mode === "StandardSHL" || mode === "CertifiedSHLManifestPackage";
}

export function modeRequiresVp(mode: SharePackageMode): boolean {
  return mode === "DirectVP" || mode === "PurposeVP" || mode === "CertifiedSHLManifestPackage";
}

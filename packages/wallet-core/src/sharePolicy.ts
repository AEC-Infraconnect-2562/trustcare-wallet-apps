import type { SharePackageMode } from "./canonicalDocuments";
import {
  recommendSharePacket,
  type PacketRecommendation,
} from "./packetRecommendation";
import { selectedReadyDocuments, type ShareDraft } from "./shareDraft";

export type ShareDisclosureMode = "full" | "sd" | "zkp";
export type ShareDisclosureIntent =
  "minimum_necessary" | "custom_selection" | "complete_documents";
export type ShareDisclosureMechanism =
  "whole_credential" | "sd_jwt_presentation" | "derived_proof";

export type ShareCredentialDisclosureCapability = {
  credentialId: string;
  canDeriveSelectiveDisclosure?: boolean;
  canCreateDerivedProof?: boolean;
  recipientAcceptsSelectiveDisclosure?: boolean;
  recipientAcceptsDerivedProof?: boolean;
};

export type ShareDisclosureResolution = {
  intent: ShareDisclosureIntent;
  disclosureMode: ShareDisclosureMode;
  selectedFields: string[];
  mechanism: ShareDisclosureMechanism;
  credentials: Array<{
    credentialId: string;
    mechanism: ShareDisclosureMechanism;
  }>;
  requiresWholeDocumentConsent: boolean;
  patientLabel: string;
  patientDescription: string;
  warnings: string[];
};
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

export function resolveShareDisclosureIntent(input: {
  intent: ShareDisclosureIntent;
  selectedFields?: string[];
  credentials: ShareCredentialDisclosureCapability[];
  predicateProofRequested?: boolean;
}): ShareDisclosureResolution {
  const selectedFields = Array.from(
    new Set(
      (input.selectedFields ?? []).map((field) => field.trim()).filter(Boolean),
    ),
  );
  const credentialIds = input.credentials.map((item) => item.credentialId);

  if (input.intent === "complete_documents") {
    return disclosureResolution({
      intent: input.intent,
      credentialIds,
      disclosureMode: "full",
      selectedFields: ["full_vc"],
      mechanism: "whole_credential",
      requiresWholeDocumentConsent: false,
      patientLabel: "ส่งเอกสารที่เลือกทั้งฉบับ",
      patientDescription: "ผู้รับจะเห็นข้อมูลทั้งหมดภายในเอกสารที่คุณเลือก",
    });
  }

  const allSupportDerivedProof =
    Boolean(input.predicateProofRequested) &&
    input.credentials.length > 0 &&
    input.credentials.every(
      (item) =>
        item.canCreateDerivedProof === true &&
        item.recipientAcceptsDerivedProof === true,
    );
  if (allSupportDerivedProof) {
    return disclosureResolution({
      intent: input.intent,
      credentialIds,
      disclosureMode: "zkp",
      selectedFields,
      mechanism: "derived_proof",
      requiresWholeDocumentConsent: false,
      patientLabel: "ยืนยันเฉพาะเงื่อนไขที่จำเป็น",
      patientDescription: "ระบบจะยืนยันผลตามคำขอโดยไม่ส่งค่าข้อมูลต้นฉบับ",
    });
  }

  const allSupportSelectiveDisclosure =
    selectedFields.length > 0 &&
    input.credentials.length > 0 &&
    input.credentials.every(
      (item) =>
        item.canDeriveSelectiveDisclosure === true &&
        item.recipientAcceptsSelectiveDisclosure === true,
    );
  if (allSupportSelectiveDisclosure) {
    return disclosureResolution({
      intent: input.intent,
      credentialIds,
      disclosureMode: "sd",
      selectedFields,
      mechanism: "sd_jwt_presentation",
      requiresWholeDocumentConsent: false,
      patientLabel: "แชร์เฉพาะข้อมูลที่เลือก",
      patientDescription:
        "ผู้ออกเอกสารและผู้รับรองรับการเปิดเผยเฉพาะข้อมูลที่จำเป็น",
    });
  }

  const documentCount = input.credentials.length;
  const warnings = documentCount
    ? [
        `เอกสาร ${documentCount} ใบยังไม่รองรับการเลือกเฉพาะข้อมูล ระบบจึงส่งเอกสารที่เลือกทั้งฉบับ`,
      ]
    : ["ยังไม่ได้เลือกเอกสารสำหรับการแชร์"];
  return disclosureResolution({
    intent: input.intent,
    credentialIds,
    disclosureMode: "full",
    selectedFields: ["full_vc"],
    mechanism: "whole_credential",
    requiresWholeDocumentConsent: documentCount > 0,
    patientLabel: "ส่งเอกสารที่เลือกทั้งฉบับ",
    patientDescription:
      "ระบบไม่ลดทอนข้อมูลภายใน credential โดยไม่ได้รับความสามารถจากผู้ออกเอกสาร",
    warnings,
  });
}

function disclosureResolution(input: {
  intent: ShareDisclosureIntent;
  credentialIds: string[];
  disclosureMode: ShareDisclosureMode;
  selectedFields: string[];
  mechanism: ShareDisclosureMechanism;
  requiresWholeDocumentConsent: boolean;
  patientLabel: string;
  patientDescription: string;
  warnings?: string[];
}): ShareDisclosureResolution {
  return {
    intent: input.intent,
    disclosureMode: input.disclosureMode,
    selectedFields: input.selectedFields,
    mechanism: input.mechanism,
    credentials: input.credentialIds.map((credentialId) => ({
      credentialId,
      mechanism: input.mechanism,
    })),
    requiresWholeDocumentConsent: input.requiresWholeDocumentConsent,
    patientLabel: input.patientLabel,
    patientDescription: input.patientDescription,
    warnings: input.warnings ?? [],
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
      .filter(Boolean) as NonNullable<
      (typeof selected)[number]["documentType"]
    >[],
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
    return "เหมาะกับ OPD หรือห้องยาที่ใช้เอกสารจำนวนไม่มากในครั้งเดียว";
  }
  if (mode === "StandardSHL") {
    return "เหมาะกับชุดข้อมูลขนาดใหญ่หรือข้อมูลต่อเนื่อง และยังใช้ร่วมกับระบบที่รองรับ SMART Health Links";
  }
  return "เหมาะกับการส่งต่อ เคลม หรือข้ามเครือข่ายที่ต้องให้ verifier ตรวจ holder VP และ Manifest Credential ของโรงพยาบาล";
}

export function modeRequiresShl(mode: SharePackageMode): boolean {
  return mode === "StandardSHL" || mode === "CertifiedSHLManifestPackage";
}

export function modeRequiresVp(mode: SharePackageMode): boolean {
  return (
    mode === "DirectVP" ||
    mode === "PurposeVP" ||
    mode === "CertifiedSHLManifestPackage"
  );
}

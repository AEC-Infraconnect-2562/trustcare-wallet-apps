import {
  canonicalServiceProfiles,
  normalizeDocumentType,
  type CanonicalDocumentType,
} from "./canonicalDocuments";
import {
  buildDocumentRequestPlan,
  type DocumentRequestFormat,
  type DocumentRequestRequirement,
  type DocumentRequestSource,
} from "./documentRequestFlow";
import type {
  ReadinessContext,
  ReadinessRequirement,
  ReadinessResult,
} from "./models";
import {
  getDocumentFormatCopy,
  getDocumentSourceCopy,
  getTrustStateCopy,
  type TrustUiState,
} from "./uxCopy";

export type PurposePickerCardModel = {
  context: ReadinessContext;
  label: string;
  labelEn: string;
  purpose: string;
  selected: boolean;
  primaryDocumentTypes: CanonicalDocumentType[];
  ariaLabel: string;
};

export type ReadinessSummaryModel = {
  context: ReadinessContext;
  label: string;
  score: number;
  readyText: string;
  requiredText: string;
  recommendedText: string;
  criticalReady: boolean;
  missingRequiredCount: number;
  missingRecommendedCount: number;
  primaryCtaLabel: string;
  primaryCtaDisabledReason?: string;
};

export type MissingDocumentCardModel = {
  key: string;
  label: string;
  labelEn: string;
  required: boolean;
  documentTypes: CanonicalDocumentType[];
  source: DocumentRequestSource;
  sourceLabel: string;
  format: DocumentRequestFormat;
  formatLabel: string;
  primaryActionLabel: string;
  helperText: string;
  ariaLabel: string;
};

export type ImportDetectionModel = {
  format: DocumentRequestFormat | "unknown";
  formatLabel: string;
  trustState: TrustUiState;
  trustLabel: string;
  trustDescription: string;
  recommendedAction: string;
  canImport: boolean;
  technicalHint?: string;
};

export function buildPurposePickerCards(
  selectedContext: ReadinessContext,
): PurposePickerCardModel[] {
  return Object.values(canonicalServiceProfiles).map((profile) => ({
    context: profile.context,
    label: profile.label,
    labelEn: profile.labelEn,
    purpose: profile.purpose,
    selected: profile.context === selectedContext,
    primaryDocumentTypes: unique(
      profile.requirements.flatMap((requirement) => requirement.documentTypes),
    ).slice(0, 4),
    ariaLabel: `${profile.label}: ${profile.purpose}`,
  }));
}

export function buildReadinessSummary(
  readiness: Pick<
    ReadinessResult,
    | "context"
    | "label"
    | "score"
    | "criticalReady"
    | "requiredReady"
    | "requiredTotal"
    | "recommendedReady"
    | "recommendedTotal"
    | "missing"
  >,
): ReadinessSummaryModel {
  const missingRequiredCount = readiness.missing.filter(
    (item) => item.required,
  ).length;
  const missingRecommendedCount = readiness.missing.filter(
    (item) => !item.required,
  ).length;
  const criticalReady = Boolean(readiness.criticalReady);
  return {
    context: readiness.context,
    label: readiness.label,
    score: readiness.score,
    criticalReady,
    missingRequiredCount,
    missingRecommendedCount,
    readyText: criticalReady
      ? "เอกสารจำเป็นพร้อมสำหรับบริการนี้"
      : `ยังขาดเอกสารจำเป็น ${missingRequiredCount} รายการ`,
    requiredText: `จำเป็น ${readiness.requiredReady}/${readiness.requiredTotal}`,
    recommendedText: `แนะนำ ${readiness.recommendedReady}/${readiness.recommendedTotal}`,
    primaryCtaLabel: criticalReady ? "ไปหน้าแชร์เอกสาร" : "ขอเอกสารที่ขาด",
    primaryCtaDisabledReason: undefined,
  };
}

export function buildMissingDocumentCards(
  context: ReadinessContext,
  requirements: ReadonlyArray<
    ReadinessRequirement | DocumentRequestRequirement
  >,
): MissingDocumentCardModel[] {
  return requirements.map((requirement) => {
    const normalized = normalizeRequirement(requirement);
    const plan = buildDocumentRequestPlan({
      context,
      requirements: [normalized],
    });
    const source = plan.selectedSource;
    const format = plan.selectedFormat;
    const sourceCopy = getDocumentSourceCopy(source);
    const formatCopy = getDocumentFormatCopy(format);
    const requiredText = normalized.required ? "เอกสารจำเป็น" : "เอกสารแนะนำ";
    return {
      key: normalized.key,
      label: normalized.label,
      labelEn: normalized.labelEn ?? normalized.key,
      required: Boolean(normalized.required),
      documentTypes: [...normalized.documentTypes],
      source,
      sourceLabel: sourceCopy.label,
      format,
      formatLabel: formatCopy.label,
      primaryActionLabel:
        source === "patient_upload" ? "นำเข้าเอกสารนี้" : "ขอเอกสารนี้",
      helperText: `${requiredText} · ${sourceCopy.label} · ${formatCopy.label}`,
      ariaLabel: `${normalized.label}: ${requiredText}, ${sourceCopy.label}, ${formatCopy.label}`,
    };
  });
}

export function detectImportPayload(value: string): ImportDetectionModel {
  const trimmed = value.trim();
  if (!trimmed) {
    return unknownDetection("ยังไม่มีข้อมูลให้ตรวจ");
  }
  if (/^shlink:\/|#shlink:\//i.test(trimmed)) {
    return detection(
      "standard_shl",
      "transport_verified_only",
      "ตรวจ SHL manifest และบันทึกเป็นลิงก์สุขภาพ",
      "ระบบจะอ่าน manifest ตาม SHL spec และแยกสถานะ TrustCare-certified อีกชั้น",
    );
  }
  if (/openid-credential-offer:\/\//i.test(trimmed)) {
    return detection(
      "oid4vci_offer",
      "pending_review",
      "รับ credential offer จากผู้ออกเอกสาร",
      "ต้องให้ issuer ลงนามและ Wallet ตรวจ proof ก่อนขึ้นสถานะใช้งานได้",
    );
  }
  if (/openid4vp:\/\//i.test(trimmed) || /vp[_-]/i.test(trimmed)) {
    return detection(
      "vc_vp",
      "verified_active_vc",
      "เปิด verifier flow หรือบันทึก VP ที่ตรวจได้",
      "ถ้าเป็น resolver URL ระบบต้อง fetch payload จาก gateway ก่อนตรวจ signature",
    );
  }
  if (/^\s*\{/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const resourceType = String(parsed.resourceType ?? "");
      const type = JSON.stringify(parsed.type ?? "");
      if (resourceType === "Bundle") {
        return detection(
          "fhir_bundle",
          "pending_review",
          "ตรวจ FHIR Bundle และจัดเก็บเป็น evidence",
          "Bundle ยังไม่ใช่ VC จนกว่า trusted issuer จะลงนาม",
        );
      }
      if (resourceType === "DocumentReference") {
        return detection(
          "fhir_document_reference",
          "pending_review",
          "ตรวจ DocumentReference และแนบไฟล์หลักฐาน",
          "DocumentReference จากผู้ใช้ต้องรอ issuer ตรวจรับรอง",
        );
      }
      if (
        type.includes("VerifiableCredential") ||
        type.includes("VerifiablePresentation")
      ) {
        return detection(
          "vc_vp",
          "verified_active_vc",
          "ตรวจ VC/VP และบันทึกเข้ากระเป๋า",
          "ระบบจะตรวจ issuer, status, proof และ subject binding",
        );
      }
    } catch {
      return unknownDetection("JSON ไม่สมบูรณ์หรืออ่านไม่ได้");
    }
  }
  if (/\.pdf($|\?)/i.test(trimmed) || /^data:image\//i.test(trimmed)) {
    return detection(
      "pdf_image",
      "pending_review",
      "นำเข้าเป็นหลักฐานรอตรวจรับรอง",
      "ไฟล์นี้ยังไม่ใช่ credential ที่ตรวจลายเซ็นได้",
    );
  }
  return unknownDetection("รูปแบบนี้ยังไม่อยู่ในรายการที่ Wallet รองรับ");
}

function detection(
  format: DocumentRequestFormat,
  trustState: TrustUiState,
  recommendedAction: string,
  technicalHint?: string,
): ImportDetectionModel {
  const formatCopy = getDocumentFormatCopy(format);
  const trustCopy = getTrustStateCopy(trustState);
  return {
    format,
    formatLabel: formatCopy.label,
    trustState,
    trustLabel: trustCopy.label,
    trustDescription: trustCopy.description,
    recommendedAction,
    canImport:
      trustState !== "unknown_format" && trustState !== "subject_mismatch",
    technicalHint,
  };
}

function unknownDetection(message: string): ImportDetectionModel {
  const trustCopy = getTrustStateCopy("unknown_format");
  return {
    format: "unknown",
    formatLabel: "ไม่รู้จักรูปแบบ",
    trustState: "unknown_format",
    trustLabel: trustCopy.label,
    trustDescription: message,
    recommendedAction: "ตรวจสอบไฟล์ QR หรือ payload อีกครั้ง",
    canImport: false,
  };
}

function normalizeRequirement(
  requirement: ReadinessRequirement | DocumentRequestRequirement,
): DocumentRequestRequirement {
  const source = requirement as ReadinessRequirement &
    DocumentRequestRequirement;
  const rawTypes = source.documentTypes ?? source.cardTypes ?? [];
  const documentTypes = rawTypes
    .map((type) => normalizeDocumentType(type))
    .filter(Boolean) as CanonicalDocumentType[];
  return {
    key: source.key,
    label: source.label,
    labelEn: source.labelEn,
    required: source.required,
    category: source.category,
    action: source.action,
    sourceHint: source.sourceHint,
    documentTypes: unique(documentTypes),
  };
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

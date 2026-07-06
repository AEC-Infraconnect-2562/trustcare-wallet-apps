import {
  CANONICAL_DOCUMENT_CATEGORIES,
  normalizeDocumentType,
  type CanonicalDocumentCategory
} from "./canonicalDocuments";
import type { WalletCard, WalletCardsByCategory } from "./models";
import type { WalletDemoUser } from "./demoData";
import { TRUSTCARE_PORTAL_WEB_ORIGIN } from "./portalSyncData";

export type TrustCarePortalWalletCard = {
  id?: number | string | null;
  patientId?: number | string | null;
  credentialId?: number | string | null;
  cardType?: string | null;
  displayName?: string | null;
  displayNameEn?: string | null;
  issuerHospitalName?: string | null;
  documentCategory?: string | null;
  isPinned?: boolean | null;
  lastPresentedAt?: string | null;
  createdAt?: string | null;
  patientAvatarUrl?: string | null;
  credentialStatus?: string | null;
  expiresAt?: string | null;
  credentialData?: unknown;
  credentialType?: string | null;
  issuedAt?: string | null;
};

export type PortalCredentialImportSkipReason =
  | "metadata_only"
  | "unknown_document_type"
  | "invalid_credential_data";

export type PortalCredentialImportSkippedCard = {
  portalCardId?: number | string | null;
  credentialId?: number | string | null;
  cardType?: string | null;
  displayName?: string | null;
  reason: PortalCredentialImportSkipReason;
};

export type PortalWalletSyncReport = {
  ownerUserId: string;
  portalOpenId: string;
  portalCardCount: number;
  importedCredentialCount: number;
  metadataOnlyCount: number;
  skipped: PortalCredentialImportSkippedCard[];
  source: "trustcare_portal_demo_login" | "trustcare_portal_external_api";
  sourceUrl: string;
  syncedAt: string;
  warnings: string[];
};

export type PortalWalletImportResult = {
  cards: WalletCard[];
  cardsByCategory: WalletCardsByCategory;
  report: PortalWalletSyncReport;
};

type PortalCardGroup = Record<string, TrustCarePortalWalletCard[]>;

export function normalizeTrustCarePortalWalletCards(input: {
  owner: WalletDemoUser;
  groupedCards: PortalCardGroup;
  sourceUrl?: string;
  source?: PortalWalletSyncReport["source"];
  syncedAt?: string;
  portalOrigin?: string;
}): PortalWalletImportResult {
  const portalCards = Object.values(input.groupedCards).flat();
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const skipped: PortalCredentialImportSkippedCard[] = [];
  const cards: WalletCard[] = [];
  const seenCredentialIds = new Set<string>();

  for (const portalCard of portalCards) {
    const credentialData = portalCard.credentialData;
    const documentType = normalizeDocumentType(portalCard.cardType ?? portalCard.credentialType);
    if (!documentType) {
      skipped.push(skip(portalCard, "unknown_document_type"));
      continue;
    }
    if (credentialData == null) {
      skipped.push(skip(portalCard, "metadata_only"));
      continue;
    }
    if (!isRecord(credentialData)) {
      skipped.push(skip(portalCard, "invalid_credential_data"));
      continue;
    }

    const credentialId = String(
      credentialData.id ??
        portalCard.credentialId ??
        `${documentType}:${String(portalCard.id ?? cards.length + 1)}`
    );
    if (seenCredentialIds.has(credentialId)) continue;
    seenCredentialIds.add(credentialId);

    cards.push(portalCardToWalletCard({
      owner: input.owner,
      portalCard,
      credentialData,
      documentType,
      cardIndex: cards.length + 1,
      portalOrigin: input.portalOrigin ?? TRUSTCARE_PORTAL_WEB_ORIGIN,
      syncedAt
    }));
  }

  const cardsByCategory = cards.reduce<WalletCardsByCategory>((acc, card) => {
    const key = card.documentCategory || "clinical_summary";
    acc[key] = [...(acc[key] ?? []), card];
    return acc;
  }, {});

  const metadataOnlyCount = skipped.filter(item => item.reason === "metadata_only").length;
  const report: PortalWalletSyncReport = {
    ownerUserId: input.owner.id,
    portalOpenId: input.owner.portalOpenId ?? input.owner.id,
    portalCardCount: portalCards.length,
    importedCredentialCount: cards.length,
    metadataOnlyCount,
    skipped,
    source: input.source ?? "trustcare_portal_demo_login",
    sourceUrl: input.sourceUrl ?? `${TRUSTCARE_PORTAL_WEB_ORIGIN}/api/trpc/wallet.cardsByCategory`,
    syncedAt,
    warnings: skipped.length
      ? [`Portal ส่งการ์ด ${portalCards.length} รายการ แต่มี credentialData จริง ${cards.length} รายการ; ${metadataOnlyCount} รายการยังเป็น metadata-only`]
      : []
  };

  return { cards, cardsByCategory, report };
}

function portalCardToWalletCard(input: {
  owner: WalletDemoUser;
  portalCard: TrustCarePortalWalletCard;
  credentialData: Record<string, unknown>;
  documentType: string;
  cardIndex: number;
  portalOrigin: string;
  syncedAt: string;
}): WalletCard {
  const credentialSubject = isRecord(input.credentialData.credentialSubject)
    ? input.credentialData.credentialSubject
    : {};
  const issuer = isRecord(input.credentialData.issuer) ? input.credentialData.issuer : {};
  const credentialTypes = Array.isArray(input.credentialData.type)
    ? input.credentialData.type.filter(item => typeof item === "string")
    : [];
  const cardId = numericCardId(input.portalCard.id, input.owner.cardBase + input.cardIndex);
  const issuedAt = stringValue(input.portalCard.issuedAt ?? input.credentialData.validFrom);
  const expiresAt = stringValue(input.portalCard.expiresAt ?? input.credentialData.validUntil);

  return {
    id: cardId,
    cardType: input.documentType,
    displayName: stringValue(input.portalCard.displayName) ?? labelFromCredential(input.documentType),
    displayNameEn: stringValue(input.portalCard.displayNameEn) ?? englishLabelFromCredential(input.documentType),
    documentCategory: normalizePortalCategory(input.portalCard.documentCategory, input.documentType),
    credentialId: stringValue(input.credentialData.id ?? input.portalCard.credentialId) ?? String(cardId),
    credentialStatus: stringValue(input.portalCard.credentialStatus) ?? statusFromCredentialData(input.credentialData),
    credentialType: stringValue(input.portalCard.credentialType) ?? credentialTypes.at(-1) ?? input.documentType,
    issuerHospitalName: stringValue(input.portalCard.issuerHospitalName ?? issuer.nameTh ?? issuer.name),
    issuerDid: stringValue(issuer.id),
    holderDid: stringValue(credentialSubject.id) ?? input.owner.holderDid,
    patientAvatarUrl: absolutePortalAssetUrl(
      stringValue(input.portalCard.patientAvatarUrl) ??
        extractSubjectPhotoUrl(credentialSubject) ??
        input.owner.avatarUrl,
      input.portalOrigin
    ),
    ownerUserId: input.owner.id,
    patientId: input.portalCard.patientId ?? input.owner.patientId,
    sourceSystem: "trustcare_portal",
    scopeLabel: "Sync จริงจาก TrustCare Portal test user",
    issuedAt,
    expiresAt,
    createdAt: stringValue(input.portalCard.createdAt) ?? issuedAt ?? input.syncedAt,
    lastPresentedAt: stringValue(input.portalCard.lastPresentedAt),
    pinned: Boolean(input.portalCard.isPinned),
    credentialData: input.credentialData
  };
}

function normalizePortalCategory(value: string | null | undefined, documentType: string): CanonicalDocumentCategory {
  const normalized = value?.trim();
  if (normalized && (CANONICAL_DOCUMENT_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as CanonicalDocumentCategory;
  }
  if (documentType === "shl_manifest" || documentType === "sync_receipt") return "sharing_and_sync";
  if (documentType === "staff_identity" || documentType === "patient_identity" || documentType === "consent_receipt" || documentType === "mpi_link_certificate") return "identity_and_access";
  if (documentType === "medication_summary" || documentType === "prescription" || documentType === "pharmacy_dispense") return "medication_and_pharmacy";
  if (documentType === "lab_result" || documentType === "diagnostic_report") return "diagnostics_and_results";
  if (documentType === "referral_vc" || documentType === "discharge_summary") return "care_transition";
  if (documentType === "insurance_eligibility" || documentType === "claim_package" || documentType === "claim_receipt") return "claims_and_finance";
  if (documentType === "travel_document_verification" || documentType === "visa_support_letter" || documentType === "quotation" || documentType === "guarantee_letter") return "medical_tourism";
  if (documentType === "appointment") return "operations";
  return "clinical_summary";
}

function statusFromCredentialData(credentialData: Record<string, unknown>): string {
  const status = credentialData.credentialStatus;
  if (isRecord(status) && typeof status.status === "string") return status.status;
  return "unknown";
}

function labelFromCredential(documentType: string): string {
  const labels: Record<string, string> = {
    patient_identity: "บัตรประจำตัวผู้ป่วย",
    staff_identity: "บัตรประจำตัวเจ้าหน้าที่โรงพยาบาล",
    patient_summary: "สรุปข้อมูลผู้ป่วย",
    allergy_alert: "แจ้งเตือนการแพ้",
    medication_summary: "สรุปรายการยา",
    prescription: "ใบสั่งยา",
    pharmacy_dispense: "บันทึกจ่ายยา",
    lab_result: "ผลตรวจแล็บ",
    diagnostic_report: "รายงานผลวินิจฉัย",
    medical_certificate: "ใบรับรองแพทย์",
    referral_vc: "ใบส่งต่อการรักษา",
    insurance_eligibility: "สิทธิประกันสุขภาพ",
    shl_manifest: "เอกสารกำกับ Smart Health Link",
    sync_receipt: "หลักฐาน Sync กลับ HIS"
  };
  return labels[documentType] ?? documentType;
}

function englishLabelFromCredential(documentType: string): string {
  return documentType
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function skip(portalCard: TrustCarePortalWalletCard, reason: PortalCredentialImportSkipReason): PortalCredentialImportSkippedCard {
  return {
    portalCardId: portalCard.id,
    credentialId: portalCard.credentialId,
    cardType: portalCard.cardType,
    displayName: portalCard.displayName,
    reason
  };
}

function numericCardId(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSubjectPhotoUrl(subject: Record<string, unknown>): string | null {
  for (const key of ["patient", "staff", "holder"]) {
    const value = subject[key];
    if (!isRecord(value)) continue;
    const photoUrl = stringValue(value.photoUrl ?? value.avatarUrl);
    if (photoUrl) return photoUrl;
  }
  const humanDocument = subject.humanDocument;
  if (isRecord(humanDocument)) {
    const renderData = humanDocument.renderData;
    if (isRecord(renderData)) {
      const patient = renderData.patient;
      if (isRecord(patient)) {
        const photoUrl = stringValue(patient.photoUrl ?? patient.avatarUrl);
        if (photoUrl) return photoUrl;
      }
    }
  }
  return null;
}

function absolutePortalAssetUrl(value: string | null, portalOrigin: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/manus-storage/")) {
    return `${portalOrigin.replace(/\/$/, "")}/api/storage-proxy/${value.replace(/^\/manus-storage\//, "")}`;
  }
  if (value.startsWith("/")) return `${portalOrigin.replace(/\/$/, "")}${value}`;
  return value;
}

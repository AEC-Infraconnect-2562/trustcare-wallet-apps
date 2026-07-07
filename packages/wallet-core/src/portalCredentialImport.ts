import {
  CANONICAL_DOCUMENT_CATEGORIES,
  normalizeDocumentType,
  type CanonicalDocumentCategory
} from "./canonicalDocuments";
import type { PresentationHistoryItem, WalletCard, WalletCardsByCategory } from "./models";
import type { WalletDemoUser } from "./demoData";
import { normalizePhotoUrl } from "./photoSources";
import { TRUSTCARE_PORTAL_WEB_ORIGIN } from "./portalSyncData";

export type TrustCarePortalCredentialProof = {
  type?: string | null;
  format?: string | null;
  jwt?: string | null;
  sdJwt?: string | null;
  sdJwtVc?: string | null;
  token?: string | null;
  signedCredential?: string | null;
  alg?: string | null;
  kid?: string | null;
  disclosures?: unknown;
  selectiveDisclosure?: unknown;
  [key: string]: unknown;
};

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
  proof?: TrustCarePortalCredentialProof | TrustCarePortalCredentialProof[] | unknown;
  jwt?: string | null;
  sdJwt?: string | null;
  sdJwtVc?: string | null;
  credentialJwt?: string | null;
  signedCredential?: string | null;
  credentialEnvelope?: unknown;
  credentialType?: string | null;
  issuedAt?: string | null;
};

export type TrustCarePortalWalletPresentation = {
  id?: number | string | null;
  presentationId?: number | string | null;
  verifierName?: string | null;
  verifier?: string | null;
  recipient?: string | null;
  purpose?: string | null;
  context?: string | null;
  verificationResult?: string | null;
  status?: string | null;
  presentedAt?: string | null;
  createdAt?: string | null;
  issuedAt?: string | null;
  presentationData?: unknown;
  vpData?: unknown;
  payload?: unknown;
};

export type PortalCredentialImportSkipReason =
  | "metadata_only"
  | "unknown_document_type"
  | "invalid_credential_data"
  | "out_of_scope";

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
  source:
    | "trustcare_portal_demo_login"
    | "trustcare_portal_external_api"
    | "trustcare_portal_wallet_sync";
  sourceUrl: string;
  syncedAt: string;
  warnings: string[];
};

export type PortalWalletImportResult = {
  cards: WalletCard[];
  cardsByCategory: WalletCardsByCategory;
  presentations: PresentationHistoryItem[];
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
  includeTrustArtifacts?: boolean;
  presentations?: TrustCarePortalWalletPresentation[];
}): PortalWalletImportResult {
  const portalCards = Object.values(input.groupedCards).flat();
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const skipped: PortalCredentialImportSkippedCard[] = [];
  const cards: WalletCard[] = [];
  const seenCredentialIds = new Set<string>();

  for (const portalCard of portalCards) {
    const credentialData = portalCard.credentialData;
    if (credentialData == null) {
      skipped.push(skip(portalCard, "metadata_only"));
      continue;
    }
    if (!isRecord(credentialData)) {
      skipped.push(skip(portalCard, "invalid_credential_data"));
      continue;
    }
    const documentType = portalDocumentType(portalCard, credentialData, input.owner);
    if (!documentType) {
      skipped.push(skip(portalCard, "unknown_document_type"));
      continue;
    }
    if (input.includeTrustArtifacts === false && isPortalTrustArtifact(documentType)) {
      skipped.push(skip(portalCard, "out_of_scope"));
      continue;
    }
    if (!isVcLikeCredentialData(credentialData)) {
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
  const presentations = normalizePortalPresentations(input.presentations ?? [], syncedAt);
  const report: PortalWalletSyncReport = {
    ownerUserId: input.owner.id,
    portalOpenId: input.owner.portalOpenId ?? input.owner.id,
    portalCardCount: portalCards.length,
    importedCredentialCount: cards.length,
    metadataOnlyCount,
    skipped,
    source: input.source ?? "trustcare_portal_demo_login",
    sourceUrl: input.sourceUrl ?? `${TRUSTCARE_PORTAL_WEB_ORIGIN}/api/wallet/sync`,
    syncedAt,
    warnings: skipped.length
      ? [`Portal ส่งการ์ด ${portalCards.length} รายการ และนำเข้า VC scope นี้ ${cards.length} รายการ; metadata-only ${metadataOnlyCount} รายการ; ข้าม ${skipped.filter(item => item.reason === "out_of_scope").length} trust artifacts`]
      : []
  };

  return { cards, cardsByCategory, presentations, report };
}

export function normalizeTrustCarePortalWalletSync(input: {
  owner: WalletDemoUser;
  credentials: TrustCarePortalWalletCard[];
  presentations?: TrustCarePortalWalletPresentation[];
  sourceUrl?: string;
  source?: PortalWalletSyncReport["source"];
  syncedAt?: string;
  portalOrigin?: string;
  includeTrustArtifacts?: boolean;
}): PortalWalletImportResult {
  return normalizeTrustCarePortalWalletCards({
    owner: input.owner,
    groupedCards: { wallet_sync: input.credentials },
    presentations: input.presentations,
    source: input.source,
    sourceUrl: input.sourceUrl,
    syncedAt: input.syncedAt,
    portalOrigin: input.portalOrigin,
    includeTrustArtifacts: input.includeTrustArtifacts
  });
}

function portalDocumentType(
  portalCard: TrustCarePortalWalletCard,
  credentialData: Record<string, unknown>,
  owner: WalletDemoUser
): string | null {
  const subject = isRecord(credentialData.credentialSubject) ? credentialData.credentialSubject : {};
  const credentialTypes = Array.isArray(credentialData.type)
    ? credentialData.type.filter(item => typeof item === "string")
    : [];
  const rawType =
    stringValue(portalCard.cardType) ??
    stringValue(portalCard.credentialType) ??
    stringValue(subject.documentType) ??
    credentialTypes.find(item => item.endsWith("Credential")) ??
    null;
  const normalized = normalizeDocumentType(rawType);
  const looksLikeStaff =
    owner.role === "staff" ||
    credentialTypes.some(item => /staff|hospitalstaff/i.test(item)) ||
    /staff|เจ้าหน้าที่/i.test(String(portalCard.displayName ?? ""));
  if (normalized === "patient_identity" && looksLikeStaff) return "staff_identity";
  return normalized;
}

function isPortalTrustArtifact(documentType: string): boolean {
  return documentType === "shl_manifest" || documentType === "sync_receipt";
}

function isVcLikeCredentialData(credentialData: Record<string, unknown>): boolean {
  const types = Array.isArray(credentialData.type)
    ? credentialData.type.filter(item => typeof item === "string")
    : [];
  return types.includes("VerifiableCredential") || isRecord(credentialData.credentialSubject);
}

function normalizePortalPresentations(
  presentations: TrustCarePortalWalletPresentation[],
  syncedAt: string
): PresentationHistoryItem[] {
  return presentations.map((presentation, index) => {
    const payload = firstRecord(
      presentation.presentationData,
      presentation.vpData,
      presentation.payload
    );
    const presentationId =
      stringValue(presentation.presentationId) ??
      stringValue(payload?.id) ??
      `portal-vp-${index + 1}`;
    return {
      id: stringValue(presentation.id) ?? presentationId,
      presentationId,
      verifierName:
        stringValue(presentation.verifierName) ??
        stringValue(presentation.verifier) ??
        stringValue(presentation.recipient) ??
        "TrustCare Portal VP",
      purpose:
        stringValue(presentation.purpose) ??
        stringValue(presentation.context) ??
        "wallet_sync",
      verificationResult:
        stringValue(presentation.verificationResult) ??
        stringValue(presentation.status) ??
        "valid",
      presentedAt:
        stringValue(presentation.presentedAt) ??
        stringValue(presentation.createdAt) ??
        stringValue(presentation.issuedAt) ??
        syncedAt,
      createdAt: stringValue(presentation.createdAt) ?? syncedAt,
      payload: payload ?? presentation
    };
  });
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
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
  const credentialProof = credentialProofFromPortalCard(input.portalCard);

  return {
    id: cardId,
    cardType: input.documentType,
    displayName: stringValue(input.portalCard.displayName) ?? labelFromCredential(input.documentType),
    displayNameEn: stringValue(input.portalCard.displayNameEn) ?? englishLabelFromCredential(input.documentType),
    documentCategory: normalizePortalCategory(input.portalCard.documentCategory, input.documentType),
    credentialId: stringValue(input.credentialData.id ?? input.portalCard.credentialId) ?? String(cardId),
    credentialStatus: stringValue(input.portalCard.credentialStatus) ?? statusFromCredentialData(input.credentialData),
    credentialJwt: credentialProof?.jwt ?? credentialJwtFromPortalCard(input.portalCard),
    credentialProof,
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

function credentialJwtFromPortalCard(portalCard: TrustCarePortalWalletCard): string | null {
  const direct =
    stringValue(portalCard.jwt) ??
    stringValue(portalCard.sdJwt) ??
    stringValue(portalCard.sdJwtVc) ??
    stringValue(portalCard.credentialJwt) ??
    stringValue(portalCard.signedCredential);
  if (direct) return direct;
  if (isRecord(portalCard.credentialEnvelope)) {
    return stringValue(
      portalCard.credentialEnvelope.jwt ??
        portalCard.credentialEnvelope.sdJwt ??
        portalCard.credentialEnvelope.sdJwtVc ??
        portalCard.credentialEnvelope.signedCredential
    );
  }
  return null;
}

function credentialProofFromPortalCard(
  portalCard: TrustCarePortalWalletCard
): WalletCard["credentialProof"] {
  const proofRecord = firstPortalProofRecord(portalCard.proof);
  const envelope = isRecord(portalCard.credentialEnvelope) ? portalCard.credentialEnvelope : null;
  const envelopeProof = firstPortalProofRecord(envelope?.proof);
  const sourceProof = proofRecord ?? envelopeProof;
  const proofJwt = jwtFromProofRecord(sourceProof);
  const jwt =
    proofJwt ??
    credentialJwtFromPortalCard(portalCard);
  if (!jwt && !sourceProof) return null;
  return {
    type: stringValue(sourceProof?.type) ?? (jwt ? "jwt" : null),
    format: stringValue(sourceProof?.format) ?? stringValue(sourceProof?.proofFormat),
    jwt,
    alg: stringValue(sourceProof?.alg) ?? stringValue(sourceProof?.algorithm),
    kid: stringValue(sourceProof?.kid) ?? stringValue(sourceProof?.keyId),
    disclosures: sourceProof?.disclosures,
    selectiveDisclosure:
      sourceProof?.selectiveDisclosure ??
      sourceProof?.sdClaims ??
      sourceProof?.claims,
    source: proofJwt ? "trustcare_portal_sync_proof" : "trustcare_portal_legacy_envelope"
  };
}

function firstPortalProofRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (Array.isArray(value)) {
    return value.find(isRecord) ?? null;
  }
  return null;
}

function jwtFromProofRecord(proof: Record<string, unknown> | null): string | null {
  if (!proof) return null;
  return stringValue(
    proof.jwt ??
      proof.sdJwt ??
      proof.sdJwtVc ??
      proof.token ??
      proof.signedCredential
  );
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
  for (const key of ["patient", "staff", "holder", "person", "subject", "profile", "identity"]) {
    const value = subject[key];
    if (!isRecord(value)) continue;
    const demographics = isRecord(value.demographics) ? value.demographics : {};
    const photo = isRecord(value.photo) ? value.photo : {};
    const avatar = isRecord(value.avatar) ? value.avatar : {};
    const photoUrl = stringValue(
      value.photoUrl ??
        value.avatarUrl ??
        value.imageUrl ??
        value.profileImageUrl ??
        value.portraitUrl ??
        demographics.photoUrl ??
        demographics.avatarUrl ??
        photo.url ??
        avatar.url
    );
    if (photoUrl) return photoUrl;
  }
  const directPhotoUrl = stringValue(subject.photoUrl ?? subject.avatarUrl);
  if (directPhotoUrl) return directPhotoUrl;
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
  if (portalOrigin.replace(/\/$/, "") === TRUSTCARE_PORTAL_WEB_ORIGIN) {
    return normalizePhotoUrl(value);
  }
  const base = portalOrigin.replace(/\/$/, "");
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const proxyPrefix = "/api/storage-proxy/";
      if (parsed.pathname.startsWith(proxyPrefix)) {
        const fileName = parsed.pathname.slice(proxyPrefix.length);
        return `${parsed.origin}/manus-storage/${fileName}`;
      }
    } catch {
      return value;
    }
    return value;
  }
  if (value.startsWith("/api/storage-proxy/")) {
    return `${base}/manus-storage/${value.replace(/^\/api\/storage-proxy\//, "")}`;
  }
  if (value.startsWith("/manus-storage/")) {
    return `${base}${value}`;
  }
  if (value.startsWith("/")) return `${base}${value}`;
  return value;
}

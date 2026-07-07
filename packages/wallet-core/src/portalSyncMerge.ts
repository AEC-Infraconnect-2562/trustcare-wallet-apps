import { normalizeDocumentType } from "./canonicalDocuments";
import { hashJson } from "./demoResolvers";
import type { WalletCard, WalletCardsByCategory, WalletStoredObject } from "./models";
import { sortIdentityFirst } from "./sorting";

export type PortalKnownCredential = {
  credentialId: string;
  cardType: string;
  lineageKey: string;
  version?: number | string;
  issuedAt?: string | null;
  updatedAt?: string | null;
  contentHash: string;
  status?: string | null;
};

export type WalletSyncMergeReport = {
  incoming: number;
  active: number;
  added: number;
  updated: number;
  unchanged: number;
  staleIgnored: number;
  archived: number;
};

export type WalletSyncMergeResult = {
  cards: WalletCard[];
  cardsByCategory: WalletCardsByCategory;
  archivedObjects: WalletStoredObject[];
  report: WalletSyncMergeReport;
};

type IndexedCard = {
  card: WalletCard;
  lineageKey: string;
  version: number | string | null;
  time: number;
  fingerprint: string;
};

export function buildPortalKnownCredentials(cards: WalletCard[]): PortalKnownCredential[] {
  return cards
    .filter((card) => card.sourceSystem === "trustcare_portal")
    .map((card) => ({
      credentialId: String(card.credentialId),
      cardType: normalizedDocumentType(card),
      lineageKey: credentialLineageKey(card),
      version: credentialVersion(card) ?? undefined,
      issuedAt: card.issuedAt ?? null,
      updatedAt: credentialUpdatedAt(card),
      contentHash: credentialFingerprint(card),
      status: card.credentialStatus ?? null,
    }));
}

export function mergePortalSyncedCards(input: {
  existingCards: WalletCard[];
  incomingCards: WalletCard[];
  archivedObjects?: WalletStoredObject[];
  syncedAt?: string;
}): WalletSyncMergeResult {
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const existingByLineage = new Map<string, IndexedCard>();
  const activeByLineage = new Map<string, WalletCard>();
  const archivedObjects = [...(input.archivedObjects ?? [])];
  const report: WalletSyncMergeReport = {
    incoming: input.incomingCards.length,
    active: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    staleIgnored: 0,
    archived: 0,
  };

  for (const card of input.existingCards) {
    const indexed = indexCard(card);
    existingByLineage.set(indexed.lineageKey, indexed);
    activeByLineage.set(indexed.lineageKey, card);
  }

  for (const incoming of input.incomingCards) {
    const next = indexCard(incoming);
    const current = existingByLineage.get(next.lineageKey);
    if (!current) {
      activeByLineage.set(next.lineageKey, incoming);
      existingByLineage.set(next.lineageKey, next);
      report.added += 1;
      continue;
    }

    const comparison = compareCredentialVersion(next, current);
    if (comparison === "stale") {
      report.staleIgnored += 1;
      continue;
    }

    if (next.fingerprint === current.fingerprint && comparison === "same") {
      activeByLineage.set(next.lineageKey, mergeRefreshedMetadata(current.card, incoming));
      existingByLineage.set(next.lineageKey, indexCard(activeByLineage.get(next.lineageKey)!));
      report.unchanged += 1;
      continue;
    }

    archivedObjects.push(archivedCredentialObject(current.card, incoming, syncedAt));
    activeByLineage.set(next.lineageKey, incoming);
    existingByLineage.set(next.lineageKey, next);
    report.updated += 1;
    report.archived += 1;
  }

  const cards = sortIdentityFirst(Array.from(activeByLineage.values()));
  report.active = cards.length;
  return {
    cards,
    cardsByCategory: groupCardsByCategory(cards),
    archivedObjects: dedupeArchivedObjects(archivedObjects),
    report,
  };
}

export function groupCardsByCategory(cards: WalletCard[]): WalletCardsByCategory {
  return cards.reduce<WalletCardsByCategory>((groups, card) => {
    const category = card.documentCategory || "clinical_summary";
    groups[category] = [...(groups[category] ?? []), card];
    return groups;
  }, {});
}

function indexCard(card: WalletCard): IndexedCard {
  return {
    card,
    lineageKey: credentialLineageKey(card),
    version: credentialVersion(card),
    time: credentialTime(card),
    fingerprint: credentialFingerprint(card),
  };
}

function credentialLineageKey(card: WalletCard): string {
  const data = record(card.credentialData);
  const subject = record(data.credentialSubject);
  const evidence = firstRecord(data.evidence);
  const documentReference = record(
    evidence?.documentReference ??
      evidence?.fhirDocumentReference ??
      subject.documentReference,
  );
  const lineageId =
    stringValue(subject.trustcareLineageId) ??
    stringValue(subject.lineageId) ??
    stringValue(subject.documentReferenceId) ??
    stringValue(documentReference.id) ??
    stringValue(subject.documentId) ??
    stringValue(subject.carepassId) ??
    stringValue(subject.trustcareSubjectId) ??
    stringValue(card.credentialId);
  return [
    card.ownerUserId ?? "unknown-owner",
    card.sourceSystem ?? "unknown-source",
    normalizedDocumentType(card),
    card.issuerDid ?? "unknown-issuer",
    card.holderDid ?? "unknown-holder",
    lineageId,
  ].join("|");
}

function credentialVersion(card: WalletCard): number | string | null {
  const data = record(card.credentialData);
  const subject = record(data.credentialSubject);
  const evidence = firstRecord(data.evidence);
  const candidates = [
    data.version,
    data.credentialVersion,
    data.renderedVersion,
    data.schemaVersion,
    subject.version,
    subject.credentialVersion,
    evidence?.version,
    evidence?.versionId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function credentialUpdatedAt(card: WalletCard): string | null {
  const data = record(card.credentialData);
  const subject = record(data.credentialSubject);
  return (
    stringValue(data.updatedAt) ??
    stringValue(data.modifiedAt) ??
    stringValue(subject.updatedAt) ??
    card.lastPresentedAt ??
    card.issuedAt ??
    card.createdAt ??
    null
  );
}

function credentialTime(card: WalletCard): number {
  const value = credentialUpdatedAt(card);
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function credentialFingerprint(card: WalletCard): string {
  return hashJson({
    credentialId: card.credentialId,
    cardType: normalizedDocumentType(card),
    status: card.credentialStatus,
    credentialData: card.credentialData,
    credentialJwt: card.credentialJwt,
    proofJwt: card.credentialProof?.jwt,
  });
}

function compareCredentialVersion(
  incoming: IndexedCard,
  existing: IndexedCard,
): "newer" | "same" | "stale" {
  const versionComparison = compareVersionValue(incoming.version, existing.version);
  if (versionComparison > 0) return "newer";
  if (versionComparison < 0) return "stale";
  if (incoming.fingerprint === existing.fingerprint) return "same";
  if (incoming.time > existing.time) return "newer";
  if (incoming.time < existing.time) return "stale";
  return "newer";
}

function compareVersionValue(
  incoming: number | string | null,
  existing: number | string | null,
): number {
  if (incoming == null || existing == null) return 0;
  const incomingNumber = numericVersion(incoming);
  const existingNumber = numericVersion(existing);
  if (incomingNumber != null && existingNumber != null) return incomingNumber - existingNumber;
  return String(incoming).localeCompare(String(existing), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function numericVersion(value: number | string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function mergeRefreshedMetadata(existing: WalletCard, incoming: WalletCard): WalletCard {
  return {
    ...existing,
    credentialStatus: incoming.credentialStatus,
    portalVerification: incoming.portalVerification ?? existing.portalVerification,
    credentialProof: incoming.credentialProof ?? existing.credentialProof,
    credentialJwt: incoming.credentialJwt ?? existing.credentialJwt,
    lastPresentedAt: incoming.lastPresentedAt ?? existing.lastPresentedAt,
  };
}

function archivedCredentialObject(
  previous: WalletCard,
  replacement: WalletCard,
  syncedAt: string,
): WalletStoredObject {
  const previousVersion = credentialVersion(previous);
  const replacementVersion = credentialVersion(replacement);
  return {
    id: `vc-archive:${credentialLineageKey(previous)}:${credentialFingerprint(previous)}`,
    type: "vc",
    title: `${previous.displayName} (เวอร์ชันเดิม)`,
    subtitle: [
      previous.displayNameEn,
      previousVersion != null ? `v${previousVersion}` : null,
      replacementVersion != null ? `แทนที่ด้วย v${replacementVersion}` : "แทนที่ด้วย credential ใหม่",
    ]
      .filter(Boolean)
      .join(" · "),
    status: "superseded",
    protocol: "trustcare",
    createdAt: syncedAt,
    expiresAt: previous.expiresAt,
    source: previous.issuerDid ?? previous.issuerHospitalName ?? undefined,
    payload: {
      archivedReason: "portal_sync_newer_version",
      archivedAt: syncedAt,
      previousCredential: { ...previous, credentialStatus: "superseded" },
      replacementCredentialId: replacement.credentialId,
      previousVersion,
      replacementVersion,
      previousFingerprint: credentialFingerprint(previous),
      replacementFingerprint: credentialFingerprint(replacement),
    },
  };
}

function dedupeArchivedObjects(objects: WalletStoredObject[]): WalletStoredObject[] {
  const map = new Map<string, WalletStoredObject>();
  for (const object of objects) map.set(object.id, object);
  return Array.from(map.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function normalizedDocumentType(card: Pick<WalletCard, "cardType">): string {
  return normalizeDocumentType(card.cardType) ?? card.cardType;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (Array.isArray(value)) return value.find(isRecord) ?? null;
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

import {
  canonicalServiceProfiles,
  isTrustArtifactDocumentType,
  normalizeDocumentType,
  type CanonicalDocumentCategory,
  type CanonicalDocumentType,
} from "./canonicalDocuments";
import type { ReadinessContext, ReadinessResult, WalletCard } from "./models";

export type ShareDraftSource =
  "prepare" | "manual" | "single_document" | "oid4vp_request";

export type ShareDraftDocumentStatus =
  "ready" | "missing" | "unsupported" | "locked";

export type ShareDraftDocumentTrust =
  | "issuer_signed"
  | "patient_provided_unverified"
  | "trust_artifact"
  | "pending_trustcare_binding";

export type ShareDraftDocument = {
  key: string;
  requirementKey?: string;
  label: string;
  labelEn: string;
  documentType: CanonicalDocumentType | null;
  category: CanonicalDocumentCategory | string;
  required: boolean;
  selected: boolean;
  locked: boolean;
  status: ShareDraftDocumentStatus;
  trustStatus: ShareDraftDocumentTrust;
  sourceHint?: string;
  card?: WalletCard;
  cardId?: number;
};

export type ShareDraft = {
  id: string;
  source: ShareDraftSource;
  context: ReadinessContext;
  contextLabel: string;
  contextLabelEn: string;
  ownerUserId?: string;
  holderDid?: string;
  recipient?: string;
  purpose: string;
  createdAt: string;
  documents: ShareDraftDocument[];
  lockedDocumentKeys: string[];
  lockedFields: string[];
  sourceRequestId?: string;
};

export type CreateShareDraftInput = {
  source?: ShareDraftSource;
  context: ReadinessContext;
  cards: WalletCard[];
  readiness?: ReadinessResult;
  selectedCardIds?: Array<number | string>;
  ownerUserId?: string;
  holderDid?: string;
  recipient?: string;
  purpose?: string;
  lockedCardIds?: Array<number | string>;
  lockedFields?: string[];
  sourceRequestId?: string;
  now?: string;
};

export function createShareDraft(input: CreateShareDraftInput): ShareDraft {
  const profile = canonicalServiceProfiles[input.context];
  const selectedIds = new Set((input.selectedCardIds ?? []).map(String));
  const lockedIds = new Set((input.lockedCardIds ?? []).map(String));
  const createdAt = input.now ?? new Date().toISOString();
  const documents = input.readiness
    ? draftDocumentsFromReadiness(input.readiness, selectedIds, lockedIds)
    : draftDocumentsFromCards(input.cards, selectedIds, lockedIds);

  return {
    id: `share_draft_${hashDraftSeed({
      source: input.source ?? "manual",
      context: input.context,
      ownerUserId: input.ownerUserId,
      holderDid: input.holderDid,
      cards: documents.map((document) => document.key),
      createdAt,
    })}`,
    source: input.source ?? "manual",
    context: input.context,
    contextLabel: profile.label,
    contextLabelEn: profile.labelEn,
    ownerUserId: input.ownerUserId,
    holderDid: input.holderDid,
    recipient: input.recipient,
    purpose: input.purpose ?? profile.label,
    createdAt,
    documents,
    lockedDocumentKeys: documents
      .filter((document) => document.locked)
      .map((document) => document.key),
    lockedFields: input.lockedFields ?? [],
    sourceRequestId: input.sourceRequestId,
  };
}

export function createShareDraftFromPrepare(
  input: Omit<CreateShareDraftInput, "source">,
): ShareDraft {
  return createShareDraft({ ...input, source: "prepare" });
}

export function selectedReadyDocuments(
  draft: ShareDraft,
): ShareDraftDocument[] {
  return draft.documents.filter(
    (document) => document.selected && document.status === "ready",
  );
}

export function missingRequiredDocuments(
  draft: ShareDraft,
): ShareDraftDocument[] {
  return draft.documents.filter(
    (document) => document.required && document.status === "missing",
  );
}

export function optionalMissingDocuments(
  draft: ShareDraft,
): ShareDraftDocument[] {
  return draft.documents.filter(
    (document) => !document.required && document.status === "missing",
  );
}

function draftDocumentsFromReadiness(
  readiness: ReadinessResult,
  selectedIds: Set<string>,
  lockedIds: Set<string>,
): ShareDraftDocument[] {
  const documents: ShareDraftDocument[] = [];
  const documentsByCardId = new Map<string, ShareDraftDocument>();
  for (const requirement of readiness.ready) {
    for (const card of requirement.matchedCards) {
      const cardId = String(card.id);
      const existing = documentsByCardId.get(cardId);
      if (existing) {
        existing.required = existing.required || requirement.required;
        existing.locked = existing.locked || lockedIds.has(cardId);
        if (existing.locked) existing.status = "locked";
        existing.selected = existing.selected || selectedIds.has(cardId);
        if (!existing.label.split(" / ").includes(requirement.label)) {
          existing.label = `${existing.label} / ${requirement.label}`;
        }
        if (!existing.labelEn.split(" / ").includes(requirement.labelEn)) {
          existing.labelEn = `${existing.labelEn} / ${requirement.labelEn}`;
        }
        continue;
      }
      const documentType = normalizeDocumentType(card.cardType);
      const document: ShareDraftDocument = {
        key: `${requirement.key}:${card.id}`,
        requirementKey: requirement.key,
        label: requirement.label,
        labelEn: requirement.labelEn,
        documentType,
        category: requirement.category,
        required: requirement.required,
        selected: selectedIds.size === 0 || selectedIds.has(String(card.id)),
        locked: lockedIds.has(String(card.id)),
        status: lockedIds.has(String(card.id)) ? "locked" : "ready",
        trustStatus: trustStatusForCard(card),
        sourceHint: requirement.sourceHint,
        card,
        cardId: card.id,
      };
      documents.push(document);
      documentsByCardId.set(cardId, document);
    }
  }

  for (const requirement of readiness.missing) {
    documents.push({
      key: `${requirement.key}:missing`,
      requirementKey: requirement.key,
      label: requirement.label,
      labelEn: requirement.labelEn,
      documentType: null,
      category: requirement.category,
      required: requirement.required,
      selected: false,
      locked: false,
      status: "missing",
      trustStatus: "pending_trustcare_binding",
      sourceHint: requirement.sourceHint,
    });
  }
  return documents;
}

function draftDocumentsFromCards(
  cards: WalletCard[],
  selectedIds: Set<string>,
  lockedIds: Set<string>,
): ShareDraftDocument[] {
  return cards.map((card) => {
    const documentType = normalizeDocumentType(card.cardType);
    return {
      key: `card:${card.id}`,
      label: card.displayName,
      labelEn: card.displayNameEn ?? card.displayName,
      documentType,
      category: card.documentCategory,
      required: false,
      selected: selectedIds.size === 0 || selectedIds.has(String(card.id)),
      locked: lockedIds.has(String(card.id)),
      status: documentType ? "ready" : "unsupported",
      trustStatus: trustStatusForCard(card),
      sourceHint: card.sourceSystem ?? undefined,
      card,
      cardId: card.id,
    } satisfies ShareDraftDocument;
  });
}

function trustStatusForCard(card: WalletCard): ShareDraftDocumentTrust {
  if (isTrustArtifactDocumentType(card.cardType)) return "trust_artifact";
  if (String(card.credentialStatus ?? "active") === "unverified") {
    return "patient_provided_unverified";
  }
  if (!card.issuerDid && card.sourceSystem !== "trustcare_portal") {
    return "pending_trustcare_binding";
  }
  return "issuer_signed";
}

function hashDraftSeed(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

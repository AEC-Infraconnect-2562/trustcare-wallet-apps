import {
  normalizeDocumentType,
  walletDocumentRecordFromCard,
  type CanonicalDocumentType,
} from "../canonicalDocuments";
import type { ReadinessContext, WalletCard } from "../models";
import { recommendedSharePackageMode } from "../sharePackages";
import type { ClaimEvidencePackage } from "./types";

export type ClaimEvidencePackageBuildInput = {
  packageId?: string;
  payerId: string;
  patientId: string;
  context: "insurance_claim" | "cross_border" | "medical_tourist";
  cards: WalletCard[];
  selectedCardIds?: Array<number | string>;
  consentReceiptId: string;
  expiresAt?: string;
  createdAt?: string;
  createdBy?: string;
};

export function buildClaimEvidencePackage(
  input: ClaimEvidencePackageBuildInput,
): ClaimEvidencePackage {
  const selectedCards = selectCards(input.cards, input.selectedCardIds);
  const records = selectedCards.map(walletDocumentRecordFromCard);
  const documentTypes = unique(
    records.map((record) => record.documentType),
  ) as CanonicalDocumentType[];
  const shareContext = shareContextForPayer(input.context);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();

  return {
    evidencePackageId:
      input.packageId ??
      `claim_pkg_${stableSuffix([
        input.payerId,
        input.patientId,
        input.context,
        input.consentReceiptId,
        expiresAt,
        records.map((record) => ({
          credentialId: record.credentialId,
          credentialData: record.credentialData,
        })),
      ])}`,
    payerId: input.payerId,
    patientId: input.patientId,
    context: input.context,
    documentIds: records.map((record) => record.credentialId),
    documentTypes,
    documentReferences: records.map((record) => record.documentReference),
    cards: selectedCards,
    recommendedPackageMode: recommendedSharePackageMode(
      shareContext,
      records.length,
    ),
    consentReceiptId: input.consentReceiptId,
    createdAt,
    expiresAt,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    warnings:
      records.length === 0
        ? ["No documents selected for payer evidence package."]
        : undefined,
  };
}

export function normalizePayerEvidenceDocumentType(
  value: string | null | undefined,
): CanonicalDocumentType | null {
  return normalizeDocumentType(value);
}

function selectCards(
  cards: WalletCard[],
  selectedCardIds?: Array<number | string>,
): WalletCard[] {
  if (!selectedCardIds?.length) return cards;
  const selected = new Set(selectedCardIds.map(String));
  return cards.filter((card) => selected.has(String(card.id)));
}

function shareContextForPayer(
  context: ClaimEvidencePackageBuildInput["context"],
): ReadinessContext {
  return context;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function stableSuffix(parts: unknown[]): string {
  const source = JSON.stringify(parts);
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

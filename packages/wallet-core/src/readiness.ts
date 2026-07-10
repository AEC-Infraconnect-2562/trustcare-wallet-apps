import type {
  ReadinessContext,
  ReadinessRequirement,
  ReadinessResult,
  WalletCard,
} from "./models";
import {
  canonicalServiceProfiles,
  isTrustArtifactDocumentType,
  normalizeDocumentType,
  readinessRequirementsFromProfiles,
} from "./canonicalDocuments";
import { canPresentCredential } from "./statusTone";

export const readinessContextLabels: Record<
  ReadinessContext,
  { th: string; en: string; purpose: string }
> = Object.fromEntries(
  Object.entries(canonicalServiceProfiles).map(([context, profile]) => [
    context,
    { th: profile.label, en: profile.labelEn, purpose: profile.purpose },
  ]),
) as Record<ReadinessContext, { th: string; en: string; purpose: string }>;

export const readinessContextValues = Object.keys(
  readinessContextLabels,
) as ReadinessContext[];

export const readinessRequirements: Record<
  ReadinessContext,
  ReadinessRequirement[]
> = readinessRequirementsFromProfiles();

const readinessRequirementTypeSets = Object.fromEntries(
  Object.entries(readinessRequirements).map(([context, requirements]) => [
    context,
    requirements.map((requirement) => ({
      ...requirement,
      acceptableTypes: new Set(
        requirement.cardTypes
          .map((type) => normalizeDocumentType(type))
          .filter((type): type is NonNullable<typeof type> => Boolean(type)),
      ),
    })),
  ]),
) as Record<
  ReadinessContext,
  Array<ReadinessRequirement & { acceptableTypes: Set<string> }>
>;

export function assessLocalReadiness(
  cards: WalletCard[],
  context: ReadinessContext,
): ReadinessResult {
  const requirements = readinessRequirementTypeSets[context];
  const activeCardsByType = new Map<string, WalletCard[]>();
  for (const card of cards) {
    if (
      !canPresentCredential(card) ||
      isTrustArtifactDocumentType(card.cardType)
    ) {
      continue;
    }
    const type = normalizeDocumentType(card.cardType);
    if (!type) continue;
    const bucket = activeCardsByType.get(type);
    if (bucket) bucket.push(card);
    else activeCardsByType.set(type, [card]);
  }
  const ready: ReadinessResult["ready"] = [];
  const missing: ReadinessResult["missing"] = [];
  const selectedCardIds = new Set<number>();
  let requiredTotal = 0;
  let requiredReady = 0;
  let recommendedTotal = 0;
  let recommendedReady = 0;

  for (const requirement of requirements) {
    const { acceptableTypes, ...publicRequirement } = requirement;
    if (requirement.required) requiredTotal += 1;
    else recommendedTotal += 1;

    const matchedCards: WalletCard[] = [];
    for (const type of acceptableTypes) {
      const bucket = activeCardsByType.get(type);
      if (bucket) matchedCards.push(...bucket);
    }
    if (matchedCards.length) {
      const preferredCard = preferredReadinessCard(
        matchedCards,
        Array.from(acceptableTypes),
      );
      if (preferredCard) selectedCardIds.add(preferredCard.id);
      ready.push({ ...publicRequirement, status: "ready", matchedCards });
      if (requirement.required) requiredReady += 1;
      else recommendedReady += 1;
    } else {
      missing.push({ ...publicRequirement, status: "missing" });
    }
  }

  const requiredScore = requiredTotal ? requiredReady / requiredTotal : 1;
  const recommendedScore = recommendedTotal
    ? recommendedReady / recommendedTotal
    : 1;
  const score = Math.round(
    (requiredScore * 0.8 + recommendedScore * 0.2) * 100,
  );
  const label = readinessContextLabels[context];

  return {
    context,
    label: label.th,
    labelEn: label.en,
    score,
    criticalReady: requiredReady === requiredTotal,
    requiredTotal,
    requiredReady,
    recommendedTotal,
    recommendedReady,
    ready,
    missing,
    selectedCardIds: Array.from(selectedCardIds),
    recommendedActions: missing.map((item) => item.action),
  };
}

export function cardsSelectedByReadiness(
  cards: WalletCard[],
  readiness: Pick<ReadinessResult, "selectedCardIds">,
): WalletCard[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return readiness.selectedCardIds.flatMap((id) => {
    const card = cardsById.get(id);
    return card ? [card] : [];
  });
}

function preferredReadinessCard(
  cards: WalletCard[],
  acceptableTypes: string[],
): WalletCard | undefined {
  const typePriority = new Map(
    acceptableTypes.map((type, index) => [type, index]),
  );
  return [...cards].sort((left, right) => {
    const leftType = normalizeDocumentType(left.cardType) ?? left.cardType;
    const rightType = normalizeDocumentType(right.cardType) ?? right.cardType;
    const priorityDifference =
      (typePriority.get(leftType) ?? Number.MAX_SAFE_INTEGER) -
      (typePriority.get(rightType) ?? Number.MAX_SAFE_INTEGER);
    if (priorityDifference) return priorityDifference;

    const proofDifference =
      Number(hasIssuerProof(right)) - Number(hasIssuerProof(left));
    if (proofDifference) return proofDifference;

    const recencyDifference = cardTimestamp(right) - cardTimestamp(left);
    if (recencyDifference) return recencyDifference;
    return String(left.credentialId).localeCompare(String(right.credentialId));
  })[0];
}

function hasIssuerProof(card: WalletCard): boolean {
  return Boolean(card.credentialProof?.jwt ?? card.credentialJwt);
}

function cardTimestamp(card: WalletCard): number {
  const value = Date.parse(card.issuedAt ?? card.createdAt);
  return Number.isFinite(value) ? value : 0;
}

export function credentialTypeForDocument(documentType: string): string {
  const normalizedType = normalizeDocumentType(documentType) ?? documentType;
  return `${normalizedType
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("")}Credential`;
}

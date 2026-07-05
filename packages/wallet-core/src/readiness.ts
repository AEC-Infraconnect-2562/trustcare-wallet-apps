import type { ReadinessContext, ReadinessRequirement, ReadinessResult, WalletCard } from "./models";
import {
  canonicalServiceProfiles,
  isTrustArtifactDocumentType,
  normalizeDocumentType,
  readinessRequirementsFromProfiles
} from "./canonicalDocuments";

export const readinessContextLabels: Record<ReadinessContext, { th: string; en: string; purpose: string }> = Object.fromEntries(
  Object.entries(canonicalServiceProfiles).map(([context, profile]) => [
    context,
    { th: profile.label, en: profile.labelEn, purpose: profile.purpose }
  ])
) as Record<ReadinessContext, { th: string; en: string; purpose: string }>;

export const readinessContextValues = Object.keys(readinessContextLabels) as ReadinessContext[];

export const readinessRequirements: Record<ReadinessContext, ReadinessRequirement[]> = readinessRequirementsFromProfiles();

export function assessLocalReadiness(cards: WalletCard[], context: ReadinessContext): ReadinessResult {
  const requirements = readinessRequirements[context];
  const activeCards = cards.filter(card => String(card.credentialStatus ?? "active") === "active" && !isTrustArtifactDocumentType(card.cardType));
  const ready: ReadinessResult["ready"] = [];
  const missing: ReadinessResult["missing"] = [];
  const selectedCardIds = new Set<number>();

  for (const requirement of requirements) {
    const acceptableTypes = new Set(requirement.cardTypes.map(type => normalizeDocumentType(type)).filter(Boolean));
    const matchedCards = activeCards.filter(card => {
      const type = normalizeDocumentType(card.cardType);
      return Boolean(type && acceptableTypes.has(type));
    });
    if (matchedCards.length) {
      matchedCards.forEach(card => selectedCardIds.add(card.id));
      ready.push({ ...requirement, status: "ready", matchedCards });
    } else {
      missing.push({ ...requirement, status: "missing" });
    }
  }

  const requiredTotal = requirements.filter(item => item.required).length;
  const requiredReady = ready.filter(item => item.required).length;
  const recommendedTotal = requirements.filter(item => !item.required).length;
  const recommendedReady = ready.filter(item => !item.required).length;
  const requiredScore = requiredTotal ? requiredReady / requiredTotal : 1;
  const recommendedScore = recommendedTotal ? recommendedReady / recommendedTotal : 1;
  const score = Math.round((requiredScore * 0.8 + recommendedScore * 0.2) * 100);
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
    recommendedActions: missing.map(item => item.action)
  };
}

export function credentialTypeForDocument(documentType: string): string {
  const normalizedType = normalizeDocumentType(documentType) ?? documentType;
  return `${normalizedType
    .split("_")
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("")}Credential`;
}

import type { WalletCard } from "./models";
import { identityCredentialTypes } from "./credentialTypes";

const identitySet = new Set<string>(identityCredentialTypes);

export function sortIdentityFirst<T extends Pick<WalletCard, "cardType" | "createdAt">>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    const aIdentity = identitySet.has(a.cardType) ? 0 : 1;
    const bIdentity = identitySet.has(b.cardType) ? 0 : 1;
    if (aIdentity !== bIdentity) return aIdentity - bIdentity;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function flattenCardsByCategory(grouped: Record<string, WalletCard[]> | undefined): WalletCard[] {
  if (!grouped) return [];
  return sortIdentityFirst(Object.values(grouped).flat());
}

export function countCardsByCategory(grouped: Record<string, WalletCard[]> | undefined): Record<string, number> {
  if (!grouped) return {};
  return Object.fromEntries(Object.entries(grouped).map(([category, cards]) => [category, cards.length]));
}


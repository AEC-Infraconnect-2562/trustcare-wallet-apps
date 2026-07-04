import type { WalletCard } from "./models";

export type PhotoCandidate = {
  label: string;
  url: string;
};

export function getValueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

export function photoCandidatesForCard(card: WalletCard): PhotoCandidate[] {
  const candidates: PhotoCandidate[] = [];
  if (card.patientAvatarUrl) candidates.push({ label: "wallet_cards.patientAvatarUrl", url: card.patientAvatarUrl });
  const data = card.credentialData;
  const embeddedPaths = [
    "credentialSubject.patient.photoUrl",
    "credentialSubject.patient.avatarUrl",
    "credentialSubject.photoUrl",
    "patient.photoUrl",
    "photoUrl"
  ];
  for (const path of embeddedPaths) {
    const value = getValueAtPath(data, path);
    if (typeof value === "string" && value) candidates.push({ label: path, url: value });
  }
  return candidates;
}

export function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "TC";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}


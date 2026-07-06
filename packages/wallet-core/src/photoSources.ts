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
  if (card.patientAvatarUrl) {
    candidates.push({
      label: "wallet_cards.patientAvatarUrl",
      url: normalizePhotoUrl(card.patientAvatarUrl),
    });
  }
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
    if (typeof value === "string" && value) {
      candidates.push({ label: path, url: normalizePhotoUrl(value) });
    }
  }
  return candidates;
}

export function normalizePhotoUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const portalOrigin = "https://trustcarehealth.live";
  const storageProxyPath = "/api/storage-proxy/";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith(storageProxyPath)) {
        return `${parsed.origin}/manus-storage/${parsed.pathname.slice(storageProxyPath.length)}`;
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  if (trimmed.startsWith(storageProxyPath)) {
    return `${portalOrigin}/manus-storage/${trimmed.slice(storageProxyPath.length)}`;
  }
  if (trimmed.startsWith("/manus-storage/")) {
    return `${portalOrigin}${trimmed}`;
  }
  return trimmed;
}

export function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "TC";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

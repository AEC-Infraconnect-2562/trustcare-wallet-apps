import type { WalletCard } from "./models";
import { normalizeDocumentType } from "./canonicalDocuments";
import walletExchangeConfig from "../../../config/wallet-exchange-v2.json";

export type PhotoCandidate = {
  label: string;
  url: string;
};

const TRUSTCARE_PORTAL_ORIGIN = walletExchangeConfig.portalBaseUrl;
const STORAGE_PROXY_PATH = "/api/storage-proxy/";
const MANUS_STORAGE_PATH = "/manus-storage/";

export function getValueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

export function photoCandidatesForCard(card: WalletCard): PhotoCandidate[] {
  const data = card.credentialData;
  const documentType = normalizeDocumentType(card.cardType) ?? card.cardType;
  const embeddedPaths = photoPathsForDocumentType(documentType);
  for (const path of embeddedPaths) {
    const candidates = photoCandidatesFromValue(
      path,
      getValueAtPath(data, path),
    );
    if (candidates.length) return candidates;
  }

  return photoCandidatesFromValue(
    "wallet_cards.patientAvatarUrl",
    card.patientAvatarUrl,
  );
}

function photoPathsForDocumentType(documentType: string): string[] {
  const prefixes =
    documentType === "staff_identity"
      ? [
          "credentialSubject.humanDocument.renderData.staff",
          "credentialSubject.staff",
          "staff",
          // Some Portal staff credentials use the legacy renderData.patient
          // slot for the staff subject. Keep the same resolution order as the
          // shared renderer so the displayed name and portrait stay bound.
          "credentialSubject.humanDocument.renderData.patient",
          "credentialSubject.patient",
          "patient",
        ]
      : [
          "credentialSubject.humanDocument.renderData.patient",
          "credentialSubject.patient",
          "patient",
          "credentialSubject.holder",
          "credentialSubject.staff",
          "credentialSubject.student",
        ];
  const suffixes = [
    "photoUrl",
    "avatarUrl",
    "imageUrl",
    "profileImageUrl",
    "portraitUrl",
    "photo.url",
    "avatar.url",
    "demographics.photoUrl",
    "demographics.avatarUrl",
  ];
  return prefixes.flatMap((prefix) =>
    suffixes.map((suffix) => `${prefix}.${suffix}`),
  );
}

export function normalizePhotoUrl(value: string): string {
  return normalizePhotoUrlCandidates(value)[0] ?? value.trim();
}

export function normalizePhotoUrlCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [trimmed];
  if (/^data:/i.test(trimmed)) return [trimmed];

  const candidates: string[] = [];
  const add = (url: string | null | undefined) => {
    if (!url) return;
    const normalized = url.trim();
    if (normalized && !candidates.includes(normalized))
      candidates.push(normalized);
  };

  const addTrustCareStorageVariants = (
    rawPath: string,
    origin = TRUSTCARE_PORTAL_ORIGIN,
  ) => {
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (path.startsWith(MANUS_STORAGE_PATH)) {
      const fileName = path.slice(MANUS_STORAGE_PATH.length);
      add(`${origin}${MANUS_STORAGE_PATH}${fileName}`);
      add(`${origin}${STORAGE_PROXY_PATH}${fileName}`);
      return;
    }
    if (path.startsWith(STORAGE_PROXY_PATH)) {
      const proxyValue = path
        .slice(STORAGE_PROXY_PATH.length)
        .replace(/^\/+/, "");
      const fileName = proxyValue.startsWith("manus-storage/")
        ? proxyValue.slice("manus-storage/".length)
        : proxyValue;
      add(`${origin}${MANUS_STORAGE_PATH}${fileName}`);
      add(`${origin}${STORAGE_PROXY_PATH}${fileName}`);
      return;
    }
    add(`${origin}${path}`);
  };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.pathname.startsWith(STORAGE_PROXY_PATH) ||
        parsed.pathname.startsWith(MANUS_STORAGE_PATH)
      ) {
        addTrustCareStorageVariants(parsed.pathname, parsed.origin);
        if (parsed.search) {
          add(`${parsed.origin}${parsed.pathname}${parsed.search}`);
        }
        add(trimmed);
        return candidates;
      }
      add(trimmed);
      return candidates;
    } catch {
      add(trimmed);
      return candidates;
    }
  }

  if (
    trimmed.startsWith(STORAGE_PROXY_PATH) ||
    trimmed.startsWith(MANUS_STORAGE_PATH)
  ) {
    addTrustCareStorageVariants(trimmed);
    return candidates;
  }

  if (/^[\w.-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(trimmed)) {
    const fileName = trimmed.replace(/^\/+/, "");
    add(`${TRUSTCARE_PORTAL_ORIGIN}${MANUS_STORAGE_PATH}${fileName}`);
    add(`${TRUSTCARE_PORTAL_ORIGIN}${STORAGE_PROXY_PATH}${fileName}`);
  }

  add(trimmed);
  return candidates;
}

export function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "TC";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function photoCandidatesFromValue(
  label: string,
  value: unknown,
): PhotoCandidate[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return dedupePhotoCandidates(
    normalizePhotoUrlCandidates(value).map((url, index) => ({
      label: index === 0 ? label : `${label}:candidate:${index + 1}`,
      url,
    })),
  );
}

function dedupePhotoCandidates(candidates: PhotoCandidate[]): PhotoCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

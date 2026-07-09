import type { WalletCard } from "./models";

export type PhotoCandidate = {
  label: string;
  url: string;
};

const TRUSTCARE_PORTAL_ORIGIN = "https://trustcarehealth.live";
const STORAGE_PROXY_PATH = "/api/storage-proxy/";
const MANUS_STORAGE_PATH = "/manus-storage/";
const TRUSTCARE_PORTAL_LOCAL_PHOTO_FALLBACKS: Record<string, string> = {
  "doctor_kriangkrai_b6bcdefb.jpg": "assets/users/wallet-native-01.png",
  "doctor_napa_abd67502.jpg": "assets/users/wallet-native-02.png",
  "doctor_prasit_2ed84c26.jpg": "assets/users/wallet-native-01.png",
  "doctor_thanawat_f91f7278.jpg": "assets/users/wallet-native-01.png",
  "engineer_piya_eb6aeff4.jpg": "assets/users/wallet-native-01.png",
  "hospadmin_wipa_aeeee791.jpg": "assets/users/wallet-native-02.png",
  "nurse_anucha_e814499a.jpg": "assets/users/wallet-native-01.png",
  "nurse_pimjai_ace1fd06.jpg": "assets/users/wallet-native-02.png",
  "patient_john_williams_b4e9e7f3.jpg": "assets/users/wallet-native-01.png",
  "patient_malee_74d2ef04.jpg": "assets/users/wallet-native-02.png",
  "patient_somsak_a2e00e97.jpg": "assets/users/wallet-native-01.png",
};

export function getValueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

export function photoCandidatesForCard(card: WalletCard): PhotoCandidate[] {
  const candidates: PhotoCandidate[] = [];
  addPhotoCandidates(
    candidates,
    "wallet_cards.patientAvatarUrl",
    card.patientAvatarUrl,
  );
  const data = card.credentialData;
  const embeddedPaths = [
    "credentialSubject.patient.photoUrl",
    "credentialSubject.patient.avatarUrl",
    "credentialSubject.patient.imageUrl",
    "credentialSubject.patient.profileImageUrl",
    "credentialSubject.patient.portraitUrl",
    "credentialSubject.patient.photo.url",
    "credentialSubject.patient.avatar.url",
    "credentialSubject.patient.demographics.photoUrl",
    "credentialSubject.patient.demographics.avatarUrl",
    "credentialSubject.staff.photoUrl",
    "credentialSubject.staff.avatarUrl",
    "credentialSubject.holder.photoUrl",
    "credentialSubject.holder.avatarUrl",
    "credentialSubject.person.photoUrl",
    "credentialSubject.person.avatarUrl",
    "credentialSubject.subject.photoUrl",
    "credentialSubject.subject.avatarUrl",
    "credentialSubject.profile.photoUrl",
    "credentialSubject.profile.avatarUrl",
    "credentialSubject.identity.photoUrl",
    "credentialSubject.identity.avatarUrl",
    "credentialSubject.photoUrl",
    "credentialSubject.avatarUrl",
    "credentialSubject.photo.url",
    "credentialSubject.avatar.url",
    "credentialSubject.humanDocument.renderData.patient.photoUrl",
    "credentialSubject.humanDocument.renderData.patient.avatarUrl",
    "patient.photoUrl",
    "patient.avatarUrl",
    "photoUrl",
    "avatarUrl",
  ];
  for (const path of embeddedPaths) {
    addPhotoCandidates(candidates, path, getValueAtPath(data, path));
  }
  return dedupePhotoCandidates(candidates);
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
      addTrustCarePortalLocalFallback(fileName, add);
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
      addTrustCarePortalLocalFallback(fileName, add);
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
    add(
      `${TRUSTCARE_PORTAL_ORIGIN}${MANUS_STORAGE_PATH}${fileName}`,
    );
    add(
      `${TRUSTCARE_PORTAL_ORIGIN}${STORAGE_PROXY_PATH}${fileName}`,
    );
    addTrustCarePortalLocalFallback(fileName, add);
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

function addPhotoCandidates(
  candidates: PhotoCandidate[],
  label: string,
  value: unknown,
): void {
  if (typeof value !== "string" || !value.trim()) return;
  for (const [index, url] of normalizePhotoUrlCandidates(value).entries()) {
    candidates.push({
      label: index === 0 ? label : `${label}:candidate:${index + 1}`,
      url,
    });
  }
}

function dedupePhotoCandidates(candidates: PhotoCandidate[]): PhotoCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function addTrustCarePortalLocalFallback(
  fileName: string,
  add: (url: string | null | undefined) => void,
): void {
  const normalized = fileName.split(/[?#]/)[0]?.toLowerCase();
  if (!normalized) return;
  add(TRUSTCARE_PORTAL_LOCAL_PHOTO_FALLBACKS[normalized]);
}

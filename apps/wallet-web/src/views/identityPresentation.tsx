import { useMemo } from "react";
import { ImageOff } from "lucide-react";
import { useLoadedPhotoCandidate } from "@trustcare/ui-web";
import {
  initialsFromName,
  normalizePhotoUrl,
  normalizePhotoUrlCandidates,
  photoCandidatesForCard,
  type WalletCard,
  type WalletDemoUser,
} from "@trustcare/wallet-core";

export function UserAvatarImage({
  user,
  cards = [],
}: {
  user: WalletDemoUser;
  cards?: WalletCard[];
}) {
  const candidates = useMemo(
    () => avatarUrlCandidatesForUser(user, cards),
    [cards, user],
  );
  const photoCandidates = useMemo(
    () =>
      candidates.map((url, index) => ({
        label: `user.avatar:${index + 1}`,
        url,
      })),
    [candidates],
  );
  const { candidate, imageSrc, isLoaded, markFailed, markLoaded } =
    useLoadedPhotoCandidate(photoCandidates);
  const initials = initialsFromName(user.nameEn || user.nameTh);

  return (
    <span className="user-avatar-image" aria-label={user.nameEn || user.nameTh}>
      <span className="user-avatar-fallback" aria-hidden="true">
        {initials}
      </span>
      {candidate && imageSrc && (
        <img
          className={isLoaded ? "loaded" : ""}
          src={imageSrc}
          alt=""
          onLoad={markLoaded}
          onError={markFailed}
        />
      )}
    </span>
  );
}

export function CredentialSubjectAvatar({ card }: { card: WalletCard }) {
  const candidates = useMemo(() => photoCandidatesForCard(card), [card]);
  const { candidate, imageSrc, isLoaded, markFailed, markLoaded } =
    useLoadedPhotoCandidate(candidates);

  return (
    <span
      className="user-avatar-image credential-subject-avatar"
      aria-label={
        candidate && imageSrc
          ? "รูปผู้ถือเอกสารจาก credential เดียวกัน"
          : "ไม่พบรูปผู้ถือเอกสารใน credential ต้นฉบับ"
      }
    >
      <ImageOff aria-hidden="true" />
      {candidate && imageSrc ? (
        <img
          className={isLoaded ? "loaded" : ""}
          src={imageSrc}
          alt=""
          onLoad={markLoaded}
          onError={markFailed}
        />
      ) : null}
    </span>
  );
}

export function avatarUrlCandidatesForUser(
  user: WalletDemoUser,
  cards: WalletCard[] = [],
): string[] {
  const candidates: string[] = [];
  const add = (url: string | null | undefined) => {
    if (!url) return;
    const resolved = resolveAvatarCandidateUrl(url);
    if (isUnstableBrowserAvatarUrl(resolved)) return;
    if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
  };

  for (const card of cards) {
    if (card.ownerUserId && card.ownerUserId !== user.id) continue;
    for (const candidate of photoCandidatesForCard(card)) {
      add(candidate.url);
    }
  }
  for (const candidate of normalizePhotoUrlCandidates(user.avatarUrl)) {
    add(candidate);
  }
  return candidates;
}

function isUnstableBrowserAvatarUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".manus.space");
  } catch {
    return false;
  }
}

function resolveAvatarCandidateUrl(url: string): string {
  const trimmed = url.trim();
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("/assets/")
  ) {
    return trimmed;
  }
  return resolveAvatarUrl(trimmed);
}

export function resolveAvatarUrl(url: string): string {
  const normalized = normalizePhotoUrl(url);
  if (
    /^https?:\/\//i.test(normalized) ||
    normalized.startsWith("data:") ||
    normalized.startsWith("/")
  ) {
    return normalized;
  }
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${normalized.replace(/^\//, "")}`;
}

export function shortDid(did: string): string {
  if (did.length <= 22) return did;
  return `${did.slice(0, 12)}...${did.slice(-6)}`;
}

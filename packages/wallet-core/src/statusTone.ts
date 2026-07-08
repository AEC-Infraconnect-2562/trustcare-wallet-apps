import type { CredentialStatus, WalletCard, WalletStoredObject } from "./models";

export type TrustCareTone = "green" | "yellow" | "red" | "neutral" | "blue";

export type CredentialPresentationPolicy = {
  presentable: boolean;
  tone: Exclude<TrustCareTone, "blue">;
  reason?: string;
};

const usableStatuses = new Set(["active", "verified", "valid"]);
const warningStatuses = new Set(["pending", "superseded", "suspended", "unverified"]);
const blockedStatuses = new Set(["revoked", "expired", "invalid", "inactive"]);

export function normalizeCredentialStatus(status?: CredentialStatus | string | null): string {
  return String(status ?? "unknown").trim().toLowerCase();
}

export function credentialStatusTone(status?: CredentialStatus | string | null): Exclude<TrustCareTone, "blue"> {
  const normalized = normalizeCredentialStatus(status);
  if (usableStatuses.has(normalized)) return "green";
  if (warningStatuses.has(normalized)) return "yellow";
  if (blockedStatuses.has(normalized)) return "red";
  return "neutral";
}

export function credentialStatusLabel(status?: CredentialStatus | string | null): string {
  const normalized = normalizeCredentialStatus(status);
  const labels: Record<string, string> = {
    active: "ใช้งานได้",
    verified: "ตรวจสอบแล้ว",
    valid: "ใช้งานได้",
    pending: "รอตรวจสอบ",
    unverified: "ผู้ใช้เพิ่มเอง",
    superseded: "ถูกแทนที่",
    suspended: "ถูกพักใช้",
    revoked: "ถูกเพิกถอน",
    expired: "หมดอายุ",
    invalid: "ไม่ถูกต้อง",
    inactive: "ไม่พร้อมใช้",
    unknown: "ไม่ทราบสถานะ",
  };
  return labels[normalized] ?? String(status ?? "ไม่ทราบสถานะ");
}

export function trustBadgeTone(badge?: "green" | "yellow" | "red" | "neutral" | string | null): Exclude<TrustCareTone, "blue"> {
  if (badge === "green" || badge === "yellow" || badge === "red") return badge;
  return "neutral";
}

export function storedObjectTone(object: Pick<WalletStoredObject, "status">): TrustCareTone {
  const normalized = normalizeCredentialStatus(object.status);
  if (usableStatuses.has(normalized)) return "green";
  if (blockedStatuses.has(normalized)) return "red";
  if (warningStatuses.has(normalized)) return "yellow";
  return "neutral";
}

export function isCredentialLifecycleActive(status?: CredentialStatus | string | null): boolean {
  return usableStatuses.has(normalizeCredentialStatus(status));
}

export function isIsoDateExpired(value?: string | null, now = new Date()): boolean {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export function credentialPresentationPolicy(card: Pick<WalletCard, "credentialStatus" | "expiresAt">, now = new Date()): CredentialPresentationPolicy {
  const statusTone = credentialStatusTone(card.credentialStatus);
  if (!isCredentialLifecycleActive(card.credentialStatus)) {
    return {
      presentable: false,
      tone: statusTone,
      reason: `Credential status is ${credentialStatusLabel(card.credentialStatus)}.`,
    };
  }
  if (isIsoDateExpired(card.expiresAt, now)) {
    return {
      presentable: false,
      tone: "red",
      reason: "Credential expiry time has passed.",
    };
  }
  return { presentable: true, tone: statusTone };
}

export function canPresentCredential(card: Pick<WalletCard, "credentialStatus" | "expiresAt">, now = new Date()): boolean {
  return credentialPresentationPolicy(card, now).presentable;
}

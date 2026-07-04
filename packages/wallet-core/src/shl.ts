import type { ShlPackage, WalletExportResult } from "./models";

export type ParsedShlLink = {
  kind: "shl";
  raw: string;
  url?: string;
  key?: string;
  label?: string;
  flag?: string;
  passcodeRequired?: boolean;
};

export function shlAccessSummary(shl: Pick<ShlPackage, "passcodeRequired" | "expiresAt" | "currentAccessCount" | "maxAccessCount" | "status">): string[] {
  const lines = [
    shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode",
    shl.expiresAt ? `หมดอายุ ${new Date(shl.expiresAt).toLocaleString("th-TH")}` : "ไม่มีวันหมดอายุที่ระบุ",
    `เข้าถึงแล้ว ${shl.currentAccessCount ?? 0}${shl.maxAccessCount ? `/${shl.maxAccessCount}` : ""} ครั้ง`,
    `สถานะ ${shl.status}`
  ];
  return lines;
}

export function isShlActive(shl: Pick<ShlPackage, "status" | "expiresAt">, now = new Date()): boolean {
  if (shl.status !== "active") return false;
  if (!shl.expiresAt) return true;
  return new Date(shl.expiresAt).getTime() > now.getTime();
}

export function parseShlLink(raw: string): ParsedShlLink | null {
  const value = raw.trim();
  if (!value.startsWith("shlink:/")) return null;
  const encoded = value.slice("shlink:/".length);
  if (!encoded) return { kind: "shl", raw: value };
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as Record<string, unknown>;
    return {
      kind: "shl",
      raw: value,
      url: typeof payload.url === "string" ? payload.url : undefined,
      key: typeof payload.key === "string" ? payload.key : undefined,
      label: typeof payload.label === "string" ? payload.label : undefined,
      flag: typeof payload.flag === "string" ? payload.flag : undefined,
      passcodeRequired: typeof payload.passcode === "boolean" ? payload.passcode : undefined
    };
  } catch {
    return { kind: "shl", raw: value };
  }
}

export function createShlLinkPayload(input: { url: string; key?: string; label?: string; flag?: string; passcodeRequired?: boolean }): string {
  const payload = {
    url: input.url,
    key: input.key,
    label: input.label,
    flag: input.flag,
    passcode: input.passcodeRequired
  };
  return `shlink:/${base64UrlEncode(JSON.stringify(removeUndefined(payload)))}`;
}

export function exportShlPackage(shl: ShlPackage): WalletExportResult {
  const qrPayload =
    shl.qrPayload ??
    shl.shlUrl ??
    (shl.viewerUrl ? createShlLinkPayload({ url: shl.viewerUrl, label: shl.label ?? undefined, passcodeRequired: shl.passcodeRequired }) : undefined);

  return {
    ok: Boolean(qrPayload),
    format: qrPayload ? "shl-link" : "shl-json",
    fileName: `trustcare-shl-${shl.id}.json`,
    mimeType: "application/json",
    data: JSON.stringify(
      {
        type: "SMARTHealthLink",
        id: shl.id,
        label: shl.label,
        purpose: shl.purpose,
        context: shl.context,
        status: shl.status,
        shlUrl: shl.shlUrl,
        viewerUrl: shl.viewerUrl,
        qrPayload,
        manifestCredentialId: shl.manifestCredentialId,
        holderPresentationId: shl.presentationId,
        expiresAt: shl.expiresAt,
        passcodeRequired: shl.passcodeRequired,
        access: {
          current: shl.currentAccessCount,
          max: shl.maxAccessCount
        }
      },
      null,
      2
    ),
    qrPayload,
    warnings: qrPayload ? [] : ["SHL package has no QR payload or viewer URL to encode."]
  };
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

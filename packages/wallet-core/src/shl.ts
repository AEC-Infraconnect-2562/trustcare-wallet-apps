import type { ShlPackage, WalletExportResult } from "./models";
import { resolveDemoShlManifestFromUrl } from "./demoResolvers";
import type { TrustCareTone } from "./statusTone";

export type ParsedShlLink = {
  kind: "shl";
  raw: string;
  url?: string;
  key?: string;
  label?: string;
  flag?: string;
  flags?: string;
  expiresAt?: string;
  version?: number;
  passcodeRequired?: boolean;
};

export type ShlManifestFetchResult = {
  ok: boolean;
  shl: ParsedShlLink;
  manifest?: Record<string, unknown>;
  fileCount: number;
  resolvedFiles: ShlResolvedFile[];
  decryptedFileCount: number;
  requestMethod?: "POST" | "GET";
  warnings: string[];
  errors: string[];
};

export type ShlResolvedFile = {
  id?: string;
  contentType?: string;
  source: "embedded" | "location";
  encrypted: boolean;
  ok: boolean;
  payload?: unknown;
  raw?: string;
  location?: string;
  warnings: string[];
  errors: string[];
};

export type ShlAccessPolicyInput = Pick<
  ShlPackage,
  | "status"
  | "expiresAt"
  | "currentAccessCount"
  | "maxAccessCount"
  | "passcodeRequired"
>;

export type ShlAccessPolicyEvaluation = {
  allowed: boolean;
  tone: Exclude<TrustCareTone, "blue">;
  warnings: string[];
  errors: string[];
};

export function shlAccessSummary(
  shl: Pick<
    ShlPackage,
    | "passcodeRequired"
    | "expiresAt"
    | "currentAccessCount"
    | "maxAccessCount"
    | "status"
  >,
): string[] {
  const lines = [
    shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode",
    shl.expiresAt
      ? `หมดอายุ ${new Date(shl.expiresAt).toLocaleString("th-TH")}`
      : "ไม่มีวันหมดอายุที่ระบุ",
    `เข้าถึงแล้ว ${shl.currentAccessCount ?? 0}${shl.maxAccessCount ? `/${shl.maxAccessCount}` : ""} ครั้ง`,
    `สถานะ ${shl.status}`,
  ];
  return lines;
}

export function isShlActive(
  shl: Pick<ShlPackage, "status" | "expiresAt">,
  now = new Date(),
): boolean {
  return evaluateShlAccessPolicy(shl, now).allowed;
}

export function evaluateShlAccessPolicy(
  input: Partial<ShlAccessPolicyInput>,
  now = new Date(),
): ShlAccessPolicyEvaluation {
  const warnings: string[] = [];
  const errors: string[] = [];
  const status = String(input.status ?? "active").toLowerCase();
  if (!["active", "ready", "valid"].includes(status)) {
    errors.push(`SHL status is ${input.status ?? "unknown"}.`);
  }
  if (input.expiresAt) {
    const expiresAt = new Date(input.expiresAt).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
      errors.push("SHL access policy has expired.");
    }
  } else {
    warnings.push("SHL access policy has no explicit expiry.");
  }
  if (
    typeof input.currentAccessCount === "number" &&
    typeof input.maxAccessCount === "number" &&
    input.currentAccessCount >= input.maxAccessCount
  ) {
    errors.push("SHL access count limit has been reached.");
  }
  if (input.passcodeRequired) {
    warnings.push("SHL requires passcode delivery through a separate channel.");
  }
  return {
    allowed: errors.length === 0,
    tone: errors.length ? "red" : warnings.length ? "yellow" : "green",
    warnings,
    errors,
  };
}

export function parseShlLink(raw: string): ParsedShlLink | null {
  const value = extractShlUri(raw.trim());
  if (!value.startsWith("shlink:/")) return null;
  const encoded = value.slice("shlink:/".length);
  if (!encoded) return { kind: "shl", raw: value };
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as Record<
      string,
      unknown
    >;
    return {
      kind: "shl",
      raw: value,
      url: typeof payload.url === "string" ? payload.url : undefined,
      key:
        typeof payload.key === "string"
          ? payload.key
          : typeof payload.k === "string"
            ? payload.k
            : undefined,
      label: typeof payload.label === "string" ? payload.label : undefined,
      flag: typeof payload.flag === "string" ? payload.flag : undefined,
      flags: typeof payload.flags === "string" ? payload.flags : undefined,
      expiresAt:
        typeof payload.exp === "number"
          ? new Date(payload.exp * 1000).toISOString()
          : undefined,
      version: typeof payload.v === "number" ? payload.v : undefined,
      passcodeRequired:
        typeof payload.flag === "string" || typeof payload.flags === "string"
          ? `${typeof payload.flag === "string" ? payload.flag : ""}${typeof payload.flags === "string" ? payload.flags : ""}`.includes(
              "P",
            )
          : typeof payload.passcode === "boolean"
            ? payload.passcode
            : typeof payload.passcodeRequired === "boolean"
              ? payload.passcodeRequired
              : undefined,
    };
  } catch {
    return { kind: "shl", raw: value };
  }
}

export function createShlLinkPayload(input: {
  url: string;
  key?: string;
  label?: string;
  flag?: string;
  passcodeRequired?: boolean;
  expiresAt?: string | Date | null;
  version?: number;
}): string {
  const flag = normalizeShlFlags(input.flag, input.passcodeRequired);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
  const payload = {
    url: input.url,
    key: input.key,
    exp:
      expiresAt && Number.isFinite(expiresAt.getTime())
        ? Math.floor(expiresAt.getTime() / 1000)
        : undefined,
    label: input.label,
    flag,
    v: input.version,
  };
  return `shlink:/${base64UrlEncode(JSON.stringify(removeUndefined(payload)))}`;
}

export function createShlViewerUrl(
  viewerBaseUrl: string,
  shlUrl: string,
): string {
  const base = viewerBaseUrl.replace(/#.*$/, "");
  return `${base}#${shlUrl}`;
}

export function createDemoShlKey(seed: string): string {
  const source = `${seed}-trustcare-demo-shl-content-key-000000000000000000`;
  const bytes = new TextEncoder().encode(source.slice(0, 32).padEnd(32, "0"));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function extractShlUri(value: string): string {
  if (value.startsWith("shlink:/")) return value;
  try {
    const url = new URL(value);
    const hash = decodeURIComponent(url.hash.replace(/^#/, ""));
    if (hash.startsWith("shlink:/")) return hash;
  } catch {
    // Not a URL; keep the raw value.
  }
  return value;
}

export async function fetchShlManifest(
  raw: string,
  options: {
    fetcher?: typeof fetch;
    passcode?: string;
    recipient?: string;
    resolveLocationFiles?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<ShlManifestFetchResult> {
  const shl = parseShlLink(raw);
  if (!shl) {
    return {
      ok: false,
      shl: { kind: "shl", raw },
      fileCount: 0,
      resolvedFiles: [],
      decryptedFileCount: 0,
      warnings: [],
      errors: ["ข้อมูลที่สแกนไม่ใช่ SMART Health Link payload."],
    };
  }
  if (!shl.url) {
    return {
      ok: false,
      shl,
      fileCount: 0,
      resolvedFiles: [],
      decryptedFileCount: 0,
      warnings: [
        "เก็บ SHL payload เดิมไว้แล้ว แต่ payload นี้ไม่มี manifest URL สำหรับอ่านรายการไฟล์.",
      ],
      errors: [],
    };
  }
  const policy = evaluateShlAccessPolicy({
    status: "active",
    expiresAt: shl.expiresAt,
    passcodeRequired: shl.passcodeRequired,
  });
  if (!policy.allowed) {
    return {
      ok: false,
      shl,
      fileCount: 0,
      resolvedFiles: [],
      decryptedFileCount: 0,
      warnings: policy.warnings,
      errors: policy.errors,
    };
  }
  if (shl.passcodeRequired && !options.passcode) {
    return {
      ok: false,
      shl,
      fileCount: 0,
      resolvedFiles: [],
      decryptedFileCount: 0,
      warnings: [],
      errors: [
        "SHL นี้ต้องใช้ passcode โดย passcode ไม่ได้ฝังอยู่ใน QR และต้องส่งให้ผู้รับผ่านช่องทางแยก.",
      ],
    };
  }

  const demoManifest = resolveDemoShlManifestFromUrl(shl.url);
  if (demoManifest) {
    return finalizeShlManifestResult({
      ok: true,
      shl,
      manifest: demoManifest,
      requestMethod: shl.passcodeRequired ? "POST" : "GET",
      options,
      warnings: [
        "อ่าน SHL manifest จาก static demo resolver; production ต้อง enforce passcode, expiry และ access count ที่ backend.",
      ],
      errors: [],
    });
  }

  const fetcher = options.fetcher ?? fetch;
  const body = removeUndefined({
    recipient: options.recipient ?? "TrustCare Wallet",
    passcode: shl.passcodeRequired ? options.passcode : undefined,
  });
  const warnings: string[] = [];
  try {
    const postResponse = await fetcher(shl.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (postResponse.ok) {
      const manifest = (await postResponse.json()) as Record<string, unknown>;
      return finalizeShlManifestResult({
        ok: true,
        shl,
        manifest,
        requestMethod: "POST",
        options,
        warnings,
        errors: [],
      });
    }
    warnings.push(
      `Manifest endpoint ตอบกลับ HTTP ${postResponse.status} จากคำขอ POST.`,
    );
    if (shl.passcodeRequired) {
      return {
        ok: false,
        shl,
        fileCount: 0,
        resolvedFiles: [],
        decryptedFileCount: 0,
        requestMethod: "POST",
        warnings,
        errors: ["Manifest endpoint ไม่รับคำขอที่ต้องใช้ passcode."],
      };
    }
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Manifest POST ไม่สำเร็จ: ${error.message}`
        : "Manifest POST ไม่สำเร็จ.",
    );
    if (shl.passcodeRequired) {
      return {
        ok: false,
        shl,
        fileCount: 0,
        resolvedFiles: [],
        decryptedFileCount: 0,
        requestMethod: "POST",
        warnings,
        errors: [
          "ไม่สามารถเชื่อมต่อ manifest endpoint ด้วยคำขอ passcode ที่จำเป็นได้.",
        ],
      };
    }
  }

  try {
    const getResponse = await fetcher(shl.url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: options.signal,
    });
    if (getResponse.ok) {
      const manifest = (await getResponse.json()) as Record<string, unknown>;
      return finalizeShlManifestResult({
        ok: true,
        shl,
        manifest,
        requestMethod: "GET",
        options,
        warnings,
        errors: [],
      });
    }
    warnings.push(
      `Manifest endpoint ตอบกลับ HTTP ${getResponse.status} จากคำขอ GET.`,
    );
    return {
      ok: false,
      shl,
      fileCount: 0,
      resolvedFiles: [],
      decryptedFileCount: 0,
      requestMethod: "GET",
      warnings,
      errors: ["Manifest endpoint ไม่ได้ส่ง JSON manifest ที่อ่านได้กลับมา."],
    };
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Manifest GET ไม่สำเร็จ: ${error.message}`
        : "Manifest GET ไม่สำเร็จ.",
    );
    return {
      ok: false,
      shl,
      fileCount: 0,
      resolvedFiles: [],
      decryptedFileCount: 0,
      requestMethod: "GET",
      warnings,
      errors: ["Browser นี้ยังเชื่อมต่อ manifest endpoint ไม่สำเร็จ."],
    };
  }
}

export async function decryptShlCompactJwe(
  compactJwe: string,
  key: string | undefined,
): Promise<unknown> {
  if (!key) {
    throw new Error("SHL encrypted file requires a content key.");
  }
  const parts = compactJwe.split(".");
  if (parts.length !== 5) {
    throw new Error("SHL encrypted file is not compact JWE.");
  }
  const [protectedHeader, encryptedKey, iv, ciphertext, tag] = parts;
  if (encryptedKey) {
    throw new Error("SHL compact JWE must use direct encryption.");
  }
  const header = parseProtectedHeader(protectedHeader);
  if (header.alg !== "dir" || header.enc !== "A256GCM") {
    throw new Error("SHL compact JWE must use alg=dir and enc=A256GCM.");
  }
  const keyBytes = base64UrlToBytes(key);
  if (keyBytes.byteLength !== 32) {
    throw new Error("SHL A256GCM content key must be 256 bits.");
  }
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const encrypted = concatBytes(
    base64UrlToBytes(ciphertext),
    base64UrlToBytes(tag),
  );
  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(iv)),
      additionalData: toArrayBuffer(new TextEncoder().encode(protectedHeader)),
      tagLength: 128,
    },
    cryptoKey,
    toArrayBuffer(encrypted),
  );
  const text = new TextDecoder().decode(new Uint8Array(plaintext));
  return parseJsonIfPossible(text);
}

async function finalizeShlManifestResult(input: {
  ok: boolean;
  shl: ParsedShlLink;
  manifest: Record<string, unknown>;
  requestMethod: "POST" | "GET";
  options: {
    fetcher?: typeof fetch;
    passcode?: string;
    recipient?: string;
    resolveLocationFiles?: boolean;
    signal?: AbortSignal;
  };
  warnings: string[];
  errors: string[];
}): Promise<ShlManifestFetchResult> {
  const resolvedFiles = await resolveShlManifestFiles(
    input.manifest,
    input.shl,
    input.options,
  );
  const warnings = [
    ...input.warnings,
    ...resolvedFiles.flatMap((file) => file.warnings),
  ];
  const fileErrors = resolvedFiles.flatMap((file) => file.errors);
  const errors = [...input.errors, ...fileErrors];
  return {
    ok: input.ok && errors.length === 0,
    shl: input.shl,
    manifest: input.manifest,
    fileCount: countManifestFiles(input.manifest),
    resolvedFiles,
    decryptedFileCount: resolvedFiles.filter(
      (file) => file.ok && file.encrypted,
    ).length,
    requestMethod: input.requestMethod,
    warnings,
    errors,
  };
}

async function resolveShlManifestFiles(
  manifest: Record<string, unknown>,
  shl: ParsedShlLink,
  options: {
    fetcher?: typeof fetch;
    resolveLocationFiles?: boolean;
    signal?: AbortSignal;
  },
): Promise<ShlResolvedFile[]> {
  const entries = manifestFileEntries(manifest);
  const resolved: ShlResolvedFile[] = [];
  for (const file of entries) {
    const embedded = extractEmbeddedFileValue(file);
    if (embedded !== undefined) {
      resolved.push(await resolveEmbeddedFile(file, embedded, shl.key));
      continue;
    }
    const location = typeof file.location === "string" ? file.location : "";
    if (location) {
      resolved.push(
        await resolveLocationFile(file, location, shl.key, options),
      );
      continue;
    }
    resolved.push({
      id: typeof file.id === "string" ? file.id : undefined,
      contentType:
        typeof file.contentType === "string" ? file.contentType : undefined,
      source: "embedded",
      encrypted: false,
      ok: false,
      warnings: [],
      errors: ["SHL manifest file has neither embedded payload nor location."],
    });
  }
  return resolved;
}

async function resolveEmbeddedFile(
  file: Record<string, unknown>,
  embedded: unknown,
  key: string | undefined,
): Promise<ShlResolvedFile> {
  const encrypted = extractCompactJwe(embedded);
  if (!encrypted) {
    return {
      id: typeof file.id === "string" ? file.id : undefined,
      contentType:
        typeof file.contentType === "string" ? file.contentType : undefined,
      source: "embedded",
      encrypted: false,
      ok: true,
      payload: embedded,
      warnings: [],
      errors: [],
    };
  }
  try {
    return {
      id: typeof file.id === "string" ? file.id : undefined,
      contentType:
        typeof file.contentType === "string" ? file.contentType : undefined,
      source: "embedded",
      encrypted: true,
      ok: true,
      payload: await decryptShlCompactJwe(encrypted, key),
      raw: encrypted,
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return {
      id: typeof file.id === "string" ? file.id : undefined,
      contentType:
        typeof file.contentType === "string" ? file.contentType : undefined,
      source: "embedded",
      encrypted: true,
      ok: false,
      raw: encrypted,
      warnings: [],
      errors: [
        error instanceof Error
          ? `SHL embedded encrypted file could not be decrypted: ${error.message}`
          : "SHL embedded encrypted file could not be decrypted.",
      ],
    };
  }
}

async function resolveLocationFile(
  file: Record<string, unknown>,
  location: string,
  key: string | undefined,
  options: {
    fetcher?: typeof fetch;
    resolveLocationFiles?: boolean;
    signal?: AbortSignal;
  },
): Promise<ShlResolvedFile> {
  const base = {
    id: typeof file.id === "string" ? file.id : undefined,
    contentType:
      typeof file.contentType === "string" ? file.contentType : undefined,
    source: "location" as const,
    location,
  };
  if (options.resolveLocationFiles === false) {
    return {
      ...base,
      encrypted: false,
      ok: false,
      warnings: ["SHL location file resolution was skipped by caller."],
      errors: [],
    };
  }
  try {
    const response = await (options.fetcher ?? fetch)(location, {
      method: "GET",
      headers: {
        accept: "application/jose, application/json, text/plain;q=0.9",
      },
      signal: options.signal,
    });
    if (!response.ok) {
      return {
        ...base,
        encrypted: false,
        ok: false,
        warnings: [
          `SHL location file ${location} returned HTTP ${response.status}.`,
        ],
        errors: [],
      };
    }
    const raw = await response.text();
    return resolveFetchedLocationFile(base, raw, key);
  } catch (error) {
    return {
      ...base,
      encrypted: false,
      ok: false,
      warnings: [
        error instanceof Error
          ? `SHL location file ${location} could not be fetched: ${error.message}`
          : `SHL location file ${location} could not be fetched.`,
      ],
      errors: [],
    };
  }
}

async function resolveFetchedLocationFile(
  base: Pick<ShlResolvedFile, "id" | "contentType" | "source" | "location">,
  raw: string,
  key: string | undefined,
): Promise<ShlResolvedFile> {
  const parsed = parseJsonIfPossible(raw);
  const encrypted = extractCompactJwe(parsed) ?? extractCompactJwe(raw);
  if (!encrypted) {
    return {
      ...base,
      encrypted: false,
      ok: true,
      payload: parsed,
      raw,
      warnings: [],
      errors: [],
    };
  }
  try {
    return {
      ...base,
      encrypted: true,
      ok: true,
      payload: await decryptShlCompactJwe(encrypted, key),
      raw: encrypted,
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return {
      ...base,
      encrypted: true,
      ok: false,
      raw: encrypted,
      warnings: [],
      errors: [
        error instanceof Error
          ? `SHL location encrypted file could not be decrypted: ${error.message}`
          : "SHL location encrypted file could not be decrypted.",
      ],
    };
  }
}

function manifestFileEntries(
  manifest: Record<string, unknown>,
): Record<string, unknown>[] {
  const files = manifest.files;
  if (Array.isArray(files)) return files.map(objectValue);
  const embedded = manifest.embedded;
  if (Array.isArray(embedded)) {
    return embedded.map((entry, index) => ({
      id: `embedded-${index + 1}`,
      embedded: entry,
    }));
  }
  return [];
}

function extractEmbeddedFileValue(file: Record<string, unknown>): unknown {
  if ("embedded" in file) return file.embedded;
  if ("data" in file && extractCompactJwe(file.data)) return file.data;
  if ("jwe" in file && extractCompactJwe(file.jwe)) return file.jwe;
  return undefined;
}

function extractCompactJwe(value: unknown): string | null {
  if (typeof value === "string") {
    return isCompactJwe(value.trim()) ? value.trim() : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  for (const key of ["jwe", "compactJwe", "encrypted", "ciphertext", "data"]) {
    const candidate = object[key];
    if (typeof candidate === "string" && isCompactJwe(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}

function isCompactJwe(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[1] !== "") return false;
  try {
    const header = parseProtectedHeader(parts[0]);
    return header.alg === "dir" && header.enc === "A256GCM";
  } catch {
    return false;
  }
}

function parseProtectedHeader(
  protectedHeader: string,
): Record<string, unknown> {
  const decoded = new TextDecoder().decode(base64UrlToBytes(protectedHeader));
  const header = JSON.parse(decoded) as unknown;
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw new Error("SHL compact JWE protected header is invalid.");
  }
  return header as Record<string, unknown>;
}

function parseJsonIfPossible(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeShlFlags(
  flag: string | undefined,
  passcodeRequired: boolean | undefined,
): string | undefined {
  const flags = new Set((flag ?? "").split("").filter(Boolean));
  if (passcodeRequired) {
    flags.add("P");
    flags.delete("U");
  }
  if (!flags.size) return undefined;
  return [
    "L",
    "P",
    "U",
    ...[...flags].filter((item) => !["L", "P", "U"].includes(item)),
  ]
    .filter((item) => flags.has(item))
    .join("");
}

function countManifestFiles(manifest: Record<string, unknown>): number {
  return manifestFileEntries(manifest).length;
}

export function exportShlPackage(shl: ShlPackage): WalletExportResult {
  const qrPayload =
    shl.qrPayload ??
    shl.shlUrl ??
    (shl.viewerUrl
      ? createShlLinkPayload({
          url: shl.viewerUrl,
          label: shl.label ?? undefined,
          passcodeRequired: shl.passcodeRequired,
        })
      : undefined);

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
          max: shl.maxAccessCount,
        },
      },
      null,
      2,
    ),
    qrPayload,
    warnings: qrPayload
      ? []
      : ["SHL package has no QR payload or viewer URL to encode."],
  };
}

function removeUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const merged = new Uint8Array(first.byteLength + second.byteLength);
  merged.set(first, 0);
  merged.set(second, first.byteLength);
  return merged;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

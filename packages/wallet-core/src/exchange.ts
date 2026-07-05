import type {
  PresentationHistoryItem,
  ServicePacketResponse,
  ShlPackage,
  ShlPackageDetail,
  WalletCard,
  WalletExportResult,
  WalletImportResult,
  WalletStoredObject,
  WalletStoredObjectType
} from "./models";
import { parseOid4vcCredentialOffer, parseOid4vpRequest, matchCardsForOid4vp } from "./oid4vc";
import { parseTrustCareQr } from "./qr";
import { exportShlPackage, parseShlLink } from "./shl";
import { walletObjectFromCredentialOffer, walletObjectFromPresentationRequest } from "./store";

export function importWalletExchange(raw: string, walletCards: WalletCard[] = []): WalletImportResult {
  const value = raw.trim();
  if (!value) {
    return fail("unknown", "Empty import payload.");
  }

  const shl = parseShlLink(value);
  if (shl) {
    const shlPackage: ShlPackage = {
      id: stableNumericId(value),
      label: shl.label ?? "Imported SMART Health Link",
      purpose: "standard_shl",
      context: "portable_health_link",
      status: "pending",
      manifestUrl: shl.url,
      viewerUrl: extractViewerUrl(value, shl.raw),
      shlUrl: shl.raw,
      qrPayload: extractViewerUrl(value, shl.raw) ?? shl.raw,
      canonicalShlUrl: shl.raw,
      webViewerUrl: extractViewerUrl(value, shl.raw),
      passcodeRequired: shl.passcodeRequired,
      currentAccessCount: 0,
      expiresAt: shl.expiresAt
    };
    const payload = withPendingTrustCareManifest(shlPackage, shl.raw);
    return {
      ok: true,
      format: "shl-link",
      protocol: "shl",
      object: {
        id: `shl-import:${stableId(value)}`,
        type: "shl",
        title: shlPackage.label ?? "Imported SMART Health Link",
        subtitle: shl.url ?? "SHL QR payload",
        status: "pending",
        protocol: "shl",
        createdAt: new Date().toISOString(),
        expiresAt: shl.expiresAt,
        source: shl.url,
        payload
      },
      warnings: [
        ...(shl.url ? [] : ["ยัง decode SHL payload ในเครื่องนี้ได้ไม่ครบ จึงเก็บ QR payload เดิมไว้ให้ backend ตรวจสอบต่อ."]),
        "นำเข้า Standard SHL โดยไม่แก้ canonical shlink เดิม และสร้าง TrustCare Manifest VP binding เป็นสถานะรอ Maker/Checker ก่อนใช้เป็นหลักฐานใน TrustCare ecosystem."
      ],
      errors: []
    };
  }

  const oid4vci = parseOid4vcCredentialOffer(value);
  if (oid4vci) {
    return {
      ok: true,
      format: "oid4vci-offer",
      protocol: "oid4vci",
      object: walletObjectFromCredentialOffer(oid4vci),
      warnings: ["Credential offer imported. Fetch issuer metadata over TLS and ask for consent before accepting the credential."],
      errors: []
    };
  }

  const oid4vp = parseOid4vpRequest(value);
  if (oid4vp) {
    const matches = matchCardsForOid4vp(walletCards, oid4vp);
    return {
      ok: true,
      format: "oid4vp-request",
      protocol: "oid4vp",
      object: walletObjectFromPresentationRequest(oid4vp),
      matchedCredentialIds: matches.map(card => card.credentialId),
      warnings: matches.length ? ["OID4VP request imported. User consent is required before creating a presentation."] : ["No active local credential matched this OID4VP request."],
      errors: []
    };
  }

  const json = parseJsonObject(value);
  if (json) return importJsonObject(value, json);

  const parsedQr = parseTrustCareQr(value);
  if (parsedQr.kind === "vp-url" || parsedQr.kind === "presentation-id" || parsedQr.kind === "jwt") {
    return {
      ok: true,
      format: parsedQr.kind === "jwt" ? "jwt" : "trustcare-vp-json",
      protocol: "trustcare",
      object: {
        id: `vp-import:${parsedQr.presentationId ?? stableId(value)}`,
        type: "vp",
        title: "Imported TrustCare VP",
        subtitle: parsedQr.presentationId ?? parsedQr.kind,
        status: "pending",
        protocol: "trustcare",
        createdAt: new Date().toISOString(),
        payload: parsedQr
      },
      warnings: parsedQr.kind === "jwt" ? ["JWT imported. Backend verification is required before trusting the VP."] : [],
      errors: []
    };
  }

  return fail("unknown", "Payload is not a recognized SHL, VC, VP, OID4VCI, or OID4VP import.");
}

export function exportWalletCard(card: WalletCard): WalletExportResult {
  const vc = normalizeCredential(card);
  return {
    ok: true,
    format: "trustcare-vc-json",
    fileName: `trustcare-vc-${card.credentialId}.json`,
    mimeType: "application/vc+json",
    data: JSON.stringify(vc, null, 2),
    warnings: card.credentialStatus === "active" ? [] : [`Credential status is ${card.credentialStatus}.`]
  };
}

export function exportWalletPresentation(input: PresentationHistoryItem | ServicePacketResponse): WalletExportResult {
  const presentationId = "presentationId" in input ? input.presentationId : `vp-history-${input.id}`;
  const vp = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiablePresentation", "TrustCarePresentation"],
    id: presentationId,
    holder: getStringish(input, "holderDid"),
    trustcare: input
  };
  return {
    ok: true,
    format: "trustcare-vp-json",
    fileName: `trustcare-vp-${presentationId}.json`,
    mimeType: "application/vp+json",
    data: JSON.stringify(removeUndefined(vp), null, 2),
    qrPayload: "qrData" in input ? input.qrData : undefined,
    warnings: []
  };
}

export function exportWalletObject(object: WalletStoredObject): WalletExportResult {
  if (object.type === "shl" && looksLikeShlPackage(object.payload)) return exportShlPackage(object.payload);
  if (object.type === "vc" && looksLikeWalletCard(object.payload)) return exportWalletCard(object.payload);
  if ((object.type === "vp" || object.type === "service_packet") && looksLikeServicePacket(object.payload)) return exportWalletPresentation(object.payload);
  const format = formatForStoredObject(object.type);
  return {
    ok: true,
    format,
    fileName: `trustcare-${object.type}-${safeFilePart(object.id)}.json`,
    mimeType: "application/json",
    data: JSON.stringify({ type: object.type, protocol: object.protocol, status: object.status, payload: object.payload }, null, 2),
    qrPayload: extractQrPayload(object.payload),
    warnings: []
  };
}

export function exportWalletObjects(objects: WalletStoredObject[]): WalletExportResult {
  return {
    ok: true,
    format: "raw-json",
    fileName: `trustcare-wallet-export-${new Date().toISOString().slice(0, 10)}.json`,
    mimeType: "application/json",
    data: JSON.stringify(
      {
        type: "TrustCareWalletExport",
        exportedAt: new Date().toISOString(),
        count: objects.length,
        objects
      },
      null,
      2
    ),
    warnings: []
  };
}

function importJsonObject(raw: string, json: Record<string, unknown>): WalletImportResult {
  if (json.type === "SMARTHealthLink" || "shlUrl" in json || "qrPayload" in json) {
    const qrPayload = typeof json.qrPayload === "string" ? json.qrPayload : typeof json.shlUrl === "string" ? json.shlUrl : raw;
    const parsed = parseShlLink(qrPayload);
    const shlPayload: ShlPackage = {
      ...(json as Record<string, unknown>),
      id: typeof json.id === "number" ? json.id : stableNumericId(raw),
      label: typeof json.label === "string" ? json.label : "Imported SMART Health Link",
      status: typeof json.status === "string" ? json.status : "pending",
      manifestUrl: typeof json.manifestUrl === "string" ? json.manifestUrl : parsed?.url,
      viewerUrl: typeof json.viewerUrl === "string" ? json.viewerUrl : parsed ? extractViewerUrl(qrPayload, parsed.raw) : undefined,
      shlUrl: typeof json.shlUrl === "string" ? json.shlUrl : parsed?.raw,
      canonicalShlUrl: typeof json.canonicalShlUrl === "string" ? json.canonicalShlUrl : parsed?.raw,
      webViewerUrl: typeof json.webViewerUrl === "string" ? json.webViewerUrl : parsed ? extractViewerUrl(qrPayload, parsed.raw) : undefined,
      qrPayload,
      passcodeRequired: typeof json.passcodeRequired === "boolean" ? json.passcodeRequired : parsed?.passcodeRequired,
      currentAccessCount: typeof json.currentAccessCount === "number" ? json.currentAccessCount : 0
    } as ShlPackage;
    const shlPayloadWithManifest = parsed ? withPendingTrustCareManifest(shlPayload, parsed.raw) : shlPayload;
    return {
      ok: true,
      format: "shl-json",
      protocol: "shl",
      object: {
        id: `shl-json:${String(json.id ?? stableId(raw))}`,
        type: "shl",
        title: shlPayload.label ?? "Imported SMART Health Link",
        subtitle: typeof json.purpose === "string" ? json.purpose : parsed?.url,
        status: shlPayload.status,
        protocol: "shl",
        createdAt: new Date().toISOString(),
        expiresAt: typeof json.expiresAt === "string" ? json.expiresAt : undefined,
        source: parsed?.url,
        payload: { ...shlPayloadWithManifest, parsed }
      },
      warnings: parsed
        ? ["นำเข้า SHL JSON แล้ว และ TrustCare Manifest VP binding ยังอยู่ในสถานะรอ Maker/Checker ก่อนยกระดับความน่าเชื่อถือภายใน TrustCare."]
        : ["นำเข้า SHL JSON แล้ว แต่ embedded QR payload ยัง decode ในเครื่องนี้ไม่ได้."],
      errors: []
    };
  }

  if (isVcJson(json)) {
    return {
      ok: true,
      format: "trustcare-vc-json",
      protocol: "trustcare",
      object: jsonObject("vc", json, "Imported Verifiable Credential", getStringish(json, "id") ?? stableId(raw)),
      warnings: [],
      errors: []
    };
  }

  if (isVpJson(json)) {
    return {
      ok: true,
      format: "trustcare-vp-json",
      protocol: "trustcare",
      object: jsonObject("vp", json, "Imported Verifiable Presentation", getStringish(json, "id") ?? stableId(raw)),
      warnings: [],
      errors: []
    };
  }

  return {
    ok: true,
    format: "raw-json",
    object: jsonObject("document_reference", json, "Imported JSON Document", stableId(raw)),
    warnings: ["JSON imported as a document reference. Backend mapping is required before it becomes a VC or VP."],
    errors: []
  };
}

function jsonObject(type: WalletStoredObjectType, payload: unknown, title: string, id: string): WalletStoredObject {
  return {
    id: `${type}:${id}`,
    type,
    title,
    status: "pending",
    protocol: type === "shl" ? "shl" : "trustcare",
    createdAt: new Date().toISOString(),
    payload
  };
}

function normalizeCredential(card: WalletCard): Record<string, unknown> {
  const data: Record<string, unknown> = card.credentialData ?? {};
  if (isVcJson(data)) return data;
  return removeUndefined({
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", card.credentialType ?? "TrustCareCredential"],
    id: String(card.credentialId),
    issuer: card.issuerDid ?? card.issuerHospitalName,
    validFrom: card.issuedAt,
    validUntil: card.expiresAt,
    credentialStatus: { type: "TrustCareStatus", status: card.credentialStatus },
    credentialSubject: data["credentialSubject"] ?? data,
    trustcare: {
      cardId: card.id,
      cardType: card.cardType,
      displayName: card.displayName,
      documentCategory: card.documentCategory
    }
  });
}

function isVcJson(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return hasType(object, "VerifiableCredential") || "credentialSubject" in object || "issuer" in object;
}

function isVpJson(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return hasType(object, "VerifiablePresentation") || "verifiableCredential" in object || "holder" in object;
}

function hasType(object: Record<string, unknown>, type: string): boolean {
  const value = object.type;
  return value === type || (Array.isArray(value) && value.includes(type));
}

function looksLikeWalletCard(value: unknown): value is WalletCard {
  return Boolean(value && typeof value === "object" && "credentialId" in value && "cardType" in value);
}

function looksLikeShlPackage(value: unknown): value is ShlPackage {
  return Boolean(value && typeof value === "object" && "id" in value && ("shlUrl" in value || "qrPayload" in value || "viewerUrl" in value));
}

function looksLikeServicePacket(value: unknown): value is ServicePacketResponse {
  return Boolean(value && typeof value === "object" && "presentationId" in value && "qrData" in value);
}

function extractQrPayload(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  return typeof object.qrData === "string" ? object.qrData : typeof object.qrPayload === "string" ? object.qrPayload : undefined;
}

function getStringish(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = (value as Record<string, unknown>)[key];
  return entry == null ? undefined : String(entry);
}

function formatForStoredObject(type: WalletStoredObjectType) {
  if (type === "shl") return "shl-json";
  if (type === "vp" || type === "service_packet") return "trustcare-vp-json";
  if (type === "vc") return "trustcare-vc-json";
  if (type === "oid4vci_offer") return "oid4vci-offer";
  if (type === "oid4vp_request") return "oid4vp-request";
  return "raw-json";
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractViewerUrl(value: string, canonicalShl: string): string | undefined {
  if (value === canonicalShl) return undefined;
  try {
    const url = new URL(value);
    const hash = decodeURIComponent(url.hash.replace(/^#/, ""));
    return hash === canonicalShl || hash.startsWith("shlink:/") ? value : undefined;
  } catch {
    return undefined;
  }
}

function withPendingTrustCareManifest(shl: ShlPackage, canonicalShl: string): ShlPackageDetail {
  const suffix = stableId(canonicalShl);
  const manifestCredentialId = shl.manifestCredentialId ?? `pending:trustcare:vc:shl-manifest:${suffix}`;
  const presentationId = shl.presentationId ?? `pending:trustcare:vp:shl-manifest:${suffix}`;
  return {
    ...shl,
    manifestCredentialId,
    presentationId,
    trustcareCertification: shl.trustcareCertification ?? {
      status: "pending_maker_checker",
      ownerConfirmed: false,
      policyVersion: "trustcare-shl-governance-2026.07"
    },
    documentBundle: {
      bundleId: `imported_shl_bundle_${suffix}`,
      manifestVersion: 1,
      source: shl.manifestUrl ?? shl.viewerUrl ?? "standard_shl_import",
      bindingModel: "Standard SHL + pending TrustCare Manifest VP",
      standards: ["SMART Health Links", "FHIR DocumentReference", "W3C VC/VP"],
      status: "pending_maker_checker",
      files: [],
      documents: [
        {
          id: `imported-shl:${suffix}:manifest`,
          sequence: 1,
          title: shl.label ?? "Imported SMART Health Link Manifest",
          documentType: "shl_manifest",
          category: "sharing_and_sync",
          status: "pending_maker_checker",
          sourceRole: "external_source",
          fhirResource: "DocumentReference",
          contentType: "application/smart-health-link",
          manifestFileId: `shl-manifest:${suffix}`,
          manifestVersion: 1,
          objectLinks: {
            manifest: shl.manifestUrl ?? undefined,
            shlFile: canonicalShl,
            holderPresentation: presentationId,
            manifestCredential: manifestCredentialId
          },
          vcBinding: {
            recommendedCredentialType: "ShlManifestCredential",
            manifestCredentialId,
            presentationId
          },
          accessBinding: {
            passcodeRequired: Boolean(shl.passcodeRequired),
            expiresAt: shl.expiresAt ?? undefined,
            currentAccessCount: shl.currentAccessCount ?? 0,
            maxAccessCount: shl.maxAccessCount ?? undefined
          }
        }
      ]
    }
  };
}

function fail(format: WalletImportResult["format"], error: string): WalletImportResult {
  return { ok: false, format, warnings: [], errors: [error] };
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function stableNumericId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

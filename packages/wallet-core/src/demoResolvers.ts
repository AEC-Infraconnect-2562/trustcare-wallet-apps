export type DemoResolverKind =
  "vp" | "shl-manifest" | "manifest-vp" | "holder-vc";

export type DemoResolvedPayload = {
  kind: DemoResolverKind;
  id: string;
  payload: Record<string, unknown>;
};

export function createDemoResolverUrl(
  origin: string,
  kind: DemoResolverKind,
  id: string,
  payload: Record<string, unknown>,
): string {
  const url = new URL(normalizeOrigin(origin));
  url.searchParams.set("tc_resolver", kind);
  url.searchParams.set("tc_id", id);
  url.searchParams.set("tc_payload", base64UrlEncode(JSON.stringify(payload)));
  return url.toString();
}

export function createDemoResolverReferenceUrl(
  origin: string,
  kind: DemoResolverKind,
  id: string,
): string {
  const url = new URL(normalizeOrigin(origin));
  url.searchParams.set("tc_resolver", kind);
  url.searchParams.set("tc_id", id);
  url.searchParams.set("tc_ref", "1");
  return url.toString();
}

export function createDemoManifestUrl(
  origin: string,
  id: string,
  manifest: Record<string, unknown>,
): string {
  const compact = compactShlManifest(manifest);
  const trustcare = objectValue(compact.trustcare);
  const access = objectValue(compact.access);
  const files = arrayValue(compact.files).map(objectValue);
  const url = new URL(normalizeOrigin(origin));
  url.searchParams.set("tc_resolver", "shl-manifest");
  url.searchParams.set("tc_id", id);
  url.searchParams.set("tc_ref", "manifest");
  url.searchParams.set("tc_file_count", String(files.length));
  url.searchParams.set(
    "tc_status",
    stringValue(trustcare.trustLayerStatus, "standard_shl"),
  );
  url.searchParams.set("tc_context", stringValue(compact.context, "opd_visit"));
  url.searchParams.set("tc_label", stringValue(compact.label, id));
  url.searchParams.set(
    "tc_exp",
    stringValue(access.expiresAt ?? compact.expiresAt, ""),
  );
  url.searchParams.set(
    "tc_types",
    files.map((file) => stringValue(file.documentType, "document")).join(","),
  );
  return url.toString();
}

export function resolveDemoResolverPayload(
  value: string,
): DemoResolvedPayload | null {
  const parsed = parseUrl(value);
  if (!parsed) return null;
  const kind = parsed.searchParams.get(
    "tc_resolver",
  ) as DemoResolverKind | null;
  const id = parsed.searchParams.get("tc_id");
  const encoded = parsed.searchParams.get("tc_payload");
  if (!kind || !id || !encoded) return null;
  if (!["vp", "shl-manifest", "manifest-vp", "holder-vc"].includes(kind))
    return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return null;
    return { kind, id, payload };
  } catch {
    return null;
  }
}

export function resolveDemoShlManifestFromUrl(
  value: string,
): Record<string, unknown> | null {
  const resolved = resolveDemoResolverPayload(value);
  if (resolved?.kind === "shl-manifest") return resolved.payload;
  const parsed = parseUrl(value);
  if (!parsed) return null;
  if (parsed.searchParams.get("tc_resolver") !== "shl-manifest") return null;
  const id = parsed.searchParams.get("tc_id");
  if (!id) return null;
  return expandDemoManifestReference(parsed, id);
}

export function hashJson(value: unknown): string {
  return `sha256:${stableHash(JSON.stringify(canonicalize(value)))}`;
}

export function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeOrigin(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://"))
    return value.replace(/#.*$/, "");
  return `https://trustcare.example.com/${value.replace(/^\/+/, "")}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return hex.repeat(8).slice(0, 64);
}

function compactShlManifest(
  manifest: Record<string, unknown>,
): Record<string, unknown> {
  const trustcare = objectValue(manifest.trustcare);
  const access = objectValue(manifest.access);
  return removeUndefined({
    resourceType: manifest.resourceType,
    manifestVersion: manifest.manifestVersion,
    gatewayPublicationId: manifest.gatewayPublicationId,
    shlId: manifest.shlId,
    label: manifest.label,
    context: manifest.context,
    purpose: manifest.purpose,
    createdAt: manifest.createdAt,
    expiresAt: manifest.expiresAt,
    receiver: manifest.receiver,
    files: arrayValue(manifest.files).map(compactShlFile),
    access: removeUndefined({
      passcodeRequired: access.passcodeRequired,
      accessCodeDelivery: access.accessCodeDelivery,
      expiresAt: access.expiresAt,
      maxAccessCount: access.maxAccessCount,
    }),
    trustcare: removeUndefined({
      trustLayerStatus: trustcare.trustLayerStatus,
      makerCheckerStatus: trustcare.makerCheckerStatus,
      manifestCredentialId: trustcare.manifestCredentialId,
      holderPresentationId: trustcare.holderPresentationId,
      holderAuthorizationCredentialId:
        trustcare.holderAuthorizationCredentialId,
      manifestVpUrl: trustcare.manifestVpUrl,
      manifestVpHash: trustcare.manifestVpHash,
      contractHubVersion: trustcare.contractHubVersion,
    }),
  });
}

function compactShlFile(value: unknown): Record<string, unknown> {
  const file = objectValue(value);
  const embedded = objectValue(file.embedded);
  return removeUndefined({
    id: file.id,
    contentType: file.contentType,
    hash: file.hash,
    location: file.location,
    title: file.title,
    documentType: file.documentType,
    credentialId: file.credentialId,
    embedded:
      "embedded" in file
        ? removeUndefined({
            resourceType: embedded.resourceType ?? "Bundle",
            type: embedded.type ?? "document",
            id: embedded.id ?? file.id,
          })
        : undefined,
  });
}

function expandDemoManifestReference(
  parsed: URL,
  id: string,
): Record<string, unknown> {
  const fileCount = Math.max(
    0,
    Number.parseInt(parsed.searchParams.get("tc_file_count") ?? "0", 10) || 0,
  );
  const types = (parsed.searchParams.get("tc_types") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const trustLayerStatus =
    parsed.searchParams.get("tc_status") ?? "standard_shl";
  const context = parsed.searchParams.get("tc_context") ?? "opd_visit";
  const label = parsed.searchParams.get("tc_label") ?? id;
  const expiresAt = parsed.searchParams.get("tc_exp") || undefined;
  const files = Array.from({ length: fileCount }, (_, index) => {
    const documentType = types[index] ?? "document";
    return {
      id: `${id}:file:${index + 1}:${documentType}`,
      contentType: "application/fhir+json",
      hash: `sha256:demo-${id}-${index + 1}`,
      title: documentType,
      documentType,
      location: `${parsed.origin}${parsed.pathname}?tc_resolver=shl-file&tc_id=${encodeURIComponent(id)}&tc_file=${index + 1}`,
    };
  });
  const documents = files.map((file, index) => ({
    id: `${id}:doc:${index + 1}:${String(file.documentType)}`,
    sequence: index + 1,
    title: String(file.title),
    documentType: String(file.documentType),
    category: "clinical_summary",
    status: "available_in_manifest",
    sourceRole: "issuer",
    fhirResource: "DocumentReference",
    contentType: String(file.contentType),
    manifestFileId: String(file.id),
    manifestVersion: 1,
    objectLinks: {
      fhirDocumentReference: `DocumentReference/${String(file.id)}`,
    },
    accessBinding: {
      passcodeRequired: false,
      expiresAt,
      currentAccessCount: 0,
      maxAccessCount: 5,
    },
  }));
  const manifestHash = hashJson({ files, documents });
  const holderDid = `did:key:demo-holder-${stableHash(id).slice(0, 12)}`;
  const accessPolicy = {
    expiresAt,
    recipient: "TrustCare static demo verifier",
    purpose: label,
    maxAccessCount: 5,
    passcodeRequired: false,
  };
  const accessPolicyHash = hashJson(accessPolicy);
  const manifestCredential =
    trustLayerStatus === "certified_manifest_vp"
      ? {
          "@context": [
            "https://www.w3.org/ns/credentials/v2",
            "https://trustcare.network/contexts/shl-manifest/v1",
          ],
          id: `urn:trustcare:vc:manifest:${id}`,
          type: ["VerifiableCredential", "TrustCareManifestCredential"],
          issuer: "did:web:trustcare.network:contract-hub",
          validFrom: new Date(0).toISOString(),
          validUntil: expiresAt,
          credentialSubject: {
            id: holderDid,
            shlPublicationId: id,
            manifestUrl: parsed.toString(),
            manifestHash,
            fileHashes: files.map((file) => file.hash),
            documentReferences: documents.map(
              (document) => document.objectLinks.fhirDocumentReference,
            ),
            accessPolicy,
            accessPolicyHash,
            documentCount: documents.length,
            context,
            purpose: label,
          },
        }
      : undefined;
  const holderAuthorizationCredential =
    trustLayerStatus === "certified_manifest_vp"
      ? {
          "@context": [
            "https://www.w3.org/ns/credentials/v2",
            "https://trustcare.network/contexts/holder-authorization/v1",
          ],
          id: `urn:trustcare:vc:holder-authorization:${id}`,
          type: ["VerifiableCredential", "HolderAuthorizationCredential"],
          issuer: holderDid,
          validFrom: new Date(0).toISOString(),
          validUntil: expiresAt,
          credentialSubject: {
            id: holderDid,
            authorizedRecipient: "TrustCare static demo verifier",
            purpose: label,
            shlPublicationId: id,
            authorizedManifestCredentialId: `urn:trustcare:vc:manifest:${id}`,
            selectedDocumentIds: documents.map((document) => document.id),
            consentReceiptId: null,
            accessPolicyHash,
            minimumNecessary: true,
            accessPolicyConfirmed: true,
          },
        }
      : undefined;
  const manifestVp =
    trustLayerStatus === "certified_manifest_vp"
      ? {
          "@context": [
            "https://www.w3.org/ns/credentials/v2",
            "https://trustcare.network/contexts/shl-manifest-presentation/v1",
          ],
          id: `urn:trustcare:vp:manifest:${id}`,
          type: ["VerifiablePresentation", "TrustCareManifestVP"],
          holder: holderDid,
          verifiableCredential: [
            manifestCredential,
            holderAuthorizationCredential,
          ],
          trustcare: {
            certification: "certified_manifest_vp",
            makerCheckerStatus: "approved",
            shlPublicationId: id,
            manifestUrl: parsed.toString(),
            documentIds: documents.map((document) => document.id),
            fileHashes: files.map((file) => file.hash),
            accessPolicyHash,
          },
        }
      : undefined;
  const manifestVpHash = manifestVp ? hashJson(manifestVp) : undefined;
  return removeUndefined({
    resourceType: "TrustCareShlManifest",
    manifestVersion: 1,
    gatewayPublicationId: id,
    shlId: id,
    label,
    context,
    purpose: label,
    expiresAt,
    files,
    documentBundle: {
      bundleId: `shl_bundle_${id}`,
      manifestVersion: 1,
      source: parsed.origin,
      bindingModel:
        trustLayerStatus === "certified_manifest_vp"
          ? "standard_shl_plus_trustcare_manifest_vp"
          : "standard_shl",
      standards:
        trustLayerStatus === "certified_manifest_vp"
          ? ["SMART Health Links", "FHIR DocumentReference", "W3C VC/VP"]
          : ["SMART Health Links", "FHIR DocumentReference"],
      status: trustLayerStatus,
      documents,
      files,
    },
    access: removeUndefined({
      expiresAt,
      passcodeRequired: false,
      accessCodeDelivery: "not_required",
      maxAccessCount: 5,
    }),
    trustcare: removeUndefined({
      trustLayerStatus,
      makerCheckerStatus:
        trustLayerStatus === "certified_manifest_vp"
          ? "approved"
          : "not_required",
      manifestCredentialId:
        trustLayerStatus === "certified_manifest_vp"
          ? `urn:trustcare:vc:manifest:${id}`
          : undefined,
      holderPresentationId:
        trustLayerStatus === "certified_manifest_vp"
          ? `urn:trustcare:vp:manifest:${id}`
          : undefined,
      holderAuthorizationCredentialId:
        trustLayerStatus === "certified_manifest_vp"
          ? `urn:trustcare:vc:holder-authorization:${id}`
          : undefined,
      manifestCredential,
      holderAuthorizationCredential,
      manifestVp,
      manifestVpHash,
      contractHubVersion: "2026.07.prepare-service.v1",
    }),
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function removeUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

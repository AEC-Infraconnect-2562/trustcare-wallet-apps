import {
  createWalletExchangePartition,
  type WalletDocumentRecordV2,
  type WalletExchangePartition,
  type WalletExchangeState,
  type WalletExchangeSyncReduction,
} from "@trustcare/wallet-core";
import type {
  WalletExchangeCredentialRequestLink,
  WalletExchangePendingSubmissionDraft,
  WalletExchangeSubmissionLink,
} from "./walletExchangeWorkflow";

const stateKeys = [
  "version",
  "credentialVerificationProfile",
  "partition",
  "nextCursor",
  "documents",
  "lineages",
  "history",
  "processedEvents",
  "quarantine",
  "pendingAck",
  "lastAckReceipt",
  "retryJournal",
] as const;

/**
 * Shared trust boundary for Web and Mobile Wallet Exchange persistence.
 * Platform adapters remain responsible for transaction and key storage, while
 * this policy ensures both persist exactly the same holder-scoped data model.
 */
export class WalletExchangePersistencePolicy {
  private trustedIssuerDids = new Set<string>();

  constructor(readonly partition: WalletExchangePartition) {}

  configureTrustedIssuers(issuerDids: readonly string[]): void {
    const next = new Set(
      issuerDids.map((issuerDid) => requireDidWeb(issuerDid, "issuerDid")),
    );
    if (!next.size) {
      throw new Error(
        "Wallet Exchange persistence requires live Portal trusted issuers.",
      );
    }
    this.trustedIssuerDids = next;
  }

  assertReduction(reduction: WalletExchangeSyncReduction): void {
    this.assertState(reduction.state);
    if (reduction.plan.partitionKey !== this.partition.key) {
      throw new Error(
        "Wallet Exchange atomic plan belongs to another partition.",
      );
    }
    if (
      reduction.state.nextCursor !== reduction.plan.nextCursor ||
      !sameValue(reduction.state.pendingAck, reduction.plan.pendingAck)
    ) {
      throw new Error(
        "Wallet Exchange reducer state does not match its atomic cursor and pending ACK plan.",
      );
    }
    reduction.plan.documents.put.forEach((document) =>
      this.assertDocument(document),
    );
    assertNoSensitiveMaterial(reduction.state);
  }

  assertState(state: WalletExchangeState): void {
    assertNoSensitiveMaterial(state);
    assertExactKeys(state, stateKeys);
    if (state.partition.key !== this.partition.key) {
      throw new Error("Wallet Exchange state belongs to another partition.");
    }
    const normalized = createWalletExchangePartition(state.partition);
    if (
      normalized.portalOrigin !== this.partition.portalOrigin ||
      normalized.holderDid !== this.partition.holderDid ||
      normalized.key !== this.partition.key
    ) {
      throw new Error("Wallet Exchange state partition metadata is invalid.");
    }
    state.documents.forEach((document) => this.assertDocument(document));
  }

  assertDocument(document: WalletDocumentRecordV2): void {
    if (document.schemaVersion !== "2.0") {
      throw new Error(
        "Wallet Exchange only persists Wallet document V2 records.",
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(document.owner, "patientId") ||
      document.owner.id !== this.partition.holderDid ||
      document.owner.holderDid !== this.partition.holderDid
    ) {
      throw new Error(
        "Wallet Exchange document must belong only to its holder did:key partition and must not contain patientId.",
      );
    }
    if (document.provenance.sourceKind !== "trustcare_portal") {
      throw new Error(
        "Wallet Exchange persistence accepts only live Portal-synced documents.",
      );
    }
    const issuerDid = document.provenance.issuerDid;
    if (!issuerDid || !this.trustedIssuerDids.has(issuerDid)) {
      throw new Error(
        "Wallet Exchange document issuer must match a DID resolved from the live Portal trust registry; derived or legacy issuer fallback is forbidden.",
      );
    }
    assertNoSensitiveMaterial(document);
  }

  assertRequestLink(link: WalletExchangeCredentialRequestLink): void {
    assertExactKeys(link, [
      "clientRequestId",
      "requestId",
      "idempotencyKey",
      "statusUrl",
      "lastKnownStatus",
      "targetHospitalCode",
      "context",
      "purpose",
      "credentialTypes",
      "documentTypes",
      "sandboxRunId",
      "items",
      "shlCertification",
      "createdAt",
      "updatedAt",
    ]);
    requireText(link.clientRequestId, "clientRequestId");
    requireText(link.requestId, "requestId");
    requireText(link.idempotencyKey, "idempotencyKey");
    this.assertPortalStatusUrl(
      link.statusUrl,
      "credential-requests",
      link.requestId,
    );
    requireTimestamp(link.createdAt, "createdAt");
    requireTimestamp(link.updatedAt, "updatedAt");
    if (link.lastKnownStatus !== undefined) {
      requireText(link.lastKnownStatus, "lastKnownStatus");
    }
    if (!["TCC", "TCP", "TCM"].includes(link.targetHospitalCode)) {
      throw new Error("Wallet Exchange request hospital code is invalid.");
    }
    requireText(link.context, "context");
    requireText(link.purpose, "purpose");
    requireStringList(link.credentialTypes, "credentialTypes");
    if (link.documentTypes !== undefined) {
      requireStringList(link.documentTypes, "documentTypes");
    }
    if (
      link.sandboxRunId !== undefined &&
      !/^sandbox:v1:[a-f0-9]{64}$/.test(link.sandboxRunId)
    ) {
      throw new Error("Wallet Exchange sandbox run id is invalid.");
    }
    if (link.items !== undefined) {
      if (!Array.isArray(link.items)) {
        throw new Error("Wallet Exchange request items must be an array.");
      }
      for (const item of link.items) {
        assertExactKeys(item, [
          "requestId",
          "documentType",
          "status",
          "reasonCode",
          "nextAction",
          "updatedAt",
        ]);
        requireText(item.requestId, "items.requestId");
        requireText(item.documentType, "items.documentType");
        requireText(item.status, "items.status");
        requireText(item.reasonCode, "items.reasonCode");
        requireText(item.nextAction, "items.nextAction");
        requireTimestamp(item.updatedAt, "items.updatedAt");
      }
    }
    if (link.shlCertification !== undefined) {
      const certification = link.shlCertification;
      assertExactKeys(certification, ["schema", "binding", "certified"]);
      if (certification.schema !== "trustcare.wallet.shl-certification-link.v1") {
        throw new Error("Unsupported Wallet SHL certification link schema.");
      }
      const binding = certification.binding;
      assertExactKeys(binding, [
        "schema",
        "shlPackageId",
        "holderDid",
        "manifestUrl",
        "manifestHash",
        "sourceBundleHash",
        "fileHashes",
        "purpose",
        "recipient",
        "audience",
        "context",
        "consentRef",
        "issuedAt",
        "expiresAt",
        "holderPresentationId",
        "holderPresentationJwt",
        "sourceCredentials",
      ]);
      if (
        binding.schema !==
          "trustcare.wallet.shl-certification-binding.v1" ||
        binding.holderDid !== this.partition.holderDid
      ) {
        throw new Error("Wallet SHL certification binding is inconsistent.");
      }
      requireOpaqueShlPackageId(binding.shlPackageId, "shlPackageId");
      requireHttpsUrl(binding.manifestUrl, "manifestUrl");
      requireSha256(binding.manifestHash, "manifestHash");
      requireSha256(binding.sourceBundleHash, "sourceBundleHash");
      requireStringList([...binding.fileHashes], "fileHashes");
      binding.fileHashes.forEach((hash) => requireSha256(hash, "fileHash"));
      requireText(binding.purpose, "purpose");
      requireText(binding.recipient, "recipient");
      requireHttpsUrl(binding.audience, "audience");
      requireText(binding.context, "context");
      requireText(binding.consentRef, "consentRef");
      requireTimestamp(binding.issuedAt, "issuedAt");
      requireTimestamp(binding.expiresAt, "expiresAt");
      if (Date.parse(binding.expiresAt) <= Date.parse(binding.issuedAt)) {
        throw new Error("Wallet SHL certification binding expiry is invalid.");
      }
      requireText(binding.holderPresentationId, "holderPresentationId");
      requireCompactJws(binding.holderPresentationJwt, "holderPresentationJwt");
      if (!binding.sourceCredentials.length) {
        throw new Error("Wallet SHL certification binding requires source credentials.");
      }
      binding.sourceCredentials.forEach((source, index) => {
        assertExactKeys(source, [
          "documentId",
          "credentialId",
          "plaintextSha256",
        ]);
        requireText(source.documentId, `sourceCredentials[${index}].documentId`);
        requireText(source.credentialId, `sourceCredentials[${index}].credentialId`);
        requireSha256(
          source.plaintextSha256,
          `sourceCredentials[${index}].plaintextSha256`,
        );
      });
      if (certification.certified) {
        const certified = certification.certified;
        assertExactKeys(certified, [
          "manifestCredentialId",
          "manifestCredentialJwt",
          "issuerDid",
          "verificationMethod",
          "verifiedAt",
          "objectLinks",
        ]);
        requireTimestamp(certified.verifiedAt, "verifiedAt");
        requireText(certified.manifestCredentialId, "manifestCredentialId");
        requireCompactJws(certified.manifestCredentialJwt, "manifestCredentialJwt");
        requireDidWeb(certified.issuerDid, "issuerDid");
        if (!certified.verificationMethod.startsWith(`${certified.issuerDid}#`)) {
          throw new Error("Certified SHL verification method is not controlled by its issuer.");
        }
        const objectLinks = certified.objectLinks;
        assertExactKeys(objectLinks, [
          "shlPackageId",
          "manifestHash",
          "manifestCredentialId",
          "manifestCredentialJwt",
          "holderPresentationId",
          "holderPresentationJwt",
          "sourceCredentials",
        ]);
        if (
          objectLinks.shlPackageId !== binding.shlPackageId ||
          objectLinks.manifestHash !== binding.manifestHash ||
          objectLinks.manifestCredentialId !== certified.manifestCredentialId ||
          objectLinks.manifestCredentialJwt !== certified.manifestCredentialJwt ||
          objectLinks.holderPresentationId !== binding.holderPresentationId ||
          objectLinks.holderPresentationJwt !== binding.holderPresentationJwt ||
          !sameValue(objectLinks.sourceCredentials, binding.sourceCredentials)
        ) {
          throw new Error("Certified SHL object links do not match their request binding.");
        }
      }
    }
    assertNoSensitiveMaterial(link);
  }

  assertSubmissionLink(link: WalletExchangeSubmissionLink): void {
    assertExactKeys(link, [
      "clientSubmissionId",
      "submissionId",
      "idempotencyKey",
      "intentDigest",
      "requestDigest",
      "statusUrl",
      "lastKnownStatus",
      "createdAt",
      "updatedAt",
    ]);
    requireText(link.clientSubmissionId, "clientSubmissionId");
    requireText(link.submissionId, "submissionId");
    requireText(link.idempotencyKey, "idempotencyKey");
    requireSha256(link.intentDigest, "intentDigest");
    requireSha256(link.requestDigest, "requestDigest");
    this.assertPortalStatusUrl(
      link.statusUrl,
      "submissions",
      link.submissionId,
    );
    requireTimestamp(link.createdAt, "createdAt");
    requireTimestamp(link.updatedAt, "updatedAt");
    if (link.lastKnownStatus !== undefined) {
      requireText(link.lastKnownStatus, "lastKnownStatus");
    }
    assertNoSensitiveMaterial(link);
  }

  async assertPendingSubmissionDraft(
    draft: WalletExchangePendingSubmissionDraft,
  ): Promise<void> {
    assertExactKeys(draft, [
      "schema",
      "clientSubmissionId",
      "idempotencyKey",
      "intentDigest",
      "requestDigest",
      "requestBody",
      "request",
      "createdAt",
    ]);
    if (draft.schema !== "trustcare.wallet.submission-outbox.v1") {
      throw new Error("Unsupported Wallet Exchange submission outbox schema.");
    }
    requireText(draft.clientSubmissionId, "clientSubmissionId");
    requireText(draft.idempotencyKey, "idempotencyKey");
    requireSha256(draft.intentDigest, "intentDigest");
    requireSha256(draft.requestDigest, "requestDigest");
    requireTimestamp(draft.createdAt, "createdAt");
    assertExactKeys(draft.request, [
      "clientSubmissionId",
      "context",
      "purpose",
      "consentRef",
      "transport",
    ]);
    assertExactKeys(draft.request.transport, ["mode", "vpJwt"]);
    if (
      draft.request.clientSubmissionId !== draft.clientSubmissionId ||
      draft.request.transport.mode !== "direct_vp" ||
      draft.request.transport.vpJwt.split(".").length !== 3
    ) {
      throw new Error(
        "Wallet Exchange submission outbox must contain one exact holder-signed direct VP request.",
      );
    }
    requireText(draft.request.context, "context");
    requireText(draft.request.purpose, "purpose");
    requireText(draft.request.consentRef, "consentRef");
    requireText(draft.request.transport.vpJwt, "vpJwt");
    if (JSON.stringify(draft.request) !== draft.requestBody) {
      throw new Error(
        "Wallet Exchange submission outbox request bytes do not match its request object.",
      );
    }
    if ((await sha256Digest(draft.requestBody)) !== draft.requestDigest) {
      throw new Error(
        "Wallet Exchange submission outbox request digest is invalid.",
      );
    }
    assertNoPatientId(draft);
    assertNoSensitiveMaterial(draft);
  }

  assertDraftMatchesLink(
    draft: WalletExchangePendingSubmissionDraft,
    link: WalletExchangeSubmissionLink,
  ): void {
    if (
      draft.clientSubmissionId !== link.clientSubmissionId ||
      draft.idempotencyKey !== link.idempotencyKey ||
      draft.intentDigest !== link.intentDigest ||
      draft.requestDigest !== link.requestDigest
    ) {
      throw new Error(
        "Wallet Exchange submission link does not match its pending outbox identity.",
      );
    }
  }

  assertPartitionKey(partitionKey: string, label: string): void {
    if (partitionKey !== this.partition.key) {
      throw new Error(`Wallet Exchange ${label} partition boundary violation.`);
    }
  }

  assertNoSensitiveMaterial(value: unknown): void {
    assertNoSensitiveMaterial(value);
  }

  sameDocumentSet(
    left: WalletDocumentRecordV2[],
    right: WalletDocumentRecordV2[],
  ): boolean {
    const sort = (records: WalletDocumentRecordV2[]) =>
      [...records].sort((a, b) => a.id.localeCompare(b.id));
    return sameValue(sort(left), sort(right));
  }

  sameValue(left: unknown, right: unknown): boolean {
    return sameValue(left, right);
  }

  documentKey(documentId: string): string {
    return this.partitionedKey(documentId);
  }

  requestLinkKey(clientRequestId: string): string {
    return this.partitionedKey(clientRequestId);
  }

  submissionLinkKey(clientSubmissionId: string): string {
    return this.partitionedKey(clientSubmissionId);
  }

  private assertPortalStatusUrl(
    value: string,
    collection: "credential-requests" | "submissions",
    id: string,
  ): void {
    const url = new URL(
      requireText(value, "statusUrl"),
      this.partition.portalOrigin,
    );
    const expectedPath = `/api/wallet/v2/${collection}/${encodeURIComponent(id)}`;
    if (
      url.origin !== this.partition.portalOrigin ||
      url.pathname !== expectedPath ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Wallet Exchange statusUrl must be the exact Portal status endpoint.",
      );
    }
  }

  private partitionedKey(id: string): string {
    return `${this.partition.key}::${encodeURIComponent(id)}`;
  }
}

export function createWalletExchangePersistencePolicy(input: {
  portalOrigin: string;
  holderDid: string;
}): WalletExchangePersistencePolicy {
  return new WalletExchangePersistencePolicy(
    createWalletExchangePartition(input),
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function assertNoSensitiveMaterial(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") return;
  if (isCryptoKeyLike(value)) {
    throw new Error(
      `Wallet Exchange persistence must never serialize CryptoKey material (${path}).`,
    );
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSensitiveMaterial(item, `${path}[${index}]`),
    );
    return;
  }
  const object = value as Record<string, unknown>;
  if (
    typeof object.kty === "string" &&
    Object.prototype.hasOwnProperty.call(object, "d")
  ) {
    throw new Error(
      `Wallet Exchange persistence must never serialize a private JWK (${path}).`,
    );
  }
  for (const [key, child] of Object.entries(object)) {
    if (
      /^(?:access|refresh|session|service|id|bearer)?_?token$/i.test(key) ||
      /^(?:authorization|dpop(?:Proof)?|sessionJwt)$/i.test(key) ||
      /^(?:privateKey|privateJwk)$/i.test(key)
    ) {
      throw new Error(
        `Wallet Exchange persistence must never store session, token, or private-key material (${path}.${key}).`,
      );
    }
    assertNoSensitiveMaterial(child, `${path}.${key}`);
  }
}

function isCryptoKeyLike(value: object): boolean {
  const candidate = value as Partial<CryptoKey>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.extractable === "boolean" &&
    Array.isArray(candidate.usages) &&
    Boolean(candidate.algorithm && typeof candidate.algorithm.name === "string")
  );
}

function assertExactKeys(value: object, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown Wallet Exchange persistence field: ${key}.`);
    }
  }
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string.`);
  return normalized;
}

function requireDidWeb(value: string, name: string): string {
  const normalized = requireText(value, name);
  if (!normalized.startsWith("did:web:")) {
    throw new Error(`${name} must be a did:web identifier.`);
  }
  return normalized;
}

function requireTimestamp(value: string, name: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }
}

function requireStringList(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${name} must contain at least one value.`);
  }
  value.forEach((item) => requireText(item, name));
}

function requireOpaqueShlPackageId(value: unknown, name: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`${name} must be a 256-bit base64url identifier.`);
  }
}

function requireHttpsUrl(value: unknown, name: string): void {
  const url = new URL(requireText(value, name));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTPS URL without credentials, query, or fragment.`);
  }
}

function requireCompactJws(value: unknown, name: string): void {
  const compact = requireText(value, name);
  if (
    compact.split(".").length !== 3 ||
    compact.split(".").some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    throw new Error(`${name} must be a signed compact JWS.`);
  }
}

function requireSha256(value: string, name: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be a lowercase sha256 digest.`);
  }
}

async function sha256Digest(value: string): Promise<`sha256:${string}`> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
  return `sha256:${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function assertNoPatientId(value: unknown, path = "$."): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoPatientId(item, `${path}[${index}]`),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.replace(/[-_]/g, "").toLowerCase() === "patientid") {
      throw new Error(
        `Wallet Exchange persistence must never store Portal patientId (${path}${key}).`,
      );
    }
    assertNoPatientId(child, `${path}${key}.`);
  }
}

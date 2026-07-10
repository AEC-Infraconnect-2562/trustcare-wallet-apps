import {
  isTrustArtifactDocumentType,
  walletDocumentRecordFromCard,
  type CanonicalDocumentCategory,
  type CanonicalDocumentType,
  type WalletDocumentRecord,
} from "./canonicalDocuments";
import {
  recordFromMhdDocumentReference,
  type FhirDocumentReferenceLike,
  type RecordFromMhdInput,
} from "./mhd";
import type { WalletCard } from "./models";

export type LocalizedText = { th: string; en?: string };

export type WalletSubjectRef = {
  id: string;
  holderDid?: string;
  patientId?: string;
};

export type OrganizationRef = {
  id?: string;
  name?: string;
};

export type PractitionerRef = {
  id?: string;
  name?: string;
};

export type OriginalAttachment = {
  id?: string;
  contentType: string;
  title?: string;
  url?: string;
  hash?: string;
  createdAt?: string;
};

export type PatientReadableSummary = {
  title?: LocalizedText;
  summary?: LocalizedText;
  warnings?: LocalizedText[];
};

export type TrustCheck = {
  key: "proof" | "issuer" | "status" | "expiry" | "holder" | "policy" | string;
  status: "passed" | "failed" | "pending" | "warning";
  detail?: string;
  checkedAt?: string;
};

export type WalletDocumentLifecycleStatus =
  | "preliminary"
  | "final"
  | "amended"
  | "corrected"
  | "superseded"
  | "entered_in_error"
  | "expired"
  | "suspended"
  | "revoked";

export type WalletDocumentTrustState =
  | "verified"
  | "issuer_signed_untrusted"
  | "transport_valid"
  | "patient_provided_unverified"
  | "pending"
  | "expired"
  | "revoked"
  | "invalid";

export type WalletDocumentSourceKind =
  | "trustcare_portal"
  | "provider_fhir"
  | "mhd_repository"
  | "oid4vci"
  | "shl"
  | "external_wallet"
  | "patient_upload";

/**
 * Primary patient-document domain model introduced by Constitution V3.
 * `WalletCard` and the legacy `WalletDocumentRecord` remain migration inputs,
 * not competing product models.
 */
export type WalletDocumentRecordV2 = {
  schemaVersion: "2.0";
  id: string;
  owner: WalletSubjectRef;
  documentType: CanonicalDocumentType;
  category: CanonicalDocumentCategory;
  title: LocalizedText;
  clinicalContext: {
    encounterId?: string;
    episodeId?: string;
    serviceType?: string;
    facility?: OrganizationRef;
    practitioner?: PractitionerRef;
    recordTime?: string;
    clinicalPeriod?: { start?: string; end?: string };
  };
  lifecycle: {
    status: WalletDocumentLifecycleStatus;
    versionId: string;
    replaces?: string[];
    replacedBy?: string[];
    issuedAt?: string;
    updatedAt?: string;
    expiresAt?: string;
  };
  provenance: {
    sourceKind: WalletDocumentSourceKind;
    issuerDid?: string;
    issuerName?: string;
    author?: string;
    attester?: string;
    custodian?: string;
    sourceEndpoint?: string;
    receivedAt: string;
  };
  content: {
    documentProfile?: string;
    fhirDocument?: unknown;
    /** Exact source VC payload when this record was migrated from a credential. */
    credentialPayload?: Record<string, unknown>;
    documentReference: FhirDocumentReferenceLike;
    originalAttachments: OriginalAttachment[];
    patientSummary?: PatientReadableSummary;
  };
  credential: {
    credentialType?: string;
    format?: "vc+jwt" | "vc+sd-jwt" | "vc+ld+json" | "none";
    credentialId?: string;
    jwt?: string;
    proof?: unknown;
    credentialStatus?: unknown;
  };
  trust: {
    state: WalletDocumentTrustState;
    checks: TrustCheck[];
    verifiedAt?: string;
  };
  privacy: {
    confidentiality?: string;
    sensitivity?: string[];
    defaultDisclosure: "ask" | "allow" | "deny";
    selectivelyDisclosableFields: string[];
  };
  local: {
    pinned: boolean;
    availableOffline: boolean;
    cachedAt?: string;
    lastOpenedAt?: string;
  };
};

export const REQUIRED_WALLET_DOCUMENT_TRUST_CHECKS = [
  "proof",
  "issuer",
  "status",
  "expiry",
  "holder",
  "policy",
] as const;

export type WalletDocumentTrustPresentation = {
  state: WalletDocumentTrustState;
  labelTh: string;
  labelEn: string;
  tone: "neutral" | "green" | "yellow" | "red" | "blue";
};

export function isWalletDocumentTrustVerified(
  record: WalletDocumentRecordV2,
  now = new Date(),
): boolean {
  if (record.trust.state !== "verified") return false;
  if (
    [
      "superseded",
      "entered_in_error",
      "expired",
      "suspended",
      "revoked",
    ].includes(record.lifecycle.status)
  ) {
    return false;
  }
  if (
    record.lifecycle.expiresAt &&
    (!Number.isFinite(Date.parse(record.lifecycle.expiresAt)) ||
      Date.parse(record.lifecycle.expiresAt) <= now.getTime())
  ) {
    return false;
  }
  const verifiedAt = record.trust.verifiedAt
    ? Date.parse(record.trust.verifiedAt)
    : Number.NaN;
  if (!Number.isFinite(verifiedAt) || verifiedAt > now.getTime()) return false;

  return REQUIRED_WALLET_DOCUMENT_TRUST_CHECKS.every((key) =>
    record.trust.checks.some((check) => {
      const checkedAt = check.checkedAt
        ? Date.parse(check.checkedAt)
        : Number.NaN;
      return (
        check.key === key &&
        check.status === "passed" &&
        Number.isFinite(checkedAt) &&
        checkedAt <= now.getTime()
      );
    }),
  );
}

export function effectiveWalletDocumentTrustState(
  record: WalletDocumentRecordV2,
  now = new Date(),
): WalletDocumentTrustState {
  if (record.lifecycle.status === "revoked") return "revoked";
  if (record.lifecycle.status === "entered_in_error") return "invalid";
  if (
    record.lifecycle.status === "expired" ||
    (record.lifecycle.expiresAt &&
      Number.isFinite(Date.parse(record.lifecycle.expiresAt)) &&
      Date.parse(record.lifecycle.expiresAt) <= now.getTime())
  ) {
    return "expired";
  }
  if (record.trust.state === "verified") {
    return isWalletDocumentTrustVerified(record, now) ? "verified" : "pending";
  }
  return record.trust.state;
}

export function walletDocumentTrustPresentation(
  record: WalletDocumentRecordV2,
  now = new Date(),
): WalletDocumentTrustPresentation {
  const state = effectiveWalletDocumentTrustState(record, now);
  const presentations: Record<
    WalletDocumentTrustState,
    Omit<WalletDocumentTrustPresentation, "state">
  > = {
    verified: {
      labelTh: "ตรวจสอบครบแล้ว",
      labelEn: "Fully verified",
      tone: "green",
    },
    issuer_signed_untrusted: {
      labelTh: "มีลายเซ็น แต่ยังตรวจไม่ครบ",
      labelEn: "Signed; trust checks incomplete",
      tone: "yellow",
    },
    transport_valid: {
      labelTh: "เปิดรับส่งได้ ยังไม่ยืนยันเนื้อหา",
      labelEn: "Transport valid; content unverified",
      tone: "blue",
    },
    patient_provided_unverified: {
      labelTh: "ผู้ใช้เพิ่มเอง ยังไม่ยืนยัน",
      labelEn: "Patient provided; unverified",
      tone: "yellow",
    },
    pending: {
      labelTh: "อยู่ระหว่างตรวจสอบ",
      labelEn: "Verification pending",
      tone: "yellow",
    },
    expired: { labelTh: "หมดอายุ", labelEn: "Expired", tone: "red" },
    revoked: { labelTh: "ถูกเพิกถอน", labelEn: "Revoked", tone: "red" },
    invalid: {
      labelTh: "ตรวจพบว่าไม่ถูกต้อง",
      labelEn: "Invalid",
      tone: "red",
    },
  };
  return { state, ...presentations[state] };
}

export type WalletDocumentV2MigrationOptions = {
  now?: string;
  availableOffline?: boolean;
  cachedAt?: string;
};

export function walletDocumentRecordV2FromCard(
  card: WalletCard,
  options: WalletDocumentV2MigrationOptions = {},
): WalletDocumentRecordV2 {
  return walletDocumentRecordV2FromLegacy(
    walletDocumentRecordFromCard(card),
    options,
  );
}

export function walletDocumentRecordV2FromLegacy(
  record: WalletDocumentRecord,
  options: WalletDocumentV2MigrationOptions = {},
): WalletDocumentRecordV2 {
  const now = options.now ?? new Date().toISOString();
  const sourceKind = sourceKindFromLegacy(record);
  const lifecycleStatus = lifecycleStatusFromLegacy(record);
  const ownerId =
    record.ownerUserId ??
    record.holderDid ??
    (record.patientId != null ? String(record.patientId) : undefined);
  if (!ownerId) {
    throw new Error(`Wallet document ${record.id} has no owner binding.`);
  }

  const trust = trustFromLegacy(record, lifecycleStatus, now);
  return {
    schemaVersion: "2.0",
    id: record.id,
    owner: {
      id: ownerId,
      holderDid: record.holderDid,
      patientId:
        record.patientId == null ? undefined : String(record.patientId),
    },
    documentType: record.documentType,
    category: record.category,
    title: {
      th: record.title,
      en: record.titleEn ?? undefined,
    },
    clinicalContext: {
      facility: record.issuerName
        ? { id: record.source.facilityId ?? undefined, name: record.issuerName }
        : undefined,
      recordTime: record.version.documentDate ?? record.issuedAt ?? undefined,
      clinicalPeriod: normalizeClinicalPeriod(record.version.clinicalPeriod),
    },
    lifecycle: {
      status: lifecycleStatus,
      versionId: record.version.versionId,
      replaces: record.version.replaces ? [record.version.replaces] : undefined,
      replacedBy: record.version.replacedBy
        ? [record.version.replacedBy]
        : undefined,
      issuedAt: record.issuedAt ?? undefined,
      updatedAt: record.version.documentDate ?? record.issuedAt ?? undefined,
      expiresAt: record.expiresAt ?? undefined,
    },
    provenance: {
      sourceKind,
      issuerDid: record.issuerDid ?? undefined,
      issuerName: record.issuerName ?? undefined,
      author: firstDisplay(record.documentReference.author),
      custodian: referenceValue(record.documentReference.custodian),
      sourceEndpoint:
        record.source.repositoryEndpoint ??
        record.source.mhdDocumentReferenceUrl ??
        undefined,
      receivedAt: record.source.importedAt ?? record.issuedAt ?? now,
    },
    content: {
      documentProfile: documentProfile(record.documentReference),
      fhirDocument: record.fhirDocumentBundle,
      credentialPayload: record.credentialData ?? undefined,
      documentReference: record.documentReference,
      originalAttachments: attachmentsFromDocumentReference(
        record.documentReference,
      ),
    },
    credential: {
      credentialType: record.credentialType ?? undefined,
      format: normalizeCredentialFormat(record.vcFormat),
      credentialId: record.credentialId,
      jwt:
        record.walletCard?.credentialProof?.jwt ??
        record.walletCard?.credentialJwt ??
        undefined,
      proof: record.walletCard?.credentialProof ?? undefined,
      credentialStatus: record.walletCard?.credentialStatus ?? record.status,
    },
    trust,
    privacy: {
      confidentiality: record.privacy.confidentiality,
      sensitivity: record.privacy.sensitivity,
      defaultDisclosure: "ask",
      selectivelyDisclosableFields:
        record.privacy.selectiveDisclosureFields ?? [],
    },
    local: {
      pinned: record.walletCard?.pinned ?? false,
      availableOffline: options.availableOffline ?? false,
      cachedAt: options.cachedAt,
      lastOpenedAt: undefined,
    },
  };
}

export function walletDocumentRecordV2FromMhd(
  documentReference: FhirDocumentReferenceLike,
  input: RecordFromMhdInput,
  options: WalletDocumentV2MigrationOptions = {},
): WalletDocumentRecordV2 {
  return walletDocumentRecordV2FromLegacy(
    recordFromMhdDocumentReference(documentReference, input),
    options,
  );
}

export function mergeWalletDocumentRecordsV2(
  existing: readonly WalletDocumentRecordV2[],
  incoming: readonly WalletDocumentRecordV2[],
): WalletDocumentRecordV2[] {
  const owners = new Set(
    [...existing, ...incoming].map((record) => record.owner.id),
  );
  if (owners.size > 1) {
    throw new Error(
      "Wallet document merge rejected records from different owners.",
    );
  }

  const records = new Map(existing.map((record) => [record.id, record]));
  for (const candidate of incoming) {
    const current = records.get(candidate.id);
    if (!current) {
      records.set(candidate.id, candidate);
      continue;
    }
    if (current.lifecycle.versionId === candidate.lifecycle.versionId) {
      if (stableJson(current) !== stableJson(candidate)) {
        throw new Error(
          `Wallet document ${candidate.id} changed without a new versionId.`,
        );
      }
      continue;
    }
    if (recordTimestamp(candidate) < recordTimestamp(current)) continue;
    records.set(candidate.id, candidate);
  }
  return [...records.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function groupWalletDocumentsV2ByEpisode(
  records: readonly WalletDocumentRecordV2[],
): Record<string, WalletDocumentRecordV2[]> {
  const grouped: Record<string, WalletDocumentRecordV2[]> = {};
  for (const record of records) {
    const key =
      record.clinicalContext.episodeId ??
      record.clinicalContext.encounterId ??
      "unassigned";
    (grouped[key] ??= []).push(record);
  }
  return grouped;
}

function trustFromLegacy(
  record: WalletDocumentRecord,
  lifecycle: WalletDocumentLifecycleStatus,
  now: string,
): WalletDocumentRecordV2["trust"] {
  if (lifecycle === "revoked") return terminalTrust("revoked", now);
  if (lifecycle === "entered_in_error") return terminalTrust("invalid", now);
  if (lifecycle === "expired" || isExpired(record.expiresAt, now))
    return terminalTrust("expired", now);

  const card = record.walletCard;
  // A legacy card only carries proof material and an unbound verification
  // summary. Migration must not turn that summary into fresh proof/status/
  // policy evidence. The verifier pipeline can promote the V2 record later.
  const proofVerified = false;
  const proofPresent = Boolean(
    card?.credentialProof?.jwt ??
    card?.credentialJwt ??
    card?.credentialProof?.type,
  );
  const issuerPresent = Boolean(record.issuerDid);
  const patientProvided =
    record.trustStatus === "patient_provided_unverified" ||
    sourceKindFromLegacy(record) === "patient_upload";
  const checks: TrustCheck[] = [
    check(
      "proof",
      proofVerified,
      proofPresent
        ? "Proof is present but not cryptographically verified."
        : "Cryptographic proof is missing.",
      now,
    ),
    check(
      "issuer",
      issuerPresent,
      issuerPresent
        ? (record.issuerDid ?? undefined)
        : "Issuer DID is missing.",
      now,
    ),
    check("status", true, lifecycle, now),
    check("expiry", true, record.expiresAt ?? "No expiry declared.", now),
    check(
      "holder",
      Boolean(record.holderDid || record.patientId),
      "Owner/patient binding",
      now,
    ),
    check(
      "policy",
      Boolean(card?.portalVerification?.verified),
      card?.portalVerification?.message ??
        "Policy verification has not completed.",
      now,
    ),
  ];

  if (patientProvided) {
    return { state: "patient_provided_unverified", checks };
  }
  if (
    proofVerified &&
    issuerPresent &&
    checks.every((item) => item.status === "passed")
  ) {
    return { state: "verified", checks, verifiedAt: now };
  }
  if (proofPresent) return { state: "issuer_signed_untrusted", checks };
  if (isTrustArtifactDocumentType(record.documentType))
    return { state: "pending", checks };
  return { state: "pending", checks };
}

function terminalTrust(
  state: "expired" | "revoked" | "invalid",
  now: string,
): WalletDocumentRecordV2["trust"] {
  return {
    state,
    checks: [
      {
        key: "status",
        status: "failed",
        detail: state,
        checkedAt: now,
      },
    ],
  };
}

function check(
  key: TrustCheck["key"],
  passed: boolean,
  detail: string | undefined,
  checkedAt: string,
): TrustCheck {
  return {
    key,
    status: passed ? "passed" : "pending",
    detail,
    checkedAt,
  };
}

function sourceKindFromLegacy(
  record: WalletDocumentRecord,
): WalletDocumentSourceKind {
  const source = String(record.sourceSystem ?? record.source.system ?? "")
    .trim()
    .toLowerCase();
  if (source.includes("trustcare_portal")) return "trustcare_portal";
  if (source.includes("mhd")) return "mhd_repository";
  if (source.includes("oid4vci")) return "oid4vci";
  if (source.includes("shl")) return "shl";
  if (source.includes("partner") || source.includes("external"))
    return "external_wallet";
  if (
    source.includes("patient") ||
    record.trustStatus === "patient_provided_unverified"
  )
    return "patient_upload";
  return "provider_fhir";
}

function lifecycleStatusFromLegacy(
  record: WalletDocumentRecord,
): WalletDocumentLifecycleStatus {
  const status = String(record.lifecycleStatus ?? record.status).toLowerCase();
  if (status === "active" || status === "current" || status === "final")
    return "final";
  if (status === "entered-in-error") return "entered_in_error";
  if (
    status === "preliminary" ||
    status === "amended" ||
    status === "corrected" ||
    status === "superseded" ||
    status === "entered_in_error" ||
    status === "expired" ||
    status === "suspended" ||
    status === "revoked"
  )
    return status;
  return "preliminary";
}

function attachmentsFromDocumentReference(
  reference: FhirDocumentReferenceLike,
): OriginalAttachment[] {
  return reference.content.map((entry, index) => ({
    id: `${reference.id}:attachment:${index + 1}`,
    contentType: entry.attachment.contentType,
    title: entry.attachment.title,
    url: entry.attachment.url,
    hash: entry.attachment.hash,
    createdAt: entry.attachment.creation,
  }));
}

function normalizeCredentialFormat(
  value: string | undefined,
): WalletDocumentRecordV2["credential"]["format"] {
  const normalized = String(value ?? "none").toLowerCase();
  if (normalized.includes("sd-jwt")) return "vc+sd-jwt";
  if (normalized.includes("jwt")) return "vc+jwt";
  if (normalized === "none") return "none";
  return "vc+ld+json";
}

function normalizeClinicalPeriod(
  value: { start?: string | null; end?: string | null } | null | undefined,
): { start?: string; end?: string } | undefined {
  if (!value) return undefined;
  return {
    start: value.start ?? undefined,
    end: value.end ?? undefined,
  };
}

function firstDisplay(
  values: Array<Record<string, unknown>> | undefined,
): string | undefined {
  const display = values?.[0]?.display;
  return typeof display === "string" ? display : undefined;
}

function referenceValue(value: Record<string, unknown> | undefined) {
  const reference = value?.reference ?? value?.display;
  return typeof reference === "string" ? reference : undefined;
}

function documentProfile(reference: FhirDocumentReferenceLike) {
  const coding = Array.isArray(reference.type?.coding)
    ? reference.type?.coding[0]
    : undefined;
  if (!coding || typeof coding !== "object") return undefined;
  const system = (coding as Record<string, unknown>).system;
  const code = (coding as Record<string, unknown>).code;
  return (
    [system, code].filter((value) => typeof value === "string").join("|") ||
    undefined
  );
}

function isExpired(expiresAt: string | null | undefined, now: string) {
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.parse(now));
}

function recordTimestamp(record: WalletDocumentRecordV2) {
  return Date.parse(
    record.lifecycle.updatedAt ??
      record.lifecycle.issuedAt ??
      record.provenance.receivedAt,
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

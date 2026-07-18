import type { ReadinessContext } from "./models";
import {
  canonicalServiceProfiles,
  isTrustArtifactDocumentType,
  normalizeDocumentType,
  type CanonicalDocumentType,
  type WalletDocumentRecord,
} from "./canonicalDocuments";
import { hashJson } from "./demoResolvers";
import { canPresentCredential } from "./statusTone";

export type MicroIpsPlusConsent = {
  consentId: string;
  purpose: string;
  grantedAt: string;
  expiresAt: string;
  grantedBy?: string;
  scope?: string[];
};

export type MicroIpsPlusPack = {
  resourceType: "TrustCareMicroIpsPlusPack";
  packVersion: "2026.07.v1";
  packId: string;
  context: ReadinessContext;
  generatedAt: string;
  expiresAt: string;
  subject: {
    holderDid?: string;
    patientId?: string | number | null;
    ownerUserId?: string;
  };
  recipient?: {
    id?: string;
    name?: string;
    did?: string;
  };
  consent: MicroIpsPlusConsent;
  sections: Array<{
    key: string;
    title: string;
    documentTypes: CanonicalDocumentType[];
    recordIds: string[];
    required: boolean;
  }>;
  records: WalletDocumentRecord[];
  standards: {
    clinicalSummary: "HL7_IPS_R4";
    documentIndex: "FHIR_DocumentReference_R4";
    documentExchange: "IHE_MHD";
    credentialExchange: "W3C_VC_VP";
    systemOfRecord: false;
  };
  evidence: Array<{
    recordId: string;
    documentReferenceId: string;
    documentReferenceHash: string;
    credentialId: string;
    sourceSystem?: string | null;
  }>;
  trust: {
    issuerSignedCount: number;
    unverifiedCount: number;
    trustArtifactCount: number;
    warnings: string[];
  };
  provenance: {
    source: "trustcare-wallet";
    selectedBy: "minimum-necessary";
    shareOnlyVia: "PurposeVP" | "StandardSHL" | "CertifiedSHLPackage";
    packageTime: string;
    recordTimeRange?: { start?: string; end?: string };
  };
};

export type BuildMicroIpsPlusPackInput = {
  context: ReadinessContext;
  records: WalletDocumentRecord[];
  consent: MicroIpsPlusConsent;
  recipient?: MicroIpsPlusPack["recipient"];
  expiresAt?: string;
  generatedAt?: string;
  packId?: string;
  includeRecommended?: boolean;
};

export type MicroIpsPlusValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function selectMinimumNecessaryRecords(
  context: ReadinessContext,
  records: WalletDocumentRecord[],
  options: { includeRecommended?: boolean } = {},
): WalletDocumentRecord[] {
  const profile = canonicalServiceProfiles[context];
  const allowedTypes = new Set<CanonicalDocumentType>();
  for (const requirement of profile.requirements) {
    if (requirement.required || options.includeRecommended) {
      requirement.documentTypes.forEach((type) => allowedTypes.add(type));
    }
  }
  const selectedByType = new Map<CanonicalDocumentType, WalletDocumentRecord>();
  for (const record of records) {
    const documentType = normalizeDocumentType(record.documentType);
    if (!documentType) continue;
    if (!allowedTypes.has(documentType)) continue;
    if (isTrustArtifactDocumentType(documentType)) continue;
    if (
      !canPresentCredential({
        credentialStatus: record.status,
        expiresAt: record.expiresAt,
      })
    )
      continue;
    const current = selectedByType.get(documentType);
    if (!current || compareRecordFreshness(record, current) > 0) {
      selectedByType.set(documentType, record);
    }
  }
  return [...selectedByType.values()].sort(compareRecordTimeline);
}

export function buildMicroIpsPlusPack(
  input: BuildMicroIpsPlusPackInput,
): MicroIpsPlusPack {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const expiresAt = input.expiresAt ?? input.consent.expiresAt;
  const records = selectMinimumNecessaryRecords(input.context, input.records, {
    includeRecommended: input.includeRecommended ?? true,
  });
  const profile = canonicalServiceProfiles[input.context];
  const subjectRecord = records[0] ?? input.records[0];
  const packId =
    input.packId ??
    `micro_ips_${input.context}_${hashJson({
      context: input.context,
      consentId: input.consent.consentId,
      generatedAt,
      recordIds: records.map((record) => record.id),
    }).slice(0, 16)}`;

  return {
    resourceType: "TrustCareMicroIpsPlusPack",
    packVersion: "2026.07.v1",
    packId,
    context: input.context,
    generatedAt,
    expiresAt,
    subject: {
      holderDid: subjectRecord?.holderDid,
      patientId: subjectRecord?.patientId,
      ownerUserId: subjectRecord?.ownerUserId,
    },
    recipient: input.recipient,
    consent: input.consent,
    sections: profile.requirements
      .filter((requirement) => requirement.required || input.includeRecommended)
      .map((requirement) => {
        const sectionRecords = records.filter((record) =>
          requirement.documentTypes.includes(record.documentType),
        );
        return {
          key: requirement.key,
          title: requirement.label,
          documentTypes: [...requirement.documentTypes],
          recordIds: sectionRecords.map((record) => record.id),
          required: requirement.required,
        };
      }),
    records,
    standards: {
      clinicalSummary: "HL7_IPS_R4",
      documentIndex: "FHIR_DocumentReference_R4",
      documentExchange: "IHE_MHD",
      credentialExchange: "W3C_VC_VP",
      systemOfRecord: false,
    },
    evidence: records.map((record) => ({
      recordId: record.id,
      documentReferenceId: record.documentReference.id,
      documentReferenceHash: hashJson(record.documentReference),
      credentialId: record.credentialId,
      sourceSystem: record.sourceSystem ?? record.source.system,
    })),
    trust: buildPackTrust(records),
    provenance: {
      source: "trustcare-wallet",
      selectedBy: "minimum-necessary",
      shareOnlyVia:
        records.length > 3 ? "CertifiedSHLPackage" : "PurposeVP",
      packageTime: generatedAt,
      recordTimeRange: recordTimeRange(records),
    },
  };
}

export function validateMicroIpsPlusPack(
  pack: MicroIpsPlusPack,
): MicroIpsPlusValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (pack.resourceType !== "TrustCareMicroIpsPlusPack")
    errors.push("resourceType must be TrustCareMicroIpsPlusPack.");
  if (!pack.generatedAt) errors.push("generatedAt is required.");
  if (!pack.expiresAt) errors.push("expiresAt is required.");
  if (!pack.context || !canonicalServiceProfiles[pack.context])
    errors.push("context must be a canonical service context.");
  if (!pack.consent?.consentId) errors.push("consent.consentId is required.");
  if (!pack.consent?.purpose) errors.push("consent.purpose is required.");
  if (!pack.evidence.length) warnings.push("No DocumentReference evidence.");
  if (pack.standards?.systemOfRecord !== false)
    errors.push("Micro-IPS+ must not declare itself as a system of record.");
  if (!pack.provenance?.shareOnlyVia)
    errors.push("Micro-IPS+ must route sharing through VP or SHL packages.");
  if (pack.trust.unverifiedCount > 0)
    warnings.push(
      "Some records are patient-provided and not trusted issuer signed.",
    );
  if (
    pack.records.some((record) =>
      isTrustArtifactDocumentType(record.documentType),
    )
  ) {
    errors.push(
      "Trust artifacts must not be included as clinical readiness records.",
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

function buildPackTrust(
  records: WalletDocumentRecord[],
): MicroIpsPlusPack["trust"] {
  const issuerSignedCount = records.filter(
    (record) => record.trustStatus === "issuer_signed",
  ).length;
  const unverifiedCount = records.filter(
    (record) => record.trustStatus === "patient_provided_unverified",
  ).length;
  const trustArtifactCount = records.filter((record) =>
    isTrustArtifactDocumentType(record.documentType),
  ).length;
  const warnings: string[] = [];
  if (unverifiedCount)
    warnings.push("patient_provided_unverified_records_present");
  if (trustArtifactCount)
    warnings.push("trust_artifacts_excluded_from_readiness");
  return { issuerSignedCount, unverifiedCount, trustArtifactCount, warnings };
}

function compareRecordFreshness(
  left: WalletDocumentRecord,
  right: WalletDocumentRecord,
): number {
  return (
    dateValue(recordTimelineDate(left)) - dateValue(recordTimelineDate(right))
  );
}

function compareRecordTimeline(
  left: WalletDocumentRecord,
  right: WalletDocumentRecord,
): number {
  return (
    dateValue(recordTimelineDate(left)) - dateValue(recordTimelineDate(right))
  );
}

function recordTimelineDate(
  record: WalletDocumentRecord,
): string | null | undefined {
  return (
    record.version.documentDate ?? record.issuedAt ?? record.source.importedAt
  );
}

function recordTimeRange(
  records: WalletDocumentRecord[],
): { start?: string; end?: string } | undefined {
  const values = records
    .map((record) => recordTimelineDate(record))
    .filter((value): value is string => Boolean(value))
    .sort();
  if (!values.length) return undefined;
  return { start: values[0], end: values[values.length - 1] };
}

function dateValue(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

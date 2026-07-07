import type { WalletCard } from "./models";
import type {
  CanonicalDocumentCategory,
  CanonicalDocumentType,
  WalletDocumentRecord,
} from "./canonicalDocuments";

export type FhirDocumentReferenceLike = {
  resourceType: "DocumentReference";
  id: string;
  status: "current" | "superseded" | "entered-in-error" | string;
  docStatus?: "preliminary" | "final" | "amended" | "entered-in-error" | string;
  type?: Record<string, unknown>;
  category?: Array<Record<string, unknown>>;
  subject?: Record<string, unknown>;
  date?: string;
  author?: Array<Record<string, unknown>>;
  custodian?: Record<string, unknown>;
  content: Array<{
    attachment: {
      contentType: string;
      url?: string;
      title?: string;
      creation?: string;
      hash?: string;
    };
    format?: Record<string, unknown>;
  }>;
  context?: Record<string, unknown>;
  description?: string;
};

export type MhdValidationResult = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

export type RecordFromMhdInput = {
  id: string;
  ownerUserId?: string | null;
  holderDid?: string | null;
  patientId?: string | number | null;
  documentType: CanonicalDocumentType;
  category: CanonicalDocumentCategory;
  title?: string | null;
  titleEn?: string | null;
  importedAt: string;
  repositoryEndpoint?: string | null;
  credentialData?: Record<string, unknown>;
};

export function documentReferenceFromCard(
  card: WalletCard,
): FhirDocumentReferenceLike {
  const credential = objectValue(card.credentialData);
  const subject = objectValue(credential?.credentialSubject);
  const existing =
    objectValue(subject?.documentReference) ??
    documentReferenceFromEvidence(credential);
  if (isDocumentReference(existing))
    return normalizeDocumentReference(existing, card);
  return createDocumentReference(card);
}

export function documentReferenceFromEvidence(
  credentialData: unknown,
): Record<string, unknown> | null {
  const credential = objectValue(credentialData);
  const evidence = credential?.evidence;
  if (!Array.isArray(evidence)) return null;
  for (const item of evidence) {
    const entry = objectValue(item);
    const resource =
      objectValue(entry?.resource) ?? objectValue(entry?.documentReference);
    if (resource?.resourceType === "DocumentReference") return resource;
  }
  return null;
}

export function validateDocumentReference(value: unknown): MhdValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const document = objectValue(value);
  if (!document) {
    return {
      ok: false,
      warnings,
      errors: ["DocumentReference must be an object."],
    };
  }
  if (document.resourceType !== "DocumentReference")
    errors.push("resourceType must be DocumentReference.");
  if (typeof document.id !== "string" || !document.id)
    errors.push("DocumentReference.id is required.");
  if (typeof document.status !== "string" || !document.status)
    errors.push("DocumentReference.status is required.");
  if (!Array.isArray(document.content) || document.content.length === 0) {
    errors.push(
      "DocumentReference.content must contain at least one attachment.",
    );
  } else {
    const missingContentType = document.content.some(
      (item) => !objectValue(objectValue(item)?.attachment)?.contentType,
    );
    if (missingContentType)
      errors.push(
        "Each DocumentReference.content attachment must include contentType.",
      );
  }
  if (!document.type)
    warnings.push(
      "DocumentReference.type is recommended for MHD/IPS classification.",
    );
  if (!document.subject)
    warnings.push(
      "DocumentReference.subject is recommended for patient-scoped wallet records.",
    );
  return { ok: errors.length === 0, warnings, errors };
}

export function mhdDocumentReferenceFromRecord(
  record: Pick<WalletDocumentRecord, "documentReference">,
): FhirDocumentReferenceLike {
  return record.documentReference;
}

export function recordFromMhdDocumentReference(
  documentReference: FhirDocumentReferenceLike,
  input: RecordFromMhdInput,
): WalletDocumentRecord {
  const validation = validateDocumentReference(documentReference);
  if (!validation.ok) {
    throw new Error(
      `Invalid MHD DocumentReference: ${validation.errors.join("; ")}`,
    );
  }
  const documentDate = documentReference.date ?? input.importedAt;
  return {
    id: input.id,
    ownerUserId: input.ownerUserId ?? undefined,
    holderDid: input.holderDid ?? undefined,
    patientId: input.patientId ?? null,
    documentType: input.documentType,
    category: input.category,
    title: input.title ?? documentReference.description ?? input.documentType,
    titleEn: input.titleEn ?? null,
    lifecycleStatus:
      documentReference.status === "current"
        ? "active"
        : documentReference.status,
    status:
      documentReference.status === "current"
        ? "active"
        : documentReference.status,
    trustStatus: "patient_provided_unverified",
    issuedAt: documentDate,
    expiresAt: null,
    issuerName: documentReference.author?.[0]?.display as string | undefined,
    sourceSystem: "mhd",
    credentialId: documentReference.id,
    credentialType: "DocumentReference",
    vcFormat: "none",
    credentialData: input.credentialData ?? {
      resourceType: "DocumentReference",
      documentReference,
    },
    documentReference,
    source: {
      system: "mhd",
      repositoryEndpoint: input.repositoryEndpoint ?? null,
      mhdDocumentReferenceUrl:
        documentReference.content[0]?.attachment.url ?? null,
      importedAt: input.importedAt,
      dataQualityScore: null,
    },
    version: {
      versionId: documentReference.id,
      documentDate,
      clinicalPeriod: objectValue(documentReference.context)?.period as
        { start?: string; end?: string } | undefined,
    },
    privacy: {
      confidentiality: "normal",
      sensitivity: [],
      defaultDisclosure: ["ask"],
      selectiveDisclosureFields: ["issuer", "documentType", "status", "date"],
    },
  };
}

function createDocumentReference(card: WalletCard): FhirDocumentReferenceLike {
  return {
    resourceType: "DocumentReference",
    id: String(card.credentialId),
    status: card.credentialStatus === "superseded" ? "superseded" : "current",
    docStatus: card.credentialStatus === "active" ? "final" : "preliminary",
    type: {
      text: card.displayName,
      coding: [
        {
          system: "https://trustcare.network/fhir/document-type",
          code: card.cardType,
          display: card.displayNameEn ?? card.displayName,
        },
      ],
    },
    category: [{ text: card.documentCategory }],
    subject:
      card.holderDid || card.patientId
        ? { reference: `Patient/${card.patientId ?? card.holderDid}` }
        : undefined,
    date: card.issuedAt ?? card.createdAt,
    author: card.issuerHospitalName
      ? [{ display: card.issuerHospitalName }]
      : undefined,
    custodian: card.issuerDid ? { reference: card.issuerDid } : undefined,
    content: [
      {
        attachment: {
          contentType: card.credentialJwt
            ? "application/vc+jwt"
            : "application/vc+json",
          title: card.displayName,
          creation: card.issuedAt ?? card.createdAt,
        },
        format: {
          system: "https://trustcare.network/format",
          code: card.credentialJwt ? "vc-jwt" : "vc-json",
        },
      },
    ],
    description: card.displayName,
  };
}

function normalizeDocumentReference(
  value: Record<string, unknown>,
  card: WalletCard,
): FhirDocumentReferenceLike {
  const existingContent = Array.isArray(value.content) ? value.content : [];
  return {
    ...value,
    resourceType: "DocumentReference",
    id:
      typeof value.id === "string" && value.id
        ? value.id
        : String(card.credentialId),
    status:
      typeof value.status === "string" && value.status
        ? value.status
        : "current",
    docStatus: typeof value.docStatus === "string" ? value.docStatus : "final",
    type: objectValue(value.type) ?? {
      text: card.displayName,
    },
    category: Array.isArray(value.category)
      ? (value.category as Array<Record<string, unknown>>)
      : [{ text: card.documentCategory }],
    content: existingContent.length
      ? (existingContent as FhirDocumentReferenceLike["content"])
      : createDocumentReference(card).content,
    date:
      typeof value.date === "string"
        ? value.date
        : (card.issuedAt ?? card.createdAt),
  };
}

function isDocumentReference(value: unknown): value is Record<string, unknown> {
  return Boolean(objectValue(value)?.resourceType === "DocumentReference");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

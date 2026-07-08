import type {
  TrustLayerChecklistItem,
  WalletCard,
  WalletPresentationResponse,
} from "./models";
import {
  isTrustArtifactDocumentType,
  normalizeDocumentType,
  walletDocumentRecordFromCard,
  type CanonicalDocumentType,
  type WalletDocumentRecord,
} from "./canonicalDocuments";
import { hashJson } from "./demoResolvers";
import {
  extractPortalRenderData,
  normalizePortalRenderSubject,
  portalRecord,
  type PortalRenderRecord,
} from "./portalRenderContract";
import type { TrustCareShlGatewayPublication } from "./shlGateway";
import { canPresentCredential } from "./statusTone";

export type PortablePresentationKind =
  | "credential"
  | "presentation"
  | "shl"
  | "micro_ips_pack"
  | "document_pointer";

export type PortablePresentationMode =
  | "DirectVP"
  | "PurposeVP"
  | "StandardSHL"
  | "CertifiedSHLManifestPackage"
  | "SmartApiAccess";

export type PortableTrustStatus =
  | "issuer_signed"
  | "transport_valid"
  | "trustcare_pending"
  | "trustcare_certified"
  | "patient_provided_unverified"
  | "invalid_or_revoked"
  | "metadata_only"
  | "proof_missing";

export type WalletPortableObjectClass =
  | "snapshot"
  | "credential"
  | "presentation"
  | "link_manifest"
  | "consent_access_grant"
  | "trust_artifact"
  | "import_request"
  | "sync_receipt";

export type PortablePresentationField = {
  label: string;
  value: unknown;
  sensitivity?: string;
  discloseByDefault?: boolean;
  path?: string;
};

export type PortablePresentationSection = {
  key: string;
  title: string;
  kind:
    | "identity"
    | "clinical"
    | "financial"
    | "document"
    | "trust"
    | "policy"
    | "technical";
  fields: PortablePresentationField[];
};

export type PortablePresentationEnvelope = {
  envelopeId: string;
  envelopeVersion: "2026.07.v1";
  kind: PortablePresentationKind;
  mode: PortablePresentationMode;
  sourceArtifactType:
    | "WalletCard"
    | "WalletPresentationResponse"
    | "TrustCareShlGatewayPublication"
    | "DocumentReference"
    | "ExternalPayload";
  sourceObjectClass?: WalletPortableObjectClass;
  subject: {
    id?: string;
    displayName?: string;
    identifiers?: Array<{ system?: string; value: string }>;
  };
  issuer?: { id?: string; name?: string; did?: string; trustLevel?: string };
  holder?: {
    did?: string;
    bindingStatus?: "present" | "missing" | "delegated";
  };
  recipient?: { id?: string; name?: string; did?: string };
  display: {
    title: string;
    titleEn?: string;
    category?: string;
    documentType?: string;
    summary?: string;
    language?: "th" | "en" | "bilingual";
  };
  sections: PortablePresentationSection[];
  evidence: {
    documentReferences: unknown[];
    hashes: string[];
    fhirProfiles: string[];
    sourceLinks: string[];
  };
  trust: {
    status: PortableTrustStatus;
    badge: "green" | "yellow" | "red" | "neutral";
    checklist: Array<{
      key: string;
      label: string;
      ok?: boolean;
      status?: string;
      detail?: string;
    }>;
    warnings: string[];
    errors: string[];
  };
  policy: {
    purpose?: string;
    scope?: string[];
    consentRef?: string;
    audience?: string;
    expiresAt?: string;
    accessPolicyHash?: string;
  };
  qr?: { canonicalPayload?: string; viewerPayload?: string; expiresAt?: string };
  provenance: {
    sourceSystem?: string;
    generatedAt?: string;
    importedAt?: string;
    transformedBy?: string;
    packageVersion?: string;
  };
  source?: {
    walletCard?: WalletCard;
    documentRecord?: WalletDocumentRecord;
    publication?: TrustCareShlGatewayPublication;
    raw?: unknown;
  };
};

export const PORTABLE_PRESENTATION_ENVELOPE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://trustcare.network/schemas/portable-presentation-envelope/2026.07.v1",
  title: "TrustCare PortablePresentationEnvelope",
  type: "object",
  required: [
    "envelopeId",
    "envelopeVersion",
    "kind",
    "mode",
    "sourceArtifactType",
    "subject",
    "display",
    "sections",
    "evidence",
    "trust",
    "policy",
    "provenance",
  ],
  properties: {
    envelopeId: { type: "string" },
    envelopeVersion: { const: "2026.07.v1" },
    kind: {
      enum: ["credential", "presentation", "shl", "micro_ips_pack", "document_pointer"],
    },
    mode: {
      enum: [
        "DirectVP",
        "PurposeVP",
        "StandardSHL",
        "CertifiedSHLManifestPackage",
        "SmartApiAccess",
      ],
    },
    sourceArtifactType: {
      enum: [
        "WalletCard",
        "WalletPresentationResponse",
        "TrustCareShlGatewayPublication",
        "DocumentReference",
        "ExternalPayload",
      ],
    },
    sourceObjectClass: {
      enum: [
        "snapshot",
        "credential",
        "presentation",
        "link_manifest",
        "consent_access_grant",
        "trust_artifact",
        "import_request",
        "sync_receipt",
      ],
    },
    subject: { type: "object" },
    issuer: { type: "object" },
    holder: { type: "object" },
    recipient: { type: "object" },
    display: { type: "object" },
    sections: { type: "array" },
    evidence: { type: "object" },
    trust: { type: "object" },
    policy: { type: "object" },
    qr: { type: "object" },
    provenance: { type: "object" },
  },
} as const;

const TECHNICAL_FIELD_NAMES = new Set([
  "@context",
  "context",
  "type",
  "issuer",
  "holder",
  "proof",
  "credentialsubject",
  "evidence",
  "termsOfUse".toLowerCase(),
  "credentialstatus",
  "credentialStatus".toLowerCase(),
  "renderdata",
  "humandocument",
  "documentreference",
  "fhir",
  "qr",
  "watermark",
  "demo",
  "debug",
  "metadata",
  "credentialid",
  "holderdid",
  "issuerdid",
  "owneruserid",
  "patientavatarurl",
  "portalverification",
  "credentialproof",
  "credentialjwt",
]);

export function presentationEnvelopeFromWalletCard(
  card: WalletCard,
): PortablePresentationEnvelope {
  const record = walletDocumentRecordFromCard(card);
  const credential = portalRecord(card.credentialData);
  const rawSubject = portalRecord(credential.credentialSubject ?? credential);
  const subject = normalizePortalRenderSubject(rawSubject, credential);
  const renderData = extractPortalRenderData(subject);
  const patient = firstRecord(
    renderData.patient,
    subject.patient,
    subject.holder,
    subject.staff,
    subject.student,
  );
  const hospital = firstRecord(
    renderData.hospital,
    subject.hospital,
    subject.organization,
    credential.issuer,
  );
  const document = firstRecord(renderData.document, subject.document);
  const trustStatus = classifyPortableTrustStatus(card);
  const documentType = record.documentType;
  const documentReferences = collectDocumentReferences(card, record, credential);
  const sections = buildCardSections({
    record,
    subject,
    renderData,
    patient,
    document,
    documentType,
  });
  const displayName = displayString(
    patient.fullNameTh,
    patient.nameTh,
    patient.fullNameEn,
    patient.nameEn,
    subject.name,
  );

  return {
    envelopeId: stableEnvelopeId("card", record.credentialId),
    envelopeVersion: "2026.07.v1",
    kind: "credential",
    mode: "DirectVP",
    sourceArtifactType: "WalletCard",
    sourceObjectClass: classifyWalletObjectClass(card, record),
    subject: {
      id: stringOrUndefined(subject.id) ?? stringOrUndefined(card.holderDid),
      displayName,
      identifiers: buildSubjectIdentifiers(patient, card, record),
    },
    issuer: {
      id: stringOrUndefined(portalValue(hospital, "id")),
      name:
        displayString(
          hospital.nameTh,
          hospital.name,
          hospital.nameEn,
          card.issuerHospitalName,
        ) ?? undefined,
      did: card.issuerDid ?? stringOrUndefined(portalValue(hospital, "did")),
      trustLevel: stringOrUndefined(card.portalVerification?.trustLevel),
    },
    holder: {
      did: card.holderDid ?? undefined,
      bindingStatus: card.holderDid ? "present" : "missing",
    },
    display: {
      title:
        stringOrUndefined(portalValue(document, "titleTh")) ??
        stringOrUndefined(portalValue(document, "title")) ??
        card.displayName,
      titleEn:
        stringOrUndefined(portalValue(document, "titleEn")) ??
        card.displayNameEn ??
        undefined,
      category: record.category,
      documentType,
      summary: buildSummary(card, renderData, record),
      language: "bilingual",
    },
    sections,
    evidence: {
      documentReferences,
      hashes: collectHashes(record, credential),
      fhirProfiles: collectFhirProfiles(record, credential),
      sourceLinks: collectSourceLinks(record, credential),
    },
    trust: buildTrustEnvelope({
      status: trustStatus,
      checklist: buildCredentialChecklist(card, record, documentReferences),
      warnings: buildCredentialWarnings(card, record, trustStatus),
      errors: trustStatus === "invalid_or_revoked" ? ["credential_not_active"] : [],
    }),
    policy: {
      purpose: stringOrUndefined(record.source.system),
      scope: record.privacy.defaultDisclosure,
      expiresAt: card.expiresAt ?? undefined,
    },
    provenance: {
      sourceSystem: card.sourceSystem ?? record.source.system ?? undefined,
      generatedAt: card.issuedAt ?? card.createdAt,
      importedAt: record.source.importedAt ?? undefined,
      transformedBy: "trustcare-wallet.presentationEnvelope",
      packageVersion: "2026.07.v1",
    },
    source: {
      walletCard: card,
      documentRecord: record,
    },
  };
}

export function presentationEnvelopeFromPresentation(
  card: WalletCard,
  presentation: WalletPresentationResponse,
): PortablePresentationEnvelope {
  const base = presentationEnvelopeFromWalletCard(card);
  const mode = coercePresentationMode(presentation.mode);
  const checklist = normalizeChecklist(presentation.verificationChecklist);
  return {
    ...base,
    envelopeId: stableEnvelopeId("vp", presentation.presentationId),
    kind: "presentation",
    mode,
    sourceArtifactType: "WalletPresentationResponse",
    sourceObjectClass: "presentation",
    display: {
      ...base.display,
      summary:
        typeof presentation.transportDecision === "object" &&
        presentation.transportDecision &&
        "reason" in presentation.transportDecision
          ? String((presentation.transportDecision as { reason?: unknown }).reason ?? "")
          : base.display.summary,
    },
    trust: buildTrustEnvelope({
      status: classifyPortableTrustStatus({
        card,
        presentation,
        checklist,
      }),
      checklist: checklist.length ? checklist : base.trust.checklist,
      warnings: base.trust.warnings,
      errors: base.trust.errors,
    }),
    policy: {
      ...base.policy,
      scope: presentation.selectedFields.length
        ? presentation.selectedFields
        : base.policy.scope,
      expiresAt: presentation.expiresAt,
    },
    qr: presentation.qrData
      ? {
          canonicalPayload: presentation.qrData,
          viewerPayload: presentation.qrData,
          expiresAt: presentation.expiresAt,
        }
      : undefined,
    provenance: {
      ...base.provenance,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function presentationEnvelopeFromShl(
  publication: TrustCareShlGatewayPublication,
): PortablePresentationEnvelope {
  const trustStatus = classifyPortableTrustStatus(publication);
  const documents = publication.manifest.documentBundle.documents ?? [];
  const hashes = [
    publication.manifest.trustcare.manifestVpHash,
    ...publication.manifest.files
      .map((file) => stringOrUndefined(portalRecord(file).hash))
      .filter((value): value is string => Boolean(value)),
  ].filter((value): value is string => Boolean(value));
  const documentReferences = documents.map((document) => ({
    resourceType: "DocumentReference",
    id: document.id,
    status: "current",
    type: { text: document.title },
    content: [
      {
        attachment: {
          contentType: document.contentType,
          url: document.objectLinks?.fhirDocumentReference,
        },
      },
    ],
  }));
  return {
    envelopeId: stableEnvelopeId("shl", publication.gatewayPublicationId),
    envelopeVersion: "2026.07.v1",
    kind: "shl",
    mode:
      publication.trustLayerStatus === "certified_manifest_vp"
        ? "CertifiedSHLManifestPackage"
        : "StandardSHL",
    sourceArtifactType: "TrustCareShlGatewayPublication",
    sourceObjectClass: "link_manifest",
    subject: {
      id: stringOrUndefined(publication.portalRequest.patientId),
      identifiers: publication.portalRequest.patientId
        ? [{ system: "trustcare.patient", value: String(publication.portalRequest.patientId) }]
        : [],
    },
    issuer: {
      name: "TrustCare SHL Gateway",
      did: stringOrUndefined(publication.manifest.trustcare.manifestCredential?.issuer),
    },
    recipient: { name: publication.manifest.receiver },
    display: {
      title: publication.manifest.label,
      titleEn: "SMART Health Link",
      category: "sharing_and_sync",
      documentType: "shl_manifest",
      summary: publication.manifest.purpose,
      language: "bilingual",
    },
    sections: [
      {
        key: "documents",
        title: "เอกสารในชุด SHL",
        kind: "document",
        fields: documents.map((document) => ({
          label: document.title,
          value: `${document.documentType} · ${document.status}`,
          sensitivity: document.category,
          discloseByDefault: true,
          path: `manifest.documents.${document.sequence}`,
        })),
      },
      {
        key: "access",
        title: "นโยบายการเข้าถึง",
        kind: "policy",
        fields: [
          {
            label: "ต้องใช้ PIN/Passcode",
            value: publication.passcodeRequired ? "yes" : "no",
            discloseByDefault: false,
          },
          {
            label: "จำนวนครั้งที่เปิดได้",
            value: publication.maxAccessCount ?? publication.manifest.access.maxAccessCount,
            discloseByDefault: false,
          },
        ],
      },
    ],
    evidence: {
      documentReferences,
      hashes,
      fhirProfiles: ["SMART Health Links", "FHIR DocumentReference"],
      sourceLinks: [
        publication.manifestUrl,
        publication.webViewerUrl,
        publication.canonicalShlUrl,
      ].filter((value): value is string => Boolean(value)),
    },
    trust: buildTrustEnvelope({
      status: trustStatus,
      checklist: [
        checklistItem("standard_shl", "Standard SHL manifest", Boolean(publication.canonicalShlUrl), publication.manifestUrl),
        checklistItem(
          "manifest_vp",
          "TrustCare Manifest VP",
          publication.trustLayerStatus === "certified_manifest_vp" &&
            Boolean(publication.manifest.trustcare.manifestVp),
          publication.manifest.trustcare.manifestVpUrl,
        ),
        checklistItem(
          "holder_authorization",
          "Holder authorization credential",
          publication.trustLayerStatus !== "certified_manifest_vp" ||
            Boolean(publication.manifest.trustcare.holderAuthorizationCredential),
          publication.manifest.trustcare.holderAuthorizationCredentialId,
        ),
      ],
      warnings: publication.warnings,
      errors: [],
    }),
    policy: {
      purpose: publication.manifest.purpose,
      audience: publication.manifest.receiver,
      expiresAt: publication.expiresAt,
      accessPolicyHash: hashJson(publication.manifest.access),
    },
    qr: {
      canonicalPayload: publication.canonicalShlUrl,
      viewerPayload: publication.webViewerUrl,
      expiresAt: publication.expiresAt,
    },
    provenance: {
      sourceSystem: publication.gatewayMode,
      generatedAt: publication.manifest.createdAt,
      transformedBy: "trustcare-wallet.shlGateway",
      packageVersion: "2026.07.v1",
    },
    source: { publication },
  };
}

export function presentationEnvelopeFromDocumentReference(
  record: WalletDocumentRecord,
): PortablePresentationEnvelope {
  const trustStatus = classifyPortableTrustStatus(record);
  return {
    envelopeId: stableEnvelopeId("document-reference", record.id),
    envelopeVersion: "2026.07.v1",
    kind: "document_pointer",
    mode: "SmartApiAccess",
    sourceArtifactType: "DocumentReference",
    sourceObjectClass: classifyRecordObjectClass(record),
    subject: {
      id: record.holderDid ?? undefined,
      identifiers: [
        record.patientId != null
          ? { system: "trustcare.patient", value: String(record.patientId) }
          : undefined,
      ].filter((item): item is { system: string; value: string } => Boolean(item)),
    },
    issuer: {
      name: record.issuerName ?? undefined,
      did: record.issuerDid ?? undefined,
    },
    holder: {
      did: record.holderDid ?? undefined,
      bindingStatus: record.holderDid ? "present" : "missing",
    },
    display: {
      title: record.title,
      titleEn: record.titleEn ?? undefined,
      category: record.category,
      documentType: record.documentType,
      summary: record.source.system ?? undefined,
      language: "bilingual",
    },
    sections: [
      {
        key: "document_reference",
        title: "DocumentReference",
        kind: "document",
        fields: [
          { label: "Credential ID", value: record.credentialId, discloseByDefault: false },
          { label: "Status", value: record.status, discloseByDefault: false },
          { label: "Source", value: record.source.system, discloseByDefault: false },
        ],
      },
    ],
    evidence: {
      documentReferences: [record.documentReference],
      hashes: collectHashes(record, record.credentialData),
      fhirProfiles: collectFhirProfiles(record, record.credentialData),
      sourceLinks: collectSourceLinks(record, record.credentialData),
    },
    trust: buildTrustEnvelope({
      status: trustStatus,
      checklist: [
        checklistItem("document_reference", "DocumentReference evidence", true, record.documentReference.id),
        checklistItem("issuer", "Issuer signature", trustStatus === "issuer_signed", record.issuerDid ?? undefined),
      ],
      warnings:
        trustStatus === "patient_provided_unverified"
          ? ["patient_provided_document_requires_trusted_signature"]
          : [],
      errors: [],
    }),
    policy: {
      scope: record.privacy.defaultDisclosure,
      expiresAt: record.expiresAt ?? undefined,
    },
    provenance: {
      sourceSystem: record.sourceSystem ?? undefined,
      generatedAt: record.issuedAt ?? undefined,
      importedAt: record.source.importedAt ?? undefined,
      transformedBy: "trustcare-wallet.documentReference",
      packageVersion: "2026.07.v1",
    },
    source: { documentRecord: record },
  };
}

export function classifyPortableTrustStatus(input: unknown): PortableTrustStatus {
  if (typeof input === "string") return coerceTrustStatus(input);
  const value = portalRecord(input);
  const card = (value.card && isWalletCard(value.card) ? value.card : input) as
    | WalletCard
    | unknown;
  if (isWalletCard(card)) {
    const status = String(card.credentialStatus ?? "").toLowerCase();
    if (["revoked", "suspended", "expired", "invalid"].includes(status))
      return "invalid_or_revoked";
    if (!card.credentialData && !card.credentialJwt && !card.credentialProof?.jwt)
      return "metadata_only";
    if (isTrustArtifactDocumentType(card.cardType)) return "transport_valid";
    if (status === "unverified") return "patient_provided_unverified";
    if (card.portalVerification?.status === "metadata_only") return "metadata_only";
    if (
      card.portalVerification?.verified &&
      String(card.portalVerification.trustLevel ?? "").toLowerCase() === "green" &&
      hasCryptographicProof(card) &&
      card.issuerDid &&
      card.holderDid
    ) {
      return "trustcare_certified";
    }
    if (hasCryptographicProof(card) && card.issuerDid && card.holderDid)
      return "issuer_signed";
    if (hasCryptographicProof(card) && (!card.issuerDid || !card.holderDid))
      return "proof_missing";
    if (card.sourceSystem === "partner_wallet") return "patient_provided_unverified";
    return "proof_missing";
  }
  if (isWalletDocumentRecord(input)) {
    const record = input;
    if (["revoked", "expired", "suspended"].includes(String(record.status).toLowerCase()))
      return "invalid_or_revoked";
    if (record.trustStatus === "trust_artifact") return "transport_valid";
    if (record.trustStatus === "pending_trustcare_binding")
      return "trustcare_pending";
    if (record.trustStatus === "patient_provided_unverified")
      return "patient_provided_unverified";
    if (record.trustStatus === "issuer_signed" && record.issuerDid)
      return "issuer_signed";
    return "proof_missing";
  }
  if (isShlPublication(input)) {
    const shl = input;
    if (shl.trustLayerStatus === "pending_manifest_vp") return "trustcare_pending";
    if (shl.trustLayerStatus === "certified_manifest_vp") {
      const certified = Boolean(
        shl.manifest.trustcare.manifestCredential &&
          shl.manifest.trustcare.holderAuthorizationCredential &&
          shl.manifest.trustcare.manifestVp &&
          shl.manifest.trustcare.manifestVpHash,
      );
      return certified ? "trustcare_certified" : "trustcare_pending";
    }
    return "transport_valid";
  }
  return "proof_missing";
}

export function portableTrustBadge(
  status: PortableTrustStatus,
): "green" | "yellow" | "red" | "neutral" {
  if (status === "trustcare_certified" || status === "issuer_signed") return "green";
  if (
    status === "transport_valid" ||
    status === "trustcare_pending" ||
    status === "patient_provided_unverified" ||
    status === "proof_missing"
  )
    return "yellow";
  if (status === "invalid_or_revoked") return "red";
  return "neutral";
}

export function selectableDisclosureFieldsFromEnvelope(
  envelope: PortablePresentationEnvelope,
): PortablePresentationField[] {
  return envelope.sections
    .filter((section) => section.kind !== "technical" && section.kind !== "trust")
    .flatMap((section) => section.fields)
    .filter((field) => isSelectableDisclosurePath(field.path ?? field.label));
}

function buildCardSections(input: {
  record: WalletDocumentRecord;
  subject: PortalRenderRecord;
  renderData: PortalRenderRecord;
  patient: PortalRenderRecord;
  document: PortalRenderRecord;
  documentType: CanonicalDocumentType;
}): PortablePresentationSection[] {
  const { record, subject, renderData, patient, document, documentType } = input;
  const identityFields = [
    field("ชื่อ-นามสกุล", displayString(patient.fullNameTh, patient.nameTh, subject.name), "patient.name", true),
    field("Name", displayString(patient.fullNameEn, patient.nameEn), "patient.nameEn", true),
    field("HN", portalValue(patient, "hn"), "patient.hn", false),
    field("CarePass ID", portalValue(patient, "carepassId"), "patient.carepassId", false),
  ].filter(isFieldWithValue);
  const bodyFields = buildDisclosureFields(renderData, documentType);
  const documentFields = [
    field("ประเภทเอกสาร", record.documentType, "document.type", true),
    field("วันที่ออก", record.issuedAt, "document.issuedAt", false),
    field("หมดอายุ", record.expiresAt, "document.expiresAt", false),
    field("สถานะ", record.status, "document.status", false),
    field("Credential ID", record.credentialId, "credential.id", false),
  ].filter(isFieldWithValue);

  return [
    {
      key: "subject",
      title: "ผู้ถือเอกสาร",
      kind: "identity",
      fields: identityFields,
    },
    {
      key: "document",
      title: "รายละเอียดเอกสาร",
      kind: sectionKindForType(documentType),
      fields: bodyFields.length ? bodyFields : documentFields,
    },
    {
      key: "metadata",
      title: "หลักฐานและ Metadata",
      kind: "technical",
      fields: documentFields,
    },
  ];
}

function buildDisclosureFields(
  renderData: PortalRenderRecord,
  documentType: CanonicalDocumentType,
): PortablePresentationField[] {
  const candidates = [
    renderData.coverage,
    renderData.claim,
    renderData.referral,
    renderData.medications,
    renderData.medication,
    renderData.allergies,
    renderData.allergy,
    renderData.diagnosis,
    renderData.lab,
    renderData.result,
    renderData.appointment,
    renderData.package,
    renderData.quotation,
    renderData.document,
  ];
  const fields: PortablePresentationField[] = [];
  for (const candidate of candidates) {
    appendRecordFields(fields, candidate, documentType);
  }
  return fields.slice(0, 20);
}

function appendRecordFields(
  fields: PortablePresentationField[],
  value: unknown,
  documentType: CanonicalDocumentType,
  pathPrefix: string = documentType,
): void {
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item, index) =>
      appendRecordFields(fields, item, documentType, `${pathPrefix}.${index}`),
    );
    return;
  }
  const record = portalRecord(value);
  if (!Object.keys(record).length) return;
  for (const [key, rawValue] of Object.entries(record)) {
    const path = `${pathPrefix}.${key}`;
    if (!isSelectableDisclosurePath(path)) continue;
    if (isSimpleValue(rawValue)) {
      fields.push(
        field(titleCaseLabel(key), rawValue, path, defaultDisclosureFor(documentType, key)),
      );
    }
  }
}

function buildCredentialChecklist(
  card: WalletCard,
  record: WalletDocumentRecord,
  documentReferences: unknown[],
): TrustLayerChecklistItem[] {
  return [
    checklistItem("issuer", "Issuer DID", Boolean(card.issuerDid), card.issuerDid ?? undefined),
    checklistItem("holder", "Holder DID", Boolean(card.holderDid), card.holderDid ?? undefined),
    checklistItem(
      "proof",
      "Cryptographic proof",
      hasCryptographicProof(card),
      card.credentialProof?.format ?? (card.credentialJwt ? "vc+jwt" : undefined),
    ),
    checklistItem(
      "document_reference",
      "DocumentReference evidence",
      documentReferences.length > 0,
      String(documentReferences.length),
    ),
    checklistItem(
      "status",
      "Status and expiry",
      canPresentCredential({ credentialStatus: record.status, expiresAt: record.expiresAt }),
      record.expiresAt ?? undefined,
    ),
  ];
}

function buildCredentialWarnings(
  card: WalletCard,
  record: WalletDocumentRecord,
  status: PortableTrustStatus,
): string[] {
  const warnings: string[] = [];
  if (status === "metadata_only") warnings.push("metadata_only_record_skipped_for_readiness");
  if (status === "patient_provided_unverified")
    warnings.push("patient_provided_document_requires_trusted_signature");
  if (status === "proof_missing") warnings.push("cryptographic_proof_missing");
  if (isTrustArtifactDocumentType(record.documentType))
    warnings.push("trust_artifact_not_clinical_readiness_document");
  if (!card.holderDid) warnings.push("holder_binding_missing");
  return warnings;
}

function buildTrustEnvelope(input: {
  status: PortableTrustStatus;
  checklist: Array<{
    key: string;
    label: string;
    ok?: boolean;
    status?: string;
    detail?: string;
  }>;
  warnings: string[];
  errors: string[];
}): PortablePresentationEnvelope["trust"] {
  return {
    status: input.status,
    badge: portableTrustBadge(input.status),
    checklist: input.checklist,
    warnings: input.warnings,
    errors: input.errors,
  };
}

function buildSubjectIdentifiers(
  patient: PortalRenderRecord,
  card: WalletCard,
  record: WalletDocumentRecord,
): Array<{ system?: string; value: string }> {
  return [
    identifier("trustcare.holder", card.holderDid),
    identifier("trustcare.patient", card.patientId),
    identifier("trustcare.credential", record.credentialId),
    identifier("trustcare.hn", patient.hn),
    identifier("trustcare.carepass", patient.carepassId),
  ].filter(isIdentifier);
}

function isIdentifier(
  value: { system: string; value: string } | undefined,
): value is { system: string; value: string } {
  return Boolean(value);
}

function classifyWalletObjectClass(
  card: WalletCard,
  record: WalletDocumentRecord,
): WalletPortableObjectClass {
  const documentType = normalizeDocumentType(card.cardType);
  if (documentType === "sync_receipt") return "sync_receipt";
  if (documentType === "shl_manifest") return "link_manifest";
  if (documentType === "consent_receipt") return "consent_access_grant";
  if (isTrustArtifactDocumentType(documentType)) return "trust_artifact";
  if (record.trustStatus === "patient_provided_unverified") return "snapshot";
  if (hasCryptographicProof(card)) return "credential";
  return "snapshot";
}

function classifyRecordObjectClass(
  record: WalletDocumentRecord,
): WalletPortableObjectClass {
  if (record.documentType === "sync_receipt") return "sync_receipt";
  if (record.documentType === "shl_manifest") return "link_manifest";
  if (record.documentType === "consent_receipt") return "consent_access_grant";
  if (isTrustArtifactDocumentType(record.documentType)) return "trust_artifact";
  return record.trustStatus === "issuer_signed" ? "credential" : "snapshot";
}

function collectDocumentReferences(
  card: WalletCard,
  record: WalletDocumentRecord,
  credential: PortalRenderRecord,
): unknown[] {
  const evidence = Array.isArray(credential.evidence)
    ? credential.evidence
    : credential.evidence
      ? [credential.evidence]
      : [];
  const documentReferences = evidence.filter(
    (item) => portalRecord(item).type === "DocumentReference" || portalRecord(item).resourceType === "DocumentReference",
  );
  if (record.documentReference) documentReferences.push(record.documentReference);
  const subject = portalRecord(credential.credentialSubject);
  const humanDocument = portalRecord(subject.humanDocument);
  const renderData = extractPortalRenderData(subject);
  for (const candidate of [
    humanDocument.documentReference,
    renderData.documentReference,
    card.credentialData?.documentReference,
  ]) {
    if (candidate) documentReferences.push(candidate);
  }
  return uniqueByHash(documentReferences);
}

function collectHashes(
  record: WalletDocumentRecord,
  credential: PortalRenderRecord,
): string[] {
  const values = [
    record.documentReference?.content?.[0]?.attachment?.hash,
    record.version.versionId ? hashJson(record.version.versionId) : undefined,
    stringOrUndefined(credential.proof ? hashJson(credential.proof) : undefined),
  ];
  return values.filter((item): item is string => Boolean(item));
}

function collectFhirProfiles(
  record: WalletDocumentRecord,
  credential: PortalRenderRecord,
): string[] {
  const profiles = [
    ...fhirProfilesFromBundle(record.fhirDocumentBundle),
    ...extractStringArray(credential, ["credentialSubject", "fhirProfiles"]),
    ...extractStringArray(credential, ["credentialSubject", "profiles"]),
  ];
  if (record.documentReference?.resourceType) profiles.push(record.documentReference.resourceType);
  return Array.from(new Set(profiles));
}

function fhirProfilesFromBundle(
  bundle: WalletDocumentRecord["fhirDocumentBundle"],
): string[] {
  if (!bundle) return [];
  return bundle.entry.flatMap((entry) => {
    const resource = portalRecord(entry.resource);
    return extractStringArray(resource, ["meta", "profile"]);
  });
}

function collectSourceLinks(
  record: WalletDocumentRecord,
  credential: PortalRenderRecord,
): string[] {
  return [
    record.source.repositoryEndpoint,
    record.source.mhdDocumentReferenceUrl,
    stringOrUndefined(portalValue(credential, "id")),
    stringOrUndefined(portalValue(credential, "credentialSubject.sourceUrl")),
  ].filter((item): item is string => Boolean(item));
}

function extractStringArray(
  source: PortalRenderRecord,
  path: string[],
): string[] {
  let value: unknown = source;
  for (const segment of path) value = portalRecord(value)[segment];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeChecklist(value: unknown): TrustLayerChecklistItem[] {
  return Array.isArray(value)
    ? value
        .map((item) => portalRecord(item))
        .map((item) => ({
          key: String(item.key ?? item.label ?? "check"),
          label: String(item.label ?? item.key ?? "Check"),
          ok: Boolean(item.ok),
          detail: stringOrUndefined(item.detail),
        }))
    : [];
}

function coercePresentationMode(value: string): PortablePresentationMode {
  if (
    value === "DirectVP" ||
    value === "PurposeVP" ||
    value === "StandardSHL" ||
    value === "CertifiedSHLManifestPackage" ||
    value === "SmartApiAccess"
  )
    return value;
  return "PurposeVP";
}

function coerceTrustStatus(value: string): PortableTrustStatus {
  if (
    value === "issuer_signed" ||
    value === "transport_valid" ||
    value === "trustcare_pending" ||
    value === "trustcare_certified" ||
    value === "patient_provided_unverified" ||
    value === "invalid_or_revoked" ||
    value === "metadata_only" ||
    value === "proof_missing"
  )
    return value;
  if (value === "trust_artifact") return "transport_valid";
  if (value === "pending_trustcare_binding") return "trustcare_pending";
  return "proof_missing";
}

function isSelectableDisclosurePath(path: string): boolean {
  const parts = path
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  return !parts.some((part) => TECHNICAL_FIELD_NAMES.has(part));
}

function defaultDisclosureFor(
  documentType: CanonicalDocumentType,
  key: string,
): boolean {
  if (documentType === "allergy_alert") return ["allergen", "reaction", "severity"].includes(key);
  if (documentType === "patient_identity") return ["fullNameTh", "fullNameEn", "hn"].includes(key);
  return ["summary", "status", "diagnosis", "medication", "coverage"].includes(key);
}

function sectionKindForType(
  documentType: CanonicalDocumentType,
): PortablePresentationSection["kind"] {
  if (
    documentType === "claim_package" ||
    documentType === "claim_receipt" ||
    documentType === "insurance_eligibility" ||
    documentType === "quotation" ||
    documentType === "guarantee_letter"
  )
    return "financial";
  if (documentType === "patient_identity" || documentType === "staff_identity")
    return "identity";
  if (isTrustArtifactDocumentType(documentType)) return "trust";
  if (
    documentType === "patient_summary" ||
    documentType === "allergy_alert" ||
    documentType === "medication_summary" ||
    documentType === "prescription" ||
    documentType === "pharmacy_dispense" ||
    documentType === "lab_result" ||
    documentType === "diagnostic_report"
  )
    return "clinical";
  return "document";
}

function buildSummary(
  card: WalletCard,
  renderData: PortalRenderRecord,
  record: WalletDocumentRecord,
): string | undefined {
  return displayString(
    renderData.summary,
    portalRecord(renderData.document).summary,
    card.scopeLabel,
    record.source.system,
  );
}

function field(
  label: string,
  value: unknown,
  path: string,
  discloseByDefault: boolean,
): PortablePresentationField {
  return { label, value, path, discloseByDefault };
}

function isFieldWithValue(
  value: PortablePresentationField,
): value is PortablePresentationField {
  return value.value !== undefined && value.value !== null && value.value !== "";
}

function checklistItem(
  key: string,
  label: string,
  ok: boolean,
  detail?: string,
): TrustLayerChecklistItem {
  return { key, label, ok, detail };
}

function identifier(
  system: string,
  value: unknown,
): { system: string; value: string } | undefined {
  const text = stringOrUndefined(value);
  return text ? { system, value: text } : undefined;
}

function hasCryptographicProof(card: WalletCard): boolean {
  return Boolean(
    card.credentialProof?.jwt ||
      card.credentialJwt ||
      portalRecord(card.credentialData).proof,
  );
}

function isWalletCard(value: unknown): value is WalletCard {
  const record = portalRecord(value);
  return (
    typeof record.cardType === "string" &&
    typeof record.displayName === "string" &&
    "credentialId" in record
  );
}

function isWalletDocumentRecord(value: unknown): value is WalletDocumentRecord {
  const record = portalRecord(value);
  return (
    typeof record.documentType === "string" &&
    typeof record.credentialId === "string" &&
    typeof record.trustStatus === "string" &&
    typeof record.documentReference === "object"
  );
}

function isShlPublication(value: unknown): value is TrustCareShlGatewayPublication {
  const record = portalRecord(value);
  return (
    typeof record.gatewayPublicationId === "string" &&
    typeof record.trustLayerStatus === "string" &&
    portalRecord(record.manifest).resourceType === "TrustCareShlManifest"
  );
}

function isSimpleValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function firstRecord(...values: unknown[]): PortalRenderRecord {
  return values.map(portalRecord).find((item) => Object.keys(item).length) ?? {};
}

function portalValue(source: PortalRenderRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => portalRecord(value)[segment], source);
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function displayString(...values: unknown[]): string | undefined {
  return values.map(stringOrUndefined).find(Boolean);
}

function titleCaseLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function stableEnvelopeId(prefix: string, value: unknown): string {
  return `ppe:${prefix}:${hashJson(value).replace(/^sha256:/, "").slice(0, 24)}`;
}

function uniqueByHash(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = hashJson(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

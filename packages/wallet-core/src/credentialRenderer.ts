import type { WalletCard } from "./models";
import type { WalletDocumentRecordV2 } from "./walletDocumentV2";
import {
  isTrustArtifactDocumentType,
  normalizeDocumentType,
} from "./canonicalDocuments";
import {
  extractPortalRenderData,
  normalizePortalRenderSubject,
} from "./portalRenderContract";
import type {
  ClaimReceiptRenderKind,
  CredentialPaperModel,
  CredentialPaperSection,
  CredentialPaperSignatory,
  CredentialPaperTableColumn,
  CredentialRenderField,
  CredentialRenderItem,
  CredentialRenderModel,
  CredentialRenderNarrative,
  CredentialRenderPayloads,
  CredentialRenderSection,
  CredentialRenderSectionKind,
} from "./credentialRendererTypes";
import { credentialPhysicalFormFactor } from "./credentialPhysicalForm";
import {
  credentialDocumentAccent,
  credentialDocumentKindLabel,
  credentialDocumentVariant,
} from "./credentialDocumentIdentity";
import {
  booleanLabel,
  displayName,
  firstRecord,
  firstText,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPeriod,
  formatValue,
  getNested,
  getObject,
  getRecord,
  getStringArray,
  getText,
  hasValue,
  isFieldWithValue,
  itemsFromUnknown,
} from "./credentialRenderPrimitives";
import {
  allergyItems,
  appointmentPayload,
  claimPackagePayload,
  claimReceiptPayload,
  clinicalSummaryPayload,
  consentPayload,
  coveragePayload,
  diagnosticReportPayload,
  dischargeSummaryPayload,
  guaranteeLetterPayload,
  immunizationItems,
  labReportPayload,
  manifestPayload,
  medicalCertificatePayload,
  medicationSummaryItems,
  mergeDocumentPayload,
  mpiPayload,
  pharmacyDispenseItems,
  prescriptionItems,
  quotationPayload,
  referralPayload,
  syncReceiptPayload,
  travelDocumentPayload,
  visaSupportLetterPayload,
} from "./credentialPayloadNormalization";

export type * from "./credentialRendererTypes";
export { credentialPhysicalFormFactor } from "./credentialPhysicalForm";
export {
  credentialDocumentAccent,
  credentialDocumentKindLabel,
  credentialDocumentVariant,
} from "./credentialDocumentIdentity";

const TECHNICAL_FIELD_NAMES = new Set([
  "context",
  "credentialsubject",
  "credentialstatus",
  "credentialdata",
  "credentialid",
  "credentialjwt",
  "credentialproof",
  "disclosure",
  "disclosures",
  "display",
  "documentreference",
  "evidence",
  "hash",
  "holderdid",
  "humandocument",
  "issuerdid",
  "jwt",
  "metadata",
  "photo",
  "proof",
  "provenance",
  "renderdata",
  "sdjwt",
  "selectivedisclosure",
  "source",
  "trustcare",
  "vc",
  "vp",
  "watermark",
]);

type BusinessPayloadRenderConfig = {
  pathRoot: string;
  priority: string[];
  labels?: Record<string, string>;
  discloseByDefault?: string[];
  moneyKeys?: string[];
  dateKeys?: string[];
  dateTimeKeys?: string[];
  hiddenKeys?: string[];
};

const renderMetadataKeys = [
  "audience",
  "credentialStatus",
  "document",
  "expiresAt",
  "fhirResources",
  "holder",
  "hospital",
  "humanDocument",
  "id",
  "issuedAt",
  "issuer",
  "layout",
  "noPortrait",
  "organization",
  "patient",
  "renderData",
  "rendererVersion",
  "sections",
  "source",
  "sourceSystem",
  "titleEn",
  "titleTh",
  "trustcare",
  "visualHints",
];

const claimPackageRenderConfig: BusinessPayloadRenderConfig = {
  pathRoot: "credentialSubject.claimPackage",
  priority: [
    "claimNo",
    "claimRef",
    "packageNo",
    "claimId",
    "claimType",
    "policyNo",
    "memberId",
    "encounterId",
    "visitId",
    "diagnosisCodes",
    "diagnoses",
    "serviceLines",
    "serviceItems",
    "lineItems",
    "items",
    "payer",
    "payerRef",
    "totalAmount",
    "estimatedTotal",
    "currency",
    "attachments",
    "attachedEvidence",
    "evidence",
    "status",
    "claimStatus",
  ],
  labels: {
    claimNo: "เลขที่เคลม",
    claimRef: "เลขเคลม",
    packageNo: "เลขชุดเคลม",
    claimId: "Claim ID",
    claimType: "ประเภทเคลม",
    policyNo: "Policy No",
    memberId: "Member ID",
    encounterId: "Encounter ID",
    visitId: "Visit ID",
    diagnosisCodes: "Diagnosis codes",
    diagnoses: "Diagnosis",
    serviceLines: "Service lines",
    serviceItems: "Service items",
    lineItems: "Line items",
    items: "รายการในชุดเคลม",
    payer: "Payer",
    payerRef: "Payer ref",
    totalAmount: "ยอดรวม",
    estimatedTotal: "ยอดประเมิน",
    currency: "Currency",
    attachments: "เอกสารแนบ",
    attachedEvidence: "Evidence",
    evidence: "Evidence",
    status: "สถานะ",
    claimStatus: "สถานะเคลม",
  },
  discloseByDefault: [
    "claimNo",
    "claimRef",
    "claimId",
    "claimType",
    "policyNo",
    "encounterId",
    "diagnosisCodes",
    "diagnoses",
    "payer",
    "payerRef",
    "status",
    "claimStatus",
  ],
  moneyKeys: ["totalAmount", "estimatedTotal"],
  hiddenKeys: [
    ...renderMetadataKeys,
    "claim",
    "claimBundle",
    "claimPackage",
    "claimRequest",
  ],
};

const claimReceiptRenderConfig: BusinessPayloadRenderConfig = {
  pathRoot: "credentialSubject.claimReceipt",
  priority: [
    "receiptNo",
    "invoiceNo",
    "claimRef",
    "claimId",
    "paidAt",
    "cashier",
    "items",
    "lineItems",
    "breakdown",
    "serviceItems",
    "grossAmount",
    "discount",
    "netAmount",
    "approvedAmount",
    "totalAmount",
    "totalClaimed",
    "insurerResponsibility",
    "payerResponsibility",
    "patientResponsibility",
    "currency",
    "paymentMethod",
    "adjudicationOutcome",
    "status",
    "paymentStatus",
  ],
  labels: {
    receiptNo: "เลขที่ใบเสร็จ",
    invoiceNo: "เลขที่ใบแจ้งหนี้",
    claimRef: "เลขเคลม",
    claimId: "Claim ID",
    paidAt: "ชำระเมื่อ",
    cashier: "Cashier",
    items: "รายการค่าใช้จ่าย",
    lineItems: "Line items",
    breakdown: "Breakdown",
    serviceItems: "Service items",
    grossAmount: "ยอดเรียกเก็บ",
    discount: "ส่วนลด",
    netAmount: "ยอดสุทธิ",
    approvedAmount: "ยอดอนุมัติ",
    totalAmount: "ยอดรวม",
    totalClaimed: "ยอดเคลม",
    insurerResponsibility: "ผู้รับประกันรับผิดชอบ",
    payerResponsibility: "ผู้จ่ายรับผิดชอบ",
    patientResponsibility: "ผู้ป่วยรับผิดชอบ",
    currency: "Currency",
    paymentMethod: "วิธีชำระเงิน",
    adjudicationOutcome: "ผลการพิจารณา",
    status: "สถานะ",
    paymentStatus: "สถานะชำระเงิน",
  },
  discloseByDefault: [
    "receiptNo",
    "invoiceNo",
    "claimRef",
    "claimId",
    "paidAt",
    "approvedAmount",
    "netAmount",
    "paymentMethod",
    "status",
    "paymentStatus",
  ],
  moneyKeys: [
    "grossAmount",
    "discount",
    "netAmount",
    "approvedAmount",
    "totalAmount",
    "totalClaimed",
    "insurerResponsibility",
    "payerResponsibility",
    "patientResponsibility",
  ],
  dateTimeKeys: ["paidAt"],
  hiddenKeys: [
    ...renderMetadataKeys,
    "claim",
    "claimReceipt",
    "invoice",
    "receipt",
  ],
};

const payerClaimReceiptRenderConfig: BusinessPayloadRenderConfig = {
  pathRoot: "credentialSubject.claimReceipt",
  priority: [
    "claimCaseId",
    "externalSubmissionId",
    "payerId",
    "status",
    "payerStatusCode",
    "payerStatusText",
    "submittedAt",
    "updatedAt",
    "channel",
    "manualFollowUpRequired",
    "needMoreEvidence",
    "adjudicationSummaryRef",
    "receiptCredentialId",
    "credentialId",
    "warnings",
  ],
  labels: {
    claimCaseId: "Claim case ID",
    externalSubmissionId: "เลขรับจาก Payer",
    payerId: "Payer",
    status: "สถานะเคลม",
    payerStatusCode: "รหัสสถานะจาก Payer",
    payerStatusText: "รายละเอียดสถานะจาก Payer",
    submittedAt: "ส่งเมื่อ",
    updatedAt: "อัปเดตเมื่อ",
    channel: "ช่องทางส่ง",
    manualFollowUpRequired: "ต้องติดตามด้วยเจ้าหน้าที่",
    needMoreEvidence: "เอกสารเพิ่มเติมที่ Payer ขอ",
    adjudicationSummaryRef: "Payer decision reference",
    receiptCredentialId: "Receipt credential ID",
    credentialId: "Status credential ID",
    warnings: "คำเตือน",
  },
  discloseByDefault: [
    "claimCaseId",
    "externalSubmissionId",
    "payerId",
    "status",
    "payerStatusCode",
    "payerStatusText",
    "submittedAt",
    "updatedAt",
    "channel",
  ],
  dateTimeKeys: ["submittedAt", "updatedAt"],
  hiddenKeys: [...renderMetadataKeys, "claim", "claimReceipt"],
};

export function credentialRenderModelFromCard(
  card: WalletCard,
): CredentialRenderModel {
  const credential = getRecord(card.credentialData);
  const rawSubject = getObject(credential, "credentialSubject") ?? credential;
  const subject = normalizePortalRenderSubject(rawSubject, credential);
  const renderData = extractPortalRenderData(rawSubject);
  const documentType = normalizeDocumentType(card.cardType) ?? card.cardType;
  const patient =
    documentType === "staff_identity"
      ? firstRecord(
          getObject(subject, "staff"),
          getObject(renderData, "patient"),
          getObject(subject, "patient"),
        )
      : firstRecord(
          getObject(renderData, "patient"),
          getObject(subject, "patient"),
          getObject(subject, "holder"),
          getObject(subject, "staff"),
          getObject(subject, "student"),
        );
  const hospital = firstRecord(
    getObject(renderData, "hospital"),
    getObject(subject, "hospital"),
    getObject(subject, "organization"),
    getObject(credential, "issuer"),
  );
  const document = firstRecord(
    getObject(renderData, "document"),
    getObject(subject, "document"),
  );
  const issuer = firstRecord(getObject(credential, "issuer"), hospital);
  const payloads = credentialRenderPayloads(subject);
  const claimReceiptKind =
    documentType === "claim_receipt"
      ? inferClaimReceiptRenderKind(card, credential, payloads.claimReceipt)
      : undefined;
  const fields = fieldsForCredentialType(
    card,
    documentType,
    subject,
    patient,
    payloads,
    claimReceiptKind,
  ).filter(isFieldWithValue);
  const sections = credentialRenderSections(
    card,
    documentType,
    subject,
    patient,
    document,
    fields,
  );
  const narrative = credentialDocumentNarrative(
    card,
    documentType,
    subject,
    patient,
    claimReceiptKind,
  );

  return {
    documentType,
    variant: credentialDocumentVariant(documentType),
    accent: credentialDocumentAccent(documentType),
    kindLabel: claimReceiptKindLabel(
      claimReceiptKind,
      credentialDocumentKindLabel(documentType),
    ),
    credential,
    subject,
    patient,
    hospital,
    document,
    issuer,
    payloads,
    fields,
    sections,
    narrative,
    paper: credentialPaperModelFromCard(
      card,
      documentType,
      credential,
      subject,
      patient,
      hospital,
      issuer,
      document,
      payloads,
      fields,
      claimReceiptKind,
    ),
    claimReceiptKind,
  };
}

/**
 * Creates an ephemeral renderer input from a VC that has already been verified
 * by the caller. This adapter does not persist the credential and deliberately
 * does not infer a verification result.
 */
export function walletCardForCredentialRendering(
  value: unknown,
  index = 0,
): WalletCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const credential = value as CredentialRenderItem;
  const rawSubject = getObject(credential, "credentialSubject");
  if (!rawSubject) return null;
  const documentType = credentialDocumentType(credential, rawSubject);
  if (!documentType) return null;

  const subject = normalizePortalRenderSubject(rawSubject, credential);
  const renderData = extractPortalRenderData(rawSubject);
  const humanDocument = getObject(rawSubject, "humanDocument") ?? {};
  const document = firstRecord(
    getObject(renderData, "document"),
    getObject(subject, "document"),
  );
  const patient = firstRecord(
    getObject(renderData, "patient"),
    getObject(subject, "patient"),
    getObject(subject, "holder"),
    getObject(subject, "staff"),
  );
  const trustcare = getObject(credential, "trustcare") ?? {};
  const trustcareDisplay = getObject(trustcare, "display") ?? {};
  const issuerObject = getObject(credential, "issuer");
  const credentialTypes = credentialTypeValues(credential);
  const credentialType = credentialTypes.find(
    (type) => type !== "VerifiableCredential",
  );
  const issuedAt = firstText(
    getText(document, "issuedAt"),
    getText(humanDocument, "issuedAt"),
    getText(credential, "validFrom"),
    getText(credential, "issuanceDate"),
  );
  const expiresAt = firstText(
    getText(document, "expiresAt"),
    getText(humanDocument, "expiresAt"),
    getText(credential, "validUntil"),
    getText(credential, "expirationDate"),
  );
  const displayName = firstText(
    getText(renderData, "titleTh"),
    getText(humanDocument, "titleTh"),
    getText(document, "titleTh"),
    getText(trustcareDisplay, "patientFacingTitleTh"),
    getText(credential, "name"),
    credentialType,
    getText(trustcare, "documentType"),
  );
  if (!displayName) return null;

  const issuerValue = getText(credential, "issuer");
  const credentialStatus = getObject(credential, "credentialStatus");
  return {
    id: index + 1,
    cardType: documentType,
    displayName,
    displayNameEn: firstText(
      getText(renderData, "titleEn"),
      getText(humanDocument, "titleEn"),
      getText(document, "titleEn"),
      getText(trustcareDisplay, "patientFacingTitleEn"),
    ),
    documentCategory:
      firstText(
        getText(trustcare, "documentCategory"),
        getText(subject, "documentCategory"),
        getText(document, "category"),
      ) ?? "",
    credentialId: firstText(getText(credential, "id")) ?? "",
    credentialStatus:
      firstText(
        getText(document, "status"),
        getText(credentialStatus, "status"),
      ) ?? "",
    credentialData: credential,
    credentialType,
    issuerHospitalName: firstText(
      getText(issuerObject, "nameTh"),
      getText(issuerObject, "name"),
      getText(issuerObject, "nameEn"),
    ),
    issuerDid: firstText(getText(issuerObject, "id"), issuerValue),
    holderDid: getText(subject, "id"),
    patientAvatarUrl: firstText(
      getText(patient, "photoUrl"),
      getText(patient, "avatarUrl"),
      getText(patient, "imageUrl"),
    ),
    sourceSystem: firstText(
      getText(renderData, "sourceSystem"),
      getText(humanDocument, "sourceSystem"),
      getText(trustcare, "sourceSystem"),
    ),
    issuedAt,
    expiresAt,
    createdAt: firstText(getText(credential, "createdAt"), issuedAt) ?? "",
  };
}

/**
 * Rendering adapter for the Constitution V3 document model. It preserves the
 * exact source credential payload when available and maps only canonical
 * record metadata otherwise; it does not infer trust or clinical claims.
 */
export function walletCardForDocumentRendering(
  record: WalletDocumentRecordV2,
): WalletCard {
  const credentialPayload = getRecord(record.content.credentialPayload);
  const credentialId = record.credential.credentialId ?? "";
  const fallbackSubject: CredentialRenderItem = {
    id: record.owner.holderDid ?? record.owner.id,
    document: {
      titleTh: record.title.th,
      titleEn: record.title.en,
      status: record.lifecycle.status,
      issuedAt: record.lifecycle.issuedAt,
      expiresAt: record.lifecycle.expiresAt,
    },
  };
  const renderPayload = Object.keys(credentialPayload).length
    ? credentialPayload
    : {
        ...(credentialId ? { id: credentialId } : {}),
        type: [
          "VerifiableCredential",
          record.credential.credentialType ?? record.documentType,
        ],
        issuer: {
          id: record.provenance.issuerDid,
          name: record.provenance.issuerName,
        },
        validFrom: record.lifecycle.issuedAt,
        validUntil: record.lifecycle.expiresAt,
        credentialSubject: fallbackSubject,
      };

  return {
    id: stableLegacyCardId(record),
    cardType: record.documentType,
    displayName: record.title.th || record.title.en || record.documentType,
    displayNameEn: record.title.en,
    documentCategory: record.category,
    credentialId,
    credentialStatus: legacyCredentialStatus(record.lifecycle.status),
    credentialData: renderPayload,
    credentialJwt: record.credential.jwt,
    credentialProof:
      record.credential.proof && typeof record.credential.proof === "object"
        ? (record.credential.proof as WalletCard["credentialProof"])
        : undefined,
    credentialType: record.credential.credentialType,
    issuerHospitalName: record.provenance.issuerName,
    issuerDid: record.provenance.issuerDid,
    holderDid: record.owner.holderDid,
    ownerUserId: record.owner.id,
    patientId: record.owner.patientId,
    sourceSystem: record.provenance.sourceKind,
    issuedAt: record.lifecycle.issuedAt,
    expiresAt: record.lifecycle.expiresAt,
    createdAt: record.provenance.receivedAt,
    pinned: record.local.pinned,
  };
}

function stableLegacyCardId(record: WalletDocumentRecordV2): number {
  const source = record.credential.credentialId || record.id;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  const positiveSafeId = hash & 0x7fff_ffff;
  return positiveSafeId || 1;
}

function legacyCredentialStatus(
  status: WalletDocumentRecordV2["lifecycle"]["status"],
): string {
  switch (status) {
    case "final":
    case "amended":
    case "corrected":
      return "active";
    case "preliminary":
      return "pending";
    case "entered_in_error":
      return "invalid";
    default:
      return status;
  }
}

export function credentialPaperModelFromCard(
  card: WalletCard,
  documentType: string,
  credential: CredentialRenderItem,
  subject: CredentialRenderItem,
  patient: CredentialRenderItem,
  hospital: CredentialRenderItem,
  issuer: CredentialRenderItem,
  document: CredentialRenderItem,
  payloads: CredentialRenderPayloads,
  fields: CredentialRenderField[],
  claimReceiptKind?: ClaimReceiptRenderKind,
): CredentialPaperModel {
  const humanDocument = getObject(subject, "humanDocument") ?? {};
  const renderData = getObject(humanDocument, "renderData") ?? humanDocument;
  const declaredIssuer = firstRecord(
    getObject(renderData, "issuer"),
    getObject(humanDocument, "issuer"),
  );
  const letterheadSource = firstRecord(
    declaredIssuer,
    issuer,
    getObject(renderData, "hospital"),
    hospital,
  );
  const titleTh = firstText(
    getText(renderData, "titleTh"),
    getText(humanDocument, "titleTh"),
    getText(document, "titleTh"),
    card.displayName,
  );
  const trustcareDisplay = getObject(
    getObject(credential, "trustcare"),
    "display",
  );
  const declaredLayout = firstText(
    getText(renderData, "layout"),
    getText(humanDocument, "layout"),
    getText(trustcareDisplay, "documentLayout"),
  );
  const paperSections = paperSectionsForCredential(
    documentType,
    subject,
    fields,
    payloads,
    claimReceiptKind,
  );

  return {
    formFactor: credentialPhysicalFormFactor(documentType, declaredLayout),
    letterhead: {
      nameTh: firstText(
        getText(letterheadSource, "nameTh"),
        getText(letterheadSource, "hospitalNameTh"),
      ),
      nameEn: firstText(
        getText(letterheadSource, "nameEn"),
        getText(letterheadSource, "name"),
        getText(letterheadSource, "hospitalNameEn"),
      ),
      code: getText(letterheadSource, "code"),
      identifier: firstText(
        getText(letterheadSource, "identifier"),
        getText(letterheadSource, "licenseNo"),
      ),
      address: getText(letterheadSource, "address"),
      phone: getText(letterheadSource, "phone"),
      logoUrl: firstText(
        getText(letterheadSource, "logoUrl"),
        getText(letterheadSource, "logo"),
      ),
      did: firstText(
        getText(letterheadSource, "did"),
        getText(letterheadSource, "id"),
        getText(issuer, "id"),
      ),
    },
    title: {
      th: titleTh ?? "",
      en: firstText(
        getText(renderData, "titleEn"),
        getText(humanDocument, "titleEn"),
        getText(document, "titleEn"),
        card.displayNameEn,
      ),
    },
    patientFields: paperPatientFields(subject, patient),
    metadataFields: paperMetadataFields(
      card,
      documentType,
      credential,
      document,
      issuer,
    ),
    sections: paperSections.sections,
    signatories: paperSignatories(subject, payloads),
    evidence: credentialEvidence(credential),
    watermark: explicitCredentialWatermark(credential, humanDocument),
    issuerRole: firstText(
      getText(credential, "issuerRole"),
      getText(issuer, "role"),
      getText(humanDocument, "issuerRole"),
      getText(declaredIssuer, "role"),
      getText(getObject(credential, "trustcare"), "issuerRole"),
    ),
    generic: paperSections.generic,
  };
}

type PaperColumnSpec = CredentialPaperTableColumn & {
  aliases: string[];
};

function credentialDocumentType(
  credential: CredentialRenderItem,
  subject: CredentialRenderItem,
): string | null {
  const trustcare = getObject(credential, "trustcare");
  const humanDocument = getObject(subject, "humanDocument");
  const renderData = getObject(humanDocument, "renderData") ?? humanDocument;
  const document = firstRecord(
    getObject(renderData, "document"),
    getObject(subject, "document"),
  );
  const candidates = [
    getText(trustcare, "documentType"),
    getText(subject, "documentType"),
    getText(document, "type"),
    ...credentialTypeValues(credential),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const withoutSuffix = candidate
      .replace(/Credential$/i, "")
      .replace(/VC$/i, "");
    const values = [
      candidate,
      withoutSuffix,
      withoutSuffix.replace(/([a-z0-9])([A-Z])/g, "$1_$2"),
    ];
    for (const value of values) {
      const normalized = normalizeDocumentType(value);
      if (normalized) return normalized;
    }
  }
  return null;
}

function credentialTypeValues(credential: CredentialRenderItem): string[] {
  const value = credential.type;
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function paperPatientFields(
  subject: CredentialRenderItem,
  patient: CredentialRenderItem,
): CredentialRenderField[] {
  return [
    field(
      "ชื่อ-นามสกุล",
      firstText(
        getText(patient, "fullNameTh"),
        getText(patient, "nameTh"),
        getText(subject, "nameTh"),
        getText(subject, "name"),
      ),
      "credentialSubject.patient.fullNameTh",
      true,
    ),
    field(
      "Name",
      firstText(
        getText(patient, "fullNameEn"),
        getText(patient, "nameEn"),
        getText(subject, "nameEn"),
      ),
      "credentialSubject.patient.fullNameEn",
      true,
    ),
    field("HN", getText(patient, "hn"), "credentialSubject.patient.hn", true),
    field(
      "CarePass ID",
      getText(patient, "carepassId"),
      "credentialSubject.patient.carepassId",
      false,
    ),
    field(
      "วันเกิด",
      formatDate(getText(patient, "birthDate")),
      "credentialSubject.patient.birthDate",
      false,
    ),
    field(
      "เพศ",
      getText(patient, "gender"),
      "credentialSubject.patient.gender",
      false,
    ),
    field(
      "สัญชาติ",
      getText(patient, "nationality"),
      "credentialSubject.patient.nationality",
      false,
    ),
    field(
      "เลขประจำตัว",
      firstText(
        getText(patient, "nationalId"),
        getText(patient, "thaiIdMasked"),
        getText(subject, "nationalId"),
        getText(subject, "idCardNo"),
      ),
      "credentialSubject.patient.nationalId",
      false,
    ),
  ].filter(isFieldWithValue);
}

function paperMetadataFields(
  card: WalletCard,
  documentType: string,
  credential: CredentialRenderItem,
  document: CredentialRenderItem,
  issuer: CredentialRenderItem,
): CredentialRenderField[] {
  const credentialStatus = getObject(credential, "credentialStatus");
  return [
    field("ประเภทเอกสาร", documentType, "document.type", true),
    field(
      "วันที่ออก",
      formatDate(
        firstText(
          getText(document, "issuedAt"),
          getText(credential, "validFrom"),
          getText(credential, "issuanceDate"),
          card.issuedAt,
        ),
      ),
      "document.issuedAt",
      false,
    ),
    field(
      "หมดอายุ",
      formatDate(
        firstText(
          getText(document, "expiresAt"),
          getText(credential, "validUntil"),
          getText(credential, "expirationDate"),
          card.expiresAt,
        ),
      ),
      "document.expiresAt",
      false,
    ),
    field(
      "สถานะเอกสาร",
      firstText(
        getText(document, "status"),
        getText(credentialStatus, "status"),
        card.credentialStatus,
      ),
      "document.status",
      false,
    ),
    field("Credential ID", getText(credential, "id"), "credential.id", false),
    field(
      "Issuer DID",
      firstText(getText(issuer, "id"), getText(credential, "issuer")),
      "credential.issuer",
      false,
    ),
  ].filter(isFieldWithValue);
}

function credentialEvidence(
  credential: CredentialRenderItem,
): CredentialRenderItem[] {
  const value = credential.evidence;
  if (Array.isArray(value))
    return value
      .filter(
        (item): item is CredentialRenderItem =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => ({ ...item }));
  if (value && typeof value === "object")
    return [{ ...(value as CredentialRenderItem) }];
  return [];
}

function explicitCredentialWatermark(
  credential: CredentialRenderItem,
  humanDocument: CredentialRenderItem,
): string | undefined {
  const trustcare = getObject(credential, "trustcare");
  const display = getObject(trustcare, "display");
  const visualHints = getObject(humanDocument, "visualHints");
  const renderData = getObject(humanDocument, "renderData");
  const renderDocument = getObject(renderData, "document");
  return firstText(
    getText(display, "watermark"),
    getText(humanDocument, "watermark"),
    getText(visualHints, "watermark"),
    getText(renderData, "watermark"),
    getText(renderDocument, "watermark"),
  );
}

function paperSectionsForCredential(
  documentType: string,
  subject: CredentialRenderItem,
  fields: CredentialRenderField[],
  payloads: CredentialRenderPayloads,
  claimReceiptKind?: ClaimReceiptRenderKind,
): { sections: CredentialPaperSection[]; generic: boolean } {
  const sections: CredentialPaperSection[] = [];
  const prescription = mergeDocumentPayload(subject, [
    "prescription",
    "medicationRequest",
  ]);
  const pharmacyDispense = mergeDocumentPayload(subject, [
    "medicationDispense",
    "pharmacyDispense",
    "dispense",
  ]);
  const medicationSummary = mergeDocumentPayload(subject, [
    "medicationSummary",
    "medications",
  ]);
  const scalarFields = fields.filter(
    (item) => !Array.isArray(item.value) && isFieldWithValue(item),
  );
  const addFields = (
    title = "รายละเอียดเอกสาร",
    titleEn = "Document details",
    inputFields = scalarFields,
    key = "details",
  ) => {
    const section = paperFieldsSection(key, title, titleEn, inputFields);
    if (section) sections.push(section);
  };
  const addSection = (section: CredentialPaperSection | undefined) => {
    if (section) sections.push(section);
  };

  switch (documentType) {
    case "allergy_alert":
      addSection({
        key: "allergy-alert",
        title: "ข้อมูลเตือนการแพ้",
        titleEn: "Allergy safety alert",
        kind: "alert",
        fields: fields.filter(isFieldWithValue),
        tone: "critical",
        sourcePath: "credentialSubject.allergyAlert",
      });
      break;
    case "immunization":
      addFields("ข้อมูลทะเบียนวัคซีน", "Immunization record");
      addSection(
        paperTableSection({
          key: "immunizations",
          title: "รายการวัคซีน",
          titleEn: "Immunizations",
          sourcePath: "credentialSubject.immunizationRecord.items",
          items: payloads.immunizationItems,
          columns: [
            paperColumn("vaccine", "วัคซีน", "Vaccine", [
              "display",
              "vaccineName",
              "vaccineCode",
              "name",
            ]),
            paperColumn("date", "วันที่ได้รับ", "Date", [
              "occurrenceDate",
              "date",
              "administeredAt",
            ]),
            paperColumn("lot", "หมายเลข Lot", "Lot", ["lotNumber", "lotNo"]),
            paperColumn("performer", "ผู้ให้บริการ", "Performer", [
              "performer",
              "provider",
              "organization",
            ]),
          ],
        }),
      );
      break;
    case "medication_summary":
      addSection(
        paperTableSection({
          key: "medications",
          title: "รายการยาปัจจุบัน",
          titleEn: "Current medications",
          sourcePath: "credentialSubject.medicationSummary.items",
          items: payloads.medicationSummaryItems,
          columns: medicationPaperColumns(),
        }),
      );
      addSection(
        paperBodySection(
          "medication-reconciliation",
          "การทบทวนรายการยา",
          "Medication reconciliation",
          getNested(medicationSummary, ["medicationReconciliation"]),
          "note",
          "credentialSubject.medicationSummary.medicationReconciliation",
        ),
      );
      break;
    case "prescription":
      addFields(
        "ข้อมูลใบสั่งยา",
        "Prescription details",
        prescriptionHeaderFields(prescription, scalarFields),
      );
      addSection(
        paperTableSection({
          key: "prescription-items",
          title: "รายการยาในใบสั่งยา",
          titleEn: "Medications prescribed",
          sourcePath: "credentialSubject.prescription.items",
          items: payloads.prescriptionItems,
          columns: medicationPaperColumns(),
        }),
      );
      addSection(
        paperBodySection(
          "prescription-note",
          "คำแนะนำ",
          "Instructions",
          getNested(prescription, ["note"]),
          "note",
          "credentialSubject.prescription.note",
        ),
      );
      break;
    case "pharmacy_dispense":
      addFields("ข้อมูลการจ่ายยา", "Dispense details");
      addSection(
        paperTableSection({
          key: "dispensed-items",
          title: "รายการยาที่จ่าย",
          titleEn: "Medications dispensed",
          sourcePath: "credentialSubject.pharmacyDispense.items",
          items: payloads.pharmacyDispenseItems,
          columns: medicationPaperColumns(),
        }),
      );
      addSection(
        paperBodySection(
          "pharmacy-counseling",
          "คำแนะนำจากเภสัชกร",
          "Pharmacist counseling",
          getNested(pharmacyDispense, ["counseling"]),
          "note",
          "credentialSubject.pharmacyDispense.counseling",
        ),
      );
      break;
    case "lab_result":
      addFields("ข้อมูลรายงาน", "Report details");
      addSection(
        paperTableSection({
          key: "lab-observations",
          title: "ผลตรวจทางห้องปฏิบัติการ",
          titleEn: "Laboratory results",
          sourcePath: "credentialSubject.labReport.observations",
          items: itemsFromUnknown(payloads.labReport.observations),
          columns: observationPaperColumns(),
        }),
      );
      break;
    case "diagnostic_report":
      addFields("ข้อมูลรายงาน", "Report details");
      addSection(
        paperTableSection({
          key: "diagnostic-observations",
          title: "รายละเอียดผลตรวจ",
          titleEn: "Reported observations",
          sourcePath: "credentialSubject.diagnosticReport.observations",
          items: itemsFromUnknown(payloads.diagnosticReport.observations),
          columns: observationPaperColumns(),
        }),
      );
      addSection(
        paperBodySection(
          "diagnostic-conclusion",
          "สรุปผล",
          "Conclusion",
          firstText(
            getText(payloads.diagnosticReport, "conclusionTh"),
            getText(payloads.diagnosticReport, "conclusion"),
            getText(payloads.diagnosticReport, "result"),
          ),
          "note",
          "credentialSubject.diagnosticReport.conclusion",
        ),
      );
      break;
    case "medical_certificate":
      addFields(
        "ข้อมูลการรับรอง",
        "Certification details",
        certificatePaperFields(payloads.certificate, scalarFields),
      );
      break;
    case "referral_vc":
      addFields("ข้อมูลการส่งต่อ", "Referral details");
      addSection(
        paperBodySection(
          "referral-clinical-note",
          "สรุปทางคลินิก",
          "Clinical summary",
          firstText(
            getText(payloads.referral, "clinicalNotes"),
            getText(payloads.referral, "clinicalSummary"),
          ),
          "letter",
          "credentialSubject.referral.clinicalNotes",
        ),
      );
      addSection(
        paperBodySection(
          "referral-attachments",
          "เอกสารประกอบ",
          "Attachments",
          getNested(payloads.referral, ["attachments"]),
          "note",
          "credentialSubject.referral.attachments",
        ),
      );
      break;
    case "insurance_eligibility":
      addFields("ข้อมูลสิทธิที่ Payer รายงาน", "Payer-reported coverage");
      addSection(
        paperTableSection({
          key: "benefits",
          title: "สิทธิประโยชน์ที่ Payer รายงาน",
          titleEn: "Payer-reported benefits",
          sourcePath: "credentialSubject.coverage.benefitSummary",
          items: itemsFromUnknown(payloads.coverage.benefitSummary),
          columns: [
            paperColumn("benefit", "สิทธิประโยชน์", "Benefit", [
              "benefit",
              "name",
              "display",
            ]),
            paperColumn("limit", "วงเงิน", "Limit", ["limit", "amount"]),
            paperColumn("remaining", "คงเหลือ", "Remaining", [
              "remaining",
              "remainingLimit",
            ]),
          ],
        }),
      );
      addSection(payerReportedDisclaimer());
      break;
    case "claim_package":
      addFields("ข้อมูลชุดเคลม", "Claim package details");
      addSection(
        paperTableSection({
          key: "claim-lines",
          title: "รายการบริการในชุดเคลม",
          titleEn: "Claim service lines",
          sourcePath: "credentialSubject.claimPackage.items",
          items: itemsFromUnknown(payloads.claimPackage.items),
          columns: financialPaperColumns(),
        }),
      );
      break;
    case "claim_receipt":
      addFields(
        claimReceiptKind === "payment_receipt"
          ? "ข้อมูลใบเสร็จ"
          : "สถานะที่ Payer รายงาน",
        claimReceiptKind === "payment_receipt"
          ? "Receipt details"
          : "Payer-reported status",
      );
      addSection(
        paperTableSection({
          key: "receipt-lines",
          title: "รายการค่าใช้จ่าย",
          titleEn: "Line items",
          sourcePath: "credentialSubject.claimReceipt.items",
          items: itemsFromUnknown(payloads.claimReceipt.items),
          columns: financialPaperColumns(),
        }),
      );
      if (claimReceiptKind !== "payment_receipt")
        addSection(payerReportedDisclaimer());
      break;
    case "quotation":
      addFields("ข้อมูลใบเสนอราคา", "Quotation details");
      addSection(
        paperTableSection({
          key: "quotation-lines",
          title: "รายการค่าใช้จ่ายโดยประมาณ",
          titleEn: "Estimated costs",
          sourcePath: "credentialSubject.quotation.items",
          items: itemsFromUnknown(payloads.quotation.items),
          columns: financialPaperColumns(),
        }),
      );
      addSection(
        paperBodySection(
          "quotation-exclusions",
          "ข้อยกเว้น",
          "Exclusions",
          getNested(payloads.quotation, ["exclusions"]),
          "note",
          "credentialSubject.quotation.exclusions",
        ),
      );
      break;
    case "guarantee_letter":
      addFields(
        "ข้อมูลการค้ำประกันที่ Payer รายงาน",
        "Payer-reported guarantee",
      );
      addSection(
        paperBodySection(
          "covered-services",
          "บริการที่คุ้มครอง",
          "Covered services",
          getNested(payloads.guaranteeLetter, ["coveredServices"]),
          "letter",
          "credentialSubject.guaranteeLetter.coveredServices",
        ),
      );
      addSection(
        paperBodySection(
          "guarantee-conditions",
          "เงื่อนไข",
          "Conditions",
          getNested(payloads.guaranteeLetter, ["conditions"]),
          "note",
          "credentialSubject.guaranteeLetter.conditions",
        ),
      );
      addSection(payerReportedDisclaimer());
      break;
    case "visa_support_letter":
      addFields("ข้อมูลหนังสือ", "Letter details");
      addSection(
        paperBodySection(
          "visa-letter-note",
          "ข้อความประกอบ",
          "Supporting statement",
          getText(payloads.visaSupportLetter, "note"),
          "letter",
          "credentialSubject.visaSupportLetter.note",
        ),
      );
      break;
    case "patient_identity":
    case "staff_identity":
    case "consent_receipt":
    case "mpi_link_certificate":
    case "patient_summary":
    case "discharge_summary":
    case "travel_document_verification":
    case "shl_manifest":
    case "sync_receipt":
    case "appointment":
      addFields();
      break;
    default:
      addFields();
      return { sections, generic: true };
  }

  return { sections, generic: false };
}

function paperFieldsSection(
  key: string,
  title: string,
  titleEn: string,
  fields: CredentialRenderField[],
): CredentialPaperSection | undefined {
  const visibleFields = fields.filter(isFieldWithValue);
  if (!visibleFields.length) return undefined;
  return {
    key,
    title,
    titleEn,
    kind: "fields",
    fields: visibleFields,
  };
}

function paperColumn(
  key: string,
  label: string,
  labelEn: string,
  aliases: string[],
  align: CredentialPaperTableColumn["align"] = "start",
): PaperColumnSpec {
  return { key, label, labelEn, aliases, align };
}

function paperTableSection(input: {
  key: string;
  title: string;
  titleEn: string;
  sourcePath: string;
  items: CredentialRenderItem[];
  columns: PaperColumnSpec[];
}): CredentialPaperSection | undefined {
  const rows = input.items
    .map((item) => {
      const row: CredentialRenderItem = {};
      for (const column of input.columns) {
        const value = firstPaperCell(item, column.aliases);
        if (paperHasValue(value)) row[column.key] = value;
      }
      return row;
    })
    .filter((row) => Object.keys(row).length > 0);
  if (!rows.length) return undefined;
  const columns = input.columns
    .filter((column) => rows.some((row) => paperHasValue(row[column.key])))
    .map(({ aliases: _aliases, ...column }) => column);
  if (!columns.length) return undefined;
  return {
    key: input.key,
    title: input.title,
    titleEn: input.titleEn,
    kind: "table",
    columns,
    rows,
    sourcePath: input.sourcePath,
  };
}

function paperBodySection(
  key: string,
  title: string,
  titleEn: string,
  body: unknown,
  kind: "note" | "alert" | "letter",
  sourcePath: string,
): CredentialPaperSection | undefined {
  if (!paperHasValue(body)) return undefined;
  return { key, title, titleEn, body, kind, sourcePath };
}

function medicationPaperColumns(): PaperColumnSpec[] {
  return [
    paperColumn("medication", "ชื่อยา", "Medication", [
      "medicationName",
      "nameTh",
      "name",
      "display",
    ]),
    paperColumn("strength", "ความแรง", "Strength", ["strength"]),
    paperColumn("instruction", "วิธีใช้", "Instructions", [
      "dosageInstruction",
      "instructions",
      "dose",
      "frequency",
    ]),
    paperColumn(
      "quantity",
      "จำนวน",
      "Quantity",
      ["quantity", "quantityDispensed", "daysSupply", "dispenseQuantity"],
      "end",
    ),
    paperColumn("unit", "หน่วย", "Unit", ["unit"]),
    paperColumn("refills", "Refill", "Refills", ["refills"], "end"),
    paperColumn("lot", "Lot", "Lot", ["lotNo", "lotNumber"]),
    paperColumn("status", "สถานะ", "Status", ["status"]),
  ];
}

function observationPaperColumns(): PaperColumnSpec[] {
  return [
    paperColumn("test", "รายการตรวจ", "Test", [
      "display",
      "name",
      "testName",
      "code",
    ]),
    paperColumn("result", "ผล", "Result", ["value", "result"], "end"),
    paperColumn("unit", "หน่วย", "Unit", ["unit"]),
    paperColumn("reference", "ค่าอ้างอิง", "Reference range", [
      "referenceRange",
      "reference",
    ]),
    paperColumn(
      "interpretation",
      "แปลผล",
      "Flag",
      ["interpretation", "flag"],
      "center",
    ),
  ];
}

function financialPaperColumns(): PaperColumnSpec[] {
  return [
    paperColumn("code", "รหัส", "Code", ["code", "serviceCode", "itemCode"]),
    paperColumn("description", "รายการ", "Description", [
      "description",
      "display",
      "name",
      "service",
    ]),
    paperColumn("quantity", "จำนวน", "Quantity", ["quantity", "qty"], "end"),
    paperColumn(
      "amount",
      "จำนวนเงิน",
      "Amount",
      ["amount", "totalAmount", "netAmount", "price"],
      "end",
    ),
    paperColumn("currency", "สกุลเงิน", "Currency", ["currency"], "center"),
  ];
}

function prescriptionHeaderFields(
  prescription: CredentialRenderItem,
  existing: CredentialRenderField[],
): CredentialRenderField[] {
  return [
    field(
      "เลขที่ใบสั่งยา",
      firstText(
        getText(prescription, "prescriptionNo"),
        getText(prescription, "documentNo"),
      ),
      "credentialSubject.prescription.prescriptionNo",
      true,
    ),
    field(
      "Encounter",
      getText(prescription, "encounterId"),
      "credentialSubject.prescription.encounterId",
      false,
    ),
    field(
      "วันที่สั่ง",
      formatDateTime(getText(prescription, "authoredOn")),
      "credentialSubject.prescription.authoredOn",
      false,
    ),
    ...existing,
  ].filter(isFieldWithValue);
}

function certificatePaperFields(
  certificate: CredentialRenderItem,
  existing: CredentialRenderField[],
): CredentialRenderField[] {
  const diagnosis = field(
    "การวินิจฉัย",
    firstText(
      getText(certificate, "diagnosisTh"),
      getText(certificate, "diagnosis"),
      getText(certificate, "diagnosisText"),
    ),
    "credentialSubject.certificate.diagnosis",
    true,
  );
  return [diagnosis, ...existing].filter(isFieldWithValue);
}

function payerReportedDisclaimer(): CredentialPaperSection {
  return {
    key: "payer-reported-disclaimer",
    title: "ขอบเขตผลจาก Payer",
    titleEn: "Payer-reported outcome",
    kind: "note",
    body: "ข้อมูลผลหรือสถานะในเอกสารนี้เป็นข้อมูลที่ Payer หรือ integration issuer รายงานกลับมา โดย Wallet ไม่ได้เป็นผู้พิจารณาหรือตัดสินผลเคลม",
    tone: "info",
  };
}

function firstPaperCell(
  item: CredentialRenderItem,
  aliases: string[],
): unknown {
  for (const alias of aliases) {
    const value = getNested(item, alias.split("."));
    if (paperHasValue(value)) return value;
  }
  return undefined;
}

function paperHasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(paperHasValue);
  if (typeof value === "object")
    return Object.values(value as CredentialRenderItem).some(paperHasValue);
  return true;
}

function paperSignatories(
  subject: CredentialRenderItem,
  payloads: CredentialRenderPayloads,
): CredentialPaperSignatory[] {
  const humanDocument = getObject(subject, "humanDocument") ?? {};
  const certificate = payloads.certificate;
  const referral = payloads.referral;
  const prescription = mergeDocumentPayload(subject, [
    "prescription",
    "medicationRequest",
  ]);
  const dispense = mergeDocumentPayload(subject, [
    "medicationDispense",
    "pharmacyDispense",
    "dispense",
  ]);
  const discharge = payloads.dischargeSummary;
  const quotation = payloads.quotation;
  const guarantee = payloads.guaranteeLetter;
  const explicitSignatories = strictRecordItems(
    getNested(humanDocument, ["signatories"]),
  );
  const candidates = [
    ...explicitSignatories,
    getObject(humanDocument, "signatory"),
    getObject(certificate, "certifyingPractitioner"),
    getObject(certificate, "physician"),
    getObject(referral, "requestedBy"),
    getObject(referral, "referringPractitioner"),
    getObject(prescription, "prescriber"),
    getObject(dispense, "dispenser"),
    getObject(payloads.labReport, "reportingPractitioner"),
    getObject(payloads.labReport, "authorizedBy"),
    getObject(payloads.diagnosticReport, "reportingPractitioner"),
    getObject(discharge, "attendingPhysician"),
    getObject(discharge, "author"),
    getObject(payloads.visaSupportLetter, "responsiblePhysician"),
    getObject(quotation, "authorizedOfficer"),
    getObject(quotation, "approvedBy"),
    getObject(guarantee, "authorizedOfficer"),
  ].filter((item): item is CredentialRenderItem => Boolean(item));
  const result: CredentialPaperSignatory[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const signatory: CredentialPaperSignatory = {
      name: firstText(
        getText(candidate, "fullNameTh"),
        getText(candidate, "nameTh"),
        getText(candidate, "fullNameEn"),
        getText(candidate, "nameEn"),
        getText(candidate, "name"),
        getText(candidate, "display"),
      ),
      role: firstText(
        getText(candidate, "roleTh"),
        getText(candidate, "roleEn"),
        getText(candidate, "role"),
        getText(candidate, "position"),
      ),
      licenseNo: firstText(
        getText(candidate, "licenseNo"),
        getText(candidate, "professionalLicenseNo"),
      ),
      organization: firstText(
        getText(candidate, "organization"),
        getText(candidate, "organizationName"),
      ),
      signedAt: firstText(
        getText(candidate, "signedAt"),
        getText(candidate, "date"),
      ),
    };
    if (!Object.values(signatory).some(paperHasValue)) continue;
    const identity = JSON.stringify(signatory);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(signatory);
  }
  return result;
}

function strictRecordItems(value: unknown): CredentialRenderItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CredentialRenderItem =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

export function credentialRenderPayloads(
  subject: CredentialRenderItem,
): CredentialRenderPayloads {
  return {
    labReport: labReportPayload(subject),
    diagnosticReport: diagnosticReportPayload(subject),
    certificate: medicalCertificatePayload(subject),
    clinicalSummary: clinicalSummaryPayload(subject),
    consent: consentPayload(subject),
    mpi: mpiPayload(subject),
    referral: referralPayload(subject),
    dischargeSummary: dischargeSummaryPayload(subject),
    coverage: coveragePayload(subject),
    claimPackage: claimPackagePayload(subject),
    claimReceipt: claimReceiptPayload(subject),
    quotation: quotationPayload(subject),
    visaSupportLetter: visaSupportLetterPayload(subject),
    guaranteeLetter: guaranteeLetterPayload(subject),
    syncReceipt: syncReceiptPayload(subject),
    manifest: manifestPayload(subject),
    appointment: appointmentPayload(subject),
    travelDocument: travelDocumentPayload(subject),
    immunizationItems: immunizationItems(subject),
    prescriptionItems: prescriptionItems(subject),
    medicationSummaryItems: medicationSummaryItems(subject),
    pharmacyDispenseItems: pharmacyDispenseItems(subject),
    allergyItems: allergyItems(subject),
  };
}

export function credentialRenderSections(
  card: WalletCard,
  documentType: string,
  subject: CredentialRenderItem,
  patient: CredentialRenderItem,
  document: CredentialRenderItem,
  bodyFields: CredentialRenderField[],
): CredentialRenderSection[] {
  const identityFields = [
    field(
      "ชื่อ-นามสกุล",
      firstText(
        getText(patient, "fullNameTh"),
        getText(patient, "nameTh"),
        getText(subject, "name"),
      ),
      "credentialSubject.patient.fullNameTh",
      true,
    ),
    field(
      "Name",
      firstText(getText(patient, "fullNameEn"), getText(patient, "nameEn")),
      "credentialSubject.patient.fullNameEn",
      true,
    ),
    field("HN", getText(patient, "hn"), "credentialSubject.patient.hn", false),
    field(
      "CarePass ID",
      getText(patient, "carepassId"),
      "credentialSubject.patient.carepassId",
      false,
    ),
  ].filter(isFieldWithValue);
  const documentFields = [
    field("ประเภทเอกสาร", documentType, "document.type", true),
    field(
      "วันที่ออก",
      formatDate(firstText(getText(document, "issuedAt"), card.issuedAt)),
      "document.issuedAt",
      false,
    ),
    field(
      "หมดอายุ",
      formatDate(firstText(getText(document, "expiresAt"), card.expiresAt)),
      "document.expiresAt",
      false,
    ),
    field(
      "สถานะ",
      firstText(getText(document, "status"), card.credentialStatus),
      "document.status",
      false,
    ),
    field("Credential ID", card.credentialId, "credential.id", false),
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

export function credentialDocumentNarrative(
  card: WalletCard,
  documentType: string,
  subject: CredentialRenderItem,
  patient: CredentialRenderItem,
  claimReceiptKind?: ClaimReceiptRenderKind,
): CredentialRenderNarrative {
  const humanDocument = getObject(subject, "humanDocument");
  const renderData = getObject(humanDocument, "renderData") ?? humanDocument;
  const patientName =
    getText(patient, "fullNameTh") ??
    getText(patient, "nameTh") ??
    getText(patient, "name") ??
    "ผู้ถือเอกสาร";
  const sourceSystem =
    getText(renderData, "sourceSystem") ??
    getText(humanDocument, "sourceSystem") ??
    getText(getObject(card.credentialData, "trustcare"), "sourceSystem");
  const sections = getStringArray(humanDocument, "sections");
  if (documentType === "claim_receipt" && claimReceiptKind === "claim_status") {
    return {
      title: "สถานะเคลมจาก Payer",
      body: "แสดงสถานะล่าสุดและคำขอเอกสารเพิ่มเติมตามที่ Payer หรือ integration issuer ส่งกลับ โดย Wallet ไม่ตัดสินผลเคลมเอง",
      sections,
      sourceSystem,
    };
  }
  if (
    documentType === "claim_receipt" &&
    claimReceiptKind === "submission_receipt"
  ) {
    return {
      title: "หลักฐานรับชุดเคลม",
      body: "ยืนยันว่า Payer หรือช่องทางที่กำหนดได้รับชุดเคลมแล้ว พร้อมเลขอ้างอิง ช่องทาง เวลา และสถานะการติดตาม",
      sections,
      sourceSystem,
    };
  }
  const map: Record<string, { title: string; body: string }> = {
    patient_identity: {
      title: "บัตรยืนยันตัวตนผู้ป่วย",
      body: `ใช้ยืนยันตัวตนและเลขประจำตัวผู้ป่วยของ ${patientName} ก่อนรับบริการหรือเชื่อมโยงข้อมูลข้ามหน่วยบริการ`,
    },
    staff_identity: {
      title: "บัตรยืนยันสิทธิ์เจ้าหน้าที่",
      body: "ใช้ยืนยันบทบาท หน่วยงาน และสิทธิ์การปฏิบัติงานของเจ้าหน้าที่ที่เกี่ยวข้องกับการตรวจสอบหรือออกเอกสาร",
    },
    consent_receipt: {
      title: "หลักฐานความยินยอม",
      body: "แสดงวัตถุประสงค์ ขอบเขตข้อมูล ผู้รับข้อมูล และเวลาหมดอายุของการยินยอม เพื่อให้การเปิดเผยข้อมูลมีขอบเขตชัดเจน",
    },
    mpi_link_certificate: {
      title: "หนังสือรับรองการเชื่อมโยงตัวตน MPI",
      body: "ใช้แสดงความสัมพันธ์ของหมายเลขผู้ป่วยในหลายหน่วยบริการ พร้อมระดับความเชื่อมั่นและผู้ตรวจทาน",
    },
    patient_summary: {
      title: "สรุปข้อมูลสุขภาพสำหรับการดูแลต่อเนื่อง",
      body: "รวมปัญหาสุขภาพสำคัญ ยาประจำ ประวัติแพ้ยา สัญญาณชีพ และแผนดูแล เพื่อช่วยให้หน่วยบริการใหม่ประเมินผู้ป่วยได้เร็วขึ้น",
    },
    allergy_alert: {
      title: "เอกสารเตือนความปลอดภัย",
      body: "เน้นสารก่อแพ้ ความรุนแรง ปฏิกิริยา และคำแนะนำฉุกเฉิน เพื่อช่วยลดความเสี่ยงก่อนสั่งยา ตรวจ หรือทำหัตถการ",
    },
    immunization: {
      title: "ประวัติการได้รับวัคซีน",
      body: "แสดงรายการวัคซีน วันที่ได้รับ หมายเลข lot และผู้ให้บริการ ใช้ประกอบการคัดกรองหรือวางแผนการดูแล",
    },
    medical_certificate: {
      title: "ใบรับรองแพทย์แบบพิมพ์ได้",
      body: "แสดงผลการตรวจ เหตุผลรับรอง ข้อจำกัด และผู้รับรอง เหมาะสำหรับใช้กับนายจ้าง หน่วยบริการ หรือหน่วยงานที่ต้องตรวจแหล่งที่มา",
    },
    medication_summary: {
      title: "สรุปรายการยาปัจจุบัน",
      body: "ช่วยทำ medication reconciliation โดยแสดงชื่อยา ขนาด วิธีใช้ ข้อบ่งใช้ และสถานะล่าสุดก่อนเข้ารับบริการ",
    },
    prescription: {
      title: "ใบสั่งยา",
      body: "แสดงรายการยาที่แพทย์สั่ง ปริมาณ วิธีใช้ การ refill และหมายเหตุสำหรับห้องยา",
    },
    pharmacy_dispense: {
      title: "ใบจ่ายยา",
      body: "แสดงรายการยาที่จ่ายจริง จำนวน lot และคำแนะนำจากเภสัชกร ใช้ตรวจสอบความต่อเนื่องของการใช้ยา",
    },
    lab_result: {
      title: "รายงานผลตรวจทางห้องปฏิบัติการ",
      body: "แสดง specimen เวลารายงาน ผลตรวจ ค่าอ้างอิง และ flag ผิดปกติ เพื่อให้แพทย์อ่านผลได้ทันที",
    },
    diagnostic_report: {
      title: "รายงานการตรวจวินิจฉัย",
      body: "แสดงวิธีตรวจ ผลสรุป ค่าที่รายงาน และผู้รายงาน เหมาะสำหรับส่งต่อหรือประกอบการดูแลต่อเนื่อง",
    },
    referral_vc: {
      title: "หนังสือส่งต่อการรักษา",
      body: "บอกหน่วยบริการต้นทาง ปลายทาง เหตุผลส่งต่อ บริการที่ขอ และรายการเอกสารแนบในชุดส่งต่อ",
    },
    discharge_summary: {
      title: "สรุปการจำหน่าย",
      body: "รวมวันรับไว้ วันจำหน่าย วินิจฉัยหลัก course ในโรงพยาบาล ยากลับบ้าน และแผนติดตามหลังจำหน่าย",
    },
    insurance_eligibility: {
      title: "ผลตรวจสอบสิทธิประกัน",
      body: "แสดง payer สถานะสิทธิ ช่วงคุ้มครอง วงเงิน และยอดคงเหลือ เพื่อใช้ก่อนรับบริการหรือส่งเคลม",
    },
    claim_package: {
      title: "ชุดเอกสารเคลม",
      body: "รวม diagnosis, service lines, เอกสารแนบ และยอดรวมสำหรับส่งต่อ payer หรือระบบ claim",
    },
    claim_receipt: {
      title: "ใบเสร็จรับเงิน",
      body: "แสดง invoice, รายการค่าบริการ วิธีชำระเงิน ยอดสุทธิ และส่วนรับผิดชอบของ payer/patient",
    },
    travel_document_verification: {
      title: "เอกสารยืนยันข้อมูลเดินทาง",
      body: "ใช้ตรวจข้อมูล passport และช่วงเดินทางสำหรับผู้ป่วยต่างชาติหรือ medical tourism",
    },
    visa_support_letter: {
      title: "จดหมายสนับสนุนการขอวีซ่า",
      body: "อธิบายเหตุผลทางการแพทย์ ช่วงเข้ารับบริการ แผนกที่รับ และแพทย์ผู้รับผิดชอบ โดยไม่ใช่การอนุมัติวีซ่า",
    },
    quotation: {
      title: "ใบเสนอราคาการรักษา",
      body: "แสดง package รายการค่าใช้จ่าย ยอดประมาณการ และข้อยกเว้น เพื่อใช้วางแผนก่อนรับบริการ",
    },
    guarantee_letter: {
      title: "หนังสือรับรองการชำระ/ค้ำประกัน",
      body: "แสดง payer, pre-authorization, บริการที่คุ้มครอง วงเงิน และเงื่อนไขก่อนให้บริการ",
    },
    shl_manifest: {
      title: "SMART Health Link Manifest",
      body: "แสดงไฟล์ใน SHL, hash, access policy และ binding กับ Manifest VC/Holder VP เฉพาะกรณีที่ TrustCare ตรวจรับรองแล้ว",
    },
    sync_receipt: {
      title: "ใบรับการนำเข้า/ซิงก์ข้อมูล",
      body: "ยืนยันต้นทาง ปลายทาง จำนวนวัตถุที่ซิงก์ checksum และ adapter version เพื่อ audit การเคลื่อนย้ายข้อมูล",
    },
    appointment: {
      title: "ใบนัดหมายและคำแนะนำ check-in",
      body: "แสดงเวลานัด สถานที่ แพทย์/แผนก และเอกสารที่ต้องเตรียมก่อนเข้ารับบริการ",
    },
  };
  const fallback = map[documentType] ?? {
    title: card.displayName,
    body: "เอกสารนี้ถูกจัดเก็บเป็น Verifiable Credential พร้อม DocumentReference evidence เพื่อให้ตรวจสอบแหล่งที่มาและใช้แลกเปลี่ยนแบบมีขอบเขตได้",
  };
  return { ...fallback, sections, sourceSystem };
}

function inferClaimReceiptRenderKind(
  card: WalletCard,
  credential: CredentialRenderItem,
  receipt: CredentialRenderItem,
): ClaimReceiptRenderKind {
  const credentialTypes = Array.isArray(credential.type)
    ? credential.type.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const typeText = [card.credentialType, ...credentialTypes]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (/ClaimStatusCredential|PreAuthDecisionCredential/i.test(typeText))
    return "claim_status";
  if (/ClaimSubmissionReceiptCredential/i.test(typeText))
    return "submission_receipt";
  if (
    hasValue(getNested(receipt, ["updatedAt"])) ||
    hasValue(getNested(receipt, ["payerStatusCode"])) ||
    hasValue(getNested(receipt, ["payerStatusText"])) ||
    hasValue(getNested(receipt, ["needMoreEvidence"]))
  ) {
    return "claim_status";
  }
  if (
    hasValue(getNested(receipt, ["externalSubmissionId"])) ||
    hasValue(getNested(receipt, ["channel"])) ||
    hasValue(getNested(receipt, ["manualFollowUpRequired"]))
  ) {
    return "submission_receipt";
  }
  return "payment_receipt";
}

function claimReceiptKindLabel(
  kind: ClaimReceiptRenderKind | undefined,
  fallback: string,
): string {
  if (kind === "claim_status") return "Claim status";
  if (kind === "submission_receipt") return "Claim submission receipt";
  return fallback;
}

export function displayCredentialValue(value: unknown): string {
  return formatValue(value);
}

export function credentialFieldHasValue(
  fieldValue: CredentialRenderField,
): boolean {
  return isFieldWithValue(fieldValue);
}

export type CredentialCompactSummaryRow = {
  key: string;
  label: string;
  value: string;
  sourcePath?: string;
};

/**
 * Projects the shared credential render model into a small, patient-readable
 * summary. This deliberately consumes normalized renderer fields and tables so
 * compact cards never grow their own credential-type parsers.
 */
export function credentialCompactSummaryRows(
  model: CredentialRenderModel,
  limit = 3,
): CredentialCompactSummaryRow[] {
  if (limit <= 0) return [];

  const result: CredentialCompactSummaryRow[] = [];

  for (const item of model.fields) {
    if (!credentialFieldHasValue(item)) continue;
    if (
      typeof item.value !== "string" &&
      typeof item.value !== "number" &&
      typeof item.value !== "boolean"
    ) {
      continue;
    }

    result.push({
      key: item.path ?? item.label,
      label: item.label,
      value: displayCredentialValue(item.value),
      sourcePath: item.path,
    });

    if (result.length === limit) return result;
  }

  const table = model.paper.sections.find(
    (section) =>
      section.kind === "table" &&
      Boolean(section.rows?.length) &&
      Boolean(section.columns?.length),
  );

  if (!table?.rows || !table.columns) return result;

  result.push({
    key: `${table.key}:count`,
    label: table.title,
    value: `${table.rows.length} รายการ`,
    sourcePath: table.sourcePath,
  });

  for (const [index, row] of table.rows.entries()) {
    if (result.length === limit) break;

    const cells = table.columns
      .map((column) => ({
        label: column.label,
        value: row[column.key],
      }))
      .filter(
        (cell) =>
          cell.value !== undefined &&
          cell.value !== null &&
          displayCredentialValue(cell.value).trim().length > 0,
      );

    if (!cells.length) continue;

    result.push({
      key: `${table.key}:${index}`,
      label: cells[0].label,
      value: cells
        .map((cell) => displayCredentialValue(cell.value))
        .join(" · "),
      sourcePath: table.sourcePath
        ? `${table.sourcePath}.${index}`
        : undefined,
    });
  }

  return result.slice(0, limit);
}

function fieldsForCredentialType(
  card: WalletCard,
  documentType: string,
  subject: CredentialRenderItem,
  patient: CredentialRenderItem,
  payloads: CredentialRenderPayloads,
  claimReceiptKind?: ClaimReceiptRenderKind,
): CredentialRenderField[] {
  const coverage = payloads.coverage;
  const certificate = payloads.certificate;
  const referral = payloads.referral;
  const discharge = payloads.dischargeSummary;
  const consent = payloads.consent;
  const mpi = payloads.mpi;
  const travel = payloads.travelDocument;
  const visa = payloads.visaSupportLetter;
  const guarantee = payloads.guaranteeLetter;
  const quotation = payloads.quotation;
  const claimPackage = payloads.claimPackage;
  const receipt = payloads.claimReceipt;
  const syncReceipt = payloads.syncReceipt;
  const appointment = payloads.appointment;
  const manifest = payloads.manifest;
  const labReport = payloads.labReport;
  const diagnosticReport = payloads.diagnosticReport;
  const clinicalSummary = payloads.clinicalSummary;
  const fields: Record<string, CredentialRenderField[]> = {
    patient_identity: [
      field("HN", getText(patient, "hn"), "credentialSubject.patient.hn", true),
      field(
        "CarePass ID",
        getText(patient, "carepassId"),
        "credentialSubject.patient.carepassId",
        false,
      ),
      field(
        "เลขบัตร",
        firstText(
          getText(subject, "idCardNo"),
          getText(subject, "nationalId"),
          getText(patient, "nationalId"),
        ),
        "credentialSubject.patient.nationalId",
        false,
      ),
      field(
        "วันเกิด",
        formatDate(getText(patient, "birthDate")),
        "credentialSubject.patient.birthDate",
        true,
      ),
      field(
        "สัญชาติ",
        getText(patient, "nationality") ?? getText(subject, "nationality"),
        "credentialSubject.patient.nationality",
        false,
      ),
      field(
        "กรุ๊ปเลือด",
        getText(subject, "bloodType"),
        "credentialSubject.bloodType",
        false,
      ),
      field(
        "ผู้ติดต่อฉุกเฉิน",
        displayName(getObject(subject, "emergencyContact")),
        "credentialSubject.emergencyContact",
        false,
      ),
    ],
    staff_identity: [
      field(
        "รหัสเจ้าหน้าที่",
        getText(subject, "staffId") ??
          getNested(subject, ["staff", "employeeId"]) ??
          getText(patient, "carepassId"),
        "credentialSubject.staff.employeeId",
        true,
      ),
      field(
        "ตำแหน่ง",
        getText(subject, "position") ??
          getText(subject, "positionEn") ??
          getNested(subject, ["staff", "role"]),
        "credentialSubject.staff.role",
        true,
      ),
      field(
        "หน่วยงาน",
        getText(subject, "department") ??
          getNested(subject, ["staff", "department"]) ??
          getText(subject, "hospitalNameTh"),
        "credentialSubject.staff.department",
        true,
      ),
      field(
        "บทบาทระบบ",
        getText(subject, "systemRole"),
        "credentialSubject.staff.systemRole",
        false,
      ),
      field(
        "อีเมล",
        getText(subject, "email") ?? getText(patient, "email"),
        "credentialSubject.staff.email",
        false,
      ),
      field(
        "โทรศัพท์",
        getText(subject, "phone"),
        "credentialSubject.staff.phone",
        false,
      ),
    ],
    patient_summary: [
      field(
        "โรค/ภาวะสำคัญ",
        getNested(clinicalSummary, ["conditions"]),
        "credentialSubject.patientSummary.conditions",
        true,
      ),
      field(
        "การแพ้",
        getNested(clinicalSummary, ["allergies"]),
        "credentialSubject.patientSummary.allergies",
        true,
      ),
      field(
        "ยาปัจจุบัน",
        getNested(clinicalSummary, ["medications"]),
        "credentialSubject.patientSummary.medications",
        true,
      ),
      field(
        "สัญญาณชีพ",
        getNested(clinicalSummary, ["vitalSigns"]),
        "credentialSubject.patientSummary.vitalSigns",
        false,
      ),
      field(
        "แผนดูแล",
        getText(clinicalSummary, "carePlan"),
        "credentialSubject.patientSummary.carePlan",
        false,
      ),
    ],
    allergy_alert: [
      field(
        "รายการแพ้",
        payloads.allergyItems,
        "credentialSubject.allergyAlert.items",
        true,
      ),
      field(
        "คำแนะนำฉุกเฉิน",
        firstText(
          getText(subject, "emergencyInstruction"),
          getText(subject, "clinicalNote"),
        ),
        "credentialSubject.allergyAlert.emergencyInstruction",
        true,
      ),
    ],
    immunization: [
      field(
        "รายการวัคซีน",
        payloads.immunizationItems,
        "credentialSubject.immunizationRecord.items",
        true,
      ),
      field(
        "สถานะทะเบียนวัคซีน",
        getText(subject, "registryStatus"),
        "credentialSubject.immunizationRecord.registryStatus",
        false,
      ),
    ],
    medication_summary: [
      field(
        "รายการยาปัจจุบัน",
        payloads.medicationSummaryItems,
        "credentialSubject.medicationSummary.items",
        true,
      ),
    ],
    prescription: [
      field(
        "รายการยาในใบสั่งยา",
        payloads.prescriptionItems,
        "credentialSubject.prescription.items",
        true,
      ),
    ],
    pharmacy_dispense: [
      field(
        "รายการยาที่จ่าย",
        payloads.pharmacyDispenseItems,
        "credentialSubject.pharmacyDispense.items",
        true,
      ),
    ],
    lab_result: [
      field(
        "เลขที่รายงาน",
        getText(labReport, "reportNo"),
        "credentialSubject.labReport.reportNo",
        true,
      ),
      field(
        "ห้องปฏิบัติการ",
        getText(labReport, "laboratory"),
        "credentialSubject.labReport.laboratory",
        true,
      ),
      field(
        "เก็บตัวอย่างเมื่อ",
        formatDateTime(getText(labReport, "specimenCollectedAt")),
        "credentialSubject.labReport.specimenCollectedAt",
        false,
      ),
      field(
        "รายงานเมื่อ",
        formatDateTime(getText(labReport, "reportedAt")),
        "credentialSubject.labReport.reportedAt",
        false,
      ),
      field(
        "ผลตรวจ",
        getNested(labReport, ["observations"]),
        "credentialSubject.labReport.observations",
        true,
      ),
    ],
    diagnostic_report: [
      field(
        "เลขที่รายงาน",
        getText(diagnosticReport, "reportNo"),
        "credentialSubject.diagnosticReport.reportNo",
        true,
      ),
      field(
        "ประเภทการตรวจ",
        getText(diagnosticReport, "category"),
        "credentialSubject.diagnosticReport.category",
        true,
      ),
      field(
        "วันที่ตรวจ",
        formatDateTime(getText(diagnosticReport, "effectiveDateTime")),
        "credentialSubject.diagnosticReport.effectiveDateTime",
        true,
      ),
      field(
        "สรุปผล",
        firstText(
          getText(diagnosticReport, "conclusionTh"),
          getText(diagnosticReport, "conclusion"),
          getText(diagnosticReport, "result"),
        ),
        "credentialSubject.diagnosticReport.conclusion",
        true,
      ),
      field(
        "รายละเอียดผลตรวจ",
        getNested(diagnosticReport, ["observations"]),
        "credentialSubject.diagnosticReport.observations",
        false,
      ),
    ],
    insurance_eligibility: [
      field(
        "ผู้รับประกัน",
        displayName(getObject(coverage, "payer")) ?? getText(coverage, "payer"),
        "credentialSubject.coverage.payer",
        true,
      ),
      field(
        "แผน",
        getText(coverage, "planName"),
        "credentialSubject.coverage.planName",
        true,
      ),
      field(
        "สถานะสิทธิ",
        getText(coverage, "status"),
        "credentialSubject.coverage.status",
        true,
      ),
      field(
        "เครือข่าย",
        getText(coverage, "network"),
        "credentialSubject.coverage.network",
        false,
      ),
      field(
        "ต้อง pre-auth",
        booleanLabel(getNested(coverage, ["preAuthorizationRequired"]), {
          yes: "ต้องขออนุมัติก่อน",
          no: "ไม่จำเป็น",
        }),
        "credentialSubject.coverage.preAuthorizationRequired",
        false,
      ),
      field(
        "ตรวจสอบล่าสุด",
        formatDateTime(
          getText(coverage, "checkedAt") ?? getText(coverage, "lastCheckedAt"),
        ),
        "credentialSubject.coverage.lastCheckedAt",
        false,
      ),
    ],
    medical_certificate: [
      field(
        "เลขที่ใบรับรอง",
        getText(certificate, "certificateNo") ??
          getText(certificate, "documentNo"),
        "credentialSubject.certificate.certificateNo",
        true,
      ),
      field(
        "ประเภท",
        getText(certificate, "type") ?? getText(certificate, "certificateType"),
        "credentialSubject.certificate.type",
        true,
      ),
      field(
        "วันที่ตรวจ",
        formatDate(
          firstText(
            getText(certificate, "examinationDate"),
            getText(certificate, "issuedAt"),
          ),
        ),
        "credentialSubject.certificate.examinationDate",
        true,
      ),
      field(
        "ใช้ได้ถึง",
        formatDate(getText(certificate, "validUntil")),
        "credentialSubject.certificate.validUntil",
        false,
      ),
      field(
        "ผลการตรวจ",
        getText(certificate, "result") ??
          getText(certificate, "diagnosisText") ??
          (getNested(certificate, ["fitnessForWork", "fit"]) === true
            ? "สามารถทำงานหรือเข้ารับบริการได้ตามแพทย์เห็นสมควร"
            : undefined),
        "credentialSubject.certificate.result",
        true,
      ),
      field(
        "ข้อจำกัด",
        getText(certificate, "restrictions") ??
          getText(certificate, "recommendations"),
        "credentialSubject.certificate.restrictions",
        false,
      ),
    ],
    referral_vc: [
      field(
        "เลขที่ส่งต่อ",
        getText(referral, "referralNo") ?? getText(referral, "documentNo"),
        "credentialSubject.referral.referralNo",
        true,
      ),
      field(
        "จาก",
        getText(referral, "fromHospital") ??
          displayName(getObject(referral, "organization")) ??
          getText(referral, "from") ??
          getText(referral, "referringDepartment"),
        "credentialSubject.referral.fromHospital",
        true,
      ),
      field(
        "ถึง",
        getText(referral, "toHospital") ??
          getText(referral, "to") ??
          getText(referral, "receivingFacility") ??
          getText(referral, "receivingDepartment"),
        "credentialSubject.referral.toHospital",
        true,
      ),
      field(
        "บริการที่ขอ",
        getText(referral, "requestedService") ??
          formatValue(getNested(referral, ["requestedServices"])),
        "credentialSubject.referral.requestedService",
        true,
      ),
      field(
        "เหตุผล",
        getText(referral, "reason") ??
          getText(referral, "reasonForReferralTh") ??
          getText(referral, "reasonForReferral"),
        "credentialSubject.referral.reason",
        true,
      ),
      field(
        "ความเร่งด่วน",
        getText(referral, "priority"),
        "credentialSubject.referral.priority",
        false,
      ),
      field(
        "หมดอายุ",
        formatDate(getText(referral, "validUntil")),
        "credentialSubject.referral.validUntil",
        false,
      ),
    ],
    discharge_summary: [
      field(
        "เลขที่ Admit",
        getText(discharge, "admissionNo") ?? getText(discharge, "encounterNo"),
        "credentialSubject.dischargeSummary.admissionNo",
        true,
      ),
      field(
        "วันที่ Admit",
        formatDate(getText(discharge, "admissionDate")),
        "credentialSubject.dischargeSummary.admissionDate",
        true,
      ),
      field(
        "วันที่จำหน่าย",
        formatDate(getText(discharge, "dischargeDate")),
        "credentialSubject.dischargeSummary.dischargeDate",
        true,
      ),
      field(
        "วินิจฉัยหลัก",
        displayName(getObject(discharge, "principalDiagnosis")) ??
          getText(discharge, "principalDiagnosis"),
        "credentialSubject.dischargeSummary.principalDiagnosis",
        true,
      ),
      field(
        "แผนติดตาม",
        getText(discharge, "followUp"),
        "credentialSubject.dischargeSummary.followUp",
        false,
      ),
    ],
    consent_receipt: [
      field(
        "Consent ID",
        getText(consent, "consentId"),
        "credentialSubject.consent.consentId",
        true,
      ),
      field(
        "สถานะ",
        getText(consent, "status"),
        "credentialSubject.consent.status",
        true,
      ),
      field(
        "วัตถุประสงค์",
        getText(consent, "purpose"),
        "credentialSubject.consent.purpose",
        true,
      ),
      field(
        "ผู้รับข้อมูล",
        getText(consent, "recipient") ??
          getText(consent, "grantedToOrganizationId") ??
          getText(consent, "requesterId"),
        "credentialSubject.consent.recipient",
        true,
      ),
      field(
        "ขอบเขต",
        getNested(consent, ["scope"]) ?? getNested(consent, ["scopes"]),
        "credentialSubject.consent.scope",
        true,
      ),
      field(
        "หมดอายุ",
        formatDateTime(getText(consent, "expiresAt")),
        "credentialSubject.consent.expiresAt",
        false,
      ),
    ],
    mpi_link_certificate: [
      field(
        "Golden Record",
        getText(mpi, "goldenRecordId"),
        "credentialSubject.mpi.goldenRecordId",
        true,
      ),
      field(
        "สถานะ",
        getText(mpi, "linkStatus"),
        "credentialSubject.mpi.linkStatus",
        true,
      ),
      field(
        "ความเชื่อมั่น",
        getText(mpi, "confidence") ?? getText(mpi, "linkConfidence"),
        "credentialSubject.mpi.confidence",
        false,
      ),
      field(
        "นโยบายจับคู่",
        getText(mpi, "matchingPolicy") ?? getText(mpi, "matchAlgorithm"),
        "credentialSubject.mpi.matchingPolicy",
        false,
      ),
      field(
        "ตรวจทานโดย",
        getText(mpi, "reviewedBy") ?? getText(mpi, "linkedBy"),
        "credentialSubject.mpi.reviewedBy",
        false,
      ),
    ],
    travel_document_verification: [
      field(
        "Passport",
        getText(travel, "passportNoMasked") ??
          getText(travel, "passportNumber") ??
          getText(travel, "passport") ??
          getNested(travel, ["travel", "passport"]),
        "credentialSubject.travel.passportNumber",
        true,
      ),
      field(
        "ประเทศออกเอกสาร",
        getText(travel, "issuingCountry"),
        "credentialSubject.travel.issuingCountry",
        false,
      ),
      field(
        "สถานะตรวจสอบ",
        getText(travel, "verificationStatus"),
        "credentialSubject.travel.verificationStatus",
        true,
      ),
      field(
        "ประเภท Visa",
        getText(travel, "visaTypeTh") ?? getText(travel, "visaType"),
        "credentialSubject.travel.visaType",
        false,
      ),
      field(
        "วันหมดอายุ Passport",
        formatDate(getText(travel, "expiryDate")),
        "credentialSubject.travel.expiryDate",
        false,
      ),
      field(
        "สัญชาติ",
        getText(travel, "nationality"),
        "credentialSubject.travel.nationality",
        true,
      ),
    ],
    visa_support_letter: [
      field(
        "เลขที่จดหมาย",
        getText(visa, "letterNo") ?? getText(visa, "documentNo"),
        "credentialSubject.visaSupportLetter.letterNo",
        true,
      ),
      field(
        "วัตถุประสงค์",
        getText(visa, "purposeTh") ?? getText(visa, "purpose"),
        "credentialSubject.visaSupportLetter.purpose",
        true,
      ),
      field(
        "แผนกที่รับ",
        getText(visa, "receivingDepartment"),
        "credentialSubject.visaSupportLetter.receivingDepartment",
        true,
      ),
      field(
        "แผนการรักษา",
        getText(visa, "treatmentPlan"),
        "credentialSubject.visaSupportLetter.treatmentPlan",
        false,
      ),
      field(
        "ช่วงเข้ารับบริการ",
        formatPeriod(
          getObject(visa, "proposedVisitPeriod") ??
            getObject(visa, "visitPeriod"),
        ),
        "credentialSubject.visaSupportLetter.proposedVisitPeriod",
        false,
      ),
      field(
        "แพทย์ผู้รับผิดชอบ",
        displayName(getObject(visa, "responsiblePhysician")),
        "credentialSubject.visaSupportLetter.responsiblePhysician",
        false,
      ),
    ],
    guarantee_letter: [
      field(
        "เลขที่ Guarantee",
        getText(guarantee, "guaranteeNo") ?? getText(guarantee, "guaranteeRef"),
        "credentialSubject.guaranteeLetter.guaranteeNo",
        true,
      ),
      field(
        "Payer",
        displayName(getObject(guarantee, "payer")) ??
          getText(guarantee, "issuedByPayer"),
        "credentialSubject.guaranteeLetter.payer",
        true,
      ),
      field(
        "Pre-auth",
        getText(guarantee, "preAuthNo") ??
          getText(guarantee, "preAuthorizationNo"),
        "credentialSubject.guaranteeLetter.preAuthNo",
        false,
      ),
      field(
        "วงเงิน",
        formatMoney(
          getNested(guarantee, ["guaranteeLimit", "amount"]) ??
            getText(guarantee, "approvedLimit"),
          getNested(guarantee, ["guaranteeLimit", "currency"]) ??
            getText(guarantee, "currency"),
        ),
        "credentialSubject.guaranteeLetter.guaranteeLimit",
        false,
      ),
      field(
        "ใช้ได้ถึง",
        formatDate(getText(guarantee, "validUntil")),
        "credentialSubject.guaranteeLetter.validUntil",
        false,
      ),
    ],
    quotation: [
      field(
        "เลขที่ใบเสนอราคา",
        getText(quotation, "quotationNo") ?? getText(quotation, "documentNo"),
        "credentialSubject.quotation.quotationNo",
        true,
      ),
      field(
        "แพ็กเกจ",
        getText(quotation, "packageName") ??
          getText(quotation, "packageNameEn"),
        "credentialSubject.quotation.packageName",
        true,
      ),
      field(
        "ยอดประมาณการ",
        formatMoney(
          getNested(quotation, ["estimatedTotal"]),
          getNested(quotation, ["currency"]),
        ),
        "credentialSubject.quotation.estimatedTotal",
        false,
      ),
      field(
        "ใช้ได้",
        getText(quotation, "validForDays")
          ? `${getText(quotation, "validForDays")} วัน`
          : undefined,
        "credentialSubject.quotation.validForDays",
        false,
      ),
      field(
        "เงื่อนไขชำระเงิน",
        getText(quotation, "paymentTerms"),
        "credentialSubject.quotation.paymentTerms",
        false,
      ),
      field(
        "ข้อยกเว้น",
        getNested(quotation, ["exclusions"]),
        "credentialSubject.quotation.exclusions",
        false,
      ),
    ],
    claim_package: businessPayloadFields(
      claimPackage,
      claimPackageRenderConfig,
    ),
    claim_receipt: businessPayloadFields(
      receipt,
      claimReceiptKind === "payment_receipt"
        ? claimReceiptRenderConfig
        : payerClaimReceiptRenderConfig,
    ),
    sync_receipt: [
      field(
        "Sync ID",
        getText(syncReceipt, "syncId") ?? getText(syncReceipt, "documentNo"),
        "credentialSubject.syncReceipt.syncId",
        true,
      ),
      field(
        "Operation",
        getText(syncReceipt, "operation"),
        "credentialSubject.syncReceipt.operation",
        true,
      ),
      field(
        "ต้นทาง",
        getText(syncReceipt, "sourceSystem") ??
          getText(syncReceipt, "targetId"),
        "credentialSubject.syncReceipt.sourceSystem",
        true,
      ),
      field(
        "ปลายทาง",
        getText(syncReceipt, "targetSystem"),
        "credentialSubject.syncReceipt.targetSystem",
        true,
      ),
      field(
        "สถานะ",
        getText(syncReceipt, "status"),
        "credentialSubject.syncReceipt.status",
        true,
      ),
    ],
    appointment: [
      field(
        "ประเภทนัด",
        getText(appointment, "serviceType") ??
          getText(appointment, "appointmentType"),
        "credentialSubject.appointment.serviceType",
        true,
      ),
      field(
        "แผนก",
        getText(appointment, "department"),
        "credentialSubject.appointment.department",
        true,
      ),
      field(
        "วันนัด",
        formatDate(
          getText(appointment, "scheduledDate") ??
            getText(appointment, "start"),
        ),
        "credentialSubject.appointment.start",
        true,
      ),
      field(
        "เวลา",
        getText(appointment, "scheduledTime") ??
          formatDateTime(getText(appointment, "start")),
        "credentialSubject.appointment.scheduledTime",
        true,
      ),
      field(
        "สถานที่",
        getText(appointment, "location"),
        "credentialSubject.appointment.location",
        true,
      ),
      field(
        "เอกสารที่ต้องเตรียม",
        getNested(appointment, ["requiredDocuments"]),
        "credentialSubject.appointment.requiredDocuments",
        false,
      ),
    ],
    shl_manifest: [
      field(
        "SHL ID",
        getText(manifest, "shlId") ??
          getText(manifest, "smartHealthLinkId") ??
          getText(manifest, "bundleId"),
        "credentialSubject.manifest.shlId",
        true,
      ),
      field(
        "วัตถุประสงค์",
        getText(manifest, "purpose"),
        "credentialSubject.manifest.purpose",
        true,
      ),
      field(
        "Manifest hash",
        getText(manifest, "manifestHash"),
        "credentialSubject.manifest.manifestHash",
        false,
      ),
      field(
        "หมดอายุ",
        formatDateTime(
          getText(manifest, "expiresAt") ??
            getNested(manifest, ["accessControl", "expiresAt"]),
        ),
        "credentialSubject.manifest.expiresAt",
        false,
      ),
      field(
        "ไฟล์",
        getNested(manifest, ["files"]) ?? getNested(manifest, ["documents"]),
        "credentialSubject.manifest.files",
        false,
      ),
    ],
  };

  return (
    fields[documentType] ?? [
      field("ประเภท", card.displayName, "document.displayName", true),
      field("หมวดหมู่", card.documentCategory, "document.category", false),
      field("ออกเมื่อ", formatDate(card.issuedAt), "document.issuedAt", false),
      field("หมดอายุ", formatDate(card.expiresAt), "document.expiresAt", false),
    ]
  );
}

function field(
  label: string,
  value: unknown,
  path: string,
  discloseByDefault: boolean,
): CredentialRenderField {
  return { label, value, path, discloseByDefault };
}

function businessPayloadFields(
  payload: CredentialRenderItem,
  config: BusinessPayloadRenderConfig,
): CredentialRenderField[] {
  const hiddenKeys = new Set(config.hiddenKeys ?? []);
  const priorityIndex = new Map(
    config.priority.map((key, index) => [key, index]),
  );
  const entries = Object.entries(payload)
    .filter(([key, value]) => {
      if (hiddenKeys.has(key)) return false;
      if (TECHNICAL_FIELD_NAMES.has(key.toLowerCase())) return false;
      return hasValue(value);
    })
    .sort(([left], [right]) => {
      const leftIndex = priorityIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = priorityIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.localeCompare(right);
    });
  const fields: CredentialRenderField[] = [];

  for (const [key, rawValue] of entries) {
    const value = formatBusinessPayloadValue(key, rawValue, payload, config);
    if (!hasValue(value) || value === "-") continue;
    fields.push(
      field(
        config.labels?.[key] ?? humanizeKey(key),
        value,
        `${config.pathRoot}.${key}`,
        config.discloseByDefault?.includes(key) ?? false,
      ),
    );
  }

  return fields;
}

function formatBusinessPayloadValue(
  key: string,
  value: unknown,
  payload: CredentialRenderItem,
  config: BusinessPayloadRenderConfig,
): unknown {
  if (config.moneyKeys?.includes(key))
    return formatMoney(value, getNested(payload, ["currency"]));
  if (config.dateTimeKeys?.includes(key)) return formatDateTime(value);
  if (config.dateKeys?.includes(key)) return formatDate(value);
  if (key === "payer") return displayName(value) ?? value;
  return value;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function sectionKindForType(documentType: string): CredentialRenderSectionKind {
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

export function isCredentialDisclosurePath(path: string): boolean {
  const parts = path
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  return !parts.some(
    (part, index) =>
      TECHNICAL_FIELD_NAMES.has(part) &&
      !(part === "credentialsubject" && index === 0 && parts.length > 1),
  );
}

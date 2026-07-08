import type { WalletCard } from "./models";
import {
  isTrustArtifactDocumentType,
  normalizeDocumentType,
} from "./canonicalDocuments";
import {
  extractPortalRenderData,
  mergePortalRenderPayload,
  normalizePortalRenderSubject,
} from "./portalRenderContract";

export type CredentialRenderItem = Record<string, unknown>;

export type CredentialRenderField = {
  label: string;
  value: unknown;
  sensitivity?: string;
  discloseByDefault?: boolean;
  path?: string;
};

export type CredentialRenderSectionKind =
  | "identity"
  | "clinical"
  | "financial"
  | "document"
  | "trust"
  | "policy"
  | "technical";

export type CredentialRenderSection = {
  key: string;
  title: string;
  kind: CredentialRenderSectionKind;
  fields: CredentialRenderField[];
};

export type CredentialRenderNarrative = {
  title: string;
  body: string;
  sections: string[];
  sourceSystem?: string;
};

export type CredentialRenderPayloads = {
  labReport: CredentialRenderItem;
  diagnosticReport: CredentialRenderItem;
  certificate: CredentialRenderItem;
  clinicalSummary: CredentialRenderItem;
  consent: CredentialRenderItem;
  mpi: CredentialRenderItem;
  referral: CredentialRenderItem;
  dischargeSummary: CredentialRenderItem;
  coverage: CredentialRenderItem;
  claimPackage: CredentialRenderItem;
  claimReceipt: CredentialRenderItem;
  quotation: CredentialRenderItem;
  visaSupportLetter: CredentialRenderItem;
  guaranteeLetter: CredentialRenderItem;
  syncReceipt: CredentialRenderItem;
  manifest: CredentialRenderItem;
  appointment: CredentialRenderItem;
  travelDocument: CredentialRenderItem;
  prescriptionItems: CredentialRenderItem[];
  medicationSummaryItems: CredentialRenderItem[];
  pharmacyDispenseItems: CredentialRenderItem[];
  allergyItems: CredentialRenderItem[];
};

export type CredentialRenderModel = {
  documentType: string;
  variant: string;
  accent: string;
  kindLabel: string;
  credential: CredentialRenderItem;
  subject: CredentialRenderItem;
  patient: CredentialRenderItem;
  hospital: CredentialRenderItem;
  document: CredentialRenderItem;
  issuer: CredentialRenderItem;
  payloads: CredentialRenderPayloads;
  fields: CredentialRenderField[];
  sections: CredentialRenderSection[];
  narrative: CredentialRenderNarrative;
};

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

export function credentialRenderModelFromCard(
  card: WalletCard,
): CredentialRenderModel {
  const credential = getRecord(card.credentialData);
  const rawSubject = getObject(credential, "credentialSubject") ?? credential;
  const subject = normalizePortalRenderSubject(rawSubject, credential);
  const renderData = extractPortalRenderData(rawSubject);
  const patient = firstRecord(
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
  const documentType = normalizeDocumentType(card.cardType) ?? card.cardType;
  const payloads = credentialRenderPayloads(subject);
  const fields = fieldsForCredentialType(
    card,
    documentType,
    subject,
    patient,
    payloads,
  ).filter(isFieldWithValue);
  const sections = credentialRenderSections(
    card,
    documentType,
    subject,
    patient,
    fields,
  );

  return {
    documentType,
    variant: credentialDocumentVariant(documentType),
    accent: credentialDocumentAccent(documentType),
    kindLabel: credentialDocumentKindLabel(documentType),
    credential,
    subject,
    patient,
    hospital,
    document,
    issuer,
    payloads,
    fields,
    sections,
    narrative: credentialDocumentNarrative(
      card,
      documentType,
      subject,
      patient,
    ),
  };
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
    field("วันที่ออก", formatDate(card.issuedAt), "document.issuedAt", false),
    field("หมดอายุ", formatDate(card.expiresAt), "document.expiresAt", false),
    field("สถานะ", card.credentialStatus, "document.status", false),
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

export function credentialDocumentVariant(cardType: string): string {
  if (cardType.includes("identity")) return "identity";
  if (["lab_result", "diagnostic_report"].includes(cardType))
    return "diagnostic";
  if (
    ["prescription", "medication_summary", "pharmacy_dispense"].includes(
      cardType,
    )
  )
    return "medication";
  if (
    [
      "claim_package",
      "claim_receipt",
      "quotation",
      "guarantee_letter",
      "insurance_eligibility",
    ].includes(cardType)
  )
    return "finance";
  if (cardType === "allergy_alert") return "alert";
  if (cardType === "shl_manifest") return "manifest";
  return "clinical";
}

export function credentialDocumentAccent(cardType: string): string {
  const map: Record<string, string> = {
    allergy_alert: "#b91c1c",
    lab_result: "#365dd8",
    diagnostic_report: "#365dd8",
    prescription: "#1f7a5a",
    medication_summary: "#1f7a5a",
    pharmacy_dispense: "#1f7a5a",
    insurance_eligibility: "#9a6a0a",
    claim_package: "#9a4b0a",
    claim_receipt: "#9a4b0a",
    quotation: "#9a4b0a",
    guarantee_letter: "#0f766e",
    shl_manifest: "#52525b",
    appointment: "#4f46e5",
  };
  return map[cardType] ?? "#405a9b";
}

export function credentialDocumentKindLabel(cardType: string): string {
  const map: Record<string, string> = {
    patient_summary: "Clinical summary",
    allergy_alert: "Safety alert",
    immunization: "Immunization record",
    medical_certificate: "Medical certificate",
    medication_summary: "Medication profile",
    prescription: "Prescription order",
    pharmacy_dispense: "Pharmacy dispense",
    lab_result: "Laboratory report",
    diagnostic_report: "Diagnostic report",
    referral_vc: "Referral letter",
    discharge_summary: "Discharge summary",
    insurance_eligibility: "Coverage eligibility",
    claim_package: "Claim package",
    claim_receipt: "Payment receipt",
    travel_document_verification: "Travel document verification",
    visa_support_letter: "Visa support letter",
    quotation: "Treatment quotation",
    guarantee_letter: "Guarantee letter",
    shl_manifest: "SHL manifest",
    sync_receipt: "Sync receipt",
    appointment: "Appointment slip",
  };
  return map[cardType] ?? "Clinical document";
}

export function displayCredentialValue(value: unknown): string {
  return formatValue(value);
}

export function credentialFieldHasValue(
  fieldValue: CredentialRenderField,
): boolean {
  return isFieldWithValue(fieldValue);
}

function fieldsForCredentialType(
  card: WalletCard,
  documentType: string,
  subject: CredentialRenderItem,
  patient: CredentialRenderItem,
  payloads: CredentialRenderPayloads,
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
    claim_receipt: businessPayloadFields(receipt, claimReceiptRenderConfig),
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

function labReportPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const report = mergeDocumentPayload(subject, [
    "labReport",
    "laboratoryReport",
  ]);
  return {
    ...report,
    reportNo: firstText(
      getText(report, "reportNo"),
      getText(report, "documentNo"),
    ),
    laboratory: firstText(
      getText(report, "laboratory"),
      displayName(getObject(report, "performedBy")),
      displayName(getObject(report, "organization")),
    ),
    specimenCollectedAt: firstText(
      getText(report, "specimenCollectedAt"),
      getText(getObject(report, "specimen"), "collectedAt"),
      getText(report, "reportedAt"),
    ),
    reportedAt: firstText(
      getText(report, "reportedAt"),
      getText(report, "issuedAt"),
    ),
    observations: firstNonEmptyItems(
      getNested(report, ["observations"]),
      getNested(subject, ["observations"]),
      getNested(getObject(report, "fhir"), ["observations"]),
      getNested(getObject(subject, "fhir"), ["observations"]),
    ).map((item) => ({
      ...item,
      display: firstText(
        getText(item, "display"),
        getText(item, "nameTh"),
        getText(item, "name"),
        getText(item, "loincCode"),
      ),
      value: firstText(getText(item, "value"), getText(item, "interpretation")),
      unit: firstText(getText(item, "unit"), getText(item, "referenceRange")),
      flag: firstText(getText(item, "flag"), getText(item, "interpretation")),
    })),
  };
}

function diagnosticReportPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const report = mergeDocumentPayload(subject, ["diagnosticReport"]);
  return {
    ...report,
    reportNo: firstText(
      getText(report, "reportNo"),
      getText(report, "documentNo"),
    ),
    category: firstText(
      getText(report, "category"),
      getText(report, "reportType"),
      getText(report, "documentType"),
    ),
    effectiveDateTime: firstText(
      getText(report, "effectiveDateTime"),
      getText(report, "reportedAt"),
      getText(report, "issuedAt"),
    ),
    observations: firstNonEmptyItems(
      getNested(report, ["observations"]),
      getNested(getObject(report, "fhir"), ["observations"]),
    ),
  };
}

function prescriptionItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["prescription", "items"]),
    getNested(subject, ["prescription", "medications"]),
    getNested(subject, ["prescribedMedications"]),
    getNested(subject, ["medicationsPrescribed"]),
    getNested(subject, ["items"]),
    getNested(subject, ["medications"]),
    getNested(getObject(subject, "fhir"), ["medicationRequests"]),
  ).map(normalizeMedicationItem);
}

function medicationSummaryItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["medicationSummary", "medications"]),
    getNested(subject, ["medicationSummary", "items"]),
    getNested(subject, ["currentMedications"]),
    getNested(subject, ["medications"]),
    getNested(subject, ["items"]),
    getNested(getObject(subject, "fhir"), ["medicationRequests"]),
  ).map(normalizeMedicationItem);
}

function pharmacyDispenseItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["pharmacyDispense", "items"]),
    getNested(subject, ["dispensingRecord", "items"]),
    getNested(subject, ["medicationDispense", "items"]),
    getNested(subject, ["dispensedItems"]),
    getNested(subject, ["items"]),
  ).map(normalizeMedicationItem);
}

function allergyItems(subject: CredentialRenderItem): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["allergyAlert", "items"]),
    getNested(subject, ["allergyAlert", "allergies"]),
    getNested(subject, ["allergyInformation", "items"]),
    getNested(subject, ["allergyInformation", "allergies"]),
    getNested(subject, ["allergyIntolerances"]),
    getNested(subject, ["allergies"]),
    getNested(getObject(subject, "critical"), ["allergies"]),
  ).map((item) => ({
    ...item,
    substance: firstText(
      getText(item, "substance"),
      getText(item, "agent"),
      getText(item, "display"),
      getText(item, "label"),
    ),
    reaction: firstText(
      getText(item, "reactionTh"),
      getText(item, "reaction"),
      getText(item, "manifestation"),
    ),
    severity: firstText(
      getText(item, "severity"),
      getText(item, "criticality"),
    ),
  }));
}

function medicalCertificatePayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const certificate = mergeDocumentPayload(subject, [
    "medicalCertificate",
    "certificate",
    "certification",
  ]);
  const fit =
    getNested(certificate, ["fitnessForWork", "fit"]) ??
    getNested(certificate, ["fitnessForWork"]) ??
    getNested(certificate, ["fitForWork"]);
  return {
    ...certificate,
    certificateNo: firstText(
      getText(certificate, "certificateNo"),
      getText(certificate, "documentNo"),
    ),
    type: firstText(
      getText(certificate, "type"),
      getText(certificate, "certificateType"),
      getText(certificate, "issuedFor"),
      getText(certificate, "documentType"),
    ),
    result: firstText(
      getText(certificate, "result"),
      getText(certificate, "diagnosisText"),
      fit === true
        ? "แพทย์ผู้ตรวจรับรองว่าผู้ป่วยสามารถรับบริการหรือปฏิบัติงานได้ตามแพทย์เห็นสมควร"
        : undefined,
    ),
    examinationDate: firstText(
      getText(certificate, "examinationDate"),
      getText(certificate, "issuedAt"),
    ),
    restrictions: firstText(
      getText(certificate, "restrictions"),
      getText(certificate, "recommendations"),
    ),
    fitnessForWork:
      getObject(certificate, "fitnessForWork") ??
      (fit !== undefined ? { fit } : undefined),
    practitioner:
      getObject(certificate, "practitioner") ??
      getObject(certificate, "certifyingPractitioner"),
  };
}

function clinicalSummaryPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const summary = mergeDocumentPayload(subject, [
    "patientSummary",
    "clinicalSummary",
    "summary",
    "clinical",
    "ips",
    "portablePatientSummary",
  ]);
  const critical = getObject(subject, "critical") ?? {};
  return {
    ...summary,
    conditions: firstNonEmptyItems(
      getNested(summary, ["conditions"]),
      getNested(critical, ["conditions"]),
    ).map((item) => ({
      ...item,
      display: firstText(
        getText(item, "display"),
        getText(item, "name"),
        getText(item, "label"),
      ),
    })),
    medications: firstNonEmptyItems(
      getNested(summary, ["medications"]),
      getNested(critical, ["medications"]),
      getNested(subject, ["medications"]),
    ).map((item) => ({
      ...item,
      name: firstText(
        getText(item, "nameTh"),
        getText(item, "name"),
        getText(item, "display"),
        getText(item, "label"),
      ),
      dose: firstText(getText(item, "dose"), getText(item, "frequency")),
    })),
    allergies: firstNonEmptyItems(
      getNested(summary, ["allergies"]),
      getNested(critical, ["allergies"]),
    ).map((item) => ({
      ...item,
      substance: firstText(
        getText(item, "substance"),
        getText(item, "display"),
        getText(item, "label"),
      ),
      severity: getText(item, "severity"),
    })),
    vitalSigns: firstNonEmptyItems(
      getNested(summary, ["vitalSigns"]),
      getNested(subject, ["vitalSigns"]),
    ),
    carePlan: firstText(
      getText(summary, "carePlan"),
      getText(subject, "carePlan"),
    ),
  };
}

function consentPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const consent = mergeDocumentPayload(subject, [
    "consentReceipt",
    "consent",
    "consentDetails",
  ]);
  return {
    ...consent,
    recipient: firstText(
      getText(consent, "recipient"),
      getText(consent, "grantedToOrganizationId"),
      getText(consent, "requesterId"),
    ),
    scope: getNested(consent, ["scope"]) ?? getNested(consent, ["scopes"]),
  };
}

function mpiPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const mpi = mergeDocumentPayload(subject, [
    "mpiLinkCertificate",
    "mpiLink",
    "mpi",
    "linkCertificate",
  ]);
  return {
    ...mpi,
    confidence: firstText(
      getText(mpi, "confidence"),
      getText(mpi, "linkConfidence"),
    ),
    matchingPolicy: firstText(
      getText(mpi, "matchingPolicy"),
      getText(mpi, "matchAlgorithm"),
      getText(mpi, "linkType"),
    ),
    reviewedBy: firstText(getText(mpi, "reviewedBy"), getText(mpi, "linkedBy")),
    linkedIdentifiers: firstNonEmptyItems(
      getNested(mpi, ["linkedIdentifiers"]),
    ).map((item) => ({
      organization: firstText(
        getText(item, "organization"),
        getText(item, "system"),
      ),
      hn: firstText(getText(item, "hn"), getText(item, "value")),
      linkStatus: firstText(
        getText(item, "linkStatus"),
        getText(mpi, "linkStatus"),
        getText(item, "isPrimary") === "true" ? "primary" : undefined,
      ),
    })),
  };
}

function referralPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const referral = mergeDocumentPayload(subject, [
    "referral",
    "referralLetter",
    "patientReferral",
    "serviceRequest",
  ]);
  return {
    ...referral,
    referralNo: firstText(
      getText(referral, "referralNo"),
      getText(referral, "documentNo"),
    ),
    fromHospital: firstText(
      getText(referral, "fromHospital"),
      getText(referral, "from"),
      displayName(getObject(referral, "organization")),
      getText(referral, "referringDepartment"),
    ),
    toHospital: firstText(
      getText(referral, "toHospital"),
      getText(referral, "to"),
      getText(referral, "receivingFacility"),
      getText(referral, "receivingDepartment"),
    ),
    requestedService: firstText(
      getText(referral, "requestedService"),
      formatValue(getNested(referral, ["requestedServices"])),
      getText(referral, "receivingDepartment"),
    ),
    reason: firstText(
      getText(referral, "reason"),
      getText(referral, "reasonForReferralTh"),
      getText(referral, "reasonForReferral"),
    ),
    clinicalNotes: firstText(
      getText(referral, "clinicalNotes"),
      getText(getObject(referral, "clinicalSummary"), "primaryConcern"),
      getText(referral, "reasonForReferralTh"),
    ),
    authoredOn: firstText(
      getText(referral, "authoredOn"),
      getText(referral, "referralDate"),
      getText(referral, "issuedAt"),
    ),
  };
}

function dischargeSummaryPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  return mergeDocumentPayload(subject, ["dischargeSummary"]);
}

function coveragePayload(subject: CredentialRenderItem): CredentialRenderItem {
  const coverage = mergeDocumentPayload(subject, [
    "insuranceEligibility",
    "coverageEligibility",
    "eligibility",
    "coverage",
    "benefits",
  ]);
  const rootPayer = getObject(subject, "payer");
  const payer = getObject(coverage, "payer") ?? rootPayer;
  const benefits = getObject(coverage, "benefits") ?? {};
  const benefitSummary = firstNonEmptyItems(
    getNested(coverage, ["benefitSummary"]),
  );
  return {
    ...coverage,
    payer: payer ?? getText(coverage, "payer"),
    status: firstText(
      getText(coverage, "status"),
      getText(rootPayer, "status"),
      getText(payer, "status"),
      getText(coverage, "eligibilityStatus"),
    ),
    planName: firstText(
      getText(coverage, "planName"),
      getText(coverage, "plan"),
      getText(payer, "planName"),
    ),
    memberId: firstText(
      getText(coverage, "memberId"),
      getText(coverage, "policyNo"),
      getText(payer, "policyNo"),
    ),
    network: firstText(
      getText(coverage, "network"),
      getText(coverage, "networkName"),
    ),
    benefitSummary: benefitSummary.length
      ? benefitSummary
      : benefitItems(benefits, coverage),
    coveragePeriod: getObject(coverage, "coveragePeriod") ?? {
      start: getText(coverage, "validFrom"),
      end: getText(coverage, "validUntil"),
    },
    lastCheckedAt: firstText(
      getText(coverage, "lastCheckedAt"),
      getText(coverage, "checkedAt"),
    ),
    copay: firstText(getText(coverage, "copay"), getText(benefits, "copay")),
    preAuthorizationRequired:
      getNested(coverage, ["preAuthorizationRequired"]) ??
      getNested(benefits, ["preAuthorizationRequired"]),
    directBilling:
      getNested(coverage, ["directBilling"]) ??
      getNested(benefits, ["directBilling"]),
  };
}

function claimPackagePayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const claimPackage = mergeDocumentPayload(subject, [
    "claimPackage",
    "claim",
    "claimBundle",
    "claimRequest",
  ]);
  return {
    ...claimPackage,
    items: firstNonEmptyItems(
      getNested(claimPackage, ["items"]),
      getNested(claimPackage, ["serviceItems"]),
      getNested(claimPackage, ["serviceLines"]),
      getNested(claimPackage, ["lineItems"]),
      getNested(claimPackage, ["attachedEvidence"]),
    ),
    totalAmount:
      getNested(claimPackage, ["totalAmount"]) ??
      getNested(claimPackage, ["estimatedTotal"]),
    claimId: firstText(
      getText(claimPackage, "claimId"),
      getText(claimPackage, "claimNo"),
      getText(claimPackage, "claimRef"),
    ),
  };
}

function claimReceiptPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const receipt = mergeDocumentPayload(subject, [
    "claimReceipt",
    "receipt",
    "invoice",
    "claim",
  ]);
  return {
    ...receipt,
    claimId: firstText(
      getText(receipt, "claimId"),
      getText(receipt, "claimRef"),
      getText(receipt, "claimNo"),
    ),
    payerRef: firstText(
      getText(receipt, "payerRef"),
      getText(receipt, "payerReference"),
      getText(receipt, "payerId"),
    ),
    receiptNo: firstText(
      getText(receipt, "receiptNo"),
      getText(receipt, "documentNo"),
    ),
    invoiceNo: firstText(
      getText(receipt, "invoiceNo"),
      getText(receipt, "invoiceRef"),
    ),
    adjudicationOutcome: firstText(
      getText(receipt, "adjudicationOutcome"),
      getText(receipt, "claimStatus"),
      getText(receipt, "status"),
    ),
    items: firstNonEmptyItems(
      getNested(receipt, ["items"]),
      getNested(receipt, ["lineItems"]),
      getNested(receipt, ["breakdown"]),
      getNested(receipt, ["serviceItems"]),
    ),
    approvedAmount:
      getNested(receipt, ["approvedAmount"]) ??
      getNested(receipt, ["netAmount"]),
    totalAmount:
      getNested(receipt, ["totalAmount"]) ??
      getNested(receipt, ["totalClaimed"]),
  };
}

function quotationPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const quotation = mergeDocumentPayload(subject, [
    "treatmentQuotation",
    "quotation",
    "estimate",
    "costEstimate",
  ]);
  return {
    ...quotation,
    quotationNo: firstText(
      getText(quotation, "quotationNo"),
      getText(quotation, "documentNo"),
    ),
    items: firstNonEmptyItems(
      getNested(quotation, ["items"]),
      getNested(quotation, ["lineItems"]),
      getNested(quotation, ["costItems"]),
      getNested(getObject(quotation, "packageDetails"), ["lineItems"]),
    ),
    estimatedTotal:
      getNested(quotation, ["estimatedTotal"]) ??
      getNested(quotation, ["totalAmount"]),
    packageName: firstText(
      getText(quotation, "packageNameTh"),
      getText(quotation, "packageName"),
      getText(quotation, "packageNameEn"),
    ),
  };
}

function visaSupportLetterPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const letter = mergeDocumentPayload(subject, ["visaSupportLetter"]);
  return {
    ...letter,
    letterNo: firstText(
      getText(letter, "letterNo"),
      getText(letter, "documentNo"),
    ),
    proposedVisitPeriod:
      getObject(letter, "proposedVisitPeriod") ??
      getObject(letter, "visitPeriod"),
  };
}

function guaranteeLetterPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const letter = mergeDocumentPayload(subject, ["guaranteeLetter"]);
  return {
    ...letter,
    guaranteeNo: firstText(
      getText(letter, "guaranteeNo"),
      getText(letter, "guaranteeRef"),
      getText(letter, "documentNo"),
    ),
    payer: getObject(letter, "payer") ?? getText(letter, "issuedByPayer"),
    preAuthNo: firstText(
      getText(letter, "preAuthNo"),
      getText(letter, "preAuthorizationNo"),
    ),
    guaranteeLimit: getObject(letter, "guaranteeLimit") ?? {
      amount: getText(letter, "approvedLimit"),
      currency: getText(letter, "currency"),
    },
  };
}

function syncReceiptPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const receipt = mergeDocumentPayload(subject, ["syncReceipt"]);
  return {
    ...receipt,
    syncId: firstText(
      getText(receipt, "syncId"),
      getText(receipt, "documentNo"),
      getText(receipt, "idempotencyKey"),
    ),
    sourceSystem: firstText(
      getText(receipt, "sourceSystem"),
      getText(receipt, "targetId"),
    ),
    completedAt: firstText(
      getText(receipt, "completedAt"),
      getText(receipt, "executedAt"),
      getText(getObject(receipt, "execution"), "completedAt"),
    ),
  };
}

function manifestPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const manifest = mergeDocumentPayload(subject, ["shlManifest", "manifest"]);
  const files = firstNonEmptyItems(
    getNested(manifest, ["files"]),
    getNested(manifest, ["documents"]),
  );
  return {
    ...manifest,
    shlId: firstText(
      getText(manifest, "shlId"),
      getText(manifest, "smartHealthLinkId"),
      getText(manifest, "bundleId"),
    ),
    expiresAt: firstText(
      getText(manifest, "expiresAt"),
      getText(getObject(manifest, "accessControl"), "expiresAt"),
    ),
    files: files.map((file) => ({
      fileId: firstText(
        getText(file, "fileId"),
        getText(file, "id"),
        getText(file, "documentNo"),
        getText(file, "title"),
      ),
      contentType: firstText(
        getText(file, "contentType"),
        getText(file, "type"),
        getText(file, "documentType"),
      ),
      documentTypes:
        getNested(file, ["documentTypes"]) ??
        getText(file, "documentType") ??
        getText(file, "title"),
    })),
  };
}

function appointmentPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const appointment = mergeDocumentPayload(subject, ["appointment"]);
  return {
    ...appointment,
    serviceType: firstText(
      getText(appointment, "serviceType"),
      getText(appointment, "appointmentType"),
      getText(appointment, "reasonForVisit"),
    ),
    start: firstText(
      getText(appointment, "start"),
      joinDateTime(
        getText(appointment, "scheduledDate"),
        getText(appointment, "scheduledTime"),
      ),
    ),
    checkinInstruction: firstText(
      getText(appointment, "checkinInstruction"),
      getText(appointment, "preparationInstructions"),
      getText(appointment, "preparationInstructionsEn"),
    ),
  };
}

function travelDocumentPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const travel = mergeDocumentPayload(subject, ["travelDocument", "travel"]);
  return {
    ...travel,
    passportNumber: firstText(
      getText(travel, "passportNumber"),
      getText(travel, "passportNoMasked"),
      getText(travel, "passport"),
    ),
    verificationStatus: firstText(
      getText(travel, "verificationStatus"),
      getText(travel, "status"),
    ),
  };
}

function normalizeMedicationItem(
  item: CredentialRenderItem,
): CredentialRenderItem {
  return {
    ...item,
    medicationName: firstText(
      getText(item, "medicationName"),
      getText(item, "nameTh"),
      getText(item, "name"),
      getText(item, "display"),
    ),
    dosageInstruction: firstText(
      getText(item, "dosageInstruction"),
      getText(item, "instructions"),
      getText(item, "dose"),
      getText(item, "frequency"),
    ),
    quantity: firstText(
      getText(item, "quantity"),
      getText(item, "dispenseQuantity"),
      getText(item, "daysSupply"),
    ),
  };
}

function mergeDocumentPayload(
  source: CredentialRenderItem,
  keys: string[],
): CredentialRenderItem {
  return mergePortalRenderPayload(source, keys);
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

function firstRecord(
  ...values: Array<Record<string, unknown> | undefined>
): CredentialRenderItem {
  return values.find((value) => value && Object.keys(value).length) ?? {};
}

function getRecord(source: unknown): CredentialRenderItem {
  return source && typeof source === "object" && !Array.isArray(source)
    ? (source as CredentialRenderItem)
    : {};
}

function getObject(
  source: unknown,
  key: string,
): CredentialRenderItem | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source))
    return undefined;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CredentialRenderItem)
    : undefined;
}

function getText(source: unknown, key?: string): string | undefined {
  const value = key ? getNested(source, [key]) : source;
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}

function getNested(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = getText(value);
    if (text && text !== "-") return text;
  }
  return undefined;
}

function displayName(value: unknown): string | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return firstText(
    getText(value, "nameTh"),
    getText(value, "nameEn"),
    getText(value, "name"),
    getText(value, "display"),
    getText(value, "text"),
    getText(value, "reference"),
    getText(value, "value"),
    getText(value, "organization"),
    getText(value, "hospitalNameTh"),
  );
}

function firstNonEmptyItems(...values: unknown[]): CredentialRenderItem[] {
  for (const value of values) {
    const items = itemsFromUnknown(value);
    if (items.length > 0) return items;
  }
  return [];
}

function itemsFromUnknown(value: unknown): CredentialRenderItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return item as CredentialRenderItem;
    const formatted = formatValue(item);
    return {
      label: formatted,
      display: formatted,
      name: formatted,
      substance: formatted,
    };
  });
}

function benefitItems(
  benefits: CredentialRenderItem,
  coverage: CredentialRenderItem,
): CredentialRenderItem[] {
  const currency =
    getText(benefits, "annualLimitCurrency") ??
    getText(coverage, "currency") ??
    "THB";
  const items: CredentialRenderItem[] = [
    {
      benefit: "Annual coverage limit",
      limit: formatMoney(getNested(benefits, ["annualLimit"]), currency),
      remaining: formatMoney(getNested(benefits, ["remainingLimit"]), currency),
    },
    {
      benefit: "OPD",
      limit: formatValue(getNested(benefits, ["opd"])),
      remaining: "-",
    },
    {
      benefit: "IPD",
      limit: formatValue(getNested(benefits, ["ipd"])),
      remaining: "-",
    },
    {
      benefit: "Direct Billing",
      limit:
        getNested(benefits, ["directBilling"]) === true
          ? "supported"
          : "not supported",
      remaining: "-",
    },
    { benefit: "Copay", limit: getText(coverage, "copay"), remaining: "-" },
    {
      benefit: "Pre-authorization",
      limit:
        getNested(coverage, ["preAuthorizationRequired"]) === true
          ? "required"
          : "not required",
      remaining: "-",
    },
  ];
  return items.filter((item) => hasValue(item.limit) && item.limit !== "-");
}

function isFieldWithValue(value: CredentialRenderField): boolean {
  if (Array.isArray(value.value)) return value.value.length > 0;
  if (
    value.value &&
    typeof value.value === "object" &&
    !Array.isArray(value.value) &&
    Object.keys(value.value as Record<string, unknown>).length === 0
  )
    return false;
  return (
    value.value !== undefined &&
    value.value !== null &&
    value.value !== "" &&
    value.value !== "-"
  );
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function getStringArray(source: unknown, key: string): string[] {
  const value = getNested(source, [key]);
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map(String)
    : [];
}

function booleanLabel(
  value: unknown,
  labels: { yes: string; no: string },
): string | undefined {
  if (value === true) return labels.yes;
  if (value === false) return labels.no;
  return getText(value);
}

function joinDateTime(date?: string, time?: string): string | undefined {
  if (!date && !time) return undefined;
  return [date, time].filter(Boolean).join(" ");
}

function formatDate(value: unknown): string {
  if (!hasValue(value)) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("th-TH");
}

function formatDateTime(value: unknown): string {
  if (!hasValue(value)) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("th-TH");
}

function formatMoney(amount: unknown, currency: unknown): string {
  const numeric = Number(amount);
  if (Number.isFinite(numeric))
    return `${numeric.toLocaleString("th-TH")} ${String(currency ?? "THB")}`;
  return formatValue(amount);
}

function formatPeriod(period?: CredentialRenderItem): string {
  if (!period) return "-";
  const start = formatDate(getText(period, "start"));
  const end = formatDate(getText(period, "end"));
  return [start, end].filter((value) => value !== "-").join(" - ") || "-";
}

function formatValue(value: unknown): string {
  if (!hasValue(value)) return "-";
  if (Array.isArray(value))
    return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => hasValue(entry))
      .map(([key, entry]) => `${key}: ${formatValue(entry)}`)
      .join(" · ");
  }
  return String(value);
}

export function isCredentialDisclosurePath(path: string): boolean {
  const parts = path
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  return !parts.some((part) => TECHNICAL_FIELD_NAMES.has(part));
}

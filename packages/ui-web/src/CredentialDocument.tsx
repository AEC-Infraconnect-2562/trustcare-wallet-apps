import {
  AlertTriangle,
  BadgeCheck,
  Calendar,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  FlaskConical,
  HeartPulse,
  Hospital,
  IdCard,
  Link2,
  Pill,
  Plane,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
  Syringe,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type {
  CredentialRenderField,
  CredentialRenderModel,
  PhotoCandidate,
  WalletCard,
} from "@trustcare/wallet-core";
import {
  credentialRenderModelFromCard,
  credentialStatusLabel,
  credentialStatusTone,
  initialsFromName,
  photoCandidatesForCard,
} from "@trustcare/wallet-core";
import { Badge } from "./primitives";

type Field = CredentialRenderField & {
  label: string;
  value: unknown;
  tone?: "normal" | "critical";
};

type ListItem = Record<string, unknown>;

const photoDocumentTypes = new Set([
  "patient_identity",
  "staff_identity",
  "travel_document_verification",
]);

export function CredentialDocument({
  card,
  qrDataUrl,
  compact = false,
}: {
  card: WalletCard;
  qrDataUrl?: string;
  compact?: boolean;
}) {
  const renderModel = credentialRenderModelFromCard(card);
  const { subject, patient, hospital, document, issuer } = renderModel;
  const issuerNameTh =
    getText(hospital, "nameTh") ??
    getText(issuer, "nameTh") ??
    card.issuerHospitalName ??
    "TrustCare Network";
  const issuerNameEn =
    getText(hospital, "nameEn") ??
    getText(issuer, "nameEn") ??
    getText(issuer, "name") ??
    "TRUSTCARE NETWORK";
  const displayNameTh =
    getText(patient, "fullNameTh") ??
    getText(patient, "nameTh") ??
    getText(patient, "name") ??
    "ผู้ใช้ TrustCare";
  const displayNameEn =
    getText(patient, "fullNameEn") ??
    getText(patient, "nameEn") ??
    getText(patient, "name") ??
    displayNameTh;
  const patientId = documentIdentifier(card, subject, patient, document);
  const photoCandidates = photoDocumentTypes.has(card.cardType)
    ? photoCandidatesForCard(card)
    : [];
  const accent = renderModel.accent;
  const isIdentityDocument = photoDocumentTypes.has(card.cardType);
  const narrative = renderModel.narrative;

  if (!isIdentityDocument) {
    return (
      <article
        className={`${compact ? "credential-doc credential-doc-compact" : "credential-doc"} hospital-document document-${renderModel.variant}`}
        style={{ "--doc-accent": accent } as CSSProperties}
      >
        <div className="hospital-document-header">
          <div className="hospital-document-brand">
            <div className="credential-logo">{logoText(issuerNameEn)}</div>
            <span>
              <h3>{issuerNameTh}</h3>
              <p>{issuerNameEn}</p>
            </span>
          </div>
          <div className="hospital-document-title">
            <small>{renderModel.kindLabel}</small>
            <strong>{card.displayName}</strong>
            <span>{card.displayNameEn ?? card.cardType}</span>
          </div>
          <Badge tone={credentialStatusTone(card.credentialStatus)}>
            {credentialStatusLabel(card.credentialStatus)}
          </Badge>
        </div>

        <div className="hospital-document-meta">
          <div className="hospital-patient-strip">
            <span>ผู้ป่วย</span>
            <strong>{displayNameTh}</strong>
            <small>{displayNameEn}</small>
          </div>
          <InfoField label="เลขผู้ป่วย / เอกสาร" value={patientId} />
          <InfoField label="วันที่ออก" value={formatDate(card.issuedAt)} />
          <InfoField label="หมดอายุ" value={formatDate(card.expiresAt)} />
        </div>

        <DocumentNarrativePanel narrative={narrative} />

        {renderDocumentBody(card, renderModel)}

        <DocumentSignoff card={card} model={renderModel} />

        <div className="hospital-document-evidence">
          <div>
            <span>Credential ID</span>
            <strong className="mono">{String(card.credentialId)}</strong>
          </div>
          <div>
            <span>FHIR Evidence</span>
            <strong>DocumentReference</strong>
          </div>
          <div className="credential-qr">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="VP QR" />
            ) : (
              <QrCode size={48} />
            )}
          </div>
        </div>
        <div className="hospital-watermark">DEMO ONLY</div>
        <footer>VC: {String(card.credentialId)}</footer>
      </article>
    );
  }

  return (
    <article
      className={`${compact ? "credential-doc credential-doc-compact" : "credential-doc"} medical-document document-${renderModel.variant}`}
      style={{ "--doc-accent": accent } as CSSProperties}
    >
      <div className="credential-header document-header">
        <div className="credential-logo">{logoText(issuerNameEn)}</div>
        <div className="document-header-copy">
          <h3>{issuerNameTh}</h3>
          <p>{issuerNameEn}</p>
          <strong>
            {card.displayName} / {card.displayNameEn ?? card.cardType}
          </strong>
        </div>
        <Badge tone={credentialStatusTone(card.credentialStatus)}>
          {credentialStatusLabel(card.credentialStatus)}
        </Badge>
      </div>

      <div className="credential-band document-meta-band">
        <div>
          <Hospital size={20} />
          <span>แหล่งที่มา</span>
          <strong>{issuerNameTh}</strong>
        </div>
        <div>
          {iconForDocument(card.cardType)}
          <span>ประเภทเอกสาร</span>
          <strong>{card.displayNameEn ?? card.displayName}</strong>
        </div>
      </div>

      <div
        className={
          photoCandidates.length
            ? "document-person-row with-photo"
            : "document-person-row"
        }
      >
        {photoCandidates.length ? (
          <CredentialHolderPhoto
            candidates={photoCandidates}
            alt={displayNameEn}
            initials={initialsFromName(displayNameTh)}
          />
        ) : (
          <div className="document-type-mark" aria-hidden="true">
            {iconForDocument(card.cardType)}
          </div>
        )}
        <div className="credential-person">
          <span className="muted-row">
            <UserRound size={16} /> ผู้ถือเอกสาร
          </span>
          <h4>{displayNameTh}</h4>
          <p>{displayNameEn}</p>
          <div className="document-mini-grid">
            <span>
              <small>รหัสผู้ป่วย</small>
              <strong>{patientId}</strong>
            </span>
            <span>
              <small>ออกเมื่อ</small>
              <strong>{formatDate(card.issuedAt)}</strong>
            </span>
            <span>
              <small>หมดอายุ</small>
              <strong>{formatDate(card.expiresAt)}</strong>
            </span>
          </div>
        </div>
        <div className="watermark">DEMO ONLY</div>
      </div>

      {renderDocumentBody(card, renderModel)}

      <div className="credential-status-row document-status-row">
        <div>
          <span>สถานะ / STATUS</span>
          <Badge tone={credentialStatusTone(card.credentialStatus)}>
            <ShieldCheck size={14} />{" "}
            {credentialStatusLabel(card.credentialStatus)}
          </Badge>
        </div>
        <div>
          <span>Credential ID</span>
          <strong className="mono">{String(card.credentialId)}</strong>
        </div>
        <div className="credential-qr">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="VP QR" />
          ) : (
            <QrCode size={48} />
          )}
        </div>
      </div>
      <footer>VC: {String(card.credentialId)}</footer>
    </article>
  );
}

function CredentialHolderPhoto({
  candidates,
  alt,
  initials,
}: {
  candidates: PhotoCandidate[];
  alt: string;
  initials: string;
}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidate = candidates[candidateIndex];

  if (!candidate) {
    return (
      <div
        className="credential-photo credential-photo-fallback"
        aria-label="รูปผู้ถือเอกสาร"
      >
        {initials || "TC"}
      </div>
    );
  }

  return (
    <div className="credential-photo" aria-label="รูปผู้ถือเอกสาร">
      <img
        key={candidate.url}
        src={candidate.url}
        alt={alt}
        onError={() => setCandidateIndex((index) => index + 1)}
      />
    </div>
  );
}

function renderDocumentBody(
  card: WalletCard,
  model: CredentialRenderModel,
): ReactElement {
  const { subject, payloads, fields } = model;
  switch (model.documentType) {
    case "lab_result":
      return <LabResultSection report={payloads.labReport} />;
    case "diagnostic_report":
      return <DiagnosticReportSection report={payloads.diagnosticReport} />;
    case "prescription":
      return (
        <MedicationSection
          title="รายการยาในใบสั่งยา"
          items={payloads.prescriptionItems}
        />
      );
    case "medication_summary":
      return (
        <MedicationSection
          title="รายการยาปัจจุบัน"
          items={payloads.medicationSummaryItems}
        />
      );
    case "pharmacy_dispense":
      return (
        <MedicationSection
          title="รายการจ่ายยา"
          items={payloads.pharmacyDispenseItems}
        />
      );
    case "allergy_alert":
      return (
        <AllergySection
          items={payloads.allergyItems}
          instruction={firstText(
            getText(subject, "emergencyInstruction"),
            getText(subject, "clinicalNote"),
          )}
        />
      );
    case "immunization":
      return (
        <ImmunizationSection
          items={firstNonEmptyArray(
            getArray(subject, "immunizations"),
            getArray(getObject(subject, "fhir"), "immunizations"),
          )}
          registryStatus={getText(subject, "registryStatus")}
        />
      );
    case "medical_certificate":
      return <MedicalCertificateSection certificate={payloads.certificate} />;
    case "patient_summary":
      return <ClinicalSummarySection summary={payloads.clinicalSummary} />;
    case "consent_receipt":
      return <ConsentReceiptSection consent={payloads.consent} />;
    case "mpi_link_certificate":
      return <MpiLinkSection mpi={payloads.mpi} />;
    case "referral_vc":
      return <ReferralSection referral={payloads.referral} />;
    case "discharge_summary":
      return <DischargeSummarySection summary={payloads.dischargeSummary} />;
    case "insurance_eligibility":
      return <CoverageEligibilitySection coverage={payloads.coverage} />;
    case "claim_package": {
      const claimPackage = payloads.claimPackage;
      return (
        <>
          <FieldGridSection fields={fields} />
          <FinancialSection
            title="รายการค่าใช้จ่ายสำหรับเคลม"
            items={firstNonEmptyArray(
              getArray(claimPackage, "items"),
              getArray(claimPackage, "serviceLines"),
              getArray(claimPackage, "serviceItems"),
              getArray(claimPackage, "lineItems"),
            )}
            total={
              getNested(claimPackage, ["totalAmount"]) ??
              getNested(claimPackage, ["estimatedTotal"])
            }
            currency={getNested(claimPackage, ["currency"])}
          />
        </>
      );
    }
    case "claim_receipt": {
      const receipt = payloads.claimReceipt;
      return (
        <>
          <FieldGridSection fields={fields} />
          <FinancialSection
            title="รายการค่าใช้จ่าย / ใบเสร็จ"
            items={firstNonEmptyArray(
              getArray(receipt, "items"),
              getArray(receipt, "breakdown"),
              getArray(receipt, "lineItems"),
            )}
            total={
              getNested(receipt, ["netAmount"]) ??
              getNested(receipt, ["approvedAmount"]) ??
              getNested(receipt, ["totalAmount"]) ??
              getNested(receipt, ["totalClaimed"])
            }
            currency={getNested(receipt, ["currency"]) ?? "THB"}
          />
        </>
      );
    }
    case "quotation": {
      const quotation = payloads.quotation;
      return (
        <>
          <FieldGridSection fields={fields} />
          <FinancialSection
            title="ใบเสนอราคา"
            items={firstNonEmptyArray(
              getArray(quotation, "items"),
              getArray(quotation, "lineItems"),
              getArray(quotation, "costItems"),
            )}
            total={getNested(quotation, ["estimatedTotal"])}
            currency={getNested(quotation, ["currency"])}
          />
        </>
      );
    }
    case "visa_support_letter":
      return <VisaSupportLetterSection letter={payloads.visaSupportLetter} />;
    case "guarantee_letter":
      return <GuaranteeLetterSection letter={payloads.guaranteeLetter} />;
    case "shl_manifest":
      return <ManifestSection manifest={payloads.manifest} />;
    case "sync_receipt":
      return <SyncReceiptSection receipt={payloads.syncReceipt} />;
    case "appointment":
      return <AppointmentSection appointment={payloads.appointment} />;
    default:
      return <FieldGridSection fields={fields} />;
  }
}

function FieldGridSection({ fields }: { fields: Field[] }) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid">
        {fields
          .filter((field) => hasValue(field.value))
          .map((field) => (
            <div
              key={field.label}
              className={
                field.tone === "critical"
                  ? "document-field critical"
                  : "document-field"
              }
            >
              <span>{field.label}</span>
              <strong>{formatValue(field.value)}</strong>
            </div>
          ))}
      </div>
    </section>
  );
}

function DocumentNarrativePanel({
  narrative,
}: {
  narrative: {
    title: string;
    body: string;
    sections: string[];
    sourceSystem?: string;
  };
}) {
  return (
    <section className="document-narrative">
      <div>
        <h4>{narrative.title}</h4>
        <p>{narrative.body}</p>
      </div>
      {narrative.sections.length > 0 && (
        <div className="document-section-map" aria-label="Document sections">
          {narrative.sections.slice(0, 7).map((section) => (
            <span key={section}>{humanizeKey(section)}</span>
          ))}
        </div>
      )}
      {narrative.sourceSystem && (
        <small>Source system: {narrative.sourceSystem}</small>
      )}
    </section>
  );
}

function DocumentSignoff({
  card,
  model,
}: {
  card: WalletCard;
  model: CredentialRenderModel;
}) {
  const { subject } = model;
  const humanDocument = getObject(subject, "humanDocument");
  const renderData = getObject(humanDocument, "renderData") ?? humanDocument;
  const issuer =
    (Object.keys(model.issuer).length ? model.issuer : undefined) ??
    getObject(renderData, "issuer") ??
    getObject(renderData, "hospital") ??
    getObject(humanDocument, "issuer");
  const practitioner =
    getObject(model.payloads.certificate, "certifyingPractitioner") ??
    getObject(model.payloads.certificate, "practitioner") ??
    getObject(model.payloads.diagnosticReport, "reportingPractitioner") ??
    getObject(model.payloads.referral, "requestedBy") ??
    getObject(model.payloads.appointment, "practitioner") ??
    getObject(
      getObject(subject, "diagnosticReport"),
      "reportingPractitioner",
    ) ??
    getObject(getObject(subject, "referral"), "requestedBy") ??
    getObject(getObject(subject, "appointment"), "practitioner");

  return (
    <section className="document-signoff">
      <div>
        <span>ผู้ออกเอกสาร</span>
        <strong>
          {getText(issuer, "nameTh") ??
            card.issuerHospitalName ??
            "TrustCare Network"}
        </strong>
        <small>{getText(issuer, "did") ?? card.issuerDid ?? "-"}</small>
      </div>
      <div>
        <span>ผู้รับรอง/หน่วยงาน</span>
        <strong>
          {getText(practitioner, "nameTh") ??
            getText(practitioner, "name") ??
            "เจ้าหน้าที่ผู้มีสิทธิออกเอกสาร"}
        </strong>
        <small>
          {getText(practitioner, "licenseNo") ??
            getText(practitioner, "role") ??
            "ลงนามดิจิทัลโดย issuer DID"}
        </small>
      </div>
      <div>
        <span>สถานะเอกสาร</span>
        <strong>{credentialStatusLabel(card.credentialStatus)}</strong>
        <small>ตรวจสอบได้ด้วย VC/VP และ DocumentReference evidence</small>
      </div>
    </section>
  );
}

function ImmunizationSection({
  items,
  registryStatus,
}: {
  items: ListItem[];
  registryStatus?: string;
}) {
  return (
    <section className="document-field-section">
      <div className="document-table-header">
        <h4>ประวัติวัคซีน</h4>
        {registryStatus && <Badge tone="green">{registryStatus}</Badge>}
      </div>
      <div className="medical-table immunization-table">
        <div className="medical-table-head">
          <span>วัคซีน</span>
          <span>วันที่ได้รับ</span>
          <span>Lot / ผู้ให้บริการ</span>
        </div>
        {items.map((item, index) => (
          <div
            className="medical-table-row"
            key={`${getText(item, "vaccineCode") ?? index}`}
          >
            <strong>
              {getText(item, "display") ?? getText(item, "vaccineCode") ?? "-"}
            </strong>
            <span>{formatDate(getText(item, "occurrenceDate"))}</span>
            <span>
              {[getText(item, "lotNumber"), getText(item, "performer")]
                .filter(Boolean)
                .join(" / ") || "-"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MedicalCertificateSection({
  certificate,
}: {
  certificate?: Record<string, unknown>;
}) {
  const practitioner = getObject(certificate, "practitioner");
  const fit = getNested(certificate, ["fitnessForWork", "fit"]);
  return (
    <section className="document-field-section certificate-layout">
      <div className="certificate-statement">
        <h4>ใบรับรองแพทย์</h4>
        <p>
          {getText(certificate, "result") ??
            getText(certificate, "diagnosisText") ??
            "แพทย์ผู้ตรวจรับรองผลตามข้อมูลการตรวจในระบบโรงพยาบาล"}
        </p>
      </div>
      <div className="document-field-grid compact">
        <InfoField
          label="เลขที่ใบรับรอง"
          value={getText(certificate, "certificateNo")}
        />
        <InfoField label="ประเภท" value={getText(certificate, "type")} />
        <InfoField
          label="วันที่ตรวจ"
          value={formatDate(getText(certificate, "examinationDate"))}
        />
        <InfoField
          label="ใช้ได้ถึง"
          value={formatDate(getText(certificate, "validUntil"))}
        />
        <InfoField
          label="การวินิจฉัย/เหตุผล"
          value={
            getText(certificate, "diagnosis") ??
            getText(certificate, "diagnosisText")
          }
        />
        <InfoField
          label="ความสามารถทำงาน"
          value={
            fit === true
              ? "ปฏิบัติงานได้"
              : fit === false
                ? "จำกัดการปฏิบัติงาน"
                : getText(certificate, "fitnessForWork")
          }
        />
        <InfoField
          label="ข้อจำกัด/คำแนะนำ"
          value={
            getText(certificate, "restrictions") ??
            getText(certificate, "recommendations")
          }
        />
        <InfoField label="แพทย์ผู้รับรอง" value={displayName(practitioner)} />
      </div>
      <p className="document-note">
        เอกสารนี้เหมาะสำหรับแสดงต่อหน่วยบริการ นายจ้าง
        หรือหน่วยงานที่ต้องการยืนยันผลตรวจ โดยตรวจสอบแหล่งที่มาได้จาก Credential
        ID และ DocumentReference evidence
      </p>
    </section>
  );
}

function ConsentReceiptSection({
  consent,
}: {
  consent?: Record<string, unknown>;
}) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField label="Consent ID" value={getText(consent, "consentId")} />
        <InfoField label="สถานะ" value={getText(consent, "status")} />
        <InfoField label="วัตถุประสงค์" value={getText(consent, "purpose")} />
        <InfoField
          label="หมดอายุ"
          value={formatDateTime(getText(consent, "expiresAt"))}
        />
        <InfoField label="ขอบเขตข้อมูล" value={getNested(consent, ["scope"])} />
        <InfoField
          label="ผู้รับข้อมูล"
          value={
            getText(consent, "recipient") ?? getNested(consent, ["grantedTo"])
          }
        />
      </div>
      <InfoList
        title="เงื่อนไข PDPA / purpose bound"
        items={arrayToItems(getNested(consent, ["pdpaControls"]))}
        primaryKey="label"
      />
    </section>
  );
}

function MpiLinkSection({ mpi }: { mpi?: Record<string, unknown> }) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField
          label="Golden Record"
          value={getText(mpi, "goldenRecordId")}
        />
        <InfoField label="สถานะ" value={getText(mpi, "linkStatus")} />
        <InfoField label="ความเชื่อมั่น" value={getText(mpi, "confidence")} />
        <InfoField
          label="นโยบายจับคู่"
          value={getText(mpi, "matchingPolicy")}
        />
        <InfoField label="ตรวจทานโดย" value={getText(mpi, "reviewedBy")} />
        <InfoField
          label="ตรวจสอบล่าสุด"
          value={formatDateTime(getText(mpi, "linkedAt"))}
        />
      </div>
      <div className="medical-table">
        <div className="medical-table-head">
          <span>ระบบ</span>
          <span>เลขประจำตัว</span>
          <span>สถานะการเชื่อมโยง</span>
        </div>
        {getArray(mpi, "linkedIdentifiers").map((item, index) => (
          <div
            className="medical-table-row"
            key={`${getText(item, "organization") ?? index}`}
          >
            <strong>{getText(item, "organization") ?? "-"}</strong>
            <span>{getText(item, "hn") ?? "-"}</span>
            <span>{getText(item, "linkStatus") ?? "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClinicalSummarySection({
  summary,
}: {
  summary?: Record<string, unknown>;
}) {
  const conditions = getArray(summary, "conditions");
  const medications = getArray(summary, "medications");
  const allergies = getArray(summary, "allergies");
  const vitalSigns = getArray(summary, "vitalSigns");
  return (
    <section className="document-field-section clinical-layout">
      <InfoList
        title="ปัญหาสุขภาพสำคัญ"
        items={conditions}
        primaryKey="display"
        secondaryKey="code"
      />
      <InfoList
        title="ยาที่ใช้ประจำ"
        items={medications}
        primaryKey="name"
        secondaryKey="dose"
      />
      <InfoList
        title="ข้อมูลแพ้ยา/แพ้อาหาร"
        items={allergies}
        primaryKey="substance"
        secondaryKey="severity"
      />
      <InfoList
        title="สัญญาณชีพล่าสุด"
        items={vitalSigns}
        primaryKey="display"
        secondaryKey="value"
        suffixKey="unit"
      />
      {getText(summary, "carePlan") && (
        <p className="document-note">
          <strong>แผนดูแล:</strong> {getText(summary, "carePlan")}
        </p>
      )}
    </section>
  );
}

function AllergySection({
  items,
  instruction,
}: {
  items: ListItem[];
  instruction?: string;
}) {
  return (
    <section className="document-field-section allergy-panel">
      {items.map((item, index) => (
        <div
          className="allergy-item"
          key={`${getText(item, "substance") ?? index}`}
        >
          <AlertTriangle size={18} />
          <span>
            <strong>
              {getText(item, "substance") ??
                getText(item, "agent") ??
                getText(item, "display") ??
                "Allergy"}
            </strong>
            <small>
              {[
                getText(item, "severity"),
                getText(item, "reaction") ?? getText(item, "manifestation"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
        </div>
      ))}
      {instruction && (
        <p className="document-note critical">
          <strong>คำแนะนำฉุกเฉิน:</strong> {instruction}
        </p>
      )}
    </section>
  );
}

function MedicationSection({
  title,
  items,
}: {
  title: string;
  items: ListItem[];
}) {
  return (
    <section className="document-field-section">
      <h4>{title}</h4>
      <div className="medical-table">
        <div className="medical-table-head">
          <span>ยา</span>
          <span>ขนาด/วิธีใช้</span>
          <span>จำนวน</span>
        </div>
        {items.map((item, index) => (
          <div
            className="medical-table-row"
            key={`${getText(item, "medicationName") ?? getText(item, "name") ?? index}`}
          >
            <strong>{medicationName(item)}</strong>
            <span>{medicationInstruction(item)}</span>
            <span>{medicationQuantity(item)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LabResultSection({ report }: { report?: Record<string, unknown> }) {
  const observations = getArray(report, "observations");
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField label="เลขที่รายงาน" value={getText(report, "reportNo")} />
        <InfoField
          label="ห้องปฏิบัติการ"
          value={getText(report, "laboratory")}
        />
        <InfoField
          label="เก็บตัวอย่าง"
          value={formatDateTime(getText(report, "specimenCollectedAt"))}
        />
        <InfoField
          label="รายงานผล"
          value={formatDateTime(getText(report, "reportedAt"))}
        />
      </div>
      <div className="medical-table lab-table">
        <div className="medical-table-head">
          <span>รายการตรวจ</span>
          <span>ผล</span>
          <span>ค่าอ้างอิง</span>
        </div>
        {observations.map((item, index) => (
          <div
            className={
              isAbnormalObservation(item)
                ? "medical-table-row abnormal"
                : "medical-table-row"
            }
            key={`${getText(item, "code") ?? getText(item, "loincCode") ?? index}`}
          >
            <strong>
              {firstText(
                getText(item, "display"),
                getText(item, "nameTh"),
                getText(item, "name"),
                getText(item, "loincCode"),
              ) ?? "-"}
            </strong>
            <span>
              {[getText(item, "value"), getText(item, "unit")]
                .filter(Boolean)
                .join(" ")}
            </span>
            <span>{getText(item, "referenceRange") ?? "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DiagnosticReportSection({
  report,
}: {
  report?: Record<string, unknown>;
}) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField label="เลขที่รายงาน" value={getText(report, "reportNo")} />
        <InfoField label="ประเภท" value={getText(report, "category")} />
        <InfoField label="วิธีตรวจ" value={getText(report, "modality")} />
        <InfoField
          label="วันที่ตรวจ"
          value={formatDateTime(getText(report, "effectiveDateTime"))}
        />
      </div>
      <p className="document-note">
        <strong>สรุปผล:</strong> {getText(report, "conclusion") ?? "-"}
      </p>
      <InfoList
        title="ค่าที่รายงาน"
        items={getArray(report, "observations")}
        primaryKey="display"
        secondaryKey="value"
        suffixKey="unit"
      />
    </section>
  );
}

function ReferralSection({ referral }: { referral?: Record<string, unknown> }) {
  return (
    <section className="document-field-section referral-letter">
      <div className="letter-block">
        <p>
          <strong>เรียนหน่วยบริการปลายทาง</strong>
        </p>
        <p>
          {getText(referral, "clinicalNotes") ??
            getText(referral, "reason") ??
            "กรุณาพิจารณารับผู้ป่วยตามข้อมูลการส่งต่อและเอกสารประกอบในรายการแนบ"}
        </p>
      </div>
      <div className="document-field-grid compact">
        <InfoField
          label="เลขที่ส่งต่อ"
          value={getText(referral, "referralNo")}
        />
        <InfoField
          label="ลำดับความสำคัญ"
          value={getText(referral, "priority")}
        />
        <InfoField
          label="จาก"
          value={getText(referral, "fromHospital") ?? getText(referral, "from")}
        />
        <InfoField
          label="ถึง"
          value={getText(referral, "toHospital") ?? getText(referral, "to")}
        />
        <InfoField
          label="บริการที่ขอ"
          value={getText(referral, "requestedService")}
        />
        <InfoField label="เหตุผลส่งต่อ" value={getText(referral, "reason")} />
        <InfoField
          label="เอกสารแนบ"
          value={getNested(referral, ["attachments"])}
        />
        <InfoField
          label="วันที่ออก"
          value={formatDateTime(getText(referral, "authoredOn"))}
        />
      </div>
      <InfoList
        title="สรุปทางคลินิก"
        items={clinicalSummaryItems(getObject(referral, "clinicalSummary"))}
        primaryKey="label"
        secondaryKey="value"
      />
      <InfoList
        title="บริการที่ต้องการ"
        items={arrayToItems(getNested(referral, ["requestedServices"]))}
        primaryKey="label"
      />
    </section>
  );
}

function DischargeSummarySection({
  summary,
}: {
  summary?: Record<string, unknown>;
}) {
  return (
    <section className="document-field-section discharge-summary">
      <div className="document-field-grid compact">
        <InfoField
          label="เลขที่ Admit"
          value={getText(summary, "admissionNo")}
        />
        <InfoField
          label="วันที่รับไว้"
          value={formatDate(getText(summary, "admissionDate"))}
        />
        <InfoField
          label="วันที่จำหน่าย"
          value={formatDate(getText(summary, "dischargeDate"))}
        />
        <InfoField
          label="Disposition"
          value={getText(summary, "dischargeDisposition")}
        />
        <InfoField
          label="วินิจฉัยหลัก"
          value={getText(getObject(summary, "principalDiagnosis"), "display")}
        />
        <InfoField label="ติดตามรักษา" value={getText(summary, "followUp")} />
      </div>
      <p className="document-note">
        <strong>Hospital course:</strong>{" "}
        {getText(summary, "hospitalCourse") ?? "-"}
      </p>
      <InfoList
        title="วินิจฉัยร่วม"
        items={getArray(summary, "secondaryDiagnoses")}
        primaryKey="display"
        secondaryKey="code"
      />
      <InfoList
        title="หัตถการ"
        items={getArray(summary, "procedures")}
        primaryKey="display"
        secondaryKey="code"
      />
      <MedicationSection
        title="ยากลับบ้าน"
        items={getArray(summary, "dischargeMedications")}
      />
    </section>
  );
}

function CoverageEligibilitySection({
  coverage,
}: {
  coverage?: Record<string, unknown>;
}) {
  const payer = getObject(coverage, "payer");
  const benefits = getObject(coverage, "benefits") ?? {};
  return (
    <section className="document-field-section">
      <div className="coverage-banner">
        <ShieldCheck size={22} />
        <span>
          <strong>
            {getText(coverage, "status") ?? "eligibility unknown"}
          </strong>
          <small>Coverage eligibility response</small>
        </span>
      </div>
      <div className="document-field-grid compact">
        <InfoField
          label="ผู้รับประกัน/ผู้จ่าย"
          value={
            getText(payer, "nameEn") ??
            getText(payer, "name") ??
            getText(coverage, "payer")
          }
        />
        <InfoField label="แผนประกัน" value={getText(coverage, "planName")} />
        <InfoField
          label="เลขสมาชิก"
          value={
            getText(coverage, "memberId") ??
            getText(payer, "policyNo") ??
            getText(coverage, "policyNo")
          }
        />
        <InfoField
          label="เครือข่าย"
          value={
            getText(coverage, "network") ?? getText(coverage, "directBilling")
          }
        />
        <InfoField
          label="ตรวจสอบล่าสุด"
          value={formatDateTime(getText(coverage, "lastCheckedAt"))}
        />
        <InfoField
          label="คุ้มครองตั้งแต่"
          value={formatDate(getNested(coverage, ["coveragePeriod", "start"]))}
        />
        <InfoField
          label="คุ้มครองถึง"
          value={formatDate(getNested(coverage, ["coveragePeriod", "end"]))}
        />
        <InfoField
          label="วงเงินคุ้มครองต่อปี"
          value={formatMoney(
            getNested(benefits, ["annualLimit"]),
            getText(benefits, "annualLimitCurrency") ??
              getText(coverage, "currency") ??
              "THB",
          )}
        />
        <InfoField
          label="Copay"
          value={getText(coverage, "copay") ?? getText(benefits, "copay")}
        />
        <InfoField
          label="Pre-authorization"
          value={
            getNested(coverage, ["preAuthorizationRequired"]) === true
              ? "ต้องขออนุมัติก่อน"
              : "ไม่จำเป็น"
          }
        />
        <InfoField
          label="Direct billing"
          value={
            getNested(benefits, ["directBilling"]) === true ||
            getNested(coverage, ["directBilling"]) === true
              ? "รองรับ"
              : getText(coverage, "directBilling")
          }
        />
      </div>
      <div className="medical-table">
        <div className="medical-table-head">
          <span>สิทธิประโยชน์</span>
          <span>วงเงิน</span>
          <span>คงเหลือ</span>
        </div>
        {getArray(coverage, "benefitSummary").map((item, index) => (
          <div
            className="medical-table-row"
            key={`${getText(item, "benefit") ?? index}`}
          >
            <strong>{getText(item, "benefit") ?? "-"}</strong>
            <span>{getText(item, "limit") ?? "-"}</span>
            <span>{getText(item, "remaining") ?? "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinancialSection({
  title,
  items,
  total,
  currency,
}: {
  title: string;
  items: ListItem[];
  total: unknown;
  currency: unknown;
}) {
  const hasQuantityColumn = items.some(
    (item) => getFinancialQuantity(item) != null,
  );
  return (
    <section className="document-field-section">
      <h4>{title}</h4>
      <div
        className={
          hasQuantityColumn
            ? "medical-table finance-table"
            : "medical-table finance-table two-column"
        }
      >
        <div className="medical-table-head">
          <span>รายการ</span>
          {hasQuantityColumn ? <span>จำนวน</span> : null}
          <span>ยอด</span>
        </div>
        {items.length ? (
          items.map((item, index) => {
            const description =
              getText(item, "descriptionTh") ??
              getText(item, "serviceTh") ??
              getText(item, "description") ??
              getText(item, "service") ??
              getText(item, "item") ??
              getText(item, "name") ??
              "-";
            const quantity = getFinancialQuantity(item);
            const amount =
              getText(item, "amount") ??
              getText(item, "lineTotal") ??
              getText(item, "total") ??
              getText(item, "estimatedAmount") ??
              getText(item, "approvedAmount") ??
              getText(item, "patientResponsibility");
            return (
              <div
                className="medical-table-row"
                key={`${getText(item, "code") ?? description ?? index}`}
              >
                <strong>{description}</strong>
                {hasQuantityColumn ? <span>{quantity ?? "-"}</span> : null}
                <span>
                  {formatMoney(amount, getText(item, "currency") ?? currency)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="medical-table-row">
            <strong>ยังไม่มีรายการค่าใช้จ่าย</strong>
            {hasQuantityColumn ? <span>-</span> : null}
            <span>{formatMoney(total, currency)}</span>
          </div>
        )}
      </div>
      <div className="finance-total">
        <span>ยอดรวม</span>
        <strong>{formatMoney(total, currency)}</strong>
      </div>
    </section>
  );
}

function getFinancialQuantity(item: ListItem): string | undefined {
  return (
    getText(item, "quantity") ?? getText(item, "qty") ?? getText(item, "units")
  );
}

function normalizeMedicationItem(item: ListItem): ListItem {
  const name = firstText(
    getText(item, "nameTh"),
    getText(item, "medicationName"),
    getText(item, "drugName"),
    getText(item, "drugNameTh"),
    getText(item, "name"),
    getText(item, "display"),
    getText(item, "label"),
    getText(item, "code"),
  );
  const dose = firstText(
    getText(item, "dose"),
    getText(item, "dosage"),
    getText(item, "strength"),
  );
  const frequency = firstText(
    getText(item, "frequency"),
    getText(item, "timing"),
  );
  const route = firstText(getText(item, "route"), getText(item, "method"));
  const instructions = firstText(
    getText(item, "dosageInstruction"),
    getText(item, "dosageInstructions"),
    getText(item, "instructions"),
    getText(item, "instruction"),
    [dose, frequency, route].filter(Boolean).join(" · "),
  );
  const quantity = firstText(
    getText(item, "quantity"),
    getText(item, "dispensedQuantity"),
    getText(item, "quantityDispensed"),
    getText(item, "daysSupply"),
    getText(item, "durationDays"),
  );
  return {
    ...item,
    name,
    medicationName: name,
    dose,
    frequency,
    route,
    dosageInstruction: instructions,
    instructions,
    quantity,
  };
}

function medicationName(item: ListItem): string {
  return (
    firstText(
      getText(item, "nameTh"),
      getText(item, "medicationName"),
      getText(item, "name"),
      getText(item, "display"),
      getText(item, "code"),
      getText(item, "drugName"),
    ) ?? "-"
  );
}

function medicationInstruction(item: ListItem): string {
  return (
    [
      firstText(getText(item, "strength"), getText(item, "dose")),
      firstText(
        getText(item, "dosageInstruction"),
        getText(item, "instructions"),
        getText(item, "instruction"),
      ),
      firstText(getText(item, "frequency"), getText(item, "route")),
    ]
      .filter(Boolean)
      .join(" · ") || "-"
  );
}

function medicationQuantity(item: ListItem): string {
  return formatValue(
    firstText(
      getText(item, "quantity"),
      getText(item, "dispensedQuantity"),
      getText(item, "quantityDispensed"),
      getText(item, "daysSupply"),
      getText(item, "durationDays"),
    ) ?? "-",
  );
}

function isAbnormalObservation(item: ListItem): boolean {
  const flag = firstText(
    getText(item, "flag"),
    getText(item, "interpretation"),
    getText(item, "status"),
  );
  return (
    !!flag &&
    !["N", "normal", "final", "registered"].includes(flag.toLowerCase())
  );
}

function VisaSupportLetterSection({
  letter,
}: {
  letter?: Record<string, unknown>;
}) {
  const physician = getObject(letter, "responsiblePhysician");
  return (
    <section className="document-field-section letter-document">
      <div className="letter-block">
        <p>
          <strong>To whom it may concern,</strong>
        </p>
        <p>
          This document supports the patient's planned medical visit. It is a
          hospital-issued support letter and not a government visa approval.
        </p>
      </div>
      <div className="document-field-grid compact">
        <InfoField label="เลขที่จดหมาย" value={getText(letter, "letterNo")} />
        <InfoField
          label="องค์กรผู้ออก"
          value={getText(letter, "issuingOrganization")}
        />
        <InfoField label="วัตถุประสงค์" value={getText(letter, "purpose")} />
        <InfoField
          label="แผนกที่รับ"
          value={getText(letter, "receivingDepartment")}
        />
        <InfoField
          label="ช่วงเข้ารับบริการ"
          value={formatPeriod(getObject(letter, "proposedVisitPeriod"))}
        />
        <InfoField
          label="แพทย์ผู้รับผิดชอบ"
          value={getText(physician, "nameTh") ?? getText(physician, "name")}
        />
      </div>
      {getText(letter, "note") && (
        <p className="document-note">{getText(letter, "note")}</p>
      )}
    </section>
  );
}

function GuaranteeLetterSection({
  letter,
}: {
  letter?: Record<string, unknown>;
}) {
  return (
    <section className="document-field-section">
      <div className="coverage-banner">
        <ShieldCheck size={22} />
        <span>
          <strong>Letter of Guarantee</strong>
          <small>Pre-authorization and covered services</small>
        </span>
      </div>
      <div className="document-field-grid compact">
        <InfoField
          label="เลขที่ Guarantee"
          value={getText(letter, "guaranteeNo")}
        />
        <InfoField label="Payer" value={getText(letter, "payer")} />
        <InfoField label="Policy No." value={getText(letter, "policyNo")} />
        <InfoField label="Pre-auth No." value={getText(letter, "preAuthNo")} />
        <InfoField
          label="Provider ที่คุ้มครอง"
          value={getText(letter, "coveredProvider")}
        />
        <InfoField
          label="วงเงิน"
          value={formatMoney(
            getNested(letter, ["guaranteeLimit", "amount"]),
            getNested(letter, ["guaranteeLimit", "currency"]),
          )}
        />
        <InfoField
          label="ใช้ได้ตั้งแต่"
          value={formatDate(getText(letter, "validFrom"))}
        />
        <InfoField
          label="ใช้ได้ถึง"
          value={formatDate(getText(letter, "validUntil"))}
        />
      </div>
      <InfoList
        title="บริการที่คุ้มครอง"
        items={arrayToItems(getNested(letter, ["coveredServices"]))}
        primaryKey="label"
      />
      <InfoList
        title="เงื่อนไข"
        items={arrayToItems(getNested(letter, ["conditions"]))}
        primaryKey="label"
      />
    </section>
  );
}

function SyncReceiptSection({
  receipt,
}: {
  receipt?: Record<string, unknown>;
}) {
  const counts = getObject(receipt, "objectCounts") ?? {};
  return (
    <section className="document-field-section sync-receipt">
      <div className="document-field-grid compact">
        <InfoField label="Sync ID" value={getText(receipt, "syncId")} />
        <InfoField label="ต้นทาง" value={getText(receipt, "sourceSystem")} />
        <InfoField label="ปลายทาง" value={getText(receipt, "targetSystem")} />
        <InfoField label="ทิศทาง" value={getText(receipt, "syncDirection")} />
        <InfoField
          label="เริ่ม"
          value={formatDateTime(getText(receipt, "startedAt"))}
        />
        <InfoField
          label="เสร็จสิ้น"
          value={formatDateTime(getText(receipt, "completedAt"))}
        />
        <InfoField label="สถานะ" value={getText(receipt, "status")} />
        <InfoField label="Checksum" value={getText(receipt, "checksum")} />
      </div>
      <div className="sync-count-grid">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key}>
            <span>{humanizeKey(key)}</span>
            <strong>{formatValue(value)}</strong>
          </div>
        ))}
      </div>
      <p className="document-note">
        ใบรับนี้ใช้ยืนยันว่าข้อมูลถูกนำเข้า wallet ตาม adapter version ที่ระบุ
        และใช้ตรวจสอบย้อนหลังร่วมกับ Activity/History ได้
      </p>
    </section>
  );
}

function ManifestSection({ manifest }: { manifest?: Record<string, unknown> }) {
  const files = getArray(manifest, "files");
  return (
    <section className="document-field-section manifest-preview">
      <div className="document-field-grid compact">
        <InfoField label="SHL ID" value={getText(manifest, "shlId")} />
        <InfoField label="วัตถุประสงค์" value={getText(manifest, "purpose")} />
        <InfoField
          label="Manifest hash"
          value={getText(manifest, "manifestHash")}
        />
        <InfoField
          label="หมดอายุ"
          value={formatDateTime(getText(manifest, "expiresAt"))}
        />
      </div>
      <h4>ไฟล์ใน Manifest</h4>
      <div className="manifest-file-list">
        {files.map((file, index) => (
          <div key={`${getText(file, "fileId") ?? index}`}>
            <Link2 size={18} />
            <span>
              <strong>{getText(file, "fileId")}</strong>
              <small>
                {getText(file, "contentType")} ·{" "}
                {formatValue(getNested(file, ["documentTypes"]))}
              </small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppointmentSection({
  appointment,
}: {
  appointment?: Record<string, unknown>;
}) {
  return (
    <section className="document-field-section appointment-ticket">
      <div>
        <Calendar size={22} />
        <span>
          <strong>{getText(appointment, "serviceType") ?? "นัดหมาย"}</strong>
          <small>
            {formatDateTime(getText(appointment, "start"))} -{" "}
            {formatDateTime(getText(appointment, "end"))}
          </small>
        </span>
      </div>
      <p>{getText(appointment, "location")}</p>
      <p className="document-note">
        {getText(appointment, "checkinInstruction")}
      </p>
    </section>
  );
}

function InfoField({ label, value }: Field) {
  if (!hasValue(value)) return null;
  return (
    <div className="document-field">
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

function InfoList({
  title,
  items,
  primaryKey,
  secondaryKey,
  suffixKey,
}: {
  title: string;
  items: ListItem[];
  primaryKey: string;
  secondaryKey?: string;
  suffixKey?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="document-list-panel">
      <h4>{title}</h4>
      {items.slice(0, 6).map((item, index) => (
        <div key={`${getText(item, primaryKey) ?? index}`}>
          <span>
            <strong>{getText(item, primaryKey) ?? "-"}</strong>
            <small>
              {[getText(item, secondaryKey), getText(item, suffixKey)]
                .filter(Boolean)
                .join(" ")}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

function documentIdentifier(
  card: WalletCard,
  subject: Record<string, unknown>,
  patient: Record<string, unknown>,
  document: Record<string, unknown>,
): string {
  const documentNo = firstText(
    getText(subject, "documentNo"),
    getText(document, "documentNo"),
    getText(document, "no"),
    getText(subject, "certificateNo"),
    getText(subject, "referralNo"),
    getText(subject, "quotationNo"),
    getText(subject, "receiptNo"),
    getText(subject, "invoiceNo"),
    getText(subject, "claimRef"),
    getText(subject, "claimId"),
    getText(subject, "guaranteeRef"),
    getText(subject, "letterNo"),
    getText(subject, "consentId"),
    getText(subject, "goldenRecordId"),
    getText(subject, "syncId"),
    getText(subject, "smartHealthLinkId"),
    getText(subject, "bundleId"),
    getText(subject, "policyNo"),
    getText(subject, "memberId"),
    getText(getObject(subject, "documentReference"), "id"),
  );
  const personNo = firstText(
    getText(patient, "carepassId"),
    getText(patient, "hn"),
    getText(patient, "id"),
    getText(subject, "memberId"),
    getText(subject, "passportNumber"),
  );
  return (
    (photoDocumentTypes.has(card.cardType)
      ? (personNo ?? documentNo)
      : (documentNo ?? personNo)) ?? String(card.credentialId)
  );
}

function iconForDocument(cardType: string): ReactElement {
  const map: Record<string, ReactElement> = {
    patient_identity: <IdCard size={20} />,
    staff_identity: <BadgeCheck size={20} />,
    consent_receipt: <ShieldCheck size={20} />,
    mpi_link_certificate: <Link2 size={20} />,
    patient_summary: <HeartPulse size={20} />,
    allergy_alert: <AlertTriangle size={20} />,
    immunization: <Syringe size={20} />,
    medical_certificate: <Stethoscope size={20} />,
    medication_summary: <Pill size={20} />,
    prescription: <Pill size={20} />,
    pharmacy_dispense: <Pill size={20} />,
    lab_result: <FlaskConical size={20} />,
    diagnostic_report: <ClipboardList size={20} />,
    referral_vc: <FileCheck2 size={20} />,
    discharge_summary: <FileText size={20} />,
    insurance_eligibility: <CreditCard size={20} />,
    claim_package: <ReceiptText size={20} />,
    claim_receipt: <ReceiptText size={20} />,
    travel_document_verification: <Plane size={20} />,
    visa_support_letter: <Plane size={20} />,
    quotation: <ReceiptText size={20} />,
    guarantee_letter: <ShieldCheck size={20} />,
    shl_manifest: <Link2 size={20} />,
    sync_receipt: <Link2 size={20} />,
    appointment: <Calendar size={20} />,
  };
  return map[cardType] ?? <FileText size={20} />;
}

function logoText(value: string): string {
  const upper = value.toUpperCase();
  if (upper.includes("RAMKHAMHAENG")) return "RU";
  if (upper.includes("HEALTHPASS")) return "HP";
  return "TC";
}

function getObject(
  source: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source))
    return undefined;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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

function getArray(source: unknown, key: string): ListItem[] {
  const value = getNested(source, [key]);
  return Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object")
        .map((item) => item as ListItem)
    : [];
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

function firstNonEmptyItems(...values: unknown[]): ListItem[] {
  for (const value of values) {
    const items = itemsFromUnknown(value);
    if (items.length > 0) return items;
  }
  return [];
}

function itemsFromUnknown(value: unknown): ListItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return item as ListItem;
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
  benefits: Record<string, unknown>,
  coverage: Record<string, unknown>,
): ListItem[] {
  const currency =
    getText(benefits, "annualLimitCurrency") ??
    getText(coverage, "currency") ??
    "THB";
  const items: ListItem[] = [
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

function joinDateTime(date?: string, time?: string): string | undefined {
  if (!date && !time) return undefined;
  return [date, time].filter(Boolean).join(" ");
}

function firstNonEmptyArray(...values: ListItem[][]): ListItem[] {
  return values.find((items) => items.length > 0) ?? [];
}

function getStringArray(source: unknown, key: string): string[] {
  const value = getNested(source, [key]);
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map(String)
    : [];
}

function arrayToItems(value: unknown): ListItem[] {
  return Array.isArray(value)
    ? value.map((item) => ({ label: formatValue(item) }))
    : [];
}

function clinicalSummaryItems(summary?: Record<string, unknown>): ListItem[] {
  if (!summary) return [];
  return [
    { label: "อาการสำคัญ", value: getText(summary, "primaryConcern") },
    { label: "ประวัติ", value: getText(summary, "history") },
    { label: "การแพ้", value: getText(summary, "allergies") },
    { label: "ยาปัจจุบัน", value: getText(summary, "medications") },
  ].filter((item) => hasValue(item.value));
}

function getNested(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
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

function formatPeriod(period?: Record<string, unknown>): string {
  if (!period) return "-";
  const start = formatDate(getText(period, "start"));
  const end = formatDate(getText(period, "end"));
  return [start, end].filter((value) => value !== "-").join(" - ") || "-";
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

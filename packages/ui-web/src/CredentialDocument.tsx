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
  UserRound
} from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import type { WalletCard } from "@trustcare/wallet-core";
import { initialsFromName, photoCandidatesForCard } from "@trustcare/wallet-core";
import { Badge } from "./primitives";

type Field = {
  label: string;
  value: unknown;
  tone?: "normal" | "critical";
};

type ListItem = Record<string, unknown>;

const photoDocumentTypes = new Set(["patient_identity", "staff_identity", "travel_document_verification"]);

export function CredentialDocument({ card, qrDataUrl, compact = false }: { card: WalletCard; qrDataUrl?: string; compact?: boolean }) {
  const credential = card.credentialData ?? {};
  const subject = getObject(credential, "credentialSubject") ?? credential;
  const patient = getObject(subject, "patient") ?? getObject(subject, "student") ?? getObject(subject, "staff") ?? {};
  const issuer = getObject(credential, "issuer");
  const issuerNameTh = getText(issuer, "nameTh") ?? card.issuerHospitalName ?? "TrustCare Network";
  const issuerNameEn = getText(issuer, "nameEn") ?? getText(issuer, "name") ?? "TRUSTCARE NETWORK";
  const displayNameTh = getText(patient, "fullNameTh") ?? getText(patient, "nameTh") ?? getText(patient, "name") ?? "ผู้ใช้ TrustCare";
  const displayNameEn = getText(patient, "fullNameEn") ?? getText(patient, "nameEn") ?? getText(patient, "name") ?? displayNameTh;
  const patientId = getText(patient, "carepassId") ?? getText(patient, "hn") ?? getText(patient, "id") ?? String(card.credentialId);
  const photoUrl = photoDocumentTypes.has(card.cardType) ? photoCandidatesForCard(card)[0]?.url : undefined;
  const accent = documentAccent(card.cardType);
  const documentFields = fieldsForDocument(card, subject, patient);
  const isIdentityDocument = photoDocumentTypes.has(card.cardType);
  const narrative = documentNarrative(card, subject, patient);

  if (!isIdentityDocument) {
    return (
      <article className={`${compact ? "credential-doc credential-doc-compact" : "credential-doc"} hospital-document document-${documentVariant(card.cardType)}`} style={{ "--doc-accent": accent } as CSSProperties}>
        <div className="hospital-document-header">
          <div className="hospital-document-brand">
            <div className="credential-logo">{logoText(issuerNameEn)}</div>
            <span>
              <h3>{issuerNameTh}</h3>
              <p>{issuerNameEn}</p>
            </span>
          </div>
          <div className="hospital-document-title">
            <small>{documentKindLabel(card.cardType)}</small>
            <strong>{card.displayName}</strong>
            <span>{card.displayNameEn ?? card.cardType}</span>
          </div>
          <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>{card.credentialStatus === "active" ? "ใช้งานได้" : card.credentialStatus}</Badge>
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

        {renderDocumentBody(card, subject, documentFields)}

        <DocumentSignoff card={card} subject={subject} />

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
            {qrDataUrl ? <img src={qrDataUrl} alt="VP QR" /> : <QrCode size={48} />}
          </div>
        </div>
        <div className="hospital-watermark">DEMO ONLY</div>
        <footer>VC: {String(card.credentialId)}</footer>
      </article>
    );
  }

  return (
    <article className={`${compact ? "credential-doc credential-doc-compact" : "credential-doc"} medical-document document-${documentVariant(card.cardType)}`} style={{ "--doc-accent": accent } as CSSProperties}>
      <div className="credential-header document-header">
        <div className="credential-logo">{logoText(issuerNameEn)}</div>
        <div className="document-header-copy">
          <h3>{issuerNameTh}</h3>
          <p>{issuerNameEn}</p>
          <strong>{card.displayName} / {card.displayNameEn ?? card.cardType}</strong>
        </div>
        <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>{card.credentialStatus === "active" ? "ใช้งานได้" : card.credentialStatus}</Badge>
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

      <div className={photoUrl ? "document-person-row with-photo" : "document-person-row"}>
        {photoUrl ? (
          <div className="credential-photo" aria-label="รูปผู้ถือเอกสาร">
            <img src={photoUrl} alt={displayNameEn} />
          </div>
        ) : (
          <div className="document-type-mark" aria-hidden="true">{iconForDocument(card.cardType)}</div>
        )}
        <div className="credential-person">
          <span className="muted-row"><UserRound size={16} /> ผู้ถือเอกสาร</span>
          <h4>{displayNameTh}</h4>
          <p>{displayNameEn}</p>
          <div className="document-mini-grid">
            <span><small>รหัสผู้ป่วย</small><strong>{patientId}</strong></span>
            <span><small>ออกเมื่อ</small><strong>{formatDate(card.issuedAt)}</strong></span>
            <span><small>หมดอายุ</small><strong>{formatDate(card.expiresAt)}</strong></span>
          </div>
        </div>
        <div className="watermark">DEMO ONLY</div>
      </div>

      {renderDocumentBody(card, subject, documentFields)}

      <div className="credential-status-row document-status-row">
        <div>
          <span>สถานะ / STATUS</span>
          <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>
            <ShieldCheck size={14} /> {card.credentialStatus === "active" ? "ใช้งานได้" : card.credentialStatus}
          </Badge>
        </div>
        <div>
          <span>Credential ID</span>
          <strong className="mono">{String(card.credentialId)}</strong>
        </div>
        <div className="credential-qr">
          {qrDataUrl ? <img src={qrDataUrl} alt="VP QR" /> : <QrCode size={48} />}
        </div>
      </div>
      <footer>VC: {String(card.credentialId)}</footer>
    </article>
  );
}

function renderDocumentBody(card: WalletCard, subject: Record<string, unknown>, fields: Field[]): ReactElement {
  switch (card.cardType) {
    case "lab_result":
      return <LabResultSection report={getObject(subject, "labReport") ?? { observations: getNested(subject, ["observations"]) }} />;
    case "diagnostic_report":
      return <DiagnosticReportSection report={getObject(subject, "diagnosticReport")} />;
    case "prescription":
      return <MedicationSection title="รายการยาในใบสั่งยา" items={getArray(getObject(subject, "prescription"), "items").length ? getArray(getObject(subject, "prescription"), "items") : getArray(getObject(subject, "fhir"), "medicationRequests")} />;
    case "medication_summary":
      return <MedicationSection title="รายการยาปัจจุบัน" items={getArray(getObject(subject, "medicationSummary"), "medications")} />;
    case "pharmacy_dispense":
      return <MedicationSection title="รายการจ่ายยา" items={getArray(getObject(subject, "medicationDispense"), "items")} />;
    case "allergy_alert":
      return <AllergySection items={getArray(subject, "allergyIntolerances").length ? getArray(subject, "allergyIntolerances") : getArray(subject, "allergies")} instruction={getText(subject, "emergencyInstruction")} />;
    case "immunization":
      return <ImmunizationSection items={getArray(subject, "immunizations")} registryStatus={getText(subject, "registryStatus")} />;
    case "medical_certificate":
      return <MedicalCertificateSection certificate={getObject(subject, "certificate")} />;
    case "patient_summary":
      return <ClinicalSummarySection summary={getObject(subject, "summary") ?? getObject(subject, "clinical")} />;
    case "consent_receipt":
      return <ConsentReceiptSection consent={getObject(subject, "consent")} />;
    case "mpi_link_certificate":
      return <MpiLinkSection mpi={getObject(subject, "mpi")} />;
    case "referral_vc":
      return <ReferralSection referral={getObject(subject, "referral")} />;
    case "discharge_summary":
      return <DischargeSummarySection summary={getObject(subject, "dischargeSummary")} />;
    case "insurance_eligibility":
      return <CoverageEligibilitySection coverage={getObject(subject, "coverage") ?? getObject(subject, "payer")} />;
    case "claim_package":
      return <FinancialSection title="รายการค่าใช้จ่ายสำหรับเคลม" items={getArray(getObject(subject, "claimPackage"), "serviceLines")} total={getNested(subject, ["claimPackage", "totalAmount"])} currency={getNested(subject, ["claimPackage", "currency"])} />;
    case "claim_receipt":
      return <FinancialSection title="ใบเสร็จรับเงิน" items={getArray(getObject(subject, "receipt"), "items")} total={getNested(subject, ["receipt", "netAmount"])} currency="THB" />;
    case "quotation":
      return <FinancialSection title="ใบเสนอราคา" items={getArray(getObject(subject, "quotation"), "lineItems")} total={getNested(subject, ["quotation", "estimatedTotal"])} currency={getNested(subject, ["quotation", "currency"])} />;
    case "visa_support_letter":
      return <VisaSupportLetterSection letter={getObject(subject, "visaSupportLetter")} />;
    case "guarantee_letter":
      return <GuaranteeLetterSection letter={getObject(subject, "guaranteeLetter")} />;
    case "shl_manifest":
      return <ManifestSection manifest={getObject(subject, "shlManifest")} />;
    case "sync_receipt":
      return <SyncReceiptSection receipt={getObject(subject, "syncReceipt")} />;
    case "appointment":
      return <AppointmentSection appointment={getObject(subject, "appointment")} />;
    default:
      return <FieldGridSection fields={fields} />;
  }
}

function FieldGridSection({ fields }: { fields: Field[] }) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid">
        {fields.filter(field => hasValue(field.value)).map(field => (
          <div key={field.label} className={field.tone === "critical" ? "document-field critical" : "document-field"}>
            <span>{field.label}</span>
            <strong>{formatValue(field.value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DocumentNarrativePanel({ narrative }: { narrative: { title: string; body: string; sections: string[]; sourceSystem?: string } }) {
  return (
    <section className="document-narrative">
      <div>
        <span>บริบทเอกสาร</span>
        <h4>{narrative.title}</h4>
        <p>{narrative.body}</p>
      </div>
      {narrative.sections.length > 0 && (
        <div className="document-section-map" aria-label="Document sections">
          {narrative.sections.slice(0, 7).map(section => <span key={section}>{humanizeKey(section)}</span>)}
        </div>
      )}
      {narrative.sourceSystem && <small>Source system: {narrative.sourceSystem}</small>}
    </section>
  );
}

function DocumentSignoff({ card, subject }: { card: WalletCard; subject: Record<string, unknown> }) {
  const humanDocument = getObject(subject, "humanDocument");
  const issuer = getObject(humanDocument, "issuer");
  const practitioner =
    getObject(getObject(subject, "certificate"), "certifyingPractitioner") ??
    getObject(getObject(subject, "diagnosticReport"), "reportingPractitioner") ??
    getObject(getObject(subject, "referral"), "requestedBy") ??
    getObject(getObject(subject, "appointment"), "practitioner");

  return (
    <section className="document-signoff">
      <div>
        <span>ผู้ออกเอกสาร</span>
        <strong>{getText(issuer, "nameTh") ?? card.issuerHospitalName ?? "TrustCare Network"}</strong>
        <small>{getText(issuer, "did") ?? card.issuerDid ?? "-"}</small>
      </div>
      <div>
        <span>ผู้รับรอง/หน่วยงาน</span>
        <strong>{getText(practitioner, "nameTh") ?? getText(practitioner, "name") ?? "เจ้าหน้าที่ผู้มีสิทธิออกเอกสาร"}</strong>
        <small>{getText(practitioner, "licenseNo") ?? getText(practitioner, "role") ?? "ลงนามดิจิทัลโดย issuer DID"}</small>
      </div>
      <div>
        <span>สถานะเอกสาร</span>
        <strong>{card.credentialStatus === "active" ? "ใช้งานได้" : card.credentialStatus}</strong>
        <small>ตรวจสอบได้ด้วย VC/VP และ DocumentReference evidence</small>
      </div>
    </section>
  );
}

function ImmunizationSection({ items, registryStatus }: { items: ListItem[]; registryStatus?: string }) {
  return (
    <section className="document-field-section">
      <div className="document-table-header">
        <h4>ประวัติวัคซีน</h4>
        {registryStatus && <Badge tone="green">{registryStatus}</Badge>}
      </div>
      <div className="medical-table immunization-table">
        <div className="medical-table-head"><span>วัคซีน</span><span>วันที่ได้รับ</span><span>Lot / ผู้ให้บริการ</span></div>
        {items.map((item, index) => (
          <div className="medical-table-row" key={`${getText(item, "vaccineCode") ?? index}`}>
            <strong>{getText(item, "display") ?? getText(item, "vaccineCode") ?? "-"}</strong>
            <span>{formatDate(getText(item, "occurrenceDate"))}</span>
            <span>{[getText(item, "lotNumber"), getText(item, "performer")].filter(Boolean).join(" / ") || "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MedicalCertificateSection({ certificate }: { certificate?: Record<string, unknown> }) {
  return (
    <section className="document-field-section certificate-layout">
      <div className="certificate-statement">
        <h4>ใบรับรองแพทย์</h4>
        <p>{getText(certificate, "result") ?? "แพทย์ผู้ตรวจรับรองผลตามข้อมูลการตรวจในระบบโรงพยาบาล"}</p>
      </div>
      <div className="document-field-grid compact">
        <InfoField label="เลขที่ใบรับรอง" value={getText(certificate, "certificateNo")} />
        <InfoField label="ประเภท" value={getText(certificate, "type")} />
        <InfoField label="วันที่ตรวจ" value={formatDate(getText(certificate, "examinationDate"))} />
        <InfoField label="ใช้ได้ถึง" value={formatDate(getText(certificate, "validUntil"))} />
        <InfoField label="การวินิจฉัย/เหตุผล" value={getText(certificate, "diagnosis")} />
        <InfoField label="ข้อจำกัด/คำแนะนำ" value={getText(certificate, "restrictions")} />
      </div>
      <p className="document-note">เอกสารนี้เหมาะสำหรับแสดงต่อหน่วยบริการ นายจ้าง หรือหน่วยงานที่ต้องการยืนยันผลตรวจ โดยตรวจสอบแหล่งที่มาได้จาก Credential ID และ DocumentReference evidence</p>
    </section>
  );
}

function ConsentReceiptSection({ consent }: { consent?: Record<string, unknown> }) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField label="Consent ID" value={getText(consent, "consentId")} />
        <InfoField label="สถานะ" value={getText(consent, "status")} />
        <InfoField label="วัตถุประสงค์" value={getText(consent, "purpose")} />
        <InfoField label="หมดอายุ" value={formatDateTime(getText(consent, "expiresAt"))} />
        <InfoField label="ขอบเขตข้อมูล" value={getNested(consent, ["scope"])} />
        <InfoField label="ผู้รับข้อมูล" value={getNested(consent, ["grantedTo"])} />
      </div>
      <InfoList title="เงื่อนไข PDPA / purpose bound" items={arrayToItems(getNested(consent, ["pdpaControls"]))} primaryKey="label" />
    </section>
  );
}

function MpiLinkSection({ mpi }: { mpi?: Record<string, unknown> }) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField label="Golden Record" value={getText(mpi, "goldenRecordId")} />
        <InfoField label="ความเชื่อมั่น" value={getText(mpi, "confidence")} />
        <InfoField label="นโยบายจับคู่" value={getText(mpi, "matchingPolicy")} />
        <InfoField label="ตรวจทานโดย" value={getText(mpi, "reviewedBy")} />
      </div>
      <div className="medical-table">
        <div className="medical-table-head"><span>องค์กร</span><span>HN</span><span>สถานะการเชื่อมโยง</span></div>
        {getArray(mpi, "linkedIdentifiers").map((item, index) => (
          <div className="medical-table-row" key={`${getText(item, "organization") ?? index}`}>
            <strong>{getText(item, "organization") ?? "-"}</strong>
            <span>{getText(item, "hn") ?? "-"}</span>
            <span>{getText(item, "linkStatus") ?? "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClinicalSummarySection({ summary }: { summary?: Record<string, unknown> }) {
  const conditions = getArray(summary, "conditions");
  const medications = getArray(summary, "medications");
  const allergies = getArray(summary, "allergies");
  const vitalSigns = getArray(summary, "vitalSigns");
  return (
    <section className="document-field-section clinical-layout">
      <InfoList title="ปัญหาสุขภาพสำคัญ" items={conditions} primaryKey="display" secondaryKey="code" />
      <InfoList title="ยาที่ใช้ประจำ" items={medications} primaryKey="name" secondaryKey="dose" />
      <InfoList title="ข้อมูลแพ้ยา/แพ้อาหาร" items={allergies} primaryKey="substance" secondaryKey="severity" />
      <InfoList title="สัญญาณชีพล่าสุด" items={vitalSigns} primaryKey="display" secondaryKey="value" suffixKey="unit" />
      {getText(summary, "carePlan") && <p className="document-note"><strong>แผนดูแล:</strong> {getText(summary, "carePlan")}</p>}
    </section>
  );
}

function AllergySection({ items, instruction }: { items: ListItem[]; instruction?: string }) {
  return (
    <section className="document-field-section allergy-panel">
      {items.map((item, index) => (
        <div className="allergy-item" key={`${getText(item, "substance") ?? index}`}>
          <AlertTriangle size={18} />
          <span>
            <strong>{getText(item, "substance") ?? getText(item, "agent") ?? getText(item, "display") ?? "Allergy"}</strong>
            <small>{[getText(item, "severity"), getText(item, "reaction") ?? getText(item, "manifestation")].filter(Boolean).join(" · ")}</small>
          </span>
        </div>
      ))}
      {instruction && <p className="document-note critical"><strong>คำแนะนำฉุกเฉิน:</strong> {instruction}</p>}
    </section>
  );
}

function MedicationSection({ title, items }: { title: string; items: ListItem[] }) {
  return (
    <section className="document-field-section">
      <h4>{title}</h4>
      <div className="medical-table">
        <div className="medical-table-head"><span>ยา</span><span>ขนาด/วิธีใช้</span><span>จำนวน</span></div>
        {items.map((item, index) => (
          <div className="medical-table-row" key={`${getText(item, "medicationName") ?? getText(item, "name") ?? index}`}>
            <strong>{getText(item, "medicationName") ?? getText(item, "name") ?? "-"}</strong>
            <span>{[getText(item, "strength"), getText(item, "dosageInstruction") ?? getText(item, "instructions") ?? getText(item, "dose"), getText(item, "frequency")].filter(Boolean).join(" · ") || "-"}</span>
            <span>{formatValue(getText(item, "quantity") ?? getText(item, "quantityDispensed") ?? getText(item, "daysSupply") ?? "-")}</span>
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
        <InfoField label="ห้องปฏิบัติการ" value={getText(report, "laboratory")} />
        <InfoField label="เก็บตัวอย่าง" value={formatDateTime(getText(report, "specimenCollectedAt"))} />
        <InfoField label="รายงานผล" value={formatDateTime(getText(report, "reportedAt"))} />
      </div>
      <div className="medical-table lab-table">
        <div className="medical-table-head"><span>รายการตรวจ</span><span>ผล</span><span>ค่าอ้างอิง</span></div>
        {observations.map((item, index) => (
          <div className={getText(item, "interpretation") === "H" ? "medical-table-row abnormal" : "medical-table-row"} key={`${getText(item, "code") ?? index}`}>
            <strong>{getText(item, "display") ?? "-"}</strong>
            <span>{[getText(item, "value"), getText(item, "unit")].filter(Boolean).join(" ")}</span>
            <span>{getText(item, "referenceRange") ?? "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DiagnosticReportSection({ report }: { report?: Record<string, unknown> }) {
  return (
    <section className="document-field-section">
      <div className="document-field-grid compact">
        <InfoField label="เลขที่รายงาน" value={getText(report, "reportNo")} />
        <InfoField label="ประเภท" value={getText(report, "category")} />
        <InfoField label="วิธีตรวจ" value={getText(report, "modality")} />
        <InfoField label="วันที่ตรวจ" value={formatDateTime(getText(report, "effectiveDateTime"))} />
      </div>
      <p className="document-note"><strong>สรุปผล:</strong> {getText(report, "conclusion") ?? "-"}</p>
      <InfoList title="ค่าที่รายงาน" items={getArray(report, "observations")} primaryKey="display" secondaryKey="value" suffixKey="unit" />
    </section>
  );
}

function ReferralSection({ referral }: { referral?: Record<string, unknown> }) {
  return (
    <section className="document-field-section referral-letter">
      <div className="letter-block">
        <p><strong>เรียนหน่วยบริการปลายทาง</strong></p>
        <p>{getText(referral, "clinicalNotes") ?? getText(referral, "reason") ?? "กรุณาพิจารณารับผู้ป่วยตามข้อมูลการส่งต่อและเอกสารประกอบในรายการแนบ"}</p>
      </div>
      <div className="document-field-grid compact">
        <InfoField label="เลขที่ส่งต่อ" value={getText(referral, "referralNo")} />
        <InfoField label="ลำดับความสำคัญ" value={getText(referral, "priority")} />
        <InfoField label="จาก" value={getText(referral, "fromHospital") ?? getText(referral, "from")} />
        <InfoField label="ถึง" value={getText(referral, "toHospital") ?? getText(referral, "to")} />
        <InfoField label="บริการที่ขอ" value={getText(referral, "requestedService")} />
        <InfoField label="เหตุผลส่งต่อ" value={getText(referral, "reason")} />
        <InfoField label="เอกสารแนบ" value={getNested(referral, ["attachments"])} />
        <InfoField label="วันที่ออก" value={formatDateTime(getText(referral, "authoredOn"))} />
      </div>
    </section>
  );
}

function DischargeSummarySection({ summary }: { summary?: Record<string, unknown> }) {
  return (
    <section className="document-field-section discharge-summary">
      <div className="document-field-grid compact">
        <InfoField label="เลขที่ Admit" value={getText(summary, "admissionNo")} />
        <InfoField label="วันที่รับไว้" value={formatDate(getText(summary, "admissionDate"))} />
        <InfoField label="วันที่จำหน่าย" value={formatDate(getText(summary, "dischargeDate"))} />
        <InfoField label="Disposition" value={getText(summary, "dischargeDisposition")} />
        <InfoField label="วินิจฉัยหลัก" value={getText(getObject(summary, "principalDiagnosis"), "display")} />
        <InfoField label="ติดตามรักษา" value={getText(summary, "followUp")} />
      </div>
      <p className="document-note"><strong>Hospital course:</strong> {getText(summary, "hospitalCourse") ?? "-"}</p>
      <InfoList title="วินิจฉัยร่วม" items={getArray(summary, "secondaryDiagnoses")} primaryKey="display" secondaryKey="code" />
      <InfoList title="หัตถการ" items={getArray(summary, "procedures")} primaryKey="display" secondaryKey="code" />
      <MedicationSection title="ยากลับบ้าน" items={getArray(summary, "dischargeMedications")} />
    </section>
  );
}

function CoverageEligibilitySection({ coverage }: { coverage?: Record<string, unknown> }) {
  const payer = getObject(coverage, "payer");
  return (
    <section className="document-field-section">
      <div className="coverage-banner">
        <ShieldCheck size={22} />
        <span><strong>{getText(coverage, "status") ?? "eligibility unknown"}</strong><small>Coverage eligibility response</small></span>
      </div>
      <div className="document-field-grid compact">
        <InfoField label="ผู้รับประกัน/ผู้จ่าย" value={getText(payer, "nameEn") ?? getText(payer, "name") ?? getText(coverage, "payer")} />
        <InfoField label="เลขกรมธรรม์" value={getText(payer, "policyNo") ?? getText(coverage, "policyNo")} />
        <InfoField label="เครือข่าย" value={getText(coverage, "network")} />
        <InfoField label="ตรวจสอบล่าสุด" value={formatDateTime(getText(coverage, "lastCheckedAt"))} />
        <InfoField label="คุ้มครองตั้งแต่" value={formatDate(getNested(coverage, ["coveragePeriod", "start"]))} />
        <InfoField label="คุ้มครองถึง" value={formatDate(getNested(coverage, ["coveragePeriod", "end"]))} />
      </div>
      <div className="medical-table">
        <div className="medical-table-head"><span>สิทธิประโยชน์</span><span>วงเงิน</span><span>คงเหลือ</span></div>
        {getArray(coverage, "benefitSummary").map((item, index) => (
          <div className="medical-table-row" key={`${getText(item, "benefit") ?? index}`}>
            <strong>{getText(item, "benefit") ?? "-"}</strong>
            <span>{getText(item, "limit") ?? "-"}</span>
            <span>{getText(item, "remaining") ?? "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinancialSection({ title, items, total, currency }: { title: string; items: ListItem[]; total: unknown; currency: unknown }) {
  return (
    <section className="document-field-section">
      <h4>{title}</h4>
      <div className="medical-table finance-table">
        <div className="medical-table-head"><span>รายการ</span><span>จำนวน</span><span>ยอด</span></div>
        {items.map((item, index) => (
          <div className="medical-table-row" key={`${getText(item, "code") ?? getText(item, "description") ?? index}`}>
            <strong>{getText(item, "description") ?? "-"}</strong>
            <span>{getText(item, "quantity") ?? "-"}</span>
            <span>{formatMoney(getText(item, "amount"), getText(item, "currency") ?? currency)}</span>
          </div>
        ))}
      </div>
      <div className="finance-total"><span>ยอดรวม</span><strong>{formatMoney(total, currency)}</strong></div>
    </section>
  );
}

function VisaSupportLetterSection({ letter }: { letter?: Record<string, unknown> }) {
  const physician = getObject(letter, "responsiblePhysician");
  return (
    <section className="document-field-section letter-document">
      <div className="letter-block">
        <p><strong>To whom it may concern,</strong></p>
        <p>This document supports the patient's planned medical visit. It is a hospital-issued support letter and not a government visa approval.</p>
      </div>
      <div className="document-field-grid compact">
        <InfoField label="เลขที่จดหมาย" value={getText(letter, "letterNo")} />
        <InfoField label="องค์กรผู้ออก" value={getText(letter, "issuingOrganization")} />
        <InfoField label="วัตถุประสงค์" value={getText(letter, "purpose")} />
        <InfoField label="แผนกที่รับ" value={getText(letter, "receivingDepartment")} />
        <InfoField label="ช่วงเข้ารับบริการ" value={formatPeriod(getObject(letter, "proposedVisitPeriod"))} />
        <InfoField label="แพทย์ผู้รับผิดชอบ" value={getText(physician, "nameTh") ?? getText(physician, "name")} />
      </div>
      {getText(letter, "note") && <p className="document-note">{getText(letter, "note")}</p>}
    </section>
  );
}

function GuaranteeLetterSection({ letter }: { letter?: Record<string, unknown> }) {
  return (
    <section className="document-field-section">
      <div className="coverage-banner">
        <ShieldCheck size={22} />
        <span><strong>Letter of Guarantee</strong><small>Pre-authorization and covered services</small></span>
      </div>
      <div className="document-field-grid compact">
        <InfoField label="เลขที่ Guarantee" value={getText(letter, "guaranteeNo")} />
        <InfoField label="Payer" value={getText(letter, "payer")} />
        <InfoField label="Policy No." value={getText(letter, "policyNo")} />
        <InfoField label="Pre-auth No." value={getText(letter, "preAuthNo")} />
        <InfoField label="Provider ที่คุ้มครอง" value={getText(letter, "coveredProvider")} />
        <InfoField label="วงเงิน" value={formatMoney(getNested(letter, ["guaranteeLimit", "amount"]), getNested(letter, ["guaranteeLimit", "currency"]))} />
        <InfoField label="ใช้ได้ตั้งแต่" value={formatDate(getText(letter, "validFrom"))} />
        <InfoField label="ใช้ได้ถึง" value={formatDate(getText(letter, "validUntil"))} />
      </div>
      <InfoList title="บริการที่คุ้มครอง" items={arrayToItems(getNested(letter, ["coveredServices"]))} primaryKey="label" />
      <InfoList title="เงื่อนไข" items={arrayToItems(getNested(letter, ["conditions"]))} primaryKey="label" />
    </section>
  );
}

function SyncReceiptSection({ receipt }: { receipt?: Record<string, unknown> }) {
  const counts = getObject(receipt, "objectCounts") ?? {};
  return (
    <section className="document-field-section sync-receipt">
      <div className="document-field-grid compact">
        <InfoField label="Sync ID" value={getText(receipt, "syncId")} />
        <InfoField label="ต้นทาง" value={getText(receipt, "sourceSystem")} />
        <InfoField label="ปลายทาง" value={getText(receipt, "targetSystem")} />
        <InfoField label="ทิศทาง" value={getText(receipt, "syncDirection")} />
        <InfoField label="เริ่ม" value={formatDateTime(getText(receipt, "startedAt"))} />
        <InfoField label="เสร็จสิ้น" value={formatDateTime(getText(receipt, "completedAt"))} />
        <InfoField label="สถานะ" value={getText(receipt, "status")} />
        <InfoField label="Checksum" value={getText(receipt, "checksum")} />
      </div>
      <div className="sync-count-grid">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key}><span>{humanizeKey(key)}</span><strong>{formatValue(value)}</strong></div>
        ))}
      </div>
      <p className="document-note">ใบรับนี้ใช้ยืนยันว่าข้อมูลถูกนำเข้า wallet ตาม adapter version ที่ระบุ และใช้ตรวจสอบย้อนหลังร่วมกับ Activity/History ได้</p>
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
        <InfoField label="Manifest hash" value={getText(manifest, "manifestHash")} />
        <InfoField label="หมดอายุ" value={formatDateTime(getText(manifest, "expiresAt"))} />
      </div>
      <h4>ไฟล์ใน Manifest</h4>
      <div className="manifest-file-list">
        {files.map((file, index) => (
          <div key={`${getText(file, "fileId") ?? index}`}>
            <Link2 size={18} />
            <span><strong>{getText(file, "fileId")}</strong><small>{getText(file, "contentType")} · {formatValue(getNested(file, ["documentTypes"]))}</small></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppointmentSection({ appointment }: { appointment?: Record<string, unknown> }) {
  return (
    <section className="document-field-section appointment-ticket">
      <div>
        <Calendar size={22} />
        <span>
          <strong>{getText(appointment, "serviceType") ?? "นัดหมาย"}</strong>
          <small>{formatDateTime(getText(appointment, "start"))} - {formatDateTime(getText(appointment, "end"))}</small>
        </span>
      </div>
      <p>{getText(appointment, "location")}</p>
      <p className="document-note">{getText(appointment, "checkinInstruction")}</p>
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

function InfoList({ title, items, primaryKey, secondaryKey, suffixKey }: { title: string; items: ListItem[]; primaryKey: string; secondaryKey?: string; suffixKey?: string }) {
  if (!items.length) return null;
  return (
    <div className="document-list-panel">
      <h4>{title}</h4>
      {items.slice(0, 6).map((item, index) => (
        <div key={`${getText(item, primaryKey) ?? index}`}>
          <span><strong>{getText(item, primaryKey) ?? "-"}</strong><small>{[getText(item, secondaryKey), getText(item, suffixKey)].filter(Boolean).join(" ")}</small></span>
        </div>
      ))}
    </div>
  );
}

function fieldsForDocument(card: WalletCard, subject: Record<string, unknown>, patient: Record<string, unknown>): Field[] {
  const fields: Record<string, Field[]> = {
    patient_identity: [
      { label: "HN", value: getText(patient, "hn") },
      { label: "CarePass ID", value: getText(patient, "carepassId") },
      { label: "วันเกิด", value: formatDate(getText(patient, "birthDate")) },
      { label: "สัญชาติ", value: getText(patient, "nationality") }
    ],
    staff_identity: [
      { label: "รหัสเจ้าหน้าที่", value: getNested(subject, ["staff", "employeeId"]) ?? getText(patient, "carepassId") },
      { label: "ตำแหน่ง", value: getNested(subject, ["staff", "role"]) },
      { label: "หน่วยงาน", value: getNested(subject, ["staff", "department"]) },
      { label: "อีเมล", value: getText(patient, "email") }
    ],
    insurance_eligibility: [
      { label: "ผู้รับประกัน", value: getNested(subject, ["coverage", "payer", "nameEn"]) ?? getNested(subject, ["payer", "name"]) },
      { label: "สถานะสิทธิ", value: getNested(subject, ["coverage", "status"]) ?? getNested(subject, ["payer", "status"]) },
      { label: "เครือข่าย", value: getNested(subject, ["coverage", "network"]) },
      { label: "ตรวจสอบล่าสุด", value: formatDateTime(getNested(subject, ["coverage", "lastCheckedAt"])) }
    ],
    medical_certificate: [
      { label: "เลขที่ใบรับรอง", value: getNested(subject, ["certificate", "certificateNo"]) },
      { label: "ประเภท", value: getNested(subject, ["certificate", "type"]) },
      { label: "วันที่ตรวจ", value: formatDate(getNested(subject, ["certificate", "examinationDate"])) },
      { label: "ใช้ได้ถึง", value: formatDate(getNested(subject, ["certificate", "validUntil"])) },
      { label: "ผลการตรวจ", value: getNested(subject, ["certificate", "result"]) ?? (getNested(subject, ["certificate", "fitForWork"]) === true ? "สามารถทำงานหรือเข้ารับบริการได้ตามแพทย์เห็นสมควร" : undefined) },
      { label: "ข้อจำกัด", value: getNested(subject, ["certificate", "restrictions"]) }
    ],
    referral_vc: [
      { label: "เลขที่ส่งต่อ", value: getNested(subject, ["referral", "referralNo"]) },
      { label: "จาก", value: getNested(subject, ["referral", "fromHospital"]) ?? getNested(subject, ["referral", "from"]) },
      { label: "ถึง", value: getNested(subject, ["referral", "toHospital"]) ?? getNested(subject, ["referral", "to"]) },
      { label: "บริการที่ขอ", value: getNested(subject, ["referral", "requestedService"]) },
      { label: "เหตุผล", value: getNested(subject, ["referral", "reason"]) }
    ],
    discharge_summary: [
      { label: "เลขที่ Admit", value: getNested(subject, ["dischargeSummary", "admissionNo"]) },
      { label: "วันที่ Admit", value: formatDate(getNested(subject, ["dischargeSummary", "admissionDate"])) },
      { label: "วันที่จำหน่าย", value: formatDate(getNested(subject, ["dischargeSummary", "dischargeDate"])) },
      { label: "วินิจฉัยหลัก", value: getNested(subject, ["dischargeSummary", "principalDiagnosis", "display"]) },
      { label: "แผนติดตาม", value: getNested(subject, ["dischargeSummary", "followUp"]) }
    ],
    consent_receipt: [
      { label: "สถานะ", value: getNested(subject, ["consent", "status"]) },
      { label: "วัตถุประสงค์", value: getNested(subject, ["consent", "purpose"]) },
      { label: "ผู้รับข้อมูล", value: getNested(subject, ["consent", "recipient"]) },
      { label: "หมดอายุ", value: formatDateTime(getNested(subject, ["consent", "expiresAt"])) }
    ],
    mpi_link_certificate: [
      { label: "Golden Record", value: getNested(subject, ["mpi", "goldenRecordId"]) },
      { label: "ความเชื่อมั่น", value: getNested(subject, ["mpi", "confidence"]) },
      { label: "นโยบายจับคู่", value: getNested(subject, ["mpi", "matchingPolicy"]) },
      { label: "ตรวจทานโดย", value: getNested(subject, ["mpi", "reviewedBy"]) }
    ],
    travel_document_verification: [
      { label: "Passport", value: getNested(subject, ["travelDocument", "passportNoMasked"]) ?? getNested(subject, ["travel", "passport"]) },
      { label: "ประเทศออกเอกสาร", value: getNested(subject, ["travelDocument", "issuingCountry"]) },
      { label: "ยืนยันจาก", value: getNested(subject, ["travelDocument", "verifiedAgainst"]) },
      { label: "ช่วงเดินทาง", value: getNested(subject, ["travelDocument", "travelWindow"]) },
      { label: "สัญชาติ", value: getNested(subject, ["travel", "nationality"]) }
    ],
    visa_support_letter: [
      { label: "เลขที่จดหมาย", value: getNested(subject, ["visaSupportLetter", "letterNo"]) },
      { label: "วัตถุประสงค์", value: getNested(subject, ["visaSupportLetter", "purpose"]) },
      { label: "แผนกที่รับ", value: getNested(subject, ["visaSupportLetter", "receivingDepartment"]) },
      { label: "ช่วงเข้ารับบริการ", value: getNested(subject, ["visaSupportLetter", "proposedVisitPeriod"]) }
    ],
    guarantee_letter: [
      { label: "เลขที่ Guarantee", value: getNested(subject, ["guaranteeLetter", "guaranteeNo"]) },
      { label: "Payer", value: getNested(subject, ["guaranteeLetter", "payer"]) },
      { label: "Pre-auth", value: getNested(subject, ["guaranteeLetter", "preAuthNo"]) },
      { label: "วงเงิน", value: getNested(subject, ["guaranteeLetter", "guaranteeLimit"]) }
    ],
    sync_receipt: [
      { label: "Sync ID", value: getNested(subject, ["syncReceipt", "syncId"]) },
      { label: "ต้นทาง", value: getNested(subject, ["syncReceipt", "sourceSystem"]) },
      { label: "ปลายทาง", value: getNested(subject, ["syncReceipt", "targetSystem"]) },
      { label: "สถานะ", value: getNested(subject, ["syncReceipt", "status"]) }
    ]
  };

  return fields[card.cardType] ?? [
    { label: "ประเภท", value: card.displayName },
    { label: "หมวดหมู่", value: card.documentCategory },
    { label: "ออกเมื่อ", value: formatDate(card.issuedAt) },
    { label: "หมดอายุ", value: formatDate(card.expiresAt) }
  ];
}

function documentNarrative(card: WalletCard, subject: Record<string, unknown>, patient: Record<string, unknown>): { title: string; body: string; sections: string[]; sourceSystem?: string } {
  const humanDocument = getObject(subject, "humanDocument");
  const patientName = getText(patient, "fullNameTh") ?? getText(patient, "nameTh") ?? getText(patient, "name") ?? "ผู้ถือเอกสาร";
  const sourceSystem = getText(humanDocument, "sourceSystem") ?? getText(getObject(card.credentialData, "trustcare"), "sourceSystem");
  const sections = getStringArray(humanDocument, "sections");
  const map: Record<string, { title: string; body: string }> = {
    patient_identity: {
      title: "บัตรยืนยันตัวตนผู้ป่วย",
      body: `ใช้ยืนยันตัวตนและเลขประจำตัวผู้ป่วยของ ${patientName} ก่อนรับบริการหรือเชื่อมโยงข้อมูลข้ามหน่วยบริการ`
    },
    staff_identity: {
      title: "บัตรยืนยันสิทธิ์เจ้าหน้าที่",
      body: "ใช้ยืนยันบทบาท หน่วยงาน และสิทธิ์การปฏิบัติงานของเจ้าหน้าที่ที่เกี่ยวข้องกับการตรวจสอบหรือออกเอกสาร"
    },
    consent_receipt: {
      title: "หลักฐานความยินยอม",
      body: "แสดงวัตถุประสงค์ ขอบเขตข้อมูล ผู้รับข้อมูล และเวลาหมดอายุของการยินยอม เพื่อให้การเปิดเผยข้อมูลมีขอบเขตชัดเจน"
    },
    mpi_link_certificate: {
      title: "หนังสือรับรองการเชื่อมโยงตัวตน MPI",
      body: "ใช้แสดงความสัมพันธ์ของหมายเลขผู้ป่วยในหลายหน่วยบริการ พร้อมระดับความเชื่อมั่นและผู้ตรวจทาน"
    },
    patient_summary: {
      title: "สรุปข้อมูลสุขภาพสำหรับการดูแลต่อเนื่อง",
      body: "รวมปัญหาสุขภาพสำคัญ ยาประจำ ประวัติแพ้ยา สัญญาณชีพ และแผนดูแล เพื่อช่วยให้หน่วยบริการใหม่ประเมินผู้ป่วยได้เร็วขึ้น"
    },
    allergy_alert: {
      title: "เอกสารเตือนความปลอดภัย",
      body: "เน้นสารก่อแพ้ ความรุนแรง ปฏิกิริยา และคำแนะนำฉุกเฉิน เพื่อช่วยลดความเสี่ยงก่อนสั่งยา ตรวจ หรือทำหัตถการ"
    },
    immunization: {
      title: "ประวัติการได้รับวัคซีน",
      body: "แสดงรายการวัคซีน วันที่ได้รับ หมายเลข lot และผู้ให้บริการ ใช้ประกอบการคัดกรองหรือวางแผนการดูแล"
    },
    medical_certificate: {
      title: "ใบรับรองแพทย์แบบพิมพ์ได้",
      body: "แสดงผลการตรวจ เหตุผลรับรอง ข้อจำกัด และผู้รับรอง เหมาะสำหรับใช้กับนายจ้าง หน่วยบริการ หรือหน่วยงานที่ต้องตรวจแหล่งที่มา"
    },
    medication_summary: {
      title: "สรุปรายการยาปัจจุบัน",
      body: "ช่วยทำ medication reconciliation โดยแสดงชื่อยา ขนาด วิธีใช้ ข้อบ่งใช้ และสถานะล่าสุดก่อนเข้ารับบริการ"
    },
    prescription: {
      title: "ใบสั่งยา",
      body: "แสดงรายการยาที่แพทย์สั่ง ปริมาณ วิธีใช้ การ refill และหมายเหตุสำหรับห้องยา"
    },
    pharmacy_dispense: {
      title: "ใบจ่ายยา",
      body: "แสดงรายการยาที่จ่ายจริง จำนวน lot และคำแนะนำจากเภสัชกร ใช้ตรวจสอบความต่อเนื่องของการใช้ยา"
    },
    lab_result: {
      title: "รายงานผลตรวจทางห้องปฏิบัติการ",
      body: "แสดง specimen เวลารายงาน ผลตรวจ ค่าอ้างอิง และ flag ผิดปกติ เพื่อให้แพทย์อ่านผลได้ทันที"
    },
    diagnostic_report: {
      title: "รายงานการตรวจวินิจฉัย",
      body: "แสดงวิธีตรวจ ผลสรุป ค่าที่รายงาน และผู้รายงาน เหมาะสำหรับส่งต่อหรือประกอบการดูแลต่อเนื่อง"
    },
    referral_vc: {
      title: "หนังสือส่งต่อการรักษา",
      body: "บอกหน่วยบริการต้นทาง ปลายทาง เหตุผลส่งต่อ บริการที่ขอ และรายการเอกสารแนบในชุดส่งต่อ"
    },
    discharge_summary: {
      title: "สรุปการจำหน่าย",
      body: "รวมวันรับไว้ วันจำหน่าย วินิจฉัยหลัก course ในโรงพยาบาล ยากลับบ้าน และแผนติดตามหลังจำหน่าย"
    },
    insurance_eligibility: {
      title: "ผลตรวจสอบสิทธิประกัน",
      body: "แสดง payer สถานะสิทธิ ช่วงคุ้มครอง วงเงิน และยอดคงเหลือ เพื่อใช้ก่อนรับบริการหรือส่งเคลม"
    },
    claim_package: {
      title: "ชุดเอกสารเคลม",
      body: "รวม diagnosis, service lines, เอกสารแนบ และยอดรวมสำหรับส่งต่อ payer หรือระบบ claim"
    },
    claim_receipt: {
      title: "ใบเสร็จรับเงิน",
      body: "แสดง invoice, รายการค่าบริการ วิธีชำระเงิน ยอดสุทธิ และส่วนรับผิดชอบของ payer/patient"
    },
    travel_document_verification: {
      title: "เอกสารยืนยันข้อมูลเดินทาง",
      body: "ใช้ตรวจข้อมูล passport และช่วงเดินทางสำหรับผู้ป่วยต่างชาติหรือ medical tourism"
    },
    visa_support_letter: {
      title: "จดหมายสนับสนุนการขอวีซ่า",
      body: "อธิบายเหตุผลทางการแพทย์ ช่วงเข้ารับบริการ แผนกที่รับ และแพทย์ผู้รับผิดชอบ โดยไม่ใช่การอนุมัติวีซ่า"
    },
    quotation: {
      title: "ใบเสนอราคาการรักษา",
      body: "แสดง package รายการค่าใช้จ่าย ยอดประมาณการ และข้อยกเว้น เพื่อใช้วางแผนก่อนรับบริการ"
    },
    guarantee_letter: {
      title: "หนังสือรับรองการชำระ/ค้ำประกัน",
      body: "แสดง payer, pre-authorization, บริการที่คุ้มครอง วงเงิน และเงื่อนไขก่อนให้บริการ"
    },
    shl_manifest: {
      title: "SMART Health Link Manifest",
      body: "แสดงไฟล์ใน SHL, hash, access policy และ binding กับ Manifest VC/Holder VP เฉพาะกรณีที่ TrustCare ตรวจรับรองแล้ว"
    },
    sync_receipt: {
      title: "ใบรับการนำเข้า/ซิงก์ข้อมูล",
      body: "ยืนยันต้นทาง ปลายทาง จำนวนวัตถุที่ซิงก์ checksum และ adapter version เพื่อ audit การเคลื่อนย้ายข้อมูล"
    },
    appointment: {
      title: "ใบนัดหมายและคำแนะนำ check-in",
      body: "แสดงเวลานัด สถานที่ แพทย์/แผนก และเอกสารที่ต้องเตรียมก่อนเข้ารับบริการ"
    }
  };
  const fallback = map[card.cardType] ?? {
    title: card.displayName,
    body: "เอกสารนี้ถูกจัดเก็บเป็น Verifiable Credential พร้อม DocumentReference evidence เพื่อให้ตรวจสอบแหล่งที่มาและใช้แลกเปลี่ยนแบบมีขอบเขตได้"
  };
  return { ...fallback, sections, sourceSystem };
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
    appointment: <Calendar size={20} />
  };
  return map[cardType] ?? <FileText size={20} />;
}

function documentVariant(cardType: string): string {
  if (cardType.includes("identity")) return "identity";
  if (["lab_result", "diagnostic_report"].includes(cardType)) return "diagnostic";
  if (["prescription", "medication_summary", "pharmacy_dispense"].includes(cardType)) return "medication";
  if (["claim_package", "claim_receipt", "quotation", "guarantee_letter", "insurance_eligibility"].includes(cardType)) return "finance";
  if (cardType === "allergy_alert") return "alert";
  if (cardType === "shl_manifest") return "manifest";
  return "clinical";
}

function documentAccent(cardType: string): string {
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
    appointment: "#4f46e5"
  };
  return map[cardType] ?? "#405a9b";
}

function documentKindLabel(cardType: string): string {
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
    visa_support_letter: "Visa support letter",
    quotation: "Treatment quotation",
    guarantee_letter: "Guarantee letter",
    shl_manifest: "SHL manifest",
    sync_receipt: "Sync receipt",
    appointment: "Appointment slip"
  };
  return map[cardType] ?? "Clinical document";
}

function logoText(value: string): string {
  const upper = value.toUpperCase();
  if (upper.includes("RAMKHAMHAENG")) return "RU";
  if (upper.includes("HEALTHPASS")) return "HP";
  return "TC";
}

function getObject(source: unknown, key: string): Record<string, unknown> | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function getText(source: unknown, key?: string): string | undefined {
  const value = key ? getNested(source, [key]) : source;
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function getArray(source: unknown, key: string): ListItem[] {
  const value = getNested(source, [key]);
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object").map(item => item as ListItem) : [];
}

function getStringArray(source: unknown, key: string): string[] {
  const value = getNested(source, [key]);
  return Array.isArray(value) ? value.filter(item => typeof item === "string").map(String) : [];
}

function arrayToItems(value: unknown): ListItem[] {
  return Array.isArray(value) ? value.map(item => ({ label: formatValue(item) })) : [];
}

function getNested(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function formatDate(value: unknown): string {
  if (!hasValue(value)) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("th-TH");
}

function formatDateTime(value: unknown): string {
  if (!hasValue(value)) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("th-TH");
}

function formatMoney(amount: unknown, currency: unknown): string {
  const numeric = Number(amount);
  if (Number.isFinite(numeric)) return `${numeric.toLocaleString("th-TH")} ${String(currency ?? "THB")}`;
  return formatValue(amount);
}

function formatPeriod(period?: Record<string, unknown>): string {
  if (!period) return "-";
  const start = formatDate(getText(period, "start"));
  const end = formatDate(getText(period, "end"));
  return [start, end].filter(value => value !== "-").join(" - ") || "-";
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (!hasValue(value)) return "-";
  if (Array.isArray(value)) return value.map(item => formatValue(item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => hasValue(entry))
      .map(([key, entry]) => `${key}: ${formatValue(entry)}`)
      .join(" · ");
  }
  return String(value);
}

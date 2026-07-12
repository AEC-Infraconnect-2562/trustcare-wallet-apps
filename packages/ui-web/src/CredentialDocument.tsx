import {
  Building2,
  FileText,
  ImageOff,
  Landmark,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
  credentialRenderModelFromCard,
  displayCredentialValue,
  photoBearingCredentialTypes,
  photoCandidatesForCard,
  presentationEnvelopeFromWalletCard,
  type CredentialPaperModel,
  type CredentialPaperSection,
  type CredentialRenderField,
  type PhotoCandidate,
  type PortablePresentationEnvelope,
  type WalletCard,
} from "@trustcare/wallet-core";
import { useLoadedPhotoCandidate } from "./useLoadedPhotoCandidate";

const photoDocumentTypes = new Set<string>(photoBearingCredentialTypes);
const requiredVerificationChecks = [
  ["proof", "signature"],
  ["issuer", "issuer_key", "evidence_issuer"],
  ["status", "portal_status", "evidence_status"],
  ["expiry"],
  ["policy", "evidence_policy"],
] as const;

export type CredentialDocumentVerification = {
  verified: boolean;
  checklist?: Array<{
    key?: string;
    label?: string;
    ok?: boolean;
    detail?: string;
  }>;
  checkedAt?: string;
  publicUrl?: string;
  warnings?: string[];
  errors?: string[];
};

export function CredentialDocument({
  card,
  qrDataUrl,
  compact = false,
  envelope,
  verification,
}: {
  card: WalletCard;
  qrDataUrl?: string;
  compact?: boolean;
  envelope?: PortablePresentationEnvelope;
  verification?: CredentialDocumentVerification;
}) {
  const renderModel = credentialRenderModelFromCard(card);
  const paper = renderModel.paper;
  const presentation = envelope ?? presentationEnvelopeFromWalletCard(card);
  const photoCandidates = photoDocumentTypes.has(renderModel.documentType)
    ? photoCandidatesForCard(card)
    : [];
  const photoRequired = photoDocumentTypes.has(renderModel.documentType);

  if (paper.formFactor.kind === "iso_id_1") {
    return (
      <CredentialIdentityCard
        paper={paper}
        photos={photoCandidates}
        photoRequired={photoRequired}
        envelope={presentation}
        qrDataUrl={qrDataUrl}
        verification={verification}
        variant={renderModel.variant}
        documentType={renderModel.documentType}
      />
    );
  }

  return (
    <article
      className={`credential-doc tc-clinical-paper tc-form-a4-portrait document-${renderModel.variant}${compact ? " credential-doc-compact" : ""}`}
      data-document-type={renderModel.documentType}
      data-document-form-factor={paper.formFactor.kind}
      data-generic-renderer={paper.generic ? "true" : "false"}
      lang="th"
    >
      {paper.watermark ? (
        <div className="tc-watermark" aria-hidden="true">
          {paper.watermark}
        </div>
      ) : null}

      <InstitutionLetterhead paper={paper} />
      <DocumentTitle paper={paper} />
      <DocumentMetadata fields={paper.metadataFields} />
      <PatientBlock
        fields={paper.patientFields}
        photos={photoCandidates}
        photoRequired={photoRequired}
      />

      <div className="tc-document-sections">
        {paper.sections.map((section) => (
          <PaperSectionView key={section.key} section={section} />
        ))}
      </div>

      <SignatureBlock signatories={paper.signatories} />
      <VerificationFooter
        card={card}
        envelope={presentation}
        evidence={paper.evidence}
        qrDataUrl={qrDataUrl}
        verification={verification}
      />
    </article>
  );
}

function CredentialIdentityCard({
  paper,
  photos,
  photoRequired,
  envelope,
  qrDataUrl,
  verification,
  variant,
  documentType,
}: {
  paper: CredentialPaperModel;
  photos: PhotoCandidate[];
  photoRequired: boolean;
  envelope: PortablePresentationEnvelope;
  qrDataUrl?: string;
  verification?: CredentialDocumentVerification;
  variant: string;
  documentType: string;
}) {
  const nameTh = paper.patientFields.find(
    (field) => field.label === "ชื่อ-นามสกุล",
  );
  const nameEn = paper.patientFields.find((field) => field.label === "Name");
  const identifiers = paper.patientFields
    .filter((field) =>
      ["HN", "CarePass ID", "เลขประจำตัว"].includes(field.label),
    )
    .slice(0, 2);
  const issuedAt = paper.metadataFields.find(
    (field) => field.path === "document.issuedAt",
  );
  const expiresAt = paper.metadataFields.find(
    (field) => field.path === "document.expiresAt",
  );
  const documentStatus = paper.metadataFields.find(
    (field) => field.path === "document.status",
  );
  const trust = verificationPresentation(envelope, verification);
  const trustLabel =
    trust.tone === "verified"
      ? "ตรวจสอบที่มาแล้ว"
      : trust.tone === "invalid"
        ? "ตรวจสอบไม่ผ่าน"
        : "ยังไม่ได้ตรวจสอบ";
  const issuerName = paper.letterhead.nameTh ?? paper.letterhead.nameEn;

  return (
    <article
      className={`credential-doc tc-clinical-paper tc-form-iso-id-1 document-${variant}`}
      data-document-type={documentType}
      data-document-form-factor={paper.formFactor.kind}
      data-generic-renderer={paper.generic ? "true" : "false"}
      aria-label={paper.title.th}
      lang="th"
    >
      {paper.watermark ? (
        <div className="tc-watermark" aria-hidden="true">
          {paper.watermark}
        </div>
      ) : null}

      <header className="tc-id-card-header">
        <div
          className={`tc-letterhead-mark${paper.letterhead.logoUrl ? " has-logo" : " neutral"}`}
          aria-hidden="true"
        >
          {paper.letterhead.logoUrl ? (
            <img src={paper.letterhead.logoUrl} alt="" />
          ) : (
            issuerIcon(paper.issuerRole)
          )}
        </div>
        <div className="tc-id-card-issuer">
          <strong>
            {issuerName ?? "ไม่พบชื่อผู้ออกเอกสารในข้อมูลต้นฉบับ"}
          </strong>
          {paper.letterhead.nameTh && paper.letterhead.nameEn ? (
            <span>{paper.letterhead.nameEn}</span>
          ) : null}
        </div>
        {documentStatus ? (
          <span className="tc-id-card-status">
            {renderValue(documentStatus.value)}
          </span>
        ) : null}
      </header>

      <section className="tc-id-card-main">
        <CredentialHolderPhoto candidates={photos} required={photoRequired} />
        <div className="tc-id-card-holder">
          <p>{paper.title.th}</p>
          <h1>
            {nameTh
              ? renderValue(nameTh.value)
              : "ไม่พบชื่อผู้ถือเอกสารในข้อมูลต้นฉบับ"}
          </h1>
          {nameEn ? <span>{renderValue(nameEn.value)}</span> : null}
          <dl className="tc-id-card-identifiers">
            {identifiers.map((field) => (
              <div key={field.path ?? field.label}>
                <dt>{field.label}</dt>
                <dd>{renderValue(field.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="tc-id-card-footer">
        <dl className="tc-id-card-validity">
          {issuedAt ? (
            <div>
              <dt>ออกเมื่อ</dt>
              <dd>{renderValue(issuedAt.value)}</dd>
            </div>
          ) : null}
          {expiresAt ? (
            <div>
              <dt>ใช้ได้ถึง</dt>
              <dd>{renderValue(expiresAt.value)}</dd>
            </div>
          ) : null}
        </dl>
        <div className={`tc-id-card-trust tone-${trust.tone}`}>
          {trust.tone === "verified" ? (
            <ShieldCheck size={14} aria-hidden="true" />
          ) : (
            <ShieldAlert size={14} aria-hidden="true" />
          )}
          <span>{trustLabel}</span>
        </div>
        {qrDataUrl ? (
          <img
            className="tc-id-card-qr"
            src={qrDataUrl}
            alt="QR สำหรับตรวจเอกสารนี้"
          />
        ) : null}
      </footer>
    </article>
  );
}

function InstitutionLetterhead({ paper }: { paper: CredentialPaperModel }) {
  const { letterhead } = paper;
  const hasIssuerName = Boolean(letterhead.nameTh || letterhead.nameEn);
  const contacts = [
    letterhead.address,
    letterhead.phone,
    letterhead.identifier
      ? `เลขใบอนุญาต / License: ${letterhead.identifier}`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  return (
    <header className="tc-letterhead">
      <div
        className={`tc-letterhead-mark${letterhead.logoUrl ? " has-logo" : " neutral"}`}
        aria-label={letterhead.logoUrl ? "ตราสัญลักษณ์ผู้ออกเอกสาร" : undefined}
      >
        {letterhead.logoUrl ? (
          <img src={letterhead.logoUrl} alt="" />
        ) : (
          issuerIcon(paper.issuerRole)
        )}
      </div>
      <div className="tc-letterhead-copy">
        {hasIssuerName ? (
          <>
            {letterhead.nameTh ? <h2>{letterhead.nameTh}</h2> : null}
            {letterhead.nameEn ? <p>{letterhead.nameEn}</p> : null}
          </>
        ) : (
          <p className="tc-missing-value">
            ไม่พบชื่อผู้ออกเอกสารในข้อมูลต้นฉบับ
          </p>
        )}
        <small className="tc-issuer-role">
          {paper.issuerRole ?? "ผู้ออกเอกสาร / Issuer"}
        </small>
      </div>
      {contacts.length ? (
        <address className="tc-letterhead-contacts">
          {contacts.map((contact) => (
            <span key={contact}>{contact}</span>
          ))}
        </address>
      ) : null}
    </header>
  );
}

function DocumentTitle({ paper }: { paper: CredentialPaperModel }) {
  return (
    <section className="tc-doc-title" aria-labelledby="credential-paper-title">
      <h1 id="credential-paper-title">{paper.title.th}</h1>
      {paper.title.en ? <p>{paper.title.en}</p> : null}
      {paper.generic ? (
        <span className="tc-status">
          <FileText size={14} aria-hidden="true" />
          รูปแบบทั่วไป / Generic view
        </span>
      ) : null}
    </section>
  );
}

function DocumentMetadata({ fields }: { fields: CredentialRenderField[] }) {
  const primaryFields = fields.filter(
    (field) =>
      field.path !== "credential.id" && field.path !== "credential.issuer",
  );
  if (!primaryFields.length) return null;
  return (
    <dl className="tc-doc-meta" aria-label="Document metadata">
      {primaryFields.map((field) => (
        <div key={field.path ?? field.label}>
          <dt>{field.label}</dt>
          <dd>{renderValue(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PatientBlock({
  fields,
  photos,
  photoRequired,
}: {
  fields: CredentialRenderField[];
  photos: PhotoCandidate[];
  photoRequired: boolean;
}) {
  if (!fields.length && !photos.length) return null;
  const nameTh = fields.find((field) => field.label === "ชื่อ-นามสกุล");
  const nameEn = fields.find((field) => field.label === "Name");
  const detailFields = fields.filter(
    (field) => field !== nameTh && field !== nameEn,
  );

  return (
    <section
      className="tc-patient"
      aria-labelledby="credential-patient-heading"
    >
      <CredentialHolderPhoto candidates={photos} required={photoRequired} />
      <div className="tc-patient-content">
        <div className="tc-section-heading tc-patient-heading">
          <span id="credential-patient-heading">ข้อมูลผู้ป่วย</span>
          <small>PATIENT INFORMATION</small>
        </div>
        {nameTh ? <h3>{renderValue(nameTh.value)}</h3> : null}
        {nameEn ? (
          <p className="tc-patient-name-en">{renderValue(nameEn.value)}</p>
        ) : null}
        <FieldList fields={detailFields} className="tc-patient-grid" />
      </div>
    </section>
  );
}

function CredentialHolderPhoto({
  candidates,
  required = false,
}: {
  candidates: PhotoCandidate[];
  required?: boolean;
}) {
  const { candidate, imageSrc, isLoaded, markFailed, markLoaded } =
    useLoadedPhotoCandidate(candidates);
  if (!candidate || !imageSrc) {
    return required ? (
      <figure
        className="tc-patient-photo tc-patient-photo-missing"
        role="status"
        aria-label="ไม่พบรูปผู้ถือเอกสารใน credential ต้นฉบับ"
      >
        <ImageOff aria-hidden="true" />
        <figcaption>ไม่พบรูปใน credential</figcaption>
      </figure>
    ) : null;
  }
  return (
    <figure className="tc-patient-photo">
      <img
        key={imageSrc}
        src={imageSrc}
        alt={isLoaded ? "รูปผู้ถือเอกสารจาก credential เดียวกัน" : ""}
        style={{ opacity: isLoaded ? 1 : 0 }}
        onLoad={markLoaded}
        onError={markFailed}
      />
    </figure>
  );
}

function PaperSectionView({ section }: { section: CredentialPaperSection }) {
  const className = `tc-section tc-section-${section.kind}${section.tone ? ` tone-${section.tone}` : ""}`;
  return (
    <section className={className} data-source-path={section.sourcePath}>
      <div className="tc-section-heading">
        <span>{section.title}</span>
        {section.titleEn ? <small>{section.titleEn}</small> : null}
      </div>
      {section.kind === "fields" ? (
        <FieldList fields={section.fields ?? []} />
      ) : null}
      {section.kind === "table" ? <PaperTable section={section} /> : null}
      {section.kind === "note" || section.kind === "letter" ? (
        <div className={`tc-note tc-note-${section.kind}`}>
          <PaperBody value={section.body} />
        </div>
      ) : null}
      {section.kind === "alert" ? (
        <div className="tc-alert">
          <ShieldAlert size={18} aria-hidden="true" />
          {section.fields?.length ? (
            <FieldList fields={section.fields} />
          ) : null}
          {section.body !== undefined ? (
            <PaperBody value={section.body} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FieldList({
  fields,
  className = "tc-kv-grid",
}: {
  fields: CredentialRenderField[];
  className?: string;
}) {
  const visible = fields.filter((field) => hasValue(field.value));
  if (!visible.length) return null;
  return (
    <dl className={className}>
      {visible.map((field) => (
        <div className="tc-kv-row" key={field.path ?? field.label}>
          <dt>{field.label}</dt>
          <dd>{renderValue(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PaperTable({ section }: { section: CredentialPaperSection }) {
  const columns = section.columns ?? [];
  const rows = section.rows ?? [];
  if (!columns.length || !rows.length) return null;
  return (
    <div className="tc-table-wrap">
      <table className="tc-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === "end" ? "tc-number" : undefined}
              >
                <span>{column.label}</span>
                {column.labelEn ? <small>{column.labelEn}</small> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${section.key}:${rowIndex}`}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === "end" ? "tc-number" : undefined}
                >
                  {renderValue(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaperBody({ value }: { value: unknown }) {
  if (!hasValue(value)) return null;
  if (Array.isArray(value)) {
    return (
      <ul className="tc-value-list">
        {value.filter(hasValue).map((item, index) => (
          <li key={index}>
            {isRecord(item) ? <PaperRecord value={item} /> : renderValue(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(value)) return <PaperRecord value={value} />;
  return <p>{renderValue(value)}</p>;
}

function PaperRecord({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => hasValue(item));
  if (!entries.length) return null;
  return (
    <dl className="tc-kv-grid tc-record-grid">
      {entries.map(([key, item]) => (
        <div className="tc-kv-row" key={key}>
          <dt>{key}</dt>
          <dd>{renderValue(item)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SignatureBlock({
  signatories,
}: {
  signatories: CredentialPaperModel["signatories"];
}) {
  if (!signatories.length) return null;
  return (
    <section className="tc-signature-list" aria-label="Document signatories">
      {signatories.map((signatory, index) => (
        <div
          className="tc-signature"
          key={`${signatory.name ?? "signatory"}:${index}`}
        >
          {signatory.name ? <strong>{signatory.name}</strong> : null}
          {signatory.role ? <span>{signatory.role}</span> : null}
          {signatory.licenseNo ? <small>{signatory.licenseNo}</small> : null}
          {signatory.organization ? (
            <small>{signatory.organization}</small>
          ) : null}
          {signatory.signedAt ? (
            <small>{formatDateTime(signatory.signedAt)}</small>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function VerificationFooter({
  card,
  envelope,
  evidence,
  qrDataUrl,
  verification,
}: {
  card: WalletCard;
  envelope: PortablePresentationEnvelope;
  evidence: CredentialPaperModel["evidence"];
  qrDataUrl?: string;
  verification?: CredentialDocumentVerification;
}) {
  const result = verificationPresentation(envelope, verification);
  const evidenceLabels = evidence
    .map(
      (item) => stringValue(item.type) ?? stringValue(item.documentReferenceId),
    )
    .filter((value): value is string => Boolean(value));
  const digest = envelope.evidence.hashes[0];
  const publicUrl =
    verification?.publicUrl ??
    (envelope.qr?.canonicalPayload?.startsWith("http")
      ? envelope.qr.canonicalPayload
      : undefined);

  return (
    <footer className={`tc-verification tone-${result.tone}`}>
      <div className="tc-verification-content">
        <div className="tc-verification-heading">
          {result.tone === "verified" ? (
            <ShieldCheck size={17} aria-hidden="true" />
          ) : (
            <ShieldAlert size={17} aria-hidden="true" />
          )}
          <span>
            <strong>{result.label}</strong>
            <small>{result.detail}</small>
          </span>
        </div>
        <dl className="tc-verification-list">
          <div>
            <dt>
              {envelope.kind === "presentation"
                ? "Presentation ID"
                : "Credential ID"}
            </dt>
            <dd className="mono">
              {envelope.kind === "presentation"
                ? envelope.envelopeId
                : String(card.credentialId)}
            </dd>
          </div>
          {envelope.issuer?.did ? (
            <div>
              <dt>Issuer DID</dt>
              <dd className="mono">{envelope.issuer.did}</dd>
            </div>
          ) : null}
          {envelope.policy.purpose ? (
            <div>
              <dt>Purpose</dt>
              <dd>{envelope.policy.purpose}</dd>
            </div>
          ) : null}
          {envelope.policy.audience ? (
            <div>
              <dt>Audience</dt>
              <dd>{envelope.policy.audience}</dd>
            </div>
          ) : null}
          {envelope.policy.expiresAt ? (
            <div>
              <dt>Expires</dt>
              <dd>{formatDateTime(envelope.policy.expiresAt)}</dd>
            </div>
          ) : null}
          {evidenceLabels.length ? (
            <div>
              <dt>Evidence</dt>
              <dd>{evidenceLabels.join(", ")}</dd>
            </div>
          ) : null}
          {digest ? (
            <div>
              <dt>Digest</dt>
              <dd className="mono">{digest}</dd>
            </div>
          ) : null}
          {publicUrl ? (
            <div>
              <dt>Verifier URL</dt>
              <dd className="mono">{publicUrl}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {qrDataUrl ? <img src={qrDataUrl} alt="QR สำหรับตรวจ VP นี้" /> : null}
    </footer>
  );
}

function verificationPresentation(
  envelope: PortablePresentationEnvelope,
  verification?: CredentialDocumentVerification,
): {
  tone: "verified" | "warning" | "invalid" | "neutral";
  label: string;
  detail: string;
} {
  const checklist = verification?.checklist ?? [];
  if (credentialDocumentVerificationPassed(verification)) {
    return {
      tone: "verified",
      label: "ตรวจสอบ proof, issuer, status, expiry และ policy ผ่านแล้ว",
      detail: verification?.checkedAt
        ? `ตรวจเมื่อ ${formatDateTime(verification.checkedAt)}`
        : "ผลตรวจจาก Public Verifier",
    };
  }
  if (verification) {
    const failures = checklist.filter((item) => item.ok === false).length;
    return {
      tone: verification.errors?.length ? "invalid" : "warning",
      label: "การตรวจสอบยังไม่ผ่านครบถ้วน",
      detail: failures
        ? `มี ${failures} รายการที่ยังไม่ผ่าน`
        : (verification.errors?.[0] ??
          verification.warnings?.[0] ??
          "ต้องตรวจ proof และ policy เพิ่มเติม"),
    };
  }
  const present = envelope.trust.checklist.filter(
    (item) => item.ok === true,
  ).length;
  const total = envelope.trust.checklist.length;
  return {
    tone:
      envelope.trust.status === "invalid_or_revoked" ? "invalid" : "neutral",
    label:
      envelope.kind === "presentation"
        ? "VP พร้อมให้ผู้รับตรวจสอบ"
        : "ยังไม่ได้ตรวจสอบเพื่อวัตถุประสงค์การใช้งาน",
    detail: total
      ? `มีหลักฐาน ${present}/${total} รายการใน Wallet; ผู้รับต้องตรวจ proof, status และ policy อีกครั้ง`
      : "ไม่พบผลการตรวจสอบในเอกสารนี้",
  };
}

export function credentialDocumentVerificationPassed(
  verification?: CredentialDocumentVerification,
): boolean {
  if (verification?.verified !== true || verification.errors?.length) {
    return false;
  }
  const checklist = verification.checklist ?? [];
  return requiredVerificationChecks.every((aliases) => {
    const matching = checklist.filter((item) =>
      aliases.some((alias) => alias === item.key),
    );
    return matching.length > 0 && matching.every((item) => item.ok === true);
  });
}

function issuerIcon(role?: string): ReactElement {
  const value = role?.toLowerCase() ?? "";
  if (value.includes("payer") || value.includes("insurer")) {
    return <Landmark size={28} aria-hidden="true" />;
  }
  if (value.includes("wallet") || value.includes("holder")) {
    return <ShieldCheck size={28} aria-hidden="true" />;
  }
  return <Building2 size={28} aria-hidden="true" />;
}

function renderValue(value: unknown): ReactNode {
  if (!hasValue(value)) return "-";
  if (Array.isArray(value)) {
    return value.map((item) => displayCredentialValue(item)).join(", ");
  }
  return displayCredentialValue(value);
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.some(hasValue);
  if (isRecord(value)) return Object.values(value).some(hasValue);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

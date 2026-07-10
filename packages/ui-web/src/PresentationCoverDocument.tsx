import { FileCheck2, ShieldAlert, ShieldCheck } from "lucide-react";
import type { CredentialDocumentVerification } from "./CredentialDocument";
import { credentialDocumentVerificationPassed } from "./CredentialDocument";

export type PresentationCoverDocumentItem = {
  id?: string;
  title: string;
  titleEn?: string;
  issuer?: string;
  issuedAt?: string;
  expiresAt?: string;
  status?: string;
};

export function PresentationCoverDocument({
  presentationId,
  holderDid,
  purpose,
  audience,
  recipient,
  createdAt,
  expiresAt,
  publicUrl,
  qrDataUrl,
  documents,
  verification,
}: {
  presentationId?: string;
  holderDid?: string;
  purpose?: string;
  audience?: string;
  recipient?: string;
  createdAt?: string;
  expiresAt?: string;
  publicUrl?: string;
  qrDataUrl?: string;
  documents: PresentationCoverDocumentItem[];
  verification?: CredentialDocumentVerification;
}) {
  const verified = credentialDocumentVerificationPassed(verification);
  const fields = [
    ["Presentation ID", presentationId],
    ["Holder DID", holderDid],
    ["วัตถุประสงค์ / Purpose", purpose],
    ["ผู้รับ / Recipient", recipient],
    ["Audience", audience],
    ["สร้างเมื่อ / Created", createdAt ? formatDateTime(createdAt) : undefined],
    ["หมดอายุ / Expires", expiresAt ? formatDateTime(expiresAt) : undefined],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article
      className="credential-doc tc-clinical-paper tc-presentation-cover"
      lang="th"
    >
      <header className="tc-presentation-cover-header">
        <span className="tc-presentation-cover-mark" aria-hidden="true">
          <FileCheck2 size={34} />
        </span>
        <span>
          <small>TRUSTCARE PUBLIC VERIFIER</small>
          <strong>ชุดเอกสารสุขภาพที่แบ่งปัน</strong>
          <span>HEALTH DOCUMENT PRESENTATION</span>
        </span>
      </header>

      <section
        className={`tc-cover-status ${verified ? "verified" : "pending"}`}
      >
        {verified ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
        <span>
          <strong>
            {verified
              ? "ตรวจ proof, issuer, status, expiry และ policy ผ่านครบแล้ว"
              : "ยังไม่ผ่านการตรวจสอบครบทุกชั้น"}
          </strong>
          <small>
            {verified
              ? "ผลนี้มาจาก Public Verifier สำหรับ VP ฉบับนี้"
              : "ตรวจผลลัพธ์และข้อผิดพลาดก่อนนำเอกสารไปใช้"}
          </small>
        </span>
      </section>

      {fields.length ? (
        <dl className="tc-cover-metadata" aria-label="Presentation metadata">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="tc-section tc-cover-manifest">
        <h2 className="tc-section-heading">
          <span>รายการเอกสารใน VP</span>
          <small>DOCUMENT MANIFEST</small>
        </h2>
        <div className="tc-table-wrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">เอกสาร / Document</th>
                <th scope="col">ผู้ออก / Issuer</th>
                <th scope="col">สถานะ / Status</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document, index) => (
                <tr key={document.id ?? `${document.title}:${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{document.title}</strong>
                    {document.titleEn ? (
                      <small>{document.titleEn}</small>
                    ) : null}
                  </td>
                  <td>{document.issuer}</td>
                  <td>{document.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tc-cover-privacy-notice">
        <strong>Purpose-bound sharing</strong>
        <p>
          VP นี้เป็นชั้นการนำเสนอ เอกสาร VC แต่ละฉบับยังคงผู้ออกและ claims
          ของตนเอง ผู้รับควรใช้ข้อมูลตามวัตถุประสงค์ ผู้รับ
          และวันหมดอายุที่ระบุไว้เท่านั้น
        </p>
      </section>

      {publicUrl || qrDataUrl ? (
        <footer className="tc-cover-verifier-link">
          <span>
            <strong>Public Verifier</strong>
            {publicUrl ? <code>{publicUrl}</code> : null}
          </span>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR สำหรับ VP ฉบับนี้" />
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

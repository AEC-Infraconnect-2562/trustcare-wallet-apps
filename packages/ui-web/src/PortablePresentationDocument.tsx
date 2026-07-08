import { BadgeCheck, FileCheck2, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { PortablePresentationEnvelope } from "@trustcare/wallet-core";
import { Badge } from "./primitives";

export function PortablePresentationDocument({
  envelope,
  compact = false,
}: {
  envelope: PortablePresentationEnvelope;
  compact?: boolean;
}) {
  return (
    <article className={`portable-envelope ${compact ? "portable-envelope-compact" : ""}`}>
      <header className="portable-envelope-header">
        <span className="portable-envelope-icon">
          {envelope.trust.badge === "red" ? <TriangleAlert size={18} /> : <ShieldCheck size={18} />}
        </span>
        <span>
          <small>{modeLabel(envelope.mode)}</small>
          <h3>{envelope.display.title}</h3>
          {envelope.display.titleEn ? <p>{envelope.display.titleEn}</p> : null}
        </span>
        <Badge tone={badgeTone(envelope.trust.badge)}>{trustStatusLabel(envelope.trust.status)}</Badge>
      </header>

      <section className="portable-envelope-grid">
        <InfoBlock label="เจ้าของเอกสาร" value={envelope.subject.displayName ?? "-"} />
        <InfoBlock label="ผู้ออกเอกสาร" value={envelope.issuer?.name ?? envelope.issuer?.did ?? "-"} />
        <InfoBlock label="ผู้ถือกระเป๋า" value={envelope.holder?.did ?? "-"} />
        <InfoBlock label="หมดอายุ" value={formatDateTime(envelope.policy.expiresAt ?? envelope.qr?.expiresAt)} />
      </section>

      {envelope.sections
        .filter((section) => section.kind !== "technical")
        .slice(0, compact ? 2 : undefined)
        .map((section) => (
          <section key={section.key} className="portable-envelope-section">
            <h4>{section.title}</h4>
            <dl>
              {section.fields.slice(0, compact ? 4 : 12).map((field) => (
                <div key={`${section.key}:${field.path ?? field.label}`}>
                  <dt>{field.label}</dt>
                  <dd>{displayValue(field.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

      {!compact ? (
        <>
          <section className="portable-envelope-section">
            <h4>
              <FileCheck2 size={16} />
              Evidence
            </h4>
            <dl>
              <div>
                <dt>DocumentReference</dt>
                <dd>{envelope.evidence.documentReferences.length} รายการ</dd>
              </div>
              <div>
                <dt>FHIR profile</dt>
                <dd>{envelope.evidence.fhirProfiles.join(", ") || "-"}</dd>
              </div>
              <div>
                <dt>Hash</dt>
                <dd>{envelope.evidence.hashes[0] ?? "-"}</dd>
              </div>
            </dl>
          </section>

          <section className="portable-envelope-section">
            <h4>
              <BadgeCheck size={16} />
              Trust checklist
            </h4>
            <ul className="portable-trust-list">
              {envelope.trust.checklist.map((item) => (
                <li key={item.key} data-ok={item.ok ? "true" : "false"}>
                  <span>{item.label}</span>
                  <strong>{item.status ?? (item.ok ? "present" : "missing")}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="portable-envelope-section">
            <h4>
              <Link2 size={16} />
              Policy
            </h4>
            <dl>
              <div>
                <dt>Purpose</dt>
                <dd>{envelope.policy.purpose ?? "-"}</dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>{envelope.policy.audience ?? "-"}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{envelope.policy.scope?.join(", ") || "-"}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </article>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="portable-envelope-info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function badgeTone(badge: PortablePresentationEnvelope["trust"]["badge"]) {
  if (badge === "green") return "green";
  if (badge === "red") return "red";
  if (badge === "yellow") return "yellow";
  return "neutral";
}

function trustStatusLabel(status: PortablePresentationEnvelope["trust"]["status"]): string {
  const labels: Record<PortablePresentationEnvelope["trust"]["status"], string> = {
    issuer_signed: "ลงนามแล้ว",
    transport_valid: "ขนส่งถูกต้อง",
    trustcare_pending: "รอรับรอง",
    trustcare_certified: "TrustCare certified",
    patient_provided_unverified: "ผู้ใช้เพิ่มเอง",
    invalid_or_revoked: "ใช้ไม่ได้",
    metadata_only: "metadata only",
    proof_missing: "ยังไม่มี proof",
  };
  return labels[status];
}

function modeLabel(mode: PortablePresentationEnvelope["mode"]): string {
  const labels: Record<PortablePresentationEnvelope["mode"], string> = {
    DirectVP: "Direct VP",
    PurposeVP: "Purpose-bound VP",
    StandardSHL: "SMART Health Link",
    CertifiedSHLManifestPackage: "Certified SHL + Manifest VP",
    SmartApiAccess: "SMART API Access",
  };
  return labels[mode];
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  return JSON.stringify(value);
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

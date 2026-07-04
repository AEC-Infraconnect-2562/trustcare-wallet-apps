import { Calendar, Hospital, IdCard, QrCode, ShieldCheck, UserRound } from "lucide-react";
import type { WalletCard } from "@trustcare/wallet-core";
import { initialsFromName } from "@trustcare/wallet-core";
import { Badge } from "./primitives";

export function CredentialDocument({ card, qrDataUrl, compact = false }: { card: WalletCard; qrDataUrl?: string; compact?: boolean }) {
  const subject = (card.credentialData?.credentialSubject ?? card.credentialData ?? {}) as Record<string, any>;
  const renderData = subject.humanDocument?.renderData;
  const patient = renderData?.patient ?? subject.patient ?? subject.student ?? {};
  const hospital = renderData?.hospital ?? subject.organization ?? {};
  const displayNameTh = patient.fullNameTh ?? patient.nameTh ?? "นายธนกร เรียนดี";
  const displayNameEn = patient.fullNameEn ?? patient.nameEn ?? "Mr. Thanakorn Riandee";
  const idText = patient.carepassId ?? patient.studentId ?? patient.hn ?? "TC-6501001001";
  const issuer = hospital.nameTh ?? card.issuerHospitalName ?? "TrustCare Central Hospital";
  const issuerEn = hospital.nameEn ?? "TRUSTCARE HOSPITAL NETWORK";

  return (
    <article className={compact ? "credential-doc credential-doc-compact" : "credential-doc"}>
      <div className="credential-header">
        <div className="credential-logo">{issuer.includes("Ramkhamhaeng") ? "RU" : "TC"}</div>
        <div>
          <h3>{issuer}</h3>
          <p>{issuerEn}</p>
          <strong>{card.displayName} / {card.displayNameEn ?? card.cardType}</strong>
        </div>
      </div>
      <div className="credential-band">
        <div>
          <Hospital size={20} />
          <span>FACILITY</span>
          <strong>{issuer}</strong>
        </div>
        <div>
          <IdCard size={20} />
          <span>TYPE</span>
          <strong>{card.displayName}</strong>
        </div>
      </div>
      <div className="credential-body">
        <div className="credential-photo" aria-label="patient photo fallback">
          {initialsFromName(displayNameTh)}
        </div>
        <div className="credential-person">
          <span className="muted-row"><UserRound size={16} /> ชื่อ-นามสกุล</span>
          <h4>{displayNameTh}</h4>
          <p>{displayNameEn}</p>
          <div className="credential-grid">
            <div>
              <span># รหัส</span>
              <strong>{idText}</strong>
            </div>
            <div>
              <span><Calendar size={14} /> วันที่ออก</span>
              <strong>{card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("th-TH") : "-"}</strong>
            </div>
          </div>
        </div>
        <div className="watermark">DEMO ONLY</div>
      </div>
      <div className="credential-status-row">
        <div>
          <span>สถานะ / STATUS</span>
          <Badge tone={card.credentialStatus === "active" ? "green" : "red"}>
            <ShieldCheck size={14} /> {card.credentialStatus === "active" ? "ปกติ" : card.credentialStatus}
          </Badge>
        </div>
        <div>
          <span>วันหมดอายุ</span>
          <strong>{card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("th-TH") : "-"}</strong>
        </div>
        <div className="credential-qr">
          {qrDataUrl ? <img src={qrDataUrl} alt="VP QR" /> : <QrCode size={48} />}
        </div>
      </div>
      <footer>VC: urn:uuid:{String(card.credentialId).padStart(8, "0")}-trustcare-wallet</footer>
    </article>
  );
}


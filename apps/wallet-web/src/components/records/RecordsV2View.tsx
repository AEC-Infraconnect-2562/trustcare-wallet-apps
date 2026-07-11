import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  ImageOff,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Badge,
  Button,
  Surface,
  useLoadedPhotoCandidate,
} from "@trustcare/ui-web";
import type {
  RuntimeEnvironment,
  WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import {
  photoBearingCredentialTypes,
  photoCandidatesForCard,
  walletCardForDocumentRendering,
  walletDocumentTrustPresentation,
} from "@trustcare/wallet-core";
import { useWalletDocuments } from "../../hooks/useWalletDocuments";

export function RecordsV2View({
  runtimeEnvironment,
  userId,
  apiUrl,
  selectedRecordId,
  onOpenRecord,
  onCloseRecord,
}: {
  runtimeEnvironment: RuntimeEnvironment;
  userId: string;
  apiUrl: string;
  selectedRecordId?: string;
  onOpenRecord: (record: WalletDocumentRecordV2) => void;
  onCloseRecord: () => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const { records, loading, error, reload } = useWalletDocuments({
    runtimeEnvironment,
    userId,
    apiUrl,
    search: deferredSearch,
  });
  const selectedRecord = useMemo(
    () =>
      selectedRecordId
        ? records.find(
            (record) =>
              record.id === selectedRecordId ||
              record.credential.credentialId === selectedRecordId,
          )
        : undefined,
    [records, selectedRecordId],
  );

  if (selectedRecord) {
    return <RecordV2Detail record={selectedRecord} onBack={onCloseRecord} />;
  }

  if (selectedRecordId && !loading && !error) {
    return (
      <div className="view-stack records-v2-view">
        <Surface className="record-v2-state" role="alert">
          <FileText size={22} />
          <div>
            <h2>ไม่พบเอกสารนี้</h2>
            <p>เอกสารอาจถูกแทนที่ ถูกนำออก หรือไม่ได้อยู่ใน Wallet ของคุณ</p>
          </div>
          <Button className="secondary" onClick={onCloseRecord}>
            <ArrowLeft size={17} /> กลับไปเอกสาร
          </Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="view-stack records-v2-view">
      <Surface className="documents-command">
        <div>
          <span className="eyebrow">กระเป๋าเอกสารสุขภาพส่วนตัว</span>
          <h2>เอกสารสุขภาพของคุณ</h2>
          <p>
            ค้นหาเอกสารจากชื่อ โรงพยาบาล หรือประเภทเอกสาร พร้อมดูวันที่ สถานะ
            และความน่าเชื่อถือก่อนนำไปใช้
          </p>
        </div>
        <div className="trust-chip-row">
          <Badge tone="neutral">{records.length} เอกสาร</Badge>
        </div>
      </Surface>

      <Surface className="document-controls">
        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อเอกสาร ผู้ออก หรือประเภทเอกสาร..."
          />
        </label>
      </Surface>

      {loading && (
        <Surface className="record-v2-state" aria-live="polite">
          <RefreshCw className="spin-icon" size={22} />
          <div>
            <h3>กำลังโหลดเอกสาร</h3>
            <p>โปรดรอสักครู่</p>
          </div>
        </Surface>
      )}

      {!loading && error && (
        <Surface className="record-v2-state record-v2-error" role="alert">
          <div>
            <h3>โหลดเอกสารไม่สำเร็จ</h3>
            <p>ยังติดต่อแหล่งเอกสารไม่ได้ โปรดลองอีกครั้ง</p>
            <details>
              <summary>รายละเอียดสำหรับการแก้ไข</summary>
              <code>{error}</code>
            </details>
          </div>
          <Button className="secondary" onClick={reload}>
            <RefreshCw size={17} /> ลองอีกครั้ง
          </Button>
        </Surface>
      )}

      {!loading && !error && records.length === 0 && (
        <Surface className="record-v2-state">
          <FileText size={22} />
          <div>
            <h3>{search.trim() ? "ไม่พบเอกสาร" : "ยังไม่มีเอกสาร"}</h3>
            <p>
              {search.trim()
                ? "ลองค้นหาด้วยชื่อโรงพยาบาลหรือประเภทเอกสารอื่น"
                : "รับหรือเชื่อมต่อเอกสารก่อน แล้วรายการจะปรากฏที่นี่"}
            </p>
          </div>
        </Surface>
      )}

      {!loading && !error && records.length > 0 && (
        <section className="record-v2-list" aria-label="เอกสารสุขภาพ">
          {records.map((record) => {
            const trust = recordTrustPresentation(record);
            return (
              <button
                key={record.id}
                type="button"
                className="record-v2-row"
                onClick={() => onOpenRecord(record)}
              >
                <RecordV2Thumbnail record={record} />
                <span className="record-v2-copy">
                  <strong>{record.title.th || record.title.en}</strong>
                  <small>
                    {record.provenance.issuerName ??
                      record.clinicalContext.facility?.name ??
                      sourceLabel(record.provenance.sourceKind)}
                  </small>
                  <small>
                    {recordDate(record)} ·{" "}
                    {lifecycleLabel(record.lifecycle.status)}
                  </small>
                </span>
                <span className="record-v2-status">
                  <Badge tone={trust.tone}>{trust.label}</Badge>
                  {record.local.availableOffline && (
                    <small>พร้อมใช้ออฟไลน์</small>
                  )}
                </span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

const recordPhotoDocumentTypes = new Set<string>(
  photoBearingCredentialTypes,
);

function RecordV2Thumbnail({
  record,
}: {
  record: WalletDocumentRecordV2;
}) {
  const photoRequired = recordPhotoDocumentTypes.has(record.documentType);
  const candidates = useMemo(() => {
    if (!photoRequired) return [];
    return photoCandidatesForCard(walletCardForDocumentRendering(record));
  }, [photoRequired, record]);
  const { candidate, imageSrc, isLoaded, markFailed, markLoaded } =
    useLoadedPhotoCandidate(candidates);

  if (!photoRequired) {
    return (
      <span className="record-v2-icon" aria-hidden="true">
        <FileText size={21} />
      </span>
    );
  }

  return (
    <span
      className={`record-v2-icon record-v2-photo${candidate && imageSrc ? "" : " is-missing"}`}
      aria-label={
        candidate && imageSrc
          ? "รูปผู้ถือเอกสารจาก credential เดียวกัน"
          : "ไม่พบรูปผู้ถือเอกสารใน credential ต้นฉบับ"
      }
    >
      <ImageOff className="record-v2-photo-fallback" aria-hidden="true" />
      {candidate && imageSrc ? (
        <img
          className={isLoaded ? "loaded" : ""}
          key={imageSrc}
          src={imageSrc}
          alt=""
          onLoad={markLoaded}
          onError={markFailed}
        />
      ) : null}
    </span>
  );
}

function RecordV2Detail({
  record,
  onBack,
}: {
  record: WalletDocumentRecordV2;
  onBack: () => void;
}) {
  const trust = recordTrustPresentation(record);
  return (
    <div className="view-stack records-v2-view">
      <Button className="secondary record-v2-back" onClick={onBack}>
        <ArrowLeft size={17} /> กลับไปเอกสาร
      </Button>
      <Surface className="record-v2-detail">
        <span className="eyebrow">รายละเอียดเอกสาร</span>
        <h2>{record.title.th || record.title.en}</h2>
        <div className="trust-chip-row">
          <Badge tone={trust.tone}>{trust.label}</Badge>
          <Badge tone="neutral">
            {lifecycleLabel(record.lifecycle.status)}
          </Badge>
          <Badge tone="blue">{sourceLabel(record.provenance.sourceKind)}</Badge>
        </div>
        <dl className="details-grid compact">
          <div>
            <dt>ผู้ออกเอกสาร</dt>
            <dd>
              {record.provenance.issuerName ??
                record.provenance.issuerDid ??
                "-"}
            </dd>
          </div>
          <div>
            <dt>วันที่ข้อมูลทางคลินิก</dt>
            <dd>{recordDate(record)}</dd>
          </div>
          <div>
            <dt>เวอร์ชัน</dt>
            <dd>{record.lifecycle.versionId}</dd>
          </div>
          <div>
            <dt>เอกสารต้นฉบับ</dt>
            <dd>{record.content.originalAttachments.length} ไฟล์</dd>
          </div>
        </dl>
        <details className="record-v2-checks">
          <summary>รายละเอียดการตรวจสอบขั้นสูง</summary>
          {record.trust.checks.map((check, index) => (
            <div key={`${check.key}-${index}`}>
              <strong>{trustCheckLabel(check.key)}</strong>
              <span>{trustCheckStatusLabel(check.status)}</span>
              <small>{check.detail ?? "ไม่มีรายละเอียดเพิ่มเติม"}</small>
            </div>
          ))}
        </details>
      </Surface>
    </div>
  );
}

export function recordTrustPresentation(record: WalletDocumentRecordV2): {
  label: string;
  tone: "neutral" | "green" | "yellow" | "red" | "blue";
} {
  const presentation = walletDocumentTrustPresentation(record);
  return { label: presentation.labelTh, tone: presentation.tone };
}

export function recordDate(record: WalletDocumentRecordV2): string {
  const value =
    record.clinicalContext.recordTime ??
    record.lifecycle.issuedAt ??
    record.provenance.receivedAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function lifecycleLabel(value: WalletDocumentRecordV2["lifecycle"]["status"]) {
  return (
    {
      preliminary: "ร่าง",
      final: "ฉบับปัจจุบัน",
      amended: "แก้ไขเพิ่มเติม",
      corrected: "แก้ไขแล้ว",
      superseded: "มีฉบับใหม่แทน",
      entered_in_error: "บันทึกผิดพลาด",
      expired: "หมดอายุ",
      suspended: "ระงับ",
      revoked: "เพิกถอน",
    } as const
  )[value];
}

function sourceLabel(
  value: WalletDocumentRecordV2["provenance"]["sourceKind"],
) {
  return (
    {
      trustcare_portal: "TrustCare Portal",
      provider_fhir: "โรงพยาบาล",
      mhd_repository: "คลังเอกสารโรงพยาบาล",
      oid4vci: "Credential Offer",
      shl: "SMART Health Link",
      external_wallet: "Wallet อื่น",
      patient_upload: "ผู้ป่วยนำเข้า",
    } as const
  )[value];
}

function trustCheckLabel(key: string): string {
  return (
    (
      {
        proof: "ลายเซ็นดิจิทัล",
        issuer: "ผู้ออกเอกสาร",
        status: "สถานะเอกสาร",
        expiry: "วันหมดอายุ",
        holder: "ผู้ถือเอกสาร",
        policy: "เงื่อนไขการใช้งาน",
      } as Record<string, string>
    )[key] ?? "การตรวจสอบเพิ่มเติม"
  );
}

function trustCheckStatusLabel(
  status: WalletDocumentRecordV2["trust"]["checks"][number]["status"],
): string {
  return {
    passed: "ผ่าน",
    failed: "ไม่ผ่าน",
    pending: "รอตรวจสอบ",
    warning: "มีข้อควรระวัง",
  }[status];
}

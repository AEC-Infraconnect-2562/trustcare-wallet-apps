import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  ImageOff,
  RefreshCw,
  Search,
  Share2,
} from "lucide-react";
import {
  Badge,
  Button,
  CredentialDocument,
  Surface,
  useLoadedPhotoCandidate,
} from "@trustcare/ui-web";
import type {
  RuntimeEnvironment,
  WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import {
  mergeWalletDocumentRecordsV2,
  photoBearingCredentialTypes,
  photoCandidatesForCard,
  walletCardForDocumentRendering,
  walletDocumentTrustPresentation,
} from "@trustcare/wallet-core";
import { useWalletDocuments } from "../../hooks/useWalletDocuments";
import type {
  PortalHospitalCode,
  RecordExchangeSubmissionResult,
} from "../../walletExchangeSubmission";

export type {
  PortalHospitalCode,
  RecordExchangeSubmissionResult,
} from "../../walletExchangeSubmission";

export function RecordsV2View({
  runtimeEnvironment,
  userId,
  apiUrl,
  exchangeRecords = [],
  exchangeLoading = false,
  exchangeError = "",
  onReloadExchange,
  pendingShareCount = 0,
  onRecoverPendingShares,
  defaultTargetHospitalCode = "TCC",
  onSubmitExchangeRecord,
  onRefreshExchangeSubmission,
  selectedRecordId,
  onOpenRecord,
  onCloseRecord,
}: {
  runtimeEnvironment: RuntimeEnvironment;
  userId: string;
  apiUrl: string;
  exchangeRecords?: WalletDocumentRecordV2[];
  exchangeLoading?: boolean;
  exchangeError?: string;
  onReloadExchange?: () => void;
  pendingShareCount?: number;
  onRecoverPendingShares?: () => Promise<void>;
  defaultTargetHospitalCode?: PortalHospitalCode;
  onSubmitExchangeRecord?: (
    record: WalletDocumentRecordV2,
    targetHospitalCode: PortalHospitalCode,
  ) => Promise<RecordExchangeSubmissionResult>;
  onRefreshExchangeSubmission?: (
    clientSubmissionId: string,
  ) => Promise<RecordExchangeSubmissionResult>;
  selectedRecordId?: string;
  onOpenRecord: (record: WalletDocumentRecordV2) => void;
  onCloseRecord: () => void;
}) {
  const [search, setSearch] = useState("");
  const [recoveringShares, setRecoveringShares] = useState(false);
  const [shareRecoveryError, setShareRecoveryError] = useState("");
  const deferredSearch = useDeferredValue(search);
  const {
    records: repositoryRecords,
    loading: repositoryLoading,
    error: repositoryError,
    reload,
  } = useWalletDocuments({
    enabled: runtimeEnvironment === "demo",
    runtimeEnvironment,
    userId,
    apiUrl,
    search: deferredSearch,
  });
  const mergedRecords = useMemo(
    () => mergeRecordSources(repositoryRecords, exchangeRecords),
    [exchangeRecords, repositoryRecords],
  );
  const records = useMemo(
    () =>
      mergedRecords.error
        ? []
        : mergedRecords.records.filter((record) =>
            recordMatchesSearch(record, deferredSearch),
          ),
    [deferredSearch, mergedRecords],
  );
  const loading = repositoryLoading || exchangeLoading;
  const error = records.length
    ? ""
    : mergedRecords.error || exchangeError || repositoryError;
  const reloadAll = () => {
    reload();
    onReloadExchange?.();
  };
  const recoverPendingShares = async () => {
    if (!onRecoverPendingShares || recoveringShares) return;
    setRecoveringShares(true);
    setShareRecoveryError("");
    try {
      await onRecoverPendingShares();
    } catch {
      setShareRecoveryError(
        "ยังส่งไม่สำเร็จ เอกสารยังเก็บไว้อย่างปลอดภัยและลองใหม่ได้ภายหลัง",
      );
    } finally {
      setRecoveringShares(false);
    }
  };
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
  const selectedExchangeRecord = useMemo(
    () =>
      selectedRecord
        ? exchangeRecords.find(
            (candidate) =>
              candidate.id === selectedRecord.id &&
              candidate.lifecycle.versionId ===
                selectedRecord.lifecycle.versionId &&
              Boolean(candidate.credential.jwt) &&
              candidate.credential.jwt === selectedRecord.credential.jwt,
          )
        : undefined,
    [exchangeRecords, selectedRecord],
  );

  if (selectedRecord) {
    return (
      <RecordV2Detail
        record={selectedRecord}
        onBack={onCloseRecord}
        defaultTargetHospitalCode={defaultTargetHospitalCode}
        onSubmitExchangeRecord={
          selectedExchangeRecord ? onSubmitExchangeRecord : undefined
        }
        onRefreshExchangeSubmission={
          selectedExchangeRecord ? onRefreshExchangeSubmission : undefined
        }
      />
    );
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

      {pendingShareCount > 0 && (
        <Surface className="pending-share-recovery" role="status">
          <div>
            <strong>มีเอกสาร {pendingShareCount} รายการที่รอส่งต่อ</strong>
            <p>
              ระบบเก็บเอกสารที่คุณยืนยันไว้แล้ว
              สามารถลองส่งต่ออีกครั้งโดยไม่ต้องสร้างรายการใหม่
            </p>
            {shareRecoveryError && <small>{shareRecoveryError}</small>}
          </div>
          <Button
            className="secondary"
            disabled={recoveringShares || !onRecoverPendingShares}
            onClick={() => void recoverPendingShares()}
          >
            <RefreshCw size={17} />
            {recoveringShares ? "กำลังลองส่ง..." : "ลองส่งอีกครั้ง"}
          </Button>
        </Surface>
      )}

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
          <Button className="secondary" onClick={reloadAll}>
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

export function mergeRecordSources(
  repositoryRecords: readonly WalletDocumentRecordV2[],
  exchangeRecords: readonly WalletDocumentRecordV2[],
): { records: WalletDocumentRecordV2[]; error: string } {
  try {
    const recordsByOwner = new Map<string, WalletDocumentRecordV2[]>();
    const ownerByRecordId = new Map<string, string>();
    for (const record of [...repositoryRecords, ...exchangeRecords]) {
      const conflictingOwner = ownerByRecordId.get(record.id);
      if (conflictingOwner && conflictingOwner !== record.owner.id) {
        throw new Error(
          `Wallet document ${record.id} belongs to conflicting owner partitions.`,
        );
      }
      ownerByRecordId.set(record.id, record.owner.id);
      const ownerRecords = recordsByOwner.get(record.owner.id) ?? [];
      ownerRecords.push(record);
      recordsByOwner.set(record.owner.id, ownerRecords);
    }

    return {
      records: Array.from(recordsByOwner.values()).flatMap((ownerRecords) =>
        mergeWalletDocumentRecordsV2([], ownerRecords),
      ),
      error: "",
    };
  } catch (reason) {
    return {
      records: [],
      error:
        reason instanceof Error
          ? reason.message
          : "Wallet document sources could not be merged safely.",
    };
  }
}

export function recordMatchesSearch(
  record: WalletDocumentRecordV2,
  search: string,
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  if (!normalizedSearch) return true;
  return [
    record.title.th,
    record.title.en,
    record.documentType,
    record.provenance.issuerName,
    record.clinicalContext.facility?.name,
    record.clinicalContext.practitioner?.name,
  ]
    .filter(Boolean)
    .some((value) =>
      String(value).toLocaleLowerCase().includes(normalizedSearch),
    );
}

const recordPhotoDocumentTypes = new Set<string>(photoBearingCredentialTypes);

function RecordV2Thumbnail({ record }: { record: WalletDocumentRecordV2 }) {
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
  defaultTargetHospitalCode,
  onSubmitExchangeRecord,
  onRefreshExchangeSubmission,
}: {
  record: WalletDocumentRecordV2;
  onBack: () => void;
  defaultTargetHospitalCode: PortalHospitalCode;
  onSubmitExchangeRecord?: (
    record: WalletDocumentRecordV2,
    targetHospitalCode: PortalHospitalCode,
  ) => Promise<RecordExchangeSubmissionResult>;
  onRefreshExchangeSubmission?: (
    clientSubmissionId: string,
  ) => Promise<RecordExchangeSubmissionResult>;
}) {
  const trust = recordTrustPresentation(record);
  const [targetHospitalCode, setTargetHospitalCode] =
    useState<PortalHospitalCode>(defaultTargetHospitalCode);
  const [submission, setSubmission] =
    useState<RecordExchangeSubmissionResult | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const submit = async () => {
    if (!onSubmitExchangeRecord) return;
    setShareBusy(true);
    setShareError("");
    try {
      setSubmission(await onSubmitExchangeRecord(record, targetHospitalCode));
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : "ไม่สามารถส่งเอกสารไปยังโรงพยาบาลได้",
      );
    } finally {
      setShareBusy(false);
    }
  };
  const refreshSubmission = async () => {
    if (!submission || !onRefreshExchangeSubmission) return;
    setShareBusy(true);
    setShareError("");
    try {
      setSubmission(
        await onRefreshExchangeSubmission(submission.clientSubmissionId),
      );
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : "ไม่สามารถตรวจสถานะการส่งเอกสารได้",
      );
    } finally {
      setShareBusy(false);
    }
  };
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
        {onSubmitExchangeRecord ? (
          <div className="record-v2-share-panel">
            <div>
              <strong>แชร์เอกสารกับโรงพยาบาล</strong>
              <p>
                Wallet
                จะสร้างลายเซ็นใหม่สำหรับการแชร์ครั้งนี้และส่งเฉพาะเอกสารที่เลือก
              </p>
            </div>
            <label>
              โรงพยาบาลผู้รับ
              <select
                value={targetHospitalCode}
                onChange={(event) =>
                  setTargetHospitalCode(
                    event.target.value as PortalHospitalCode,
                  )
                }
                disabled={shareBusy || Boolean(submission)}
              >
                <option value="TCC">TrustCare Central Hospital</option>
                <option value="TCP">
                  TrustCare Phuket International Hospital
                </option>
                <option value="TCM">TrustCare Medical Center</option>
              </select>
            </label>
            {!submission ? (
              <Button onClick={() => void submit()} disabled={shareBusy}>
                {shareBusy ? (
                  <RefreshCw className="spin-icon" size={17} />
                ) : (
                  <Share2 size={17} />
                )}
                {shareBusy ? "กำลังส่ง" : "ยืนยันและแชร์เอกสารนี้"}
              </Button>
            ) : (
              <div className="record-v2-submission-status" aria-live="polite">
                <Badge tone={submissionTone(submission.status)}>
                  {submissionStatusLabel(submission.status)}
                </Badge>
                <small>รหัสอ้างอิง {submission.submissionId}</small>
                {onRefreshExchangeSubmission ? (
                  <Button
                    className="secondary"
                    onClick={() => void refreshSubmission()}
                    disabled={shareBusy}
                  >
                    <RefreshCw
                      className={shareBusy ? "spin-icon" : undefined}
                      size={17}
                    />
                    ตรวจสถานะล่าสุด
                  </Button>
                ) : null}
              </div>
            )}
            {shareError ? (
              <p className="record-v2-share-error" role="alert">
                {shareError}
              </p>
            ) : null}
          </div>
        ) : null}
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
      <Surface className="record-v2-document-surface">
        <div className="record-v2-document-heading">
          <div>
            <span className="eyebrow">เอกสารต้นฉบับ</span>
            <h3>แสดงจากข้อมูลที่โรงพยาบาลลงนาม</h3>
          </div>
          <Badge tone="neutral">Shared Renderer</Badge>
        </div>
        <div className="record-v2-document-preview">
          <CredentialDocument card={walletCardForDocumentRendering(record)} />
        </div>
      </Surface>
    </div>
  );
}

function submissionStatusLabel(status: string): string {
  return (
    (
      {
        received: "Portal รับเอกสารแล้ว",
        needs_review: "รอโรงพยาบาลตรวจทาน",
        accepted: "โรงพยาบาลรับเอกสารแล้ว",
        partial: "รับเอกสารบางส่วน",
        rejected: "โรงพยาบาลไม่รับเอกสาร",
      } as Record<string, string>
    )[status] ?? status
  );
}

function submissionTone(status: string): "neutral" | "blue" | "yellow" | "red" {
  if (status === "accepted") return "blue";
  if (status === "rejected") return "red";
  if (status === "needs_review" || status === "partial") return "yellow";
  return "neutral";
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

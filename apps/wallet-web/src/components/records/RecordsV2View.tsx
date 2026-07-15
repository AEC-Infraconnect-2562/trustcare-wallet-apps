import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Fingerprint,
  ImageOff,
  KeyRound,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  ClinicalDocumentGraphPresentation,
  CredentialDocument,
  Surface,
  useLoadedPhotoCandidate,
} from "@trustcare/ui-web";
import type {
  RuntimeEnvironment,
  WalletClinicalDocumentGraphNode,
  WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import type { ClinicalDocumentGraphPresentation as ClinicalDocumentGraphPresentationModel } from "@trustcare/contracts";
import type { WalletShlAssociation } from "@trustcare/contracts";
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
import { ShlAssociationConsent } from "../ShlAssociationConsent";

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
  onAssociateShl,
  selectedRecordId,
  onOpenRecord,
  onCloseRecord,
  graphArtifacts = [],
  loadGraphPresentation,
  graphQuarantineCount = 0,
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
  onAssociateShl?: (
    record: WalletDocumentRecordV2,
  ) => Promise<WalletShlAssociation>;
  selectedRecordId?: string;
  onOpenRecord: (record: WalletDocumentRecordV2) => void;
  onCloseRecord: () => void;
  graphArtifacts?: WalletClinicalDocumentGraphNode[];
  loadGraphPresentation?: (
    artifactId: string,
  ) => Promise<ClinicalDocumentGraphPresentationModel>;
  graphQuarantineCount?: number;
}) {
  const [search, setSearch] = useState("");
  const [recoveringShares, setRecoveringShares] = useState(false);
  const [shareRecoveryError, setShareRecoveryError] = useState("");
  const [selectedGraphArtifactId, setSelectedGraphArtifactId] = useState("");
  const [graphPresentation, setGraphPresentation] =
    useState<ClinicalDocumentGraphPresentationModel | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
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

  const openGraph = async (artifactId: string) => {
    if (!loadGraphPresentation || graphLoading) return;
    setSelectedGraphArtifactId(artifactId);
    setGraphPresentation(null);
    setGraphError("");
    setGraphLoading(true);
    try {
      setGraphPresentation(await loadGraphPresentation(artifactId));
    } catch (reason) {
      setGraphError(
        reason instanceof Error
          ? reason.message
          : "ไม่สามารถสร้าง Graph Presentation จากข้อมูลที่ sync ได้",
      );
    } finally {
      setGraphLoading(false);
    }
  };

  const closeGraph = () => {
    setSelectedGraphArtifactId("");
    setGraphPresentation(null);
    setGraphError("");
  };

  const openUnderlyingDocument = (artifactId: string) => {
    const node = graphPresentation?.nodes.find(
      (candidate) => candidate.artifactId === artifactId,
    );
    const record = findRecordForGraphArtifact(records, artifactId, node);
    if (!record) {
      setGraphError(
        "ยังไม่มี underlying document object รายการนี้ใน local Wallet จึงไม่เปิดข้อมูลอื่นทดแทน",
      );
      return;
    }
    closeGraph();
    onOpenRecord(record);
  };

  if (selectedGraphArtifactId) {
    return (
      <div className="view-stack records-v2-view clinical-graph-view">
        <Button className="secondary record-v2-back" onClick={closeGraph}>
          <ArrowLeft size={17} /> กลับไปเอกสาร
        </Button>
        {graphLoading ? (
          <Surface className="record-v2-state" aria-live="polite">
            <RefreshCw className="spin-icon" size={22} />
            <div>
              <h3>กำลังสร้าง Graph Presentation</h3>
              <p>Wallet กำลังประกอบจาก holder-authorized delta ที่เก็บไว้</p>
            </div>
          </Surface>
        ) : null}
        {graphError ? (
          <Surface className="record-v2-state record-v2-error" role="alert">
            <div>
              <h3>ไม่สามารถเปิด Graph Presentation ได้</h3>
              <p>{graphError}</p>
            </div>
          </Surface>
        ) : null}
        {graphPresentation ? (
          <Surface className="clinical-graph-surface">
            <ClinicalDocumentGraphPresentation
              presentation={graphPresentation}
              onOpenArtifact={openUnderlyingDocument}
            />
          </Surface>
        ) : null}
      </div>
    );
  }

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
        onAssociateShl={onAssociateShl}
        graphArtifactId={findGraphArtifactForRecord(
          graphArtifacts,
          selectedRecord,
        )}
        onOpenGraph={(artifactId) => void openGraph(artifactId)}
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

      {graphArtifacts.length > 0 ? (
        <Surface className="clinical-graph-catalog">
          <div className="clinical-graph-catalog-heading">
            <div>
              <span className="eyebrow">Portable Clinical Document Graph</span>
              <h3>ดูที่มาและความสัมพันธ์ของเอกสาร</h3>
              <p>
                เลือกรายการเพื่อดู Source, FHIR, Document, Retrieval,
                Attestation, VC, SHL และ Holder VP ที่สัมพันธ์กันจริง
              </p>
            </div>
            <div className="trust-chip-row">
              <Badge tone="blue">{graphArtifacts.length} objects</Badge>
              {graphQuarantineCount > 0 ? (
                <Badge tone="yellow">
                  {graphQuarantineCount} รายการรอตรวจ compatibility
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="clinical-graph-artifact-list">
            {primaryGraphArtifacts(graphArtifacts).map((artifact) => (
              <button
                key={artifact.artifactId}
                type="button"
                onClick={() => void openGraph(artifact.artifactId)}
              >
                <span>{graphArtifactIcon(artifact.semanticClass)}</span>
                <span>
                  <strong>{graphArtifactLabel(artifact)}</strong>
                  <small>{artifact.semanticClass.replaceAll("_", " ")}</small>
                  <code>{shortGraphId(artifact.artifactId)}</code>
                </span>
                <Badge
                  tone={artifact.trustState === "invalid" ? "red" : "neutral"}
                >
                  {artifact.lifecycleStatus}
                </Badge>
              </button>
            ))}
          </div>
        </Surface>
      ) : null}

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
                data-testid={`wallet-record-${record.id}`}
                data-document-type={record.documentType}
                data-credential-id={record.credential.credentialId}
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
  onAssociateShl,
  graphArtifactId,
  onOpenGraph,
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
  onAssociateShl?: (
    record: WalletDocumentRecordV2,
  ) => Promise<WalletShlAssociation>;
  graphArtifactId?: string;
  onOpenGraph?: (artifactId: string) => void;
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
        {graphArtifactId && onOpenGraph ? (
          <Button
            className="secondary record-v2-graph-action"
            onClick={() => onOpenGraph(graphArtifactId)}
          >
            <Share2 size={17} /> ดูโครงสร้างและความน่าเชื่อถือ
          </Button>
        ) : null}
        {record.documentType === "shl_manifest" && onAssociateShl ? (
          <ShlAssociationConsent
            associationKey={String(record.credential.credentialId)}
            onAssociate={() => onAssociateShl(record)}
          />
        ) : null}
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

function primaryGraphArtifacts(
  artifacts: readonly WalletClinicalDocumentGraphNode[],
): WalletClinicalDocumentGraphNode[] {
  const primary = artifacts.filter(
    (artifact) =>
      artifact.retrievable ||
      [
        "identity_credential",
        "trust_artifact",
        "transport_artifact",
        "presentation_artifact",
      ].includes(artifact.semanticClass),
  );
  return primary.length ? primary : [...artifacts];
}

function findGraphArtifactForRecord(
  artifacts: readonly WalletClinicalDocumentGraphNode[],
  record: WalletDocumentRecordV2,
): string | undefined {
  const identifiers = new Set(
    [record.id, record.credential.credentialId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const hashes = recordHashes(record);
  return artifacts.find(
    (artifact) =>
      identifiers.has(artifact.artifactId) ||
      identifiers.has(artifact.object?.objectId ?? "") ||
      hashes.has(normalizeHash(artifact.contentHash)),
  )?.artifactId;
}

function findRecordForGraphArtifact(
  records: readonly WalletDocumentRecordV2[],
  artifactId: string,
  node?: ClinicalDocumentGraphPresentationModel["nodes"][number],
): WalletDocumentRecordV2 | undefined {
  return records.find((record) => {
    const identifiers = new Set(
      [record.id, record.credential.credentialId].filter(
        (value): value is string => Boolean(value),
      ),
    );
    return (
      identifiers.has(artifactId) ||
      identifiers.has(node?.object?.objectId ?? "") ||
      (node ? recordHashes(record).has(normalizeHash(node.contentHash)) : false)
    );
  });
}

function recordHashes(record: WalletDocumentRecordV2): Set<string> {
  const hashes = new Set<string>();
  for (const attachment of record.content.originalAttachments) {
    if (attachment.hash) hashes.add(normalizeHash(attachment.hash));
  }
  const content = record.content.documentReference.content;
  if (Array.isArray(content)) {
    for (const entry of content) {
      const hash = entry?.attachment?.hash;
      if (typeof hash === "string" && hash.trim()) {
        hashes.add(normalizeHash(hash));
      }
    }
  }
  return hashes;
}

function normalizeHash(value: string): string {
  return value
    .toLowerCase()
    .replace(/^sha-?256:/, "")
    .replace(/^sha256-/, "");
}

function graphArtifactLabel(artifact: WalletClinicalDocumentGraphNode): string {
  const labels: Record<string, string> = {
    "holder-presentation": "Holder VP ที่ Wallet ลงนาม",
    "verifiable-credential": "Verifiable Credential ที่ Portal ลงนาม",
    "shl-transport": "Smart Health Link transport",
    "shl-manifest": "SHL manifest",
  };
  return (
    labels[artifact.artifactType] ?? artifact.artifactType.replaceAll("-", " ")
  );
}

function graphArtifactIcon(semanticClass: string) {
  if (semanticClass === "presentation_artifact")
    return <Fingerprint size={18} />;
  if (semanticClass === "transport_artifact") return <KeyRound size={18} />;
  if (semanticClass === "trust_artifact") return <ShieldCheck size={18} />;
  return <FileText size={18} />;
}

function shortGraphId(value: string): string {
  return value.length > 28
    ? `${value.slice(0, 13)}…${value.slice(-10)}`
    : value;
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  Eye,
  Fingerprint,
  FileJson,
  FileText,
  FilePlus2,
  Globe2,
  IdCard,
  KeyRound,
  Link2,
  ListChecks,
  LockKeyhole,
  Network,
  Pill,
  Printer,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Upload,
  UserCheck,
  Wallet,
} from "lucide-react";
import * as shareGatewayApi from "@trustcare/api-client/shareGatewayClient";
import type { WalletExchangeWorkflow } from "@trustcare/api-client/walletExchangeWorkflow";
import {
  Badge,
  Button,
  CredentialDocument,
  PresentationCoverDocument,
  Surface,
} from "@trustcare/ui-web";
import {
  assessLocalReadiness,
  buildDocumentRequestPlan,
  buildMissingDocumentCards,
  buildPurposePickerCards,
  buildReadinessSummary,
  buildSharePackage,
  canPresentCredential,
  cardsSelectedByReadiness,
  createAutomaticDocumentRequestDraft,
  createDocumentRequestDraft,
  createShareDraftFromPrepare,
  createSharingEventArtifactId,
  createHolderSignedDirectVp,
  createSharePolicy,
  createShlViewerUrl,
  credentialCompactSummaryRows,
  credentialRenderModelFromCard,
  credentialStatusLabel,
  credentialStatusTone,
  exportWalletObject,
  exportWalletObjects,
  buildPortalInteroperabilityFixtures,
  getValueAtPath,
  parseShlLink,
  walletDocumentRecordV2FromCard,
  walletDocumentTrustPresentation,
  walletCardForCredentialRendering,
  readinessContextLabels,
  readinessContextValues,
  recommendPolicyForDraft,
  resolveShareDisclosureIntent,
  shareModePatientDescription,
  shareModePatientLabel,
  shlAccessSummary,
  storedObjectTone,
  validateShareDraft,
  walletObjectsFromShl,
  type ContractHubCatalog,
  type DocumentPackageScope,
  type DocumentRequestDraft,
  type DocumentRequestFormat,
  type DocumentRequestReturnChannel,
  type DocumentRequestSource,
  type PayerLifecycleResult,
  type ReadinessContext,
  type ReadinessRequirement,
  type ShlManifestDocument,
  type ShlPackage,
  type ShlPackageDetail,
  type ShareAccessPolicy,
  type ShareDisclosureIntent,
  type ShareValidationResult,
  type WalletCard,
  type WalletDemoUser,
  type WalletExportResult,
  type WalletImportJob,
  type WalletDocumentRecordV2,
  type HolderSigningIdentity,
  type WalletStoredObject,
  type VerifierResult,
} from "@trustcare/wallet-core";
import { AcquisitionPlanner } from "../components/acquisition/AcquisitionPlanner";
import { DisabledReason } from "../components/common/DisabledReason";
import { ImportHub } from "../components/import/ImportHub";
import { MissingDocumentCard } from "../components/prepare/MissingDocumentCard";
import { PayerOrchestrationPanel } from "../components/payer/PayerOrchestrationPanel";
import { PurposePickerCard } from "../components/prepare/PurposePickerCard";
import { ReadinessSummaryCard } from "../components/prepare/ReadinessSummaryCard";
import { SharePacketComposer } from "../components/share/SharePacketComposer";
import { TrustChecklist } from "../components/trust/TrustChecklist";
import { toQrDataUrl } from "../utils/qrCode";
import {
  currentAppBaseUrl,
  currentAppShareRootUrl,
  currentShareGatewayBaseUrl,
} from "../utils/runtimeUrls";
import {
  credentialRequestDocumentLabel,
  credentialRequestNextActionLabel,
  credentialRequestStatusLabel,
  type WalletCredentialRequestViewModel,
} from "../walletExchangeCredentialRequest";
import {
  criticalCardTypes,
  defaultShlPolicyForContext,
  maskShlPasscode,
  normalizeShlPasscode,
  protocolForTransport,
  protocolRequiresShl,
  protocolRequiresVp,
  readinessPurposeTh,
  sharePackageModeForUi,
  sharePurposeProfiles,
  shareTrustStatusLabel,
  shlPasscodeReady,
  shlPolicyExpiry,
  type DocumentFlowMode,
  type PackageProtocol,
  type ScanOutcome,
  type ScanPayloadDescriptor,
  type ServiceReadinessSummary,
  type SharePublicationState,
  type ShlAccessPolicyState,
  type StoreFilter,
  type TimeAnchor,
  type View,
} from "./appViewModel";
import { categoryLabel, contextLabel, statusLabel } from "./appViewLabels";
import { CredentialSubjectAvatar } from "./identityPresentation";

export { NavButton } from "../components/shell/AppNavigation";
export {
  categoryLabel,
  contextLabel,
  statusLabel,
  transportLabel,
} from "./appViewLabels";
export {
  UserAvatarImage,
  avatarUrlCandidatesForUser,
  resolveAvatarUrl,
  shortDid,
} from "./identityPresentation";
export {
  currentAppBaseUrl,
  currentAppShareRootUrl,
  currentShareGatewayBaseUrl,
} from "../utils/runtimeUrls";

const shareDisclosureIntentOptions: Array<{
  value: ShareDisclosureIntent;
  label: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    value: "minimum_necessary",
    label: "ใช้ชุดเอกสารที่แนะนำ",
    description: "ระบบเลือกเอกสารที่ตรงกับวัตถุประสงค์นี้",
    recommended: true,
  },
  {
    value: "custom_selection",
    label: "เลือกข้อมูลเอง",
    description: "ตรวจและปรับรายการก่อนสร้าง QR",
  },
  {
    value: "complete_documents",
    label: "ส่งเอกสารทั้งฉบับ",
    description: "ผู้รับเห็นข้อมูลทั้งหมดในเอกสารที่เลือก",
  },
];
export function DialogLoadingFallback() {
  return (
    <div className="modal-backdrop" role="status" aria-live="polite">
      <div className="dialog-loading">กำลังเปิดหน้าต่าง...</div>
    </div>
  );
}

export function HomeView({
  cards,
  user,
  offlineOnline,
  onOpenCard,
  onView,
  serviceReadiness,
  activeReadinessContext,
  canSyncPortalWallet,
  portalSyncBusy,
  onSyncPortal,
  onPrepareContext,
}: {
  cards: WalletCard[];
  user: WalletDemoUser;
  offlineOnline: boolean;
  onOpenCard: (card: WalletCard) => void;
  onView: (view: View) => void;
  serviceReadiness: ServiceReadinessSummary[];
  activeReadinessContext: ReadinessContext;
  canSyncPortalWallet: boolean;
  portalSyncBusy: boolean;
  onSyncPortal: () => void;
  onPrepareContext: (context: ReadinessContext) => void;
}) {
  const activeCards = useMemo(
    () => cards.filter((card) => canPresentCredential(card)),
    [cards],
  );
  const importantCards = useMemo(() => {
    const selected = [
      activeCards.find((card) => card.cardType === "patient_identity"),
      activeCards.find(
        (card) =>
          card.cardType.includes("coverage") ||
          card.cardType.includes("eligibility"),
      ),
      activeCards.find((card) =>
        ["medication_summary", "prescription"].includes(card.cardType),
      ),
    ].filter((card): card is WalletCard => Boolean(card));

    const unique = new Map(selected.map((card) => [card.id, card]));
    for (const card of activeCards) {
      if (unique.size >= 3) break;
      if (card.pinned || criticalCardTypes.has(card.cardType)) {
        unique.set(card.id, card);
      }
    }
    return [...unique.values()].slice(0, 3);
  }, [activeCards]);
  const importantCardItems = useMemo(
    () =>
      importantCards.map((card) => ({
        card,
        summaryRows: credentialCompactSummaryRows(
          credentialRenderModelFromCard(card),
          3,
        ),
      })),
    [importantCards],
  );
  const recentCards = useMemo(
    () =>
      [...activeCards]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 3),
    [activeCards],
  );
  const nextAppointment = useMemo(() => {
    const now = Date.now();
    return activeCards
      .filter((card) => card.cardType === "appointment")
      .map((card) => ({ card, start: appointmentStartFromCard(card) }))
      .filter(
        (entry): entry is { card: WalletCard; start: string } =>
          typeof entry.start === "string" && Date.parse(entry.start) >= now,
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]?.card;
  }, [activeCards]);
  const sortedReadiness = useMemo(
    () =>
      [...serviceReadiness].sort((a, b) => {
        if (Number(b.criticalReady) !== Number(a.criticalReady))
          return Number(b.criticalReady) - Number(a.criticalReady);
        return b.score - a.score;
      }),
    [serviceReadiness],
  );
  const activeService = useMemo(
    () =>
      sortedReadiness.find((item) => item.context === activeReadinessContext) ??
      sortedReadiness[0],
    [activeReadinessContext, sortedReadiness],
  );
  const evidenceReviewCards = useMemo(
    () =>
      activeCards.filter((card) => {
        const trust = homeCardTrust(card);
        return trust.tone === "yellow" || trust.tone === "red";
      }),
    [activeCards],
  );
  const appointmentStart = nextAppointment
    ? appointmentStartFromCard(nextAppointment)
    : null;
  const appointmentDate = appointmentStart
    ? homeDisplayDateTime(appointmentStart)
    : null;
  const appointmentIssuer = nextAppointment?.issuerHospitalName ?? null;
  const todayLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="clinical-home" data-testid="clinical-home">
      <header className="clinical-home-greeting">
        <div>
          <p>{todayLabel}</p>
          <h2>สวัสดีครับ {user.nameTh}</h2>
        </div>
        <span className={offlineOnline ? "is-online" : "is-offline"}>
          <i aria-hidden="true" />
          {offlineOnline ? "พร้อมใช้งาน" : "ใช้งานแบบออฟไลน์"}
        </span>
      </header>

      <section className="clinical-appointment-hero">
        <div className="clinical-appointment-copy">
          <span className="clinical-appointment-icon" aria-hidden="true">
            <CalendarDays />
          </span>
          <div>
            <p className="clinical-eyebrow">นัดหมายถัดไป</p>
            <h1>
              {nextAppointment
                ? "พร้อมสำหรับนัดหมายถัดไป"
                : "พร้อมสำหรับบริการครั้งถัดไป"}
            </h1>
            {appointmentIssuer ? <strong>{appointmentIssuer}</strong> : null}
            {appointmentDate ? <span>{appointmentDate}</span> : null}
            {activeService ? (
              <small>
                เอกสารจำเป็น {activeService.requiredReady}/
                {activeService.requiredTotal} รายการ
              </small>
            ) : null}
            <div className="clinical-hero-actions">
              <Button
                onClick={() =>
                  onPrepareContext(
                    activeService?.context ?? activeReadinessContext,
                  )
                }
              >
                เตรียมเข้ารับบริการ <ChevronRight size={18} />
              </Button>
              {nextAppointment ? (
                <button
                  type="button"
                  className="clinical-text-action"
                  onClick={() => onOpenCard(nextAppointment)}
                >
                  ดูรายละเอียดนัดหมาย
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <img
          className="clinical-hospital-illustration"
          src="/assets/illustrations/appointment-hospital.png"
          alt=""
        />
      </section>

      <section className="clinical-home-section clinical-important-section">
        <div className="clinical-section-heading">
          <div>
            <p className="clinical-eyebrow">หยิบใช้ได้ทันที</p>
            <h2>เอกสารสำคัญ</h2>
          </div>
          <button
            type="button"
            className="clinical-text-action"
            onClick={() => onView("documents")}
          >
            ดูเอกสารทั้งหมด <ChevronRight size={16} />
          </button>
        </div>
        <div className="clinical-important-grid">
          {importantCardItems.map(({ card, summaryRows }) => {
            const trust = homeCardTrust(card);
            const isIdentity = card.cardType === "patient_identity";
            return (
              <button
                key={card.id}
                type="button"
                className="clinical-document-pass"
                onClick={() => onOpenCard(card)}
              >
                <span className="clinical-pass-icon" aria-hidden="true">
                  {isIdentity ? (
                    <CredentialSubjectAvatar card={card} />
                  ) : card.cardType.includes("medication") ||
                    card.cardType === "prescription" ? (
                    <Pill />
                  ) : card.cardType.includes("coverage") ||
                    card.cardType.includes("eligibility") ? (
                    <Building2 />
                  ) : (
                    <IdCard />
                  )}
                </span>
                <span className="clinical-pass-copy">
                  <strong>{card.displayName}</strong>
                  <small>
                    {card.issuerHospitalName ??
                      categoryLabel(card.documentCategory)}
                  </small>
                  <span>
                    {card.expiresAt
                      ? `ใช้ได้ถึง ${homeDisplayDate(card.expiresAt)}`
                      : categoryLabel(card.documentCategory)}
                  </span>
                </span>
                {summaryRows.length ? (
                  <dl className="clinical-pass-summary">
                    {summaryRows.map((row) => (
                      <div className="clinical-pass-summary-row" key={row.key}>
                        <dt>{row.label}</dt>
                        <dd title={row.value}>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <span className={`clinical-trust-state tone-${trust.tone}`}>
                  <ShieldCheck size={14} /> {trust.label}
                </span>
                <ChevronRight className="clinical-pass-chevron" size={18} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="clinical-home-section clinical-recent-section">
        <div className="clinical-section-heading">
          <div>
            <p className="clinical-eyebrow">อัปเดตจากแหล่งข้อมูลเดิม</p>
            <h2>ล่าสุด</h2>
          </div>
          {canSyncPortalWallet ? (
            <button
              type="button"
              className="clinical-sync-action"
              onClick={onSyncPortal}
              disabled={portalSyncBusy}
            >
              <RefreshCw
                size={16}
                className={portalSyncBusy ? "spin-icon" : undefined}
              />
              {portalSyncBusy ? "กำลังอัปเดต" : "อัปเดตจาก Portal"}
            </button>
          ) : null}
        </div>
        <div className="clinical-recent-list">
          {recentCards.map((card) => {
            const trust = homeCardTrust(card);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpenCard(card)}
              >
                <span className="clinical-list-icon" aria-hidden="true">
                  <FileText size={19} />
                </span>
                <span>
                  <strong>{card.displayName}</strong>
                  <small>
                    {card.issuerHospitalName ??
                      categoryLabel(card.documentCategory)}
                    {card.sourceSystem === "trustcare_portal"
                      ? " · จาก TrustCare Portal"
                      : ""}
                  </small>
                </span>
                <time dateTime={card.createdAt}>
                  {homeDisplayDate(card.createdAt)}
                </time>
                <span className={`clinical-list-trust tone-${trust.tone}`}>
                  {trust.label}
                </span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
      </section>

      {evidenceReviewCards.length ? (
        <section className="clinical-evidence-alert" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>ยังต้องตรวจหลักฐาน</strong>
            <small>
              มี {evidenceReviewCards.length} เอกสารที่ยังตรวจ proof, issuer,
              status, expiry หรือ policy ไม่ครบ
            </small>
          </span>
          <button
            type="button"
            className="clinical-text-action"
            onClick={() => onView("documents")}
          >
            ดูรายการที่ต้องตรวจสอบ <ChevronRight size={16} />
          </button>
        </section>
      ) : null}
    </div>
  );
}

function homeDisplayDate(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function homeDisplayDateTime(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function appointmentStartFromCard(card: WalletCard): string | null {
  const paths = [
    "credentialSubject.appointment.start",
    "vc.credentialSubject.appointment.start",
  ];
  for (const path of paths) {
    const value = getValueAtPath(card.credentialData, path);
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
      return value;
    }
  }
  return null;
}

export function ReceiveView({
  user,
  fixtures,
  livePortalSync,
  developerMode,
  canSyncPortal,
  portalSyncBusy,
  onOpenScanner,
  onSyncPortal,
  onImportPayload,
  onAcceptCredentialOffer,
  onCopyFixture,
}: {
  user: WalletDemoUser;
  fixtures: ReturnType<typeof buildPortalInteroperabilityFixtures>;
  livePortalSync: boolean;
  developerMode: boolean;
  canSyncPortal: boolean;
  portalSyncBusy: boolean;
  onOpenScanner: () => void;
  onSyncPortal: () => void;
  onImportPayload: (value: string) => void;
  onAcceptCredentialOffer: (value: string) => void;
  onCopyFixture: (label: string, value: string) => void;
}) {
  const [payload, setPayload] = useState("");
  return (
    <div className="view-stack">
      <section className="receive-grid">
        <Surface className="receive-card primary">
          <Camera size={26} />
          <div>
            <h2>สแกน QR เอกสารสุขภาพ</h2>
            <p>
              รองรับ SHL, OID4VCI offer, OID4VP request, VP link และ QR
              ตรวจสอบของ TrustCare
            </p>
          </div>
          <Button onClick={onOpenScanner}>
            <QrCode size={18} /> สแกน QR
          </Button>
        </Surface>
        <Surface className="receive-card">
          <Cloud size={26} />
          <div>
            <h2>เชื่อมกับ TrustCare Portal</h2>
            <p>
              {user.source === "trustcare_portal"
                ? "Seed จาก Portal ถูกเชื่อมไว้สำหรับทดสอบ interoperability แล้ว"
                : "ใช้ payload ตัวอย่างด้านล่างเพื่อทดสอบการเชื่อม Wallet นี้กลับไปที่ Portal"}
            </p>
          </div>
          <Badge tone={user.source === "trustcare_portal" ? "blue" : "neutral"}>
            {user.sourceLabel}
          </Badge>
        </Surface>
      </section>

      <Surface>
        <ImportHub
          payload={payload}
          livePortalSync={livePortalSync}
          canSyncPortal={canSyncPortal}
          syncBusy={portalSyncBusy}
          onPayload={setPayload}
          onScan={onOpenScanner}
          onSyncPortal={onSyncPortal}
          onImport={() => {
            onImportPayload(payload);
            setPayload("");
          }}
        />
      </Surface>

      {livePortalSync ? (
        <Surface className="fixture-panel developer-panel">
          <div className="section-title-row">
            <div>
              <h2>Payload จาก Portal จริง</h2>
              <p>
                Wallet นี้ใช้ข้อมูลที่ Sync จาก TrustCare Portal โดยตรง
                จึงไม่แสดง fixture ที่สร้างจาก seed local
                เพื่อป้องกันผลทดสอบปนกัน
              </p>
            </div>
            <Badge tone="green">Live Portal Sync</Badge>
          </div>
        </Surface>
      ) : (
        <Surface
          className={
            developerMode
              ? "fixture-panel developer-panel enabled"
              : "fixture-panel developer-panel"
          }
        >
          <div className="section-title-row">
            <div>
              <h2>ชุดทดสอบจาก TrustCare Portal</h2>
              <p>
                สร้างจาก login ที่ใช้งานอยู่เท่านั้น
                ใช้ทดสอบการส่งข้อมูลไปกลับระหว่าง TrustCare Portal และ Wallet
              </p>
            </div>
            <Badge tone={developerMode ? "green" : "neutral"}>
              {developerMode ? "โหมดนักพัฒนา" : "เครื่องมือรับเอกสาร"}
            </Badge>
          </div>
          <div className="fixture-grid">
            <button
              type="button"
              onClick={() => onImportPayload(fixtures.credentialOfferUrl)}
            >
              <KeyRound size={18} />
              <span>
                <strong>Import OID4VCI</strong>
                <small>offer {fixtures.counts.cards} เอกสาร</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                onAcceptCredentialOffer(fixtures.credentialOfferUrl)
              }
            >
              <BadgeCheck size={18} />
              <span>
                <strong>รับ VC จาก OID4VCI</strong>
                <small>pre-authorized flow + holder proof</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onImportPayload(fixtures.presentationRequestUrl)}
            >
              <QrCode size={18} />
              <span>
                <strong>Import OID4VP</strong>
                <small>request ตรงกับเอกสารที่ใช้งานได้</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                onCopyFixture("OID4VP request", fixtures.presentationRequestUrl)
              }
            >
              <Copy size={18} />
              <span>
                <strong>คัดลอก VP Request</strong>
                <small>วางใน Portal verifier</small>
              </span>
            </button>
            <button
              type="button"
              disabled={!fixtures.shlQrPayload}
              onClick={() =>
                fixtures.shlQrPayload &&
                onCopyFixture("SHL payload", fixtures.shlQrPayload)
              }
            >
              <Network size={18} />
              <span>
                <strong>คัดลอก SHL</strong>
                <small>
                  {fixtures.shlQrPayload ? "พร้อมใช้งาน" : "ไม่มีสำหรับ staff"}
                </small>
              </span>
            </button>
          </div>
        </Surface>
      )}
    </div>
  );
}

export function ShareView({
  cards,
  user,
  initialPurpose,
  initialSelectedCardIds,
  shlPackages,
  verifierResult,
  scanOutcome,
  biometricEnabled,
  exchangeDocuments,
  holderIdentity,
  walletExchangeWorkflow,
  onConfirmBiometric,
  onOpenScanner,
  onVerifyText,
  onExport,
  onPersistShare,
}: {
  cards: WalletCard[];
  user: WalletDemoUser;
  initialPurpose?: ReadinessContext;
  initialSelectedCardIds?: number[];
  shlPackages: ShlPackage[];
  verifierResult: VerifierResult | null;
  scanOutcome: ScanOutcome | null;
  biometricEnabled: boolean;
  exchangeDocuments: WalletDocumentRecordV2[];
  holderIdentity?: HolderSigningIdentity;
  walletExchangeWorkflow: WalletExchangeWorkflow | null;
  onConfirmBiometric: () => Promise<boolean>;
  onOpenScanner: () => void;
  onVerifyText: (value: string) => void;
  onExport: (result: WalletExportResult) => void;
  onPersistShare: (object: WalletStoredObject) => void;
}) {
  const [disclosureIntent, setDisclosureIntent] =
    useState<ShareDisclosureIntent>("minimum_necessary");
  const [credentialInput, setCredentialInput] = useState("");
  const [requestType, setRequestType] = useState("PatientSummaryCredential");
  const [requestQrDataUrl, setRequestQrDataUrl] = useState("");
  const [requestPayload, setRequestPayload] = useState("");
  const shareableCards = useMemo(
    () => cards.filter((card) => card.credentialStatus === "active"),
    [cards],
  );
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [purpose, setPurpose] = useState<ReadinessContext>(
    initialPurpose ?? "opd_visit",
  );
  const [recipient, setRecipient] = useState(
    sharePurposeProfiles.opd_visit.recipient,
  );
  const [expiryMinutes, setExpiryMinutes] = useState(
    sharePurposeProfiles.opd_visit.expiryMinutes,
  );
  const [selectedFields, setSelectedFields] = useState(
    sharePurposeProfiles.opd_visit.fields.map((field) => field.key),
  );
  const [packageProtocol, setPackageProtocol] = useState<PackageProtocol>(
    protocolForTransport(sharePurposeProfiles.opd_visit.transport),
  );
  const [shlPolicy, setShlPolicy] = useState<ShlAccessPolicyState>(
    defaultShlPolicyForContext("opd_visit"),
  );
  const [timeAnchor, setTimeAnchor] = useState<TimeAnchor>("record");
  const [shareQrDataUrl, setShareQrDataUrl] = useState("");
  const [sharePayload, setSharePayload] = useState("");
  const [shareExportPayload, setShareExportPayload] = useState("");
  const [sharePublication, setSharePublication] =
    useState<SharePublicationState>({
      state: "idle",
      message: "",
      warnings: [],
    });
  const shareProfile = sharePurposeProfiles[purpose];
  const previousInitialPurpose = useRef(initialPurpose);

  useEffect(() => {
    if (initialPurpose && initialPurpose !== previousInitialPurpose.current) {
      setPurpose(initialPurpose);
    }
    previousInitialPurpose.current = initialPurpose;
  }, [initialPurpose]);
  const purposeReadiness = useMemo(
    () => assessLocalReadiness(shareableCards, purpose),
    [purpose, shareableCards],
  );
  const purposeSelectedKey = purposeReadiness.selectedCardIds.join("|");
  const initialSelectedKey = (initialSelectedCardIds ?? []).join("|");

  useEffect(() => {
    const availableIds = new Set(shareableCards.map((card) => card.id));
    const routedIds = (initialSelectedCardIds ?? []).filter((id) =>
      availableIds.has(id),
    );
    const recommendedIds = routedIds.length
      ? routedIds
      : purposeReadiness.selectedCardIds.length
        ? purposeReadiness.selectedCardIds
        : shareableCards
            .filter(
              (card) => card.pinned || criticalCardTypes.has(card.cardType),
            )
            .slice(0, 3)
            .map((card) => card.id);
    setSelectedCardIds(recommendedIds);
    setSelectedFields(shareProfile.fields.map((field) => field.key));
    setDisclosureIntent("minimum_necessary");
    setRecipient(shareProfile.recipient);
    setExpiryMinutes(shareProfile.expiryMinutes);
    setPackageProtocol(protocolForTransport(shareProfile.transport));
    setShlPolicy(defaultShlPolicyForContext(purpose));
    setTimeAnchor("record");
    setSharePayload("");
    setShareExportPayload("");
    setShareQrDataUrl("");
    setSharePublication({ state: "idle", message: "", warnings: [] });
  }, [
    initialSelectedCardIds,
    initialSelectedKey,
    purpose,
    purposeSelectedKey,
    shareProfile,
    shareableCards,
  ]);

  const selectedCards = useMemo(() => {
    if (!selectedCardIds.length) return [];
    const selectedIdSet = new Set(selectedCardIds);
    return shareableCards.filter((card) => selectedIdSet.has(card.id));
  }, [selectedCardIds, shareableCards]);
  const shareGatewayReady = Boolean(currentShareGatewayBaseUrl());
  const credentialDisclosureCapabilities = useMemo(
    () =>
      selectedCards.map((card) => ({
        credentialId: String(card.credentialId || card.id),
      })),
    [selectedCards],
  );
  const disclosureResolution = useMemo(
    () =>
      resolveShareDisclosureIntent({
        intent: disclosureIntent,
        selectedFields,
        credentials: credentialDisclosureCapabilities,
      }),
    [credentialDisclosureCapabilities, disclosureIntent, selectedFields],
  );
  const customDisclosureAvailable = useMemo(
    () =>
      resolveShareDisclosureIntent({
        intent: "custom_selection",
        selectedFields,
        credentials: credentialDisclosureCapabilities,
      }).mechanism !== "whole_credential",
    [credentialDisclosureCapabilities, selectedFields],
  );
  useEffect(() => {
    if (disclosureIntent === "custom_selection" && !customDisclosureAvailable) {
      setDisclosureIntent("minimum_necessary");
    }
  }, [customDisclosureAvailable, disclosureIntent]);
  const mode = disclosureResolution.disclosureMode;
  const sharePackageMode = sharePackageModeForUi(
    packageProtocol,
    mode,
    selectedCards.length,
  );
  const sharePolicy = useMemo<ShareAccessPolicy>(
    () =>
      createSharePolicy({
        mode: sharePackageMode,
        disclosureMode: mode,
        selectedFields: protocolRequiresVp(packageProtocol)
          ? disclosureResolution.selectedFields
          : [],
        expiryMinutes,
        timelineAnchor: timeAnchor,
        shl: protocolRequiresShl(packageProtocol)
          ? {
              passcodeRequired: shlPolicy.passcodeRequired,
              passcode: shlPolicy.passcode,
              expiryHours: shlPolicy.expiryHours,
              maxAccessCount: shlPolicy.maxAccessCount,
              longTermAccess: shlPolicy.longTermAccess,
            }
          : undefined,
      }),
    [
      expiryMinutes,
      disclosureResolution,
      packageProtocol,
      sharePackageMode,
      shlPolicy,
      timeAnchor,
    ],
  );
  const shareDraft = useMemo(
    () =>
      createShareDraftFromPrepare({
        context: purpose,
        cards: shareableCards,
        readiness: purposeReadiness,
        selectedCardIds,
        ownerUserId: user.id,
        holderDid: user.holderDid,
        recipient,
        purpose: readinessContextLabels[purpose].th,
      }),
    [
      purpose,
      purposeReadiness,
      recipient,
      selectedCardIds,
      shareableCards,
      user.holderDid,
      user.id,
    ],
  );
  const packetRecommendation = useMemo(
    () =>
      recommendPolicyForDraft(shareDraft, {
        recipientSupportsShl: true,
        trustcareCertificationAvailable: shareGatewayReady,
      }),
    [shareDraft, shareGatewayReady],
  );
  const shareValidation = useMemo<ShareValidationResult>(
    () =>
      validateShareDraft(shareDraft, sharePolicy, {
        shareGatewayReady,
        requireResolvableQr: true,
        biometricRequired: shareProfile.biometricRequired,
        biometricReady: biometricEnabled,
        certifiedShlReady: shareGatewayReady,
      }),
    [
      biometricEnabled,
      shareDraft,
      shareGatewayReady,
      sharePolicy,
      shareProfile.biometricRequired,
    ],
  );
  const shareDisabledReason = shareValidation.primaryDisabledReason;
  const selectedTimeline = useMemo(
    () =>
      buildTimelineItems(selectedCards, new Date().toISOString(), timeAnchor),
    [selectedCards, timeAnchor],
  );
  const shareCopyLabel =
    packageProtocol === "vp"
      ? "คัดลอก VP"
      : packageProtocol === "shl"
        ? "คัดลอก SHL"
        : "คัดลอก SHL + Manifest VP";

  const toggleSelectedCard = (cardId: number) => {
    setSelectedCardIds((previous) =>
      previous.includes(cardId)
        ? previous.filter((id) => id !== cardId)
        : [...previous, cardId],
    );
  };

  const toggleField = (field: string) => {
    setSelectedFields((previous) =>
      previous.includes(field)
        ? previous.filter((item) => item !== field)
        : [...previous, field],
    );
  };

  const selectDisclosureIntent = (intent: ShareDisclosureIntent) => {
    setDisclosureIntent(intent);
    if (intent === "minimum_necessary") {
      setSelectedFields(shareProfile.fields.map((field) => field.key));
    }
  };

  const createSharePacket = useCallback(async () => {
    if (!selectedCards.length) return;
    if (!shareValidation.ok) {
      setSharePublication({
        state: "blocked",
        message:
          shareValidation.blockers[0]?.message ?? "ยังสร้างชุดแชร์เอกสารไม่ได้",
        warnings: shareValidation.blockers.map((issue) => issue.fix),
      });
      return;
    }
    const ok = await onConfirmBiometric();
    if (!ok) return;
    setSharePublication({
      state: "publishing",
      message: protocolRequiresShl(packageProtocol)
        ? "กำลัง publish SHL manifest ไปยัง Share Gateway"
        : "กำลัง publish VP ไปยัง Share Gateway",
      warnings: [],
    });
    const createdAt = new Date().toISOString();
    const expiresAt = protocolRequiresShl(packageProtocol)
      ? shlPolicyExpiry(shlPolicy)
      : new Date(Date.now() + expiryMinutes * 60_000).toISOString();
    const shareGatewayBaseUrl = currentShareGatewayBaseUrl();
    if (packageProtocol === "vp" && !shareGatewayBaseUrl) {
      setSharePayload("");
      setShareExportPayload("");
      setShareQrDataUrl("");
      setSharePublication({
        state: "blocked",
        message:
          "ยังไม่ได้ตั้งค่า Share Gateway สำหรับ publish VP ให้เครื่องอื่นสแกนได้",
        warnings: [
          "ตั้งค่า VITE_TRUSTCARE_SHARE_GATEWAY_URL ให้ชี้ TrustCare Portal Backend หรือใช้ local dev gateway ก่อนสร้าง QR ใช้งานจริง.",
        ],
      });
      return;
    }
    if (protocolRequiresShl(packageProtocol)) {
      try {
        if (
          !shareGatewayBaseUrl ||
          !holderIdentity ||
          !walletExchangeWorkflow
        ) {
          throw new Error(
            "ยังสร้าง SHL ที่ผู้ป่วยลงนามไม่ได้ กรุณาเชื่อมต่อ Wallet Exchange และ Share Gateway ก่อน",
          );
        }
        const selectedCredentialIds = new Set(
          selectedCards.map((card) => String(card.credentialId)),
        );
        const documents = exchangeDocuments.filter((document) =>
          selectedCredentialIds.has(String(document.credential.credentialId)),
        );
        if (!documents.length || documents.length !== selectedCards.length) {
          throw new Error(
            "SHL ที่ผู้ป่วยลงนามใช้ได้เฉพาะเอกสาร Portal ที่ตรวจ proof, issuer, status, expiry และ policy ผ่านแล้ว",
          );
        }
        const consentRef = selectedCards.find(
          (card) => card.cardType === "consent_receipt",
        )?.credentialId;
        if (!consentRef) {
          throw new Error(
            "ยังไม่มีใบยืนยันความยินยอมสำหรับผูกกับ SHL sharing event นี้",
          );
        }
        const hospitalCode = user.hospitalCode.trim().toUpperCase();
        if (!(["TCC", "TCP", "TCM"] as const).includes(hospitalCode as never)) {
          throw new Error(
            "โรงพยาบาลปลายทางยังไม่อยู่ใน Portal Trust Registry สำหรับขอรับรอง SHL",
          );
        }
        const prepared = await walletExchangeWorkflow.prepareHolderAttestedShl({
          publicationId: createSharingEventArtifactId("shl"),
          documents,
          purpose: readinessContextLabels[purpose].th,
          recipient,
          context: purpose,
          consentRef: String(consentRef),
          targetHospitalCode: hospitalCode,
          expiresAt,
          passcodeRequired: shlPolicy.passcodeRequired,
          maxAccessCount: shlPolicy.maxAccessCount,
        });
        const published = await shareGatewayApi.publishHolderAttestedShl({
          gatewayBaseUrl: shareGatewayBaseUrl,
          viewerBaseUrl: currentAppBaseUrl(),
          prepared,
          userId: user.id,
          holderDid: holderIdentity.did,
          purpose,
          purposeLabel: readinessContextLabels[purpose].th,
          recipient,
        });
        const certificationAttempt =
          packageProtocol === "hybrid"
            ? await walletExchangeWorkflow.requestHospitalShlCertification(
                prepared,
              )
            : null;
        const certifiedPublication =
          certificationAttempt?.status === "submitted" &&
          certificationAttempt.response.status === "approved"
            ? await walletExchangeWorkflow.finalizeHospitalCertifiedShl({
                prepared,
                response: certificationAttempt.response,
              })
            : null;
        const publishedCertification = certifiedPublication
          ? await shareGatewayApi.publishHospitalCertifiedShl({
              gatewayBaseUrl: shareGatewayBaseUrl,
              publication: certifiedPublication,
              userId: user.id,
              holderDid: holderIdentity.did,
              purpose,
              purposeLabel: readinessContextLabels[purpose].th,
              recipient,
            })
          : null;
        const exportPayload = JSON.stringify(
          {
            type: publishedCertification
              ? "HospitalCertifiedSHL"
              : "HolderAttestedSHL",
            trustMode: publishedCertification?.trustMode ?? published.trustMode,
            shlPackageId: published.shlPackageId,
            manifestUrl:
              publishedCertification?.manifestUrl ?? published.manifestUrl,
            canonicalShlUrl: published.canonicalShlUrl,
            holderPresentationId: prepared.holderPresentationId,
            manifestHash: prepared.manifestHash,
            fileHashes: prepared.expectedManifestCredentialBinding.fileHashes,
            certificationStatus:
              certificationAttempt?.status === "submitted"
                ? certificationAttempt.response.status
                : (certificationAttempt?.status ?? "not_requested"),
            manifestCredentialId:
              certifiedPublication?.objectLinks.manifestCredentialId,
          },
          null,
          2,
        );
        setSharePayload(published.qrPayload);
        setShareExportPayload(exportPayload);
        setShareQrDataUrl(
          await toQrDataUrl(published.qrPayload, { margin: 1, width: 240 }),
        );
        setSharePublication({
          state: "published",
          message: publishedCertification
            ? "โรงพยาบาลรับรองแล้ว · ตรวจลายเซ็น สถานะ hashes ผู้ถือ และนโยบายครบ"
            : packageProtocol === "hybrid"
              ? "สร้าง SHL ที่ผู้ป่วยลงนามแล้ว · รอการรับรองจากโรงพยาบาล"
              : "สร้าง Standard SHL ที่ผู้ป่วยลงนามแล้ว",
          warnings: [
            ...published.warnings,
            ...(publishedCertification?.warnings ?? []),
          ],
          artifactUrl:
            publishedCertification?.manifestUrl ?? published.manifestUrl,
        });
        onPersistShare({
          id: `shl:${published.shlPackageId}:${createdAt}`,
          type: "shl",
          title: publishedCertification
            ? "SHL ที่โรงพยาบาลรับรองแล้ว"
            : "SHL ที่ผู้ป่วยยืนยันการแชร์",
          subtitle: readinessContextLabels[purpose].th,
          status: publishedCertification ? "verified" : "active",
          protocol: "shl",
          createdAt,
          expiresAt,
          source: user.id,
          payload: JSON.parse(exportPayload),
        });
        return;
      } catch (error) {
        setSharePayload("");
        setShareExportPayload("");
        setShareQrDataUrl("");
        setSharePublication({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "สร้าง holder-attested SHL ไม่สำเร็จ",
          warnings: [],
        });
        return;
      }
    }
    const result = buildSharePackage({
      mode: sharePackageMode,
      context: purpose,
      cards: selectedCards,
      selectedCardIds: selectedCards.map((card) => card.id),
      holderDid: holderIdentity?.did ?? user.holderDid,
      recipient,
      purpose: readinessContextLabels[purpose].th,
      selectedFields: sharePolicy.selectedFields,
      expiresAt,
      origin: currentAppBaseUrl(),
      gatewayBaseUrl: shareGatewayBaseUrl ?? undefined,
      viewerBaseUrl: currentAppBaseUrl(),
      shlPolicy: protocolRequiresShl(packageProtocol)
        ? {
            passcodeRequired: shlPolicy.passcodeRequired,
            passcodeHint: shlPolicy.passcodeRequired
              ? maskShlPasscode(shlPolicy.passcode)
              : null,
            maxAccessCount: shlPolicy.maxAccessCount,
            accessCodeDelivery: shlPolicy.passcodeRequired
              ? "separate_channel"
              : "not_required",
          }
        : undefined,
    });
    const exportPayload = JSON.stringify(
      {
        ...result.payload,
        timeline: buildTimelineItems(selectedCards, createdAt, timeAnchor),
        trustcareReadiness: {
          context: purpose,
          label: purposeReadiness.label,
          score: purposeReadiness.score,
          requiredReady: purposeReadiness.requiredReady,
          requiredTotal: purposeReadiness.requiredTotal,
          recommendedReady: purposeReadiness.recommendedReady,
          recommendedTotal: purposeReadiness.recommendedTotal,
          purposeScope: shareProfile.help,
          biometricConfirmed: biometricEnabled,
        },
      },
      null,
      2,
    );
    try {
      if ("presentation" in result) {
        if (!shareGatewayBaseUrl) {
          throw new Error("ยังไม่ได้ตั้งค่า Share Gateway สำหรับ publish VP");
        }
        if (!holderIdentity) {
          throw new Error("ไม่พบ holder key ที่ตรงกับผู้ป่วยสำหรับลงนาม VP");
        }
        const credentialJwts = selectedCards.map(
          (card) => card.credentialProof?.jwt ?? card.credentialJwt,
        );
        if (credentialJwts.some((jwt) => !jwt)) {
          throw new Error("เอกสารที่เลือกต้องมีลายเซ็น issuer ครบทุกฉบับก่อนสร้าง VP");
        }
        const consentRef =
          selectedCards.find((card) => card.cardType === "consent_receipt")
            ?.credentialId ??
          `urn:trustcare:consent:share-event:${result.presentation.presentationId}`;
        const holderPresentation = await createHolderSignedDirectVp({
          identity: holderIdentity,
          holderDid: holderIdentity.did,
          presentationId: result.presentation.presentationId,
          audience: "https://trustcare.network/verifier",
          recipient,
          context: purpose,
          purpose: readinessContextLabels[purpose].th,
          consentRef: String(consentRef),
          credentialJwts: credentialJwts as string[],
          expiresAt,
        });
        const publication = await shareGatewayApi.publishVpSharePackage({
          gatewayBaseUrl: shareGatewayBaseUrl,
          result,
          holderPresentationJwt: holderPresentation.vpJwt,
          userId: user.id,
          holderDid: holderIdentity.did,
          purpose,
          purposeLabel: readinessContextLabels[purpose].th,
          recipient,
          expiresAt,
        });
        if (!publication.qrPayload) {
          throw new Error("Share Gateway ไม่ได้ส่ง VP resolver URL กลับมา");
        }
        const webScanPayload = createScannableWebUrl(publication.qrPayload);
        setSharePayload(webScanPayload);
        setShareExportPayload(exportPayload);
        setShareQrDataUrl(
          await toQrDataUrl(webScanPayload, { margin: 1, width: 240 }),
        );
        setSharePublication({
          state: "published",
          message:
            "สร้าง VP และ publish เป็น resolver URL แล้ว verifier จะ fetch และตรวจ proof/signature จาก backend ก่อนให้ผลยืนยัน",
          warnings: publication.warnings,
          artifactUrl: publication.publicUrl,
        });
        onPersistShare({
          id: `vp:${result.presentation.presentationId}`,
          type: "vp",
          title: "VP ที่ผู้ป่วยสร้างเพื่อการแชร์",
          subtitle: readinessContextLabels[purpose].th,
          status: "active",
          protocol: "trustcare",
          createdAt,
          expiresAt,
          source: user.id,
          payload: result,
        });
        return;
      }

      const shlPublication = shareGatewayBaseUrl
        ? await shareGatewayApi.publishShlSharePackage({
            gatewayBaseUrl: shareGatewayBaseUrl,
            result,
            userId: user.id,
            holderDid: user.holderDid,
            purpose,
            purposeLabel: readinessContextLabels[purpose].th,
            recipient,
            expiresAt,
          })
        : null;
      const shlQrPayload = shlPublication?.qrPayload ?? result.shl.qrPayload;
      setSharePayload(shlQrPayload);
      setShareExportPayload(exportPayload);
      setShareQrDataUrl(
        await toQrDataUrl(shlQrPayload, { margin: 1, width: 240 }),
      );
      setSharePublication({
        state: "published",
        message: shlPublication
          ? "สร้าง SHL และ publish manifest ให้เครื่องอื่น fetch ได้แล้ว"
          : "สร้าง SHL แบบ static demo resolver แล้ว",
        warnings: shlPublication?.warnings ?? result.shl.warnings ?? [],
        artifactUrl:
          shlPublication?.publicUrl ??
          result.shl.manifestUrl ??
          result.shl.viewerUrl ??
          result.shl.webViewerUrl,
      });
      onPersistShare({
        id: `shl:${String(result.shl.gatewayPublicationId ?? result.shl.shlId)}:${createdAt}`,
        type: "shl",
        title: "Standard SHL",
        subtitle: readinessContextLabels[purpose].th,
        status: "active",
        protocol: "shl",
        createdAt,
        expiresAt,
        source: user.id,
        payload: result,
      });
    } catch (error) {
      setSharePayload("");
      setShareExportPayload(exportPayload);
      setShareQrDataUrl("");
      setSharePublication({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Publish share package ไม่สำเร็จ",
        warnings: [],
      });
    }
  }, [
    biometricEnabled,
    exchangeDocuments,
    expiryMinutes,
    mode,
    onConfirmBiometric,
    onPersistShare,
    packageProtocol,
    purpose,
    purposeReadiness,
    recipient,
    selectedCards,
    holderIdentity,
    sharePolicy,
    sharePackageMode,
    shareProfile,
    shareValidation,
    shlPolicy,
    timeAnchor,
    user,
    walletExchangeWorkflow,
  ]);

  const createRequest = useCallback(async () => {
    const payload = JSON.stringify({
      response_type: "vp_token",
      response_mode: "direct_post",
      client_id: "did:web:trustcare-wallet.example:verifier",
      nonce: `trustcare-${Date.now().toString(36)}`,
      state: `state-${Date.now().toString(36)}`,
      presentation_definition: {
        id: "trustcare-wallet-request",
        name: "TrustCare Wallet Verification",
        input_descriptors: [
          {
            id: requestType,
            name: requestType,
            constraints: {
              fields: [
                {
                  path: ["$.type"],
                  filter: { const: requestType },
                },
              ],
            },
          },
        ],
      },
    });
    setRequestPayload(payload);
    setRequestQrDataUrl(
      await toQrDataUrl(
        createScannableWebUrl(
          `openid4vp://?request=${encodeURIComponent(payload)}`,
        ),
        { margin: 1, width: 220 },
      ),
    );
  }, [requestType]);

  return (
    <div className="view-stack">
      {scanOutcome && <ScanOutcomePanel outcome={scanOutcome} />}
      <SharePacketComposer
        purpose={purpose}
        recipient={recipient}
        readiness={purposeReadiness}
        selectedCount={selectedCards.length}
        biometricRequired={shareProfile.biometricRequired}
        biometricReady={biometricEnabled}
        recommendation={packetRecommendation}
        mode={sharePackageMode}
        modeLabel={shareModePatientLabel(sharePackageMode)}
        modeDescription={shareModePatientDescription(sharePackageMode)}
        validation={shareValidation}
      />
      <Surface className="share-flow premium-share-flow">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Share flow</span>
            <h2>สร้างชุดแชร์เอกสาร</h2>
            <p>
              เลือกผู้รับ วัตถุประสงค์ เอกสาร และเงื่อนไขการเปิดอ่าน ระบบจะเลือก
              QR หรือลิงก์สุขภาพที่เหมาะสมให้
            </p>
          </div>
          <Badge tone={shareValidation.publishEnabled ? "green" : "yellow"}>
            {shareValidation.publishEnabled ? "พร้อมตรวจทาน" : "ยังต้องแก้ไข"}
          </Badge>
        </div>
        <div className="share-workspace premium-share-workspace">
          <div className="share-form-column">
            <div className="share-step share-intent-card">
              <span className="step-number">1</span>
              <strong>ตั้งค่าการแชร์</strong>
              <label>
                ผู้รับ
                <input
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                />
              </label>
              <label>
                วัตถุประสงค์
                <select
                  value={purpose}
                  onChange={(event) =>
                    setPurpose(event.target.value as ReadinessContext)
                  }
                >
                  {readinessContextValues.map((context) => (
                    <option key={context} value={context}>
                      {readinessContextLabels[context].th}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                อายุการใช้งาน
                <select
                  value={expiryMinutes}
                  onChange={(event) =>
                    setExpiryMinutes(Number(event.target.value))
                  }
                >
                  <option value={10}>10 นาที</option>
                  <option value={60}>1 ชั่วโมง</option>
                  <option value={1440}>24 ชั่วโมง</option>
                </select>
              </label>
              <div className="share-purpose-summary">
                <Badge
                  tone={purposeReadiness.criticalReady ? "green" : "yellow"}
                >
                  พร้อม {purposeReadiness.requiredReady}/
                  {purposeReadiness.requiredTotal}
                </Badge>
                <span>{shareProfile.help}</span>
              </div>
              <div className="share-auto-transport">
                <ShieldCheck size={19} />
                <span>
                  <small>ระบบเลือกช่องทางส่งที่เหมาะสม</small>
                  <strong>{shareModePatientLabel(sharePackageMode)}</strong>
                  <p>{shareModePatientDescription(sharePackageMode)}</p>
                </span>
              </div>
            </div>

            <div className="share-step share-document-step">
              <span className="step-number">2</span>
              <strong>
                เอกสารที่เลือกสำหรับ {readinessContextLabels[purpose].th}
              </strong>
              <div className="share-select-list purpose-doc-list">
                {shareDraft.documents.map((document) => {
                  const card = document.card;
                  const trust = shareTrustStatusLabel(document.trustStatus);
                  if (document.status === "missing" || !card) {
                    return (
                      <div key={document.key} className="share-missing-doc-row">
                        <AlertTriangle size={18} />
                        <span>
                          <b>{document.label}</b>
                          <small>
                            {document.labelEn} ·{" "}
                            {document.required ? "จำเป็น" : "แนะนำ"} ·
                            ยังไม่มีใน Wallet
                          </small>
                          {document.sourceHint && (
                            <small>แนะนำขอจาก {document.sourceHint}</small>
                          )}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <label key={document.key} className="share-document-row">
                      <input
                        type="checkbox"
                        checked={Boolean(document.selected)}
                        disabled={
                          document.locked || document.status === "unsupported"
                        }
                        onChange={() => toggleSelectedCard(card.id)}
                      />
                      <span>
                        <b>{document.label}</b>
                        <small>
                          {document.labelEn} ·{" "}
                          {document.required ? "จำเป็น" : "แนะนำ"}
                        </small>
                        <small>
                          {document.locked
                            ? "กำหนดโดยคำขอ verifier"
                            : document.status === "unsupported"
                              ? "รูปแบบนี้ยังไม่รองรับใน flow นี้"
                              : (card.issuerHospitalName ??
                                categoryLabel(card.documentCategory))}
                        </small>
                      </span>
                      <Badge tone={trust.tone}>{trust.label}</Badge>
                    </label>
                  );
                })}
              </div>
              {purposeReadiness.missing.length > 0 && (
                <div className="share-missing-list">
                  <strong>ยังขาดตามวัตถุประสงค์นี้</strong>
                  {purposeReadiness.missing.map((item) => (
                    <span key={item.key}>
                      {item.required ? "จำเป็น" : "แนะนำ"}: {item.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="share-step">
              <span className="step-number">3</span>
              <strong>ตรวจสอบข้อมูลก่อนแชร์</strong>
              <p className="share-step-hint">
                ระบบจัดชุดข้อมูลตามวัตถุประสงค์นี้ให้แล้ว
                คุณตรวจและปรับรายการได้ก่อนสร้าง QR
              </p>
              {protocolRequiresVp(packageProtocol) && (
                <>
                  <div
                    className="disclosure-intent-grid"
                    role="group"
                    aria-label="วิธีเลือกข้อมูลสำหรับการแชร์"
                  >
                    {shareDisclosureIntentOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          disclosureIntent === option.value
                            ? "disclosure-intent-card active"
                            : "disclosure-intent-card"
                        }
                        aria-pressed={disclosureIntent === option.value}
                        disabled={
                          option.value === "custom_selection" &&
                          !customDisclosureAvailable
                        }
                        onClick={() => selectDisclosureIntent(option.value)}
                      >
                        <span>
                          <strong>{option.label}</strong>
                          {option.recommended ? <small>แนะนำ</small> : null}
                        </span>
                        <p>
                          {option.value === "custom_selection" &&
                          !customDisclosureAvailable
                            ? "เอกสารชุดนี้ยังเลือกเฉพาะบางข้อมูลไม่ได้"
                            : option.description}
                        </p>
                      </button>
                    ))}
                  </div>
                  <div
                    className="field-chip-grid disclosure-field-grid"
                    role="group"
                    aria-label="รายการข้อมูลตามวัตถุประสงค์"
                  >
                    {shareProfile.fields.map((field) =>
                      disclosureIntent === "custom_selection" &&
                      customDisclosureAvailable ? (
                        <button
                          key={field.key}
                          type="button"
                          className={
                            selectedFields.includes(field.key) ? "active" : ""
                          }
                          onClick={() => toggleField(field.key)}
                        >
                          {field.label}
                        </button>
                      ) : (
                        <span
                          key={field.key}
                          className={
                            disclosureIntent === "complete_documents" ||
                            selectedFields.includes(field.key)
                              ? "field-chip-summary active"
                              : "field-chip-summary"
                          }
                        >
                          {field.label}
                        </span>
                      ),
                    )}
                  </div>
                  <div
                    className={`disclosure-auto-summary${
                      disclosureResolution.warnings.length ? " warning" : ""
                    }`}
                    aria-live="polite"
                  >
                    <div>
                      <ShieldCheck size={19} />
                      <span>
                        <small>ระบบเลือกวิธีส่งให้อัตโนมัติ</small>
                        <strong>{disclosureResolution.patientLabel}</strong>
                      </span>
                    </div>
                    <p>{disclosureResolution.patientDescription}</p>
                    {disclosureResolution.warnings.map((warning) => (
                      <p className="disclosure-warning" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </div>
                </>
              )}
              {protocolRequiresShl(packageProtocol) && (
                <div className="shl-policy-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={shlPolicy.passcodeRequired}
                      onChange={(event) =>
                        setShlPolicy({
                          ...shlPolicy,
                          passcodeRequired: event.target.checked,
                          passcode: event.target.checked
                            ? shlPolicy.passcode ||
                              defaultShlPolicyForContext(purpose).passcode
                            : "",
                        })
                      }
                    />{" "}
                    ใช้ PIN/Passcode
                  </label>
                  {shlPolicy.passcodeRequired && (
                    <label className="pin-code-field">
                      PIN ที่ส่งแยกจาก QR
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={shlPolicy.passcode}
                        placeholder="ตั้ง PIN 4-8 หลัก"
                        onChange={(event) =>
                          setShlPolicy({
                            ...shlPolicy,
                            passcode: normalizeShlPasscode(event.target.value),
                          })
                        }
                      />
                      <small>
                        {shlPasscodeReady(shlPolicy)
                          ? `ตั้งค่าแล้ว ${maskShlPasscode(shlPolicy.passcode)} · ส่ง PIN แยกจาก QR`
                          : "กรุณาตั้ง PIN อย่างน้อย 4 หลัก"}
                      </small>
                    </label>
                  )}
                  <label>
                    หมดอายุ
                    <select
                      value={shlPolicy.expiryHours}
                      onChange={(event) =>
                        setShlPolicy({
                          ...shlPolicy,
                          expiryHours: Number(event.target.value),
                        })
                      }
                    >
                      <option value={1}>1 ชม.</option>
                      <option value={4}>4 ชม.</option>
                      <option value={24}>24 ชม.</option>
                      <option value={72}>72 ชม.</option>
                      <option value={720}>30 วัน</option>
                    </select>
                  </label>
                  <label>
                    เปิดได้
                    <select
                      value={shlPolicy.maxAccessCount}
                      onChange={(event) =>
                        setShlPolicy({
                          ...shlPolicy,
                          maxAccessCount: Number(event.target.value),
                        })
                      }
                    >
                      <option value={1}>1 ครั้ง</option>
                      <option value={3}>3 ครั้ง</option>
                      <option value={5}>5 ครั้ง</option>
                      <option value={8}>8 ครั้ง</option>
                      <option value={20}>20 ครั้ง</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="share-review-card">
                <span className="eyebrow">ตรวจทานก่อนสร้าง QR</span>
                <div>
                  <strong>{shareModePatientLabel(sharePackageMode)}</strong>
                  <small>{shareModePatientDescription(sharePackageMode)}</small>
                </div>
                <dl>
                  <div>
                    <dt>ผู้รับ</dt>
                    <dd>{recipient}</dd>
                  </div>
                  <div>
                    <dt>วัตถุประสงค์</dt>
                    <dd>{readinessContextLabels[purpose].th}</dd>
                  </div>
                  <div>
                    <dt>เอกสารที่เลือก</dt>
                    <dd>{shareValidation.selectedReadyCount} รายการ</dd>
                  </div>
                  <div>
                    <dt>หมดอายุ</dt>
                    <dd>
                      {protocolRequiresShl(packageProtocol)
                        ? `${shlPolicy.expiryHours} ชั่วโมง`
                        : `${expiryMinutes} นาที`}
                    </dd>
                  </div>
                </dl>
                {(shareValidation.blockers.length > 0 ||
                  shareValidation.warnings.length > 0) && (
                  <div className="share-validation-list">
                    {shareValidation.blockers.map((issue) => (
                      <span key={issue.key} className="blocked">
                        {issue.message}
                      </span>
                    ))}
                    {shareValidation.warnings.map((issue) => (
                      <span key={issue.key} className="warning">
                        {issue.message}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="segmented compact">
                <button
                  type="button"
                  className={timeAnchor === "record" ? "active" : ""}
                  onClick={() => setTimeAnchor("record")}
                >
                  Record time
                </button>
                <button
                  type="button"
                  className={timeAnchor === "package" ? "active" : ""}
                  onClick={() => setTimeAnchor("package")}
                >
                  Package time
                </button>
              </div>
              <div className="biometric-note">
                <Fingerprint size={18} />
                {shareProfile.biometricRequired
                  ? "วัตถุประสงค์นี้ต้องยืนยัน Biometric ก่อนสร้าง VP"
                  : biometricEnabled
                    ? "จะยืนยัน Biometric ก่อนแสดง QR"
                    : "สามารถเปิด Biometric เพื่อเพิ่มความปลอดภัย"}
              </div>
              <Button
                onClick={() => void createSharePacket()}
                disabled={!shareValidation.publishEnabled}
              >
                <UserCheck size={18} /> ยืนยันและสร้าง QR
              </Button>
              <DisabledReason reason={shareDisabledReason} />
            </div>
          </div>

          <aside className="share-live-panel">
            <div className="share-step output share-result-card">
              <span className="step-number">4</span>
              <strong>ผลลัพธ์ {shareModePatientLabel(sharePackageMode)}</strong>
              <p className="share-step-hint">
                {shareModePatientDescription(sharePackageMode)}
              </p>
              <div
                className={`share-result-readiness ${
                  shareValidation.publishEnabled ? "ready" : "blocked"
                }`}
              >
                {shareValidation.publishEnabled
                  ? "พร้อมตรวจทานและสร้าง QR"
                  : (shareValidation.blockers[0]?.message ??
                    "ยังไม่พร้อมสร้าง QR")}
              </div>
              {sharePublication.state !== "idle" && (
                <div className={`publication-status ${sharePublication.state}`}>
                  <strong>
                    {sharePublication.state === "publishing"
                      ? "กำลัง publish"
                      : sharePublication.state === "published"
                        ? "พร้อมให้สแกน"
                        : sharePublication.state === "blocked"
                          ? "ยังไม่พร้อม"
                          : "publish ไม่สำเร็จ"}
                  </strong>
                  <span>{sharePublication.message}</span>
                  {sharePublication.artifactUrl && (
                    <small className="mono">
                      {sharePublication.artifactUrl}
                    </small>
                  )}
                  {sharePublication.warnings.map((warning, index) => (
                    <small key={`${warning}-${index}`}>{warning}</small>
                  ))}
                </div>
              )}
              {shareQrDataUrl ? (
                <img src={shareQrDataUrl} alt="Share package QR" />
              ) : (
                <div className="qr-placeholder">
                  <QrCode size={54} />
                  <span>QR จะแสดงหลังตรวจเงื่อนไขสำเร็จ</span>
                </div>
              )}
              <div className="button-row">
                <Button
                  className="secondary"
                  disabled={!sharePayload}
                  onClick={() => void copyText(sharePayload)}
                >
                  <Copy size={18} /> {shareCopyLabel}
                </Button>
                <Button
                  className="secondary"
                  disabled={!sharePayload}
                  onClick={() =>
                    onExport({
                      ok: true,
                      format:
                        packageProtocol === "vp"
                          ? "trustcare-vp-json"
                          : packageProtocol === "shl"
                            ? "shl-json"
                            : "trustcare-hybrid-vp-shl-json",
                      fileName: `trustcare-${packageProtocol}-share-${Date.now()}.json`,
                      mimeType:
                        packageProtocol === "shl"
                          ? "application/shl+json"
                          : "application/vp+json",
                      data: shareExportPayload || sharePayload,
                      warnings: [],
                    })
                  }
                >
                  <Download size={18} /> ส่งออก
                </Button>
              </div>
            </div>
            <div className="timeline-panel share-timeline-panel">
              <div>
                <span className="eyebrow">Timeline ที่จะส่ง</span>
                <strong>
                  {timeAnchor === "record"
                    ? "ยึดเวลาของ record"
                    : "ยึดเวลาที่จัด package"}
                </strong>
              </div>
              <div className="timeline-list">
                {selectedTimeline.map((item) => (
                  <div
                    key={`${item.id}-${item.recordTimestamp}`}
                    className="timeline-row"
                  >
                    <span>{item.displayDate}</span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.source} · record {item.recordDate} · package{" "}
                      {item.packageDate}
                    </small>
                  </div>
                ))}
                {!selectedTimeline.length && (
                  <p className="muted">เลือกเอกสารเพื่อดู timeline ก่อนแชร์</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </Surface>

      <details className="share-secondary-tools">
        <summary>เครื่องมือตรวจสอบและรายละเอียดทางเทคนิค</summary>
        <Surface className="portal-section verifier-mode-section">
          <div className="portal-card-header">
            <div className="portal-card-title">
              <ShieldCheck size={22} />
              <span>วิธีส่งที่ระบบเลือก</span>
            </div>
            <Badge tone="blue">อัตโนมัติ</Badge>
          </div>
          <div className="technical-resolution-card">
            <strong>{disclosureResolution.patientLabel}</strong>
            <span>{disclosureResolution.patientDescription}</span>
            <dl>
              <div>
                <dt>นโยบายที่ผู้ใช้เลือก</dt>
                <dd>{disclosureIntent}</dd>
              </div>
              <div>
                <dt>กลไกภายใน</dt>
                <dd>{disclosureResolution.mechanism}</dd>
              </div>
            </dl>
          </div>
        </Surface>

        <div className="verifier-grid">
          <Surface className="portal-section">
            <div className="portal-card-header">
              <div className="portal-card-title">
                <Shield size={22} />
                <span>ตรวจสอบด้วย Credential ID</span>
              </div>
            </div>
            <div className="credential-id-panel">
              <label>Credential ID</label>
              <input
                value={credentialInput}
                onChange={(event) => setCredentialInput(event.target.value)}
                placeholder="vc-studentid-6501001001... หรือ VP URL/JWT/JSON"
              />
              <div className="button-row">
                <Button
                  disabled={!credentialInput.trim()}
                  onClick={() => onVerifyText(credentialInput.trim())}
                >
                  <ShieldCheck size={18} /> ตรวจสอบ
                </Button>
                <Button className="secondary" onClick={onOpenScanner}>
                  <Camera size={18} /> สแกน QR
                </Button>
              </div>
              <p>{disclosureResolution.patientDescription}</p>
            </div>
          </Surface>

          <Surface className="portal-section">
            <div className="portal-card-header">
              <div className="portal-card-title">
                <QrCode size={22} />
                <span>สร้าง QR Verification Request</span>
              </div>
            </div>
            <div className="credential-id-panel">
              <label>ประเภท VC ที่ต้องการตรวจ</label>
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value)}
              >
                <option value="PatientSummaryCredential">
                  Patient Summary
                </option>
                <option value="PatientIdentityCredential">
                  Patient Identity
                </option>
                <option value="PrescriptionCredential">Prescription</option>
              </select>
              <Button className="purple" onClick={() => void createRequest()}>
                <QrCode size={18} /> สร้าง QR Request
              </Button>
              {requestQrDataUrl && (
                <div className="request-preview">
                  <div className="qr-inline">
                    <img src={requestQrDataUrl} alt="OID4VP request QR" />
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(requestPayload)}
                    className="link-button"
                  >
                    คัดลอก OID4VP request
                  </button>
                </div>
              )}
            </div>
          </Surface>
        </div>

        {verifierResult && (
          <Surface className="verification-result">
            <div className="result-heading">
              <Badge tone={verifierBadgeTone(verifierResult)}>
                {verifierBadgeLabel(verifierResult)}
              </Badge>
              {verifierResult.protocol && (
                <Badge tone="blue">{verifierResult.protocol}</Badge>
              )}
            </div>
            <h3>{verifierResult.issuer}</h3>
            <p>{verifierResult.requestSummary ?? verifierResult.holderDid}</p>
            {!!verifierResult.matchedCredentialIds?.length && (
              <p className="mono">
                Matched: {verifierResult.matchedCredentialIds.join(", ")}
              </p>
            )}
            {verifierResult.warnings?.map((item, index) => (
              <small key={`${item}-${index}`}>{item}</small>
            ))}
            {verifierResult.errors?.map((item, index) => (
              <small className="error" key={`${item}-${index}`}>
                {item}
              </small>
            ))}
            {Array.isArray(verifierResult.verificationChecklist) && (
              <TrustChecklist
                title="ผลตรวจความน่าเชื่อถือ"
                items={verifierResult.verificationChecklist}
              />
            )}
          </Surface>
        )}
        <section className="shl-grid">
          {shlPackages.map((shl) => {
            const stored = walletObjectsFromShl([shl])[0];
            return (
              <Surface key={shl.id} className="shl-card">
                <Badge tone={storedObjectTone(stored)}>
                  {statusLabel(shl.status)}
                </Badge>
                <h3>{shl.label}</h3>
                <p>
                  {shl.purpose} / {shl.context}
                </p>
                <ul>
                  {shlAccessSummary(shl).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <dl className="details-grid compact">
                  <div>
                    <dt>Manifest VC</dt>
                    <dd className="mono">{shl.manifestCredentialId ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Holder VP</dt>
                    <dd className="mono">{shl.presentationId ?? "-"}</dd>
                  </div>
                </dl>
                {stored && (
                  <Button
                    className="secondary"
                    onClick={() => onExport(exportWalletObject(stored))}
                  >
                    <Download size={18} /> ส่งออก SHL
                  </Button>
                )}
              </Surface>
            );
          })}
        </section>
      </details>
    </div>
  );
}

export function DocumentFlowDialog({
  mode,
  user,
  context,
  requirements,
  errorMessage,
  onClose,
  onSubmit,
}: {
  mode: DocumentFlowMode;
  user: WalletDemoUser;
  context: ReadinessContext;
  requirements: ReadinessRequirement[];
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (draft: DocumentRequestDraft) => void;
}) {
  const [source, setSource] = useState<DocumentRequestSource | undefined>(
    mode === "import" ? "patient_upload" : undefined,
  );
  const [format, setFormat] = useState<DocumentRequestFormat | undefined>();
  const [scope, setScope] = useState<DocumentPackageScope>(
    requirements.flatMap((item) => item.cardTypes ?? []).length > 1
      ? "document_bundle"
      : "single_document",
  );
  const [returnChannel, setReturnChannel] = useState<
    DocumentRequestReturnChannel | undefined
  >();
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [expiryHours, setExpiryHours] = useState(24);
  const [maxAccessCount, setMaxAccessCount] = useState(5);
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "identity",
    "clinical_summary",
  ]);

  const plan = useMemo(
    () =>
      buildDocumentRequestPlan({
        context,
        requirements,
        source: mode === "import" ? source : undefined,
        format: mode === "import" ? format : undefined,
        scope: mode === "import" ? scope : undefined,
      }),
    [context, format, mode, requirements, scope, source],
  );
  const fallbackReturnChannel =
    plan.returnChannelOptions.find(
      (option) => option.enabled && option.recommended,
    )?.id ??
    plan.returnChannelOptions.find((option) => option.enabled)?.id ??
    "manual_upload";
  const selectedReturnChannel =
    plan.returnChannelOptions.find(
      (option) => option.id === returnChannel && option.enabled,
    )?.id ?? fallbackReturnChannel;
  const hasShlPasscodeError =
    mode === "import" &&
    plan.controls.shlAccessPolicy &&
    passcodeRequired &&
    maxAccessCount < 1;

  const submit = () => {
    if (hasShlPasscodeError) return;
    if (mode === "request") {
      onSubmit(
        createAutomaticDocumentRequestDraft({
          context,
          requirements,
        }),
      );
      return;
    }
    onSubmit(
      createDocumentRequestDraft({
        context,
        requirements,
        source: plan.selectedSource,
        format: plan.selectedFormat,
        scope: plan.selectedScope,
        returnChannel: selectedReturnChannel,
        patientId: user.patientId,
        accessPolicy: plan.controls.shlAccessPolicy
          ? {
              passcodeRequired,
              expiryHours,
              maxAccessCount,
            }
          : undefined,
        selectiveDisclosureFields: plan.controls.selectiveDisclosure
          ? selectedFields
          : undefined,
      }),
    );
  };

  const title = mode === "import" ? "นำเข้าเอกสาร" : "ขอเอกสารที่ขาด";
  const subtitle =
    mode === "import"
      ? "เลือกแหล่งที่มาและรูปแบบไฟล์ ระบบจะเก็บเป็น DocumentReference ก่อน จนกว่าจะมี issuer ลงนาม"
      : "ตรวจรายการแล้วส่งคำขอครั้งเดียว ระบบจะเลือกวิธีรับเอกสารที่เหมาะสมให้โดยอัตโนมัติ";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="credential-dialog document-flow-dialog">
        <div className="modal-header">
          <div className="dialog-title-stack">
            <h2>{title}</h2>
            <p>{subtitle}</p>
            <div className="breadcrumb-row">
              <button className="dialog-back-button" onClick={onClose}>
                <ArrowLeft size={16} /> กลับ
              </button>
              <span>เตรียมบริการ / {title}</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </div>

        <div className="document-flow-body">
          {errorMessage && (
            <div className="document-flow-submit-error" role="alert">
              <AlertTriangle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}
          <AcquisitionPlanner
            mode={mode}
            plan={plan}
            scope={mode === "request" ? plan.selectedScope : scope}
            selectedReturnChannel={selectedReturnChannel}
            onSource={(id) => {
              setSource(id);
              setFormat(undefined);
              setReturnChannel(undefined);
            }}
            onFormat={(id) => {
              setFormat(id);
              setReturnChannel(undefined);
            }}
            onScope={(nextScope) => {
              setScope(nextScope);
              setFormat(undefined);
              setReturnChannel(undefined);
            }}
            onReturnChannel={setReturnChannel}
            controls={
              <DocumentFlowControls
                plan={plan}
                selectedFields={selectedFields}
                setSelectedFields={setSelectedFields}
                passcodeRequired={passcodeRequired}
                setPasscodeRequired={setPasscodeRequired}
                expiryHours={expiryHours}
                setExpiryHours={setExpiryHours}
                maxAccessCount={maxAccessCount}
                setMaxAccessCount={setMaxAccessCount}
              />
            }
            onCancel={onClose}
            onSubmit={submit}
            submitDisabled={hasShlPasscodeError}
          />
        </div>
      </div>
    </div>
  );
}

export function DocumentFlowControls({
  plan,
  selectedFields,
  setSelectedFields,
  passcodeRequired,
  setPasscodeRequired,
  expiryHours,
  setExpiryHours,
  maxAccessCount,
  setMaxAccessCount,
}: {
  plan: ReturnType<typeof buildDocumentRequestPlan>;
  selectedFields: string[];
  setSelectedFields: (fields: string[]) => void;
  passcodeRequired: boolean;
  setPasscodeRequired: (value: boolean) => void;
  expiryHours: number;
  setExpiryHours: (value: number) => void;
  maxAccessCount: number;
  setMaxAccessCount: (value: number) => void;
}) {
  const toggleField = (field: string) => {
    setSelectedFields(
      selectedFields.includes(field)
        ? selectedFields.filter((item) => item !== field)
        : [...selectedFields, field],
    );
  };
  return (
    <div className="document-flow-control-stack">
      {plan.controls.selectiveDisclosure && (
        <div className="document-flow-control-panel">
          <strong>เลือกข้อมูลที่จำเป็น</strong>
          <p>
            เลือกเฉพาะข้อมูลที่ผู้รับต้องใช้ ระบบจะตรวจความสามารถของเอกสาร
            และเลือกวิธีส่งที่รองรับให้โดยอัตโนมัติ
          </p>
          <div className="field-chip-grid">
            {[
              ["identity", "ตัวตน"],
              ["birthdate", "วันเกิด"],
              ["clinical_summary", "สรุปสุขภาพ"],
              ["medication", "ยา"],
              ["allergy", "ภูมิแพ้"],
              ["coverage", "สิทธิรักษา"],
            ].map(([field, label]) => (
              <button
                key={field}
                className={selectedFields.includes(field) ? "active" : ""}
                onClick={() => toggleField(field)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {plan.controls.shlAccessPolicy && (
        <div className="document-flow-control-panel">
          <strong>SHL Access Policy</strong>
          <p>
            PIN/Passcode ต้องส่งแยกจาก QR ตามแนวทาง SHL และใช้ควบคุมการเปิด
            manifest หรือไฟล์ที่เข้ารหัสไว้
          </p>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={passcodeRequired}
              onChange={(event) => setPasscodeRequired(event.target.checked)}
            />
            ต้องใช้ PIN / Passcode
          </label>
          <div className="document-flow-field-grid">
            <label>
              หมดอายุ
              <select
                value={expiryHours}
                onChange={(event) => setExpiryHours(Number(event.target.value))}
              >
                <option value={1}>1 ชั่วโมง</option>
                <option value={24}>24 ชั่วโมง</option>
                <option value={72}>3 วัน</option>
                <option value={168}>7 วัน</option>
              </select>
            </label>
            <label>
              จำนวนครั้งที่เปิดได้
              <select
                value={maxAccessCount}
                onChange={(event) =>
                  setMaxAccessCount(Number(event.target.value))
                }
              >
                <option value={1}>1 ครั้ง</option>
                <option value={3}>3 ครั้ง</option>
                <option value={5}>5 ครั้ง</option>
                <option value={8}>8 ครั้ง</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {plan.controls.fhirEndpoint && (
        <div className="document-flow-control-panel">
          <strong>FHIR Source Scope</strong>
          <p>
            ต้องมี consent และ scope ที่ระบุ resource เช่น DocumentReference,
            Bundle, DiagnosticReport, Observation หรือ MedicationRequest
          </p>
          <input value="patient/*.read documentreference.read" readOnly />
        </div>
      )}
      {plan.controls.trustCareCertification && (
        <div className="document-flow-control-panel">
          <strong>TrustCare Certification</strong>
          <p>
            ต้องมี holder VP, Manifest Credential และ issuer attestation ที่
            verifier ตรวจสอบได้ก่อน SHL จึงจะกลายเป็น Certified SHL+Manifest VP
          </p>
        </div>
      )}
      {plan.controls.manualFileUpload && (
        <div className="document-flow-control-panel">
          <strong>Manual Import</strong>
          <p>
            รองรับ PDF, รูปภาพ, FHIR JSON หรือ Bundle
            และเก็บเป็นหลักฐานที่ยังไม่ยืนยันก่อน
          </p>
          <div className="manual-drop-zone">
            <Upload size={18} />
            เลือกไฟล์หรือวาง JSON ในขั้นตอนนำเข้าจริง
          </div>
        </div>
      )}
      {!Object.values(plan.controls).some(Boolean) && (
        <p className="muted">ไม่มีเงื่อนไขพิเศษสำหรับรูปแบบนี้</p>
      )}
    </div>
  );
}

export function PrepareView({
  user,
  cards,
  context,
  readiness,
  contractHub,
  workbench,
  requests,
  importJob,
  onContext,
  onPrepareAll,
  onRunPayerLifecycle,
  onRequestMissing,
  onImportMissing,
  onRefreshRequest,
}: {
  user: WalletDemoUser;
  cards: WalletCard[];
  context: ReadinessContext;
  readiness: any;
  contractHub: ContractHubCatalog | null;
  workbench: any;
  requests: WalletCredentialRequestViewModel[];
  importJob: WalletImportJob | null;
  onContext: (context: ReadinessContext) => void;
  onPrepareAll: (selectedCardIds?: number[]) => void;
  onRunPayerLifecycle: (input: {
    context: "insurance_claim" | "cross_border" | "medical_tourist";
    selectedCardIds: number[];
    consentReceiptId: string;
  }) => Promise<PayerLifecycleResult>;
  onRequestMissing: (requirements?: ReadinessRequirement[]) => void;
  onImportMissing: (requirements?: ReadinessRequirement[]) => void;
  onRefreshRequest: (request: WalletCredentialRequestViewModel) => void;
}) {
  const activeContract = contractHub?.contracts.find(
    (item) => item.context === context,
  );
  const localReadiness = useMemo(
    () => assessLocalReadiness(cards, context),
    [cards, context],
  );
  const responseReadiness =
    readiness?.readiness?.context === context ? readiness.readiness : null;
  const readinessResult = cards.length
    ? localReadiness
    : (responseReadiness ?? localReadiness);
  const missing = readinessResult.missing ?? [];
  const ready = readinessResult.ready ?? [];
  const missingRequired = missing.filter((item: any) => item.required);
  const canCreateFullPacket = missingRequired.length === 0;
  const packetContents = cardsSelectedByReadiness(cards, readinessResult);
  const isPrepared = canCreateFullPacket;
  const contextRequests = requests.filter(
    (request) => !request.context || request.context === context,
  );
  const contextImportJob =
    importJob &&
    ((importJob as any).context ? (importJob as any).context === context : true)
      ? importJob
      : null;
  const serviceDocumentSummary = [...ready, ...missing].slice(0, 6);
  const selectedServiceLabel = readinessContextLabels[context].th;
  const serviceDocumentCaption = `เอกสารที่ใช้ในบริการนี้ - ${selectedServiceLabel}`;
  const serviceDocumentDescription = activeContract
    ? `${activeContract.patientLabel} · ${activeContract.bundleTypes.patient}`
    : readinessPurposeTh[context];
  const purposeCards = useMemo(
    () => buildPurposePickerCards(context),
    [context],
  );
  const readinessSummary = useMemo(
    () => buildReadinessSummary(readinessResult),
    [readinessResult],
  );
  const missingDocumentCards = useMemo(
    () => buildMissingDocumentCards(context, missing as ReadinessRequirement[]),
    [context, missing],
  );
  const primaryAction = () => {
    if (!canCreateFullPacket) {
      onRequestMissing(missing as ReadinessRequirement[]);
      return;
    }
    onPrepareAll();
  };
  const prepSteps = [
    {
      title: "เลือกประเภทบริการ",
      description: readinessContextLabels[context].th,
      status: "เสร็จแล้ว",
      complete: true,
    },
    {
      title: "ตรวจเอกสารที่ต้องใช้",
      description: canCreateFullPacket
        ? `พร้อม ${readinessResult.requiredReady ?? 0}/${readinessResult.requiredTotal ?? 0} รายการจำเป็น`
        : `ยังขาด ${missingRequired.length} รายการจำเป็น`,
      status: canCreateFullPacket ? "พร้อม" : "ต้องแก้ไข",
      complete: canCreateFullPacket,
    },
    {
      title: "ไปหน้าแชร์เอกสาร",
      description: isPrepared
        ? "พร้อมเลือกผู้รับ วัตถุประสงค์ รูปแบบ VP/SHL และเงื่อนไขการเปิดเผย"
        : "เตรียมเอกสารจำเป็นให้ครบก่อนแชร์",
      status: isPrepared ? "พร้อมแชร์" : "รอข้อมูล",
      complete: isPrepared,
    },
  ];
  return (
    <div className="view-stack">
      <ReadinessSummaryCard
        summary={readinessSummary}
        onPrimary={primaryAction}
        onImport={() => onImportMissing(missing as ReadinessRequirement[])}
      />

      <section className="prepare-decision-grid">
        <Surface className="service-context-panel">
          <div className="section-title-row">
            <div>
              <h2>1. เลือกบริการที่จะไป</h2>
              <p>
                {activeContract?.patientLabel ?? readinessPurposeTh[context]}
              </p>
            </div>
            <Badge tone="blue">
              Contract Hub {contractHub?.version ?? "demo"}
            </Badge>
          </div>
          <div className="service-context-grid">
            {purposeCards.map((card) => (
              <PurposePickerCard
                key={card.context}
                card={card}
                onSelect={onContext}
              />
            ))}
          </div>
        </Surface>

        <Surface className="package-policy-panel readiness-route-panel">
          <div className="section-title-row">
            <div>
              <h2>2. ตรวจเอกสารที่ระบบจะใช้</h2>
              <p>
                รายการนี้เปลี่ยนตามบริการที่เลือก ส่วนการเลือก VP, SHL, Manifest
                VP และเงื่อนไขการเปิดเผยอยู่ในหน้าแชร์
              </p>
            </div>
            <Badge tone={canCreateFullPacket ? "green" : "yellow"}>
              {canCreateFullPacket ? "ครบตามบริการ" : "ยังขาดเอกสาร"}
            </Badge>
          </div>
          <div className="interop-bridge-strip document-summary-strip">
            <span className="summary-heading">
              <FileText size={16} /> {serviceDocumentCaption}
            </span>
            {serviceDocumentSummary.map((item: any) => (
              <span
                key={item.key}
                className={
                  item.matchedCards?.length
                    ? "ready"
                    : item.required
                      ? "missing required"
                      : "missing"
                }
              >
                {item.matchedCards?.length ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <AlertTriangle size={14} />
                )}
                {item.label}
              </span>
            ))}
            {serviceDocumentSummary.length === 0 && (
              <span>ยังไม่มีเงื่อนไขเอกสาร</span>
            )}
          </div>
        </Surface>
      </section>

      <section className="prep-main-grid">
        <Surface className="prep-checklist">
          <div className="section-title-row">
            <div>
              <h2>3. ตรวจความพร้อม</h2>
              <p>ขั้นตอนทั้งหมดที่ผู้ป่วยต้องทำก่อนส่งข้อมูลให้โรงพยาบาล</p>
            </div>
            <Badge
              tone={
                isPrepared ? "green" : canCreateFullPacket ? "blue" : "yellow"
              }
            >
              {isPrepared
                ? "พร้อมใช้"
                : canCreateFullPacket
                  ? "พร้อมสร้าง"
                  : "ต้องแก้ไข"}
            </Badge>
          </div>
          <div className="prep-task-list">
            {prepSteps.map((step, index) => (
              <PrepTaskRow key={step.title} index={index + 1} {...step} />
            ))}
          </div>
        </Surface>

        <Surface className="prep-documents-panel">
          <div className="section-title-row">
            <div>
              <h2>{serviceDocumentCaption}</h2>
              <p>{serviceDocumentDescription}</p>
            </div>
            <Badge tone={canCreateFullPacket ? "green" : "yellow"}>
              {packetContents.length} รายการตรงเงื่อนไข
            </Badge>
          </div>
          {!canCreateFullPacket && (
            <div className="prep-warning-inline">
              <AlertTriangle size={18} />
              <span>
                ยังขาดเอกสารจำเป็น {missingRequired.length} รายการ
                ควรขอจากโรงพยาบาลหรือนำเข้าเอกสารก่อนสร้างชุดพร้อมรับบริการ
              </span>
            </div>
          )}
          {!!missingDocumentCards.length && (
            <div className="missing-document-grid">
              {missingDocumentCards.map((card) => (
                <MissingDocumentCard
                  key={card.key}
                  card={card}
                  onRequest={() =>
                    onRequestMissing(
                      (missing as ReadinessRequirement[]).filter(
                        (item) => item.key === card.key,
                      ),
                    )
                  }
                  onImport={() =>
                    onImportMissing(
                      (missing as ReadinessRequirement[]).filter(
                        (item) => item.key === card.key,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
          <div className="readiness-doc-list">
            {ready.map((item: any) => (
              <div key={item.key} className="readiness-doc-row ready">
                <CheckCircle2 size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.required ? "จำเป็น" : "แนะนำ"}</small>
                </span>
                <Badge tone="green">พร้อม</Badge>
              </div>
            ))}
            {missing.map((item: any) => (
              <div key={item.key} className="readiness-doc-row missing">
                <AlertTriangle size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.required ? "จำเป็น" : "แนะนำ"}</small>
                </span>
                <Badge tone={item.required ? "red" : "yellow"}>ยังขาด</Badge>
              </div>
            ))}
          </div>
          <div className="prep-doc-actions">
            <Button
              onClick={() =>
                onRequestMissing(missing as ReadinessRequirement[])
              }
              disabled={!missing.length}
            >
              <FilePlus2 size={18} /> ขอเอกสารที่ขาด
            </Button>
            <Button
              className="secondary"
              onClick={() => onImportMissing(missing as ReadinessRequirement[])}
              disabled={!missing.length}
            >
              <Upload size={18} /> นำเข้าเอกสาร
            </Button>
          </div>
        </Surface>
      </section>

      <PayerOrchestrationPanel
        user={user}
        context={context}
        cards={cards}
        readiness={readinessResult}
        packetCards={packetContents}
        onPrepareAll={onPrepareAll}
        onRunLifecycle={onRunPayerLifecycle}
      />

      <Surface className="bundle-dashboard service-output-panel">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">ขั้นตอนถัดไป</span>
            <h2>4. ไปหน้าแชร์เอกสาร</h2>
            <p>
              หน้าเตรียมบริการตรวจความพร้อมเท่านั้น
              หลังจากนี้หน้าแชร์จะให้เลือกผู้รับ วัตถุประสงค์ รูปแบบ VP/SHL
              และเงื่อนไขการเปิดเผยก่อนสร้าง QR
            </p>
          </div>
          <Badge tone={isPrepared ? "green" : "yellow"}>
            {isPrepared ? "พร้อมแชร์" : "ยังไม่พร้อม"}
          </Badge>
        </div>
        <div className="prep-primary-row">
          <Button
            className={canCreateFullPacket ? "purple" : "secondary"}
            onClick={() => onPrepareAll()}
            disabled={!canCreateFullPacket}
          >
            <Send size={18} /> ไปหน้าแชร์เอกสาร
          </Button>
          {!canCreateFullPacket && (
            <span>ไปหน้าแชร์ได้หลังเอกสารจำเป็นครบ</span>
          )}
        </div>
        <div className="share-route-summary">
          <div>
            <strong>{selectedServiceLabel}</strong>
            <small>{serviceDocumentDescription}</small>
          </div>
          <div>
            <strong>เลือก Package ในหน้าแชร์</strong>
            <small>Direct VP, Purpose VP, SHL หรือ SHL + Manifest VP</small>
          </div>
          <div>
            <strong>
              จำเป็น {readinessResult.requiredReady ?? 0}/
              {readinessResult.requiredTotal ?? 0}
            </strong>
            <small>
              แนะนำ {readinessResult.recommendedReady ?? 0}/
              {readinessResult.recommendedTotal ?? 0}
            </small>
          </div>
        </div>
      </Surface>

      <Surface className="packet-content-preview">
        <div className="section-title-row">
          <div>
            <h3>5. รายการเอกสารที่พร้อมใช้</h3>
            <p>
              รายการด้านล่างคือเอกสารที่ตรงเงื่อนไขของบริการนี้
              และจะถูกส่งต่อไปเป็นค่าเริ่มต้นในหน้าแชร์
            </p>
          </div>
          <Badge tone={canCreateFullPacket ? "green" : "yellow"}>
            {canCreateFullPacket ? "ครบถ้วน" : "ยังไม่ครบ"}
          </Badge>
        </div>
        <div className="compact-list">
          {packetContents.map((card: WalletCard) => (
            <div key={card.id} className="packet-content-row">
              <ShieldCheck size={18} />
              <span>
                <strong>{card.displayNameEn ?? card.displayName}</strong>
                <small>{categoryLabel(card.documentCategory)}</small>
              </span>
              <Badge tone={credentialStatusTone(card.credentialStatus)}>
                {credentialStatusLabel(card.credentialStatus)}
              </Badge>
            </div>
          ))}
          {!packetContents.length && (
            <p className="muted">ยังไม่มีเอกสารที่ตรงเงื่อนไข</p>
          )}
        </div>
      </Surface>

      <div className="prepare-support-grid">
        <Surface>
          <h3>คำขอเอกสาร</h3>
          {contextRequests.length ? (
            <div className="request-list">
              {contextRequests.map((request) => (
                <div
                  key={request.requestId ?? request.id}
                  className="request-row credential-request-row"
                >
                  <FilePlus2 size={18} />
                  <div className="request-row-content">
                    <strong>{request.documentType ?? "เอกสารที่ขาด"}</strong>
                    <small>
                      {credentialRequestStatusLabel(request.status)} ·{" "}
                      {request.sourceName ?? request.sourceType ?? "โรงพยาบาล"}
                    </small>
                    {!!request.items?.length && (
                      <div className="credential-request-progress">
                        {request.items.map((item) => (
                          <span key={`${item.requestId}:${item.documentType}`}>
                            <b>
                              {credentialRequestDocumentLabel(
                                item.documentType,
                              )}
                            </b>
                            <small>
                              {credentialRequestStatusLabel(item.status)}
                            </small>
                          </span>
                        ))}
                      </div>
                    )}
                    {request.nextAction && (
                      <small className="credential-request-next-action">
                        {credentialRequestNextActionLabel(request.nextAction)}
                      </small>
                    )}
                    {request.refreshError && (
                      <small className="credential-request-error" role="alert">
                        {request.refreshError}
                      </small>
                    )}
                  </div>
                  {request.clientRequestId && (
                    <div className="credential-request-actions">
                      <Badge tone={credentialRequestTone(request.status)}>
                        {credentialRequestStatusLabel(request.status)}
                      </Badge>
                      <Button
                        className="secondary credential-request-refresh"
                        disabled={request.refreshing}
                        onClick={() => onRefreshRequest(request)}
                      >
                        <RefreshCw
                          size={15}
                          className={
                            request.refreshing ? "spin-icon" : undefined
                          }
                        />
                        {request.refreshing ? "กำลังตรวจ" : "ตรวจสถานะ"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p>
              ยังไม่มีคำขอค้างอยู่สำหรับ {readinessContextLabels[context].th}
            </p>
          )}
        </Surface>
        <Surface>
          <h3>งานนำเข้าเอกสาร</h3>
          {contextImportJob ? (
            <div className="request-row">
              <Upload size={18} />
              <span>
                <strong>
                  {contextImportJob.documentType ?? contextImportJob.sourceType}
                </strong>
                <small>
                  {contextImportJob.importId} ·{" "}
                  {statusLabel(contextImportJob.status)}
                </small>
              </span>
            </div>
          ) : (
            <p>ยังไม่มีงานนำเข้าสำหรับบริการนี้</p>
          )}
        </Surface>
        <Surface>
          <h3>สถานะ Contract Hub</h3>
          <p>
            {workbench?.tasks?.length ?? workbench?.actions?.length ?? 0} งานจาก
            Contract Hub พร้อมตรวจสอบ
          </p>
        </Surface>
      </div>
    </div>
  );
}

export function PrepTaskRow({
  index,
  title,
  description,
  status,
  complete,
}: {
  index: number;
  title: string;
  description: string;
  status: string;
  complete: boolean;
}) {
  return (
    <div className={complete ? "prep-task-row complete" : "prep-task-row"}>
      <div className="prep-task-index">
        {complete ? <CheckCircle2 size={18} /> : index}
      </div>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Badge tone={complete ? "green" : "yellow"}>{status}</Badge>
    </div>
  );
}

export function StoreView({
  user,
  objects,
  allObjects,
  filter,
  onFilter,
  onImport,
  onExport,
}: {
  user: WalletDemoUser;
  objects: WalletStoredObject[];
  allObjects: WalletStoredObject[];
  filter: StoreFilter;
  onFilter: (filter: StoreFilter) => void;
  onImport: (value: string) => unknown;
  onExport: (result: WalletExportResult) => void;
}) {
  const [payload, setPayload] = useState("");
  const [selectedObject, setSelectedObject] =
    useState<WalletStoredObject | null>(null);
  return (
    <div className="view-stack">
      <Surface className="share-command">
        <div>
          <h2>คลัง VC/VP/SHL</h2>
          <p>
            เก็บ VC, holder VP, SHL, Manifest Credential, sync receipts, OID4VCI
            offers และ OID4VP requests ใน wallet เดียว
          </p>
        </div>
        <Button onClick={() => onExport(exportWalletObjects(allObjects))}>
          <Download size={18} /> ส่งออก Wallet
        </Button>
      </Surface>

      <Surface>
        <h3>นำเข้า SHL / VC / VP / OID4VC</h3>
        <div className="import-panel">
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder="วาง shlink:/..., OID4VCI offer, OID4VP request, VC/VP JSON, JWT หรือ verifier URL"
          />
          <Button
            onClick={() => {
              onImport(payload);
              setPayload("");
            }}
            disabled={!payload.trim()}
          >
            <FileJson size={18} /> นำเข้า
          </Button>
        </div>
      </Surface>

      <Surface>
        <div className="segmented">
          {(["all", "vc", "vp", "shl", "oid", "service"] as StoreFilter[]).map(
            (item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                onClick={() => onFilter(item)}
              >
                {item.toUpperCase()}
              </button>
            ),
          )}
        </div>
      </Surface>

      <div className="store-grid">
        {objects.map((object) => (
          <Surface key={object.id} className="store-object">
            <div className="store-object-header">
              <Badge tone={toneForObject(object)}>{object.type}</Badge>
              {object.protocol && <Badge tone="blue">{object.protocol}</Badge>}
              {object.type === "shl" && (
                <Badge
                  tone={
                    getShlTrustProfile(object.payload as ShlPackageDetail).tone
                  }
                >
                  {getShlTrustProfile(object.payload as ShlPackageDetail).label}
                </Badge>
              )}
            </div>
            <h3>{object.title}</h3>
            <p>{object.subtitle ?? object.source ?? object.id}</p>
            <small>{new Date(object.createdAt).toLocaleString("th-TH")}</small>
            <div className="object-actions">
              <Button
                className="secondary"
                onClick={() => setSelectedObject(object)}
              >
                <Eye size={18} /> รายละเอียด
              </Button>
              <Button
                className="secondary"
                onClick={() =>
                  void copyText(JSON.stringify(object.payload, null, 2))
                }
              >
                <Copy size={18} /> คัดลอก
              </Button>
              <Button onClick={() => onExport(exportWalletObject(object))}>
                <Download size={18} /> ส่งออก
              </Button>
            </div>
          </Surface>
        ))}
      </div>
      <StoredObjectDialog
        user={user}
        object={selectedObject}
        onClose={() => setSelectedObject(null)}
        onExport={onExport}
      />
    </div>
  );
}

export function StoredObjectDialog({
  user,
  object,
  onClose,
  onExport,
}: {
  user: WalletDemoUser;
  object: WalletStoredObject | null;
  onClose: () => void;
  onExport: (result: WalletExportResult) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [selectedManifestDocId, setSelectedManifestDocId] = useState("");
  const payloadText = useMemo(
    () => JSON.stringify(object?.payload ?? {}, null, 2),
    [object],
  );
  const scanPayload = useMemo(
    () => (object ? getObjectScanPayload(object) : ""),
    [object],
  );
  const shlDetail =
    object?.type === "shl" ? (object.payload as ShlPackageDetail) : null;
  const manifestDocuments = shlDetail?.documentBundle?.documents ?? [];
  const selectedManifestDoc =
    manifestDocuments.find(
      (document) => document.id === selectedManifestDocId,
    ) ??
    manifestDocuments[0] ??
    null;
  const rawShlPayload = shlDetail?.qrPayload ?? shlDetail?.shlUrl ?? "";
  const storedCredentialCard = useMemo(
    () => storedCredentialCardForRendering(object),
    [object],
  );
  const storedPass = useMemo(
    () =>
      object && !storedCredentialCard
        ? describeStoredObjectPass(object, user)
        : null,
    [object, storedCredentialCard, user],
  );

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    if (!object || !scanPayload) return;
    void toQrDataUrl(scanPayload, { margin: 1, width: 220 }).then((value) => {
      if (!cancelled) setQrDataUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [object, scanPayload]);

  useEffect(() => {
    setSelectedManifestDocId("");
  }, [object?.id]);

  if (!object) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div
        className={`stored-object-dialog${storedCredentialCard ? " stored-vc-dialog" : ""}`}
      >
        <header className="credential-dialog-header">
          <div className="dialog-title-block">
            <div className="dialog-breadcrumb-row">
              <button
                type="button"
                className="dialog-back-button"
                onClick={onClose}
              >
                <ArrowLeft size={15} /> กลับ
              </button>
              <span className="dialog-crumbs">คลังข้อมูล / {object.type}</span>
            </div>
            <div className="dialog-heading-row">
              <p className="eyebrow">
                {object.protocol ?? "trustcare"} / {object.type}
              </p>
              <h2>{object.title}</h2>
              <Badge tone={toneForObject(object)}>
                {statusLabel(object.status)}
              </Badge>
              {shlDetail && (
                <Badge tone={getShlTrustProfile(shlDetail).tone}>
                  {getShlTrustProfile(shlDetail).label}
                </Badge>
              )}
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิดรายละเอียด"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="stored-object-body">
          <section
            className={`stored-object-summary${storedCredentialCard ? " stored-vc-summary" : ""}`}
          >
            {storedCredentialCard ? (
              <div
                className="stored-vc-document"
                aria-label="เอกสาร VC ที่เก็บใน Wallet"
              >
                <CredentialDocument card={storedCredentialCard} />
              </div>
            ) : storedPass ? (
              <BrandedSharePass
                kind={storedPass.kind}
                title={object.title}
                subtitle={storedPass.subtitle}
                ownerLabel={storedPass.ownerLabel}
                sourceLabel={storedPass.sourceLabel}
                issuerLabel={storedPass.issuerLabel}
                protocolLabel={storedPass.protocolLabel}
                accessLabel={storedPass.accessLabel}
                status={statusLabel(object.status)}
                qrDataUrl={qrDataUrl}
                isReady={Boolean(scanPayload)}
                items={storedPass.items}
              />
            ) : null}
            <dl className="details-grid compact">
              <div>
                <dt>ประเภท</dt>
                <dd>{object.type}</dd>
              </div>
              <div>
                <dt>Protocol</dt>
                <dd>{object.protocol ?? "-"}</dd>
              </div>
              <div>
                <dt>แหล่งที่มา</dt>
                <dd>{object.source ?? object.subtitle ?? "-"}</dd>
              </div>
              <div>
                <dt>วันที่บันทึก</dt>
                <dd>{new Date(object.createdAt).toLocaleString("th-TH")}</dd>
              </div>
              <div>
                <dt>หมดอายุ</dt>
                <dd>
                  {object.expiresAt
                    ? new Date(object.expiresAt).toLocaleString("th-TH")
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd className="mono">{object.id}</dd>
              </div>
            </dl>
          </section>
          {shlDetail && (
            <ShlManifestViewer
              shl={shlDetail}
              documents={manifestDocuments}
              selectedDocument={selectedManifestDoc}
              onSelectDocument={setSelectedManifestDocId}
            />
          )}
          <div className="credential-action-grid">
            {storedCredentialCard && (
              <Button
                className="secondary"
                onClick={() => void printStoredCredential()}
              >
                <Printer size={18} /> พิมพ์ / บันทึก PDF
              </Button>
            )}
            <Button
              className="secondary"
              onClick={() => void copyText(scanPayload)}
            >
              <QrCode size={18} />{" "}
              {shlDetail ? "คัดลอก Web Scan URL" : "คัดลอก QR URL"}
            </Button>
            {shlDetail && rawShlPayload && (
              <Button
                className="secondary"
                onClick={() => void copyText(rawShlPayload)}
              >
                <Link2 size={18} /> คัดลอก SHL ดิบ
              </Button>
            )}
            <Button
              className="secondary"
              onClick={() => void copyText(payloadText)}
            >
              <Copy size={18} /> คัดลอก Payload
            </Button>
            <Button onClick={() => onExport(exportWalletObject(object))}>
              <Download size={18} /> ส่งออก
            </Button>
          </div>
          <details className="developer-payload">
            <summary>ดู Payload สำหรับนักพัฒนา</summary>
            <pre className="payload">{payloadText}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export function ShlManifestViewer({
  shl,
  documents,
  selectedDocument,
  onSelectDocument,
}: {
  shl: ShlPackageDetail;
  documents: ShlManifestDocument[];
  selectedDocument: ShlManifestDocument | null;
  onSelectDocument: (id: string) => void;
}) {
  const trustProfile = getShlTrustProfile(shl);
  const hasManifestExtension = hasTrustCareShlManifestExtension(shl);
  if (!hasManifestExtension) {
    return (
      <section className="shl-manifest-viewer standard-shl-viewer">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">{trustProfile.label}</span>
            <h3>
              {trustProfile.kind === "trustcare-pending"
                ? "รอการยืนยัน TrustCare Manifest"
                : "SHL มาตรฐานที่ผู้ถือกุญแจแชร์ได้โดยไม่อ้างการรับรองจากโรงพยาบาล"}
            </h3>
            <p>{trustProfile.description}</p>
          </div>
          <Badge tone={trustProfile.tone}>{trustProfile.label}</Badge>
        </div>
        <div className="manifest-trust-grid">
          <div>
            <span>SHL URL</span>
            <strong className="mono">
              {shl.shlUrl ?? shl.qrPayload ?? "-"}
            </strong>
          </div>
          <div>
            <span>Viewer URL</span>
            <strong className="mono">{shl.viewerUrl ?? "-"}</strong>
          </div>
          <div>
            <span>Access policy</span>
            <strong>
              {shl.passcodeRequired
                ? "ต้องใช้ passcode"
                : "ไม่ต้องใช้ passcode"}{" "}
              · {shl.currentAccessCount ?? 0}/{shl.maxAccessCount ?? "-"}
            </strong>
          </div>
          <div>
            <span>TrustCare proof</span>
            <strong>
              {trustcareCertificationStatusLabel(
                shl.trustcareCertification?.status,
              )}
            </strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="shl-manifest-viewer">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">SMART Health Link Manifest</span>
          <h3>เอกสารใน Manifest และหลักฐาน VP</h3>
          <p>
            SHL เป็น transport ส่วนความน่าเชื่อถือมาจาก Manifest VC, Holder VP
            และ FHIR DocumentReference ของแต่ละเอกสาร
          </p>
        </div>
        <Badge tone={trustProfile.tone}>{trustProfile.label}</Badge>
      </div>
      <div className="manifest-trust-grid">
        <div>
          <span>Manifest VC</span>
          <strong className="mono">{shl.manifestCredentialId ?? "-"}</strong>
        </div>
        <div>
          <span>Holder VP</span>
          <strong className="mono">{shl.presentationId ?? "-"}</strong>
        </div>
        <div>
          <span>TrustCare attestation</span>
          <strong>
            {shl.trustcareCertification?.ownerConfirmed
              ? "ยืนยันผู้ถือเอกสารแล้ว"
              : "รอตรวจผู้ถือเอกสาร"}
          </strong>
        </div>
        <div>
          <span>Access policy</span>
          <strong>
            {shl.passcodeRequired ? "ต้องใช้ passcode" : "ไม่ต้องใช้ passcode"}{" "}
            · {shl.currentAccessCount ?? 0}/{shl.maxAccessCount ?? "-"}
          </strong>
        </div>
        <div>
          <span>มาตรฐาน</span>
          <strong>
            {shl.documentBundle?.standards?.join(" · ") ?? "SHL · VC/VP · FHIR"}
          </strong>
        </div>
      </div>
      <div className="manifest-layout">
        <div className="manifest-doc-list" aria-label="Manifest documents">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              className={selectedDocument?.id === document.id ? "active" : ""}
              onClick={() => onSelectDocument(document.id)}
            >
              <span className="manifest-sequence">{document.sequence}</span>
              <span>
                <strong>{document.title}</strong>
                <small>
                  {document.fhirResource} · {document.contentType}
                </small>
              </span>
              <Badge
                tone={
                  document.status === "available_in_manifest"
                    ? "green"
                    : "yellow"
                }
              >
                {document.status === "available_in_manifest"
                  ? "พร้อมใน Manifest"
                  : document.status}
              </Badge>
            </button>
          ))}
          {!documents.length && (
            <p className="muted">
              Manifest นี้ยังไม่มีรายการเอกสารที่อ่านได้ใน seed
            </p>
          )}
        </div>
        {selectedDocument && (
          <div className="manifest-doc-detail">
            <span className="eyebrow">DocumentReference</span>
            <h4>{selectedDocument.title}</h4>
            <dl className="details-grid compact">
              <div>
                <dt>ประเภท</dt>
                <dd>{selectedDocument.documentType}</dd>
              </div>
              <div>
                <dt>หมวดหมู่</dt>
                <dd>{categoryLabel(selectedDocument.category)}</dd>
              </div>
              <div>
                <dt>FHIR resource</dt>
                <dd>{selectedDocument.fhirResource}</dd>
              </div>
              <div>
                <dt>Manifest file</dt>
                <dd className="mono">
                  {selectedDocument.manifestFileId ?? "-"}
                </dd>
              </div>
              <div>
                <dt>Content hash</dt>
                <dd className="mono">
                  {selectedDocument.hash?.contentHash ?? "-"}
                </dd>
              </div>
              <div>
                <dt>Source bundle</dt>
                <dd className="mono">
                  {selectedDocument.hash?.sourceBundleHash ?? "-"}
                </dd>
              </div>
            </dl>
            <div className="manifest-link-list">
              {Object.entries(selectedDocument.objectLinks ?? {}).map(
                ([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void copyText(String(value))}
                  >
                    <Link2 size={15} />
                    <span>
                      <strong>{key}</strong>
                      <small>{String(value)}</small>
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export type BrandedPassKind = "bundle" | "vp" | "shl" | "store";

export function BrandedSharePass({
  kind,
  title,
  subtitle,
  ownerLabel,
  sourceLabel,
  issuerLabel,
  protocolLabel,
  accessLabel,
  status,
  qrDataUrl,
  isReady,
  items,
}: {
  kind: BrandedPassKind;
  title: string;
  subtitle: string;
  ownerLabel: string;
  sourceLabel: string;
  issuerLabel: string;
  protocolLabel: string;
  accessLabel: string;
  status: string;
  qrDataUrl: string;
  isReady: boolean;
  items: string[];
}) {
  const sourceInitials = initials(sourceLabel);
  const ownerInitials = initials(ownerLabel);
  return (
    <section
      className={`branded-share-pass ${kind} ${isReady ? "ready" : "empty"}`}
      aria-label={`${title} branded QR pass`}
    >
      <div className="branded-pass-main">
        <div className="branded-pass-logos" aria-hidden="true">
          <span className="pass-logo owner">{ownerInitials}</span>
          <span className="pass-from">from</span>
          <span className="pass-logo source">{sourceInitials}</span>
        </div>
        <div className="branded-pass-copy">
          <span className="eyebrow">{protocolLabel}</span>
          <h4>{ownerLabel}</h4>
          <p>{subtitle}</p>
          <dl>
            <div>
              <dt>เจ้าของข้อมูล</dt>
              <dd>{ownerLabel}</dd>
            </div>
            <div>
              <dt>แหล่งที่มา</dt>
              <dd>{sourceLabel}</dd>
            </div>
            <div>
              <dt>ผู้ออก/โฮสต์</dt>
              <dd>{issuerLabel}</dd>
            </div>
            <div>
              <dt>การเข้าถึง</dt>
              <dd>{accessLabel}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="branded-pass-qr">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`${title} QR`} />
        ) : (
          <QrCode size={46} />
        )}
        <small>
          {isReady
            ? "สแกนเพื่อเปิด Web view หรือส่งต่อให้ระบบที่รองรับ"
            : "สร้างก่อนจึงจะแสดง QR จริง"}
        </small>
      </div>
      <div className="branded-pass-items">
        <strong>{title}</strong>
        <ul>
          {items.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {items.length > 5 && <li>+{items.length - 5} รายการเพิ่มเติม</li>}
          {!items.length && <li>รอสร้าง payload</li>}
        </ul>
        <Badge tone={isReady ? "green" : "yellow"}>{status}</Badge>
      </div>
    </section>
  );
}

export function ScanOutcomePanel({ outcome }: { outcome: ScanOutcome }) {
  const matched =
    outcome.verifier.matchedCredentialIds ??
    outcome.importResult.matchedCredentialIds ??
    [];
  const checklist = Array.isArray(outcome.verifier.verificationChecklist)
    ? outcome.verifier.verificationChecklist.filter(
        (
          item,
        ): item is {
          key?: string;
          label?: string;
          ok?: boolean;
          detail?: string;
        } => Boolean(item) && typeof item === "object",
      )
    : [];
  return (
    <Surface className="scan-result-card">
      <div className="scan-result-main">
        <div
          className={
            outcome.verifier.verified
              ? "scan-result-icon ok"
              : "scan-result-icon warn"
          }
        >
          {outcome.verifier.verified ? (
            <ShieldCheck size={22} />
          ) : (
            <AlertTriangle size={22} />
          )}
        </div>
        <div>
          <span className="eyebrow">ผลการสแกนล่าสุด</span>
          <h2>
            {outcome.verifier.verified ? "ตรวจสอบผ่าน" : "ต้องตรวจสอบเพิ่มเติม"}
          </h2>
          <p>
            {outcome.verifier.requestSummary ?? outcome.importResult.format} ·{" "}
            {new Date(outcome.scannedAt).toLocaleString("th-TH")}
          </p>
        </div>
      </div>
      <div className="scan-result-grid">
        <div>
          <small>บริบท</small>
          <strong>{contextLabel(outcome.context)}</strong>
        </div>
        <div>
          <small>Protocol</small>
          <strong>
            {outcome.verifier.protocol ?? outcome.importResult.protocol ?? "-"}
          </strong>
        </div>
        <div>
          <small>Issuer / Verifier</small>
          <strong>{outcome.verifier.issuer ?? "-"}</strong>
        </div>
        <div>
          <small>ตรงกับเอกสาร</small>
          <strong>{matched.length ? `${matched.length} รายการ` : "-"}</strong>
        </div>
      </div>
      {!!checklist.length && (
        <div
          className="scan-checklist"
          aria-label="หลักฐานที่ตรวจสอบจากการสแกน"
        >
          <div className="scan-checklist-heading">
            <ListChecks size={18} />
            <span>หลักฐานที่ตรวจสอบ</span>
          </div>
          <div className="scan-checklist-grid">
            {checklist.map((item, index) => (
              <div
                className={
                  item.ok ? "scan-check-item ok" : "scan-check-item warn"
                }
                key={item.key ?? `${item.label}-${index}`}
              >
                {item.ok ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <AlertTriangle size={17} />
                )}
                <span>
                  <strong>{item.label ?? "หลักฐาน"}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!matched.length && (
        <p className="mono scan-matched">{matched.join(", ")}</p>
      )}
      {!!outcome.verifier.errors?.length && (
        <p className="error-text">{outcome.verifier.errors.join(", ")}</p>
      )}
      {!!outcome.verifier.warnings?.length && (
        <p className="warning-text">{outcome.verifier.warnings.join(", ")}</p>
      )}
    </Surface>
  );
}

export function PublicVerifierView({
  payload,
  outcome,
  busy,
  error,
  onRetry,
  onCopy,
  onOpenScanner,
  onOpenWallet,
}: {
  payload: string;
  outcome: ScanOutcome | null;
  busy: boolean;
  error: string;
  onRetry: () => void;
  onCopy: (value: string) => void | Promise<void>;
  onOpenScanner: () => void;
  onOpenWallet: () => void;
}) {
  const descriptor = describeScannablePayload(payload);
  const originLabel =
    descriptor.transport === "wallet_scan_url"
      ? "Wallet scan URL"
      : descriptor.transport === "standard_shl"
        ? "SMART Health Link"
        : descriptor.transport === "shl_web_viewer"
          ? "SHL web viewer"
          : "Verifier payload";
  const statusTone = outcome?.verifier.verified
    ? "green"
    : error
      ? "red"
      : "yellow";
  const statusText = outcome?.verifier.verified
    ? "Proof verified"
    : busy
      ? "Verifying"
      : error
        ? "Verification failed"
        : "Waiting";
  const checklist = Array.isArray(outcome?.verifier.verificationChecklist)
    ? outcome.verifier.verificationChecklist
    : [];
  const renderedCredentials = useMemo(() => {
    const credentials = Array.isArray(outcome?.verifier.credentials)
      ? outcome.verifier.credentials
      : outcome?.verifier.credential
        ? [outcome.verifier.credential]
        : [];
    return credentials
      .map((credential, index) =>
        walletCardForCredentialRendering(credential, index),
      )
      .filter((card): card is WalletCard => Boolean(card));
  }, [outcome]);
  const presentationCover = useMemo(
    () => presentationCoverFacts(outcome),
    [outcome],
  );
  const [presentationQrDataUrl, setPresentationQrDataUrl] = useState("");
  useEffect(() => {
    let active = true;
    if (renderedCredentials.length < 2 || !payload.startsWith("http")) {
      setPresentationQrDataUrl("");
      return () => {
        active = false;
      };
    }
    void toQrDataUrl(payload)
      .then((value) => {
        if (active) setPresentationQrDataUrl(value);
      })
      .catch(() => {
        if (active) setPresentationQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [outcome?.id, payload, renderedCredentials.length]);
  const documentVerification = outcome
    ? {
        verified: outcome.verifier.verified,
        checklist: normalizeDocumentVerificationChecklist(
          outcome.verifier.verificationChecklist,
        ),
        checkedAt: outcome.scannedAt,
        publicUrl: payload.startsWith("http") ? payload : undefined,
        warnings: outcome.verifier.warnings,
        errors: outcome.verifier.errors,
      }
    : undefined;
  return (
    <main className="public-verifier-shell">
      <section className="public-verifier-card">
        <header className="public-verifier-header">
          <div className="brand-mark">TC</div>
          <div>
            <span className="eyebrow">TrustCare Public Verifier</span>
            <h1>ตรวจสอบ VC/VP จาก QR สาธารณะ</h1>
            <p>
              เปิดจาก Public URL ได้โดยไม่ต้องใช้ session ของ Wallet เดิม ระบบจะ
              fetch resolver, ตรวจ signature, issuer key, nested VC และ expiry
              ก่อนให้ผลผ่าน
            </p>
          </div>
          <Badge tone={statusTone}>{statusText}</Badge>
        </header>

        <div className="public-verifier-grid">
          <Surface className="public-verifier-summary">
            <div className="portal-card-header">
              <div className="portal-card-title">
                <Globe2 size={22} />
                <span>Public resolver</span>
              </div>
              <Badge tone="blue">{descriptor.payloadKind}</Badge>
            </div>
            <dl className="details-grid compact">
              <div>
                <dt>Transport</dt>
                <dd>{originLabel}</dd>
              </div>
              <div>
                <dt>Public URL</dt>
                <dd>{payload.startsWith("http") ? "yes" : "payload"}</dd>
              </div>
              <div>
                <dt>Localhost</dt>
                <dd>
                  {/localhost|127\.0\.0\.1/.test(payload) ? "พบ" : "ไม่พบ"}
                </dd>
              </div>
              <div>
                <dt>Protocol</dt>
                <dd>{outcome?.verifier.protocol ?? "-"}</dd>
              </div>
            </dl>
            <p className="mono public-verifier-payload">{payload}</p>
            <div className="button-row">
              <Button onClick={() => void onCopy(payload)}>
                <Copy size={18} /> คัดลอก URL
              </Button>
              <Button className="secondary" onClick={onRetry} disabled={busy}>
                <RefreshCw size={18} className={busy ? "spin-icon" : ""} />
                ตรวจอีกครั้ง
              </Button>
              <Button className="secondary" onClick={onOpenScanner}>
                <Camera size={18} /> สแกน QR
              </Button>
            </div>
          </Surface>

          <Surface className="public-verifier-summary">
            <div className="portal-card-header">
              <div className="portal-card-title">
                <ShieldCheck size={22} />
                <span>W3C proof checks</span>
              </div>
            </div>
            {busy && <p className="muted">กำลังตรวจ resolver และ proof...</p>}
            {error && <p className="error-text">{error}</p>}
            {!busy && !error && outcome && (
              <>
                <h2>
                  {outcome.verifier.verified
                    ? "ตรวจสอบผ่าน"
                    : "ต้องตรวจสอบเพิ่มเติม"}
                </h2>
                <p>
                  {outcome.verifier.requestSummary ??
                    "Verifier result is available."}
                </p>
                {!!checklist.length && (
                  <TrustChecklist title="ผลตรวจ VC/VP" items={checklist} />
                )}
              </>
            )}
            {!busy && !error && !outcome && (
              <p className="muted">รอ payload สำหรับตรวจสอบ</p>
            )}
          </Surface>
        </div>

        {outcome && <ScanOutcomePanel outcome={outcome} />}

        {renderedCredentials.length ? (
          <section
            className="public-verifier-documents"
            aria-label="เอกสารจาก Verifiable Presentation"
          >
            <header className="public-verifier-documents-header">
              <div>
                <span className="eyebrow">SHARED DOCUMENTS</span>
                <h2>เอกสารที่อยู่ใน VP</h2>
                <p>
                  แสดงด้วย Shared Renderer เดียวกับ Wallet โดยคง issuer และ
                  claims ของแต่ละ VC แยกจากกัน
                </p>
              </div>
              <Badge tone={outcome?.verifier.verified ? "green" : "yellow"}>
                {renderedCredentials.length} เอกสาร
              </Badge>
            </header>
            <div className="public-verifier-document-stack">
              {renderedCredentials.length > 1 ? (
                <PresentationCoverDocument
                  presentationId={presentationCover.presentationId}
                  holderDid={presentationCover.holderDid}
                  purpose={presentationCover.purpose}
                  recipient={presentationCover.recipient}
                  audience={presentationCover.audience}
                  createdAt={presentationCover.validFrom}
                  expiresAt={presentationCover.validUntil}
                  publicUrl={payload.startsWith("http") ? payload : undefined}
                  qrDataUrl={presentationQrDataUrl || undefined}
                  verification={documentVerification}
                  documents={renderedCredentials.map((card) => ({
                    id: card.credentialId
                      ? String(card.credentialId)
                      : undefined,
                    title: card.displayName,
                    titleEn: card.displayNameEn ?? undefined,
                    issuer:
                      card.issuerHospitalName ?? card.issuerDid ?? undefined,
                    issuedAt: card.issuedAt ?? undefined,
                    expiresAt: card.expiresAt ?? undefined,
                    status: card.credentialStatus || undefined,
                  }))}
                />
              ) : null}
              {renderedCredentials.map((card, index) => (
                <CredentialDocument
                  key={`${card.cardType}:${String(card.credentialId || index)}`}
                  card={card}
                  verification={documentVerification}
                />
              ))}
            </div>
          </section>
        ) : null}

        <footer className="public-verifier-footer">
          <span>
            Public verifier mode ไม่อ่านข้อมูลจาก Wallet ในเครื่องนี้ และไม่ต้อง
            login ก่อนตรวจ proof
          </span>
          <Button className="secondary" onClick={onOpenWallet}>
            <Wallet size={18} /> เปิด Wallet demo
          </Button>
        </footer>
      </section>
    </main>
  );
}

function presentationCoverFacts(outcome: ScanOutcome | null): {
  presentationId?: string;
  holderDid?: string;
  purpose?: string;
  recipient?: string;
  audience?: string;
  validFrom?: string;
  validUntil?: string;
} {
  const value = outcome?.verifier.verificationPayload;
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string) =>
    typeof record[key] === "string" && String(record[key]).trim()
      ? String(record[key])
      : undefined;
  return {
    presentationId: text("presentationId"),
    holderDid: text("holderDid") ?? outcome?.verifier.holderDid,
    purpose: text("purpose"),
    recipient: text("recipient"),
    audience: text("audience"),
    validFrom: text("validFrom"),
    validUntil: text("validUntil"),
  };
}

function normalizeDocumentVerificationChecklist(value: unknown): Array<{
  key?: string;
  label?: string;
  ok?: boolean;
  detail?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return [
      {
        key: typeof record.key === "string" ? record.key : undefined,
        label: typeof record.label === "string" ? record.label : undefined,
        ok: typeof record.ok === "boolean" ? record.ok : undefined,
        detail: typeof record.detail === "string" ? record.detail : undefined,
      },
    ];
  });
}

export function ScanResponseDialog({
  open,
  outcome,
  onClose,
  onCopy,
}: {
  open: boolean;
  outcome: ScanOutcome | null;
  onClose: () => void;
  onCopy: (value: string) => void | Promise<void>;
}) {
  if (!open || !outcome) return null;
  const descriptor = outcome.descriptor;
  const manifest = outcome.manifestFetch;
  const importedTitle =
    outcome.importResult.object?.title ?? outcome.importResult.format;
  const shlNeedsPasscode =
    descriptor?.payloadKind === "shl" && descriptor.passcodeRequired;
  const manifestStatus = manifest
    ? manifest.ok
      ? `อ่าน manifest สำเร็จ (${manifest.fileCount} ไฟล์, ${manifest.requestMethod})`
      : (manifest.errors[0] ??
        manifest.warnings[0] ??
        "ยังอ่าน manifest ไม่สำเร็จ")
    : descriptor?.payloadKind === "shl"
      ? "ยังไม่ได้ resolve manifest"
      : "ไม่ใช่ SHL manifest";
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="scan-response-dialog">
        <header className="modal-header">
          <div>
            <ShieldCheck size={22} />
            <span>
              <strong>ผลการสแกน QR</strong>
              <small>
                บันทึกประวัติใน Wallet และแยก scope ตามผู้ใช้ที่ login
              </small>
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Close scan response"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="scan-response-body">
          <ScanOutcomePanel outcome={outcome} />
          <section className="scan-standard-card">
            <div>
              <span className="eyebrow">ผลลัพธ์หลังสแกน</span>
              <h3>
                {descriptor?.payloadKind === "shl"
                  ? "SMART Health Link ถูกนำเข้าแล้ว"
                  : "นำเข้า payload แล้ว"}
              </h3>
              <p>
                {descriptor?.payloadKind === "shl"
                  ? "Wallet เก็บ canonical SHL เดิมไว้และผูก holder VP; หากขอการรับรองจะเพิ่มเฉพาะ Manifest Credential ที่ Portal ลงนามและ Wallet ตรวจผ่าน."
                  : "Payload ถูกบันทึกตาม protocol ที่ตรวจพบ และต้องตรวจสอบความน่าเชื่อถือก่อนนำไปใช้ต่อ."}
              </p>
            </div>
            <Badge tone={outcome.importResult.ok ? "green" : "yellow"}>
              {outcome.importResult.ok ? "นำเข้าแล้ว" : "ตรวจเพิ่ม"}
            </Badge>
          </section>
          <div className="scan-response-meta">
            <div>
              <small>เอกสาร/วัตถุที่นำเข้า</small>
              <strong>{importedTitle}</strong>
            </div>
            <div>
              <small>Transport</small>
              <strong>{scanTransportLabel(descriptor?.transport)}</strong>
            </div>
            <div>
              <small>Manifest endpoint</small>
              <strong className="mono">{descriptor?.manifestUrl ?? "-"}</strong>
            </div>
            <div>
              <small>ผลการอ่าน manifest</small>
              <strong>{manifestStatus}</strong>
            </div>
            <div>
              <small>PIN / Passcode</small>
              <strong>
                {shlNeedsPasscode
                  ? "ต้องส่งแยกจาก QR"
                  : "ไม่ต้องใช้ หรือไม่พบเงื่อนไข PIN"}
              </strong>
            </div>
            <div>
              <small>TrustCare binding</small>
              <strong>
                {trustcareBindingLabel(descriptor?.trustcareBinding)}
              </strong>
            </div>
          </div>
          {shlNeedsPasscode && (
            <div className="scan-spec-note">
              <LockKeyhole size={18} />
              <span>
                ตาม SHL spec QR จะไม่ฝัง PIN/passcode ไว้ใน payload
                ผู้รับต้องได้รับรหัสจากช่องทางอื่นก่อนเรียก manifest endpoint.
              </span>
            </div>
          )}
          <div className="scan-payload-preview">
            <span>Canonical SHL payload</span>
            <code>{shortPayload(outcome.payload)}</code>
          </div>
          <div className="dialog-actions">
            <Button
              className="secondary"
              onClick={() => void onCopy(outcome.payload)}
            >
              <Copy size={17} /> คัดลอก payload
            </Button>
            {descriptor?.webViewerUrl && (
              <Button
                className="secondary"
                onClick={() => void onCopy(descriptor.webViewerUrl ?? "")}
              >
                <Link2 size={17} /> คัดลอก Web URL
              </Button>
            )}
            <Button onClick={onClose}>
              <CheckCircle2 size={17} /> เข้าใจแล้ว
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function getCardRecordTimestamp(card: WalletCard): string {
  const data = card.credentialData ?? {};
  const candidates = [
    data.recordedAt,
    data.recordDate,
    data.serviceDate,
    data.encounterDate,
    data.effectiveDate,
    data.issuedDate,
    data.date,
    data.timestamp,
    card.issuedAt,
    card.createdAt,
  ];
  const value = candidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  return typeof value === "string" ? value : card.createdAt;
}

export function formatTimelineDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildTimelineItems(
  cards: WalletCard[],
  packageTimestamp: string,
  anchor: TimeAnchor,
) {
  return cards
    .map((card) => {
      const recordTimestamp = getCardRecordTimestamp(card);
      const sortTimestamp =
        anchor === "record" ? recordTimestamp : packageTimestamp;
      return {
        id: card.id,
        title:
          card.displayName ?? card.displayNameEn ?? String(card.credentialId),
        source: card.sourceSystem ?? card.issuerHospitalName ?? "wallet",
        recordTimestamp,
        packageTimestamp,
        sortTimestamp,
        displayDate: formatTimelineDate(sortTimestamp),
        recordDate: formatTimelineDate(recordTimestamp),
        packageDate: formatTimelineDate(packageTimestamp),
      };
    })
    .sort(
      (left, right) =>
        new Date(right.sortTimestamp).getTime() -
        new Date(left.sortTimestamp).getTime(),
    );
}

function homeCardTrust(card: WalletCard): {
  label: string;
  tone: "neutral" | "green" | "yellow" | "red" | "blue";
} {
  const presentation = walletDocumentTrustPresentation(
    walletDocumentRecordV2FromCard(card),
  );
  return { label: presentation.labelTh, tone: presentation.tone };
}

function credentialRequestTone(
  status?: string | null,
): "green" | "yellow" | "blue" | "red" {
  if (status === "ready" || status === "completed") return "green";
  if (status === "rejected" || status === "cancelled") return "red";
  if (status === "in_progress" || status === "partial") return "blue";
  return "yellow";
}

export function verifierBadgeTone(
  result: VerifierResult,
): "green" | "yellow" | "blue" | "red" {
  if (result.trustLevel === "green") return "green";
  if (result.trustLevel === "blue") return "blue";
  if (result.trustLevel === "yellow") return "yellow";
  return "red";
}

export function verifierBadgeLabel(result: VerifierResult): string {
  if (result.trustLevel === "green" || result.verified) {
    return "ตรวจสอบผ่าน";
  }
  if (result.trustLevel === "blue") {
    return "ตรวจสอบ transport แล้ว";
  }
  if (result.trustLevel === "yellow") {
    return "ต้องตรวจสอบเพิ่มเติม";
  }
  return "ตรวจสอบไม่ผ่าน";
}

export function scanTransportLabel(
  transport?: ScanPayloadDescriptor["transport"],
): string {
  const labels: Record<ScanPayloadDescriptor["transport"], string> = {
    standard_shl: "Canonical shlink",
    shl_web_viewer: "SHL Web Viewer",
    wallet_scan_url: "Wallet scan URL",
    raw_payload: "Raw payload",
  };
  return transport ? labels[transport] : "-";
}

export function trustcareBindingLabel(
  binding?: ScanPayloadDescriptor["trustcareBinding"],
): string {
  const labels: Record<
    NonNullable<ScanPayloadDescriptor["trustcareBinding"]>,
    string
  > = {
    hospital_certified: "โรงพยาบาลรับรองแล้ว",
    pending_hospital_certification: "รอการรับรองจากโรงพยาบาล",
    holder_attested: "ผู้ป่วยยืนยันการแชร์",
    standard_only: "SHL มาตรฐาน",
  };
  return binding ? labels[binding] : "-";
}

export function trustcareCertificationStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    maker_checker_approved: "ผ่าน TrustCare Manifest policy",
    pending_maker_checker: "รอ TrustCare Manifest policy",
    approved: "ผ่าน TrustCare Manifest policy",
    pending: "รอ TrustCare Manifest policy",
  };
  return status ? (labels[status] ?? status) : "ไม่เกี่ยวข้องกับ TrustCare";
}

export function shortPayload(value: string, maxLength = 520): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export function describeScannablePayload(value: string): ScanPayloadDescriptor {
  const raw = value.trim();
  const canonicalPayload = extractScannablePayload(raw);
  const shl = parseShlLink(canonicalPayload);
  if (shl) {
    const webViewerUrl =
      /^https?:\/\//.test(raw) && raw.includes("#") ? raw : undefined;
    return {
      transport: webViewerUrl ? "shl_web_viewer" : "standard_shl",
      payloadKind: "shl",
      canonicalPayload: shl.raw,
      webViewerUrl,
      manifestUrl: shl.url,
      label: shl.label,
      passcodeRequired: shl.passcodeRequired,
      expiresAt: shl.expiresAt,
      trustcareBinding: "pending_hospital_certification",
    };
  }
  let transport: ScanPayloadDescriptor["transport"] = "raw_payload";
  try {
    const url = new URL(raw);
    if (url.searchParams.has("scan") || scanPayloadFromHash(url.hash))
      transport = "wallet_scan_url";
  } catch {
    // Raw payload.
  }
  const payloadKind: ScanPayloadDescriptor["payloadKind"] =
    canonicalPayload.startsWith("openid4vp://")
      ? "oid4vp"
      : canonicalPayload.startsWith("openid-credential-offer://")
        ? "oid4vci"
        : canonicalPayload.startsWith("{")
          ? detectJsonPayloadKind(canonicalPayload)
          : canonicalPayload.startsWith("eyJ")
            ? "vp"
            : "unknown";
  return { transport, payloadKind, canonicalPayload };
}

export function detectJsonPayloadKind(
  payload: string,
): ScanPayloadDescriptor["payloadKind"] {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const type = String(parsed.type ?? "");
    if (type.includes("Presentation") || type.includes("VP")) return "vp";
    if (type.includes("SHL") || type.includes("SmartHealthLink")) return "shl";
    return "json";
  } catch {
    return "unknown";
  }
}

export function createScannableWebUrl(payload: string): string {
  const raw = payload.trim();
  if (!raw) return raw;
  const shl = parseShlLink(raw);
  if (shl) {
    if (/^https?:\/\//.test(raw)) return raw;
    return createShlViewerUrl(currentAppShareRootUrl(), shl.raw);
  }
  try {
    const url = new URL(raw);
    if (url.searchParams.has("scan") || scanPayloadFromHash(url.hash)) {
      return raw;
    }
  } catch {
    // Raw VC/VP payloads are wrapped below so another device can open this web app.
  }
  const encoded = encodeURIComponent(payload);
  return `${currentAppShareRootUrl()}verify#scan=${encoded}`;
}

export function getObjectScanPayload(object: WalletStoredObject): string {
  const payload = object.payload as any;
  if (object.type === "vc") {
    const renderCard = storedCredentialCardForRendering(object);
    if (!renderCard) return "";
    const credentialPayload = isStoredWalletCardPayload(payload)
      ? typeof payload.credentialJwt === "string" &&
        payload.credentialJwt.trim()
        ? payload.credentialJwt
        : payload.credentialData
      : renderCard.credentialData;
    if (typeof credentialPayload === "string" && credentialPayload.trim()) {
      return createScannableWebUrl(credentialPayload);
    }
    if (credentialPayload && typeof credentialPayload === "object") {
      return createScannableWebUrl(JSON.stringify(credentialPayload));
    }
    return "";
  }
  if (object.type === "shl" && payload) {
    const directShlPayload =
      typeof payload?.qrPayload === "string"
        ? payload.qrPayload
        : typeof payload?.shlUrl === "string"
          ? payload.shlUrl
          : typeof payload?.viewerUrl === "string"
            ? payload.viewerUrl
            : "";
    if (directShlPayload) return createScannableWebUrl(directShlPayload);
  }
  if (payload?.bundleId && payload?.contractId) {
    return "";
  }
  const directPayload =
    typeof payload?.qrPayload === "string"
      ? payload.qrPayload
      : typeof payload?.qrData === "string"
        ? payload.qrData
        : typeof payload?.shlUrl === "string"
          ? payload.shlUrl
          : typeof payload?.url === "string"
            ? payload.url
            : "";
  if (directPayload) return createScannableWebUrl(directPayload);
  return createScannableWebUrl(
    JSON.stringify({
      type: object.type,
      protocol: object.protocol,
      id: object.id,
      payload: object.payload,
    }),
  );
}

export function storedCredentialCardForRendering(
  object: WalletStoredObject | null,
): WalletCard | null {
  if (!object || object.type !== "vc") return null;
  if (isStoredWalletCardPayload(object.payload)) return object.payload;
  return walletCardForCredentialRendering(object.payload);
}

export function printStoredCredential(): boolean {
  if (typeof window === "undefined" || typeof window.print !== "function") {
    return false;
  }
  window.print();
  return true;
}

function isStoredWalletCardPayload(value: unknown): value is WalletCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.id === "number" &&
    typeof payload.cardType === "string" &&
    typeof payload.displayName === "string" &&
    typeof payload.documentCategory === "string" &&
    (typeof payload.credentialId === "string" ||
      typeof payload.credentialId === "number") &&
    typeof payload.credentialStatus === "string" &&
    typeof payload.createdAt === "string"
  );
}

export function describeStoredObjectPass(
  object: WalletStoredObject,
  user: WalletDemoUser,
) {
  const payload = (object.payload ?? {}) as any;
  const kind: BrandedPassKind =
    object.type === "shl"
      ? "shl"
      : object.type === "vp" || object.type === "oid4vp_request"
        ? "vp"
        : object.type === "service_packet"
          ? "bundle"
          : "store";
  const ownerLabel = user.nameEn || user.nameTh || "Wallet owner";
  const sourceLabel =
    object.source ||
    payload.issuerHospitalName ||
    payload.source ||
    payload.viewerUrl ||
    user.hospitalName ||
    "TrustCare Wallet";
  const issuerLabel =
    payload.issuerHospitalName ||
    payload.issuer ||
    payload.verifier ||
    payload.receiver ||
    object.subtitle ||
    sourceLabel;
  const protocolLabel =
    object.type === "shl"
      ? getShlTrustProfile(payload as ShlPackageDetail).label
      : object.protocol === "oid4vci"
        ? "OID4VCI Offer"
        : object.protocol === "oid4vp"
          ? "OID4VP Request"
          : object.type === "vp"
            ? "Verifiable Presentation"
            : object.type === "vc"
              ? "Verifiable Credential"
              : "Wallet Object";
  const expiresAt = object.expiresAt
    ? new Date(object.expiresAt).toLocaleString("th-TH")
    : "";
  const accessLabel = [
    object.type === "shl" && payload.passcodeRequired
      ? "ต้องใช้ passcode"
      : "เปิดผ่าน Web view",
    expiresAt ? `หมดอายุ ${expiresAt}` : "",
    object.protocol ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind,
    ownerLabel,
    sourceLabel: String(sourceLabel),
    issuerLabel: String(issuerLabel),
    protocolLabel,
    accessLabel,
    subtitle: object.subtitle || object.title,
    items: extractPassItems(payload, kind),
  };
}

export function extractPassItems(
  payload: any,
  kind: BrandedPassKind,
): string[] {
  if (!payload) return [];
  if (Array.isArray(payload.items)) {
    return payload.items
      .map(
        (item: any) =>
          item?.label || item?.labelEn || item?.documentType || item?.key,
      )
      .filter(Boolean)
      .map(String);
  }
  if (Array.isArray(payload.readiness?.ready)) {
    return payload.readiness.ready
      .map((item: any) => item?.label || item?.documentType || item?.key)
      .filter(Boolean)
      .map(String);
  }
  if (Array.isArray(payload.documents)) {
    return payload.documents
      .map((item: any) => item?.title || item?.documentType || item?.id)
      .filter(Boolean)
      .map(String);
  }
  if (Array.isArray(payload.documentBundle?.documents)) {
    return payload.documentBundle.documents
      .map((item: any) => item?.title || item?.documentType || item?.id)
      .filter(Boolean)
      .map(String);
  }
  if (kind === "shl") return ["FHIR manifest", "Web viewer", "Access policy"];
  if (kind === "vp")
    return ["VP proof", "Selected credentials", "Verifier request"];
  return ["Contract context", "Document references", "Trust layer"];
}

export function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "TC";
  const ascii = words
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (ascii.length)
    return ascii
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  return value.trim().slice(0, 2).toUpperCase();
}

export function getShlTrustProfile(shl: ShlPackageDetail | null | undefined): {
  kind:
    | "trustcare-certified"
    | "trustcare-pending"
    | "holder-attested"
    | "standard-shl";
  label: string;
  tone: "green" | "yellow" | "blue" | "neutral";
  description: string;
} {
  const hasCertificationMetadata = Boolean(
    shl?.manifestCredentialId &&
    shl?.presentationId &&
    shl?.documentBundle?.documents?.length,
  );
  const hasManifestBinding = Boolean(
    hasCertificationMetadata &&
    shl?.manifestCredentialJwt &&
    shl?.holderPresentationJwt,
  );
  const verification = shl?.trustVerification;
  const fullyVerified = Boolean(
    hasManifestBinding &&
    verification?.verified &&
    verification.proof &&
    verification.issuer &&
    verification.status &&
    verification.expiry &&
    verification.subject &&
    verification.manifestHash &&
    verification.fileHashes &&
    verification.purpose &&
    verification.audience &&
    verification.policy,
  );
  if (fullyVerified) {
    return {
      kind: "trustcare-certified",
      label: "โรงพยาบาลรับรองแล้ว",
      tone: "green",
      description:
        "ตรวจลายเซ็น ผู้ออก สถานะ อายุ เอกสาร ผู้ถือ วัตถุประสงค์ ผู้รับ และ hash binding ครบแล้ว",
    };
  }
  if (hasCertificationMetadata) {
    return {
      kind: "trustcare-pending",
      label: "รอการรับรองจากโรงพยาบาล",
      tone: "yellow",
      description:
        "ยังตรวจลายเซ็น ผู้ออก สถานะ ผู้ถือเอกสาร hash และนโยบายไม่ครบ จึงยังไม่เป็นเอกสารที่โรงพยาบาลรับรอง",
    };
  }
  if (
    shl?.trustcareCertification?.status === "pending_maker_checker" ||
    shl?.trustcareCertification?.status === "rejected"
  ) {
    return {
      kind: "trustcare-pending",
      label: "รอการรับรองจากโรงพยาบาล",
      tone: "yellow",
      description:
        "ยังไม่มี Manifest Credential ที่ลงนามและตรวจสอบผ่าน จึงใช้ได้เฉพาะ SHL ที่ผู้ป่วยยืนยันเท่านั้น",
    };
  }
  if (shl?.holderPresentationJwt) {
    return {
      kind: "holder-attested",
      label: "ผู้ป่วยยืนยันการแชร์",
      tone: "blue",
      description:
        "เป็น Standard SHL ที่ผูก manifest, file hashes, ผู้รับ วัตถุประสงค์ ความยินยอม และอายุไว้ใน VP ที่ผู้ถือกุญแจลงนาม",
    };
  }
  return {
    kind: "standard-shl",
    label: "Standard SHL",
    tone: "blue",
    description:
      "SHL มาตรฐานจากภายนอกอ่านและแชร์ต่อได้โดยไม่อ้างว่าโรงพยาบาลรับรอง",
  };
}

export function hasTrustCareShlManifestExtension(
  shl: ShlPackageDetail,
): boolean {
  return Boolean(
    shl.manifestCredentialId &&
    shl.presentationId &&
    shl.documentBundle?.documents?.length,
  );
}

export function extractScannablePayload(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  const directShl = parseShlLink(raw);
  if (directShl) return directShl.raw;
  try {
    const url = new URL(raw);
    const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
    const hashScanPayload = scanPayloadFromHash(url.hash);
    if (hashScanPayload) return extractScannablePayload(hashScanPayload);
    const hashShl = parseShlLink(hashPayload);
    if (hashShl) return hashShl.raw;
    const scanPayload = url.searchParams.get("scan");
    if (scanPayload) return extractScannablePayload(scanPayload);
  } catch {
    // Not a URL; keep the raw payload.
  }
  return raw;
}

export function readScanPayloadFromLocation(): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
  const hashScanPayload = scanPayloadFromHash(url.hash);
  if (hashScanPayload) return extractScannablePayload(hashScanPayload);
  const hashShl = parseShlLink(hashPayload);
  if (hashShl) return hashShl.raw;
  const payload = url.searchParams.get("scan");
  return payload ? extractScannablePayload(payload) : "";
}

export function isPublicVerifierScanLocation(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  return (
    url.searchParams.get("verify") === "public" ||
    url.searchParams.get("publicVerifier") === "1"
  );
}

export function scanPayloadFromHash(hash: string): string {
  const value = hash.replace(/^#/, "");
  if (!value) return "";
  if (value.startsWith("scan=") || value.startsWith("?scan=")) {
    const normalized = value.startsWith("?") ? value.slice(1) : value;
    return new URLSearchParams(normalized).get("scan") ?? "";
  }
  return "";
}

export function clearScanPayloadFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("scan");
  const hashPayload = decodeURIComponent(url.hash.replace(/^#/, ""));
  if (parseShlLink(hashPayload) || scanPayloadFromHash(url.hash)) url.hash = "";
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function toneForObject(
  object: WalletStoredObject,
): "neutral" | "green" | "yellow" | "red" | "blue" {
  return storedObjectTone(object);
}

export function downloadExport(result: WalletExportResult) {
  const blob = new Blob([result.data], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyText(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard?.writeText(value);
    return;
  } catch {
    // Fall through to the legacy selection path for browser contexts without clipboard permission.
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function friendlyWalletRuntimeError(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function friendlyPortalSyncError(error: unknown): string {
  const message = friendlyWalletRuntimeError(
    error,
    "ไม่สามารถ Sync จาก TrustCare Portal ได้",
  );
  if (/load failed|failed to fetch|networkerror|cors/i.test(message)) {
    return [
      "Browser ติดต่อ TrustCare Portal ไม่สำเร็จ",
      "กรุณาตรวจ CORS/Network ของ Portal สำหรับ GitHub Pages และ localhost",
      "โดยต้องอนุญาต Wallet Exchange V2 discovery, session, DPoP sync และ contract endpoints",
    ].join(" · ");
  }
  return message;
}

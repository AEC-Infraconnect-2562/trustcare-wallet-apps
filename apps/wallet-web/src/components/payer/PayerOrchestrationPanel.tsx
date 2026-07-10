import { FileCheck2, Globe2, Landmark, Route, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Surface } from "@trustcare/ui-web";
import {
  buildClaimEvidencePackage,
  evaluatePresentationLifecycle,
  listMockPayerProfiles,
  recommendSharePacket,
  summarizeCredentialSources,
  type PayerProfile,
  type PayerLifecycleResult,
  type ReadinessContext,
  type ReadinessResult,
  type WalletCard,
  type WalletDemoUser,
} from "@trustcare/wallet-core";

type PayerOrchestrationPanelProps = {
  user: WalletDemoUser;
  context: ReadinessContext;
  cards: WalletCard[];
  readiness: ReadinessResult;
  packetCards: WalletCard[];
  onPrepareAll: (selectedCardIds?: number[]) => void;
  onRunLifecycle: (input: {
    context: "insurance_claim" | "cross_border" | "medical_tourist";
    selectedCardIds: number[];
    consentReceiptId: string;
  }) => Promise<PayerLifecycleResult>;
};

const payerContexts = new Set<ReadinessContext>([
  "insurance_claim",
  "cross_border",
  "medical_tourist",
]);

const contextCopy: Record<
  "insurance_claim" | "cross_border" | "medical_tourist",
  {
    title: string;
    subtitle: string;
    primaryStep: string;
    secondaryStep: string;
    packageLabel: string;
  }
> = {
  insurance_claim: {
    title: "Payer / e-Claim orchestration",
    subtitle:
      "เตรียม eligibility, pre-auth และชุดหลักฐานเคลม โดยให้ payer เป็นผู้ตัดสินผลจริง",
    primaryStep: "ตรวจสิทธิประกัน",
    secondaryStep: "สร้างชุดหลักฐานเคลม",
    packageLabel: "Claim evidence package",
  },
  cross_border: {
    title: "Cross-border patient summary",
    subtitle:
      "จัดชุดสรุปผู้ป่วยและ referral evidence สำหรับผู้รับปลายทางหรือ TPA ต่างประเทศ",
    primaryStep: "เตรียม patient summary",
    secondaryStep: "ส่งต่อแบบ Certified SHL",
    packageLabel: "Cross-border evidence package",
  },
  medical_tourist: {
    title: "Medical tourist support",
    subtitle:
      "เตรียม intake, quotation, guarantee letter และ visa support โดยไม่เป็น claim engine",
    primaryStep: "ตรวจข้อมูล pre-arrival",
    secondaryStep: "ขอ guarantee / visa support",
    packageLabel: "Medical tourist package",
  },
};

export function PayerOrchestrationPanel({
  user,
  context,
  cards,
  readiness,
  packetCards,
  onPrepareAll,
  onRunLifecycle,
}: PayerOrchestrationPanelProps) {
  const [lifecycle, setLifecycle] = useState<PayerLifecycleResult | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const isPayerContext = payerContexts.has(context);
  const scopedContext = (
    isPayerContext ? context : "insurance_claim"
  ) as keyof typeof contextCopy;
  const copy = contextCopy[scopedContext];
  useEffect(() => {
    setLifecycle(null);
    setLifecycleError("");
  }, [scopedContext, user.id]);
  const payers = useMemo(
    () =>
      isPayerContext
        ? listMockPayerProfiles().filter((payer) =>
            payer.supportedContexts.includes(context),
          )
        : [],
    [context, isPayerContext],
  );
  const payer = useMemo(
    () =>
      isPayerContext ? selectPayerForContext(payers, scopedContext) : null,
    [isPayerContext, payers, scopedContext],
  );
  const uniquePacketCards = useMemo(
    () => dedupePayerPacketCards(packetCards),
    [packetCards],
  );
  const packageResult = useMemo(() => {
    if (!isPayerContext || !payer) return null;
    return buildClaimEvidencePackage({
      payerId: payer.payerId,
      patientId: user.id,
      context: scopedContext,
      cards,
      selectedCardIds: uniquePacketCards.map((card) => card.id),
      consentReceiptId: `demo-consent-${user.id}-${scopedContext}`,
      createdAt: "2026-07-10T00:00:00.000Z",
    });
  }, [cards, isPayerContext, payer, scopedContext, uniquePacketCards, user.id]);
  const recommendation = useMemo(() => {
    if (!isPayerContext || !packageResult) return null;
    return recommendSharePacket({
      context,
      selectedDocumentTypes: packageResult.documentTypes,
      selectedCount: packageResult.documentIds.length,
      trustcareCertificationAvailable: true,
    });
  }, [context, isPayerContext, packageResult]);
  const sourceSummary = useMemo(
    () => summarizeCredentialSources(uniquePacketCards),
    [uniquePacketCards],
  );
  const presentationLifecycle = useMemo(() => {
    if (!isPayerContext || !packageResult) return null;
    return evaluatePresentationLifecycle({
      selectedCards: uniquePacketCards,
      context: scopedContext,
      mode: packageResult.recommendedPackageMode,
      purpose: packageResult.context,
      recipient:
        payer?.trustedIssuerDid ?? payer?.payerId ?? "configured-payer",
      holderDid: user.holderDid,
      expiresAt: packageResult.expiresAt,
    });
  }, [
    isPayerContext,
    packageResult,
    uniquePacketCards,
    payer?.payerId,
    payer?.trustedIssuerDid,
    scopedContext,
    user.holderDid,
  ]);
  const canRunLifecycle = useMemo(() => {
    if (!isPayerContext || !payer || !packageResult?.documentIds.length) {
      return false;
    }
    const missingRequired = readiness.missing.filter((item) => item.required);
    return missingRequired.every(
      (item) =>
        scopedContext === "insurance_claim" &&
        (item.key === "coverage" || item.key === "claim"),
    );
  }, [isPayerContext, packageResult, payer, readiness.missing, scopedContext]);

  const runLifecycle = async () => {
    if (!packageResult || !canRunLifecycle || lifecycleBusy) return;
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      const result = await onRunLifecycle({
        context: scopedContext,
        selectedCardIds: packageResult.cards.map((card) => card.id),
        consentReceiptId: packageResult.consentReceiptId,
      });
      setLifecycle(result);
    } catch (error) {
      setLifecycle(null);
      setLifecycleError(
        error instanceof Error ? error.message : "Demo payer lifecycle failed.",
      );
    } finally {
      setLifecycleBusy(false);
    }
  };

  if (!isPayerContext) return null;

  return (
    <Surface className="payer-orchestration-panel">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">CarePass payer adapter</span>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <Badge tone={lifecycle ? "green" : canRunLifecycle ? "yellow" : "red"}>
          {lifecycle
            ? "Payer flow สำเร็จ"
            : canRunLifecycle
              ? "พร้อมรัน Demo flow"
              : "รอเอกสารจำเป็น"}
        </Badge>
      </div>

      <div className="payer-flow-grid">
        <PayerFlowCard
          icon={<Landmark size={18} />}
          label="Configured payer"
          value={
            payer?.payerNameEn ?? payer?.payerName ?? "ยังไม่ได้ config payer"
          }
          detail={payer?.adapterKind ?? "missing_adapter"}
        />
        <PayerFlowCard
          icon={<ShieldCheck size={18} />}
          label={copy.primaryStep}
          value={
            lifecycle?.eligibility.status ??
            `${readiness.requiredReady}/${readiness.requiredTotal} required`
          }
          detail={
            lifecycle
              ? lifecycle.eligibility.eligibilityCheckId
              : "Eligibility and policy proof stay verifiable"
          }
        />
        <PayerFlowCard
          icon={<FileCheck2 size={18} />}
          label={copy.secondaryStep}
          value={
            lifecycle?.submissionReceipt.status ??
            packageResult?.recommendedPackageMode ??
            "ยังสร้างไม่ได้"
          }
          detail={recommendation?.label ?? "ต้อง config payer ก่อน"}
        />
        <PayerFlowCard
          icon={<Globe2 size={18} />}
          label="Public verify"
          value="VP / SHL / Manifest"
          detail="Verifier validates proof and policy, not payer adjudication"
        />
      </div>

      <div className="payer-package-strip">
        <span>
          <Route size={16} />
          {copy.packageLabel}
        </span>
        <strong>
          {lifecycle
            ? `${lifecycle.evidencePackage.documentIds.length} documents`
            : packageResult
              ? `${packageResult.documentIds.length} documents`
              : "no package"}
        </strong>
        <small>
          {packageResult?.consentReceiptId ?? "ต้องมี consent receipt"}
        </small>
        <Badge tone={recommendation?.compatible ? "green" : "yellow"}>
          {recommendation?.mode ?? "รอเลือก package"}
        </Badge>
      </div>

      {lifecycle && (
        <div
          className="payer-flow-grid"
          aria-label="Demo payer lifecycle result"
        >
          {lifecycle.steps.map((step) => (
            <PayerFlowCard
              key={step.key}
              icon={<FileCheck2 size={18} />}
              label={step.key}
              value={step.status}
              detail={step.reference ?? step.detail}
            />
          ))}
        </div>
      )}

      {lifecycleError && (
        <div className="payer-boundary-note" role="alert">
          <ShieldCheck size={18} />
          <span>{lifecycleError}</span>
        </div>
      )}

      <div className="payer-source-split" aria-label="Credential source split">
        <SourceChip label="Portal sync" value={sourceSummary.portalSynced} />
        <SourceChip
          label="Issuer authority"
          value={sourceSummary.issuerSigned}
        />
        <SourceChip label="Payer adapter" value={sourceSummary.payerAdapter} />
        <SourceChip label="Wallet issued" value={sourceSummary.walletIssued} />
        <SourceChip
          label="Patient evidence"
          value={sourceSummary.patientProvided + sourceSummary.unknown}
        />
      </div>

      <div className="payer-lifecycle-note">
        <ShieldCheck size={18} />
        <span>
          Portal-synced VC/VP ต้อง verify กับ issuer DID ต้นทางเท่านั้น. Wallet
          จะสร้าง VP ใหม่ตาม purpose, recipient, field selection และ expiry
          ของรอบนี้; payer artifact ที่ payload เปลี่ยนต้อง re-issue/re-sign โดย
          payer adapter.
        </span>
        <Badge
          tone={
            presentationLifecycle?.action === "rebuild_and_sign"
              ? "yellow"
              : "green"
          }
        >
          {presentationLifecycle?.action === "rebuild_and_sign"
            ? "ต้องสร้าง VP ใหม่"
            : "VP digest ตรงกัน"}
        </Badge>
      </div>

      <div className="payer-boundary-note">
        <ShieldCheck size={18} />
        <span>
          Demo adapter ใช้สำหรับทดสอบเท่านั้น ไม่มี endpoint จริงของ NHSO,
          insurer หรือ TPA ใน client. การอนุมัติสิทธิ, pre-auth, guarantee และ
          claim decision ต้องมาจาก payer adapter ที่ config ใน production.
        </span>
      </div>

      <Button
        className={lifecycle || canRunLifecycle ? "purple" : "secondary"}
        onClick={() =>
          lifecycle ? onPrepareAll(lifecycle.shareCardIds) : void runLifecycle()
        }
        disabled={lifecycleBusy || (!lifecycle && !canRunLifecycle)}
      >
        <FileCheck2 size={18} />
        {lifecycleBusy
          ? "กำลังรัน eligibility → payer status..."
          : lifecycle
            ? `ไปหน้าแชร์ ${lifecycle.shareCardIds.length} เอกสาร`
            : "รัน Demo payer flow และเก็บผลใน Store"}
      </Button>
    </Surface>
  );
}

export function dedupePayerPacketCards(cards: WalletCard[]): WalletCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = String(card.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SourceChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="payer-source-chip">
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function PayerFlowCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="payer-flow-card">
      <i>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </div>
  );
}

function selectPayerForContext(
  payers: PayerProfile[],
  context: keyof typeof contextCopy,
): PayerProfile | null {
  if (context === "medical_tourist" || context === "cross_border") {
    return (
      payers.find((payer) => payer.payerId === "international_tpa_mock") ?? null
    );
  }
  return (
    payers.find((payer) => payer.payerId === "global_care_insurance_demo") ??
    null
  );
}

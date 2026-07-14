import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Braces,
  Check,
  Clock3,
  Database,
  ExternalLink,
  FileKey2,
  FileText,
  Fingerprint,
  KeyRound,
  Link2,
  ShieldCheck,
} from "lucide-react";
import type {
  ClinicalDocumentGraphPresentation as ClinicalDocumentGraphPresentationModel,
  ClinicalDocumentGraphPresentationNode,
  ClinicalDocumentGraphStageKey,
} from "@trustcare/contracts";

export type ClinicalDocumentGraphPresentationProps = {
  presentation: ClinicalDocumentGraphPresentationModel;
  onOpenArtifact?: (artifactId: string) => void;
};

const stageIcons = {
  source: Database,
  fhir: Braces,
  document: FileText,
  retrieval: Link2,
  attestation: BadgeCheck,
  vc: FileKey2,
  shl: KeyRound,
  vp: Fingerprint,
} satisfies Record<ClinicalDocumentGraphStageKey, typeof Database>;

const stageNumbers = {
  source: "01",
  fhir: "02",
  document: "03",
  retrieval: "04",
  attestation: "05",
  vc: "06",
  shl: "07",
  vp: "08",
} satisfies Record<ClinicalDocumentGraphStageKey, string>;

export function ClinicalDocumentGraphPresentation({
  presentation,
  onOpenArtifact,
}: ClinicalDocumentGraphPresentationProps) {
  const nodes = new Map(
    presentation.nodes.map((node) => [node.artifactId, node] as const),
  );
  const selected = nodes.get(presentation.requestedArtifactId);
  const relationshipNodes = relationshipHighlights(presentation.nodes);

  return (
    <section
      className="tc-graph-presentation"
      data-testid="clinical-document-graph-presentation"
      data-selected-artifact-id={presentation.requestedArtifactId}
      data-node-count={presentation.nodes.length}
      data-edge-count={presentation.edges.length}
    >
      <header className="tc-graph-hero">
        <div>
          <span className="tc-graph-eyebrow">
            Portable Clinical Document Graph
          </span>
          <h2>{presentation.titleTh}</h2>
          <p>{presentation.titleEn}</p>
        </div>
        <div className="tc-graph-trust-summary">
          <span className={`is-${trustTone(presentation.trustState)}`}>
            <ShieldCheck size={17} />
            {trustLabel(presentation.trustState)}
          </span>
          <small>
            {presentation.nodes.length} objects · {presentation.edges.length}{" "}
            relationships
          </small>
        </div>
      </header>

      <div className="tc-graph-stage-rail" aria-label="แปดขั้นของเอกสาร">
        {presentation.stages.map((stage, index) => {
          const Icon = stageIcons[stage.key];
          return (
            <article
              className={`tc-graph-stage is-${stage.status}`}
              key={stage.key}
              data-stage={stage.key}
              data-status={stage.status}
            >
              <div className="tc-graph-stage-marker">
                <span>{stageNumbers[stage.key]}</span>
                <Icon size={19} />
              </div>
              <div>
                <strong>{stage.labelTh}</strong>
                <small>{stage.labelEn}</small>
                <p>{stage.detailTh}</p>
                <em>
                  {stageStatusLabel(stage.status, stage.artifactIds.length)}
                </em>
              </div>
              {index < presentation.stages.length - 1 ? (
                <ArrowRight
                  className="tc-graph-stage-arrow"
                  aria-hidden="true"
                />
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="tc-graph-content-grid">
        <section className="tc-graph-object-panel">
          <div className="tc-graph-section-heading">
            <div>
              <span>Selected object</span>
              <h3>วัตถุที่กำลังอธิบาย</h3>
            </div>
            <code>{shortId(presentation.requestedArtifactId)}</code>
          </div>
          {selected ? (
            <GraphObjectCard
              node={selected}
              selected
              onOpenArtifact={onOpenArtifact}
            />
          ) : (
            <p className="tc-graph-empty">ไม่พบวัตถุที่เลือกใน presentation</p>
          )}

          <div className="tc-graph-evidence-row">
            <EvidenceMetric
              icon={<Check size={16} />}
              label="Portal trust evidence"
              value={presentation.evidence.passed}
              tone="passed"
            />
            <EvidenceMetric
              icon={<AlertTriangle size={16} />}
              label="คำเตือน"
              value={presentation.evidence.warnings}
              tone="warning"
            />
            <EvidenceMetric
              icon={<Clock3 size={16} />}
              label="งานที่รอ"
              value={presentation.evidence.openTasks}
              tone="pending"
            />
          </div>
        </section>

        <section className="tc-graph-relationship-panel">
          <div className="tc-graph-section-heading">
            <div>
              <span>Trust relationships</span>
              <h3>ความสัมพันธ์ที่ตรวจสอบย้อนกลับได้</h3>
            </div>
          </div>
          <div className="tc-graph-node-stack">
            {relationshipNodes.map((node) => (
              <GraphObjectCard
                key={node.artifactId}
                node={node}
                compact
                onOpenArtifact={onOpenArtifact}
              />
            ))}
          </div>
          <div className="tc-graph-edge-list" aria-label="Typed graph edges">
            {presentation.edges.map((edge) => (
              <div key={edge.edgeId}>
                <code>{shortId(edge.sourceArtifactId)}</code>
                <span>{edgeLabel(edge.edgeType)}</span>
                <code>{shortId(edge.targetArtifactId)}</code>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="tc-graph-contract-note">
        <ShieldCheck size={17} />
        <p>
          Graph นี้อธิบายที่มา โครงสร้าง และ trust relationships เท่านั้น
          เนื้อหาเอกสารเปิดด้วย Shared Renderer ของ Wallet จาก payload ต้นฉบับ
        </p>
        <code>{presentation.contractVersion}</code>
      </footer>
    </section>
  );
}

function GraphObjectCard({
  node,
  selected = false,
  compact = false,
  onOpenArtifact,
}: {
  node: ClinicalDocumentGraphPresentationNode;
  selected?: boolean;
  compact?: boolean;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  return (
    <article
      className={`tc-graph-object${selected ? " is-selected" : ""}${
        compact ? " is-compact" : ""
      }`}
      data-artifact-type={node.artifactType}
    >
      <span className="tc-graph-object-icon">{objectIcon(node)}</span>
      <div>
        <span>{semanticLabel(node.semanticClass)}</span>
        <strong>{artifactLabel(node)}</strong>
        <small>{node.object?.mediaType ?? node.artifactType}</small>
        <code title={node.contentHash}>{shortHash(node.contentHash)}</code>
      </div>
      {node.retrievable && onOpenArtifact ? (
        <button
          type="button"
          onClick={() => onOpenArtifact(node.artifactId)}
          aria-label={`เปิดเอกสาร ${artifactLabel(node)}`}
        >
          <ExternalLink size={16} /> เปิดเอกสาร
        </button>
      ) : null}
    </article>
  );
}

function EvidenceMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`tc-graph-evidence is-${tone}`}>
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function relationshipHighlights(
  nodes: ClinicalDocumentGraphPresentationNode[],
) {
  const priorities = [
    "transport_artifact",
    "trust_artifact",
    "presentation_artifact",
    "clinical_document",
    "retrieval_artifact",
  ];
  return [...nodes]
    .sort((left, right) => {
      const leftIndex = priorities.indexOf(left.semanticClass);
      const rightIndex = priorities.indexOf(right.semanticClass);
      return (
        (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex)
      );
    })
    .slice(0, 6);
}

function artifactLabel(node: ClinicalDocumentGraphPresentationNode): string {
  const labels: Record<string, string> = {
    "holder-presentation": "Wallet-signed Holder VP",
    "verifiable-credential": "Portal-signed Manifest / Document VC",
    "shl-transport": "Smart Health Link transport",
    "shl-manifest": "SHL manifest",
  };
  return labels[node.artifactType] ?? node.artifactType.replaceAll("-", " ");
}

function objectIcon(node: ClinicalDocumentGraphPresentationNode) {
  if (node.semanticClass === "presentation_artifact")
    return <Fingerprint size={18} />;
  if (node.semanticClass === "transport_artifact")
    return <KeyRound size={18} />;
  if (node.semanticClass === "trust_artifact") return <FileKey2 size={18} />;
  if (node.semanticClass === "clinical_fact") return <Database size={18} />;
  return <FileText size={18} />;
}

function semanticLabel(value: string): string {
  const labels: Record<string, string> = {
    clinical_fact: "Source / FHIR",
    clinical_document: "Clinical document",
    administrative_document: "Administrative document",
    financial_document: "Financial document",
    retrieval_artifact: "Retrieval metadata",
    identity_credential: "Identity credential",
    trust_artifact: "Signed trust artifact",
    transport_artifact: "Encrypted transport",
    presentation_artifact: "Holder presentation",
  };
  return labels[value] ?? value;
}

function stageStatusLabel(status: string, count: number): string {
  if (status === "available") return `พร้อม · ${count} object`;
  if (status === "pending") return "กำลังรอหลักฐาน";
  if (status === "blocked") return "หยุดเพื่อความปลอดภัย";
  return "ไม่ใช้กับรายการนี้";
}

function trustLabel(value: string | null): string {
  if (!value) return "ยังไม่มี trust state";
  const labels: Record<string, string> = {
    fully_verified: "Portal รายงานว่าตรวจครบ",
    policy_compliant: "Portal รายงานว่าผ่านนโยบาย",
    organization_attested: "Portal รายงานว่าโรงพยาบาลรับรอง",
    holder_bound: "Portal รายงานว่าผูกผู้ถือแล้ว",
    issuer_verified: "Portal รายงานว่าตรวจผู้ออกแล้ว",
    content_integrity_valid: "Portal รายงานว่า digest ถูกต้อง",
    transport_valid: "Portal รายงานว่า transport ใช้ได้",
    invalid: "ตรวจสอบไม่ผ่าน",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function trustTone(value: string | null): "verified" | "pending" | "invalid" {
  if (value === "invalid") return "invalid";
  // Graph trust is Portal-reported explainability metadata. A green verified
  // state is reserved for the Wallet verifier after proof/status/policy checks.
  return "pending";
}

function edgeLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function shortId(value: string): string {
  return value.length > 24 ? `${value.slice(0, 11)}…${value.slice(-9)}` : value;
}

function shortHash(value: string): string {
  return value.length > 22 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;
}

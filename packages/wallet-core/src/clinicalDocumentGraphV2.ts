import {
  CLINICAL_DOCUMENT_GRAPH_CHANGE_KINDS,
  CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
  CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES,
  CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES,
  CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS,
  CLINICAL_DOCUMENT_GRAPH_TRUST_STATES,
  assertClinicalDocumentGraphChangeSet,
  assertClinicalDocumentGraphPresentation,
  type ClinicalDocumentGraphArtifactDefinition,
  type ClinicalDocumentGraphChangeSet,
  type ClinicalDocumentGraphContract,
  type ClinicalDocumentGraphEdgeType,
  type ClinicalDocumentGraphObjectDescriptor,
  type ClinicalDocumentGraphPresentation,
  type ClinicalDocumentGraphPresentationNode,
  type ClinicalDocumentGraphSemanticClass,
  type ClinicalDocumentGraphStageKey,
  type ClinicalDocumentGraphTrustState,
  type ClinicalDocumentGraphWireChange,
} from "@trustcare/contracts";

export const WALLET_CLINICAL_DOCUMENT_GRAPH_STATE_SCHEMA =
  "trustcare.wallet.clinical-document-graph-state.v2" as const;

/** Required semantics implemented by this Wallet release. Future required
 * meanings are quarantined until code and acceptance tests are added. */
export const WALLET_CLINICAL_DOCUMENT_GRAPH_REQUIRED_SEMANTICS = [
  "issuer",
  "holderDid",
  "makerFlow",
  "resourceType",
  "subject",
] as const;

export type WalletClinicalDocumentGraphNode =
  ClinicalDocumentGraphPresentationNode & {
    occurredAt: string;
    trustState: ClinicalDocumentGraphTrustState | null;
    supersededBy?: string;
  };

export type WalletClinicalDocumentGraphEdge = {
  edgeId: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  edgeType: ClinicalDocumentGraphEdgeType;
  occurredAt: string;
};

export type WalletClinicalDocumentGraphBundleMember = {
  bundleArtifactId: string;
  memberArtifactId: string;
  memberHash: `sha256:${string}`;
  position?: number;
  occurredAt: string;
};

export type WalletClinicalDocumentGraphQuarantineReason =
  | "unknown_change_kind"
  | "invalid_change"
  | "unknown_artifact_type"
  | "semantic_class_mismatch"
  | "unknown_edge_type"
  | "invalid_object_descriptor"
  | "unknown_schema"
  | "unsupported_major_version"
  | "unknown_required_fields"
  | "immutable_artifact_mutation"
  | "breaking_change_requires_upgrade";

export type WalletClinicalDocumentGraphQuarantine = {
  changeId: string;
  changeSetId: string;
  reason: WalletClinicalDocumentGraphQuarantineReason;
  details: string[];
  occurredAt: string;
  change: ClinicalDocumentGraphWireChange;
};

export type WalletClinicalDocumentGraphAppliedChange = {
  changeId: string;
  changeSetId: string;
  changeSetIdempotencyKey: string;
  sequence: number;
  occurredAt: string;
  outcome: "applied" | "already_current" | "quarantined";
};

export type WalletClinicalDocumentGraphState = {
  schema: typeof WALLET_CLINICAL_DOCUMENT_GRAPH_STATE_SCHEMA;
  contractVersion: typeof CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION;
  portalOrigin: string;
  holderDid: string;
  subjectReference: string;
  nextCursor?: string;
  nodes: WalletClinicalDocumentGraphNode[];
  edges: WalletClinicalDocumentGraphEdge[];
  bundleMembers: WalletClinicalDocumentGraphBundleMember[];
  changes: WalletClinicalDocumentGraphAppliedChange[];
  quarantine: WalletClinicalDocumentGraphQuarantine[];
  lastChangeSetId?: string;
  lastCorrelationId?: string;
  lastSyncedAt?: string;
};

export type WalletClinicalDocumentGraphSyncPlan = {
  expectedCursor?: string;
  nextCursor: string;
  changeSetId: string;
  replayed: boolean;
  appliedChangeIds: string[];
  quarantinedChangeIds: string[];
};

export type WalletClinicalDocumentGraphSyncReduction = {
  state: WalletClinicalDocumentGraphState;
  plan: WalletClinicalDocumentGraphSyncPlan;
};

type MutableGraph = {
  nodes: Map<string, WalletClinicalDocumentGraphNode>;
  edges: Map<string, WalletClinicalDocumentGraphEdge>;
  members: Map<string, WalletClinicalDocumentGraphBundleMember>;
  changes: Map<string, WalletClinicalDocumentGraphAppliedChange>;
  quarantine: Map<string, WalletClinicalDocumentGraphQuarantine>;
};

type ChangeOutcome =
  | { outcome: "applied" | "already_current" }
  | {
      outcome: "quarantined";
      reason: WalletClinicalDocumentGraphQuarantineReason;
      details: string[];
    };

const stageCopy: Record<
  ClinicalDocumentGraphStageKey,
  { labelTh: string; labelEn: string; detailTh: string; detailEn: string }
> = {
  source: {
    labelTh: "แหล่งข้อมูล",
    labelEn: "Source",
    detailTh: "ข้อมูลต้นทางจากระบบโรงพยาบาลที่ได้รับอนุญาต",
    detailEn: "Holder-authorized data from a hospital source system",
  },
  fhir: {
    labelTh: "ข้อมูล FHIR",
    labelEn: "FHIR",
    detailTh: "ข้อมูลสุขภาพมาตรฐานและโปรไฟล์ที่ใช้สร้างเอกสาร",
    detailEn: "Standard clinical resources and profiles used by the document",
  },
  document: {
    labelTh: "เอกสาร",
    labelEn: "Document",
    detailTh: "เอกสารทางคลินิกหรือธุรการที่เปิดด้วยตัวแสดงผลหลักของ Wallet",
    detailEn:
      "Clinical or administrative document opened by the Wallet renderer",
  },
  retrieval: {
    labelTh: "การเรียกดู",
    labelEn: "Retrieval",
    detailTh: "ตำแหน่งและข้อมูลกำกับสำหรับเรียกวัตถุต้นฉบับ",
    detailEn: "Location and metadata used to retrieve the underlying object",
  },
  attestation: {
    labelTh: "การรับรอง",
    labelEn: "Attestation",
    detailTh: "หลักฐานการตรวจทานและสถานะความน่าเชื่อถือจาก Portal",
    detailEn: "Portal trust decisions and review evidence",
  },
  vc: {
    labelTh: "หลักฐาน VC",
    labelEn: "VC",
    detailTh: "Credential ที่ผูกผู้ออก เอกสาร และ digest เข้าด้วยกัน",
    detailEn: "Credential binding issuer, document, and digest",
  },
  shl: {
    labelTh: "การขนส่ง SHL",
    labelEn: "SHL",
    detailTh: "ลิงก์และ manifest สำหรับขนส่งเอกสารแบบเข้ารหัส",
    detailEn: "Encrypted Smart Health Link transport and manifest",
  },
  vp: {
    labelTh: "การนำเสนอโดยผู้ถือ",
    labelEn: "Holder VP",
    detailTh: "VP ที่ Wallet สร้างและลงนามตามความยินยอมของผู้ป่วย",
    detailEn: "Wallet-signed presentation created with holder consent",
  },
};

export function createWalletClinicalDocumentGraphState(input: {
  portalOrigin: string;
  holderDid: string;
}): WalletClinicalDocumentGraphState {
  return {
    schema: WALLET_CLINICAL_DOCUMENT_GRAPH_STATE_SCHEMA,
    contractVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    portalOrigin: normalizeOrigin(input.portalOrigin),
    holderDid: requireHolderDid(input.holderDid),
    subjectReference: requireHolderDid(input.holderDid),
    nodes: [],
    edges: [],
    bundleMembers: [],
    changes: [],
    quarantine: [],
  };
}

export function assertWalletClinicalDocumentGraphState(
  state: WalletClinicalDocumentGraphState,
  expected: { portalOrigin: string; holderDid: string },
): void {
  if (state.schema !== WALLET_CLINICAL_DOCUMENT_GRAPH_STATE_SCHEMA) {
    throw new Error("Unsupported Wallet Clinical Document Graph state schema.");
  }
  if (state.contractVersion !== CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION) {
    throw new Error(
      "Unsupported Wallet Clinical Document Graph contract version.",
    );
  }
  if (
    state.portalOrigin !== normalizeOrigin(expected.portalOrigin) ||
    state.holderDid !== requireHolderDid(expected.holderDid) ||
    state.subjectReference !== expected.holderDid
  ) {
    throw new Error("Clinical Document Graph state partition mismatch.");
  }
  assertUnique(state.nodes, (item) => item.artifactId, "graph node");
  assertUnique(state.edges, (item) => item.edgeId, "graph edge");
  assertUnique(
    state.bundleMembers,
    (item) => bundleMemberKey(item.bundleArtifactId, item.memberArtifactId),
    "graph bundle member",
  );
  assertUnique(state.changes, (item) => item.changeId, "graph change");
  assertUnique(state.quarantine, (item) => item.changeId, "graph quarantine");
}

export function prepareWalletClinicalDocumentGraphSyncCommit(input: {
  state: WalletClinicalDocumentGraphState;
  page: ClinicalDocumentGraphChangeSet;
  graphContract: ClinicalDocumentGraphContract;
}): WalletClinicalDocumentGraphSyncReduction {
  const page = assertClinicalDocumentGraphChangeSet(input.page);
  assertWalletClinicalDocumentGraphState(input.state, input.state);
  if (page.subjectReference !== input.state.holderDid) {
    throw new Error(
      "Clinical Document Graph delta is not bound to this holder DID.",
    );
  }
  if (
    page.compatibility.minimumConsumerVersion !==
    CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION
  ) {
    throw new Error(
      "Clinical Document Graph delta requires an unsupported consumer version.",
    );
  }
  const allAlreadyProcessed = page.changes.every((change) =>
    input.state.changes.some((entry) => entry.changeId === change.changeId),
  );
  if (
    input.state.nextCursor !== undefined &&
    page.cursor !== input.state.nextCursor
  ) {
    if (page.nextCursor === input.state.nextCursor && allAlreadyProcessed) {
      return {
        state: clone(input.state),
        plan: {
          expectedCursor: input.state.nextCursor,
          nextCursor: page.nextCursor,
          changeSetId: page.changeSetId,
          replayed: true,
          appliedChangeIds: [],
          quarantinedChangeIds: [],
        },
      };
    }
    throw new Error(
      "Clinical Document Graph delta cursor does not match persisted state.",
    );
  }

  const graph = mutableGraph(input.state);
  const appliedChangeIds: string[] = [];
  const quarantinedChangeIds: string[] = [];
  for (const change of page.changes) {
    if (graph.changes.has(change.changeId)) continue;
    const result = applyChange(graph, change, input.graphContract);
    graph.changes.set(change.changeId, {
      changeId: change.changeId,
      changeSetId: page.changeSetId,
      changeSetIdempotencyKey: page.idempotencyKey,
      sequence: change.sequence,
      occurredAt: change.occurredAt,
      outcome: result.outcome,
    });
    if (result.outcome === "quarantined") {
      graph.quarantine.set(change.changeId, {
        changeId: change.changeId,
        changeSetId: page.changeSetId,
        reason: result.reason,
        details: result.details,
        occurredAt: change.occurredAt,
        change: clone(change),
      });
      quarantinedChangeIds.push(change.changeId);
    } else if (result.outcome === "applied") {
      appliedChangeIds.push(change.changeId);
    }
  }

  const state: WalletClinicalDocumentGraphState = {
    ...input.state,
    nextCursor: page.nextCursor,
    nodes: sorted(graph.nodes.values(), (item) => item.artifactId),
    edges: sorted(graph.edges.values(), (item) => item.edgeId),
    bundleMembers: sorted(graph.members.values(), (item) =>
      bundleMemberKey(item.bundleArtifactId, item.memberArtifactId),
    ),
    changes: sorted(
      graph.changes.values(),
      (item) => `${String(item.sequence).padStart(20, "0")}:${item.changeId}`,
    ),
    quarantine: sorted(graph.quarantine.values(), (item) => item.changeId),
    lastChangeSetId: page.changeSetId,
    lastCorrelationId: page.correlationId,
    lastSyncedAt: page.occurredAt,
  };
  assertWalletClinicalDocumentGraphState(state, state);
  return {
    state,
    plan: {
      expectedCursor: input.state.nextCursor,
      nextCursor: page.nextCursor,
      changeSetId: page.changeSetId,
      replayed: false,
      appliedChangeIds,
      quarantinedChangeIds,
    },
  };
}

export function buildClinicalDocumentGraphPresentation(input: {
  state: WalletClinicalDocumentGraphState;
  graphContract: ClinicalDocumentGraphContract;
  selectedArtifactId: string;
  now?: Date;
}): ClinicalDocumentGraphPresentation {
  const selected = input.state.nodes.find(
    (node) => node.artifactId === input.selectedArtifactId,
  );
  if (!selected) {
    throw new Error(
      "Selected Clinical Document Graph artifact is unavailable.",
    );
  }
  const traversal = connectedComponent(input.state, selected.artifactId);
  const component = traversal.artifactIds;
  const nodes = input.state.nodes
    .filter((node) => component.has(node.artifactId))
    .sort((left, right) =>
      left.artifactId === selected.artifactId
        ? -1
        : right.artifactId === selected.artifactId
          ? 1
          : left.artifactId.localeCompare(right.artifactId),
    );
  const edges = presentationEdges(input.state, component);
  const definitionByType = new Map(
    input.graphContract.creationMatrix.map((definition) => [
      definition.artifactType,
      definition,
    ]),
  );
  for (const node of nodes) {
    const definition = artifactDefinition(
      input.graphContract,
      node.artifactType,
      node.semanticClass,
    );
    if (definition) definitionByType.set(node.artifactType, definition);
  }
  const selectedDefinition = definitionByType.get(selected.artifactType);
  if (!selectedDefinition) {
    throw new Error("Selected graph artifact uses unknown required semantics.");
  }
  const hospitalId = issuerHospitalId(nodes);
  if (!hospitalId) {
    throw new Error(
      "Clinical Document Graph is missing its Portal hospital authority reference.",
    );
  }
  const stageArtifacts = new Map<ClinicalDocumentGraphStageKey, string[]>();
  for (const key of CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS)
    stageArtifacts.set(key, []);
  for (const node of nodes) {
    const definition = definitionByType.get(node.artifactType);
    for (const key of classifyNode(node, definition)) {
      stageArtifacts.get(key)?.push(node.artifactId);
    }
  }
  const blockedPath =
    traversal.truncated ||
    input.state.quarantine.some((entry) =>
      referencesAnyArtifact(entry.change, component),
    );
  const expected = expectedStages(selected, selectedDefinition);
  const stages = CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS.map((key) => {
    const artifactIds = Array.from(
      new Set(stageArtifacts.get(key) ?? []),
    ).sort();
    const stageBlocked = artifactIds.some((artifactId) => {
      const node = input.state.nodes.find(
        (candidate) => candidate.artifactId === artifactId,
      );
      return Boolean(
        node &&
        (node.trustState === "invalid" ||
          ["revoked", "rejected", "entered_in_error", "deleted"].includes(
            node.lifecycleStatus,
          )),
      );
    });
    return {
      key,
      status: stageBlocked
        ? ("blocked" as const)
        : artifactIds.length
          ? ("available" as const)
          : blockedPath
            ? ("blocked" as const)
            : expected.has(key)
              ? ("pending" as const)
              : ("not_applicable" as const),
      artifactIds,
      ...stageCopy[key],
    };
  });
  const failed = nodes.filter(
    (node) =>
      node.trustState === "invalid" ||
      ["revoked", "rejected", "entered_in_error", "deleted"].includes(
        node.lifecycleStatus,
      ),
  ).length;
  const passed = nodes.filter(
    (node) => node.trustState && node.trustState !== "invalid",
  ).length;
  const openTasks = stages.filter(
    (stage) => stage.status === "pending" || stage.status === "blocked",
  ).length;
  const generatedAt = (input.now ?? new Date()).toISOString();
  return assertClinicalDocumentGraphPresentation({
    contractVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    presentationId: `graph-presentation:${selected.artifactId}:${selected.versionId}`,
    requestedArtifactId: selected.artifactId,
    rootArtifactId: rootArtifactId(nodes, selected),
    issuerHospitalId: hospitalId,
    subjectId: null,
    subjectReference: input.state.subjectReference,
    artifactType: selected.artifactType,
    titleTh: selectedDefinition.patientLabelTh,
    titleEn: selectedDefinition.patientLabelEn,
    lifecycleStatus: selected.lifecycleStatus,
    trustState: selected.trustState,
    stages,
    nodes: nodes.map(
      ({
        occurredAt: _occurredAt,
        trustState: _trustState,
        supersededBy: _supersededBy,
        ...node
      }) => node,
    ),
    edges,
    evidence: {
      passed,
      warnings:
        input.state.quarantine.filter((entry) =>
          referencesAnyArtifact(entry.change, component),
        ).length + (traversal.truncated ? 1 : 0),
      failed,
      humanApprovals: nodes.filter((node) =>
        [
          "organization_attested",
          "policy_compliant",
          "fully_verified",
        ].includes(node.trustState ?? ""),
      ).length,
      openTasks,
    },
    generatedAt,
  });
}

export function listClinicalDocumentGraphArtifacts(
  state: WalletClinicalDocumentGraphState,
): WalletClinicalDocumentGraphNode[] {
  return state.nodes
    .filter((node) => node.lifecycleStatus !== "deleted")
    .map(clone)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function applyChange(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
  contract: ClinicalDocumentGraphContract,
): ChangeOutcome {
  if (!CLINICAL_DOCUMENT_GRAPH_CHANGE_KINDS.includes(change.kind as never)) {
    return quarantine("unknown_change_kind", [change.kind]);
  }
  if (change.breaking) {
    return quarantine("breaking_change_requires_upgrade", [change.kind]);
  }
  switch (change.kind) {
    case "node_upsert":
      return applyNode(graph, change, contract);
    case "edge_upsert":
      return applyEdge(graph, change, contract);
    case "bundle_member_added":
      return addBundleMember(graph, change);
    case "bundle_member_removed":
      return removeBundleMember(graph, change);
    case "lifecycle_transition":
      return transitionLifecycle(graph, change);
    case "trust_state_changed":
      return changeTrustState(graph, change);
    case "object_schema_changed":
      return changeObjectSchema(graph, change, contract);
    default:
      return quarantine("unknown_change_kind", [change.kind]);
  }
}

function applyNode(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
  contract: ClinicalDocumentGraphContract,
): ChangeOutcome {
  const artifactId = text(change.artifactId);
  const artifactType = text(change.artifactType);
  const semanticClass = text(change.semanticClass);
  const versionId = text(change.versionId);
  const lifecycleStatus = text(change.lifecycleStatus);
  if (
    !artifactId ||
    !artifactType ||
    !semanticClass ||
    !versionId ||
    !lifecycleStatus
  ) {
    return quarantine("invalid_change", ["node_upsert required fields"]);
  }
  const definition = artifactDefinition(contract, artifactType, semanticClass);
  if (!definition) return quarantine("unknown_artifact_type", [artifactType]);
  if (
    definition.semanticClass !== semanticClass ||
    !contract.semanticClasses.includes(semanticClass) ||
    !CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES.includes(semanticClass as never)
  ) {
    return quarantine("semantic_class_mismatch", [
      semanticClass,
      definition.semanticClass,
    ]);
  }
  const descriptor = parseDescriptor(change.object, definition, contract);
  if (isQuarantinedOutcome(descriptor)) return descriptor;
  const existing = graph.nodes.get(artifactId);
  if (existing) {
    if (
      existing.versionId !== versionId ||
      existing.contentHash !== descriptor.contentHash
    ) {
      return quarantine("immutable_artifact_mutation", [artifactId]);
    }
    return { outcome: "already_current" };
  }
  graph.nodes.set(artifactId, {
    artifactId,
    artifactType,
    semanticClass: semanticClass as ClinicalDocumentGraphSemanticClass,
    lifecycleStatus,
    versionId,
    contentHash: descriptor.contentHash,
    profileUris: [...descriptor.profileUris],
    retrievable: Boolean(descriptor.location),
    object: descriptor,
    occurredAt: change.occurredAt,
    trustState: null,
  });
  return { outcome: "applied" };
}

function applyEdge(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
  contract: ClinicalDocumentGraphContract,
): ChangeOutcome {
  const edgeId = text(change.edgeId);
  const sourceArtifactId = text(change.sourceArtifactId);
  const targetArtifactId = text(change.targetArtifactId);
  const edgeType = text(change.edgeType);
  if (!edgeId || !sourceArtifactId || !targetArtifactId || !edgeType) {
    return quarantine("invalid_change", ["edge_upsert required fields"]);
  }
  if (
    !contract.edgeTypes.includes(edgeType) ||
    !CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES.includes(edgeType as never)
  ) {
    return quarantine("unknown_edge_type", [edgeType]);
  }
  const edge: WalletClinicalDocumentGraphEdge = {
    edgeId,
    sourceArtifactId,
    targetArtifactId,
    edgeType: edgeType as ClinicalDocumentGraphEdgeType,
    occurredAt: change.occurredAt,
  };
  const source = graph.nodes.get(sourceArtifactId);
  const target = graph.nodes.get(targetArtifactId);
  if (source && target && !nodesAreTenantCompatible(source, target)) {
    return quarantine("invalid_change", [
      `cross-tenant edge:${sourceArtifactId}:${targetArtifactId}`,
    ]);
  }
  const existing = graph.edges.get(edgeId);
  if (existing && stable(existing) !== stable(edge)) {
    return quarantine("immutable_artifact_mutation", [edgeId]);
  }
  if (existing) return { outcome: "already_current" };
  graph.edges.set(edgeId, edge);
  return { outcome: "applied" };
}

function addBundleMember(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
): ChangeOutcome {
  const bundleArtifactId = text(change.bundleArtifactId);
  const memberArtifactId = text(change.memberArtifactId);
  const memberHash = digest(change.memberHash);
  const position = optionalNonNegativeInteger(change.position);
  if (
    !bundleArtifactId ||
    !memberArtifactId ||
    !memberHash ||
    position === null
  ) {
    return quarantine("invalid_change", [
      "bundle_member_added required fields",
    ]);
  }
  const key = bundleMemberKey(bundleArtifactId, memberArtifactId);
  const member: WalletClinicalDocumentGraphBundleMember = {
    bundleArtifactId,
    memberArtifactId,
    memberHash,
    ...(position === undefined ? {} : { position }),
    occurredAt: change.occurredAt,
  };
  const existing = graph.members.get(key);
  if (existing && stable(existing) !== stable(member)) {
    return quarantine("immutable_artifact_mutation", [key]);
  }
  if (existing) return { outcome: "already_current" };
  graph.members.set(key, member);
  return { outcome: "applied" };
}

function removeBundleMember(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
): ChangeOutcome {
  const bundleArtifactId = text(change.bundleArtifactId);
  const memberArtifactId = text(change.memberArtifactId);
  if (!bundleArtifactId || !memberArtifactId || !text(change.reason)) {
    return quarantine("invalid_change", [
      "bundle_member_removed required fields",
    ]);
  }
  const key = bundleMemberKey(bundleArtifactId, memberArtifactId);
  if (!graph.members.has(key)) return { outcome: "already_current" };
  graph.members.delete(key);
  return { outcome: "applied" };
}

function transitionLifecycle(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
): ChangeOutcome {
  const artifactId = text(change.artifactId);
  const from = text(change.from);
  const to = text(change.to);
  if (!artifactId || !from || !to) {
    return quarantine("invalid_change", [
      "lifecycle_transition required fields",
    ]);
  }
  const node = graph.nodes.get(artifactId);
  if (!node)
    return quarantine("invalid_change", [`missing node:${artifactId}`]);
  if (node.lifecycleStatus === to) return { outcome: "already_current" };
  if (node.lifecycleStatus !== from && from !== "current") {
    return quarantine("invalid_change", [
      `expected lifecycle:${node.lifecycleStatus}`,
      `received from:${from}`,
    ]);
  }
  graph.nodes.set(artifactId, {
    ...node,
    lifecycleStatus: to,
    ...(text(change.supersededBy)
      ? { supersededBy: text(change.supersededBy) }
      : {}),
    occurredAt: change.occurredAt,
  });
  return { outcome: "applied" };
}

function changeTrustState(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
): ChangeOutcome {
  const artifactId = text(change.artifactId);
  const to = text(change.to);
  if (
    !artifactId ||
    !to ||
    !CLINICAL_DOCUMENT_GRAPH_TRUST_STATES.includes(to as never)
  ) {
    return quarantine("invalid_change", [
      "trust_state_changed required fields",
    ]);
  }
  const node = graph.nodes.get(artifactId);
  if (!node)
    return quarantine("invalid_change", [`missing node:${artifactId}`]);
  if (node.trustState === to) return { outcome: "already_current" };
  graph.nodes.set(artifactId, {
    ...node,
    trustState: to as ClinicalDocumentGraphTrustState,
    occurredAt: change.occurredAt,
  });
  return { outcome: "applied" };
}

function changeObjectSchema(
  graph: MutableGraph,
  change: ClinicalDocumentGraphWireChange,
  contract: ClinicalDocumentGraphContract,
): ChangeOutcome {
  const artifactId = text(change.artifactId);
  const previousSchemaVersion = text(change.previousSchemaVersion);
  if (!artifactId || !previousSchemaVersion) {
    return quarantine("invalid_change", [
      "object_schema_changed required fields",
    ]);
  }
  const node = graph.nodes.get(artifactId);
  if (!node?.object)
    return quarantine("invalid_change", [`missing node:${artifactId}`]);
  if (node.object.schemaVersion !== previousSchemaVersion) {
    return quarantine("invalid_change", [
      `expected schema:${node.object.schemaVersion}`,
      `received previous:${previousSchemaVersion}`,
    ]);
  }
  const definition = artifactDefinition(
    contract,
    node.artifactType,
    node.semanticClass,
  );
  if (!definition)
    return quarantine("unknown_artifact_type", [node.artifactType]);
  const descriptor = parseDescriptor(change.object, definition, contract);
  if (isQuarantinedOutcome(descriptor)) return descriptor;
  if (descriptor.contentHash !== node.contentHash) {
    return quarantine("immutable_artifact_mutation", [artifactId]);
  }
  graph.nodes.set(artifactId, {
    ...node,
    object: descriptor,
    profileUris: [...descriptor.profileUris],
    retrievable: Boolean(descriptor.location),
    occurredAt: change.occurredAt,
  });
  return { outcome: "applied" };
}

function parseDescriptor(
  value: unknown,
  definition: ClinicalDocumentGraphArtifactDefinition,
  contract: ClinicalDocumentGraphContract,
):
  | ClinicalDocumentGraphObjectDescriptor
  | Extract<ChangeOutcome, { outcome: "quarantined" }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return quarantine("invalid_object_descriptor", ["object"]);
  }
  const object = value as Record<string, unknown>;
  const objectId = text(object.objectId);
  const mediaType = text(object.mediaType);
  const schemaId = text(object.schemaId);
  const schemaVersion = text(object.schemaVersion);
  const contentHash = digest(object.contentHash);
  const canonicalization = text(object.canonicalization);
  const profileUris = stringArray(object.profileUris);
  const requiredFields = stringArray(object.requiredFields);
  const extensions = optionalRecord(object.extensions);
  if (
    !objectId ||
    !mediaType ||
    !schemaId ||
    !schemaVersion ||
    !contentHash ||
    !canonicalization ||
    !profileUris ||
    !requiredFields ||
    !extensions
  ) {
    return quarantine("invalid_object_descriptor", [
      "required descriptor fields",
    ]);
  }
  const supportedSchemaIds = new Set([
    `urn:trustcare:schema:${definition.artifactType}`,
    ...definition.profileUris,
  ]);
  if (!supportedSchemaIds.has(schemaId)) {
    return quarantine("unknown_schema", [schemaId]);
  }
  const major = schemaMajor(schemaVersion);
  const supportedMajor = 2;
  if (
    major === null ||
    (schemaVersion !== contract.graphContractVersion && major > supportedMajor)
  ) {
    return quarantine("unsupported_major_version", [
      schemaVersion,
      `supported-major:${supportedMajor}`,
    ]);
  }
  const knownRequired = new Set<string>(
    WALLET_CLINICAL_DOCUMENT_GRAPH_REQUIRED_SEMANTICS,
  );
  const unknownRequired = requiredFields.filter(
    (field) => !knownRequired.has(field),
  );
  if (unknownRequired.length) {
    return quarantine("unknown_required_fields", unknownRequired);
  }
  const sizeBytes = optionalNonNegativeInteger(object.sizeBytes);
  if (sizeBytes === null) {
    return quarantine("invalid_object_descriptor", ["sizeBytes"]);
  }
  let encryption: ClinicalDocumentGraphObjectDescriptor["encryption"];
  if (object.encryption !== undefined) {
    const value = optionalRecord(object.encryption);
    const algorithm = value ? text(value.algorithm) : undefined;
    if (!value || !algorithm) {
      return quarantine("invalid_object_descriptor", ["encryption"]);
    }
    encryption = {
      algorithm,
      ...(text(value.keyReference)
        ? { keyReference: text(value.keyReference) }
        : {}),
    };
  }
  return {
    ...clone(object),
    objectId,
    mediaType,
    schemaId,
    schemaVersion,
    profileUris,
    contentHash,
    canonicalization,
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
    ...(text(object.location) ? { location: text(object.location) } : {}),
    ...(encryption ? { encryption } : {}),
    requiredFields,
    extensions,
  } as ClinicalDocumentGraphObjectDescriptor;
}

function mutableGraph(state: WalletClinicalDocumentGraphState): MutableGraph {
  return {
    nodes: new Map(
      state.nodes.map((entry) => [entry.artifactId, clone(entry)]),
    ),
    edges: new Map(state.edges.map((entry) => [entry.edgeId, clone(entry)])),
    members: new Map(
      state.bundleMembers.map((entry) => [
        bundleMemberKey(entry.bundleArtifactId, entry.memberArtifactId),
        clone(entry),
      ]),
    ),
    changes: new Map(
      state.changes.map((entry) => [entry.changeId, clone(entry)]),
    ),
    quarantine: new Map(
      state.quarantine.map((entry) => [entry.changeId, clone(entry)]),
    ),
  };
}

function connectedComponent(
  state: WalletClinicalDocumentGraphState,
  selectedArtifactId: string,
): { artifactIds: Set<string>; truncated: boolean } {
  const maximumArtifacts = 500;
  const knownArtifacts = new Set(state.nodes.map((node) => node.artifactId));
  const adjacent = new Map<string, Set<string>>();
  const connect = (left: string, right: string) => {
    if (!adjacent.has(left)) adjacent.set(left, new Set());
    if (!adjacent.has(right)) adjacent.set(right, new Set());
    adjacent.get(left)?.add(right);
    adjacent.get(right)?.add(left);
  };
  state.edges.forEach((edge) => {
    if (
      knownArtifacts.has(edge.sourceArtifactId) &&
      knownArtifacts.has(edge.targetArtifactId)
    ) {
      const source = state.nodes.find(
        (node) => node.artifactId === edge.sourceArtifactId,
      );
      const target = state.nodes.find(
        (node) => node.artifactId === edge.targetArtifactId,
      );
      if (source && target && nodesAreTenantCompatible(source, target)) {
        connect(edge.sourceArtifactId, edge.targetArtifactId);
      }
    }
  });
  state.bundleMembers.forEach((member) => {
    if (
      knownArtifacts.has(member.bundleArtifactId) &&
      knownArtifacts.has(member.memberArtifactId)
    ) {
      const bundle = state.nodes.find(
        (node) => node.artifactId === member.bundleArtifactId,
      );
      const child = state.nodes.find(
        (node) => node.artifactId === member.memberArtifactId,
      );
      if (bundle && child && nodesAreTenantCompatible(bundle, child)) {
        connect(member.bundleArtifactId, member.memberArtifactId);
      }
    }
  });
  const visited = new Set([selectedArtifactId]);
  const queue = [selectedArtifactId];
  let truncated = false;
  while (queue.length) {
    const current = queue.shift()!;
    for (const candidate of adjacent.get(current) ?? []) {
      if (visited.has(candidate)) continue;
      if (visited.size >= maximumArtifacts) {
        truncated = true;
        continue;
      }
      visited.add(candidate);
      queue.push(candidate);
    }
  }
  return { artifactIds: visited, truncated };
}

function presentationEdges(
  state: WalletClinicalDocumentGraphState,
  component: Set<string>,
) {
  const nodesByArtifactId = new Map(
    state.nodes.map((node) => [node.artifactId, node]),
  );
  const edges = state.edges
    .filter((edge) => {
      const source = nodesByArtifactId.get(edge.sourceArtifactId);
      const target = nodesByArtifactId.get(edge.targetArtifactId);
      return (
        component.has(edge.sourceArtifactId) &&
        component.has(edge.targetArtifactId) &&
        Boolean(source && target && nodesAreTenantCompatible(source, target))
      );
    })
    .map(({ occurredAt: _occurredAt, ...edge }) => edge);
  const keys = new Set(
    edges.map(
      (edge) =>
        `${edge.sourceArtifactId}\u0000${edge.targetArtifactId}\u0000${edge.edgeType}`,
    ),
  );
  for (const member of state.bundleMembers) {
    if (
      !component.has(member.bundleArtifactId) ||
      !component.has(member.memberArtifactId)
    )
      continue;
    const bundle = nodesByArtifactId.get(member.bundleArtifactId);
    const child = nodesByArtifactId.get(member.memberArtifactId);
    if (!bundle || !child || !nodesAreTenantCompatible(bundle, child)) continue;
    const relation = `${member.bundleArtifactId}\u0000${member.memberArtifactId}\u0000packages`;
    if (keys.has(relation)) continue;
    edges.push({
      edgeId: `bundle:${member.bundleArtifactId}:${member.memberArtifactId}`,
      sourceArtifactId: member.bundleArtifactId,
      targetArtifactId: member.memberArtifactId,
      edgeType: "packages",
    });
  }
  return edges.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
}

function classifyNode(
  node: WalletClinicalDocumentGraphNode,
  definition?: ClinicalDocumentGraphArtifactDefinition,
): Set<ClinicalDocumentGraphStageKey> {
  const stages = new Set<ClinicalDocumentGraphStageKey>();
  const envelope = definition?.envelopeLayer ?? "";
  const authority = definition?.authority ?? "";
  const mediaType = node.object?.mediaType.toLowerCase() ?? "";
  if (
    authority === "source_system" ||
    authority === "hospital_edge" ||
    envelope === "raw_source" ||
    node.semanticClass === "clinical_fact"
  )
    stages.add("source");
  if (
    mediaType.includes("fhir") ||
    Boolean(definition?.fhirResources.length) ||
    node.profileUris.some((uri) => uri.includes("hl7.org/fhir"))
  )
    stages.add("fhir");
  if (
    envelope === "clinical_document" ||
    [
      "clinical_document",
      "administrative_document",
      "financial_document",
    ].includes(node.semanticClass)
  )
    stages.add("document");
  if (
    envelope === "retrieval_metadata" ||
    Boolean(node.object?.location) ||
    node.artifactType.toLowerCase().includes("documentreference")
  )
    stages.add("retrieval");
  if (
    node.trustState ||
    (definition && definition.attestationMode !== "automatic")
  ) {
    stages.add("attestation");
  }
  if (
    mediaType.includes("vc+jwt") ||
    node.semanticClass === "identity_credential" ||
    node.semanticClass === "trust_artifact"
  )
    stages.add("vc");
  if (
    node.semanticClass === "transport_artifact" ||
    node.artifactType.toLowerCase().includes("shl")
  )
    stages.add("shl");
  if (
    mediaType.includes("vp+jwt") ||
    node.semanticClass === "presentation_artifact" ||
    node.artifactType === "holder-presentation"
  )
    stages.add("vp");
  return stages;
}

function expectedStages(
  selected: WalletClinicalDocumentGraphNode,
  definition: ClinicalDocumentGraphArtifactDefinition,
): Set<ClinicalDocumentGraphStageKey> {
  const result = new Set<ClinicalDocumentGraphStageKey>(["source"]);
  if (definition.fhirResources.length) result.add("fhir");
  if (
    definition.envelopeLayer === "clinical_document" ||
    definition.produces.includes("clinical_document")
  )
    result.add("document");
  if (definition.produces.includes("retrieval_metadata"))
    result.add("retrieval");
  if (definition.attestationMode) result.add("attestation");
  if (definition.vcPolicy === "required") result.add("vc");
  if (
    definition.shlPolicy === "required" ||
    selected.artifactType.toLowerCase().includes("shl")
  )
    result.add("shl");
  if (
    definition.vpPolicy === "wallet_required" ||
    selected.semanticClass === "presentation_artifact"
  )
    result.add("vp");
  return result;
}

function artifactDefinition(
  contract: ClinicalDocumentGraphContract,
  artifactType: string,
  semanticClass: string,
): ClinicalDocumentGraphArtifactDefinition | undefined {
  const declared = contract.creationMatrix.find(
    (candidate) => candidate.artifactType === artifactType,
  );
  if (declared) return declared;
  if (
    artifactType === "verifiable-credential" &&
    semanticClass === "trust_artifact"
  ) {
    return {
      artifactType,
      family: "presentation",
      semanticClass,
      envelopeLayer: "trust_credential",
      authority: "portal",
      clinicalRisk: "high",
      legalEffect: "none",
      attestationMode: "automatic",
      fhirResources: [],
      profileUris: ["https://www.w3.org/ns/credentials/v2"],
      produces: [],
      vcPolicy: "required",
      shlPolicy: "forbidden",
      vpPolicy: "wallet_optional",
      patientLabelTh: "หลักฐานรับรองดิจิทัล",
      patientLabelEn: "Verifiable credential",
    };
  }
  return undefined;
}

function issuerHospitalId(
  nodes: WalletClinicalDocumentGraphNode[],
): number | null {
  for (const node of nodes) {
    const tenantReference = text(node.object?.extensions.tenantReference);
    const match = tenantReference?.match(/^hospital:(\d+)$/);
    if (match && Number(match[1]) > 0) return Number(match[1]);
  }
  return null;
}

function nodesAreTenantCompatible(
  left: WalletClinicalDocumentGraphNode,
  right: WalletClinicalDocumentGraphNode,
): boolean {
  const leftTenant = text(left.object?.extensions.tenantReference);
  const rightTenant = text(right.object?.extensions.tenantReference);
  return !leftTenant || !rightTenant || leftTenant === rightTenant;
}

function rootArtifactId(
  nodes: WalletClinicalDocumentGraphNode[],
  selected: WalletClinicalDocumentGraphNode,
): string {
  const declaredSource = text(selected.object?.extensions.sourceArtifactId);
  if (
    declaredSource &&
    nodes.some((node) => node.artifactId === declaredSource)
  ) {
    return declaredSource;
  }
  return (
    nodes.find(
      (node) =>
        ![
          "trust_artifact",
          "transport_artifact",
          "presentation_artifact",
          "audit_artifact",
          "policy_artifact",
        ].includes(node.semanticClass),
    )?.artifactId ?? selected.artifactId
  );
}

function referencesAnyArtifact(
  change: ClinicalDocumentGraphWireChange,
  artifacts: Set<string>,
): boolean {
  return [
    change.artifactId,
    change.sourceArtifactId,
    change.targetArtifactId,
    change.bundleArtifactId,
    change.memberArtifactId,
  ].some((value) => typeof value === "string" && artifacts.has(value));
}

function quarantine(
  reason: WalletClinicalDocumentGraphQuarantineReason,
  details: string[],
): Extract<ChangeOutcome, { outcome: "quarantined" }> {
  return { outcome: "quarantined", reason, details };
}

function isQuarantinedOutcome(
  value:
    | ClinicalDocumentGraphObjectDescriptor
    | Extract<ChangeOutcome, { outcome: "quarantined" }>,
): value is Extract<ChangeOutcome, { outcome: "quarantined" }> {
  return value.outcome === "quarantined";
}

function schemaMajor(value: string): number | null {
  const explicit = value.match(/(?:^|[.-])v(\d+)(?:$|[.-])/i);
  if (explicit) return Number(explicit[1]);
  const semver = value.match(/^(\d+)(?:\.\d+){0,2}$/);
  return semver ? Number(semver[1]) : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function digest(value: unknown): `sha256:${string}` | undefined {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value)
    ? (value.toLowerCase() as `sha256:${string}`)
    : undefined;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => text(entry))
    ? (value as string[]).map((entry) => entry.trim())
    : null;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalNonNegativeInteger(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function bundleMemberKey(bundleArtifactId: string, memberArtifactId: string) {
  return `${bundleArtifactId}\u0000${memberArtifactId}`;
}

function sorted<T>(values: Iterable<T>, key: (value: T) => string): T[] {
  return Array.from(values).sort((left, right) =>
    key(left).localeCompare(key(right)),
  );
}

function assertUnique<T>(
  values: T[],
  key: (value: T) => string,
  label: string,
) {
  const seen = new Set<string>();
  for (const value of values) {
    const candidate = key(value);
    if (seen.has(candidate))
      throw new Error(`Duplicate ${label}: ${candidate}`);
    seen.add(candidate);
  }
}

function requireHolderDid(value: string): string {
  if (!value.startsWith("did:key:")) {
    throw new Error("Clinical Document Graph holder must use did:key.");
  }
  return value;
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone<T>(value: T): T {
  return globalThis.structuredClone(value);
}

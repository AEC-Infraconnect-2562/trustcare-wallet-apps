import {
  TrustCareContractError,
  type TrustCareValidationIssue,
} from "./validation";

export const CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION =
  "2026.07.pcdg.v2" as const;
export const CLINICAL_DOCUMENT_GRAPH_CHANGES_MEDIA_TYPE =
  "application/vnd.trustcare.pcdg-changes+json;version=2" as const;
export const CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID =
  "urn:trustcare:schema:graph-presentation:2026.07.pcdg.v2" as const;

export const CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS = [
  "source",
  "fhir",
  "document",
  "retrieval",
  "attestation",
  "vc",
  "shl",
  "vp",
] as const;

export const CLINICAL_DOCUMENT_GRAPH_STAGE_STATUSES = [
  "available",
  "pending",
  "blocked",
  "not_applicable",
] as const;

export const CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES = [
  "clinical_fact",
  "clinical_document",
  "identity_credential",
  "administrative_document",
  "financial_document",
  "trust_artifact",
  "transport_artifact",
  "presentation_artifact",
  "audit_artifact",
  "policy_artifact",
] as const;

export const CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES = [
  "derived-from",
  "composed-from",
  "supersedes",
  "amends",
  "attests",
  "verifies",
  "binds-holder",
  "binds-manifest",
  "references",
  "retrieves",
  "packages",
  "presents",
  "authorized-by",
  "governed-by",
  "consented-by",
] as const;

export const CLINICAL_DOCUMENT_GRAPH_TRUST_STATES = [
  "transport_valid",
  "content_integrity_valid",
  "issuer_verified",
  "holder_bound",
  "organization_attested",
  "policy_compliant",
  "fully_verified",
  "invalid",
] as const;

export const CLINICAL_DOCUMENT_GRAPH_CHANGE_KINDS = [
  "node_upsert",
  "edge_upsert",
  "bundle_member_added",
  "bundle_member_removed",
  "lifecycle_transition",
  "trust_state_changed",
  "object_schema_changed",
] as const;

export type ClinicalDocumentGraphStageKey =
  (typeof CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS)[number];
export type ClinicalDocumentGraphStageStatus =
  (typeof CLINICAL_DOCUMENT_GRAPH_STAGE_STATUSES)[number];
export type ClinicalDocumentGraphSemanticClass =
  (typeof CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES)[number];
export type ClinicalDocumentGraphEdgeType =
  (typeof CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES)[number];
export type ClinicalDocumentGraphTrustState =
  (typeof CLINICAL_DOCUMENT_GRAPH_TRUST_STATES)[number];
export type ClinicalDocumentGraphChangeKind =
  (typeof CLINICAL_DOCUMENT_GRAPH_CHANGE_KINDS)[number];

export type ClinicalDocumentGraphArtifactDefinition = Record<
  string,
  unknown
> & {
  artifactType: string;
  family: string;
  semanticClass: string;
  envelopeLayer: string;
  authority: string;
  clinicalRisk: string;
  legalEffect: string;
  attestationMode: string;
  fhirResources: string[];
  profileUris: string[];
  produces: string[];
  vcPolicy: "required" | "optional" | "forbidden";
  shlPolicy: "allowed" | "required" | "forbidden";
  vpPolicy: "wallet_optional" | "wallet_required" | "not_applicable";
  patientLabelTh: string;
  patientLabelEn: string;
};

export type ClinicalDocumentGraphContract = Record<string, unknown> & {
  version: string;
  graphContractVersion: typeof CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION;
  clinicalContentOwnership: string;
  trustDecisionOwnership: "portal";
  holderPresentationOwnership: "wallet";
  rendererAuthority: "wallet";
  semanticClasses: string[];
  edgeTypes: string[];
  attestationModes: string[];
  trustStates: string[];
  envelopeLayers: string[];
  creationMatrix: ClinicalDocumentGraphArtifactDefinition[];
  changeProtocol: {
    endpoint: string;
    mediaType: typeof CLINICAL_DOCUMENT_GRAPH_CHANGES_MEDIA_TYPE;
    maximumChangesPerPage: number;
    immutableUpdates: "supersede";
    unknownRequiredFields: "quarantine";
    additiveUnknownFieldsAllowed: true;
  };
  presentationProtocol: {
    schemaId: typeof CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID;
    schemaEndpoint: string;
    projectionMode: "derived_from_authoritative_graph";
    persistenceRule: "wallet_rebuilds_from_local_graph_state";
    stageKeys: ClinicalDocumentGraphStageKey[];
    graphExplainsDocument: true;
    graphReplacesDocumentRenderer: false;
  };
  walletRules: string[];
  artifactBinding: Record<string, unknown>;
};

export type ClinicalDocumentGraphPresentationSchema = Record<
  string,
  unknown
> & {
  $id: typeof CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID;
  contractVersion: typeof CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION;
  schema: Record<string, unknown> & {
    $schema: string;
    type: "object";
    required: string[];
    properties: Record<string, unknown>;
  };
};

export type ClinicalDocumentGraphObjectDescriptor = Record<string, unknown> & {
  objectId: string;
  mediaType: string;
  schemaId: string;
  schemaVersion: string;
  profileUris: string[];
  contentHash: `sha256:${string}`;
  canonicalization: string;
  sizeBytes?: number;
  location?: string;
  encryption?: { algorithm: string; keyReference?: string };
  requiredFields: string[];
  extensions: Record<string, unknown>;
};

export type ClinicalDocumentGraphWireChange = Record<string, unknown> & {
  changeId: string;
  kind: string;
  sequence: number;
  occurredAt: string;
  breaking: boolean;
  requiresRefetch: boolean;
};

export type ClinicalDocumentGraphChangeSet = Record<string, unknown> & {
  contractVersion: typeof CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION;
  changeSetId: string;
  tenantReference: string;
  subjectReference: string;
  cursor: string;
  nextCursor: string;
  correlationId: string;
  idempotencyKey: string;
  occurredAt: string;
  compatibility: {
    minimumConsumerVersion: string;
    additiveUnknownFieldsAllowed: true;
    unknownRequiredFields: "quarantine";
    immutableArtifactUpdates: "supersede";
  };
  changes: ClinicalDocumentGraphWireChange[];
  hasMore: boolean;
};

export type ClinicalDocumentGraphPresentationNode = {
  artifactId: string;
  artifactType: string;
  semanticClass: ClinicalDocumentGraphSemanticClass;
  lifecycleStatus: string;
  versionId: string;
  contentHash: string;
  profileUris: string[];
  retrievable: boolean;
  object?: ClinicalDocumentGraphObjectDescriptor;
};

export type ClinicalDocumentGraphPresentationEdge = {
  edgeId: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  edgeType: ClinicalDocumentGraphEdgeType;
};

export type ClinicalDocumentGraphPresentationStage = {
  key: ClinicalDocumentGraphStageKey;
  status: ClinicalDocumentGraphStageStatus;
  artifactIds: string[];
  labelTh: string;
  labelEn: string;
  detailTh: string;
  detailEn: string;
};

export type ClinicalDocumentGraphPresentation = {
  contractVersion: typeof CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION;
  presentationId: string;
  requestedArtifactId: string;
  rootArtifactId: string;
  issuerHospitalId: number;
  subjectId: number | null;
  subjectReference: string | null;
  artifactType: string;
  titleTh: string;
  titleEn: string;
  lifecycleStatus: string;
  trustState: ClinicalDocumentGraphTrustState | null;
  stages: ClinicalDocumentGraphPresentationStage[];
  nodes: ClinicalDocumentGraphPresentationNode[];
  edges: ClinicalDocumentGraphPresentationEdge[];
  evidence: {
    passed: number;
    warnings: number;
    failed: number;
    humanApprovals: number;
    openTasks: number;
  };
  generatedAt: string;
};

const presentationRequiredProperties = [
  "contractVersion",
  "presentationId",
  "requestedArtifactId",
  "rootArtifactId",
  "issuerHospitalId",
  "subjectId",
  "subjectReference",
  "artifactType",
  "titleTh",
  "titleEn",
  "lifecycleStatus",
  "trustState",
  "stages",
  "nodes",
  "edges",
  "evidence",
  "generatedAt",
] as const;

export function assertClinicalDocumentGraphContract(
  value: unknown,
): ClinicalDocumentGraphContract {
  const contract = "ClinicalDocumentGraphContract";
  const issues: TrustCareValidationIssue[] = [];
  const object = record(value, "$", issues);
  requiredText(object, "version", "$", issues);
  literal(
    object,
    "graphContractVersion",
    CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    "$",
    issues,
  );
  literal(object, "trustDecisionOwnership", "portal", "$", issues);
  literal(object, "holderPresentationOwnership", "wallet", "$", issues);
  literal(object, "rendererAuthority", "wallet", "$", issues);
  requiredText(object, "clinicalContentOwnership", "$", issues);

  requiredStringArray(object.semanticClasses, "$.semanticClasses", issues);
  requiredStringArray(object.edgeTypes, "$.edgeTypes", issues);
  requiredStringArray(object.attestationModes, "$.attestationModes", issues);
  requiredStringArray(object.trustStates, "$.trustStates", issues);
  requiredStringArray(object.envelopeLayers, "$.envelopeLayers", issues);
  requireMembers(
    object.semanticClasses,
    CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES,
    "$.semanticClasses",
    issues,
  );
  requireMembers(
    object.edgeTypes,
    CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES,
    "$.edgeTypes",
    issues,
  );
  requireMembers(
    object.trustStates,
    CLINICAL_DOCUMENT_GRAPH_TRUST_STATES,
    "$.trustStates",
    issues,
  );

  const matrix = array(
    object.creationMatrix,
    "$.creationMatrix",
    issues,
    1,
    500,
  );
  const artifactTypes = new Set<string>();
  matrix?.forEach((entry, index) => {
    const item = record(entry, `$.creationMatrix[${index}]`, issues);
    for (const key of [
      "artifactType",
      "family",
      "semanticClass",
      "envelopeLayer",
      "authority",
      "clinicalRisk",
      "legalEffect",
      "attestationMode",
      "patientLabelTh",
      "patientLabelEn",
    ])
      requiredText(item, key, `$.creationMatrix[${index}]`, issues);
    for (const key of ["fhirResources", "profileUris", "produces"]) {
      requiredStringArray(
        item[key],
        `$.creationMatrix[${index}].${key}`,
        issues,
        true,
      );
    }
    oneOf(
      item,
      "vcPolicy",
      ["required", "optional", "forbidden"],
      `$.creationMatrix[${index}]`,
      issues,
    );
    oneOf(
      item,
      "shlPolicy",
      ["allowed", "required", "forbidden"],
      `$.creationMatrix[${index}]`,
      issues,
    );
    oneOf(
      item,
      "vpPolicy",
      ["wallet_optional", "wallet_required", "not_applicable"],
      `$.creationMatrix[${index}]`,
      issues,
    );
    if (typeof item.artifactType === "string") {
      if (artifactTypes.has(item.artifactType))
        issue(
          issues,
          `$.creationMatrix[${index}].artifactType`,
          "must be unique",
        );
      artifactTypes.add(item.artifactType);
    }
  });

  const change = record(object.changeProtocol, "$.changeProtocol", issues);
  requiredText(change, "endpoint", "$.changeProtocol", issues);
  literal(
    change,
    "mediaType",
    CLINICAL_DOCUMENT_GRAPH_CHANGES_MEDIA_TYPE,
    "$.changeProtocol",
    issues,
  );
  integer(change, "maximumChangesPerPage", "$.changeProtocol", issues, 1, 1000);
  literal(change, "immutableUpdates", "supersede", "$.changeProtocol", issues);
  literal(
    change,
    "unknownRequiredFields",
    "quarantine",
    "$.changeProtocol",
    issues,
  );
  literal(
    change,
    "additiveUnknownFieldsAllowed",
    true,
    "$.changeProtocol",
    issues,
  );

  const presentation = record(
    object.presentationProtocol,
    "$.presentationProtocol",
    issues,
  );
  literal(
    presentation,
    "schemaId",
    CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID,
    "$.presentationProtocol",
    issues,
  );
  requiredText(
    presentation,
    "schemaEndpoint",
    "$.presentationProtocol",
    issues,
  );
  literal(
    presentation,
    "projectionMode",
    "derived_from_authoritative_graph",
    "$.presentationProtocol",
    issues,
  );
  literal(
    presentation,
    "persistenceRule",
    "wallet_rebuilds_from_local_graph_state",
    "$.presentationProtocol",
    issues,
  );
  exactStringArray(
    presentation.stageKeys,
    CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS,
    "$.presentationProtocol.stageKeys",
    issues,
  );
  literal(
    presentation,
    "graphExplainsDocument",
    true,
    "$.presentationProtocol",
    issues,
  );
  literal(
    presentation,
    "graphReplacesDocumentRenderer",
    false,
    "$.presentationProtocol",
    issues,
  );
  requiredStringArray(object.walletRules, "$.walletRules", issues);
  record(object.artifactBinding, "$.artifactBinding", issues);
  return finish(contract, value, issues);
}

export function assertClinicalDocumentGraphPresentationSchema(
  value: unknown,
): ClinicalDocumentGraphPresentationSchema {
  const contract = "ClinicalDocumentGraphPresentationSchema";
  const issues: TrustCareValidationIssue[] = [];
  const object = record(value, "$", issues);
  literal(
    object,
    "$id",
    CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID,
    "$",
    issues,
  );
  literal(
    object,
    "contractVersion",
    CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    "$",
    issues,
  );
  const schema = record(object.schema, "$.schema", issues);
  requiredText(schema, "$schema", "$.schema", issues);
  literal(schema, "type", "object", "$.schema", issues);
  requiredStringArray(schema.required, "$.schema.required", issues);
  requireMembers(
    schema.required,
    presentationRequiredProperties,
    "$.schema.required",
    issues,
  );
  const properties = record(schema.properties, "$.schema.properties", issues);
  const version = record(
    properties.contractVersion,
    "$.schema.properties.contractVersion",
    issues,
  );
  literal(
    version,
    "const",
    CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    "$.schema.properties.contractVersion",
    issues,
  );
  const stages = record(
    properties.stages,
    "$.schema.properties.stages",
    issues,
  );
  literal(stages, "minItems", 8, "$.schema.properties.stages", issues);
  literal(stages, "maxItems", 8, "$.schema.properties.stages", issues);
  const stageItems = record(
    stages.items,
    "$.schema.properties.stages.items",
    issues,
  );
  const stageProperties = record(
    stageItems.properties,
    "$.schema.properties.stages.items.properties",
    issues,
  );
  const stageKey = record(
    stageProperties.key,
    "$.schema.properties.stages.items.properties.key",
    issues,
  );
  exactStringArray(
    stageKey.enum,
    CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS,
    "$.schema.properties.stages.items.properties.key.enum",
    issues,
  );
  return finish(contract, value, issues);
}

/**
 * Validates the versioned page envelope while deliberately preserving each
 * change as a wire record. Individual unknown semantics are quarantined by
 * wallet-core so one future item cannot discard the rest of an atomic page.
 */
export function assertClinicalDocumentGraphChangeSet(
  value: unknown,
): ClinicalDocumentGraphChangeSet {
  const contract = "ClinicalDocumentGraphChangeSet";
  const issues: TrustCareValidationIssue[] = [];
  const object = record(value, "$", issues);
  literal(
    object,
    "contractVersion",
    CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    "$",
    issues,
  );
  for (const key of [
    "changeSetId",
    "tenantReference",
    "subjectReference",
    "cursor",
    "nextCursor",
    "correlationId",
    "idempotencyKey",
  ])
    requiredText(object, key, "$", issues);
  isoDate(object, "occurredAt", "$", issues);
  boolean(object, "hasMore", "$", issues);
  const compatibility = record(object.compatibility, "$.compatibility", issues);
  requiredText(
    compatibility,
    "minimumConsumerVersion",
    "$.compatibility",
    issues,
  );
  literal(
    compatibility,
    "additiveUnknownFieldsAllowed",
    true,
    "$.compatibility",
    issues,
  );
  literal(
    compatibility,
    "unknownRequiredFields",
    "quarantine",
    "$.compatibility",
    issues,
  );
  literal(
    compatibility,
    "immutableArtifactUpdates",
    "supersede",
    "$.compatibility",
    issues,
  );
  const changes = array(object.changes, "$.changes", issues, 0, 1000);
  changes?.forEach((entry, index) => {
    const item = record(entry, `$.changes[${index}]`, issues);
    requiredText(item, "changeId", `$.changes[${index}]`, issues);
    requiredText(item, "kind", `$.changes[${index}]`, issues);
    integer(item, "sequence", `$.changes[${index}]`, issues, 0);
    isoDate(item, "occurredAt", `$.changes[${index}]`, issues);
    boolean(item, "breaking", `$.changes[${index}]`, issues);
    boolean(item, "requiresRefetch", `$.changes[${index}]`, issues);
  });
  return finish(contract, value, issues);
}

export function assertClinicalDocumentGraphPresentation(
  value: unknown,
): ClinicalDocumentGraphPresentation {
  const contract = "ClinicalDocumentGraphPresentation";
  const issues: TrustCareValidationIssue[] = [];
  const object = record(value, "$", issues);
  literal(
    object,
    "contractVersion",
    CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    "$",
    issues,
  );
  for (const key of [
    "presentationId",
    "requestedArtifactId",
    "rootArtifactId",
    "artifactType",
    "titleTh",
    "titleEn",
    "lifecycleStatus",
  ])
    requiredText(object, key, "$", issues);
  integer(object, "issuerHospitalId", "$", issues, 1);
  nullablePositiveInteger(object, "subjectId", "$", issues);
  nullableText(object, "subjectReference", "$", issues);
  nullableOneOf(
    object,
    "trustState",
    CLINICAL_DOCUMENT_GRAPH_TRUST_STATES,
    "$",
    issues,
  );
  const stages = array(object.stages, "$.stages", issues, 8, 8);
  stages?.forEach((entry, index) => {
    const stage = record(entry, `$.stages[${index}]`, issues);
    literal(
      stage,
      "key",
      CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS[index],
      `$.stages[${index}]`,
      issues,
    );
    oneOf(
      stage,
      "status",
      CLINICAL_DOCUMENT_GRAPH_STAGE_STATUSES,
      `$.stages[${index}]`,
      issues,
    );
    requiredStringArray(
      stage.artifactIds,
      `$.stages[${index}].artifactIds`,
      issues,
      true,
    );
    for (const key of ["labelTh", "labelEn", "detailTh", "detailEn"]) {
      requiredText(stage, key, `$.stages[${index}]`, issues);
    }
  });
  const nodes = array(object.nodes, "$.nodes", issues, 1, 5000);
  nodes?.forEach((entry, index) =>
    validatePresentationNode(entry, `$.nodes[${index}]`, issues),
  );
  const edges = array(object.edges, "$.edges", issues, 0, 10000);
  edges?.forEach((entry, index) =>
    validatePresentationEdge(entry, `$.edges[${index}]`, issues),
  );
  const evidence = record(object.evidence, "$.evidence", issues);
  for (const key of [
    "passed",
    "warnings",
    "failed",
    "humanApprovals",
    "openTasks",
  ]) {
    integer(evidence, key, "$.evidence", issues, 0);
  }
  isoDate(object, "generatedAt", "$", issues);
  return finish(contract, value, issues);
}

function validatePresentationNode(
  value: unknown,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  const object = record(value, path, issues);
  for (const key of [
    "artifactId",
    "artifactType",
    "lifecycleStatus",
    "versionId",
    "contentHash",
  ]) {
    requiredText(object, key, path, issues);
  }
  oneOf(
    object,
    "semanticClass",
    CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES,
    path,
    issues,
  );
  requiredStringArray(object.profileUris, `${path}.profileUris`, issues, true);
  boolean(object, "retrievable", path, issues);
  if (object.object !== undefined)
    record(object.object, `${path}.object`, issues);
}

function validatePresentationEdge(
  value: unknown,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  const object = record(value, path, issues);
  for (const key of ["edgeId", "sourceArtifactId", "targetArtifactId"])
    requiredText(object, key, path, issues);
  oneOf(object, "edgeType", CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES, path, issues);
}

function record(
  value: unknown,
  path: string,
  issues: TrustCareValidationIssue[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issue(issues, path, "must be an object");
    return {};
  }
  return value as Record<string, unknown>;
}

function array(
  value: unknown,
  path: string,
  issues: TrustCareValidationIssue[],
  min: number,
  max: number,
): unknown[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    issue(issues, path, `must be an array with ${min}-${max} items`);
    return null;
  }
  return value;
}

function requiredText(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (typeof object[key] !== "string" || !object[key].trim())
    issue(issues, `${path}.${key}`, "must be a non-empty string");
}

function nullableText(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== null) requiredText(object, key, path, issues);
}

function requiredStringArray(
  value: unknown,
  path: string,
  issues: TrustCareValidationIssue[],
  allowEmpty = false,
) {
  const values = array(value, path, issues, allowEmpty ? 0 : 1, 1000);
  values?.forEach((entry, index) => {
    if (typeof entry !== "string" || !entry.trim())
      issue(issues, `${path}[${index}]`, "must be a non-empty string");
  });
}

function requireMembers(
  value: unknown,
  required: readonly string[],
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (!Array.isArray(value)) return;
  const values = new Set(value);
  required.forEach((entry) => {
    if (!values.has(entry)) issue(issues, path, `must include ${entry}`);
  });
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    issue(issues, path, `must equal ${expected.join(", ")} in order`);
  }
}

function literal(
  object: Record<string, unknown>,
  key: string,
  expected: unknown,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== expected)
    issue(issues, `${path}.${key}`, `must equal ${String(expected)}`);
}

function oneOf(
  object: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (typeof object[key] !== "string" || !allowed.includes(object[key]))
    issue(issues, `${path}.${key}`, `must be one of ${allowed.join(", ")}`);
}

function nullableOneOf(
  object: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== null) oneOf(object, key, allowed, path, issues);
}

function integer(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
  min: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  const value = object[key];
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    issue(
      issues,
      `${path}.${key}`,
      `must be an integer between ${min} and ${max}`,
    );
}

function nullablePositiveInteger(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (object[key] !== null) integer(object, key, path, issues, 1);
}

function boolean(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  if (typeof object[key] !== "boolean")
    issue(issues, `${path}.${key}`, "must be a boolean");
}

function isoDate(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: TrustCareValidationIssue[],
) {
  const value = object[key];
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    issue(issues, `${path}.${key}`, "must be an ISO-8601 date-time");
}

function issue(
  issues: TrustCareValidationIssue[],
  path: string,
  message: string,
) {
  issues.push({ path: path.replace(/^\$\.?/, "") || "$", message });
}

function finish<T>(
  contract: string,
  value: unknown,
  issues: TrustCareValidationIssue[],
): T {
  if (issues.length) throw new TrustCareContractError(contract, issues);
  return value as T;
}

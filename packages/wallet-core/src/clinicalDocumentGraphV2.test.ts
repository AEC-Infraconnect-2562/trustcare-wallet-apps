import {
  CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
  CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES,
  CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES,
  CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS,
  CLINICAL_DOCUMENT_GRAPH_TRUST_STATES,
  type ClinicalDocumentGraphArtifactDefinition,
  type ClinicalDocumentGraphChangeSet,
  type ClinicalDocumentGraphContract,
} from "@trustcare/contracts";
import { describe, expect, it } from "vitest";
import {
  buildClinicalDocumentGraphPresentation,
  createWalletClinicalDocumentGraphState,
  listClinicalDocumentGraphArtifacts,
  prepareWalletClinicalDocumentGraphSyncCommit,
} from "./clinicalDocumentGraphV2";

const portalOrigin = "https://portal.example";
const holderDid = "did:key:z6MkGraphHolder";
const now = "2026-07-13T00:00:00.000Z";
const hash = (letter: string) => `sha256:${letter.repeat(64)}` as const;

const seedTypes = {
  patient_identity: "identity_credential",
  staff_identity: "identity_credential",
  consent_receipt: "administrative_document",
  patient_summary: "clinical_document",
  allergy_alert: "clinical_fact",
  medication_summary: "clinical_fact",
  referral_vc: "clinical_document",
  immunization: "clinical_fact",
  medical_certificate: "clinical_document",
  prescription: "clinical_document",
  lab_result: "clinical_document",
  diagnostic_report: "clinical_document",
  discharge_summary: "clinical_document",
  insurance_eligibility: "financial_document",
  claim_package: "financial_document",
  claim_receipt: "financial_document",
  travel_document_verification: "administrative_document",
  shl_manifest: "trust_artifact",
  pharmacy_dispense: "clinical_fact",
  appointment: "administrative_document",
  visa_support_letter: "administrative_document",
  quotation: "financial_document",
  guarantee_letter: "financial_document",
  mpi_link_certificate: "identity_credential",
  sync_receipt: "audit_artifact",
} as const;

describe("Wallet Clinical Document Graph v2", () => {
  it("applies holder-bound delta pages atomically and treats replay as idempotent", () => {
    const initial = createWalletClinicalDocumentGraphState({
      portalOrigin,
      holderDid,
    });
    const first = reduce(
      initial,
      page(undefined, "cursor-1", [
        node(
          "doc:patient",
          "patient_identity",
          "identity_credential",
          hash("a"),
        ),
        edge("edge:pending", "vc:patient", "doc:patient", "attests"),
      ]),
    );
    expect(first.state.nodes).toHaveLength(1);
    expect(first.state.edges).toHaveLength(1);
    expect(first.state.nextCursor).toBe("cursor-1");

    const replay = reduce(
      initial,
      page(undefined, "cursor-1", [
        node(
          "doc:patient",
          "patient_identity",
          "identity_credential",
          hash("a"),
        ),
        edge("edge:pending", "vc:patient", "doc:patient", "attests"),
      ]),
    );
    expect(replay.state).toEqual(first.state);

    const second = reduce(
      first.state,
      page("cursor-1", "cursor-2", [
        node(
          "vc:patient",
          "verifiable-credential",
          "trust_artifact",
          hash("b"),
          {
            schemaId: "https://www.w3.org/ns/credentials/v2",
            profileUris: ["https://www.w3.org/ns/credentials/v2"],
            mediaType: "application/vc+jwt",
          },
        ),
      ]),
    );
    expect(second.state.nodes).toHaveLength(2);
    expect(second.plan.appliedChangeIds).toEqual(["change:vc:patient"]);
  });

  it("quarantines unknown required semantics while advancing the durable cursor", () => {
    const initial = createWalletClinicalDocumentGraphState({
      portalOrigin,
      holderDid,
    });
    const change = node(
      "doc:future",
      "patient_summary",
      "clinical_document",
      hash("c"),
      { requiredFields: ["futureClinicalMeaning"] },
    );
    const result = reduce(
      initial,
      page(undefined, "cursor-quarantine", [change]),
    );
    expect(result.state.nodes).toHaveLength(0);
    expect(result.state.nextCursor).toBe("cursor-quarantine");
    expect(result.state.quarantine).toMatchObject([
      { changeId: change.changeId, reason: "unknown_required_fields" },
    ]);
  });

  it("rejects in-place digest mutation and keeps the original immutable node", () => {
    const initial = createWalletClinicalDocumentGraphState({
      portalOrigin,
      holderDid,
    });
    const first = reduce(
      initial,
      page(undefined, "cursor-a", [
        node(
          "doc:immutable",
          "medical_certificate",
          "clinical_document",
          hash("d"),
        ),
      ]),
    );
    const mutation = node(
      "doc:immutable",
      "medical_certificate",
      "clinical_document",
      hash("e"),
    );
    mutation.changeId = "change:doc:immutable:mutated";
    const independent = node(
      "doc:independent-after-mismatch",
      "lab_result",
      "clinical_document",
      hash("f"),
    );
    const second = reduce(
      first.state,
      page("cursor-a", "cursor-b", [mutation, independent]),
    );
    expect(
      second.state.nodes.find((item) => item.artifactId === "doc:immutable")
        ?.contentHash,
    ).toBe(hash("d"));
    expect(second.state.nodes.map((item) => item.artifactId)).toContain(
      "doc:independent-after-mismatch",
    );
    expect(second.state.quarantine[0]?.reason).toBe(
      "immutable_artifact_mutation",
    );
  });

  it("supersedes by reference while retaining the original signed object history", () => {
    const initial = createWalletClinicalDocumentGraphState({
      portalOrigin,
      holderDid,
    });
    const original = node(
      "vc:summary:v1",
      "verifiable-credential",
      "trust_artifact",
      hash("1"),
      {
        schemaId: "https://www.w3.org/ns/credentials/v2",
        mediaType: "application/vc+jwt",
        extensions: { sourceCredentialId: "credential-summary-v1" },
      },
    );
    const first = reduce(
      initial,
      page(undefined, "cursor-supersede-1", [original]),
    );
    const replacement = node(
      "vc:summary:v2",
      "verifiable-credential",
      "trust_artifact",
      hash("2"),
      {
        schemaId: "https://www.w3.org/ns/credentials/v2",
        mediaType: "application/vc+jwt",
        extensions: { sourceCredentialId: "credential-summary-v2" },
      },
    );
    const result = reduce(
      first.state,
      page("cursor-supersede-1", "cursor-supersede-2", [
        replacement,
        edge(
          "edge:summary:v2-supersedes-v1",
          "vc:summary:v2",
          "vc:summary:v1",
          "supersedes",
        ),
        {
          changeId: "change:summary:v1-superseded",
          kind: "lifecycle_transition",
          sequence: 3,
          occurredAt: now,
          breaking: false,
          requiresRefetch: false,
          artifactId: "vc:summary:v1",
          from: "current",
          to: "superseded",
          supersededBy: "vc:summary:v2",
        },
      ]),
    );

    expect(result.state.nodes).toHaveLength(2);
    expect(
      result.state.nodes.find((item) => item.artifactId === "vc:summary:v1"),
    ).toMatchObject({
      contentHash: hash("1"),
      lifecycleStatus: "superseded",
      supersededBy: "vc:summary:v2",
      object: {
        extensions: { sourceCredentialId: "credential-summary-v1" },
      },
    });
    expect(
      result.state.nodes.find((item) => item.artifactId === "vc:summary:v2"),
    ).toMatchObject({
      contentHash: hash("2"),
      lifecycleStatus: "current",
    });
    expect(result.state.edges).toMatchObject([{ edgeType: "supersedes" }]);
  });

  it("opens a projection for every seed VC plus Holder VP and Certified SHL trust layer", () => {
    const changes = Object.entries(seedTypes).flatMap(
      ([artifactType, semanticClass], index) => {
        const suffix = index.toString(16).padStart(2, "0");
        return [
          node(
            `doc:${artifactType}`,
            artifactType,
            semanticClass,
            hash(index % 2 ? "a" : "b"),
          ),
          node(
            `vc:${artifactType}`,
            "verifiable-credential",
            "trust_artifact",
            `sha256:${suffix.repeat(32)}`,
            {
              schemaId: "https://www.w3.org/ns/credentials/v2",
              profileUris: ["https://www.w3.org/ns/credentials/v2"],
              mediaType: "application/vc+jwt",
            },
          ),
          edge(
            `edge:${artifactType}:vc`,
            `vc:${artifactType}`,
            `doc:${artifactType}`,
            "attests",
          ),
        ];
      },
    );
    changes.push(
      node(
        "shl:transport:1",
        "standard-shl-manifest",
        "transport_artifact",
        hash("f"),
        { mediaType: "application/smart-health-card" },
      ),
      node(
        "vp:holder:1",
        "holder-presentation",
        "presentation_artifact",
        hash("9"),
        {
          schemaId: "urn:trustcare:schema:holder-presentation",
          mediaType: "application/vp+jwt",
        },
      ),
      edge(
        "edge:shl:manifest",
        "vc:shl_manifest",
        "shl:transport:1",
        "binds-manifest",
      ),
      edge(
        "edge:shl:holder",
        "vp:holder:1",
        "shl:transport:1",
        "authorized-by",
      ),
      edge(
        "edge:shl:file",
        "shl:transport:1",
        "doc:patient_summary",
        "packages",
      ),
    );
    const result = reduce(
      createWalletClinicalDocumentGraphState({ portalOrigin, holderDid }),
      page(undefined, "cursor-all-seeds", changes),
    );
    expect(result.state.quarantine).toEqual([]);
    for (const artifactType of Object.keys(seedTypes)) {
      const projection = buildClinicalDocumentGraphPresentation({
        state: result.state,
        graphContract,
        selectedArtifactId: `vc:${artifactType}`,
        now: new Date(now),
      });
      expect(projection.requestedArtifactId).toBe(`vc:${artifactType}`);
      expect(projection.stages).toHaveLength(8);
      expect(
        projection.stages.find((stage) => stage.key === "vc")?.status,
      ).toBe("available");
    }
    const vp = buildClinicalDocumentGraphPresentation({
      state: result.state,
      graphContract,
      selectedArtifactId: "vp:holder:1",
      now: new Date(now),
    });
    const shl = buildClinicalDocumentGraphPresentation({
      state: result.state,
      graphContract,
      selectedArtifactId: "shl:transport:1",
      now: new Date(now),
    });
    expect(vp.stages.find((stage) => stage.key === "vp")?.status).toBe(
      "available",
    );
    expect(shl.stages.find((stage) => stage.key === "shl")?.status).toBe(
      "available",
    );
    expect(shl.nodes.map((item) => item.artifactId)).toEqual(
      expect.arrayContaining([
        "shl:transport:1",
        "vc:shl_manifest",
        "vp:holder:1",
        "doc:patient_summary",
      ]),
    );
    expect(shl.edges.map((item) => item.edgeType)).toEqual(
      expect.arrayContaining(["binds-manifest", "authorized-by", "packages"]),
    );
    const identity = buildClinicalDocumentGraphPresentation({
      state: result.state,
      graphContract,
      selectedArtifactId: "vc:patient_identity",
      now: new Date(now),
    });
    expect(identity.requestedArtifactId).not.toBe(shl.requestedArtifactId);
    expect(identity.nodes.length).not.toBe(shl.nodes.length);
    expect(
      identity.stages
        .filter((stage) => stage.status === "available")
        .map((stage) => stage.key),
    ).not.toEqual(
      shl.stages
        .filter((stage) => stage.status === "available")
        .map((stage) => stage.key),
    );
    expect(listClinicalDocumentGraphArtifacts(result.state)).toHaveLength(
      Object.keys(seedTypes).length * 2 + 2,
    );
  });

  it("preserves additive descriptors and applies bundle membership independently", () => {
    const initial = createWalletClinicalDocumentGraphState({
      portalOrigin,
      holderDid,
    });
    const bundle = node(
      "bundle:summary",
      "patient_summary",
      "clinical_document",
      hash("1"),
      { extensions: { tenantReference: "hospital:1", futureOptional: "kept" } },
    );
    const member = node(
      "member:allergy",
      "allergy_alert",
      "clinical_fact",
      hash("2"),
    );
    const added = reduce(
      initial,
      page(undefined, "cursor-members-added", [
        bundle,
        member,
        {
          changeId: "change:member-added",
          kind: "bundle_member_added",
          sequence: 3,
          occurredAt: now,
          breaking: false,
          requiresRefetch: false,
          bundleArtifactId: "bundle:summary",
          memberArtifactId: "member:allergy",
          memberHash: hash("2"),
          position: 0,
        },
      ]),
    );
    expect(added.state.bundleMembers).toHaveLength(1);
    expect(
      added.state.nodes.find((item) => item.artifactId === "bundle:summary")
        ?.object?.extensions.futureOptional,
    ).toBe("kept");

    const removed = reduce(
      added.state,
      page("cursor-members-added", "cursor-members-removed", [
        {
          changeId: "change:member-removed",
          kind: "bundle_member_removed",
          sequence: 4,
          occurredAt: now,
          breaking: false,
          requiresRefetch: false,
          bundleArtifactId: "bundle:summary",
          memberArtifactId: "member:allergy",
          reason: "corrected-membership",
        },
      ]),
    );
    expect(removed.state.bundleMembers).toEqual([]);
    expect(removed.state.nodes.map((item) => item.contentHash)).toEqual([
      hash("1"),
      hash("2"),
    ]);
  });

  it("continues independent valid objects while quarantining one unknown required meaning", () => {
    const valid = node(
      "doc:valid-independent",
      "patient_summary",
      "clinical_document",
      hash("3"),
    );
    const unsupported = node(
      "doc:unsupported-independent",
      "patient_summary",
      "clinical_document",
      hash("4"),
      { requiredFields: ["issuer", "futureRequiredMeaning"] },
    );
    const result = reduce(
      createWalletClinicalDocumentGraphState({ portalOrigin, holderDid }),
      page(undefined, "cursor-independent", [valid, unsupported]),
    );
    expect(result.state.nodes.map((item) => item.artifactId)).toEqual([
      "doc:valid-independent",
    ]);
    expect(result.state.quarantine).toMatchObject([
      {
        changeId: "change:doc:unsupported-independent",
        reason: "unknown_required_fields",
      },
    ]);
    expect(
      result.state.changes.map((item) => item.changeSetIdempotencyKey),
    ).toEqual([
      "graph-feed:cursor-independent",
      "graph-feed:cursor-independent",
    ]);
  });

  it("keeps three hospital authorities isolated inside one holder feed", () => {
    const changes: Array<Record<string, unknown>> = [1, 2, 3].map(
      (hospitalId) =>
        node(
          `doc:hospital:${hospitalId}`,
          "patient_summary",
          "clinical_document",
          hash(String(hospitalId + 4)),
          { extensions: { tenantReference: `hospital:${hospitalId}` } },
        ),
    );
    changes.push(
      edge(
        "edge:cross-tenant-rejected",
        "doc:hospital:1",
        "doc:hospital:2",
        "references",
      ),
    );
    const result = reduce(
      createWalletClinicalDocumentGraphState({ portalOrigin, holderDid }),
      page(undefined, "cursor-three-hospitals", changes),
    );
    expect(result.state.nodes).toHaveLength(3);
    expect(result.state.edges).toEqual([]);
    expect(result.state.quarantine).toMatchObject([
      { reason: "invalid_change" },
    ]);
    for (const hospitalId of [1, 2, 3]) {
      const projection = buildClinicalDocumentGraphPresentation({
        state: result.state,
        graphContract,
        selectedArtifactId: `doc:hospital:${hospitalId}`,
        now: new Date(now),
      });
      expect(projection.issuerHospitalId).toBe(hospitalId);
      expect(projection.nodes).toHaveLength(1);
    }
  });

  it("fails closed for another holder and unsupported contract major", () => {
    const initial = createWalletClinicalDocumentGraphState({
      portalOrigin,
      holderDid,
    });
    expect(() =>
      prepareWalletClinicalDocumentGraphSyncCommit({
        state: initial,
        graphContract,
        page: {
          ...page(undefined, "cursor-x", []),
          subjectReference: "did:key:zAnotherHolder",
        },
      }),
    ).toThrow(/holder DID/);
    expect(() =>
      prepareWalletClinicalDocumentGraphSyncCommit({
        state: initial,
        graphContract,
        page: {
          ...page(undefined, "cursor-y", []),
          compatibility: {
            ...page(undefined, "cursor-y", []).compatibility,
            minimumConsumerVersion: "2026.07.pcdg.v3",
          },
        },
      }),
    ).toThrow(/unsupported consumer version/);

    const futureSchema = node(
      "doc:future-schema-major",
      "patient_summary",
      "clinical_document",
      hash("8"),
      { schemaVersion: "3.0.0" },
    );
    const quarantined = reduce(
      initial,
      page(undefined, "cursor-future-schema", [futureSchema]),
    );
    expect(quarantined.state.quarantine).toMatchObject([
      { reason: "unsupported_major_version" },
    ]);
  });
});

const definitions: ClinicalDocumentGraphArtifactDefinition[] = [
  ...Object.entries(seedTypes).map(([artifactType, semanticClass]) =>
    definition(artifactType, semanticClass),
  ),
  definition("standard-shl-manifest", "transport_artifact", {
    envelopeLayer: "transport_manifest",
    authority: "shared",
    shlPolicy: "required",
  }),
  definition("certified-shl-manifest", "trust_artifact", {
    envelopeLayer: "trust_credential",
    authority: "portal",
    vcPolicy: "required",
    shlPolicy: "required",
    vpPolicy: "wallet_required",
  }),
  definition("holder-presentation", "presentation_artifact", {
    envelopeLayer: "holder_presentation",
    authority: "wallet",
    vcPolicy: "forbidden",
    shlPolicy: "forbidden",
    vpPolicy: "wallet_required",
  }),
];

const graphContract: ClinicalDocumentGraphContract = {
  version: "2026.07.portal-wallet.v8",
  graphContractVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
  clinicalContentOwnership: "hospital_source_or_edge",
  trustDecisionOwnership: "portal",
  holderPresentationOwnership: "wallet",
  rendererAuthority: "wallet",
  semanticClasses: [...CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES],
  edgeTypes: [...CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES],
  attestationModes: ["automatic", "maker_checker", "organization_approval"],
  trustStates: [...CLINICAL_DOCUMENT_GRAPH_TRUST_STATES],
  envelopeLayers: [
    "raw_source",
    "canonical_fact",
    "clinical_document",
    "retrieval_metadata",
    "trust_credential",
    "transport_manifest",
    "holder_presentation",
    "audit_evidence",
  ],
  creationMatrix: definitions,
  changeProtocol: {
    endpoint: "/api/wallet/v2/clinical-document-graph/changes",
    mediaType: "application/vnd.trustcare.pcdg-changes+json;version=2",
    maximumChangesPerPage: 1000,
    immutableUpdates: "supersede",
    unknownRequiredFields: "quarantine",
    additiveUnknownFieldsAllowed: true,
  },
  presentationProtocol: {
    schemaId: "urn:trustcare:schema:graph-presentation:2026.07.pcdg.v2",
    schemaEndpoint:
      "/api/public/wallet-contracts/clinical-document-graph/presentation-schema",
    projectionMode: "derived_from_authoritative_graph",
    persistenceRule: "wallet_rebuilds_from_local_graph_state",
    stageKeys: [...CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS],
    graphExplainsDocument: true,
    graphReplacesDocumentRenderer: false,
  },
  walletRules: ["unknown_required_fields_fail_closed"],
  artifactBinding: {},
};

function definition(
  artifactType: string,
  semanticClass: string,
  override: Partial<ClinicalDocumentGraphArtifactDefinition> = {},
): ClinicalDocumentGraphArtifactDefinition {
  return {
    artifactType,
    family: "clinical_summary",
    semanticClass,
    envelopeLayer:
      semanticClass === "clinical_fact"
        ? "canonical_fact"
        : "clinical_document",
    authority: "source_system",
    clinicalRisk: "high",
    legalEffect: "clinical",
    attestationMode: "automatic",
    fhirResources: ["Patient", "Provenance"],
    profileUris: [],
    produces: ["retrieval_metadata", "trust_credential"],
    vcPolicy: "required",
    shlPolicy: "allowed",
    vpPolicy: "wallet_optional",
    patientLabelTh: artifactType,
    patientLabelEn: artifactType,
    ...override,
  } as ClinicalDocumentGraphArtifactDefinition;
}

function page(
  cursor: string | undefined,
  nextCursor: string,
  changes: Array<Record<string, unknown>>,
): ClinicalDocumentGraphChangeSet {
  return {
    contractVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    changeSetId: `change-set:${nextCursor}`,
    tenantReference: "holder-authorized-multi-tenant-feed",
    subjectReference: holderDid,
    cursor: cursor ?? "cursor-initial",
    nextCursor,
    correlationId: `correlation:${nextCursor}`,
    idempotencyKey: `graph-feed:${nextCursor}`,
    occurredAt: now,
    compatibility: {
      minimumConsumerVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
      additiveUnknownFieldsAllowed: true,
      unknownRequiredFields: "quarantine",
      immutableArtifactUpdates: "supersede",
    },
    changes: changes as ClinicalDocumentGraphChangeSet["changes"],
    hasMore: false,
  };
}

function node(
  artifactId: string,
  artifactType: string,
  semanticClass: string,
  contentHash: `sha256:${string}`,
  override: {
    schemaId?: string;
    profileUris?: string[];
    mediaType?: string;
    schemaVersion?: string;
    requiredFields?: string[];
    extensions?: Record<string, unknown>;
  } = {},
) {
  return {
    changeId: `change:${artifactId}`,
    kind: "node_upsert",
    sequence: Number.parseInt(contentHash.slice(-4), 16),
    occurredAt: now,
    breaking: false,
    requiresRefetch: false,
    artifactId,
    artifactType,
    semanticClass,
    versionId: "1.0.0",
    lifecycleStatus: "current",
    object: {
      objectId: artifactId,
      mediaType: override.mediaType ?? "application/fhir+json",
      schemaId: override.schemaId ?? `urn:trustcare:schema:${artifactType}`,
      schemaVersion: override.schemaVersion ?? "1.0.0",
      profileUris: override.profileUris ?? [],
      contentHash,
      canonicalization: "RFC8785-JCS",
      location: `portal://artifact/${encodeURIComponent(artifactId)}`,
      requiredFields: override.requiredFields ?? ["issuer", "holderDid"],
      extensions: override.extensions ?? { tenantReference: "hospital:1" },
    },
  };
}

function edge(
  edgeId: string,
  sourceArtifactId: string,
  targetArtifactId: string,
  edgeType: string,
) {
  return {
    changeId: `change:${edgeId}`,
    kind: "edge_upsert",
    sequence: edgeId.length,
    occurredAt: now,
    breaking: false,
    requiresRefetch: false,
    edgeId,
    sourceArtifactId,
    targetArtifactId,
    edgeType,
  };
}

function reduce(
  state: ReturnType<typeof createWalletClinicalDocumentGraphState>,
  changeSet: ClinicalDocumentGraphChangeSet,
) {
  return prepareWalletClinicalDocumentGraphSyncCommit({
    state,
    page: changeSet,
    graphContract,
  });
}

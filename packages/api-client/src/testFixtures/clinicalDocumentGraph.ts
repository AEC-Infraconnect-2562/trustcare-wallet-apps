import {
  CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
  CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES,
  CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID,
  CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES,
  CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS,
  CLINICAL_DOCUMENT_GRAPH_TRUST_STATES,
  type ClinicalDocumentGraphContract,
  type ClinicalDocumentGraphPresentationSchema,
} from "@trustcare/contracts";

/** Test-only Contract Hub resources. Never imported by a runtime entrypoint. */
export function clinicalDocumentGraphContractFixture(
  origin: string,
): ClinicalDocumentGraphContract {
  return {
    version: "2026.07.portal-wallet.v8",
    graphContractVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    clinicalContentOwnership: "hospital_source_or_edge",
    trustDecisionOwnership: "portal",
    holderPresentationOwnership: "wallet",
    rendererAuthority: "wallet",
    semanticClasses: [...CLINICAL_DOCUMENT_GRAPH_SEMANTIC_CLASSES],
    edgeTypes: [...CLINICAL_DOCUMENT_GRAPH_EDGE_TYPES],
    attestationModes: ["automatic", "organization_approval"],
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
    creationMatrix: [
      {
        artifactType: "patient_identity",
        family: "identity",
        semanticClass: "identity_credential",
        envelopeLayer: "trust_credential",
        authority: "portal",
        clinicalRisk: "high",
        legalEffect: "administrative",
        attestationMode: "organization_approval",
        fhirResources: ["Patient", "Provenance"],
        profileUris: [],
        produces: [],
        vcPolicy: "required",
        shlPolicy: "allowed",
        vpPolicy: "wallet_optional",
        patientLabelTh: "บัตรประจำตัวผู้ป่วย",
        patientLabelEn: "Patient identity",
      },
    ],
    changeProtocol: {
      endpoint: "/api/wallet/v2/clinical-document-graph/changes",
      mediaType: "application/vnd.trustcare.pcdg-changes+json;version=2",
      maximumChangesPerPage: 1000,
      immutableUpdates: "supersede",
      unknownRequiredFields: "quarantine",
      additiveUnknownFieldsAllowed: true,
    },
    presentationProtocol: {
      schemaId: CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID,
      schemaEndpoint:
        "/api/public/wallet-contracts/clinical-document-graph/presentation-schema",
      projectionMode: "derived_from_authoritative_graph",
      persistenceRule: "wallet_rebuilds_from_local_graph_state",
      stageKeys: [...CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS],
      graphExplainsDocument: true,
      graphReplacesDocumentRenderer: false,
    },
    walletRules: ["treat_missing_or_invalid_trust_state_as_not_verified"],
    artifactBinding: {
      documentReferencePointsToClinicalContent: true,
      credentialBindsContentDigest: true,
      shlIsTransportOnly: true,
      vpIsHolderControlled: true,
    },
    testOrigin: origin,
  };
}

export function graphPresentationSchemaFixture(): ClinicalDocumentGraphPresentationSchema {
  const required = [
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
  ];
  return {
    $id: CLINICAL_DOCUMENT_GRAPH_PRESENTATION_SCHEMA_ID,
    contractVersion: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION,
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required,
      properties: {
        contractVersion: { const: CLINICAL_DOCUMENT_GRAPH_CONTRACT_VERSION },
        stages: {
          type: "array",
          minItems: 8,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              key: { enum: [...CLINICAL_DOCUMENT_GRAPH_STAGE_KEYS] },
            },
          },
        },
      },
    },
  };
}

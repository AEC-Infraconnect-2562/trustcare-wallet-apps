import {
  assessLocalReadiness,
  credentialTypeForDocument,
  readinessContextLabels,
  readinessContextValues,
  readinessRequirements,
} from "./readiness";
import type {
  CheckinQrResponse,
  ContractHubCatalog,
  ReadinessContext,
  ServiceBundleEnvelope,
  ServiceReadinessContract,
  WalletCard,
  WalletImportJob,
} from "./models";
import {
  createDemoShlKey,
  createShlLinkPayload,
  createShlViewerUrl,
} from "./shl";

const version = "2026.07.prepare-service.v1";

const presentationByContext: Record<
  ReadinessContext,
  {
    patientLabel: string;
    patientLabelEn: string;
    hospitalLabel: string;
    hospitalLabelEn: string;
    patientDirection: string;
    hospitalDirection: string;
    patientBundle: string;
    hospitalBundle: string;
    transports: string[];
  }
> = {
  opd_visit: {
    patientLabel: "เตรียมเข้ารับบริการ OPD",
    patientLabelEn: "Prepare my OPD visit",
    hospitalLabel: "OPD intake readiness",
    hospitalLabelEn: "OPD intake readiness",
    patientDirection: "patient_outbound",
    hospitalDirection: "hospital_inbound",
    patientBundle: "OPDReadinessBundle",
    hospitalBundle: "HospitalOPDIntakeBundle",
    transports: ["vp", "fhir_bundle"],
  },
  emergency: {
    patientLabel: "บัตรข้อมูลฉุกเฉิน",
    patientLabelEn: "Emergency wallet card",
    hospitalLabel: "Emergency break-glass intake",
    hospitalLabelEn: "Emergency break-glass intake",
    patientDirection: "shared",
    hospitalDirection: "hospital_inbound",
    patientBundle: "EmergencyReadinessBundle",
    hospitalBundle: "EmergencyIntakeBundle",
    transports: ["vp"],
  },
  referral: {
    patientLabel: "เตรียมเอกสารรักษาต่อ",
    patientLabelEn: "Prepare referral or continuing care",
    hospitalLabel: "Referral send/receive workbench",
    hospitalLabelEn: "Referral send/receive workbench",
    patientDirection: "patient_outbound",
    hospitalDirection: "hospital_outbound",
    patientBundle: "ReferralReadinessBundle",
    hospitalBundle: "ReferralHandoffBundle",
    transports: ["vp", "shl", "fhir_bundle"],
  },
  cross_border: {
    patientLabel: "รักษาต่อข้ามเครือข่าย/ต่างประเทศ",
    patientLabelEn: "Cross-network or overseas care",
    hospitalLabel: "Cross-network/cross-border referral",
    hospitalLabelEn: "Cross-network or cross-border referral",
    patientDirection: "patient_outbound",
    hospitalDirection: "hospital_outbound",
    patientBundle: "CrossNetworkCareBundle",
    hospitalBundle: "CrossBorderReferralBundle",
    transports: ["shl", "vp", "fhir_bundle"],
  },
  medical_tourist: {
    patientLabel: "เตรียมไปรักษาต่างประเทศ",
    patientLabelEn: "Prepare care abroad",
    hospitalLabel: "รับผู้ป่วยต่างชาติ",
    hospitalLabelEn: "Inbound international patient",
    patientDirection: "patient_outbound",
    hospitalDirection: "hospital_inbound",
    patientBundle: "OutboundInternationalCareBundle",
    hospitalBundle: "InboundMedicalTouristBundle",
    transports: ["shl", "vp", "document_reference"],
  },
  insurance_claim: {
    patientLabel: "เตรียมเอกสารเคลม/ประกัน",
    patientLabelEn: "Prepare claim or coverage packet",
    hospitalLabel: "Payer readiness and claim intake",
    hospitalLabelEn: "Payer readiness and claim intake",
    patientDirection: "shared",
    hospitalDirection: "hospital_outbound",
    patientBundle: "InsuranceClaimReadinessBundle",
    hospitalBundle: "VerifiedClaimPackageBundle",
    transports: ["vp", "fhir_bundle", "document_reference"],
  },
  pharmacy_dispense: {
    patientLabel: "รับยา/ต่อยา",
    patientLabelEn: "Medication pickup or refill",
    hospitalLabel: "Pharmacy dispense readiness",
    hospitalLabelEn: "Pharmacy dispense readiness",
    patientDirection: "patient_outbound",
    hospitalDirection: "hospital_inbound",
    patientBundle: "PharmacyDispenseReadinessBundle",
    hospitalBundle: "PharmacyDispenseBundle",
    transports: ["vp", "fhir_bundle"],
  },
};

export function buildServiceReadinessContracts(): ServiceReadinessContract[] {
  return readinessContextValues.map((context) => {
    const labels = readinessContextLabels[context];
    const presentation = presentationByContext[context];
    const requirements = readinessRequirements[context];
    return {
      contractId: `trustcare.prepare.${context}.v1`,
      context,
      version,
      status: "active",
      label: labels.th,
      labelEn: labels.en,
      patientLabel: presentation.patientLabel,
      patientLabelEn: presentation.patientLabelEn,
      hospitalLabel: presentation.hospitalLabel,
      hospitalLabelEn: presentation.hospitalLabelEn,
      patientVisible: true,
      hospitalVisible: true,
      patientDirection: presentation.patientDirection,
      hospitalDirection: presentation.hospitalDirection,
      bundleTypes: {
        patient: presentation.patientBundle,
        hospital: presentation.hospitalBundle,
      },
      recommendedTransports: presentation.transports,
      packetTrustPolicy: {
        singleDocument: { mode: "direct_vp", label: "Single-document VP" },
        bundled: { mode: "vp_bundle", label: "Purpose-bound VP bundle" },
        shl: { mode: "shl_packet", label: "SHL + Manifest VC + Holder VP" },
      },
      requirements,
      questionnaire: buildQuestionnaire(context),
      vcTypes: Array.from(
        new Set(
          requirements.flatMap((item) =>
            item.cardTypes.map(credentialTypeForDocument),
          ),
        ),
      ),
      fhirResources: Array.from(
        new Set(requirements.flatMap(fhirResourcesForRequirement)),
      ),
      consentPolicy: {
        legalBasis: [
          "explicit_consent",
          "healthcare_service_contract",
          "medical_treatment_exception_when_applicable",
        ],
        pdpaControls: [
          "purpose_limitation",
          "data_minimization",
          "consent_receipt_vc",
          "audit_event",
          "expiry_or_revocation",
        ],
        minimumNecessary:
          "Only documents required by the selected service context are requested or shared.",
        defaultExpiryMinutes: context === "emergency" ? 60 : 24 * 60,
      },
    };
  });
}

export function resolveServiceReadinessContract(
  context: ReadinessContext,
): ServiceReadinessContract {
  return (
    buildServiceReadinessContracts().find(
      (contract) => contract.context === context,
    ) ?? buildServiceReadinessContracts()[0]
  );
}

export function buildContractHubCatalog(): ContractHubCatalog {
  return {
    version,
    status: "wallet_contracts_ready_for_external_wallet",
    contracts: buildServiceReadinessContracts(),
    singleDocumentCredentialContracts: [
      {
        type: "PatientIdentityCredential",
        mode: "direct_vp",
        recommendedFor: ["opd_visit", "emergency"],
      },
      {
        type: "PrescriptionCredential",
        mode: "direct_vp",
        recommendedFor: ["pharmacy_dispense"],
      },
      {
        type: "MedicalCertificateCredential",
        mode: "direct_vp",
        recommendedFor: ["insurance_claim", "cross_border"],
      },
      {
        type: "InsuranceEligibilityCredential",
        mode: "direct_vp",
        recommendedFor: ["insurance_claim"],
      },
    ],
    artifactTypes: [
      {
        type: "SingleDocumentVpContract",
        purpose: "Rules for presenting one VC directly as a holder VP.",
        owner: "wallet_product",
      },
      {
        type: "ServiceReadinessContract",
        purpose:
          "Versioned document/data requirements per care context and audience.",
        owner: "hospital_admin",
      },
      {
        type: "FHIR Questionnaire",
        purpose: "Dynamic intake forms for patient and hospital users.",
        owner: "clinical_operations",
      },
      {
        type: "FHIR DocumentReference",
        purpose:
          "Metadata wrapper for legacy PDFs, scans, images, and external documents.",
        owner: "source_custodian",
      },
      {
        type: "OpenAPI",
        purpose:
          "Partner-facing REST contract for wallet, import, packet, and deployment APIs.",
        owner: "integration_engineer",
      },
      {
        type: "TrustPolicy",
        purpose:
          "Issuer, holder, verifier, consent, revocation, and audit requirements.",
        owner: "system_admin",
      },
      {
        type: "ShlPacketTrustLayer",
        purpose:
          "VC/VP claims and verifier checklist around SHL manifest/files.",
        owner: "trust_governance",
      },
    ],
    compatibilityRules: [
      "Single high-value documents should be shared as a direct VP unless they are part of a larger service packet.",
      "Small credential sets should use a purpose-bound VP bundle before escalating to SHL.",
      "Patient menus show patient_outbound/shared use cases only.",
      "Inbound international patient is hospital-facing; patient menu uses Prepare care abroad.",
      "Legacy documents enter as DocumentReference before optional VC issuance.",
      "SHL transports manifest/files; VC/VP remains the trust and consent layer.",
      "External wallet connections may use OID4VCI credential offers for issuance and OID4VP requests for verifier-initiated presentations.",
      "Every contract version must publish mapping rules, questionnaire, consent scope, and test payloads.",
    ],
  };
}

export function buildPrepareWorkbench(
  context: ReadinessContext,
  cards: WalletCard[],
  patientId = 6501001001,
) {
  const readiness = assessLocalReadiness(cards, context);
  const activeContract = resolveServiceReadinessContract(context);
  return {
    simulationMode: true,
    generatedAt: new Date().toISOString(),
    activeContext: context,
    patientId,
    activeContract,
    patient: {
      primaryGoal:
        "Collect minimum necessary documents and create a VP or SHL service packet.",
      readiness,
      importOptions: activeContract.requirements.map((item) => ({
        requirementKey: item.key,
        documentType: item.cardTypes[0],
        required: item.required,
        sources: [
          item.sourceHint,
          "Patient upload",
          "FHIR API",
          "VC/VP",
          "Smart Health Link",
        ],
      })),
      dynamicQuestionnaire: activeContract.questionnaire,
      packetActions: [
        "present_single_document_vp",
        "request_missing_documents",
        "import_legacy_document",
        "verify_vc_or_vp",
        "build_vp_packet",
        "build_shl_packet_for_large_bundle",
      ],
    },
    contractHub: buildContractHubCatalog(),
  };
}

export function buildServiceBundleEnvelope(input: {
  context: ReadinessContext;
  cards: WalletCard[];
  audience?: "patient" | "hospital" | "integration_engineer" | "partner";
  patientId?: number;
  receiver?: string;
}): ServiceBundleEnvelope {
  const audience = input.audience ?? "patient";
  const contract = resolveServiceReadinessContract(input.context);
  const readiness = assessLocalReadiness(input.cards, input.context);
  const bundleId = `svc_bundle_${input.context}_${Date.now().toString(36)}`;
  const missingRequired = readiness.missing.filter((item) => item.required);
  const items = contract.requirements.map((requirement) => {
    const ready = readiness.ready.find((item) => item.key === requirement.key);
    return {
      key: requirement.key,
      documentType: requirement.cardTypes[0],
      category: requirement.category,
      label: requirement.label,
      labelEn: requirement.labelEn,
      required: requirement.required,
      status: ready ? "ready" : "missing",
      matchedCardIds: ready?.matchedCards.map((card) => card.id) ?? [],
    };
  });
  const expiresAt = new Date(
    Date.now() + contract.consentPolicy.defaultExpiryMinutes * 60_000,
  ).toISOString();
  return {
    bundleId,
    contractId: contract.contractId,
    templateId: `bundle.${input.context}.${audience}.v1`,
    bundleType:
      audience === "hospital"
        ? contract.bundleTypes.hospital
        : contract.bundleTypes.patient,
    context: input.context,
    audience,
    direction:
      audience === "hospital"
        ? contract.hospitalDirection
        : contract.patientDirection,
    status: missingRequired.length ? "partial" : "ready",
    readinessScore: readiness.score,
    requiredMissing: missingRequired.map((item) => item.key),
    createdAt: new Date().toISOString(),
    expiresAt,
    receiver: input.receiver ?? "TrustCare service intake",
    items,
    trustLayer: {
      transportDecision: contract.recommendedTransports.includes("shl")
        ? { mode: "shl_packet" }
        : { mode: "vp_bundle" },
      consentCredentialType: "ConsentReceiptCredential",
      integrityHash: hashJson({ contractId: contract.contractId, items }),
    },
    fhirBundle: {
      resourceType: "Bundle",
      type: "collection",
      identifier: {
        system: "https://trustcare.network/service-bundles",
        value: bundleId,
      },
    },
    operationOutcome: {
      resourceType: "OperationOutcome",
      issue: missingRequired.map((item) => ({
        severity: "warning",
        code: "required",
        diagnostics: `Required document is missing: ${item.labelEn}`,
      })),
    },
  };
}

export function simulateImportForService(
  context: ReadinessContext,
  documentType: string,
  sourceType = "patient_upload",
): WalletImportJob {
  return {
    importId: `imp_${Date.now().toString(36)}`,
    status: "needs_review",
    context,
    sourceType,
    documentType,
    dqiScore: 88,
    hash: hashJson({ context, sourceType, documentType }),
    documentReference: {
      resourceType: "DocumentReference",
      status: "current",
      type: { text: documentType },
      context: { event: [{ coding: [{ code: context }] }] },
    },
  };
}

export function createDemoCheckinQr(
  context: ReadinessContext,
  credentialCount: number,
  policy: Partial<
    Pick<
      CheckinQrResponse,
      | "expiresAt"
      | "maxAccessCount"
      | "passcodeRequired"
      | "manifestUrl"
      | "viewerUrl"
      | "passcodeHint"
      | "accessCodeDelivery"
    >
  > = {},
): CheckinQrResponse {
  const shlId = `shl_${context}_${Date.now().toString(36)}`;
  const manifestUrl =
    policy.manifestUrl ?? `https://trustcare.example.com/shl-manifest/${shlId}`;
  const expiresAt =
    policy.expiresAt ?? new Date(Date.now() + 4 * 60 * 60_000).toISOString();
  const shlUrl = createShlLinkPayload({
    url: manifestUrl,
    key: createDemoShlKey(shlId),
    expiresAt,
    label: `TrustCare ${context} check-in`,
    flag: "L",
    passcodeRequired: policy.passcodeRequired ?? false,
    version: 1,
  });
  const webViewerUrl = createShlViewerUrl(
    policy.viewerUrl ?? "https://trustcare.example.com/shl-viewer",
    shlUrl,
  );
  return {
    checkId: `chk_${Date.now().toString(36)}`,
    shlId,
    shlUrl,
    qrPayload: webViewerUrl,
    manifestUrl,
    viewerUrl: webViewerUrl,
    canonicalShlUrl: shlUrl,
    webViewerUrl,
    expiresAt,
    maxAccessCount: policy.maxAccessCount ?? 3,
    passcodeRequired: policy.passcodeRequired ?? false,
    passcodeHint: policy.passcodeHint ?? null,
    accessCodeDelivery:
      policy.accessCodeDelivery ??
      ((policy.passcodeRequired ?? false)
        ? "separate_channel"
        : "not_required"),
    readinessScore: 100,
    credentialCount,
    status: "ready",
  };
}

function buildQuestionnaire(context: ReadinessContext) {
  return {
    resourceType: "Questionnaire",
    id: `questionnaire-${context}-v1`,
    version,
    status: "active",
    title: `${presentationByContext[context].patientLabelEn} intake`,
    subjectType: ["Patient"],
    item: [
      {
        linkId: "service-context",
        text: "Service context",
        type: "choice",
        required: true,
      },
      ...readinessRequirements[context].map((item) => ({
        linkId: item.key,
        text: `Confirm or attach ${item.labelEn}`,
        type: "boolean",
        required: item.required,
      })),
      {
        linkId: "consent",
        text: "I consent to use selected documents for this service context only.",
        type: "boolean",
        required: true,
      },
    ],
  };
}

function fhirResourcesForRequirement(requirement: { cardTypes: string[] }) {
  const type = requirement.cardTypes[0] ?? "";
  if (type.includes("identity") || type.includes("travel"))
    return ["Patient", "RelatedPerson"];
  if (type.includes("allergy")) return ["AllergyIntolerance"];
  if (
    type.includes("medication") ||
    type.includes("prescription") ||
    type.includes("dispense")
  )
    return ["MedicationRequest", "MedicationStatement", "MedicationDispense"];
  if (type.includes("lab") || type.includes("diagnostic"))
    return ["DiagnosticReport", "Observation", "DocumentReference"];
  if (
    type.includes("coverage") ||
    type.includes("claim") ||
    type.includes("receipt")
  )
    return ["Coverage", "Claim", "ClaimResponse", "Invoice"];
  if (type.includes("referral")) return ["ServiceRequest", "DocumentReference"];
  return ["DocumentReference"];
}

function hashJson(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

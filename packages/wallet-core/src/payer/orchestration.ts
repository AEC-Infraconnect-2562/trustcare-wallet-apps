import type { CanonicalDocumentType } from "../canonicalDocuments";
import type { WalletCard } from "../models";
import type { PayerAdapter } from "./adapters/base";
import { buildClaimEvidencePackage } from "./claimPackage";
import type {
  ClaimEvidencePackage,
  ClaimStatus,
  ClaimSubmissionReceipt,
  EligibilityDecision,
  GuaranteeLetterDecision,
  PayerProfile,
  PreAuthDecision,
} from "./types";

export type PayerLifecycleContext =
  "insurance_claim" | "cross_border" | "medical_tourist";

export type PayerLifecycleStepKey =
  "eligibility" | "preauth" | "guarantee" | "package" | "submission" | "status";

export type PayerLifecycleStep = {
  key: PayerLifecycleStepKey;
  status: string;
  reference?: string;
  detail: string;
};

export type PayerLifecycleInput = {
  patientId: string | number;
  ownerUserId: string;
  holderDid: string;
  context: PayerLifecycleContext;
  cards: WalletCard[];
  selectedCardIds: Array<number | string>;
  consentReceiptId: string;
  createdAt?: string;
  expiresAt?: string;
  serviceCode?: string;
  requestedAmount?: number;
  currency?: string;
};

export type PayerLifecycleResult = {
  demo: true;
  profile: PayerProfile;
  context: PayerLifecycleContext;
  consentReceiptId: string;
  eligibility: EligibilityDecision;
  preAuth?: PreAuthDecision;
  guarantee?: GuaranteeLetterDecision;
  evidencePackage: ClaimEvidencePackage;
  submissionReceipt: ClaimSubmissionReceipt;
  claimStatus: ClaimStatus;
  artifactCards: WalletCard[];
  shareCardIds: number[];
  steps: PayerLifecycleStep[];
  warnings: string[];
};

const demoCreatedAt = "2026-07-10T08:00:00.000Z";

export async function executePayerLifecycle(
  adapter: PayerAdapter,
  input: PayerLifecycleInput,
): Promise<PayerLifecycleResult> {
  const consentReceiptId = input.consentReceiptId.trim();
  if (!consentReceiptId) {
    throw new Error("Payer lifecycle requires an explicit consent receipt ID.");
  }
  if (!adapter.profile.demo || adapter.profile.adapterKind !== "mock_demo") {
    throw new Error(
      "The local payer lifecycle runner accepts deterministic demo adapters only.",
    );
  }
  if (!adapter.profile.supportedContexts.includes(input.context)) {
    throw new Error(
      `Payer ${adapter.profile.payerId} does not support ${input.context}.`,
    );
  }

  const selectedCards = selectOwnedCards(input);
  if (!selectedCards.length) {
    throw new Error(
      "Select at least one owned wallet document for the payer package.",
    );
  }

  const createdAt = input.createdAt ?? demoCreatedAt;
  const expiresAt =
    input.expiresAt ??
    addDays(createdAt, input.context === "insurance_claim" ? 7 : 3);
  const serviceCode =
    input.serviceCode ?? defaultServiceCodeForContext(input.context);
  const currency = input.currency ?? "THB";
  const requestedAmount = input.requestedAmount ?? 30_000;
  const steps: PayerLifecycleStep[] = [];

  const eligibility = await adapter.verifyEligibility({
    payerId: adapter.profile.payerId,
    patientId: input.patientId,
    holderDid: input.holderDid,
    context: input.context,
    serviceCode,
    consentReceiptId,
    requestedAt: createdAt,
  });
  steps.push({
    key: "eligibility",
    status: eligibility.status,
    reference: eligibility.eligibilityCheckId,
    detail: "Eligibility result returned by the configured demo payer adapter.",
  });

  const eligibilityCard = payerArtifactCard({
    artifact: "eligibility",
    cardType: "insurance_eligibility",
    credentialType: "EligibilityResultCredential",
    displayName: "ผลตรวจสิทธิจาก Payer (Demo)",
    displayNameEn: "Payer eligibility result (Demo)",
    subject: eligibility,
    input,
    profile: adapter.profile,
    createdAt,
    expiresAt: eligibility.validUntil ?? expiresAt,
  });

  let preAuth: PreAuthDecision | undefined;
  let preAuthCard: WalletCard | undefined;
  let guarantee: GuaranteeLetterDecision | undefined;
  let guaranteeCard: WalletCard | undefined;

  if (input.context === "medical_tourist") {
    const quotation = selectedCards.find(
      (card) => card.cardType === "quotation",
    );
    if (!quotation) {
      throw new Error(
        "Medical tourist guarantee flow requires a selected quotation credential.",
      );
    }
    const guaranteeCaseId = `guarantee_${stableSuffix({
      payerId: adapter.profile.payerId,
      patientId: input.patientId,
      quotationCredentialId: quotation.credentialId,
      consentReceiptId,
    })}`;
    guarantee = await adapter.requestGuaranteeLetter({
      guaranteeCaseId,
      payerId: adapter.profile.payerId,
      patientId: input.patientId,
      context: input.context,
      quotationCredentialId: String(quotation.credentialId),
      estimatedAmount: requestedAmount,
      currency,
      consentReceiptId,
    });
    steps.push({
      key: "guarantee",
      status: guarantee.status,
      reference: guarantee.guaranteeNumber ?? guarantee.guaranteeCaseId,
      detail: "Guarantee decision returned by the international demo adapter.",
    });
    guaranteeCard = payerArtifactCard({
      artifact: "guarantee",
      cardType: "guarantee_letter",
      credentialType: "PayerGuaranteeLetterCredential",
      displayName: "หนังสือรับรองค่าใช้จ่ายจาก Payer (Demo)",
      displayNameEn: "Payer guarantee letter (Demo)",
      subject: guarantee,
      input,
      profile: adapter.profile,
      createdAt,
      expiresAt: guarantee.validUntil ?? expiresAt,
    });
  } else if (eligibility.requiresPreAuth) {
    preAuth = await adapter.requestPreAuth({
      eligibilityCheckId: eligibility.eligibilityCheckId,
      payerId: adapter.profile.payerId,
      patientId: input.patientId,
      context: input.context,
      serviceCode,
      requestedAmount,
      currency,
      consentReceiptId,
      requestedAt: createdAt,
    });
    steps.push({
      key: "preauth",
      status: preAuth.status,
      reference: preAuth.authorizationNumber ?? preAuth.preAuthCaseId,
      detail: "Pre-authorization result returned by the demo payer adapter.",
    });
    preAuthCard = payerArtifactCard({
      artifact: "preauth",
      cardType: "claim_receipt",
      credentialType: "PreAuthDecisionCredential",
      displayName: "ผล Pre-authorization จาก Payer (Demo)",
      displayNameEn: "Payer pre-authorization decision (Demo)",
      subject: { ...preAuth, payerId: adapter.profile.payerId },
      input,
      profile: adapter.profile,
      createdAt,
      expiresAt: preAuth.validUntil ?? expiresAt,
    });
  }

  const packageCards = packageCardsForContext({
    context: input.context,
    selectedCards,
    eligibilityCard,
    preAuthCard,
    guaranteeCard,
  });
  const evidencePackage = buildClaimEvidencePackage({
    payerId: adapter.profile.payerId,
    patientId: String(input.patientId),
    context: input.context,
    cards: packageCards,
    selectedCardIds: packageCards.map((card) => card.id),
    consentReceiptId,
    createdAt,
    expiresAt,
    createdBy: input.holderDid,
  });
  steps.push({
    key: "package",
    status: "ready",
    reference: evidencePackage.evidencePackageId,
    detail: `${evidencePackage.documentIds.length} canonical wallet documents selected.`,
  });

  const claimCaseId = `claim_${stableSuffix({
    evidencePackageId: evidencePackage.evidencePackageId,
    patientId: input.patientId,
    payerId: adapter.profile.payerId,
    consentReceiptId,
  })}`;
  const submissionReceipt = await adapter.submitClaimPackage({
    claimCaseId,
    payerId: adapter.profile.payerId,
    patientId: input.patientId,
    context: input.context,
    claimType: claimTypeForContext(input.context),
    evidencePackageId: evidencePackage.evidencePackageId,
    credentialIds: evidencePackage.documentIds,
    consentReceiptId,
    totalAmount: requestedAmount,
    currency,
    submittedAt: createdAt,
  });
  steps.push({
    key: "submission",
    status: submissionReceipt.status,
    reference:
      submissionReceipt.externalSubmissionId ?? submissionReceipt.claimCaseId,
    detail: "Submission receipt returned by the demo payer transport.",
  });

  const claimStatus = await adapter.getClaimStatus({
    claimCaseId,
    payerId: adapter.profile.payerId,
    externalSubmissionId: submissionReceipt.externalSubmissionId,
  });
  steps.push({
    key: "status",
    status: claimStatus.status,
    reference: claimStatus.payerStatusCode ?? claimStatus.claimCaseId,
    detail: "Claim status fetched after the submission receipt was created.",
  });

  const claimPackageCard = payerArtifactCard({
    artifact: "claim_package",
    cardType: "claim_package",
    credentialType: "ClaimPackageCredential",
    displayName: "ชุดหลักฐานเคลมจาก Payer Orchestration (Demo)",
    displayNameEn: "Payer claim evidence package (Demo)",
    subject: {
      evidencePackageId: evidencePackage.evidencePackageId,
      payerId: adapter.profile.payerId,
      context: input.context,
      documentIds: evidencePackage.documentIds,
      documentTypes: evidencePackage.documentTypes,
      recommendedPackageMode: evidencePackage.recommendedPackageMode,
      consentReceiptId,
      status: "submitted",
    },
    input,
    profile: adapter.profile,
    createdAt,
    expiresAt,
  });
  const submissionReceiptCard = payerArtifactCard({
    artifact: "submission_receipt",
    cardType: "claim_receipt",
    credentialType: "ClaimSubmissionReceiptCredential",
    displayName: "หลักฐานรับชุดเคลมจาก Payer (Demo)",
    displayNameEn: "Payer claim submission receipt (Demo)",
    subject: submissionReceipt,
    input,
    profile: adapter.profile,
    createdAt,
    expiresAt: addDays(createdAt, 30),
  });
  const claimStatusCard = payerArtifactCard({
    artifact: "claim_status",
    cardType: "claim_receipt",
    credentialType: "ClaimStatusCredential",
    displayName: "สถานะเคลมจาก Payer (Demo)",
    displayNameEn: "Payer claim status (Demo)",
    subject: { ...claimStatus, payerId: adapter.profile.payerId },
    input,
    profile: adapter.profile,
    createdAt,
    expiresAt: addDays(createdAt, 30),
  });
  const artifactCards = [
    eligibilityCard,
    ...(preAuthCard ? [preAuthCard] : []),
    ...(guaranteeCard ? [guaranteeCard] : []),
    claimPackageCard,
    submissionReceiptCard,
    claimStatusCard,
  ];

  return {
    demo: true,
    profile: adapter.profile,
    context: input.context,
    consentReceiptId,
    eligibility,
    ...(preAuth ? { preAuth } : {}),
    ...(guarantee ? { guarantee } : {}),
    evidencePackage,
    submissionReceipt,
    claimStatus,
    artifactCards,
    shareCardIds: evidencePackage.cards.map((card) => card.id),
    steps,
    warnings: unique([
      "Deterministic demo payer output only. No real payer endpoint was called.",
      ...(eligibility.warnings ?? []),
      ...(preAuth?.warnings ?? []),
      ...(submissionReceipt.warnings ?? []),
    ]),
  };
}

export function mergePayerArtifactCards(
  currentCards: WalletCard[],
  incomingCards: WalletCard[],
): WalletCard[] {
  const incomingIds = new Set(
    incomingCards.map((card) => String(card.credentialId)),
  );
  const incomingLineages = new Set(incomingCards.map(payerArtifactLineage));
  const current = currentCards
    .filter((card) => !incomingIds.has(String(card.credentialId)))
    .map((card) =>
      card.sourceSystem === "payer_adapter" &&
      incomingLineages.has(payerArtifactLineage(card)) &&
      card.credentialStatus === "active"
        ? { ...card, credentialStatus: "superseded" }
        : card,
    );
  return [...current, ...incomingCards];
}

function selectOwnedCards(input: PayerLifecycleInput): WalletCard[] {
  const selected = new Set(input.selectedCardIds.map(String));
  const cards = input.cards.filter((card) => selected.has(String(card.id)));
  const ownerMismatch = cards.find(
    (card) => card.ownerUserId && card.ownerUserId !== input.ownerUserId,
  );
  if (ownerMismatch) {
    throw new Error(
      "Payer package selection contains another wallet user's card.",
    );
  }
  return uniqueCards(cards);
}

function packageCardsForContext(input: {
  context: PayerLifecycleContext;
  selectedCards: WalletCard[];
  eligibilityCard: WalletCard;
  preAuthCard?: WalletCard;
  guaranteeCard?: WalletCard;
}): WalletCard[] {
  const generatedTypes = new Set<string>();
  const additions: WalletCard[] = [];
  if (input.context === "insurance_claim") {
    generatedTypes.add("insurance_eligibility");
    additions.push(input.eligibilityCard);
  }
  if (input.context === "cross_border" && input.preAuthCard) {
    additions.push(input.preAuthCard);
  }
  if (input.context === "medical_tourist" && input.guaranteeCard) {
    generatedTypes.add("guarantee_letter");
    additions.push(input.guaranteeCard);
  }
  const retained = input.selectedCards.filter(
    (card) =>
      card.sourceSystem !== "payer_adapter" &&
      !generatedTypes.has(card.cardType),
  );
  return uniqueCards([...retained, ...additions]);
}

function payerArtifactCard(input: {
  artifact: string;
  cardType: CanonicalDocumentType;
  credentialType: string;
  displayName: string;
  displayNameEn: string;
  subject: Record<string, unknown>;
  input: PayerLifecycleInput;
  profile: PayerProfile;
  createdAt: string;
  expiresAt: string;
}): WalletCard {
  const issuerDid = input.profile.trustedIssuerDid;
  if (!issuerDid) {
    throw new Error(
      `Demo payer ${input.profile.payerId} has no trusted issuer DID.`,
    );
  }
  const digest = stableSuffix({
    artifact: input.artifact,
    payerId: input.profile.payerId,
    patientId: input.input.patientId,
    holderDid: input.input.holderDid,
    context: input.input.context,
    consentReceiptId: input.input.consentReceiptId,
    subject: input.subject,
    expiresAt: input.expiresAt,
  });
  const credentialId = `urn:trustcare:payer-demo:${input.artifact}:${digest}`;
  const documentReference = {
    resourceType: "DocumentReference",
    id: `payer-${input.artifact}-${digest}`,
    status: "current",
    docStatus: "final",
    type: {
      text: input.displayNameEn,
      coding: [
        {
          system: "https://trustcare.network/fhir/CodeSystem/document-type",
          code: input.cardType,
        },
      ],
    },
    subject: { identifier: { value: String(input.input.patientId) } },
    date: input.createdAt,
  };
  const credentialData = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare.network/contexts/payer/v1",
    ],
    id: credentialId,
    type: ["VerifiableCredential", input.credentialType],
    issuer: {
      id: issuerDid,
      name: input.profile.payerNameEn ?? input.profile.payerName,
    },
    validFrom: input.createdAt,
    validUntil: input.expiresAt,
    credentialSubject: {
      id: input.input.holderDid,
      patientId: input.input.patientId,
      payerId: input.profile.payerId,
      context: input.input.context,
      consentReceiptId: input.input.consentReceiptId,
      ...input.subject,
      documentReference,
    },
    credentialStatus: {
      id: `${credentialId}#status`,
      type: "TrustCareDemoPayerStatus",
      status: "active",
    },
    evidence: [
      {
        type: "PayerAdapterResultEvidence",
        adapterKind: input.profile.adapterKind,
        demo: true,
        payerId: input.profile.payerId,
      },
    ],
    trustcare: {
      schemaVersion: "2026.07.payer-demo.v1",
      documentType: input.cardType,
      sourceAuthority: "payer_adapter",
      payerId: input.profile.payerId,
      context: input.input.context,
      consentReceiptId: input.input.consentReceiptId,
      payloadDigest: digest,
      demo: true,
    },
  };
  return {
    id: stableNumericId(credentialId),
    cardType: input.cardType,
    displayName: input.displayName,
    displayNameEn: input.displayNameEn,
    documentCategory:
      input.cardType === "guarantee_letter"
        ? "medical_tourism"
        : "claims_and_finance",
    credentialId,
    credentialStatus: "pending",
    credentialData,
    credentialType: input.credentialType,
    issuerHospitalName: input.profile.payerName,
    issuerDid,
    holderDid: input.input.holderDid,
    ownerUserId: input.input.ownerUserId,
    patientId: input.input.patientId,
    sourceSystem: "payer_adapter",
    scopeLabel: "Deterministic demo payer adapter output",
    issuedAt: input.createdAt,
    expiresAt: input.expiresAt,
    createdAt: input.createdAt,
    pinned: false,
  };
}

function payerArtifactLineage(card: WalletCard): string {
  const trustcare = recordValue(card.credentialData?.trustcare);
  return [
    card.ownerUserId ?? "",
    card.credentialType ?? card.cardType,
    stringValue(trustcare?.context),
    stringValue(trustcare?.payerId),
  ].join("|");
}

function defaultServiceCodeForContext(context: PayerLifecycleContext): string {
  if (context === "cross_border") return "CROSS-BORDER-PREAUTH";
  if (context === "medical_tourist") return "MEDICAL-TOURIST-GUARANTEE";
  return "OPD-CLAIM-DEMO";
}

function claimTypeForContext(context: PayerLifecycleContext) {
  if (context === "cross_border") return "cross_border_care" as const;
  if (context === "medical_tourist")
    return "medical_tourist_guarantee" as const;
  return "private_insurance" as const;
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid payer lifecycle timestamp: ${value}`);
  }
  return new Date(date.getTime() + days * 24 * 60 * 60_000).toISOString();
}

function uniqueCards(cards: WalletCard[]): WalletCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = String(card.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stableNumericId(value: string): number {
  return 1_500_000_000 + (stableHash(value) % 500_000_000);
}

function stableSuffix(value: unknown): string {
  return stableHash(JSON.stringify(value)).toString(36).padStart(7, "0");
}

function stableHash(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

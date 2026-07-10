import type {
  CanonicalDocumentType,
  SharePackageMode,
} from "../canonicalDocuments";
import type { ReadinessContext, WalletCard } from "../models";

export type PayerCaseStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "accepted"
  | "pending_payer"
  | "need_more_evidence"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "closed";

export type PayerTransport =
  | "payer_fhir_rest"
  | "payer_rest_json"
  | "payer_soap_xml"
  | "payer_sftp_batch"
  | "payer_manual_portal"
  | "payer_email_secure_pdf"
  | "payer_rpa_portal_controlled"
  | "nhso_eclaim_portal"
  | "mock_demo";

export type PayerAdapterKind = PayerTransport;

export type PayerProfile = {
  payerId: string;
  payerName: string;
  payerNameEn?: string;
  payerType:
    | "public"
    | "private_insurer"
    | "international_tpa"
    | "self_pay"
    | "employer"
    | "facilitator";
  adapterKind: PayerAdapterKind;
  supportedContexts: ReadinessContext[];
  supportedTransports: PayerTransport[];
  endpointConfigured: boolean;
  demo: boolean;
  trustedIssuerDid?: string;
  notes?: string[];
};

export type CoverageDiscoveryInput = {
  patientId?: string | number;
  holderDid?: string;
  nationalIdHash?: string;
  passportNumberHash?: string;
  payerId?: string;
  policyNumber?: string;
  memberNumber?: string;
  insuranceCardImageId?: string;
  consentReceiptId: string;
};

export type CoverageDiscoveryResult = {
  candidates: PayerCoverageCandidate[];
  warnings?: string[];
};

export type PayerCoverageCandidate = {
  payerId: string;
  payerName: string;
  policyNumberMasked?: string;
  memberNumberMasked?: string;
  planName?: string;
  status: "found" | "not_found" | "requires_auth" | "requires_manual_review";
  confidence: "low" | "medium" | "high";
  validFrom?: string;
  validUntil?: string;
};

export type EligibilityRequest = {
  patientId: string | number;
  holderDid?: string;
  payerId: string;
  context:
    | "opd_visit"
    | "emergency"
    | "referral"
    | "cross_border"
    | "medical_tourist"
    | "insurance_claim";
  serviceCode?: string;
  diagnosisCodes?: string[];
  hospitalId?: string | number;
  branchId?: string | number;
  consentReceiptId: string;
  requestedAt: string;
};

export type EligibilityDecision = {
  eligibilityCheckId: string;
  payerId: string;
  status:
    "eligible" | "not_eligible" | "pending" | "requires_preauth" | "unknown";
  benefitSummary?: string;
  requiresPreAuth?: boolean;
  guaranteeLetterAvailable?: boolean;
  validUntil?: string;
  sourceResponseRef?: string;
  credentialId?: string;
  warnings?: string[];
};

export type PreAuthRequest = {
  preAuthCaseId?: string;
  eligibilityCheckId?: string;
  payerId: string;
  patientId: string | number;
  context?: ReadinessContext;
  serviceCode?: string;
  encounterId?: string;
  diagnosisCodes?: string[];
  procedureCodes?: string[];
  estimatedAmount?: number;
  requestedAmount?: number;
  currency?: string;
  evidencePackageId?: string;
  shlPackageId?: string;
  consentReceiptId: string;
  requestedAt?: string;
};

export type PreAuthDecision = {
  preAuthCaseId: string;
  status:
    "approved" | "rejected" | "pending" | "need_more_evidence" | "expired";
  authorizationNumber?: string;
  approvedAmount?: number;
  currency?: string;
  validUntil?: string;
  conditions?: string[];
  additionalEvidenceRequested?: string[];
  payerDecisionRef?: string;
  credentialId?: string;
  warnings?: string[];
};

export type ClaimSubmission = {
  claimCaseId: string;
  payerId: string;
  patientId: string | number;
  context: "insurance_claim" | "cross_border" | "medical_tourist";
  encounterId?: string;
  invoiceId?: string;
  claimType:
    | "cashless"
    | "reimbursement"
    | "private_insurance"
    | "public_eclaim"
    | "cross_border_care"
    | "medical_tourist_guarantee";
  evidencePackageId: string;
  shlPackageId?: string;
  credentialIds?: string[];
  consentReceiptId: string;
  totalAmount?: number;
  currency?: string;
  submittedAt?: string;
};

export type ClaimSubmissionReceipt = {
  claimCaseId: string;
  externalSubmissionId?: string;
  payerId: string;
  submittedAt: string;
  channel: PayerTransport;
  status: "submitted" | "accepted" | "rejected" | "manual_followup_required";
  manualFollowUpRequired?: boolean;
  receiptCredentialId?: string;
  warnings?: string[];
};

export type ClaimStatusRequest = {
  claimCaseId: string;
  payerId: string;
  externalSubmissionId?: string;
};

export type ClaimStatus = {
  claimCaseId: string;
  status: PayerCaseStatus;
  payerStatusCode?: string;
  payerStatusText?: string;
  updatedAt: string;
  needMoreEvidence?: AdditionalEvidenceRequest[];
  adjudicationSummaryRef?: string;
  credentialId?: string;
};

export type AdditionalEvidenceRequest = {
  requestId: string;
  requestedByPayerId: string;
  requiredDocumentTypes: string[];
  reason: string;
  dueAt?: string;
};

export type AdditionalEvidenceSubmission = {
  claimCaseId: string;
  requestId: string;
  evidenceDocumentIds: string[];
  shlPackageId?: string;
  consentReceiptId: string;
};

export type AdditionalEvidenceReceipt = {
  claimCaseId: string;
  requestId: string;
  submittedAt: string;
  status: "submitted" | "accepted" | "rejected";
};

export type GuaranteeLetterRequest = {
  guaranteeCaseId: string;
  payerId: string;
  patientId: string | number;
  context: "medical_tourist" | "insurance_claim" | "cross_border";
  quotationCredentialId?: string;
  estimatedAmount?: number;
  currency?: string;
  evidencePackageId?: string;
  consentReceiptId: string;
};

export type GuaranteeLetterDecision = {
  guaranteeCaseId: string;
  status: "approved" | "rejected" | "pending" | "need_more_evidence";
  guaranteeNumber?: string;
  approvedAmount?: number;
  currency?: string;
  validUntil?: string;
  guaranteeLetterCredentialId?: string;
};

export type PaymentReconciliationRequest = {
  claimCaseId: string;
  payerId: string;
  externalSubmissionId?: string;
  paymentReference?: string;
};

export type PaymentReconciliationResult = {
  claimCaseId: string;
  payerId: string;
  status: "matched" | "unmatched" | "pending" | "manual_review";
  reconciledAt: string;
  amount?: number;
  currency?: string;
  warnings?: string[];
};

export type PayerDisclosureConsent = {
  consentReceiptId: string;
  holderDid: string;
  patientId: string | number;
  payerId: string;
  purpose:
    | "eligibility"
    | "preauth"
    | "claim_submission"
    | "guarantee_letter"
    | "cross_border_care"
    | "medical_tourism";
  selectedDocumentIds: string[];
  allowedDataClasses: string[];
  expiresAt: string;
  maxAccessCount?: number;
  revocable: boolean;
};

export type ClaimEvidencePackage = {
  evidencePackageId: string;
  patientId: string | number;
  payerId: string;
  context: "insurance_claim" | "cross_border" | "medical_tourist";
  documentIds: string[];
  documentTypes: CanonicalDocumentType[];
  cards: WalletCard[];
  documentReferences?: Array<Record<string, unknown>>;
  recommendedPackageMode: SharePackageMode;
  consentReceiptId: string;
  createdAt: string;
  expiresAt?: string;
  createdBy?: string;
  warnings?: string[];
};

export type MedicalTouristCase = {
  caseId: string;
  patientId: string | number;
  payerId?: string;
  destinationCountry?: string;
  facilitatorName?: string;
  status:
    | "intake"
    | "documents_ready"
    | "quotation_ready"
    | "guarantee_pending"
    | "guarantee_approved"
    | "arrival_ready";
  requiredDocumentTypes: string[];
  readyDocumentTypes: string[];
  missingDocumentTypes: string[];
  quotationCredentialId?: string;
  guaranteeLetterCredentialId?: string;
  visaSupportCredentialId?: string;
  updatedAt: string;
};

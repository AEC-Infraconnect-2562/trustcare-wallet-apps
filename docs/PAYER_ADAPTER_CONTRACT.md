# Payer Adapter Contract

Payer integration in TrustCare is a pluggable adapter contract. Each adapter maps TrustCare payer orchestration requests into the payer channel it controls, then maps the payer response back into typed wallet objects. The adapter owns transport details. The payer owns decisions.

## Adapter Types

Supported adapter kinds are intentionally transport-neutral:

- `payer_fhir_rest`
- `payer_rest_json`
- `payer_soap_xml`
- `payer_sftp_batch`
- `payer_manual_portal`
- `payer_email_secure_pdf`
- `payer_rpa_portal_controlled`
- `nhso_eclaim_portal`
- `mock_demo`

Production connectors must be configured outside app source. Demo connectors may be deterministic and local.

## Required Interface

```ts
export type PayerAdapter = {
  profile: PayerProfile;
  discoverCoverage(input: CoverageDiscoveryInput): Promise<CoverageDiscoveryResult>;
  verifyEligibility(input: EligibilityRequest): Promise<EligibilityDecision>;
  requestPreAuth(input: PreAuthRequest): Promise<PreAuthDecision>;
  submitClaimPackage(input: ClaimSubmission): Promise<ClaimSubmissionReceipt>;
  getClaimStatus(input: ClaimStatusRequest): Promise<ClaimStatus>;
  requestGuaranteeLetter(input: GuaranteeLetterRequest): Promise<GuaranteeLetterDecision>;
  submitAdditionalEvidence?(input: AdditionalEvidenceSubmission): Promise<AdditionalEvidenceReceipt>;
  reconcilePayment?(input: PaymentReconciliationRequest): Promise<PaymentReconciliationResult>;
};
```

## Mapping Rules

- `EligibilityRequest` maps to FHIR `CoverageEligibilityRequest` where the payer supports FHIR.
- `EligibilityDecision` maps from FHIR `CoverageEligibilityResponse` or equivalent partner response.
- `PreAuthRequest` maps to FHIR `Claim.use = preauthorization`.
- `ClaimSubmission` maps to FHIR `Claim.use = claim` or a payer-specific batch/manual submission.
- `ClaimStatus` maps from FHIR `ClaimResponse`, payer status API, manual portal status, or batch acknowledgement.
- Patient-facing summaries may be represented as `ExplanationOfBenefit`-like data, but TrustCare must not generate payer adjudication itself.

## Adapter Result Rules

- Every response must preserve `payerId`, external reference IDs when present, timestamps, channel, warnings, and whether manual follow-up is required.
- Demo adapters must return stable IDs so tests and UX can be deterministic.
- Unknown or unsupported payer responses should map to `pending`, `unknown`, or `manual_followup_required`; never silently convert uncertainty to approval.
- Additional evidence requests must list canonical wallet document types, not UI-only labels.

## Security Rules

- Adapter credentials and payer tokens must not be stored in browser localStorage.
- All payer submissions require an explicit consent receipt ID.
- SHL package passcodes must be delivered separately from QR/resolver payloads.
- Access logs, provenance, and holder binding should be produced by the backend when production adapters are used.


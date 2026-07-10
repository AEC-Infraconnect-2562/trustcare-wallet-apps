# Claim Not Engine Policy

TrustCare Wallet and CarePass payer support must remain an evidence orchestration layer. The system helps the patient, hospital, payer, and verifier exchange verifiable documents and package evidence. It must not become a claim adjudication engine.

## Non-Negotiable Boundary

- The payer remains the source of claim, eligibility, pre-authorization, guarantee, payment, and rejection decisions.
- TrustCare may normalize, package, sign, verify, route, and display evidence, but it must not calculate proprietary benefits or approve payment on behalf of a payer.
- Demo flows may return deterministic mock decisions only through mock payer adapters. Mock decisions must be visibly identified as demo adapter output.
- Production integrations must use configured payer adapters and partner contracts. Do not hard-code NHSO, ThaiD, insurer, or TPA endpoints without an official integration contract.
- Wallet records should store the minimum patient-held credential, receipt, status, and consent evidence needed for portability and verification.

## Allowed Responsibilities

- Discover possible coverage records from patient-provided or partner-provided inputs.
- Create eligibility, pre-auth, guarantee, claim package, and claim status requests against a configured payer adapter.
- Build VC/VP, SHL, Certified SHL Manifest Package, FHIR DocumentReference, FHIR Bundle, IPS, and MHD evidence packages.
- Store payer responses as credentials, receipts, or status documents when appropriate.
- Preserve consent receipts, audit evidence, provenance, expiry, and holder binding.
- Show payer responses in simple readiness and sharing UX.

## Forbidden Responsibilities

- Adjudicating claims inside TrustCare.
- Replacing NHSO e-Claim or insurer portals.
- Scraping or automating payer portals unless a production contract explicitly permits controlled automation.
- Guessing real payer API contracts from public web clients.
- Treating patient-uploaded or unsigned material as payer-approved evidence.

## Product Guardrail

This feature exists to reduce hospital friction and improve patient-held portability. It should make payer workflows more verifiable and easier to package, not expand TrustCare into a generic claims platform.


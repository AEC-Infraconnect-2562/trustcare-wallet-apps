# TrustCare Wallet Shared A4 Renderer — Design QA

Date: 2026-07-10

## Source references

- `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-784c2c17-bf39-4019-849d-949d948f6446.png`
- `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-be416a81-0e12-4755-bfa3-d01be2e91c76.png`
- `C:\Users\DELL\AppData\Local\Temp\codex-clipboard-e977a372-1eb7-4d85-8731-9a61f08ebf5c.png`
- The remaining six screenshots supplied in the same request were reviewed for wallet navigation, identity documents, tables, signatures, status treatment, and modal proportions.

## Implementation captures

- Desktop prescription: `C:\Users\DELL\AppData\Local\Temp\trustcare-prescription-a4-desktop.png`
- Desktop payer eligibility: `C:\Users\DELL\AppData\Local\Temp\trustcare-payer-a4-desktop.png`
- Mobile payer eligibility (final): `C:\Users\DELL\AppData\Local\Temp\trustcare-payer-a4-mobile-final.png`

The desktop payer capture and the quotation reference were inspected together in one comparison input. The implementation keeps the useful hospital-document hierarchy while removing the reference defects: horizontal document scrolling, nested vertical scrolling, oversized modal chrome, issuer/payer ambiguity, and lifecycle-as-verification styling.

## Browser QA

- Browser: Codex in-app Browser
- Desktop viewport: 1440 × 1000
- Mobile viewports: 390 × 844 and 320 × 700
- Complete fixture: `demo-patient-complete-001`
- Records V2 opened the Shared Renderer for all 24 canonical credential types.
- All 24 documents had a source-backed title and issuer, no page/dialog/body horizontal overflow, exactly one modal vertical scroll owner, and no false verified claim.
- Identity and travel documents showed the exact subject photo; non-photo credential types showed no person fallback.
- Every table document used semantic `table` and `thead` markup.
- Payer eligibility and guarantee documents used payer letterhead; claim package, claim receipt, and quotation retained provider issuer provenance.
- At 320 px, patient identity, prescription, and quotation had zero page/dialog/body horizontal overflow; identity retained one correct photo and table documents retained semantic tables.
- Wallet previews remained neutral/pending because the demo fixtures have no issuer proof. Green verification wording is gated by successful proof/signature, issuer, status, expiry, and policy checks.
- Multi-document Public Verifier output now has one source-backed VP cover followed by each nested VC on a new printed page.
- Print CSS uses A4 portrait, 14 mm top and 16 mm side/bottom margins, repeated table headers, non-splitting rows/signatures, and screen-only chrome removal.

## Resolved findings

- P1: verification wording was not fail-closed when required checklist items were missing.
- P1: staff details could pair with the patient fixture photo/text.
- P1: mixed payer/provider payloads could choose the hospital before the declared payer issuer.
- P1: Records V2 did not invoke the Shared Renderer.
- P2: `statusPurpose` and a raw array index could appear as document facts.
- P2: print from a non-preview tab could silently do nothing.
- P2: mobile identity output omitted source-backed photos.
- P2: printed multi-document VP output lacked a presentation cover and purpose/audience context.
- P2: demo payer artifacts omitted payer role and guarantee/pre-authorization aliases.

result: passed

# Portal and Wallet Credential Render Contract

This contract keeps TrustCare Portal and TrustCare Wallet rendering the same VC/VP credential in the same way. The Wallet must not infer document details from old card labels when Portal sends the canonical render payload.

## Canonical VC Shape

Every synced credential that should render as a human medical document must include:

```json
{
  "credentialSubject": {
    "documentType": "quotation",
    "humanDocument": {
      "renderVersion": "trustcare-render-v1",
      "renderData": {
        "hospital": {
          "code": "tcp",
          "nameTh": "โรงพยาบาลทรัสต์แคร์ ภูเก็ต อินเตอร์เนชั่นแนล",
          "nameEn": "TrustCare Phuket International Hospital",
          "did": "did:web:trustcare.network:hospital:tcp"
        },
        "patient": {
          "fullNameTh": "Mr. John Williams",
          "fullNameEn": "Mr. John Williams",
          "hn": "HN-TCP-00110003",
          "carepassId": "CP-INT-2026-000003",
          "photoUrl": "https://..."
        },
        "document": {
          "id": "urn:trustcare:document:tcp:p003:quotation",
          "no": "CP-INT-2026-000003",
          "type": "quotation",
          "status": "active",
          "issuedAt": "2026-07-01T02:00:00.000Z",
          "expiresAt": "2027-07-01T02:00:00.000Z",
          "version": 2
        },
        "treatmentQuotation": {
          "packageName": "ผ่าตัดเปลี่ยนข้อเข่า",
          "validityDays": 30,
          "lineItems": [],
          "estimatedTotal": 450000
        }
      }
    }
  }
}
```

## Renderer Rules

- `credentialSubject.humanDocument.renderData` is the primary renderer input.
- `hospital.nameTh` is rendered first, then `hospital.nameEn`.
- `patient`, `hospital`, and `document` inside `renderData` override legacy fields with the same meaning.
- Type-specific sections must live under a canonical key such as `treatmentQuotation`, `referral`, `medicalCertificate`, `allergyAlert`, `prescription`, `medicationSummary`, `pharmacyDispense`, `insuranceEligibility`, `claimReceipt`, `mpiLinkCertificate`, or `consentReceipt`.
- Legacy aliases are migration-only. They must not become a second source of truth.
- Proofs, JWTs, DID material, hashes, watermarks, and UI metadata are not selective-disclosure fields unless the document schema explicitly says so.

## Sync and Deduplication Rules

- Portal should send one active credential per document lineage.
- Wallet still deduplicates by lineage, version, fingerprint, and lifecycle status because sync can return a full snapshot.
- Active/current/valid credentials beat expired/superseded credentials from the same lineage.
- Older versions are archived into Wallet history/store, not displayed as active documents.
- `shl_manifest` and `sync_receipt` are trust artifacts. They do not satisfy clinical readiness requirements.

## Shared Component Direction

The current Wallet implementation normalizes Portal payloads through `@trustcare/wallet-core/portalRenderContract`. When Portal publishes the renderer as a shared package, both apps should consume the same renderer and keep this contract as the payload boundary.

## A4 Paper and VP Presentation Contract

- The data model remains the VC/VP payload. `CredentialPaperModel` is a read-only view model and must not become another bundle, credential, or claim object.
- A single-document VP renders the issuer document once and adds a compact purpose/trust footer. It must not render a second copy of the same claims as a VP card.
- A multi-document VP may add one holder-generated cover/manifest, then renders every nested VC as a separate issuer document. Hospital, payer, and holder provenance must never be merged into one letterhead.
- Screen preview uses an A4 portrait proportion (`210mm × 297mm`). Printed output uses `@page` margins and normal pagination rather than scaling or rasterizing a screenshot.
- Clinical and financial rows use semantic HTML tables so headers repeat across printed pages. The renderer must not make the primary document horizontally scrollable.
- Letterhead, patient identity, document metadata, claims, signatories, evidence, logos, and watermarks are rendered only when supplied by the current credential or its exact normalized render payload.
- Missing values are omitted or identified as missing. The renderer must not substitute a network brand, another profile photo, a generic official, a fabricated logo, or assumed FHIR evidence.
- `DEMO`, `SAMPLE`, or similar watermarks are allowed only when the credential explicitly declares that watermark or environment state.
- Document lifecycle, cryptographic verification, status/expiry, issuer trust, and purpose policy are separate signals. Green verified wording is reserved for an explicit verifier result that completed the required checks.
- Issuer DID, credential/presentation ID, digest, purpose, audience, expiry, and verifier URL belong in the technical verification footer, not the clinical letterhead.
- Payer eligibility, pre-authorization, guarantee, receipt, and claim-status artifacts are labelled as payer-reported. The Wallet does not adjudicate claims.

The layout follows the document structure of [FHIR Composition and documents](https://hl7.org/fhir/R4/composition.html), the provenance separation of [W3C Verifiable Credentials and Presentations](https://www.w3.org/TR/vc-data-model/#verifiable-presentations), and pagination behavior from [CSS Paged Media](https://www.w3.org/TR/css-page-3/) and [CSS Fragmentation](https://www.w3.org/TR/css-break-3/). Issuer-provided `renderMethod` templates are optional hints only; the current [VC Rendering Methods](https://www.w3.org/TR/vc-render-method/) specification is a Working Draft, so remote templates must not bypass the Shared Renderer, integrity checks, sanitization, or sandboxing.

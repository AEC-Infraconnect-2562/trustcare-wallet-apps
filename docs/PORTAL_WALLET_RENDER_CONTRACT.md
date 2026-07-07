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

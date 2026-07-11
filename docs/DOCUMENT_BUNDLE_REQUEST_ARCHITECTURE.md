# TrustCare Wallet Document Bundle and Request Architecture

Status: active design note for Wallet and TrustCare Portal interoperability.

## Purpose

TrustCare Wallet is a personal portable medical document wallet. It must not mix document storage, service-readiness checks, service bundle construction, verifier QR payloads, SHL transport, and TrustCare certification into one object.

The design uses five separate layers:

1. `WalletDocumentRecord` is the canonical wallet record.
2. VC/VP is the signed credential and presentation proof layer.
3. FHIR `DocumentReference`, FHIR document `Bundle`, and clinical resources are evidence or clinical payload layers.
4. SMART Health Link is the encrypted transport and manifest layer.
5. TrustCare Manifest VP and Holder VC are TrustCare certification artifacts for SHL packages.

QR codes are only transport or resolver pointers. A QR is never the canonical document itself.

## Standards Baseline

- W3C Verifiable Credentials define credential and presentation proof structures.
- OpenID4VP defines holder-to-verifier presentation flows.
- OpenID4VCI defines issuer-to-wallet credential issuance flows.
- FHIR `DocumentReference` indexes documents and attachments with metadata.
- FHIR clinical documents are immutable bundles rooted in `Composition`.
- SMART Health Links carry encrypted manifests and files through `shlink:/` or web viewer URLs.

Reference sources:

- https://www.w3.org/TR/vc-data-model-2.0/
- https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
- https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
- https://hl7.org/fhir/R4/documentreference.html
- https://hl7.org/fhir/R4/documents.html
- https://docs.smarthealthit.org/smart-health-links/

## Canonical Document Types

The wallet recognizes only these canonical document types:

`patient_identity`, `staff_identity`, `consent_receipt`, `mpi_link_certificate`, `patient_summary`, `allergy_alert`, `immunization`, `medical_certificate`, `medication_summary`, `prescription`, `pharmacy_dispense`, `lab_result`, `diagnostic_report`, `referral_vc`, `discharge_summary`, `insurance_eligibility`, `claim_package`, `claim_receipt`, `travel_document_verification`, `visa_support_letter`, `quotation`, `guarantee_letter`, `shl_manifest`, `sync_receipt`, `appointment`.

`shl_manifest` and `sync_receipt` are trust or transport artifacts. They must not satisfy clinical readiness requirements.

## Format Decision Matrix

| Use case                                                          | Best format                                  | Compatible with                                                 | Not compatible with                         | Notes                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Single signed identity, appointment, consent, medical certificate | Direct VC/VP                                 | OpenID4VP, QR resolver, selective disclosure                    | Standard SHL as primary payload             | Small, high-trust documents should stay directly verifiable.                                                             |
| Small purpose-bound service package                               | Purpose VP                                   | Multiple VCs, selected claims, expiry, recipient binding        | Raw `ServiceBundleEnvelope` QR              | OPD and pharmacy default to VP unless payload becomes large.                                                             |
| Large multi-resource clinical package                             | Standard SHL                                 | FHIR Bundle, DocumentReference, files, time-series records      | Green TrustCare badge without certification | Compatible with external SMART Health Links tools.                                                                       |
| TrustCare-certified large package                                 | SHL + Manifest VP                            | Standard SHL plus optional `trustcare.manifestVpUrl` and hashes | Non-TrustCare issuer without Maker/Checker  | Requires Manifest Credential, Manifest VP, Holder Authorization Credential, file hashes, and access policy verification. |
| External hospital or user file upload                             | FHIR DocumentReference or PDF/Image evidence | Patient upload, FHIR JSON, scanned PDF                          | Direct trusted VC until signed              | Store as unverified evidence until trusted issuer signs.                                                                 |
| Issuer-to-wallet import                                           | OID4VCI Offer                                | TrustCare Portal, hospital issuer, external issuer              | Patient-created file upload                 | Wallet verifies issuer DID/JWKS, proof, status, and expiry before use.                                                   |
| HIS/LIS/RIS/EMR clinical pull                                     | FHIR DocumentReference or Bundle             | Connected FHIR endpoint, consent scope                          | VC trust until issuer signs or maps         | Use `record time` for clinical timeline and `package time` for export history.                                           |

## Bundle Rules

Document Bundle means a purpose-bound package assembled from canonical wallet records. It is not automatically a QR payload.

Allowed bundle outputs:

- `PurposeVP`: one VP containing selected VC references or embedded VCs.
- `StandardSHL`: SHL manifest with standard `files[].location` or `files[].embedded`.
- `CertifiedSHLManifestPackage`: Standard SHL plus Manifest VP and Holder VC.
- `FHIR Bundle`: clinical evidence bundle for import or review, not a green verifier proof by itself.

Forbidden bundle outputs:

- Raw `ServiceBundleEnvelope` as a primary verifier QR payload.
- `shl_manifest` or `sync_receipt` as a substitute for clinical documents.
- Patient-uploaded PDF/image marked as trusted VC without issuer signing.
- Placeholder IDs such as `pending:trustcare:*` shown as green trust proof.

## Inbound Flow

1. TrustCare Portal sync returns signed VC/VP or OID4VCI offers. Wallet verifies proof, issuer trust, status, and holder binding before using them for readiness.
2. FHIR/HIS/LIS/RIS import returns DocumentReference, FHIR Bundle, or clinical resources. Wallet stores them as evidence. They become trusted readiness documents only after issuer signing or TrustCare Portal certification.
3. Standard SHL import is parsed and transport-validated. It remains `standard` or `pending TrustCare binding` until TrustCare Maker/Checker creates Manifest VP and Holder VC.
4. Patient upload stores a DocumentReference with unverified status. It can support review, but it cannot satisfy signed VC readiness.
5. External wallet import can bring VP, OID4VCI offer, or SHL. Wallet verifies according to the object type, not by display label.

## Outbound Flow

1. User chooses recipient and purpose.
2. Wallet selects canonical document records in scope.
3. User chooses package type:
   - `VC/VP` for small, directly verifiable packages.
   - `Standard SHL` for large or time-series clinical packages.
   - `SHL + Manifest VP` for TrustCare-certified large packages.
4. Wallet enables only controls compatible with the chosen package:
   - VC/VP: selective disclosure, expiry, recipient binding, biometric confirmation.
   - Standard SHL: passcode policy, expiry, access count, manifest files.
   - Certified SHL: all Standard SHL controls plus TrustCare Manifest VP and Holder VC certification.
   - FHIR import: endpoint, scope, consent.
   - Patient upload: file picker and evidence review.
5. Wallet creates exactly one resolver-backed QR payload.

## Request Missing Documents Flow

The button `ขอเอกสารที่ขาด` opens a patient review step backed by an automatic
route planner. The patient does not choose VC/VP, OID4VCI, FHIR, SHL, package
scope, or a technical return channel.

The planner must answer:

- Which canonical document types are missing?
- Which source can issue or provide them?
- Which source capability can satisfy the semantic requirement and trust policy?
- Which format and return channel are valid for both source and Wallet?
- Which controls must be enabled or disabled?
- What trust state will the returned object have?

These are internal resolver decisions. The patient sees only the responsible
organization, what will return to the Wallet, and the proof/policy checks that
must pass. If no compatible route exists, the request is blocked with a
patient-readable next action. The resolver must not silently downgrade a signed
credential to an upload, certified evidence to uncertified transport, or a
payer artifact to a Wallet-generated substitute.

Source decisions:

- TrustCare Portal or network hospital: VC/VP, OID4VCI, Certified SHL.
- Connected FHIR/HIS/LIS/RIS: DocumentReference or FHIR Bundle.
- Payer: insurance eligibility, claim, guarantee letter, claim receipt.
- External wallet: VP, OID4VCI, or SHL.
- Patient upload: PDF/image/FHIR JSON as unverified DocumentReference.

## Import Documents Flow

The button `นำเข้าเอกสาร` is a separate explicit import flow. It defaults to
patient upload and may accept SHL, VC/VP, OID4VCI, or FHIR JSON for advanced
interoperability. Imported evidence never silently satisfies a requirement that
needs an issuer-signed document.

Every imported object must show a visible trust badge:

- `ยังไม่ยืนยัน`: patient upload or unsigned FHIR evidence.
- `ตรวจ transport ได้`: Standard SHL parsed and manifest fetched.
- `รอ TrustCare binding`: SHL exists but no certified Manifest VP.
- `TrustCare-certified`: Manifest VP, Manifest Credential, Holder VC, hashes, access policy, and status checks pass.
- `ตรวจลายเซ็นแล้ว`: signed VC/VP with trusted issuer and valid status.

## Timeline Rule

Wallet timeline has two timestamps:

- `recordTime`: clinical event time, e.g. specimen collected, medication dispensed, referral issued.
- `packageTime`: bundle creation/share/sync time.

Clinical timeline sorts by `recordTime`. Activity history sorts by `packageTime`. A bundle can contain old records packaged today, so the UI must show both when there is a mismatch.

## UX Rules

- Prepare checks readiness only and routes users to Share or request/import flow.
- Share generates exactly one package and QR.
- Store lists persisted VCs, VPs, SHLs, Manifest VPs, Holder VCs, OID4VCI offers, OID4VP requests, sync receipts, and DocumentReferences.
- Missing-document requests must not expose technical format choices. When no
  safe route exists, show the reason and a patient action instead of changing
  format silently. Advanced import tooling may show disabled formats with a
  reason.
- Technical properties such as watermark, UI state, payload hash, transport fields, and manifest metadata are not selectable disclosure claims.

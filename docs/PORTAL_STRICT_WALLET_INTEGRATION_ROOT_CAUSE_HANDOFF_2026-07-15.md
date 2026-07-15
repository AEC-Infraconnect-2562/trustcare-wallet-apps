# Portal action: strict Wallet sandbox integration blockers

Status: Portal revision and catalog are current, but the strict multi-page
Wallet flow is not yet acceptance-complete.

- Portal: `https://trustcare-hospital-network-production.up.railway.app`
- Production revision: `21c0b24822cac48f99605b26778eded4a4684fee`
- Test identity catalog: `2026.07.test-identities.v4`
- Tested: 2026-07-15 Asia/Bangkok

Wallet remains fail closed. Do not substitute a holder DID, rewrite
`credentialSubject.id`, re-sign a hospital credential, collapse distinct
document lineages, or retain an old credential as an active fallback.

## Strict flow result

All linked identities tested with the exact catalog DID/public JWK and the
Wallet-owned sandbox private key. `demo-patient-001` through `003` complete:

```text
test-login -> holder binding -> DPoP session -> credential delta/ACK
-> Graph delta
```

The full paginated credential delta then exposes conflicts that a first-page
smoke test misses:

| walletUserId | pages | accepted | quarantined | result |
| --- | ---: | ---: | ---: | --- |
| `demo-patient-001` | 3 | 10 | 39 | lineage/version, SHL ordering/render conflicts |
| `demo-patient-002` | 3 | 4 | 42 | lineage/version, SHL ordering/render conflicts |
| `demo-patient-003` | 2 | 5 | 17 | lineage/version conflicts |

Graph delta remains structurally valid for `demo-patient-003`: 11 persisted
objects, 11 edges, 45 idempotent changes, zero Graph quarantine entries, and
the eight-stage presentation builder succeeds. That does not make the overall
flow complete: the Graph cannot override quarantined source credentials.

### 001-003: non-unique lineage and unchanged version

Portal currently emits generic FHIR resource type values such as `Patient`,
`DocumentReference`, `Bundle`, `DiagnosticReport`, and
`MedicationStatement` as `lineageKey`. Different credentials consequently
claim the same logical lineage and version `2.0.0`. Wallet correctly rejects a
different compact JWS/content hash under the same lineage and version with:

```text
reason=version_conflict
detail=Credential content changed without a new normalized document version.
```

The implementation root cause is visible in Portal revision `21c0b248` at
`server/walletExchange/service.ts`:

- `credentialLineageKey(...)` prioritizes
  `credentialSubject.data.humanDocument.renderData.document.id`; the seed
  documents use generic FHIR type labels such as `Patient` as that ID;
- `credentialVersion(...)` falls back to the credential `schemaVersion` when
  no logical document version is present, so unrelated/reissued objects all
  become `2.0.0`.

Correct these values at issuance/delta generation. Do not change the Wallet
lineage reducer: it is correctly protecting immutable history from two
different signed objects claiming the same logical identity and version.

Affected credential IDs include:

- 001: `patient_identity`, `patient_summary`, `consent_receipt`,
  `mpi_link_certificate`, `medical_certificate`, `referral_vc`,
  `claim_package`, `claim_receipt`, `prescription`, `medication_summary`, and
  `insurance_eligibility` seed IDs;
- 002: TCC/TCP `patient_identity`, `patient_summary`, `consent_receipt`,
  `mpi_link_certificate`, `allergy_alert`, `lab_result`, and
  `medication_summary` seed IDs;
- 003: `patient_identity`, `patient_summary`, `consent_receipt`,
  `mpi_link_certificate`, `travel_document_verification`,
  `visa_support_letter`, `quotation`, `guarantee_letter`,
  `medication_summary`, `insurance_eligibility`, and `appointment` seed IDs.

Representative protected-response traces:

| walletUserId | requestId | correlationId |
| --- | --- | --- |
| `demo-patient-001` | `wallet-3d81d967-dc93-4025-9492-1674ef5366ea` | `5c5c3108-a753-48a9-9ec6-9bec5d22d4fe` |
| `demo-patient-001` | `wallet-8cac0df2-fac4-4bbe-ac98-1b45f65d7e84` | `be4f00bb-1835-4195-9c92-24be58fcebe9` |
| `demo-patient-001` | `wallet-3f8f4269-98ed-4a01-a5f5-fd68ee0e2d55` | `a456a5fa-a782-44d6-b68c-94cfb9d5c514` |
| `demo-patient-002` | `wallet-5c27cbfd-3bde-433c-a5f6-aa34af53b7f2` | `32d782b7-e58d-49ba-a383-0feb5cc88d0b` |
| `demo-patient-002` | `wallet-6487e956-45ac-4a26-b4d3-96a0cc289754` | `a9094c51-c561-4c40-a7a1-438ffc1f6141` |
| `demo-patient-002` | `wallet-ef69febe-da64-4dd4-b614-be9947404091` | `fb1454f9-03cd-4a25-9444-cc06db93d9c7` |
| `demo-patient-003` | `wallet-30d3e4b5-367f-431e-9c87-e312e2458258` | `7da620ff-d9e6-46ec-8bcd-b5314927740d` |
| `demo-patient-003` | `wallet-9160dd81-aeeb-4e2d-b4fc-114c34308321` | `21f5d525-5d00-4e4f-a571-09286199855b` |

For 001 and 002, Portal also emits an SHL status event for a manifest
credential that Wallet does not have (`credential_not_found`), while the
corresponding Portal-signed Manifest VC cannot normalize to a canonical Wallet
document (`document_missing`). The Manifest VC must contain the signed
`humanDocument.renderData` required by the current render contract, and its
status event must follow a valid upsert.

Because the signed patient identity credentials are among the lineage
conflicts, the strict Avatar source is unavailable after the complete delta.
Wallet does not fall back to the unsigned catalog portrait or another person's
photo.

## 004-009: active holder binding mismatch

All of `demo-patient-004` through `demo-patient-009` complete test login,
holder proof/binding, and DPoP session with the exact catalog v4 DID/public JWK.
The protected credential delta fails before any credential is returned:

| walletUserId | HTTP | problem code | requestId / correlationId |
| --- | ---: | --- | --- |
| `demo-patient-004` | 409 | `credential_subject_binding_mismatch` | `wallet-c7c3f0f1-338f-4f65-9696-cdc6bcfa9fc3` |
| `demo-patient-005` | 409 | `credential_subject_binding_mismatch` | `wallet-f859203f-6c45-44b4-a794-db7f4e0bd814` |
| `demo-patient-006` | 409 | `credential_subject_binding_mismatch` | `wallet-f2bac9b6-8bb4-445d-868a-b23ed7c32d86` |
| `demo-patient-007` | 409 | `credential_subject_binding_mismatch` | `wallet-552dd211-6490-403c-a7fe-9e35ee2023f7` |
| `demo-patient-008` | 409 | `credential_subject_binding_mismatch` | `wallet-7e331b6a-587b-4bfb-9508-4862fce44e97` |
| `demo-patient-009` | 409 | `credential_subject_binding_mismatch` | `wallet-51d27970-393a-4e0a-ae37-f244dd8862d5` |

Endpoint: `POST /api/wallet/v2/credentials/sync`

The RFC 9457 response does not expose `credentialId`; Portal throws while
serializing the mismatched sync event. Use request/correlation ID to identify
the affected row without logging a token or private key.

## Portrait transport status

All nine advertised portrait URLs return HTTP 200 with
`Content-Type: image/jpeg`, and 004-009 use distinct patient asset paths.
Wallet still requires a verified signed credential portrait to equal the
catalog portrait before display. Transport success alone is not issuer proof.

## Required Portal correction

1. Make `lineageKey` identify one stable logical document lineage. Do not use
   a bare FHIR resource type. Separate credential types, resource IDs,
   hospitals, and logically independent objects; preserve a lineage only for
   true revisions of that object.
2. Increment `version` whenever the signed document/content hash changes. Do
   not replay superseded reseed objects as active current upserts.
3. Reissue the 001/002 Portal-signed Manifest VCs with render-contract-complete
   signed data and order lifecycle events after their valid upserts.
4. For 004-009, compare the compact-JWS direct `credentialSubject.id` and any
   optional `sub` with the active proof-bound catalog holder DID, then reissue
   every mismatch using the hospital `did:web` key and current authority
   snapshot.
5. Publish `contentHash` as SHA-256 of the exact compact JWS bytes and reconcile
   Graph nodes/links only from the active reissued objects and their hashes.
6. Add `credentialId` as a sanitized RFC 9457 problem extension, or guarantee
   server-side lookup by request/correlation ID.

## Portal release evidence requested

- zero `credential_subject_binding_mismatch`, lineage/version conflicts,
  missing source credentials, and invalid Manifest VC render documents for
  linked identities 001-009;
- per-user credential and Graph counts after reseed/reconciliation;
- every active signed VC: current subject DID, current portrait where required,
  valid issuer/kid/signature/status/validity,
  `issuanceAuthority.snapshotDigest` binding, and exact JWS byte hash;
- pending seed SHLs remain pending until a real Wallet holder VP is submitted;
- replay does not duplicate credentials, Graph nodes, portraits, or audit rows.

No Wallet verifier relaxation or fallback is required.

## Portal implementation instruction

Implement the corrections above in the Portal repository at the root cause.
Do not modify Wallet verification policy, fabricate a holder credential, or
make a test pass by hiding/reordering invalid delta rows. Add Portal regression
tests that run every linked catalog v4 identity through a complete paginated
delta and assert:

1. `lineageKey` is stable for revisions of one logical document and distinct
   across unrelated credentials;
2. a changed compact JWS/content hash always has a new document version;
3. every lifecycle event references a valid earlier/current upsert;
4. each Manifest VC is a direct W3C VC 2.x compact JWS with render-contract
   complete signed data;
5. every compact JWS `credentialSubject.id` equals the active holder binding;
6. Graph object hashes equal the accepted credential/SHL/VP bytes; and
7. replay emits no duplicate active objects or audit records.

After deployment, return the new production revision, catalog/contract
versions, per-user accepted/quarantined counts, and sanitized request and
correlation IDs. Wallet will rerun the unchanged strict gates.

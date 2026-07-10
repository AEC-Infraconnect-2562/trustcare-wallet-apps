# Standards Conformance Matrix

Status: Implemented, Partial, Planned, or Demo/Sandbox. A parseable fixture is
not recorded as production conformance.

| Area                            | Current status | Evidence/gap                                                                                                                                                                                      |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical document taxonomy     | Implemented    | Single list in wallet-core with normalization tests                                                                                                                                               |
| FHIR R4 clinical resources      | Partial        | Seed, mapping and rendering helpers exist; profile validation and production FHIR/IPA retrieval remain                                                                                            |
| FHIR DocumentReference          | Partial        | Create/validate/import and attachment metadata exist; full repository errors/paging remain                                                                                                        |
| FHIR Binary/original content    | Partial        | Attachment references exist; authenticated fetch, content-type/hash validation and error fixtures remain                                                                                          |
| FHIR document Bundle            | Partial        | IPS-oriented Bundle helpers exist; profile validation/golden breadth remains                                                                                                                      |
| HL7 IPS                         | Partial        | Composition/section helpers and renderer direction exist; formal conformance and attestation distinctions need expansion                                                                          |
| IHE MHD                         | Partial        | DocumentReference mapping/validation exists; provide/find/list/retrieve client implementation is pending                                                                                          |
| FHIR/IPA client adapter         | Planned        | Configurable production client, authorization, paging and error fixtures are pending                                                                                                              |
| SMART discovery/App Launch      | Planned        | Provider-neutral capability boundary exists, but SMART metadata/auth integration is not implemented                                                                                               |
| W3C VC/VP                       | Partial        | VC/VP JWT and Data Integrity verification paths exist; broader status/trust-registry profiles remain                                                                                              |
| OID4VCI                         | Demo/Sandbox   | Offer parsing and deterministic issuer fixture exist; production auth/issuer metadata integration is external                                                                                     |
| OID4VP                          | Partial        | Request classification and verifier handling exist; production verifier interoperability fixtures remain                                                                                          |
| Direct VP                       | Partial        | Resolver publication and proof verification exist; production recipient capability negotiation and lifecycle remain                                                                               |
| Purpose VP                      | Partial        | Purpose/disclosure package paths exist; production interoperability, consent binding and active-share lifecycle remain                                                                            |
| Standard SHL                    | Partial        | Canonical SHLink/manifest transport exists; cross-implementation golden fixtures need expansion                                                                                                   |
| Manifest Credential             | Partial        | Generation and binding fields exist; complete issuer/status/trust-policy verification fixtures remain                                                                                             |
| Holder Authorization Credential | Partial        | Holder binding artifact exists; complete proof, lifecycle and revocation fixtures remain                                                                                                          |
| Manifest VP                     | Partial        | Composition and proof paths exist; complete nested credential/status/policy verification remains                                                                                                  |
| Certified SHL                   | Partial        | Trust-chain artifacts and hashes exist, but structural presence is not verification; evidence-provider integration, full-path regression, revocation and access lifecycle remain release blockers |
| Credential status/revocation    | Partial        | Lifecycle states and verifier semantics exist; production status services are external                                                                                                            |
| Contract Hub                    | Demo/Sandbox   | Hand-authored demo catalog only; generated signed V2 contracts pending                                                                                                                            |
| RFC 9457 Problem Details        | Planned        | Shared generated error model and Portal/MHD/Contract Hub fixtures are pending                                                                                                                     |
| Accessibility/WCAG 2.2 AA       | Planned        | Component semantics partial; keyboard/axe/zoom/screen-reader gates pending                                                                                                                        |

## Golden and failure-fixture evidence

| Fixture family                        | Current status       | Evidence required before conformance increases                                                                          |
| ------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| IPS minimal and all-sections          | Partial              | Profile validation, attestation distinction and renderer goldens                                                        |
| FHIR document Bundle                  | Partial              | Immutable Bundle profile and invalid-resource fixtures                                                                  |
| DocumentReference/Binary              | Partial              | Valid and unsupported content type, missing content and hash mismatch                                                   |
| MHD find/list/retrieve/provide        | Planned              | Consumer/provider contract fixtures and `OperationOutcome` failures                                                     |
| OID4VCI/OID4VP                        | Demo/Sandbox/Partial | External metadata, auth, success and unsafe-request fixtures                                                            |
| Direct/Purpose VP                     | Partial              | Recipient capability, selective disclosure, expiry, audience and second-device fixtures                                 |
| Standard SHL                          | Partial              | Cross-implementation manifest/file, wrong passcode, access exhausted and missing-file fixtures                          |
| Certified SHL trust chain             | Partial              | Separate proof, issuer, status, expiry, holder, hash and policy success/failure fixtures for all three signed artifacts |
| Credential status/revocation          | Partial              | Active, suspended, revoked, expired and unavailable-status-service fixtures                                             |
| Contract Hub manifest/service profile | Planned              | Signed, expired, incompatible, deprecated, replacement and unknown-required-field fixtures                              |

## Non-conformance guardrails

- SHL parsing yields transport-valid, not verified.
- A Certified SHL object containing Manifest Credential, Holder Authorization,
  Manifest VP and hashes is still pending until every cryptographic, lifecycle,
  issuer, holder, hash and policy check succeeds. The shared-envelope path now
  preserves this pending state and requires regression coverage to prevent a
  structural-presence promotion from returning.
- `ServiceBundleEnvelope` is an internal planning artifact, never a QR contract.
- A software-assembled IPS is not clinician-attested without attestation.
- Patient uploads remain unverified evidence.
- Embedded or referenced images do not imply DICOM/PACS content conformance.

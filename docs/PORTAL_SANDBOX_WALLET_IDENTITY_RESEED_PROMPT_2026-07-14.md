# Portal prompt: repair Wallet sandbox identities, holder binding, reseed, and portraits

Use the current `main` of `AEC-Infraconnect-2562/trustcare-hospital-network-railway` as the starting point. PR #48 (`Complete P0 production boundaries`) is already merged; rebase after any later Portal/Edge-only PR before implementation. Do not change Wallet contracts merely to make stale seed data pass.

## Proven production defect

Wallet Exchange V2 authentication, OIDC linking, holder proof/DPoP session, and sync all return successfully, but active seed credentials are signed for a different holder DID than the currently registered deterministic sandbox Wallet key.

Observed on 2026-07-14:

- `demo-patient-001`: HTTP 200, 16 changes, requestId `wallet-3327ba83-6ac3-42b0-a247-4ac255fcbbaa`
  - signed `credentialSubject.id`: `did:key:z6MkfAotnwE5XNKu1wxcYRULcR6FSDdTLGkhYghqjFXxW9Bw`
  - current Wallet fixture/binding DID: `did:key:z6MkpkMGxCtVn3E9MK7xHixFmNb8qJjfTHYXgmEaZmLzDGUj`
- `demo-patient-003`: HTTP 200, 11 changes, requestId `wallet-45c4a7a1-3c03-4dd7-8dce-2fb732c669f2`
  - signed `credentialSubject.id`: `did:key:z6Mkfa8xcbLzr75kXBDkne6vK1WbKAEX8yYsJyLP2hRCvRHM`
  - current Wallet fixture/binding DID: `did:key:z6Mkhfk5URyKvk4qjQdCf1dbcUwjWMWPMLRLx4EeFRnUf7b6`
- Reconfirmed after Portal PR #48 deployed: `demo-patient-003` returned 11
  changes with requestId `wallet-10ad1378-4389-455d-ade4-f9c9a9613a0c`
  and correlationId `d265f247-f217-4172-9a35-95d9b8fdc895`; all 11 were
  rejected before rendering for the same signed-subject mismatch.
- Reconfirmed again after Portal PR #49 / commit `3339ed9` deployed:
  `demo-patient-003` returned 11 changes with requestId
  `wallet-554bcb00-576a-4435-8a8c-af492561d404` and correlationId
  `f9464046-190d-4870-9849-0bbab9ef77ea`; zero credentials were eligible
  for rendering because all signed subjects still use the retired holder DID.
- The same live response exposed an independent integrity defect for
  `MpiLinkCertificateCredential`: its sync `contentHash` does not match the
  signed credential bytes. Fix its producer/delta hash and reissue it; do not
  ask Wallet to skip content-digest verification.
- Portrait-bearing identity data still arrives with `humanDocument.renderData`
  declaring `noPortrait` and no exact patient photo. The public
  `/api/wallet/test-identities` catalog currently exposes only
  `username`, `name`, `scenario`, `expectedProvisioningState`, and
  `patientReferenceProvisioned`, so Wallet cannot audit an authoritative
  person-specific portrait mapping yet.
- The observed response had `x-request-id`. PR #48 added safe `X-Correlation-Id` propagation; preserve both headers and verify them after deployment, but neither header changes credential acceptance.

The likely root cause is architectural duplication:

- `server/portability/seedData.ts#buildPatient()` derives `holderDid` from `patientDidKey(hospitalCode:seedId:carepassId)`.
- `server/walletExchange/sandboxFixtures.ts` defines a different public-key catalog used by the deterministic self-custody Wallet test identities.
- `DEMO_PATIENT_MAPPING` joins OIDC identities to patient rows but does not make the holder public key/DID the source for issued VC, VP, SHL, and Graph subjects.

Wallet must continue to reject these credentials. Do not copy sync metadata `holderDid` over the signed subject, and do not weaken `credentialSubject.id` verification.

## Additional production contract defect: SHL manifest URL entropy

The current Wallet uses the live Share Gateway contract and publishes a
Standard SHL manifest at the exact Portal-generated path
`/s/{43-character-base64url-token}`. The certification service in
`server/walletExchange/service.ts#requestShlCertification()` currently tests
the final path segment directly against `^[A-Za-z0-9_-]{43}$`. The actual final
segment is `{artifactId}.json`, so every legitimate Share Gateway manifest URL
is rejected even when `artifactId` is a 256-bit base64url value.

Fix this at the shared Portal boundary, not by asking Wallet to send a URL that
does not resolve:

- parse only the artifact identifier from the canonical Share Gateway manifest
  route (strip the required `.json` suffix after validating the exact route);
- require that identifier to be 43 base64url characters (256 bits);
- require the URL origin and route to match the configured Portal Share Gateway,
  with no user info, query, fragment, traversal, or alternate host;
- add positive coverage using the exact `publicArtifactPath()` output and
  negative coverage for wrong host/path/suffix, low entropy, query, and fragment;
- keep the holder-signed `manifestUrl` and certification request URL as an exact
  match after canonicalization.

Wallet now generates a 256-bit opaque package ID, but it must not forge an
unresolvable extensionless URL to work around this Portal validation defect.

## Required Portal implementation

1. Create one public-only sandbox holder catalog for the nine positive Wallet identities. It must contain no private key. Use it as the sole Portal source for the expected sandbox public JWK and DID.
2. For every `DEMO_PATIENT_MAPPING` row, make reseed derive the patient holder DID/DID document from that public holder catalog, not `patientDidKey(seed)`.
3. Ensure the exact same holder DID flows through:
   - `credentialSubject.id` of every seed VC;
   - issued presentation holder and subject binding;
   - SHL manifest credential subject/reference;
   - Holder VP/SHL graph nodes and edges;
   - `patient_identifiers.health_id`, Wallet card metadata, graph `subjectReference`, and sync event holder scope.
4. Keep Holder private keys Wallet-only. Portal/KMS must sign only hospital VC/Manifest VC. Portal must not create a Wallet holder proof.
5. Do not fabricate an active proofed app-holder binding during seed. If `seedWalletExchangeSandboxBindings()` bypasses the challenge, remove it or split it so it only provisions the Wallet application/public fixture expectation. The positive test flow must still complete the real Wallet challenge before DPoP session creation.
6. Reconcile the OIDC identity catalog before reseed. Then run one intentional authenticated sandbox reseed that suspends/revokes stale seed VC/VP/SHL rows and reissues the complete current set through Maker/Checker and Cosmian KMS.
7. The nine positive test users must be real Wallet-realm Keycloak users linked through `wallet_oidc_identities`. Add complete catalog metadata and Keycloak attributes:
   - immutable `walletUserId`, username, name, email;
   - phone, birth date, gender, nationality, preferred locale;
   - hospital/home-network code and patient reference;
   - scenario/use-case list, expected credential/object types, expected flow states;
   - exact portrait URL and `trustcare_test_identity=true`.
8. Keep the three deliberate negative onboarding users unlinked and clearly labeled. They must not receive a patient reference, holder binding, credentials, or clinical objects.
9. Give every positive patient an exact, person-specific portrait asset. Do not reuse another patient's image and do not use gender-based fallback for mapped test users. Persist the exact URL in `users.avatarUrl` and emit the same URL in `credentialSubject.data.humanDocument.renderData.patient.photoUrl` (or the current canonical patient photo field consumed by the Wallet renderer). Every URL must return HTTP 200 from Railway.
10. Extend `GET /api/wallet/test-identities` with safe, non-secret scenario metadata so Wallet tests do not duplicate the catalog: portrait URL, hospital code, use cases, expected credential/object types, and expected flow states. Version the response additively.
11. Keep VC hard cutover rules: W3C VC Data Model 2.x direct JWS document, no `vc` wrapper, optional `iss`, hospital did:web/KMS signature, status list, schema/profile, validity, and exact holder subject.
12. Repair the SHL manifest URL validator above and deploy it together with a
    contract test that builds the URL through the real Share Gateway helper.

## Required tests and audit

- Catalog test: all nine positive identities have complete unique metadata and exact portraits; three negatives remain deliberately unlinked.
- OIDC reconciliation test: Keycloak user attributes, `sub`, role/audience, trusted patient reference, and keyed DB identity linkage are complete.
- Holder test: before challenge the state is `holder_binding_required`; after real proof, binding/session succeeds for the catalog DID.
- Reseed test: every mapped patient's active VC subject equals the public holder catalog DID; no active credential remains on the retired seed-derived DID.
- Cryptographic compatibility test for every active seed VC: direct payload, no wrapper, valid signature/kid/controller/issuer/status/schema/validity and exact subject.
- Object integrity test: VC/VP/SHL/Graph subject/reference/hash edges resolve to the same patient and holder DID.
- Portrait test: every mapped identity card/portrait-bearing credential has the exact expected photo URL and the Railway asset returns an image with HTTP 200.
- End-to-end test for all nine positives: test-login -> OIDC identity -> holder challenge -> DPoP session -> sync -> ACK returns at least one valid, renderable credential for the scenarios that are intended to contain documents.
- Negative onboarding test for the remaining three users.
- Add an audit that fails deployment if active signed subject DID differs from the active catalog holder DID for any mapped sandbox identity.
- Certified SHL route test: a Wallet request using the canonical Portal Share
  Gateway manifest URL is accepted, while alternate origins and malformed
  artifact paths are rejected.

## Acceptance evidence to return to Wallet

Return the Portal commit/PR, reseed batch ID, catalog version, migration impact, sanitized per-user counts, request IDs/correlation IDs, exact test commands, and Railway URLs tested. Confirm when Wallet may rerun all nine users. Do not ask Wallet to accept old subject DIDs or reseed issuer keys merely to hide the holder mismatch.

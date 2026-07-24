# Portal action: complete Wallet request, receive, sync, and share flows

Date: 2026-07-16

Status: Historical Portal implementation handoff; Wallet remains fail closed

Superseded runtime baseline: current Wallet/Portal compatibility uses Contract Hub `2026.07.portal-wallet.v8`, QR contract `2026.07.qr-interoperability.v1`, and Clinical Document Graph `2026.07.pcdg.v2` loaded from live Contract Hub endpoints. Do not use the v4 value below as a current compatibility gate.

## Authoritative scope

- Portal repository: `AEC-Infraconnect-2562/trustcare-hospital-network-railway`
- Wallet repository: `AEC-Infraconnect-2562/trustcare-wallet-apps`
- Retired Manus repository: `AEC-Infraconnect-2562/trustcare-hospital-network`
  (must not be used)
- Portal Sandbox: `https://trustcare-hospital-network-production.up.railway.app`
- Portal revision verified through `/api/health`:
  `797025f1267ae19c8b9f01e2d4c110b8af788786`
- Wallet production deployment verified at merge commit:
  `d386a914514607ff363e4b1a0b500dc0b06a1ec2`
- Wallet Exchange: `2026.07.wallet-exchange.v2.1.strict-w3c`
- Contract Hub: `2026.07.portal-wallet.v4`
- Clinical Document Graph: `2026.07.pcdg.v2`
- Renderer: `trustcare-render-contract-v2`

The live discovery, manifest, render contract, JSON Schema, Graph contracts,
DID Documents, JWKS, and credential status resources are the runtime source of
truth. A Git commit is provenance only and is never a compatibility gate.

## Objective

Complete the Portal provider side so a patient can use the Wallet smoothly for
all of these jobs without a Portal patient identifier, a hospital private key,
a demo fallback, or a second renderer:

1. connect and prove the Wallet-owned holder identity;
2. request one or more human-named documents from a selected hospital;
3. follow the real Maker/Checker and issuance progress;
4. receive and reconcile issued, updated, suspended, revoked, expired, and
   superseded credentials;
5. inspect the canonical document and its Graph Presentation;
6. create a new purpose-bound holder VP for a sharing event;
7. submit a direct VP or certified Share Gateway artifact to the intended
   hospital;
8. share holder-attested or hospital-certified SHL packages;
9. recover all durable state after restart, session renewal, deployment, or a
   second authorized Wallet installation; and
10. verify the same artifacts across Wallet-to-Wallet and Wallet-to-Portal
    paths.

## Non-negotiable ownership boundary

Portal owns:

- hospital `did:web`, DID Documents, JWKS, issuer status, and Cosmian KMS
  signing for TCC, TCP, and TCM;
- OIDC verification, application registration, proofed holder binding, tenant
  authorization, Maker/Checker, issuance, lifecycle/status, verifier intake,
  canonical HIS/FHIR mapping, and Portal audit;
- durable sync events, opaque cursors, request/submission resources, certified
  SHL state, Share Gateway server-side storage, and public verification
  resources.

Wallet owns:

- the holder `did:key` and private key, consent UX, selective disclosure,
  holder VP creation/signing, local durable state, Avatar cache, Graph
  Presentation projection, and canonical human-document renderer;
- exact preservation of issuer-signed VC bytes and generation of a new VP for
  every new sharing event.

Portal must never create a holder VP, receive a holder private key, trust a
Wallet-supplied `patientId`, mint a hospital-shaped credential outside its KMS,
or require Wallet to re-sign an issuer credential. Wallet must never create or
copy a hospital issuer proof.

## Baseline confirmed working

The following live path is working for all nine linked Sandbox identities:

`configuration -> test identity -> test login -> OIDC claim gate -> holder`
`binding -> DPoP session -> paginated credential sync -> verification ->`
`atomic persistence -> ACK -> Graph delta -> Graph Presentation -> Avatar`

Current evidence:

- 97 active credentials accepted and zero quarantined across
  `demo-patient-001` through `demo-patient-009`;
- all nine identity-bound portraits returned HTTP 200 and rendered without a
  wrong-person fallback;
- 105 graph artifacts were applied and every selected artifact produced all
  eight stages;
- the three negative onboarding identities returned deterministic HTTP 422
  `wallet_onboarding_required` problems;
- replay did not create duplicate credential, Avatar, Graph, or ACK records;
- public Contract Hub resources currently return `ETag`, `Content-Digest`,
  contract-version headers, and correlation IDs.

Do not rebuild or replace the working session, DPoP, sync, persistence,
`holderPresentation`, Graph V2 consumer, or canonical renderer layers.

## P0: required Portal work

### P0.0 Live retest blockers at revision 797025f

The Wallet reran the P0 flow against Railway on 2026-07-16 without weakening
the holder, JOSE, renderer, lifecycle, or policy gates. Three Portal-side
contract conflicts currently prevent the complete acceptance path.

#### Newly KMS-issued medical certificate cannot enter the delta feed

Sanitized production evidence:

- identity: `demo-patient-003`
- requested type: `medical_certificate`
- Maker and a different Checker completed successfully;
- KMS issuance completed, but the next credential sync returned HTTP 409;
- problem code: `credential_subject_binding_mismatch`;
- sanitized detail:
  `Signed credential delivery authority is incompatible with the active Wallet holder binding (render_contract_incompatible)`;
- `X-Request-Id`: `wallet-36878d9d-3e21-4e63-8378-c232c7804da2`;
- `X-Correlation-Id`: `wxc_7a41eac4-0796-4c57-add5-e02cbb6fdfd5`.

The Portal implementation confirms the internal mismatch:

1. `server/walletExchange/credentialDeliveryAuthority.ts` requires canonical
   Wallet render data under
   `credentialSubject.data.humanDocument.renderData`;
2. `server/portability/index.ts` calls `issueMedicalCertificateVc`; and
3. that issuer calls `issueCredential` without the `patient`, `documentType`,
   or equivalent canonical `humanDocument` input that the common credential
   envelope uses to build the render contract.

This is not a holder mismatch and must not be fixed by renaming the problem,
omitting the render gate, or asking Wallet to synthesize issuer claims. Portal
must make every issuance path produce the same signed canonical render
contract before committing the issued credential or publishing a delta.

Required root fix and tests:

- build `humanDocument.renderData` inside the hospital-controlled issuance
  transaction for medical certificates and every other specialized issuer;
- run the exact signed compact JWS through the common delivery-authority gate
  before marking the request item ready or committing its outbox event;
- roll back the request/credential/outbox transaction if this pre-commit gate
  fails, leaving a deterministic operator-visible reason instead of a signed
  but undeliverable row;
- reissue the affected Sandbox credential rather than modifying its signed
  payload in place; and
- add Maker/Checker -> KMS -> delivery-gate -> sync tests for every published
  document type, including a negative fixture missing canonical render data.

#### `patient_summary` request policy conflicts with the published queue flow

Sanitized production evidence:

- identity: `demo-patient-003`;
- requested type: `patient_summary`;
- Maker claim succeeded, but Checker approval returned HTTP 412 because the
  Graph matrix classifies this type as automatic attestation and creates no
  Checker task;
- credential request trace `wallet-p0-trpc-755d3494-de3f-44e1-a062-97c03bd35107`;
- correlation trace `wxc_e64bab40-ecda-476b-9200-49e2653a2d29`.

Portal must publish one coherent rule per requestable document type. Either
the credential-request contract declares the item automatic and does not tell
Wallet to wait for Maker/Checker, or the provider workflow creates a real
independent Checker task. Wallet must not guess the workflow from a document
name. Reconcile or expire the stalled Sandbox requests created by this retest
while preserving their audit history.

### P0.1 Recover an existing SHL holder association

Confirmed production behavior:

- wallet user: `demo-patient-001`
- Manifest Credential ID:
  `urn:trustcare:seed:vc:shl_manifest:tcc:vp-opd-checkin:p001`
- Portal SHL ID: `85`
- request: `POST /api/wallet/v2/shl-associations/85`
- response: HTTP 409, code `shl_not_awaiting_holder`
- detail: `SHL status 'active' cannot accept a holder presentation`
- `X-Request-Id`: `wallet-69746874-cacd-4088-adb6-c558d7c83089`
- `X-Correlation-Id`: `5ce42af1-5101-48a0-847e-5e52aceb2b49`
- revision 797025f Desktop Browser retest first called
  `GET /api/wallet/v2/shl-associations/85` and received HTTP 404
  `shl_association_not_found`
- GET `X-Request-Id`: `wallet-30f774dd-0884-4588-94b9-3ef7be4f4eb1`
- GET `X-Correlation-Id`: `wxc_5dc8b376-2069-4852-98b8-d79633364fce`
- only after that exact absence response, Wallet created a new sharing event and
  called POST; Portal returned HTTP 409 `shl_not_awaiting_holder` because SHL
  85 is already `active`
- POST `X-Request-Id`: `wallet-904e06bb-a123-4d36-a536-a919d21118c1`
- POST `X-Correlation-Id`: `wxc_1b220343-7bc2-4cea-8419-8d464c2d308a`

The original Wallet association had already succeeded and correctly moved the
SHL from `pending_holder_presentation` to `active`. A fresh Wallet local store
could sync the Manifest VC but could not recover the existing holder
association. Discovery now publishes the templated association resource and
Wallet performs GET before signing. The production data still returns 404 for
the already-active SHL, so the UI cannot recover its exact Holder VP after
local loss, a new device, or a browser-storage reset.

The versioned DPoP-protected read endpoint now exists. Portal must reconcile
the active Sandbox rows so that it returns the original association for the
same `appId + holderDid`, or archive/reissue the fixture back to
`pending_holder_presentation`. It may additionally publish a holder-scoped
sync/Graph change containing the association, but that change must still carry
the exact original Wallet-signed Holder VP artifact.

The recovered object must bind:

`appId + holderDid + shlId + packageId + manifestCredentialId + manifestHash +`
`sourceBundleHash + holderPresentationId + consentRef + purpose + recipient +`
`audience + issuedAt + expiresAt + lifecycle/status`.

It must not expose transport secrets, a JWE content key, passcode, Portal
patient ID, or unrelated holder data. A replay with the original request bytes
and idempotency key returns the original association. A different VP for an
already-active association remains a deterministic conflict; Wallet must not
treat that conflict as success.

### P0.2 Make Sandbox SHL acceptance repeatable

Provide an operator-only, Sandbox-gated reset/reseed action or per-run fixture
namespace that can restore a selected synthetic SHL to
`pending_holder_presentation`. It must:

- be unavailable in pilot/production;
- preserve audit history rather than silently editing a signed artifact;
- revoke/archive the previous test association and reissue changed signed
  artifacts/hashes when required;
- never reset another test identity; and
- publish the resulting lifecycle and Graph deltas.

This is required so Browser E2E can repeatedly prove the actual transition
`pending_holder_presentation -> active` instead of depending on a one-time
consumable shared fixture.

### P0.3 Complete credential request through Maker/Checker and sync

The API contract already publishes POST/GET credential request endpoints. The
Portal must prove the complete provider workflow for TCC, TCP, and TCM:

1. POST creates exactly one tenant-owned request using
   `appId + holderDid + clientRequestId`; no caller-selected patient ID;
2. `targetHospitalCode` selects the source/issuing hospital and does not become
   the later share recipient implicitly;
3. GET returns the strict state machine
   `pending_review -> in_progress -> ready|partial|rejected`;
4. each requested item uses only the published item states and carries a stable
   document type, update time, and PHI-safe reason code when it cannot proceed;
5. Maker and Checker are different authorized staff actors in the selected
   tenant;
6. approval invokes the selected hospital's Cosmian KMS key and issues a direct
   W3C VC 2.x compact JWS without a `vc` wrapper;
7. issued credentials produce durable credential and Graph delta events before
   status changes to `ready` or `partial`;
8. Wallet receives the signed credential only through normal delta sync and
   ACK, never in an unsigned request-status response; and
9. rejection/cancellation/expiry remains inspectable and does not create a
   synthetic credential.

Add a versioned cancellation operation only if cancellation is a supported
patient job. Do not overload GET or mutate a state through an undocumented
field. Publish deterministic reason codes and `nextAction`/poll guidance so
Wallet can present plain-language progress without guessing.

### P0.4 Complete direct VP and Share Gateway submission intake

For both `direct_vp` and `share_gateway` transports, Portal must:

1. preserve and verify the exact Wallet-signed VP;
2. resolve the signed hospital recipient through the live Trust Registry;
3. verify holder proof, challenge/replay policy, audience, recipient, context,
   purpose, consent reference, and bounded validity;
4. verify every nested VC independently for issuer/key control, signature,
   holder subject, schema/profile, lifecycle/status, expiry, and policy;
5. route the presentation, canonical import, review task, and HIS mapping only
   to the hospital named inside the signed VP;
6. publish stable submission states
   `received -> needs_review -> accepted|partial|rejected` and per-document
   result states through the existing GET status resource;
7. include durable `presentationId`, `importId` where applicable, and a
   PHI-safe `reasonCode` for every non-successful result;
8. make the result and canonical mapping recoverable after Wallet restart or
   session renewal; and
9. generate a receipt/audit relation and Graph changes linking the VP,
   source VCs, consent, verification evidence, import/mapping, and receiving
   tenant without copying clinical payloads into logs.

For Share Gateway mode, the Portal must resolve the public artifact server-side
and prove that it contains the same compact Holder VP bytes and all declared
binding digests. The browser must never receive
`TRUSTCARE_SHARE_GATEWAY_SERVICE_TOKEN`.

### P0.5 Finish the certified SHL state machine

Keep these artifacts distinct:

1. SHL/JWE transport;
2. Portal/KMS-signed `ShlManifestCredential` (`application/vc+jwt`);
3. Wallet-signed Holder VP (`application/vp+jwt`);
4. source credential IDs/hashes and encrypted file hashes; and
5. consent/policy and verification evidence.

Required states are at least:

`pending_hospital_certification -> pending_holder_presentation -> active ->`
`suspended|revoked|expired`.

Pending, rejected, unavailable, suspended, or revoked states must never return
an unsigned Manifest Credential or allow a Certified badge. Certification
approval must be Maker/Checker governed and signed by the selected hospital key
in KMS. Association must verify exact hashes, purpose, context, audience,
recipient, consent, expiry, credential status, and holder proof before changing
state.

Portal must publish status/recovery for both the certification request and the
final association. Every lifecycle change must produce credential, SHL, and
Graph deltas so a second authorized Wallet installation reaches the same trust
state without fabricating an object.

### P0.6 Complete holder binding lifecycle and device recovery

Implement and test production OIDC Authorization Code + PKCE for Web and Mobile,
including allowlisted redirect/deep-link URIs, refresh rotation, logout, token
expiry, clock skew, and revocation. Sandbox one-click login remains isolated.

Define a versioned policy for additional devices and key recovery. A new device
must not silently generate a different DID and compare it with credentials for
the original holder. Supported choices must be explicit, for example:

- restore the Wallet-owned key through an approved Wallet recovery mechanism;
- add a separately proofed device/holder binding followed by controlled
  credential reissue; or
- revoke the old binding first, then create a new binding and reissue.

Portal must expose only public binding metadata/status to the proofed holder.
Binding or app revocation must terminate active sessions, reject DPoP requests,
change provisioning state, and create a PHI-safe audit event. It must not delete
historical VC/VP/SHL evidence.

### P0.7 Complete lifecycle and public status verification

For every hospital and every supported document profile, prove:

- issued, updated, superseded, suspended, revoked, expired, and reactivated
  where policy permits;
- unique lineage and monotonic semantic versioning without collapsing generic
  FHIR IDs such as `Patient` or `DocumentReference`;
- Bitstring Status List or an equivalently scalable public status resource;
- issuer DID/JWKS/key rotation with explicit overlap and retirement windows;
- a new signed upsert whenever payload, schema, issuer, key, selected claims,
  status binding, portrait URL/digest, or content hash changes; and
- delta events and Graph lifecycle/trust updates that retain historical signed
  bytes rather than deleting them.

Wallet will quarantine invalid, unknown-required, digest-mismatched, or
unverifiable artifacts. Portal must fix/reissue the source; Wallet will not
rewrite them.

### P0.8 Make Graph delta complete for every exchange flow

Credential request, issuance, direct VP submission, Share Gateway intake, SHL
certification/association, revocation, supersession, and canonical mapping must
write their object and Graph changes transactionally through the Portal outbox.

For Certified SHL, the graph must contain distinct nodes for transport,
Manifest VC, source files/credentials, consent/policy, Holder VP, verification
evidence, and receipt/import mapping with real typed edges. Node `contentHash`
must match exact immutable bytes. An unresolved edge may be pending but must not
be discarded or pointed to a different subject/tenant.

Graph Presentation is explanatory only. Portal must not introduce a second
document renderer or use graph metadata as proof of a VC.

## P1: interoperability, compatibility, and operations

### Contract publication

- Publish `ETag`, `Content-Digest`, `X-TrustCare-Contract-Version`,
  `X-Request-Id`, and `X-Correlation-Id` consistently on discovery and every
  public contract response. Contract Hub artifacts already publish integrity
  headers; Wallet Exchange discovery should reach the same integrity level.
- Use schema/profile versions as compatibility boundaries. Do not pin a Portal
  or Wallet Git commit.
- Additive optional changes may retain the current major only when semantics do
  not change. Required, renamed, removed, or type-changed fields require a new
  contract/profile version and migration/reissue plan.
- Publish signed sanitized provider/consumer fixtures for every supported
  document type, lifecycle state, request/submission result, SHL state, and
  Graph object.

### Renderer and portraits

- Continue issuing canonical render data under
  `credentialSubject.data.humanDocument.renderData`.
- Portal may consume `@trustcare/wallet-core` and `@trustcare/ui-web`; it must not
  fork the renderer or duplicate document schemas.
- Every portrait-bearing credential must publish the correct signed
  `portraitUrl` and optional byte digest. Avatar identity is bound only by
  `walletUserId + holderDid + credentialSubject.id`.
- A missing or failed portrait uses a neutral state. Never substitute by name,
  gender, role, hospital, or list position.
- Do not add Avatar Graph nodes until Contract Hub publishes a versioned Avatar
  object type and semantics.

### Cursor, retry, and rate-limit behavior

- Return deterministic RFC 9457 problems for foreign, invalid, stale, or
  expired cursors and state whether Wallet must retry, renew a session, or begin
  a full reconciliation.
- Preserve request/submission/certification/association idempotency across
  session renewal using `appId + holderDid + operation key`.
- Return `Retry-After` for 429/503 where applicable and keep retries safe after
  ambiguous responses or Portal restart.
- Keep sync ACK session-scoped while allowing recovery of the last committed
  cursor and pending ACK without duplicating an event.

### Observability and audit

Every success and failure should expose separate PHI-safe request and
correlation IDs. Portal audit must be able to follow:

`OIDC subject -> app/holder binding -> Wallet session -> request/submission ->`
`Maker/Checker -> issued/imported artifact -> sync event -> ACK -> Graph change`
`-> receipt/status`.

Do not log tokens, DPoP proofs, holder/issuer private keys, compact VC/VP bytes,
passcodes, JWE keys, clinical claims, or consent text. Provide operator tooling
that searches by safe IDs without exposing those values to Wallet.

### Persistence and deployment

Prove restart/deploy durability for:

- application and holder bindings;
- DPoP replay records for their security lifetime;
- sync events, cursors, receipts, pending ACK state, request/submission links,
  Maker/Checker state, lifecycle/status, and Graph outbox;
- Share Gateway artifact metadata, encrypted files, revocation/access policy,
  and persistent signing-key references; and
- SHL certification and holder association links.

No deployment may advertise a persistent capability while using ephemeral
storage or an ephemeral signing key.

## P2: next contract releases

After P0 is green, deliver independently versioned contracts and conformance
fixtures for:

1. IPS generation and rendering;
2. IHE MHD publish/search/retrieve and FHIR `DocumentReference` attachments;
3. standards-based OID4VCI offers and OID4VP authorization requests without
   replacing TrustCare holder-bound Wallet Exchange V2;
4. external-wallet interoperability for direct VC/VP and Standard SHL;
5. payer/integration-issuer artifacts for insurance-claim flows, keeping the
   payer as decision authority; and
6. optional Edge Gateway deployments using the same contracts, tenant/DID
   rules, and release train as Cloud Portal.

## Required scenario coverage

Use real Sandbox provider workflows and signed artifacts for every active
service profile:

- `opd_visit`
- `emergency`
- `referral`
- `cross_border`
- `medical_tourist`
- `insurance_claim`
- `pharmacy_dispense`

Each profile must cover one document, a small multi-VC VP, a large SHL package
where applicable, missing optional data, a missing required document request,
partial/rejected provider outcomes, lifecycle change, and cross-hospital
recipient routing.

Test data must remain synthetic and Sandbox-only. Keep the nine linked
identities and three negative onboarding identities, but add isolated fixtures
for every state transition so parallel/repeated tests do not mutate one shared
one-time object. Every portrait-bearing fixture must have the correct person
image and every `noPortrait` fixture must declare that absence explicitly.

## Portal acceptance matrix

Portal is ready for the Wallet only when all rows pass against a disposable
database and then against Railway Sandbox:

1. Web and Mobile OIDC/PKCE, holder binding, session renewal, logout, binding
   revocation, and application revocation.
2. Nine positive and three negative Sandbox identities with exact holder DID,
   subject, and portrait bindings.
3. Initial/multi-page/replay/restart credential sync and atomic ACK recovery.
4. Credential request to each hospital, real Maker/Checker approval, issuance,
   delta sync, canonical rendering, and Graph Presentation.
5. Partial, rejected, cancelled, expired, and unauthorized request outcomes.
6. Direct VP submission from each holder to a different hospital, canonical
   mapping, status polling, receipt, and Graph update.
7. Certified Share Gateway submission with exact Holder VP preservation;
   expired/revoked/tampered artifacts fail.
8. Holder-attested Standard SHL sharing without an automatic Certified badge.
9. Hospital-certified SHL Maker/Checker/KMS flow, holder association, recovery
   in a fresh Wallet store, lifecycle changes, and three-layer verification.
10. All seven service profiles and all three hospitals with no cross-tenant
    data or task leakage.
11. Issued/updated/superseded/suspended/revoked/expired credential lifecycle and
    public status verification.
12. Graph replay, missing-edge recovery, unknown optional preservation,
    unknown required quarantine, and exact node/hash/stage changes.
13. Additive contract/schema update without crash and breaking update blocked
    before state mutation/ACK.
14. Wrong app, `azp`, holder, key, DPoP `jti`/`htu`/`htm`/`ath`, cursor,
    audience, recipient, purpose, consent, issuer, status, hash, signature,
    schema, tenant, and any `patientId` at any depth.
15. Portal and Share Gateway restart/deploy while durable operations are
    pending, followed by exact idempotent recovery.
16. Desktop and Mobile Browser runs with no console/runtime errors, no
    wrong-person portrait, no duplicate record, and no verified/certified badge
    before every required proof and policy check passes.

## Required release evidence

For each Portal release, provide:

- Portal commit and Railway deployment/revision;
- old/new contract versions and schema change classification;
- endpoint, sanitized request/response, HTTP status, problem code,
  `X-Request-Id`, and `X-Correlation-Id` for every failure;
- accepted/quarantined/rejected counts by identity and document type;
- request, Maker/Checker, issuance, submission, import, SHL, and lifecycle
  state transitions;
- Graph node/edge/stage counts and selected artifact IDs;
- Avatar HTTP status/media type/person-binding results;
- restart, replay, session-renewal, and cross-device recovery evidence;
- Web/Mobile Browser screenshots and console/runtime result; and
- migrations, environment variables, security assumptions, known limitations,
  and rollback/reissue plan.

## Explicitly forbidden fixes

Do not ask Wallet to:

- accept Portal patient IDs, caller-selected subjects, or fallback holder DIDs;
- recreate `portalSync.ts`, `portalSyncMerge.ts`, or `portalWalletPush.ts`;
- accept unsigned JSON, legacy `vc`/`vp` wrappers, copied issuer fields, or a
  hospital-shaped object without a KMS signature;
- mint, re-sign, or repair a hospital VC;
- treat Graph metadata, a gateway signature, or structural presence as proof;
- mark an SHL Certified while certification/association is pending or failed;
- swallow a 409/422 and display success;
- use a real-person fallback portrait; or
- fork the renderer or pin compatibility to a Git commit.

Portal must correct the provider state, contract, signing, status, routing,
persistence, or test fixture at its source. Wallet will re-sync/re-verify a new
valid signed version and retain prior quarantine/history as evidence.

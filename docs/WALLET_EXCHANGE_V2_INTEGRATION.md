# TrustCare Wallet Exchange V2 integration

Status: active implementation on `main` and normalization branches

Portal sandbox: `https://trustcare-hospital-network-production.up.railway.app`

This document records the production integration boundary. The live Wallet
Exchange discovery, Contract Hub manifest, render contract, and schema are the
runtime source of truth. Wallet code must fail closed when their contract/schema
version, integrity headers, canonical digest, ownership rules, or required
compatibility rules do not match. A Git commit is provenance metadata only and
must never reject an otherwise compatible exchange.

## Ownership boundary

- Wallet owns the holder `did:key`, non-exportable private key, consent UX,
  minimum-necessary selection, holder-signed VP, local persistence, retry state,
  and the authoritative human-document renderer.
- Portal owns TCC, TCP, and TCM hospital `did:web` documents and keys, Cosmian
  issuer keys, Maker/Checker, credential lifecycle, incoming VP verification,
  and canonical HIS mapping.
- A Wallet request never contains or trusts a Portal `patientId`. Portal binds
  an authenticated holder DID to its own patient record internally.
- Portal never receives the holder private key and never creates a holder VP or
  SD-JWT on the patient's behalf.

## Preserve, refactor, deprecate, delete

| Classification | Components                                                                                     | Decision                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve       | `packages/wallet-core/src/credentialRenderer.ts`, `packages/ui-web/src/CredentialDocument.tsx` | Remain the authoritative renderer for `credentialSubject.data.humanDocument`; structured content is read from its `renderData`.        |
| Preserve       | Wallet document V2, holder identity, presentation envelope, proof and lifecycle policies       | Reused by Web and Mobile; stricter Portal issuer normalization is added around them.                                                   |
| Refactor       | Web receive/prepare/share flows                                                                | Use one Wallet Exchange workflow and durable persistence adapter; patients choose intent and documents, not VC/SD/ZKP transport terms. |
| Refactor       | SHL                                                                                            | SHL is encrypted transport. One holder-signed VP binds the package; an optional Portal/KMS-signed Manifest VC upgrades it after verification. |
| Deprecate      | Wallet Exchange V1 demo-login and `/api/wallet/sync` client                                    | Not exported or reachable from production integration.                                                                                 |
| Delete         | Static Wallet-owned TCC/TCP/TCM DID/JWKS registry and old Portal origin                        | No fallback is retained.                                                                                                               |
| Delete         | Seed credentials claiming the retired hospital DIDs                                            | Demo-only local credentials use an explicitly non-authoritative demo issuer; live credentials must be reissued by Portal.              |

Synthetic seed cards and payer fixtures are now sandbox-only implementation
fixtures. They are loaded only through an explicit demo runtime boundary and
use `did:web:sandbox.invalid` identities; no sandbox fixture is accepted as a
Portal issuer, and no static SHL manifest or deterministic SHL key is created.
Sandbox, pilot, and production flows require a Portal-issued credential and a
Portal Share Gateway URL.

## Runtime configuration

Set the Portal base URL once per platform:

- Web: `VITE_TRUSTCARE_PORTAL_BASE_URL`
- Mobile: `EXPO_PUBLIC_TRUSTCARE_PORTAL_BASE_URL`

Both resolve through the shared API-client origin normalizer. The Wallet app ID
is configured with `VITE_TRUSTCARE_WALLET_EXCHANGE_APP_ID` or
`EXPO_PUBLIC_TRUSTCARE_WALLET_EXCHANGE_APP_ID`. Portal must register the same
external Wallet application and bind the sandbox holder DID before a session
challenge can succeed.

The Portal URL used here is a sandbox even though its Railway hostname contains
`production`. Configure the Wallet runtime as `sandbox` while the Contract Hub
manifest is unsigned. Pilot and production runtime modes reject both unsigned
manifests and a mere `signature` field until the live contract publishes a
cryptographic signature profile and trust anchor that Wallet can verify.

No `TRUSTCARE_SHARE_GATEWAY_SERVICE_TOKEN` may be placed in a Vite or Expo
environment variable. A service token, if ever required, belongs only in a
Wallet server/BFF.

## Session, DPoP, and sync

1. The Wallet loads and integrity-checks discovery, health, manifest, render
   contract, and schema.
2. It creates a challenge and signs the exact
   `trustcare-wallet-session+jwt` with the local holder key.
3. Every protected request uses a fresh RFC 9449 DPoP proof with exact `htu`,
   uppercase `htm`, `jti`, `iat`, JWK thumbprint, and `ath` when an access token
   is present.
4. Sync uses the opaque Portal cursor and known content hashes. Issued or
   updated credentials are verified against the live hospital DID/JWKS before
   normalization. Suspended, revoked, expired, and superseded events update the
   lifecycle lineage.
5. The new state, records, cursor, and pending ACK are committed atomically.
   Only then is `/credentials/sync/ack` called. A pending ACK is recovered before
   a later sync page.

Access tokens remain in memory. Holder keys, request links, submission links,
documents, cursors, and retry state are partitioned by Portal origin and holder
DID. Browser persistence rejects extractable private keys and private JWK data.
When an authenticated local sandbox test user reloads the Web app, Wallet calls
the Portal test-login endpoint again to obtain a new short-lived test token; it
does not restore or persist the previous bearer token. Non-sandbox deployments
must use the configured OIDC authorization/refresh flow instead.

## Issuer cutover and migration

Wallet contains no TCC/TCP/TCM issuer DID constant. For each supported hospital,
the resolver requests `/hospital/{code}/did.json` and
`/hospital/{code}/did/jwks.json` from the configured Portal origin and uses the
returned DID document ID as the issuer identity. The DID document, JWKS issuer,
hospital code, active ES256 assertion method, key controller, and public key
must agree before a credential is accepted. Root/network JWKS, hostname-derived
DIDs, cross-origin lookup, and a local DID fallback are forbidden.

Credentials whose issuer is not the DID returned by current Portal discovery
are not rewritten or re-signed. They are quarantined or rejected and never
shown as verified. Portal must reissue them with its active hospital key. A
clean reseed may delete only the Wallet Exchange V2 IndexedDB namespace after
the user has confirmed that no unrecoverable holder credential remains; it
must not silently rotate the holder DID.

The current inspected renderer baseline is
`d45a8283e6440fb722cb6774ceb4f17bad0d9d4f`. It is recorded until Wallet
publishes a release manifest; it is not a compatibility gate. Compatibility is
decided by the pinned Wallet Exchange, render-contract, and JSON Schema
versions plus their integrity evidence.

Portal schema evolution must also follow
`docs/PORTAL_SCHEMA_CHANGE_COMPATIBILITY_POLICY.md`. Optional additive fields
may be preserved without becoming patient-visible; new required fields, roots,
or semantic types require a coordinated Wallet release and fail closed until
supported.

## Current implementation map

- HTTP session/DPoP/sync contract: `packages/api-client/src/walletExchangeV2.ts`
- Durable orchestration and retries: `packages/api-client/src/walletExchangeWorkflow.ts`
- Shared atomic persistence rules: `packages/api-client/src/walletExchangePersistencePolicy.ts`
- Web persistence adapter: `apps/wallet-web/src/repositories/IndexedDbWalletExchangePersistence.ts`
- Mobile persistence adapter: `apps/wallet-mobile/src/repositories/SqliteWalletExchangePersistence.ts`
- Holder-created presentation: `packages/wallet-core/src/holderPresentation.ts`
- Authoritative renderer facade: `packages/wallet-core/src/credentialRenderer.ts`
- Web renderer: `packages/ui-web/src/CredentialDocument.tsx`

Deleted legacy sync repositories or parallel presentation builders must not be
recreated. New integration work extends the modules above.

## Requests and submissions

The request UI sends patient intent, service context, selected document names,
target hospital, purpose, and a consent reference. Credential type names are
derived from the integrity-checked live service contract. Maker/Checker status
is read from the returned request status endpoint and is never simulated in a
non-demo runtime.

For direct presentation, Wallet creates and signs a new purpose-bound VP for
each event and preserves nested issuer JWT bytes exactly. Certified Share
Gateway submission is accepted only when the public artifact contains that
same holder-signed VP unchanged. Any Portal/network wrapper around it causes a
fail-closed error before submission.

Before the first direct-submission network attempt, Wallet atomically persists
an immutable outbox draft containing the exact serialized request, compact
holder VP, client submission ID, idempotency key, and SHA-256 bindings. A lost
response or application restart discovers that draft and resends the same
bytes; success atomically replaces the draft with the Portal submission link.
The UI offers an explicit patient-readable retry action and never retries over
the network merely because the application started. Access/DPoP tokens and
Portal patient IDs are forbidden in this outbox. If the short-lived VP expires
before recovery, Wallet fails closed and the patient must start a new sharing
event with a new client submission ID and newly signed VP.

## Current Portal dependencies

The following external state is required before protected live E2E can pass:

1. Register and activate the Wallet app ID used by the deployed Wallet.
2. Bind the sandbox test holder DID to a Portal test patient without exposing a
   Portal patient ID to Wallet.
3. Make certified Share Gateway artifacts preserve the compact holder-signed VP
   byte-for-byte, or publish a contract-supported nested-holder-VP structure.
4. Scope mutation idempotency across session renewal, not only within one
   session.
5. Return a deterministic 4xx problem for invalid/foreign cursors and align the
   POST credential-request state with the documented Maker/Checker state.
6. Publish a scalable public credential/status policy resolver when available;
   until then Wallet retains cryptographic proof evidence but does not claim a
   fully green verification result.
7. Publish `endpoints.shlCertificationRequests` and
   `endpoints.shlAssociations` in Wallet Exchange discovery and implement
   DPoP-protected POST/status operations. Approval must return only a
   W3C VC 2.0 direct-claims Manifest Credential declared as
   `application/vc+jwt`, signed by the selected hospital key in Cosmian KMS.
8. Provide the Mobile secure holder-key and Wallet Exchange document adapters
   to the shared SHL workflow. Mobile currently fails closed for SHL instead of
   using the retired unsigned/demo package path.

These dependencies are Portal work. Wallet must not hide them with demo data,
legacy DID lookup, or optimistic trust badges.

# Security Model

## Backend-Owned

- VC issuance and signing.
- VP creation and persistence.
- VC/VP verification.
- JWKS publication for issuer/verifier public keys.
- Revocation and credential status.
- SHL manifest generation, encryption, access policy, and audit.
- Hospital/source-of-truth synchronization.

## Wallet-Owned

- Patient-facing display.
- Patient consent and selective-disclosure UX.
- Local session handling.
- Local encrypted/offline cache where platform support exists.
- Biometric gate before sensitive QR display.
- Camera QR scanning.
- Screen-capture protection on mobile sensitive screens.

## VC/VP Signing

The browser wallet must not hold production signing private keys. When Wallet creates a share package, it publishes the VP request to a Share Gateway. The gateway signs the VP as `vp+JWT` with ES256 or EdDSA, persists the artifact, and returns a resolver URL for QR display.

Local development can use a backend-shaped share gateway with a process-local
ES256 key and in-memory artifacts. Railway production must not use that mode:
it fails startup unless `TRUSTCARE_GATEWAY_SIGNING_KEY_JWK` and `DATABASE_URL`
are configured. Production exposes stable JWKS at
`/api/share-gateway/.well-known/jwks.json`, a DID document at
`/.well-known/did.json`, signs W3C `vp+jwt` artifacts with enveloped nested
`vc+jwt` credentials, and persists artifacts in Postgres.

The production share gateway keeps resolver reads public for cross-device QR
verification, but restricts browser-origin artifact publishing to the service
origin and `TRUSTCARE_GATEWAY_ALLOWED_ORIGINS`. It rejects non-JSON publish
requests, caps JSON body size, returns `410 Gone` for expired artifacts, and
sets no-store/security headers on API responses.

The VP holder remains the Wallet holder `did:key`; the backend signing
controller is the Share Gateway `did:web`. Verifiers must validate the gateway
signature against that controller and evaluate holder/recipient/purpose binding
as a separate policy check. They must not require the backend signing key to be
controlled by the holder DID.

Production mutations require either a trusted browser `Origin` or a configured
backend bearer token. VP publication preserves existing nested `vc+jwt`
credentials and fails closed on unsigned raw credentials. Portal-synced VC
proofs must come from the original Portal/hospital issuer, and payer artifacts
must come from the allowlisted payer/integration issuer operation. Artifact IDs
are random per sharing event and immutable after first publication; only an
identical request digest may be retried under the same ID.

Green verification requires verifier-side signature validation against JWKS,
nested VC verification for VP JWT artifacts, or cryptographic W3C Data
Integrity proof verification for supported JCS suites. Payload metadata such as
`signingStatus: verified` is never sufficient proof.

For a resolver-backed VP, the verifier also requests bound verification
evidence from the same Share Gateway. The gateway re-reads the immutable stored
JWT, independently verifies the allowlisted gateway/hospital/payer signing
controllers, expiry, governed signed status references, purpose, recipient,
audience, holder binding, and recomputed package/context digests. Missing,
malformed, expired, cross-origin, or failed evidence keeps the result out of
green. Arbitrary external issuer keys are not fetched by this endpoint; Portal
or Contract Hub must provide the governed production trust integration for
those issuers.

## Shared Standards Layer

Claims, proof, JWT parsing, VC/VP payload unwrapping, proof usability,
issuer/type extraction, DID Web JWKS discovery, Data Integrity JCS
verification, and `kid` matching live in
`packages/wallet-core/src/credentialProof.ts`.

Gateway and API-client verifier code may fetch artifacts, call Portal endpoints, and compose user-facing verification results, but must not redefine proof/claim/JWKS validation primitives locally.

## Local Cache Rules

- Offline data is a convenience cache, not clinical source of truth.
- Offline QR can be displayed only before expiry.
- Logout must clear local secrets and cache.
- Web local storage keys are versioned and read defensively so stale or blocked
  storage cannot corrupt runtime state.
- Mobile refresh tokens must use SecureStore, not AsyncStorage.

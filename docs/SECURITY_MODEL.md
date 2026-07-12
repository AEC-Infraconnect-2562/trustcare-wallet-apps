# Security Model

## Backend-Owned

- VC issuance and signing.
- Hospital Manifest Credential issuance and signing through Portal/KMS.
- Incoming VC/VP verification and status services.
- JWKS publication for issuer/verifier public keys.
- Revocation and credential status.
- Share Gateway persistence, access-policy enforcement, and audit.
- Hospital/source-of-truth synchronization.

## Wallet-Owned

- Patient-facing display.
- Patient consent and selective-disclosure UX.
- Holder `did:key` and private key.
- VP creation and signing for every sharing event.
- Standard SHL manifest generation and JWE encryption.
- Local session handling.
- Local encrypted/offline cache where platform support exists.
- Biometric gate before sensitive QR display.
- Camera QR scanning.
- Screen-capture protection on mobile sensitive screens.

## VC/VP Signing

The Wallet holds only the patient's holder private key and signs every VP with
that `did:key`. Hospital private keys never enter Web, Mobile, or Share Gateway;
Portal performs hospital signing in Cosmian KMS. The Share Gateway persists the
exact holder-signed VP and returns a resolver URL without replacing or
re-signing it.

Local development can use an explicit demo Share Gateway with in-memory
artifacts. It may sign gateway-owned verification evidence only; it must not
sign a holder VP or hospital VC. Railway production requires durable storage
and stable service-key configuration for gateway-owned evidence, while
persisting the exact Wallet/Portal JWT bytes in Postgres.

The production share gateway keeps resolver reads public for cross-device QR
verification, but restricts browser-origin artifact publishing to the service
origin and `TRUSTCARE_GATEWAY_ALLOWED_ORIGINS`. It rejects non-JSON publish
requests, caps JSON body size, returns `410 Gone` for expired artifacts, and
sets no-store/security headers on API responses.

Verifiers resolve the holder `did:key` for VP proof and the live Portal
hospital `did:web`/JWKS for hospital credentials. A gateway controller is not a
substitute for either trust domain.

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

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

Local development and the Railway demo use a backend-shaped share gateway simulator: it generates an ephemeral ES256 key in Node, exposes `/api/share-gateway/.well-known/jwks.json`, signs W3C `vp+jwt` artifacts with enveloped nested `vc+jwt` credentials, and stores artifacts in memory. This is suitable for demo verification and cross-device QR testing but not for production persistence, revocation, or KMS-backed trust.

Green verification requires verifier-side signature validation against JWKS plus nested VC verification. Payload metadata such as `signingStatus: verified` is never sufficient proof.

## Shared Standards Layer

Claims, proof, JWT parsing, VC/VP payload unwrapping, proof usability, issuer/type extraction, DID Web JWKS discovery, and `kid` matching live in `packages/wallet-core/src/credentialProof.ts`.

Gateway and API-client verifier code may fetch artifacts, call Portal endpoints, and compose user-facing verification results, but must not redefine proof/claim/JWKS validation primitives locally.

## Local Cache Rules

- Offline data is a convenience cache, not clinical source of truth.
- Offline QR can be displayed only before expiry.
- Logout must clear local secrets and cache.
- Mobile refresh tokens must use SecureStore, not AsyncStorage.

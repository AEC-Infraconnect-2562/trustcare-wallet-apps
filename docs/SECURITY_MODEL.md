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

Local development uses the Vite share gateway as a backend-shaped simulator: it generates an ephemeral ES256 key in Node, exposes `/api/share-gateway/.well-known/jwks.json`, signs VP JWTs, and stores artifacts in memory. This is suitable for demo verification but not for production trust or revocation.

Green verification requires verifier-side signature validation against JWKS plus nested VC verification. Payload metadata such as `signingStatus: verified` is never sufficient proof.

## Local Cache Rules

- Offline data is a convenience cache, not clinical source of truth.
- Offline QR can be displayed only before expiry.
- Logout must clear local secrets and cache.
- Mobile refresh tokens must use SecureStore, not AsyncStorage.

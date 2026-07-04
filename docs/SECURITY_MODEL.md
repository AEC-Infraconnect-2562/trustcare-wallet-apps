# Security Model

## Backend-Owned

- VC issuance and signing.
- VP creation and persistence.
- VC/VP verification.
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

## Local Cache Rules

- Offline data is a convenience cache, not clinical source of truth.
- Offline QR can be displayed only before expiry.
- Logout must clear local secrets and cache.
- Mobile refresh tokens must use SecureStore, not AsyncStorage.


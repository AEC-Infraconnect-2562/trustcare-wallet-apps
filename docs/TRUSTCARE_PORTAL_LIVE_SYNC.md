# TrustCare Portal Live Credential Sync

## Purpose

TrustCare Wallet can run as a personal external wallet while importing real VC/VP credentials from TrustCare Portal demo users. This path must never fabricate credentials from Portal metadata. If Portal returns a wallet card with `credentialData: null`, Wallet treats that card as metadata-only and does not expose it as a usable VC/VP.

## Current Demo Contract

Wallet uses the Portal demo login flow until Portal has production authentication:

1. `POST https://trustcarehealth.live/api/auth/demo-login`
   - Request body: `{ "openId": "<portal test user openId>" }`
   - Response must include a bearer token.
2. `GET https://trustcarehealth.live/api/trpc/wallet.cardsByCategory?input=...`
   - Request header: `Authorization: Bearer <token>`
   - Response groups wallet cards by category.
   - Each importable card must include `credentialData` as a VC-like object.

Known Portal test users currently configured in Wallet:

- `demo-patient-001`
- `demo-patient-002`
- `demo-patient-003`
- `demo-hospadmin-001`

## Import Rules

Wallet imports a Portal card only when all of these are true:

- `cardType` can be normalized to a canonical Wallet document type.
- `credentialData` is a non-null object.
- The credential has a stable id from `credentialData.id`, `credentialId`, or the normalized card id fallback.

Wallet skips and reports:

- `metadata_only`: `credentialData` is `null` or absent.
- `unknown_document_type`: Portal type cannot be normalized to a canonical document type.
- `invalid_credential_data`: `credentialData` is present but not an object.

Skipped cards are not converted into local seed credentials, do not satisfy readiness, do not appear as verifiable credentials, and do not become green trust proof.

## No-Fallback Boundary

For Portal live-sync users, Wallet disables local seed fallback for:

- wallet credential cards
- presentation history
- prebuilt SHL packages
- OID/SHL test fixtures generated from local seed

This keeps the live demo honest: if Portal has not issued a VC yet, the Wallet UI reports that the credential is waiting for Portal reseed instead of silently showing old local data.

Local complete seed users still exist for package/unit testing and offline UX development, but they are not used as substitute data for Portal live-sync users.

## Production Direction

When Portal moves from demo-login to production auth, keep the same boundary:

- Portal is the issuer/source of Portal-owned VC/VP credentials.
- Wallet stores canonical `WalletDocumentRecord` / `WalletCard` objects created from signed Portal credentials.
- Wallet preserves the original `credentialData` object and proof.
- Verifiers should resolve issuer keys through Portal JWKS or DID documents, for example `https://trustcarehealth.live/.well-known/jwks.json`.
- Wallet-generated credentials require Wallet issuer keys and proof generation; they must not reuse Portal issuer identity unless Portal signs them.

## Portal Requirements Before Green Verification

Portal reseed should ensure every VC-backed card has:

- W3C VC context and type.
- Stable `id`.
- `issuer.id` that resolves to a trusted DID/JWKS path.
- `credentialSubject.id` bound to the holder DID.
- `validFrom` and `validUntil`.
- `credentialStatus` or status metadata.
- `evidence` or a FHIR `DocumentReference` when the document represents hospital evidence.
- ES256, EdDSA, or W3C Data Integrity proof material accepted by the verifier.

If any of these are missing, Wallet may still display the document as imported, but trust status must remain below green until verification passes.

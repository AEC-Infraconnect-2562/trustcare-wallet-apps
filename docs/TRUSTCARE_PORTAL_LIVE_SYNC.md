# TrustCare Portal Live Credential Sync

## Purpose

TrustCare Wallet can run as a personal external wallet while importing real VC/VP credentials from TrustCare Portal demo users. This path must never fabricate credentials from Portal metadata. If Portal returns a wallet card with `credentialData: null`, Wallet treats that card as metadata-only and does not expose it as a usable VC/VP.

## Current Demo Contract

Wallet uses the Portal demo login flow until Portal has production authentication:

1. `POST https://trustcarehealth.live/api/auth/demo-login`
   - Request body: `{ "openId": "<portal test user openId>" }`
   - Response must include a bearer token.
   - The live Portal rejects the old `{ "username": "..." }` body. Wallet tests lock this to `openId` so sync cannot silently fall back to local seed data.
2. `POST https://trustcarehealth.live/api/wallet/sync`
   - Request header: `Authorization: Bearer <token>`
   - Request body: `{ "includePresentations": true, "limit": 1000 }`
   - Response includes flat `credentials[]`, optional `presentations[]`, `syncedAt`, `total`, `hasMore`, and `nextSince`.
   - Each importable credential must include `credentialData` as a VC-like decoded object.
   - For green verification, each credential must include the new proof envelope:
     `{ "proof": { "type": "jwt", "jwt": "<signed SD-JWT-VC>", "alg": "ES256", "kid": "<issuer key id>" } }`.
   - Wallet reads `proof.jwt` as the primary cryptographic source. Older top-level `jwt`, `sdJwt`, `credentialJwt`, `signedCredential`, or `credentialEnvelope.jwt` fields are treated only as compatibility inputs for older Portal deployments, never as fabricated fallback data.
3. `POST https://trustcarehealth.live/api/wallet/sync/verify`
   - Request header: `Authorization: Bearer <token>` when available.
   - Request body: `{ "jwt": "<signed VC JWT or SD-JWT-VC>" }`
   - Response returns deterministic trust status, for example `{ "verified": true, "trustLevel": "green", "status": "verified", "message": "Signature, status, and trust checks passed." }`.
   - Portal verifies the ES256 signature, issuer trust, and DB status such as revoked, suspended, or expired before returning green/yellow/red.
4. `POST https://trustcarehealth.live/api/wallet/sync/did-resolve`
   - Public DID resolver for `did:web:trustcare.network:hospital:<code>`.
   - Wallet uses this path and `/hospital/:code/did.json` / `/hospital/:code/did/jwks.json` for issuer public-key discovery.

## Browser Demo Requirements

GitHub Pages and localhost run entirely in the user's browser. Portal sync therefore requires CORS support on the live Portal API, not only server-to-server reachability.

Portal must allow these origins during the demo phase:

- `https://aec-infraconnect-2562.github.io`
- `http://localhost:*`
- `http://127.0.0.1:*`

Required endpoints:

- `POST /api/auth/demo-login`
- `POST /api/wallet/sync`
- `GET /api/wallet/sync/status`
- `POST /api/wallet/sync/verify`
- `POST /api/wallet/sync/did-resolve`

The `OPTIONS` preflight response should allow at least `POST, GET, OPTIONS` and headers `content-type, authorization`. If CORS is missing, Safari/Chrome reports a browser-level `Load failed` / `Failed to fetch` error even when Node or backend checks can call the same endpoint successfully.

For person photos, Wallet prefers Portal-hosted `/manus-storage/<file>` URLs because the current live `/api/storage-proxy/<file>` route can return an HTML gateway error. Wallet normalizes older `/api/storage-proxy/<file>` values back to `/manus-storage/<file>` before rendering. Production can keep either route, but the route returned in credential/user payloads must be browser-readable without requiring private cookies.

Known Portal test users currently configured in Wallet:

- `demo-patient-001`
- `demo-patient-002`
- `demo-patient-003`
- `demo-hospadmin-001`

## Import Rules

Wallet imports a Portal credential only when all of these are true:

- `cardType` can be normalized to a canonical Wallet document type.
- `credentialData` is a non-null object.
- `credentialData` is VC-like: it has `type: ["VerifiableCredential", ...]` or a `credentialSubject`.
- The credential has a stable id from `credentialData.id`, `credentialId`, or the normalized card id fallback.
- The document type is in the current VC/VP sync scope. `shl_manifest` and `sync_receipt` are trust artifacts and are skipped in this VC/VP-only sync phase.
- If `proof.jwt` is present, Wallet stores it as `credentialJwt` and preserves proof metadata (`type`, `alg`, `kid`, disclosure metadata) on the Wallet card for verifier/debug UI.

Wallet skips and reports:

- `metadata_only`: `credentialData` is `null` or absent.
- `unknown_document_type`: Portal type cannot be normalized to a canonical document type.
- `invalid_credential_data`: `credentialData` is present but not an object.
- `out_of_scope`: the credential is a known trust artifact that is intentionally not imported by the VC/VP-only sync button.

Wallet maps Portal `identity` to `staff_identity` when the active wallet user is staff or the VC type/display name is staff-oriented. This prevents hospital staff cards from being rendered as patient identity cards.

Skipped cards are not converted into local seed credentials, do not satisfy readiness, do not appear as verifiable credentials, and do not become green trust proof.

## No-Fallback Boundary

The web app does not auto-sync on page load. Users must explicitly press `Sync Portal` while logged into a specific wallet user.

Manual sync is scoped by the active wallet user:

- Wallet logs into Portal with that user's `portalOpenId`.
- Imported cards must have `ownerUserId` equal to the active wallet user id.
- Empty sync-test wallets remain empty unless Portal recognizes their `portalOpenId`.
- If Portal demo-login returns 404, Wallet reports the error and does not fall back to another user or local seed.

For explicit Portal sync output, Wallet clears or replaces local SHL packages in the current session because the current sync scope is VC/VP only. It does not fabricate:

- wallet credential cards
- presentation history
- prebuilt SHL packages
- OID/SHL test fixtures generated from local seed

This keeps the live demo honest: if Portal has not issued a VC/JWT yet, the Wallet UI reports that the credential is waiting for Portal reseed or JWT envelope instead of silently showing old local data or a fake green badge.

Local complete seed users still exist for package/unit testing and offline UX development, but they are not used as substitute data for Portal live-sync users.

## Production Direction

When Portal moves from demo-login to production auth, keep the same boundary:

- Portal is the issuer/source of Portal-owned VC/VP credentials.
- Wallet stores canonical `WalletDocumentRecord` / `WalletCard` objects created from signed Portal credentials.
- Wallet preserves the decoded `credentialData` object for display and the signed `credentialJwt`/SD-JWT-VC envelope for cryptographic verification.
- Wallet keeps proof metadata separate from user-disclosable VC context. Technical proof fields, JWTs, signatures, hashes, and watermark/rendering metadata must not appear as selectable disclosure claims.
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

# TrustCare SHL Gateway Architecture

Status: Wallet Exchange V2 hard cutover

This document describes the current SHL boundary. The live discovery and
Contract Hub resources from the configured TrustCare Portal are authoritative.
There is one production model with two explicit trust modes. No legacy SHL
certification request, unsigned credential, or automatic fallback is accepted.

## Responsibility boundary

- Wallet selects the minimum necessary documents, owns the holder `did:key`,
  signs one holder VP, and encrypts every SHL file.
- Portal or another accountable integration issuer signs the Manifest VC. A
  Wallet or Share Gateway key must never impersonate TCC, TCP, or TCM.
- Portal publishes and resolves the encrypted manifest/files, enforces expiry,
  access count, passcode, revocation, and audit policy.
- SHL is transport. The holder VP, optional hospital-signed Manifest VC, and
  exact manifest/plaintext/JWE hashes are the trust layer.
- Wallet Exchange requests and SHL artifacts never contain or trust a Portal
  `patientId`. Portal binds the authenticated holder DID internally.

## Runtime source of truth

The Wallet loads these resources from the single configured Portal origin and
fails closed when version, schema, ETag, Content-Digest, canonical digest, or
compatibility checks fail:

```text
GET /api/wallet/v2
GET /api/wallet/v2/health
GET /api/public/wallet-contracts/manifest
GET /api/public/wallet-contracts/render-contract
GET /api/public/wallet-contracts/schema
```

The discovery document supplies the Share Gateway endpoint. Production code
must not substitute a localhost, Wallet-owned hospital DID/JWKS, V1 sync
endpoint, or client-generated manifest endpoint when discovery is unavailable.

## Trust modes

### `holder_attested`

The Wallet creates the Standard SHL manifest and encrypted JWE files, then
signs one VP JWT with the holder `did:key`. That VP binds holder DID, SHL
package ID, manifest URL/hash, plaintext and JWE file hashes, source credential
IDs/hashes, purpose, recipient/audience, consent reference, issue time, and
expiry. It is immediately shareable as Standard SHL and is never labelled as
hospital-certified.

### `hospital_certified`

1. Wallet validates document ownership, lifecycle, original issuer proof, and
   live Portal hospital DID/JWKS evidence.
2. Wallet serializes each selected document, records its plaintext hash,
   encrypts it as compact JWE with A256GCM and a unique IV, and records the JWE
   hash.
3. `prepareHolderAttestedShl` creates the holder VP and exact certification
   request without creating a Manifest Credential.
4. Wallet sends that request through Wallet Exchange V2 with DPoP. Portal runs
   Maker/Checker and signs a W3C VC 2.0 direct-claims Manifest Credential with
   the responsible hospital `did:web` key in Cosmian KMS.
5. `finalizeCertifiedShl` accepts only `application/vc+jwt`, verifies the
   hospital signature, issuer/kid, issuer and credential status, holder,
   manifest/file hashes, purpose, audience and expiry, then associates it with
   the original holder VP byte-for-byte. The Wallet does not sign again.
6. The gateway publishes the encrypted files and trust artifacts. A service
   token, if required, is used only by a Wallet server/BFF and is never placed
   in a Vite or Expo bundle.
7. Wallet displays the canonical `shlink:/...` payload or a public viewer URL
   that retains the canonical SHL value. Passcodes are delivered separately.

The implementation is shared in
`packages/wallet-core/src/certifiedShl.ts`. The older
`packages/wallet-core/src/shlGateway.ts` remains a clearly synthetic demo
transport helper only and is gated by the explicit `demo` runtime. It must not
be called by Wallet Exchange V2 or silently selected in sandbox, pilot, or
production.

## Verification order

1. Resolve the SHL manifest and enforce passcode, expiry, access-count, and
   revocation policy.
2. Decrypt each file and compare both ciphertext and plaintext hashes.
3. Verify the Manifest VC against its original issuer DID/JWKS and require the
   exact prepared manifest digest.
4. Verify the original holder VP against the holder `did:key`, recipient,
   purpose, context, consent reference, audience, expiry, SHL package ID, and
   every source/file hash.
5. Verify every nested VC against its own issuer DID/JWKS, credential status,
   schema, expiry, and policy. Never use the gateway key as fallback for a
   hospital VC.
6. Render documents through the shared Wallet renderer from
   `credentialSubject.data.humanDocument.renderData`.

No UI may display a green verified/trusted state until all required proof,
issuer, status, expiry, and policy checks have actually passed.

## Persistence and recovery

- Publication metadata, encrypted files, signing-key reference, access policy,
  audit records, and revocation state must survive restart/deploy.
- A gateway advertising ephemeral storage or an ephemeral signing key is not
  production-ready.
- Retrying a publication uses a durable idempotency identity. It must not create
  a second logical package after session renewal or an ambiguous response.
- Wallet local sync state commits documents, cursor, and pending ACK atomically
  before acknowledging Portal.

## Configuration

Web and Mobile resolve the Portal origin through the shared API-client
normalizer:

```text
VITE_TRUSTCARE_PORTAL_BASE_URL
EXPO_PUBLIC_TRUSTCARE_PORTAL_BASE_URL
```

The Railway Portal hostname used by this project is a sandbox even though its
hostname contains `production`. Use Wallet runtime `sandbox` until Contract Hub
publishes a verifiable signed manifest and all pilot/production trust services
are available.

## Required negative tests

- wrong/retired hospital DID and Wallet-owned hospital JWKS
- gateway key used to sign a hospital VC
- stale or revoked Manifest VC
- modified manifest, plaintext, JWE, selected claims, recipient, purpose,
  audience, expiry, consent reference, or digest
- reused IV or missing encryption key
- `patientId` at any depth
- Share Gateway wrapper that replaces the holder-signed VP
- copied hospital issuer claims, unsigned JSON credentials, VC JWT wrappers,
  wrong issuer/kid/signature/hash/audience/expiry/status
- expired/revoked credential or unknown required contract field
- lost response followed by retry/session renewal

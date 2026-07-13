# Portal handoff: Wallet sync succeeds but credentials cannot be verified/rendered

Date: 2026-07-13 (Asia/Bangkok)

Status: Portal action required; Wallet remains fail closed

## Scope and sanitized evidence

The Wallet used the live sandbox at
`https://trustcare-hospital-network-production.up.railway.app` with test user
`demo-patient-001` and a Wallet-owned holder `did:key`.

The following path succeeded:

`configuration reload -> test-login -> holder binding -> DPoP session -> POST /api/wallet/v2/credentials/sync`

The sync response was HTTP 200 and contained 16 changes.

- Endpoint: `POST /api/wallet/v2/credentials/sync`
- HTTP status: `200`
- Latest `x-request-id`: `wallet-5132fbbd-859a-47c6-aeff-1d649788d47e`
- Previous confirming `x-request-id`:
  `wallet-4ea7c889-3368-48d3-b63d-e74856dd428f`
- `correlationId`: not present in the successful response headers
- Response schema: `trustcare.wallet.sync.v2`
- Payload data in this report is limited to type names and validation outcomes;
  no patient claim values, access tokens, holder private keys, or JWTs are
  recorded.

Public issuer resolution also returned HTTP 200:

- `GET /hospital/tcc/did.json`, `x-request-id`
  `wxq_c3492e2b-5935-4977-ab76-89b459ef2c67`
- `GET /hospital/tcc/did/jwks.json`, `x-request-id`
  `wxq_faa83ee6-d60b-45f9-9311-a5e804e99d5c`

The DID and JWKS agree on the issuer DID, hospital code, active ES256 key, and
public key. The DID document is a standards-shaped document without the
optional proprietary `trustcare` metadata block; Wallet now accepts that shape
while still rejecting `syntheticTestData: true` when such metadata is present.

## Blocking results

None of the 16 changes passed the complete verification -> normalization ->
shared-renderer gate.

The same result was reproduced in two independent live runs. This rules out a
stale browser cache or one-off DPoP/session failure: both runs opened a fresh
session and received HTTP 200 from the sync endpoint.

1. Every credential JWT used a `kid` that was present as historical key
   material but was not the current DID `assertionMethod`. Wallet therefore
   returned `Credential kid is not governed by the Portal hospital DID.`
2. Three changes had a canonical sync `contentHash` mismatch (`shl_manifest`,
   `pharmacy_dispense`, and `mpi_link_certificate` in this run).
3. Fifteen changes contained `credentialSubject.data.humanDocument`, but none
   contained the render contract's required `document` block. Their data used
   top-level title/time/section fields instead.
4. One older `shl_manifest` had neither a canonical human document nor a
   signed document type. It must not be upgraded to a certified manifest or
   rendered through a fallback.
5. Sync metadata uses canonical lowercase document names while signed VC
   `type` uses W3C credential class names. Wallet now compares these through
   the canonical document-type map rather than requiring identical spelling;
   this is not a remaining blocker.

The Wallet deliberately did not persist these credentials as usable documents,
did not ACK them as applied, did not show a green trust badge, and did not
construct an unsigned/legacy render payload.

## Required Portal remediation

1. Reissue/reseed the test credentials with a key currently authorized in the
   hospital DID `assertionMethod`, or publish an explicit governed historical
   assertion/status policy that Wallet can verify. Merely leaving an old key in
   `verificationMethod` or JWKS is insufficient authorization.
2. Recompute the sync `contentHash` over the exact signed credential payload,
   proof JWT, and lifecycle status for every event.
3. Make issued credentials conform to the live render contract:
   `credentialSubject.data.humanDocument` with required `document` block and
   any optional blocks declared by the contract.
4. Delete or reissue stale SHL seed artifacts. A hospital-certified SHL may
   return only a Portal/KMS-signed Manifest VC after Maker/Checker approval and
   must remain bound to the holder VP and package/file hashes.
5. Return `correlationId` (or document `x-request-id` as the canonical success
   correlation field) on successful protected responses so cross-system audit
   evidence can be joined.
6. Rerun the Wallet opt-in live tests and Browser E2E after reseed/reissue.

## Retest acceptance

Portal remediation is accepted only when the same test proves:

- live contracts pass ETag, Content-Digest, canonical digest, version, and
  compatibility checks;
- every clinical credential verifies against the current Portal DID/JWKS;
- every content hash matches;
- required render blocks exist;
- each credential normalizes to `WalletDocumentRecordV2` and renders through
  the shared Wallet renderer without exception;
- invalid/stale trust artifacts are quarantined without blocking valid
  documents;
- Browser Sync persists/ACKs the valid outcomes and displays them on desktop
  and mobile without console/runtime errors.

Schema evolution rules for future Portal changes are defined in
`docs/PORTAL_SCHEMA_CHANGE_COMPATIBILITY_POLICY.md`.

# Portal schema change compatibility policy

Status: authoritative Wallet/Portal integration policy

This document tells Portal implementers which live contract and credential
changes the TrustCare Wallet can consume without a coordinated Wallet release.
It applies to Wallet Exchange V2 sync and to the authoritative renderer in
`@trustcare/wallet-core` and `@trustcare/ui-web`.

The live endpoints remain the source of truth:

- `GET /api/wallet/v2`
- `GET /api/wallet/v2/health`
- `GET /api/public/wallet-contracts/manifest`
- `GET /api/public/wallet-contracts/render-contract`
- `GET /api/public/wallet-contracts/schema`

Wallet reloads these resources, verifies `ETag` and `Content-Digest`, checks the
canonical manifest digest, and evaluates compatibility before it opens a DPoP
session or applies a sync page. Cached copies and a Git commit hash are not
compatibility evidence.

## Current compatibility baseline

| Contract | Supported value |
| --- | --- |
| Wallet Exchange | `2026.07.wallet-exchange.v2.1.strict-w3c` |
| Portal Wallet contract | `2026.07.portal-wallet.v4` |
| Renderer contract | `trustcare-render-contract-v2` |
| Credential render root | `credentialSubject.data.humanDocument` |
| Required render blocks | `document` |
| Legacy read/write | none / forbidden |

The renderer accepts `humanDocument.renderData` as the structured content
inside the canonical `humanDocument` root. Portal must not move the root back
to `credentialSubject.humanDocument`, write a parallel legacy payload, or ask
Wallet to infer data from unsigned sync metadata.

## Change classes

| Portal change | Wallet behavior | Portal action |
| --- | --- | --- |
| Add an optional field inside an existing `renderData` block | Accepted. Unknown data is preserved; known fields continue to render. | Keep the field optional and add a fixture/test if it should become visible. |
| Add a new optional `renderData` block | Accepted without breaking existing documents. The current renderer ignores it until a Wallet release maps it to UI. | Add it to `optionalBlocks`; do not depend on it for clinical meaning yet. |
| Add an optional root block to the Contract Hub JSON Schema | Accepted when declared in `properties` but omitted from root `required`. | Preserve the current contract versions and integrity headers only if existing semantics are unchanged. |
| Add a new credential/document type | Sync envelope can be received, but it is not display-compatible until Wallet supports its canonical type, renderer profile, disclosure policy, and tests. | Coordinate a Wallet release before issuing it to patients. |
| Add a required render block or required Contract Hub root block | Rejected at contract compatibility gate. Sync is not applied. | Publish a new contract/profile version and obtain Wallet support first. |
| Rename, remove, or change the type of a required field | Rejected or the affected credential is quarantined. It is never rendered as verified. | Treat as breaking; version the contract and migrate/reissue credentials. |
| Change `primaryPath`, renderer version, ownership, proof profile, DID/JWKS rules, or DPoP profile | Rejected before protected exchange. | Coordinate a Wallet release and conformance run. |
| Change signed credential payload, issuer, status, expiry, holder, or content hash | Existing signed bytes are not rewritten. Invalid/mismatched credentials are quarantined. | Reissue with the Portal hospital key and publish a new sync event. |
| Add an unknown optional sync response field | Accepted by the wire parser only when the pinned envelope contract still validates. | Do not use it as required behavior until the contract is versioned. |
| Add an unknown required sync field or event variant | Fail closed; no optimistic ACK. | Version Wallet Exchange and coordinate support. |

"Accepted" does not mean an unknown field is automatically shown. It means the
credential can still be verified, stored, and rendered from the fields already
defined by the current profile. New patient-visible meaning requires a Wallet
renderer change and visual tests on Web and Mobile.

## Per-credential processing rule

For every `credential.upsert`, Wallet must complete all of these steps before a
document becomes visible:

1. Validate the Wallet Exchange envelope and holder binding.
2. Resolve the current hospital `did:web` and JWKS from Portal.
3. Verify the VC JWT signature, issuer, `kid`, holder, signed credential type,
   lifecycle/status evidence, and canonical content hash.
4. Read only the canonical `credentialSubject.data.humanDocument` payload.
5. Normalize it to `WalletDocumentRecordV2` without rewriting or re-signing it.
6. Atomically persist document, lineage, cursor, event receipt, and pending ACK.
7. Render through `credentialRenderModelFromCard` and the shared
   `CredentialDocument` component.
8. ACK only the outcomes committed locally. Invalid credentials receive a
   rejected outcome and a quarantine record; other valid credentials in the
   page remain usable.

No production path may fall back to demo data, a legacy hospital DID, a copied
issuer object, an unsigned human document, or a second renderer.

## Portal pre-deploy checklist

Before Portal changes a contract, schema, or issued credential payload:

1. Classify the change as optional/additive or required/breaking using the table
   above.
2. Update manifest, render contract, and JSON Schema together; regenerate exact
   `ETag`, `Content-Digest`, and canonical manifest digest.
3. Do not change an existing version's required semantics. Publish a new
   version for every breaking change.
4. Provide sanitized fixtures for every affected document type, including a
   signed VC JWT and lifecycle/status response.
5. Run Wallet contract-loader, sync-normalization, renderer, photo-source, Web,
   Mobile, and Browser E2E tests before enabling issuance.
6. Confirm one malformed/new credential is quarantined without deleting or
   hiding unrelated valid documents.
7. Reissue credentials when signed payload structure changes; never mutate the
   payload while retaining the old proof or content hash.

## Required release evidence

A coordinated Portal/Wallet change is ready only when the report includes:

- old and new contract/profile versions;
- changed required and optional fields;
- live endpoint `ETag` and `Content-Digest` verification;
- sync counts and per-event applied/rejected outcomes;
- credential types verified, normalized, persisted, and rendered;
- desktop and mobile Browser screenshots/runtime-error check;
- migration/reissue plan and rollback behavior.

Arbitrary future schema changes are intentionally not promised to work. The
guarantee is narrower and safer: compatible additive changes do not crash the
Wallet, while unknown required or semantically breaking changes stop at a
visible compatibility boundary instead of producing incorrect health data.

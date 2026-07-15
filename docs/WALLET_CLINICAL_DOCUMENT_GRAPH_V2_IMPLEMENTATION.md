# Wallet Clinical Document Graph V2 Implementation

Status: implemented against Portal commit `115e53e` and the live Railway
Contract Hub. This note records the Wallet consumer boundary; the Portal
handoff remains authoritative for producer behavior.

## Ownership and data path

- Wallet Exchange V2 remains the only Portal exchange path. The graph delta is
  fetched from the discovery-provided
  `/api/wallet/v2/clinical-document-graph/changes` endpoint in the same
  holder-bound DPoP session used by credential sync.
- Wallet never sends `patientId`, `subjectId`, or a tenant selection. It checks
  the returned `subjectReference` against its local holder `did:key` before
  applying a page.
- Portal owns hospital `did:web`, issuer/KMS operations, graph trust decisions,
  Maker/Checker state, and the holder-authorized delta producer.
- Wallet owns the holder private key, local graph persistence, projection,
  consent, Holder VP signing, and the canonical document renderer.
- Graph Presentation is an unsigned, PHI-minimized explanation rebuilt from
  local graph state. It is never stored as a VC, VP, SHL manifest, or document.

Retired `portalSync.ts`, `portalSyncMerge.ts`, and `portalWalletPush.ts` are not
used or recreated.

## Live contract gate

Before Exchange is used, the Wallet loads without cache and verifies:

- Wallet Exchange discovery and health;
- manifest, render contract, root schema, Clinical Document Graph contract,
  and Graph Presentation schema envelope;
- `ETag` and RFC 9530 `Content-Digest` against canonical JSON bytes;
- graph contract `2026.07.pcdg.v2`, presentation schema `$id`, discovery URL
  coherence, renderer ownership, and the ordered eight-stage schema.

An unknown contract major, schema major, schema/profile, required semantic, or
immutable digest mutation is fail-closed. The affected change is quarantined;
independent valid changes on the same page still apply. Additive descriptor
fields are preserved in the descriptor extension bag.

## Persistence and recovery

Web IndexedDB upgrades the existing `wallet-exchange-v2@2` database in place to
version 3 so holder keys and acknowledged Exchange state remain intact. Mobile
uses the existing SQLCipher generic record table. Both adapters partition by
Portal origin plus holder DID and atomically commit:

- `clinical_graph_objects`
- `clinical_graph_edges`
- `clinical_bundle_members`
- `clinical_graph_changes`
- `clinical_graph_cursors`
- `clinical_graph_quarantine`

Certified SHL requests reuse the existing durable credential-request link. The
persisted binding contains the package/manifest/file hashes, purpose,
recipient, consent, source credential IDs/hashes, and the original
holder-signed VP. It deliberately excludes the SHL content key and encrypted
file bodies. After a Portal-signed `ShlManifestCredential` arrives through the
normal credential delta, Wallet re-verifies the issuer/status/signature and all
exact bindings, then persists the Manifest VC ID/JWT, Holder VP ID/JWT, package
ID, manifest hash, and source VC links as one certified association. Pending,
rejected, unavailable, unsigned, or mismatched responses remain uncertified.

The opaque cursor advances only in the transaction that persists the applied
objects and change audit. `changeId` and the Portal change-set idempotency key
are retained. At-least-once replay does not duplicate objects, edges,
memberships, audit records, or quarantine rows.

## Projection and rendering

The Wallet traverses only locally known, holder-partitioned and
tenant-compatible endpoints, with a 500-object safety limit. Unresolved edges
remain durable but do not become visible relationships until both endpoints
are present. The projection always emits the ordered stages:

1. Source
2. FHIR
3. Document
4. Retrieval
5. Attestation
6. VC
7. SHL
8. Holder VP

A stage is available only when a local node supports it. Missing applicable
evidence is pending; invalid, revoked, rejected, deleted, or quarantined paths
are blocked. Portal-reported graph trust state is labelled as Portal-reported
and is not promoted to the Wallet's green verified state.

The graph UI shows the selected ID, object and edge counts, object hashes, and
typed links. A Certified SHL therefore keeps SHL transport, Manifest VC,
document/file objects, and Wallet-signed Holder VP as separate nodes. Selecting
an available underlying document returns to `@trustcare/ui-web`'s canonical
`CredentialDocument`; no graph renderer or duplicate document schema exists.

## Compatibility policy for Portal changes

- Additive optional fields: preserved and ignored by older UI where safe.
- Unknown required semantics: quarantined and shown blocked.
- Unknown or newer schema major: quarantined pending a Wallet release.
- Unknown contract major or holder/partition mismatch: the page is rejected
  and its cursor is not committed.
- Immutable artifact changes: require a new object/version plus typed
  supersession; in-place digest changes are quarantined.
- Graph/list/object changes are idempotent by `changeId` and opaque cursor.

The Portal must publish a new contract major and an explicit migration for a
breaking change. Missing fields never trigger a demo or legacy fallback.

## Live sandbox acceptance - 2026-07-15

The current implementation passed the strict live flow for all nine linked
Portal identities and the expected onboarding failure for all three negative
identities. It also passed desktop and mobile Browser E2E for canonical
rendering, identity-bound portraits, consent-gated Holder VP creation, SHL
association, Graph synchronization, and idempotent replay. Detailed counts and
release evidence are recorded in
[`PORTAL_SANDBOX_AVATAR_SHL_E2E_ACCEPTANCE_2026-07-15.md`](./PORTAL_SANDBOX_AVATAR_SHL_E2E_ACCEPTANCE_2026-07-15.md).

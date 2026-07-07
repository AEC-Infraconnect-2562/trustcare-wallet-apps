# TrustCare Portal Wallet Sync and Push Contract

This document records the Wallet-side contract for the current Portal pull sync and the future Wallet-to-Portal push flow.

## Pull Sync: Portal to Wallet

The Wallet calls TrustCare Portal with a configured `portalOpenId`. Wallet-local user ids must not be used as a fallback login id. If a wallet user has no known Portal identity, Portal sync is disabled for that wallet.

Synced VC/VP payloads that should render as medical documents must follow `docs/PORTAL_WALLET_RENDER_CONTRACT.md`. In particular, `credentialSubject.humanDocument.renderData` is the canonical renderer payload. Portal and Wallet should not derive display details from different legacy fields.

Request body sent to `POST /api/wallet/sync` includes:

- `includePresentations: true`
- `limit: 1000`
- `knownCredentials`: the Wallet's active TrustCare Portal credentials with `credentialId`, canonical `cardType`, lineage key, version hint, timestamps, content hash, and status.

The Portal may use `knownCredentials` for incremental sync, but the Wallet still performs local deduplication and version checks because the Portal may return a full credential set.

## Wallet Merge Rules

Wallet sync is lineage-first, not array-replace:

- Same lineage and same fingerprint: keep one active credential and refresh trust metadata.
- Same lineage and newer version/time/content: replace active credential and archive the previous credential as a superseded Store object.
- Same lineage and stale version/time: ignore incoming stale credential.
- New lineage: add credential.

The active wallet remains scoped to the logged-in wallet user. A Portal openId can authenticate the source user, but imported cards must keep `ownerUserId` equal to the active Wallet user id.

## Future Push: Wallet to Portal

The Wallet exports a `trustcare.wallet.push.v1` draft payload through `buildPortalWalletPushDraft`.

The intended production endpoint can accept this payload later:

```http
POST /api/wallet/push
Authorization: Bearer <wallet or patient delegated token>
Content-Type: application/json
```

Required Portal-side behavior:

- Verify holder authorization and issuer trust before accepting credentials.
- Match duplicates by lineage key first, then credential id.
- Reject stale credential versions.
- Archive superseded Portal credentials instead of deleting them.
- Return per-credential results with `accepted`, `updated`, `duplicate`, `stale`, or `rejected`.

No Wallet fallback should fake a successful push before the Portal endpoint exists.

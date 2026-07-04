# Backend Integration Gaps

These gaps were found while aligning the standalone wallet apps with the current `AEC-Infraconnect-2562/trustcare-hospital-network` `main` branch.

## Mobile Auth

The existing backend primarily uses browser session/cookie auth. Native mobile production use needs an explicit mobile auth exchange, refresh, and logout flow.

Suggested routes:

```ts
auth.mobileStart
auth.mobileExchange
auth.mobileRefresh
auth.mobileLogout
```

## API Contracts Package

The standalone app currently defines compatible wallet DTOs locally in `packages/wallet-core`. Production should export `AppRouter` and DTO schemas from the backend or a dedicated contracts package to prevent drift.

## SHL Detail Bundle Shape

Current `shl.getById` returns the SHL record with `files`, `versions`, and `accessLogs`. The handoff also expects a richer `documentBundle` object. The UI supports this field when present and shows a gap state otherwise.

## Handoff File Drift

The handoff referenced these files, but they were not present by those names in the cloned `main` branch at `5603b21f3090e656fdc2280c7acbdd2fa675381a`:

- `docs/SHL_MANIFEST_DOCUMENT_BUNDLE_WALLET_HANDOFF.md`
- `docs/MOBILE_CREDENTIAL_PERSON_IMAGE_HANDOFF.md`

Nearby current files used instead:

- `docs/SHL_VC_VP_PACKET_TRUST_LAYER_HANDOFF.md`
- `docs/TRUSTCARE_SYSTEM_REALIGNMENT_HANDOFF.md`
- `docs/UX_FLOW_SYSTEM_AUDIT_2026-07-03.md`


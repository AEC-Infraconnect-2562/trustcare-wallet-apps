# Portal Sandbox Sync Acceptance — 2026-07-16

## Scope and authoritative sources

- Wallet repository: `AEC-Infraconnect-2562/trustcare-wallet-apps`
- Portal repository: `AEC-Infraconnect-2562/trustcare-hospital-network-railway`
- Portal Sandbox: `https://trustcare-hospital-network-production.up.railway.app`
- Portal revision verified through `/api/health`:
  `24c81579a173bbf8378d91d6dabb166d76293a6b`
- Wallet Exchange: `2026.07.wallet-exchange.v2.1.strict-w3c`
- Test identity schema: `trustcare.wallet.test-identities.v1`
- Test identity generation observed: `2026.07.test-identities.v7`

The catalog schema is the compatibility boundary. `catalogVersion` is retained
as opaque generation metadata and is not pinned by Wallet code. Configuration
and a fully validated catalog replace the prior in-memory generation together;
an invalid generation never becomes visible to the login UI.

## Wallet changes

1. Removed the retired `2026.07.test-identities.v4` compatibility pin.
2. Kept strict validation of all linked and negative identity attributes,
   catalog holder DID/public JWK derivation, portrait URL and Wallet key
   ownership before accepting a new catalog generation.
3. Added fail-closed validation of sandbox OIDC `iss`, `aud`, `azp`, `sub`,
   `exp`, `token_type` and the required `wallet_access` realm role.
4. Kept tokens in memory and the deterministic sandbox private keys in the
   Wallet-only test boundary. No Portal patient ID or fallback holder DID is
   accepted.

## Live acceptance results

The strict flow was run for every linked identity:

`configuration -> catalog -> test-login -> OIDC claims -> holder binding ->`
`DPoP session -> VC sync/verify/persist -> ACK -> Graph delta/presentation ->`
`Avatar`

| Identity | Accepted VC | Quarantined | Avatar | Graph artifacts | Stages |
| --- | ---: | ---: | --- | ---: | ---: |
| demo-patient-001 | 15 | 0 | HTTP 200 | 17 | 8 |
| demo-patient-002 | 14 | 0 | HTTP 200 | 16 | 8 |
| demo-patient-003 | 11 | 0 | HTTP 200 | 11 | 8 |
| demo-patient-004 | 10 | 0 | HTTP 200 | 10 | 8 |
| demo-patient-005 | 8 | 0 | HTTP 200 | 8 | 8 |
| demo-patient-006 | 12 | 0 | HTTP 200 | 12 | 8 |
| demo-patient-007 | 10 | 0 | HTTP 200 | 10 | 8 |
| demo-patient-008 | 10 | 0 | HTTP 200 | 10 | 8 |
| demo-patient-009 | 7 | 0 | HTTP 200 | 7 | 8 |
| **Total** | **97** | **0** | **9/9 ready** | **101** | **8 each** |

Replay reconciliation produced no already-known `credential.upsert`. Any later
status event remains valid delta activity and is not counted as a duplicate
credential. Every live failure path retains the Portal `X-Request-Id` and
`X-Correlation-Id` separately.

All negative onboarding identities returned HTTP 422 with
`wallet_onboarding_required`, no holder fixture and both trace identifiers:

- `portal-empty-patient-001`
- `partner-patient-001`
- `partner-patient-002`

## Browser acceptance

The repository Browser E2E passed on Desktop Chromium and a Pixel 7 viewport.
It verified a clean one-click session, holder binding, Wallet Exchange sync,
IndexedDB persistence, empty quarantine, person-bound Avatar bytes, canonical
patient identity rendering and SHL details. Desktop also proved that the
holder-association action is disabled until explicit consent and that Portal
accepts the resulting Wallet-signed Holder VP after consent.

## Validation commands

- `corepack pnpm@10.4.1 check`
- `corepack pnpm@10.4.1 test`
- `corepack pnpm@10.4.1 build:web`
- Live Vitest acceptance with all nine linked and three negative identities
- `corepack pnpm@10.4.1 exec playwright test e2e/portal-avatar-shl.spec.ts --config=playwright.config.ts`

## Security and compatibility notes

- OIDC claim checks in Wallet are a fail-fast compatibility guard. Portal
  remains the token signature and authorization enforcement point on every
  protected identity/provisioning request.
- Credential and Graph verification remain fail-closed. Unknown required
  semantics, invalid proof/status/hash/subject binding or unsupported schema
  are quarantined rather than rendered as verified.
- Avatar cache integrity is separate from issuer proof unless a signed image
  digest is present. Wallet never substitutes another person's photo.
- The retired `trustcare-hospital-network` Manus repository and retired
  `portalSync.ts`, `portalSyncMerge.ts` and `portalWalletPush.ts` paths are not
  used.

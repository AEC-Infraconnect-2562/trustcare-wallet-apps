# Current Runtime and Demo Boundaries

## Required runtime model

`demo | sandbox | pilot | production` is explicit configuration. Missing or
invalid mode is a configuration error. Demo data and demo authentication are
available only in demo. Sandbox may use real protocols against non-production
services and must be visibly labelled. Pilot/Production require real auth,
capability discovery, resolver/status services and strict contracts.

## Baseline risks found at HEAD 340217a

- Web and Mobile `env.ts` default demo login to enabled.
- API functions repeatedly use `options.demoMode ?? true`.
- Web forces demo for static/localhost and creates separate Portal demo options.
- Mobile session and Home/Detail/Prepare/Share/Store/History import seed helpers
  directly.
- Demo and production offline cache are not runtime-namespaced.
- Placeholder API URLs can coexist with a functioning demo, hiding missing
  production capabilities.
- Some Home/Records trust text is unconditional rather than derived from proof
  checks; Mobile scan collapses pending/transport-valid into invalid.

## Runtime safety rules

- Production and pilot never call `getDemo*`, `walletDemoUsers`, synthetic payer
  adapters or generated demo Contract Hub catalogs.
- No default-to-demo expression is allowed in shared API clients.
- Application shells select adapters once; screens consume interfaces.
- Offline stores are namespaced by runtime, owner and schema version.
- Environment banners are visible in demo and sandbox and absent only when the
  validated runtime is pilot/production.
- Runtime validation happens before patient data screens render.
- Missing production URLs, authentication or capability metadata produce a
  recoverable error state, not seed cards.

## Adapter target

| Environment | Wallet repository | Portal/Contract Hub | Share/verify |
|---|---|---|---|
| demo | DemoWalletRepository + synthetic fixtures | Demo clients, visibly labelled | Deterministic/sandbox issuers and gateway only |
| sandbox | IndexedDB/SQLite + test service clients | Discovered test capabilities/contracts | Public test resolver with real proof checks |
| pilot | Secure local repository + restricted production clients | Real auth, signed contracts and monitored sync | Real gateway/status/trust services |
| production | Secure local repository + production clients | Strict discovery/auth/contracts; no fallback | Real cross-device resolver, audit and revocation |


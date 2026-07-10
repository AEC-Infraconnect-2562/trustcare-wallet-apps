# Web and Mobile Parity Matrix

Status values: Ready, Partial, Missing. This is a product-semantics matrix, not
a claim that Web and Mobile must share rendering code.

| Patient capability | Web baseline | Mobile baseline | Target/shared rule |
|---|---|---|---|
| Home | Partial; useful readiness/recent modules but manual view state | Partial; currently record list with hard-coded archive/scope/trust copy | Task-first next action, sync/offline/security and active-share warnings |
| Records | Partial search/category/status; no stable route | Missing full page/search/timeline | Same repository query, trust/lifecycle/freshness and grouping semantics |
| Record detail | Modal; no refresh/deep link | Partial `/credential/[id]`, direct seed lookup | `/records/:id` equivalent, shared PortablePresentationEnvelope |
| Receive | Partial scanner/Portal demo/import | Partial scan-only combined flow | Source chooser, review, patient match, duplicate/replacement and retention |
| Prepare | Strong demo readiness/acquisition/payer UI | Partial; direct seed and no-op missing action | Shared service profile, assessment and ShareIntent handoff |
| Share | Strong partial publication/policy | Partial; protocol-first and direct seed | Recipient/purpose/records/duration review; shared recommendation semantics |
| Active Shares | Missing | Missing | Recipient, purpose, expiry/access, revoke, renew and audit |
| Activity | Seed/local scan history | Hidden seed history | Shared WalletActivityEvent repository and patient-readable filters |
| Connections | Action only | Missing | Provider/Portal discovery, connect, sync state and disconnect |
| Family/proxy | Missing | Missing | Explicit relationship, scope, expiry/revocation and audit |
| Settings/security | Partial WebAuthn/theme/developer mode | Partial biometric/capture/language/cache | Shared state meanings; platform-appropriate secure adapters |
| Verify | Strong logic, non-canonical query/hash route | Partial scan result loses pending/transport-valid nuance | Same classification and verification result states; no auto-share |

## Routing baseline

- Web has no router dependency. `App.tsx` owns `View` and manual history.
- Mobile uses Expo Router, but tabs do not yet match the five primary patient
  destinations and Prepare-to-Share loses its context parameter.
- Missing stable Web routes: record detail, service profile, share request,
  Active Shares, Activity, Connections, Family and verifier artifact.

## Release parity rule

A patient-critical Web capability must have a Mobile implementation or an
explicit, time-bounded alternative recorded here. Shared semantics live in
wallet-core/application services; UI components may remain platform-specific.


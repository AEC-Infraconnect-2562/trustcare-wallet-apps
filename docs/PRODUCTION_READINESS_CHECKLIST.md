# Production Readiness Checklist

This checklist distinguishes code readiness from Demo/Sandbox behavior. An item
is complete only with current evidence. Current evidence records the commit,
environment, date, command or URL and observed outcome; configuration or a
parseable fixture alone is not operational evidence.

## Build and architecture

- [x] Node 22.x declared; CI and Railway runtime use Node 22.
- [x] `pnpm check`, `pnpm test`, and `pnpm build:web` baseline pass.
- [x] Explicit `demo | sandbox | pilot | production` runtime model defaults to
      fail-closed production.
- [x] API clients no longer default missing configuration to demo.
- [x] Provider-neutral Wallet, Portal, Contract Hub, MHD, share and verifier
      interfaces exist.
- [x] Web has stable URL routing and SPA fallback.
- [x] WalletDocumentRecordV2 and legacy/MHD migration tests exist.
- [ ] Final post-change `pnpm check`, `pnpm test`, and `pnpm build:web` pass on
      the delivery commit under Node 22.x.
- [ ] Web and Mobile patient-critical screens all use repository/application
      interfaces rather than direct seed/API functions.
- [ ] Legacy card, stored-object and internal bundle models are fully migrated
      or isolated behind documented adapters.
- [ ] Web/Mobile parity decisions are current for every patient-critical flow,
      with each temporary platform gap documented and time-bounded.

## Trust, privacy and security

- [ ] Every green shared-renderer path, including Certified SHL, requires actual
      proof, issuer, status, expiry, holder, hash and policy verification. Separate
      Web/Mobile V2 trust mappings and final full-path evidence remain open.
- [x] Portal/payer/holder source signing responsibilities are separated.
- [x] Gateway artifact writes are idempotent and immutable by request digest.
- [ ] Gateway production mutations require an authenticated patient/service
      principal with authorization. A trusted HTTP `Origin` is a CORS/CSRF guard,
      not authentication.
- [x] Primary VP QR is resolver-backed; SHL QR remains canonical transport.
- [ ] Production issuer/status/trust-registry integrations are configured.
- [ ] Real patient authentication and secure token lifecycle are configured.
- [ ] Built Web/Mobile artifacts contain no private signing key, service token
      or other client-side signing secret.
- [ ] PHI, credentials, tokens and passcodes are absent from URLs, logs,
      telemetry and problem details; privacy-safe diagnostics are reviewed.
- [ ] No-PHI telemetry/security review and incident/revocation runbooks pass.
- [ ] Backup, restore and schema migration tests pass on production stores.

## Patient journeys

- [ ] Production onboarding and biometric recovery.
- [ ] Real provider discover/connect/sync/disconnect.
- [ ] Receive/import review including duplicate/replacement and wrong patient.
- [ ] Repository-driven Records/detail/version/original attachment.
- [ ] Prepare request/retrieve/import missing records.
- [ ] Share review, biometric, publication and Active Shares management.
- [ ] Second-device verification and failure fixtures.
- [ ] Offline emergency set and stale-data warning.
- [ ] Proxy/dependent relationship, revocation and audit.

## Accessibility and release

- [ ] Keyboard-only and visible-focus completion.
- [ ] Automated accessibility scan with reviewed exceptions.
- [ ] Thai/English screen reader and large-text review.
- [ ] 200% Web zoom and narrow/wide responsive review.
- [ ] Reduced motion and no color-only status verification.
- [ ] Five-user stressed/older-patient usability plan completed before pilot.
- [ ] Direct navigation, refresh, Back/Forward and SPA fallback pass on every
      Web route without PHI or credentials in URL state.
- [ ] Thai/English narrow/wide visual acceptance and patient-language review
      pass for every patient-critical route.

## Current evidence record

| Evidence                                    | Current record                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Phase 0 baseline                            | Recorded in `PRODUCT_CONSTITUTION.md`; it is pre-change evidence, not the final release gate |
| Final Node 22 full gates                    | Pending on the delivery commit                                                               |
| Railway deployed revision and runtime label | Pending confirmation after the final deploy                                                  |
| Gateway storage and signing-key health      | Configuration path exists; deployed health evidence is pending                               |
| Persistence after restart/redeploy          | Pending retrieval of the same published artifact and signing identity after restart          |
| Public second-device/browser verification   | Pending final deployed-revision rerun, including failure states                              |
| Web/Mobile parity review                    | Living matrix exists; final current-state review is pending                                  |

## Current environment classification

The repository's Railway build is configured as an explicitly labelled Demo
patient-data runtime. Synthetic patients and demo payer adapters are not
pilot/production clinical integrations. The gateway is configured to require
PostgreSQL storage and a server-side signing key on Railway, and exposes a public
resolver. These are production-shaped configuration paths, not proof of
durability: the deployed revision, storage mode, signing identity and retrieval
of the same artifact after restart/redeploy must be recorded before calling the
public gateway persistent. Production patient/service authentication, Portal,
Contract Hub and issuer/status governance remain external blockers.

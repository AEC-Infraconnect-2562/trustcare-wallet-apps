# TrustCare Wallet Product Constitution

Status: authoritative repository summary derived from
`TRUSTCARE_WALLET_AUTHORITATIVE_PRODUCT_CONSTITUTION_AND_CODEX_IMPLEMENTATION_SPEC_V3.md`
dated 2026-07-10. When older wallet handoffs conflict, this constitution wins.

## North star

TrustCare Wallet is a patient-controlled, portable health-document wallet. It
receives records from trusted sources, keeps them understandable and available,
and creates minimum-necessary, purpose-bound presentations for healthcare
services.

The primary patient jobs are Receive, Keep, Understand, Prepare, Share and
Control. Protocols such as FHIR, IPS, MHD, VC/VP, SHL, OID4VCI and OID4VP are
supporting mechanisms, not the primary navigation or first patient decision.

## Non-negotiable boundaries

- The Wallet is not an HIS/EMR, Portal administration console, Contract Hub
  authoring tool, trust-registry administration surface, clinical decision
  engine or payer adjudication engine.
- Providers and Portal remain authoritative for clinical facts, document
  assembly/attestation, issuer lifecycle/status and integration governance.
- Prepare assesses readiness and plans acquisition. It never publishes a
  verifier artifact.
- Share is the only patient boundary that finalizes recipient, purpose,
  disclosure, duration, consent and package publication.
- Clinical resources, immutable clinical documents, DocumentReference/MHD
  metadata, credentials/proofs, share packages and service contracts remain
  distinct domain layers.
- The four package modes are Direct VP, Purpose VP, Standard SHL and Certified
  SHL Manifest Package. Internal planning objects are never primary QR payloads.
- Verified means proof, issuer trust, holder binding, status, expiry, content
  hashes and applicable policy were actually checked. Parsing or transport
  validity alone is not verified.
- Production errors stay errors. Production never silently switches to demo
  users, seed cards, demo contracts or local-only resolver state.
- Web and Mobile share domain types, policies, workflows, copy semantics and
  state meanings even where their rendering code differs.

## Feature decision gate

Every material feature records: patient job; why it belongs in Wallet; source
of truth; visible outcome; affected domain objects; profile; lifecycle and
freshness; privacy and consent; trust checks; Portal/Contract Hub dependency;
protocol choice; offline behavior; accessibility; and cross-device retrieval.

## Phase 0 baseline

- Repository: `C:/Trustcare Wallet`
- Branch: `main`, clean and tracking `origin/main`
- Baseline HEAD: `340217ade91ddb67b818600967e1ef73a96494f0`
- `pnpm install`: completed; local Node 24.14.0 emitted the expected warning
  because the project requires Node 22.x.
- `pnpm check`: passed.
- `pnpm test`: passed; wallet-core 142 tests, API client 38 passed with the
  intentional live-gateway test skipped, Web 7 tests, gateway policy 7 tests.
- `pnpm build:web`: passed.

## Product Alignment Notes

### Phase 0 — ownership and deletion plan

Patient job: make later changes safe and coherent. This belongs in Wallet
because its product boundaries, shared contracts and runtime modes govern every
patient journey. No protocol is introduced. The outcome is an auditable map of
what is preserved, migrated and retired before implementation.

### Phase 1 — shell and repository boundary

Patient job: open, navigate and use the same Wallet safely in every runtime.
The source of truth is a `WalletRepository` selected by explicit environment;
the shell must not know whether data comes from a demo adapter, local encrypted
store, Portal or provider. Production configuration is fail-closed. Routes
contain no PHI, token, credential or passcode.

### Phase 2 — document domain V2

Patient job: understand what a record is, who issued it, when it was true,
whether it is current and whether it is trusted. V2 evolves the existing
canonical document record rather than creating another taxonomy. `WalletCard`
becomes a documented migration/transport input while V2 adds explicit
lifecycle, provenance, trust checks, original attachments, privacy and local
state.

## File disposition plan

### Preserve

- `packages/wallet-core/src/canonicalDocuments.ts` canonical taxonomy.
- Proof/source separation, Portal import/merge, shared renderer and presentation
  envelope modules.
- IPS, MHD, SHL, QR and the four share-package policies.
- Payer orchestration/adapters, while keeping decision authority external.
- Contracts, API facade tests, design tokens, i18n, Web/Mobile shared renderers,
  gateway policy tests and standards fixtures.

### Refactor

- Evolve `WalletDocumentRecord` in `canonicalDocuments.ts` into versioned V2
  with compatibility migration.
- Split `models.ts`, `AppViews.tsx` and the monolithic Web stylesheet by domain
  and page boundary.
- Put Web IndexedDB and Mobile SQLite behind shared repository contracts.
- Consume versioned service profiles through `ContractHubClient`.
- Replace direct seed calls in patient screens with repositories/workflows.

### Rewrite

- Web application shell/routing and manual `View` history.
- Web workflow-in-component composition where it prevents deep links, testing
  and source isolation.
- Mobile production data access in Home/Records/Detail/Prepare/Share/Activity;
  reusable presentation and device-security components remain.

### Deprecate after migration

- `WalletCard`/`WalletCardsByCategory` as product-domain models; retain as
  legacy/demo/API DTOs.
- `ServiceBundleEnvelope` and `buildServiceBundleEnvelope` as share artifacts;
  they remain internal readiness planning only until callers migrate.
- `ServicePacketResponse`, `CheckinQrResponse`, generic `WalletStoredObject`,
  UI-only package taxonomies and manual `View` navigation.
- Hand-authored demo Contract Hub catalogs in production paths.

### Delete only after replacement and tests

- Duplicate Documents/Receive/Store/History navigation branches.
- Static production fallbacks and direct seed imports from production screens.
- Legacy bundle/publication wrappers after all callers use `ShareIntent`,
  `SharePackage` and published artifact contracts.
- Any confirmed unused UX coverage/legacy helper. Standards, security and
  interoperability tests are not deletion candidates.


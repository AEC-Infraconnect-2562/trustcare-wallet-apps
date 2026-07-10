# Wallet Feature Boundary Matrix

| Capability | Wallet responsibility | External authority/dependency |
|---|---|---|
| Receive/import review | Patient match, source/trust explanation, duplicate/replacement review, local retention choice | Provider/Portal authenticates and returns authoritative records/proofs |
| Local records | Patient-readable index, secure/offline copy, filters, versions and original attachment access | Provider remains clinical source of truth |
| Prepare | Consume service profile, evaluate lifecycle/freshness/trust, explain ready/missing, create acquisition plan and prefilled ShareIntent | Contract Hub authors/version-controls requirements; provider supplies missing documents |
| Share | Recipient, purpose, minimum disclosure, duration/access policy, consent/biometric and one publication | Gateway resolves, stores, audits and revokes published artifacts |
| Verify | Resolve artifact and display actual crypto/status/policy checks | DID/JWKS, credential status, trust registry and gateway are authoritative |
| Payer flow | Request eligibility/pre-auth/guarantee, assemble evidence, display payer receipts/status | Payer/TPA makes every decision and signs payer artifacts |
| Portal connection | Discover, authorize, sync, disconnect and show state | Portal integrates HIS/LIS/RIS/PACS, issues/attests and governs source systems |
| Contract Hub | Cache/consume signed manifests and service profiles | Contract Hub authors, signs, deprecates and publishes contracts |
| MHD | Patient-scoped find/retrieve/provide client and understandable UI | Repository controls endpoint capabilities, auth, metadata and content |
| IPS | Validate/render provider-issued IPS and distinguish assembly/attestation | Provider/Portal assembles and attests the clinical document |
| Active Shares | Show recipient/purpose/content/expiry/access, revoke/renew and audit | Gateway supplies current status and access history |
| Family/proxy | Display explicit relationship, scope, expiry, revocation and audit | Authoritative identity/relationship service verifies representation |

## Feature decision records for the current implementation slice

### Explicit runtime and repository selection

- Patient job: safely open and keep records without accidental synthetic data.
- Wallet ownership: selecting and enforcing its local data/runtime adapter.
- Source of truth: validated runtime configuration plus repository interface.
- Visible outcome: Demo/Sandbox is clearly labelled; Production fails visibly
  when a required capability is absent.
- Trust/privacy: cached data is namespaced by owner and runtime; no PHI in URL.
- Portal dependency: production repository, auth and capability discovery.
- Offline/accessibility: repository exposes explicit offline state and errors in
  readable text, not color only.

### Route-driven patient shell

- Patient job: move predictably between Home, Records, Receive, Prepare, Share
  and managed shares; refresh/back/deep-link without losing context.
- Wallet ownership: patient navigation and local intent state.
- Source of truth: URL path contains opaque record/profile/request identifiers
  only; sensitive content stays in repositories/session state.
- Protocol: none; routing is an application-shell concern.
- Accessibility: route transitions preserve logical headings and focus targets.


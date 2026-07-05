# QA Acceptance Criteria

## Product

- Web and mobile apps share domain models, tokens, translations, and demo data.
- Wallet can use demo data without backend and can be pointed at TrustCare backend.
- Share generates exactly one resolver-backed package: DirectVP, PurposeVP, StandardSHL, or CertifiedSHLManifestPackage.
- Prepare only checks readiness and routes the user to Share with the correct purpose and documents.
- Selective disclosure requires at least one selected field.
- SHL package detail shows QR/policy/trust bindings.
- QR scanner can parse TrustCare VP URLs, resolver URLs, raw IDs, Standard SHL, and Certified SHL + Manifest VP packages with deterministic trust status.

## Security

- QR generation is disabled for revoked/expired cards.
- WebAuthn/local biometric gate runs before sensitive QR when configured.
- Offline QR and SHL access policy are expiry checked.
- Logout clears local state hooks.

## UX

- Thai text is first-class and fits mobile and desktop containers.
- Credential detail has tab/action surfaces for QR Code, SD/ZKP, PDF, details, trust checklist, and payload.
- Mobile uses bottom navigation and full-width credential detail surfaces rather than desktop sidebars.
- Home, Prepare, Share, Store, credential detail, and login must avoid desktop/mobile overlap and must keep action bars reachable.

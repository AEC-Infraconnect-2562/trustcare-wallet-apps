# QA Acceptance Criteria

## Product

- Web and mobile apps share domain models, tokens, translations, and demo data.
- Wallet can use demo data without backend and can be pointed at TrustCare backend.
- Share generates exactly one resolver-backed package: DirectVP, PurposeVP, StandardSHL, or CertifiedSHLPackage.
- Prepare only checks readiness and routes the user to Share with the correct purpose and documents.
- Selective disclosure requires at least one selected field.
- SHL package detail shows QR/policy/trust bindings.
- QR scanner can parse TrustCare VP URLs, resolver URLs, raw IDs, Standard SHL, and Certified SHL packages with separate Manifest VC and Holder VP trust results.

## Security

- QR generation is disabled for revoked/expired cards.
- WebAuthn/local biometric gate runs before sensitive QR when configured.
- Offline QR and SHL access policy are expiry checked.
- Logout clears local state hooks.

## UX

- Thai text is first-class and fits mobile and desktop containers.
- Credential detail has patient-language actions for QR, review-before-sharing, print/PDF, details, trust checklist, and payload. Primary UX must not ask the patient to choose Full VC, SD, or ZKP.
- Patient and staff identity credentials render at ISO ID-1 proportions; A4 remains reserved for document-shaped credentials. Both form factors use the same source-backed renderer contract on Web and Mobile.
- Share resolves the technical disclosure mechanism from issuer/credential and recipient capabilities. If partial disclosure cannot be derived, the UI states that the selected credential will be sent whole and never falls back silently.
- Mobile uses bottom navigation and full-width credential detail surfaces rather than desktop sidebars.
- Home, Prepare, Share, Store, credential detail, and login must avoid desktop/mobile overlap and must keep action bars reachable.

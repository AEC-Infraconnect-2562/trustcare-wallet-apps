# QA Acceptance Criteria

## Product

- Web and mobile apps share domain models, tokens, translations, and demo data.
- Wallet can use demo data without backend and can be pointed at TrustCare backend.
- Active card can generate a VP QR through backend or demo fallback.
- Selective disclosure requires at least one selected field.
- SHL package detail shows QR/policy/trust bindings.
- QR scanner can parse TrustCare VP URLs and raw IDs.

## Security

- QR generation is disabled for revoked/expired cards.
- WebAuthn/local biometric gate runs before sensitive QR when configured.
- Offline QR is expiry checked.
- Logout clears local state hooks.

## UX

- Thai text is first-class and fits mobile and desktop containers.
- Credential detail has tab/action surfaces for QR Code, SD/ZKP, PDF, details, trust checklist, and payload.
- Mobile uses bottom navigation and full-width credential detail surfaces rather than desktop sidebars.


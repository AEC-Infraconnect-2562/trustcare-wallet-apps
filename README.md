# TrustCare Wallet Apps

Standalone patient-facing TrustCare Wallet applications for web and mobile.

This repository keeps the existing TrustCare Hospital Network backend as the source of truth for VC issuance, VP creation, verifier resolution, SHL packages, audit, and source-system synchronization. The wallet apps focus on patient-held UX: cards, credential detail, VP QR, selective disclosure, SHL sharing, QR scanning, offline cache, and biometric gates.

## Apps

- `apps/wallet-web`: React + Vite wallet web application.
- `apps/wallet-mobile`: Expo React Native wallet mobile application.

## Shared Packages

- `packages/design-tokens`: TrustCare semantic colors, gradients, radius, typography.
- `packages/wallet-core`: wallet models, demo data, sorting, QR expiry, selective disclosure, SHL helpers, photo-source rules.
- `packages/api-client`: tRPC-compatible client facade with demo fallback.
- `packages/i18n`: Thai-first and English translations.
- `packages/ui-web`: reusable web UI primitives and credential renderer.
- `packages/ui-mobile`: reusable React Native UI primitives.

## Commands

```bash
pnpm install
pnpm check
pnpm test
pnpm dev:web
pnpm dev:mobile
```

## Integration Notes

The current TrustCare backend routes verified from `AEC-Infraconnect-2562/trustcare-hospital-network` include:

- `auth.me`, `auth.logout`
- `wallet.cardsByCategory`, `wallet.superseded`, `wallet.history`, `wallet.present`
- `wallet.readiness`, `wallet.requestDocument`, `wallet.uploadDocument`, `wallet.buildServicePacket`
- `shl.list`, `shl.getById`
- `verifier.verify`, `verifier.verifyQrScan`

See `docs/BACKEND_INTEGRATION_GAPS.md` for production gaps that remain outside this standalone wallet repo.

## Standards Checked

- W3C Verifiable Credentials Data Model 2.0: https://www.w3.org/TR/vc-data-model-2.0/
- SMART Health Links: https://docs.smarthealthit.org/smart-health-links/spec/
- Expo Camera QR scanning: https://docs.expo.dev/versions/latest/sdk/camera/

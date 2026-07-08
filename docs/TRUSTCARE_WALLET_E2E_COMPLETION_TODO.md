# TrustCare Wallet E2E Completion TODO

Source handoff: `C:\Users\DELL\Downloads\TRUSTCARE_WALLET_E2E_COMPLETION_HANDOFF.md`

Rule for this checklist: mark an item complete only when code and verification evidence exist. Do not mark infrastructure-dependent work complete unless the real Portal/gateway/mobile/browser environment has been verified.

## Current Run Guardrails

- [x] Read the handoff file before editing.
- [x] Confirm current repo branch/state before editing.
- [x] Keep this checklist updated as work packages are completed.
- [x] Run `pnpm check` and `pnpm test` after every completed WP before commit.
- [x] Run `pnpm build:web` before any web deploy/push.
- [x] Do not add mock/fallback paths to hide errors. (Portal gateway signing now fails visibly when key material is missing.)
- [x] Do not make `ServiceBundleEnvelope` the primary verifier QR.
- [x] Keep user-facing UX Thai-first.
- [ ] If a fix requires TrustCare Portal backend changes, make a separate GitHub PR against the Portal repo; do not hide the requirement inside Wallet-only code.

## WP-1 - Contract-first Share Gateway HTTP client

- [x] Create `packages/api-client/src/shareGatewayClient.ts`.
- [x] Move `publishShareArtifact`, `publishVpSharePackage`, `publishShlSharePackage`, and `publishCertifiedShlTrustArtifacts` out of `apps/wallet-web/src/App.tsx`.
- [x] Export `ShareGatewayClient` with `publishVp()`, `publishShl()`, `resolvePresentation()`, and `jwksUrl()`.
- [x] Accept `fetchImpl?: typeof fetch` for web/mobile/test reuse.
- [x] Export the client from `packages/api-client/src/index.ts`.
- [x] Add unit tests for `ShareGatewayPublicationRequest` request shape.
- [x] Verify `rg "function publishShareArtifact|publishShareArtifact\\(" apps/wallet-web/src/App.tsx` has zero matches.
- [x] `pnpm check` passes.
- [x] `pnpm test` passes.

## WP-2 - Production Share Gateway

- [x] Decide and document the production gateway path for this repo run: Portal backend or deployable serverless gateway. (Selected Portal backend: `https://trustcarehealth.live/api/share-gateway`.)
- [ ] If Portal backend is selected, create and push a Portal PR implementing the required endpoints/CORS/status behavior. (Branch pushed: `codex/share-gateway-backend`; PR creation pending because GitHub connector timed out and local `gh` token is invalid.)
- [x] Add/update `docs/SHARE_GATEWAY_PORTAL_CONTRACT.md`.
- [x] Ensure web env supports `VITE_TRUSTCARE_SHARE_GATEWAY_URL`.
- [x] Ensure mobile env supports `EXPO_PUBLIC_TRUSTCARE_SHARE_GATEWAY_URL`.
- [x] `currentShareGatewayBaseUrl()` returns configured gateway URL when present.
- [x] Missing gateway shows clear Thai error UX instead of silent failure. (Shared validation blocks `vp_gateway_missing`; web share flow shows Thai blocked state when no gateway is available.)
- [x] Published VP QR is a resolver URL, not raw JWT or inline payload.
- [x] VP publication requires backend signature and verifier signature validation.
- [ ] Real deployed web + real gateway QR has been scanned from a second device.
- [ ] Gateway-down case has been verified with visible Thai error UX.

## WP-3 - `jku` key-confusion hardening

- [x] Allow `jku` only when same-origin with issuer DID/web source or in trusted origins.
- [x] Reject untrusted cross-origin `jku` without fetching it.
- [x] Add a warning/error surface when `jku` is rejected.
- [x] Block private/loopback JWKS origins in production; allow localhost only for dev/test.
- [x] Add tests for evil origin rejection.
- [x] Add tests for same-origin acceptance.
- [x] Add tests for configured TrustCare origin acceptance.
- [x] `pnpm test --filter @trustcare/wallet-core` passes.

## WP-4 - Mobile Share + QR generation

- [x] Mobile share flow reuses `shareGatewayClient`.
- [x] Mobile can choose documents and package family.
- [x] Mobile can publish VP/SHL and render QR.
- [x] Sensitive QR display is gated by biometric confirmation.
- [x] Revoked/expired credentials cannot produce QR.
- [x] QR payload passes `assertPrimaryVerifierQrPayload`.
- [ ] Mobile-generated QR verified from another device.

## WP-5 - iOS Safari QR scanning

- [x] Add a non-BarcodeDetector decoder fallback for iOS Safari.
- [x] Keep native `BarcodeDetector` path for browsers that support it.
- [x] Limit fallback scan frame rate.
- [x] Preserve manual paste fallback when camera is denied/unavailable.
- [x] Cleanup camera tracks and scan loop on unmount.
- [ ] Verify iOS Safari scans VP resolver URL.
- [ ] Verify iOS Safari scans SHL.

## WP-6 - Demo Issuer OID4VCI pre-authorized flow

- [x] Add/define issuer contract in `docs/ISSUER_OID4VCI_CONTRACT.md`.
- [x] Implement/finalize issuer metadata, nonce, token, credential orchestration.
- [x] Create holder key proof with `typ: openid4vci-proof+jwt`, `aud`, and nonce.
- [x] Store issued SD-JWT VC as a real credential.
- [x] Render issued VC through `credentialRenderer`.
- [ ] Share issued VC as VP and verify from another device.

## WP-7 - SHL payload decryption

- [x] Add A256GCM/JWE compact decrypt helper for SHL files.
- [x] Support embedded encrypted files.
- [x] Support location-based encrypted files.
- [x] Support passcode-protected manifest fetch.
- [x] Preserve compatibility with existing unencrypted SHL fixtures.
- [x] Add encrypted SHL fixture tests.

## WP-8 - Web app monolith refactor

- [x] WP-1 share/publish logic removed from `App.tsx`.
- [x] Extract scan history to `apps/wallet-web/src/hooks/useScanHistory.ts`.
- [x] Extract stored extras to `apps/wallet-web/src/hooks/useStoredExtras.ts`.
- [x] Extract major views to `apps/wallet-web/src/views/*`.
- [x] Move reusable platform-neutral business logic to wallet-core/api-client.
- [x] Reduce `apps/wallet-web/src/App.tsx` below 1,500 lines.
- [x] No regression in existing web flows. (Chrome QA verified login chooser, scan button, manual scan fallback, credential detail, QR resolver modal, and share VP publication.)

## WP-9 - Shared API contracts package

- [x] Create `packages/contracts`.
- [x] Add schemas/types for wallet sync response.
- [x] Add schemas/types for credential proof envelope.
- [x] Add schemas/types for share gateway request/response.
- [x] Add schemas/types for verifier result.
- [x] Add schemas/types for OID4VCI metadata/flows.
- [x] Use runtime validation at Portal/API boundaries.
- [x] Replace duplicated DTO definitions in wallet-core/api-client where practical.

## Definition of Done Evidence

- [x] `pnpm check` final pass.
- [x] `pnpm test` final pass.
- [x] `pnpm build:web` final pass.
- [x] Browser/web verification completed.
- [ ] Mobile verification completed where mobile WP items were changed.
- [ ] Cross-device QR verification completed with a real production gateway.
- [x] Security negative tests completed: fake signature, evil `jku`, revoked credential. (`evil jku` and fake signature covered in verifier/proof tests; revoked credential covered in `shareFlow.test.ts`.)
- [x] Final git status clean except intentional untracked files.

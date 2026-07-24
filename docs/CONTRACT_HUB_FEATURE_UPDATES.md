# Contract Hub integration status

Status: Wallet Exchange V2 and Plain SHL hard cutover

This file no longer defines routes or payloads. Runtime discovery and the
versioned schemas served by the configured TrustCare Portal are the source of
truth. The Wallet fails closed when required semantics are unknown.

## Current boundaries

- Wallet owns the holder `did:key`, consent, selective disclosure, and the
  exact Wallet-signed Holder VP.
- Portal owns hospital `did:web` discovery, KMS signing, Maker/Checker,
  credential lifecycle, and the Portal-signed Manifest VC.
- Standard SHL is transport. Its QR value is canonical `shlink:/...` and its
  HTTPS manifest URL is exactly `/s/{43-character-base64url-token}`.
- Certified SHL is one package composed of three independently verified
  layers: SHL/JWE transport, Portal-signed Manifest VC, and Wallet-signed
  Holder VP. There is no Manifest VP artifact.
- Manifest retrieval uses `POST` only with the allowed request fields. Generic
  gateway artifacts are limited to `vp`, `standard_shl_manifest`, and
  `shl_file`.
- Expired, revoked, disabled, and max-accessed packages are terminal and must
  not be recovered into the current Wallet view.

## Authoritative resources

```text
GET /api/wallet/v2
GET /api/wallet/v2/health
GET /api/public/wallet-contracts
GET /api/public/wallet-contracts/render-contract
GET /api/public/wallet-contracts/schema
```

See `docs/SHL_GATEWAY_ARCHITECTURE.md` and
`docs/CONTRACT_HUB_WALLET_INTERFACE_V2.md` for the maintained Wallet-side
implementation boundary.

# TrustCare Wallet Demo Issuer OID4VCI Contract

This contract defines the wallet-local demo issuer flow used for E2E testing of
OID4VCI pre-authorized issuance. It is intentionally explicit so the UI does
not fabricate an active credential from a pending offer.

## Endpoints

Demo issuer origin:
`https://issuer.trustcare.example`

- `/.well-known/openid-credential-issuer`
- `/.well-known/jwks.json`
- `/oid4vci/token`
- `/oid4vci/nonce`
- `/oid4vci/credential`

## Flow

1. Wallet imports an `openid-credential-offer://` payload.
2. Wallet resolves issuer metadata and reads
   `credential_configurations_supported`.
3. Wallet exchanges the pre-authorized code for an access token and `c_nonce`.
4. Wallet creates a holder proof JWT with:
   - `typ: openid4vci-proof+jwt`
   - `aud: credential_issuer`
   - `nonce: c_nonce`
5. Demo issuer signs the credential as ES256 `vc+JWT`.
6. Wallet stores the issued artifact as SD-JWT VC by preserving disclosures in
   the proof metadata.
7. The credential enters the normal shared credential renderer and trust
   envelope path.

## Guardrails

- Imported offers remain `pending` until issuance completes.
- Issued credentials must contain `credentialProof.jwt`.
- UI must not mark an OID4VCI offer as active by display label alone.
- Holder proof, issuer metadata, token nonce, and signed credential are tested in
  `packages/wallet-core/src/oid4vciIssuer.test.ts`.

# TrustCare Wallet Exchange V2 Share Gateway contract

Status: live Portal dependency; holder-preservation requirement currently fails
closed until Portal implements it.

Gateway discovery comes only from `GET /api/wallet/v2`. For the current Portal
sandbox it resolves below the single configured Portal origin:

```text
https://trustcare-hospital-network-production.up.railway.app/api/share-gateway
```

## Authority

Wallet creates and signs every holder VP with the patient's local `did:key`.
The Share Gateway may store, certify, and resolve an artifact, but it must not
replace that holder signature with a network-owned VP. The compact holder VP
retrieved from:

```http
GET /api/share-gateway/presentations/{artifactId}.jwt
```

must be byte-for-byte identical to the VP Wallet supplied. Wallet verifies the
holder signature again before submitting the certified artifact reference to
`POST /api/wallet/v2/submissions`.

If Portal needs an accountable certification layer, it must publish a separate
issuer-signed Manifest VC or envelope whose contract preserves the nested holder
VP unmodified. Wallet never treats a Portal-generated outer VP as the patient's
authorization.

## Browser and service tokens

The browser may use only the public/trusted-origin contract supported by Portal.
`TRUSTCARE_SHARE_GATEWAY_SERVICE_TOKEN` must never be exposed through a Vite
or Expo environment variable. A future operation requiring that token must go
through a Wallet server/BFF.

Gateway publication failure, modified holder VP, expired artifact, digest
mismatch, or unexpected resolver origin is a visible error. There is no inline
QR, legacy Portal, or demo-data fallback in a non-demo runtime.

## Certified SHL

SHL remains encrypted transport to a manifest and JWE files. The trust layer is:

1. externally issuer-signed Manifest VC;
2. exact manifest, access-policy, plaintext, and encrypted-file hashes;
3. the original Wallet holder VP bound to package ID, manifest/file/source
   hashes, purpose, recipient/audience, consent, issue time, and expiry.

A holder-attested SHL may be shared immediately as Standard SHL. It must not
receive a hospital-certified badge until the Portal/KMS Manifest VC passes
cryptographic and policy verification.

# TrustCare Portal Share Gateway Contract

Status: implemented as the production target contract for Wallet QR publish flows.

## Purpose

Wallet QR payloads must be resolver URLs, not raw VP JWTs, inline JSON, or `ServiceBundleEnvelope` payloads. The Wallet publishes a bounded artifact to TrustCare Portal first, then renders the returned `qrPayload`.

Default production gateway:

```text
https://trustcarehealth.live/api/share-gateway
```

Local development can still use the Vite in-memory gateway at:

```text
http://localhost:<port>/api/share-gateway
```

## Environment

Web:

```text
VITE_TRUSTCARE_SHARE_GATEWAY_URL=https://trustcarehealth.live/api/share-gateway
```

Mobile:

```text
EXPO_PUBLIC_TRUSTCARE_SHARE_GATEWAY_URL=https://trustcarehealth.live/api/share-gateway
```

The app defaults to the Portal gateway above when the env var is not set. Localhost keeps using the local Vite gateway when explicitly configured by the dev server.

## Publish

```http
POST /api/share-gateway/artifacts
Content-Type: application/json
Accept: application/json
```

Request:

```json
{
  "artifactId": "vp_demo_001",
  "kind": "vp",
  "contentType": "application/vp+json",
  "payload": {},
  "ownerUserId": "demo-patient-001",
  "holderDid": "did:key:holder",
  "context": "opd_visit",
  "purpose": "เตรียมเข้ารับบริการ OPD",
  "recipient": "Verifier",
  "expiresAt": "2026-07-08T09:10:00.000Z",
  "accessPolicy": {},
  "trustcare": {}
}
```

Supported `kind` values:

- `vp`
- `standard_shl_manifest`
- `certified_shl_manifest`
- `manifest_vp`
- `manifest_credential`
- `holder_authorization`
- `shl_file`

Response:

```json
{
  "ok": true,
  "mode": "portal_backend",
  "artifactId": "vp_demo_001",
  "kind": "vp",
  "publicUrl": "https://trustcarehealth.live/api/share-gateway/presentations/vp_demo_001.jwt",
  "qrPayload": "https://trustcarehealth.live/api/share-gateway/presentations/vp_demo_001.jwt",
  "jwksUrl": "https://trustcarehealth.live/api/share-gateway/.well-known/jwks.json",
  "warnings": [],
  "errors": []
}
```

For VP artifacts, Portal signs the payload as `vp+JWT` with ES256 and stores it. The JWT header includes `kid` and `jku` pointing at the gateway JWKS endpoint.

For SHL manifest artifacts, Portal stores the manifest/support artifact and returns a JSON resolver URL. The SHL transport stays SHL; it is not converted into a VP QR.

## Resolve

```http
GET /api/share-gateway/presentations/{artifactId}.jwt
GET /api/share-gateway/manifests/{artifactId}.json
GET /api/share-gateway/manifest-vps/{artifactId}.json
GET /api/share-gateway/manifest-credentials/{artifactId}.json
GET /api/share-gateway/holder-authorizations/{artifactId}.json
GET /api/share-gateway/files/{artifactId}
GET /api/share-gateway/.well-known/jwks.json
```

Resolver responses are `no-store` except JWKS, which can be cached for one hour.

## Verification evidence

```http
POST /api/share-gateway/verification-evidence
Content-Type: application/json
```

The request identifies one immutable VP artifact and supplies only the
verifier-computed purpose/recipient/audience and digest bindings. The gateway
must retrieve the stored VP itself, verify the VP JWT and every nested VC JWT
against allowlisted signing controllers, recompute the bindings, and return a
`VerificationEvidenceV1` result. It must never accept client or payload
`verified` flags as evidence.

The endpoint is public for cross-device verification, but remains fail-closed:
an unknown artifact is `404`, a non-JWT artifact is `422`, and any proof,
issuer, governed status, expiry, policy, or binding failure is represented by a
failed evidence check so the verifier cannot display green.

## Errors

Gateway failures must be visible in Thai UX. Wallet must not silently fall back to inline payload QR when Portal publish fails.

Expected failures:

- `400`: invalid artifact request, unsupported kind, invalid expiry.
- `404`: artifact not found.
- `410`: artifact expired.
- `503`: database or gateway storage unavailable.

## CORS

Portal must allow the Wallet origins that already use wallet sync:

- `https://aec-infraconnect-2562.github.io`
- `http://localhost:<port>`
- `http://127.0.0.1:<port>`

Allowed methods: `GET`, `POST`, `OPTIONS`.

Allowed headers: `Content-Type`, `Authorization`.

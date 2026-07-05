# Wallet Exchange Model

TrustCare Wallet is a standalone holder app. It can work offline with local objects, but production trust decisions remain anchored to TrustCare Hospital Network and compatible external wallet protocols.

## Import

`packages/wallet-core/src/exchange.ts` accepts:

- `shlink:/...` SMART Health Link payloads.
- SHL JSON exports.
- TrustCare VC JSON, VP JSON, VP resolver URLs, presentation IDs, and JWT payloads.
- OID4VCI credential offers from `openid-credential-offer://`, HTTPS URLs, or JSON.
- OID4VP presentation requests from `openid4vp://`, `haip://`, HTTPS URLs, JSON requests, presentation definitions, and DCQL.

Each import creates a `WalletStoredObject` with protocol, status, payload, source, and created timestamp. OID requests remain `pending` until metadata, nonce, consent, and backend verification are complete.

## Export

The wallet can export:

- Individual VC as `application/vc+json`.
- DirectVP or PurposeVP as `application/vp+json`.
- StandardSHL package JSON with SMART Health Links payload when available.
- CertifiedSHLManifestPackage JSON with SHL transport, Manifest VP, Manifest Credential, and Holder Authorization Credential.
- Whole wallet JSON bundle for backup or transfer.

## Prepare for Service

Prepare for Service is contract-first:

1. Read Contract Hub context and readiness requirements.
2. Match active wallet credentials to required/recommended documents.
3. Request or import missing documents.
4. Let the user choose the intended package family: VP, Standard SHL, or Certified SHL + Manifest VP.
5. Route to Share with preselected context and documents. Share creates exactly one resolver-backed package.

Prepare must not create a primary verifier QR by itself. `ServiceBundleEnvelope` remains a compatibility object for backend/Contract Hub integration, not the Wallet's share payload.

## Protocol Support

OID4VCI support currently covers parsing and safe pending storage of credential offers. Production issuance must fetch issuer metadata over TLS, validate offered credential configurations, require holder consent, and complete the authorization/pre-authorized flow through a trusted backend or wallet SDK.

OID4VP support currently covers parsing authorization requests, `presentation_definition`/DCQL extraction, local credential matching, request QR generation, and pending request storage. Production presentation must validate verifier identity, request integrity, nonce/state replay protection, holder binding, and response delivery mode before releasing any VP.

# API Contract

Wallet Exchange V2 is the production integration contract. Its discovery,
Contract Hub manifest, render contract, and schema are loaded from the single
configured Portal origin and integrity-checked at runtime. The older tRPC API
below is retained only for explicitly gated demo/legacy surfaces; it is not a
fallback for Portal sync, credential requests, or submissions.

## Wallet Exchange V2

```text
POST /api/wallet/v2/session-challenges
POST /api/wallet/v2/sessions
POST /api/wallet/v2/credentials/sync
POST /api/wallet/v2/credentials/sync/ack
POST /api/wallet/v2/credential-requests
GET  /api/wallet/v2/credential-requests/{requestId}
POST /api/wallet/v2/submissions
GET  /api/wallet/v2/submissions/{submissionId}
```

The holder `did:key` signs the exact session challenge and a fresh VP for every
share event. Every protected request uses RFC 9449 DPoP. Wallet never sends or
trusts Portal `patientId`; never sends the holder private key; and never
re-signs a Portal credential. TCC, TCP, and TCM credentials are accepted only
after verification against the live Portal hospital DID document and
`/hospital/{code}/did/jwks.json`.

## Legacy/demo tRPC routes

```ts
auth.me()
auth.logout()
wallet.cardsByCategory()
wallet.superseded()
wallet.history()
wallet.present({ cardId, selectedFields?, audience?, validMinutes? })
wallet.readiness({ context, patientId? })
wallet.prepareWorkbench({ context, patientId? })
wallet.prepareContracts()
wallet.contractHub()
wallet.buildServiceBundle({ context, patientId?, audience?, receiver? })
wallet.deployBundleToWallet({ context, targetWalletMode?, issueDocuments? })
wallet.connectWalkInWallet({ patientName?, phone?, passport?, consentAttested })
wallet.importForService({ context, patientId?, sourceType?, documentType?, consentRef? })
wallet.documentRequests({ context?, patientId?, status? })
wallet.requestDocument(input)
wallet.uploadDocument(input)
wallet.buildServicePacket({ context, consentAttested, selectedCardIds?, validMinutes? })
wallet.generateCheckinQR({ context, consentAttested, selectedCardIds? })
shl.list({})
shl.getById({ id })
verifier.verify({ token?, vpUrl? })
verifier.verifyQrScan({ qrData, source })
```

## VP QR Contract

`wallet.present` must return a short resolver URL in `qrData`, shaped like:

```txt
https://trustcare.example.com/verifier?vp=<presentationId>
```

The apps must not put raw oversized JWT VP payloads directly into QR for normal presentation flows.

Standalone Wallet follows the same rule. The Share screen publishes a VP artifact to a Share Gateway first, then QR encodes the resolver URL returned by that gateway. The local Vite gateway uses:

```txt
POST /api/share-gateway/artifacts
GET  /api/share-gateway/presentations/<presentationId>.jwt
GET  /api/share-gateway/.well-known/jwks.json
```

Production resolves the Share Gateway endpoint from Wallet Exchange discovery.
For holder submissions, the published artifact must preserve the exact
holder-signed VP bytes. A Portal/network wrapper must not replace that VP. The
verifier may parse and fetch VP payloads locally, but a green trust badge
requires a verified holder/issuer signature, credential status, expiry, schema,
audience, consent, and policy. Resolver-only, metadata-only, unverified Data
Integrity proof shapes, or legacy `tc_payload` flows must stay yellow/red,
never green.

The browser wallet must not own production private keys. Local development uses
an in-memory Vite gateway to simulate the backend signer. Production uses a
server-side Share Gateway with durable database storage and a persistent
signing JWK or KMS key; no service token or private key may enter Vite/Expo
bundles.

## Other external exchange formats

The standalone wallet accepts and stores these payload families:

- TrustCare VC JSON and VP JSON/JWT.
- SMART Health Link `shlink:/...` transport links and SHL JSON exports.
- OID4VCI `openid-credential-offer://` credential offers and HTTPS offer URLs.
- OID4VP `openid4vp://`, `haip://`, HTTPS request URLs, JSON authorization requests, `presentation_definition`, and `dcql_query`.

The wallet treats OID4VCI offers and OID4VP requests as pending exchange objects until issuer/verifier metadata, nonce, holder binding, consent, and backend verification are complete.

## Wallet Document Facade

New wallet-facing integration should use the document/share facade instead of overloading service bundle endpoints:

```ts
walletApi.listDocuments(options, filter)
walletApi.importFromMhd(options, { documentReference, documentType, category })
walletApi.importFromShl(options, { payload, passcode? })
walletApi.createSharePackage(options, { mode, context, selectedCardIds, recipient })
walletApi.resolveSharePackage(options, { qrPayload })
walletApi.verifySharePackage(options, { qrPayload })
```

Implementation rule:

- `listDocuments` returns canonical `WalletDocumentRecord` records with FHIR `DocumentReference`.
- `importFromMhd` imports evidence as unverified until a trusted issuer signs or TrustCare certifies it.
- `importFromShl` parses/fetches SHL and reports `transport_valid`, `trustcare_pending`, or `trustcare_certified`.
- `createSharePackage` creates exactly one of DirectVP, PurposeVP, StandardSHL, or CertifiedSHLManifestPackage.
- `resolveSharePackage` and `verifySharePackage` classify the QR payload before trust decisions are shown.
- Legacy `wallet.buildServiceBundle` remains only for compatibility and must not be exposed as a primary verifier QR flow.

## Contract Hub Alignment

Authoritative Portal implementation guide:

```txt
AEC-Infraconnect-2562/trustcare-hospital-network-railway
docs/WALLET_EXCHANGE_V2_IMPLEMENTATION_GUIDE.md
```

The wallet mirrors the current Contract Hub direction for service readiness contexts, external wallet deployment handshakes, document imports, canonical share packages, Standard SHL, and Certified SHL + Manifest VP packages.

`ServiceBundleEnvelope`, legacy Service VP packets, and check-in SHL packet routes may remain as backend compatibility contracts while TrustCare Portal catches up. The standalone Wallet UI must not expose them as primary QR/verifier payloads; Prepare only checks readiness and Share creates exactly one resolver-backed package.

## Auth strategy

Web stores a non-extractable holder key locally and keeps the short-lived DPoP
access token only in memory. Mobile shares the same domain workflow, but a
production native Secure Enclave/Android Keystore signing adapter remains
required; private JWK serialization is forbidden. No service token may be
embedded in a Vite or Expo bundle.

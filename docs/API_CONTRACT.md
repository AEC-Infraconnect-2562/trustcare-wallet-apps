# API Contract

The wallet apps call the existing TrustCare backend and keep it authoritative.

## MVP Routes

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

Production should point `VITE_TRUSTCARE_SHARE_GATEWAY_URL` to TrustCare Portal Backend. The gateway signs VP artifacts as `vp+JWT` with ES256 or EdDSA and exposes a JWKS endpoint that verifiers can resolve. The verifier may parse and fetch VP payloads locally, but a green trust badge requires a verified JWT signature or W3C Data Integrity proof plus nested credential verification. Resolver-only, metadata-only, or legacy `tc_payload` flows must stay yellow/red, never green.

The browser wallet must not own production private keys. Local development uses an in-memory Vite gateway to simulate the backend signer; production should use Portal Backend/KMS/S3-backed persistence.

## External Wallet Exchange

The standalone wallet accepts and stores these payload families:

- TrustCare VC JSON and VP JSON/JWT.
- SMART Health Link `shlink:/...` transport links and SHL JSON exports.
- OID4VCI `openid-credential-offer://` credential offers and HTTPS offer URLs.
- OID4VP `openid4vp://`, `haip://`, HTTPS request URLs, JSON authorization requests, `presentation_definition`, and `dcql_query`.

The wallet treats OID4VCI offers and OID4VP requests as pending exchange objects until issuer/verifier metadata, nonce, holder binding, consent, and backend verification are complete.

## Contract Hub Alignment

Latest inspected TrustCare source:

```txt
AEC-Infraconnect-2562/trustcare-hospital-network main
1d93e7c96694828478c94003010a84f40cb5d933
```

The wallet mirrors the current Contract Hub direction for service readiness contexts, external wallet deployment handshakes, document imports, canonical share packages, Standard SHL, and Certified SHL + Manifest VP packages.

`ServiceBundleEnvelope`, legacy Service VP packets, and check-in SHL packet routes may remain as backend compatibility contracts while TrustCare Portal catches up. The standalone Wallet UI must not expose them as primary QR/verifier payloads; Prepare only checks readiness and Share creates exactly one resolver-backed package.

## Auth Strategy

Web supports cookie credentials for same-site or credentialed CORS deployment. Mobile needs bearer-token capable auth for production. Until the backend exposes a mobile auth exchange, the mobile app runs with demo mode and documented TODOs.

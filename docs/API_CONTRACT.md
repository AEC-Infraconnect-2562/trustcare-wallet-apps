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
wallet.requestDocument(input)
wallet.uploadDocument(input)
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

## Auth Strategy

Web supports cookie credentials for same-site or credentialed CORS deployment. Mobile needs bearer-token capable auth for production. Until the backend exposes a mobile auth exchange, the mobile app runs with demo mode and documented TODOs.


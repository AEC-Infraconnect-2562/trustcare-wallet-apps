# TrustCare Wallet Requirements

## Product Direction

TrustCare Wallet is the patient-held application layer for collecting, storing, presenting, and sharing portable verifiable health evidence trusted by the TrustCare hospital network.

It must reduce service friction for hospitals and patients. It must not become a separate central health-record backend, staff dashboard, issuer workflow, claim center, or shadow credential state.

## Required Capabilities

- Thai-first UX with English switch.
- Light and dark theme using TrustCare semantic tokens.
- Wallet home with patient identity, active card count, online/offline state, biometric state, and last sync.
- Health card list sorted with identity credentials first.
- Document-style credential detail view with copy/demo watermark where appropriate.
- VP presentation view with QR, Details, Trust Checklist, Payload, and History tabs.
- Selective disclosure field picker before VP generation.
- QR scanner that supports TrustCare VP URLs, presentation IDs, JWT/JSON VC/VP payloads, and manual paste fallback.
- SHL package screen showing access policy, passcode/expiry/access count, manifest files, manifest credential, holder VP, and object links.
- Prepare-for-service screen using existing backend readiness/document-request APIs.
- Presentation history and superseded/expired/revoked history.
- Web IndexedDB offline card and QR cache with expiry checks.
- Mobile SQLite offline card and QR cache, SecureStore token storage, biometric gate, camera scanner, and screen capture protection.

## Non-Goals

- New Maker/Checker UI.
- New staff hospital dashboard.
- New claim center UI.
- On-device production VC signing.
- On-device SHL verification as the source of production trust decisions.
- Replacing TrustCare Hospital Network backend.

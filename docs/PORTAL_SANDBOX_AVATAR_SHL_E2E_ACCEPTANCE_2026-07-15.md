# Portal Sandbox Avatar and SHL E2E Acceptance - 2026-07-15

Status: passed on the current Wallet branch against the live Portal sandbox

## Tested contracts

- Portal: `https://trustcare-hospital-network-production.up.railway.app`
- Portal branch commit: `e38b17b`
- Railway deployment: `81123d3e-64b0-4ea3-9859-97dc4c3b33fd`
- Wallet Exchange: `2026.07.wallet-exchange.v2.1.strict-w3c`
- Clinical Document Graph: `2026.07.pcdg.v2`
- Test identity catalog: `2026.07.test-identities.v4`

Wallet used the existing `walletExchangeV2`, `walletExchangeWorkflow`, web and
mobile persistence adapters, `holderPresentation`, Graph V2 consumer, and
canonical renderer. Retired Portal sync modules were not restored.

## Positive identities

All linked identities `demo-patient-001` through `demo-patient-009` passed:

```text
test login -> identity resolution -> holder challenge and proof
-> DPoP-bound session -> credential delta and verification -> atomic persist
-> ACK -> Graph delta -> eight-stage Graph Presentation -> portrait render
-> idempotent replay
```

| Identity | Accepted VC | Quarantined | Graph artifacts | Avatar |
| --- | ---: | ---: | ---: | --- |
| `demo-patient-001` | 15 | 0 | 17 | HTTP 200, identity-bound |
| `demo-patient-002` | 14 | 0 | 16 | HTTP 200, identity-bound |
| `demo-patient-003` | 11 | 0 | 11 | HTTP 200, identity-bound |
| `demo-patient-004` | 10 | 0 | 10 | HTTP 200, identity-bound |
| `demo-patient-005` | 8 | 0 | 8 | HTTP 200, identity-bound |
| `demo-patient-006` | 12 | 0 | 12 | HTTP 200, identity-bound |
| `demo-patient-007` | 10 | 0 | 10 | HTTP 200, identity-bound |
| `demo-patient-008` | 10 | 0 | 10 | HTTP 200, identity-bound |
| `demo-patient-009` | 7 | 0 | 7 | HTTP 200, identity-bound |

Every identity produced all eight Graph Presentation stages. Replay did not
duplicate credentials, Graph objects, portrait records, or change audit.

## Negative identities

`portal-empty-patient-001`, `partner-patient-001`, and
`partner-patient-002` each failed with HTTP 422
`wallet_onboarding_required`. The Wallet retained the Portal request and
correlation IDs for diagnostic evidence.

## W3C and SHL trust behavior

- Wallet verifies a direct W3C VC 2.x compact JWS, JOSE signature, `kid`,
  hospital `did:web`, validity, status, schema/profile, and exact holder
  `credentialSubject.id`.
- It does not require legacy top-level `iss` or `aud`. Signed audience is read
  from `trustcare.intendedAudience`.
- `contentHash` and SHL file hashes are checked against exact compact JWS/file
  bytes using canonical `sha256:<64 lowercase hex>` values.
- Portal database IDs are not accepted as portable patient or hospital claims.
- Holder VP is created only after consent and signed with the Wallet-owned
  non-exportable holder key. Portal never supplies that proof.
- Certified SHL association passed from pending to holder-associated through
  the real DPoP endpoint; SHL transport, Manifest VC, source documents, hashes,
  and Holder VP remain separate bound artifacts.

## Avatar evidence

The source is signed credential/render data and must agree with the sandbox
identity catalog. Binding uses Wallet user ID, holder DID, credential subject,
and source credential ID, never display name, list position, gender, or role.

Desktop and mobile E2E confirmed that the Home avatar and canonical patient
document renderer loaded the same image bytes and SHA-256. A failed image does
not trigger a real-person fallback; the UI shows a neutral unavailable state.

## Quality gates

- Wallet unit/integration suite: 109 tests passed before final contract update.
- Strict W3C/SHL regression suite: 29 tests passed after the audience update.
- Workspace TypeScript check: passed across all nine packages.
- Browser E2E: desktop and mobile passed.
- Live acceptance: nine positive and three negative identities passed their
  expected outcomes.

Do not relax the verifier, rewrite a signed holder subject, use the unsigned
catalog portrait as proof, recreate retired sync modules, or manufacture a
hospital/holder signature to preserve compatibility.

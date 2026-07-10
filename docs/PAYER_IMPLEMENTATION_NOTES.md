# Payer, e-Claim, and Medical Tourist Implementation Notes

This repository now has a wallet-side payer foundation. It is intentionally an orchestration and adapter layer, not a claim adjudication engine.

## Shared Core

- `packages/wallet-core/src/payer/types.ts` defines payer profiles, eligibility, pre-authorization, claim package, claim receipt, guarantee letter, additional evidence, payment reconciliation, and medical tourist case types.
- `packages/wallet-core/src/payer/adapters/base.ts` defines the `PayerAdapter` contract.
- `packages/wallet-core/src/payer/adapters/mockPayerAdapter.ts` provides deterministic demo adapters only.
- `packages/wallet-core/src/payer/claimPackage.ts` builds canonical claim evidence packages from wallet cards and readiness contexts.
- `packages/wallet-core/src/payer/fhirMapping.ts` maps orchestration requests and responses into FHIR-like resources for adapter contracts.
- `packages/wallet-core/src/payer/credentialTemplates.ts` creates demo W3C VC-shaped payer result credentials for wallet storage.

## API Client

- `packages/api-client/src/payer.ts` exposes typed facade functions for payer profiles, coverage discovery, eligibility, pre-auth, claim package creation, claim submission, claim status, guarantee letters, additional evidence, and payment reconciliation.
- `packages/api-client/src/authBroker.ts` exposes a provider-neutral auth broker facade for payer consent, medical tourist intake, cross-border referral, and wallet login.
- Demo mode uses the shared mock payer registry. Production mode calls configured procedure contracts such as `payer.verifyEligibility` and `authBroker.startSession`.

## UX

- `apps/wallet-web/src/components/payer/PayerOrchestrationPanel.tsx` appears only in payer-related preparation contexts:
  - `insurance_claim`
  - `cross_border`
  - `medical_tourist`
- The panel shows adapter boundary, readiness, package recommendation, consent receipt, and proof/verification routing.
- Prepare still checks readiness. Share still creates one package. Store keeps credentials/documents. Verifier validates proof and policy.

## VC/VP Lifecycle and Source Separation

- `packages/wallet-core/src/credentialLifecycle.ts` is the shared source-of-truth for credential trust boundaries.
- Portal-synced credentials are verified against the original Portal/hospital issuer DID. The wallet must not re-sign them with a wallet, gateway, or payer key to hide missing proof.
- Hospital or issuer credentials are re-issued by the DID owner for that hospital/issuer profile.
- Payer artifacts such as eligibility, pre-auth, guarantee, claim package, claim receipt, and claim status are issued by the configured payer adapter or controlled integration service.
- Wallet-issued artifacts can be regenerated only by the active wallet issuer profile.
- Patient-provided uploads remain evidence until an issuer creates a verifiable credential proof.
- Claim details, payer payloads, schema version, issuer DID, payer ID, selected fields, recipient, purpose, expiry, or credential digest changes require a fresh VC/VP issue/sign cycle. Do not reuse old signed packages after these values change.
- VP packages are rebuilt and signed per sharing event. Portal-synced VC proofs may be embedded or referenced, but the VP signature does not replace the original VC proof.

## Production Connector Notes

- Do not hard-code NHSO, insurer, TPA, ThaiD, or hospital endpoints in the wallet client.
- Production connectors should implement the `PayerAdapter` interface server-side or in a controlled integration service.
- Store adapter secrets and payer tokens outside browser storage.
- Every payer submission must carry an explicit consent receipt ID.
- Unknown payer responses must map to `pending`, `unknown`, `need_more_evidence`, or `manual_followup_required`; never silently promote uncertainty to approval.

## Test Coverage

- `packages/wallet-core/tests/payer.test.ts`
- `packages/api-client/src/payer.test.ts`

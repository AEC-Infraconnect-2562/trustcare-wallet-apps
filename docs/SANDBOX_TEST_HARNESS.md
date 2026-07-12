# Wallet sandbox test harness

## Boundary

The harness exists only when `VITE_TRUSTCARE_RUNTIME_ENV=demo`. It is a
patient-Wallet test surface, not an IAM console. Portal owns users, hospital
roles, Maker/Checker assignments, issuer DID binding, and authorization.

Production never falls back to these fixtures. Wallet Exchange V2 continues to
use a locally generated holder `did:key`, DPoP, opaque cursors, and holder-only
partitions. The local `portalFixtureOpenId` is display/test mapping metadata; it
must never be sent as `patientId` or trusted as Portal identity.

## One-click patient profiles

The login screen exposes patient profiles only. Selecting a profile logs in in
one action, selects its primary readiness context, and resumes that holder's
local state. Staff and Portal administration roles remain excluded.

| Wallet profile     | Portal sandbox mapping | Hospital | Primary flow    | Initial objects                 | Expected gap/state                 |
| ------------------ | ---------------------- | -------- | --------------- | ------------------------------- | ---------------------------------- |
| `demo-patient-004` | `demo-patient-004`     | TCM      | Cross-border    | identity, consent               | referral, summary, lab missing     |
| `demo-patient-005` | `demo-patient-005`     | TCC      | Pharmacy        | identity, allergy               | prescription, medication missing   |
| `demo-patient-006` | `demo-patient-006`     | TCC      | Insurance claim | identity                        | coverage, claim, payer pending     |
| `demo-patient-007` | `demo-patient-007`     | TCP      | Referral        | identity, allergy, prescription | referral, summary missing          |
| `demo-patient-008` | `demo-patient-008`     | TCP      | Medical tourist | identity, summary               | quotation, guarantee, visa missing |
| `demo-patient-009` | `demo-patient-009`     | TCC      | Emergency       | identity                        | allergy, medication missing        |

Additional profiles cover complete-data regression, empty initial sync and
external partner-Wallet interoperability. Profile definitions live in
`packages/wallet-core/src/testUserProfiles.ts`; seed credentials remain in the
existing shared demo-data module so Web and Mobile can consume the same domain
objects.

No portrait is invented for Portal fixtures 004-009. Until Portal supplies a
photo claim for that same subject and credential, the renderer must show the
missing-photo/initials state rather than another person's image.

## Durable state

Each profile has an isolated local holder partition:

- holder DID/private key and Wallet Exchange documents: IndexedDB, keyed by
  Portal origin, app ID, and local user key;
- cursor, pending ACK, credential request links and pending submissions:
  Wallet Exchange persistence adapters;
- cached credentials: IndexedDB, replaced only inside the active owner
  partition;
- generated VP/SHL artifacts and imported objects: per-user local Store;
- scan history: per-user local storage;
- sandbox session ledger: safe metadata only (session ID, timestamps, active
  route, object counts and Wallet Exchange state).

The sandbox session ledger intentionally excludes passwords, access/refresh
tokens, DPoP material and holder private keys. Access tokens remain memory-only.

## Portal prerequisites for live E2E

For a profile to complete live Wallet Exchange E2E, Portal sandbox must bind
the holder DID created on that browser/device to the corresponding test patient
through its own administrative workflow. Wallet neither submits nor guesses a
Portal patient identifier. Portal also owns:

1. Maker/Checker test assignments and credential request progression;
2. TCC/TCP/TCM issuer DID discovery, KMS/JWKS and credential status;
3. test credential issuance/reissue after the DID hard cutover;
4. verifier intake and canonical HIS mapping;
5. hospital-certified SHL approval and Manifest VC signing.

The Wallet can exercise holder-attested sharing immediately. It must show
hospital certification as pending until Portal returns a cryptographically
verified `application/vc+jwt` Manifest Credential.

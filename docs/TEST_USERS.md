# Test Users and Seed Data

The standalone wallet ships with scoped test users so TrustCare Portal and external partner wallet flows can be tested without mixing data between people. The active user is selected from the test-login control in the top app bar. Cards, VP history, SHL packages, stored imports, OID4VCI offers, OID4VP requests, and service-readiness fixtures are generated only for that selected user.

## TrustCare Portal Users

These users mirror TrustCare Portal demo users and must keep their original Portal photo assets. Do not replace these photos with generated images.

| User ID | Name | Source | Primary Scope | Photo |
| --- | --- | --- | --- | --- |
| `demo-patient-001` | นายสมชาย ใจดี / Mr. Somchai Jaidee | TrustCare Portal | OPD, referral, claim, pharmacy, medical certificate | `https://trustcarehealth-tylvb5l8.manus.space/api/storage-proxy/patient_male_realistic_opt_e9b1630b.jpg` |
| `demo-patient-002` | นางสาวมาลี วัฒนา / Ms. Malee Wattana | TrustCare Portal | OPD, emergency, lab | `https://trustcarehealth-tylvb5l8.manus.space/api/storage-proxy/patient_female_realistic_opt_d0edb245.jpg` |
| `demo-patient-003` | Mr. John Williams | TrustCare Portal | Medical tourist, insurance, travel document | `https://trustcarehealth-tylvb5l8.manus.space/api/storage-proxy/patient_male_realistic_opt_e9b1630b.jpg` |
| `demo-hospadmin-001` | นางวิภา บริหารเก่ง / Ms. Wipa Borihankeng | TrustCare Portal | Staff identity, maker/checker | `https://trustcarehealth-tylvb5l8.manus.space/api/storage-proxy/doctor_female_realistic_opt_56d94f1d.jpg` |

## Wallet-Native Users

These users are new to this standalone partner-wallet system. Their photos are synthetic, realistic profile images stored in this repo and can be used for TrustCare Portal linking tests.

| User ID | Name | Source | Primary Scope | Photo |
| --- | --- | --- | --- | --- |
| `partner-patient-001` | นางสาวกมลวรรณ ศรีสุข / Ms. Kamonwan Srisuk | Partner wallet native | OPD, lab, cross-border transfer | `apps/wallet-web/public/assets/users/wallet-native-01.png` |
| `partner-patient-002` | Mr. David Chen | Partner wallet native | Medical tourist, insurance, travel document, guarantee letter | `apps/wallet-web/public/assets/users/wallet-native-02.png` |

## Portal Interoperability Fixtures

For each selected user, `buildPortalInteroperabilityFixtures(userId)` creates:

- OID4VCI credential-offer URL for import testing.
- OID4VP presentation-request URL for verifier testing.
- SHL QR payload when the selected user has patient SHL data.
- Sample credential IDs, presentation IDs, holder DID, patient ID, source system, and Portal open ID.

Use the web wallet's "TrustCare Portal Test Fixtures" panel to import OID4VCI/OID4VP into the local Store or copy payloads for TrustCare Portal verifier and Contract Hub tests.

## Isolation Rules

- Selecting a login user must show only that user's cards, history, SHL packages, stored objects, and generated fixtures.
- Portal-origin users keep `avatarSource: "trustcare_portal"` and remote Portal asset URLs.
- Wallet-native users keep `avatarSource: "wallet_generated"` and local generated images.
- Seed data must not contain the old student demo identity from earlier wallet prototypes.

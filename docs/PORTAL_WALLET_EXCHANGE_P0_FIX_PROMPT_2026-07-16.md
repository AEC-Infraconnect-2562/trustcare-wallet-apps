# Copy/paste prompt: Portal Wallet Exchange P0 root fixes

Date: 2026-07-16

Detailed evidence and the complete acceptance matrix are in
`docs/PORTAL_WALLET_EXCHANGE_COMPLETION_HANDOFF_2026-07-16.md` in the Wallet
repository.

Copy the prompt below into the Portal development task without removing the
security boundaries, negative tests, or release-evidence requirements.

---

## Prompt for the TrustCare Portal team

พัฒนา TrustCare Portal จาก repository ที่ถูกต้องเท่านั้น:

`AEC-Infraconnect-2562/trustcare-hospital-network-railway`

ห้ามใช้ retired repository:

`AEC-Infraconnect-2562/trustcare-hospital-network`

ทดสอบร่วมกับ Wallet repository:

`AEC-Infraconnect-2562/trustcare-wallet-apps`

Wallet Draft PR ที่ใช้ทดสอบ:

`https://github.com/AEC-Infraconnect-2562/trustcare-wallet-apps/pull/16`

Portal Sandbox:

`https://trustcare-hospital-network-production.up.railway.app`

Portal revision ที่ Wallet ตรวจล่าสุด:

`797025f1267ae19c8b9f01e2d4c110b8af788786`

ก่อนแก้ไข ให้อ่าน Handoff ฉบับเต็มจาก Wallet:

`docs/PORTAL_WALLET_EXCHANGE_COMPLETION_HANDOFF_2026-07-16.md`

เป้าหมายรอบนี้คือแก้ Portal root causes เพื่อให้ Full P0 flow ผ่านจริง:

`OIDC/PKCE -> holder binding -> DPoP session -> credential sync/ACK ->`
`Graph delta -> credential request -> Maker -> different Checker -> KMS ->`
`new credential sync -> canonical render -> direct VP submission ->`
`Certified SHL Holder VP -> restart/cross-device exact recovery`

### P0.1 แก้ KMS issuance ที่สร้าง credential ไม่ครบ render contract

หลักฐาน production:

- identity: `demo-patient-003`
- document type: `medical_certificate`
- Maker และ different Checker ผ่าน และ KMS issuance สำเร็จ
- sync ถัดไปตอบ HTTP 409
- problem code: `credential_subject_binding_mismatch`
- detail: `render_contract_incompatible`
- `X-Request-Id`: `wallet-36878d9d-3e21-4e63-8378-c232c7804da2`
- `X-Correlation-Id`: `wxc_7a41eac4-0796-4c57-add5-e02cbb6fdfd5`

Root cause ที่ตรวจจาก Portal code:

- `server/walletExchange/credentialDeliveryAuthority.ts` ต้องการ
  `credentialSubject.data.humanDocument.renderData`
- specialized medical-certificate issuance path ใน
  `server/portability/index.ts`/`server/portability/vc.ts` เรียก common issuer
  โดยไม่มี canonical patient/document render input จึงได้ signed credential
  ที่ delivery authority ส่งให้ Wallet ไม่ได้

ให้แก้ที่ common hospital-controlled issuance transaction:

1. ทุก requestable document type ต้องสร้าง canonical
   `credentialSubject.data.humanDocument.renderData` จากข้อมูลจริงของเอกสาร
   ก่อน KMS sign
2. นำ compact JWS ที่ลงนามแล้วผ่าน common delivery-authority validation
   ก่อน mark request item ready และก่อนเขียน outbox/delta
3. ถ้า validation ไม่ผ่าน ให้ rollback credential/request/outbox transaction
   และบันทึก operator-visible reason
4. ห้ามแก้ signed payload เดิมในฐานข้อมูล ให้ revoke/archive และ reissue fixture
   ที่ได้รับผลกระทบ
5. เพิ่ม test แบบ Maker -> different Checker -> KMS -> delivery gate -> sync
   สำหรับ document type ที่ publish ทั้งหมด และ negative fixture ที่ขาด
   canonical render data

ห้ามแก้โดยลด render gate, เปลี่ยนชื่อ error, ให้ Wallet สร้าง issuer claims
หรือ re-sign credential แทนโรงพยาบาล

### P0.2 ทำ credential request workflow ให้ตรงกับ Maker/Checker matrix

หลักฐาน production:

- identity: `demo-patient-003`
- requested type: `patient_summary`
- Maker claim ผ่าน
- Checker ตอบ HTTP 412 เพราะ Graph matrix กำหนด automatic attestation และ
  ไม่สร้าง Checker task
- request trace: `wallet-p0-trpc-755d3494-de3f-44e1-a062-97c03bd35107`
- correlation trace: `wxc_e64bab40-ecda-476b-9200-49e2653a2d29`

ให้ Portal publish workflow rule เพียงแบบเดียวต่อ document type:

- ถ้า automatic: response contract/status/nextAction ต้องไม่บอก Wallet ว่า
  รอ Maker/Checker
- ถ้าต้อง Maker/Checker: ต้องสร้าง Checker task จริงและ Checker ต้องเป็นคนละคน
  กับ Maker

ห้ามให้ Wallet เดา workflow จากชื่อ document type ให้ reconcile หรือ expire
stalled Sandbox requests จากการทดสอบนี้โดยเก็บ audit history ไว้

### P0.3 ทำ Certified SHL exact Holder VP recovery ให้ใช้ได้จริง

หลักฐาน production:

- identity: `demo-patient-001`
- Manifest Credential ID:
  `urn:trustcare:seed:vc:shl_manifest:tcc:vp-opd-checkin:p001`
- SHL ID: `85`
- SHL มีสถานะ `active`
- GET `/api/wallet/v2/shl-associations/85` ตอบ HTTP 404
  `shl_association_not_found`
- GET request/correlation:
  `wallet-30f774dd-0884-4588-94b9-3ef7be4f4eb1` /
  `wxc_5dc8b376-2069-4852-98b8-d79633364fce`
- หลัง GET 404 Wallet จึงสร้าง sharing event ใหม่ แต่ POST ตอบ HTTP 409
  `shl_not_awaiting_holder`
- POST request/correlation:
  `wallet-904e06bb-a123-4d36-a536-a919d21118c1` /
  `wxc_1b220343-7bc2-4cea-8419-8d464c2d308a`

ให้แก้ durable Portal data/state และ endpoint ดังนี้:

1. active association ต้องอ่านคืนได้ด้วย holder-scoped
   `appId + holderDid + shlId`
2. ต้องคืน exact original Wallet-signed Holder VP bytes/ID/digest ห้ามให้ Portal
   สร้าง VP ใหม่
3. response ต้อง bind อย่างน้อย `packageId`, Manifest VC ID/hash,
   source bundle/file hashes, holder VP ID/JWT/digest, consent, purpose,
   recipient/audience, issued/expiry และ lifecycle
4. replay request เดิมต้องคืน object เดิมแบบ idempotent
5. VP คนละตัวสำหรับ active association ต้อง conflict แบบ deterministic
6. เพิ่ม Sandbox-only reset/reseed หรือ per-run namespace เพื่อให้ E2E ทดสอบ
   `pending_holder_presentation -> active` ซ้ำได้ โดยไม่แก้ signed artifact
   ในตำแหน่งเดิมและไม่กระทบ identity อื่น

ห้ามคืน JWE key, passcode, Portal patient ID หรือข้อมูลของ holder อื่น

### Security and architecture gates

ต้องรักษากติกาต่อไปนี้:

1. Portal เป็นเจ้าของ hospital `did:web`, DID Document/JWKS, KMS signing,
   Maker/Checker, lifecycle/status, verifier intake และ durable exchange state
2. Wallet เป็นเจ้าของ holder `did:key`, private key, consent และ Holder VP
3. ห้ามรับหรือส่ง Portal `patientId` ใน Wallet Exchange ทุกระดับของ payload
4. ห้าม Portal สร้าง Holder VP หรือขอ holder private key
5. รับเฉพาะ direct W3C VC/VP 2.x compact JWS; ห้าม unsigned JSON และ legacy
   `vc`/`vp` wrapper
6. ห้ามลด proof, issuer, DID/JWKS, credentialStatus, validity,
   credentialSubject binding, schema/profile, audience, purpose, consent,
   recipient หรือ replay gates
7. canonical renderer ยังเป็นของ Wallet และ Portal ต้องไม่สร้าง renderer ซ้ำ
8. Graph Presentation ใช้อธิบาย relationship เท่านั้น ไม่ใช้แทนเอกสารหรือ proof
9. ห้าม fallback DID, demo data แบบเงียบ หรือกลืน 409/422 แล้วแสดง success

### Required tests

หลังแก้ ให้รัน integration และ Browser E2E จริงกับ identities 001-009 และ
negative identities ทั้ง 3 ราย ครอบคลุม:

- OIDC issuer แยก origin จาก Portal API, PKCE, token claim gate และ logout
- holder binding/revocation/replacement, wrong holder/app/key และ stale challenge
- DPoP replay, wrong `jti`/`htu`/`htm`/`ath` และ session recovery
- initial/paginated/replay/restart sync, atomic persist และ ACK recovery
- request -> Maker -> different Checker -> KMS -> re-sync -> canonical render
- partial/rejected/cancelled request และทุก published document type
- direct VP success พร้อม altered VP, wrong recipient/audience/purpose/consent
- Certified SHL 3 layers และ exact VP recovery ใน fresh Wallet store/device
- credential lifecycle: issued/updated/superseded/suspended/revoked/expired
- Graph delta idempotency, unknown optional preservation และ unknown required
  semantics quarantine ก่อน state mutation/ACK
- Avatar HTTP/media/digest/person binding; ห้าม wrong-person fallback
- Portal/Share Gateway restart ระหว่าง operation แล้ว recover แบบ idempotent

### Acceptance and release evidence

ห้ามถือว่างานเสร็จจนกว่าจะผ่านทั้งหมด:

- demo-patient-001 ถึง 009 ผ่าน full flow
- negative identities ทั้ง 3 ราย fail ตาม onboarding policy
- newly issued credential sync และ canonical render ได้
- direct VP verify/map/receipt ได้
- Certified SHL เปลี่ยนสถานะถูกต้องและ fresh Wallet กู้ exact Holder VP เดิมได้
- replay ไม่สร้าง credential, Graph, Avatar, ACK, task, VP หรือ association ซ้ำ
- Desktop/Mobile ไม่มี runtime/console error และไม่แสดง Verified/Certified ก่อน
  proof/policy ผ่าน

รายงานกลับพร้อม:

1. Portal commit และ Railway revision/deployment URL
2. migrations และ environment variables ที่เปลี่ยน
3. old/new contract/schema versions พร้อม compatibility classification
4. accepted/quarantined/rejected counts แยก identity/document type
5. Maker/Checker/KMS/request/submission/SHL/lifecycle transitions
6. Graph node/edge/stage counts และ selected artifact IDs
7. Avatar HTTP/media/digest/person-binding results
8. restart/replay/cross-device recovery evidence
9. Browser Desktop/Mobile screenshots และ console result
10. ทุก failure ต้องมี sanitized HTTP status, problem code, endpoint,
    `X-Request-Id` และ `X-Correlation-Id`

เมื่อ Portal ผ่านทั้งหมด ให้ commit, push PR, merge และ deploy Railway Sandbox
แล้วแจ้ง Portal revision ใหม่ให้ฝั่ง Wallet rerun PR #16 แบบ end-to-end ห้ามให้
Wallet เปลี่ยน verifier หรือเพิ่ม fallback เพื่อพยายามทำให้ผ่าน

---

## Expected Portal response

Portal should return a concise completion handoff with:

- merged Portal PR URL and commit;
- Railway revision;
- migrations and contract-version changes;
- the three root-fix results;
- full acceptance counts and trace evidence; and
- any remaining blocker that still requires a Wallet contract change.

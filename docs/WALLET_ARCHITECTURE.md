# TrustCare Wallet Architecture

เอกสารนี้เป็น architecture ปัจจุบันของ standalone TrustCare Wallet หลังปรับให้เป็น personal portable medical document wallet ที่รองรับ VC, VP, OID4VCI, OID4VP และ SMART Health Links โดยไม่ผูก UX เข้ากับ service bundle แบบเดิม

## Core Model

Wallet เก็บข้อมูลหลักเป็น `WalletDocumentRecord` ซึ่ง normalize จาก `WalletCard` แต่ละใบ

- `documentType` ต้องอยู่ใน canonical card type เท่านั้น
- `category` ต้องอยู่ใน taxonomy ของ Wallet
- `credentialData` ต้องเป็น VC-like payload
- `credentialData.evidence[]` ต้องมี FHIR `DocumentReference`
- `shl_manifest` และ `sync_receipt` เป็น trust artifact ไม่ใช่ clinical readiness document

ถ้า seed/mock ไม่ผ่านกฎนี้ต้องแก้ seed ให้ถูกต้องหรือลบทิ้ง ไม่สร้าง fallback เพื่อหลบ error

## Clinical Document Pipeline

ระบบใช้ pipeline เดียวกันทั้งขาเข้าและขาออก:

```text
EHR / HIS / LIS / PACS
  -> FHIR Resources
  -> FHIR Document Bundle
  -> IPS profile หรือ document profile อื่น
  -> DocumentReference + Binary / Bundle
  -> IHE MHD API สำหรับ publish / search / retrieve
  -> Patient App / Hospital Portal / HIE
  -> SHL หรือ QR สำหรับ patient-mediated sharing
  -> VC/VP สำหรับพิสูจน์ issuer + integrity
  -> Consent/Contract สำหรับควบคุมสิทธิ วัตถุประสงค์ อายุการเข้าถึง และ audit
```

Wallet ไม่ถือว่า FHIR Bundle, MHD SubmissionSet, SHL manifest, VP และ consent contract เป็นสิ่งเดียวกัน:

- FHIR Bundle คือ clinical payload ที่ immutable และควรมี `Composition` เป็น resource แรก
- `DocumentReference` คือ metadata/index สำหรับค้นหาและ retrieve เอกสาร
- MHD คือ exchange pattern ไม่ใช่ QR payload ของผู้ใช้
- SHL คือ transport manifest/file link ที่ยังไม่แปลว่า TrustCare verified
- VC/VP คือ proof layer สำหรับ issuer, holder binding, integrity และ verifier policy
- Consent/Contract กำหนด purpose, audience, expiry, access count และ audit

## Canonical Document Types

Wallet ใช้ canonical document types ต่อไปนี้เท่านั้น:

`patient_identity`, `staff_identity`, `consent_receipt`, `mpi_link_certificate`, `patient_summary`, `allergy_alert`, `immunization`, `medical_certificate`, `medication_summary`, `prescription`, `pharmacy_dispense`, `lab_result`, `diagnostic_report`, `referral_vc`, `discharge_summary`, `insurance_eligibility`, `claim_package`, `claim_receipt`, `travel_document_verification`, `visa_support_letter`, `quotation`, `guarantee_letter`, `shl_manifest`, `sync_receipt`, `appointment`

Alias migration อยู่ใน `packages/wallet-core/src/canonicalDocuments.ts` เพื่อรับข้อมูล legacy เฉพาะตอน normalize แต่ seed ใหม่ต้องใช้ canonical type โดยตรง

## Prepare Flow

หน้าเตรียมเข้ารับบริการทำหน้าที่ readiness-only

1. ผู้ใช้เลือก service profile จาก Contract Hub
2. Wallet ประเมินเอกสารที่พร้อมและเอกสารที่ขาดจาก canonical service profile
3. ผู้ใช้ขอเอกสารที่ขาดหรือนำเข้าเอกสารเพิ่ม
4. เมื่อพร้อมแล้ว Wallet route ไปหน้า Share พร้อม context ที่เลือก

Prepare ห้ามสร้าง QR หลักของ verifier เอง และห้ามใช้ `ServiceBundleEnvelope` เป็น primary QR payload

## Share Flow

หน้า Share เป็นจุดเดียวที่สร้าง share package สำหรับ verifier

Share สร้างได้ครั้งละหนึ่งชนิดเท่านั้น:

- `DirectVP`: เอกสารสำคัญใบเดียว เช่น identity หรือ prescription
- `PurposeVP`: ชุดเอกสารขนาดเล็กสำหรับ OPD หรือ pharmacy
- `StandardSHL`: SMART Health Link มาตรฐาน ใช้กับระบบภายนอกที่ไม่รู้จัก TrustCare extension
- `CertifiedSHLManifestPackage`: SHL มาตรฐานที่มี TrustCare Manifest VP และ Holder Authorization VC สำหรับ ecosystem ของ TrustCare

OPD และ pharmacy ใช้ VP เป็นค่าเริ่มต้น ส่วน referral, cross-border, medical-tourist และ insurance claim ใช้ Certified SHL เมื่อเป็นชุดเอกสารหลายใบหรือมีข้อมูลขนาดใหญ่

## Portable Presentation Envelope

Wallet และ Portal ต้อง render เอกสารจาก payload boundary เดียวกัน ไม่ derive รายละเอียดจาก label เก่าใน card list

`PortablePresentationEnvelope` เป็น view model กลางสำหรับ Web และ Mobile:

- รับ `WalletCard`, Portal presentation payload, SHL, VP หรือ DocumentReference แล้ว normalize เป็น envelope เดียว
- แยก `metadata`, `subject`, `issuer`, `holder`, `sections`, `evidence`, `trust`, `policy` และ `history`
- ซ่อน technical properties เช่น JWT, proof, signature, hash, watermark, render metadata และ internal resolver จาก selective disclosure
- แสดง trust status เป็น `verified`, `pending`, `transport_valid`, `expired`, `revoked` หรือ `invalid`
- ใช้ renderer เดียวกันใน Web (`PortablePresentationDocument`) และ Mobile (`CredentialDocumentNative`) เพื่อให้รายละเอียด credential ไม่เพี้ยนระหว่าง platform

เมื่อ Portal ส่ง `credentialSubject.humanDocument.renderData` หรือ renderer payload ตาม `docs/PORTAL_WALLET_RENDER_CONTRACT.md` Wallet ต้องใช้ payload นั้นก่อนเสมอ แล้วค่อยใช้ normalized VC/FHIR evidence เป็น fallback เฉพาะกรณีไม่มี render contract จาก Portal

## Micro-IPS+ Pack

`Micro-IPS+` คือชุดเอกสารขั้นต่ำตาม purpose ไม่ใช่ bundle QR แบบเดิม

- สร้างจาก canonical `WalletDocumentRecord` เท่านั้น
- เลือกเอกสารตาม service profile และ minimum-necessary policy
- เก็บ consent, purpose, audience, expiry, selected documents, evidence, provenance และ record time range
- ไม่ใช้ `shl_manifest` หรือ `sync_receipt` เพื่อ satisfy clinical readiness
- ถ้าต้องแชร์ ให้ route ไป Share เพื่อสร้าง `PurposeVP`, `StandardSHL` หรือ `CertifiedSHLManifestPackage` ตามขนาดข้อมูลและ trust policy

Timestamp ใน timeline ใช้ `recordTime` ของ clinical object เป็นหลัก ส่วน `packageTime` ใช้สำหรับ audit การสร้างชุดเอกสารเท่านั้น ถ้า record หลายรายการมีเวลาต่างกัน envelope ต้องแสดงช่วงเวลาและเรียงตาม record time เพื่อไม่ให้ package ใหม่ทำให้ข้อมูลเก่าดูเหมือนเป็นข้อมูลล่าสุด

## SHL Modes

Standard SHL ต้องยัง compatible กับ SMART Health Links

- `canonicalShlUrl` คือ `shlink:/...` จริงที่ระบบอื่นอ่านได้
- `webViewerUrl` เป็น wrapper เพื่อเปิดผ่าน browser และ demo cross-device
- ถ้าไม่มี TrustCare Manifest VP ให้ถือว่า transport-valid เท่านั้น
- ห้ามแสดงเป็น TrustCare verified จนกว่า Manifest VP, Manifest Credential, Holder Authorization VC, hashes, owner confirmation และ Maker/Checker policy จะครบ

Certified SHL ยังเป็น Standard SHL สำหรับระบบภายนอก แต่ TrustCare verifier ใช้ optional `trustcare` extension เพื่อยืนยัน provenance

## VC/VP Share Gateway

VC/VP QR ต้องเป็น resolver-backed URL ไม่ใช่ raw VP/JWT ขนาดใหญ่และไม่ใช่ URL ที่ฝัง `tc_payload`

- Share สร้าง VP payload ก่อน
- Wallet publish VP ไปที่ Share Gateway
- Gateway ลงลายเซ็น VP เป็น `vp+JWT` ด้วย ES256/EdDSA และเปิด JWKS endpoint สำหรับ verifier
- QR ใช้ resolver URL ที่ Gateway คืนกลับมา เช่น `/presentations/<presentationId>.jwt` หรือ Portal `/verify?vp=<presentationId>`
- Verifier fetch VP จาก resolver แล้วตรวจ JWT signature, nested VC JWT, status และ policy
- ถ้า resolver ดึง payload ได้แต่ยังไม่มี ES256/EdDSA/Data Integrity proof ที่ตรวจสอบได้ UI ต้องแสดงเป็น pending/yellow ไม่ใช่ green

Local development ใช้ Vite in-memory gateway ที่ `/api/share-gateway` เพื่อทดสอบ flow เดียวกันโดยไม่ฝัง payload ลง QR และเปิด `/api/share-gateway/.well-known/jwks.json` ให้ verifier ตรวจลายเซ็นจริง. Production ต้องชี้ `VITE_TRUSTCARE_SHARE_GATEWAY_URL` ไปที่ TrustCare Portal Backend/S3-backed resolver และให้ private key อยู่ใน backend/KMS เท่านั้น ไม่อยู่ใน browser.

## Demo Resolver

GitHub Pages ไม่มี backend สำหรับ enforce passcode, expiry, revocation, access count และ audit ดังนั้น demo mode สำหรับ SHL ยังใช้ static resolver เดิมจนกว่า Standard SHL และ SHL+Manifest VP จะตกลง architecture รอบถัดไป

- SHL manifest ใช้ `tc_resolver=shl-manifest`
- Manifest VP ใช้ `tc_resolver=manifest-vp`
- Legacy VP `tc_payload` รองรับเฉพาะ backward compatibility และห้ามใช้ให้ green badge

Production ต้องเปลี่ยน `manifestUrl` ไปที่ TrustCare Portal Backend/S3 ตาม `docs/SHL_GATEWAY_ARCHITECTURE.md`

## Seed And Mock Rules

Seed/mock ต้องเป็นข้อมูลทดสอบที่ทำงานได้จริง:

- ทุก test user ต้องเห็นเฉพาะข้อมูลใน scope ของตนเอง
- รูปจาก TrustCare Portal seed ต้องใช้รูปเดิมจาก Portal
- Wallet-native user ใช้รูป generated เฉพาะ user ใหม่ของ Wallet
- Seed SHL ที่เอาไว้ demo cross-device ต้อง scan และ resolve manifest ได้ทันที
- ถ้า seed SHL ต้องใช้ passcode ต้องมี flow ให้ผู้ทดสอบกรอก passcode จริง ไม่ใช้ hidden mock passcode

ชุดทดสอบใน `packages/wallet-core/tests/wallet-core.test.ts` จะ fail ถ้า seed ไม่ผ่าน canonical type, VC-like payload, DocumentReference evidence หรือ SHL demo resolver

## Store

Store แสดง portable objects ได้แก่ VC, VP, SHL, Manifest VP, Holder VC, OID4VCI offers, OID4VP requests และ scan/import history

`ServiceBundleEnvelope` ยังอาจอยู่ใน Contract Hub/API compatibility layer แต่ไม่ใช่ Wallet primary share object และไม่ควรถูกสร้างเป็น verifier QR จาก UI ใหม่

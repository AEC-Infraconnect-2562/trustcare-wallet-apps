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
- QR ใช้ resolver URL ที่ Gateway คืนกลับมา เช่น `/presentations/<presentationId>.json` หรือ Portal `/verify?vp=<presentationId>`
- Verifier fetch VP จาก resolver แล้วตรวจ proof/signature/status/policy
- ถ้า resolver ดึง payload ได้แต่ยังไม่มี ES256/EdDSA/Data Integrity proof ที่ตรวจสอบได้ UI ต้องแสดงเป็น pending/yellow ไม่ใช่ green

Local development ใช้ Vite in-memory gateway ที่ `/api/share-gateway` เพื่อทดสอบ flow เดียวกันโดยไม่ฝัง payload ลง QR. Production ต้องชี้ `VITE_TRUSTCARE_SHARE_GATEWAY_URL` ไปที่ TrustCare Portal Backend/S3-backed resolver.

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

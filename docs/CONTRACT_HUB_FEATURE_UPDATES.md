# รายการปรับปรุง Contract Hub สำหรับ TrustCare Wallet

เอกสารนี้บันทึกความสามารถใหม่ของ TrustCare Wallet ที่ฝั่ง TrustCare Portal และ Contract Hub ควรรู้จักในรอบพัฒนาถัดไป เพื่อให้ Wallet แบบ standalone, Wallet ของ partner ภายนอก และ TrustCare Portal กลางแลกเปลี่ยนข้อมูลกันได้โดยไม่ทำให้มาตรฐานเดิมเสียหาย

หลักการสำคัญคือ Wallet ต้องยังรองรับ SHL, OID4VCI, OID4VP, VC และ VP มาตรฐานเสมอ ส่วน Manifest VP/VC เป็นส่วนขยายของ TrustCare ที่ใช้เพิ่มความน่าเชื่อถือหลังผ่าน governance แล้วเท่านั้น

## 1. ประเภทความน่าเชื่อถือของ SHL

TrustCare Wallet แยก SHL ออกเป็น 3 ประเภทใน UI และ verifier policy

| ประเภท | ใช้เมื่อใด | พฤติกรรมที่ระบบควรทำ | Badge ใน UI |
| --- | --- | --- | --- |
| Standard SHL | SHL จากแหล่งภายนอกที่ไม่มี TrustCare Manifest VC/VP | อ่าน เก็บ ส่งออก แชร์ และสแกนเป็น SMART Health Link มาตรฐาน โดยไม่บังคับ Manifest VC/VP | `Standard SHL` |
| TrustCare Verified SHL | SHL ถูกนำเข้า TrustCare และผ่านการยืนยันจากเจ้าของข้อมูล พร้อม Maker/Checker ของโรงพยาบาลในเครือ TrustCare | เปิดใช้การตรวจสอบ Manifest VP/VC และแสดงเอกสาร DocumentReference ที่ผูกกับ manifest ได้ | `TrustCare Verified SHL` |
| TrustCare Pending SHL | มี Manifest VP/VC แต่หลักฐาน Maker/Checker ยังไม่ครบ | ยังแชร์และอ่านเป็น Standard SHL ได้ แต่ห้ามนับ Manifest VP/VC เป็น trust proof ของ TrustCare | `รอ Maker/Checker` |

Contract Hub ควรส่ง trust profile นี้ไปกับ service-readiness contract และ verifier policy เพื่อให้ Portal, Wallet และ verifier แสดงผลเหมือนกัน

## 2. เงื่อนไขการยอมรับ TrustCare Manifest VP/VC

TrustCare Manifest VP/VC จะถูกนับว่าเชื่อถือได้เฉพาะเมื่อมีเงื่อนไขครบทุกข้อ

- `trustcareCertification.status` เป็น `maker_checker_approved`
- เจ้าของ SHL ยืนยันแล้วผ่าน `ownerConfirmed: true`
- มีหลักฐาน `makerApprovedAt`
- มีหลักฐาน `checkerApprovedAt`
- ระบุโรงพยาบาลในเครือ TrustCare ที่รับรองผ่าน `networkHospitalDid`

ตัวอย่าง object ที่ Contract Hub/Portal ควรสร้างหรือรับรู้:

```json
{
  "trustcareCertification": {
    "status": "maker_checker_approved",
    "ownerConfirmed": true,
    "makerId": "maker-tcc-001",
    "makerName": "TrustCare Central Hospital Maker",
    "makerApprovedAt": "2026-07-01T04:44:00.000Z",
    "checkerId": "checker-tcc-001",
    "checkerName": "TrustCare Central Hospital Checker",
    "checkerApprovedAt": "2026-07-01T04:48:00.000Z",
    "networkHospitalDid": "did:web:trustcare.network:hospital:tcc",
    "consentReceiptId": "urn:uuid:...",
    "policyVersion": "trustcare-shl-governance-2026.07"
  }
}
```

ถ้า object นี้ไม่มีอยู่หรือข้อมูลไม่ครบ Wallet ต้องเก็บ SHL เป็น standard transport เท่านั้น และห้ามแสดงว่าเป็น TrustCare Verified SHL

## 3. Manifest VP/VC เป็นส่วนขยาย ไม่ใช่ข้อบังคับของ SHL

SHL ภายนอกที่ไม่มี Manifest VP/VC ต้อง import, render, export, share และ scan ได้โดยไม่ error

SHL ที่รองรับ TrustCare extension อาจมี field ต่อไปนี้:

- `manifestCredentialId`
- `presentationId`
- `documentBundle.bundleId`
- `documentBundle.manifestVersion`
- `documentBundle.bindingModel`
- `documentBundle.standards`
- `documentBundle.documents[]`
- `documentBundle.documents[].objectLinks`
- `documentBundle.documents[].vcBinding`
- `trustcareCertification`

ระบบภายนอกที่ไม่รู้จัก field เหล่านี้ควรมอง SHL เป็น SHL มาตรฐานต่อไป ส่วน TrustCare Portal/Wallet ใช้ field เหล่านี้เพื่อเพิ่ม provenance และตรวจสอบเอกสารใน manifest

## 4. รูปแบบ document bundle ใน SHL manifest

แต่ละรายการใน `documentBundle.documents[]` ควรผูก SHL file กับเอกสารที่สมจริงและตรวจสอบได้ ไม่ใช่แสดงทุกอย่างเป็นบัตรประจำตัว

ตัวอย่างรายการเอกสาร:

```json
{
  "id": "shl-doc-patient-summary",
  "sequence": 2,
  "title": "สรุปข้อมูลผู้ป่วย",
  "documentType": "patient_summary",
  "category": "clinical_summary",
  "status": "available_in_manifest",
  "sourceRole": "issuer",
  "fhirResource": "DocumentReference",
  "contentType": "application/fhir+json",
  "manifestFileId": "file-ips-summary",
  "manifestVersion": 1,
  "hash": {
    "contentHash": "sha256:...",
    "plaintextHash": "sha256:...",
    "sourceBundleHash": "sha256:..."
  },
  "objectLinks": {
    "manifest": "shl://7001/versions/1",
    "shlFile": "shl://7001/versions/1/files/file-ips-summary",
    "fhirDocumentReference": "DocumentReference/patient-summary-001",
    "fhirBundle": "Bundle/sha256:...",
    "manifestCredential": "Credential/urn:uuid:...",
    "holderPresentation": "Presentation/vp_shl_..."
  },
  "vcBinding": {
    "recommendedCredentialType": "PatientSummaryCredential",
    "manifestCredentialId": "urn:uuid:...",
    "presentationId": "vp_shl_..."
  }
}
```

เอกสารใน bundle ควรใช้ `DocumentReference` เป็น evidence หลัก และมี hash/source link เพียงพอให้ verifier ตรวจสอบที่มาได้

## 5. พฤติกรรมของ verifier

Verifier ของ Portal และ Wallet ควรมีพฤติกรรมตรงกัน

- สแกน Standard SHL: ผ่านในระดับ transport และไม่ต้องใช้ Manifest VP/VC
- สแกน TrustCare Verified SHL: ผ่านเมื่อมี Manifest VC, Holder VP, DocumentReference, owner confirmation และ Maker/Checker ครบ
- สแกน TrustCare Pending SHL: แสดง warning เก็บและแชร์เป็น Standard SHL ได้ แต่ยังไม่ถือว่า TrustCare verified
- Manifest VP payload ที่ขาด `manifestCredentialId` หรือ `holderPresentationId`: ให้เป็น error
- ผลสแกนควรแสดง checklist ให้ผู้ใช้เห็นว่าแต่ละชั้นผ่านหรือไม่ เช่น Manifest VC, Holder VP, Maker/Checker และ DocumentReference

## 6. Field ที่ Contract Hub ควรรองรับ

Contract template ในอนาคตควรเพิ่ม field เหล่านี้

- `shlTrustProfile`: `standard_shl | trustcare_verified_shl | trustcare_pending_shl`
- `requiresMakerChecker`: boolean
- `requiresOwnerConfirmation`: boolean
- `acceptedExternalShl`: boolean
- `manifestVpPolicy`: `optional | required_for_trustcare_network | disabled`
- `documentBundleRequiredTypes`: canonical Wallet card types
- `documentBundleFHIRResources`: expected FHIR resource types
- `minimumNecessaryFields`: field-level disclosure policy

แนวทางนี้ทำให้ partner ภายนอกยังใช้ SHL มาตรฐานได้กว้างที่สุด ขณะเดียวกันโรงพยาบาลในเครือ TrustCare สามารถเพิ่ม provenance ด้วย Manifest VP/VC หลังผ่าน Maker/Checker governance แล้ว


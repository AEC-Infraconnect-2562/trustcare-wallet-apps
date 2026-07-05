# TrustCare SHL Gateway Architecture

เอกสารนี้กำหนด architecture สำหรับการสร้าง อ่าน แชร์ และ verify SMART Health Links (SHL) ใน TrustCare Wallet แบบที่ demo ได้ทันที แต่ยังต่อยอดเป็น production ผ่าน TrustCare Portal Backend, DB และ S3 ได้โดยไม่ต้องรื้อ flow เดิม

## เป้าหมาย

- Wallet ต้องสแกนและเก็บ Standard SHL จากระบบภายนอกได้โดยไม่บังคับ Manifest VP/VC
- Wallet ต้องสร้าง SHL หรือ SHL + Manifest VP สำหรับ service readiness ได้
- SHL ที่สร้างจาก Wallet เพื่อใช้งานจริงต้องถูก publish ผ่าน TrustCare Portal Backend เพื่อให้มี manifest endpoint, encrypted files, access policy, audit และ revocation ที่ enforce ได้จริง
- GitHub Pages/local demo ใช้เป็น web wallet และ viewer ได้ แต่ไม่ถือเป็น production manifest gateway สำหรับข้อมูลจริง

## Component

| Component | หน้าที่ |
| --- | --- |
| Wallet Web/Mobile | เลือกเอกสาร ตั้ง policy สร้าง request และแสดง QR สำหรับผู้ใช้ |
| TrustCare Portal Backend | เป็น SHL Sharing Application/Gateway สร้าง manifest endpoint, store encrypted files, enforce passcode/access count/expiry และ audit |
| DB | เก็บ metadata เช่น publicationId, owner, selected documents, policy, manifest version, access logs, revocation |
| S3/Object Storage | เก็บ encrypted FHIR/DocumentReference files หรือ JWE ที่ manifest ชี้ไป |
| Contract Hub | กำหนด service readiness contexts, required documents, recommended transport, verifier policy |
| Verifier | อ่าน `shlink:/...`, fetch manifest, ตรวจ trust layer และแสดงผล scan response |

## URL และ Payload ที่ต้องแยกกัน

| ค่า | ใช้เพื่อ | ตัวอย่าง |
| --- | --- | --- |
| `canonicalShlUrl` | SHL มาตรฐานจริงที่ระบบอื่นต้องอ่านได้ | `shlink:/...` |
| `manifestUrl` | Endpoint ที่ SHL payload ชี้ไปเพื่ออ่าน manifest | `https://portal.example/api/shl/manifests/{id}` |
| `webViewerUrl` | Web wrapper สำหรับให้ browser เปิด viewer ได้และยังมี canonical SHL ใน fragment | `https://wallet.example/#shlink:/...` |
| `qrPayload` | ค่าที่เอาไปแสดงเป็น QR ใน Wallet | ปกติใช้ `webViewerUrl` เพื่อ demo ข้ามเครื่องง่ายขึ้น |

ระบบต้องเก็บ `canonicalShlUrl` เสมอ เพื่อรักษา interoperability ตาม SHL spec ส่วน `webViewerUrl` เป็น convenience wrapper สำหรับ browser และ demo cross-device

## Production Flow: Wallet สร้าง SHL ผ่าน Portal Backend

1. ผู้ใช้เลือกบริการหรือวัตถุประสงค์ เช่น OPD, referral, cross-border
2. Wallet เลือกเอกสารตาม Contract Hub และ policy ที่ผู้ใช้ตั้ง เช่น expiry, max access count, passcode
3. Wallet ส่ง request ไปที่ Portal Backend

```http
POST /api/wallet/shl-packages
```

```json
{
  "publicationId": "shl-cross_border-...",
  "context": "cross_border",
  "ownerUserId": "demo-patient-complete-001",
  "patientId": 6501001001,
  "selectedCardIds": [1, 2, 3],
  "receiver": "โรงพยาบาลที่รองรับ TrustCare",
  "purpose": "รักษาต่อข้ามเครือข่าย/ต่างประเทศ",
  "accessPolicy": {
    "passcodeRequired": true,
    "accessCodeDelivery": "separate_channel",
    "expiresAt": "2026-07-10T00:00:00.000Z",
    "maxAccessCount": 3
  },
  "publish": {
    "storageProvider": "s3",
    "return": ["canonicalShlUrl", "webViewerUrl", "manifestUrl", "documentBundle"]
  }
}
```

4. Portal Backend สร้าง encrypted files ลง S3 และสร้าง manifest metadata ลง DB
5. Portal Backend ส่ง response กลับมาให้ Wallet

```json
{
  "canonicalShlUrl": "shlink:/...",
  "webViewerUrl": "https://wallet.example/#shlink:/...",
  "manifestUrl": "https://portal.example/api/shl/manifests/shl-cross_border-...",
  "gatewayMode": "portal_backend",
  "storageProvider": "s3",
  "trustLayerStatus": "pending_manifest_vp"
}
```

6. Wallet แสดง QR จาก `webViewerUrl` แต่ export และ verifier logic ต้องอ้าง `canonicalShlUrl`

## Manifest Endpoint

Portal Backend ควรรองรับ:

```http
POST /api/shl/manifests/{publicationId}
GET  /api/shl/manifests/{publicationId}
GET  /api/shl/files/{publicationId}/{fileId}
POST /api/wallet/shl-packages/{publicationId}/revoke
```

กติกา:

- ถ้า SHL มี passcode flag ต้องใช้ `POST` พร้อม `passcode` และห้าม fallback เป็น `GET`
- ถ้า SHL ไม่มี passcode อาจรองรับ `GET` เพื่อให้ static clients อ่านได้ง่าย
- ทุก access ต้องบันทึก audit log และตรวจ expiry/max access count
- File URL ใน manifest ควรชี้ไป encrypted payload หรือ presigned endpoint ที่จำกัดอายุ

## Passcode และ Security

- PIN/passcode ห้ามฝังใน QR, `canonicalShlUrl`, `webViewerUrl`, manifest URL หรือ payload export
- ผู้ใช้ต้องส่ง PIN ผ่านช่องทางแยก เช่น in-person, secure message, SMS หรือช่องทางที่ policy อนุญาต
- Wallet แสดงได้เฉพาะ hint เช่น `ตั้งค่าแล้ว ****`
- Backend ต้อง enforce passcode, expiry, max access count และ revocation เพราะ static GitHub Pages enforce สิ่งเหล่านี้ไม่ได้

## Standard SHL เทียบกับ TrustCare Manifest VP

| ประเภท | Compatibility | TrustCare behavior |
| --- | --- | --- |
| Standard SHL | ใช้ได้กับ client SHL ทั่วไป | import/export/share/scan ได้ทันที ไม่ต้องมี Manifest VP |
| SHL + Pending Manifest VP | ยังเป็น Standard SHL สำหรับระบบภายนอก | TrustCare สร้าง binding เป็นสถานะรอ Maker/Checker |
| SHL + Certified Manifest VP | ยังเป็น Standard SHL สำหรับระบบภายนอก | TrustCare verifier นับ Manifest VC/Holder VP เป็น trust proof หลัง owner + Maker/Checker approved |

เมื่อนำ SHL ภายนอกเข้า TrustCare ecosystem ระบบสามารถสร้าง TrustCare Manifest VP binding เพิ่มได้ แต่ต้องรอ owner confirmation และ Maker/Checker ก่อนจึงแสดงเป็น verified

## Demo Mode ใน repo นี้

`@trustcare/wallet-core/src/shlGateway.ts` สร้าง `TrustCareShlGatewayPublication` ที่มี:

- `canonicalShlUrl`
- `webViewerUrl`
- `manifestUrl`
- `manifest.documentBundle`
- `portalRequest`
- `warnings` เมื่อยังไม่ใช่ `portal_backend`

ใน local/GitHub Pages demo:

- QR แสดงผ่าน web wrapper เพื่อให้เครื่องอื่นเปิดได้ง่าย
- contract และ manifest metadata ถูกสร้างใน client เพื่อทดสอบ UX/Verifier flow
- access policy เช่น passcode/max access count ถูกแสดงและ validate ฝั่ง UI ได้ แต่การ enforce จริงต้องอยู่ที่ Portal Backend

ใน production:

- ตั้งค่า `VITE_TRUSTCARE_SHL_GATEWAY_URL` ให้ชี้ Portal Backend
- Portal Backend ต้องตอบ manifest/files endpoint จริง และ enforce policy
- Wallet ไม่ต้องเปลี่ยน flow หลัก เพราะ request/response contract เดียวกัน

## Environment

```bash
VITE_TRUSTCARE_API_URL=https://portal.example/trpc
VITE_TRUSTCARE_SHL_GATEWAY_URL=https://portal.example/api/shl
VITE_TRUSTCARE_SHL_VIEWER_URL=https://wallet.example
VITE_TRUSTCARE_ENABLE_DEMO_LOGIN=false
```

## Development Checklist

- เพิ่ม backend route ตาม contract ด้านบน
- เก็บ manifest metadata, file metadata, access policy และ audit log ใน DB
- เก็บ encrypted files ใน S3 หรือ object storage ที่เทียบเท่า
- รองรับ Standard SHL import โดยไม่ require Manifest VP
- เพิ่ม Maker/Checker workflow สำหรับ TrustCare Manifest VP certification
- เพิ่ม integration tests: create SHL, scan cross-device, passcode required, expired, revoked, max access reached, Standard SHL fallback
- ห้าม log raw SHL key, passcode, JWT, หรือ patient identifier แบบไม่ mask

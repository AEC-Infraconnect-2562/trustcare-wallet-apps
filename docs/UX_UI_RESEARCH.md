# TrustCare Wallet — Deep Research การปรับปรุง UX/UI จากแอปต้นแบบระดับโลก

วันที่วิจัย: 2026-07-18
สถานะ: ใช้เป็นเกณฑ์อ้างอิงสำหรับรอบปรับปรุง `wallet-ux-ui-research` และรอบถัดไป

## 1. เป้าหมาย

ยกระดับ UX/UI ของ TrustCare Wallet (web + mobile) ให้ "ใช้งานง่าย สะอาดตา และใช้งานได้จริง"
เทียบเท่าแอปกระเป๋าเอกสาร/การเงินที่ผู้ใช้ทั่วไปคุ้นเคย โดยไม่ลดทอนความถูกต้องของ
สถานะความน่าเชื่อถือ (trust state) ของเอกสารสุขภาพ ซึ่งเป็นข้อจำกัดด้าน data integrity
ที่ระบุไว้ใน `design-qa.md` และ `docs/WALLET_ARCHITECTURE.md`

## 2. แอปต้นแบบที่ศึกษา (Benchmarks)

### 2.1 กลุ่ม OS Wallet — Apple Wallet / Google Wallet

แหล่งอ้างอิง: Apple Human Interface Guidelines (Wallet/Passes), Google Wallet Generic Pass
brand guidelines

สิ่งที่ทั้งสองแอปทำเหมือนกันและเป็นมาตรฐานของหมวดนี้:

- **บัตรคือ hero ของหน้าจอ** — เปิดแอปมาเจอ "ตั้งบัตร" ทันที ไม่มี dashboard ซ้อน
  ไม่มีแถบสถานะทางเทคนิคใด ๆ คั่นระหว่างผู้ใช้กับบัตร
- **ข้อมูลบนบัตรถูกจำกัดจำนวน field อย่างเข้มงวด** — Apple pass มี header ได้ไม่เกิน 3,
  primary 1, secondary ไม่เกิน 4 ผลคือบัตรอ่านรู้เรื่องใน 2 วินาที รายละเอียดที่เหลือ
  อยู่หลังการกดเปิดบัตร (progressive disclosure)
- **สีพื้นบัตรสื่อประเภท/แบรนด์** — Google Wallet ถึงขั้น derive สีพื้นจากโลโก้อัตโนมัติ
  ผู้ใช้แยกบัตรจากสีและรูปทรงได้โดยไม่ต้องอ่านชื่อ
- **สถานะแสดงเฉพาะเมื่อผิดปกติหรือทำอะไรได้** — บัตรปกติไม่มีป้าย "verified" แปะทุกใบ
  จะเห็นป้ายก็ต่อเมื่อบัตรหมดอายุ/ถูกยกเลิก/ต้องอัปเดต
- **Verify with Wallet (iOS 16+)** — การยืนยันตัวตนคือ sheet เดียว บอกว่า "ใครขอ อะไรบ้าง"
  แล้วยืนยันด้วย Face ID — ไม่มี multi-step wizard

### 2.2 กลุ่ม Identity Wallet ภาครัฐ — EUDI Wallet Reference Implementation

แหล่งอ้างอิง: eu-digital-identity-wallet ARF + eudi-app-android/ios-wallet-ui

- **หน้าขอข้อมูล (Request screen) เป็นหัวใจ** — แสดงชื่อผู้ขอ (Relying Party),
  รายการ attribute ที่ขอ, ติ๊กเลือก/ไม่เลือกได้เป็นราย attribute แล้วจึงยืนยัน
  → ตรงกับ Selective Disclosure ของ TrustCare แต่ EUDI ทำเป็น "หน้าเดียวจบ"
- **User-centricity เป็นข้อกำหนด** — ผู้ใช้ต้องเห็นเสมอว่า "กำลังให้อะไร กับใคร"
  โดยไม่ต้องเข้าใจ OID4VP/SD-JWT ที่ทำงานอยู่ข้างล่าง
- ศัพท์โปรโตคอล (PID, QEAA, VP token) **ไม่ปรากฏใน UI เลย** — ปรากฏเฉพาะในเอกสารสถาปัตยกรรม

### 2.3 กลุ่มสุขภาพไทย — เป๋าตัง Health Wallet / หมอพร้อม

แหล่งอ้างอิง: Krungthai Health Wallet, บทความรีวิว Health Wallet, ประสบการณ์ผู้ใช้ช่วง
วัคซีนโควิด (หมอพร้อม ออกใบรับรองวัคซีนดิจิทัลให้คนไทยหลายสิบล้านคน)

- **Mental model ของผู้ใช้ไทยถูกหล่อหลอมด้วยสองแอปนี้แล้ว**: เข้าแอป → เห็นสิทธิ/บัตร →
  กดใช้สิทธิ/แสดง QR → จบ ทุกอย่างเป็นภาษาไทยล้วน ไม่มีศัพท์เทคนิค
- ใบรับรองวัคซีนหมอพร้อมคือ ตัวอย่างที่ดีของ "เอกสารรับรอง + QR" ในบริบทไทย:
  หน้าเดียว มีตราหน่วยงาน ชื่อ-เลขบัตร วันที่ และ QR สำหรับตรวจ — ไม่มีคำว่า VC/VP/JWT
- เป๋าตังใช้ **bottom navigation + การ์ดสิทธิเรียงแนวตั้ง** และปุ่ม CTA เดียวชัดเจนต่อการ์ด
- บทเรียนเชิงลบที่ควรหลีกเลี่ยง: หน้ารวมบริการของเป๋าตังเริ่มแน่นเพราะยัดทุกบริการ
  ลงหน้าแรก — TrustCare ควรคุมจำนวน section ของ Home ให้นิ่ง

### 2.4 กลุ่ม FinTech / Super App — Revolut, K PLUS

- **แถวรายการ (transaction row) คือแบบเรียนของ list design**: ไอคอนสี + ชื่อ + เวลา +
  จำนวนเงิน ไม่มีอะไรเกิน 3 บรรทัด สถานะพิเศษเป็นสีตัวอักษร ไม่ใช่ป้ายเต็มแถว
- **Settings เป็น grouped list** (iOS Settings pattern): หมวด → แถว → ค่าปัจจุบันขวามือ
  ไม่ใช่ grid ของการ์ดขนาดไม่เท่ากัน
- การกระทำอันตราย/ทางเทคนิคถูกซ่อนอยู่ลึกอย่างตั้งใจ (เช่น export ข้อมูล)

### 2.5 กลุ่ม Crypto / NFT Wallet — MetaMask, Phantom, Rainbow, Trust Wallet

แหล่งอ้างอิง: Phantom design breakdown (925studios), เอกสารเปรียบเทียบ wallet ปี 2025-2026

กลุ่มนี้สำคัญเป็นพิเศษเพราะแก้ปัญหาเดียวกับ TrustCare ตรง ๆ:
"ผู้ใช้ทั่วไปถือ cryptographic asset โดยไม่ต้องเข้าใจ cryptography"

- **ซ่อน address/DID ให้เหลือชื่อที่คนอ่านได้** — MetaMask ใช้ account name + identicon,
  Phantom ใช้ username, address ย่อ (`0x12ab…89cd`) โผล่เฉพาะตอน copy
  → DID `did:key:z6Mk...` ไม่ควรอยู่บนแถบสถานะทุกหน้าของ TrustCare
- **Phantom: "complexity the system can absorb is never handed to the user"** —
  รวมทุก chain ในวิวเดียว เลือก network ให้อัตโนมัติ
  → เทียบเท่า: ผู้ป่วยไม่ควรต้องเลือก VP/SHL/Manifest VP เอง ระบบแนะนำให้แล้วบอกเหตุผลสั้น ๆ
- **Human-readable transaction preview** — ก่อน sign, Phantom แสดง "อะไรเข้า อะไรออก"
  เป็นภาษาคน → เทียบเท่า: ก่อนสร้าง QR แชร์ ให้สรุป "จะเปิดเผยอะไร ให้ใคร นานเท่าไร"
  หน้าเดียว ไม่ใช่ wizard 4 ขั้นที่แสดงพร้อมกันทั้งหมด
- **NFT gallery** — Rainbow/Phantom แสดง collectible เป็น grid รูปใหญ่ สีสัน มี identity
  ต่อ collection → เอกสารสุขภาพแต่ละประเภทควรมี visual identity (สี/ไอคอน) ของตัวเอง
  ไม่ใช่ไอคอนเอกสารสีน้ำเงินซ้ำทุกใบ
- **Trust signal แสดงเมื่อจำเป็น** — Phantom เตือน (สีแดง เต็มจอ) เฉพาะธุรกรรมเสี่ยง;
  ภาวะปกติเงียบ → ป้ายเตือนสีเหลืองซ้ำ ๆ ทุกการ์ดทำให้เกิด "alert fatigue"
  และทำให้ป้ายที่สำคัญจริงไม่มีใครอ่าน

## 3. Audit สถานะปัจจุบัน (หลักฐาน: screenshot ชุด `shots-before`, 1440×1024 และ 390×844)

| # | ปัญหา | หลักฐาน | ขัดกับหลักการของ |
|---|-------|---------|------------------|
| P1 | ศัพท์เทคนิครั่วสู่ผู้ป่วยทุกหน้า: แถบสถานะแสดง DID เต็ม ๆ, subtitle มี "OID4VCI offer, OID4VP request, SHL และ VC/VP", "Contract Hub", "OPDReadinessBundle", Session ID hex ในตั้งค่า | ทุกหน้า | EUDI, Phantom, เป๋าตัง |
| P1 | ป้ายเตือนเหลือง "อยู่ระหว่างตรวจสอบ" ซ้ำทุกการ์ดทุกหน้า + แถบเตือน "proof, issuer, status, expiry หรือ policy ไม่ครบ" บน Home | Home, เอกสาร | Apple Wallet, Phantom (alert fatigue) |
| P1 | หน้าแชร์แสดง wizard 4 ขั้น + timeline + summary ซ้ำ 3 จุดพร้อมกันในหน้าเดียว ยาว ~2,300px | /share | Apple Verify-with-Wallet, EUDI Request screen |
| P2 | เอกสารทุกใบหน้าตาเหมือนกัน (กล่องขาว + ไอคอนไฟล์น้ำเงิน) แยกประเภทด้วยการอ่านชื่อเท่านั้น | Home, /records | Apple/Google pass color, NFT gallery |
| P2 | รูปผู้ถือบัตรที่ไม่มีในเครดเชียลแสดงเป็นไอคอน "รูปเสีย" (ImageOff) ดูเหมือนแอปพัง ทั้งที่เป็นนโยบายถูกต้อง (ไม่ยืมรูปจากที่อื่น) | Home การ์ดบัตรประจำตัว | ทุก benchmark ใช้ initials/silhouette |
| P2 | แถบสถานะ (status strip) มีปุ่มระดับ Settings ปน: ส่งออกทั้งหมด, ธีม, ภาษา — ทุกหน้า | ทุกหน้า | Revolut settings pattern |
| P2 | หน้าตั้งค่าเป็น grid การ์ดสูงไม่เท่ากัน ปุ่มม่วงใหญ่ไม่สม่ำเสมอ label ปุ่มโหมดนักพัฒนากำกวม (แสดงสถานะปนกับ action) | /settings | iOS/Revolut grouped list |
| P2 | หน้า Login โชว์ "Failed to fetch" สีแดง ทั้งที่ระบบ login สาธิตใช้งานได้ปกติ | login | ทุก benchmark: error เฉพาะที่ actionable |
| P3 | Console error: "Maximum update depth exceeded" (บั๊กจริงใน effect loop) | dev console | — |
| P3 | หน้า Prepare ยาวและซ้ำข้อมูลกับหน้า Share (การ์ดบริการ, checklist, รายการเอกสาร แสดงพร้อมกัน 5 บล็อก) | /prepare | progressive disclosure |

## 4. หลักการออกแบบที่สกัดได้ (Design Principles)

1. **Documents-first**: เอกสาร/บัตรคือพระเอก ลด chrome รอบตัวให้เหลือน้อยที่สุด
2. **ศัพท์โปรโตคอลอยู่หลังม่าน**: VC/VP/SHL/OID4VCI/DID/FHIR ปรากฏได้เฉพาะ
   (ก) โหมดนักพัฒนา (ข) เอกสาร architecture — ห้ามปรากฏใน UI ผู้ป่วย
3. **Visual identity ต่อประเภทเอกสาร**: สี + ไอคอนประจำประเภท (identity=น้ำเงิน,
   สิทธิ/ประกัน=เขียวteal, ยา=ม่วง, แพ้ยา=แดง, นัดหมาย=ส้ม, ผลตรวจ=ฟ้าอมเขียว)
   ใช้ชุดเดียวกันทุกหน้า ทุกแพลตฟอร์ม
4. **สถานะเงียบเมื่อปกติ เด่นเมื่อต้องทำอะไร**: ป้าย "รอรับรอง" ใช้โทนเบา (outline)
   ป้ายแดง/คำเตือนเต็มแถวสงวนไว้สำหรับสิ่งที่ผู้ใช้ต้องตัดสินใจ
5. **หนึ่งหน้าจอ หนึ่งงาน**: แชร์ = sheet เดียว (ให้ใคร → อะไร → ยืนยัน → QR);
   เตรียมบริการ = checklist เดียว
6. **ภาวะผิดพลาดต้องแปลเป็นภาษาคน + ทางไปต่อ**: ไม่มี "Failed to fetch" ดิบ ๆ

## 5. สิ่งที่ปรับในรอบนี้ (Implemented)

| การเปลี่ยนแปลง | ไฟล์ | Benchmark ที่อ้าง |
|----------------|------|-------------------|
| ตัด DID, ส่งออกทั้งหมด, ธีม, ภาษา ออกจากแถบสถานะทุกหน้า — DID ย้ายไปโหมดนักพัฒนา, ที่เหลือย้ายเข้าหน้าตั้งค่า | `App.tsx` | MetaMask/Phantom (ซ่อน address), Revolut |
| ทำแถบสถานะให้บางลงและเงียบลง (ไม่แข่งกับเนื้อหา) | `ux-refresh.css` | Apple Wallet |
| ระบบสีประจำประเภทเอกสาร ใช้กับการ์ดสำคัญบน Home, รายการล่าสุด, และรายการเอกสาร ผ่าน `data-document-type` ที่มีอยู่แล้ว | `ux-refresh.css` | Google Wallet auto-color, NFT gallery |
| ป้าย "อยู่ระหว่างตรวจสอบ" เปลี่ยนเป็นโทน outline เบา; ป้ายเขียว "รับรองแล้ว" เท่านั้นที่เป็นสีทึบ | `ux-refresh.css` | Phantom trust signals |
| รูปผู้ถือที่ไม่มีในเครดเชียล: เปลี่ยนจากไอคอนรูปเสียเป็น silhouette บุคคลโทนอ่อน (คงนโยบายไม่ยืมรูป + คง aria-label เดิม) | `identityPresentation.tsx`, `RecordsV2View.tsx` | ทุก benchmark |
| แถบเตือนบน Home เปลี่ยนสำเนาเป็นภาษาผู้ป่วย: "รอโรงพยาบาลรับรอง N รายการ" (ตัด proof/issuer/policy) | `AppViews.tsx` | เป๋าตัง/หมอพร้อม |
| หน้าตั้งค่า: เปลี่ยนเป็น grouped list — ความปลอดภัย / การแสดงผล (ธีม+ภาษา) / ข้อมูล (ส่งออก) / นักพัฒนา (รายละเอียด test session พับเก็บ) | `SecondaryViews.tsx` | iOS Settings, Revolut |
| หน้า Login: ไม่แสดง error การเชื่อม Portal เมื่อระบบ login สาธิตพร้อมใช้งาน; แสดงเป็นหมายเหตุเบา ๆ แทน | `App.tsx`, `IdentityViews.tsx` | หลัก error-only-when-actionable |
| แบนเนอร์สภาพแวดล้อม (ข้อมูลสาธิต) ย่อเป็นแถบบางบรรทัดเดียว | `ux-refresh.css` | Apple Wallet chrome discipline |

## 5b. สิ่งที่ปรับเพิ่มในรอบสอง (Implemented)

| การเปลี่ยนแปลง | ไฟล์ | หมายเหตุ |
|----------------|------|----------|
| แก้บั๊ก "Maximum update depth exceeded" (render loop ทุกหน้า): fallback `[]`/`{}` ที่สร้างใหม่ทุก render ใน `useWalletExchange` ทำให้ `allCards` เปลี่ยน identity ตลอดจน effect readiness ยิง setState วนไม่จบ — เปลี่ยนเป็นค่าคงที่ระดับโมดูล + memoize `graphArtifacts` | `useWalletExchange.ts` | ตรวจซ้ำแล้ว 0 error ทั้ง 8 route |
| /prepare และ /share เป็น flow คอลัมน์เดียวต่อเนื่อง แก้อาการ "การแสดงผลไม่ต่อเนื่อง": ตัด nested scroll, sticky panel และ grid สูงไม่เท่ากัน | `ux-refresh.css` | ตามที่ผู้ใช้รายงาน |
| ตัดแผงสรุป SharePacketComposer/PacketRecommendation ที่ซ้ำกับ step 1 และ 3 ออกจากหน้าแชร์ (ข้อมูลเดิมแสดงในขั้นตอนอยู่แล้ว) | `AppViews.tsx` | ลดการทวนซ้ำ 3 จุดเหลือจุดเดียว |
| QR เต็มจอแบบ boarding pass: กด QR ในขั้นที่ 4 เพื่อเปิดเต็มจอ พร้อมชื่อผู้รับ วัตถุประสงค์ และอายุการใช้งาน | `AppViews.tsx`, `ux-refresh.css` | ปุ่ม `share-qr-fullscreen-open` |

## 5c. สิ่งที่ปรับเพิ่มในรอบสาม (Implemented)

| การเปลี่ยนแปลง | ไฟล์ | Benchmark ที่อ้าง |
|----------------|------|-------------------|
| สีประจำประเภทเอกสารเป็นระบบเดียวทั้งสองแพลตฟอร์ม: เพิ่ม `accentForCardType` ใน design-tokens (derive จาก gradient เดิม) ใช้ใน mobile list row (แถบสี + ไอคอน tile) และปรับ palette ฝั่ง web ให้ตรงกับ token | `design-tokens/gradients.ts`, `WalletDocumentListItem.tsx`, `ux-refresh.css` | Google Wallet, NFT gallery |
| หน้าแชร์อ่านเป็น sheet เดียว: ตัดกรอบการ์ดของแต่ละขั้น เหลือเส้นแบ่งบาง ๆ ในแผ่นเดียว | `ux-refresh.css` | EUDI Request screen |
| แปลศัพท์ timeline เป็นภาษาผู้ป่วย: "Record/Package time" → "เรียงตามวันที่ในเอกสาร/วันที่จัดชุด", ตัดชื่อ fixture ภายในออกจากรายการ, "คัดลอก VP/SHL" → "คัดลอกชุดข้อมูลที่แชร์/ลิงก์สุขภาพ" | `AppViews.tsx` | เป๋าตัง/หมอพร้อม |
| Empty states: คลังพกพาและหน้ากิจกรรม แสดงไอคอน + คำอธิบาย + ทางไปต่อ แทนพื้นที่ว่าง | `EmptyState.tsx`, `SecondaryViews.tsx`, `AppViews.tsx` | ทุก benchmark |

## 6. Roadmap รอบถัดไป

1. **Share flow → single sheet เต็มรูปแบบ**: ยุบ 4 ขั้นเหลือ sheet เดียวแบบ EUDI Request
   screen (ติ๊กราย attribute → ยืนยัน → QR) พร้อมนับถอยหลังหมดอายุ
2. **Prepare → checklist เดียว**: การ์ดเลือกบริการเป็น horizontal chips,
   เหลือ 1 checklist + 1 CTA ("พร้อมแล้ว ไปสร้าง QR")
3. **Mobile app (Expo)**: นำระบบสีประจำประเภทเดียวกันไปใช้ใน `ui-mobile`
4. **Empty states**: ทุกหน้า (เอกสารว่าง, ประวัติว่าง) ให้มีภาพ + คำอธิบาย + CTA เดียว
5. **Timeline/Record time ในหน้าแชร์**: แปลงเป็นภาษาผู้ป่วยหรือย้ายไปโหมดนักพัฒนา

## 7. แหล่งอ้างอิง

- Apple HIG — Wallet: https://developer.apple.com/design/human-interface-guidelines/wallet
- Apple PassKit Pass Design: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html
- Google Wallet Generic Pass brand guidelines: https://developers.google.com/wallet/generic/resources/brand-guidelines
- EUDI Wallet ARF: https://eu-digital-identity-wallet.github.io/eudi-doc-architecture-and-reference-framework/
- EUDI Android reference UI: https://github.com/eu-digital-identity-wallet/eudi-app-android-wallet-ui
- Phantom Wallet Design Breakdown: https://www.925studios.co/blog/phantom-wallet-design-breakdown
- Krungthai Health Wallet (เป๋าตัง): https://krungthai.com/th/content/personal/health-wallet
- Digital wallet UX guide (Qubstudio): https://qubstudio.com/blog/digital-wallet-design/

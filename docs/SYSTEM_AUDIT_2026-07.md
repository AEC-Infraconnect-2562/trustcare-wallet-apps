# TrustCare Wallet — System Integrity Audit (2026-07)

ขอบเขต: ตรวจ hardcode, orphan, stub/placeholder, ownership scope และยืนยันว่า
SSOT, entities, relationships, binding ถูก implement จริง — รายงานตามหลักฐานจริง
ทั้งจุดที่ผิดและจุดที่ถูก ("ห้ามหลอก")

วิธีตรวจ: static grep ทั่ว `apps/` + `packages/`, อ่าน source โดยตรง, `pnpm check`
(9 workspaces ผ่าน), `pnpm test` (ผ่านทั้งหมดหลังแก้)

---

## 1. สิ่งที่แก้แล้วในรอบนี้ (Safe fixes applied)

| # | ปัญหา | หลักฐาน | การแก้ |
|---|-------|---------|--------|
| A1 | **Orphan (dead code)** — `StoreScreen.tsx` ของ mobile ไม่มีใครอ้างถึง; route `app/store.tsx` เรนเดอร์ `RecordsScreen` แทน | `grep StoreScreen` เจอเฉพาะนิยามตัวเอง; `app/store.tsx` = `export default RecordsScreen` | ลบไฟล์ |
| A2 | **Orphan (dead code)** — `SelectiveDisclosureDialog.tsx` ไม่ถูกใช้ในหน้าจอจริง; share flow ใช้ field-chip inline ใน `AppViews.tsx` (`toggleField`/`selectedFields`) แทน; อ้างถึงเฉพาะ test ของตัวเอง | `grep SelectiveDisclosureDialog` เจอเฉพาะไฟล์ + test | ลบไฟล์ + test |
| A3 | **Hardcode / faking** — demo verifier preview คืน `holderDid` ทึบ (`did:key:z6Mkha…`) ทั้งที่ยังไม่ได้ fetch/verify holder VP → รายงาน identity ที่ไม่มีจริง | `verifier.ts:443` ใน branch `usesDemoRuntime`, `verified:false` | ตัด field ออก (type รองรับ optional); path ที่ verify จริง (บรรทัด 176/271/345) ยังคืน holderDid จริงจาก payload |

หมายเหตุ A1: ลบ `StoreScreen` แล้วบน mobile ยังไม่มีหน้า "คลังพกพา" (portable objects: VC/VP/SHL/OID)
เท่ากับ web — route `store` ชี้ไปหน้าเอกสารแทน ดู §4 (parity gap)

---

## 2. สิ่งที่ยืนยันว่า "ถูกต้องแล้ว" (Verified correct — ไม่ต้องแก้)

รายงานนี้ระบุจุดที่ผ่านจริงด้วย เพื่อไม่ให้เข้าใจผิดว่าทั้งระบบพัง

- **Ownership scope (isolation)** — enforce แบบ defense-in-depth จริง ไม่ใช่แค่ filter หน้าจอ:
  - `IndexedDbWalletRepository.assertOwnedDocument()` **throw** เมื่อ `record.owner.id !== ownerId`
  - `listDocuments`/`listActivity` คืน `[]` หรือ throw เมื่อ query ข้าม owner
  - `useOfflineWallet.mergeOfflineCardsForOwner()` throw `"owner boundary violation"`
  - `payer/orchestration.ts:372` กันไม่ให้ artifact ของ user อื่นปนเข้า wallet
  - `App.tsx:1414` กัน scan processing ถ้าพบ card ข้าม owner
- **SSOT ของ canonical document types** — นิยามเดียวที่ `canonicalDocuments.ts`
  (`CANONICAL_DOCUMENT_TYPES`, 25 ชนิด ตรงกับ `WALLET_ARCHITECTURE.md`).
  `credentialTypes.ts` เป็น *facet* (photo-bearing/identity subset/labels) ไม่ใช่รายการแข่ง
- **Renderer เดียว (SSOT)** — ทั้ง web (`ui-web/CredentialDocument.tsx`) และ mobile
  (`CredentialDocumentNative.tsx`) เรียก `credentialRenderModelFromCard` +
  `presentationEnvelopeFromWalletCard` จาก `@trustcare/wallet-core` เดียวกัน
  ไม่มี renderer ชุดที่สอง (ตรงตามข้อห้ามใน architecture)
- **Holder DID binding — ของจริง** — `holderIdentity.ts` derive `did:key:` จาก public key
  จริงผ่าน multicodec+base58btc (`publicKeyMultibaseFromJwk`) ตาม did:key spec
  ไม่ได้ปั้นสตริง
- **Runtime gating** — demo stub อยู่หลัง `usesDemoRuntime()` / `env.demoMode` ทุกจุดที่ตรวจ
  ไม่รั่วเข้า sandbox/pilot/production
- **Design-token accent** — หลังรอบ UX สีเอกสารมาจาก `accentForCardType` (design-tokens)
  ที่ derive จาก gradient เดียว ใช้ร่วม web+mobile

---

## 3. รายการที่ต้องให้เจ้าของระบบตัดสินใจ (ยังไม่แก้ — มีผลต่อ product)

| # | เรื่อง | หลักฐาน | ทางเลือก |
|---|--------|---------|----------|
| D1 | **Placeholder routes ที่ยังไม่ทำ** — `active_shares`, `connections`, `family` เรนเดอร์ `RoutePlaceholderView` ("กำลังพัฒนา") **ไม่มีลิงก์ใน navigation** เข้าได้เฉพาะพิมพ์ URL ตรง | `AppNavigation.tsx` ไม่มีปุ่มไป 3 route นี้; `appRoutes.ts` มี `view:null` + `WalletPlaceholderRouteId` | (ก) คงไว้ (redirect/CTA graceful ไม่พัง) — **แนะนำ** ถ้ายังอยู่ใน roadmap · (ข) ลบ route+view+RoutePlaceholderView ทิ้งถ้าเลิกทำ |
| D2 | **Walk-in holder DID ปลอม** — `wallet.ts:523` demo path คืน `did:key:walkin-${Date.now()}` ซึ่ง **ไม่ใช่ did:key ที่ถูกต้อง** (ของจริงต้อง multibase-encode จาก key ตาม `holderIdentity.ts`) | `wallet.ts:523` ใน `usesDemoRuntime` | (ก) เปลี่ยนเป็น `generateHolderIdentity()` ให้ได้ did:key จริงแม้ใน demo · (ข) เปลี่ยน prefix เป็น `urn:trustcare:demo-walkin:` เพื่อไม่ให้อ้างว่าเป็น did:key |
| D3 | **Mobile Store parity gap** — mobile ไม่มีหน้าคลังพกพา (portable objects) เทียบเท่า web `StoreView`; route `store` ชี้ไปหน้าเอกสาร | §1 A1 | ทำ `StoreScreen` ใหม่ที่ดึงผ่าน repository/exchange (ไม่ใช่ demo data ตรงแบบเดิม) หรือยอมรับว่า mobile ไม่มี store แล้วปรับ label/route |

---

## 4. ขอบเขตที่ยังไม่ได้ลงลึก (ความโปร่งใส)

- ไม่ได้รัน dynamic taint analysis; ownership ยืนยันจากโครงสร้าง enforce + test ที่มีอยู่
- ไม่ได้ตรวจ backend Portal (อยู่นอก repo นี้ — เป็น authority ของ issuer DID/keys)
- label ของ document type ปรากฏหลายที่ (`credentialTypes.ts`, `uxCopy.ts`, renderer) —
  ยังไม่ฟันธงว่าเป็น SSOT ซ้ำหรือแบ่ง layer; ควรตรวจรอบถัดไปถ้าต้องการรวมศูนย์ i18n

---

## 5. ผลการทดสอบหลังแก้

- `pnpm check`: ผ่านทั้ง 9 workspaces
- `pnpm test`: wallet-web 105, wallet-mobile 27, api-client 173 (+7 skipped live),
  wallet-core ผ่าน, gateway 17/0 fail — ไม่มี regression จากการลบ orphan

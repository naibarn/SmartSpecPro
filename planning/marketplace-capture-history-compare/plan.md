# Capture Review — เปรียบเทียบกับข้อมูลเดิม (sold / review history)

วันที่: 2026-08-01

## Problem statement

1. ตอนเข้าแท็บ **Capture Review** ใน Chrome extension ผู้ใช้ไม่รู้เลยว่าสินค้าตัวนี้เคยบันทึกไว้แล้วหรือยัง
   จึงไม่เห็นว่ายอดขาย/จำนวนรีวิว เปลี่ยนไปเท่าไหร่ตั้งแต่ครั้งก่อน
2. หน้ารายละเอียดสินค้าในระบบมีตาราง "Update History" อยู่แล้ว แต่แสดงแค่ค่าดิบของแต่ละ snapshot
   ไม่มีส่วนต่าง (delta) และไม่มีอัตราการเติบโต จึงใช้ประเมิน "ควรโปรโมทสินค้านี้ไหม" ได้ยาก

## สิ่งที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่)

- ตาราง `marketplace_product_price_snapshots` มีครบ: `priceCurrent`, `commissionRatePercent`,
  `ratingScore`, `reviewCountText`/`reviewCountNormalized`, `soldCountText`/`soldCountNormalized`,
  `capturedAt`, `capturedByUserId`
- `insertMetricSnapshot()` ถูกเรียกทั้งเส้นทาง **สร้างสินค้าใหม่** (`marketplaceProductService.ts:1106`)
  และเส้นทาง **อัปโหลดทับของเดิม** (`marketplaceProductService.ts:1032`)
  ⇒ ข้อกำหนด "upload ใหม่ต้องบันทึก history ไว้ตลอด" **มีอยู่แล้ว** ไม่ต้องแก้
- `getMarketplaceProductWithAccess()` คืน `history` (100 snapshot ล่าสุด) + `health` ให้หน้า detail แล้ว
- `findAccessibleDuplicate()` คือ logic เดียวกับที่ confirm ใช้ตัดสินว่า "จะทับสินค้าตัวไหน"

## Gap ที่ต้องปิด

| # | Gap | ไฟล์ |
|---|---|---|
| A | ไม่มี endpoint ให้ extension ถามว่า "สินค้านี้เคยบันทึกไว้แล้วหรือยัง + ตัวเลขล่าสุด/ตัวเลขแรกคืออะไร" | `marketplaceProductService.ts`, `routes/marketplaceCapture.ts` |
| B | แท็บ Capture Review ไม่แสดงการเปรียบเทียบ | `apps/extension/src/panel/App.tsx` |
| C | ตาราง Update History ในหน้า detail ไม่มี delta / growth summary | `MarketplaceCaptureProductDetail.tsx` |

## Proposed changes

### A. Backend — lookup endpoint

`lookupMarketplaceProductHistory(input, auth, { historyLimit })` ใน `marketplaceProductService.ts`

- ใช้ `findAccessibleDuplicate()` ตัวเดิม ⇒ ผลลัพธ์ตรงกับสินค้าที่ confirm จะไปทับจริง
  (ถ้า share แบบ read-only จะไม่ match เพราะ confirm ก็จะสร้างรายการใหม่)
- คืน: `found`, `product` (id/ชื่อ/ร้าน/url/accessType/firstSeenAt/lastCapturedAt/snapshotCount),
  `latest` (snapshot ล่าสุด), `first` (snapshot แรกสุด), `history` (ใหม่→เก่า สูงสุด 20)
- ตัวเลขทั้งหมด normalize เป็น `number | null` (คอลัมน์เป็น numeric ⇒ pg คืนเป็น string)

Route: `GET /api/marketplace-captures/products/lookup?platform=&externalProductId=&externalShopId=&sourceUrl=`
scope `marketplace:read` (เหมือน read endpoint อื่น)

ไม่มีการเขียนข้อมูล → ไม่มี migration, ไม่แตะ schema

### B. Extension — Capture Review comparison card

- state ใหม่: `existingRecord`, `existingRecordState`, `existingRecordError`
- `useEffect` ยิง lookup เมื่อ `product` (ผลของ Scan & Review) เปลี่ยน identity หรือ token/baseUrl พร้อม
- การ์ดใหม่วางเหนือ "Review before sending":
  - ยังไม่เคยบันทึก → แจ้ง "สินค้านี้ยังไม่เคยบันทึก" (บันทึกครั้งนี้จะเป็นครั้งแรก)
  - เคยบันทึกแล้ว → ตาราง 3 คอลัมน์: **เคยบันทึก (วันที่)** / **ตอนนี้** / **เปลี่ยนแปลง**
    สำหรับ ยอดขาย, จำนวนรีวิว, rating, ราคา + บรรทัดสรุปเทียบกับ snapshot แรกสุด + อัตราต่อวัน
  - ค่า "ตอนนี้" อ่านจาก `editable` (ค่าที่ผู้ใช้กำลังจะ upload จริง) ไม่ใช่ raw payload
- ปุ่ม "เช็คอีกครั้ง" สำหรับ retry, ลิงก์เปิดหน้า detail ในระบบ

### C. หน้า detail — growth summary + delta columns

- บล็อกสรุปเหนือตาราง: ช่วงเวลาที่เก็บ, ยอดขายเพิ่ม, รีวิวเพิ่ม, ต่อวัน, rating เปลี่ยน
- ตาราง: เพิ่มคอลัมน์ Δ ของ Sold และ Reviews เทียบกับ snapshot ก่อนหน้า (แถวเก่าสุด = baseline)

## Risk assessment

| ความเสี่ยง | ระดับ | การจัดการ |
|---|---|---|
| Lookup ทำให้ผู้ใช้เห็นสินค้าของคนอื่น | สูงถ้าพลาด | ใช้ `findAccessibleDuplicate()` เดิมซึ่งบังคับ userId / group + tenant อยู่แล้ว |
| Extension พังเมื่อ endpoint ยังไม่ deploy | กลาง | fetch แบบ non-fatal — ล้มเหลวแล้วโชว์ข้อความอย่างเดียว ไม่บล็อกการ upload |
| ตัวเลข normalize ไม่ตรงกันระหว่าง extension กับ server | กลาง | เทียบด้วยค่า normalized ทั้งคู่ (`parseSold` ฝั่ง extension, `parseSoldCount` ฝั่ง server) และแสดงข้อความดิบกำกับเสมอ |
| DB schema change | ไม่มี | ไม่แตะ schema เลย |

## Verification results (2026-08-01)

| ขั้นตอน | ผล |
|---|---|
| `npx tsc --noEmit` (apps/extension) | ✅ exit 0 |
| `npx tsc --noEmit` (apps/web) | ✅ ไม่มี error ในไฟล์ที่แก้ทั้ง 3 ไฟล์ (67 บรรทัด error ที่เหลือเป็นของเดิมในไฟล์อื่น) |
| `vitest run server/services/marketplaceProductService.historyLookup.test.ts` | ✅ 4 passed (ไฟล์ใหม่) |
| `vitest run server/services/marketplaceProductService.visualIndex.test.ts` | ✅ 4 passed (ไม่ regress) |
| `vitest run client/src/pages/__tests__/MarketplaceCaptureProductDetail.*` | ✅ 37 passed (4 ไฟล์) |
| `vitest run server/routers/marketplaceCapture.visualSearch.test.ts` | ✅ 5 passed เมื่อ set `JWT_SECRET` — ที่ fail คือ env ไม่ได้ตั้ง ไม่เกี่ยวกับงานนี้ (ไฟล์ `server/routers/marketplaceCapture.ts` ไม่ได้ถูกแก้ในงานนี้) |

### Extension release 0.1.135 — เสร็จแล้ว

- bump `package.json`, `public/manifest.json`, `EXTENSION_VERSION` ใน `App.tsx` เป็น 0.1.135
  (ตัวที่ 3 จำเป็น ไม่งั้น `verify-dashboard-package.py` fail ที่ version marker ใน panel bundle)
- `npm run package:web-dashboard` ✅ Verified
  → `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.135.zip` (165,643 bytes)
- ยืนยัน marker ใน bundle: `products/lookup`, `เทียบกับข้อมูลเดิมในระบบ`, `history-compare-table`,
  `ยังไม่เคยบันทึกสินค้านี้`, `0.1.135` + CSS `.history-compare-table`
- `GET /api/desktop-releases/marketplace-extension/latest` คืน 0.1.135 แล้ว (route scan
  `client/public/releases` ตอน request ⇒ ไม่ต้อง rebuild web)

### ค้างอยู่ — ต้องให้ผู้ใช้ตัดสินใจ

`GET /api/marketplace-captures/products/lookup` ยังตอบ 404 บน :3000 เพราะ service ที่รันอยู่
โหลด `server/routes/marketplaceCapture.ts` ตัวเก่า ⇒ ต้อง `sudo systemctl restart smartspec-web.service`

ความเสี่ยง: service รันจาก checkout ผ่าน tsx ⇒ restart จะโหลดโค้ด server ที่ session อื่นยังแก้ค้างไว้
ด้วย (`server/routers/marketplaceCapture.ts` +575 บรรทัด และไฟล์อื่นอีกหลายสิบไฟล์)

Manual ที่ต้องตรวจหลัง deploy:
1. scan สินค้าที่เคย upload แล้ว ⇒ เห็นการ์ดเทียบยอดขาย/รีวิว
2. หน้า detail ⇒ เห็น growth summary และคอลัมน์ Δ

## Steps

- [x] A1 service `lookupMarketplaceProductHistory`
- [x] A2 route `GET /products/lookup`
- [x] A3 unit tests สำหรับ delta helper ฝั่ง server
- [x] B1 extension state + fetch
- [x] B2 comparison card UI
- [x] C1 growth summary + delta columns หน้า detail
- [x] Verify: typecheck + tests

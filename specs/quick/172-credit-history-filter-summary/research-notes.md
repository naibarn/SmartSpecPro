# Research Notes

## Codebase pattern scan

- `apps/web/client/src/pages/Credits.tsx` มี source select ใน transaction history และใช้ `pageSize = 20`
- หน้าเดียวกันมี date input ใน context report แต่ state/query แยกจาก transaction history
- `apps/web/server/routers/credits.ts` มี `historyFiltersSchema` พร้อม date/source filters
- `apps/web/server/services/creditService.ts:getTransactionHistory` ใช้ user condition, optional tenant condition, source/type/date predicates และ stable ordering
- `apps/web/client/src/pages/Dashboard.tsx` เรียก `credits.history` และคาดหวัง array จึงไม่ควรเปลี่ยน shape

## Data and security boundaries

- ledger table `credit_transactions` ใช้ signed integer `amount`
- `getTransactionHistory` จำกัดด้วย `creditTransactions.userId` และ current tenant โดยอนุญาต legacy null tenant rows
- summary ต้อง reuse exact predicate construction เพื่อไม่ให้ยอดสรุปกับรายการเห็นข้อมูลคนละชุด
- query เป็น protected procedure; ไม่รับ userId จาก client

## Dependency/config scan

- ใช้ Drizzle ที่มีอยู่แล้ว (`sql`, `eq`, `and`, `gte`, `lt`, `isNull`, `or`)
- ไม่ต้องเพิ่ม package หรือ environment variable
- localization ใช้ `client/src/locales/{th,en}/billing.json`

## Verification risks

- existing workspace มี dirty changes จำนวนมากและ baseline typecheck อาจ noisy/ใช้เวลานาน
- ไม่มี SocratiCode MCP ให้เรียกใช้ใน session นี้ จึงใช้ targeted `rg` และ file reads เป็น fallback
- browser authenticated replay อาจทำไม่ได้จาก environment นี้

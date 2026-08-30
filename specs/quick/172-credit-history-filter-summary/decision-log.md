# Decision Log

## Planning depth

เลือก `standard` quick-plan เพราะงานแตะ frontend + tRPC service/router และมี contract/pagination/tenant boundary แต่ไม่ต้องเปลี่ยน schemaหรือ external integration จึงยังไม่ถึง full deep-plan

## Decisions

1. ใช้ query ใหม่ `credits.historySummary` แทนการเปลี่ยน shape ของ `credits.history` เพื่อไม่กระทบ Dashboard และ caller เดิม
2. aggregate ที่ database เพื่อให้ summary ครบทุกหน้าและลด memory/query payload
3. ใช้ filter object เดียวกันทั้ง history และ summary เพื่อป้องกัน semantic drift
4. ตีความวันที่สิ้นสุดแบบ inclusive ใน UI และส่งเป็น exclusive boundary ให้ service โดยใช้ `lt`
5. default เป็นหนึ่งเดือนแบบปฏิทิน ไม่ใช่คงที่ 30 วัน

## Review rounds

- Round 1: ตรวจ requirement coverage — เพิ่ม source/date/three-way summary/default/empty/invalid
- Round 2: ตรวจ contract — คง history array และ reuse tenant scope
- Round 3: ตรวจ data correctness — signed amount และ all-pages aggregate
- Round 4: ตรวจ UI states — loading/empty/validation/responsive/accessibility/localization
- Round 5: ตรวจ operational scope — ไม่มี migration/dependency/deploy; browser proof แยกเป็น boundary
- Round 6: ตรวจ cross-file consistency — plan sections ใช้ชื่อ endpoint/semantics เดียวกัน

ผล: ไม่พบ [AUTO-FIX] ที่เปลี่ยน architecture; พร้อม implementation

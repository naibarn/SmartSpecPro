# Credit History Filters and Filtered Summary Design

## Objective

เพิ่มตัวกรองแหล่งที่มาและช่วงวันที่ในประวัติธุรกรรมเครดิต พร้อมแสดงเครดิตเข้า เครดิตออก และยอดสุทธิที่ aggregate จาก transaction ทุกแถวซึ่งตรงกับตัวกรองเดียวกัน ค่าเริ่มต้นของช่วงวันที่คือย้อนหลังหนึ่งเดือนแบบปฏิทินจนถึงวันนี้

## Current fit

- `Credits.tsx` มี source filter และส่ง `sourceType` ให้ `credits.history` อยู่แล้ว
- `historyFiltersSchema` และ `getTransactionHistory` รองรับ `startDate` และ `endDate` แล้ว แต่หน้า Credits ยังไม่ส่งค่าเหล่านี้
- `credits.history` คืน array เดิมและถูกใช้โดย Dashboard จึงต้องรักษา response contract เดิม
- credit ledger มี `amount` เป็น signed integer: ค่าบวกคือเครดิตเข้า ค่าลบคือเครดิตออก

## Design

เพิ่ม `credits.historySummary` เป็น protected query โดยใช้ filter schema เดียวกับ history และใช้ tenant scope เดียวกัน ผลลัพธ์มี `creditIn`, `creditOut`, `net`, และ `transactionCount` ตัว summary คำนวณใน database ไม่โหลดรายการทั้งหมดเข้าหน่วยความจำและไม่ขึ้นกับ pagination

หน้า Credits จะมี date inputs start/end ใน transaction history card และเรียก history กับ historySummary ด้วย filter object เดียวกัน เมื่อ source/date เปลี่ยนให้ reset page เป็น 0 โดยไม่เปลี่ยน balance, OCR report หรือ context report ที่มีช่วงเวลาของตัวเองอยู่แล้ว

วันที่จาก UI เป็น date-only โดยวันเริ่มต้นคือเวลาเริ่มวัน และวันสิ้นสุดเป็น exclusive boundary ของวันถัดไปใน timezone ของ browser; server ใช้ `lt(endDate)` เพื่อให้วันสิ้นสุดถูกนับรวมครบทั้งวัน

## Error and boundary behavior

- invalid range: ไม่เรียก query และแสดงข้อความให้เลือกช่วงวันที่ถูกต้อง
- no matching rows: summary ทุกค่าเป็น 0 และรายการแสดง empty state เดิม
- sourceType validation ยังคงใช้ enum เดิมของ server
- query ยังคงจำกัดด้วย authenticated user และ current tenant; ไม่มีการเปิดข้อมูล cross-tenant
- ไม่เพิ่ม migration, dependency หรือ external service

## UI contract

- ผู้ใช้: เจ้าของบัญชีที่ต้องการตรวจสอบการเคลื่อนไหวเครดิต
- Controls: source select, start date, end date, refresh
- Summary labels: เครดิตเข้า, เครดิตออก, ยอดสุทธิ; แสดงตัวเลขแบบ localized
- Loading: summary/list loading state ไม่ทำให้ controls หาย
- Empty: แสดง 0 และข้อความไม่มีรายการตาม filter
- Accessibility: ใช้ `label` ที่สัมพันธ์กับ input/select, focus ring เดิม, controls ใช้ keyboard ได้
- Responsive: filter controls wrap บน mobile; summary cards 1/3 columns ตาม breakpoint เดิมของหน้า
- Localization: เพิ่มข้อความทั้ง Thai และ English ใน billing locale

## Acceptance criteria

1. เปิดหน้า Credits แล้ว default range เป็นวันที่วันนี้ย้อนหลังหนึ่งเดือนแบบปฏิทินถึงวันนี้
2. เปลี่ยน source/date แล้วรายการและ summary ใช้ filter เดียวกันและ reset เป็นหน้าแรก
3. เครดิตเข้าเท่ากับผลรวม amount ที่เป็นบวก, เครดิตออกเท่ากับผลรวม absolute ของ amount ที่เป็นลบ, ยอดสุทธิเท่ากับผลต่าง
4. Summary รวมทุกแถวในช่วงที่เลือก แม้รายการจะมีหลายหน้า
5. วันสิ้นสุดรวม transaction ตลอดทั้งวัน
6. Invalid range ไม่ยิง query และแสดงข้อความ validation
7. Existing Dashboard caller ของ `credits.history` และ pagination เดิมยังทำงานเหมือนเดิม

## Verification

- service/router tests สำหรับ signed aggregation, date/source/tenant predicates และ empty result
- Credits page test หรือ static component test สำหรับ default range, filter propagation, summary rendering และ invalid range
- targeted TypeScript check/test และ `git diff --check`
- authenticated browser replay ไม่อยู่ใน local automated proof หากไม่มี browser session/tooling

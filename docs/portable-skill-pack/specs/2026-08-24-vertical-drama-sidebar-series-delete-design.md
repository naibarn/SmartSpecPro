# Vertical Drama Sidebar Series Delete — Design

วันที่: 2026-08-24
สถานะ: implemented locally; pending beta Home-server activation/browser evidence

## เป้าหมาย

เพิ่มการลบ Series จากรายการด้านซ้ายของ Vertical Drama ได้โดยตรง พร้อมยืนยัน
ด้วยการให้ผู้ใช้พิมพ์ชื่อ Series ให้ตรงทุกตัวอักษร ลดความเสี่ยงจากการกดผิด
และรองรับกรณีรายการซ้ำ/ชื่อ placeholder ที่กำลังแก้ไขอยู่ก่อนหน้า

## แนวทางที่เลือก

ใช้ `verticalDramaSeries.deleteSeries` ที่มีอยู่แล้ว ซึ่งเป็นการลบถาวรแบบ
owner/tenant-scoped และตรวจ `confirmName` ฝั่ง server ซ้ำอีกชั้นหนึ่ง

- ลบแถว Series และ child records ที่อยู่ใน cascade transaction
- ไม่ลบ `media_assets` ตัวจริงในคลังสื่อ
- Draft ledger/version history ที่ออกแบบให้เป็น durable pre-create history จะ
  ไม่ถูกลบโดยปุ่มนี้; foreign key จะ detach `seriesId` ตาม contract เดิม เพื่อ
  ไม่ทำลายหลักฐาน Draft/QC ที่ใช้กู้คืนงานได้ การ purge history เป็นอีก policy
  หนึ่งและไม่รวมใน UX นี้
- ไม่ใช้ชื่อเป็น identity; ใช้ `seriesId` จาก row ที่ผู้ใช้กดเท่านั้น
- ใช้ `VerticalDramaDeleteSeriesDialog` component เดิมจาก Settings เพื่อลด
  behavior ที่แตกต่างกันระหว่างสองจุด

## UX และ state flow

1. แต่ละ row ใน sidebar มีปุ่มถังขยะขนาดเล็กแยกจากปุ่มเปิด Series
2. กดปุ่มลบแล้วเปิด dialog แสดงชื่อ Series ที่เลือกและคำเตือนลบถาวร
3. ปุ่มยืนยัน disabled จนกว่าจะพิมพ์ชื่อได้ตรงทุกตัวอักษร
4. เมื่อเริ่มยืนยัน หากกำลังเปิด page-mode wizard ของ Series เดียวกัน ให้ถอด
   wizard/recovery state ก่อนเรียก mutation เพื่อไม่ให้ autosave เขียนกลับ row
   ที่กำลังถูกลบ
5. เมื่อสำเร็จ invalidate list/detail cache, ปิด dialog และถ้าลบ Series ที่
   กำลังดูอยู่ให้กลับหน้า `/drama-series`; ถ้าลบ row อื่นให้อยู่หน้าเดิม
6. ระหว่างลบ ปุ่มยกเลิกและ input ถูกปิด และ error แสดงเป็น toast โดย dialog
   ยังเปิดอยู่เพื่อให้ตรวจชื่อ/ลองใหม่ได้

## ขอบเขตไฟล์และสัญญา

- `VerticalDramaShell.tsx`: state ของ delete target, ปุ่มลบใน sidebar,
  route-aware cleanup และ mount dialog
- `VerticalDramaDeleteSeriesDialog.tsx`: เพิ่ม optional `onDeleteStarted`
  เพื่อให้ shell ถอด wizard ก่อน mutation; behavior ยืนยันชื่อเดิมไม่เปลี่ยน
- `verticalDramaCopy.ts`: ใช้ข้อความ delete ที่มีอยู่แล้ว; เพิ่มเฉพาะ label
  สำหรับปุ่ม sidebar หากจำเป็น
- ไม่เพิ่ม schema/migration และไม่สร้าง delete endpoint ใหม่

## Failure and security rules

- server ตรวจ ownership ด้วย tenant + user และตรวจชื่อจากฐานข้อมูลจริง
- id จาก client ใช้ได้เฉพาะกับ `loadOwnedSeries`; ชื่อที่แสดงไม่ถูกใช้ค้นหา row
- ถ้า Series ถูกลบไปแล้วหรือสิทธิ์เปลี่ยน ให้แสดง mutation error และ refresh list
- ไม่ลบข้อมูลด้วย client-side filtering และไม่ลบ duplicate rows อัตโนมัติ
- ปุ่มลบต้องไม่ทำให้ click ที่ row เปิด route ไปพร้อมกัน (`stopPropagation`)

## Verification

- server delete contract: exact-name, ownership, permanent-delete transaction, and
  child-count behavior are covered by the existing focused router suite
- regression: existing Settings dialog และ server `deleteSeries` tests ต้องผ่าน
- static gates: TypeScript diagnostics ของไฟล์ที่แก้, Prettier, `git diff --check`
- live gate แยกต่างหาก: rebuild/restart beta Home server และทดสอบลบ Series
  test record โดยตรวจว่า media library asset ไม่ถูกลบ

## Implementation closeout — 2026-08-24

- sidebar delete action and existing exact-name dialog are wired through the
  owner-scoped `deleteSeries` mutation
- selecting a Series now routes by `seriesId`, detaches the previous page-mode
  wizard, and never reuses another Series' generic browser Draft/QC workspace
- `getDraftWorkspaceStatus` accepts `seriesId`, resolves the current session
  from the Series planning snapshot or durable Draft ledger, and restores the
  composition/QC projection without deleting or rewriting completed results
- unaccepted planning work automatically opens the planning workspace, where the
  Draft and QC panel remain visible for review/resume
- local focused verification: 7 files / 114 tests passed; filtered TypeScript
  diagnostics clean; Prettier and `git diff --check` passed

## ความเสี่ยงและ trade-off

- ลบถาวรตามที่เลือกจะกู้คืน Series/episode/QC ไม่ได้ จึงบังคับ exact-name
  confirmation และคงไฟล์ media library ไว้เพื่อลดผลกระทบ
- เพิ่มปุ่มใน sidebar ทำให้พื้นที่ row ลดลงเล็กน้อย จึงใช้ icon button และ
  tooltip/aria-label แต่ไม่เปลี่ยนโครงสร้างการคลิกชื่อ Series เดิม
- การถอด wizard ก่อน delete อาจทำให้ draft ที่ยังไม่ autosave หายตามธรรมชาติ
  ของการลบถาวร แต่จะไม่เกิด write race หลังเริ่มลบ

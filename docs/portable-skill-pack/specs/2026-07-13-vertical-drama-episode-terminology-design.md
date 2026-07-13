# Vertical Drama Episode Terminology — Design

วันที่: 2026-07-13
สถานะ: รอผู้ใช้รีวิวก่อนเริ่ม implementation

## เป้าหมาย

ทำให้ผู้ใช้แยกความหมายของ `Sub-episode` กับ `Production/Public Episode` ได้ชัดเจนตั้งแต่หน้า Create Series ไปจนถึงหน้าโครงสร้างบทละครและหน้ารายการตอน โดยเฉพาะค่าเริ่มต้น `10` ซึ่งเป็นจำนวน Sub-episode ของโครงสร้างเรื่อง ไม่ใช่จำนวนวิดีโอ Public EP ที่จะแยกเผยแพร่

## ความหมายที่ยืนยันแล้ว

- **Sub-episode** คือแถวปัจจุบันใน `vertical_drama_episodes` มี storyboard/shots ของตัวเอง และผลิตเป็นวิดีโอสั้นหนึ่งชิ้น
- **Production/Public Episode** คือวิดีโอเผยแพร่ที่รวม Sub-episode ต่อเนื่องหลายรายการเข้าด้วยกัน ปัจจุบันรองรับกลุ่มละ 5 หรือ 10 Sub-episode
- ค่าเป้าหมาย `10` ในการสร้างซีรีย์กำหนดจำนวนรายการในโครงสร้าง `episodeBreakdown` และจำนวน Sub-episode ที่วางแผนไว้ ไม่ได้กำหนดจำนวน Public Episode โดยตรง
- จำนวน Public Episode ต้องแสดงหรือคำนวณจาก Production Episode manifest และ `groupSize` เมื่อมีการประกอบจริง ไม่ควรใช้ค่า `10` จาก Create Series เป็นจำนวน Public Episode

## ปัญหาปัจจุบัน

โค้ดทำงานใกล้เคียงกับความหมายที่ถูกต้องอยู่แล้ว แต่ข้อความทำให้เข้าใจผิด:

- Create Series ใช้ label `จำนวนตอนเป้าหมาย` / `Target episode count`
- Review และ Settings ใช้ `จำนวนตอน` / `Target episode count`
- Story Bible prompt อธิบายว่า `episodeBreakdown` ต้องมีจำนวน episode ตามค่าเป้าหมาย
- รายการที่เป็น Sub-episode แสดงเป็น `EP N` และข้อความแจ้งเตือนใช้คำว่า “ตอน” โดยไม่บอกว่าเป็นตอนย่อย
- Share summary และ progress ของ story generation ใช้คำว่า planned episodes
- Workspace เรียกวิดีโอที่ประกอบจากแถวเดียวว่า “full episode video” ทั้งที่เป็นวิดีโอของ Sub-episode ยังไม่ใช่ Public Episode
- `targetEpisodeCount` เป็นชื่อคอลัมน์/API เดิม แม้ความหมายที่ผู้ใช้ยืนยันแล้วคือ planned Sub-episode count

## แนวทางที่เลือก

ใช้การปรับความหมายที่ขอบเขต UI/domain โดยไม่ย้ายข้อมูลในรอบนี้:

1. คงชื่อคอลัมน์และ wire field `targetEpisodeCount` ไว้เพื่อรองรับซีรีย์เก่าและ client ที่ยังใช้งานอยู่
2. กำหนดในโค้ดและเอกสารว่า field นี้เป็น legacy storage/API name ของ `plannedSubEpisodeCount`
3. เปลี่ยนข้อความที่ผู้ใช้เห็นทั้งหมดใน flow นี้เป็น Sub-episode
4. เปลี่ยน prompt/context ของ Story Bible ให้เรียกจำนวนนี้ว่า target Sub-episode count แต่คง JSON key `episodeBreakdown` และ `episodeNumber` ไว้เพื่อ backward compatibility กับข้อมูลเดิม
5. สงวนคำว่า `Production Episode` หรือ `Public EP` สำหรับผลลัพธ์ที่รวมจาก Sub-episode เท่านั้น
6. ไม่เพิ่มช่องกรอกจำนวน Public EP ใน Create Series เพราะ Public EP ถูกกำหนดภายหลังด้วย group size ของ Production Episode

## UX copy contract

### Create Series — Basic setup

ภาษาไทย:

- Label: `จำนวนตอนย่อย (Sub-episode) ในโครงสร้างเรื่อง`
- Helper: `ใช้กำหนดจำนวนตอนย่อยสำหรับวางโครงเรื่องและผลิตวิดีโอสั้น ไม่ใช่จำนวน Public EP ที่เผยแพร่จริง Public EP จะถูกรวมจากตอนย่อยภายหลัง`
- Validation: `กรุณากรอกชื่อซีรีย์และจำนวนตอนย่อยที่ถูกต้องในแท็บ 'ตั้งค่าพื้นฐาน'`

ภาษาอังกฤษ:

- Label: `Planned Sub-episodes in story structure`
- Helper: `Sets the number of Sub-episodes used for story planning and short-video production. This is not the number of Public Episodes; Public Episodes are grouped later.`
- Validation: `Enter a series title and a valid Sub-episode count in the 'Basic setup' tab`

### Create Series — Review

- Thai: `ตอนย่อยในโครงสร้างเรื่อง`
- English: `Planned Sub-episodes`
- ห้ามใช้ label เดี่ยว ๆ ว่า `จำนวนตอน` / `Episodes` ในจุดนี้

### Series settings and summary

- Thai: `จำนวนตอนย่อยที่วางแผน`
- English: `Planned Sub-episode count`
- Share summary ใช้คำเดียวกัน และไม่ใช้ `Planned episodes`

### Sub-episode workspace/list

- Tab/list title: `ตอนย่อย (Sub-episodes)` / `Sub-episodes`
- Item indicator: `SUB-EP N` หรือ `SUB-EP N/total`
- ปุ่มและ toast ที่เพิ่ม/ลบ/สร้างรายการ ใช้ `ตอนย่อย` / `Sub-episode` เมื่ออ้างถึงแถวใน `vertical_drama_episodes`
- วิดีโอที่ประกอบจากแถวเดียวใช้คำว่า `วิดีโอรวม Sub-episode` / `Compiled Sub-episode video` เพื่อแยกจาก Production/Public Episode
- คง route และ API identifiers เดิม เช่น `episodeNumber`, `episodeId`, `episodes` เพื่อไม่ทำ breaking change ทางเทคนิค

### Production/Public Episode

เมื่อแสดงผลจาก Production Episode assembly ให้ใช้:

- Thai: `EP เผยแพร่` หรือ `Production Episode`
- English: `Public Episode` หรือ `Production Episode`
- แสดงกลุ่มที่รวม เช่น `EP 1 · รวม Sub-episode 1–5`
- ห้ามนำ `targetEpisodeCount = 10` ไปแสดงเป็น `Public EP 10`

## Data and runtime behavior

- Create Series ยังคงส่งค่าจำนวนเดิมไปยัง backend และ backend ยังคงเก็บลงคอลัมน์เดิม
- Story generation ต้องสร้าง `episodeBreakdown` ตามจำนวน Sub-episode ที่กำหนดแบบเดิม โดยแก้เฉพาะถ้อยคำให้ตรงความหมาย
- Deep draft, extend, improve และ progress ที่นับรายการใน story plan ให้ใช้คำว่า Sub-episode ในข้อความผู้ใช้ แต่ logic number/range เดิมยังคงทำงานเหมือนเดิม
- จำนวน Public Episode ไม่ถูกสร้างหรืออนุมานจาก Create Series โดยอัตโนมัติ เว้นแต่ Production Episode assembly จะมี manifest/group size ให้คำนวณ
- ซีรีย์เก่าและข้อมูล JSON เดิมต้องอ่านได้โดยไม่ต้อง migrate หรือ rewrite

## ขอบเขตไฟล์ที่คาดว่าจะเปลี่ยน

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaShareCopy.ts`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaTextOverlayCopy.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodePlanPanel.tsx` ถ้ามีข้อความที่ประกาศว่าเป็น episode plan โดยตรง
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaShell.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
- `apps/web/client/src/pages/VerticalDramaSeriesPage.tsx`
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/shared/verticalDramaSeries/textOverlay.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/routers/verticalDramaSeries.ts` เฉพาะ comments/context ที่ผู้ใช้เห็นหรือชื่อ local variable ที่สื่อสารผิด
- focused tests ของ wizard, story bible prompt และ text-overlay label

ไม่อยู่ในขอบเขต:

- เปลี่ยนชื่อคอลัมน์ฐานข้อมูลหรือ JSON schema เดิม
- เปลี่ยน route/API contract ที่ใช้คำว่า episode
- เปลี่ยนกติกาการรวม Production Episode 5/10
- เพิ่ม workflow สร้าง Public Episode ใหม่

## Acceptance criteria

1. หน้า Create Series ไม่ใช้คำว่า `จำนวนตอนเป้าหมาย` หรือ `Target episode count` สำหรับค่า 10 อีกต่อไป
2. ผู้ใช้เห็นคำอธิบายชัดเจนว่าค่า 10 คือจำนวน Sub-episode ในโครงสร้างเรื่อง ไม่ใช่จำนวน Public EP
3. Review, Settings, Series summary, deep-draft progress และ Sub-episode list ใช้คำศัพท์สอดคล้องกัน
4. Story Bible prompt ระบุ target Sub-episode count และยังบังคับจำนวนรายการเท่าเดิม
5. ตัวบอกบนวิดีโอ/รายการ Sub-episode ไม่แสดง `EP N/10` แบบที่ทำให้เข้าใจว่าเป็น Public EP
6. จุดที่แสดง Production Episode ที่ประกอบจริง (เมื่อมี manifest/UI ของส่วนนั้น) ใช้คำว่า Public/Production Episode และแสดงการรวม Sub-episode แยกจากค่าเป้าหมายของโครงสร้างเรื่อง
7. ซีรีย์เก่าอ่านและทำงานต่อได้ โดยไม่ต้อง migration
8. Focused tests ผ่าน และไม่มี regression ใน flow สร้างซีรีย์/สร้าง story bible

## Verification plan

- รัน focused client tests ของ `CreateSeriesWizard`
- รัน focused server tests ของ `verticalDramaStoryBible`
- เพิ่ม/รัน unit test ของ `deriveEpisodeIndicatorLabel`
- ตรวจ `git diff --check`
- รัน typecheck เฉพาะ package/target ที่เกี่ยวข้องเท่าที่ repo รองรับ และแยก baseline errors ออกจาก errors ที่เกิดจากงานนี้
- ตรวจด้วย `rg` ว่า user-facing copy ที่เกี่ยวกับ target count ไม่หลงเหลือคำว่า target episode count แบบเดิมใน vertical drama surfaces

# Research notes

## Repository findings

- `apps/web/server/routers/verticalDramaCharacters.ts` มี `resolveReferencePortraitSource` ที่ปัจจุบันทำ explicit override ก่อน แล้ว auto-resolve portrait ของตัวละครเอง และ fallback ไป parent/twin source
- `generateCharacterImage` และ `generateCharacterSheet` ใช้ resolver เดียวกัน และ input มี `referenceAssetLinkId` แต่ยังไม่มี policy ที่บอกว่า absence หมายถึง no-reference หรือ auto-reference
- `generateCharacterImage` เลือก image/edit model และส่ง `referenceImageUrls` จาก URL ที่ resolver คืนมา ดังนั้นการแก้ resolver/policy ต้องเกิดก่อน model selection และ prompt capability
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx` main prompt confirmation ส่ง `referenceAssetLinkId` เฉพาะจาก ephemeral override; look render builder ส่ง id เฉพาะ primary/look choice และ absence ปัจจุบันพึ่ง server auto-resolution
- `apps/web/server/services/verticalDramaCharacterStock.ts` มี `setPrimaryPortraitAsset`/`selectPortraitCandidate` ที่ demote sibling โดยไม่ลบ เพื่อคง history; `linkAsset` dedupe tuple character/media แต่ต้องตรวจ call path ว่า generated replacement ตั้ง role/primary ถูกต้อง
- Existing focused tests ครอบคลุม DNA setup และ image generation service; ต้องเพิ่ม tests ให้ policy resolver, provider payload, explicit asset precedence, look auto และ lifecycle failure/success

## Data/runtime evidence already established

- Series 57 เคยตรวจพบตัวละครบางรายการมี description แต่ไม่มี `data.visualBible.designDna` และไม่มี portrait asset/task; ตัวละครที่มี DNA มี asset/task ครบตาม audit
- งานก่อนหน้าปรับ setup detection ให้ตรวจ canonical DNA แทน description และปรับ preview fallback ไม่ให้ throw เมื่อไม่มี safe casting age profile; ต้อง preserve changes เหล่านั้น

## Key risks

- หากใช้ default ของ resolver แบบเดิม จะยังดึงภาพหลักเก่าใน main regeneration
- หาก client ซ่อน default primary แล้วส่ง id ออกมา จะทำให้ระบบแยกไม่ออกว่า user เลือกเองหรือแค่เห็นภาพ default
- หาก policy ใหม่ถูกใช้กับ look โดยไม่ตั้งใจ ลุคใหม่จะสูญเสีย face/likeness continuity
- หาก explicit asset validation อยู่เฉพาะ UI จะเปิดช่อง caller ที่ไม่ใช่ UI ใช้ asset ข้าม tenant/series
- หาก demote เกิดก่อน provider/task สำเร็จ generation failure จะทำให้ตัวละครไม่มี primary

## Discovery fallback

SocratiCode MCP/codebase tools ไม่ได้ถูก expose ใน session นี้ จึงใช้ `rg`, targeted `sed` และ focused test discovery แทน

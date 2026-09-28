# Vertical Drama Barrier Multi-View Design

สถานะ: Design ยืนยันโดยผู้ใช้แล้ว 2026-08-09
ขอบเขต: Vertical Drama storyboard, start-frame/reference-frame generation, video-prompt authoring และ video reference attachment

## 0. Generalized Dual View revision

ผู้ใช้ยืนยันให้ขยายจากกรณีประตูปิดเป็นโหมดทั่วไป `Dual View` หรือ “สองมุม/สองสถานที่ในช็อตเดียว” โดย `Barrier Multi-View` เป็นเพียงชนิดย่อยเพื่อ backward compatibility

ชนิดฉากที่รองรับ:

- `physical_barrier`: คนละฝั่งประตู/กำแพง/กระจก หรือพื้นที่ติดกันแต่ไม่ควรอยู่ในเฟรมเดียว
- `remote_call`: คุยโทรศัพท์หรือวิดีโอคอลจากคนละสถานที่ และต้องการตัดสลับให้เห็นบรรยากาศของทั้งสองฝ่าย ไม่ใช่แสดงอีกฝ่ายบนหน้าจอเครื่องอย่างเดียว
- `separate_locations`: ตัวละครอยู่คนละสถานที่และตัดสลับมุมตามบทพูดหรือจังหวะเรื่อง โดยไม่จำเป็นต้องมีโทรศัพท์

ระบบเลือกโหมดจากสองแหล่ง:

1. `auto`: storyboard LLM ประกาศ structured intent และ deterministic detector ตรวจข้อความ บทพูด ตัวละคร และ location ซ้ำอีกชั้น พร้อม confidence/reason codes
2. `manual`: ผู้ใช้เลือก “ภาพเดียว” หรือ “สองมุม/สองสถานที่” เองจาก shot card และเลือกชนิดฉากได้

กติกา authority:

- ค่า manual ต้องชนะ auto detection และคงอยู่เมื่อ regenerate storyboard/start-frame plan
- auto เปิด Dual View เฉพาะ confidence สูง; confidence ปานกลางแสดงคำแนะนำให้ผู้ใช้กดเปิดเอง
- ผู้ใช้สลับกลับโหมดปกติได้ โดยบันทึก explicit `single` override เพื่อไม่ให้ detector เปิดกลับทันที
- การเปลี่ยนโหมดหรือชนิดฉากต้อง mark prompt, generated images, QC และ video prompt เดิมเป็น stale
- `remote_call` แบบ Dual View ไม่ใช้ `screenCallerCharacterRefs` เป็นภาพคนบนหน้าจอ แต่ย้ายผู้พูดฝั่งที่สองไปยัง reference view ของสถานที่จริง

### Assignment controls

เมื่อเปิด Dual View ตัวเลือกตัวละครและสถานที่แบบฉากเดียวด้านบนต้องถูกแทนด้วยการ์ดกำหนดสองมุมที่ใช้ contract เดียวกับ workflow สร้างภาพด้านล่าง:

- มุมที่ 1 / Start frame: เลือก character refs และหนึ่ง location จาก episode location roster ได้อิสระ
- มุมที่ 2 / Reference frame: เลือก character refs และหนึ่ง location จาก roster เดียวกันได้อิสระ
- จอใหญ่แสดงสองคอลัมน์ ส่วนจอแคบเรียงบนลงล่าง
- ตัวละครแต่ละมุมต้องไม่ว่างและต้องไม่ซ้ำกัน โดย server เป็น validation boundary สุดท้าย
- ทุกการแก้ไขเขียนกลับเข้า Dual View contract โดยตรง ป้องกัน assignment ด้านบนกับภาพด้านล่างแสดงข้อมูลคนละชุด

## 1. เป้าหมาย

รองรับฉากที่ตัวละครอยู่คนละฝั่งของสิ่งกั้นทางกายภาพ เช่น ไอริณอยู่ในห้องเก็บของหลังคาเฟ่ และกฤตอยู่ด้านนอกประตูในคาเฟ่ไอริณชั้นล่างตึกแถว โดยต้องสร้างภาพอ้างอิงอย่างน้อยสองมุม:

1. Start frame: มุมด้านใน เห็นไอริณและห้องเก็บของ
2. Reference frame: มุมด้านนอก เห็นกฤตและคาเฟ่ชั้นล่าง/หน้าประตู

ภาพทั้งสองเป็นคนละ physical view ของฉากเดียวกัน ไม่ใช่ภาพเดียวที่บังคับให้โมเดลวางคนสองคนคนละฝั่งในเฟรมเดียว และไม่ใช่ phone/video-call `Caller`.

## 2. หลักการที่ยืนยันแล้ว

- `requiredCharacterRefs` หมายถึงตัวละครที่มองเห็นจริงใน Start frame เท่านั้น
- `screenCallerCharacterRefs` ใช้เฉพาะคนที่อยู่ในหน้าจอโทรศัพท์/วิดีโอคอล และห้ามใช้กับกรณีนี้
- ตัวละครฝั่งตรงข้ามประตูจะอยู่ใน `barrierMultiView.outsideCharacterRefs` และภาพ Reference frame ของมัน
- location ของสองมุมเป็นคนละ location key ได้ แต่มี relation ว่าอยู่ในอาคาร/สถานประกอบการเดียวกัน เพื่อรักษาโลกภาพโดยไม่บังคับให้เป็นห้องเดียวกัน
- บทพูดเป็น authority ในการสลับกล้อง แต่การ map speaker → side ต้องเป็นข้อมูล explicit ไม่ให้ synopsis เปลี่ยน role เอง
- ภาพเก่าที่สร้างด้วย `closed_door` แบบภาพเดียวจะไม่ถูกลบทิ้ง แต่เมื่อเปิด Barrier Multi-View แล้วต้องสร้าง Reference frame ใหม่ก่อนนำไปสร้างวิดีโอแบบ production

## 3. ทางเลือกและการตัดสินใจ

### ทางเลือก A: Barrier Multi-View เฉพาะทาง — เลือกใช้

เพิ่ม contract และ UI เฉพาะสำหรับคู่มุม inside/outside ใช้ Start frame เดิมเป็นภาพหลัก และใช้ Reference frame slot ใหม่เป็นภาพฝั่งตรงข้าม จากนั้นสร้าง timed multi-shot video prompt ที่ map แต่ละช่วงบทพูดกับมุมภาพ

ข้อดี: semantics ชัด, ตรวจสอบได้, ใช้กับ asset/reference pipeline เดิมได้, รองรับ location คนละห้อง/คนละโซน และขยายเป็นสิ่งกั้นชนิดอื่นภายหลังได้

### ทางเลือก B: ใช้ generic supplementary reference frame

ใช้ slot reference frame เดิมโดยไม่เพิ่ม role เฉพาะ แล้วให้ prompt อธิบายเองว่าเป็นมุมนอกประตู

ข้อเสีย: ระบบไม่รู้ว่า reference เป็นมุมฝั่งตรงข้ามหรือภาพ continuity ทั่วไป, จัดลำดับ reference และ QC ได้ไม่แน่นอน จึงไม่เหมาะเป็น production contract

### ทางเลือก C: แตกเป็น storyboard shot สองช็อตตั้งแต่ต้น

สร้าง shot ภายในและ shot ภายนอกเป็นคนละ timeline shot

ข้อเสีย: กระทบจำนวน shot, duration, dialogue mapping, assembly และ UI storyboard มากกว่าที่จำเป็นสำหรับหนึ่ง logical scene จึงสงวนไว้เป็น fallback สำหรับ provider ที่ไม่รองรับ multi-reference single clip

## 4. Contract ที่เสนอ

เพิ่มข้อมูลระดับ `startFramePlan.frames[]`:

```ts
type VerticalDramaBarrierMultiView = {
  enabled: true;
  barrierType: "closed_door";
  relation: "same_establishment_adjacent_spaces";
  startView: {
    side: "inside";
    characterRefs: string[];
    locationKey: string;
  };
  referenceView: {
    side: "outside";
    characterRefs: string[];
    locationKey: string;
    referenceFrameAssetId?: string;
  };
  dialogueSideMap: Record<string, "inside" | "outside">;
  status?: "configured" | "start_ready" | "reference_ready" | "ready" | "stale";
};
```

กติกา validation:

- `startView.characterRefs` และ `referenceView.characterRefs` ต้องไม่ overlap
- ทั้งสอง view ต้องมีตัวละครอย่างน้อยหนึ่งคน
- location key ต้องมีอยู่ใน location roster หรือมี explicit location override
- speaker ทุกคนที่มีบทพูดต้องมี `dialogueSideMap`
- `startView.side` ต้องเป็น `inside` และ `referenceView.side` ต้องเป็น `outside` ในเวอร์ชันแรก
- หากมี `screenCallerCharacterRefs` ร่วมกับ Barrier Multi-View ให้ reject เพื่อไม่ให้ semantic ชนกัน
- `requiredCharacterRefs` ของ frame ถูก derive/ตรวจให้เท่ากับ `startView.characterRefs`

Asset pointer หลักอยู่ใน frame JSON เพื่อให้ UI อ่านเร็ว:

- `approvedMediaAssetId` = Start frame
- `barrierMultiView.referenceView.referenceFrameAssetId` = Reference frame

Reference frame จะถูก link ใน `vertical_drama_shot_references` ด้วย `source: "reference_frame"` และ role เฉพาะ `barrier_reference` (คอลัมน์เดิมเป็น varchar จึงไม่ต้อง migration DB ในระยะแรก) เพื่อให้ video render ใช้ lookup/ordering เดิมได้

## 5. UI design

### UX revision หลังตรวจใช้งานจริง (2026-08-09)

การวางสอง slot ในคอลัมน์ภาพหลักกว้าง 160px ทำให้ลำดับงานอ่านยากและปุ่มสร้างภาพอยู่คนละบริบท จึงปรับเป็น workflow เต็มความกว้างใต้ข้อมูลช็อต โดยใช้ภาษาไทยเป็นหลักและอ่านจากบนลงล่าง:

```text
ฉากสนทนาคนละฝั่งประตู
เตรียม 2 ภาพให้ครบ แล้วระบบจะสลับมุมตามผู้พูด

[1 กำหนดสองฝั่ง] → [2 สร้างภาพในห้อง] → [3 สร้างภาพหน้าประตู] → [4 สร้างวิดีโอ]

[มุมที่ 1 · ภาพเริ่มต้น · ฝั่งในห้อง]
[thumbnail/status]
ไอริณ · ห้องเก็บของหลังคาเฟ่
[สร้างภาพฝั่งในห้อง / สร้างใหม่]

[มุมที่ 2 · ภาพอ้างอิง · ฝั่งหน้าประตู]
[thumbnail/status]
กฤต · คาเฟ่ไอริณชั้นล่างตึกแถว
[เลือกสถานที่ (ถ้ายังไม่มี)]
[สร้างภาพฝั่งหน้าประตู / สร้างใหม่]

บทไอริณ → มุมในห้อง · บทกฤต → มุมหน้าประตู
```

พฤติกรรม:

- แสดงสถานะถัดไปด้วยข้อความ เช่น `เริ่มจากภาพฝั่งในห้อง`, `เหลือภาพฝั่งหน้าประตู`, `พร้อมสร้างวิดีโอ`; ห้ามใช้ชื่อสถานะภายในอย่าง `configured`
- ปุ่มของมุมที่ 2 disabled จนกว่ามุมที่ 1 จะพร้อม และหากยังไม่มี location ให้แสดงปุ่มเลือกสถานที่แทนปุ่มสร้างภาพ
- การสร้างแต่ละภาพมี paid confirmation ของตัวเอง เพื่อ retry เฉพาะภาพที่ล้มเหลวโดยไม่เสียภาพที่สำเร็จแล้ว
- เปลี่ยน character/location ของ view ใด view หนึ่งจะ mark คู่ภาพ, video prompt และ QC เป็น `stale`
- เมื่อเป็น Barrier Multi-View ให้ซ่อน generic reference-frame controls และ generic reference strip ใน shot card นั้น เพื่อลด action ซ้ำ; asset ยังอยู่ในระบบและ role `barrier_reference` ยังคงเป็น authority
- `Caller` section ไม่แสดงใน Barrier Multi-View เพราะตัวละครฝั่งนอกเป็นบุคคลจริงหน้าประตู ไม่ใช่คนบนหน้าจอโทรศัพท์
- layout เป็นสองคอลัมน์เมื่อพื้นที่พอและเรียงบนลงล่างบนจอแคบ โดยปุ่มมี touch target อย่างน้อย 36–44px ตามบริบทเดิมของหน้า

## 6. Image generation flow

### Start frame

ใช้ flow เดิมของ start frame แต่ส่งเฉพาะ:

- portrait ของ `startView.characterRefs` เช่น ไอริณ
- location reference ของ `startView.locationKey` เช่น ห้องเก็บของหลังคาเฟ่
- prompt fact ว่าเป็น camera side `inside`, ประตูปิด, ตัวละครฝั่งนอกอยู่นอกเฟรม

### Reference frame

ใช้ `reference_frame_mode` เป็น image generation path แยกจาก Start frame โดยระบบ prefill directive จาก `referenceView`:

- portrait ของกฤตเท่านั้น
- location reference ของคาเฟ่ไอริณชั้นล่างตึกแถว
- camera side `outside`
- ระบุว่าเป็นมุม reverse/eyeline ของฉากเดียวกัน ไม่ใช่ภาพในห้องเก็บของ
- ห้ามใส่ไอริณหรือบุคคลฝั่ง inside ในภาพนี้

Reference prompt ต้องมี stable mapping เช่น `BARRIER_VIEW_REFERENCE_OUTSIDE` เพื่อให้ video prompt generator และ QC รู้ว่าภาพนี้มีหน้าที่อะไร

## 7. Video prompt and render flow

### Prompt authoring

ก่อนสร้าง video prompt ระบบแนบภาพพร้อม label ที่มีความหมาย:

- `VIEW_START_INSIDE`: Start frame ของไอริณ
- `VIEW_REFERENCE_OUTSIDE`: Reference frame ของกฤต
- optional portrait/location inputs ตาม budget

speaker-switch planner ที่มีอยู่แล้วจะถูกขยายให้แต่ละ window มี `side` จาก `dialogueSideMap`:

```ts
type BarrierCut = {
  subShotNumber: number;
  side: "inside" | "outside";
  speakerRefs: string[];
  lineIndexes: number[];
  durationSeconds: number;
  viewRole: "start_frame" | "barrier_reference";
};
```

ผลลัพธ์ต้องมี `barrierMultiViewPlan` ใน clip metadata/prompt contract และ prompt ต้องระบุ timed cut อย่าง explicit ไม่หวังให้ provider เดาความสัมพันธ์จากภาพสองใบเอง

### Video render

สำหรับ model ที่รองรับ multi-reference:

1. ส่ง Start frame เป็น `referenceImageUrls[0]`
2. ส่ง Barrier Reference เป็น reference ถัดไปและวางก่อน generic location/portrait extras
3. ส่ง prompt ที่มี cut plan และ speaker-side mapping
4. เก็บ asset id ของภาพทั้งสองไว้ใน clip provenance

ห้ามปล่อยให้ generic reference trimming ตัด Barrier Reference ทิ้งโดยไม่แจ้งผู้ใช้ ต้องรายงานจำนวน slot ที่ใช้และ fail closed หากสองภาพหลักไม่สามารถแนบได้ครบ

สำหรับ model ที่ไม่รองรับ multi-reference หรือไม่รองรับ multi-shot cut:

- ระยะแรกให้หยุดด้วย actionable error ว่า model นี้ไม่รองรับ Barrier Multi-View
- ระยะถัดไปสามารถใช้ทางเลือก C สร้าง per-view sub-clips แล้วประกอบตาม cut plan
- ห้าม fallback เป็นภาพเดียวเงียบ ๆ เพราะจะกลับไปเกิด bug เดิม

## 8. QC and failure handling

เพิ่ม Barrier Multi-View QC:

- Start frame: ตรวจว่าเห็นเฉพาะ inside characters และ location ถูกต้อง
- Reference frame: ตรวจว่าเห็นเฉพาะ outside characters และ location ถูกต้อง
- ตรวจว่า asset ทั้งสองไม่ใช่ภาพเดียวกันหรือ duplicate
- ตรวจว่า speaker ทุกคน map ไปยัง side ที่มีภาพจริง
- ตรวจว่า prompt มี cut plan ครบทุก dialogue turn ที่ต้องสลับฝั่ง
- ตรวจว่า video render payload แนบภาพหลักครบสองใบตามลำดับ

สถานะ failure:

- start สำเร็จ/reference ล้มเหลว: แสดง Start frame พร้อมปุ่ม retry เฉพาะ Reference frame
- reference สำเร็จแต่ prompt เก่า: mark `stale` และไม่อนุญาต render video จน regenerate prompt
- provider trim reference: fail ก่อน paid render หรือแสดง explicit confirmation ที่ระบุว่าขาดภาพใด
- speaker ไม่มี side mapping: reject ก่อนใช้เครดิต video prompt/render

## 9. Migration จาก implementation เดิม

implementation เดิมที่ใช้ `barrierDialogue` แบบภาพเดียวจะถูกเก็บไว้เป็น legacy compatibility เท่านั้น:

- ถ้ามี `barrierDialogue` แต่ไม่มี `barrierMultiView`, UI แสดง migration card ให้สร้าง Reference frame
- `requiredCharacterRefs` เดิมถูกใช้เป็น default ของ `startView.characterRefs`
- `offscreenCharacterRefs` เดิมถูกใช้เป็น default ของ `referenceView.characterRefs`
- ระบบจะไม่ถือว่า legacy single frame พร้อมสำหรับ production video จนกว่า Reference frame จะถูกสร้างและ linked
- เมื่อเปิด Barrier Multi-View แล้ว ห้ามส่ง old single-frame barrier prompt เป็นหลัก

## 10. Testing and rollout

Focused tests:

- contract validation: disjoint sides, speaker map completeness, location presence
- UI: แสดงสอง slot, status แยก, retry เฉพาะ reference, ห้ามปน Caller
- prompt: labels, cut plan, speaker-to-side binding, no single-frame fallback
- reference attachment: start first, barrier reference second, trim/fail-closed behavior
- pipeline: regeneration preserves both view assignments and marks stale assets correctly
- migration: legacy `barrierDialogue` projects to incomplete `barrierMultiView`
- paired skill files remain byte-identical

Rollout:

1. shared contract + migration reader/writer
2. UI two-slot configuration/status
3. paired image generation and reference linking
4. video prompt cut plan and attachment ordering
5. QC and provider capability gate
6. enable behind a tenant/feature flag, then widen after production evidence

## 11. Out of scope for this design

- เปลี่ยนจำนวน storyboard shots ทั้งตอนโดยอัตโนมัติ
- ให้ LLM เดาเองว่าตัวละครอยู่ฝั่งใดจาก synopsis
- ใช้ phone/video-call `Caller` แทน physical reverse shot
- เพิ่ม database table ใหม่ก่อนพิสูจน์ว่า JSONB frame metadata + existing shot-reference table ไม่เพียงพอ

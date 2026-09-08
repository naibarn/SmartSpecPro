# Role Taxonomy and Age Continuity

แยก 4 เรื่องออกจากกันเสมอ:

1. `narrative_role`: หน้าที่ในเรื่อง เช่น protagonist, antagonist, supporting
2. `role_tier`: ระดับความสำคัญ/เพศ/ช่วงวัย เช่น lead_male, child_heroine
3. `relationship_to_lead`: ความสัมพันธ์กับตัวละครหลัก เช่น younger_sister_of_heroine หรือ heroine_best_friend
4. `timeline_stage`: present_day, flashback_child หรือ flashback_teen

## Role compatibility

ใช้ตารางนี้เป็น preflight check ก่อนสร้าง prompt หากข้อมูลขัดกันให้หยุดสร้างภาพหรือคืน conflict ที่แก้ได้ก่อน:

| role_tier | narrative_role ที่คาดหวัง | age/timeline ที่คาดหวัง |
|---|---|---|
| `lead_male`, `lead_female`, `protagonist` | protagonist, co_protagonist หรือ love_interest | teen/adult ตามเรื่อง; ไม่ใช่ child mode โดยอัตโนมัติ |
| `child_hero`, `child_heroine` | child_flashback หรือ supporting | child_6_12/teen_13_17 และ flashback ที่สอดคล้อง |
| `antagonist_male`, `antagonist_female` | antagonist | teen/adult ตามเรื่อง และ threat มาจากการแสดง ไม่ใช่ใบหน้าผิดรูป |
| `supporting_male`, `supporting_female`, `elder_patriarch`, `elder_matriarch`, `support_memorable`, `support_general` | supporting | อายุใดก็ได้ที่สอดคล้องกับบทและอาชีพ |

`role` เป็น label สำหรับคนอ่าน เช่น “ปู่ของพระเอก” หรือ “แม่ค้าในตลาด” ไม่ควรนำไปใช้แทน `role_tier` ในการเลือก gate

## Supported role tiers

| role_tier | ใช้เมื่อ | หลักการภาพ |
|---|---|---|
| `lead_male` | พระเอก | พระเอกระดับนักแสดงนำ มี first impression สูง |
| `lead_female` | นางเอก | นางเอกระดับนักแสดงนำ ผ่าน face gate เข้มที่สุด |
| `protagonist` | ตัวเอกที่ไม่ต้องล็อกเพศ | ใช้ gate ระดับ lead ตาม gender/presentation |
| `child_hero` | พระเอกตอนเด็ก | เด็กชาย age-appropriate มี continuity anchor กับพระเอกโต |
| `child_heroine` | นางเอกตอนเด็ก | เด็กหญิง age-appropriate มี continuity anchor กับนางเอกโต |
| `antagonist_male` | ตัวร้ายชาย | มีแรงดึงดูด/ความคม แต่ใช้สายตา contrast และ styling สร้างภัยคุกคาม |
| `antagonist_female` | ตัวร้ายหญิง | สง่างาม น่าจดจำ และกดดันได้ โดยไม่ทำให้หน้าผิดสัดส่วน |
| `supporting_male` | ตัวรองชาย | มีเอกลักษณ์และน่าเชื่อถือ แต่ไม่แย่ง first impression จากพระเอก |
| `supporting_female` | ตัวรองหญิง | มีเสน่ห์และจำง่าย แต่สมดุลกับนางเอก |
| `elder_patriarch` | ปู่/ตาผู้อาวุโสที่เป็นเสาหลักครอบครัว | ใบหน้าคนทั่วไปตามวัย มีริ้วรอยและร่องรอยชีวิต ใช้ posture, แววตา และพร็อพให้มีน้ำหนัก |
| `elder_matriarch` | ย่า/ยายผู้อาวุโสที่เป็นศูนย์กลางครอบครัวหรือชุมชน | อบอุ่นหรือเด็ดขาดตามบท มีความเป็นคนจริง ไม่ใช้ความงามระดับนางเอกเป็นเกณฑ์ |
| `support_memorable` | ตัวประกอบที่มีบทจำได้ เช่น แม่ค้า เพื่อนบ้าน คนรู้เหตุการณ์ | หน้าตาทั่วไป แต่มีจุดจำ 1–2 จุดและการแสดงออกชัดเจน |
| `support_general` | ตัวประกอบทั่วไปหรือคนในฉาก | ลด visual dominance ให้สมจริงตามอาชีพ อายุ และสถานที่ ไม่ทำให้ทุกคนหน้าตาเหมือน stock model |

## Supporting relationships

รองรับค่า `relationship_to_lead` เช่น:

- `younger_brother_of_heroine`
- `younger_sister_of_heroine`
- `heroine_best_friend`
- `hero_best_friend`
- `hero_sibling`
- `family_member`
- `rival`
- `mentor`
- `colleague`
- `custom`

สำหรับพี่น้อง ให้ใช้ shared family anchors 1–2 จุด เช่น eye shape, brow rhythm หรือ smile pattern แต่เปลี่ยนอย่างน้อย 2–3 face axes เพื่อไม่ให้ดูเป็นคนเดียวกัน สำหรับเพื่อนสนิทควรสร้าง contrast ที่อ่านออก เช่น face family หรือ eye geometry ต่างกันชัดเจน

## Child and teen continuity

ถ้าเป็น `child_hero` หรือ `child_heroine`:

- ใช้ `age_band: child_6_12` หรือ `teen_13_17` ตามอายุจริง
- ใช้ `safety_mode: child_age_appropriate` หรือ `teen_age_appropriate`
- ใช้ `timeline_stage: flashback_child` หรือ `flashback_teen`
- เลือก continuity anchors จากตัวละครโตขึ้น 1–3 จุด แต่ลดความคม/ความเป็นผู้ใหญ่ของสัดส่วนใบหน้า
- ห้ามใช้ adult makeup, adult evening glamour, sexualized pose หรือทำให้เป็นผู้ใหญ่ตัวเล็ก
- ความโดดเด่นของเด็กมาจาก expression, curiosity, courage, posture และ wardrobe ตามวัย ไม่ใช่การแต่งหน้าหรือรูปร่างแบบผู้ใหญ่

## Antagonist policy

ตัวร้ายชาย/หญิงสามารถดูดีมากและดึงดูดสายตาได้ ความน่ากลัวหรือความไม่น่าไว้วางใจควรมาจาก gaze, micro-expression, posture, lighting, color contrast และ wardrobe logic ไม่ใช่กรามผิดรูป ใบหน้าพิการ หรือ stereotype ทางเชื้อชาติ

## Supporting-cast gate

ตัวประกอบมีหน้าที่ทำให้โลกของเรื่องน่าเชื่อถือ ไม่ใช่ทำให้ทุกคนดูเหมือนนักแสดงนำ:

- ใช้ ordinary, believable face เป็นค่าเริ่มต้น และรักษาความสมจริงของสัดส่วน ผิว และอายุ
- เลือกความแตกต่างจากอายุ โครงหน้าที่ไม่เหมือนกัน ริ้วรอย สีผิวตามธรรมชาติ ทรงผม อาชีพ และเสื้อผ้า มากกว่าการเพิ่มความสวยหล่อ
- `support_memorable` เพิ่มจุดจำได้ 1–2 จุด เช่น รอยยิ้มกว้าง คิ้วเด่น แว่น ทรงผม ผ้ากันเปื้อน หรือท่าทางพูดเร็ว แต่ไม่ใช้ lead-level glamour
- `support_general` ควรมี visual dominance ต่ำกว่า lead และไม่แย่งจุดสนใจจากฉากหรือเหตุการณ์หลัก
- `elder_patriarch` และ `elder_matriarch` ต้องมี age-accurate facial planes, wrinkles, hair aging และร่องรอยอาชีพที่สมเหตุสมผล

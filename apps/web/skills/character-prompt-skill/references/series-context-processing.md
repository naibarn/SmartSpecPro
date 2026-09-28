# Series Context Processing

เมื่อ input มี `series_dna` และ `character` ให้ประมวลผลตามลำดับนี้:

## Precedence

1. `character` และ `visual_overrides` เฉพาะตัวละคร
2. `series_dna` ของเรื่อง
3. ค่า default ของ skill

ข้อมูลระดับตัวละคร override ได้เฉพาะใบหน้า บุคลิกที่มองเห็นได้ เสื้อผ้า และการแสดงออก ไม่ควรลบล้าง genre, safety หรือ realism policy ของซีรีย์โดยพลการ

## Naming normalization

`series-dna.schema.json` รับ input แบบ camelCase และ `character-prompt-profile.schema.json` เก็บ trace แบบ snake_case ให้ map ดังนี้โดยคงค่าครบ:

| Input | Output trace |
|---|---|
| `storyWorld` | `story_world` |
| `emotionalEngine` | `emotional_engine` |
| `visualCulture` | `visual_culture` |
| `realismLevel` | `realism_level` |
| `beautyDirection` | `beauty_direction` |
| `dominantColors` | `dominant_colors` |
| `signatureMotifs` | `signature_motifs` |
| `prohibitedRepetition` | `prohibited_repetition` |

ห้ามเดาภาษาหรือย่อค่าฟิลด์ที่ไม่ได้อยู่ใน output schemaจนทำให้ trace ตรวจย้อนกลับไม่ได้

## Mapping rules

| Input | ใช้ประมวลผลเป็น |
|---|---|
| `genre` | archetype, visual tension, scene grammar และข้อห้ามไม่ให้ genre กลืนบทบาทนำ |
| `tone` | expression, contrast, key/fill ratio, warmth และ emotional distance |
| `storyWorld` | สถานที่ วัสดุ props ฉากหลัง และความเหมาะสมของ wardrobe |
| `emotionalEngine` | subtext ของสายตา ท่าทาง และความสัมพันธ์ระหว่างตัวละคร |
| `visualCulture` | live-action/illustrative direction, regional visual language, camera และ production value |
| `realismLevel` | skin texture, lens behavior, lighting physics และ artifact tolerance |
| `beautyDirection` | face gate และ quality threshold ไม่ใช่คำสั่งให้รีทัชจนเป็นพลาสติก |
| `dominantColors` | palette ของเสื้อผ้า ฉาก แสง และ color separation |
| `signatureMotifs` | visual anchors ที่ปรากฏอย่างพอดี ไม่ยัดทุก motif ในทุกภาพ |
| `prohibitedRepetition` | negative prompt และ presentation rejection rules |
| `region_ethnicity` | regional direction ตามข้อมูลที่ผู้ใช้ระบุอย่างชัดเจน ไม่อนุมานจากภาพ; ถ้าเป็นชุมชนย่อย/ลูกผสมให้ใช้ `region_direction: custom` พร้อมคง descriptor เดิม |
| `description` / `personality_traits` | expression, gaze, posture, wardrobe logic และ scene behavior ไม่ใช่การบิดโครงหน้า |

## Example translation

สำหรับ romantic legal thriller ในกรุงเทพ:

- `teal/amber/charcoal` เป็น palette หลัก แต่ให้ผิวคนยังเป็น natural skin tone
- ฝน เงากระจก ไฟเมือง และเงาแม่น้ำเป็นบรรยากาศ ไม่ใช่ overlay ที่บดบังใบหน้า
- ตัวละครนำต้องอบอุ่น เข้าถึงได้ และเป็น protagonist แม้เรื่องมีความลึกลับ
- ความกดดันใช้สายตาที่มี subtext, posture, framing และบริบทคดี ไม่ใช้ villain-coded face
- สูททนายและชุดทำงานต้องสะท้อนอาชีพ/ชนชั้น/การเดินทางของตัวละคร ไม่ใช่ generic CEO suit

## Personality to visual behavior

แปลงบุคลิกเป็นสิ่งที่กล้องมองเห็นได้:

- สุขุม/ปกป้อง: steady gaze, restrained expression, open shoulders, protective blocking
- ฉลาด/กล้าชน: direct eye contact, purposeful posture, practical wardrobe details
- อ่อนโยนแต่ไม่แสดงออก: softened eyes, small asymmetrical smile, guarded hands
- มีความผิดจากอดีต: controlled tension around eyes and jaw, slight hesitation, restrained palette

ห้ามแปลงบุคลิกเป็น stereotype ทางเชื้อชาติ เพศ หรือความผิดปกติของใบหน้า

## Output trace

ทุก profile ควรระบุ `visual_translation` เพื่ออธิบายว่า input ของซีรีย์ถูกแปลงเป็น:

- `tone_to_lighting`
- `world_to_environment`
- `emotional_engine_to_expression`
- `character_to_wardrobe`
- `prohibited_patterns`

# คู่มือการใส่ Input สำหรับ GPT Image Prompt Engineer Skill v5

คู่มือนี้สรุปจาก `schemas/input.schema.json` ของ skill v5 ล่าสุด ใช้สำหรับกรอก JSON input เพื่อให้ skill สร้าง prompt bundle, decision trace, safety review, quality review และ render parameters แบบ model-free

> หมายเหตุสำคัญ: skill นี้ **ไม่กำหนด model** เอง ระบบ API caller ภายนอกเป็นผู้เติม `model: "gpt-image-2"` ตอนเรียก API

## วิธีใช้แบบเร็วที่สุด

ใส่แค่ `topic` แล้วปล่อยทุกอย่างเป็นค่า default/auto ได้:

```json
{
  "topic": "ภาพผู้หญิงสวยวัย 18 ปี เดินเล่นริมทะเล โฟกัสชัดที่หน้าและลำตัวส่วนบน"
}
```

## หลักการเลือกค่า Auto

- ใช้ `auto` เมื่ออยากให้ skill เลือกเองตามหัวข้อภาพ
- กำหนดเองเมื่อมี requirement ชัดเจน เช่น ต้องการ `medium_close_up`, `85mm`, `shallow`, `natural_soft`
- งานซับซ้อน เช่น cinematic, storyboard, infographic, product ads แนะนำเปิด `enable_subagents: true` และใช้ `orchestration_mode: auto` หรือ `subagents` เพื่อสร้างรายงานโมดูลตรวจแบบ deterministic โดยไม่จำเป็นต้องเรียก LLM

## กฎสำคัญ

- `topic` จำเป็นเสมอ
- ถ้า `mode` เป็น `edit` ต้องมี `source_image_path`
- ถ้าต้องการ text ในภาพ ให้ใส่ใน `exact_text`
- ถ้า subject อายุใกล้ขอบเขต sensitive เช่น 18 ปี ควรใส่ `subject_age` และ `safety_review_level: strict`
- `seed` และ `guidance_scale` เป็น metadata ภายในแอป ไม่ควรถือว่าเป็น parameter ที่ API ทุกตัวรองรับ

## 1) ข้อมูลหลัก

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `topic` | `string` | minLength `3`, maxLength `1200` | - | หัวข้อ/brief หลักของภาพ |
| `target_language` | `string` | default `auto` | `auto`, `th`, `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt-BR`, `it`, `id`, `vi`, `ru`, `ar`, `hi` | ภาษาของ prompt ที่ต้องการ |
| `audience` | `string / null` | maxLength `300`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `purpose` | `string / null` | maxLength `400`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `exact_text` | `string / null` | maxLength `500`, default `None` | - | ข้อความที่ต้องให้ปรากฏในภาพ |
| `modifiers` | `array` | default `[]` | - | รายละเอียดเสริมเชิงสไตล์หรือข้อกำกับ |
| `avoid` | `array` | default `[]` | - | สิ่งที่ต้องหลีกเลี่ยง |

## 2) โหมดการทำงาน / Render parameters

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `render_api` | `string` | default `auto` | `auto`, `image_api`, `responses_tool` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `render_action` | `string` | default `auto` | `auto`, `generate`, `edit` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `mode` | `string` | default `generate` | `generate`, `edit` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `quality` | `string` | default `auto` | `auto`, `low`, `medium`, `high` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `output_format` | `string` | default `auto` | `auto`, `png`, `jpeg`, `webp` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `output_compression` | `integer / null` | min `0`, max `100`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `api_background` | `string` | default `auto` | `auto`, `opaque`, `transparent` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `moderation` | `string` | default `auto` | `auto`, `low` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `n` | `integer` | min `1`, max `4`, default `1` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `return_variants` | `integer` | min `1`, max `3`, default `2` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `include_edit_prompt` | `boolean` | default `True` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 3) Style / ประเภทงาน

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `image_style` | `string` | default `auto` | `auto`, `realistic`, `portrait`, `landscape`, `cartoon`, `anime_manga`, `infographic`, `slides_diagram`, `product_ad`, `product_mockup`, `ui_mockup`, `social_post`, `document_replica`, `concept_art`, `3d_render`, `flat_design`, `minimal`, `vintage`, `editorial`, `isometric`, `line_art`, `watercolor`, `pixel_art`, `fashion_lookbook`, `cinematic`, `architecture`, `food_photography` | เลือกสไตล์ภาพหลัก หรือ auto ให้ระบบเดา |
| `deliverable_type` | `string` | default `auto` | `auto`, `general_image`, `poster`, `banner`, `thumbnail`, `social_post`, `story_post`, `presentation_slide`, `infographic`, `diagram`, `ui_mockup`, `product_ad`, `product_mockup`, `document_replica`, `character_sheet`, `packaging_mockup`, `storyboard`, `contact_sheet` | ชนิดงานปลายทาง เช่น poster, infographic, product ad |

## 4) ขนาดภาพ / สัดส่วนภาพ

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `aspect_ratio` | `string` | default `auto` | `auto`, `1:1`, `4:5`, `5:4`, `2:3`, `3:2`, `3:4`, `4:3`, `16:9`, `9:16`, `21:9`, `9:21` | สัดส่วนเชิงสร้างสรรค์ที่ผู้ใช้เข้าใจ |
| `render_size` | `string` | default `auto` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` | ขนาดที่ส่งต่อให้ renderer ภายนอก |

## 5) ฉากหลัง

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `scene_background_mode` | `string` | default `auto` | `auto`, `normal`, `plain_studio`, `green_screen`, `contextual`, `multi_background` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `background_description` | `string / null` | maxLength `500`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 6) ภาพหลายเฟรม / หลายช่อง

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `multi_frame_mode` | `string` | default `auto` | `auto`, `single`, `grid`, `storyboard`, `multi_angle`, `multi_background`, `contact_sheet`, `before_after`, `diptych`, `triptych`, `quad_panel` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `frame_layout` | `string` | default `auto` | `auto`, `1x1`, `2x1`, `1x2`, `2x2`, `2x3`, `3x2`, `2x4`, `4x2`, `3x3`, `4x4` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `panel_count` | `integer` | min `1`, max `16`, default `1` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `panel_descriptions` | `array` | default `[]` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `panel_subject_strategy` | `string` | default `auto` | `auto`, `same_subject`, `same_product`, `different_subjects`, `different_products`, `sequence` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `continuity_mode` | `string` | default `auto` | `auto`, `strict`, `loose`, `none` | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 7) มุมกล้อง / ระยะภาพ / Composition

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `camera_angle` | `string` | default `auto` | `auto`, `eye_level`, `high_angle`, `low_angle`, `bird_eye`, `worm_eye`, `dutch_angle`, `over_the_shoulder`, `front_facing`, `profile`, `three_quarter`, `top_down` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `shot_framing` | `string` | default `auto` | `auto`, `extreme_close_up`, `close_up`, `medium_close_up`, `medium_shot`, `medium_full_shot`, `cowboy_shot`, `full_body`, `wide_shot`, `extreme_wide_shot` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `composition_rule` | `string` | default `auto` | `auto`, `centered`, `rule_of_thirds`, `symmetry`, `leading_lines`, `negative_space`, `golden_ratio`, `dynamic_diagonal` | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 8) กล้อง / เลนส์ / ความชัดลึก

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `camera_system` | `string` | default `auto` | `auto`, `smartphone`, `mirrorless`, `dslr`, `medium_format`, `large_format`, `cinema_camera`, `anamorphic_cinema` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `lens_focal_length` | `string` | default `auto` | `auto`, `18mm`, `24mm`, `35mm`, `50mm`, `85mm`, `135mm`, `200mm` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `aperture_style` | `string` | default `auto` | `auto`, `f1_2`, `f1_4`, `f1_8`, `f2_8`, `f4`, `f5_6`, `f8`, `f11`, `deep_focus` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `depth_of_field` | `string` | default `auto` | `auto`, `shallow`, `medium`, `deep` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `background_blur` | `string` | default `auto` | `auto`, `none`, `subtle`, `medium`, `strong` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `sensor_format` | `string` | default `auto` | `auto`, `full_frame`, `medium_format`, `super35`, `large_format`, `smartphone` | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 9) Cinematic / เทคนิคภาพยนตร์

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `cinematic_mode` | `string` | default `auto` | `auto`, `off`, `on` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `camera_movement` | `string` | default `auto` | `auto`, `static`, `handheld`, `dolly_in`, `dolly_out`, `truck_left`, `truck_right`, `crane`, `drone`, `tracking` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `film_stock` | `string` | default `auto` | `auto`, `clean_digital`, `cinema_film`, `kodak_like`, `fuji_like`, `black_and_white`, `vintage_film` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `shutter_speed_style` | `string` | default `auto` | `auto`, `crisp`, `natural_motion`, `motion_blur`, `long_exposure` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `iso_style` | `string` | default `auto` | `auto`, `clean_low_iso`, `natural_grain`, `high_iso_grain` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `anamorphic_flare` | `string` | default `auto` | `auto`, `off`, `subtle`, `strong` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `motion_blur` | `string` | default `auto` | `auto`, `none`, `subtle`, `medium`, `strong` | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 10) แสง / สี / Color grade

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `lighting_preset` | `string` | default `auto` | `auto`, `natural_soft`, `studio_softbox`, `hard_light`, `rim_light`, `golden_hour`, `blue_hour`, `neon`, `high_key`, `low_key`, `moody_cinematic`, `dramatic`, `backlit` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `light_source` | `string` | default `auto` | `auto`, `sun`, `window`, `softbox`, `spotlight`, `practical_lamps`, `neon_sign`, `led_panel`, `candle`, `mixed` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `light_direction` | `string` | default `auto` | `auto`, `front`, `side`, `back`, `top`, `under`, `three_point` | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `color_grade` | `string` | default `auto` | `auto`, `natural`, `warm`, `cool`, `teal_orange`, `pastel`, `muted`, `high_contrast_bw`, `filmic` | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 11) Safety / Policy metadata

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `subject_age` | `integer / null` | min `0`, max `130`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `depicts_real_person` | `boolean` | default `False` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `depicts_public_figure` | `boolean` | default `False` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `brand_or_logo` | `string / null` | maxLength `160`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `copyrighted_character` | `string / null` | maxLength `160`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `medical_or_legal_claim` | `boolean` | default `False` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 12) Image edit input

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `source_image_path` | `string / null` | maxLength `1024`, default `None` | - | ต้องใช้เมื่อแก้ไขภาพ |
| `mask_image_path` | `string / null` | maxLength `1024`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 13) Metadata เสริม

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `seed` | `integer / null` | default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |
| `guidance_scale` | `number / null` | min `0`, max `50`, default `None` | - | ตัวเลือกเสริมสำหรับควบคุม prompt |

## 14) Review Modules / Orchestration

| field | type | default / range | ตัวเลือก | ใช้เมื่อไหร่ |
|---|---|---|---|---|
| `orchestration_mode` | `string` | default `auto` | `auto`, `off`, `single_pass`, `subagents` | ควบคุมว่าจะใช้โมดูลตรวจหรือใช้แกนสร้างพรอมต์อย่างเดียว ค่า `subagents` คงไว้เพื่อ backward compatibility |
| `enable_subagents` | `boolean` | default `True` | - | เปิด/ปิดรายงานโมดูลตรวจแบบ deterministic |
| `subagent_budget` | `string` | default `balanced` | `auto`, `low`, `balanced`, `high` | ควบคุมจำนวนรายงานโมดูลตรวจที่เลือกใช้ |
| `reasoning_depth` | `string` | default `standard` | `auto`, `fast`, `standard`, `deep` | Controls how detailed the orchestration analysis should be. |
| `quality_review_passes` | `integer` | min `0`, max `3`, default `1` | - | Number of prompt critic passes to simulate in the deterministic orchestration layer. |
| `safety_review_level` | `string` | default `standard` | `auto`, `basic`, `standard`, `strict` | ระดับความเข้มของ safety review ใน pipeline โมดูลตรวจ |

## ตัวอย่าง Preset JSON ที่ใช้บ่อย

### minimal.json

```json
{
  "topic": "ภาพผู้หญิงสวยวัย 18 ปี เดินเล่นริมทะเล โฟกัสชัดที่หน้าและลำตัวส่วนบน"
}
```

### portrait_beach_subagents.json

```json
{
  "topic": "ภาพผู้หญิงสวยวัย 18 ปี เดินเล่นริมทะเล โฟกัสชัดที่หน้าและลำตัวส่วนบน",
  "target_language": "th",
  "image_style": "portrait",
  "deliverable_type": "general_image",
  "aspect_ratio": "2:3",
  "quality": "high",
  "shot_framing": "medium_close_up",
  "camera_angle": "eye_level",
  "camera_system": "medium_format",
  "lens_focal_length": "85mm",
  "aperture_style": "f1_8",
  "depth_of_field": "shallow",
  "background_blur": "medium",
  "lighting_preset": "natural_soft",
  "light_source": "sun",
  "color_grade": "natural",
  "subject_age": 18,
  "scene_background_mode": "contextual",
  "background_description": "ชายหาดริมทะเล แสงธรรมชาติ ทะเลและท้องฟ้าด้านหลังละลายอย่างนุ่มนวล",
  "avoid": [
    "เสื้อผ้าเปิดเผยเกินความเหมาะสม",
    "ท่าทางไม่เหมาะสม",
    "ภาพเบลอ",
    "ใบหน้าบิดเบี้ยว",
    "มือผิดรูป"
  ],
  "orchestration_mode": "auto",
  "enable_subagents": true,
  "safety_review_level": "strict"
}
```

### cinematic_scene.json

```json
{
  "topic": "ชายคนหนึ่งยืนอยู่กลางถนนในเมืองยามฝนตก แสงนีออนสะท้อนพื้นถนน อารมณ์ลึกลับเหมือนฉากหนัง",
  "target_language": "th",
  "image_style": "cinematic",
  "cinematic_mode": "on",
  "aspect_ratio": "16:9",
  "camera_system": "anamorphic_cinema",
  "lens_focal_length": "35mm",
  "lighting_preset": "neon",
  "light_source": "neon_sign",
  "color_grade": "teal_orange",
  "anamorphic_flare": "subtle",
  "motion_blur": "subtle",
  "orchestration_mode": "subagents"
}
```

### product_ad.json

```json
{
  "topic": "โฆษณาขวดน้ำหอม luxury วางบนแท่นหินอ่อน มีหยดน้ำและแสงสะท้อนหรูหรา",
  "target_language": "th",
  "image_style": "product_ad",
  "deliverable_type": "product_ad",
  "aspect_ratio": "1:1",
  "quality": "high",
  "camera_angle": "three_quarter",
  "shot_framing": "medium_shot",
  "lighting_preset": "studio_softbox",
  "light_direction": "three_point",
  "background_blur": "subtle",
  "orchestration_mode": "auto"
}
```

### infographic.json

```json
{
  "topic": "อินโฟกราฟิกอธิบาย 5 ขั้นตอนการชงกาแฟดริปให้อร่อย",
  "target_language": "th",
  "image_style": "infographic",
  "deliverable_type": "infographic",
  "aspect_ratio": "1:1",
  "quality": "high",
  "exact_text": "5 ขั้นตอนชงกาแฟดริป",
  "depth_of_field": "deep",
  "background_blur": "none",
  "orchestration_mode": "auto"
}
```

### multiframe_storyboard.json

```json
{
  "topic": "storyboard โฆษณาชาเย็น 4 ช่อง ตั้งแต่หยิบแก้ว เติมน้ำแข็ง เทชา และยกดื่ม",
  "target_language": "th",
  "image_style": "cinematic",
  "deliverable_type": "storyboard",
  "multi_frame_mode": "storyboard",
  "frame_layout": "2x2",
  "panel_count": 4,
  "panel_subject_strategy": "sequence",
  "continuity_mode": "strict",
  "panel_descriptions": [
    "มือหยิบแก้วใส",
    "เติมน้ำแข็ง",
    "เทชาเย็นลงแก้ว",
    "คนยกแก้วดื่มอย่างสดชื่น"
  ],
  "orchestration_mode": "subagents"
}
```

### edit_mode.json

```json
{
  "topic": "เปลี่ยนฉากหลังเป็นชายหาดแสงเย็น เพิ่มละลายหลังนุ่ม และคงใบหน้า/เสื้อผ้าเดิมไว้",
  "target_language": "th",
  "mode": "edit",
  "render_action": "edit",
  "source_image_path": "/mnt/data/source.png",
  "mask_image_path": null,
  "include_edit_prompt": true,
  "scene_background_mode": "contextual",
  "background_description": "ชายหาดช่วงเย็น แสง golden hour ทะเลด้านหลังละลายอย่างนุ่มนวล"
}
```

## Workflow แนะนำ

1. เริ่มจาก `topic` ก่อน
2. เลือก `target_language` เช่น `th` หรือ `en`
3. เลือก `image_style` หรือปล่อย `auto`
4. ถ้าภาพคน ให้เลือก `shot_framing`, `camera_angle`, `depth_of_field`, `background_blur`
5. ถ้างานโฆษณา/สินค้า ให้กำหนด `product_ad`, `studio_softbox`, `three_quarter`
6. ถ้างาน cinematic ให้เปิด `cinematic_mode: on` และเลือกกล้อง/แสง/สี
7. ถ้างานหลายช่อง ให้กำหนด `multi_frame_mode`, `frame_layout`, `panel_count`, `panel_descriptions`
8. เปิด `enable_subagents: true` เมื่อโจทย์ซับซ้อนหรือต้องการรายงานโมดูลตรวจละเอียดขึ้น

## Output ที่ควรนำไปใช้ต่อ

- ใช้ `prompts.detailed` เป็น prompt หลัก
- ใช้ `render_request.image_api.prompt` เมื่อต้องส่งต่อให้ระบบเรียก Image API
- ระบบภายนอกค่อยเติม `model: "gpt-image-2"` เอง

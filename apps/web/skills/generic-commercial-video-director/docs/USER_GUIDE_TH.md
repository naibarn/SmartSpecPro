# คู่มือการใช้งานฉบับเต็ม  
# Generic Commercial Video Director v11

**Skill ID:** `generic-commercial-video-director`  
**Compatibility Alias:** `generic-product-video-director`  
**Skill Version:** `11.0.0`  
**เอกสาร:** Full User & Production Guide — ภาษาไทย  
**เหมาะสำหรับ:** SmartAIHub UI, Agent Workflow, Product Tie-in, Product Review, Place/Venue Review, Service/Experience Promotion, Narrative Video, Multi-shot และ AI Video Provider Routing

---

> ## v11 Runtime Authority — อ่านส่วนนี้ก่อนใช้งาน
>
> ```text
> SmartAIHub Core / Workflow Controller = Authority
> OpenAI Agents SDK                     = Bounded Reasoning Runtime
> Stage Schemas                         = Structured Contracts
> Provider Capability Profiles          = Provider Truth
> Provider Adapters                      = Deterministic API Translation
> Session                               = Optional History
> SmartAIHub DB + Run Checkpoint         = Canonical State
> ```
>
> Agent ไม่มีสิทธิ์ตัดเครดิต, submit paid generation, publish, delete asset, เปลี่ยน tenant หรือ bypass approval โดยตรง
>
> รายละเอียดเต็มดูหัวข้อ **37. OpenAI Agents SDK / Developer Runtime Integration**

## สารบัญ

1. [Skill นี้คืออะไร](#1-skill-นี้คืออะไร)
2. [แนวคิดหลักก่อนเริ่มใช้งาน](#2-แนวคิดหลักก่อนเริ่มใช้งาน)
3. [Skill รองรับงานอะไรบ้าง](#3-skill-รองรับงานอะไรบ้าง)
4. [ภาพรวม Workflow ทั้งระบบ](#4-ภาพรวม-workflow-ทั้งระบบ)
5. [Quick Start — ใช้งานแบบง่ายที่สุด](#5-quick-start--ใช้งานแบบง่ายที่สุด)
6. [หน้าจอและขั้นตอนใช้งาน 5 ส่วน](#6-หน้าจอและขั้นตอนใช้งาน-5-ส่วน)
7. [การเขียน Idea](#7-การเขียน-idea)
8. [Promotion Target Resolver — ระบบตัดสินว่ากำลังโปรโมตอะไร](#8-promotion-target-resolver--ระบบตัดสินว่ากำลังโปรโมตอะไร)
9. [กรณีไม่มีภาพสินค้า](#9-กรณีไม่มีภาพสินค้า)
10. [กรณีโปรโมตร้าน สถานที่ โรงแรม คาเฟ่ หรือ Property](#10-กรณีโปรโมตร้าน-สถานที่-โรงแรม-คาเฟ่-หรือ-property)
11. [กรณีเป็นเรื่องเล่าโดยไม่มีสิ่งที่ต้องโปรโมต](#11-กรณีเป็นเรื่องเล่าโดยไม่มีสิ่งที่ต้องโปรโมต)
12. [การแนบ Reference — ภาพ วิดีโอ และเสียง](#12-การแนบ-reference--ภาพ-วิดีโอ-และเสียง)
13. [Asset Roles และ Reference Purposes](#13-asset-roles-และ-reference-purposes)
14. [Character / Cast](#14-character--cast)
15. [Dialogue / Voice / Lip Sync](#15-dialogue--voice--lip-sync)
16. [Product Context และข้อมูลสินค้า](#16-product-context-และข้อมูลสินค้า)
17. [Product Mechanism & Demonstration](#17-product-mechanism--demonstration)
18. [Visual Explanation / VFX](#18-visual-explanation--vfx)
19. [Start Frame](#19-start-frame)
20. [End Frame / Mid Keyframe](#20-end-frame--mid-keyframe)
21. [Multi-shot](#21-multi-shot)
22. [การกำหนดความยาว 8 / 10 / 15 วินาที](#22-การกำหนดความยาว-8--10--15-วินาที)
23. [Extension Chain และวิดีโอยาว](#23-extension-chain-และวิดีโอยาว)
24. [Model Routing](#24-model-routing)
25. [MiniMax H3 — คู่มือใช้งานเต็ม](#25-minimax-h3--คู่มือใช้งานเต็ม)
26. [Gemini Omni 1.1 Flash Extension](#26-gemini-omni-11-flash-extension)
27. [Seedance / Veo / Kling / Hailuo / FLUX](#27-seedance--veo--kling--hailuo--flux)
28. [Storyboard และ Approval](#28-storyboard-และ-approval)
29. [QC](#29-qc)
30. [Repair](#30-repair)
31. [Post Production](#31-post-production)
32. [Output ของ Skill](#32-output-ของ-skill)
33. [ตัวอย่างใช้งานแบบละเอียด](#33-ตัวอย่างใช้งานแบบละเอียด)
34. [Preset ที่แนะนำ](#34-preset-ที่แนะนำ)
35. [Troubleshooting](#35-troubleshooting)
36. [ข้อจำกัดที่ควรรู้](#36-ข้อจำกัดที่ควรรู้)
37. [OpenAI Agents SDK / Developer Runtime Integration](#37-openai-agents-sdk--developer-runtime-integration)
38. [Production Checklist](#38-production-checklist)
39. [Glossary](#39-glossary)
40. [Operations — Resume / Retry / Budget / Failure Recovery](#40-operations--resume--retry--budget--failure-recovery)
41. [Provider Runtime Responsibility Matrix](#41-provider-runtime-responsibility-matrix)
42. [Migration Guide — v10 → v11](#42-migration-guide--v10--v11)
43. [v11 Documentation Completeness Checklist](#43-v11-documentation-completeness-checklist)

---

# 1. Skill นี้คืออะไร

`Generic Commercial Video Director v11` เป็น Skill สำหรับเปลี่ยน **Idea หรือเรื่องย่อสั้น ๆ** ให้กลายเป็นแผนสร้างวิดีโอระดับ production โดยใช้ AI Video Model หลายค่ายผ่าน Provider Adapter

Skill ไม่ได้ทำหน้าที่เพียง “เขียน Prompt วิดีโอ” แต่ทำหน้าที่คล้าย:

> **Creative Director + Product/Place Analyst + Script Planner + Shot Planner + Continuity Supervisor + Prompt Engineer + Provider Router + QC/Repair Planner**

Input ขั้นต่ำจริง ๆ คือเพียง:

```text
idea
```

ตัวอย่าง:

```text
ผู้หญิงเอาครีมมาทาหน้า
```

หรือ:

```text
พาชมร้านตามภาพนี้
```

หรือ:

```text
เด็กนั่งเล่นของเล่นกับแม่
```

จากข้อความสั้น ๆ Skill จะวิเคราะห์บริบทและขยายออกเป็น:

```text
Promotion Target
↓
Expanded Idea
↓
Concept
↓
Script / Dialogue
↓
Sequence
↓
Shot
↓
Action & Motion
↓
Camera / Blocking / Lighting / Continuity
↓
Provider Strategy
↓
Prompt / Prompt Chain
↓
Generation Plan
↓
QC
↓
Repair
↓
Post Production
```

---

# 2. แนวคิดหลักก่อนเริ่มใช้งาน

Skill v11 ใช้แนวคิดหลัก 5 เรื่อง

## 2.1 Idea ไม่จำเป็นต้องละเอียด

ผู้ใช้ไม่ต้องเขียน:

> “เธอหยิบขวดด้วยมือขวา หมุนข้อมือ 20 องศา เปิดฝา เทลงฝ่ามือ…”

สามารถเขียนเพียง:

```text
เธอเทแชมพูจากขวดเอามาสระผม
```

LLM จะเป็นผู้ทำ:

- Action decomposition
- State transition
- Natural body movement
- Product interaction
- Camera intent
- Timing
- Proof moment
- Dialogue placement
- Visual explanation
- Provider feasibility

ให้เอง

---

## 2.2 ไม่จำเป็นต้องมีสินค้าเสมอไป

Skill v11 ไม่ได้ตั้งสมมติฐานว่า “ทุกงานต้องมี Product”

ระบบจะหา **Promotion Target** ก่อนว่าโจทย์กำลังพูดถึงอะไรจริง ๆ

อาจเป็น:

```text
สินค้า
ร้าน / สถานที่
บริการ
แอป / SaaS
งาน Event
โรงแรม / Property
อาหาร / เครื่องดื่ม
Brand
หรือไม่มีสิ่งที่โปรโมตเลย
```

---

## 2.3 Reference ไม่ได้มีแค่ภาพ

ระบบรองรับ Reference เป็น:

```text
Image
Video
Audio
```

และแต่ละไฟล์ไม่ได้มีความหมายเพียง “ใช้เป็น Reference” แบบกว้าง ๆ แต่สามารถระบุได้ว่าต้องใช้เพื่ออะไร เช่น:

```text
ภาพตัวละคร → identity
วิดีโอ → motion + camera movement
เสียง → voice timbre
ภาพร้าน → place identity + visible layout
ภาพสินค้า → product geometry + product label
```

---

## 2.4 Logical Shot ไม่เท่ากับ Generation Call

ตัวอย่าง:

```text
Logical Shot = 15 วินาที
```

ไม่ได้หมายความว่าต้องสร้างด้วย API call เดียวเสมอ

อาจเป็น:

```text
Provider A
15s direct generation
```

หรือ:

```text
Provider B
8s base
+ 7s extension
```

หรือเป็น:

```text
3 generated clips
แล้ว assemble ใน Post
```

ดังนั้น Skill แยก:

1. Video / Sequence
2. Logical Shot
3. Generation Segment
4. Prompt Turn

ออกจากกัน

---

## 2.5 Start Frame คือ State #0

ถ้ามี Start Frame ภาพนั้นถือเป็นสภาพจริงที่เวลาเริ่มต้น

Skill จะไม่เริ่มคิด action ใหม่โดยไม่คำนึงถึงสิ่งที่อยู่ในภาพ

เช่น Start Frame มี:

```text
ผู้หญิงถือขวดอยู่แล้ว
ฝาเปิดแล้ว
มืออีกข้างว่าง
```

Action ต่อไปไม่ควรกลับไป:

```text
เดินไปหยิบขวด
เปิดฝาใหม่
```

เพราะสิ่งเหล่านั้นเกิดขึ้นไปแล้วก่อน t=0

---

# 3. Skill รองรับงานอะไรบ้าง

## 3.1 Product Advertisement / Tie-in

ตัวอย่าง:

- แชมพู
- ครีม
- เครื่องสำอาง
- โทรศัพท์มือถือ
- เครื่องใช้ไฟฟ้า
- เครื่องซักผ้า
- แอร์
- เครื่องดูดฝุ่น
- เครื่องครัว
- อาหาร
- เครื่องดื่ม
- ของเล่น
- เครื่องมือ
- รถยนต์ / อุปกรณ์รถ
- สินค้าสัตว์เลี้ยง
- สินค้าเด็ก
- Fashion / Bags / Shoes
- Smart Home
- Software / App

---

## 3.2 Product Demonstration

เหมาะกับสิ่งที่ต้องแสดง “วิธีใช้”

เช่น:

```text
น้ำยาถูพื้น
ครีม
เครื่องซักผ้า
เครื่องดูดฝุ่น
เครื่องมือไฟฟ้า
เครื่องครัว
มือถือ
App
```

---

## 3.3 Place / Venue Promotion

รองรับ:

- ร้านค้า
- คาเฟ่
- ร้านอาหาร
- โรงแรม
- รีสอร์ต
- คลินิก
- Salon
- Showroom
- Office
- Attraction
- Museum
- Property
- Fitness
- Event Venue

---

## 3.4 Service / Experience

เช่น:

```text
บริการสปา
คลินิก
บริการติดตั้ง
บริการที่ปรึกษา
บริการส่งของ
คอร์สเรียน
กิจกรรม
Event
Experience
```

---

## 3.5 Digital Product / SaaS

รองรับ:

```text
App
Website
SaaS
Mobile UI
Dashboard
Software Workflow
```

โดยสามารถใช้:

- Virtual Screen
- Screen Composite
- Feature Callout
- Data Overlay

---

## 3.6 Narrative / Drama ที่ไม่มีโฆษณา

เช่น:

```text
แม่กับลูกนั่งคุยกัน
คนเดินเข้าห้อง
ตัวละครทะเลาะกัน
คนกำลังทำอาหาร
เด็กเล่นของเล่น
```

Skill จะไม่ฝืนสร้าง Product Hero หรือ CTA ถ้าไม่มี Promotion Target

---

# 4. ภาพรวม Workflow ทั้งระบบ

Workflow v11:

```text
Intake & Asset Validation
↓
Early Start-Frame / Scene Semantic Analysis
↓
Cast / Asset Resolution
↓
Promotion Target Resolution
│
├─ Product
│   ↓
│   Product Evidence
│   ↓
│   Product Mechanism / Demonstration
│
├─ Place / Venue
│   ↓
│   Place Evidence
│   ↓
│   Place / Visitor Experience
│
├─ Service / Digital / Event
│   ↓
│   Experience Journey
│
└─ Narrative Only
↓
Research / Evidence Gate
↓
Idea Expansion
↓
Claim / Spatial Truth / Compliance Gate
↓
Concept
↓
Script
↓
Dialogue / Speaker Mapping
↓
Breakdown
↓
Sequence Architecture
↓
Shot Duration Allocation
↓
Scene & Shot Planning
↓
Action & Motion
↓
Visual Design
↓
Continuity Locks
↓
Storyboard
↓
Approval
↓
Provider / Model Routing
↓
Temporal Execution Planning
↓
Prompt / Prompt Chain
↓
AI Video Generation
↓
Segment / Seam / Sequence QC
↓
Repair
↓
Post Production
↓
Publish
↓
Analytics
↓
Optimize
```

---

# 5. Quick Start — ใช้งานแบบง่ายที่สุด

## 5.1 แบบไม่มี Reference เลย

ใส่เพียง:

```json
{
  "idea": "ผู้หญิงเอาครีมมาทาหน้า"
}
```

Skill จะ:

1. Resolve ว่าเป็น `physical_product`
2. เห็นว่าไม่มี product image
3. ถ้าไม่มีชื่อ brand → ใช้ generic/unbranded cream
4. ขยาย action
5. วาง shot
6. เลือกกล้อง
7. เขียน prompt

---

## 5.2 มีตัวละคร + ฉาก

```json
{
  "idea": "ผู้หญิงเดินเข้ามานั่งที่โต๊ะแล้วแนะนำบรรยากาศร้าน",
  "assets": [
    {
      "assetId": "woman",
      "role": "character_reference",
      "mediaType": "image"
    },
    {
      "assetId": "cafe",
      "role": "environment_reference",
      "mediaType": "image"
    }
  ]
}
```

ระบบสามารถ resolve เป็น `place_venue` ถ้า Idea ชัดว่ากำลังพูดถึงร้าน

---

## 5.3 มี Start Frame

```json
{
  "idea": "เธอยกสินค้าในมือขึ้นมาแล้วเริ่มอธิบาย",
  "assets": [
    {
      "assetId": "start_01",
      "role": "start_frame",
      "mediaType": "image",
      "sourceOfTruth": true
    }
  ]
}
```

Skill จะใช้ภาพเป็น `State #0`

---

## 5.4 ต้องการ 10 วินาทีต่อ Shot

```json
{
  "format": {
    "shotDurationPolicy": {
      "mode": "fixed",
      "fixedSeconds": 10
    }
  }
}
```

---

## 5.5 ต้องการ 8 / 10 / 15 วินาทีให้ Agent เลือก

```json
{
  "format": {
    "shotDurationPolicy": {
      "mode": "allowed_values",
      "allowedSeconds": [8, 10, 15],
      "preferredSeconds": 10
    }
  }
}
```

---

# 6. หน้าจอและขั้นตอนใช้งาน 5 ส่วน

UI Schema ของ Skill แบ่งเป็น 5 ส่วนหลัก

---

## 6.1 Step 1 — Idea

Fields:

```text
idea
contentMode
goal
targetAudience
callToAction
promotionTarget
missingTargetAssetPolicy
placePromotionPolicy
```

Derived Panels:

```text
Expanded Idea Preview
Product Interaction Preview
Product Mechanism Preview
Demonstration Arc Preview
Visual Explanation Preview
Promotion Target Resolution
Missing Target Asset Decision
Commercial Branch Preview
```

สิ่งที่ผู้ใช้ควรทำ:

1. พิมพ์ Idea
2. ถ้ารู้ว่าจะโปรโมตอะไรชัด สามารถตั้ง Promotion Target
3. ถ้าไม่รู้ ให้ `auto`
4. ตรวจ Expanded Idea
5. ตรวจว่าระบบตีความสิ่งที่กำลังโปรโมตถูกหรือไม่

---

## 6.2 Step 2 — Start Frame / Product / Cast

Fields:

```text
product
assets
cast
startFramePolicy
```

Derived:

```text
Start Frame Analysis
Detected Cast
Cast Position Mapping
Product Reference Mapping
Reference Semantic Map
Provider Reference Compatibility
Scene As Promotion Target Preview
Place Evidence Preview
Unseen Area Risk Preview
```

ขั้นตอนสำคัญ:

- ตรวจชื่อ/ตัวละครว่า map ถูกคน
- ตรวจว่า Start Frame ไหนเป็นของ shot ไหน
- ตรวจ product/place source of truth
- ตรวจ scene image ว่าเป็นฉากเฉย ๆ หรือเป็นสถานที่ที่ต้องโปรโมต

---

## 6.3 Step 3 — Dialogue / Voice

Fields:

```text
dialogue
```

Derived:

```text
Speaker Mapping
Estimated Speech Duration
```

ควรตรวจ:

- Speaker ถูกคนหรือไม่
- บทพูดยาวเกิน shot หรือไม่
- ต้อง Lip Sync หรือเป็น Voice-over
- Reference Voice เป็นของใคร

---

## 6.4 Step 4 — Format & Model Routing

Fields:

```text
format
modelRouting
researchMode
demonstrationPolicy
visualExplanationPolicy
shotDurationPolicy
multiShotStrategy
extensionPolicy
providerOptions
```

Derived:

```text
Capability Match
Shot Risk
Routing Recommendation
Visualization Capability
Post Composite Recommendation
Sequence Timeline
Duration Feasibility
Prompt Chain
MiniMax H3 Mode
H3 Reference Conflict
H3 2K Workflow
```

---

## 6.5 Step 5 — Approval / Budget / QC

Fields:

```text
agentExecutionProfile
generationMode
approvalPolicy
budget
qcPolicy
constraints
```

ใช้กำหนด:

- จะวางแผนอย่างเดียวหรือ generate จริง
- ต้อง approve storyboard หรือไม่
- จำนวน candidate
- จำนวน repair รอบสูงสุด
- threshold QC
- budget

---

# 7. การเขียน Idea

## 7.1 Idea แบบสั้นที่สุด

เขียนเพียงสิ่งที่อยากเห็น:

```text
เธอเทแชมพูจากขวดเอามาสระผม
```

หรือ:

```text
เด็กนั่งเล่นของเล่น
```

หรือ:

```text
พาชมร้านนี้
```

---

## 7.2 Idea ที่ดีควรมีอะไรบ้าง

ถ้าต้องการเพิ่มความแม่น สามารถให้ข้อมูล:

```text
ใคร
ทำอะไร
กับอะไร
ที่ไหน
อารมณ์ประมาณไหน
เป้าหมายของคลิปคืออะไร
```

ตัวอย่าง:

```text
ผู้หญิงวัยทำงานยืนอยู่ในห้องน้ำ
สาธิตวิธีใช้แชมพูแบบเป็นธรรมชาติ
เน้นให้เห็นขั้นตอนการเทใส่มือและชโลมลงผม
ภาพดูเป็นโฆษณา beauty แบบ realistic
```

---

## 7.3 ไม่ต้องระบุมุมกล้องละเอียดก็ได้

Skill สามารถคิด:

- Establishing
- Medium
- Close-up
- Macro
- Push-in
- Pan
- Arc
- Tracking

ตาม action และ product proof

---

## 7.4 Idea Expansion Policy

Field:

```text
ideaExpansionPolicy.mode
```

ค่า:

### `auto`
ให้ Agent ตัดสินความสร้างสรรค์ตามโจทย์

### `conservative`
เติมเฉพาะรายละเอียดที่จำเป็น ลดการคิดเพิ่ม

เหมาะกับ:
- งานแบรนด์
- งาน regulated
- product demo ที่ต้องตรงขั้นตอน

### `creative`
อนุญาตให้เพิ่ม visual beat และ cinematic treatment มากขึ้น

เหมาะกับ:
- Lifestyle ads
- UGC
- creative tie-in

---

## 7.5 `askWhenCritical`

ถ้า `true`

Agent ควรถามหรือหยุดเมื่อมีข้อมูลสำคัญที่เดาไม่ได้ เช่น:

```text
สินค้าแบรนด์ไหน
อุปกรณ์รุ่นไหน
วิธีใช้แบบใดถูกต้อง
สถานที่จริงมี facility นี้หรือไม่
```

แต่จะไม่ถามเรื่องเล็ก ๆ ที่ infer ได้ตามธรรมชาติ

---

# 8. Promotion Target Resolver — ระบบตัดสินว่ากำลังโปรโมตอะไร

Field:

```text
promotionTarget
```

ค่าหลัก:

```text
mode = auto | explicit
kind =
  physical_product
  place_venue
  service_business
  digital_product
  experience_event
  property_accommodation
  food_beverage
  brand_campaign
  narrative_no_promotion
  unknown
```

---

## 8.1 `auto`

แนะนำให้ใช้เป็น default

ระบบพิจารณา:

- Idea
- Dialogue
- Start Frame
- Product Reference
- Environment
- Place Image
- Research
- Context

ตัวอย่าง:

```text
Idea:
"พาชมร้านนี้ตามภาพ"

Environment image:
ร้านกาแฟ
```

ผล:

```text
targetKind = place_venue
branch = place_experience
```

---

## 8.2 `explicit`

ใช้เมื่อผู้ใช้รู้แน่

```json
{
  "promotionTarget": {
    "mode": "explicit",
    "kind": "place_venue",
    "name": "My Cafe"
  }
}
```

---

## 8.3 `exactVisualIdentityRequired`

ถ้า `true`

Skill จะเข้มงวดกับ:

- รูปสินค้า
- Package
- Logo
- UI
- Storefront
- Signage
- Visual identity

ถ้าไม่มี source of truth ระบบไม่ควรสร้างเดา

---

# 9. กรณีไม่มีภาพสินค้า

Field:

```text
missingTargetAssetPolicy
```

รองรับ 5 รูปแบบหลัก

---

## 9.1 สินค้าทั่วไป ไม่มี Brand

ตัวอย่าง:

```text
เธอใช้ครีมทาหน้า
```

ไม่มี product image

ใช้:

```json
{
  "missingTargetAssetPolicy": {
    "mode": "continue_generic",
    "allowGenericUnbrandedVisual": true
  }
}
```

ระบบสามารถสร้าง:

```text
neutral cosmetic jar
generic white pump bottle
unbranded cleaning spray
generic smartphone-shaped device
```

โดยไม่สร้าง logo จริงขึ้นมาเอง

---

## 9.2 สินค้าอยู่ใน Start Frame

เช่นตัวละครถือโทรศัพท์อยู่แล้ว

ระบบสามารถ:

```text
detect product
↓
derive visible crop
↓
visualIdentityStatus = visible_in_scene
```

เหมาะเมื่อสินค้ามองเห็นชัดพอ

ข้อจำกัด:

- ไม่รู้ด้านที่มองไม่เห็น
- ไม่ควรเดาข้อความฉลาก
- ไม่ควรเปลี่ยนสี/รุ่นเอง

---

## 9.3 Named Product แต่ไม่มีภาพ

เช่น:

```text
รีวิวโทรศัพท์ ExamplePhone X Pro
```

ระบบสามารถ research:

- Features
- Specs
- Usage

แต่ visual identity ยังไม่ถือว่า verified

ดังนั้นแยก:

```text
Factual truth
กับ
Visual truth
```

---

## 9.4 ต้องการ Packaging/Logo เป๊ะ

ค่าแนะนำ:

```json
{
  "missingTargetAssetPolicy": {
    "mode": "block_when_exact_identity_missing",
    "allowGenerateApproximateNamedProduct": false,
    "requireReferenceForExactPackagingLogoUi": true
  }
}
```

Planning ยังทำต่อได้

แต่ shot ที่ต้องเห็นสินค้าจริงชัด ๆ จะถูก Block จนกว่าจะมี Reference

---

## 9.5 `derive_from_scene`

เหมาะกับ:

```text
สินค้าอยู่ใน Start Frame
สินค้าอยู่บนโต๊ะในภาพสถานที่
สินค้าอยู่ในมือคน
```

Skill จะพยายามใช้ visual evidence ที่มีอยู่แล้ว

---

# 10. กรณีโปรโมตร้าน สถานที่ โรงแรม คาเฟ่ หรือ Property

ใช้ branch:

```text
place_venue
```

หรือ:

```text
property_accommodation
```

---

## 10.1 ภาพ Environment อาจกลายเป็นสิ่งที่โปรโมต

ตัวอย่าง:

```text
Image = ห้องในร้าน
Idea = "ให้ผู้หญิงพาชมร้านในภาพ"
```

ระบบไม่ควรมองภาพว่าเป็นแค่ฉาก

แต่ควร resolve:

```text
environment_reference
↓
semantic reclassification
↓
place_identity
venue_layout
visible_feature
place_atmosphere
```

---

## 10.2 Place Experience Model

ระบบจะสร้าง:

```text
Place Type
Promotional Focus
Visible Areas
Visible Features
Verified Facts
Unseen / Unverified Features
Visitor Journey
Camera Opportunities
Proof Moments
CTA
```

---

## 10.3 ตัวอย่าง Visitor Journey

```text
Establish
↓
Approach
↓
Enter / Orient
↓
Highlight Area
↓
Interaction
↓
Detail
↓
Experience
↓
Reaction
↓
Hero
↓
CTA
```

---

## 10.4 ถ้ามีภาพร้านแค่ภาพเดียว

สามารถทำได้:

- Push-in
- Pull-out
- Pan
- Tilt
- Small Arc
- Parallax
- Detail Crop
- Presenter moving within visible area
- Sitting
- Pointing
- Visible counter/table interaction
- Text Callout

ไม่ควรสร้างเป็นข้อเท็จจริง:

- ชั้นสอง
- ห้อง VIP
- ห้องน้ำ
- ที่จอดรถ
- ครัว
- สวน
- Exterior ที่ไม่เคยเห็น

---

## 10.5 `unseenAreaPolicy`

### `visible_only`
แนะนำสำหรับงานจริง

พูด/สร้างเฉพาะสิ่งที่มองเห็น

### `research_verified`
อนุญาตให้ใช้ข้อมูลสถานที่จากแหล่งที่ verify แล้ว

### `request_more_views`
ขอภาพเพิ่มเติมเมื่อจำเป็น

### `allow_clearly_stylized_reconstruction`
อนุญาต creative reconstruction แต่ต้องไม่สื่อว่าเป็นภาพจริงที่พิสูจน์สถานที่

---

## 10.6 Signage

หากป้ายร้านต้องตรง:

```text
preserveStorefrontOrSignage = true
```

ถ้า AI Video ทำ text เพี้ยน:

```text
Generate clean plate
↓
Track surface
↓
Post composite signage จริง
```

---

# 11. กรณีเป็นเรื่องเล่าโดยไม่มีสิ่งที่ต้องโปรโมต

ตั้ง:

```json
{
  "promotionTarget": {
    "mode": "explicit",
    "kind": "narrative_no_promotion"
  }
}
```

หรือให้ Auto resolve

Skill จะข้าม:

```text
Product Mechanism
Product Proof
Product Hero
Commercial CTA
```

แต่ยังใช้:

```text
Script
Dialogue
Sequence
Shot
Start Frame
Motion
Continuity
Provider Routing
AI Video
QC
```

ได้ทั้งหมด

---

# 12. การแนบ Reference — ภาพ วิดีโอ และเสียง

Asset Schema หลัก:

```json
{
  "assetId": "asset_01",
  "role": "character_reference",
  "mediaType": "image",
  "entityId": "woman_01",
  "sourceOfTruth": true,
  "referencePurposes": ["identity"],
  "providerUsePolicy": "auto"
}
```

---

## 12.1 `mediaType`

รองรับ:

```text
image
video
audio
document
unknown
```

---

## 12.2 `sourceOfTruth`

ถ้า `true`

หมายถึง reference นี้มี authority สูง

เหมาะกับ:

- ตัวละครจริง
- Product Packshot
- Start Frame
- Storefront
- Logo
- UI
- Reference Voice

---

## 12.3 `entityId`

ใช้ผูก asset กับ entity

เช่น:

```text
woman_01
product_01
shop_01
speaker_02
```

---

## 12.4 `shotId`

ใช้เมื่อ reference นี้ใช้เฉพาะ shot ใด shot หนึ่ง

---

## 12.5 `positionHint`

เช่น:

```text
viewer-left
viewer-center-right
foreground
background
```

ช่วย Start Frame / blocking analysis

---

## 12.6 `providerUsePolicy`

### `auto`
Adapter ตัดสิน

### `must_use_raw`
ไฟล์ต้องถูกส่ง raw ให้ provider ถ้า provider รองรับ

เช่น:

```text
Voice Reference
Motion Video
Character Ref
```

### `prefer_raw`
อยากส่ง raw แต่ยอม fallback

### `may_derive`
อนุญาตให้แปลงเป็น structured description

เช่น Motion Video → motion description

### `analysis_only`
ใช้ให้ Agent วิเคราะห์เท่านั้น

### `post_only`
ไม่ส่งเข้า AI Video ใช้ใน post production

ตัวอย่าง:

```text
Logo PNG
Exact UI screenshot
CTA artwork
```

---

## 12.7 Video Trim

```json
{
  "trim": {
    "startSeconds": 2,
    "endSeconds": 7
  }
}
```

ใช้เลือกเฉพาะช่วงวิดีโอ reference ที่ต้องการ

---

## 12.8 Embedded Audio

```json
{
  "useEmbeddedAudio": true
}
```

ใช้เมื่อต้องการให้เสียงใน reference video มีความหมายด้วย เช่น:

- voice
- rhythm
- ambience
- dialogue continuity

---

## 12.9 Media Metadata

สามารถเก็บ:

```text
durationSeconds
fileSizeMB
width
height
fps
container
videoCodec
audioCodec
hasAudio
```

เพื่อ preflight provider constraints

---

# 13. Asset Roles และ Reference Purposes

ระบบแยก **Role ของไฟล์** ออกจาก **Purpose ที่ต้องการให้ไฟล์นั้นมีผลต่อการสร้างวิดีโอ**

แนวคิดนี้สำคัญมาก

ตัวอย่าง:

```text
role = video_reference
referencePurposes =
  motion
  camera_motion
  temporal_structure
  audio_continuity
```

วิดีโอไฟล์เดียวจึงทำหน้าที่ได้หลายอย่าง

---

## 13.1 Asset Roles ทั้งหมด

### Product

```text
product_reference
logo
brand_guide
ui_reference
mechanism_reference
```

### Character

```text
character_reference
voice_reference
```

### Scene / Visual

```text
environment_reference
style_reference
start_frame
end_frame
mid_keyframe
```

### Video / Motion

```text
video_reference
motion_reference
camera_reference
source_video
```

### Audio

```text
audio_reference
voice_reference
music_reference
sound_reference
```

### Place / Venue

```text
place_reference
venue_reference
storefront_reference
interior_reference
exterior_reference
signage_reference
menu_reference
service_reference
property_reference
facility_reference
map_reference
```

---

## 13.2 Reference Purposes

### Identity / Product

```text
identity
product_geometry
product_label
brand_source
ui_source
```

### Environment / Place

```text
environment
place_identity
venue_layout
visible_feature
storefront
interior_layout
exterior_architecture
signage
menu
facility
property_layout
location_context
wayfinding
place_atmosphere
```

### Motion / Camera

```text
motion
pose
expression
camera_motion
cut_rhythm
temporal_structure
visitor_flow
service_flow
```

### Keyframe / Structure

```text
storyboard
first_frame
last_frame
mid_keyframe
```

### Audio

```text
voice_timbre
voice_delivery
dialogue_content
music_style
audio_continuity
sound_effect
```

### Other

```text
source_video_edit
source_video_continuation
mechanism_reference
style
```

---

## 13.3 ตัวอย่าง Character + Motion + Voice

```json
{
  "assets": [
    {
      "assetId": "girl_face",
      "role": "character_reference",
      "mediaType": "image",
      "entityId": "girl",
      "referencePurposes": ["identity"],
      "providerUsePolicy": "must_use_raw"
    },
    {
      "assetId": "motion_01",
      "role": "motion_reference",
      "mediaType": "video",
      "entityId": "girl",
      "referencePurposes": [
        "motion",
        "camera_motion"
      ],
      "providerUsePolicy": "prefer_raw"
    },
    {
      "assetId": "voice_01",
      "role": "voice_reference",
      "mediaType": "audio",
      "entityId": "girl",
      "referencePurposes": [
        "voice_timbre",
        "voice_delivery"
      ],
      "providerUsePolicy": "must_use_raw"
    }
  ]
}
```

---

# 14. Character / Cast

Cast Schema:

```json
{
  "characterId": "woman_01",
  "displayName": "พิมพ์ชนก",
  "role": "presenter",
  "referenceAssetIds": ["woman_ref"],
  "requiredOnScreen": true,
  "notes": "พูดด้วยน้ำเสียงเป็นธรรมชาติ"
}
```

---

## 14.1 `characterId`

เป็น ID ภายในระบบ

ควรคงเดิมตลอด project

เช่น:

```text
woman_01
child_01
grandfather_01
```

---

## 14.2 `referenceAssetIds`

ตัวละครหนึ่งคนสามารถมีหลาย reference เช่น:

```text
front face
3/4 face
full body
outfit reference
voice reference
motion reference
```

---

## 14.3 หลายตัวละครใน Start Frame

ระบบต้องทำ:

```text
Detect visible people
↓
Match with Cast
↓
Confirm positions
↓
Lock identity
↓
Lock speaker mapping
```

ตัวอย่าง:

```text
Character A = viewer-left
Character B = viewer-center
Character C = background-right
```

ห้ามสลับคนระหว่าง shot โดยไม่มีเหตุผล

---

# 15. Dialogue / Voice / Lip Sync

Dialogue Schema:

```text
mode
language
allowAgentToDraft
lines[]
```

---

## 15.1 Dialogue Mode

### `auto`

ระบบเลือกเองจาก Idea

ถ้า Idea บอก:

```text
ยืนบรรยายสินค้า
```

ระบบมีแนวโน้มใช้ dialogue

ถ้า Idea บอก:

```text
สาธิตแบบไม่มีบทพูด
```

ระบบควรเลือก silent

---

### `none`

ไม่มี dialogue

---

### `user_supplied`

ผู้ใช้ให้บทพูดเอง

เหมาะกับงาน production ที่คำพูดต้องเป๊ะ

---

### `agent_draft`

ให้ Agent เขียนบทพูด

---

## 15.2 Dialogue Line

ตัวอย่าง:

```json
{
  "lineId": "L01",
  "speakerId": "woman_01",
  "text": "รุ่นนี้จับถนัดมือและหน้าจอดูสบายตาค่ะ",
  "exactText": true,
  "mustBeOnScreen": true,
  "lipSyncRequired": true,
  "shotId": "S02",
  "timingHint": "พูดหลังยกโทรศัพท์ขึ้นระดับอก"
}
```

---

## 15.3 `exactText`

ถ้า `true`

Prompt Engineer ห้าม rewrite ข้อความ

สำคัญกับ:

- Brand script
- Legal statement
- โปรโมชั่น
- Product name
- Dialogue ที่ approve แล้ว

---

## 15.4 `mustBeOnScreen`

ถ้า `false`

สามารถเป็น Voice-over

---

## 15.5 `lipSyncRequired`

ถ้า `false`

สามารถ:

- voice-over
- off-screen dialogue
- background voice

ได้

---

## 15.6 Dialogue กับ Action ต้องไม่แย่งกัน

ตัวอย่างไม่ดี:

```text
8 วินาที
- เปิดกล่อง
- หยิบสินค้า
- หมุนสินค้า
- เปิดแอป
- โชว์ feature
- พูด 3 ประโยค
```

เสี่ยง overload

Agent ควร:

```text
split shot
หรือ
ย้ายคำอธิบายเป็น VO
หรือ
ลด action
```

---

## 15.7 Multi-speaker

Speaker Map ต้องคงที่:

```text
woman_01 = Speaker 1
man_01   = Speaker 2
child_01 = Speaker 3
```

Provider-specific compiler เช่น H3 จะ map เป็น:

```text
(S1)
(S2)
(S3)
```

โดยไม่เปลี่ยนคนกลางเรื่อง

---

# 16. Product Context และข้อมูลสินค้า

`product` เป็น optional

หากมีข้อมูล ควรใส่เท่าที่รู้จริง

ตัวอย่าง:

```json
{
  "product": {
    "productId": "phone_x",
    "name": "Example Phone X",
    "brand": "Example",
    "category": "smartphone",
    "description": "สมาร์ทโฟนเน้นกล้องและแบตเตอรี่",
    "features": [
      "กล้องหลัก ...",
      "รองรับ ..."
    ],
    "approvedClaims": [
      "ข้อความที่แบรนด์อนุมัติ"
    ],
    "prohibitedClaims": [
      "ห้ามอ้างว่า..."
    ],
    "requiredVisualProof": [
      "ต้องเห็นหน้าจอ feature X"
    ],
    "sourceOfTruthAssetIds": [
      "phone_front",
      "phone_back"
    ]
  }
}
```

---

## 16.1 `features`

ใช้บอก feature ที่ต้องการสื่อ

ไม่จำเป็นต้องใส่ทุก feature

---

## 16.2 `approvedClaims`

ข้อความที่สามารถพูด/แสดงได้

---

## 16.3 `prohibitedClaims`

เรื่องที่ห้าม Agent แต่งเพิ่ม

แนะนำมากสำหรับงานโฆษณาจริง

---

## 16.4 `requiredVisualProof`

ถ้าบอก:

```text
ต้องเห็นการหมุนถัง
```

ระบบควรวาง shot ที่พิสูจน์สิ่งนั้น

ไม่ควรใช้ dialogue อย่างเดียว

---

## 16.5 `usageInstructions`

เหมาะกับ:

- ครีม
- Cleaning
- Appliance
- Tool
- Food
- Medical-like consumer product

ช่วยป้องกัน AI สาธิตผิดวิธี

---

## 16.6 `mechanismFacts`

เช่น:

```text
drum rotates during wash cycle
airflow exits from the lower vent
vacuum airflow follows intake path
```

ใช้กับ Visual Explanation

---

## 16.7 `supportedUIFlows`

ใช้กับโทรศัพท์ / App / SaaS

เช่น:

```text
Home → Camera → Portrait → Capture
```

ช่วยไม่ให้ AI สร้าง UI flow ขึ้นเอง

---

## 16.8 `targetSurfacesOrSystems`

เช่น:

```text
hair
skin
floor
fabric
indoor air
phone UI
laundry
vehicle surface
```

---

# 17. Product Mechanism & Demonstration

Product branch ไม่ได้คิดแค่ว่า “ถือสินค้าอย่างไร”

แต่สร้าง:

```text
Product Mechanism & Demonstration Model
```

เพื่อเข้าใจ:

```text
คนทำอะไรกับสินค้า
↓
สินค้าทำอะไร
↓
สิ่งไหนมองเห็น
↓
สิ่งไหนมองไม่เห็น
↓
ต้องพิสูจน์อะไร
↓
ต้องใช้ VFX หรือไม่
```

---

## 17.1 ตัวอย่างแชมพู

```text
dispense
↓
deposit to palm
↓
apply to hair
↓
work through hair
↓
rinse
↓
result
```

---

## 17.2 น้ำยาทำความสะอาดพื้น

```text
show dirty area
↓
apply product
↓
wipe / scrub / mop
↓
cleaning interaction
↓
proof
↓
clean result
```

---

## 17.3 เครื่องซักผ้า

```text
load laundry
↓
close
↓
select program
↓
start
↓
drum motion
↓
wash/spin
↓
outcome
```

---

## 17.4 แอร์

```text
power on
↓
unit response
↓
airflow
↓
room comfort
↓
result
```

Airflow มองไม่เห็น จึงอาจต้อง Visual Explanation

---

## 17.5 Smartphone

```text
hold
↓
rotate hardware
↓
tap / swipe
↓
feature use
↓
exact UI
↓
proof
```

UI ที่ต้องอ่านได้ควร Post Composite

---

# 18. Visual Explanation / VFX

ใช้เมื่อ feature หรือ mechanism มองเห็นยาก

ตัวอย่าง Mode:

```text
literal_demo
macro_insert
cutaway
xray_style
exploded_view
particle_flow
airflow_streamlines
thermal_gradient
moisture_flow
cleaning_lift
motion_trace
virtual_screen
ui_composite
feature_callout
before_after
time_compression
data_overlay
```

---

## 18.1 Truth Classification

Effect ทุกตัวควรอยู่ในหนึ่งใน 3 ระดับ

### `literal_observed`

เป็นสิ่งที่เห็นจริงหรือ composite จากข้อมูลจริง

เช่น:

```text
Verified Phone UI
```

---

### `supported_explanatory`

เป็น graphic อธิบายกลไกที่มีข้อมูลรองรับ

เช่น:

```text
Airflow line
Washing drum motion arrow
```

---

### `stylized_illustrative`

เป็นภาพช่วยอธิบายเชิง visual

ไม่ควรสื่อว่าเป็นค่าทางวิทยาศาสตร์จริง

---

## 18.2 Base Plate vs Post Composite

หลักสำคัญ:

> อย่าบังคับ AI Video ให้ทำสิ่งที่ Post Production ทำได้แม่นกว่า

ตัวอย่างโทรศัพท์:

```text
AI Video:
คน + มือ + โทรศัพท์ + camera move

Post:
UI จริง + tracking + reflection + occlusion
```

ตัวอย่างแอร์:

```text
AI Video:
ห้อง + คน + แอร์ + physical motion

Post:
airflow + thermal graphic
```

---

# 19. Start Frame

Start Frame เป็นหนึ่งในข้อมูลสำคัญที่สุด

---

## 19.1 Start Frame Analysis สองระดับ

### Early Semantic Analysis

ทำก่อน Idea Expansion

หา:

- ตัวละครกี่คน
- อยู่ตรงไหน
- สินค้าอะไรปรากฏ
- ฉากแบบไหน
- กำลังทำอะไร
- hand occupancy โดยคร่าว
- interaction context

---

### Detailed Physical Start State

ทำก่อน Motion Planning

หา:

- มือไหนถืออะไร
- pose
- gaze
- body orientation
- product orientation
- camera
- lighting
- exact blocking

---

## 19.2 Authoritative State

ค่า:

```text
startFramePolicy.authoritativeState = true
```

เป็น `true` แบบบังคับใน schema

หมายความว่า shot ต้องเริ่มต่อจากสภาพนั้น

---

## 19.3 `allowNormalize`

อนุญาตให้:

- ปรับ crop
- aspect ratio
- normalize frame
- ทำให้เหมาะกับ provider

แต่ต้องไม่ทำลาย state สำคัญ

---

## 19.4 `allowRegenerate`

ถ้า `false`

ไม่ควรสร้าง Start Frame ใหม่แทนภาพ user โดยอัตโนมัติ

---

## 19.5 preCompletedSteps

ถ้า Start Frame แสดงว่า:

```text
ใส่ผ้าแล้ว
ปิดเครื่องแล้ว
เลือกโปรแกรมแล้ว
```

Demonstration Plan จะ mark:

```text
preCompletedSteps:
- load laundry
- close door
- select program
```

Shot เริ่มจาก:

```text
press Start
```

แทนการย้อนกลับ

---

# 20. End Frame / Mid Keyframe

## 20.1 End Frame

เหมาะกับ:

- ต้องจบ pose เฉพาะ
- product hero
- transition ไป shot ถัดไป
- first/last-frame interpolation

---

## 20.2 Mid Keyframe

ใช้เป็น:

- intermediate composition
- pose guide
- storyboard anchor
- semantic reference

แต่ Provider แต่ละตัวรองรับไม่เหมือนกัน

Skill จะอ่าน Capability Profile ก่อนใช้

---

## 20.3 อย่าบังคับ Mid Frame ถ้า Provider ไม่รองรับ

Adapter อาจเลือก:

```text
use as semantic reference
use as storyboard reference
split generation
route another provider
```

แทน

---

# 21. Multi-shot

Multi-shot มี 3 ความหมายที่ต้องแยก

---

## 21.1 หลาย Logical Shots

เช่น:

```text
S01 Hook
S02 Demo
S03 Feature
S04 Result
S05 Hero
```

แต่ละ shot สร้างแยกกัน

นี่เป็นแบบที่ repair ง่ายที่สุด

---

## 21.2 Provider-native Multi-shot

Provider สร้างคลิปเดียวแต่มีหลาย cut

ตัวอย่าง H3:

```text
[Shot 1]
...

[Shot 2] At 00:05.000,
...

[Shot 3] At 00:10.000,
...
```

---

## 21.3 Extension Chain

Shot เดียวหรือ sequence เดียวถูกต่อหลาย generation turn

เช่น Omni:

```text
Base
↓
Extend 1
↓
Extend 2
↓
Extend 3
```

---

## 21.4 `multiShotStrategy`

### `auto`
ระบบเลือก

### `independent_shots`
แนะนำสำหรับงาน Product ที่ต้องแม่น

### `provider_native_multishot`
เหมาะเมื่อ provider เก่ง multi-shot และต้องการ native audiovisual continuity

### `extension_chain`
เหมาะกับ continuation

### `hybrid`
ผสมกัน

---

# 22. การกำหนดความยาว 8 / 10 / 15 วินาที

Field:

```text
format.shotDurationPolicy
```

---

## 22.1 Auto

```json
{
  "mode": "auto"
}
```

Agent ตัดสินตาม:

- action complexity
- dialogue
- provider
- proof moment
- camera

---

## 22.2 Fixed

```json
{
  "mode": "fixed",
  "fixedSeconds": 10
}
```

ทุก Logical Shot พยายามเป็น 10 วินาที

---

## 22.3 Allowed Values

```json
{
  "mode": "allowed_values",
  "allowedSeconds": [8, 10, 15],
  "preferredSeconds": 10
}
```

เป็น mode ที่เหมาะกับ production มาก

เพราะ Agent สามารถเลือก:

```text
8s สำหรับ Hook
10s สำหรับ Demo
15s สำหรับ Complex action
```

---

## 22.4 Per-shot Custom

แต่ละ shot กำหนดเอง

เหมาะกับ Storyboard ที่ล็อกเวลาแล้ว

---

## 22.5 ระยะเวลาไม่ได้บังคับ Provider โดยตรง

ตัวอย่าง:

```text
Logical shot = 15s
Provider max = 10s
```

Temporal Planner จะเลือก:

```text
extension
split
หรือ route model อื่น
```

---

# 23. Extension Chain และวิดีโอยาว

`extensionPolicy` มี:

```text
mode
targetCumulativeDurationSeconds
preferMinimumTurns
allowPlannedCutsBetweenExtensions
preserveDialogueAcrossTurns
seamReviewWindowSeconds
avoidExactTextAtSeams
```

---

## 23.1 ทำไมต้องมี Prompt Chain

Prompt ต่อวิดีโอไม่ควรเป็น Prompt เดิมซ้ำ

ต้องรู้:

```text
สิ่งที่ทำเสร็จแล้ว
State ปัจจุบัน
Action ต่อไป
Dialogue ที่เหลือ
Camera continuity
End bridge state
```

---

## 23.2 Base Prompt

Base Prompt มี:

```text
Initial Scene
Cast
Product / Place
Start State
Initial Action
Dialogue
Camera
Audio
End Bridge
```

---

## 23.3 Extension Prompt

Extension Prompt มี:

```text
continue from current ending
do not replay completed actions
current state
next action
new dialogue only
camera continuation
continuity locks
next bridge state
```

---

## 23.4 Seam QC

หลัง extension ต้องตรวจ:

- Identity
- Product
- Hand
- Camera
- Motion direction
- Lighting
- Dialogue
- Audio
- UI
- Environment

---

# 24. Model Routing

Field:

```text
modelRouting
```

---

## 24.1 Mode

### `auto`

ระบบเลือก model

### `preferred`

พยายามใช้ model ที่ต้องการก่อน

### `locked`

ห้ามเปลี่ยน model

---

## 24.2 `preferredModels`

เช่น:

```json
[
  "MiniMax-H3",
  "gemini-omni-1.1-flash"
]
```

---

## 24.3 `fallbackModels`

ใช้เมื่อ provider หลักไม่รองรับ capability

---

## 24.4 `allowCrossProviderFallback`

ถ้า `false`

ห้ามเปลี่ยน provider

---

## 24.5 `requireNativeAudio`

ใช้เมื่อจำเป็นต้องสร้างเสียงพร้อมวิดีโอ

---

## 24.6 `requireLipSync`

ใช้กับ Presenter / Dialogue

---

## 24.7 `optimizeFor`

```text
quality
cost
speed
balanced
```

---

## 24.8 Capability Profile

Adapter ไม่ควรเดาความสามารถจากชื่อ model

ต้องอ่าน profile ที่บอก:

```text
duration
resolution
first frame
last frame
reference image
reference video
reference audio
native audio
multi-shot
extension
2K
local
```

---

# 25. MiniMax H3 — คู่มือใช้งานเต็ม

MiniMax H3 เป็น First-class Provider ของ Skill v11

รองรับ:

```text
T2VA
I2VA
L2VA
FL2VA
Ref2VA
Native Audio
Dialogue
Native Multi-shot
Video Editing
Video Continuation
H3 Context-IR
2K
Local H3-Base
```

---

## 25.1 Duration

MiniMax-H3:

```text
4–15 วินาที
integer seconds
```

จึงรองรับโดยตรง:

```text
8s
10s
15s
```

---

## 25.2 H3 Mode

### T2VA

```text
Text → Video + Audio
```

---

### I2VA

```text
Hard First Frame
↓
Video
```

---

### L2VA

```text
Video
↓
Hard Last Frame
```

---

### FL2VA

```text
Hard First Frame
↓
Interpolation / Action
↓
Hard Last Frame
```

---

### Ref2VA

```text
Text
+
Reference Images
+
Reference Videos
+
Reference Audio
↓
Video + Audio
```

---

## 25.3 H3 Reference Limits

H3 Profile ใน Skill กำหนด:

### Images

```text
สูงสุด 9 reference images
```

### Videos

```text
สูงสุด 3 คลิป
แต่ละคลิป 2–15s
รวมไม่เกิน 15s
```

### Audio

```text
สูงสุด 3 คลิป
แต่ละคลิป 2–15s
รวมไม่เกิน 15s
```

---

## 25.4 H3 Reference Semantic Example

```text
<Picture 1> = Product
<Picture 2> = Presenter
<Video 1> = Motion + Camera Reference
<Audio 1> = Presenter Voice
```

---

## 25.5 Hard Frame vs Ref2VA Conflict

ข้อสำคัญ:

```text
first_frame / last_frame
```

กับ:

```text
reference_image
reference_video
reference_audio
```

ไม่ควรถูกส่งรวมกันใน H3 hosted request เดียว

ดังนั้น H3ReferencePlanner เลือกหนึ่งใน 4 ทาง

---

### A. Prefer Hard Start / End

เหมาะเมื่อ:

```text
Start Frame ต้องตรงเป๊ะ
```

Video/Audio refs อาจ:

```text
derive into prompt
หรือ
ไป external audio/lipsync
```

---

### B. Prefer Raw Multimodal

เหมาะเมื่อ:

```text
Motion Ref
Voice Ref
หลายภาพตัวละคร/สินค้า
```

สำคัญกว่าการ lock frame แรกเป๊ะ

Start Frame จะกลายเป็น soft reference

---

### C. Prebake

สร้าง Start Frame ที่รวม:

```text
Character
Product
Environment
Style
```

ให้ถูกก่อน

แล้วค่อยส่งเป็น Hard Frame

---

### D. Split Generation

เมื่อ:

```text
Hard Start
+
Raw Voice
+
Raw Motion
```

สำคัญทั้งหมด

ให้แบ่ง pipeline

---

## 25.6 `providerOptions.minimaxH3`

### Model

```text
MiniMax-H3
MiniMax-H3-Max
```

---

### Execution Route

```text
auto
hosted_api
local_worker
hybrid_local_768p_cloud_2k
```

---

### Reference Strategy

```text
auto
hard_keyframe
full_reference
soft_keyframe_full_reference
derive_references_to_text
prebake_keyframe_then_hard_frame
```

---

### Hard Frame Conflict Policy

```text
auto
prefer_hard_start_end
prefer_raw_multimodal_refs
prebake_then_hard_frame
split_generation
block
```

---

### Context IR

```text
auto
off
official
official_then_validate
```

แนะนำ:

```text
official_then_validate
```

---

### Resolution Workflow

```text
auto
direct_768p
direct_2k
draft_768p_then_regenerate_2k
```

Production แนะนำ:

```text
draft_768p_then_regenerate_2k
```

---

### Native Multi-shot

```text
auto
on
off
```

---

### Native Audio

```text
auto
on
off
```

---

### Dialogue Policy

```text
auto
native
native_try_then_external_fallback
external_lipsync
external_voiceover
```

ภาษาไทยแนะนำ:

```text
native_try_then_external_fallback
```

---

### Continuation

```text
auto
off
reference_video_chain
```

---

## 25.7 H3 Prompt Structure

Base Family:

```text
integrated_multimodal_description:
[Shot 1] ...

[Shot 2] At 00:05.000,
...

overall_soundscape:
...

non_diegetic_music:
...
```

Full Ref2VA:

```text
subject_definitions:
...

summary:
...

retention_analysis:
...

detailed_description:
...

overall_soundscape:
...

non_diegetic_music:
...
```

---

## 25.8 Dialogue H3

```text
(S1) says:
<d>[Thai] ข้อความบทพูด</d>
```

Speaker ID ต้องคงเดิม

---

## 25.9 H3 Native Multi-shot

ตัวอย่าง 15s:

```text
[Shot 1]
0–5s Hook

[Shot 2] At 00:05.000,
5–10s Demo

[Shot 3] At 00:10.000,
10–15s Hero
```

---

## 25.10 H3 40 วินาที

H3 ไม่ถูก model เป็น native append

ใช้:

```text
15s Base
↓
เอา tail 4s
↓
Ref2VA Video Continuation
↓
15s
↓
tail 4s
↓
Ref2VA Video Continuation
↓
10s
```

รวม 40s ใน Post

---

## 25.11 H3 2K Workflow

แนะนำ:

```text
Generate 768P
↓
QC
↓
Repair
↓
Approve
↓
Regenerate 2K
↓
2K Preservation QC
↓
Post
```

---

## 25.12 Local H3

รองรับผ่าน SmartAIHub Worker:

```text
SGLang
vLLM
Diffusers
ComfyUI
```

Recommended:

```text
FL2VA checkpoint
สำหรับ base/hard-frame

Ref2VA checkpoint
สำหรับ raw image/video/audio reference
```

---

## 25.13 Local → Cloud 2K

Workflow:

```text
H3-Base Local 768P
↓
QC
↓
Hosted H3 Regenerate-2K
```

เหมาะกับลดต้นทุน iteration

---

## 25.14 H3-Max

H3-Max ไม่ใช่ H3 แบบเร็วที่ใช้แทนได้ทุกกรณี

เหมาะกับ:

```text
fast T2VA
hard first/last frame drafts
```

ไม่เหมาะเมื่อจำเป็นต้องใช้:

```text
raw Ref2VA image
raw video
raw audio
video continuation
2K
```

---

## 25.15 Thai Dialogue

เพราะคุณภาพภาษาไทยควร QC แยก

Production Flow:

```text
768P Native Thai
↓
ASR Check
↓
Exact Text Check
↓
Speaker Check
↓
Lip Sync Check
↓
PASS?
├─ YES → 2K
└─ NO → External TTS/Lip Sync / VO
```

---

## 25.16 H3 Context-IR

Context-IR ช่วยปรับ Prompt

แต่หลังได้ Prompt กลับมา Skill ต้องตรวจ:

```text
Dialogue เปลี่ยนหรือไม่
Reference label หายหรือไม่
Product claim เปลี่ยนหรือไม่
Shot time ยังถูกหรือไม่
Start/End intent ยังอยู่หรือไม่
```

Canonical state ของ SmartAIHub ต้องเป็น authority สูงกว่า Context-IR

---


# 25A. Grok Imagine Video 1.5 — คู่มือใช้งานเต็ม

Grok Imagine Video 1.5 เป็น First-class xAI provider ตั้งแต่ Skill v8

Model หลัก:

```text
grok-imagine-video-1.5
```

Companion สำหรับ edit/extend ตามเอกสาร xAI ปัจจุบัน:

```text
grok-imagine-video
```

สิ่งสำคัญที่สุดคือต้องแยก 3 mode ของ 1.5 ออกจากกันให้ชัด:

```text
Text-to-Video
Image-to-Video (Start Frame)
Reference-to-Video
```

---

## 25A.1 Duration

```text
1–15 วินาที
```

จึงสร้างได้ตรง ๆ เช่น:

```text
8s
10s
15s
```

---

## 25A.2 Resolution

### Text-to-Video

```text
480p
720p
1080p
```

### Image-to-Video / Start Frame

```text
480p
720p
1080p
```

### Reference-to-Video

```text
480p
720p
```

**Reference-to-Video ไม่รองรับ 1080p**

---

## 25A.3 Aspect Ratio

รองรับ:

```text
1:1
16:9
9:16
4:3
3:4
3:2
2:3
```

สำหรับ Image-to-Video ถ้าไม่ระบุ aspect ratio ระบบ xAI จะอิงภาพต้นฉบับ

ถ้าระบุ ratio ที่ต่างจาก Start Frame อาจทำให้ภาพถูก stretch

Production แนะนำ:

```text
Start Frame
↓
ตรวจ Aspect
↓
ถ้าไม่ตรง Target
→ Normalize / Crop / Pad ใน SmartAIHub ก่อน
↓
Validate
↓
ส่ง Grok
```

---

## 25A.4 Start Frame

ถ้ามี:

```text
role = start_frame
```

ระบบ resolve เป็น:

```text
image_to_video
```

ภาพนั้นคือ **State #0**

Prompt ต้องเริ่มต่อจากสภาพจริง เช่น:

```text
Continue directly from the supplied starting image as literal frame 0.
Do not replay actions already completed in the image.
```

ควร lock:

```text
face
wardrobe
product
hands
object position
environment
lighting
camera framing
```

---

## 25A.5 Reference-to-Video

Grok 1.5 รองรับ Reference Images สูงสุด:

```text
7 ภาพ
```

Skill map เป็น:

```text
<IMAGE_1>
<IMAGE_2>
...
<IMAGE_7>
```

ตัวอย่าง:

```text
<IMAGE_1> = Presenter
<IMAGE_2> = Product
<IMAGE_3> = Shop / Venue
```

Reference มีหน้าที่ช่วย:

```text
identity
product geometry
clothing
place identity
style
```

แต่ **ไม่ใช่ Start Frame**

ดังนั้น composition เปิดคลิปอาจต่างจาก reference ได้

---

## 25A.6 Preset Voice Reference

Reference-to-Video รองรับ preset voice สูงสุด:

```text
3 voices
```

ใช้ label:

```text
<AUDIO_0>
<AUDIO_1>
<AUDIO_2>
```

ตัวอย่าง:

```text
The presenter from <IMAGE_1>
speaks with the voice from <AUDIO_0>
and says exactly:
“...”
```

User-uploaded custom voice reference ต้องมี entitlement จาก xAI สำหรับ trusted partner

ถ้าไม่มี:

```text
external TTS
external lip sync
voice-over
```

แทน

---

## 25A.7 Start Frame + References — ห้ามรวมตรง ๆ

กรณี:

```text
Start Frame
+
Character Ref
+
Product Ref
```

ไม่สามารถส่งเป็น:

```text
image
+
reference_images
```

ใน request เดียวได้

ตั้งแต่ v8 และยังคงใช้ใน v10:

```text
startReferenceConflictPolicy
```

ตัวเลือก:

### `prefer_start_frame`

ใช้ Start Frame เป็นหลัก

Reference อื่นถูกแปลงเป็น:

```text
identity guidance
product guidance
place guidance
post reference
```

เหมาะเมื่อ Start Frame มีทุกอย่างถูกต้องอยู่แล้ว

---

### `prefer_references`

ใช้ Reference-to-Video

Start Frame จะเป็นเพียง soft visual reference

เหมาะเมื่อ:

```text
character/product consistency
```

สำคัญกว่าการเปิดคลิปตรง Start Frame เป๊ะ

---

### `prebake_start_frame`

แนะนำมากสำหรับ Production

```text
Original Start Frame
+
Character Ref
+
Product Ref
+
Place Ref
↓
Image Composite / Image Generation
↓
Validated New Start Frame
↓
Grok Image-to-Video
```

ตัว video request จะไม่ถูกส่งจนกว่า prebaked frame จะเสร็จและผ่าน QC

---

### `split_generation`

ใช้หลาย stage

เหมาะเมื่อ:

```text
Exact Start
+
Raw reference requirement
```

สำคัญพร้อมกัน

---

### `block`

ไม่ยอมลด requirement

---

## 25A.8 Video Reference

ถ้า SmartAIHub มี:

```text
motion_reference = video
camera_reference = video
```

อย่านำไปส่งเป็น Grok `reference_images`

Grok 1.5 reference mode ไม่ใช่ raw video-reference mode

Default:

```text
Video Ref
↓
Analyze
↓
Motion Description
Camera Description
Rhythm / Temporal Guidance
↓
Prompt
```

ถ้า `must_use_raw`:

```text
fallback provider
หรือ
block
```

ถ้า video นั้นเป็น source สำหรับแก้/ต่อวิดีโอจริง ให้พิจารณา companion model:

```text
grok-imagine-video
```

---

## 25A.9 Native Audio

วิดีโอมี audio โดย default

ถ้าต้องการเงียบ:

```json
{
  "generateAudio": "off"
}
```

ถ้ามี Reference Voice ห้ามปิด audio

---

## 25A.10 Multi-shot

ใน profile v11 ยัง **ไม่ถือว่า Grok 1.5 มี provider-native multi-shot contract ที่ verify แล้ว**

Production แนะนำ:

```text
independent_shots
```

เช่นโฆษณา 30 วินาที:

```text
10s Hook
10s Demo
10s Hero
```

แต่ละ shot สามารถเลือก Start Frame หรือ Reference mode แยกกันได้

นี่ช่วยให้ repair ง่ายกว่าการยัดทุกอย่างในคลิปเดียว

---

## 25A.11 xAI Edit / Extend

การแก้และต่อวิดีโอตาม official workflow ปัจจุบันใช้ companion:

```text
grok-imagine-video
```

### Edit

```text
input video <= 8.7s
output duration/aspect follows input
resolution capped at 720p
```

### Extend

```text
source video = 2–15s
extend = 2–10s
output inherits source aspect/resolution
resolution capped at 720p
```

สำคัญ:

> อย่าเรียกความสามารถนี้ว่า “Grok 1.5 native extension”

และอย่าสร้าง multi-turn chain แบบไม่จำกัด

Skill v11 ระบุว่า companion extension เป็น **single-turn constrained workflow**

---

## 25A.12 Provider Options

ตัวอย่าง:

```json
{
  "providerOptions": {
    "grokImagineVideo15": {
      "mode": "auto",
      "startReferenceConflictPolicy": "auto",
      "resolution": "auto",
      "startFrameAspectPolicy": "normalize_before_generation",
      "generateAudio": "auto",
      "referenceImagePolicy": "quality_first",
      "videoReferencePolicy": "derive_to_prompt",
      "customVoicePolicy": "external_fallback",
      "preferIndependentShots": true,
      "allowCompanionEditExtendModel": true
    }
  }
}
```

---

## 25A.13 Preset Voice Mapping

```json
{
  "presetVoiceMappings": [
    {
      "speakerId": "presenter",
      "voiceId": "eve"
    }
  ]
}
```

Prompt compiler จะ map:

```text
presenter
→
<AUDIO_0>
```

---

## 25A.14 ตัวอย่าง Product Tie-in พร้อม Reference

Assets:

```text
Character Image
Product Image
Venue Image
```

ไม่มี Start Frame

Route:

```text
Reference-to-Video
```

Bindings:

```text
<IMAGE_1> Presenter
<IMAGE_2> Product
<IMAGE_3> Venue
```

Resolution:

```text
สูงสุด 720p
```

---

## 25A.15 ตัวอย่าง Start Frame + Product Ref

Assets:

```text
Start Frame
Product Packshot
Character Reference
```

Production recommendation:

```text
prebake_start_frame
```

เพราะต้องรวม product/identity ให้ถูกใน frame แรกก่อน

จากนั้น:

```text
Validated Start Frame
↓
Grok I2V 1080p
```

---

## 25A.16 Grok QC

ตรวจ:

```text
Start Frame Adherence
Start State Continuity
Reference Retention
Reference Binding
Character Identity
Product / Place Identity
Hand-object Physics
Native Audio Sync
Dialogue Exactness
Lip Sync
Aspect Integrity
Resolution Mode
```

---


# 26. Gemini Omni 1.1 Flash Extension

Omni 1.1 Flash ใน Skill ถูกออกแบบให้เด่นด้าน:

- Short video generation
- Reference-to-video
- Video editing
- First/last interpolation
- Continuation / extension
- Native audio
- Prompt chain

Capability Profile ปัจจุบันใน package ระบุ base output:

```text
3–10 วินาที
```

และ extension:

```text
เพิ่มครั้งละ 3–10 วินาที
รวมสูงสุด 40 วินาที
```

---

## 26.1 Omni เหมาะเมื่อใด

เหมาะกับ:

```text
ต้องการต่อวิดีโอจากผลก่อนหน้า
ต้องการ sequence ต่อเนื่อง
ต้องการ edit/continue
ต้องการ first/last interpolation
```

---

## 26.2 ตัวอย่าง 40 วินาที

ตัวอย่างแผน:

```text
Base 8s
↓
Extend +8s
= 16s
↓
Extend +8s
= 24s
↓
Extend +8s
= 32s
↓
Extend +8s
= 40s
```

Temporal Planner ต้องเก็บ:

```text
plannedDuration
requestedDuration
actualDuration
```

แยกกัน

---

## 26.3 Local vs Global Timeline

สมมุติ extension รอบที่ 3 อยู่ global:

```text
24–32s
```

แต่ Prompt ของ extension เองอาจต้องคิดเวลา local:

```text
0–8s
```

ดังนั้นระบบเก็บทั้ง:

```text
globalStart / globalEnd
local extension timeline
```

---

## 26.4 Extension Prompt ไม่ควร Replay

ทุก turn ต้องมี:

```text
completed actions
current character state
current product/place state
remaining beats
dialogue already spoken
new dialogue only
```

---

## 26.5 หลีกเลี่ยง Exact Text ที่ Seam

ค่า:

```text
avoidExactTextAtSeams = true
```

เหตุผล:

- transition อาจเปลี่ยน frame บางส่วน
- UI / Logo / Text มีโอกาสเพี้ยน
- dialogue boundary อาจไม่เนียน

ควรวาง exact visual text กลาง segment หรือ Post Composite

---

# 27. Wan 3.0 / FLUX 3 / Seedance 2.0–2.5 / Veo / Kling / Hailuo

v9 ยกระดับ **Wan 3.0, FLUX 3 และ Seedance 2.0/2.5** ให้เป็น First-class Provider แบบเดียวกับ H3 และ Grok แล้ว

ความแตกต่างสำคัญคือ Skill จะไม่ใช้คำว่า “Reference” แบบความหมายเดียวกับทุกโมเดล เพราะ Provider แต่ละรายตีความ media reference ต่างกันมาก

---

## 27.1 Capability Matrix สำหรับงาน Commercial

| Provider | Direct Duration | Start Frame | Last Frame | Image Ref | Video/Motion Ref | Audio Ref | Native Audio | Multi-shot | Long-form / Continue |
|---|---:|---|---|---|---|---|---|---|---|
| **Wan 3.0** | 2–30s | ✓ | ✓ | ✓ 10 | ✓ 5 | ✓ 5 | ✓ | ✓ timestamped | Edit/extend แบบ bounded |
| **FLUX 3 Video** | 5–20s | ✓ keyframe | ✓ keyframe | △ literal keyframe / prebake | △ V2V continuation | ✗ arbitrary raw audio ref | ✓ | ✓ multi-scene | V2V 5–15s segment |
| **Seedance 2.0** | 4–15s | ✓ | ✓ | ✓ 9 | ✓ 3 | ✓ 3 | ✓ | ✓ | Edit/extend |
| **Seedance 2.5** | 4–30s | ✓ | ✓ | ✓ 30 | ✓ 10 | ✓ 10 | ✓ | ✓ | Multi-round extension |
| **LTX 2.5 Cloud** | Fast 6–20s / Pro 6–10s | ✓ | ✓ | △ prebake/local IC-LoRA | ✗ cloud raw generic video ref | △ one exact A2V soundtrack | ✓ | ✓ native prose multi-shot | Cloud 2.5 ไม่มี Extend; local conditional |
| **Veo 3.1** | ตาม current profile | ✓ | ✓ | ตาม adapter/profile | ตาม adapter/profile | native audio workflow | ✓ | Provider-dependent | Capability profile |
| **Kling** | ตาม current profile | ✓ | Provider-dependent | Provider-dependent | Provider-dependent | Provider-dependent | รุ่นที่รองรับ | Provider-dependent | Fail closed |
| **Hailuo** | ตาม current profile | ✓ | Provider-dependent | Provider-dependent | Provider-dependent | Provider-dependent | Provider-dependent | Provider-dependent | Fail closed |

> ตารางนี้อธิบาย **SmartAIHub production semantics** ไม่ได้หมายความว่า API field ของแต่ละ Provider ใช้ชื่อเดียวกัน

---

# 27A. Wan 3.0

Models:

```text
wan3.0-video
wan3.0-video-prime
```

`wan3.0-video-prime` ใช้ capability family เดียวกัน แต่เน้นความเร็วสูงกว่า

---

## 27A.1 ทำไม Wan 3.0 เหมาะกับ Skill นี้มาก

Wan 3.0 รองรับองค์ประกอบที่ SmartAIHub มีอยู่แล้วแทบตรงตัว:

```text
Idea
Start Frame
End Frame
Character Images
Product Images
Place Images
Motion Video
Camera Video
Voice Audio
Music Audio
Document
Web Link
Dialogue
```

จึงเหมาะกับ:

- Product Tie-in
- Product Demonstration
- Place Review
- Presenter
- Multi-character
- Motion-reference-heavy advertisement
- Native audiovisual storytelling
- Commercial 20–30 วินาทีใน generation เดียว

---

## 27A.2 Duration

Wan รองรับ:

```text
2–30 วินาที
```

หรือให้ Provider เลือกด้วย:

```text
smart duration
```

สำหรับ SmartAIHub Production แนะนำ:

```text
8s
10s
15s
20s
24s
30s
```

ตาม complexity ของ action และ dialogue

---

## 27A.3 Resolution

```text
480P
720P
1080P
```

ถ้า optimize for quality:

```text
1080P
```

แต่ก่อนส่ง generation ควรตรวจ reference และ budget ก่อน

---

## 27A.4 Start Frame

กรณีมี:

```text
role = start_frame
```

Wan ใช้เป็น hard first frame

Skill ถือเป็น:

```text
State #0
```

ดังนั้น Prompt ต้อง:

- ต่อ action จากภาพ
- ไม่ replay สิ่งที่เกิดไปแล้ว
- รักษา character
- รักษา product state
- รักษา hand occupancy
- รักษา camera/framing
- รักษา lighting

---

## 27A.5 First + Last Frame

Wan รองรับการกำหนด:

```text
First Frame
+
Last Frame
```

เหมาะกับ:

- product reveal
- pose transition
- transition ไป shot ถัดไป
- action ที่ต้องจบ state เฉพาะ
- scene bridge

---

## 27A.6 Wan Multimodal Reference

จำนวนสูงสุดที่ Skill ตรวจ:

```text
Reference Image  = 10
Reference Video  = 5
Reference Audio  = 5
Document         = 1
Web Link         = 1

รวมทั้งหมด       = 20 materials
```

Reference Video:

```text
1–15s ต่อคลิป
รวม <=15s
```

Reference Audio:

```text
1–15s ต่อคลิป
รวม <=15s
```

---

## 27A.7 Reference Labels

Prompt Compiler ใช้:

```text
Image 1
Image 2
Video 1
Video 2
Audio 1
File 1
Link 1
```

แต่ละ media type นับแยกกัน

ตัวอย่าง:

```text
Image 1 = Presenter identity
Image 2 = Product geometry
Image 3 = Store identity

Video 1 = hand/body demonstration motion
Video 2 = camera movement

Audio 1 = presenter voice
```

---

## 27A.8 Wan รองรับ Raw Motion Reference จริง

ถ้า SmartAIHub มี:

```text
motion_reference.mp4
camera_reference.mp4
```

Wan สามารถใช้เป็น raw reference video ได้

ต่างจาก Grok 1.5 และ FLUX 3 public API ที่ต้อง derive หรือใช้ continuation semantics

ดังนั้น Wan เหมาะมากเมื่อ Idea เช่น:

```text
ให้ผู้หญิงถือสินค้าตามภาพ
แล้วทำท่าทางตามวิดีโออ้างอิง
กล้องเคลื่อนเหมือนวิดีโออ้างอิง
พร้อมใช้เสียงอ้างอิง
```

---

## 27A.9 Hard Frame กับ Multimodal Reference ห้ามผสมตรง ๆ

ข้อสำคัญ:

```text
first_frame / last_frame
```

และ:

```text
reference_image
reference_video
reference_audio
file
link
```

เป็นคนละ raw request family

Skill จะไม่ส่งรวมกันโดยไม่ตรวจ

มี policy:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

---

### ตัวอย่าง — Start Frame + Character/Product Ref

เหมาะกับ:

```text
prebake_hard_frame
```

Flow:

```text
Original Start Frame
+
Character Ref
+
Product Ref
↓
สร้าง Start Frame ใหม่ที่ถูกต้อง
↓
Identity / Product / Composition QC
↓
Wan hard first-frame generation
```

---

### ตัวอย่าง — Start Frame + Raw Motion Video + Raw Voice

ถ้า motion และ voice ต้องถูกส่ง raw:

```text
split_generation
```

ปลอดภัยกว่าการพยายามยัดทุกอย่างใน request เดียว

---

## 27A.10 Video Input + Output ต้องไม่เกิน 30 วินาที

นี่เป็น Preflight สำคัญ

ถ้ามี raw reference video:

```text
รวม duration ของ input videos
+
requested output duration
<= 30s
```

ตัวอย่าง:

```text
Motion Ref = 12s
Camera Ref = 3s
Output     = 20s

12 + 3 + 20 = 35s
→ BLOCK
```

ระบบต้องตรวจ **ก่อนหักเครดิต / ก่อนส่ง Paid Job**

---

## 27A.11 Wan Native Multi-shot

Wan เหมาะกับ 30s Commercial แบบ one-pass

ตัวอย่าง:

```text
00:00–00:05 Hook
00:05–00:10 Product setup
00:10–00:15 Demonstration
00:15–00:20 Proof
00:20–00:25 Lifestyle result
00:25–00:30 Hero / CTA
```

Prompt Compiler ใช้ timeline จริง

โดยทั่วไป shot ละประมาณ:

```text
4–6 วินาที
```

จะเหมาะกับการเล่าเรื่องแบบ Multi-shot

---

## 27A.12 Wan Document / Web Context

รองรับ:

```text
document_reference
web_reference
```

เหมาะกับ:

- product document
- specification
- venue info
- service details
- article/report

แต่:

```text
Document Context
≠
Approved Advertising Claim
```

ข้อมูลที่กลายเป็น claim ยังต้องผ่าน:

```text
Research / Claim Gate
```

---

## 27A.13 Video Editing

ถ้ามี Source Video:

```text
reference_video
+
editing intent
```

Prompt ควรชัดว่า:

```text
แก้อะไร
ช่วงไหน
อะไรต้องคงเดิม
```

เช่น:

```text
เปลี่ยนเฉพาะสีเสื้อ
ห้ามเปลี่ยนหน้า
ห้ามเปลี่ยนสินค้า
ห้ามเปลี่ยน camera path
```

---

## 27A.14 Video Extension

Wan สามารถ extend จาก video reference

แต่ Skill จะ **ไม่คิดเป็น Omni unlimited chain**

เพราะยังมี:

```text
input video + output <= 30s
```

ดังนั้น extension เป็น bounded operation

---

## 27A.15 Wan Production Preset

```json
{
  "providerOptions": {
    "wan3": {
      "model": "wan3.0-video",
      "mode": "auto",
      "hardFrameReferenceConflictPolicy": "auto",
      "resolution": "1080P",
      "ratio": "adaptive",
      "durationPolicy": "exact",
      "promptExtend": true,
      "generateAudio": "auto",
      "referenceBudgetPolicy": "quality_first",
      "extensionDirection": "forward"
    }
  }
}
```

---

# 27B. FLUX 3 Video

Model:

```text
flux-3-video
```

FLUX 3 ต้องทำความเข้าใจแตกต่างจาก H3/Wan/Seedance อย่างชัดเจน

---

## 27B.1 กฎสำคัญที่สุดของ FLUX 3

ภาพ I2V ของ FLUX 3 public API เป็น:

> **Literal Keyframe ของ timeline**

ไม่ใช่ soft reference

ดังนั้นภาพ:

```text
Character Portrait
Product Packshot
Venue Photo
```

ไม่ได้หมายความว่าจะส่งเข้า FLUX แล้วบอกว่า “เอาแค่ identity”

เพราะ Provider อาจตีความภาพนั้นเป็น frame จริงในคลิป

---

## 27B.2 FLUX Modes

```text
t2v
i2v
v2v
draft_enhance
```

### T2V

Prompt → video

### I2V

Prompt + keyframe(s) → video

### V2V

existing `start_video` → continuation

### Draft Enhance

selected draft → same take at full quality

---

## 27B.3 Duration

T2V / I2V:

```text
5–20s
```

V2V:

```text
5–15s output
```

---

## 27B.4 Resolution

```text
hd
fhd
```

FHD ผ่าน provider upsampling/finalization pipeline

---

## 27B.5 Start Frame

ภาพเดียวที่เวลา:

```text
0s
```

คือ exact Start Frame

ตัวอย่าง concept:

```text
keyframes:
  Start Frame at 0s
```

---

## 27B.6 First + Last Frame

ถ้า logical shot = 10s:

```text
Start Frame @ 0s
End Frame   @ 10s
```

FLUX จะใช้เป็น literal pinned endpoints

---

## 27B.7 Timed Keyframes

รองรับสูงสุด:

```text
10 keyframes
```

เช่น:

```text
0s  = Start
3s  = hand reaches product
6s  = product use
10s = Hero
```

นี่เป็นความสามารถที่เหมาะมากกับ storyboard-driven workflow

แต่ทุกภาพต้องตั้งใจให้เป็น **frame จริงในวิดีโอ**

---

## 27B.8 แล้ว Character / Product Reference ทำอย่างไร?

ถ้ามี:

```text
Character Ref
Product Packshot
Place Ref
```

แต่ไม่ต้องการให้ภาพเหล่านั้นกลายเป็น exact timeline frame

Production default:

```text
prebake_keyframe
```

Flow:

```text
Character Ref
+
Product Ref
+
Scene
↓
สร้าง Approved Shot Keyframe
↓
Visual Identity QC
↓
FLUX I2V
```

ทางเลือก:

```text
derive_to_prompt
fallback_provider
block
```

---

## 27B.9 FLUX Omni Reference

ใน Skill v11 **ยังไม่ถือว่า current public FLUX 3 รองรับ generic Omni Reference**

ดังนั้นห้ามเขียน capability ว่า:

```text
Character Ref Image
→ direct soft identity reference
```

ถ้า BFL เปิด Omni Reference เป็น public API ในอนาคตค่อยอัปเดต capability profile

---

## 27B.10 Motion Video Reference

ถ้ามี:

```text
motion_reference.mp4
```

แต่คลิปนั้นไม่ใช่ source ที่ต้องต่อจริง

default:

```text
Video Analysis
↓
Motion Description
Camera Description
↓
FLUX Prompt
```

ถ้า raw motion reference ต้องเป็น mandatory:

```text
fallback provider
```

เช่น:

```text
Wan
H3
Seedance
```

---

## 27B.11 V2V Continuation

ถ้า Video เป็น continuation source จริง:

```text
Previous Approved Clip
↓
เอา tail <=4s
↓
FLUX V2V
↓
New 5–15s Segment
↓
Seam QC
↓
External Assembly
```

สิ่งที่ควร carry:

```text
face
wardrobe
product
position
motion direction
camera motion
dialogue state
audio environment
completed actions
remaining beats
```

---

## 27B.12 Native Audio

FLUX 3 รองรับ:

- dialogue
- effects
- ambience
- synchronized audio

จึงใช้กับ presenter/creative commercial ได้ดี

---

## 27B.13 Multi-scene

FLUX รองรับ multiple scenes / camera angles

แต่ Skill **ไม่สร้างข้ออ้างว่า Provider มี H3-style exact timestamp cut syntax**

ดังนั้น:

```text
Shot 1
Shot 2
Shot 3
```

จะเป็น ordered creative progression

ถ้าต้องการ exact temporal visual anchor:

```text
ใช้ Timed Keyframes
```

---

## 27B.14 Draft → Enhance

Production workflow ที่น่าสนใจมาก:

```text
draft=true
↓
สร้าง Preview
↓
เลือก take ที่ดีที่สุด
↓
QC
↓
เก็บ draft_cache
↓
draft_enhance
↓
Full-quality version ของ take เดิม
```

ข้อดี:

> ไม่ต้องเสี่ยงให้ full render รอบใหม่เปลี่ยน acting/camera/composition จาก draft ที่ชอบแล้ว

---

## 27B.15 Upscale

หลัง final content ผ่าน:

```text
HD/FHD
↓
Content QC
↓
Dialogue QC
↓
Keyframe QC
↓
FLUX Video Upscale
↓
2K / 4K ตาม workflow
```

---

## 27B.16 FLUX Production Preset

```json
{
  "providerOptions": {
    "flux3": {
      "mode": "auto",
      "resolution": "fhd",
      "aspectRatio": "auto",
      "keyframeStrategy": "auto",
      "softReferencePolicy": "prebake_keyframe",
      "draftWorkflow": "draft_then_enhance",
      "generateAudio": "auto",
      "continuationTailSeconds": 4,
      "postUpscale": "auto",
      "safetyTolerance": 2,
      "version": "latest"
    }
  }
}
```

---

# 27C. Seedance 2.0 และ 2.5

อย่าเลือกเพียงคำว่า:

```text
Seedance
```

โดยไม่รู้ version

เพราะ 2.0 กับ 2.5 มีจุดเด่นคนละแบบ

---

## 27C.1 เปรียบเทียบแบบ Production

| รายการ | Seedance 2.0 | Seedance 2.5 |
|---|---:|---:|
| Direct clip | 4–15s | 4–30s |
| Max resolution ใน current BytePlus route | 4K | 720p |
| Image refs | 9 | 30 |
| Video refs | 3 | 10 |
| Audio refs | 3 | 10 |
| Audio-only ref | ไม่ได้ | ได้ |
| Raw motion/camera ref | ได้ | ได้ / enhanced |
| Start Frame | ได้ | ได้ |
| Start + Last | ได้ | ได้ |
| Edit | ได้ | ได้ / enhanced |
| Extension | ได้ | Multi-round |
| Clay/white-model control | จำกัดกว่า | เด่น |
| เหมาะกับ | High-res short commercial | 20–30s reference-heavy story |

---

# 27D. Seedance 2.0

Model ID:

```text
dreamina-seedance-2-0-260128
```

---

## 27D.1 Duration

```text
4–15s
```

เหมาะกับ:

- 8s social
- 10s product demo
- 15s hero shot
- independent commercial shots

---

## 27D.2 Resolution

```text
480p
720p
1080p
4K
```

แต่มีข้อสำคัญ:

```text
Reference Image scenario
+
1080p
→ ไม่รองรับ
```

ดังนั้น Adapter จะ reject ก่อนส่ง

---

## 27D.3 Reference Limits

```text
Images = 9
Videos = 3
Audios = 3
```

Video:

```text
2–15s แต่ละคลิป
รวม <=15s
```

Audio:

```text
2–15s แต่ละคลิป
รวม <=15s
```

---

## 27D.4 Audio-only Reference

Seedance 2.0:

```text
Audio Ref อย่างเดียว
→ BLOCK
```

ต้องมี:

```text
Image
หรือ
Video
```

ร่วมด้วย

---

# 27E. Seedance 2.5

Model ID:

```text
dreamina-seedance-2-5-260628
```

---

## 27E.1 Duration

```text
4–30s
```

นี่ทำให้เหมาะกับ:

- product commercial 30s
- place review
- multi-character tie-in
- one-pass narrative
- long demonstration

---

## 27E.2 Resolution

Current BytePlus route:

```text
480p
720p
```

ดังนั้นอย่า route 2.5 ไป:

```text
1080p
4K
```

โดยอัตโนมัติ

---

## 27E.3 Reference Budget

Seedance 2.5 รองรับ reference จำนวนมาก:

```text
30 Images
10 Videos
10 Audios
```

เหมาะกับ SmartAIHub project ที่มี:

- หลายตัวละคร
- หลาย product angles
- location refs
- motion refs
- voice refs
- audio refs

---

## 27E.4 Audio-only Reference

2.5 รองรับ

ดังนั้น:

```text
Voice / Music / Sound Reference
```

สามารถใช้เป็น reference โดยไม่ต้องมี Image/Video

---

## 27E.5 Motion / Camera Reference

นี่เป็นจุดแข็ง

เช่น:

```text
Character Image
+
Product Image
+
Motion Video
+
Camera Video
+
Voice Audio
```

Seedance 2.5 เหมาะกับชุด input แบบนี้มาก

---

## 27E.6 Clay / White-model Reference

2.5 สามารถใช้ reference สำหรับ:

- Blocking
- Trajectory
- Camera
- Spatial planning

เหมาะกับ production ที่ต้องการวางท่าทางก่อน render final

SmartAIHub เพิ่ม role:

```text
clay_render_reference
```

และ purpose:

```text
clay_render
blocking_reference
trajectory_reference
```

---

## 27E.7 Timestamp Storytelling

ตัวอย่าง 30s:

```text
00:00–00:06 Hook
00:06–00:12 Product Setup
00:12–00:20 Demonstration
00:20–00:26 Result
00:26–00:30 Hero / CTA
```

ใช้ได้ดีกับ:

- advertising
- product review
- place review
- multi-character storytelling

---

## 27E.8 Hard Start Frame + References

ตรงนี้ Skill v11 ตั้งใจ **ไม่เดา**

ถึงเอกสารจะระบุว่ามีทั้ง:

```text
First Frame
First + Last
Multimodal Reference
```

แต่ถ้า endpoint ที่ใช้จริงยังไม่ได้ verify ว่าสามารถผสม raw ได้:

```text
directHardFrameReferenceMixVerified = false
```

default

จากนั้นใช้:

```text
prefer_hard_frames
prefer_references
prebake_hard_frame
split_generation
block
```

---

## 27E.9 Start Frame + Product/Character Ref

Production default ที่ดี:

```text
prebake_hard_frame
```

เหมือนกับ Grok/Wan เมื่อ provider mode ทำให้ exact hard frame กับ refs ไม่ควรถูกผสมโดยไม่มี contract

---

## 27E.10 Start Frame + Raw Motion + Raw Voice

ถ้าทั้ง motion และ voice ต้องส่ง raw:

```text
split_generation
```

หรือใช้ direct mix ก็ต่อเมื่อ connector/endpoint ถูก verify จริง

---

# 27F. BytePlus Real-human Material Library

นี่เป็น requirement สำคัญเมื่อใช้ Seedance ผ่าน BytePlus

ถ้า reference image/video มีใบหน้าคนจริง:

```text
containsRealHumanFace = true
```

Skill จะตรวจ:

```text
materialLibraryApproved
materialLibraryAssetId
```

ถ้ายังไม่มี:

```text
BLOCK provider submission
```

เมื่อผ่าน:

```text
asset://<ASSET_ID>
```

จึงถูกใช้แทน direct raw URL

---

## 27F.1 ตัวอย่าง Provider Hint

```json
{
  "providerHints": {
    "byteplus": {
      "containsRealHumanFace": true,
      "materialLibraryApproved": true,
      "materialLibraryAssetId": "approved_asset_xxx"
    }
  }
}
```

---

# 27G. Seedance 2.5 Extension

Current conservative SmartAIHub profile ใช้:

```text
Base <=30s
+
Extension 1 <=30s
+
Extension 2 <=30s
```

ดังนั้นหนึ่ง bounded chain:

```text
สูงสุดประมาณ 90s
```

ในรูปแบบ full 30s segments

ทุก turn ต้องเก็บ:

```text
State Ledger
Completed Actions
Remaining Beats
Last Frame
Character State
Product State
Camera State
Dialogue State
Audio State
```

และทำ:

```text
Segment QC
+
Seam QC
```

---

## 27G.1 ตัวอย่าง 90s

```text
Segment 0
0–30s

Segment 1
30–60s

Segment 2
60–90s
```

ไม่ควรคิดว่า:

```text
สร้างได้ไม่จำกัด
```

แม้ marketing wording จะพูดถึง multi-round extension ก็ตาม

SmartAIHub เลือก limit ที่ conservative ตาม current model contract

---

## 27H. Seedance Production Preset

```json
{
  "providerOptions": {
    "seedance": {
      "model": "dreamina-seedance-2-5-260628",
      "mode": "auto",
      "hardFrameReferenceConflictPolicy": "auto",
      "directHardFrameReferenceMixVerified": false,
      "resolution": "720p",
      "ratio": "adaptive",
      "generateAudio": "auto",
      "returnLastFrame": true,
      "referenceBudgetPolicy": "quality_first",
      "realHumanFacePolicy": "require_material_library",
      "extensionPolicy": "auto",
      "watermark": false
    }
  }
}
```

---

# 27I. เลือก Wan / FLUX / Seedance ตัวไหนดี?

## ถ้ามี Reference ภาพ + Video Motion + Audio จำนวนมาก

เลือกก่อน:

```text
Seedance 2.5
หรือ
Wan 3.0
```

---

## ถ้าต้องการ 30s One-pass Multi-shot

เลือก:

```text
Wan 3.0
หรือ
Seedance 2.5
```

---

## ถ้าต้องการ 4K Short Commercial

เลือก:

```text
Seedance 2.0
```

โดยต้องดู reference mode constraint

---

## ถ้าต้องการ Start/End/Timed Keyframe คุม storyboard

เลือก:

```text
FLUX 3
```

เด่นตรง literal timed keyframes

---

## ถ้าต้องการ Raw Motion Reference

เหมาะ:

```text
Wan 3.0
Seedance 2.0
Seedance 2.5
MiniMax H3 Ref2VA
```

FLUX 3:
- ใช้ derive motion guidance;
- หรือใช้ V2V เฉพาะ continuation source จริง

Grok 1.5:
- derive;
- หรือ fallback provider

---

## ถ้าต้องการ Long-form ต่อเนื่อง

### Seedance 2.5

เหมาะที่สุดในสามตัวนี้สำหรับ multi-round commercial continuation

### FLUX 3

เหมาะกับ short-context continuation เป็น segment

### Wan

เหมาะกับ 30s native story และ bounded edit/extend

---

# 27J. Veo / Kling / Hailuo

Provider เหล่านี้ยังอยู่ใน Generic Capability Profile system

หลักการคือ:

```text
ตรวจ profile ปัจจุบัน
↓
Capability verified?
├─ YES → ใช้
└─ NO/unknown → fail closed / fallback
```

ห้ามเอาความสามารถของ Wan / Seedance / H3 ไป assume ให้ Provider อื่น

---



# 27K. LTX 2.5 — Cloud + Local

ตั้งแต่ v10 และยังคงอยู่ใน v11: LTX 2.5 เป็น First-class Provider โดย **แยก Cloud กับ Local ออกจากกัน** เพราะ capability ไม่เหมือนกัน

Cloud models:

```text
ltx-2-5-fast
ltx-2-5-pro
```

Local/Open Source:

```text
Lightricks/LTX-2.5
```

---

## 27K.1 Cloud รองรับอะไร

```text
Text-to-Video
Image-to-Video / Start Frame
First + Last Frame
Audio-to-Video
Native Audio
Native Multi-shot
Camera Motion
Automatic Duration
Sync API
Async API
```

แต่ current LTX-2.5 model matrix **ไม่รองรับ**:

```text
Retake
Extend
Reframe
```

แม้ LTX API family จะมี endpoint ชื่อเหล่านี้สำหรับ model version อื่นก็ตาม

---

## 27K.2 Fast vs Pro

### ltx-2-5-fast

เหมาะเมื่อ:

- ต้องการ 12–20 วินาที
- ต้องการ 1440p/4K
- ต้องการ cost/speed ที่ดี

720p/1080p @24/25 fps:

```text
6 / 8 / 10 / 12 / 14 / 16 / 18 / 20s
```

720p/1080p @48/50 fps:

```text
6 / 8 / 10s
```

1440p/4K:

```text
6 / 8 / 10s
```

### ltx-2-5-pro

เหมาะกับ short quality-first shot:

```text
720p / 1080p
24 / 25 / 50 fps
6 / 8 / 10s
```

Auto Router แนะนำ:

```text
<=10s + <=1080p + quality
→ Pro

>10s หรือ >1080p
→ Fast
```

---

## 27K.3 Start Frame

```text
role = start_frame
↓
image_uri
↓
LTX I2V
```

ภาพคือ State #0 จริง

Prompt ต้องเริ่มต่อจากสิ่งที่อยู่ในภาพ ไม่สั่งให้ทำ action ที่เกิดไปแล้วซ้ำ

---

## 27K.4 Start + Last Frame

```text
Start Frame
+
End Frame
↓
image_uri + last_frame_uri
```

ใช้ fixed duration เท่านั้น

ห้าม:

```text
last_frame_uri + duration=null
```

---

## 27K.5 Automatic Duration

T2V/I2V ใช้:

```json
{
  "duration": null
}
```

ให้ LTX ตัดสินความยาวจาก Prompt

เหมาะกับ creative/multi-shot ที่ไม่ lock slot เวลา

ไม่เหมาะกับ:

- exact 8/10/15/20s slot
- Last Frame
- external audio timing

---

## 27K.6 Audio-to-Video — จุดที่ต้องเข้าใจให้ถูก

LTX A2V ใช้:

```text
audio_uri
```

เป็น **เสียงจริงที่จะอยู่ในวิดีโอและเป็นตัวกำหนด timeline**

ไม่ใช่:

```text
voice embedding
speaker-style reference
music inspiration reference
```

จึงต้องระบุชัด:

```text
audioDriverAssetId
```

หรือ:

```text
providerHints.ltx.useAsAudioDriver = true
```

Fast:

```text
720p/1080p audio <=20s
1440p/4K audio <=10s
```

Pro:

```text
720p/1080p audio <=10s
```

A2V สามารถมี Start Frame และ Last Frame ได้

---

## 27K.7 Generic Character / Product / Place Reference

Cloud LTX 2.5 ไม่ควรถูก treat ว่ามี soft multi-reference array แบบ Wan/Seedance

ถ้ามี:

```text
Character Portrait
Product Packshot
Venue Image
```

Production default:

```text
Prebake Start Frame
↓
Identity/Product/Scene QC
↓
LTX I2V
```

หรือเลือก:

```text
derive_to_prompt
local_ic_lora
fallback_provider
block
```

---

## 27K.8 Motion / Video Reference

Cloud 2.5 ไม่มี generic raw video-reference input

ดังนั้น:

```text
motion_reference.mp4
camera_reference.mp4
```

ต้อง:

```text
Analyze → Motion/Camera Guidance
```

หรือ:

```text
Local verified IC-LoRA
Fallback Wan/H3/Seedance
Block ถ้า must_use_raw
```

---

## 27K.9 Native Multi-shot

LTX มี native multi-shot แต่ Prompt Style แตกต่างจาก H3

SmartAIHub ภายในยังวาง:

```text
Shot 1
Shot 2
Shot 3
```

ตามปกติ

แต่ตอน compile ให้ LTX ต้องแปลงเป็น prose เช่น:

```text
The presenter lifts the bottle and demonstrates the dispenser while the camera slowly pushes closer.
A hard cut transitions to a close view of her hand applying the product; the same music continues across the cut.
A match cut connects to the same presenter in a medium beauty shot, with the product still in her right hand and the same wardrobe and lighting.
```

ทุก cut ต้องบอก continuity ของ:

```text
character
product
wardrobe
environment
lighting
voice
music
ambience
```

---

## 27K.10 Camera Motion

Cloud enum ที่ verify แล้ว:

```text
dolly_in
dolly_out
dolly_left
dolly_right
jib_up
jib_down
static
focus_shift
```

ถ้า camera move ซับซ้อนกว่า enum ให้เขียนใน Prompt แทน

---

## 27K.10A การส่งไฟล์เข้า LTX Cloud

LTX Cloud รับ media ได้ 3 แบบ:

```text
ltx:// storage URI จาก LTX Upload
Public HTTPS URL
Data URI / Base64
```

สำหรับ SmartAIHub แนะนำ:

```text
assetTransportPolicy = auto
```

ถ้า R2 signed/public URL ใช้งานตรงตามข้อกำหนดก็ส่ง HTTPS ได้

ถ้าไฟล์ private/ใหญ่หรือไม่ต้องการพึ่ง URL ภายนอก:

```text
POST /v1/upload
↓
ได้ upload_url
↓
PUT file
↓
ได้/ใช้ storage_uri แบบ ltx://...
↓
Generation
```

ขนาดหลักที่ต้อง preflight:

```text
LTX Upload envelope = 200 MB
HTTPS Image = 15 MB
HTTPS Video/Audio = 32 MB
Data URI Image = 7 MB encoded
Data URI Video/Audio = 15 MB encoded
```

---

## 27K.11 Local / ComfyUI / Worker

Official built-in templates:

```text
video_ltx2_5_t2v
video_ltx2_5_i2v
video_ltx2_5_flf2v
```

Skill รองรับ route:

```text
local_comfyui
worker_comfyui
local_python
```

จึงสามารถต่อกับ SmartAIHub Worker → ComfyUI workflow ได้โดยตรง

---

## 27K.12 Local IC-LoRA

LTX open-source รองรับ LoRA/IC-LoRA และ advanced controls

แต่ต้องไม่ assume ว่า IC-LoRA เก่าทุกตัวจาก 2.3 ใช้กับ 2.5 ได้

จึงต้องมี:

```text
localReferenceWorkflowVerified = true
localWorkflowId = ...
```

ก่อนใช้:

```text
local_ic_lora
```

---

## 27K.13 Local Extension

Open-source pipeline มี prefix/suffix/reference conditioning สำหรับ workflow ขั้นสูง แต่ไม่ใช่ Cloud Extend 2.5

ต้องมี:

```text
localExtensionWorkflowVerified = true
```

ไม่เช่นนั้นให้ fallback provider หรือสร้าง independent continuation shot

---

## 27K.14 Local Parameter Preflight

```text
width / height divisible by 32
2-stage final width / height divisible by 64
num_frames = 8k + 1
```

เช่น:

```text
41
49
81
121
```

---

## 27K.15 LTX Production Preset — Cloud Quality

```json
{
  "providerOptions": {
    "ltx25": {
      "executionRoute": "cloud_api",
      "model": "auto",
      "mode": "auto",
      "durationPolicy": "exact",
      "resolution": "1080x1920",
      "fps": 24,
      "cameraMotion": "auto",
      "generateAudio": "auto",
      "referencePolicy": "prebake_start_frame",
      "cloudApiMode": "async"
    }
  }
}
```

---

## 27K.16 LTX Production Preset — Local Worker

```json
{
  "providerOptions": {
    "ltx25": {
      "executionRoute": "worker_comfyui",
      "model": "Lightricks/LTX-2.5",
      "mode": "auto",
      "referencePolicy": "auto",
      "localPipeline": "distilled_two_stage",
      "promptEnhanceLocal": true,
      "localWidth": 768,
      "localHeight": 512,
      "localNumFrames": 81
    }
  }
}
```

---

## 27K.17 LTX QC

ตรวจ:

```text
Start Frame Adherence
Last Frame Adherence
Start State Continuity
Character/Product Identity
Multi-shot Continuity
Cut Audio Continuity
Dialogue Exactness
Lip Sync
Native AV Sync
Audio Driver Preservation
IC-LoRA Reference Retention
```

---

# 28. Storyboard และ Approval

Skill แยก Approval ออกจาก Generation

---

## 28.1 `generationMode`

### `plan_only`

Skill สร้าง:

- Expanded Intent
- Sequence
- Shot
- Storyboard
- Prompt
- Provider Plan

แต่ไม่ generate video

เหมาะสำหรับ:

- preview
- review
- admin
- test
- ลดค่าใช้จ่าย

---

### `generate_after_storyboard_approval`

หลัง storyboard ผ่านแล้วจึง generate

---

## 28.2 Approval Policy

### `requireExpandedIdeaApproval`

ใช้เมื่อต้อง approve Idea ที่ Agent ขยายก่อน

เหมาะกับ:

- Brand
- Agency
- regulated content

---

### `requireStoryboardApproval`

default:

```text
true
```

แนะนำให้คงไว้สำหรับ production

---

### `requireHighCostGenerationApproval`

ป้องกัน job แพงถูกส่งอัตโนมัติ

---

### `requirePublishApproval`

ไม่ publish อัตโนมัติจน user ยืนยัน

---

## 28.3 จุดที่ควร Approve

Production แนะนำอย่างน้อย:

```text
Expanded Idea
↓
Storyboard
↓
High-cost generation
↓
Final publish
```

---

# 29. QC

QC ไม่ได้ให้คะแนนความสวยอย่างเดียว

แต่ตรวจหลายมิติ

---

## 29.1 Generic QC Thresholds

Defaults ใน input schema:

```text
minimumOverallScore = 85
minimumProductIntegrityScore = 90
minimumIdentityScore = 88
minimumUsageCorrectnessScore = 90
minimumMechanismTruthfulnessScore = 90
minimumVisualizationAlignmentScore = 85
minimumReferenceRetentionScore = 85
minimumHardFrameAdherenceScore = 90
minimumAudioVideoSyncScore = 85
minimumRegenerationPreservationScore = 90
```

---

## 29.2 Fail Conditions

Default:

```text
failOnWrongSpeaker = true
failOnProductGeometryDrift = true
failOnUnsupportedFeatureVisualization = true
failOnIncorrectUsageSequence = true
```

---

## 29.3 Segment QC

ตรวจ Generation Segment เดียว:

- Identity
- Product
- Place
- Motion
- Hands
- Prompt adherence
- Audio
- Dialogue

---

## 29.4 Seam QC

ตรวจรอยต่อ:

```text
Segment A
→
Segment B
```

ดู:

- face
- wardrobe
- product state
- hand state
- motion direction
- camera
- lighting
- sound
- dialogue
- environment
- UI

---

## 29.5 Sequence QC

ตรวจทั้งเรื่อง:

- Hook ครบหรือไม่
- Demo ครบหรือไม่
- Feature/experience proof ครบหรือไม่
- CTA ครบหรือไม่
- มี action ซ้ำหรือไม่
- ความยาวรวมถูกหรือไม่
- Continuity ข้าม shot ถูกหรือไม่

---

## 29.6 Product QC

เพิ่ม:

```text
Usage Correctness
Mechanism Truthfulness
Product Geometry
Brand Integrity
Claim Safety
```

---

## 29.7 Place QC

ควรตรวจ:

```text
Place identity
Spatial consistency
Visible-vs-unseen truth
Signage
Facility claims
Presenter blocking
Environment drift
```

---

## 29.8 Dialogue QC

ตรวจ:

- Exact text
- Speaker
- Timing
- Lip Sync
- Voice
- Language
- Dialogue/action overload

---

# 30. Repair

เมื่อ QC ไม่ผ่าน ไม่ควร regenerate ทั้งเรื่องทันที

Skill ใช้ **Minimum-scope Repair**

---

## 30.1 ตัวอย่าง Repair

### Product มือผิด

```text
แก้เฉพาะ shot
หรือ
แก้ keyframe
```

---

### Logo เพี้ยน

```text
ไม่จำเป็นต้อง regenerate video
→ Post composite
```

---

### Airflow effect ไม่ตรง

```text
Re-composite VFX
```

---

### Dialogue ภาษาไทยผิด

```text
External TTS / Lip Sync
```

---

### Extension seam เสีย

```text
Restart จาก last good segment
```

---

## 30.2 Failure Classes สำคัญ

ตัวอย่าง:

```text
PRODUCT_USAGE_ERROR
SURFACE_INTERACTION_FAILURE
DEMONSTRATION_SEQUENCE_FAILURE
MECHANISM_VISUALIZATION_FAILURE
VFX_COMPOSITE_FAILURE
SCREEN_UI_FAILURE
UNSUPPORTED_FEATURE_VISUALIZATION
REFERENCE_RETENTION_FAILURE
HARD_FRAME_ADHERENCE_FAILURE
PROVIDER_REFERENCE_MODE_CONFLICT
PROVIDER_REFERENCE_BUDGET_EXCEEDED
CONTEXT_IR_DRIFT
NATIVE_AUDIO_VIDEO_SYNC_FAILURE
VOICE_REFERENCE_FAILURE
REFERENCE_CONTINUATION_FAILURE
H3_2K_REGENERATION_PRESERVATION_FAILURE
```

---

## 30.3 Repair Budget

```text
budget.maxRepairIterationsPerShot
```

default:

```text
2
```

ถ้าเกิน:

```text
block
หรือ
ask human
หรือ
change provider
```

ไม่ควรวนไม่จบ

---

# 31. Post Production

Post Production เป็นส่วนของ design ตั้งแต่ก่อน generation

ไม่ใช่สิ่งที่คิดหลัง AI Video เสร็จเท่านั้น

---

## 31.1 สิ่งที่ควรให้ AI Video ทำ

- body movement
- environment motion
- product handling
- camera motion
- natural acting
- coarse VFX ที่ model ทำได้ดี
- dialogue/audio ถ้า provider เหมาะ

---

## 31.2 สิ่งที่ควรย้าย Post

### Exact Text

- Logo
- Label
- Price
- CTA
- Small typography

### UI

- Smartphone screen
- SaaS interface
- Data dashboard

### Graphics

- Airflow
- Temperature
- Feature callout
- Diagram
- Before/after label

---

## 31.3 Packshot

ถ้า Product Hero ต้องเป๊ะ:

```text
AI video background / motion
+
verified product packshot
+
tracking / compositing
```

มักปลอดภัยกว่าสร้าง label ใหม่ทุก frame

---

# 32. Output ของ Skill

Output หลักมี:

```text
schemaVersion
status
projectRun
normalizedBrief
promotionTargetResolution
expandedIntent
castResolution
sequencePlan
promptChains
shots
approvals
warnings
assumptions
```

และ optional:

```text
productContext
productMechanismModel
placeExperienceModel
targetExperienceModel
research
concept
script
breakdown
storyboard
postProduction
publishPlan
analyticsPlan
optimizationPlan
costEstimate
lineage
providerExecutionPlans
minimaxH3Plans
```

---

## 32.1 Status

### `draft`
กำลังวางแผน

### `awaiting_expanded_idea_approval`
รอ approve Expanded Idea

### `awaiting_storyboard_approval`
รอ approve storyboard

### `ready_to_generate`
พร้อมสร้าง

### `generating`
กำลังสร้าง

### `qc_failed`
QC ไม่ผ่าน

### `ready_for_post`
พร้อม post

### `awaiting_publish_approval`
รออนุมัติเผยแพร่

### `complete`
จบ workflow

### `blocked`
มี dependency สำคัญที่แก้ไม่ได้อัตโนมัติ

---

## 32.2 `warnings`

อย่ามอง warning เป็น error เสมอไป

ตัวอย่าง:

```text
Thai dialogue quality is variable
Product visual identity is unverified
Only one venue view exists
Provider extension capability unknown
```

บางกรณีสามารถดำเนินการต่อได้

---

## 32.3 `assumptions`

Agent ต้องบันทึกสิ่งที่ infer

เช่น:

```text
assumed generic cream container
assumed presenter uses right hand
assumed visible seating is available for presenter interaction
```

ช่วย review และ debug

---

## 32.4 `lineage`

Production ควรเก็บ:

```text
Idea version
Expanded Intent version
Storyboard version
Reference set
Provider profile version
Prompt hash
Generation job
QC result
Repair lineage
Approval
```

เพื่อ reproducibility

---

# 33. ตัวอย่างใช้งานแบบละเอียด

ส่วนนี้แสดงวิธีคิดของ Skill ในหลายสถานการณ์

---

## 33.1 ตัวอย่าง A — แชมพู ไม่มีภาพสินค้า

### Input

```json
{
  "idea": "ผู้หญิงเทแชมพูลงบนมือ แล้วชโลมลงบนเส้นผมอย่างเป็นธรรมชาติ",
  "locale": "th-TH",
  "contentMode": "silent_demo"
}
```

### Promotion Target

```text
physical_product
```

### Missing Asset Decision

เพราะไม่มีชื่อแบรนด์และไม่มีภาพสินค้า:

```text
visualIdentityStatus = generic_allowed
```

### Expanded Action

```text
ถือขวด
↓
เปิด/ปรับท่าจับตาม form factor ที่สมเหตุสมผล
↓
เทหรือกดผลิตภัณฑ์ลงฝ่ามือ
↓
ยกมือขึ้นสู่เส้นผม
↓
ชโลมอย่างเป็นธรรมชาติ
↓
นวด/ลูบ
↓
result beat
```

ถ้า form factor ไม่ชัด LLM ไม่ควรบังคับว่าเป็น pump

เช่น ถ้า Idea ใช้คำว่า “เท” ให้เลือก container ที่รองรับการเท

---

### Shot Plan ตัวอย่าง

```text
Shot 1 — 8s
Medium close
เธอยกขวดขึ้น เทลงฝ่ามือ
Camera: subtle push-in

Shot 2 — 10s
Medium / close insert
เธอนำผลิตภัณฑ์ไปชโลมเส้นผม
Camera: gentle arc + hair detail

Shot 3 — 8s
Beauty result
Natural head movement
Product-neutral hero
```

---

## 33.2 ตัวอย่าง B — แชมพู + Start Frame + Product Image

### Input

มี:

```text
Character Image
Product Packshot
Start Frame
```

Idea:

```text
เธอเทแชมพูจากขวดในมือใส่ฝ่ามือ แล้วสระผม
```

### Flow

```text
Start Frame Analysis
↓
พบว่าขวดอยู่ในมือขวา
↓
Product Image = source-of-truth
↓
Product geometry lock
↓
Action starts from existing hand state
```

ไม่ควร:

```text
ให้เธอหยิบขวดอีกครั้ง
```

---

## 33.3 ตัวอย่าง C — โทรศัพท์มีชื่อรุ่นแต่ไม่มีภาพ

### Input

```json
{
  "idea": "พรีเซนเตอร์ยืนอธิบายโทรศัพท์ ExamplePhone X Pro และโชว์หน้าจอ",
  "promotionTarget": {
    "mode": "explicit",
    "kind": "physical_product",
    "name": "ExamplePhone X Pro",
    "exactVisualIdentityRequired": true
  }
}
```

### Result

ระบบอาจ:

```text
วาง Script
วาง Sequence
วาง UI proof
```

ได้

แต่ product-facing generation ต้องรอ visual source of truth

### Recommended UI

```text
ให้ user แนบ:
front
back
3/4
UI screenshot
```

ถ้าไม่มี:

```text
status = blocked
reason = exact visual identity required
```

---

## 33.4 ตัวอย่าง D — พาชมร้านจากภาพฉากอย่างเดียว

### Input

```json
{
  "idea": "พาชมร้านตามภาพนี้ เน้นบรรยากาศภายในและมุมที่น่านั่ง",
  "contentMode": "store_review",
  "assets": [
    {
      "assetId": "shop_scene",
      "role": "environment_reference",
      "mediaType": "image",
      "sourceOfTruth": true
    }
  ]
}
```

### Resolver

```text
targetKind = place_venue
promotionIntent = review
source = idea + environment
branch = place_experience
```

### Safe Plan

```text
Shot 1
Establish interior

Shot 2
Push-in / crop ไปยัง seating

Shot 3
Detail visible decor

Shot 4
Atmosphere hero
```

### Not Safe

```text
เดินออกไปเห็นหน้าร้านที่ไม่อยู่ในภาพ
พาเข้าห้อง VIP ที่ไม่เคยเห็น
พูดว่ามีที่จอดรถ
```

---

## 33.5 ตัวอย่าง E — Host พาชมร้าน

Input:

```text
Character Reference
Venue Image
Idea:
"ให้ผู้หญิงพาเดินชมร้านในภาพ พูดถึงบรรยากาศ"
```

### Cast

```text
host
```

### Experience Plan

```text
Establish
↓
Host turns toward visible area
↓
Host points to seating
↓
Host moves a short safe distance
↓
Detail insert
↓
Reaction
↓
CTA
```

### Dialogue

Agent สามารถร่าง:

```text
"มุมนี้บรรยากาศดูสบายดีค่ะ แล้วก็มีพื้นที่นั่งหลายแบบให้เลือก"
```

ถ้าภาพรองรับ

แต่ไม่ควรร่าง:

```text
"ที่นี่เปิดตลอด 24 ชั่วโมง"
```

ถ้าไม่มีข้อมูล

---

## 33.6 ตัวอย่าง F — เครื่องซักผ้า

### Idea

```text
สาธิตเครื่องซักผ้าตั้งแต่ใส่ผ้า เลือกโปรแกรม จนเห็นการหมุนปั่น
```

### Product Mechanism

```text
load
close
select
start
drum motion
wash
spin
outcome
```

### Visual Explanation

ถ้าเห็นถังผ่านประตู:

```text
literal drum motion
```

ถ้า mechanism อยู่ภายใน:

```text
cutaway
motion trace
time compression
```

### Claim Boundary

ห้ามสร้าง:

```text
ซักสะอาดขึ้น 99%
ประหยัดไฟ 50%
```

ถ้าไม่มี verified metric

---

## 33.7 ตัวอย่าง G — แอร์

### Idea

```text
เปิดแอร์แล้วอธิบายการกระจายลมให้คนดูเห็นภาพ
```

### Plan

```text
Shot 1 — presenter เปิดแอร์
Shot 2 — louver motion
Shot 3 — airflow visual
Shot 4 — comfort reaction
```

### VFX

```text
airflow_streamlines
thermal_gradient
```

Truth Mode:

```text
supported_explanatory
```

---

## 33.8 ตัวอย่าง H — โทรศัพท์ + Virtual Screen

### Idea

```text
พรีเซนเตอร์ถือโทรศัพท์แล้วอธิบายฟีเจอร์กล้อง
```

### Better Production Strategy

```text
AI Video:
presenter
phone body
hand motion
camera

Post:
verified UI
feature callout
screen tracking
```

ดีกว่าสั่ง AI Video สร้าง UI ตัวอักษรทั้งหมดเอง

---

## 33.9 ตัวอย่าง I — H3 พร้อม Image + Video + Audio Reference

### Assets

```text
Picture 1 = Product
Picture 2 = Presenter
Video 1 = Motion
Audio 1 = Voice
```

### H3 Mode

```text
Ref2VA
```

### Prompt Shape

```text
subject_definitions
summary
retention_analysis
detailed_description
overall_soundscape
non_diegetic_music
```

### Benefit

- Character identity
- Product identity
- Motion
- Camera
- Voice

สามารถถูกวางแผนร่วมกัน

---

## 33.10 ตัวอย่าง J — H3 มี Start Frame + Motion Video + Voice

เกิด conflict:

```text
Hard Start Frame
XOR
Raw Ref2VA
```

ระบบควรเสนอ:

### Route 1

```text
Hard Start
+
Motion → structured description
+
Voice → external
```

### Route 2

```text
Soft Start Picture
+
Raw Motion
+
Raw Voice
```

### Route 3

```text
Prebake Start
+
Hard I2VA
```

### Route 4

```text
Split pipeline
```

ไม่ควรส่ง request ที่ขัด capability

---

## 33.11 ตัวอย่าง K — 15s H3 Native Multi-shot

```text
0–5s Hook
5–10s Demo
10–15s Hero
```

Prompt:

```text
[Shot 1]
...

[Shot 2] At 00:05.000,
...

[Shot 3] At 00:10.000,
...
```

---

## 33.12 ตัวอย่าง L — 40s Omni

```text
Base 8s
+ Extend 8s
+ Extend 8s
+ Extend 8s
+ Extend 8s
```

Skill ต้องสร้าง Prompt Turn 5 ชุด

ไม่ใช่ Prompt เดียวใช้ซ้ำ

---

## 33.13 ตัวอย่าง M — Narrative Only

### Idea

```text
เด็กนั่งเล่นของเล่นกับแม่ในห้องนั่งเล่น แล้วหัวเราะด้วยกัน
```

### Resolve

```text
narrative_no_promotion
```

### Flow

```text
Idea
→ Script
→ Shot
→ Dialogue
→ Motion
→ Video
```

ไม่มี Product Hero

---

# 34. Preset ที่แนะนำ

## 34.1 Preset — Product Ad คุณภาพสูง

```json
{
  "contentMode": "cinematic",
  "agentExecutionProfile": "production",
  "researchMode": "auto",
  "generationMode": "generate_after_storyboard_approval",
  "modelRouting": {
    "mode": "auto",
    "optimizeFor": "quality"
  },
  "approvalPolicy": {
    "requireStoryboardApproval": true,
    "requireHighCostGenerationApproval": true,
    "requirePublishApproval": true
  },
  "demonstrationPolicy": {
    "mode": "hybrid",
    "requireCorrectUsage": true,
    "preferProofMoment": true
  },
  "visualExplanationPolicy": {
    "mode": "balanced",
    "preferPostCompositeForExactTextOrUI": true,
    "requireTruthClassification": true
  }
}
```

---

## 34.2 Preset — Social Product Clip

```text
Aspect = 9:16
Shot duration = 8–10s
Independent shots
1 candidate / shot
Balanced profile
```

---

## 34.3 Preset — Product Demo

```text
contentMode = tutorial
demonstrationPolicy.mode = literal_demo / hybrid
requireCorrectUsage = true
minimumUsageCorrectnessScore = 90+
```

---

## 34.4 Preset — Place Review

```json
{
  "contentMode": "store_review",
  "promotionTarget": {
    "mode": "auto",
    "kind": "place_venue"
  },
  "placePromotionPolicy": {
    "mode": "review",
    "unseenAreaPolicy": "visible_only",
    "allowEnvironmentImageAsTargetEvidence": true,
    "requireEvidenceForFacilityClaims": true,
    "preserveStorefrontOrSignage": true
  }
}
```

---

## 34.5 Preset — H3 Production

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["MiniMax-H3"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "minimaxH3": {
      "model": "MiniMax-H3",
      "executionRoute": "auto",
      "referenceStrategy": "auto",
      "hardFrameConflictPolicy": "auto",
      "contextIR": "official_then_validate",
      "resolutionWorkflow": "draft_768p_then_regenerate_2k",
      "nativeMultiShot": "auto",
      "nativeAudio": "auto",
      "dialoguePolicy": "native_try_then_external_fallback",
      "continuationPolicy": "auto",
      "continuationTailSeconds": 4,
      "referenceBudgetPolicy": "quality_first"
    }
  }
}
```

---


## 34.5A Preset — Grok Imagine Video 1.5 Production

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["grok-imagine-video-1.5"],
    "fallbackModels": [],
    "allowCrossProviderFallback": false,
    "requireNativeAudio": true,
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "grokImagineVideo15": {
      "mode": "auto",
      "startReferenceConflictPolicy": "auto",
      "resolution": "auto",
      "startFrameAspectPolicy": "normalize_before_generation",
      "generateAudio": "auto",
      "referenceImagePolicy": "quality_first",
      "videoReferencePolicy": "derive_to_prompt",
      "customVoicePolicy": "external_fallback",
      "preferIndependentShots": true,
      "allowCompanionEditExtendModel": true
    }
  }
}
```

ถ้ามี Start Frame + หลาย reference ที่ต้องรักษา:

```text
เปลี่ยน startReferenceConflictPolicy
→ prebake_start_frame
```



## 34.5B Preset — Wan 3.0 30s Commercial

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["wan3.0-video"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "wan3": {
      "model": "wan3.0-video",
      "mode": "auto",
      "hardFrameReferenceConflictPolicy": "auto",
      "resolution": "1080P",
      "ratio": "adaptive",
      "durationPolicy": "exact",
      "promptExtend": true,
      "generateAudio": "auto",
      "referenceBudgetPolicy": "quality_first",
      "extensionDirection": "forward"
    }
  }
}
```

---

## 34.5C Preset — FLUX 3 Storyboard-controlled Commercial

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["flux-3-video"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "flux3": {
      "mode": "auto",
      "resolution": "fhd",
      "aspectRatio": "auto",
      "keyframeStrategy": "auto",
      "softReferencePolicy": "prebake_keyframe",
      "draftWorkflow": "draft_then_enhance",
      "generateAudio": "auto",
      "continuationTailSeconds": 4,
      "postUpscale": "auto",
      "safetyTolerance": 2,
      "version": "latest"
    }
  }
}
```

---

## 34.5D Preset — Seedance 2.5 Reference-heavy Commercial

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["dreamina-seedance-2-5-260628"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "seedance": {
      "model": "dreamina-seedance-2-5-260628",
      "mode": "auto",
      "hardFrameReferenceConflictPolicy": "auto",
      "directHardFrameReferenceMixVerified": false,
      "resolution": "720p",
      "ratio": "adaptive",
      "generateAudio": "auto",
      "returnLastFrame": true,
      "referenceBudgetPolicy": "quality_first",
      "realHumanFacePolicy": "require_material_library",
      "extensionPolicy": "auto",
      "watermark": false
    }
  }
}
```

---

## 34.5E Preset — Seedance 2.0 High-resolution Short Ad

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["dreamina-seedance-2-0-260128"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "seedance": {
      "model": "dreamina-seedance-2-0-260128",
      "mode": "auto",
      "hardFrameReferenceConflictPolicy": "auto",
      "resolution": "4k",
      "ratio": "adaptive",
      "generateAudio": "auto",
      "returnLastFrame": true,
      "referenceBudgetPolicy": "quality_first",
      "realHumanFacePolicy": "require_material_library",
      "extensionPolicy": "off",
      "watermark": false
    }
  }
}
```

> ถ้าใช้ Reference Image กับ Seedance 2.0 อย่าบังคับ 1080p; ให้ Router เลือก resolution ที่ legal หรือเปลี่ยน mode/provider

---


## 34.5F Preset — LTX 2.5 Cloud Product Commercial

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["ltx-2-5-pro", "ltx-2-5-fast"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "ltx25": {
      "executionRoute": "cloud_api",
      "model": "auto",
      "mode": "auto",
      "durationPolicy": "exact",
      "resolution": "1080x1920",
      "fps": 24,
      "cameraMotion": "auto",
      "generateAudio": "auto",
      "referencePolicy": "prebake_start_frame",
      "cloudApiMode": "async"
    }
  }
}
```

---

## 34.5G Preset — LTX 2.5 Local Worker / ComfyUI

```json
{
  "modelRouting": {
    "mode": "locked",
    "preferredModels": ["Lightricks/LTX-2.5"],
    "optimizeFor": "quality"
  },
  "providerOptions": {
    "ltx25": {
      "executionRoute": "worker_comfyui",
      "model": "Lightricks/LTX-2.5",
      "mode": "auto",
      "referencePolicy": "auto",
      "localPipeline": "distilled_two_stage",
      "promptEnhanceLocal": true,
      "localWidth": 768,
      "localHeight": 512,
      "localNumFrames": 81
    }
  }
}
```

---

## 34.6 Preset — Cost-conscious

```text
agentExecutionProfile = fast หรือ balanced
generationMode = plan_only ก่อน
candidateCountPerShot = 1
repairIterations = 1–2
generate 768P ก่อน
finalize 2K เฉพาะ shot ผ่าน
```

---

# 35. Troubleshooting

## 35.1 AI ทำสินค้าไม่เหมือน Reference

ตรวจ:

```text
product reference เป็น sourceOfTruth หรือไม่
providerUsePolicy = must_use_raw?
product geometry lock ถูกหรือไม่
model รองรับ raw reference หรือไม่
```

แนวทาง:

```text
เพิ่ม product reference
เพิ่ม angle
ใช้ keyframe
ใช้ post packshot
เปลี่ยน provider
```

---

## 35.2 Start Frame แล้ววิดีโอกระโดด

สาเหตุทั่วไป:

```text
Prompt บรรยาย action ตั้งแต่ก่อน Start Frame
camera state ไม่ต่อ
end-state ของ shot ก่อนกับ start-state ไม่ตรง
provider hard frame ไม่ถูกใช้
```

แก้:

```text
lock State #0
เพิ่ม preCompletedSteps
ลด action แรก
ให้ motion เริ่มจาก micro movement
ตรวจ camera continuity
```

---

## 35.3 มี Start Frame + H3 Ref Video/Audio แล้วใช้พร้อมกันไม่ได้

นี่ไม่ใช่ bug ของ Skill

เป็น provider-mode conflict

เลือก:

```text
hard start
raw multimodal
prebake
split
```

---

## 35.4 Lip Sync ภาษาไทยไม่ดี

แนะนำ:

```text
Generate 768P
↓
ASR QC
↓
ถ้าไม่ผ่าน
External TTS + Lip Sync
```

อย่าทำ 2K ก่อน

---

## 35.5 AI สร้าง UI โทรศัพท์มั่ว

อย่าพยายามแก้ด้วย Prompt ยาวขึ้นอย่างเดียว

ใช้:

```text
clean screen plate
+
verified UI composite
```

---

## 35.6 ร้านเปลี่ยนโครงสร้าง

ถ้ามี reference มุมเดียว:

```text
ลด camera excursion
ใช้ small parallax
ใช้ push/pan
ใช้ crop/details
```

อย่า orbit ใหญ่

---

## 35.7 ตัวละครสลับตำแหน่ง

ตรวจ:

```text
characterId
entityId
cast mapping
positionHint
speaker mapping
continuityKeys
```

---

## 35.8 Multi-shot ยัด action มากเกิน

ลด:

```text
maxMajorActionsPerShot
```

หรือ split เป็นหลาย logical shots

---

## 35.9 Extension ทำ action ซ้ำ

Prompt Chain ต้องมี:

```text
completed actions
do not repeat
current state
remaining beats
```

และ Seam QC

---

## 35.10 Provider ทำ duration ไม่ตรง

อย่าฝืนให้ storyboard เปลี่ยนตาม API ทันที

ใช้:

```text
plannedDuration
requestedDuration
actualDuration
```

Temporal Planner ปรับ execution

---

## 35.11 มี Warning ว่า Product Visual Identity Unverified

หมายถึง:

```text
รู้ชื่อ/ข้อมูล
แต่ยังไม่มีภาพที่ยืนยันรูปลักษณ์จริง
```

ถ้างานไม่ต้อง exact อาจไปต่อ

ถ้าต้อง exact → เพิ่ม reference

---

# 36. ข้อจำกัดที่ควรรู้

Skill มี architecture ที่ครอบคลุมกว้าง แต่ไม่ได้ทำให้ AI Video ไม่มีข้อจำกัด

---

## 36.1 Exact Text

AI Video ยังไม่ควรถูกใช้เป็น source of truth สำหรับ:

- ฉลาก
- ตัวหนังสือเล็ก
- UI
- โลโก้
- ราคา
- Promotion copy

ใช้ Post Composite

---

## 36.2 Complex Hands

Interaction ที่ละเอียดมาก:

```text
เปิดฝาเล็ก
เสียบสาย
กดปุ่มจิ๋ว
ผูกเชือก
ประกอบชิ้นส่วน
```

อาจต้อง:

- keyframe
- close-up
- split action
- rerender

---

## 36.3 Long Choreography

Shot ยาวที่มี action ต่อเนื่องหลายอย่างเสี่ยง:

- state drift
- identity drift
- object teleport
- repeated action

ควร split

---

## 36.4 Multi-speaker

หลายคนพูดใน shot เดียวเพิ่มความเสี่ยง:

- speaker swap
- lip sync
- gaze
- overlap

แนะนำให้ Dialogue Planner คุม turn-taking ชัด

---

## 36.5 Real Place from One Image

หนึ่งภาพไม่เท่ากับ 3D scan

อย่า treat unseen geometry เป็นข้อเท็จจริง

---

## 36.6 Named Product Without Visual Reference

Research ไม่ได้เท่ากับ visual source

---

## 36.7 Capability Profile

Provider เปลี่ยน API ได้

Production system ควร update profile/version แยกจาก SKILL.md

---

# 37. OpenAI Agents SDK / Developer Runtime Integration

หัวข้อนี้เป็น **ข้อกำหนด Runtime ของ Skill v11** ไม่ใช่เพียงแนวคิดแนะนำ

> **OpenAI Agents SDK เป็น Runtime สำหรับ bounded reasoning ของ Specialist Agents แต่ไม่ใช่ authority ของ Workflow, Database, Credit, Approval, Provider Job หรือ Publish**

```text
SmartAIHub Core / Workflow Controller
= AUTHORITATIVE STATE + SIDE-EFFECT OWNER

OpenAI Agents SDK
= BOUNDED REASONING RUNTIME

Stage Schemas
= STRUCTURED CONTRACTS

Provider Capability Profiles
= PROVIDER TRUTH

Provider Adapters
= DETERMINISTIC VALIDATION + API TRANSLATION
```

---

## 37.1 OpenAI Agents SDK จำเป็นแค่ไหน

### Production Agent Mode

ถ้าต้องการใช้ architecture ของ Skill v11 แบบเต็ม:

```text
OpenAI Agents SDK
= intended / recommended Agent Runtime
```

เหมาะกับ:

- Idea understanding
- Promotion Target resolution
- Research synthesis
- Product / Place / Service reasoning
- Product mechanism
- Sequence / Shot planning
- Dialogue / Motion / Continuity
- Provider strategy recommendation
- Prompt intent
- QC diagnosis
- Repair planning

### ส่วนที่ไม่ต้องพึ่ง Agents SDK

```text
JSON Schema validation
Provider Profiles
Provider Adapters
Database
Tenant isolation
Asset authorization
Credits / Billing
Approval
Job Queue
Idempotency
Publish
Analytics
```

ดังนั้น Skill นี้คือ:

```text
Hybrid Agent Skill
```

ไม่ใช่ OpenAI-Agent-only application

Custom orchestrator หรือ Responses API สามารถใช้แทนได้ ถ้ายังคง stage contracts, security boundaries และ deterministic workflow เดียวกัน

---

## 37.2 Runtime Version Policy

Production reference runtime ของ v11 ต้อง pin SDK version ที่ผ่าน regression:

```text
openai-agents >= 0.22.0
openai-agents < 0.23
```

ไม่ควรใช้ unbounded `latest`

เมื่อเปลี่ยน SDK minor line ต้องรัน:

```text
Agent Runtime Regression
Structured Output Regression
Guardrail Regression
Session Regression
Tracing Regression
Tool Contract Regression
```

ก่อน deploy

Provider/schema worker ที่ไม่ทำ Agent reasoning ไม่ควรต้อง import Agents SDK แบบ eager

---

## 37.3 Explicit Agent Model Requirement

Production Agent run ต้อง resolve model ให้ชัดก่อน Runner

```text
Project override
↓
Tenant Agent Model Setting
↓
SmartAIHub System Default
↓
ไม่มีค่า
→ BLOCK
```

ตัวอย่าง:

```json
{
  "agentRuntime": {
    "enabled": true,
    "model": "configured-by-smartaihub",
    "maxTurnsPerStage": 6,
    "maxContractRepairAttempts": 1,
    "maxInputCharsPerStage": 120000,
    "maxTotalTokensPerStage": 80000,
    "maxTotalTokensPerRun": 500000
  }
}
```

---

## 37.4 SmartAIHub Controller ต้องเป็น Authority

Controller เท่านั้นที่ mutate:

```text
tenant
project/run state
database
credits
billing
approval
job creation
provider submission
retry counter
publish
delete
asset writes
version lineage
```

Agent ห้าม:

```text
ตัดเครดิต
สร้าง/อ่าน provider secret
เปลี่ยน tenant/project scope
สร้าง authoritative idempotency key
submit paid generation โดยตรง
publish โดยตรง
delete asset
bypass approval
```

---

## 37.5 Specialist Agents ไม่ใช่ Autonomous Workflow

Logical roles ตัวอย่าง:

```text
PromotionTargetResolverAgent
CastResolutionAgent
ResearchAgent
ProductMechanismAgent
PlaceExperienceAgent
IdeaExpansionAgent
CreativeDirectorAgent
ScriptAgent
SequencePlannerAgent
VisualAnalyzerAgent
ShotPlannerAgent
DialogueMapperAgent
MotionPlannerAgent
ContinuitySupervisorAgent
GenerationStrategistAgent
PromptIntentAgent
QCAgent
RepairAgent
OptimizationAgent
```

ไม่จำเป็นต้องเป็น 1 role = 1 LLM call

Execution Profile:

```text
Fast
Balanced
Production
```

สามารถ consolidate role ตาม complexity/cost ได้ แต่ต้องคืน contract เดิม

---

## 37.6 ห้ามใช้ Free-form Handoff เป็น Production State Machine

ไม่ควร:

```text
IdeaAgent → ResearchAgent → ShotAgent → PromptAgent → VideoAgent
```

แบบ autonomous chain

ควร:

```text
SmartAIHub Controller
↓
run_stage(...)
↓
validate
↓
persist
↓
next deterministic stage
```

Agents SDK Runner ใช้ภายในแต่ละ bounded stage

---

## 37.7 Stage-specific Structured Output เป็นข้อบังคับ

Agent ต้องคืน:

```text
StageOutputEnvelope
+
Canonical Stage Payload
```

ตัวอย่าง:

```json
{
  "stage": "shot_plan",
  "schemaId": "canonical-shot-plan-schema-id",
  "payload": {},
  "warnings": [],
  "assumptions": [],
  "evidenceAssetIds": [],
  "needsHumanReview": false,
  "confidence": 0.91
}
```

ห้าม parse prose อิสระเป็น canonical state

---

## 37.8 Stage → Schema Mapping

| Stage | Canonical Contract |
|---|---|
| Promotion Target | `promotion-target.schema.json` |
| Research Summary | research-summary contract |
| Product Mechanism | `product-mechanism.schema.json` |
| Place Experience | place-experience contract |
| Expanded Intent | `expanded-intent.schema.json` |
| Sequence | sequence-plan contract |
| Observed Start State | `observed-start-state.schema.json` |
| Visualization | `visualization-plan.schema.json` |
| Shot Plan | `shot-plan.schema.json` |
| Dialogue Map | dialogue-map contract |
| Continuity | continuity-plan contract |
| Generation Strategy | generation-strategy contract |
| Prompt Intent | provider-neutral prompt-intent contract |
| QC | `qc-report.schema.json` |
| Repair | `repair-plan.schema.json` |

Provider-specific payload เกิดหลัง deterministic provider validation

---

## 37.9 Schema Contract Repair

```text
Agent Output
↓
JSON Schema Validate
├─ PASS → accept
└─ FAIL
    ↓
    bounded contract-repair attempt
    ↓
    validate again
```

กำหนด:

```text
maxContractRepairAttempts
```

ทุก failed attempt ใช้ token และต้องถูกนับ

---

## 37.10 Token Budget แยกจาก Video Credit

แยก:

```text
A. Agent reasoning tokens
B. Skill invocation credits
C. Provider generation cost
D. Repair generation cost
E. Post-processing/render cost
F. External publish/service cost
```

ควรมี:

```text
maxTurnsPerStage
maxTotalTokensPerStage
maxTotalTokensPerRun
```

เกินเพดาน:

```text
AGENT_TOKEN_BUDGET_EXCEEDED
```

และห้ามเดินไป paid generation ต่อ

---

## 37.11 Session ไม่ใช่ Canonical State

```text
OpenAI Agents SDK Session
= optional conversation/history convenience

SmartAIHub DB + Run Checkpoint
= canonical workflow state
```

Session ห้ามเป็น source of truth ของ:

```text
approved storyboard
repair count
credits
provider job IDs
asset ownership
publish state
```

---

## 37.12 Session Policy

Safe default:

```text
useSessions = false
```

เปิดเมื่อมี:

```text
context-aware session implementation
tenant/project/run scoping
history limit
retention policy
```

Session key logical scope:

```text
tenantId | projectId | runId | sessionId
```

แนะนำแปลงเป็น opaque hash ก่อน generic store

---

## 37.13 Durable Run Checkpoint

Checkpoint ขั้นต่ำ:

```text
projectId
runId
workflowVersion
currentStage
completedStageOutputs
approvalState
repairCountByShot
budgetState
agentTokenUsage
traceId
sessionId (optional)
```

ต้อง persist หลัง stage สำเร็จ ไม่รอ pipeline จบ

---

## 37.14 Resume Flow

```text
Resume
↓
Load checkpoint
↓
Validate tenant/project/run
↓
Validate workflowVersion
├─ compatible → hydrate
└─ incompatible → explicit migration
↓
Load persisted stage outputs
↓
Continue from next legal stage
```

ห้ามอ่าน Session แล้วเดาว่า workflow อยู่ขั้นไหน

---

## 37.15 Workflow Version Mismatch

ถ้า checkpoint กับ runtime คนละ workflow version:

```text
CHECKPOINT_VERSION_MISMATCH
```

ต้อง migration + revalidation ก่อน resume

---

## 37.16 Cross-shot Continuity

Shot ถัดไปต้องเห็น approved continuity ledger ของ shot ก่อนหน้า

ตัวอย่าง:

```text
S01: product อยู่มือขวา
↓
Continuity Ledger
↓
S02: ห้ามย้ายไปมือซ้ายทันทีโดยไม่มี transition
```

Carry state เช่น:

```text
identity
wardrobe
hair
hand occupancy
product state/orientation
environment
camera axis
screen state
mechanism state
effect continuity
dialogue state
completed actions
```

---

## 37.17 Minimum Necessary Context

Agent ไม่ควรได้ project state ทั้งหมดทุกครั้ง

ส่งเฉพาะ:

```text
current stage input
approved global locks
relevant references
prior continuity state
relevant dialogue
provider constraints
```

ช่วยลด:

```text
token
noise
leakage
drift
```

---

## 37.18 Asset Authorization — ก่อนและหลัง Agent

ก่อน Agent เห็น asset:

```text
tenant access
project access
rights/consent
provider usability
```

หลัง Agent คืน output ต้องตรวจ Asset ID ที่อ้างอีกครั้ง:

```text
assetId
sourceAssetId
referenceAssetId
evidenceAssetIds
assetIds[]
```

ถ้าอยู่นอก scope:

```text
ASSET_SCOPE_FAILURE
```

ห้าม persist output

---

## 37.19 Agent Tools ที่อนุญาต

ควรเป็น bounded/read-only เช่น:

```text
get_asset_evidence
get_provider_capability_profile
search_verified_research
estimate_generation_cost
read_approved_product_facts
read_approved_place_facts
```

Research tool ควรจำกัด:

```text
max results
query length
tenant/project scope
```

---

## 37.20 Tools ที่ห้ามเปิดตรงให้ Agent

ไม่ควร expose unrestricted:

```text
deduct_credits
submit_paid_generation
publish_now
delete_asset
change_tenant
store_provider_api_key
disable_approval
```

Paid generation ต้องผ่าน Controller

---

## 37.21 Approval Gates

อย่างน้อย:

```text
1. Storyboard Approval
2. High-cost Generation Approval
3. Publish Approval
```

Approval เป็น Core state ไม่ใช่ Agent decision

---

## 37.22 Idempotency

Paid submission ต้องมี controller-owned idempotency

ป้องกัน:

```text
double click
retry timeout
queue redelivery
webhook duplicate
restart
```

bind อย่างน้อยกับ:

```text
tenant
project
run
shot
provider plan
generation revision
```

---

## 37.23 Provider Plan Hash

แนะนำ:

```text
providerPlanSha256
```

คำนวณจาก:

```text
provider/profile/version
model
mode
duration
resolution
aspect
references
prompt hash
critical generation params
```

ใช้กับ:

```text
approval integrity
billing audit
idempotency
reproducibility
```

---

## 37.24 Provider Truth

Agent แนะนำได้ แต่ capability truth ต้องมาจาก:

```text
config/providers/
schemas/providers/
adapters/
```

ห้าม LLM จำ API จาก training data แล้วสร้าง field เอง

---

## 37.25 Provider Adapter Responsibilities

Adapter ทำ:

```text
capability validation
reference mapping
Start/End/Reference conflict
duration/resolution/aspect legality
reference budget
prompt translation
request payload
async status normalization
error normalization
output normalization
```

Adapter ไม่ทำ creative reasoning

---

## 37.26 Prompt Intent แยกจาก Raw API Payload

Agent คืน:

```text
scene/action
dialogue
camera
continuity locks
reference semantics
provider-neutral prompt intent
```

แล้ว:

```text
Provider Prompt Compiler
+
Provider Adapter
```

จึงสร้าง actual API payload

---

## 37.27 Tracing / Privacy

Tracing ใช้กับ:

```text
latency
tokens
stages
tool calls
failures
```

ไม่ควรเก็บ:

```text
provider API key
authorization token
password
unnecessary signed URLs
sensitive raw reference payload
```

default:

```text
traceIncludeSensitiveData = false
```

Tenant/project/run identifiers ควร opaque เมื่อทำได้

---

## 37.28 Guardrails

สองชั้น:

```text
Deterministic Controller Validation
+
Agents SDK Guardrails
```

Guardrail เป็น defense-in-depth ไม่ใช่ authorization engine

Agent output ไม่ควรมี authority fields เช่น:

```text
deductCredits
submitGeneration
publishNow
deleteAsset
providerApiKey
authorization
idempotencyKey
```

พบแล้วต้อง reject

---

## 37.29 Research Evidence Levels

แยก:

```text
user_fact
reference_observed
verified_research
category_convention
hypothesis
```

Category convention ห้ามกลายเป็น product-specific claim โดยไม่มี evidence

---

## 37.30 Generation Preflight

ก่อน paid call ตรวจ:

```text
provider available
model enabled
tenant allowed
asset authorized
duration legal
resolution legal
reference count legal
reference semantics legal
Start/Reference conflict resolved
cost estimated
credits sufficient
approval valid
idempotency valid
provider plan hash approved
```

Fail ข้อใด:

```text
ไม่ submit API
```

---

## 37.31 QC ต้องเป็น Hybrid

ผสม:

```text
deterministic checks
vision/audio analysis
Agent reasoning
human/brand QC when required
```

ไม่ควรใช้ LLM ตรวจทุกอย่าง

---

## 37.32 Bounded Repair Loop

```text
Generated Shot
↓
QC
├─ PASS → lock
└─ FAIL
    ↓
    classify
    ↓
    repairCountByShot + 1
    ↓
    exceeds limit?
    ├─ YES → human/provider-strategy escalation
    └─ NO → Repair Agent → minimal repair → regenerate → QC
```

ตัวอย่าง:

```text
maxRepairIterationsPerShot = 2
```

ถึง limit:

```text
REPAIR_LIMIT_REACHED
```

---

## 37.33 Canonical State ที่ต้อง Persist

อย่างน้อย:

```text
Promotion Target
Evidence
Research
Product/Place Mechanism
Expanded Intent
Concept
Script
Sequence
Shot Plans
Observed Start State
Reference Mapping
Speaker Mapping
Continuity Ledgers
Storyboard
Approvals
Generation Strategy
Provider Plan
Prompt Hash
Provider Jobs
QC
Repair
Costs
Published Output
Analytics
```

---

## 37.34 Version Lineage

เก็บ:

```text
skillVersion
workflowVersion
providerProfileId/version
adapterVersion
promptProfileVersion
model ID
Agent SDK version
Agent model
prompt hash
```

เพื่อ reproducibility

---

## 37.35 Error Classes ที่ต้องรองรับ

```text
AGENT_SDK_UNAVAILABLE
AGENT_SDK_VERSION_UNSUPPORTED
AGENT_MODEL_NOT_CONFIGURED
AGENT_CONTRACT_FAILURE
AGENT_SIDE_EFFECT_OUTPUT_FAILURE
AGENT_TOKEN_BUDGET_EXCEEDED

TENANT_SCOPE_FAILURE
ASSET_SCOPE_FAILURE
REFERENCE_RIGHTS_FAILURE

CHECKPOINT_VERSION_MISMATCH
SESSION_SCOPE_FAILURE

STORYBOARD_APPROVAL_REQUIRED
HIGH_COST_APPROVAL_REQUIRED
PUBLISH_APPROVAL_REQUIRED

PROVIDER_CAPABILITY_MISMATCH
PROVIDER_REFERENCE_CONFLICT
PROVIDER_DURATION_INVALID
PROVIDER_RESOLUTION_INVALID
PROVIDER_REFERENCE_BUDGET_EXCEEDED

CREDIT_INSUFFICIENT
IDEMPOTENCY_CONFLICT
PROVIDER_JOB_FAILED
PROVIDER_JOB_TIMEOUT

QC_FAILURE
REPAIR_LIMIT_REACHED
```

---

## 37.36 Recommended Runtime Structure

```text
src/smartaihub_video_director/
├── config.py
├── context.py
├── models.py
├── ports.py
├── schema_registry.py
├── sdk_compat.py
├── agent_factory.py
├── openai_runner.py
├── orchestrator.py
├── session.py
├── checkpoint.py
├── guardrails.py
├── tools.py
└── execution.py
```

Provider layer:

```text
adapters/
config/providers/
config/prompt-profiles/
schemas/providers/
```

---

## 37.37 End-to-End Production Runtime

```text
User Input
↓
Input Schema Validation
↓
Tenant / Asset Authorization
↓
Load/Create Checkpoint
↓
Specialist Agent Stages
↓
Schema Validate + Persist after each Stage
↓
Cross-shot Continuity
↓
Storyboard
↓
Storyboard Approval
↓
Generation Strategy
↓
Provider Capability Validation
↓
Prompt Intent
↓
Provider Prompt Compiler
↓
Provider Adapter Preflight
↓
Cost Estimate
↓
High-cost Approval if required
↓
Credit Reservation
↓
Idempotent Provider Submission
↓
Async Job / Output Ingest
↓
Hybrid QC
↓
Bounded Repair
↓
Human / Brand QC
↓
Post Production
↓
Publish Approval
↓
Publish
↓
Analytics
```

---

## 37.38 Definition of “Agents SDK Integration Complete”

ไม่ถือว่าเสร็จเพียงเพราะมีเอกสาร

ต้องมีจริง:

```text
SDK version gate
Agent definitions/factory
Runner integration
RunContext
Structured outputs
Stage schema validation
Read-only tools
Guardrails
Token accounting
Bounded contract retries
Session policy
Durable checkpoint
Cross-shot continuity
Asset authorization
Approval gates
Provider handoff
Tracing
Regression tests
```


# 38. Production Checklist

## 38.1 ก่อน Idea Approval

- [ ] Promotion Target ถูกหรือไม่
- [ ] Product / Place / Narrative branch ถูกหรือไม่
- [ ] Idea Expansion ไม่แต่ง feature มั่ว
- [ ] ถ้าไม่มี product image มี Missing Asset Decision แล้ว
- [ ] ถ้าเป็น Place มี Spatial Truth Policy
- [ ] Research Gate ถูกหรือไม่

---

## 38.2 ก่อน Storyboard Approval

- [ ] Cast ถูกคน
- [ ] Speaker mapping ถูก
- [ ] Start Frame state ถูก
- [ ] Action เริ่มจาก state จริง
- [ ] Product usage ถูก
- [ ] Place feature มี evidence
- [ ] Shot duration พอ
- [ ] Camera movement สมเหตุสมผล
- [ ] Multi-shot strategy เหมาะ
- [ ] Dialogue ไม่ overload
- [ ] VFX truth classification ถูก

---

## 38.3 ก่อน Generation

- [ ] Provider capabilities ผ่าน
- [ ] Duration ผ่าน
- [ ] Resolution ผ่าน
- [ ] References ไม่เกิน limit
- [ ] H3 hard/ref conflict แก้แล้ว
- [ ] Exact UI/label แยกไป post แล้ว
- [ ] Budget ผ่าน
- [ ] Approval ผ่าน
- [ ] Idempotency key พร้อม

---

## 38.4 หลัง Generation

- [ ] Identity QC
- [ ] Product/place QC
- [ ] Hand/object QC
- [ ] Usage QC
- [ ] Dialogue QC
- [ ] Audio sync QC
- [ ] Reference retention QC
- [ ] Seam QC
- [ ] Sequence QC
- [ ] Claim/spatial truth QC

---

## 38.5 ก่อน 2K / Final

- [ ] Content 768P ผ่านแล้ว
- [ ] Dialogue ผ่านแล้ว
- [ ] Product identity ผ่านแล้ว
- [ ] No major repair pending
- [ ] Regeneration preservation plan พร้อม

---

## 38.6 ก่อน Publish

- [ ] Exact label/logo/UI
- [ ] CTA
- [ ] Subtitle
- [ ] Audio loudness
- [ ] Platform aspect ratio
- [ ] Brand review
- [ ] Legal/compliance review
- [ ] Publish approval

---

# 39. Glossary

## Promotion Target

สิ่งที่วิดีโอกำลังโปรโมต รีวิว หรือพยายามให้ผู้ชมสนใจ

---

## Source of Truth

Reference ที่ถือว่าเป็นข้อมูลจริงที่ต้องรักษา

---

## Start Frame

ภาพแรกที่เป็น State #0 ของ shot

---

## End Frame

ภาพปลายทางที่ต้องการให้ shot จบ

---

## Logical Shot

Shot ในเชิง creative/editorial

ไม่จำเป็นต้องเท่ากับ API call

---

## Generation Segment

วิดีโอที่เกิดจาก provider generation call หนึ่งครั้ง

---

## Prompt Turn

Prompt ของ base หรือ extension turn หนึ่งครั้ง

---

## Native Multi-shot

Provider สร้างหลาย shot/cut ภายในคลิปเดียว

---

## Extension Chain

วิดีโอถูกต่อผ่านหลาย generation turns

---

## Reference Continuation

สร้างคลิปใหม่โดยใช้คลิปก่อนหน้าเป็น reference เพื่อให้ต่อเนื่อง

ต่างจาก native append

---

## Seam

รอยต่อระหว่าง segment

---

## State Ledger

ข้อมูล state ที่เก็บว่าตอนนี้:

```text
ใครอยู่ไหน
ถืออะไร
ทำอะไรเสร็จแล้ว
สินค้าอยู่สภาพไหน
พูดอะไรไปแล้ว
กล้องอยู่แบบไหน
```

---

## Visual Identity

รูปลักษณ์ของสินค้า/คน/ร้านที่ต้องรักษา

---

## Factual Identity

ข้อมูลข้อเท็จจริง เช่นชื่อรุ่น feature specification

---

## Product Mechanism

กลไกและ functional behavior ของสินค้า

---

## Place Experience

โครงสร้างการเล่าประสบการณ์ของร้าน/สถานที่

---

## Visual Explanation

VFX/graphics ที่ช่วยอธิบายสิ่งที่มองไม่เห็น

---

## Literal Observed

สิ่งที่เห็นจริง

---

## Supported Explanatory

ภาพอธิบายที่มี fact รองรับ

---

## Stylized Illustrative

ภาพอธิบายเชิง creative ไม่ควรถูกตีความเป็น measurement จริง

---

## Ref2VA

Reference-to-Video with Audio ของ MiniMax H3

---

## H3 Context-IR

ระบบของ H3 สำหรับตีความ multimodal context ให้เป็น prompt ที่เหมาะกับ H3

---

## Regenerate-2K

H3 workflow สำหรับนำผล H3 ที่ผ่านแล้วไปสร้างรายละเอียดระดับ 2K

---

# Appendix A — Input Field Reference

| Field | จำเป็น | ค่าเริ่มต้น / แนวทาง |
|---|---|---|
| `idea` | **จำเป็น** | ข้อความ Idea/เรื่องย่อ |
| `schemaVersion` | ไม่จำเป็น | `11.0.0` |
| `locale` | ไม่จำเป็น | `th-TH` |
| `contentMode` | ไม่จำเป็น | `auto` |
| `product` | ไม่จำเป็น | ข้อมูลสินค้า |
| `goal` | ไม่จำเป็น | เป้าหมายวิดีโอ |
| `targetAudience` | ไม่จำเป็น | กลุ่มเป้าหมาย |
| `callToAction` | ไม่จำเป็น | CTA |
| `ideaExpansionPolicy` | ไม่จำเป็น | วิธีให้ LLM ขยาย Idea |
| `cast` | ไม่จำเป็น | ตัวละคร |
| `dialogue` | ไม่จำเป็น | บทพูด |
| `assets` | ไม่จำเป็น | ภาพ/เสียง/วิดีโอ |
| `format` | ไม่จำเป็น | duration/aspect/shot strategy |
| `startFramePolicy` | ไม่จำเป็น | Start Frame rules |
| `modelRouting` | ไม่จำเป็น | Provider/model |
| `researchMode` | ไม่จำเป็น | `auto` |
| `generationMode` | ไม่จำเป็น | `plan_only` |
| `approvalPolicy` | ไม่จำเป็น | Approval gates |
| `budget` | ไม่จำเป็น | Credit / retry |
| `qcPolicy` | ไม่จำเป็น | QC threshold |
| `constraints` | ไม่จำเป็น | ข้อกำหนดพิเศษ |
| `demonstrationPolicy` | ไม่จำเป็น | Product demo |
| `visualExplanationPolicy` | ไม่จำเป็น | VFX |
| `agentExecutionProfile` | ไม่จำเป็น | `production` |
| `providerOptions` | ไม่จำเป็น | Provider-specific |
| `promotionTarget` | ไม่จำเป็น | Auto/explicit target |
| `missingTargetAssetPolicy` | ไม่จำเป็น | ไม่มีภาพสินค้า |
| `placePromotionPolicy` | ไม่จำเป็น | ร้าน/สถานที่ |

---

# Appendix B — Content Mode Reference

```text
auto
silent_demo
presenter
dialogue_scene
voice_over
ugc
cinematic
product_only
tutorial
comparison
testimonial
place_tour
store_review
venue_review
service_review
location_promo
experience_review
```

---

# Appendix C — Recommended Decision Tree

```text
START
↓
มี Idea?
├─ NO → ต้องมี Idea ก่อน
└─ YES
    ↓
มีสิ่งที่โปรโมตชัดไหม?
    ├─ Product
    │   ↓
    │   มี Product Image?
    │   ├─ YES → lock visual identity
    │   └─ NO
    │       ├─ อยู่ใน Scene? → derive
    │       ├─ Generic? → continue generic
    │       ├─ Named but non-exact? → research + warning
    │       └─ Exact brand? → request/block
    │
    ├─ Place
    │   ↓
    │   ภาพ Scene คือสถานที่นั้น?
    │   ├─ YES → place source-of-truth
    │   └─ NO → request/reference/research
    │
    ├─ Service / Digital / Event
    │   ↓
    │   Experience Journey
    │
    └─ ไม่มี
        ↓
        Narrative Only
↓
มี Start Frame?
├─ YES → State #0
└─ NO → Start State Design
↓
มี Dialogue?
├─ YES → Speaker + Timing + Lip Sync
└─ NO → Silent / VO / ambience
↓
Sequence
↓
Shot Duration
↓
Provider
↓
Capability Check
↓
Prompt
↓
Approval
↓
Generate
↓
QC
↓
Repair/Post
↓
FINAL
```

---

# Appendix D — ค่าที่แนะนำสำหรับ Production

```json
{
  "schemaVersion": "11.0.0",
  "locale": "th-TH",
  "contentMode": "auto",
  "researchMode": "auto",
  "generationMode": "generate_after_storyboard_approval",
  "agentExecutionProfile": "production",

  "ideaExpansionPolicy": {
    "mode": "auto",
    "allowNonMaterialAssumptions": true,
    "askWhenCritical": true,
    "maxInferredActionSteps": 12
  },

  "approvalPolicy": {
    "requireExpandedIdeaApproval": false,
    "requireStoryboardApproval": true,
    "requireHighCostGenerationApproval": true,
    "requirePublishApproval": true
  },

  "budget": {
    "maxRepairIterationsPerShot": 2,
    "candidateCountPerShot": 1
  },

  "demonstrationPolicy": {
    "mode": "auto",
    "requireCorrectUsage": true,
    "allowBeforeAfter": true,
    "allowTimeCompression": true,
    "maxMajorActionsPerShot": 4,
    "preferProofMoment": true
  },

  "visualExplanationPolicy": {
    "mode": "balanced",
    "allowIllustrativeEffects": true,
    "allowVirtualScreen": true,
    "allowCutaway": true,
    "allowExplodedView": true,
    "allowParticleAndFlowEffects": true,
    "preferPostCompositeForExactTextOrUI": true,
    "requireTruthClassification": true,
    "requireEvidenceForFeatureVisualization": true,
    "allowStylizedIllustration": true
  },

  "missingTargetAssetPolicy": {
    "mode": "auto",
    "allowGenericUnbrandedVisual": true,
    "allowDeriveTargetFromScene": true,
    "allowResearchFactsWithoutVisualReference": true,
    "allowGenerateApproximateNamedProduct": false,
    "requireReferenceForExactPackagingLogoUi": true
  },

  "placePromotionPolicy": {
    "mode": "auto",
    "unseenAreaPolicy": "visible_only",
    "allowEnvironmentImageAsTargetEvidence": true,
    "allowDerivedCropsAndDetailShots": true,
    "allowVirtualMapOrCallout": true,
    "requireEvidenceForFacilityClaims": true,
    "preserveStorefrontOrSignage": true
  }
}
```

---

# สรุป

Generic Commercial Video Director v11 ถูกออกแบบให้เริ่มจาก **Idea ที่อาจสั้นมาก** แล้วค่อยทำความเข้าใจว่า:

```text
กำลังเล่าเรื่องอะไร
↓
กำลังโปรโมตอะไร
↓
มี Reference อะไร
↓
ข้อมูลไหนเป็น Source of Truth
↓
ต้องทำ action อะไร
↓
ต้องพิสูจน์อะไร
↓
ต้องใช้กี่ shot
↓
แต่ละ shot ยาวเท่าไร
↓
Provider ไหนเหมาะ
↓
ต้อง direct / multi-shot / extension / continuation แบบใด
↓
Prompt แต่ละ generation turn คืออะไร
↓
ต้อง QC และ repair จุดไหน
```

แนวทางที่แนะนำที่สุดคือ:

> **ให้ผู้ใช้กรอกให้น้อยที่สุด แต่ให้ระบบเก็บ structured evidence, state, approval และ provider capability ให้ละเอียดที่สุด**

ผู้ใช้จึงสามารถเริ่มเพียง:

```text
"เธอเทแชมพูจากขวดเอามาสระผม"
```

หรือ:

```text
"พาชมร้านนี้ตามภาพ"
```

แต่ระบบภายในยังสามารถทำงานด้วยระดับความละเอียดที่เหมาะสำหรับ Production ได้
---

# 40. Operations — Resume / Retry / Budget / Failure Recovery

## 40.1 Resume หลัง Restart

```text
Load run/checkpoint
↓
Validate scope + workflow version
↓
Load canonical stage outputs
↓
Inspect approval/provider-job state
↓
Continue from next legal stage
```

ถ้ามี existing `providerJobId`:

```text
poll/query existing job
```

ห้าม submit ซ้ำเพียงเพราะ process memory หาย

---

## 40.2 Retry ต้องแยกชนิด

### Agent Contract Retry

```text
schema fail → bounded Agent repair
```

### Provider Transport Retry

```text
temporary network / provider 5xx → deterministic retry
```

### Creative Repair

```text
generation สำเร็จแต่ QC fail → paid repair generation
```

สามแบบต้องมี counter แยกกัน

---

## 40.3 Failure Recovery Matrix

| Failure | Action |
|---|---|
| Agents SDK missing | stop Agent stage; non-Agent schemas/adapters remain usable |
| SDK version unsupported | block runtime until compatibility regression passes |
| Agent model missing | block before Runner |
| Agent schema fail | bounded contract repair |
| Agent references unauthorized asset | reject output + security event |
| Checkpoint version mismatch | require migration |
| Storyboard not approved | block generation |
| Provider capability mismatch | adapt/fallback/block |
| Credits insufficient | do not submit |
| Timeout after provider submit | query by existing job/idempotency state before retry |
| QC fail | minimal repair |
| Repair limit reached | human/provider strategy escalation |
| Publish approval missing | do not publish |

---

## 40.4 Incident Audit

ระบบควรย้อนตอบได้:

```text
who initiated
tenant/project/run
Skill/workflow version
Agent SDK/model
token per stage
provider profile/version
prompt hash
asset IDs
approval state
provider job
credit/cost
QC result
repair count
final asset
```

---

# 41. Provider Runtime Responsibility Matrix

กฎกลาง:

```text
Agent     = recommend
Profile   = provider capability truth
Adapter   = validate + translate
Controller= authorize + pay + submit
```

| Provider | Agent Reasoning | Deterministic Validation |
|---|---|---|
| MiniMax H3 | mode/ref/multi-shot strategy | H3 mode, durations, refs, native audio, local/cloud |
| Grok 1.5 | Start vs Reference | mutually exclusive modes, ref/voice/resolution limits |
| Wan 3.0 | hard-frame vs multimodal, native multi-shot | XOR rules, ref budgets, input-video + output <=30s |
| FLUX 3 | literal keyframe vs soft ref | max keyframes, V2V source, literal timeline semantics |
| Seedance 2.0 | short/high-res strategy | 4–15s, 9/3/3, audio-only restriction, resolution |
| Seedance 2.5 | 30s/ref-heavy/extension | 30/10/10, route resolution, extension/material rules |
| LTX 2.5 Cloud | Fast/Pro, T2V/I2V/A2V | model matrix, A2V soundtrack semantics, cloud limitations |
| LTX 2.5 Local | IC-LoRA/workflow strategy | workflow ID/version, local capability/hardware |
| Omni | base + extension plan | extension/total-duration constraints |
| Veo/Kling/Hailuo | creative suitability | verified profile only; unknown = fail closed |

---

## 41.1 Capability Unknown

```text
status = unknown
```

ห้าม Agent เปลี่ยนเป็น `supported`

ใช้:

```text
fallback
derive
split workflow
human selection
block
```

---

# 42. Migration Guide — v10 → v11

v11 เปลี่ยนหลัก ๆ ที่ Agent Runtime

## 42.1 Version Consistency

ทุกไฟล์ release ต้องใช้:

```text
11.0.0
```

ตรงกันใน:

```text
README
SKILL.md
manifest
input/output/ui schemas
User Guide
runtime package
tests
```

---

## 42.2 Documentation-only → Executable Runtime

v10 เน้น architecture docs

v11 production target ต้องมี:

```text
AgentFactory
Runner Adapter
RunContext
Orchestrator
Tools
Guardrails
Session Adapter
Checkpoint Manager
```

---

## 42.3 Session → Durable Checkpoint

```text
Session = optional history
DB + Checkpoint = canonical
```

---

## 42.4 Shot Isolation → Cross-shot Continuity

Shot planning ต้องอ่าน approved continuity ของ shot ก่อนหน้า

---

## 42.5 Retry → Typed Retry Categories

แยก:

```text
contract retry
transport retry
creative repair
```

---

## 42.6 Token Accounting

ทุก attempt ถูกนับ:

```text
failed schema attempt
+
successful repair attempt
=
stage token usage
```

---

## 42.7 Asset Authorization

v11 ตรวจ asset:

```text
ก่อน model เห็น
+
หลัง model อ้างใน output
```

---

## 42.8 Paid Provider Plan

ก่อน paid submission ต้องมี:

```text
verified provider profile
provider plan hash
cost estimate
approval
credit reservation
idempotency
```

---

## 42.9 Migration Acceptance Tests

```text
resume after restart
session off/on
cross-tenant asset attempt
schema contract repair
token cap
approval blocks
credit insufficient
duplicate submit/idempotency
provider timeout recovery
QC repair cap
provider fallback
publish approval
```

---

# 43. v11 Documentation Completeness Checklist

- [x] Hybrid Agent Skill architecture
- [x] SmartAIHub Controller authority
- [x] OpenAI Agents SDK bounded reasoning role
- [x] Non-Agent components can operate independently
- [x] SDK version policy
- [x] Explicit Agent model requirement
- [x] Stage → Schema mapping
- [x] Structured-output repair
- [x] Aggregate token-budget policy
- [x] Reasoning cost vs generation credits
- [x] Session vs canonical state
- [x] Durable checkpoint/resume
- [x] Workflow version mismatch behavior
- [x] Cross-shot continuity
- [x] Minimum necessary context
- [x] Input/output asset authorization
- [x] Bounded read-only Agent tools
- [x] No unrestricted paid-side-effect Agent tools
- [x] Storyboard / high-cost / publish approvals
- [x] Idempotency requirement
- [x] Provider plan hash
- [x] Provider Profile = provider truth
- [x] Prompt Intent separated from API payload
- [x] Tracing/privacy policy
- [x] Deterministic + SDK guardrails
- [x] Hybrid QC
- [x] Bounded repair loop and repair limit
- [x] Persist state after each stage
- [x] Provider version lineage
- [x] Error/recovery matrix
- [x] Provider responsibility matrix
- [x] Migration v10 → v11
- [x] LTX 2.5 Cloud/Local separation
- [x] H3/Grok/Wan/FLUX/Seedance/LTX/Omni routing boundaries

> Checklist นี้หมายถึง **คู่มือระบุ contract ครบแล้ว** แต่ Production Release ยังต้องผ่าน runtime/provider regression และ package audit ก่อนประกาศว่า code production-ready

# AI Prompt Generation Guide
*Knowledge File สำหรับ Smart Character Creator Pro*

## โครงสร้างพรอมต์มาตรฐาน

## รูปแบบการแสดงผลพรอมต์

## รูปแบบการแสดงผลพรอมต์

### ✅ รูปแบบที่ถูกต้อง - Plain Text ไม่มี Formatting:

1. CLOSE-UP SHOT

Close-up portrait of Nida. A 17-year-old East Asian female with feminine appearance. Light fair skin with neutral undertone and smooth clear complexion. Oblong face with normal forehead, straight hairline, low cheekbones, soft jaw, and round chin. Double eyelid green eyes, normal size, with long thick eyelashes and normal eye distance. Medium-length straight natural black hair to the shoulders with silky texture and high volume. Straight small delicate nose with refined bridge, pointed tip, and narrow nostrils. Bow-shaped thin lips in natural red with defined cupid's bow and smooth texture. Average height with slender graceful build displaying calm and graceful posture with serious aura and quiet confidence. White cotton blouse with delicate lace collar, subtle pearl earrings, natural makeup with flawless finish. Direct eye contact with camera, gentle composed expression, head positioned straight, shoulders relaxed. Professional studio setting with seamless white backdrop. Studio lighting setup, key light with soft box, beauty lighting for flawless skin, ultra high resolution, tack sharp focus on eyes, professional color grading. Shot on Canon EOS R5 85mm f/1.2L Kodak Portra 400 --ar 9:16

---

2. PORTRAIT SHOT

Portrait shot of Nida. A 17-year-old East Asian female with feminine appearance. Light fair skin with neutral undertone and smooth clear complexion. Oblong face with normal forehead, straight hairline, low cheekbones, soft jaw, and round chin. Double eyelid green eyes, normal size, with long thick eyelashes and normal eye distance. Medium-length straight natural black hair to the shoulders with silky texture and high volume. Straight small delicate nose with refined bridge, pointed tip, and narrow nostrils. Bow-shaped thin lips in natural red with defined cupid's bow and smooth texture. Average height with slender graceful build displaying calm and graceful posture with serious aura and quiet confidence. Soft pastel pink knit sweater with round neckline, delicate gold chain necklace. Three-quarter angle facing camera, serene composed expression, hands positioned naturally below frame. Professional studio setup with neutral cream backdrop. Studio beauty lighting for smooth skin texture, tack sharp focus, professional color grading for commercial quality. Shot on Sony A7R IV 135mm f/1.8 GM Fujicolor Pro 400H --ar 9:16

---

### ❌ รูปแบบที่ผิด - มี Formatting:

**=== 1. CLOSE-UP SHOT ===**

```
Close-up portrait of...
```

หรือ

### 1. Close-up Shot
**Character:** A 17-year-old...
**Clothing:** White blouse...

### 🎯 หลักการแสดงผล:

1. ใช้ตัวเลขธรรมดา: 1. 2. 3. 4.
2. หัวข้อเป็นตัวอักษรธรรมดา ไม่ bold
3. พรอมต์เป็นพารากราฟเดียวยาว
4. แยกด้วยเส้นประ --- เท่านั้น
5. ไม่มี formatting, emoji, สัญลักษณ์พิเศษ
6. ผู้ใช้สามารถเลือกและ copy ได้ทันที

## 4 ประเภทภาพหลัก

### 1. Close-up Shot
**จุดเน้น:** ใบหน้า สายตา รายละเอียดผิว
```
Close-up portrait of [Character Name]
- โฟกัสที่ใบหน้าและสายตา
- แสงนุ่มเน้นเนื้อผิว
- ฉากหลังเบลอมาก (bokeh)
- เห็นได้แค่หัวและลำคอส่วนบน
```

### 2. Portrait-only
**จุดเน้น:** หัว ไหล่ ลำคอบน
```
Portrait shot of [Character Name]
- เห็นตั้งแต่หัวจนถึงไหล่
- สามารถเห็นเสื้อผ้าบริเวณคอและไหล่
- ฉากหลังสีพื้นหรือเบลอ
- เน้นการแสดงออกและบุคลิก
```

### 3. Medium Shot
**จุดเน้น:** เอวขึ้นไป มีปฏิสัมพันธ์กับสิ่งแวดล้อม
```
Medium shot of [Character Name]
- เห็นตั้งแต่หัวจนถึงเอว
- มีการโต้ตอบกับสิ่งแวดล้อม
- ฉากหลังมีรายละเอียดพอสมควร
- เน้นท่าทางและการใช้มือ
```

### 4. Full Body Shot
**จุดเน้น:** ตัวเต็ม ท่าทาง สิ่งแวดล้อมสมบูรณ์
```
Full body shot of [Character Name]
- เห็นตัวเต็มจากหัวจรดเท้า
- ฉากหลังมีรายละเอียดครบถ้วน
- เน้นท่าทาง รูปร่าง การเคลื่อนไหว
- แสดงความสัมพันธ์กับสิ่งแวดล้อม
```

## การเลือกเสื้อผ้าและฉากหลัง

### หลักการเลือก:
1. **สอดคล้องกับบุคลิก** - ใช้ข้อมูลจาก personality_posture
2. **เหมาะกับวัยและเพศ** - ใช้ข้อมูลจาก age + gender_identity  
3. **เข้ากับสีผิว** - ใช้ข้อมูลจาก ethnicity_skin
4. **สมจริงและเป็นธรรมชาติ** - หลีกเลี่ยงสิ่งแปลกประหลาด

### ตัวอย่างการเลือกฉากหลัง:

#### ❌ ผิด (นามธรรม):
- "romantic setting"
- "modern environment" 
- "cozy atmosphere"

#### ✅ ถูก (รายละเอียดจำเพาะ):
- "ห้องนอนที่มีผ้าปูเตียงสีขาว โคมไฟหิ่งห้อยสีทองนวล กลีบกุหลาบแดงโปรยบนเตียง"
- "สำนักงานที่มีโต๊ะทำงานสีขาวเงา เก้าอี้หนังสีดำ หน้าจอคอมพิวเตอร์ 27 นิ้ว ผนังกระจกมองเห็นตึกสูง"
- "ห้องนั่งเล่นที่มีโซฟาผ้ากำมะหยี่สีครีม หมอนอิงลายดอก โต๊ะกาแฟไม้สัก เทียนหอมจุดอยู่"

## เทคนิคการถ่ายภาพ

## เทคนิคการถ่ายภาพ Professional Studio

### ประเภทแสง Studio Professional:
- **Studio lighting setup** - ไฟสตูดิโอแบบมืออาชีพ
- **Key light + fill light + rim light** - แสงหลัก แสงเติม แสงขอบ
- **Soft box lighting** - แสงนุ่มจากซอฟต์บ็อกซ์
- **Ring light portrait** - แสงวงกลมสำหรับพอร์ตเทรต
- **Beauty lighting** - แสงเสริมความงาม
- **Clamshell lighting** - แสงแบบหอยสองฝา
- **Rembrandt lighting** - แสงเรมบรันดท์คลาสสิก

### คุณภาพภาพระดับ Professional:
- **Ultra high resolution** - ความละเอียดสูงสุด
- **Tack sharp focus** - โฟกัสคมชัดสุด
- **Perfect skin retouching** - ผิวเรียบเนียนสมบูรณ์
- **Professional color grading** - การปรับสีระดับมืออาชีพ
- **Studio quality** - คุณภาพระดับสตูดิโอ
- **Commercial photography** - การถ่ายภาพเชิงพาณิชย์
- **Fashion photography lighting** - แสงถ่ายแฟชั่น

### เทคนิคผิวและสีสัน:
- **Flawless skin tone** - โทนผิวสมบูรณ์แบบ
- **Even skin texture** - เนื้อผิวเรียบเสมอ
- **Natural skin glow** - ผิวเปล่งประกายธรรมชาติ
- **Perfect makeup blend** - เมคอัพเบลนด์สมบูรณ์
- **Vibrant color palette** - จานสีสดใส
- **Rich color depth** - ความลึกของสี
- **Cinematic color grading** - การไล่สีแบบภาพยนตร์

### การจัดองค์ประกอบ Studio:
- **Professional composition** - องค์ประกอบมืออาชีพ
- **Perfect symmetry** - ความสมมาตรสมบูรณ์
- **Golden ratio framing** - การจัดเฟรมอัตราทอง
- **Dynamic pose** - ท่าทางมีชีวิตชีวา
- **Confident expression** - การแสดงออกมั่นใจ

### กล้องและเลนส์ระดับ Professional:
- **Canon EOS R5 with 85mm f/1.2L** - กล้องและเลนส์ระดับสูง
- **Sony A7R IV with 135mm f/1.8 GM** - ความละเอียดสูงสุด
- **Fujifilm GFX100S medium format** - ฟอร์แมตกลาง
- **Phase One IQ4 150MP** - ความละเอียดระดับสุดยอด

### ฟิล์มและการประมวลผล:
- **Kodak Portra 400 professional** - ฟิล์มมืออาชีพ
- **Fujicolor Pro 400H** - สีสันสวยงาม
- **Professional RAW processing** - การประมวลผล RAW
- **Color calibrated workflow** - ขั้นตอนการปรับสีมาตรฐาน

## การแปลภาษาไทย

### รูปแบบการแปล:
```
**คำแปลไทย:**
[ประเภทภาพ] ของ [ชื่อตัวละคร]

รายละเอียดตัวละคร:
- [แปลรายละเอียดทุกส่วน]

เสื้อผ้า: [อธิบายการแต่งตัว]
ท่าทาง: [อธิบายการโพส]
ฉากหลัง: [อธิบายสิ่งแวดล้อม]
แสงและมุมกล้อง: [อธิบายเทคนิค]

ถ่ายด้วย [กล้อง] [ฟิล์ม] อัตราส่วน 9:16
```

## การตรวจสอบคุณภาพ

### ✅ Checklist ก่อนส่งพรอมต์:
- [ ] ฝังข้อมูล JSON ครบทุก field ที่มี แบบเต็มรายละเอียด
- [ ] **ห้ามใช้ "[same as JSON above]" หรือคำย่อใดๆ**
- [ ] เขียนรายละเอียดตัวละครเต็มทุกหมวดหมู่
- [ ] ไม่มีคำนามธรรม (romantic, cozy, modern)
- [ ] เสื้อผ้าและฉากสมเหตุสมผล
- [ ] มีเทคนิคการถ่ายภาพระดับมืออาชีพ
- [ ] มีคำแปลภาษาไทยครบถ้วน
- [ ] ปิดท้ายด้วย shot on [Camera] [Film]

### ❌ สิ่งที่ต้องหลีกเลี่ยง:
- **การใช้ "[same as JSON above]" หรือ "[as described above]"**
- การข้ามรายละเอียดจาก JSON
- การใช้คำบรรยายอารมณ์แทนรายละเอียดภาพ
- การเลือกเสื้อผ้า/ฉากที่ไม่เข้ากับตัวละคร
- การลืมใส่ข้อมูลเทคนิคการถ่าย

## 🚨 **CRITICAL RULE: Character Consistency**

### ⚠️ **ปัญหาที่พบบ่อย:**
```
❌ Prompt 1: "17-year-old East Asian, light fair skin, green eyes, black hair"
❌ Prompt 2: "late teen East Asian, light pinkish skin, green eyes, black hair"
❌ Prompt 3: "young Asian girl, medium skin, dark eyes, long hair"
```
**ผลลัพธ์:** ตัวละครเดียวกันดูเป็น 3 คนต่างกัน!

### ✅ **วิธีแก้ที่ถูกต้อง:**
**ทุกพรอมต์ต้องมีรายละเอียดเหมือนกันเป็น 100%**

```
✅ Prompt 1: "17-year-old East Asian female with feminine appearance. Light fair skin with neutral undertone. Oblong face with normal forehead, straight hairline, low cheekbones, soft jaw, and round chin. Double eyelid green eyes, normal size, with long eyelashes. Medium-length straight natural black hair to the shoulders. Straight small delicate nose with pointed tip. Bow-shaped thin lips in natural red with defined cupid's bow. Calm and graceful posture with serious aura."

✅ Prompt 2: "17-year-old East Asian female with feminine appearance. Light fair skin with neutral undertone. Oblong face with normal forehead, straight hairline, low cheekbones, soft jaw, and round chin. Double eyelid green eyes, normal size, with long eyelashes. Medium-length straight natural black hair to the shoulders. Straight small delicate nose with pointed tip. Bow-shaped thin lips in natural red with defined cupid's bow. Calm and graceful posture with serious aura."

✅ Prompt 3: "17-year-old East Asian female with feminine appearance. Light fair skin with neutral undertone. Oblong face with normal forehead, straight hairline, low cheekbones, soft jaw, and round chin. Double eyelid green eyes, normal size, with long eyelashes. Medium-length straight natural black hair to the shoulders. Straight small delicate nose with pointed tip. Bow-shaped thin lips in natural red with defined cupid's bow. Calm and graceful posture with serious aura."
```

### 📋 **Character Lock Checklist - ต้องเหมือนกันทุกพรอมต์:**
- [ ] **อายุที่แน่นอน** (17-year-old ≠ late teen ≠ young girl)
- [ ] **เชื้อชาติเต็ม** (East Asian female)
- [ ] **โทนผิวแน่นอน** (Light fair skin with neutral undertone)
- [ ] **รูปหน้าครบ** (Oblong face with normal forehead, low cheekbones, soft jaw, round chin)
- [ ] **ตาครบรายละเอียด** (Double eyelid green eyes, normal size, long eyelashes)
- [ ] **ผมครบรายละเอียด** (Medium-length straight natural black hair to shoulders)
- [ ] **จมูกเต็ม** (Straight small delicate nose with pointed tip)
- [ ] **ปากเต็ม** (Bow-shaped thin lips in natural red with defined cupid's bow)
- [ ] **บุคลิกเต็ม** (Calm and graceful posture with serious aura)

### 🔒 **วิธีการ Character Lock:**
1. **อ่าน JSON Profile ทั้งหมด**
2. **เขียนประโยคตัวละครเต็มแบบเดียวกัน**
3. **Copy-paste ส่วน CHARACTER DETAILS ให้เหมือนกันทุกพรอมต์**
4. **เปลี่ยนแค่ CLOTHING, POSE, ENVIRONMENT เท่านั้น**

#### ❌ **ผิด - ใช้การอ้างอิง:**
```
CHARACTER DETAILS:
[รายละเอียดเต็มเหมือนด้านบน]
[same as JSON profile]
[ตามที่อธิบายไว้แล้ว]
```

#### ✅ **ถูก - เขียนเต็มทุกครั้ง:**
```
CHARACTER DETAILS:
A 22-year-old Southeast Asian Thai woman with youthful feminine expression. Medium warm skin tone with golden undertone and smooth clear complexion. Heart-shaped face with average forehead, high prominent cheekbones, defined jawline, and pointed chin. Large almond-shaped dark brown eyes with long thick eyelashes and normal eye distance. Long straight black hair with silky texture styled in loose waves with high volume. Straight Greek nose with refined bridge, rounded tip, and narrow nostrils. Medium thickness heart-shaped lips in natural pink with defined cupid's bow. 165cm height with hourglass body shape, toned athletic build, displaying confident upright posture. Personality shows bright cheerful expression with high energy and strong confidence.
```

### 🎯 **หลักการเขียนที่ถูกต้อง:**

1. **อ่าน JSON ทั้งหมด** ก่อนเขียนพรอมต์
2. **เขียนเป็นพารากราฟต่อเนื่อง** ไม่ใช่ list แยกส่วน  
3. **รวมรายละเอียดที่เกี่ยวข้อง** ให้เป็นประโยคเดียว
4. **ไม่อ้างอิงสิ่งใดเลย** - แต่ละพรอมต์ต้องสมบูรณ์ในตัวเอง

## ตัวอย่างการใช้ Face Lock

เมื่อผู้ใช้กด **S** ให้เพิ่ม:
```
Use the exact same facial features, bone structure, eyes, nose, mouth, jawline, and ears from the reference photo. Do not change any facial details, expression, or shape. Face lock strict. Only change shirt color and background. The image must look identical to the reference face.
```
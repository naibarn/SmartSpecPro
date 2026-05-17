# JSON Profile Structure Guide
*Knowledge File สำหรับ Smart Character Creator Pro*

## Complete JSON Structure

```json
{
  "name": "[Character Name]",
  
  // Priority 1-3: จำเป็นต้องระบุ
  "gender_identity": {
    "identity": "[เพศสภาวะ]",
    "expression": "[การแสดงออกทางเพศ]"
  },
  "age": {
    "range": "[ช่วงอายุ]",
    "appearance": "[ลักษณะตามวัย]",
    "specific_age": "[อายุที่แน่นอน ถ้าระบุ]"
  },
  "ethnicity_skin": {
    "ethnicity": "[เชื้อชาติ/ภูมิภาค]",
    "skin_tone": "[โทนสีผิว]",
    "undertone": "[อันเดอร์โทน]",
    "special_features": "[ลักษณะพิเศษของผิว ถ้ามี]"
  },
  
  // Priority 4-6: ควรระบุ
  "face_structure": {
    "face_shape": "[รูปหน้าโดยรวม]",
    "forehead": "[ลักษณะหน้าผาก]",
    "hairline": "[แนวไรผม]",
    "cheekbones": "[โหนกแก้ม]",
    "jaw": "[กราม]",
    "chin": "[คาง]"
  },
  "eyes": {
    "shape": "[รูปทรงตา]",
    "size": "[ขนาดตา]",
    "color": "[สีตา]",
    "eyelashes": "[ขนตา]",
    "under_eyes": "[บริเวณใต้ตา]",
    "distance": "[ระยะห่างตา]",
    "depth": "[ความลึกของตา]"
  },
  "body_proportions": {
    "height": "[ส่วนสูง]",
    "body_shape": "[รูปร่าง]",
    "weight_build": "[น้ำหนัก/ความอ้วนผอม]",
    "muscle_tone": "[กล้ามเนื้อ]",
    "posture": "[ท่าทางการยืน]",
    "bust_chest": "[ทรงเสื้อหรือซิลูเอตช่วงลำตัวบนแบบปลอดภัย]",
    "waist": "[เอว]",
    "hips": "[สะโพก]"
  },
  
  // Priority 7-10: แนะนำให้ระบุ
  "hair": {
    "length": "[ความยาวผม]",
    "style": "[ทรงผม]",
    "texture": "[เนื้อผม/ลอน]",
    "color": "[สีผม]",
    "volume": "[ปริมาณผม]",
    "special_styling": "[การจัดแต่งพิเศษ]"
  },
  "nose": {
    "overall_shape": "[รูปทรงโดยรวม]",
    "bridge": "[สันจมูก]",
    "tip": "[ปลายจมูก]",
    "nostrils": "[ปีกจมูก]",
    "size": "[ขนาดโดยรวม]"
  },
  "mouth": {
    "lip_shape": "[รูปทรงริมฝีปาก]",
    "cupids_bow": "[Cupid's Bow]",
    "symmetry": "[ความสมมาตร]",
    "natural_color": "[สีธรรมชาติ]",
    "texture": "[เนื้อสัมผัส]",
    "thickness": "[ความหนา]"
  },
  "personality_posture": {
    "general_posture": "[ท่าทางโดยรวม]",
    "walking_style": "[การเดิน]",
    "hand_gestures": "[การใช้มือ]",
    "facial_expression": "[สีหน้าโดยรวม]",
    "energy_level": "[ระดับพลังงาน]",
    "confidence_level": "[ระดับความมั่นใจ]"
  },
  
  // Priority 11-17: เลือกได้
  "skin_details": {
    "texture": "[เนื้อผิว]",
    "brightness": "[ความเงางาม]",
    "blemishes": "[ข้อบกพร่อง]",
    "freckles": "[กระเผลก]",
    "moles": "[ไฝ]",
    "scars": "[แผลเป็น]",
    "pores": "[รูขุมขน]",
    "tan_lines": "[รอยแทน]"
  },
  "eyebrows": {
    "thickness": "[ความหนา]",
    "shape": "[รูปทรง]",
    "grooming": "[ความเรียบร้อย]",
    "arch": "[โค้ง]",
    "distance": "[ระยะห่างจากตา]",
    "color": "[สีคิ้ว]"
  },
  "smile_teeth": {
    "smile_type": "[รูปแบบการยิ้ม]",
    "teeth_appearance": "[ลักษณะฟัน]",
    "teeth_color": "[สีฟัน]",
    "dimples": "[หลุมยิ้ม]",
    "gum_visibility": "[การเห็นเหงือก]"
  },
  "ears": {
    "size": "[ขนาด]",
    "shape": "[รูปทรง]",
    "position": "[ตำแหน่ง]",
    "earlobes": "[ติ่งหู]",
    "prominence": "[ความโดดเด่น]"
  },
  "facial_hair": {
    "mustache": "[หนวด]",
    "beard": "[เครา]",
    "thickness": "[ความหนา]",
    "grooming": "[การดูแล]",
    "style": "[รูปแบบ]",
    "color": "[สี]"
  },
  "eyewear": {
    "glasses": "[แว่นสายตา]",
    "sunglasses": "[แว่นกันแดด]",
    "contacts": "[คอนแทคเลนส์]",
    "frame_style": "[ทรงกรอบ]",
    "frame_color": "[สีกรอบ]",
    "lens_type": "[ประเภทเลนส์]"
  },
  "makeup": {
    "overall_style": "[สไตล์โดยรวม]",
    "foundation": "[รองพื้น]",
    "blush": "[บลัชออน]",
    "eyeshadow": "[อายแชโดว์]",
    "eyeliner": "[อายไลเนอร์]",
    "mascara": "[มาสคาร่า]",
    "lipstick": "[ลิปสติก]",
    "highlight": "[ไฮไลต์]",
    "intensity": "[ความเข้ม]"
  },
  
  // ข้อมูลเพิ่มเติม
  "additional_features": {
    "tattoos": "[รอยสัก]",
    "piercings": "[เจาะ]",
    "jewelry": "[เครื่องประดับ]",
    "unique_traits": "[ลักษณะเฉพาะตัว]",
    "accessories": "[อุปกรณ์เสริม]"
  }
}
```

## หลักการสร้าง JSON

### ✅ ต้องทำ:
1. **เก็บครบทุกรายละเอียด** - บันทึกทุกข้อมูลที่ผู้ใช้ให้มา
2. **ไม่สร้างข้อมูลเอง** - เก็บเฉพาะที่ผู้ใช้ระบุจริง
3. **จัดกลุ่มตามหมวดหมู่** - แยกหมวดหมู่ให้ชัดเจน
4. **ใช้คำศัพท์ไทย** - เพื่อความเข้าใจง่าย
5. **รองรับการขยาย** - สามารถเพิ่มรายละเอียดได้

### ❌ ห้ามทำ:
- ห้ามใส่ "none", "not specified", "ไม่ระบุ"
- ห้ามสร้างข้อมูลที่ผู้ใช้ไม่ได้ให้มา
- ห้ามตัดทอนรายละเอียดที่ผู้ใช้ระบุ
- ห้ามละเว้น field ที่มีข้อมูล
- ห้ามเปลี่ยนคำที่ผู้ใช้ใช้

## ตัวอย่างการบันทึก

### ข้อมูลจากผู้ใช้:
*"ตาสีน้ำตาลเข้ม รูปทรงอัลมอนด์ ขนตายาวหนา มีหลุมตาลึก ระยะห่างตาปกติ"*

### JSON ที่ถูกต้อง:
```json
"eyes": {
  "color": "น้ำตาลเข้ม",
  "shape": "อัลมอนด์",
  "eyelashes": "ยาวหนา", 
  "depth": "หลุมตาลึก",
  "distance": "ปกติ"
}
```

## การใช้ JSON ในพรอมต์

### ✅ ฝังข้อมูลครบถ้วน:
```
CHARACTER DETAILS:
- Eyes: Deep brown almond-shaped eyes with long thick eyelashes, deep-set, normal distance apart
- Hair: [ทุกรายละเอียดจาก hair object]
- Face: [ทุกรายละเอียดจาก face_structure object]
[...ต่อไปเรื่อยๆ ครบทุก field]
```

### ❌ ห้ามย่อหรือข้าม:
```
CHARACTER: Brown eyes, black hair, oval face
[ไม่ครบรายละเอียด!]
```

## การอัปเดต JSON

เมื่อผู้ใช้เพิ่มข้อมูลใหม่:
1. เพิ่ม field ใหม่ในหมวดหมู่ที่เหมาะสม
2. รักษาข้อมูลเดิมไว้ทั้งหมด  
3. อัปเดตเฉพาะส่วนที่เปลี่ยนแปลง
4. ยืนยันการเปลี่ยนแปลงกับผู้ใช้

# Bilingual Risk Dictionary v10

Detect exact words, close variants, transliterations, and mixed Thai-English phrases. Do not repeat risky claims directly in final dialogue.

## Overclaim / Guarantee
- 100%, one hundred percent, guaranteed, guarantee, การันตี, แน่นอน, เห็นผลทันที, instantly, permanent, ถาวร, best, no.1, ที่สุด, ถูกที่สุด

## Whitening / Brightening Risk
- ขาว, ขาวไว, ขาวกระจ่างใส, whitening, white, brightening, fair skin, Japanese white, หน้าไบรท์, ผิว bright, glow white, ฟอกฟันขาว, teeth whitening, ฟันขาวทันที
Rewrite: `ดูสว่างขึ้นในลุคเมคอัพ`, `ช่วยให้ดูสดใสขึ้น`, `ช่วยดูแลคราบบนผิวฟัน`, `ฟันแลดูสะอาดขึ้น` depending on category.

## Acne / Medical / Treatment
- สิวหาย, ลดสิว, รักษาสิว, anti-acne, acne treatment, melasma, ฝ้า, กระ, eczema, inflammation, อักเสบ, ผิวหนังไก่, chicken skin, dandruff cure, แก้คัน, regrow hair, เส้นผมเกิดใหม่, hair growth
Rewrite: omit or convert to cosmetic comfort/appearance only if safe.

## Allergy / Irritation / Safety
- ไม่แพ้, hypoallergenic, non-irritating, ไม่ระคายเคือง, safe for all, ปลอดภัยทุกคน, no tear, ไม่แสบตา, no damage, ไม่ทำร้าย, enamel safe, ไม่ทำลายเคลือบฟัน
Rewrite: add patch/use-as-directed caution, not safety guarantee.

## Hygiene / Antimicrobial / Sterilization
- ฆ่าเชื้อ, kill germs, kills bacteria, 99.9, 99.99, antibacterial, anti-bac, sterilize, disinfect, toxic free, ปลอดเชื้อ, ลดแบคทีเรีย, ลดการสะสมของแบคทีเรีย
Rewrite: `ช่วยทำความสะอาด`, `ช่วยลดกลิ่น`, `ช่วยให้รู้สึกสะอาดสดชื่น`; avoid disease-prevention framing.

## Dental/Oral Claims
- ป้องกันฟันผุ, anticavity, ลดหินปูน, tartar removal, plaque removal, ลดเหงือกอักเสบ, gum inflammation, ฟันขาวทันที, enamel repair
Rewrite: `ช่วยทำความสะอาดช่องปาก/ซอกฟัน`, `ช่วยลดคราบบนผิวฟันเมื่อใช้ตามคำแนะนำ`; add dentist caution if needed.

## Doctor / Institution / Professional Endorsement
- doctor approved, dermatologist recommended, pharmacist recommended, แพทย์รับรอง, เภสัชแนะนำ, หมอคิดค้น, clinically proven, hospital, โรงพยาบาล, Siriraj, medical tested, ผ่านการทดสอบทางการแพทย์
Rule: do not use as trust point unless evidence/permission is provided. Prefer neutral product details.

## Promotion / Marketplace Noise
- โปร, โปรโมชั่น, แถม, coupon, voucher, flash sale, 2 ฟรี 1, รีวิว, ส่งฟรี, COD, ส่งไว, พร้อมส่ง, ของแท้ 100%, เคลม, คืนเงิน, รับประกันความพึงพอใจ, best seller, สินค้าขายดี
Rule: omit in evergreen scripts unless user explicitly requests promotional copy.

## Device/Tool Safety
- deep clean ear, clean ear canal, painless, ไม่เจ็บ, ไม่บาด, scalp circulation, หมุนเวียนเลือด, จุดประสาท, แผล, broken skin
Rewrite: gentle use and caution near sensitive areas.


## v11 Additional Risk Phrases

### Whitening / tone change / exfoliating soap / body lotion
- เร่งใส, ใสไว, ผิวโดนแดดเผา, ขาวทันที, ขาวขึ้นหนึ่งระดับ, whitening lotion, bright body, glow white, AHA X100, glutathione soap, repair sunburn
- Rewrite as: skin looks fresher/smoother, moisturized, clean feel, cosmetic radiance only.

### Hair growth / anti-hairloss / scalp disease
- ลดผมร่วง, anti-hairloss, stimulate hair growth, hair follicle, better than Minoxidil, รากผมแข็งแรง, ผมเกิดใหม่, แก้คัน, ป้องกันรังแค
- Rewrite as: cleanses scalp, hair looks fuller/has volume; add consult-professional warning for unusual hair loss.

### Sunscreen / acne / sensitive skin
- เหมาะกับผิวแพ้ง่าย, ผิวเป็นสิวง่าย, ลดสิว, ไม่อุดตัน, ปกป้องจุดด่างดำ/ริ้วรอย, strongest protection, acne-safe, sensitive-safe
- Rewrite as: lightweight sun-care routine, SPF/PA label information, patch test, reapply as directed.

### Dental and orthodontic
- ป้องกันแผล, ฆ่าเชื้อ 99.99%, ฟันขาวทันที, from inside to outside whitening, no enamel damage, pain-free gums
- Rewrite as: helps cushion/clean/freshen; use as directed; consult dentist/orthodontist when symptoms persist.

### Medical-adjacent personal-use items
- ใช้ได้ทุกเพศทุกวัย, คนท้อง, ผู้สูงอายุติดเตียง, leak-proof, odor-proof, reusable urine bag
- Rewrite as: portable emergency/travel aid; seal and dispose hygienically; follow caregiver/professional advice when relevant.

### Professional/scientific authority
- clinically proven, dermatologist tested, hypoallergenic, allergen-free, organic certified, ECOCERT, clinical study, researched, ผ่านการวิจัย, ผ่านการทดสอบทางคลินิก
- Do not use as a persuasive trust point unless the user explicitly asks and provides substantiation. Keep as label context only or omit.


## v13 Added Risk Terms and Silent Rewrites

### Acne / sulfur / BHA soap
Risk terms: ลดสิว, รักษาสิว, ฆ่าเชื้อสิว, C.acne 99%, anti-acne, acne cure, anti-inflammatory, atopic dermatitis, skin barrier repair, ceramidase, sphingolipid.
Safe direction: cleansing routine, rinse-off soap, ingredient listed on label, skin feels clean/fresh; patch test and avoid eyes/broken skin.

### Perfume / fragrance dupes
Risk terms: ชื่อแบรนด์น้ำหอมดัง, inspired by brand, dupe, ฟีโรโมนดึงดูด, pheromone attraction, ติดทนนานทั้งวันแบบการันตี.
Safe direction: floral/fruity/powdery/fresh/warm scent family, pocket size, choose scent by mood; scent varies by skin and environment.

### Eye/lip mask
Risk terms: ลดใต้ตาดำ, ลดถุงใต้ตา, ตีนกาจาง, anti-wrinkle, ลดตาบวม, instant result.
Safe direction: cooling/moisturizing/rested-looking routine; avoid direct eye contact.

### Hair tonic/growth serum
Risk terms: เร่งผมยาว, ผมยาว 9 เท่า, ลดผมร่วง, ปลูกผม, follicle growth, cell rebuild, เห็นผล 1 สัปดาห์.
Safe direction: hair/scalp care routine, hair feels conditioned, smoother-looking hair; seek professional advice for unusual hair loss.

### Foot scrub / wax / tools
Risk terms: รักษาส้นเท้าแตก, ไม่เจ็บ, ไม่ระคายเคือง, painless wax, safe for all skin.
Safe direction: gentle exfoliating or hair-removal routine; patch test; avoid broken/irritated skin.


## v14 Added Risk Terms and Silent Rewrites

### Steam/self-heating eye mask
Risk terms: ลดขอบตาดำ, บรรเทาปวดหัว, บรรเทาปวดตา, แก้ตาล้า, นอนหลับสบาย, relieve headache, eye pain relief, dark circle removal, insomnia relief.
Safe direction: warm eye-area rest routine, aroma comfort, portable 20-30 minute use; stop if too hot or uncomfortable.

### Intimate cleanser
Risk terms: รักษากลิ่น, ฆ่าเชื้อจุดซ่อนเร้น, ป้องกันตกขาว, balance flora, vaginal health cure, safe for sensitive area, ปลอดภัยทุกคน.
Safe direction: external cleansing, pH/free-from label facts; external use only and consult professional for abnormal symptoms.

### Dermocosmetic / dermatologist endorsement
Risk terms: แพทย์ผิวหนังทั่วโลกแนะนำ, dermatologist recommended, clinically safe for sensitive skin, ใช้ได้ทุกคนในครอบครัว, เด็กเล็ก, ฟื้นบำรุงแผล, repair barrier.
Safe direction: moisturizes dry-feeling skin, comfort-focused routine, avoid eyes/open wounds, follow label for children/special areas.

### Heat appliances and simple devices
Risk terms: ไม่กินผม, ผมเงาสวยแน่นอน, damage-free, salon result, anti-snoring, total noise cancellation, prevent snoring, waterproof/diving earplug.
Safe direction: feature-led use, safety cautions, results vary with technique and hair/device use.

### Multi-SKU active skincare
Risk terms: เห็นผลกว่าเดิม, ซึมเข้าผิว 11.5 เท่า, ลดฝ้า, เคลียร์สิว, ลดริ้วรอยเหนือกว่า, poreless, barrier rebuild, activeIN proves result.
Safe direction: choose the formula by routine need, hydration/texture/fresh look, patch test, one new active at a time.

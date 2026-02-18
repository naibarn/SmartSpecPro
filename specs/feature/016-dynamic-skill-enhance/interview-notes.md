# Interview Notes: Dynamic Skill Input Enhancement for Chat

## Date: 2026-02-18

### Q1: Form Display Mode
**Question:** Skill form ควรแสดงที่ไหนใน chat interface?

**Options:**
1. Inline (below chat input, ขยายลงมา)
2. Modal/Dialog (popup ตรงกลางจอ)
3. Side panel (ด้านขวาเหมือน settings)
4. Replace chat input temporarily

**Answer:** Inline (below chat input) - ให้ user เห็นบริบทของ conversation ขณะกรอก form

### Q2: Cascading Select Implementation
**Question:** ควร implement optionGroups สำหรับ cascading selects ตอนนี้เลยไหม?

**Context:** Schema รองรับ optionGroups แต่ DynamicSkillForm ยังไม่ implement

**Options:**
1. Yes - Implement ตอนนี้เลย (เพิ่มเวลา 1-2 วัน)
2. No - ใช้ workaround ด้วย dependsOn ก่อน (implement ทีหลัง)
3. Document as limitation - บอกว่ายังไม่รองรับ

**Answer:** Yes - Implement ตอนนี้เลย เพราะ skill หลายตัวใช้ cascading selects (เช่น styleCategory → styleName)

### Q3: Skill Selection Flow
**Question:** User ควรเลือก Skill ยังไง?

**Options:**
1. ใช้ SlashCommandMenu ที่มีอยู่ (/command) แล้วเช็คว่ามี schema ไหม
2. ปุ่ม "Use Skill" แยกต่างหากจาก chat input
3. ทั้งสองแบบ (slash command + ปุ่ม)

**Answer:** ทั้งสองแบบ - Slash command สำหรับ power users, ปุ่มสำหรับ discoverability

### Q4: Form Persistence
**Question:** ถ้า user กรอก form แล้วยังไม่ส่ง ควรเก็บค่าไว้ไหม?

**Options:**
1. Yes - เก็บใน localStorage ต่อ conversation
2. No - ล้างเมื่อเปลี่ยน conversation หรือ refresh
3. Yes but temporary - เก็บแค่ใน session (memory)

**Answer:** No - ล้างเมื่อเปลี่ยน conversation เพื่อความเรียบง่าย (implement ทีหลังถ้าจำเป็น)

### Q5: Image Upload in Chat Form
**Question:** ควรรองรับ image upload ใน chat skill form ไหม?

**Context:** Media Studio มี imageUpload field แต่ chat ก็มี attachment อยู่แล้ว

**Options:**
1. Yes - รองรับ imageUpload field type ในฟอร์ม
2. No - ใช้ chat attachment ที่มีอยู่แทน
3. Both - แยกกัน (form upload สำหรับ reference, attachment สำหรับ message)

**Answer:** Yes - รองรับ imageUpload field type เพราะบาง skill ต้องการ reference images (เช่น create-image-prompt)

### Q6: Mobile Experience
**Question:** บน mobile ควรจัดการ form ยังไง?

**Options:**
1. Full-screen modal (bottom sheet)
2. Inline แบบเดียวกับ desktop แต่ responsive
3. Separate page (navigate away จาก chat)

**Answer:** Full-screen modal (bottom sheet) - ให้พื้นที่เพียงพอสำหรับกรอก form

### Q7: Phase Splitting
**Question:** ควรแบ่ง implementation เป็นกี่ phase?

**Options:**
1. 4 phases (ตาม spec เดิม)
2. 3 phases (รวม phase 3+4)
3. 5 phases (แยก mobile ออกมา)

**Answer:** 4 phases (ตาม spec เดิม) - Phase 1: Core, Phase 2: Integration, Phase 3: Slash commands, Phase 4: Polish

### Q8: Testing Strategy
**Question:** ควรเน้น testing แบบไหน?

**Options:**
1. Unit tests เป็นหลัก
2. Integration tests เป็นหลัก
3. E2E tests เป็นหลัก
4. Balanced (ทุกระดับ)

**Answer:** Balanced - Unit tests สำหรับ components, Integration สำหรับ flow, E2E สำหรับ critical paths

### Q9: Error Handling
**Question:** ถ้า form validation fail ควรทำยังไง?

**Options:**
1. Inline validation (แสดง error ใต้ field)
2. Alert/Toast notification
3. Both

**Answer:** Both - Inline สำหรับ field-specific errors, Toast สำหรับ general errors

### Q10: Rollout Strategy
**Question:** ควร rollout ยังไง?

**Options:**
1. Feature flag - ค่อยๆ เปิดให้ user กลุ่มเล็กๆ
2. Direct deploy - เปิดให้ทุกคนเลย
3. Beta opt-in - ให้ user เลือกใช้เอง

**Answer:** Feature flag - ใช้ existing feature flag system ใน project

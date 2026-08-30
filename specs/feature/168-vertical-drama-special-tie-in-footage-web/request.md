# Planning request

วางแผน Web/Server สำหรับ Special Tie-in แบบ Footage-first โดยรับวิดีโอจริงก่อน ให้ Worker วิเคราะห์และเตรียม footage รวมถึง HyperFrames transcription จากนั้นสร้างเรื่อง Tie-in แบบไม่มีบทพูดใหม่ให้ผู้ใช้ตรวจสอบ แยกเรื่อง/การแสดงให้แก้ไขได้ แล้วจึงแตกเป็น 9 ช็อตและวาง AI B-roll ตามวินาทีที่ผู้ใช้กำหนด

ขอบเขต Web ต้องครอบคลุม UI, managed upload, preview/fullscreen, analysis guide, Skill, ตัวละครที่เลือกจริง, model selector, history, review gate, B-roll timeline, credit ledger, authorization, stale state และ API contract ที่ Worker ใช้ร่วมกัน

สมมติฐาน: Web upload ใช้ direct-to-managed-storage; Server ไม่ decode/transcode วิดีโอ และ Feature 160/161/162/166 ยังคงเป็น boundary เดิม

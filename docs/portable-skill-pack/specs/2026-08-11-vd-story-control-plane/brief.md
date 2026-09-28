# แผนพัฒนา Vertical Drama Story Control Plane (Skill-First)

## เป้าหมาย

ออกแบบแผนพัฒนาระบบวางและเขียนเนื้อหา Vertical Drama ที่ลดปัญหาปมค้าง เนื้อเรื่องหลุดแกน ตัวละครสลับบท และความสัมพันธ์พระเอกนางเอกขาดจังหวะ โดยต้องวางแผนก่อน implementation และต้องไม่กระทบซีรีย์ที่กำลังเดินเรื่องถึงตอนที่ 25

## หลักการที่ต้องยึด

- ใช้ skill เป็นผู้ตัดสินและสร้างความหมายทางการเล่าเรื่อง เช่น คุณภาพการเฉลย ความสมเหตุสมผลของความสัมพันธ์ น้ำหนักอารมณ์ และการสลับความได้เปรียบเสียเปรียบ
- ใช้โค้ดเป็นผู้คุมข้อเท็จจริงที่ตรวจสอบได้ เช่น stable IDs, ตัวละคร canonical, สถานะ open/advanced/resolved/deferred, ลำดับตอน, ขอบเขตของปม และการไม่หายเงียบ
- ห้ามสร้าง mega-prompt ที่ยัด ledger ทั้งเรื่องลงในทุกขั้นตอน เพราะเพิ่มโอกาสให้โมเดลสับสนและหลุดแกน
- ต้องมีแหล่งข้อมูลกลางเพียงชุดเดียวสำหรับแผนปม/เส้นเรื่อง และไม่ปล่อยให้ open_threads แบบข้อความกับ episode_memory กลายเป็นแหล่งความจริงสองชุด
- ปมสั้นเพื่อ retention ต้องไม่ถูกยกระดับเป็นปมระยะยาวทุกครั้ง
- ห้าม auto-close ปมเก่าที่ไม่มีหลักฐานการเฉลย ต้องแยกสถานะ legacy/unknown/parked/sequel-hook ให้ตรวจสอบได้
- ห้ามถือว่า `1 episode = 60 วินาที` หรือ `1 episode = 90 วินาที` เป็นกติกากลางของ story planner; ความยาวต้องคำนวณจาก 9 logical shots และ duration profile ที่ production เลือก

## ขอบเขตที่ต้องออกแบบ

1. Season/arc control plan และ episode slot contract
2. ประเภทและ budget ของปม: moment hook, episode thread, arc thread, season thread
3. payoff window, evidence และการตรวจว่า thread ถูก advance/resolve/defer จริง
4. romance beat calendar ที่เป็นระดับตอน/ฉากอารมณ์ ไม่บังคับทุกช็อต
5. advantage curve ของฝ่ายพระเอก/นางเอกและฝ่ายร้าย โดยทุกการได้เปรียบต้องมี cost หรือการตอบโต้
6. canonical cast/role matrix เพื่อป้องกันตัวละครสลับบท
7. skill prompt/output contract, deterministic validator, semantic reviewer และ repair loop
8. การทำงานกับข้อมูลเดิมและซีรีย์ปัจจุบันตอนที่ 25 โดยไม่ rewrite หรือปิดปมย้อนหลังอัตโนมัติ
9. UI/observability ที่ตรวจสอบสถานะปม อายุปม overdue การปิดปม และ rhythm ของ romance/advantage ได้
10. แผน rollout, feature flag, migration/audit และ regression fixtures
11. duration profile ที่ระบุ shot duration จริง การคำนวณ runtime จากผลรวมของ shots และ compatibility กับ episode/assembly เดิม

## ข้อเท็จจริงจากระบบปัจจุบันที่ต้องนำมาพิจารณา

- มี continuity validator และ thread IDs แล้ว แต่ validator ปัจจุบันเน้นโครงสร้าง ID/สถานะ ยังไม่ตรวจ semantic payoff, romance rhythm หรือ power curve
- deep draft และ episode memory ยังมี optional/free-text paths และมีความเสี่ยงที่ open_threads กับ episode_memory จะเป็นคนละ source of truth
- quality review มีตัวชี้วัดระดับตอนอยู่แล้ว เช่น open loop, retention loop, reversal, emotion variety และ pacing แต่ยังไม่มี season-level payoff scheduler หรือ romance calendar
- ข้อมูลซีรีย์เดิมมี thread ที่ไม่สามารถจับคู่ opening/resolution ได้จำนวนหนึ่ง จึงต้อง audit และแสดงเป็น legacy/unknown ไม่ควรเดาเฉลย
- ระบบสร้างวิดีโอปัจจุบันกำหนด duration ต่อ shot ได้หลายค่า และ episode storyboard มี 9 logical shots; runtime ของ episode จึงเป็นค่าที่ derive จาก `shotDurationsSeconds` ไม่ใช่ค่าคงที่ที่ story planner สมมติล่วงหน้า

## ผลลัพธ์ที่ต้องการจากแผน

แผนต้องระบุลำดับ phase, data contract, จุดที่ skill ทำได้จริง, จุดที่โค้ดคุมได้จริง, TDD/fixtures, acceptance criteria, ความเสี่ยง, rollout และรายการที่ไม่ควรทำ เพื่อให้ผู้พัฒนาคนถัดไป implement ได้โดยไม่ต้องเดา และไม่ทำให้การปิดปมกลายเป็นเป้าหมายที่ทำลายแกนเรื่อง

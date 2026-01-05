# spec.md — 006-docker-deploy (Web stack deploy/run)

Spec ID: **SSP-DOCKER-006**  
Spec folder: `specs/feature/006-docker-dev-environment/`  
Code boundary: `docker/`  
Last updated: 2026-01-05

---

## 1) Purpose
`docker/` คือชุดไฟล์สำหรับ **run/deploy stack** ของโปรเจกต์ โดยโฟกัสหลัก:
- **SmartSpecWeb (Spec 003)**: web server + client build
- Dependencies ที่จำเป็น (เช่น Postgres/Redis/Object storage) ตามที่ web ใช้
- **Optional**: รัน `python-backend/` (Spec 007) เพิ่มสำหรับ dev/tooling หรือ integration

> สถานะโค้ดปัจจุบัน: compose ที่มีอยู่เหมาะกับ **dev stack** เป็นหลัก และยังไม่ประกอบ service ของ SmartSpecWeb แบบครบถ้วนในทุกกรณี

---

## 2) Scope (ชัดเจน)
- MUST: รองรับการรัน SmartSpecWeb ใน docker (dev/prod profile ได้)
- SHOULD: รองรับ Postgres ที่ SmartSpecWeb ใช้ (Drizzle)
- MAY: เพิ่ม service สำหรับ python-backend (Spec 007) ถ้าต้องการ

---

## 3) Known caveats (จากโค้ดที่มีอยู่)
- ระวัง **port conflict**: ใน compose เดิมมีบริการที่ใช้พอร์ต 8000 ซึ่งอาจชนกับ python-backend ที่มักรัน 8000

---

## 4) Relationships
- 006 → 003: deploy/run SmartSpecWeb
- 006 → 007 (optional): deploy/run python-backend สำหรับ desktop/dev หรือ integration
- 006 ไม่ใช่ business logic เอง แต่เป็น infra definition

---

## 5) Definition of Done
- ระบุชัดใน docker docs ว่า stack นี้ “deploy/run SmartSpecWeb เป็นหลัก”
- ถ้ารัน 007 เพิ่ม ต้องระบุพอร์ตและ environment ให้ไม่ชนกัน

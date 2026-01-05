# plan.md — 006-docker-dev-environment

Last updated: 2026-01-05

## Goal
ทำให้ dev stack “ติดตั้งง่าย, ซ่อมง่าย, และใช้ร่วมกันได้” สำหรับทีม

## Plan
1) **Document + Onboarding**
   - เขียน quickstart ที่ระบุ prereq (docker desktop/compose v2)
   - เพิ่ม troubleshooting ที่เจอบ่อย (permission, ports, db reset)

2) **Makefile/Task runner (optional)**
   - เพิ่มคำสั่งสั้น ๆ เช่น `make dev-up`, `make dev-shell`

3) **Environment Profiles**
   - profile `ollama` มีอยู่แล้ว → เพิ่ม profile อื่นถ้าจำเป็น (เช่น `minimal`)

4) **CI sanity (optional)**
   - เพิ่ม job ที่เช็คว่า compose build ได้ (ไม่ต้อง up services ทั้งหมด)

## Out of scope
- การ deploy production ด้วย docker/k8s

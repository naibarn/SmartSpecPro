# tasks.md — 006-docker-dev-environment

Last updated: 2026-01-05

## P0
- [ ] เพิ่มเอกสาร prereq + คำสั่งเริ่มต้นแบบสั้น
- [ ] ตรวจว่า `docker-dev.sh` ครอบคลุม: up/down/restart/logs/shell
- [ ] เพิ่มคำสั่ง reset data volumes (postgres/redis/chroma) แบบปลอดภัย

## P1
- [ ] เพิ่ม healthcheck tips: verify ports 5432/6379/8000/11434
- [ ] เพิ่ม profile `minimal` (postgres+redis) ถ้าต้องการลด resource

## P2
- [ ] เพิ่ม CI smoke test: build `Dockerfile.dev` สำเร็จ

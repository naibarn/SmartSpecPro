# Telegram Alert Notifications

## Overview

เพิ่มช่องทางแจ้งเตือนผ่าน Telegram Bot ให้กับระบบ notification ที่มีอยู่แล้วใน SmartSpecPro
เมื่อมี notification ใหม่ (เช่น scheduled message alerts, urgent reminders, system notifications)
ระบบจะส่งข้อความแจ้งเตือนไปยัง Telegram ของผู้ใช้โดยอัตโนมัติ

## Current Notification System

ระบบปัจจุบันมี:
- **user_notifications** table — เก็บ in-app notifications ทุกประเภท (alert, urgent_message, direct_message, follow_request ฯลฯ)
- **scheduled_messages** table — ระบบตั้งเวลาแจ้งเตือน (cron-based, one-time)
- **GlobalAlerts.tsx** — แสดง notification bell + dropdown ในหน้าเว็บ
- **GlobalUrgentReminders** — full-screen modal สำหรับ high/critical priority
- **GlobalUrgentAlerts** — full-screen modal สำหรับ urgent DMs
- **Celery Beat** (Python) — รันตามเวลาที่ตั้งไว้ สร้าง notification entries

## Requirements

### 1. Telegram Bot Setup
- สร้างและ configure Telegram Bot (Bot Token เก็บใน system_settings encrypted)
- Admin สามารถตั้งค่า Bot Token ผ่าน Admin Panel

### 2. User Linking
- ผู้ใช้สามารถ link Telegram account กับ SmartSpecPro account ได้
- ใช้ deep link หรือ verification code เพื่อยืนยันตัวตน
- แสดงสถานะ linked/unlinked ในหน้า Settings ของผู้ใช้
- สามารถ unlink ได้ตลอดเวลา

### 3. Notification Delivery
- เมื่อสร้าง notification ใหม่ใน user_notifications → ส่ง Telegram message
- เมื่อ scheduled message ถูก trigger → ส่ง Telegram message
- Filter ตาม priority: ผู้ใช้เลือกได้ว่าจะรับ notification level ไหนผ่าน Telegram
  - all: ทุก notification
  - high+critical: เฉพาะสำคัญ
  - critical only: เฉพาะวิกฤต
  - off: ปิด Telegram notifications

### 4. Message Formatting
- รองรับ Telegram Markdown formatting
- แสดง title, content, priority badge, timestamp
- มี inline button "View in SmartSpecPro" ที่ link กลับมาหน้าเว็บ

### 5. Rate Limiting & Error Handling
- Respect Telegram Bot API rate limits (30 msg/sec per bot, 1 msg/sec per chat)
- Queue messages ผ่าน BullMQ/Celery เพื่อไม่ให้ block main flow
- Retry failed messages (max 3 attempts)
- Log delivery status

## Tech Constraints

- Backend: Node.js (Express/tRPC) + Python (FastAPI/Celery)
- Bot Token stored encrypted via existing crypto.ts (LLM_ENCRYPTION_KEY)
- ใช้ Telegram Bot API (HTTPS) ไม่ใช้ webhook (ใช้ send-only, ไม่ต้อง receive)
- ไม่ต้องทำ Telegram login/OAuth — แค่ link chat_id กับ user

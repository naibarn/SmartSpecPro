---
name: Agency Creator
slug: agency-creator
description: สร้าง multi-agent agency อัตโนมัติจาก prompt หรือ spec document พร้อม interview phase และ architecture preview
category: automation
icon: network
version: 1.0.0
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 90
creditMultiplier: 2
config:
  _action: agency_create
  maxInterviewQuestions: 7
  useRAG: false
tags: []
auto_trigger: false
trigger_patterns: []
enabled_by_default: true
credit_multiplier: 2
execution_mode: llm-only
strict_provider_pin: false
---
# Agency Creator Skill

## Purpose
สร้าง multi-agent agency โดยอัตโนมัติจาก requirement ที่ผู้ใช้ระบุ ครอบคลุมตั้งแต่ discovery ไปจนถึง documentation

## 7-Phase Pipeline

| Phase | ชื่อ | สิ่งที่ทำ |
|---|---|---|
| 1 DISCOVER | วิเคราะห์ requirement | Parse intent, classify domain, extract constraints |
| 2 INTERVIEW | สัมภาษณ์ user (สูงสุด 7 คำถาม) | ถามเฉพาะสิ่งที่ยังไม่ชัดเจน skip ถ้า intent ชัดพอ |
| 3 DESIGN | ออกแบบ architecture | สร้าง JSON spec: nodes[], edges[], rationale |
| 4 VALIDATE | ตรวจสอบ spec | Self-review: entry points, topology, required fields |
| 5 IMPLEMENT | สร้างใน database | เรียก saveBuilder API สร้าง agency จริง |
| 6 VERIFY | ทดสอบ | ส่ง test message ดู response |
| 7 DOCUMENT | เขียน guide | Usage guide + 3 starter conversations |

## Node Types Available
- **agent**: AI agent ทั่วไป มี model, instructions, tools
- **supervisor**: ควบคุม agents ลูก มี routingStrategy
- **router**: ตัดสินใจเส้นทางตาม condition (keyword/regex/llm_classify)
- **aggregator**: รวมผลจาก agents หลายตัว (first_wins/majority_vote/llm_merge/concatenate)
- **knowledge_base**: ค้นหาจาก document collection
- **skill_call**: เรียก SSP skill โดยตรง
- **human_approval**: รอการอนุมัติจาก human

## Design Principles
1. Entry point ได้เฉพาะ `agent` หรือ `supervisor` เท่านั้น
2. ทุก agency ต้องมี entry point อย่างน้อย 1 node
3. Router node ต้องมี routes อย่างน้อย 1 เส้นทาง + defaultTargetNodeId
4. Aggregator รับ input จาก upstream nodes หลายตัว
5. ใช้ delegation flowType สำหรับ sequential flow, parallel สำหรับ concurrent

## Example Agency Architectures

### Research Team (3 agents)
```
Entry: Coordinator (supervisor) → Researcher (agent) → Analyst (agent) → Writer (agent)
```

### Customer Support (router + agents)
```
Entry: Classifier (agent) → Router (keyword) → [FAQ Agent | Escalation Agent | Billing Agent]
```

### RAG Pipeline
```
Entry: Query Processor (agent) → Knowledge Base (knowledge_base) → Answer Generator (agent)
```
# Spec 203 - SmartAIHub AI Editor Director — Production-Grade Hybrid AI Editing System

**Status:** Proposed  
**Spec ID:** 203
**Revision:** 2026-09-16 — Shared Web / Runner / Windows Worker Runtime Architecture  
**Target:** SmartAIHub Web Editor + SmartAIHub Runner (Windows/macOS/Linux/Cloudflare Container) + SmartAIHub Worker for Windows + Shared Server/Control Plane  
**Architecture:** Hybrid AI / Skill-First / Evidence-Driven / Non-Destructive Editing  
**Primary Goal:** เปลี่ยนวิดีโอต้นฉบับธรรมดา เช่น Talking Head, Product Review, Interview, Podcast หรือวิดีโอที่แทบไม่มีการเคลื่อนไหว ให้สามารถตัดต่ออัตโนมัติด้วย AI ได้อย่างน่าสนใจ เป็นธรรมชาติ และควบคุมคุณภาพได้ในระดับ Production Grade

**Contract relationship with Spec 202:** Spec 202 owns the unified product and
AI Rough Cut capability surface. This document owns the shared runtime, evidence,
intent, compiler, revision, execution-agent, and artifact contracts. Where the
documents overlap, this document is authoritative for runtime identity and
execution correctness; Spec 202 is authoritative for optional tool UX and
product-level EDL intent. Neither document may create a second editor project,
timeline, queue, or job control plane.

**Implementation status:** Proposed target contract with a completed local
vertical slice. As of 2026-09-18, the active Web Editor has Phase 3 Worker
handoff, server-authoritative project revisions/CAS, immutable execution
snapshot admission, and contract-level Evidence/Intent/Change Set services.
Full Director workflow integration, artifact persistence/Library commit, full
Runner/Windows Worker parity, and authenticated target-environment proof remain
release boundaries, not optional notes.

**Runtime Model:** Project เดียวต้องเปิดและทำงานร่วมกันได้จาก SmartAIHub Web Editor, SmartAIHub Runner แบบ headless บน Windows/macOS/Linux/Cloudflare Container และ SmartAIHub Worker for Windows ที่มี Desktop Editor UI โดยทั้งหมดใช้ canonical Project/Timeline revision และ `worker_jobs` Control Plane ชุดเดียวกัน

**Runner implementation boundary:** Feature 205 owns the concrete
cross-platform local Runner executable and the `SHARED_CONTAINER_RUNNER`
execution entrypoint. Feature 204 owns Cloudflare Container provisioning,
pooling, autoscaling and deployment. This spec owns the shared editor/runtime,
evidence and artifact semantics; it MUST use the Runner/Container profiles
without creating another queue, registry or control plane.

---

# 1. Executive Summary

ระบบ **AI Editor Director** มีหน้าที่ทำให้ SmartAIHub สามารถตัดต่อวิดีโอโดยอัตโนมัติแบบ “มีเหตุผลเชิงบรรณาธิการ” ไม่ใช่เพียง Auto Reframe หรือสุ่ม Zoom/Pan ตามช่วงเวลา

ระบบจะใช้สถาปัตยกรรมแบบ Hybrid AI โดยแบ่งหน้าที่ดังนี้:

1. **Execution Agent (SmartAIHub Runner หรือ Windows Worker)** วิเคราะห์ไฟล์วิดีโอใน runtime ที่เข้าถึง source bytes ได้
2. สร้างหลักฐานเชิงโครงสร้างเป็น `EditorialEvidenceBundle`
3. ส่งเฉพาะ Evidence + Preview Frames ที่จำเป็นไปยัง SmartAIHub Skill
4. AI Skills สร้าง `EditorialIntentPlan`
5. Local `EditorialCompiler` แปลง Intent เป็นคำสั่งตัดต่อที่ deterministic
6. `SafetyValidator` ตรวจสอบ Crop, Pan, Zoom, Cut, Timing และ Resolution
7. สร้าง `ExecutableEditPlan` และ Non-Destructive Timeline
8. Renderer ใช้ FFmpeg / GPU FFmpeg / Remotion ตามประเภทงาน
9. `EditorialQC` ตรวจผลทั้งก่อนและหลัง Render
10. ถ้า AI ล้มเหลว ระบบจะ fallback กลับไปใช้ Local Face + Activity + Rule-based Editing โดยไม่ทำให้งานหยุด

หลักการสำคัญคือ:

> **AI คิด — Compiler วางแผน — Worker ทำ — Validator/QC ตรวจ**

AI จะไม่สร้าง low-level FFmpeg command โดยตรง และ Worker จะไม่เก็บ API Key ของ Provider

---

# 2. Goals

## 2.1 Primary Goals

ระบบต้องสามารถ:

- วิเคราะห์วิดีโอแบบ Local-first
- เข้าใจทั้งภาพ เสียง คำพูด จังหวะ และองค์ประกอบ
- สร้างการเปลี่ยนมุมเสมือนจากวิดีโอกล้องเดียว
- เลือกจังหวะ Zoom / Pan / Reframe / Jump Cut อย่างมีเหตุผล
- ลดความน่าเบื่อของ Talking Head หรือ Static Video
- รักษาใบหน้าและ subject สำคัญให้อยู่ใน Safe Frame
- ตัดช่วงพูดผิด พูดซ้ำ เงียบ หรือเนื้อหาที่ไม่สำคัญได้
- ทำ AI Rough Cut และ AI Editorial Direction ในระบบเดียว
- สร้าง Timeline ที่ user สามารถแก้ Undo Disable Replace หรือ Regenerate เฉพาะช่วงได้
- ใช้ Skill-first architecture เพื่อให้ AI Logic เปลี่ยนและปรับปรุงได้โดยไม่ต้องอัปเดต Worker ทุกครั้ง
- รองรับ fallback แบบ Local เมื่อ Skill ใช้งานไม่ได้
- รองรับ Versioning และ Reproducibility
- รองรับ Cache โดยไม่ต้องวิเคราะห์ source เดิมซ้ำ
- รองรับการทำงานแบบ Background Job และ Recover จาก job interruption

## 2.2 Secondary Goals

- รองรับ B-roll suggestion / B-roll generation ในอนาคต
- รองรับ Caption Emphasis
- รองรับ Music Cue / SFX / Ducking
- รองรับ Multicam จริง
- รองรับ Full-video multimodal analysis แบบ Optional
- รองรับ User Editorial Profile / Personal Style
- รองรับการเรียนรู้ preference จาก Accept / Reject / Replace โดยไม่ผูกกับ model รายเดียว

---

# 3. Non-Goals — Phase 1

รอบแรกยังไม่จำเป็นต้อง:

- ส่งวิดีโอเต็มไฟล์ไปหา AI โดยอัตโนมัติ
- ให้ AI สร้าง FFmpeg filter graph โดยตรง
- Render Final Video ทุกครั้งหลัง AI วิเคราะห์
- Auto Publish Social Media
- Auto Generate B-roll ทุกกรณี
- ใช้ Reinforcement Learning จาก user feedback
- แทนที่ Timeline Editor เดิมทั้งหมดในทันที

---

# 4. Design Principles

## 4.1 Evidence First

AI ต้องตัดสินใจจากหลักฐานที่ Worker ตรวจพบจริง

AI ห้ามอ้าง:

- activity ที่ไม่พบใน evidence
- face track ที่ไม่มี
- object ที่ detector ไม่พบ
- speech event ที่ transcript ไม่มี
- camera target ที่อยู่นอก source frame

ทุก cue ต้องมี `evidence_refs`

---

## 4.2 Intent Before Command

AI ห้ามส่ง low-level command เช่น:

```json
{
  "zoom": 1.437,
  "pan_x": 211,
  "pan_y": 54
}
```

AI ต้องส่ง “เจตนาการตัดต่อ” เช่น:

```json
{
  "intent": "EMPHASIZE_SPEAKER",
  "time_range": {
    "domain": "SOURCE_TIME",
    "timebase": {"num": 1, "den": 90000},
    "start_tick": 1278000,
    "end_tick": 1683000,
    "display_ms": {"start": 14200, "end": 18700}
  },
  "attention_target": "face_track_02",
  "energy": 0.76,
  "preferred_framing": "CLOSE_UP",
  "reason": "Key claim begins with strong vocal emphasis",
  "model_confidence": 0.91,
  "evidence_refs": [
    "speech_44",
    "face_track_02",
    "emphasis_11"
  ]
}
```

Local compiler เป็นผู้ตัดสินค่าทางเทคนิคจริง

---

## 4.3 Deterministic Execution

แผนจาก AI ต้องถูก compile เป็นคำสั่ง deterministic ที่สามารถ:

- Validate
- Preview
- Diff
- Retry
- Re-render
- Audit

ได้

---

## 4.4 Non-Destructive Editing

ระบบต้องไม่แก้ source file

ทุกการแก้ไขต้องอยู่ในรูป:

- Timeline Operation
- Edit Decision List
- Effect Node
- Camera Keyframe
- Audio Operation

---

## 4.5 Local-First Media Privacy

รอบแรก:

- วิเคราะห์วิดีโอเต็มไฟล์ใน Local Worker
- ส่ง metadata, transcript, evidence และ preview เฉพาะช่วงสำคัญ
- ไม่ upload source video เต็มไฟล์โดยอัตโนมัติ
- full-video AI analysis ต้องเป็น option แยกที่ user เปิดเอง

---

# 5. High-Level Architecture

AI Editor Director ต้องถูกออกแบบเป็น **หนึ่งระบบตัดต่อที่มี 3 execution surfaces แต่ใช้ Project/Timeline/Job Control Plane ชุดเดียวกัน** ไม่ใช่ 3 ระบบที่ sync กันภายหลัง

## 5.1 Product / Runtime Surfaces

### A. SmartAIHub Web Editor

หน้า `/video-editor` เป็น UI หลักระยะยาว และต้องมี Timeline + Editing Tools ครบถ้วน เช่นที่มีในระบบปัจจุบัน

หน้าที่หลัก:

- Project/Timeline editing
- AI Director / Skill orchestration
- lightweight metadata operations
- timeline math ที่ไม่ต้อง decode media หนัก
- save/version/collaboration
- preview จาก proxy/streamed artifact
- job submission / status / cancel / retry
- review AI change-set และ QC result

งานหนัก เช่น decode วิดีโอยาว, detector, proxy generation, FFmpeg render, GPU inference และ final export **ห้ามสมมติว่าจะรันใน Browser**

### B. SmartAIHub Runner

Runner เป็น **headless execution agent ไม่มี Video Editor UI** สำหรับรับงานจาก `worker_jobs` และทำงานหนักตาม capability

Target:

```text
Windows
macOS
Linux
Cloudflare Container / compatible cloud container
```

หน้าที่:

- local/cloud media analysis
- Face / Activity / ASR / Motion / Scene analysis
- proxy generation
- Editorial Compiler stages ที่ต้องพึ่ง media geometry
- FFmpeg / GPU FFmpeg / Remotion execution ตาม capability
- render preview/final
- local/post-render QC
- upload resulting artifact กลับ SmartAIHub Library

Runner ไม่มี canonical project state ของตัวเอง และไม่ต้องมี editor UI

### C. SmartAIHub Worker for Windows

Windows Worker เดิมยังคงใช้งานต่อและมี **Desktop UI/UX สำหรับตัดต่อวิดีโอ** พร้อม execution runtime

ต้อง:

- เปิด Project เดียวกับ Web Editor ได้
- แก้ Timeline เดียวกันได้ผ่าน revision API
- ใช้ shared project schema เดียวกัน
- สามารถรับ `worker_jobs` และทำงานหนักเหมือน Runner ตาม capabilities
- ใช้ execution core ร่วมกับ Runner ให้มากที่สุด

Windows Worker จึงเท่ากับ:

```text
Desktop Editor UI
+ Shared Project Client
+ Runner Execution Core
```

ห้าม fork media engine, project schema หรือ render semantics เป็นชุดเฉพาะ Worker

## 5.2 Shared Server / Control Plane

Server เป็นศูนย์กลางของทั้งสาม surface:

```text
                         ┌────────────────────────────┐
                         │ SmartAIHub Server          │
                         │                            │
                         │ Project/Timeline SoT       │
                         │ Skill Gateway              │
                         │ worker_jobs Control Plane  │
                         │ Auth / Credits / Audit     │
                         │ Library / R2               │
                         └──────────────┬─────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             │                          │                          │
             ▼                          ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌────────────────────────┐
│ SmartAIHub Web       │   │ SmartAIHub Runner    │   │ Windows Worker         │
│ Editor UI            │   │ Headless             │   │ Editor UI + Runtime    │
│                      │   │ Win/macOS/Linux/CF   │   │ Windows                │
└──────────┬───────────┘   └──────────┬───────────┘   └───────────┬────────────┘
           │                          │                           │
           └──────── Shared Project / Revision / Jobs ───────────┘
```

## 5.3 End-to-End Editing / Render Flow

```text
User edits project on Web or Windows Worker UI
        ↓
Commit canonical Project/Timeline Revision to Server
        ↓
User requests Analyze / AI Director / Preview / Export
        ↓
Server creates worker_jobs job pinned to exact project revision
        ↓
Scheduler matches capability to available Runner or Windows Worker
        ↓
Execution agent fetches ProjectExecutionSnapshot + required assets
        ↓
Heavy analysis / compile / render / QC
        ↓
Agent uploads immutable output artifact
        ↓
Register artifact in SmartAIHub Library
        ↓
Attach artifact + provenance to originating project revision/job
        ↓
Web and Windows Worker see the same completed result
```

## 5.4 AI Editorial Pipeline Inside an Execution Job

```text
Source Video / Resolved Asset
       ↓
Media Analysis Runtime
       ↓
EditorialEvidenceBundle
       ↓
SmartAIHub Skill Orchestrator
       ↓
EditorialIntentPlan
       ↓
Deterministic Editorial Compiler
       ↓
Safety Validator
       ↓
ExecutableEditPlan / Timeline Operations
       ↓
FFmpeg / GPU FFmpeg / Remotion
       ↓
Post-render Editorial QC
       ↓
Library Artifact
```

AI reasoning อยู่บน SmartAIHub Skill side ตาม policy; media-heavy execution อยู่ Runner/Worker side เว้นแต่ cloud Runner ถูกเลือกโดย scheduler

---

# 6. System Components

## 6.1 Execution-Agent Media Analysis Runtime

หน้าที่:

- อ่าน source video
- extract media metadata
- สร้าง source fingerprint
- วิเคราะห์ frame/audio โดยไม่พึ่ง AI Cloud
- generate preview frames
- เก็บ evidence แบบ normalized
- ส่ง progress เข้า Job Control Plane

### Required analyzers

#### A. Face Detector / Face Tracker

ต้องให้ข้อมูล:

- face id
- bounding box
- confidence
- visible duration
- lost face interval
- face size
- face center
- head pose ถ้ามี
- face continuity
- candidate primary speaker face

#### B. Active Speaker Detector

เชื่อม:

- voice activity
- speaker diarization
- face movement
- lip motion

ผลลัพธ์:

```text
speaker_id
face_track_id
start_ms
end_ms
confidence
```

#### C. Activity Detector

ตรวจ:

- hand movement
- object interaction
- writing
- pointing
- product interaction
- body motion
- region activity

ต้องเก็บ:

```text
time
bbox
activity_type
confidence
motion_vector
```

#### D. Scene / Shot Boundary Detector

ตรวจ:

- hard cut
- dissolve
- scene transition
- lighting change
- framing change

#### E. Motion Analyzer

สร้าง:

- global motion
- local motion
- motion direction
- optical flow summary
- camera motion estimate

#### F. Audio Analyzer

ตรวจ:

- speech
- silence
- breath
- music
- loudness
- clipping
- audio discontinuity
- SFX candidates

#### G. ASR / Transcript

ต้องรองรับ:

- word timestamps
- sentence boundary
- confidence
- language
- speaker id ถ้ามี

#### H. Semantic Segmenter

สามารถใช้ local model หรือ SmartAIHub Skill เพื่อแบ่ง:

- topic
- paragraph
- explanation
- introduction
- conclusion
- CTA
- key claim

#### I. Gesture / Expression Detector

Phase 1 อาจเป็น optional

ตรวจ:

- hand raise
- pointing
- nod
- head turn
- smile
- reaction
- sudden movement

#### J. Composition Analyzer

ตรวจ:

- face too close edge
- headroom
- rule of thirds candidate
- center bias
- empty space
- target safe area

---

# 7. EditorialEvidenceBundle

## 7.1 Purpose

เป็น data contract หลักระหว่าง Worker กับ AI Skill

ต้องเป็น:

- versioned
- immutable หลัง finalize
- cacheable
- compact
- referenceable
- reproducible

## 7.2 Suggested Schema

```json
{
  "schema_version": "1.0",
  "bundle_id": "ceb_...",
  "source": {
    "source_fingerprint": "sha256:...",
    "duration_ms": 603244,
    "width": 3840,
    "height": 2160,
    "fps": 29.97,
    "video_codec": "h264",
    "audio_codec": "aac",
    "rotation": 0
  },
  "detectors": {
    "face": "face-detector@1.3.2",
    "activity": "activity-detector@1.0.0",
    "scene": "scene-detector@2.1.0",
    "asr": "asr-provider@x.y.z"
  },
  "tracks": {},
  "speech": [],
  "activities": [],
  "scene_changes": [],
  "motion": [],
  "semantic_segments": [],
  "preview_assets": [],
  "quality": {},
  "created_at": "ISO8601"
}
```

---

# 8. Evidence Event Model

ทุก Evidence ควรมี minimum fields:

```json
{
  "evidence_id": "ev_...",
  "type": "speech_emphasis",
  "time_range": {
    "domain": "SOURCE_TIME",
    "timebase": {"num": 1, "den": 90000},
    "start_tick": 1278000,
    "end_tick": 1683000,
    "display_ms": {"start": 14200, "end": 18700}
  },
  "detector_confidence": 0.91,
  "source": "audio_analyzer",
  "payload": {}
}
```

AI Intent ทุกตัวต้องอ้าง `evidence_id`

---

# 9. Attention Beat Engine

## 9.1 Objective

ป้องกัน “วิดีโอนิ่งนานจนเสีย engagement”

แต่ต้องไม่แก้โดย zoom ทุก N วินาที

ระบบต้องหา `AttentionBeat`

จาก:

- semantic importance
- speaker emphasis
- silence
- gesture
- facial reaction
- topic change
- activity
- elapsed time since last visual change
- current framing
- previous edit pattern
- edit density

## 9.2 Example Score

```text
attention_score =
  semantic_importance * 0.25
+ vocal_emphasis      * 0.20
+ gesture_score       * 0.15
+ motion_score        * 0.10
+ topic_change        * 0.15
+ visual_staleness    * 0.15
```

ค่า weight ต้องเป็น policy configurable

## 9.3 Suggested interpretation

```text
0.00–0.29 = HOLD
0.30–0.49 = SUBTLE CHANGE
0.50–0.69 = CAMERA CHANGE
0.70–0.84 = PUNCH IN / REFRAME
0.85–1.00 = HIGH EMPHASIS EDIT
```

ค่าดังกล่าวเป็น default เท่านั้น

---

# 10. Virtual Camera System

## 10.1 Objective

สร้าง multicamera feel จาก source กล้องเดียว

## 10.2 Virtual Camera Types

```text
WIDE
MEDIUM
MEDIUM_CLOSE
CLOSE_UP
EXTREME_CLOSE
LEFT_BIASED
RIGHT_BIASED
ACTIVITY_TARGET
PRODUCT_TARGET
CUSTOM_REGION
```

## 10.3 Virtual Camera Definition

```json
{
  "camera_id": "cam_close_primary",
  "type": "CLOSE_UP",
  "target": "face_track_primary",
  "padding": {
    "top": 0.12,
    "bottom": 0.18,
    "left": 0.15,
    "right": 0.15
  },
  "max_zoom": 1.35
}
```

---

# 11. Resolution Budget

ระบบต้องคำนวณก่อนวาง camera plan

## Example

Source:

```text
3840x2160
```

Output:

```text
1920x1080
```

จึงมี crop headroom มาก

แต่ถ้า:

```text
1920x1080 → 1920x1080
```

ต้องจำกัด zoom มากกว่า

## Required model

```json
{
  "source_resolution": "3840x2160",
  "output_resolution": "1920x1080",
  "safe_zoom_max": 1.35,
  "soft_zoom_max": 1.50,
  "hard_zoom_max": 1.65,
  "upscale_allowed": false
}
```

AI ห้าม override `hard_zoom_max`

---

# 12. Camera Grammar

ต้องมี deterministic rule set แยกจาก AI

## Example rules

- ห้าม crop ใบหน้าหลักออกนอก safe frame
- ห้ามตัดศีรษะโดยไม่ตั้งใจ
- ห้าม pan เร็วเกิน policy
- ห้าม zoom ต่อเนื่องหลายครั้งจนเกิด pump effect
- ต้องมี minimum hold
- ต้องมี easing ใน animated camera move
- ห้าม extreme close-up ถ้า source resolution ไม่พอ
- หลีกเลี่ยง `WIDE → EXTREME_CLOSE → WIDE` ในช่วงสั้น
- หลีกเลี่ยง pan ทันทีหลัง zoom หากไม่มีเหตุผล
- ห้าม camera changes ถี่เกินไปตาม content type
- จำกัดจำนวน punch-in ต่อ rolling window
- ห้าม pan ไปยัง activity ที่ confidence ต่ำ
- ต้อง return to primary subject ภายในเวลาที่กำหนด ยกเว้น scene intent อนุญาต

---

# 13. SafeCutPoint Engine

Jump Cut ต้องเกิดที่จังหวะที่เหมาะสม

## Signals

- sentence boundary
- word boundary
- phoneme boundary
- silence
- breath
- blink
- head movement
- hand movement
- motion peak
- topic change
- speaker change

## Candidate

```json
{
  "source_time": {
    "timebase": {"num": 1, "den": 90000},
    "tick": 1677600,
    "display_ms": 18640
  },
  "score": 0.93,
  "signals": [
    "sentence_boundary",
    "80ms_pause",
    "head_motion_start"
  ]
}
```

Compiler ต้องเลือก cut point ที่ใกล้ AI intent มากที่สุดแต่ปลอดภัยกว่า

---

# 14. EditorialIntentPlan

## 14.1 Purpose

เป็นผลจาก AI Skills

AI ต้องระบุ “ควรทำอะไรเชิงบรรณาธิการ” ไม่ใช่ filter command

## 14.2 Intent Types

Phase 1:

```text
HOLD
TIGHTEN_FRAME
WIDEN_FRAME
EMPHASIZE_SPEAKER
SHOW_ACTIVITY
RETURN_TO_FACE
JUMP_CUT
REMOVE_SEGMENT
SHORTEN_PAUSE
PRESERVE_PAUSE
CHANGE_FRAMING
REFRAME
PAN_TO_TARGET
PUNCH_IN
PULL_OUT
CUTAWAY_PLACEHOLDER
TEXT_EMPHASIS
NO_EDIT
```

Future:

```text
INSERT_BROLL
INSERT_GENERATED_BROLL
MUSIC_CUE
SFX_CUE
CAPTION_STYLE_CHANGE
REACTION_HOLD
SPEED_RAMP
FREEZE_FRAME
```

---

# 15. Editorial Intent Contract

```json
{
  "schema_version": "1.0",
  "plan_id": "eip_...",
  "source_bundle_id": "ceb_...",
  "skill_versions": {
    "director": "ai-editor-director@1.0.0",
    "rough_cut": "rough-cut@1.0.0"
  },
  "policy_id": "talking-head-balanced-v1",
  "intents": [
    {
      "intent_id": "intent_001",
      "type": "EMPHASIZE_SPEAKER",
      "time_range": {
        "domain": "SOURCE_TIME",
        "timebase": {"num": 1, "den": 90000},
        "start_tick": 1278000,
        "end_tick": 1683000,
        "display_ms": {"start": 14200, "end": 18700}
      },
      "target_ref": "face_track_02",
      "preferred_framing": "CLOSE_UP",
      "energy": 0.76,
      "model_confidence": 0.91,
      "reason": "Important claim begins",
      "evidence_refs": [
        "speech_44",
        "emphasis_11",
        "face_track_02"
      ]
    }
  ]
}
```

---

# 16. AI Skill Architecture

ห้ามสร้าง Prompt เดียวที่ทำทุกอย่าง

ระบบควรเป็น Skill Orchestration

## 16.1 Content Understanding Skill

หน้าที่:

- summary
- structure
- topic segmentation
- key claims
- CTA
- semantic importance

## 16.2 Rough Cut Skill

หน้าที่:

- detect removable filler
- repeated sentence
- false start
- bad take
- long silence
- low-value segment

## 16.3 Pacing Skill

หน้าที่:

- pacing
- visual change density
- pause preservation
- edit rhythm

## 16.4 AI Editorial Director Skill

หน้าที่:

- ตัดสิน editorial intent
- attention management
- scene energy
- visual storytelling

## 16.5 Camera Direction Skill

หน้าที่:

- virtual framing suggestion
- attention target
- pan/zoom direction
- return behavior

## 16.6 Editorial QC Skill

หน้าที่:

- วิเคราะห์ proposed plan
- ตรวจความซ้ำ
- visual monotony
- over-edit
- style inconsistency

---

# 17. Skill Execution Modes

User ต้องเลือกเปิด/ปิดได้อิสระ

ตัวอย่าง:

```text
[x] AI Rough Cut
[x] AI Director
[x] Virtual Camera
[x] Jump Cut
[ ] B-roll
[x] Caption Emphasis
[ ] Music
```

ระบบห้ามบังคับ user ทำ workflow แบบ wizard ทีละ step เสมอ

---

# 18. Editorial Policy

แทน preset แบบ rule ตายตัว ให้ใช้ policy object

```json
{
  "policy_version": "1.0",
  "style": "TALKING_HEAD_BALANCED",
  "pace": 0.62,
  "camera_energy": 0.55,
  "jump_cut_intensity": 0.45,
  "zoom_intensity": 0.36,
  "pan_intensity": 0.22,
  "broll_density": 0.10,
  "face_priority": 0.90,
  "minimum_hold_ms": 1400,
  "maximum_no_change_ms": 9000,
  "max_punch_in_per_15s": 2,
  "prefer_semantic_cuts": true
}
```

---

# 19. Recommended Style Profiles

Phase 1:

- Talking Head — Balanced
- Talking Head — Dynamic
- Educational
- Product Review
- Interview
- Podcast
- Corporate
- Short-form Viral
- Documentary
- Minimal / Natural

User ต้องปรับ sliders ได้โดยไม่ต้องเลือก preset

---

# 20. EditHistoryContext

AI Director ต้องรู้ว่าระบบเพิ่งทำอะไรไป

```json
{
  "window_ms": 30000,
  "camera_change_count": 5,
  "punch_in_count": 2,
  "pan_count": 1,
  "jump_cut_count": 3,
  "framing_history": [
    "MEDIUM",
    "CLOSE_UP",
    "MEDIUM",
    "WIDE"
  ],
  "recent_patterns": [
    "PUNCH_IN",
    "HOLD",
    "JUMP_CUT"
  ]
}
```

ใช้เพื่อป้องกัน:

- zoom ซ้ำ
- close-up ซ้ำ
- pattern ซ้ำ
- over-edit

---

# 21. Editorial Compiler

## 21.1 Responsibilities

แปลง:

```text
EditorialIntentPlan
```

เป็น:

```text
ExecutableEditPlan
```

โดยใช้:

- source metadata
- resolution budget
- face tracks
- activity tracks
- camera grammar
- safe cut points
- output aspect ratio
- user policy

## 21.2 Compiler modules

```text
CutPlanner
VirtualCameraPlanner
ReframePlanner
PanZoomPlanner
TransitionPlanner
TimingNormalizer
ConflictResolver
```

---

# 22. Conflict Resolution

กรณี Intent ซ้อนกัน:

```text
JUMP_CUT + PAN_TO_TARGET
```

หรือ

```text
REMOVE_SEGMENT + EMPHASIZE_SPEAKER
```

ต้องมี priority

Suggested default:

```text
REMOVE_SEGMENT
> SAFETY
> HARD_CUT
> TARGET_CHANGE
> FRAMING
> PAN/ZOOM
> COSMETIC
```

AI ไม่เป็นผู้ resolve low-level conflict

---

# 23. ExecutableEditPlan

ตัวอย่าง:

```json
{
  "schema_version": "1.0",
  "plan_id": "eep_...",
  "source_fingerprint": "sha256:...",
  "output": {
    "width": 1080,
    "height": 1920,
    "fps": 30
  },
  "operations": [
    {
      "operation_id": "op_001",
      "type": "CAMERA",
      "time_range": {
        "domain": "TIMELINE_TIME",
        "timebase": {"num": 1, "den": 90000},
        "start_tick": 1278000,
        "end_tick": 1683000,
        "display_ms": {"start": 14200, "end": 18700}
      },
      "camera": {
        "from": "MEDIUM",
        "to": "CLOSE_UP",
        "animation": "EASE_IN_OUT",
        "duration_ms": 320
      },
      "derived_from_intent": "intent_001"
    }
  ]
}
```

---

# 24. Non-Destructive Timeline Model

Timeline operation ต้องสามารถ:

- enabled / disabled
- locked
- user_modified
- AI_generated
- regenerated
- versioned

Suggested fields:

```json
{
  "operation_id": "op_001",
  "origin": "AI",
  "enabled": true,
  "locked": false,
  "user_modified": false,
  "version": 3
}
```

หาก user แก้ operation เอง ระบบ AI รอบถัดไปต้องไม่ overwrite โดยอัตโนมัติ

---

# 25. Safety Validator

## 25.1 Pre-render checks

ต้องตรวจ:

### Crop

- target อยู่ใน frame
- face อยู่ใน safe region
- headroom
- crop boundary
- aspect ratio

### Zoom

- safe limit
- soft limit
- hard limit
- output resolution quality

### Pan

- max velocity
- max acceleration
- target validity
- easing

### Cut

- safe cut timing
- no invalid overlap
- audio continuity

### Evidence

- cue มี evidence
- confidence ผ่าน threshold
- evidence ยัง valid

### Timeline

- no negative duration
- no collision ที่แก้ไม่ได้
- source range valid

---

# 26. Confidence Policy

เกณฑ์ Auto Apply ด้านล่างต้องใช้ `system_confidence` ตาม Section 91 ไม่ใช่ model self-report โดยตรง

ตัวอย่าง:

```text
>= 0.80   Auto Apply
0.60-0.79 Apply with QC warning
0.40-0.59 Suggest only
< 0.40    Reject
```

Threshold ต้องปรับได้ตาม feature

เช่น `REMOVE_SEGMENT` ควรเข้มกว่า `SUBTLE_ZOOM`

---

# 27. Local Fallback

AI Failure ต้องไม่หยุด workflow

Trigger:

- timeout
- server unavailable
- skill error
- invalid schema
- low confidence
- validation fail
- auth fail
- insufficient credit
- interrupted job

Fallback:

```text
Face Tracking
+ Activity Tracking
+ Rule-based SafeCut
+ Camera Grammar
+ Local AttentionBeat
```

ต้องติด label:

```text
mode = "LOCAL_FALLBACK"
```

เพื่อให้ UI บอก user ได้

---

# 28. Cache Strategy

Cache Key:

```text
source_fingerprint
+ evidence_schema_version
+ detector_versions
+ editorial_policy_hash
+ skill_versions
+ output_aspect_ratio
```

แยก cache:

```text
Analysis Cache
Evidence Cache
AI Intent Cache
Compiler Cache
Preview Cache
Render Cache
```

เปลี่ยน Style Policy ไม่ควรบังคับ run face detector ใหม่

เปลี่ยน Output Aspect Ratio ไม่ควรบังคับ run ASR ใหม่

---

# 29. Source Fingerprint

Fingerprint ควรประกอบ:

- file size
- duration
- media stream metadata
- partial content hashes หลายตำแหน่ง
- optional full hash

Phase 1 แนะนำ:

```text
fast fingerprint
```

ก่อน

ถ้าต้องการ archival reproducibility ค่อยใช้ full SHA-256

---

# 30. Authentication / Control Plane

Runner และ Windows Worker ห้ามเก็บ Provider API Key

Flow:

```text
Execution Agent (Runner / Windows Worker)
→ SmartAIHub authenticated agent session
→ Control Plane
→ Skill Gateway
→ AI Provider
```

Execution agent รับเพียง:

- short-lived job token
- signed upload URL ถ้าจำเป็น
- signed asset fetch URL
- scoped capability
- project/job scope

ห้ามส่ง master token หรือ provider credential ให้ execution agent

---

# 31. Integration with Existing Job Control Plane

AI Editor Director ต้องใช้ `worker_jobs` / `worker_job_events` และ lease/control-plane เดิมเป็น **ระบบ dispatch กลางของ Local Runner, SHARED_CONTAINER_RUNNER และ Windows Worker**

ห้ามสร้าง queue/job table อีกชุดสำหรับ Video Editor

Suggested job types:

```text
media.analysis
media.evidence.build
editor.ai.intent
editor.compile
editor.validate
editor.preview
editor.render
editor.qc
editor.artifact.commit
```

These are logical control-plane stages. They MUST be mapped to the repository's
canonical `worker_jobs` and outbox records rather than implemented as a new
Video Editor queue. Heavy stages must declare an execution-agent capability;
server-only stages must remain server orchestration. The current compatibility
mapping is:

| Spec 203 logical stage | Current/target dispatch |
|---|---|
| `editor.ai.intent` | Server Skill/LLM orchestration; immutable intent result |
| `media.analysis` / `media.evidence.build` | Existing editor media job only after an EvidenceBundle adapter is available |
| `editor.compile` / `editor.validate` | Server or hybrid compiler/validator; output is versioned before render |
| `editor.preview` / `editor.render` | Existing editor Worker render path only for supported canonical NLE operations |
| `editor.qc` | Worker/Hybrid QC; must produce typed QC result before artifact completion |
| `editor.artifact.commit` | Server-owned Library/project link acknowledgement |
| `video.composition_scan` | Existing Feature 191/186 Node executor adapter; not Windows Worker parity until explicitly implemented and advertised |

An operation that has an envelope schema but no eligible executor MUST become a
visible capability-blocked result with an actionable reason. It must not be
accepted as production-ready merely because `worker_jobs` contains a row.

Job ต้องรองรับ:

- idempotency
- lease
- heartbeat
- retry
- cancellation
- progress
- event log
- recovery
- capability matching
- asset-locality constraints
- immutable project/timeline revision pinning
- artifact commit acknowledgement

## 31.1 Video Editor Job Envelope

```json
{
  "job_id": "job_...",
  "job_type": "editor.render",
  "project_id": "proj_...",
  "project_revision": 42,
  "timeline_revision": 117,
  "execution_snapshot_ref": "pes_...",
  "required_capabilities": [
    "render.ffmpeg.cpu",
    "qc.video"
  ],
  "asset_locality": "LOCAL_ONLY|LIBRARY_AVAILABLE|CLOUD_AVAILABLE|HYBRID",
  "preferred_agent_id": null,
  "output_target": {
    "kind": "SMARTAIHUB_LIBRARY"
  }
}
```

## 31.2 Executor Class

แม้ใช้ Job Control Plane ชุดเดียวกัน แต่ไม่ใช่ทุก job ต้องส่งไป Runner/Windows Worker

แต่ละ job ต้องประกาศ:

```text
BROWSER            งาน UI/interaction เบามาก ทำทันทีใน Web Editor; ไม่สร้าง worker job
SERVER             งานเบา/control-plane/Skill orchestration
EXECUTION_AGENT    งาน media-heavy ที่ Runner/Windows Worker รับ
HYBRID             server orchestrates และสร้าง child execution jobs
```

ตัวอย่าง workload placement:

| Workload | Executor class |
|---|---|
| timeline drag/trim metadata / keyframe editing | BROWSER + persist SERVER |
| lightweight validation / UI preview geometry | BROWSER |
| project save/revision/auth/credit | SERVER |
| `editor.ai.intent` | SERVER |
| `media.analysis` | EXECUTION_AGENT |
| `media.evidence.build` | EXECUTION_AGENT |
| `editor.compile` | HYBRID หรือ EXECUTION_AGENT ตาม geometry dependency |
| `editor.preview` ที่ต้อง decode/compose video | EXECUTION_AGENT |
| `editor.render` | EXECUTION_AGENT |
| `editor.qc` | EXECUTION_AGENT/HYBRID |
| `editor.artifact.commit` | SERVER + agent upload handshake |

`BROWSER` workload ไม่เข้าคิว `worker_jobs`; เมื่อ operation ต้องใช้ media decode/CPU/GPU/IO หนักต้องยกระดับเป็น execution job แทน

การใช้ table/control plane เดียวกันไม่ได้แปลว่า server-side AI reasoning ต้องวิ่งผ่าน desktop Runner

## 31.3 Scheduling Rules

Default = **AUTO**

Scheduler เลือก agent จาก:

```text
required capabilities
platform/runtime compatibility
asset locality
GPU/encoder availability
free RAM/VRAM/disk
current leases/load
tenant/user permission
agent health/version
```

User อาจเลือก execution preference ได้ เช่น:

```text
Auto
This Windows Worker
This Runner
Cloud Runner
```

แต่ server ต้อง validate eligibility อีกครั้ง ห้าม UI force agent ที่ capability ไม่พอ

## 31.4 Claim / Lease Semantics

Local Runner และ Windows Worker ใช้ protocol/control contract เดียวกัน:

```text
agent heartbeat
→ eligible job discovery/assignment
→ atomic lease
→ fetch immutable execution snapshot
→ execute
→ progress/events
→ artifact commit
→ complete lease
```

job ที่ lease อยู่ห้ามถูก agent อื่น execute ซ้ำ ยกเว้น lease expiry/reclaim ตาม idempotency rules

Cloudflare Container ใช้ execution contract และ lease/fence semantics ชุดเดียว
กันผ่าน profile SHARED_CONTAINER_RUNNER ของ Feature 205 แต่ไม่เปิด direct
user-device control channel และไม่ถูก model เป็น persistent user agent

## 31.5 Project File Transfer

คำว่า “ส่ง project file ให้ Worker” ใน UX ต้องหมายถึง **ส่ง immutable `ProjectExecutionSnapshot`/manifest** ไม่ใช่ copy database/project state แบบ mutable ไปให้ agent

Snapshot ต้องอ้าง asset ด้วย logical refs + fingerprint และ agent resolve bytes ตาม locality

## 31.6 Final Result Return

หลัง render สำเร็จ execution agent ต้อง upload output กลับ Library ก่อนจบ job:

```text
render local/temp
→ QC
→ hash
→ signed Library upload
→ server commit
→ Library item created
→ project artifact linked
→ job completed
```

---

# 32. Job State Model

```text
queued
waiting_agent
accepted
running
waiting_remote
validating
rendering
uploading_artifact
qc
blocked_source_missing
blocked_asset_unavailable
completed
failed
cancelled
fallback
```

`completed` ใช้ได้ต่อเมื่อ required artifact ถูก commit กลับ Server/Library แล้ว สำหรับ job ที่มี output artifact

The repository currently stores the editor lifecycle as
`queued|claimed|preparing|running|uploading|publishing|indexing|completed|failed|canceled|expired`.
Until a versioned enum migration is made, the names above are API/UI projections:
`waiting_agent→queued`, `accepted→claimed`, `validating/rendering→running` with
stage events, `uploading_artifact→uploading`, `qc→indexing` or a typed QC event,
and `cancelled→canceled`. The projection MUST preserve failure category,
capability block, stale revision, and artifact-commit status.

Progress:

```text
0–20   Analyze media
20–35  Build evidence
35–50  AI editorial analysis
50–65  Compile plan
65–75  Validate
75–90  Render preview/final
90–100 QC
```

---

# 33. SmartAIHub Web UI

## 33.1 Main Requirement

UI ต้องใช้ง่ายและไม่บังคับ user ผ่าน wizard เสมอ

User ต้องสามารถ:

- ใช้เพียง Rough Cut
- ใช้เพียง Virtual Camera
- ใช้ AI Director
- ใช้ทั้งหมด
- แก้ manual timeline ต่อจาก AI

ได้

## 33.2 Web Editor Is a Full Editing Surface, Not a Thin Job Form

หน้า Web Editor ต้องคง Timeline และเครื่องมือหลักครบถ้วน แม้งานหนักจะถูกส่งออกไป execution agent

Web ต้องสามารถสร้าง/แก้ canonical timeline โดยไม่ต้องเปิด Windows Worker UI

สิ่งที่ dispatch:

```text
Analyze media
Generate proxy
Face/Activity scan
Heavy ASR/inference
Preview render ที่ต้อง decode/compose หนัก
Final render/export
Post-render QC
```

สิ่งที่ควรอยู่บน Web/Server เมื่อเบาพอ:

```text
Timeline CRUD
track/clip metadata
AI Skill orchestration
policy editing
project save/version
change-set review
job control/status
Library browsing
lightweight transform metadata
```

## 33.3 Execution Status UX

UI ต้องแยกสถานะอย่างน้อย:

```text
Project saved
Waiting for execution agent
Assigned: <agent>
Downloading/Resolving assets
Analyzing
Rendering preview
Rendering final
Uploading to Library
QC
Completed
Blocked: source unavailable
Failed
```

ปุ่มเดิมแนว `ส่ง Worker` ควรทำหน้าที่เป็น **submit to execution control plane** ไม่ควรผูกตรงกับ Windows Worker ตัวใดตัวหนึ่ง

UI อาจใช้ label เช่น `Run / Render`, `Send to Runner`, หรือคงชื่อเดิมเพื่อ compatibility แต่ backend semantics ต้องเป็น scheduler-based

## 33.4 Shared Project Indicator

เมื่อ Project เดียวเปิดพร้อมกันบน Web และ Windows Worker UI ต้องแสดง:

- current project revision
- sync state
- last saved time
- external update available
- conflict state
- render revision

เพื่อป้องกัน user เข้าใจว่า desktop กับ web เป็น project คนละชุด

---

# 34. Proposed UI Layout

```text
┌────────────────────────────────────────────┐
│ Video Preview                              │
│                                            │
└────────────────────────────────────────────┘

┌───────────────┬────────────────────────────┐
│ AI Editor     │ Timeline                   │
│               │                            │
│ Style         │ Video Tracks               │
│ Intensity     │ Camera Track               │
│ Rough Cut     │ Caption Track              │
│ Camera        │ Audio Track                │
│ Jump Cut      │                            │
│ B-roll        │                            │
└───────────────┴────────────────────────────┘
```

---

# 35. AI Editor Panel

## Core controls

```text
AI Editor Director        ON/OFF
AI Rough Cut              ON/OFF
Virtual Camera            ON/OFF
Jump Cut                  ON/OFF
Auto Reframe              ON/OFF
Pan to Activity           ON/OFF
Caption Emphasis          ON/OFF
B-roll                    ON/OFF
```

### Style

```text
Preset
Pace
Camera Energy
Zoom Intensity
Jump Cut Intensity
Face Priority
Visual Change Frequency
```

---

# 36. AI Analysis Result UI

เมื่อ user เลือก operation:

```text
00:31.4 – 00:34.9

Action:
Punch-in → Close-up

Reason:
Key claim + strong vocal emphasis

Evidence:
Speech emphasis
Face visible
Safe crop available

System Confidence:
91%

[Accept] [Reject] [Replace] [Regenerate]
```

---

# 37. Timeline Visualization

AI-generated edits ต้องมองเห็นต่างจาก manual edits

แนะนำ metadata badge:

```text
AI
Local
Manual
Fallback
Warning
```

ไม่จำเป็นต้องกำหนดสี hard-coded ใน data model

---

# 38. Camera Track

ควรมี Camera Track แยก:

```text
MEDIUM ───── CLOSE ───── MEDIUM ─── WIDE
```

User click แล้วแก้:

- framing
- target
- zoom
- duration
- easing

ได้

---

# 39. Preview Mode

ก่อน render final ต้องมี:

### A. Fast Camera Preview

ใช้ low-res proxy

### B. Timeline Preview

render เฉพาะช่วงที่แก้

### C. Full Preview

proxy ทั้ง timeline

ไม่ควร render source quality ทุกครั้ง

---

# 40. Proxy Strategy

สร้าง proxy ครั้งแรก:

```text
720p
low bitrate
keyframe optimized
```

ใช้สำหรับ:

- scrub
- preview
- analysis frame extraction
- fast render

Final render จึงกลับไปอ่าน source ต้นฉบับ

---

# 41. AI Rough Cut

ต้อง detect:

- filler word
- repeated phrase
- false start
- correction
- long pause
- duplicate take
- unrelated segment

แต่ต้องไม่ auto-delete โดยไม่มี confidence threshold

## Example

ต้นฉบับ:

```text
"วันนี้ผมจะ... เอ่อ...
วันนี้ผมจะอธิบายเรื่อง AI Editor"
```

ผล:

```text
REMOVE:
"วันนี้ผมจะ... เอ่อ..."

KEEP:
"วันนี้ผมจะอธิบายเรื่อง AI Editor"
```

---

# 42. Rough Cut Safety

ห้ามตัด:

- คำที่ทำให้ความหมายเปลี่ยน
- ปฏิเสธ เช่น "ไม่"
- ตัวเลขสำคัญ
- ชื่อบุคคล/สินค้า
- sentence context ที่จำเป็น

ถ้าความมั่นใจต่ำ:

```text
SUGGEST_REMOVE
```

แทน `REMOVE_SEGMENT`

---

# 43. Jump Cut Policy

Jump Cut ไม่ควรเป็น timer-based

Trigger ได้จาก:

- filler removal
- bad take removal
- semantic emphasis
- change in thought
- attention beat
- pacing need

ต้องใช้ SafeCutPoint

---

# 44. Pan / Activity Policy

Pan ไป Activity ได้ต่อเมื่อ:

- activity confidence ผ่าน threshold
- target bbox valid
- target มี duration พอ
- pan speed อยู่ใน safe range
- subject หลักไม่หายเกินกำหนด

หลังจากนั้นสามารถ:

```text
PAN_TO_TARGET
HOLD
RETURN_TO_FACE
```

---

# 45. Hold Policy

ระบบต้องรู้จัก “ไม่ทำอะไร”

`HOLD` เป็น intent สำคัญ

เพราะ production editing ที่ดีต้องมี breathing room

AI ต้องไม่พยายามสร้าง visual change ทุก beat

---

# 46. Editing Rhythm

ระบบต้องรักษาความหลากหลาย:

```text
Hold
→ Punch In
→ Hold
→ Jump Cut
→ Medium
→ Hold
→ Activity
→ Return
```

หลีกเลี่ยง:

```text
Zoom
→ Zoom
→ Zoom
→ Zoom
```

---

# 47. Editorial QC

ก่อน Final Render:

ตรวจ:

- over-edit
- under-edit
- repetitive framing
- repetitive movement
- crop safety
- face loss
- low-res crop
- jump cut timing
- audio discontinuity
- caption overlap
- transition density
- excessive motion
- insufficient hold
- visual monotony

---

# 48. Post-render QC

หลัง render ตรวจ sample หรือ proxy output

ควรตรวจ:

- black frame
- frozen frame
- dropped frame
- corrupted audio
- A/V sync
- crop outcome
- face edge violation
- unexpected blank area

---

# 49. QC Score Model

ภายในระบบใช้ score ได้ แต่ไม่จำเป็นต้องแสดงเป็น “คะแนนคุณภาพรวม” ให้ user เสมอ

Suggested internal metrics:

```text
crop_safety
visual_variety
motion_smoothness
semantic_cut_quality
audio_continuity
face_visibility
resolution_integrity
```

---

# 50. Repair Loop

หาก QC fail:

```text
Plan
→ Validate
→ Detect violation
→ Repair only affected operations
→ Revalidate
```

ห้าม generate ทั้ง timeline ใหม่ถ้าเสียเพียง operation เดียว

---

# 51. Versioning

ทุก object ต้อง versioned:

```text
EditorialEvidenceBundle
EditorialIntentPlan
EditorialPolicy
ExecutableEditPlan
CameraGrammar
Skill
Detector
Compiler
```

ต้องสามารถดูว่า Final Render มาจาก version ไหน

---

# 52. Audit Trail

Operation ต้องเก็บ:

```text
created_by
source_intent
evidence_refs
skill_version
compiler_version
validation_result
user_modified
```

---

# 53. Regeneration Semantics

User เลือก:

```text
Regenerate this cut
Regenerate this scene
Regenerate camera only
Regenerate pacing only
Regenerate all AI edits
```

ระบบต้องไม่ overwrite manual edit ที่ `locked=true`

---

# 54. API Design

## 54.1 Create Analysis Job

```http
POST /v1/editor/projects/{project_id}/analysis
```

Input:

```json
{
  "source_asset_id": "asset_...",
  "analysis_profile": "editorial-v1"
}
```

---

## 54.2 Submit Evidence

```http
POST /v1/editor/projects/{project_id}/evidence
```

---

## 54.3 Request AI Director

```http
POST /v1/editor/projects/{project_id}/director
```

Input:

```json
{
  "evidence_bundle_id": "ceb_...",
  "policy_id": "talking-head-balanced-v1",
  "features": {
    "rough_cut": true,
    "virtual_camera": true,
    "jump_cut": true,
    "activity_pan": true
  }
}
```

---

## 54.4 Compile

```http
POST /v1/editor/projects/{project_id}/compile
```

---

## 54.5 Validate

```http
POST /v1/editor/projects/{project_id}/validate
```

---

## 54.6 Preview

```http
POST /v1/editor/projects/{project_id}/preview
```

---

## 54.7 Render

```http
POST /v1/editor/projects/{project_id}/render
```

The HTTP examples are logical contracts. The current Web application is tRPC;
the implementation plan must name the exact tRPC procedures or add the REST
adapter deliberately. A second unowned API surface is not implied by this spec.

---

# 55. WebSocket / Event Stream

UI ต้องเห็น progress real-time

Event examples:

```text
analysis.started
analysis.face.progress
analysis.asr.progress
evidence.ready
director.started
director.ready
compile.ready
validation.warning
preview.ready
render.progress
qc.completed
```

---

# 56. Error Model

ทุก error ต้อง normalized:

```json
{
  "code": "EDITOR_AI_TIMEOUT",
  "stage": "director",
  "retryable": true,
  "fallback_available": true,
  "message": "AI Director timed out"
}
```

---

# 57. Observability

ต้องเก็บ:

- analysis duration
- skill latency
- token usage
- retry count
- validation reject count
- fallback count
- render time
- cache hit
- cache miss
- QC violation
- user reject/accept rate

ห้าม log:

- secret
- provider API key
- raw private media โดยไม่จำเป็น

---

# 58. Cost Control

AI Director ควรใช้ Evidence ก่อน

Phase 1 request:

```text
Metadata
Transcript
Semantic Segments
Face/Activity Tracks
Selected Preview Frames
```

ไม่ upload full video

Preview image sampling:

- scene boundaries
- high attention beats
- uncertain activity
- camera planning candidates

จำกัดจำนวนภาพตาม duration และ policy

---

# 59. Full-video AI Analysis — Future Option

เป็น Optional Mode:

```text
Standard
Evidence Only

Enhanced
Evidence + More Preview Frames

Full AI Vision
Full/Chunked Video Analysis
```

ต้องแสดง cost estimate ก่อน run

---

# 60. Security

## Required

- signed URLs
- scoped tokens
- short-lived access
- no provider API key in Worker
- encrypted transport
- audit
- project access check
- tenant isolation
- asset permission check

---

# 61. Data Retention

Evidence:

- เก็บตาม project retention

Preview Frames:

- user-configurable retention
- delete ได้

Source:

- local source อาจไม่ upload

AI payload:

- ส่งเท่าที่จำเป็น

---

# 62. Performance Targets

Phase 1 indicative targets:

### 10-minute 1080p Talking Head

บนเครื่องระดับ desktop GPU:

- proxy generation: background
- face/activity analysis: near real-time หรือเร็วกว่าเมื่อ optimized
- evidence generation: incremental
- AI Director: request แบบ metadata-first
- preview generation: เฉพาะ affected ranges

ไม่ควรบล็อก UI

---

# 63. Incremental Analysis

Execution agent ต้องส่ง progress และ persist intermediate state

ถ้าหยุดกลางทาง:

```text
resume from last completed segment
```

ไม่เริ่มวิเคราะห์ใหม่ทั้งหมด

---

# 64. Chunking

วิดีโอยาวควรแบ่ง logical chunks:

```text
5–15 minute analysis windows
```

แต่ต้องมี overlap/context

AI Director ควรได้:

```text
global summary
+ local chunk
+ previous EditHistoryContext
```

เพื่อไม่ให้ style ขาด continuity

---

# 65. Long Video Strategy

สำหรับ 1–3 ชั่วโมง:

```text
Pass 1
Global Structure

Pass 2
Rough Cut

Pass 3
Editorial Beats

Pass 4
Camera

Pass 5
QC
```

ไม่ส่งรายละเอียด frame-level ทั้งหมดให้ AI ในครั้งเดียว

---

# 66. Output Aspect Ratio

ต้องรองรับ:

```text
16:9
9:16
1:1
4:5
custom
```

Camera Plan ต้อง compile ใหม่ตาม output aspect ratio

แต่ Evidence ไม่ต้องวิเคราะห์ใหม่

---

# 67. Multi-output

หนึ่ง source สามารถสร้าง:

```text
YouTube 16:9
Reels 9:16
Shorts 9:16
Square 1:1
```

โดย reuse:

- transcript
- face track
- semantic segment
- activity
- rough cut decisions

แต่ camera plan แตกต่างได้

---

# 68. User Feedback

User action:

```text
Accept
Reject
Replace
Modify
Lock
```

ระบบเก็บ feedback เป็น metadata

Phase 1 ใช้เพื่อ:

- improve session behavior
- adjust policy

Future:

- personal editorial profile

---

# 69. Personal Editorial Profile — Future

ตัวอย่าง:

```json
{
  "prefers_slower_camera_changes": true,
  "avoids_extreme_closeup": true,
  "likes_jumpcuts": false,
  "average_hold_preference_ms": 4200
}
```

ห้ามเปลี่ยน style แบบ opaque โดย user ไม่รู้

---

# 70. Recommended Implementation Phases

## Phase 1 — Foundation

- EditorialEvidenceBundle
- Face tracking
- Activity tracking
- Scene change
- Motion
- ASR
- Preview frame extraction
- source fingerprint
- cache
- job integration

## Phase 2 — Camera Director

- Virtual Camera
- Resolution Budget
- Camera Grammar
- Pan/Zoom
- Return to Face
- camera timeline

## Phase 3 — AI Editorial Director

- Content Understanding
- Attention Beat
- EditorialIntentPlan
- Skill Orchestrator
- EditHistoryContext

## Phase 4 — Rough Cut

- false start
- repeated speech
- silence
- filler
- SafeCutPoint
- jump cut

## Phase 5 — QC

- validation
- editorial QC
- repair loop
- post-render QC

## Phase 6 — Extended Editing

- B-roll
- caption emphasis
- music cue
- SFX
- full AI video analysis
- personalization

---

# 71. Recommended Internal Module Structure

```text
editor/
├── evidence/
│   ├── bundle_builder
│   ├── face
│   ├── activity
│   ├── motion
│   ├── audio
│   ├── transcript
│   └── semantic
│
├── director/
│   ├── skill_client
│   ├── intent_parser
│   ├── policy
│   └── history_context
│
├── compiler/
│   ├── cut_planner
│   ├── camera_planner
│   ├── pan_zoom
│   ├── reframe
│   ├── transition
│   └── conflict_resolver
│
├── validation/
│   ├── camera_rules
│   ├── crop_rules
│   ├── cut_rules
│   ├── resolution_rules
│   └── evidence_rules
│
├── timeline/
│   ├── operations
│   ├── edl
│   ├── versioning
│   └── diff
│
├── render/
│   ├── ffmpeg
│   ├── gpu_ffmpeg
│   ├── remotion
│   └── proxy
│
└── qc/
    ├── pre_render
    ├── post_render
    └── repair
```

---

# 72. Skill Package Suggestion

```text
skills/
└── ai-editor-director/
    ├── skill.json
    ├── prompt/
    │   ├── system.md
    │   ├── director.md
    │   ├── rough_cut.md
    │   └── qc.md
    ├── schemas/
    │   ├── input.schema.json
    │   ├── output.schema.json
    │   ├── editorial-intent.schema.json
    │   └── policy.schema.json
    └── tests/
```

---

# 73. Skill Input

ต้องไม่ผูกกับ provider

```json
{
  "evidence_bundle": {},
  "policy": {},
  "edit_history": {},
  "requested_features": {},
  "project_context": {}
}
```

---

# 74. Skill Output

```json
{
  "schema_version": "1.0",
  "editorial_summary": {},
  "intents": [],
  "warnings": [],
  "confidence": 0.0
}
```

---

# 75. Schema Validation

ทุก AI Output ต้อง:

1. JSON parse
2. schema validate
3. evidence refs validate
4. time range validate
5. target validate
6. confidence validate

ถ้า fail:

```text
retry structured repair once
```

ถ้ายัง fail:

```text
fallback local
```

---

# 76. Testing Strategy

## Unit Tests

- resolution budget
- crop validation
- camera grammar
- safe cut
- conflict resolution
- cache key
- fingerprint

## Golden Tests

ชุดวิดีโอมาตรฐาน:

- 1-person talking head
- 2-person interview
- product review
- low motion
- high motion
- face temporarily lost
- object activity
- vertical source
- 4K source
- 1080p source

Expected:

- deterministic compiler result
- no invalid crop
- no unsafe pan
- no timeline collision

---

# 77. AI Skill Evaluation

ควรมี benchmark dataset

Human reviewer ประเมิน:

- edit usefulness
- pacing
- visual interest
- semantic correctness
- over-edit
- under-edit
- cut naturalness

ใช้ regression test เมื่อ Skill version เปลี่ยน

---

# 78. Failure Scenarios

ต้องทดสอบ:

- no face
- multiple faces
- face switches
- no speech
- music-only
- corrupted frame
- variable frame rate
- poor ASR
- AI timeout
- invalid JSON
- low credit
- network lost
- worker restart
- render fail
- disk full

---

# 79. Acceptance Criteria — MVP

MVP ถือว่าสำเร็จเมื่อ:

1. วิเคราะห์วิดีโอ Talking Head ได้
2. สร้าง `EditorialEvidenceBundle`
3. AI Director สร้าง `EditorialIntentPlan`
4. Compiler สร้าง Virtual Camera Plan
5. Validator ป้องกัน crop และ zoom ผิด
6. User preview ผลได้
7. Timeline เป็น non-destructive
8. User disable AI operation รายตัวได้
9. AI fail แล้ว local fallback ทำงานได้
10. cache source เดิมได้
11. job resume ได้
12. render final ได้โดยไม่ต้องส่ง source full video ไป AI

---

# 80. Acceptance Criteria — Production Grade

ก่อนเปิด Production เต็มรูปแบบ ต้อง:

- ไม่มี invalid frame operation
- ไม่มี operation อ้าง evidence ที่ไม่มีจริง
- recovery หลัง execution agent restart
- deterministic recompile
- project/tenant isolation
- no provider secret in Worker
- cache invalidation ถูกต้อง
- render reproducibility
- timeline diff
- preview/final consistency
- QC repair loop
- user manual edit lock
- observability ครบ

Production acceptance additionally requires fresh evidence for the current
implementation revision: one concurrent Web/Worker conflict test, one snapshot
pin test across a subsequent timeline save, one deterministic recompile hash
test, one capability-block test for an unavailable adapter, one local-only
asset dispatch rejection, and one final artifact commit/provenance test. Focused
unit tests alone do not prove Runner/Windows Worker deployment or browser
workflow parity.

---

# 81. Recommended Default Workflow

```text
Import Video
    ↓
Execution-Agent Analysis
    ↓
Evidence Ready
    ↓
User presses "AI Director"
    ↓
SmartAIHub Skill
    ↓
EditorialIntentPlan
    ↓
Compile
    ↓
Validate
    ↓
Show AI Suggestions on Timeline
    ↓
User Preview / Edit / Disable
    ↓
Render
    ↓
QC
```

---

# 82. Recommended Automatic Mode

User สามารถเลือก:

```text
AI Auto Edit
```

ระบบทำ:

```text
Analyze
→ Rough Cut
→ Director
→ Camera
→ Validate
→ Preview
```

แต่ยังไม่ควร Final Render โดยอัตโนมัติเป็น default

---

# 83. Recommended Expert Mode

เปิดรายละเอียด:

- evidence
- confidence
- camera target
- resolution budget
- safe cut
- intent
- compiler output
- validation warnings

เหมาะสำหรับ debugging และ production editor

---

# 84. Key Product Principle

ระบบนี้ไม่ควรถูกสื่อว่าเป็นเพียง:

> Auto Zoom / Auto Reframe

แต่ควรเป็น:

> **AI Editor Director — ระบบที่เข้าใจเนื้อหา จังหวะ และความสนใจของผู้ชม แล้วสร้างแผนตัดต่อที่ตรวจสอบและแก้ไขได้**

---

# 85. Final Architecture Decision

สถาปัตยกรรมมาตรฐานที่แนะนำให้ใช้คือ:

```text
Source
  ↓
Evidence Extraction on Eligible Execution Agent
  ↓
EditorialEvidenceBundle
  ↓
Skill-first AI Reasoning
  ↓
EditorialIntentPlan
  ↓
Deterministic Editorial Compiler
  ↓
Safety Validator
  ↓
ExecutableEditPlan
  ↓
Non-Destructive Timeline
  ↓
Preview / Render
  ↓
Editorial QC
  ↓
Repair if needed
```

โดยถือหลัก:

```text
AI = Editorial Decision
Compiler = Technical Planning
Execution Agent = Heavy Execution
Validator/QC = Quality Control
Timeline = User Control
```

---

# 86. Recommended Development Rule

**ห้ามเพิ่ม AI feature ใหม่โดยให้ AI ส่งคำสั่ง render โดยตรง**

feature ใหม่ทุกตัวต้องผ่านลำดับ:

```text
Evidence
→ Intent
→ Compiler
→ Validation
→ Timeline Operation
```

ยกเว้น feature ที่เป็น deterministic local operation อยู่แล้ว

หลักนี้จะทำให้ระบบสามารถขยายจาก:

```text
AI Camera Director
```

ไปเป็น:

```text
AI Rough Cut
AI Editor
AI Editorial Director
AI Production Editor
```

ได้โดยไม่ต้องรื้อสถาปัตยกรรมหลักอีกครั้ง

---

# 87. Suggested File Path

```text
specs/feature/ai-editor-director/spec.md
```

หรือถ้าใช้ running feature number:

```text
specs/feature/<NNN>-ai-editor-director/spec.md
```

---

# 88. Runtime Boundaries and State Ownership

เพื่อป้องกัน Web, Server และ Worker มี state คนละชุด ระบบต้องกำหนด owner ชัดเจน

## 88.1 Authoritative State

| State | Source of Truth | Notes |
|---|---|---|
| Project / permissions / tenant | SmartAIHub Server | Web/Worker clients cache ได้แต่ห้ามเป็น owner |
| Job lifecycle | Existing Job Control Plane / PostgreSQL | Runner/Windows Worker ส่ง heartbeat/progress/event |
| Source media bytes | Asset-locality dependent | อาจอยู่ local desktop, Library/R2 หรือทั้งสอง; canonical identity คือ asset ref + fingerprint |
| EditorialEvidenceBundle metadata | Server authoritative after commit | Local artifact/cache เป็น materialized copy |
| EditorialIntentPlan | Server | versioned immutable revision |
| Timeline / EDL | Server | optimistic concurrency + revision id |
| Render intermediates / proxy | Execution-agent local cache or managed object storage | ต้อง regenerate ได้ |
| Final output metadata | Server / Library | final committed artifact ต้อง register ใน Library; local copy เป็น cache/working copy |
| Provider credentials | Server/Gateway only | ห้าม persist ใน Worker |

## 88.2 Command/Result Boundary

Server ส่ง `desired work` ผ่าน Job Control Plane; Runner/Windows Worker ส่ง `observed result` กลับมา

ห้ามให้ UI เขียน execution-agent local state โดยตรง และห้ามให้ Runner/Windows Worker แก้ canonical project/timeline โดยไม่มี revision precondition

## 88.3 Offline / Disconnected Execution Agent

เมื่อ Runner หรือ Windows Worker offline:

- Web ต้องแสดง `execution_agent_unavailable` แยกจาก `job_failed`
- job ที่ยังไม่ lease คงอยู่ใน queue
- job ที่ lease แล้วแต่ heartbeat หายต้องเข้าสู่ reclaim/watchdog flow
- local analysis result ที่เสร็จระหว่าง network หลุดต้องสามารถ commit แบบ idempotent เมื่อ reconnect
- ห้ามสร้าง timeline revision ซ้ำจาก replay event

## 88.4 Server vs Client vs Execution Responsibility

**SmartAIHub Server / Control Plane:** auth, tenant/project state, canonical timeline revisions, skills, credit, policy, intent orchestration, audit, collaboration, Library metadata, queue/scheduling, artifact provenance

**SmartAIHub Web Editor:** full editor UI/UX, lightweight project/timeline operations, AI controls, change-set review, job submit/monitor, proxy preview; ไม่ทำ heavy source decode/render เป็น assumption หลัก

**SmartAIHub Runner:** headless heavy execution บน Windows/macOS/Linux/Cloudflare Container ตาม capability

**SmartAIHub Worker for Windows:** desktop editor UI + execution agent โดยใช้ shared execution core เดียวกับ Runner และ shared project schema เดียวกับ Web

หลักการ: UI surface เป็น client ของ canonical project state ส่วนงานหนักถูก dispatch ผ่าน Control Plane ไปยัง execution agent ที่เหมาะสม

## 88.5 Canonical Shared Project Model

ทั้ง Web Editor และ Windows Worker UI ต้องใช้ data model เดียวกัน เช่น:

```text
EditorProject
ProjectRevision
TimelineRevision
Track / Clip / Operation
AssetReference
EditorialEvidenceBundleRef
EditorialIntentPlanRef
RenderPreset
ArtifactRef
```

ห้ามสร้าง `WebProject`, `WorkerProject` หรือ project serialization ที่มี semantic ต่างกัน

Project schema ต้อง portable และห้ามพึ่ง absolute filesystem path เป็น canonical identity

```json
{
  "asset_id": "asset_...",
  "source_fingerprint": "sha256:...",
  "local_binding": null,
  "library_ref": "lib_..."
}
```

`local_binding` เป็น device-specific materialization เท่านั้น ไม่ใช่ project source of truth

## 88.6 ProjectExecutionSnapshot

ทุก heavy job ต้อง pin exact immutable snapshot เพื่อป้องกัน timeline เปลี่ยนระหว่าง render:

```json
{
  "project_id": "proj_...",
  "project_revision": 42,
  "timeline_revision": 117,
  "snapshot_hash": "sha256:...",
  "asset_refs": [],
  "evidence_refs": [],
  "edit_plan_ref": "eep_...",
  "output_profile": {},
  "created_at": "ISO8601"
}
```

หาก user แก้ timeline หลัง submit job:

- job เดิม render revision ที่ pin ไว้ต่อไป
- timeline ใหม่เป็น revision ใหม่
- UI ต้องแจ้งว่า output ที่กำลัง render มาจาก revision ใด
- final artifact ต้อง attach กลับ revision ต้นทาง ห้ามอ้างว่าเป็น output ของ revision ล่าสุดโดยอัตโนมัติ

## 88.7 Shared Editing Between Web and Windows Worker UI

ทั้งสอง UI ใช้ Optimistic Concurrency:

```text
GET project revision N
EDIT locally
PATCH with expected_revision=N
→ success => revision N+1
→ conflict => fetch latest + explicit merge/rebase
```

ต้องรองรับ:

- autosave revision
- manual save/checkpoint
- undo/redo ใน client session
- server revision history
- conflict notification
- locked/manual operations ที่ AI ห้าม overwrite

Windows Worker offline editing อาจเก็บ `pending local branch` ได้ แต่ห้าม silently overwrite server revision เมื่อ reconnect

## 88.8 Execution Agent Identity

Local Runner และ Windows Worker ต้อง register เป็น execution agent ผ่าน
contract เดียวกัน:

```json
{
  "agent_id": "agent_...",
  "agent_kind": "RUNNER|WINDOWS_WORKER",
  "platform": "windows|macos|linux|cloudflare_container",
  "runtime_version": "x.y.z",
  "capabilities": [],
  "resource_state": {},
  "tenant_scope": [],
  "online": true
}
```

Scheduler ต้องเลือก agent จาก capabilities ไม่ใช่ชื่อผลิตภัณฑ์

Cloudflare shared Runner nodes are represented as managed execution-node
capacity under Feature 204/205. They receive server-derived Job tenant scope
and fencing context per lease; they must not be registered as a user's
persistent device.

ตัวอย่าง capabilities:

```text
media.decode.h264
media.decode.hevc
analysis.face
analysis.activity
analysis.asr
render.ffmpeg.cpu
render.ffmpeg.nvenc
render.remotion
qc.video
local_asset_access
cloud_asset_access
```

## 88.9 Local vs Cloud Asset Resolution

### Desktop Runner / Windows Worker

สามารถ resolve source จาก local media binding ได้ หาก fingerprint ตรงกับ Project asset

### Cloudflare Container / Cloud Runner

ห้ามสมมติว่ามองเห็น local filesystem ของ user

ต้องใช้ source ที่อยู่ใน Library/R2/object storage หรือ staged upload ที่ได้รับอนุญาต

ดังนั้น scheduler ต้องตรวจ `asset locality` ก่อน lease job เช่น:

```text
LOCAL_ONLY
LIBRARY_AVAILABLE
CLOUD_AVAILABLE
HYBRID
```

job ที่ต้องใช้ `LOCAL_ONLY` source ห้ามถูก dispatch ไป Cloudflare Container

### Asset Replica / Availability Registry

Project ต้องไม่เดาว่า agent ใดมีไฟล์อยู่ ต้องมี registry เช่น:

```json
{
  "asset_id": "asset_123",
  "source_fingerprint": "sha256:...",
  "replicas": [
    {"kind": "LIBRARY", "status": "READY"},
    {"kind": "AGENT_LOCAL", "agent_id": "agent_pc_01", "status": "READY"}
  ]
}
```

Rules:

- Browser import ที่ upload สำเร็จ → `LIBRARY_AVAILABLE`
- Windows Worker/desktop Runner เปิด local file → register `AGENT_LOCAL` + fingerprint
- Project แชร์ได้แม้บางเครื่องไม่มี bytes แต่ UI ต้องแสดง `source unavailable on this device`
- user สามารถเลือก `Upload/Sync source to Library` เพื่อทำ asset ให้ portable
- scheduler เลือก agent ที่มี replica อยู่แล้วเพื่อลด transfer เมื่อเหมาะสม
- local path ห้ามถูกใช้เป็น cross-device identity

## 88.10 Execution Agent Availability and Interactive Priority

Execution agent ต้อง advertise operational state เพิ่มจาก hardware capability:

```json
{
  "accept_jobs": true,
  "state": "AVAILABLE|BUSY|DRAINING|OFFLINE",
  "max_concurrency": 2,
  "active_jobs": 1,
  "interactive_session": false,
  "interactive_priority": 100
}
```

Windows Worker ที่ user กำลังตัดต่อแบบ interactive ต้องสามารถลด background concurrency หรือหยุดรับ remote jobs เพื่อไม่ให้ UI กระตุก

Runner แบบ headless สามารถตั้ง service mode ให้รับ queue ต่อเนื่องได้

Cloud/container runner สามารถใช้ autoscaling policy แต่ยังต้องเคารพ lease/idempotency เดิม

## 88.11 Final Artifact Commit Protocol

เมื่อ execution agent ทำงานเสร็จ:

1. finalize local output
2. run post-render QC
3. calculate hash/metadata
4. upload ผ่าน signed/scoped Library upload target
5. server verify artifact commit
6. register Library item
7. link artifact กับ `job_id + project_revision + timeline_revision`
8. emit `editor.render.completed`

Agent ห้าม mark job `completed` ก่อน server ยืนยัน artifact commit

Artifact provenance ต้องมี:

```text
source fingerprints
project revision
timeline revision
ExecutableEditPlan version
renderer/runtime version
agent id/kind
QC result
output hash
```

## 88.12 Execution Core Reuse

ต้องแยก package/libraries ให้ Windows Worker และ SmartAIHub Runner reuse code เดียวกันให้มากที่สุด:

```text
editor-core             project/timeline contracts
editor-execution-core   analyze/compile/render/qc
runner-host             headless job agent
windows-worker-ui       desktop UI shell
web-editor              browser UI client
```

เป้าหมายคือ Worker UI ไม่กลายเป็น implementation ของ media engine อีกชุดหนึ่ง

## 88.13 Surface Capability Matrix

| Capability | Web Editor | Runner | Windows Worker |
|---|---:|---:|---:|
| Full Timeline UI | Yes | No | Yes |
| Manual Edit | Yes | No | Yes |
| AI Director Control | Yes | No | Yes |
| Project Save/Revision | Yes | Job result only | Yes |
| Face/Activity Heavy Analysis | Dispatch | Yes | Yes |
| Proxy Generation | Dispatch | Yes | Yes |
| Final FFmpeg Render | Dispatch | Yes | Yes |
| GPU Processing | Dispatch | If available | If available |
| Cloud Container Execution | N/A | Yes | No |
| Local File Access | Browser-limited | Yes on desktop runtime | Yes |
| Upload Final to Library | Monitor | Yes | Yes |

---

# 89. Canonical Media Time, Coordinate and Geometry Contract

ระบบตัดต่อห้ามใช้ floating-point seconds เป็นตัวอ้างอิงหลัก เพราะจะเกิด drift เมื่อมี VFR, 29.97/59.94 fps, audio sample clock และหลาย operation ต่อเนื่อง

## 89.1 Canonical Time Representation

ทุก contract ต้องรองรับ:

```json
{
  "timebase": {"num": 1, "den": 90000},
  "start_tick": 1278000,
  "end_tick": 1683000,
  "display_ms": {"start": 14200, "end": 18700}
}
```

- `tick` = authoritative editing time
- `display_ms` = convenience/UI only
- preserve original stream PTS/DTS mapping
- audio ใช้ sample-accurate mapping เมื่อ cut/mix
- fields แบบ `*_ms` ใน implementation เก่าถือเป็น derived/compatibility fields เท่านั้น; schema ใหม่ต้องมี canonical tick/timebase เสมอ

## 89.2 Required Time Domains

ต้องแยกอย่างชัดเจน:

```text
SOURCE_TIME
TIMELINE_TIME
OUTPUT_TIME
FRAME_INDEX
AUDIO_SAMPLE_INDEX
```

ทุก operation ต้องระบุ domain หรือสามารถ map กลับ `SOURCE_TIME` ได้

## 89.3 Variable Frame Rate

ก่อน edit/render ต้องตรวจ VFR

ระบบต้องเลือกหนึ่งในสองแบบอย่างชัดเจน:

1. preserve original timestamps และ map ด้วย PTS
2. normalize proxy เป็น CFR แต่เก็บ `proxy_to_source_time_map`

ห้ามใช้ proxy frame number ไปอ้าง source frame โดยตรงโดยไม่มี mapping

## 89.4 Coordinate Space

bbox/target ทุกตัวต้องประกาศ coordinate system:

```json
{
  "space": "DISPLAY_NORMALIZED",
  "x": 0.22,
  "y": 0.14,
  "w": 0.31,
  "h": 0.47
}
```

Supported spaces:

```text
DECODED_PIXEL
DISPLAY_PIXEL
DISPLAY_NORMALIZED
OUTPUT_PIXEL
```

ต้อง apply rotation/orientation, sample aspect ratio และ display aspect ratio ก่อน composition decision

## 89.5 Media Geometry Metadata

EvidenceBundle ต้องเพิ่มอย่างน้อย:

```text
coded_width / coded_height
display_width / display_height
rotation
pixel_format
sample_aspect_ratio
display_aspect_ratio
color_primaries
color_transfer
color_space
color_range
bit_depth
```

เพื่อป้องกัน crop/scale ผิดและรองรับ HDR ในอนาคต

---

# 90. Timeline Semantics and Edit Mapping

การมี Non-Destructive Timeline อย่างเดียวไม่พอ ต้องกำหนด semantics หลัง trim/remove/ripple ให้ชัดเจน เพราะ AI intent ถูกสร้างจาก source time แต่ user เห็น timeline time หลัง edit แล้ว

## 90.1 Stable Source Anchors

AI operation ต้อง anchor กับ `source_asset_id + source time range` ไม่ใช่ timeline position อย่างเดียว

```json
{
  "anchor": {
    "asset_id": "asset_01",
    "source_start_tick": 1278000,
    "source_end_tick": 1683000
  },
  "timeline_projection": {
    "revision": 42,
    "timeline_start_tick": 801000
  }
}
```

เมื่อมี ripple edit ระบบต้อง recompute projection โดยไม่ทำให้ evidence/intents สูญเสียที่มา

## 90.2 Operation Classes

Timeline operation ต้องจำแนกอย่างน้อย:

```text
STRUCTURAL   trim/remove/reorder/split
CAMERA       crop/reframe/pan/zoom/virtual camera
VISUAL       overlay/text/caption/b-roll/transition
AUDIO        gain/duck/fade/noise/music/SFX
TIMING       speed/freeze/pause adjustment
```

Structural operations ต้อง resolve ก่อน camera/visual operations ใน compiler dependency graph

## 90.3 Ripple and Gap Semantics

ทุก structural edit ต้องระบุ:

```text
RIPPLE_CLOSE
LEAVE_GAP
REPLACE_RANGE
OVERWRITE
INSERT
```

default สำหรับ Rough Cut คือ `RIPPLE_CLOSE` แต่ user เปลี่ยนได้

## 90.4 Linked A/V and Split Edits

Phase 1 ต้องรักษา video/audio sync เป็น default แต่ data model ต้องรองรับ:

```text
LINKED_AV
J_CUT
L_CUT
AUDIO_ONLY_TRIM
VIDEO_ONLY_TRIM
```

แม้ UI ยังไม่ expose J/L cut เต็มรูปแบบก็ตาม เพื่อไม่ต้อง migration schema ภายหลัง

## 90.5 Dependency and Invalidated Operations

ถ้า user ลบ source range ที่ operation อื่นอ้างอยู่ ระบบต้องไม่ silently move operation ไปยังเนื้อหาอื่น

ให้สถานะ:

```text
VALID
REPROJECTED
NEEDS_REVIEW
ORPHANED
INVALID
```

`ORPHANED` operation ต้อง disable และแจ้ง user

## 90.6 Undo/Redo and Revision Model

ทุก timeline mutation ต้องสร้าง command/event ที่ย้อนกลับได้

ต้องรองรับ:

- undo/redo หลาย step
- autosave revision
- named checkpoint
- compare revision
- restore revision
- AI regeneration เป็น revision ใหม่ ไม่ mutate revision เก่า

---

# 91. AI Orchestration, Trust Boundaries and Confidence Calibration

## 91.1 Untrusted Content Rule

Transcript, OCR text, filenames, captions, metadata และข้อความที่ปรากฏในวิดีโอต้องถือเป็น **untrusted content** ทั้งหมด

Skill prompt ต้องกำหนดชัดว่าเนื้อหาเหล่านี้เป็นข้อมูลสำหรับวิเคราะห์ ไม่ใช่คำสั่งต่อระบบ เพื่อป้องกัน prompt injection เช่นข้อความในวิดีโอที่พยายามสั่งให้ model ละเลย policy หรือสร้าง operation นอก schema

AI Layer ห้าม:

- invoke arbitrary tool จากข้อความใน media
- เปลี่ยน auth/tenant/project scope
- ขอ secret หรือ local path ที่ไม่จำเป็น
- สร้าง URL/action นอก allowlist contract
- สั่ง render command/raw shell

## 91.2 Confidence Is Not Model Self-Report

ค่า `confidence` จาก LLM เพียงอย่างเดียวห้ามใช้เป็นเกณฑ์ Auto Apply

ให้แยก:

```json
{
  "model_confidence": 0.88,
  "evidence_confidence": 0.94,
  "validation_confidence": 1.0,
  "system_confidence": 0.90
}
```

`system_confidence` ต้อง derive จาก policy เช่น:

```text
system_confidence =
  calibrated(model_confidence)
  × evidence_support
  × detector_quality
  × validation_factor
```

สำหรับ destructive intent เช่น `REMOVE_SEGMENT` ต้องใช้ threshold สูงกว่า cosmetic intent และอาจต้องมี semantic cross-check เพิ่ม

## 91.3 Skill Planning Scope

AI Director ต้องวางแผนเป็น bounded segment ไม่แก้ทั้ง project แบบ opaque

Input ทุก request ควรประกอบด้วย:

```text
GlobalProjectSummary
CurrentChunkEvidence
AdjacentChunkContext
EditHistoryContext
EditorialPolicy
LockedUserEdits
CapabilityManifest
```

Output ต้องจำกัดเฉพาะช่วงที่ request ระบุ

## 91.4 Context Budgeting

ระบบต้องมี Context Builder ที่:

- deduplicate evidence
- summarize low-priority segments
- include exact transcript เฉพาะช่วงจำเป็น
- cap preview images
- preserve high-value evidence ids
- log context manifest/hash เพื่อ reproduce

ห้าม truncate JSON แบบสุ่มเมื่อเกิน context window

## 91.5 Structured Output Repair

หาก output schema invalid:

1. deterministic parser/normalizer แก้เฉพาะรูปแบบที่ปลอดภัย
2. structured repair request ได้สูงสุดตาม policy (default 1 ครั้ง)
3. validation ใหม่ทั้งหมด
4. ถ้ายัง fail → local fallback หรือ suggestion-only

ห้ามนำ partial invalid operation ไป execute

## 91.6 Model/Skill Capability Negotiation

Skill manifest ต้องประกาศ:

```text
supported_intents
max_context
vision_support
structured_output_support
preferred_chunk_duration
schema_versions
minimum_evidence_version
```

Orchestrator ต้อง reject incompatibility ก่อนเสีย token/cost

---

# 92. Worker Resilience, Resource Scheduling and Artifact Recovery

Production-grade editing ต้องคุมทรัพยากรและ recover ได้ ไม่ใช่เพียง retry job

## 92.1 Resource Admission Control

ก่อนรับ job Runner/Windows Worker ต้อง report capability/runtime state:

```json
{
  "cpu_threads_free": 8,
  "ram_free_mb": 32768,
  "gpu": [{"id": 0, "vram_free_mb": 11264}],
  "disk_free_mb": 180000,
  "encoders": ["nvenc", "libx264"],
  "detectors": ["face@1.3.2", "activity@1.0.0"]
}
```

Scheduler ต้องไม่ lease job ที่ทรัพยากรไม่พอ

## 92.2 GPU/Encoder Concurrency

ต้องมี local resource semaphore แยกอย่างน้อย:

```text
GPU_INFERENCE
GPU_ENCODE
CPU_TRANSCODE
DISK_HEAVY_IO
```

เพื่อป้องกัน detector + NVENC + render หลายงานแย่ง VRAM/IO จน crash

## 92.3 Disk Budget

ก่อน proxy/render ต้อง estimate:

```text
source read requirement
proxy size
cache size
render temp size
final output size
safety reserve
```

หาก disk ไม่พอให้ fail ก่อนเริ่ม render ด้วย error ที่แก้ไขได้ เช่น `INSUFFICIENT_LOCAL_DISK`

## 92.4 Checkpoint Contract

แต่ละ stage ต้อง commit checkpoint ที่ idempotent:

```text
ANALYSIS_SEGMENT_DONE
EVIDENCE_FINALIZED
AI_INTENT_COMMITTED
COMPILE_COMMITTED
VALIDATION_COMMITTED
PREVIEW_RENDERED
FINAL_RENDERED
QC_COMMITTED
```

Restart ต้อง resume จาก checkpoint ล่าสุดที่ integrity ผ่าน

## 92.5 Artifact Integrity

intermediate artifact ต้องมี:

```text
artifact_id
content_hash
size
producer_version
source_fingerprint
created_at
retention_class
```

ก่อน reuse cache/checkpoint ต้อง verify hash หรือ integrity marker

## 92.6 Source Missing / Changed

ก่อน resume ต้องตรวจ source fingerprint อีกครั้ง

ถ้า source:

- moved แต่ fingerprint เดิม → relink ได้
- changed → invalidate dependent analysis/render caches
- missing → job เข้าสถานะ `blocked_source_missing` ไม่ควร retry loop

## 92.7 Cancellation

Cancellation ต้อง cooperative และ stage-aware:

- AI request: cancel/ignore result by generation token
- analysis/render: terminate child process อย่างปลอดภัย
- finalize current atomic write
- release GPU/file locks
- preserve valid checkpoints

## 92.8 Crash-safe File Writes

ไฟล์ manifest/EDL/proxy metadata ต้องเขียนแบบ temp + fsync/close + atomic rename ตาม platform ที่รองรับ เพื่อลด partial/corrupt state เมื่อ app/เครื่องดับ

---

# 93. Media Pipeline Fidelity: Decode, Color, Audio and Render Parity

## 93.1 Decode Normalization

Analysis และ final render ต้องใช้ media interpretation เดียวกันสำหรับ:

- rotation/orientation
- pixel/sample aspect ratio
- color metadata
- alpha/pixel format
- VFR timestamp mapping
- field order/interlace

หาก proxy normalize สิ่งใด ต้องเก็บ transform manifest เพื่อ map กลับ source

## 93.2 Color Management

ห้าม strip color metadata โดยไม่ตั้งใจ

ต้องตรวจและ preserve/convert อย่าง explicit:

```text
color_primaries
transfer_characteristics
matrix_coefficients
color_range
bit_depth
HDR metadata when available
```

Phase 1 อย่างน้อยต้อง:

- detect SDR vs HDR
- ห้าม preview SDR conversion ถูกนำไปใช้เป็น final-grade transform โดยอัตโนมัติ
- warn เมื่อ renderer/provider ไม่รองรับ source color mode

## 93.3 Audio Clock and Sample Accuracy

Audio operation ต้องเก็บ sample rate/channel layout และ map cut boundary ไป sample clock

ต้องตรวจ:

- A/V sync before and after structural cuts
- discontinuity/click ที่ cut boundary
- channel layout preservation
- sample rate conversion ที่เกิดขึ้น

Audio cut ควรใช้ micro fade/crossfade แบบ policy-driven เมื่อจำเป็นเพื่อป้องกัน click แต่ห้ามทำจนเปลี่ยนคำพูด

## 93.4 Loudness and Peak Safety

Final QC ควรรองรับ metric:

```text
integrated loudness
short-term loudness
true peak
clipping count
silence anomalies
```

Target profile ต้อง configurable ตาม destination; ห้าม hard-code LUFS เดียวสำหรับทุก platform

## 93.5 Proxy/Final Render Parity

ทุก effect ที่ preview ได้ต้องมี parity contract กับ final renderer

ถ้า preview engine กับ final engine ต่างกัน ต้องมี golden parity tests สำหรับ:

- crop
- pan/zoom keyframe
- easing
- transition timing
- caption placement
- audio trim/fade

ห้าม approve preview ที่ final renderer แปล semantics ต่างกัน

## 93.6 Encoder Strategy

Renderer ต้องเลือก encoder ผ่าน capability/policy ไม่ใช่ hard-code

ควรรองรับ:

```text
software encode
hardware encode
fallback encode
```

และบันทึก encoder/version/options ใน render manifest เพื่อ reproducibility

## 93.7 Render Manifest

Final output ต้องมี manifest อย่างน้อย:

```text
source_fingerprint
timeline_revision
executable_plan_version
renderer_version
ffmpeg/build version
encoder
output codec/container
resolution/fps/timebase
color transform
audio transform
content hash
```

---

# 94. Editorial Quality Grammar and Anti-Overediting Controls

ระบบต้อง optimize เพื่อ “มีเหตุผลในการเปลี่ยนภาพ” ไม่ใช่ maximize จำนวน edit

## 94.1 Every Change Needs a Motive

ทุก non-trivial camera/edit operation ควรมี `motive` อย่างน้อยหนึ่งค่า:

```text
SEMANTIC_EMPHASIS
SPEAKER_CHANGE
ACTIVITY_FOCUS
PACING_RECOVERY
ERROR_REMOVAL
TOPIC_TRANSITION
COMPOSITION_REPAIR
FORMAT_ADAPTATION
USER_REQUEST
```

ถ้าไม่มี motive และ visual staleness ยังไม่ถึง policy threshold ให้ `HOLD`

## 94.2 Edit Fatigue Budget

Policy ต้องมี rolling-window budget เช่น:

```text
max_camera_changes_per_10s
max_punch_ins_per_30s
max_animated_moves_per_30s
minimum_static_recovery_ms
max_consecutive_same_motive
```

Compiler ต้อง degrade จาก dramatic action ไป subtle/hold ก่อน reject ทั้ง plan

## 94.3 Shot Size Continuity

Virtual camera transition ควรมี grammar เช่น:

- avoid tiny framing delta ที่ดูเหมือน crop error
- avoid extreme shot-size jumps หากไม่มี emphasis motive
- หลัง activity cutaway ให้ return ไป framing ที่รักษา context
- speaker switch ต้อง prefer framing ที่ระบุคนพูดชัด
- subject lost ชั่วคราวให้ hold/recover มากกว่าตาม bbox ที่ไม่นิ่ง

## 94.4 Motion Continuity

ก่อน hard cut ระหว่าง virtual cameras ต้องประเมิน:

- head/body motion direction
- gesture continuity
- optical-flow discontinuity
- face position delta

ถ้า discontinuity สูง ให้เลือก cut point อื่น, hold, หรือ use matched reframe ตาม policy

## 94.5 Eye-line and Speaking Space

Composition planner ควรรองรับ:

- look direction / nose room
- speaking space
- product space
- caption-safe area
- UI-safe area สำหรับ platform overlay หาก profile ระบุ

## 94.6 Multi-person Grammar

เมื่อมีหลายหน้า:

- active speaker เป็น primary cue แต่ไม่ใช่ cue เดียว
- reaction shot ใช้ได้เมื่อ evidence รองรับและไม่ตัดบทพูดสำคัญ
- ห้ามสลับ target จาก detector id instability; ต้องผ่าน track identity stabilization
- group framing เป็น fallback เมื่อ speaker attribution ต่ำ

## 94.7 Low-quality Source Protection

หาก source มี:

```text
low resolution
heavy compression
motion blur
face too small
noise
unstable autofocus
```

ระบบต้องลด digital zoom/animated crop intensity และอาจเลือก cut/hold/caption แทน เพื่อไม่ขยาย defect

## 94.8 Editorial Diversity Without Randomness

ความหลากหลายต้องเกิดจาก policy + history + content motive ไม่ใช่ random choice

หากใช้ deterministic tie-break ให้ seed จาก `project/revision/segment` เพื่อให้ recompile ได้ผลเดิมเมื่อ input เดิม

---

# 95. UI/UX Production Workflow Safeguards

## 95.1 Scope Before Run

User ต้องเลือก scope ได้โดยไม่ต้องเข้า wizard:

```text
Current Clip
Selected Range
Current Scene
Entire Timeline
Only Unedited Ranges
```

Default สำหรับงานยาวควรเป็น bounded scope เมื่อ user เรียกจาก selection

## 95.2 Analysis vs Apply Separation

UI ต้องแยกสถานะ:

```text
Analyze
Generate Suggestions
Preview
Apply to Timeline
Render
```

Automatic Mode สามารถ chain ได้ แต่ภายในระบบยังต้องเก็บ boundary เหล่านี้เพื่อ audit/undo

## 95.3 Before/After Review

ต้องมีอย่างน้อย:

- toggle Original / Edited
- loop selected change
- side-by-side หรือ A/B hotkey ตาม UI ที่เหมาะสม
- jump to next AI change
- jump to next warning

## 95.4 Change Set Review

AI run หนึ่งครั้งต้องสร้าง `change_set_id`

User สามารถ:

```text
Apply All
Apply Selected
Reject Selected
Revert Change Set
Regenerate Selected
```

โดยไม่กระทบ manual operations ที่ lock แล้ว

## 95.5 Warning Severity

Validation/QC UI ต้องแบ่ง:

```text
INFO
REVIEW
WARNING
BLOCKING
```

`BLOCKING` ห้าม final render จนแก้หรือ user ใช้ explicit override ที่ policy อนุญาต

## 95.6 Autosave and Conflict UX

Timeline autosave ต้องไม่ silently overwrite revision จาก tab/user อื่น

หาก revision conflict:

- แจ้ง base revision / current revision
- auto-merge เฉพาะ operation ที่ไม่ชนกัน
- operation conflict ต้องให้เลือก Keep Mine / Keep Current / Duplicate Variant

## 95.7 Worker/Job Visibility

UI ต้องแยกให้ user เข้าใจ:

```text
Waiting for Worker
Analyzing locally
Waiting for AI Skill
Compiling
Rendering preview
Rendering final
QC
Fallback mode
Blocked
```

ห้ามแสดงทุกอย่างเป็น generic `Processing...`

## 95.8 Expert Inspection

Expert mode ต้องเปิดดูได้:

- source anchor
- evidence refs
- system confidence
- intent
- compiled operation
- validation decision
- renderer mapping

แต่ Basic mode ซ่อนรายละเอียดเหล่านี้ได้

## 95.9 Accessibility / Keyboard

อย่างน้อยต้องมี:

- keyboard navigation สำหรับ timeline change review
- label ที่ไม่พึ่งสีอย่างเดียว
- readable confidence/warning text
- focus state
- undo/redo keyboard shortcut

---

# 96. Security, Privacy, Multi-Tenant Isolation and Concurrency

## 96.1 Tenant-bound Resource IDs

ทุก server-side object ต้อง resolve ภายใต้ tenant/project scope จาก authenticated principal ห้ามเชื่อ `tenant_id` ที่ Worker ส่งมาโดยตรง

รวมถึง:

```text
asset
evidence bundle
intent plan
timeline revision
preview
render artifact
skill invocation
```

## 96.2 Signed Asset Access

Signed URL/token ต้องมี:

- tenant/project scope
- asset id
- read/write action
- MIME/size constraint เมื่อเหมาะสม
- short TTL
- nonce หรือ one-time semantics สำหรับ upload ที่สำคัญ

ห้ามใช้ public-by-obscurity URL สำหรับ preview frame

## 96.3 Local Path Privacy

absolute local path เช่น `C:\Users\...` หรือ `/Users/...` ไม่ควรถูกส่งเข้า Skill payload/log server โดย default

Server ใช้ `asset_id` / logical display name; local path อยู่ Worker เท่านั้น

## 96.4 Preview/Data Minimization

Preview extractor ต้องสามารถ mask/omit frame ที่ไม่จำเป็น และ payload manifest ต้องบอกว่า asset ใดถูกส่งไป remote AI

User/Operator ต้องสามารถตรวจได้ว่า run หนึ่งส่ง:

```text
transcript ranges
preview frame ids
metadata classes
```

อะไรออกจากเครื่องบ้าง

## 96.5 Deletion Propagation

เมื่อ user ลบ project/source/analysis ตาม policy ระบบต้อง invalidate/delete dependent remote artifacts ตาม retention class:

```text
preview upload
AI request payload cache
evidence remote copy
render temp
```

local cache cleanup ต้อง retry ได้และ log completion โดยไม่ expose private filename

## 96.6 Encryption and Secrets

- TLS สำหรับ network transport
- secret/token ห้ามเขียน plain-text log
- provider credential อยู่ server secret store เท่านั้น
- short-lived Worker capability token
- revoke session/token ได้เมื่อ device ถูกถอด

## 96.7 Optimistic Concurrency

Mutation API สำหรับ timeline/policy/plan ต้องรับ precondition เช่น:

```text
base_revision
If-Match / ETag equivalent
idempotency_key
```

ถ้า revision ไม่ตรง ให้ `409 REVISION_CONFLICT` แทน last-write-wins

## 96.8 Idempotent Write APIs

API ที่สร้าง resource/job/change set ต้องรองรับ idempotency key เพื่อป้องกัน double-click/network retry ทำให้:

- สร้าง job ซ้ำ
- หัก credit ซ้ำ
- apply timeline ซ้ำ
- render ซ้ำ

## 96.9 Credit Charging Boundary

การคิด credit สำหรับ AI Skill ต้องผูกกับ invocation/idempotency record

Retry ที่เกิดจาก network delivery หลัง provider สำเร็จแล้วต้องไม่ charge ซ้ำโดยไม่ตั้งใจ

Local fallback ต้องมี cost semantics แยกชัดเจน

## 96.10 Audit Security Events

ต้อง audit อย่างน้อย:

```text
worker_registered/revoked
asset_remote_upload
skill_invoked
permission_denied
signed_url_issued
manual_override_blocking_qc
delete_requested/completed
```

---

# 97. Production Verification, Rollout and Backward Compatibility

## 97.1 Contract Tests Are Mandatory

ต้องมี automated contract tests ระหว่าง:

```text
Worker ↔ Server
EvidenceBundle ↔ Skill Input
Skill Output ↔ Intent Schema
Intent ↔ Compiler
Compiler ↔ Renderer
Timeline ↔ Preview/Final Render
```

ทุก schema version ที่ยัง support ต้องมี fixture test

## 97.2 Compatibility Matrix

Release ต้องมี matrix เช่น:

| Server | Worker | Evidence Schema | Intent Schema | Status |
|---|---|---|---|---|
| current | current | current | current | supported |
| current | previous-1 | compatible | current | compatibility-only/degraded (not promotable) |
| current | too old | incompatible | - | update required |

Server ต้อง capability-negotiate ก่อน dispatch job ไม่ใช่ปล่อยให้ fail กลางงาน

คำว่า `compatibility-only/degraded` ในตารางนี้หมายถึงแสดงผลหรือแปลงผ่าน
adapter เพื่อวินิจฉัยได้เท่านั้น ไม่ใช่การอนุมัติ Evidence, การสร้างแผนที่
executable, หรือ readiness สำหรับ production promotion; กติกา fail-closed ใน
Section 100.4 มีผลกับทุก adapter ที่คืนสถานะ degraded.

## 97.3 Schema Migration Rules

- immutable historical revision ไม่ rewrite in-place
- migrate on read หรือ explicit migration job ตามชนิดข้อมูล
- preserve original payload/hash สำหรับ audit
- unknown field ต้องไม่ทำให้ old Worker crash หาก schema policy อนุญาต forward compatibility
- breaking schema ต้องเพิ่ม major version

## 97.4 Determinism / Golden Render Tests

สำหรับ input + policy + versions เดิม:

- compiler output ต้องเท่ากันตาม deterministic fields
- render geometry/timing ต้องอยู่ใน tolerance
- randomized choice ถ้ามีต้อง deterministic seed

Golden render ใช้ perceptual/timing tolerance แทน byte-identical video เมื่อ encoder ทำให้ binary ต่างกันได้

## 97.5 Chaos / Recovery Tests

ต้องทดสอบอย่างน้อย:

- kill Worker ระหว่าง detector
- kill Worker ระหว่าง render
- network disconnect หลัง AI provider สำเร็จแต่ก่อน server receive response
- duplicate event delivery
- lease expiry/reclaim
- source ถูกย้าย
- disk เต็ม
- GPU OOM
- server restart
- R2/object upload interruption หากใช้ remote artifact

Expected outcome ต้องไม่เกิด duplicate charge, duplicate timeline apply หรือ corrupt canonical state

## 97.6 Performance Benchmark Corpus

ต้องมี benchmark อย่างน้อย:

```text
10m 1080p talking head
10m 4K talking head
30m interview 2 people
60m podcast
vertical smartphone VFR
low-light/low-quality source
```

เก็บ metric:

```text
analysis_x_realtime
peak_ram
peak_vram
disk_temp
AI payload size
AI latency
preview latency
render_x_realtime
cache hit ratio
```

## 97.7 Quality Regression Gates

Skill/Detector/Compiler version ใหม่ห้าม promote หาก benchmark แย่เกิน configured tolerance ใน metric สำคัญ เช่น:

- crop safety
- semantic cut error
- A/V sync
- invalid operation rate
- over-edit rate
- user reject rate จาก dogfood set

## 97.8 Feature Flags and Gradual Rollout

feature สำคัญต้องเปิดแบบ capability/tenant flag ได้ เช่น:

```text
ai_director_v1
rough_cut_v1
virtual_camera_v2
post_render_qc
full_video_ai_analysis
```

รองรับ:

```text
internal dogfood
selected tenant
percentage rollout
general availability
kill switch
```

## 97.9 Migration from Existing Video Editor

ต้อง integrate กับ timeline/editor เดิมแบบ incremental โดยเป้าหมายคือ **Web Editor + Windows Worker UI + Runner ใช้ project engine และ execution contract ชุดเดียวกัน**:

1. เพิ่ม AI-generated operation type โดยไม่ลบ manual editor เดิม
2. Camera Track ใหม่ต้อง coexist กับ existing tracks
3. existing project เปิดได้แม้ไม่มี AI metadata
4. AI metadata เป็น optional extension
5. ย้าย canonical project/timeline state ไป Server revision model หากส่วนใดยังอยู่เฉพาะใน Windows Worker
6. Web Editor ต้องสามารถเปิด/แก้ project เดียวกับ Windows Worker UI ได้
7. แยก heavy execution code ออกจาก Windows Worker UI เป็น `editor-execution-core` เพื่อให้ SmartAIHub Runner reuse ได้
8. Windows Worker UI เปลี่ยนจาก owner ของ project/media state เป็น client + execution agent
9. `ส่ง Worker` ใน Web ต้องเปลี่ยน backend semantics เป็น submit `worker_jobs` แล้ว scheduler เลือก Runner/Windows Worker ที่ eligible
10. เพิ่ม Agent Registration + Capability Advertisement ให้ Runner และ Windows Worker
11. เพิ่ม ProjectExecutionSnapshot เพื่อ pin revision ก่อน analysis/render
12. เพิ่ม Library Artifact Commit protocol หลัง render เสร็จ
13. Cloud Runner ต้องใช้ Library/R2/staged assets; local-only source ต้อง dispatch ไป desktop agent
14. legacy Windows Worker UI คงใช้ได้ระหว่าง migration แต่ห้าม fork schema หรือ timeline semantics ใหม่
15. ห้ามสร้าง timeline engine ชุดที่สองถ้า engine เดิมขยายได้

### Migration sequence ที่แนะนำ

```text
Step 1  Canonical shared project/timeline schema
Step 2  Server revision API + optimistic concurrency
Step 3  ProjectExecutionSnapshot
Step 4  Extract shared editor-execution-core
Step 5  Runner headless host
Step 6  Register Windows Worker เป็น execution agent แบบเดียวกับ Runner
Step 7  Web job submission ผ่าน worker_jobs
Step 8  Final artifact upload/Library commit
Step 9  Shared project open/edit ระหว่าง Web ↔ Windows Worker
Step 10 Deprecate Worker-only code paths เมื่อ parity ผ่าน
```

## 97.10 Release Gate

ก่อน Production Release ต้องผ่าน:

```text
schema compatibility
security review
15-pass cross-spec/codebase architecture checklist
contract/golden tests
recovery tests
render parity tests
benchmark thresholds
migration test from existing project
rollback/kill-switch test
```

---

# 98. Twelve-Pass Design Audit Record

เอกสาร revision เดิมบันทึกการตรวจ design 12 รอบโดยใช้ failure lens แยกกัน
การบันทึกนี้เป็น design-review history เท่านั้น ไม่ใช่ implementation proof
และไม่ยกเว้นการตรวจ cross-spec/codebase รอบใหม่:

| Pass | Review lens | Gap corrected |
|---:|---|---|
| 1 | Architecture boundaries | เพิ่ม authoritative state, Server/Worker ownership, offline semantics |
| 2 | Media/time contracts | เพิ่ม tick/PTS timebase, VFR, source/timeline/output time, coordinate geometry |
| 3 | Timeline correctness | เพิ่ม stable source anchors, ripple semantics, dependency/orphan handling, undo/revision |
| 4 | AI reliability/trust | เพิ่ม untrusted media rule, confidence calibration, bounded context, capability negotiation |
| 5 | Worker/job resilience | เพิ่ม resource admission, GPU/IO concurrency, disk budget, checkpoint/integrity/cancellation |
| 6 | Media fidelity/render | เพิ่ม HDR/color/audio sample accuracy, loudness, proxy/final parity, render manifest |
| 7 | Editorial quality | เพิ่ม motive-based editing, fatigue budget, continuity, multi-person grammar, low-quality protection |
| 8 | UI/UX production flow | เพิ่ม scope, change sets, A/B review, warnings, autosave/conflict UX, expert inspection |
| 9 | Security/multi-tenant | เพิ่ม tenant-bound IDs, signed access, local-path privacy, deletion, idempotency/credit boundary |
| 10 | Release/testability | เพิ่ม contract/compatibility/golden/chaos tests, feature flags, migration and release gates |
| 11 | Cross-section consistency | แก้ตัวอย่าง schema ให้ใช้ canonical tick/timebase และแยก detector/model/system confidence ไม่ให้ความหมายขัดกัน |
| 12 | Multi-surface runtime/project integration | เพิ่ม Web Editor + headless Runner + Windows Worker UI ให้ใช้ canonical project/revision, shared execution core, worker_jobs scheduling, asset locality และ Library artifact commit ชุดเดียวกัน |

หลักสำคัญหลัง audit: **ไม่มี stage ใดควรพึ่ง LLM output, proxy frame index, execution-agent local state หรือ timeline position เพียงอย่างเดียวเป็น source of truth**

---

# 99. Definition of Done

Feature จะถือว่า Done เมื่อ:

- architecture contracts ถูก implement
- schemas versioned
- Web Editor และ Windows Worker UI เปิด Project/Timeline เดียวกันได้
- optimistic revision/conflict handling ทำงานจริง
- SmartAIHub Runner ทำงานแบบ headless ได้อย่างน้อยบน target desktop/server platforms ที่เปิด release
- Windows Worker register และรับ `worker_jobs` ผ่าน execution-agent contract เดียวกับ Runner
- ProjectExecutionSnapshot pin exact project/timeline revision ได้
- capability + asset-locality scheduler ป้องกัน dispatch ผิดเครื่อง
- Runner/Worker analysis ทำงาน
- AI Skill output ผ่าน schema
- compiler deterministic
- validator ครบ
- timeline editable
- preview ใช้งานจริง
- local fallback ผ่าน test
- job lease/recovery/reclaim ผ่าน test
- render ที่กำลังทำไม่ถูกเปลี่ยนตาม timeline revision ใหม่
- final render ผ่าน QC
- final artifact upload และ commit เข้า SmartAIHub Library ก่อน job complete
- artifact provenance trace กลับ job/project/timeline/source ได้
- Cloud Runner ไม่ได้รับ local-only asset job
- shared execution core ไม่ fork behavior ระหว่าง Runner กับ Windows Worker
- documentation สำหรับ developer และ operator ครบ
- benchmark regression suite พร้อมใช้งาน

---

# 100. Spec 202 Integration and 15-Pass Closure Rules

This section resolves the current cross-document gaps. Spec 202's EDL is the
product-facing change-set representation; this document's Evidence, Intent,
ExecutableEditPlan, canonical Timeline, ProjectRevision, TimelineRevision, and
ProjectExecutionSnapshot are the normative runtime artifacts. A versioned adapter
must preserve source anchors, evidence references, system confidence, locks,
manual edits, and tenant scope across every conversion.

## 100.1 Current Web Video Editor boundary

The primary `/video-editor` route is the full Phase 3 browser editor with manual
timeline editing, local undo/redo, project JSON save/autosave, and explicit Worker
handoff. That satisfies the product direction of “AI tools around a real editor”.
The active Web admission boundary now closes the revision/CAS, snapshot, and
server-owned dispatch gaps. The remaining shared-runtime DoD boundaries are:

- active project save/autosave uses server `expectedRevision`/`expectedRevisionId`
  preconditions and idempotent mutation IDs; unrevisioned legacy projects remain
  explicitly read/convert compatible until migrated;
- active Web/legacy Worker handoff persists first and pins the server-returned
  ProjectRevision in the envelope, while `inputs.project` remains only a
  compatibility transport field behind the server-owned snapshot;
- current Web submit accepts tenant-owned `media_asset` references only;
- the current Worker native editor operation set is an FFmpeg subset, while ASR,
  vision, Director, Evidence build, and QC repair require explicit adapters;
- the current mapper preserves unsupported effects, transitions, overlays, and text
  as compatibility metadata; it must not claim executable parity until each item
  is either implemented by a declared capability or explicitly marked
  preserve-only/blocked;
- Web UI does not yet expose current revision, sync/conflict, external update,
  render revision, assigned agent, locality, or change-set/A-B state.

The current compatibility procedures are `videoEditorProjects.list/get/save/autoSave`,
`editorMediaJobs.submit`, and the dedicated composition-scan submit procedure.
They are adapter boundaries for the existing Web client, not a second canonical
runtime API. The migration plan must name their replacement or adapter behavior.

The current route also retains `/video-editor?legacy=1` as a rollback surface for
older project data. It is not a second canonical project model: during migration
it must use an explicit read/convert adapter, preserve source and revision hashes,
and must not write around the canonical revision/CAS path. Removal requires a
successful migration and rollback test.

The repository also has a separate `video_projects` /
`video_project_revisions` domain used by Video Studio/Intelligence. Its existing
revision/CAS behavior is useful evidence, but it is not proof that the active
`video_editor_projects` Web route has migrated. The implementation plan must
explicitly choose migration or a versioned adapter; it must not join the two
domains by ID or create a third editor project store.

These are implementation gates, not reasons to fork a Web-only project model.

## 100.2 Authoritative state and write rule

Server owns tenant/project permissions, ProjectRevision, TimelineRevision,
EvidenceBundle metadata after commit, IntentPlan, ExecutableEditPlan, change sets,
job links, artifact metadata, and audit. Execution agents own only staged bytes,
intermediate files, and materialized caches.

For unambiguous identity, a ProjectRevision MUST contain both a stable
`revision_id` and monotonic `revision_number`; a TimelineRevision MUST contain
the same pair in its project scope. `revisionId` in legacy Web payloads is an
adapter field and MUST NOT be accepted as proof of persistence. A heavy job pins
both stable IDs and numbers, plus the snapshot hash.

Every save, autosave, AI apply, Worker edit, and artifact link MUST include:

```text
project_id
expected_project_revision
expected_timeline_revision
client_mutation_id / idempotency_key
actor + tenant authorization
```

Success creates a new immutable revision. Conflict returns the latest revision
and an explicit merge/rebase path. No client or Worker may silently overwrite
the server project document.

## 100.3 Snapshot and dispatch rule

Before any heavy job, the server creates and commits a snapshot containing the
exact project/timeline revisions, canonical plan/evidence refs, asset refs and
fingerprints, output profile, capability requirements, locality constraints, and
snapshot hash. The job pins that snapshot; later edits create a new revision and
do not mutate the running job's input.

The final artifact flow is:

```text
render → QC → hash → signed Library upload → server commit
→ project/revision artifact link → job completed
```

Completion without the required commit is not success.

## 100.4 Composition scan rule

`media.composition_scan` and `video.composition_scan` are one logical capability,
not two independent editor queues. The current Web Full Scan path submits the
generic `media.composition_scan` operation, while the existing implementation is
the Feature 191/186 Node `video.composition_scan` executor. Until a Windows Worker
adapter and claim capability exist, the migration MUST route that action through
the dedicated Node control-plane adapter and show Node/feature-runtime execution;
the generic submit path must not imply Windows parity. The current Node executor
returns degraded evidence with an `object_interaction_detector_unavailable`
warning, so the UI and acceptance tests must distinguish degraded compatibility
evidence from a full detector-backed scan. Degraded evidence is diagnostic only
and MUST NOT be promoted to an approved `EditorialEvidenceBundle`, executable
camera/composition plan, or production render input. The active
`promoteCompositionScan` implementation now fails closed on
`output.status=degraded` through `isCompositionEvidencePromotable`; any future
human override must be an explicit server-side action with actor, reason,
warning, and provenance. The active generic submit path persists and snapshots
the project, and `video.composition_scan` is in the server-owned PostgreSQL
Node executor set; it must still expose a capability-blocked or waiting state
when no eligible Node executor is available rather than implying Windows
parity. A generic submit that only creates an
unclaimable queued Worker row is not valid capability readiness when no
executor advertises the required capability; admission must expose a
capability-blocked state or route to the Node adapter. If the capability is
advertised but no agent is currently available, the state may remain queued as
`waiting_agent` with timeout/retry observability. After Worker support is added,
the adapter, job type, claim token, evidence schema, and promotion path must be
contract-tested before the UI labels it Windows Worker parity.

## 100.5 15-pass audit supersession

The 15-pass audit performed on 2026-09-18 is recorded in
`orchestra/spec-audit-202-203-15-pass.md`. It supersedes the design-only “12-pass”
claim in Section 98 for cross-spec consistency. It does not claim all DoD items
are implemented; it records which contract gaps were fixed in the specs and
which code/runtime gates remain implementation work.

## 100.6 Wire-format compatibility

The canonical external schema uses `timebase.num`, `timebase.den`,
`start_tick`, and `end_tick`. The current `nle.web.1` compatibility adapter may
use `timebase.numerator`, `timebase.denominator`, and `*_ms`, but MUST declare
the adapter version and derive the canonical tick values without changing the
source/timeline/output domain. A project cannot be considered migrated merely
because integer millisecond fields validate.

The active Web Editor currently uses the serial integer
`video_editor_projects.id`, while Feature 184 revision rows use a string ID and
the separate `video_projects` domain uses its own numeric IDs. The canonical
adapter MUST define one stable `project_id` mapping and schema version; it must
not infer identity by coercing IDs across these tables.

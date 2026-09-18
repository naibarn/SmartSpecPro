# Spec 202 - SmartAIHub AI Rough Cut / AI Video Editor
## Unified Production Development Specification
**Spec ID:** 202  
**Document type:** Feature / Product / Architecture / UI-UX / Implementation Spec  
**Status:** Proposed  
**Target products:** SmartAIHub Web, SmartAIHub Desktop/Worker, Video Editor, ffmpeg-skill, Media Intelligence Pipeline  
**Canonical path:** `specs/feature/202-ai_rough_cut_video_editor_unified/spec.md`

## Contract relationship with Spec 203

Spec 202 is the product, UX, tool, and AI Rough Cut capability contract. Spec 203
is the normative shared-runtime, evidence, intent, revision, execution-agent, and
AI Editor Director contract. They are one feature family, not two independent
editor architectures.

When the documents overlap, the precedence rules are:

1. Spec 203 is authoritative for canonical time, project/timeline revisions,
   execution snapshots, job lifecycle, agent capability/locality, and artifact
   provenance.
2. Spec 202 is authoritative for user-facing tool scope, optional modules,
   Rough Cut behaviors, EDL intent, and flexible Web Editor UX.
3. Spec 202 EDL is a product-level representation. It MUST map to the Spec 203
   `EditorialIntentPlan` / `ExecutableEditPlan` / canonical Timeline contract;
   it MUST NOT introduce a second persisted timeline or queue.
4. Existing implementation fields such as `*_ms`, `revisionId` generated in a
   browser session, or direct `inputs.project` transport are compatibility
   inputs only until the server-authoritative contracts are wired.

The current `/video-editor` route uses the Phase 3 Web Editor with Worker
handoff; `/video-editor?legacy=1` remains a rollback surface for older project
data. The legacy surface must convert through an explicit versioned adapter and
must not bypass the canonical revision/CAS contract during migration.

The canonical flow is:

```text
Server ProjectRevision + TimelineRevision
  → ProjectExecutionSnapshot
  → Media Analysis / EditorialEvidenceBundle
  → EditorialIntentPlan
  → ExecutableEditPlan
  → EDL / Canonical Timeline Change Set
  → Preview / Render / QC / Library Artifact
```

No implementation milestone may claim Spec 202 production readiness unless the
corresponding Spec 203 contract and the current Web Video Editor integration
gate also pass.

---

# 1. Executive Summary

สเปกนี้รวมความสามารถจากระบบ Transcript-based Semantic Video Editing และ AI Rough Cut / AI Editor ให้เป็นระบบเดียว เพื่อพัฒนาในรอบเดียวโดยไม่แยกเป็นระบบย่อยที่ซ้ำซ้อน

ระบบต้องรองรับตั้งแต่:

- ตรวจสอบไฟล์ด้วย FFprobe
- Extract audio
- VAD
- ASR / Transcription
- Word-level timestamps
- Speaker detection / diarization
- Speech cleanup
- ตรวจพูดผิด / self-correction
- ตัดคำซ้ำ / false start / filler / silence
- Semantic topic segmentation
- Semantic deduplication
- Context dependency graph
- Target-duration optimization
- Best Take Selection
- Visual-aware editing
- Audio-aware editing
- Narrative / Story structure analysis
- AI Rough Cut Planning
- Pacing Engine
- B-roll planning
- Jump-cut concealment
- Punch-in / crop / reframe
- Caption / Graphic planning
- Music / SFX cue planning
- AI Edit Commands
- EDL generation
- Timeline composition
- Human review
- Preview
- QC
- Final render

หลักสำคัญ:

> ผู้ใช้ต้องไม่ถูกบังคับให้ทำตาม Wizard เป็น Step 1 → 2 → 3 เสมอไป

UI ต้องออกแบบเป็น **Flexible Modular Workspace**:

- เข้าใช้งานจากจุดใดก็ได้
- เปิด/ปิด module ได้
- ใช้แค่ Transcript Cleanup ก็ได้
- ใช้แค่ Semantic Condense ก็ได้
- ใช้แค่ B-roll Planner ก็ได้
- ใช้แค่ Auto Caption ก็ได้
- ใช้ AI Rough Cut ครบ workflow ก็ได้
- ผู้ใช้แก้ Timeline เองได้ทุกเวลา
- AI ต้องเคารพ manual edit และ locked region
- สามารถย้อนกลับไปใช้ AI ใหม่เฉพาะบางช่วงโดยไม่ reset ทั้ง project

---

# 2. Product Positioning

ระบบนี้ไม่ใช่แค่ "AI Auto Cut"

ระบบต้องพัฒนาเป็น:

```text
Media Intelligence
        ↓
Content Understanding
        ↓
AI Edit Planning
        ↓
Rough Cut
        ↓
Timeline Composition
        ↓
Enhancement
        ↓
QC
        ↓
Human Review
        ↓
Final Render
```

เป้าหมายคือ:

> ให้ AI สร้าง first cut ที่มีคุณภาพพอให้ผู้ใช้เปิดมาแล้วแก้ต่อได้ทันที

และในหลายกรณี:

> ผู้ใช้สามารถใช้ AI เฉพาะบางเครื่องมือ โดยไม่ต้องให้ AI ควบคุมการตัดต่อทั้งหมด

---

# 3. UX Design Philosophy

## 3.1 Non-Linear Workflow

ระบบห้ามออกแบบให้ผู้ใช้ต้อง:

```text
Upload
→ Analyze
→ Transcript
→ Cleanup
→ Rough Cut
→ Caption
→ Audio
→ Render
```

แบบบังคับ

ต้องรองรับ:

```text
Upload → Timeline
Upload → Transcript
Upload → AI Command
Upload → Rough Cut
Existing Project → B-roll
Existing Project → Caption
Existing Project → Cleanup
Existing Project → Semantic Condense
Existing Project → QC
```

## 3.2 Tool-Oriented Editing

ทุก AI function ต้องมองเป็น "Tool" หรือ "Module"

ตัวอย่าง:

```text
Speech Cleanup
Semantic Condense
Best Take
Hook Builder
B-roll
Caption
Graphics
Music
SFX
Reframe
QC
```

ผู้ใช้เปิดใช้เฉพาะที่ต้องการ

## 3.3 AI Must Be Optional

ทุก module ต้องมีสถานะ:

```text
Off
Suggest Only
Apply to Draft
Auto Apply
```

ตัวอย่าง:

```text
Speech Cleanup = Auto Apply
B-roll = Suggest Only
Caption = Apply to Draft
Music = Off
```

## 3.4 Human Override First

ถ้า user แก้ manual:

- AI ห้าม overwrite โดย default
- mark `user_override = true`
- ถ้า AI ต้องแก้ ต้องขอ scope ใหม่จาก user
- locked item ห้าม AI แก้

---

# 4. Primary User Modes

UI ไม่ควรเรียกว่า Step

ควรเป็น Entry Mode หรือ Workspace Preset

## 4.1 Quick Cleanup

สำหรับ:

- พูดผิด
- พูดซ้ำ
- filler
- silence
- false start

## 4.2 Rough Cut

สำหรับ:

- best take
- remove bad parts
- reorder
- pacing
- basic visual continuity

## 4.3 Shorten Video

สำหรับ:

```text
30 min → 10 min
60 min → 15 min
```

## 4.4 Social Cut

สำหรับ:

- TikTok
- Reel
- Shorts
- highlight

## 4.5 Tutorial Edit

รักษา:

- step order
- screen context
- commands
- UI references

## 4.6 Interview / Podcast

รักษา:

- speaker attribution
- Q&A dependency
- reaction
- active speaker

## 4.7 Manual Editor + AI Tools

ผู้ใช้เปิด Timeline ปกติ แล้วเรียก AI เฉพาะ tool

---

# 5. Flexible Workspace UI

## 5.1 Main Layout

แนะนำ Desktop/Web Layout:

```text
┌──────────────────────────────────────────────────────────────────┐
│ Project Header / Save / Undo / Version / Export                 │
├───────────────┬─────────────────────────────────┬────────────────┤
│ Left Tools    │ Preview / Program Monitor       │ Inspector      │
│               │                                 │                │
│ Media         │                                 │ AI Decision    │
│ Transcript    │                                 │ Properties     │
│ AI Tools      │                                 │ Context        │
│ Captions      │                                 │                │
│ B-roll        │                                 │                │
│ Audio         │                                 │                │
│ Graphics      │                                 │                │
├───────────────┴─────────────────────────────────┴────────────────┤
│ Transcript / Timeline / Waveform / Storyboard / Chapters       │
└──────────────────────────────────────────────────────────────────┘
```

ทุก panel:

- resize ได้
- collapse ได้
- detach ได้ถ้า architecture รองรับ
- remember user layout
- hide ได้
- ไม่มี panel ไหน mandatory

---

# 6. Top-Level Navigation

ภายใน Video Edit:

```text
Video Edit
├── Projects
├── Editor
├── AI Tools
├── Transcript
├── Assets
├── QC
└── Export
```

ไม่ควรแยก AI Rough Cut เป็น app ใหม่

ควรเป็น capability ของ Video Editor เดิม

---

# 7. AI Tools Panel

ตัวอย่าง UI:

```text
AI Tools

Search tools...

Speech
[ ] Clean Speech
[ ] Remove Fillers
[ ] Remove Silence
[ ] Detect Corrections
[ ] Remove Repetition

Structure
[ ] Semantic Condense
[ ] Topic Segmentation
[ ] Reorder Content
[ ] Hook Builder
[ ] Chapter Builder

Visual
[ ] Best Take
[ ] B-roll Planner
[ ] Auto Punch-in
[ ] Auto Reframe
[ ] Jump-cut Fix

Text
[ ] Captions
[ ] Keywords
[ ] Lower Third
[ ] Callouts

Audio
[ ] Music Cue
[ ] SFX
[ ] Ducking
[ ] Loudness

Quality
[ ] Visual QC
[ ] Audio QC
[ ] Semantic QC
```

ทุก tool ต้อง run independent ได้

---

# 8. AI Command Bar

ต้องมี command interface:

```text
Ask AI Editor...
```

รองรับ:

```text
"ตัดช่วงพูดผิดออก"
"ทำวิดีโอให้สั้นลงเหลือประมาณ 8 นาที"
"เก็บเรื่อง Cloudflare ไว้ทั้งหมด"
"เอา filler ออก แต่เก็บจังหวะพูดธรรมชาติ"
"หา 5 ช่วงทำ Shorts"
"ทำ intro ให้กระชับขึ้น"
"ใส่ B-roll เฉพาะตอนพูดถึงสินค้า"
"อย่าแก้ช่วง 05:10-06:00"
"ทำ punch-in เฉพาะช่วงที่มี jump cut"
```

AI ต้องแปลงเป็น:

```text
Intent
→ Scope
→ Tools
→ Proposed Operations
→ Preview
```

ไม่ execute destructive operation โดยไม่มี draft/undo

---

# 9. Scope Selector

ทุก AI command ต้องกำหนด scope ได้:

```text
Whole Project
Current Clip
Selected Clips
Selected Transcript
Selected Time Range
Current Chapter
Current Speaker
Current Track
```

ตัวอย่าง:

```text
Tool: Clean Speech
Scope: Selected Time Range
```

จุดนี้สำคัญเพื่อความยืดหยุ่น

---

# 10. AI Operation Mode

ทุก tool:

```text
Suggest
Draft
Apply
```

## Suggest

- ไม่แก้ timeline
- แสดง recommendation

## Draft

- สร้าง alternate EDL/timeline
- user compare ได้

## Apply

- apply เข้า active timeline
- undo ได้

---

# 11. Timeline Versioning

ระบบต้องมี:

```text
Original
Draft A
Draft B
Current
```

สามารถ Compare:

```text
Current vs AI Draft
```

และ:

```text
Accept All
Accept Selected
Reject Selected
```

---

# 12. Core Architecture

```text
                  SmartAIHub Web
                        │
        ┌───────────────┼─────────────────┐
        │               │                 │
        ▼               ▼                 ▼
     UI/UX          AI Orchestrator    Project State
        │               │                 │
        │               ▼                 │
        │          LLM Gateway             │
        │               │                 │
        └───────────────┼─────────────────┘
                        │
              Unified Job Control Plane
                        │
                        ▼
                 SmartAIHub Worker
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   FFprobe           FFmpeg        Media Intelligence
                                      │
                        ┌─────────────┼─────────────┐
                        ▼             ▼             ▼
                       VAD            ASR          Vision
```

---

# 13. Responsibility Boundary

## Web / Server

รับผิดชอบ:

- UI
- project orchestration
- LLM semantic logic
- transcript data
- EDL
- EditPlan
- narrative analysis
- user preferences
- versions
- audit
- job state
- credits
- API

## Worker

รับผิดชอบ:

- FFprobe
- FFmpeg
- audio extraction
- waveform
- VAD
- local ASR
- alignment
- scene detection
- visual quality
- face tracking
- active speaker
- render

---

# 14. Media Inspection

ใช้:

```text
MediaProbeProvider
└── FFprobeProvider
```

Output:

```json
{
  "duration_ms": 1823450,
  "width": 1920,
  "height": 1080,
  "fps": 29.97,
  "video_codec": "h264",
  "audio_codec": "aac",
  "audio_channels": 2,
  "sample_rate": 48000,
  "streams": [],
  "chapters": []
}
```

---

# 15. Transcription Providers

```text
TranscriptionProvider
├── FasterWhisperProvider
├── WhisperCppProvider
├── WhisperXProvider
├── ParakeetProvider
├── OpenAIProvider
└── OpenAICompatibleProvider
```

Normalized schema:

```json
{
  "language": "th",
  "segments": [
    {
      "segment_id": "seg_001",
      "speaker_id": "spk_1",
      "start_ms": 1000,
      "end_ms": 5000,
      "text": "ข้อความ",
      "words": []
    }
  ]
}
```

### 44.1 Canonical time and operation mapping

The JSON above remains the readable product-level EDL example. New persisted EDL
versions MUST carry the Spec 203 canonical time object on every time-bearing
operation:

```json
{
  "domain": "SOURCE_TIME|TIMELINE_TIME|OUTPUT_TIME",
  "timebase": {"num": 1, "den": 90000},
  "start_tick": 0,
  "end_tick": 90000,
  "display_ms": {"start": 0, "end": 1000}
}
```

`source_start_ms` and `source_end_ms` are derived compatibility fields for the
legacy EDL shape, not the identity of a new operation. Every AI-generated
operation MUST also preserve `evidence_refs`, `source_asset_fingerprint`,
`plan_id`, `confidence` (system-calibrated), and the target `project_revision` /
`timeline_revision`.

Mapping rules:

| Spec 202 EDL concept | Spec 203 canonical concept |
|---|---|
| `remove`, `trim`, `keep` | `REMOVE_SEGMENT`, `SHORTEN_PAUSE`, or `HOLD` intent plus timeline operation |
| `punch_in`, `reframe` | camera/reframe intent plus validated `CAMERA` operation |
| `move`, `reorder`, `merge`, `split` | stable source anchors plus timeline operation with ripple/gap semantics |
| `broll_overlay`, `caption`, `graphic`, `music`, `sfx` | typed track operation/change set; unsupported items MUST be blocked or visibly preserve-only |
| `lock`, `user_override` | immutable user modification/lock that AI cannot overwrite |

The mapping is versioned with `edl_schema_version` and `executable_plan_schema_version`.

---

# 16. Speech Cleanup Engine

Detect:

```text
filler
silence
false_start
self_correction
exact_repetition
semantic_repetition
repeated_take
technical_interruption
unfinished_sentence
```

---

# 17. Self-Correction Detection

ตัวอย่าง:

```text
ราคา 499 บาท...
ขอแก้ครับ
599 บาท
```

Output:

```json
{
  "type": "self_correction",
  "incorrect_span": {
    "start_ms": 10000,
    "end_ms": 12200
  },
  "replacement_span": {
    "start_ms": 12500,
    "end_ms": 14100
  },
  "confidence": 0.97,
  "review_required": true
}
```

---

# 18. Cut Boundary Resolver

ห้าม cut ตาม ASR timestamp ตรง ๆ

ใช้:

```text
ASR
+ VAD
+ Waveform
+ Breath
+ Silence
+ Frame boundary
```

---

# 19. Semantic Condense Engine

Pipeline:

```text
Cleanup
→ Topic Segmentation
→ Semantic Clustering
→ Importance Scoring
→ Dependency Graph
→ Duration Budget
→ Candidate Selection
→ EDL
```

---

# 20. Semantic Segment Score

```json
{
  "importance": 0.94,
  "novelty": 0.88,
  "clarity": 0.89,
  "redundancy": 0.12,
  "context_dependency": 0.73,
  "delivery_quality": 0.84,
  "audio_quality": 0.91,
  "visual_quality": 0.82,
  "continuity": 0.86
}
```

---

# 21. Dependency Graph

Types:

```text
context_required
definition_required
enumeration_parent
pronoun_reference
cause_effect
question_answer
contrast
example_of
conclusion_of
quote_context
```

---

# 22. AI Rough Cut Planner

เพิ่ม artifact:

```text
EditPlan
```

ตัวอย่าง:

```json
{
  "goal": "concise tutorial",
  "target_duration_ms": 480000,
  "structure": [
    "hook",
    "problem",
    "solution",
    "demo",
    "summary"
  ],
  "pacing": "medium_fast",
  "speech_cleanup": "balanced",
  "broll_policy": "suggest",
  "caption_policy": "draft",
  "music_policy": "off"
}
```

EditPlan ไม่จำเป็นต้องมีทุก workflow

ถ้า user ใช้แค่ Clean Speech:

ไม่ต้องสร้าง full EditPlan

---

# 23. Best Take Selection

ระบบต้องหา repeated take / alternate take

Score:

```text
Semantic correctness
Delivery quality
Audio quality
Visual quality
Eye contact
Continuity
Length
Confidence
```

Output:

```json
{
  "take_group_id": "tg_12",
  "candidates": [
    {
      "segment_id": "seg_45",
      "score": 0.91
    }
  ],
  "selected": "seg_45"
}
```

---

# 24. Visual Intelligence

Analyze:

- blur
- face visibility
- eye contact
- framing
- camera shake
- subject motion
- black frame
- frozen frame
- duplicate shot
- obstruction
- composition
- scene change

---

# 25. Audio Intelligence

Analyze:

- clipping
- loudness
- SNR
- background noise
- echo
- dropout
- overlap speech
- breath
- silence

---

# 26. Pacing Engine

Pacing profile:

```text
slow
natural
balanced
fast
social_fast
custom
```

ระบบดู:

- average shot duration
- speech density
- pause density
- cut density
- visual change frequency

---

# 27. Narrative Engine

ต้องเข้าใจ:

```text
Hook
Setup
Problem
Explanation
Example
Contrast
Evidence
Payoff
Conclusion
CTA
```

ใช้สำหรับ:

- reorder
- semantic condense
- hook generation
- highlight

---

# 28. Content Reordering

EDL ต้องรองรับ:

```text
move
reorder
group
merge
split
```

ไม่ใช่แค่ keep/remove

แต่ default mode ต้อง conservative

---

# 29. Hook Builder

สามารถ:

- หา strongest statement
- หา emotional peak
- หา unexpected insight
- หา short quote

และเสนอ:

```text
Use as opening hook
```

ต้องเป็น Suggest โดย default

---

# 30. Highlight / Shorts Generator

Output:

```text
Highlight Candidates
```

แต่ละ candidate:

```json
{
  "start_ms": 123000,
  "end_ms": 168000,
  "hook_score": 0.91,
  "context_integrity": 0.87,
  "platform_fit": {
    "reel": 0.95,
    "shorts": 0.93
  }
}
```

---

# 31. B-roll Planner

Source priority:

```text
1. User project assets
2. Nearby source footage
3. User Library
4. Generated media
```

AI ต้องแยก:

```text
Suggested
Available
Missing
Generate
```

---

# 32. B-roll UI

แสดง:

```text
Transcript:
"Cloudflare R2 ใช้เก็บไฟล์..."

Suggested B-roll:
[Project Screenshot]
[Library Asset]
[Generate Illustration]
[Ignore]
```

ลากลง timeline ได้

---

# 33. Jump-cut Concealment

Strategies:

```text
punch_in
punch_out
alternate_crop
broll_overlay
reaction
cutaway
crossfade
j_cut
l_cut
```

---

# 34. Auto Punch-In

ตั้งค่า:

```text
Off
Suggest
Conservative
Balanced
Dynamic
```

ห้ามเปลี่ยน crop ทุก cut แบบตายตัว

---

# 35. Auto Reframe

รองรับ:

```text
16:9 → 9:16
16:9 → 1:1
9:16 → 16:9
```

ใช้:

- face track
- active speaker
- subject track
- safe area
- caption area

---

# 36. Caption Module

รองรับ:

```text
Subtitle
Word Highlight
Keyword Highlight
Kinetic Caption
Speaker-aware Caption
```

Caption module ต้อง independent จาก Rough Cut

---

# 37. Graphics Planner

สามารถ suggest:

- title
- lower third
- keyword card
- numeric callout
- quote card
- price tag
- chapter title

---

# 38. Music Planner

ใช้ narrative section + emotion

Output:

```json
{
  "section": "intro",
  "mood": "energetic",
  "intensity": 0.7,
  "start_ms": 0,
  "end_ms": 22000
}
```

---

# 39. SFX Planner

Intensity:

```text
Off
Minimal
Balanced
Dynamic
```

Default:

```text
Minimal
```

---

# 40. Audio Mix Automation

รองรับ:

- loudness normalization
- dialogue gain
- music ducking
- noise reduction
- crossfade
- fade in/out

---

# 41. Multi-Camera Editing

Future-ready schema:

```text
camera_id
speaker_visibility
active_speaker
reaction_score
shot_quality
```

เลือก:

```text
wide
close-up
speaker
reaction
```

---

# 42. Screen Recording Intelligence

สำหรับ tutorial:

ตรวจ:

- mouse
- UI region
- browser
- code editor
- terminal
- popup
- menu
- dialog

รองรับ:

```text
zoom region
highlight region
facecam
picture-in-picture
```

---

# 43. Timeline Data Model

ต้องรองรับ track:

```text
Video
B-roll
Overlay
Caption
Graphic
Music
SFX
Voice
```

---

# 44. EDL Schema

```json
{
  "edl_id": "edl_xxx",
  "version": 4,
  "operations": [
    {
      "operation_id": "op_001",
      "type": "remove",
      "source_start_ms": 10000,
      "source_end_ms": 12000,
      "reason": "self_correction",
      "confidence": 0.96,
      "locked": false,
      "user_override": false
    }
  ]
}
```

---

# 45. EDL Operation Types

```text
keep
remove
trim
split
merge
move
reorder
replace_visual
broll_overlay
audio_only_keep
video_only_keep
transition
punch_in
reframe
caption
graphic
music
sfx
lock
```

---

# 46. Non-Destructive Editing

Original asset ห้ามแก้

ต้องเก็บ:

```text
Source
Transcript
Analysis
EditPlan
EDL
Timeline
Render
QC
```

เป็น version

---

# 47. Transcript Editor UI

ตัวอย่าง:

```text
☑ วันนี้เราจะมาพูดถึง...
☒ เอ่อ...
☒ GPT-4
☒ ไม่ใช่ GPT-4
☑ วันนี้เราจะมาพูดถึง GPT-5.6
```

action:

```text
Keep
Remove
Restore
Split
Merge
Lock
Play
```

---

# 48. Transcript ↔ Timeline Sync

Click transcript:

```text
seek timeline
select clip
highlight waveform
```

Click timeline:

```text
highlight transcript
```

---

# 49. Inspector Panel

เมื่อเลือก operation:

```text
AI Decision
Reason
Confidence
Source
Affected Range
Dependencies
Alternatives
```

ปุ่ม:

```text
Accept
Reject
Restore
Lock
Edit
```

---

# 50. AI Suggestions Inbox

ต้องมี panel:

```text
AI Suggestions
```

เช่น:

```text
3 speech corrections
2 repeated sections
4 jump cuts
5 B-roll opportunities
1 missing context
```

user เลือกดูเฉพาะ category ได้

---

# 51. Flexible Module Run

แต่ละ tool มีปุ่ม:

```text
Run
Run on Selection
Run on Project
Run with Settings
```

---

# 52. Module Settings Drawer

ไม่ควรเปิด dialog ซ้อนหลายชั้น

ใช้ side drawer:

```text
Tool Settings
Preset
Scope
Mode
Threshold
Advanced
```

---

# 53. Quick Presets

Preset ไม่ควร lock user

เช่น:

```text
Talking Head
Tutorial
Podcast
Interview
Product Review
Short-form
Manual
```

เลือก preset แล้วทุก setting ยังแก้ได้

---

# 54. Workspace Presets

ผู้ใช้ save workspace layout ได้:

```text
Transcript Focus
Timeline Focus
Podcast
Social
Manual Editor
```

---

# 55. Undo / Redo

ต้องรองรับ:

```text
Undo AI action
Undo manual action
Redo
```

batch AI operation ต้อง undo เป็น batch ได้

---

# 56. Locking

Lock ได้:

```text
Clip
Range
Track
Caption
Graphic
Audio
Chapter
```

---

# 57. Protected Ranges

UI:

```text
Protected Range
05:10 - 06:00
Reason: Sponsor
```

AI ห้ามแก้

---

# 58. Manual-First Workflow

ผู้ใช้สามารถ:

```text
ตัดเองก่อน
→ เลือกเฉพาะช่วง
→ Run Clean Speech
→ Run Caption
→ Export
```

ไม่ต้อง Analyze ทั้ง project

---

# 59. AI-First Workflow

ผู้ใช้สามารถ:

```text
Upload
→ "ทำ rough cut ให้เหลือ 10 นาที"
→ AI Draft
→ Review
→ Export
```

---

# 60. Hybrid Workflow

ตัวอย่าง:

```text
AI Cleanup
→ Manual Timeline
→ AI B-roll
→ Manual Fix
→ AI QC
→ Export
```

ต้องเป็น use case หลัก

---

# 61. Job Types

ใช้ Unified Job Control Plane เดิม

```text
media.probe
media.audio_extract
media.waveform
media.vad
media.transcribe
media.align_words
media.scene_detect
media.face_detect
media.active_speaker
media.visual_quality
media.audio_quality
video.preview_render
video.final_render
subtitle.rebuild
```

Semantic:

```text
semantic.cleanup
semantic.topic
semantic.redundancy
semantic.dependency
semantic.narrative
semantic.best_take
semantic.pacing
semantic.broll
semantic.hook
semantic.duration
semantic.edl
semantic.qc
```

## 61.1 Job contract resolution

The names in Section 61 are logical analysis capabilities, not a permission to
create a second job namespace. Every queued unit MUST use the existing canonical
`worker_jobs` plus outbox control plane and declare executor class, capability,
asset locality, immutable revision/snapshot reference, idempotency, and terminal
artifact requirements.

The current-code compatibility mapping is:

| Logical capability | Current baseline | Readiness rule |
|---|---|---|
| probe/proxy/waveform/thumbnail/audio extract/export/render | `editor_media_*` / `editor_video_render` | available only where the Worker advertises the exact operation capability |
| silence detect / generic analysis | `editor_media_analysis` | available only for the implemented native subset; output is not an EditorialEvidenceBundle until its schema is committed |
| VAD / word alignment / scene detection / face detection / active speaker | legacy logical names `media.vad` / `media.align_words` / `media.scene_detect` / `media.face_detect` / `media.active_speaker` | map to versioned `media.silence_detect` / `media.align` / analysis adapters; do not create duplicate job types |
| transcribe / align / reframe / speaker scan / audio mix | envelope accepts the operation, but current Worker adapter is not native | remain capability-blocked; never present as completed merely because a job was queued |
| semantic cleanup/topic/best take/pacing/EDL/QC | Spec 203 Server/Skill/Director target | require typed Evidence → Intent → Compile → Validate contracts before enabling |
| composition scan | Feature 191/186 `video.composition_scan` Node executor path | Web MUST use one dedicated control-plane adapter; it is not Windows Worker parity until the Worker executor and claim capability exist |

Composition-scan evidence has a strict promotion boundary. A result with
`status=degraded` is diagnostic/compatibility evidence only; it MUST NOT be
promoted into an approved `EditorialEvidenceBundle`, executable camera or
composition plan, or production render input. Promotion requires a
full-detector/`status=available` result plus the source-fingerprint and
server-authoritative revision checks. A product-approved human override, if
ever enabled, must be an explicit server-side action recording actor, reason,
warning, and provenance; it is not the default path. The current
`promoteCompositionScan` route now fails closed through
`isCompositionEvidencePromotable`: completion, `status=available`,
fingerprints, and `evidenceRef` are all required before promotion. This closes
the local degraded-promotion migration gap; authenticated browser and target
runtime evidence remain release gates.

The active Web editor submit path now persists the project before dispatch and
the server-owned `editorMediaJobs.submit` transaction creates the job, outbox
publication, project-job link, and immutable revision/snapshot pin together.
The legacy `submitCompositionScan` procedure remains a compatibility adapter;
it is not the proof surface for the active Web editor or for Windows Worker
parity.

The current exact operation-capability token prevents an FFmpeg-only Worker from
claiming unsupported operations, but a submit that merely leaves a queued row is
not a capability decision. Admission must either find an eligible executor or
return a visible capability-blocked state with reason and retry/routing guidance
when no executor advertises the required capability. If an eligible capability
exists but every matching agent is temporarily offline or busy, `queued` may
project as `waiting_agent` with an observable timeout/retry policy; it must not
be presented as successful execution readiness.

## 61.2 Canonical status projection

The server retains one canonical lifecycle. If the storage enum remains
`queued|claimed|preparing|running|uploading|publishing|indexing|completed|failed|canceled|expired`,
the Web label projection MUST be explicit:

| Web product label | Canonical storage status/stage |
|---|---|
| Waiting for execution agent | `queued` / eligible-agent wait |
| Assigned | `claimed` |
| Resolving assets | `preparing` / `stage_inputs` |
| Analyzing or rendering | `running` with typed stage |
| Uploading to Library | `uploading` or `publishing` |
| QC | `indexing` or explicit QC stage in event payload |
| Blocked | terminal `failed` with `capability`, `asset`, `stale_revision`, or `authorization` category; never an indefinite hidden queue |
| Completed | `completed` only after required artifact commit |

The Spec 203 names (`waiting_agent`, `validating`, `rendering`, `qc`, and
`fallback`) are API/UI projection labels unless and until the canonical storage
enum is deliberately versioned. Both specs MUST use the same mapping.

---

# 62. Job Reliability

ต้องรองรับ:

```text
lease
heartbeat
retry
idempotency
outbox
watchdog
progress
cancel
resume
```

---

# 63. Progress UI

ตัวอย่าง:

```text
Analyzing speech 63%
Detecting scenes 42%
Generating rough cut
```

แสดงจริงตาม stage

---

# 64. Partial Availability

ไม่ต้องรอทุก analysis เสร็จ

ตัวอย่าง:

- Transcript เสร็จ → ใช้ Transcript ได้ทันที
- Visual QC ยังรันอยู่ → Rough Cut provisional
- B-roll planner รันทีหลังได้

---

# 65. Lazy Analysis

เพื่อประหยัด compute

ถ้า user ใช้แค่ Clean Speech:

ไม่ต้องรัน:

```text
face detection
visual quality
broll
music
```

---

# 66. Analysis Dependency Graph

ตัวอย่าง:

```text
FFprobe
 ├─ Transcript
 │   ├─ Cleanup
 │   ├─ Semantic
 │   └─ Caption
 ├─ Scene Detect
 ├─ Visual Quality
 └─ Render
```

---

# 67. Cost-Aware Execution

ก่อน run AI:

UI แสดงประมาณ:

```text
Estimated AI Credits
Estimated Worker Compute
Estimated Output Duration
```

---

# 68. Credit Rules

คิดแยก:

```text
ASR
LLM
Cloud Vision
Generated B-roll
Render
```

---

# 69. Confidence Policy

```text
>= 0.92 Auto candidate
0.75–0.919 Review suggested
< 0.75 Manual review
```

---

# 70. Sensitive Content Modes

```text
Normal
Business
Education
News
Legal-sensitive
```

News / Legal-sensitive:

- AI changes = Draft only
- ต้อง review ก่อน final render

---

# 71. Audit Trail

เก็บ:

```text
operation
reason
AI model
confidence
user
timestamp
version
```

---

# 72. Subtitle Rebuild

หลัง timeline เปลี่ยน:

```text
Transcript
+ EDL
→ New Timestamp
→ SRT/VTT
```

---

# 73. Preview Render

ใช้:

```text
720p proxy
fast codec settings
```

---

# 74. QC Pipeline

ตรวจ:

```text
FFprobe
A/V sync
Black frame
Frozen frame
Audio continuity
Subtitle sync
Duration
Missing audio
EDL boundary
```

---

# 75. Semantic QC

ตรวจ:

```text
Topic Coverage
Context Integrity
Narrative Continuity
Missing Dependency
Orphan Reference
Step Order
Duration
```

---

# 76. AI Editor Self-Review

AI Editor Agent สามารถ:

```text
Analyze
→ Draft
→ QC
→ Fix
→ Re-QC
```

จำกัด loop:

```text
max_revision_loops
```

---

# 77. AI Editor Agent

ระดับสูงสุด:

User:

```text
"ทำวิดีโอนี้เป็น tutorial 8 นาที ดูกระชับ
เก็บ demo ทั้งหมด
เอาคำพูดซ้ำออก
ใส่ caption
แต่ไม่ต้องใส่เพลง"
```

ระบบ:

```text
Parse intent
→ Create EditPlan
→ Run required analyses only
→ Draft EDL
→ Timeline
→ Caption
→ QC
→ Present Draft
```

---

# 78. API

ตัวอย่าง:

```text
POST /v1/video-edit/projects
POST /v1/video-edit/projects/{id}/tools/{tool_id}/run
POST /v1/video-edit/projects/{id}/ai-command
GET  /v1/video-edit/projects/{id}/suggestions
GET  /v1/video-edit/projects/{id}/transcript
GET  /v1/video-edit/projects/{id}/edl
GET  /v1/video-edit/projects/{id}/timeline

POST /v1/video-edit/projects/{id}/drafts
POST /v1/video-edit/projects/{id}/drafts/{id}/apply

POST /v1/video-edit/projects/{id}/preview
POST /v1/video-edit/projects/{id}/render
```

These are logical API names. The current Web application exposes tRPC procedures;
an implementation MUST either provide the REST surface or update this section to
the exact tRPC contract before implementation starts. Examples must not be
treated as an unimplemented second API layer.

---

# 79. Tool Contract

ตัวอย่าง:

```json
{
  "tool": "speech.clean",
  "scope": {
    "type": "time_range",
    "start_ms": 10000,
    "end_ms": 90000
  },
  "mode": "draft",
  "settings": {
    "preset": "balanced"
  }
}
```

---

# 80. AI Command Contract

Output ต้อง structured:

```json
{
  "intent": "shorten_video",
  "scope": "project",
  "requested_target_duration_ms": 480000,
  "required_tools": [
    "speech.clean",
    "semantic.topic",
    "semantic.condense"
  ],
  "optional_tools": [
    "visual.best_take"
  ],
  "plan": []
}
```

---

# 81. Database Logical Entities

```text
video_edit_projects
video_edit_assets
video_edit_transcripts
video_edit_segments
video_edit_analysis
video_edit_editplans
video_edit_edls
video_edit_edl_operations
video_edit_timelines
video_edit_timeline_items
video_edit_ai_suggestions
video_edit_versions
video_edit_qc
```

ถ้ามี schema เดิมเทียบเท่าให้ extend

The current equivalent foundation is `video_editor_projects` plus the Feature 184
immutable revision, project-asset, and project-job tables. Do not create the
`video_edit_*` list as duplicate tables. The migration must add server-authoritative
revision reads/writes, tenant-scoped authorization, and links from every heavy job
to the exact revision and execution snapshot.

Do not silently substitute the separate `video_projects` /
`video_project_revisions` Video Studio/Intelligence domain for the active Web
Editor store: that domain has catalog/studio fields and its own numeric revision
contract. The target must explicitly choose a migration or versioned adapter from
`video_editor_projects`; a third project table or cross-domain write path is not
allowed.

Asset identity is always a logical managed reference plus source fingerprint.
Browser or desktop local paths are materialized bindings only and MUST NOT be
stored as cross-device project identity. A source is `LOCAL_ONLY` until it is
uploaded/synced to an authorized Library/object-store replica; the scheduler
MUST reject a cloud dispatch that cannot resolve the required replica.

---

# 82. UI State Model

ต้อง persist:

```text
active workspace
panel layout
selected tool
selected scope
timeline zoom
playhead
user locks
draft
```

---

# 83. Mobile / Tablet Consideration

Tablet:

ใช้ layout:

```text
Preview
Tabs:
Timeline | Transcript | AI | Assets | Inspector
```

ไม่ใช้ 3-column แบบ desktop ตายตัว

---

# 84. Keyboard Shortcuts

ขั้นต่ำ:

```text
Space = Play/Pause
J/K/L = Shuttle
I/O = In/Out
Delete = Remove
L = Lock
Ctrl/Cmd+Z = Undo
```

ต้องตรวจ conflict ตาม platform

---

# 85. Accessibility

ต้องมี:

- keyboard navigation
- ARIA labels
- icon + text
- contrast
- no color-only state

---

# 86. Performance

UI ต้องใช้:

- virtualized transcript
- virtualized timeline items
- lazy waveform chunks
- proxy video

---

# 87. Caching

Cache:

```text
FFprobe
Transcript
Alignment
Scene
Visual QC
Audio QC
Semantic analysis
```

key:

```text
asset hash
provider
model
settings
version
```

---

# 88. Long-Form Strategy

สำหรับ 1–3 ชั่วโมง:

```text
chunk
→ local summarize
→ global merge
→ dependency
→ EDL
```

---

# 89. Entity Preservation

Extract:

```text
person
product
date
price
number
software
URL
command
organization
```

---

# 90. Tutorial Preservation

ต้องรักษา:

```text
setup
prerequisite
step order
command
result
```

---

# 91. Interview Preservation

ต้องรักษา:

```text
question
answer
speaker
reaction
```

---

# 92. Product Review Preservation

รักษา:

```text
product name
price
spec
pros
cons
recommendation
```

---

# 93. Social Video Strategy

ปรับ:

```text
Hook density
Cut density
Caption intensity
Reframe
Highlight
```

---

# 94. Acceptance Criteria — Flexible UX

ถือว่าผ่านเมื่อ:

- user เปิด project แล้วเข้า Timeline ได้ทันที
- user ไม่ต้อง run full analysis
- user run tool เดียวได้
- user run tool เฉพาะ selection ได้
- user เปิด/ปิด module ได้
- user save layout ได้
- user manual edit ก่อน/หลัง AI ได้
- AI ไม่ overwrite lock
- AI draft compare ได้
- user apply selected changes ได้

---

# 95. Acceptance Criteria — Speech

- self-correction
- filler
- silence
- repeated take
- false start
- exact repetition
- transcript review

---

# 96. Acceptance Criteria — Rough Cut

- best take
- visual/audio score
- pacing
- semantic condense
- EDL
- reorder
- draft timeline

---

# 97. Acceptance Criteria — AI Editor

- AI Command
- scope control
- EditPlan
- Suggest/Draft/Apply
- B-roll suggestion
- caption suggestion
- jump-cut fix
- QC
- human review

---

# 98. Development Phases

แม้พัฒนาใน feature/spec เดียว แต่ implement เป็น internal milestones

## Milestone A — Foundation

- FFprobe
- audio extract
- VAD
- ASR
- transcript
- EDL
- workspace shell

## Milestone B — Speech Editing

- cleanup
- self-correction
- filler
- silence
- repeated take

## Milestone C — Semantic Editing

- topic
- dependency
- condense
- duration

## Milestone D — Rough Cut

- best take
- visual/audio quality
- pacing
- narrative
- reorder

## Milestone E — AI Editor

- AI Command
- EditPlan
- B-roll
- caption
- jump-cut fix
- punch-in
- reframe

## Milestone F — QC / Agent

- QC
- self-review
- iterative refinement

ทุก milestone ใช้ data model เดียวกัน

---

# 99. Implementation Priority

ลำดับแนะนำ:

```text
1. Flexible Workspace
2. FFprobe
3. Transcript
4. EDL
5. Speech Cleanup
6. Draft/Apply Model
7. Semantic Condense
8. Dependency
9. Best Take
10. Pacing
11. AI Command
12. EditPlan
13. B-roll
14. Jump-cut Fix
15. Caption
16. Audio
17. QC
18. Agent Loop
```

---

# 100. Definition of Done

Feature ถือว่าพร้อม production เมื่อ:

- ไม่บังคับ wizard
- ทุก AI tool run independently ได้
- tool ใช้ scope ได้
- user manual edit ได้ตลอด
- AI draft แยกจาก current timeline ได้
- user compare/apply/reject ได้
- lock/protected range ได้
- transcript/timeline sync
- clean speech ใช้งานได้จริง
- semantic condense ใช้งานได้จริง
- rough cut ใช้งานได้จริง
- best take ใช้งานได้จริง
- AI command ใช้งานได้จริง
- B-roll suggestion ใช้งานได้
- caption ใช้งานได้
- jump-cut concealment ใช้งานได้
- preview/render/QC ใช้งานได้
- jobs recover ได้
- source file ไม่ถูกแก้
- version/audit ครบ
- architecture ไม่สร้าง editor ระบบใหม่ซ้ำของเดิม

## 100.1 Measurable release gates

The feature is not production-ready from prose coverage alone. The following
gates are mandatory and must be recorded against the actual Web/Server/Worker
revision:

| Gate | Minimum proof |
|---|---|
| Revision safety | concurrent Web and Worker writes produce one explicit conflict; no silent overwrite; autosave uses a server precondition |
| Snapshot safety | a render submitted from revision N remains attached to N after revision N+1 is saved |
| Determinism | same snapshot, evidence, policy, skill, compiler, and renderer versions produce the same canonical plan hash |
| AI safety | locked/manual operations remain unchanged; every applied AI operation has scope, motive, evidence reference, and reversible change set |
| Capability safety | unsupported ASR/vision/AI operations are blocked or routed to an eligible executor; they cannot remain falsely “completed” |
| Media safety | local-only assets cannot be dispatched to cloud; tenant/user authorization is checked at project, revision, asset, job, and artifact boundaries |
| Render/QC | preview/final use the same canonical timeline semantics; required artifact is committed to Library before job completion |
| Web Editor integration | `/video-editor` shows revision/sync/conflict/render-source state and can use the same project revision from Web and Worker |

The first implementation milestone may be a smaller vertical slice, but it must
explicitly list which 202 tools and 203 intents are enabled, which are
capability-blocked, and which are future work. A green queue submission alone is
not acceptance evidence.

---

# 101. Final UX Principle

หน้าจอควรให้ความรู้สึกเหมือน:

> Video Editor ที่มี AI tools อยู่รอบ ๆ Timeline

ไม่ใช่:

> AI Wizard ที่บังคับ user ทำตามขั้นตอน

หลัก UX:

```text
Timeline is always available
Transcript is optional
AI is optional
Every tool is optional
Every operation is reversible
Every AI operation has scope
Every AI operation has preview/draft
Manual edit always wins
```

---

# 102. Recommended Final Navigation

```text
Video Editor
│
├── Media
├── Timeline
├── Transcript
├── AI Tools
│   ├── Speech
│   ├── Structure
│   ├── Visual
│   ├── Audio
│   ├── Text
│   └── QC
├── Assets
├── Versions
└── Export
```

พร้อม Global AI Command Bar:

```text
Ask AI Editor...
```

---

# 103. Final Architectural Principle

```text
Media Intelligence
        ↓
Optional AI Tools
        ↓
EditPlan (when needed)
        ↓
EDL
        ↓
Timeline
        ↓
Enhancement
        ↓
QC
        ↓
Human Review
        ↓
Render
```

แต่ user สามารถเข้าออกระบบได้ทุกจุด:

```text
Timeline ↔ Transcript ↔ AI Tools ↔ Assets ↔ QC
```

ไม่มี stage ใดบังคับนอกจาก dependency ทางเทคนิคจริง ๆ

---

# 104. 2026-09-18 Contract Reconciliation Record

This revision incorporates the 15-pass cross-spec/codebase audit recorded in
`orchestra/spec-audit-202-203-15-pass.md`. The audit changed this document to
make precedence, canonical mapping, compatibility status, job/state projection,
revision/snapshot gates, and current Web Video Editor limitations explicit.

This record is documentation evidence only. It does not claim that the current
Web Editor, Node executor, or Windows Worker already satisfies the production DoD.

---

## End of Specification

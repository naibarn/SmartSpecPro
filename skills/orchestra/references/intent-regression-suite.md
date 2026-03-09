# Intent Regression Suite

Use this suite to validate plain-text orchestra activation behavior.

## Purpose

This is the canonical regression set for trigger tuning.
When updating orchestra activation heuristics, compare the new behavior against these examples and avoid accidental drift.

Each case defines:
- the raw user message
- whether orchestra should activate
- the expected primary route or owner
- the reasoning

If a heuristic change intentionally flips one of these examples, document the rationale in `orchestra/decisions.md`.

## How To Use

1. Read the raw message.
2. Decide whether orchestra should own the request.
3. Compare with the expected result below.
4. If your answer differs, check whether:
   - the heuristic is wrong
   - the example needs updating
   - the request is a new class not covered yet

## Suite A — Strong Positive Triggers

| ID | User message | Expected | Route / Owner | Why |
|---|---|---|---|---|
| P01 | "ช่วยวางแผนแล้วทำต่อให้จบ" | Activate | `quick-plan-chain` or `deep-plan-chain` | explicit plan + execute delegation |
| P02 | "ทำ feature นี้ให้ครบทั้ง backend กับ frontend" | Activate | waves or planning chain | cross-domain end-to-end work |
| P03 | "วิเคราะห์ว่าต้องแก้อะไรบ้างแล้วลงมือทำเลย" | Activate | planning or waves | analyze + execute |
| P04 | "แตกงานนี้ให้หน่อยแล้วทำตามแผน" | Activate | `quick-plan-chain` | decomposition intent |
| P05 | "implement this end-to-end" | Activate | any non-trivial route | explicit conductor ownership |
| P06 | "plan and execute this for me" | Activate | `quick-plan-chain` or `deep-plan-chain` | explicit orchestration request |
| P07 | "continue the previous implementation" | Activate | resume path | resume semantics |
| P08 | "build a new module for this" | Activate | `deep-plan-chain` or `full-pipeline` | new module scope |
| P09 | "ช่วยจัดการงานนี้ให้ครบทั้งหมด" | Activate | any non-trivial route | ownership delegation |
| P10 | "what all needs to change for this, then do it" | Activate | planning chain or waves | system analysis + execution |

## Suite B — Borderline But Usually Promote

| ID | User message | Expected | Route / Owner | Why |
|---|---|---|---|---|
| B01 | "เพิ่ม option นี้ใน modal" | Usually activate after inspection | direct edit or `quick-plan-chain` | often wider than one file |
| B02 | "แก้ mobile UX ของ editor" | Usually activate after inspection | waves or `quick-plan-chain` | often spans multiple controls/panels |
| B03 | "ปรับ Media Studio ให้ฉลาดขึ้น" | Usually activate after inspection | `quick-plan-chain` or waves | vague, cross-surface risk |
| B04 | "เพิ่ม category ใหม่ให้ skills" | Usually activate after inspection | `deep-plan-chain` or waves | admin + runtime + schema coupling |
| B05 | "รองรับ workflow นี้ในระบบ" | Usually activate after inspection | planning chain | under-specified workflow work |
| B06 | "ช่วยออกแบบ flow นี้" | Activate if implementation is implied; otherwise no | planning owner or direct response | depends on execute intent |
| B07 | "fix the draft flow" | Usually activate after inspection | waves or planning chain | likely multi-step flow change |
| B08 | "ปรับให้ใช้งานบน tablet ดีขึ้น" | Usually activate after inspection | waves or `quick-plan-chain` | likely UI/state/layout spread |
| B09 | "make this setting work everywhere" | Usually activate after inspection | waves | cross-surface propagation |
| B10 | "clean up this feature" | Usually activate after inspection | `quick-plan-chain` | too vague for direct edit |

## Suite C — Clear Negatives

| ID | User message | Expected | Route / Owner | Why |
|---|---|---|---|---|
| N01 | "ตอนนี้กี่โมง" | Do not activate | direct answer | simple utility |
| N02 | "แปลประโยคนี้" | Do not activate | direct answer | translation only |
| N03 | "ช่วย rewrite ข้อความนี้ให้ดีขึ้น" | Do not activate | direct answer | editorial only |
| N04 | "git status เป็นอะไร" | Do not activate | direct command/info | one-off command |
| N05 | "อธิบาย file นี้ให้หน่อย" | Do not activate | direct explanation | explanation only |
| N06 | "สรุป log นี้ให้หน่อย" | Do not activate | direct analysis | no workflow ownership |
| N07 | "แก้ typo ใน label นี้หน่อย" | Usually do not activate | direct edit | obvious tiny fix |
| N08 | "ช่วยตั้งชื่อ function นี้" | Do not activate | direct answer | narrow suggestion |
| N09 | "what does this function do" | Do not activate | direct explanation | factual code explanation |
| N10 | "show me the weather" | Do not activate | direct answer | unrelated utility |

## Suite D — Explicit Other Skill / Narrow Owner Cases

| ID | User message | Expected | Route / Owner | Why |
|---|---|---|---|---|
| O01 | "ช่วยเขียน image prompt ให้หน่อย" | Do not activate by default | prompt skill | single specialized skill is enough |
| O02 | "translate this to Thai" | Do not activate | direct answer | translation only |
| O03 | "review this diff" | Usually do not activate | direct review mode | review only unless user also delegates fixes |
| O04 | "analyze whether we should build or buy this" | Do not activate by default | advisory skill | research/advice only |
| O05 | "create a new skill prompt for video generation" | Usually do not activate | skill/prompt skill | specialized single-owner task |
| O06 | "install this skill" | Do not activate | installer skill | explicit named skill owner |

## Suite E — Resume / Continuation Cases

| ID | User message | Expected | Route / Owner | Why |
|---|---|---|---|---|
| R01 | "ทำต่อจากงานเมื่อกี้" | Activate | continue active orchestra session | same-task continuation |
| R02 | "continue where we left off" | Activate | resume or continue | resume semantics |
| R03 | "pick this back up" | Activate | resume or continue | implicit continuation |
| R04 | "กลับมาทำ flow นี้ต่อ" | Activate | resume or continue | continuation language |
| R05 | "resume the previous work" | Activate | `/orchestra resume` path if needed | explicit resume |

## Suite F — Planning Depth Selection

| ID | User message | Expected | Route / Owner | Why |
|---|---|---|---|---|
| D01 | "เพิ่ม toggle นี้ใน modal แล้วให้ flow ทำงานต่อ" | Activate | `quick-plan-chain` or direct edit | small surface, maybe hidden flow coupling |
| D02 | "สร้างระบบ template ใหม่ทั้งฝั่ง admin กับ editor" | Activate | `deep-plan-chain` | large cross-domain feature |
| D03 | "build a marketplace module" | Activate | `full-pipeline` | project decomposition required |
| D04 | "fix this one broken route" | Usually do not activate unless unclear | direct edit or debugger | narrow, implementation-ready |
| D05 | "help me design and implement a new workflow" | Activate | `quick-plan-chain` or `deep-plan-chain` | planning required before coding |
| D06 | "I have no spec yet, but build this feature" | Activate | `quick-plan-chain` first | no spec, still plan-worthy |

## Suite G — False Positive Guards

| ID | User message | Expected | Guardrail |
|---|---|---|---|
| G01 | "ช่วยดูว่าคำนี้สะกดยังไง" | Do not activate | avoid treating tiny asks as orchestration |
| G02 | "สรุปว่าควรเลือก option ไหน" | Do not activate by default | advice is not orchestration unless execution is delegated |
| G03 | "เปิดไฟล์นี้ให้ดูหน่อย" | Do not activate | file inspection only |
| G04 | "run tests" | Do not activate by default | single action, not workflow management |
| G05 | "แก้บรรทัดนี้ให้หน่อย" | Usually do not activate | obvious narrow edit |

## Suite H — False Negative Guards

| ID | User message | Expected | Guardrail |
|---|---|---|---|
| H01 | "เพิ่ม support ให้ระบบนี้ใช้งานได้ครบ" | Activate after inspection | avoid missing vague delegated work |
| H02 | "ปรับระบบนี้ให้สอดคล้องกันทั้งหมด" | Activate after inspection | often multi-surface consistency work |
| H03 | "ช่วยดูว่าต้องแก้อะไรบ้างทั้งระบบ" | Activate | system-wide analysis request |
| H04 | "make all related flows consistent" | Activate after inspection | cross-surface consistency task |
| H05 | "จัดการเรื่องนี้ตั้งแต่ plan ถึง implementation" | Activate | explicit ownership delegation |

## Regression Acceptance Rule

A heuristic update is acceptable when:
- all strong positive cases still activate orchestra
- all clear negatives still stay out of orchestra
- borderline cases still require quick inspection rather than rigid keyword matching
- at most intentionally-documented case changes occur, with rationale logged

## Maintenance Rule

Whenever a real conversation reveals a new false positive or false negative:
1. add a new case here
2. classify it as positive / borderline / negative
3. update `intent-matrix.md` only if the broader heuristic needs to change

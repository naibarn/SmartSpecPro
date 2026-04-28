# Intent Matrix

Use this matrix when deciding whether a plain-text user message should implicitly activate orchestra.

## Goal

Make intent detection consistent across:
- obvious orchestration requests
- underspecified engineering requests
- borderline requests that may or may not need planning
- requests that should stay out of orchestra

If this matrix conflicts with a user's explicit instruction, follow the explicit instruction.

## Positive Examples — Auto Activate Orchestra

| User message | Why orchestra should own it | Likely route |
|---|---|---|
| "ช่วยวางแผนแล้วทำต่อให้จบ" | explicit planning + execution delegation | `quick-plan-chain` or `deep-plan-chain` |
| "ทำ feature นี้ให้ครบทั้ง backend กับ frontend" | cross-domain end-to-end work | `multi-agent-waves` or `deep-plan-chain` |
| "วิเคราะห์ว่าต้องแก้อะไรบ้างแล้วลงมือทำเลย" | analysis + execution together | `quick-plan-chain` or waves |
| "implement this end-to-end" | explicit conductor-style ownership | any non-trivial route |
| "break this down and build it" | decomposition + implementation | `quick-plan-chain`, `deep-plan-chain`, or `full-pipeline` |
| "continue the previous implementation" | resume semantics | `/orchestra resume` path or active session continuation |
| "สร้าง module ใหม่ทั้งระบบ" | system/module scope | `deep-plan-chain` or `full-pipeline` |

## Borderline Examples — Usually Promote Into Orchestra After Quick Inspection

| User message | Initial appearance | What to inspect quickly | Promote when |
|---|---|---|---|
| "แก้ระบบ skills ให้รองรับ category ใหม่" | may look medium | file/domain count, schema impact, UI/admin/runtime coupling | touches admin + backend + parser + DB + runtime |
| "เพิ่ม option นี้ในหน้า modal" | may look small | whether backend/schema/tests/flow logic also change | impacts flow beyond one component |
| "fix mobile UX for editor" | may look small | number of surfaces involved, gesture/state/layout coupling | affects multiple panels/viewport/controls |
| "ปรับ Media Studio ให้ฉลาดขึ้น" | vague feature ask | whether work spans selection logic, backend, skills metadata | task is underspecified or cross-domain |
| "ช่วยออกแบบ workflow นี้" | could be planning only | whether implementation is also implied | user expects plan + execution |

## Negative Examples — Do Not Auto Activate Orchestra

| User message | Why orchestra should stay out |
|---|---|
| "ตอนนี้กี่โมง" | simple utility question |
| "แปลประโยคนี้" | translation only |
| "ช่วย rewrite ข้อความนี้ให้ดีขึ้น" | editorial only |
| "git status เป็นอะไร" | one-off command/info request |
| "แก้ typo ใน label นี้หน่อย" | obvious tiny edit with no routing value |
| "อธิบาย file นี้ให้หน่อย" | explanation only unless user also delegates implementation |

## Strong Promotion Heuristics

Promote into orchestra even if the wording looks small when any of these are true after quick inspection:
- more than one subsystem is involved
- the task is under-specified but the user expects action, not just explanation
- a planning artifact would materially reduce execution risk
- the task likely needs `deep-plan-quick`, `deep-plan`, `deep-project`, or `deep-implement`
- the user is delegating ownership of the workflow, not just asking for one isolated edit

## Defer-To-Other-Skill Cases

Do not auto-activate orchestra if a single explicit specialized skill clearly owns the request and orchestration adds no value.

Examples:
- pure prompt-writing request -> prompt skill
- pure research/advice request -> advisory skill
- narrow translation/rewriting request -> direct response

If the specialized skill would still need multi-step planning/execution across the repo, orchestra may still take ownership and then invoke that skill's guidance as one stage in the chain.

## Tie-Break Policy

If still uncertain after a quick read:
- prefer orchestra when missing orchestration would likely cause under-planning, wrong routing, or fragmented execution
- avoid orchestra when the request is obviously one-shot, low-risk, and implementation-ready

## Output Requirement

When orchestra auto-activates from plain text, record a short note in `orchestra/plan.md` explaining:
- which intent signals matched
- whether activation was direct or promoted after quick inspection
- why orchestra ownership is justified

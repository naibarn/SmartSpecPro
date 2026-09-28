# Section 06: UI Truthfulness and Recovery Actions

## Objective

Make the series detail experience accurately show the durable run state and
offer the next safe action.

## Owned paths

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- related vertical-drama status/progress components and locale strings
- focused page/component tests

## UI/UX Contract

### Target User / JTBD
Creator generating a vertical-drama story from an existing draft/plan; success
is a visibly completed story that passed the final gate or a clear recovery
action when it did not.

### Existing Pattern Reference
Reuse the existing `VerticalDramaSeriesDetailPage` story cards, tRPC query
polling, and approval/dialog patterns. Diverge only by adding durable run
states and explicit repair/reconciliation actions.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Series detail | `VerticalDramaSeriesDetailPage.tsx` | durable run summary |
| Findings/repair | vertical drama detail components | scoped findings/actions |
| Approval/cancel | existing dialog pattern | explicit confirmation |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Run status summary | detail page or extracted panel | status/actions | `StoryGenerationRunSummary` |
| Findings list | vertical drama component | blocking/impact display | validation report |
| Approval dialog | existing dialog seam | approve/reject confirmation | approval reason/fingerprint |

### State Matrix

| Backend state | Display | Primary action |
|---|---|---|
| queued/running | กำลังสร้าง พร้อม checkpoint | ดูความคืบหน้า/ยกเลิก |
| validating | กำลังตรวจสอบ | ดูผลตรวจ |
| repairing | กำลังซ่อมเฉพาะจุด | ดูขอบเขต |
| partial | สร้างได้บางส่วนและหยุดอย่างปลอดภัย | ดำเนินการต่อ |
| needs_repair | พบจุดต้องแก้ | ซ่อม/แก้ไขต้นทาง |
| awaiting_approval | รออนุมัติขอบเขต | อนุมัติ/ปฏิเสธ |
| awaiting_reconciliation | รอผล provider/เครดิต | ตรวจสอบผล |
| succeeded | เสร็จสมบูรณ์และผ่าน final gate | เปิดเนื้อเรื่อง |
| failed/cancelled/rejected | หยุดพร้อมเหตุผล | retry/resume ตามที่อนุญาต |

### Responsive Matrix

Desktop shows stage, episode/chunk progress, findings, cost, and action group
side-by-side. Narrow layouts stack the state summary before findings and keep
the primary action visible without horizontal scrolling.

### Accessibility Acceptance

Status changes are announced, buttons have explicit labels including the run
state, blocking findings are keyboard-readable, and color is not the only state
indicator. Destructive cancel/reject actions require a confirmation dialog.

### Copy Contract
Tone is calm and operational. Required copy distinguishes “กำลังตรวจสอบ”,
“ต้องซ่อม”, “รอการตรวจสอบผล”, and “เสร็จสมบูรณ์”. Do not use success wording
for transport-only completion; all strings must have Thai/English locale keys.

### Browser Evidence Required

Add jsdom component/page tests in this section. A real browser screenshot or
production UI check is not claimed unless separately run.

## Required behavior

- Poll/query by durable run ID and event cursor; do not infer completion from
  mutation HTTP success.
- Render blocking findings, impact scope, source drift, reconciliation reason,
  approval reason, checkpoint, and estimated credits.
- Disable invalid actions while preserving resume when the backend says it is
  safe. Refresh after every action and preserve old draft content until final
  success.

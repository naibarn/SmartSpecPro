# Vertical Drama Advisory Draft QC Flow

## Intent

Draft QC is an optional information service for the Create Series wizard. The
creator may inspect the score, wait for a running job, retry, repair, ignore,
or accept the Draft and continue. QC status, score, failure, and credit
estimates must never prevent the creator from continuing with a usable Draft.

The planned Sub-episode count is a planning input for later story generation;
it is not a reason to invalidate the current synopsis Draft or force another
paid Draft/QC run before the creator decides to continue.

## Current failure modes

- `targetEpisodeCount` participates in the Draft source signature. Editing the
  count makes an existing Draft appear stale even though the full story has not
  been generated.
- Wizard progression and Draft confirmation depend on `draftQcAccepted`, so a
  missing, running, failed, or below-threshold QC result blocks the user.
- A QC receipt sent to `create` currently rejects a completed report below
  9.0/10 unless an override flag is set, turning advisory feedback into a hard
  gate.
- The QC panel does not consistently explain that the creator may continue
  while QC is running or after QC fails.

## Design

### Draft identity

Keep the current source-signature invalidation for story-bearing inputs that
change the generated synopsis, but exclude `targetEpisodeCount`. Changing the
count updates the create payload and later story-generation target only. It
does not automatically regenerate the synopsis or spend credits. The existing
manual “generate again” action remains available when the creator wants the
synopsis to reflect the new count.

### Wizard gate

Separate Draft usability from QC acceptance. A usable, current Draft with a
valid selected title can be applied and can unlock the next wizard step without
any QC result. The same remains true while QC is queued/running, after a failed
run, and after a score below 9.0. Preserve basic payload/story-contract
validation so malformed data cannot be persisted; this is data integrity, not
a quality score gate.

### QC panel state contract

The panel must make the next action explicit for every state:

| State | User-facing meaning | Allowed action |
|---|---|---|
| idle | ยังไม่ได้ตรวจ — ใช้ Draft ต่อได้ หรือเริ่ม QC เพื่อดูคำแนะนำ | use Draft / start QC |
| queued/running | กำลังตรวจ — รอผลได้ หรือใช้ Draft ต่อได้ | cancel / use Draft / continue |
| succeeded and pass | QC ผ่าน — เป็นข้อมูลยืนยันเพิ่มเติม | use Draft / continue |
| succeeded below threshold | คะแนนต่ำกว่าเกณฑ์แนะนำ แต่ผู้ใช้ตัดสินใจเองได้ | use Draft / repair / continue |
| failed/cancelled | QC ไม่สำเร็จหรือถูกยกเลิก แต่ Draft ยังใช้ต่อได้ | retry / use Draft / continue |

Show progress, phase, completed calls, and a clear “ใช้ Draft นี้และไปต่อ”
action where appropriate. Do not present “9.0/10” as a blocker. Keep repair and
retry explicitly user-triggered because they may spend credits.

### Server receipt behavior

When a completed QC receipt is supplied, validate ownership, candidate
fingerprint, and report integrity, then persist the audit as advisory. Do not
reject a valid completed report because its score is below 9.0 or it contains
critical findings. When the creator skips QC, omit the receipt and allow the
normal create path.

## Verification

Add focused tests for:

- changing the planned count does not invalidate the current Draft or QC state;
- applying and navigating with no QC result;
- applying/navigating while QC is running;
- applying after failed/cancelled QC and after a below-threshold score;
- completed low-score receipt is accepted and recorded as advisory;
- panel copy and action affordances identify whether the user should wait,
  retry, repair, or continue.

Run the changed-surface client/server tests, `git diff --check`, and the
focused TypeScript check available for the web workspace. Report any unrelated
baseline failures separately.

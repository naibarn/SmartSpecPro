# Request

Fix Vertical Drama shot-video prompts so dialogue is bound to the correct person
and viewer-relative position. Shot 5 evidence shows the intended order is ภูมิ,
ไอริณ, กล้า, ปราง, ภาคิน but the persisted prompt/frame analysis assigned a
different order. Complete the fix end-to-end and prevent wasted credits when the
image is unclear or the cast position cannot be verified.

Constraints: preserve unrelated dirty-worktree changes, avoid a DB migration,
retain tenant/user ownership, use stable character keys, and fail before paid
generation when evidence is missing or stale.

Non-goal: claim that an external video model can never drift after receiving a
correct prompt. Existing post-render identity QC remains responsible for that
provider-output risk.

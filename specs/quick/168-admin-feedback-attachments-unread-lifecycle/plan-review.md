# Plan self-review

Five review passes were completed before handoff:

1. Coverage: verified the approved requirements are represented across schema,
   upload/reply API, unread ordering/alert, close permissions, auto-close job,
   and both Feedback Hub views.
2. Contradictions: closed tickets are terminal; reply/upload paths reject them,
   status reopening is rejected, and closed tickets are excluded from unread
   ordering and overdue counts.
3. Security: reply attachment IDs are checked for ticket ownership, uploader,
   unlinked state, and image MIME; user-facing detail and attachment APIs filter
   internal comments; admin/user tenant ownership checks remain enforced.
4. Operations: staged reply uploads are deleted on client mutation failure,
   storage failures clean up server-side, and auto-close is idempotent with a
   startup run plus hourly interval and shutdown cleanup.
5. Proof and delivery: focused media and auto-close tests pass, formatting and
   diff checks pass, the existing router test remains blocked before collection
   by an unrelated `comfyOutputPolicySchema.partial` baseline error, and live
   browser/DB migration proof is recorded separately as pending.

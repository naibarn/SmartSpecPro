# SPEC-308 discoverability metric definitions

Status: definitions implemented for AC-308-033; collection, privacy approval, baseline and outcome claims remain OPEN.

These measures define what a later authorized evaluation may calculate. They do not add analytics, client storage, server events or notification reads. Collection is permitted only through an existing consent-governed analytics path after privacy review. If that path or consent is absent, collect nothing.

| Measure | Numerator | Denominator | Interpretation / guardrail |
| --- | --- | --- | --- |
| Chat launcher discovery | Eligible sessions with an explicit user activation of the AI Chat & Feedback launcher | Eligible sessions in which that launcher was rendered | Report by coarse device class and approved rollout cohort. Do not count hover, focus or hint display as discovery. |
| Notification intent accuracy | User activations of the Bell or reminder CTA that open the existing Notification surface | User activations of either notification intent control | Track accidental Chat openings separately only if an existing consented path can distinguish the destination; never infer from message content. |
| Confirmed-notification detail engagement | Eligible confirmed-arrival episodes followed by an explicit notification-detail open | Eligible confirmed-arrival episodes with an authorized, stable denominator | Not measurable until Feature-049 supplies the approved arrival/occurrence authority. Never use raw notification IDs as analytics keys. |
| Critical / approval reaction time | Time from the authoritative delivery timestamp to the first existing acknowledgement/action | Critical or approval items with both timestamps and authorization to evaluate them | Keep delivery, acknowledgement and escalation semantics with Feature-049. Do not infer a delivery time from client animation or polling. |
| Reminder dismissal and motion opt-out | Explicit reminder dismissals or motion-off selections, reported as separate actions | Reminder displays or eligible settings exposures, respectively | A dismissal is not a read or acknowledgement. Do not use this to reduce delivery or escalation. |
| Mobile overlay incident rate | Explicitly reported overlay/support incidents attributable to the launcher or reminder | Eligible mobile sessions | Use existing support classification; do not record route content, drafts, notification payloads or diagnostic bundles for this metric. |

## Privacy and reporting rules

- Allowed event fields, only after the existing telemetry owner and privacy reviewer approve collection: event category, coarse device class, approved cohort, and coarse time bucket.
- Prohibited fields: notification title/body/ID, user or tenant identifiers, conversation text/ID, route/resource URL, approval content, diagnostics, secrets, and per-message tracking keys.
- Do not add a new telemetry transport or create an event on mount, focus, animation, hover, hint display or dismissal. A reportable activation must follow an explicit user action.
- Suppress small cohort denominators using the analytics owner's existing rule. Do not invent a threshold in SPEC-308.
- Establish a pre-rollout baseline and owner-approved guardrails before claiming any increase, decrease, uplift or reaction-time change. Until then, report definitions and data availability only.
- Any result must be segmented and interpreted without optimizing clicks at the expense of urgent acknowledgement, task efficiency, tenant privacy or user choice.

## Current availability

The client can distinguish explicit launcher, Bell and reminder-CTA actions in the UI, but no new instrumentation was added. The current notification stream does not establish an authorized unique occurrence timestamp; the confirmed-arrival engagement and reaction-time measures therefore remain unavailable pending Feature-049 authority. These definitions are not evidence of live collection or product impact.

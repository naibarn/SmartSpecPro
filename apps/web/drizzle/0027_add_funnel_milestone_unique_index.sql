-- Add partial unique index for milestone events to enforce once-per-user semantics.
-- This prevents duplicate milestone records across different days (dayBucket in eventKey
-- only covers same-day dedup). Milestone events use first-event semantics.
CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_milestone_unique"
  ON "funnel_events" ("tenantId", "userId", "eventName")
  WHERE "eventName" IN (
    'signup_completed',
    'email_verified',
    'first_conversation',
    'first_llm_request',
    'first_media_generation'
  );

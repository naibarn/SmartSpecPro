-- The Harness projection compares the canonical Job tenant with the Runner
-- session tenant in addition to its environment, workspace and requester checks.
-- Grant the missing column to its restricted function owner only.
GRANT SELECT ("tenantId") ON public.worker_jobs TO modular_chat_mission_owner;

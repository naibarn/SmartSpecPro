SET lock_timeout = '5s';
SET statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "llm_inference_probe_runs"
  DROP CONSTRAINT "llm_inference_probe_kind_check";
--> statement-breakpoint
ALTER TABLE "llm_inference_probe_runs"
  ADD CONSTRAINT "llm_inference_probe_kind_check"
  CHECK ("probeKind" IN ('connectivity', 'capability_suite'));
--> statement-breakpoint
ALTER TABLE "llm_inference_probe_runs"
  DROP CONSTRAINT "llm_inference_probe_status_check";
--> statement-breakpoint
ALTER TABLE "llm_inference_probe_runs"
  ADD CONSTRAINT "llm_inference_probe_status_check"
  CHECK ("status" IN ('passed', 'failed', 'blocked', 'incomplete'));

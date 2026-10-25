-- Make retries of the same source/artifact deployment idempotent within an App run.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE UNIQUE INDEX "app_deployment_versions_source_artifact_unique"
	ON "app_deployment_versions" USING btree ("app_id", "development_run_id", "source_digest", "artifact_digest");

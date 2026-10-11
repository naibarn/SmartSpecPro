CREATE TABLE "project_wiki_package_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"app_id" varchar(128) NOT NULL,
	"source_revision" varchar(40) NOT NULL,
	"package_digest" varchar(128) NOT NULL,
	"archive_sha256" varchar(64) NOT NULL,
	"object_key" varchar(1024) NOT NULL,
	"approval_ref" varchar(36) NOT NULL,
	"approval_payload_sha256" varchar(64) NOT NULL,
	"qualification_status" varchar(32) DEFAULT 'CANDIDATE_NOT_RELEASED' NOT NULL,
	"validation_status" varchar(32) DEFAULT 'needs_context' NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_wiki_package_candidates_app_check" CHECK ("project_wiki_package_candidates"."app_id" = 'app_project_wiki_pages'),
	CONSTRAINT "project_wiki_package_candidates_source_sha_check" CHECK ("project_wiki_package_candidates"."source_revision" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "project_wiki_package_candidates_package_digest_check" CHECK ("project_wiki_package_candidates"."package_digest" ~ '^spaas-package-v1:sha256:[0-9a-f]{64}$'),
	CONSTRAINT "project_wiki_package_candidates_archive_sha_check" CHECK ("project_wiki_package_candidates"."archive_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_wiki_package_candidates_approval_sha_check" CHECK ("project_wiki_package_candidates"."approval_payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_wiki_package_candidates_qualification_check" CHECK ("project_wiki_package_candidates"."qualification_status" = 'CANDIDATE_NOT_RELEASED'),
	CONSTRAINT "project_wiki_package_candidates_validation_check" CHECK ("project_wiki_package_candidates"."validation_status" = 'needs_context')
);
--> statement-breakpoint
ALTER TABLE "project_wiki_package_candidates" ADD CONSTRAINT "project_wiki_package_candidates_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_wiki_package_candidates" ADD CONSTRAINT "project_wiki_package_candidates_app_fk" FOREIGN KEY ("tenant_id","app_id") REFERENCES "public"."app_identities"("tenant_id","app_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_wiki_package_candidates_scope_digest_unique" ON "project_wiki_package_candidates" USING btree ("tenant_id","project_id","app_id","package_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "project_wiki_package_candidates_object_key_unique" ON "project_wiki_package_candidates" USING btree ("object_key");
--> statement-breakpoint
CREATE FUNCTION prevent_project_wiki_candidate_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'project wiki package candidates are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER project_wiki_package_candidates_immutable BEFORE UPDATE OR DELETE ON "project_wiki_package_candidates" FOR EACH ROW EXECUTE FUNCTION prevent_project_wiki_candidate_mutation();
--> statement-breakpoint
CREATE TRIGGER project_wiki_package_candidates_no_truncate BEFORE TRUNCATE ON "project_wiki_package_candidates" FOR EACH STATEMENT EXECUTE FUNCTION prevent_project_wiki_candidate_mutation();

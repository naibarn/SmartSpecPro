-- Durable immutable binding from an App version to its exact source and artifact.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "app_deployment_versions" (
	"app_id" varchar(128) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"deployment_version" integer NOT NULL,
	"development_run_id" varchar(128) NOT NULL,
	"source_ref" varchar(512) NOT NULL,
	"source_digest" varchar(64) NOT NULL,
	"artifact_ref" varchar(512) NOT NULL,
	"artifact_digest" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_deployment_versions_pk" PRIMARY KEY("app_id", "deployment_version"),
	CONSTRAINT "app_deployment_versions_version_check" CHECK ("deployment_version" > 0),
	CONSTRAINT "app_deployment_versions_source_digest_check" CHECK ("source_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "app_deployment_versions_artifact_digest_check" CHECK ("artifact_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "app_deployment_versions_app_id_app_identities_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_identities"("app_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "app_deployment_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "app_deployment_versions_tenant_created_idx" ON "app_deployment_versions" USING btree ("tenant_id", "app_id", "created_at");
--> statement-breakpoint
ALTER TABLE "app_identities"
	ADD COLUMN "runtime_data_migration_status" varchar(24) DEFAULT 'NOT_STARTED' NOT NULL,
	ADD COLUMN "runtime_data_migration_verified_at" timestamp with time zone,
	ADD COLUMN "runtime_data_migration_verified_by_user_id" integer,
	ADD COLUMN "runtime_data_migration_imported_count" integer DEFAULT 0 NOT NULL,
	ADD COLUMN "runtime_data_migration_preserved_count" integer DEFAULT 0 NOT NULL,
	ADD COLUMN "runtime_data_migration_confirmed_at" timestamp with time zone,
	ADD COLUMN "runtime_data_migration_confirmed_by_user_id" integer;
--> statement-breakpoint
ALTER TABLE "app_identities"
	ADD CONSTRAINT "app_identities_runtime_data_migration_status_check"
	CHECK ("runtime_data_migration_status" IN ('NOT_STARTED', 'VERIFIED', 'OWNER_CONFIRMED')),
	ADD CONSTRAINT "app_identities_runtime_data_migration_counts_check"
	CHECK ("runtime_data_migration_imported_count" >= 0 AND "runtime_data_migration_preserved_count" >= 0);
--> statement-breakpoint
ALTER TABLE "app_identities"
	ADD CONSTRAINT "app_identities_runtime_data_migration_verified_by_user_id_users_id_fk"
	FOREIGN KEY ("runtime_data_migration_verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT "app_identities_runtime_data_migration_confirmed_by_user_id_users_id_fk"
	FOREIGN KEY ("runtime_data_migration_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

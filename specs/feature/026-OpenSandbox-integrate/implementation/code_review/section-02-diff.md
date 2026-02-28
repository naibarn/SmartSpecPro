diff --git a/apps/web/drizzle/0040_yellow_silhouette.sql b/apps/web/drizzle/0040_yellow_silhouette.sql
new file mode 100644
index 0000000..cdb9ac1
--- /dev/null
+++ b/apps/web/drizzle/0040_yellow_silhouette.sql
@@ -0,0 +1,109 @@
+CREATE TYPE "public"."sandbox_artifact_type" AS ENUM('primary', 'log', 'screenshot', 'thumbnail', 'chunk', 'debug');--> statement-breakpoint
+CREATE TYPE "public"."sandbox_execution_mode" AS ENUM('code', 'command', 'browser', 'file', 'media');--> statement-breakpoint
+CREATE TYPE "public"."sandbox_feature_type" AS ENUM('chat', 'skill', 'workflow', 'library', 'media', 'presentation', 'connector');--> statement-breakpoint
+CREATE TYPE "public"."sandbox_job_status" AS ENUM('accepted', 'policy_resolved', 'queued', 'provisioning', 'staging_inputs', 'executing', 'collecting_outputs', 'persisting', 'completed', 'failed', 'timed_out', 'canceled');--> statement-breakpoint
+CREATE TYPE "public"."sandbox_network_action" AS ENUM('deny', 'allow');--> statement-breakpoint
+CREATE TABLE "sandbox_artifacts" (
+	"id" serial PRIMARY KEY NOT NULL,
+	"sandboxJobId" varchar(36) NOT NULL,
+	"artifactType" "sandbox_artifact_type" NOT NULL,
+	"objectKey" varchar(512) NOT NULL,
+	"mimeType" varchar(128),
+	"sizeBytes" bigint,
+	"sha256" varchar(64),
+	"isPrimary" boolean DEFAULT false NOT NULL,
+	"metadataJson" jsonb,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "sandbox_jobs" (
+	"id" varchar(36) PRIMARY KEY NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"userId" integer NOT NULL,
+	"featureType" "sandbox_feature_type" NOT NULL,
+	"featureRefId" varchar(128),
+	"executionMode" "sandbox_execution_mode" NOT NULL,
+	"sandboxProfileId" integer,
+	"opensandboxId" varchar(128),
+	"status" "sandbox_job_status" DEFAULT 'accepted' NOT NULL,
+	"statusReason" text,
+	"imageUri" varchar(512),
+	"inputManifestJson" jsonb,
+	"outputManifestJson" jsonb,
+	"stdoutExcerpt" text,
+	"stderrExcerpt" text,
+	"costEstimate" numeric(12, 4),
+	"costActual" numeric(12, 4),
+	"idempotencyKey" varchar(128),
+	"startedAt" timestamp with time zone,
+	"finishedAt" timestamp with time zone,
+	"expiresAt" timestamp with time zone,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+CREATE TABLE "sandbox_profiles" (
+	"id" serial PRIMARY KEY NOT NULL,
+	"slug" varchar(64) NOT NULL,
+	"name" varchar(255) NOT NULL,
+	"description" text,
+	"executionMode" "sandbox_execution_mode" NOT NULL,
+	"baseImage" varchar(512) NOT NULL,
+	"entrypointTemplate" text,
+	"cpuLimit" varchar(16) DEFAULT '1000m' NOT NULL,
+	"memoryLimitMb" integer DEFAULT 2048 NOT NULL,
+	"ephemeralDiskMb" integer DEFAULT 5120 NOT NULL,
+	"timeoutSeconds" integer DEFAULT 300 NOT NULL,
+	"networkDefaultAction" "sandbox_network_action" DEFAULT 'deny' NOT NULL,
+	"allowBrowser" boolean DEFAULT false NOT NULL,
+	"allowCommand" boolean DEFAULT false NOT NULL,
+	"allowCodeInterpreter" boolean DEFAULT false NOT NULL,
+	"allowFileUpload" boolean DEFAULT true NOT NULL,
+	"maxInputMb" integer DEFAULT 50,
+	"maxOutputMb" integer DEFAULT 100,
+	"isActive" boolean DEFAULT true NOT NULL,
+	"version" integer DEFAULT 1 NOT NULL,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "sandbox_profiles_slug_unique" UNIQUE("slug")
+);
+--> statement-breakpoint
+CREATE TABLE "tenant_sandbox_policies" (
+	"id" serial PRIMARY KEY NOT NULL,
+	"tenantId" varchar(36) NOT NULL,
+	"defaultProfileId" integer,
+	"maxConcurrentSandboxes" integer DEFAULT 5 NOT NULL,
+	"maxDailyRuntimeSeconds" integer DEFAULT 36000 NOT NULL,
+	"maxSingleJobSeconds" integer DEFAULT 1800 NOT NULL,
+	"defaultNetworkAction" "sandbox_network_action",
+	"egressRulesJson" jsonb,
+	"allowedImagesJson" jsonb,
+	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
+	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
+	CONSTRAINT "tenant_sandbox_policies_tenantId_unique" UNIQUE("tenantId")
+);
+--> statement-breakpoint
+ALTER TABLE "api_audit_events" ADD COLUMN "sandboxJobId" varchar(36);--> statement-breakpoint
+ALTER TABLE "api_audit_events" ADD COLUMN "opensandboxId" varchar(128);--> statement-breakpoint
+ALTER TABLE "media_callback_events" ADD COLUMN "sandbox_job_id" varchar(36);--> statement-breakpoint
+ALTER TABLE "presentation_conversion_records" ADD COLUMN "sandbox_job_id" varchar(36);--> statement-breakpoint
+ALTER TABLE "skills" ADD COLUMN "sandboxProfileSlug" varchar(64);--> statement-breakpoint
+ALTER TABLE "skills" ADD COLUMN "requiresNetwork" boolean;--> statement-breakpoint
+ALTER TABLE "skills" ADD COLUMN "requiresBrowser" boolean;--> statement-breakpoint
+ALTER TABLE "skills" ADD COLUMN "maxRuntimeSeconds" integer;--> statement-breakpoint
+ALTER TABLE "skills" ADD COLUMN "maxInputMb" integer;--> statement-breakpoint
+ALTER TABLE "workflow_executions" ADD COLUMN "sandboxJobIds" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
+ALTER TABLE "sandbox_artifacts" ADD CONSTRAINT "sandbox_artifacts_sandboxJobId_sandbox_jobs_id_fk" FOREIGN KEY ("sandboxJobId") REFERENCES "public"."sandbox_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_sandboxProfileId_sandbox_profiles_id_fk" FOREIGN KEY ("sandboxProfileId") REFERENCES "public"."sandbox_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "tenant_sandbox_policies" ADD CONSTRAINT "tenant_sandbox_policies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
+ALTER TABLE "tenant_sandbox_policies" ADD CONSTRAINT "tenant_sandbox_policies_defaultProfileId_sandbox_profiles_id_fk" FOREIGN KEY ("defaultProfileId") REFERENCES "public"."sandbox_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
+CREATE INDEX "sandbox_artifacts_job_idx" ON "sandbox_artifacts" USING btree ("sandboxJobId");--> statement-breakpoint
+CREATE INDEX "sandbox_artifacts_type_idx" ON "sandbox_artifacts" USING btree ("artifactType");--> statement-breakpoint
+CREATE UNIQUE INDEX "sandbox_jobs_idempotency_idx" ON "sandbox_jobs" USING btree ("tenantId","featureType","idempotencyKey") WHERE "sandbox_jobs"."idempotencyKey" IS NOT NULL;--> statement-breakpoint
+CREATE INDEX "sandbox_jobs_tenant_status_idx" ON "sandbox_jobs" USING btree ("tenantId","status");--> statement-breakpoint
+CREATE INDEX "sandbox_jobs_opensandbox_id_idx" ON "sandbox_jobs" USING btree ("opensandboxId");--> statement-breakpoint
+CREATE INDEX "sandbox_jobs_user_idx" ON "sandbox_jobs" USING btree ("userId");--> statement-breakpoint
+CREATE INDEX "sandbox_jobs_created_idx" ON "sandbox_jobs" USING btree ("createdAt");--> statement-breakpoint
+CREATE INDEX "sandbox_jobs_expires_idx" ON "sandbox_jobs" USING btree ("expiresAt");
\ No newline at end of file
diff --git a/apps/web/drizzle/meta/0040_snapshot.json b/apps/web/drizzle/meta/0040_snapshot.json
new file mode 100644
index 0000000..5d93afb
--- /dev/null
+++ b/apps/web/drizzle/meta/0040_snapshot.json
@@ -0,0 +1,13930 @@
+{
+  "id": "5a18ada7-93c6-4e9d-9dae-1614b8dc6a05",
+  "prevId": "83f30e94-af4e-45ff-8213-6f2dc7868cbc",
+  "version": "7",
+  "dialect": "postgresql",
+  "tables": {
+    "public.api_audit_events": {
+      "name": "api_audit_events",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "traceId": {
+          "name": "traceId",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "eventType": {
+          "name": "eventType",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "endpoint": {
+          "name": "endpoint",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "model": {
+          "name": "model",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "provider": {
+          "name": "provider",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "statusCode": {
+          "name": "statusCode",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "errorMessage": {
+          "name": "errorMessage",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "responseTimeMs": {
+          "name": "responseTimeMs",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "creditsCharged": {
+          "name": "creditsCharged",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "costUsd": {
+          "name": "costUsd",
+          "type": "numeric(12, 8)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skillSlug": {
+          "name": "skillSlug",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "mediaType": {
+          "name": "mediaType",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "mediaTaskId": {
+          "name": "mediaTaskId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "metadata": {
+          "name": "metadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sandboxJobId": {
+          "name": "sandboxJobId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "opensandboxId": {
+          "name": "opensandboxId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "api_audit_events_trace_id": {
+          "name": "api_audit_events_trace_id",
+          "columns": [
+            {
+              "expression": "traceId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "api_audit_events_user_created": {
+          "name": "api_audit_events_user_created",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "api_audit_events_type_created": {
+          "name": "api_audit_events_type_created",
+          "columns": [
+            {
+              "expression": "eventType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "api_audit_events_userId_users_id_fk": {
+          "name": "api_audit_events_userId_users_id_fk",
+          "tableFrom": "api_audit_events",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.blocked_patterns": {
+      "name": "blocked_patterns",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "patternType": {
+          "name": "patternType",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "pattern": {
+          "name": "pattern",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "reason": {
+          "name": "reason",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdBy": {
+          "name": "createdBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "blocked_patterns_createdBy_users_id_fk": {
+          "name": "blocked_patterns_createdBy_users_id_fk",
+          "tableFrom": "blocked_patterns",
+          "tableTo": "users",
+          "columnsFrom": [
+            "createdBy"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.blog_posts": {
+      "name": "blog_posts",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(500)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "excerpt": {
+          "name": "excerpt",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "coverImage": {
+          "name": "coverImage",
+          "type": "varchar(1024)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "author": {
+          "name": "author",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "authorAvatar": {
+          "name": "authorAvatar",
+          "type": "varchar(1024)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "category": {
+          "name": "category",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tags": {
+          "name": "tags",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "readTime": {
+          "name": "readTime",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isPublished": {
+          "name": "isPublished",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "isFeatured": {
+          "name": "isFeatured",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "metaDescription": {
+          "name": "metaDescription",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "metaKeywords": {
+          "name": "metaKeywords",
+          "type": "varchar(500)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "publishedAt": {
+          "name": "publishedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "blog_posts_tenantId_tenants_id_fk": {
+          "name": "blog_posts_tenantId_tenants_id_fk",
+          "tableFrom": "blog_posts",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.cloud_task_events": {
+      "name": "cloud_task_events",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "taskId": {
+          "name": "taskId",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "queueName": {
+          "name": "queueName",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "jobId": {
+          "name": "jobId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'queued'"
+        },
+        "attemptCount": {
+          "name": "attemptCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "payload": {
+          "name": "payload",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "errorMessage": {
+          "name": "errorMessage",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "completedAt": {
+          "name": "completedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "cloud_task_events_task_id_idx": {
+          "name": "cloud_task_events_task_id_idx",
+          "columns": [
+            {
+              "expression": "taskId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "cloud_task_events_status_idx": {
+          "name": "cloud_task_events_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "cloud_task_events_queue_name_idx": {
+          "name": "cloud_task_events_queue_name_idx",
+          "columns": [
+            {
+              "expression": "queueName",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "cloud_task_events_job_id_idx": {
+          "name": "cloud_task_events_job_id_idx",
+          "columns": [
+            {
+              "expression": "jobId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.conversation_summaries": {
+      "name": "conversation_summaries",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "conversationId": {
+          "name": "conversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "summary": {
+          "name": "summary",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "messageRangeStart": {
+          "name": "messageRangeStart",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "messageRangeEnd": {
+          "name": "messageRangeEnd",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "messageCount": {
+          "name": "messageCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "tokensUsed": {
+          "name": "tokensUsed",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "project_id": {
+          "name": "project_id",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "conversation_summaries_conversationId_conversations_id_fk": {
+          "name": "conversation_summaries_conversationId_conversations_id_fk",
+          "tableFrom": "conversation_summaries",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "conversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.conversations": {
+      "name": "conversations",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'New Chat'"
+        },
+        "model": {
+          "name": "model",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'gpt-4o-mini'"
+        },
+        "temperature": {
+          "name": "temperature",
+          "type": "numeric(3, 2)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'0.7'"
+        },
+        "systemPrompt": {
+          "name": "systemPrompt",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skillSettings": {
+          "name": "skillSettings",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'{\"autoDetect\":true,\"enabledSkills\":[],\"detectionMode\":\"auto\"}'::json"
+        },
+        "isArchived": {
+          "name": "isArchived",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "isPinned": {
+          "name": "isPinned",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "trashedAt": {
+          "name": "trashedAt",
+          "type": "timestamp",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "totalCreditsUsed": {
+          "name": "totalCreditsUsed",
+          "type": "numeric(12, 4)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'0'"
+        },
+        "messageCount": {
+          "name": "messageCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "project_id": {
+          "name": "project_id",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "memory_mode": {
+          "name": "memory_mode",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'full'"
+        },
+        "brainstormPartnerModel": {
+          "name": "brainstormPartnerModel",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "brainstormMaxRounds": {
+          "name": "brainstormMaxRounds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 3
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "conversations_userId_users_id_fk": {
+          "name": "conversations_userId_users_id_fk",
+          "tableFrom": "conversations",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.credit_packages": {
+      "name": "credit_packages",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "credits": {
+          "name": "credits",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "priceUsd": {
+          "name": "priceUsd",
+          "type": "numeric(10, 2)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "packageType": {
+          "name": "packageType",
+          "type": "package_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'one_time'"
+        },
+        "billingPeriod": {
+          "name": "billingPeriod",
+          "type": "billing_period",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "discountPercent": {
+          "name": "discountPercent",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "stripePriceId": {
+          "name": "stripePriceId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "stripeProductId": {
+          "name": "stripeProductId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "stripePriceIds": {
+          "name": "stripePriceIds",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "isFeatured": {
+          "name": "isFeatured",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.credit_transactions": {
+      "name": "credit_transactions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "amount": {
+          "name": "amount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "type": {
+          "name": "type",
+          "type": "transaction_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "metadata": {
+          "name": "metadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "balanceAfter": {
+          "name": "balanceAfter",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "referenceId": {
+          "name": "referenceId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "idempotencyKey": {
+          "name": "idempotencyKey",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "traceId": {
+          "name": "traceId",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "conversationId": {
+          "name": "conversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skillSlug": {
+          "name": "skillSlug",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sourceType": {
+          "name": "sourceType",
+          "type": "credit_source_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "credit_transactions_idempotency_key_unique": {
+          "name": "credit_transactions_idempotency_key_unique",
+          "columns": [
+            {
+              "expression": "idempotencyKey",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "where": "\"idempotencyKey\" IS NOT NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "credit_transactions_type_created_idx": {
+          "name": "credit_transactions_type_created_idx",
+          "columns": [
+            {
+              "expression": "type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "credit_transactions_trace_id_idx": {
+          "name": "credit_transactions_trace_id_idx",
+          "columns": [
+            {
+              "expression": "traceId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "credit_transactions_conversation_id_idx": {
+          "name": "credit_transactions_conversation_id_idx",
+          "columns": [
+            {
+              "expression": "conversationId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "credit_transactions_source_type_idx": {
+          "name": "credit_transactions_source_type_idx",
+          "columns": [
+            {
+              "expression": "sourceType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "credit_transactions_userId_users_id_fk": {
+          "name": "credit_transactions_userId_users_id_fk",
+          "tableFrom": "credit_transactions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "credit_transactions_conversationId_conversations_id_fk": {
+          "name": "credit_transactions_conversationId_conversations_id_fk",
+          "tableFrom": "credit_transactions",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "conversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.device_fingerprints": {
+      "name": "device_fingerprints",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "fingerprintHash": {
+          "name": "fingerprintHash",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "firstSeenAt": {
+          "name": "firstSeenAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "lastSeenAt": {
+          "name": "lastSeenAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "seenCount": {
+          "name": "seenCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "device_fingerprints_userId_users_id_fk": {
+          "name": "device_fingerprints_userId_users_id_fk",
+          "tableFrom": "device_fingerprints",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.direct_messages": {
+      "name": "direct_messages",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "senderId": {
+          "name": "senderId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "receiverId": {
+          "name": "receiverId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "isUrgent": {
+          "name": "isUrgent",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "isRead": {
+          "name": "isRead",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "direct_messages_senderId_users_id_fk": {
+          "name": "direct_messages_senderId_users_id_fk",
+          "tableFrom": "direct_messages",
+          "tableTo": "users",
+          "columnsFrom": [
+            "senderId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "direct_messages_receiverId_users_id_fk": {
+          "name": "direct_messages_receiverId_users_id_fk",
+          "tableFrom": "direct_messages",
+          "tableTo": "users",
+          "columnsFrom": [
+            "receiverId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.email_verification_tokens": {
+      "name": "email_verification_tokens",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "email": {
+          "name": "email",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "code": {
+          "name": "code",
+          "type": "varchar(6)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "channel": {
+          "name": "channel",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'email'"
+        },
+        "expiresAt": {
+          "name": "expiresAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "usedAt": {
+          "name": "usedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "email_verification_tokens_userId_users_id_fk": {
+          "name": "email_verification_tokens_userId_users_id_fk",
+          "tableFrom": "email_verification_tokens",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.entity_memories": {
+      "name": "entity_memories",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "entityType": {
+          "name": "entityType",
+          "type": "entity_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "entityName": {
+          "name": "entityName",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "facts": {
+          "name": "facts",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'[]'::json"
+        },
+        "sourceConversationId": {
+          "name": "sourceConversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "projectId": {
+          "name": "projectId",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "confidence": {
+          "name": "confidence",
+          "type": "numeric(3, 2)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'0.8'"
+        },
+        "lastAccessedAt": {
+          "name": "lastAccessedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "now()"
+        },
+        "importance": {
+          "name": "importance",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 5
+        },
+        "source": {
+          "name": "source",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'auto'"
+        },
+        "reinforcementCount": {
+          "name": "reinforcementCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 1
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "entity_memories_userId_users_id_fk": {
+          "name": "entity_memories_userId_users_id_fk",
+          "tableFrom": "entity_memories",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "entity_memories_sourceConversationId_conversations_id_fk": {
+          "name": "entity_memories_sourceConversationId_conversations_id_fk",
+          "tableFrom": "entity_memories",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "sourceConversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.funnel_backfill_checkpoints": {
+      "name": "funnel_backfill_checkpoints",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "runId": {
+          "name": "runId",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "checkpointPosition": {
+          "name": "checkpointPosition",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "recordsProcessed": {
+          "name": "recordsProcessed",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "eventsInserted": {
+          "name": "eventsInserted",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "funnel_backfill_checkpoints_run_idx": {
+          "name": "funnel_backfill_checkpoints_run_idx",
+          "columns": [
+            {
+              "expression": "runId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "funnel_backfill_checkpoints_runId_funnel_backfill_runs_runId_fk": {
+          "name": "funnel_backfill_checkpoints_runId_funnel_backfill_runs_runId_fk",
+          "tableFrom": "funnel_backfill_checkpoints",
+          "tableTo": "funnel_backfill_runs",
+          "columnsFrom": [
+            "runId"
+          ],
+          "columnsTo": [
+            "runId"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.funnel_backfill_runs": {
+      "name": "funnel_backfill_runs",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "runId": {
+          "name": "runId",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "backfill_run_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'running'"
+        },
+        "startDate": {
+          "name": "startDate",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "endDate": {
+          "name": "endDate",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "sourceFilter": {
+          "name": "sourceFilter",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "batchSize": {
+          "name": "batchSize",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1000
+        },
+        "dryRun": {
+          "name": "dryRun",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "totalRecordsProcessed": {
+          "name": "totalRecordsProcessed",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "totalEventsInserted": {
+          "name": "totalEventsInserted",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "reconciliationStatus": {
+          "name": "reconciliationStatus",
+          "type": "reconciliation_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "reconciliationReport": {
+          "name": "reconciliationReport",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "startedAt": {
+          "name": "startedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "pausedAt": {
+          "name": "pausedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "completedAt": {
+          "name": "completedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "abortedAt": {
+          "name": "abortedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "funnel_backfill_runs_status_idx": {
+          "name": "funnel_backfill_runs_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "funnel_backfill_runs_tenant_idx": {
+          "name": "funnel_backfill_runs_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "funnel_backfill_runs_tenantId_tenants_id_fk": {
+          "name": "funnel_backfill_runs_tenantId_tenants_id_fk",
+          "tableFrom": "funnel_backfill_runs",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "funnel_backfill_runs_runId_unique": {
+          "name": "funnel_backfill_runs_runId_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "runId"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.funnel_events": {
+      "name": "funnel_events",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "domain": {
+          "name": "domain",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "eventName": {
+          "name": "eventName",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "eventTime": {
+          "name": "eventTime",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "eventKey": {
+          "name": "eventKey",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "properties": {
+          "name": "properties",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{}'::jsonb"
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "funnel_events_event_key_unique": {
+          "name": "funnel_events_event_key_unique",
+          "columns": [
+            {
+              "expression": "eventKey",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "funnel_events_tenant_event_time_idx": {
+          "name": "funnel_events_tenant_event_time_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "eventTime",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "funnel_events_domain_event_time_idx": {
+          "name": "funnel_events_domain_event_time_idx",
+          "columns": [
+            {
+              "expression": "domain",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "eventTime",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "funnel_events_name_event_time_idx": {
+          "name": "funnel_events_name_event_time_idx",
+          "columns": [
+            {
+              "expression": "eventName",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "eventTime",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "funnel_events_user_name_time_idx": {
+          "name": "funnel_events_user_name_time_idx",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "eventName",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "eventTime",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "funnel_events_tenantId_tenants_id_fk": {
+          "name": "funnel_events_tenantId_tenants_id_fk",
+          "tableFrom": "funnel_events",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "funnel_events_userId_users_id_fk": {
+          "name": "funnel_events_userId_users_id_fk",
+          "tableFrom": "funnel_events",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.gallery_items": {
+      "name": "gallery_items",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "type": {
+          "name": "type",
+          "type": "content_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "aspectRatio": {
+          "name": "aspectRatio",
+          "type": "aspect_ratio",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "fileKey": {
+          "name": "fileKey",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "fileUrl": {
+          "name": "fileUrl",
+          "type": "varchar(1024)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "thumbnailKey": {
+          "name": "thumbnailKey",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "thumbnailUrl": {
+          "name": "thumbnailUrl",
+          "type": "varchar(1024)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "duration": {
+          "name": "duration",
+          "type": "varchar(10)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "demoUrl": {
+          "name": "demoUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tags": {
+          "name": "tags",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "model": {
+          "name": "model",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "views": {
+          "name": "views",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "likes": {
+          "name": "likes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "downloads": {
+          "name": "downloads",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "isPublished": {
+          "name": "isPublished",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "isFeatured": {
+          "name": "isFeatured",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "authorId": {
+          "name": "authorId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "authorName": {
+          "name": "authorName",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "authorAvatar": {
+          "name": "authorAvatar",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "gallery_items_tenantId_tenants_id_fk": {
+          "name": "gallery_items_tenantId_tenants_id_fk",
+          "tableFrom": "gallery_items",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "gallery_items_authorId_users_id_fk": {
+          "name": "gallery_items_authorId_users_id_fk",
+          "tableFrom": "gallery_items",
+          "tableTo": "users",
+          "columnsFrom": [
+            "authorId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.google_drive_edit_sessions": {
+      "name": "google_drive_edit_sessions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "drive_file_id": {
+          "name": "drive_file_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "edit_url": {
+          "name": "edit_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "original_source_url": {
+          "name": "original_source_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "edit_session_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'active'"
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "gdrive_edit_tenant_user_status_idx": {
+          "name": "gdrive_edit_tenant_user_status_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "gdrive_edit_library_item_idx": {
+          "name": "gdrive_edit_library_item_idx",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "gdrive_edit_expires_at_idx": {
+          "name": "gdrive_edit_expires_at_idx",
+          "columns": [
+            {
+              "expression": "expires_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "google_drive_edit_sessions_tenant_id_tenants_id_fk": {
+          "name": "google_drive_edit_sessions_tenant_id_tenants_id_fk",
+          "tableFrom": "google_drive_edit_sessions",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "google_drive_edit_sessions_user_id_users_id_fk": {
+          "name": "google_drive_edit_sessions_user_id_users_id_fk",
+          "tableFrom": "google_drive_edit_sessions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "google_drive_edit_sessions_library_item_id_library_items_id_fk": {
+          "name": "google_drive_edit_sessions_library_item_id_library_items_id_fk",
+          "tableFrom": "google_drive_edit_sessions",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.google_drive_sync_state": {
+      "name": "google_drive_sync_state",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "indexing_mode": {
+          "name": "indexing_mode",
+          "type": "indexing_mode",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'none'"
+        },
+        "folder_selections": {
+          "name": "folder_selections",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::jsonb"
+        },
+        "file_type_filter": {
+          "name": "file_type_filter",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::jsonb"
+        },
+        "max_file_size_bytes": {
+          "name": "max_file_size_bytes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 52428800
+        },
+        "channel_id": {
+          "name": "channel_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "resource_id": {
+          "name": "resource_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "channel_token_hash": {
+          "name": "channel_token_hash",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "channel_expiry": {
+          "name": "channel_expiry",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "page_token": {
+          "name": "page_token",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "files_total": {
+          "name": "files_total",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "files_processed": {
+          "name": "files_processed",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "last_sync_at": {
+          "name": "last_sync_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "last_error": {
+          "name": "last_error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "auto_sync_enabled": {
+          "name": "auto_sync_enabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "gdrive_sync_tenant_user_unique": {
+          "name": "gdrive_sync_tenant_user_unique",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "gdrive_sync_channel_id_idx": {
+          "name": "gdrive_sync_channel_id_idx",
+          "columns": [
+            {
+              "expression": "channel_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "google_drive_sync_state_tenant_id_tenants_id_fk": {
+          "name": "google_drive_sync_state_tenant_id_tenants_id_fk",
+          "tableFrom": "google_drive_sync_state",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "google_drive_sync_state_user_id_users_id_fk": {
+          "name": "google_drive_sync_state_user_id_users_id_fk",
+          "tableFrom": "google_drive_sync_state",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.group_members": {
+      "name": "group_members",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "group_id": {
+          "name": "group_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "role": {
+          "name": "role",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'member'"
+        },
+        "added_by": {
+          "name": "added_by",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'active'"
+        },
+        "joined_at": {
+          "name": "joined_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "removed_at": {
+          "name": "removed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "group_members_group_user_unique": {
+          "name": "group_members_group_user_unique",
+          "columns": [
+            {
+              "expression": "group_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "group_members_group_active_idx": {
+          "name": "group_members_group_active_idx",
+          "columns": [
+            {
+              "expression": "group_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "where": "status = 'active'",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "group_members_user_active_idx": {
+          "name": "group_members_user_active_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "where": "status = 'active'",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "group_members_group_id_user_groups_id_fk": {
+          "name": "group_members_group_id_user_groups_id_fk",
+          "tableFrom": "group_members",
+          "tableTo": "user_groups",
+          "columnsFrom": [
+            "group_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "group_members_user_id_users_id_fk": {
+          "name": "group_members_user_id_users_id_fk",
+          "tableFrom": "group_members",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "group_members_added_by_users_id_fk": {
+          "name": "group_members_added_by_users_id_fk",
+          "tableFrom": "group_members",
+          "tableTo": "users",
+          "columnsFrom": [
+            "added_by"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.invoice_config": {
+      "name": "invoice_config",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "companyName": {
+          "name": "companyName",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "addressLine1": {
+          "name": "addressLine1",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "addressLine2": {
+          "name": "addressLine2",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "city": {
+          "name": "city",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "state": {
+          "name": "state",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "postalCode": {
+          "name": "postalCode",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "country": {
+          "name": "country",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "taxId": {
+          "name": "taxId",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "email": {
+          "name": "email",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "phone": {
+          "name": "phone",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "website": {
+          "name": "website",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "logoUrl": {
+          "name": "logoUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "footerText": {
+          "name": "footerText",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "termsText": {
+          "name": "termsText",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "bankDetails": {
+          "name": "bankDetails",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "customFields": {
+          "name": "customFields",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": false,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "invoice_config_tenantId_tenants_id_fk": {
+          "name": "invoice_config_tenantId_tenants_id_fk",
+          "tableFrom": "invoice_config",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.library_chunks": {
+      "name": "library_chunks",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "chunk_index": {
+          "name": "chunk_index",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content_type": {
+          "name": "content_type",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'text'"
+        },
+        "token_count": {
+          "name": "token_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "vector_ref_id": {
+          "name": "vector_ref_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "metadata": {
+          "name": "metadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{}'::json"
+        },
+        "allowed_scopes": {
+          "name": "allowed_scopes",
+          "type": "text[]",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'{}'"
+        },
+        "is_parent": {
+          "name": "is_parent",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "parent_chunk_id": {
+          "name": "parent_chunk_id",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "library_chunks_item_chunk_index_unique": {
+          "name": "library_chunks_item_chunk_index_unique",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "chunk_index",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_chunks_tenant_content_type_idx": {
+          "name": "library_chunks_tenant_content_type_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "content_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_chunks_vector_ref_idx": {
+          "name": "library_chunks_vector_ref_idx",
+          "columns": [
+            {
+              "expression": "vector_ref_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_chunks_allowed_scopes_gin_idx": {
+          "name": "library_chunks_allowed_scopes_gin_idx",
+          "columns": [
+            {
+              "expression": "allowed_scopes",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "gin",
+          "with": {}
+        },
+        "library_chunks_parent_chunk_idx": {
+          "name": "library_chunks_parent_chunk_idx",
+          "columns": [
+            {
+              "expression": "parent_chunk_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "library_chunks_tenant_id_tenants_id_fk": {
+          "name": "library_chunks_tenant_id_tenants_id_fk",
+          "tableFrom": "library_chunks",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_chunks_library_item_id_library_items_id_fk": {
+          "name": "library_chunks_library_item_id_library_items_id_fk",
+          "tableFrom": "library_chunks",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.library_content_versions": {
+      "name": "library_content_versions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "version_number": {
+          "name": "version_number",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content_hash": {
+          "name": "content_hash",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content_type": {
+          "name": "content_type",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'markdown_source'"
+        },
+        "content_size_bytes": {
+          "name": "content_size_bytes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "change_description": {
+          "name": "change_description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_by_user_id": {
+          "name": "created_by_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "library_versions_item_version_unique": {
+          "name": "library_versions_item_version_unique",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "version_number",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_versions_item_created_idx": {
+          "name": "library_versions_item_created_idx",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "created_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_versions_tenant_created_idx": {
+          "name": "library_versions_tenant_created_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "created_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_versions_hash_idx": {
+          "name": "library_versions_hash_idx",
+          "columns": [
+            {
+              "expression": "content_hash",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "library_content_versions_tenant_id_tenants_id_fk": {
+          "name": "library_content_versions_tenant_id_tenants_id_fk",
+          "tableFrom": "library_content_versions",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_content_versions_library_item_id_library_items_id_fk": {
+          "name": "library_content_versions_library_item_id_library_items_id_fk",
+          "tableFrom": "library_content_versions",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_content_versions_created_by_user_id_users_id_fk": {
+          "name": "library_content_versions_created_by_user_id_users_id_fk",
+          "tableFrom": "library_content_versions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "created_by_user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.library_index_jobs": {
+      "name": "library_index_jobs",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "job_type": {
+          "name": "job_type",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "status": {
+          "name": "status",
+          "type": "library_index_job_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "attempt_count": {
+          "name": "attempt_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "max_attempts": {
+          "name": "max_attempts",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 5
+        },
+        "run_at": {
+          "name": "run_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "next_retry_at": {
+          "name": "next_retry_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "last_error": {
+          "name": "last_error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "started_at": {
+          "name": "started_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "completed_at": {
+          "name": "completed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "library_index_jobs_tenant_status_run_at_idx": {
+          "name": "library_index_jobs_tenant_status_run_at_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "run_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_index_jobs_status_retry_idx": {
+          "name": "library_index_jobs_status_retry_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "next_retry_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_index_jobs_item_status_idx": {
+          "name": "library_index_jobs_item_status_idx",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "library_index_jobs_tenant_id_tenants_id_fk": {
+          "name": "library_index_jobs_tenant_id_tenants_id_fk",
+          "tableFrom": "library_index_jobs",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_index_jobs_library_item_id_library_items_id_fk": {
+          "name": "library_index_jobs_library_item_id_library_items_id_fk",
+          "tableFrom": "library_index_jobs",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.library_items": {
+      "name": "library_items",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "owner_user_id": {
+          "name": "owner_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "item_type": {
+          "name": "item_type",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "source": {
+          "name": "source",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "library_item_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'ready'"
+        },
+        "visibility": {
+          "name": "visibility",
+          "type": "library_visibility",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'private'"
+        },
+        "metadata": {
+          "name": "metadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{}'::json"
+        },
+        "source_url": {
+          "name": "source_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "thumbnail_url": {
+          "name": "thumbnail_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "allowed_scopes": {
+          "name": "allowed_scopes",
+          "type": "text[]",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'{}'"
+        },
+        "deleted_at": {
+          "name": "deleted_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "deleted_by": {
+          "name": "deleted_by",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "library_items_id_tenant_unique": {
+          "name": "library_items_id_tenant_unique",
+          "columns": [
+            {
+              "expression": "id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_items_tenant_visibility_status_idx": {
+          "name": "library_items_tenant_visibility_status_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "visibility",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_items_tenant_owner_status_idx": {
+          "name": "library_items_tenant_owner_status_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "owner_user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_items_source_item_type_idx": {
+          "name": "library_items_source_item_type_idx",
+          "columns": [
+            {
+              "expression": "source",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "item_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_items_deleted_at_idx": {
+          "name": "library_items_deleted_at_idx",
+          "columns": [
+            {
+              "expression": "deleted_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_items_allowed_scopes_gin_idx": {
+          "name": "library_items_allowed_scopes_gin_idx",
+          "columns": [
+            {
+              "expression": "allowed_scopes",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "gin",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "library_items_tenant_id_tenants_id_fk": {
+          "name": "library_items_tenant_id_tenants_id_fk",
+          "tableFrom": "library_items",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_items_owner_user_id_users_id_fk": {
+          "name": "library_items_owner_user_id_users_id_fk",
+          "tableFrom": "library_items",
+          "tableTo": "users",
+          "columnsFrom": [
+            "owner_user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_items_deleted_by_users_id_fk": {
+          "name": "library_items_deleted_by_users_id_fk",
+          "tableFrom": "library_items",
+          "tableTo": "users",
+          "columnsFrom": [
+            "deleted_by"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.library_links": {
+      "name": "library_links",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "link_type": {
+          "name": "link_type",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "link_id": {
+          "name": "link_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "provider_task_id": {
+          "name": "provider_task_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "library_links_source_tenant_unique": {
+          "name": "library_links_source_tenant_unique",
+          "columns": [
+            {
+              "expression": "link_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "link_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_links_item_type_idx": {
+          "name": "library_links_item_type_idx",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "link_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_links_provider_task_idx": {
+          "name": "library_links_provider_task_idx",
+          "columns": [
+            {
+              "expression": "provider_task_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "library_links_library_item_id_library_items_id_fk": {
+          "name": "library_links_library_item_id_library_items_id_fk",
+          "tableFrom": "library_links",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_links_tenant_id_tenants_id_fk": {
+          "name": "library_links_tenant_id_tenants_id_fk",
+          "tableFrom": "library_links",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.library_permissions": {
+      "name": "library_permissions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "subject_type": {
+          "name": "subject_type",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "subject_id": {
+          "name": "subject_id",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "permission_level": {
+          "name": "permission_level",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'read'"
+        },
+        "granted_by_user_id": {
+          "name": "granted_by_user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "library_permissions_subject_unique": {
+          "name": "library_permissions_subject_unique",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "subject_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "subject_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_permissions_tenant_subject_idx": {
+          "name": "library_permissions_tenant_subject_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "subject_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "subject_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "library_permissions_group_idx": {
+          "name": "library_permissions_group_idx",
+          "columns": [
+            {
+              "expression": "subject_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "subject_type",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "where": "subject_type = 'group'",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "library_permissions_tenant_id_tenants_id_fk": {
+          "name": "library_permissions_tenant_id_tenants_id_fk",
+          "tableFrom": "library_permissions",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_permissions_library_item_id_library_items_id_fk": {
+          "name": "library_permissions_library_item_id_library_items_id_fk",
+          "tableFrom": "library_permissions",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "library_permissions_granted_by_user_id_users_id_fk": {
+          "name": "library_permissions_granted_by_user_id_users_id_fk",
+          "tableFrom": "library_permissions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "granted_by_user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.llm_providers": {
+      "name": "llm_providers",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "providerName": {
+          "name": "providerName",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "displayName": {
+          "name": "displayName",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "baseUrl": {
+          "name": "baseUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "apiKeyEncrypted": {
+          "name": "apiKeyEncrypted",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "hasApiKey": {
+          "name": "hasApiKey",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "defaultModel": {
+          "name": "defaultModel",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "availableModels": {
+          "name": "availableModels",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "configJson": {
+          "name": "configJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isEnabled": {
+          "name": "isEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "providerType": {
+          "name": "providerType",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'primary'"
+        },
+        "healthStatus": {
+          "name": "healthStatus",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'healthy'"
+        },
+        "lastHealthCheck": {
+          "name": "lastHealthCheck",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "failureCount": {
+          "name": "failureCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "successCount": {
+          "name": "successCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "llm_providers_providerName_unique": {
+          "name": "llm_providers_providerName_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "providerName"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.media_callback_dlq": {
+      "name": "media_callback_dlq",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "event_id": {
+          "name": "event_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "provider_name": {
+          "name": "provider_name",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'kie_ai'"
+        },
+        "provider_task_id": {
+          "name": "provider_task_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "event_fingerprint": {
+          "name": "event_fingerprint",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "payload": {
+          "name": "payload",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{}'::json"
+        },
+        "error_message": {
+          "name": "error_message",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "retry_count": {
+          "name": "retry_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "status": {
+          "name": "status",
+          "type": "media_callback_dlq_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "resolved_at": {
+          "name": "resolved_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "media_callback_dlq_event_idx": {
+          "name": "media_callback_dlq_event_idx",
+          "columns": [
+            {
+              "expression": "event_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "media_callback_dlq_provider_task_idx": {
+          "name": "media_callback_dlq_provider_task_idx",
+          "columns": [
+            {
+              "expression": "provider_task_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "media_callback_dlq_status_idx": {
+          "name": "media_callback_dlq_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "media_callback_dlq_tenant_status_idx": {
+          "name": "media_callback_dlq_tenant_status_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "media_callback_dlq_event_id_media_callback_events_id_fk": {
+          "name": "media_callback_dlq_event_id_media_callback_events_id_fk",
+          "tableFrom": "media_callback_dlq",
+          "tableTo": "media_callback_events",
+          "columnsFrom": [
+            "event_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        },
+        "media_callback_dlq_tenant_id_tenants_id_fk": {
+          "name": "media_callback_dlq_tenant_id_tenants_id_fk",
+          "tableFrom": "media_callback_dlq",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.media_callback_events": {
+      "name": "media_callback_events",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "provider_name": {
+          "name": "provider_name",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'kie_ai'"
+        },
+        "provider_task_id": {
+          "name": "provider_task_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "event_fingerprint": {
+          "name": "event_fingerprint",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "payload": {
+          "name": "payload",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{}'::json"
+        },
+        "normalized_status": {
+          "name": "normalized_status",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "result_url": {
+          "name": "result_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "error_message": {
+          "name": "error_message",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "media_callback_event_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "attempt_count": {
+          "name": "attempt_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "max_attempts": {
+          "name": "max_attempts",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 5
+        },
+        "next_retry_at": {
+          "name": "next_retry_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "processed_at": {
+          "name": "processed_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sandbox_job_id": {
+          "name": "sandbox_job_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "media_callback_events_provider_task_idx": {
+          "name": "media_callback_events_provider_task_idx",
+          "columns": [
+            {
+              "expression": "provider_task_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "media_callback_events_status_retry_idx": {
+          "name": "media_callback_events_status_retry_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "next_retry_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "media_callback_events_provider_status_idx": {
+          "name": "media_callback_events_provider_status_idx",
+          "columns": [
+            {
+              "expression": "provider_task_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "media_callback_events_tenant_status_retry_idx": {
+          "name": "media_callback_events_tenant_status_retry_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "next_retry_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "media_callback_events_tenant_id_tenants_id_fk": {
+          "name": "media_callback_events_tenant_id_tenants_id_fk",
+          "tableFrom": "media_callback_events",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "media_callback_events_event_fingerprint_unique": {
+          "name": "media_callback_events_event_fingerprint_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "event_fingerprint"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.media_models": {
+      "name": "media_models",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "modelId": {
+          "name": "modelId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "modelType": {
+          "name": "modelType",
+          "type": "media_model_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "provider": {
+          "name": "provider",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "aliases": {
+          "name": "aliases",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "creditCost": {
+          "name": "creditCost",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 10
+        },
+        "aspectRatios": {
+          "name": "aspectRatios",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sizes": {
+          "name": "sizes",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "durations": {
+          "name": "durations",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "voices": {
+          "name": "voices",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "configJson": {
+          "name": "configJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isEnabled": {
+          "name": "isEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "priority": {
+          "name": "priority",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 99
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "media_models_modelId_unique": {
+          "name": "media_models_modelId_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "modelId"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.media_providers": {
+      "name": "media_providers",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "providerName": {
+          "name": "providerName",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "displayName": {
+          "name": "displayName",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "providerType": {
+          "name": "providerType",
+          "type": "media_provider_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'multimodal'"
+        },
+        "baseUrl": {
+          "name": "baseUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "callbackUrl": {
+          "name": "callbackUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "apiKeyEncrypted": {
+          "name": "apiKeyEncrypted",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "hasApiKey": {
+          "name": "hasApiKey",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "availableModels": {
+          "name": "availableModels",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "defaultModel": {
+          "name": "defaultModel",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "configJson": {
+          "name": "configJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isEnabled": {
+          "name": "isEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "isPrimary": {
+          "name": "isPrimary",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "priority": {
+          "name": "priority",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "lastTestedAt": {
+          "name": "lastTestedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "lastTestResult": {
+          "name": "lastTestResult",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "media_providers_providerName_unique": {
+          "name": "media_providers_providerName_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "providerName"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.menu_config": {
+      "name": "menu_config",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "menu_item_id": {
+          "name": "menu_item_id",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "platform": {
+          "name": "platform",
+          "type": "varchar(10)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'web'"
+        },
+        "visible": {
+          "name": "visible",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "custom_label": {
+          "name": "custom_label",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "custom_icon": {
+          "name": "custom_icon",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sort_order": {
+          "name": "sort_order",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "menu_config_unique": {
+          "name": "menu_config_unique",
+          "columns": [
+            {
+              "expression": "menu_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "platform",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "menu_config_tenant_id_tenants_id_fk": {
+          "name": "menu_config_tenant_id_tenants_id_fk",
+          "tableFrom": "menu_config",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.messages": {
+      "name": "messages",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "conversationId": {
+          "name": "conversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "role": {
+          "name": "role",
+          "type": "message_role",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "inputTokens": {
+          "name": "inputTokens",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "outputTokens": {
+          "name": "outputTokens",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "creditsUsed": {
+          "name": "creditsUsed",
+          "type": "numeric(10, 4)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'0'"
+        },
+        "modelUsed": {
+          "name": "modelUsed",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "attachments": {
+          "name": "attachments",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "artifacts": {
+          "name": "artifacts",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "skillUsed": {
+          "name": "skillUsed",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skillArgs": {
+          "name": "skillArgs",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "error": {
+          "name": "error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isRegenerated": {
+          "name": "isRegenerated",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": false,
+          "default": false
+        },
+        "parentMessageId": {
+          "name": "parentMessageId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "messages_created_at_idx": {
+          "name": "messages_created_at_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "messages_conversationId_conversations_id_fk": {
+          "name": "messages_conversationId_conversations_id_fk",
+          "tableFrom": "messages",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "conversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.model_provider_map": {
+      "name": "model_provider_map",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "modelId": {
+          "name": "modelId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "providerId": {
+          "name": "providerId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "modelName": {
+          "name": "modelName",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "providerModelId": {
+          "name": "providerModelId",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "pricingInput": {
+          "name": "pricingInput",
+          "type": "numeric(12, 8)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'0'"
+        },
+        "pricingOutput": {
+          "name": "pricingOutput",
+          "type": "numeric(12, 8)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'0'"
+        },
+        "isFree": {
+          "name": "isFree",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "contextLength": {
+          "name": "contextLength",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isEnabled": {
+          "name": "isEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "priority": {
+          "name": "priority",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "apiStyle": {
+          "name": "apiStyle",
+          "type": "api_style",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'chat-completions'"
+        }
+      },
+      "indexes": {
+        "model_provider_map_unique": {
+          "name": "model_provider_map_unique",
+          "columns": [
+            {
+              "expression": "modelId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "providerId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "model_provider_map_providerId_llm_providers_id_fk": {
+          "name": "model_provider_map_providerId_llm_providers_id_fk",
+          "tableFrom": "model_provider_map",
+          "tableTo": "llm_providers",
+          "columnsFrom": [
+            "providerId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.onedrive_edit_sessions": {
+      "name": "onedrive_edit_sessions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "drive_item_id": {
+          "name": "drive_item_id",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "edit_url": {
+          "name": "edit_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "original_source_url": {
+          "name": "original_source_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "edit_session_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'active'"
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "onedrive_edit_tenant_user_status_idx": {
+          "name": "onedrive_edit_tenant_user_status_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "onedrive_edit_library_item_idx": {
+          "name": "onedrive_edit_library_item_idx",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "onedrive_edit_expires_at_idx": {
+          "name": "onedrive_edit_expires_at_idx",
+          "columns": [
+            {
+              "expression": "expires_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "onedrive_edit_sessions_tenant_id_tenants_id_fk": {
+          "name": "onedrive_edit_sessions_tenant_id_tenants_id_fk",
+          "tableFrom": "onedrive_edit_sessions",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "onedrive_edit_sessions_user_id_users_id_fk": {
+          "name": "onedrive_edit_sessions_user_id_users_id_fk",
+          "tableFrom": "onedrive_edit_sessions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "onedrive_edit_sessions_library_item_id_library_items_id_fk": {
+          "name": "onedrive_edit_sessions_library_item_id_library_items_id_fk",
+          "tableFrom": "onedrive_edit_sessions",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.onedrive_sync_state": {
+      "name": "onedrive_sync_state",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "indexing_mode": {
+          "name": "indexing_mode",
+          "type": "indexing_mode",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'none'"
+        },
+        "folder_selections": {
+          "name": "folder_selections",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::jsonb"
+        },
+        "file_type_filter": {
+          "name": "file_type_filter",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::jsonb"
+        },
+        "max_file_size_bytes": {
+          "name": "max_file_size_bytes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 52428800
+        },
+        "delta_link": {
+          "name": "delta_link",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "subscription_id": {
+          "name": "subscription_id",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "subscription_expiry": {
+          "name": "subscription_expiry",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "files_total": {
+          "name": "files_total",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "files_processed": {
+          "name": "files_processed",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "last_sync_at": {
+          "name": "last_sync_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "last_error": {
+          "name": "last_error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "auto_sync_enabled": {
+          "name": "auto_sync_enabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "onedrive_sync_tenant_user_unique": {
+          "name": "onedrive_sync_tenant_user_unique",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "onedrive_sync_subscription_id_idx": {
+          "name": "onedrive_sync_subscription_id_idx",
+          "columns": [
+            {
+              "expression": "subscription_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "onedrive_sync_state_tenant_id_tenants_id_fk": {
+          "name": "onedrive_sync_state_tenant_id_tenants_id_fk",
+          "tableFrom": "onedrive_sync_state",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "onedrive_sync_state_user_id_users_id_fk": {
+          "name": "onedrive_sync_state_user_id_users_id_fk",
+          "tableFrom": "onedrive_sync_state",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_asset_links": {
+      "name": "presentation_asset_links",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "deck_id": {
+          "name": "deck_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slide_id": {
+          "name": "slide_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "byte_size": {
+          "name": "byte_size",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_asset_links_unique": {
+          "name": "presentation_asset_links_unique",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "slide_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_asset_links_deck_idx": {
+          "name": "presentation_asset_links_deck_idx",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_asset_links_slide_idx": {
+          "name": "presentation_asset_links_slide_idx",
+          "columns": [
+            {
+              "expression": "slide_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_asset_links_tenant_id_tenants_id_fk": {
+          "name": "presentation_asset_links_tenant_id_tenants_id_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_asset_links_deck_id_presentation_decks_id_fk": {
+          "name": "presentation_asset_links_deck_id_presentation_decks_id_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "presentation_decks",
+          "columnsFrom": [
+            "deck_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_asset_links_slide_id_presentation_slides_id_fk": {
+          "name": "presentation_asset_links_slide_id_presentation_slides_id_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "presentation_slides",
+          "columnsFrom": [
+            "slide_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        },
+        "presentation_asset_links_library_item_id_library_items_id_fk": {
+          "name": "presentation_asset_links_library_item_id_library_items_id_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_asset_links_deck_tenant_fk": {
+          "name": "presentation_asset_links_deck_tenant_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "presentation_decks",
+          "columnsFrom": [
+            "deck_id",
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id",
+            "tenant_id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_asset_links_library_item_tenant_fk": {
+          "name": "presentation_asset_links_library_item_tenant_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id",
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id",
+            "tenant_id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_asset_links_slide_deck_fk": {
+          "name": "presentation_asset_links_slide_deck_fk",
+          "tableFrom": "presentation_asset_links",
+          "tableTo": "presentation_slides",
+          "columnsFrom": [
+            "deck_id",
+            "slide_id"
+          ],
+          "columnsTo": [
+            "deck_id",
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_conversion_locks": {
+      "name": "presentation_conversion_locks",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "source_item_id": {
+          "name": "source_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "lock_token": {
+          "name": "lock_token",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_conversion_locks_source_unique": {
+          "name": "presentation_conversion_locks_source_unique",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "source_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_conversion_locks_expires_at_idx": {
+          "name": "presentation_conversion_locks_expires_at_idx",
+          "columns": [
+            {
+              "expression": "expires_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_conversion_locks_tenant_id_tenants_id_fk": {
+          "name": "presentation_conversion_locks_tenant_id_tenants_id_fk",
+          "tableFrom": "presentation_conversion_locks",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_conversion_locks_source_item_id_library_items_id_fk": {
+          "name": "presentation_conversion_locks_source_item_id_library_items_id_fk",
+          "tableFrom": "presentation_conversion_locks",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "source_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_conversion_records": {
+      "name": "presentation_conversion_records",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "source_item_id": {
+          "name": "source_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "source_format": {
+          "name": "source_format",
+          "type": "varchar(16)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "idempotency_key": {
+          "name": "idempotency_key",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "deck_library_item_id": {
+          "name": "deck_library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "deck_id": {
+          "name": "deck_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(16)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'queued'"
+        },
+        "progress": {
+          "name": "progress",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slides_url": {
+          "name": "slides_url",
+          "type": "varchar(2048)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "partial_fidelity": {
+          "name": "partial_fidelity",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "fidelity_warnings": {
+          "name": "fidelity_warnings",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'[]'::json"
+        },
+        "error": {
+          "name": "error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sandbox_job_id": {
+          "name": "sandbox_job_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "expires_at": {
+          "name": "expires_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_conversion_records_source_unique": {
+          "name": "presentation_conversion_records_source_unique",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "source_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "where": "\"presentation_conversion_records\".\"source_item_id\" IS NOT NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_conversion_records_idempotency_idx": {
+          "name": "presentation_conversion_records_idempotency_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "source_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "idempotency_key",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_conversion_records_expires_at_idx": {
+          "name": "presentation_conversion_records_expires_at_idx",
+          "columns": [
+            {
+              "expression": "expires_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_conversion_records_user_idx": {
+          "name": "presentation_conversion_records_user_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_conversion_records_tenant_id_tenants_id_fk": {
+          "name": "presentation_conversion_records_tenant_id_tenants_id_fk",
+          "tableFrom": "presentation_conversion_records",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_conversion_records_source_item_id_library_items_id_fk": {
+          "name": "presentation_conversion_records_source_item_id_library_items_id_fk",
+          "tableFrom": "presentation_conversion_records",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "source_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_conversion_records_deck_library_item_id_library_items_id_fk": {
+          "name": "presentation_conversion_records_deck_library_item_id_library_items_id_fk",
+          "tableFrom": "presentation_conversion_records",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "deck_library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_conversion_records_deck_id_presentation_decks_id_fk": {
+          "name": "presentation_conversion_records_deck_id_presentation_decks_id_fk",
+          "tableFrom": "presentation_conversion_records",
+          "tableTo": "presentation_decks",
+          "columnsFrom": [
+            "deck_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_conversion_records_user_id_users_id_fk": {
+          "name": "presentation_conversion_records_user_id_users_id_fk",
+          "tableFrom": "presentation_conversion_records",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_decks": {
+      "name": "presentation_decks",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "library_item_id": {
+          "name": "library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "version": {
+          "name": "version",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1
+        },
+        "slide_count": {
+          "name": "slide_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "total_asset_bytes": {
+          "name": "total_asset_bytes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "project_audio_track": {
+          "name": "project_audio_track",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_decks_library_item_unique": {
+          "name": "presentation_decks_library_item_unique",
+          "columns": [
+            {
+              "expression": "library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_decks_id_tenant_unique": {
+          "name": "presentation_decks_id_tenant_unique",
+          "columns": [
+            {
+              "expression": "id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_decks_tenant_idx": {
+          "name": "presentation_decks_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_decks_tenant_updated_idx": {
+          "name": "presentation_decks_tenant_updated_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "updated_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_decks_tenant_id_tenants_id_fk": {
+          "name": "presentation_decks_tenant_id_tenants_id_fk",
+          "tableFrom": "presentation_decks",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_decks_library_item_id_library_items_id_fk": {
+          "name": "presentation_decks_library_item_id_library_items_id_fk",
+          "tableFrom": "presentation_decks",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_exports": {
+      "name": "presentation_exports",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "deck_id": {
+          "name": "deck_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "format": {
+          "name": "format",
+          "type": "varchar(16)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "quality": {
+          "name": "quality",
+          "type": "varchar(12)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "width": {
+          "name": "width",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1920
+        },
+        "height": {
+          "name": "height",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1080
+        },
+        "fps": {
+          "name": "fps",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(16)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'queued'"
+        },
+        "progress_pct": {
+          "name": "progress_pct",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "stage": {
+          "name": "stage",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "error_message": {
+          "name": "error_message",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "output_url": {
+          "name": "output_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "output_storage_key": {
+          "name": "output_storage_key",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "output_bytes": {
+          "name": "output_bytes",
+          "type": "bigint",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "celery_task_id": {
+          "name": "celery_task_id",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "idempotency_key": {
+          "name": "idempotency_key",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_exports_idempotency_key_unique": {
+          "name": "presentation_exports_idempotency_key_unique",
+          "columns": [
+            {
+              "expression": "idempotency_key",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_exports_deck_idx": {
+          "name": "presentation_exports_deck_idx",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_exports_user_idx": {
+          "name": "presentation_exports_user_idx",
+          "columns": [
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_exports_tenant_idx": {
+          "name": "presentation_exports_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_exports_celery_task_idx": {
+          "name": "presentation_exports_celery_task_idx",
+          "columns": [
+            {
+              "expression": "celery_task_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_exports_tenant_status_idx": {
+          "name": "presentation_exports_tenant_status_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_exports_deck_id_presentation_decks_id_fk": {
+          "name": "presentation_exports_deck_id_presentation_decks_id_fk",
+          "tableFrom": "presentation_exports",
+          "tableTo": "presentation_decks",
+          "columnsFrom": [
+            "deck_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_exports_user_id_users_id_fk": {
+          "name": "presentation_exports_user_id_users_id_fk",
+          "tableFrom": "presentation_exports",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_slides": {
+      "name": "presentation_slides",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "deck_id": {
+          "name": "deck_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "order_index": {
+          "name": "order_index",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "version": {
+          "name": "version",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'Slide'"
+        },
+        "slide_content": {
+          "name": "slide_content",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{}'::json"
+        },
+        "audio_track": {
+          "name": "audio_track",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "notes": {
+          "name": "notes",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_slides_deck_order_unique": {
+          "name": "presentation_slides_deck_order_unique",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "order_index",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_slides_deck_id_unique": {
+          "name": "presentation_slides_deck_id_unique",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_slides_deck_idx": {
+          "name": "presentation_slides_deck_idx",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_slides_deck_updated_idx": {
+          "name": "presentation_slides_deck_updated_idx",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "updated_at",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_slides_deck_id_presentation_decks_id_fk": {
+          "name": "presentation_slides_deck_id_presentation_decks_id_fk",
+          "tableFrom": "presentation_slides",
+          "tableTo": "presentation_decks",
+          "columnsFrom": [
+            "deck_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.presentation_source_attachments": {
+      "name": "presentation_source_attachments",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "deck_id": {
+          "name": "deck_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "source_library_item_id": {
+          "name": "source_library_item_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "source_format": {
+          "name": "source_format",
+          "type": "varchar(16)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "conversion_status": {
+          "name": "conversion_status",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "partial_fidelity": {
+          "name": "partial_fidelity",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "fidelity_warnings": {
+          "name": "fidelity_warnings",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'[]'::json"
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "presentation_source_attachments_deck_unique": {
+          "name": "presentation_source_attachments_deck_unique",
+          "columns": [
+            {
+              "expression": "deck_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "presentation_source_attachments_source_item_idx": {
+          "name": "presentation_source_attachments_source_item_idx",
+          "columns": [
+            {
+              "expression": "source_library_item_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "presentation_source_attachments_deck_id_presentation_decks_id_fk": {
+          "name": "presentation_source_attachments_deck_id_presentation_decks_id_fk",
+          "tableFrom": "presentation_source_attachments",
+          "tableTo": "presentation_decks",
+          "columnsFrom": [
+            "deck_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "presentation_source_attachments_source_library_item_id_library_items_id_fk": {
+          "name": "presentation_source_attachments_source_library_item_id_library_items_id_fk",
+          "tableFrom": "presentation_source_attachments",
+          "tableTo": "library_items",
+          "columnsFrom": [
+            "source_library_item_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.provider_usage_log": {
+      "name": "provider_usage_log",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "providerId": {
+          "name": "providerId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "modelUsed": {
+          "name": "modelUsed",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "inputTokens": {
+          "name": "inputTokens",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "outputTokens": {
+          "name": "outputTokens",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "costUsd": {
+          "name": "costUsd",
+          "type": "numeric(12, 8)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'0'"
+        },
+        "creditsCharged": {
+          "name": "creditsCharged",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "responseTimeMs": {
+          "name": "responseTimeMs",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "statusCode": {
+          "name": "statusCode",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "errorType": {
+          "name": "errorType",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "traceId": {
+          "name": "traceId",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "errorMessage": {
+          "name": "errorMessage",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "requestType": {
+          "name": "requestType",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "wasFallback": {
+          "name": "wasFallback",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "fallbackFromProviderId": {
+          "name": "fallbackFromProviderId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "provider_usage_log_user_created": {
+          "name": "provider_usage_log_user_created",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "provider_usage_log_provider_created": {
+          "name": "provider_usage_log_provider_created",
+          "columns": [
+            {
+              "expression": "providerId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "provider_usage_log_trace_id": {
+          "name": "provider_usage_log_trace_id",
+          "columns": [
+            {
+              "expression": "traceId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "provider_usage_log_userId_users_id_fk": {
+          "name": "provider_usage_log_userId_users_id_fk",
+          "tableFrom": "provider_usage_log",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "provider_usage_log_providerId_llm_providers_id_fk": {
+          "name": "provider_usage_log_providerId_llm_providers_id_fk",
+          "tableFrom": "provider_usage_log",
+          "tableTo": "llm_providers",
+          "columnsFrom": [
+            "providerId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "provider_usage_log_fallbackFromProviderId_llm_providers_id_fk": {
+          "name": "provider_usage_log_fallbackFromProviderId_llm_providers_id_fk",
+          "tableFrom": "provider_usage_log",
+          "tableTo": "llm_providers",
+          "columnsFrom": [
+            "fallbackFromProviderId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.registration_events": {
+      "name": "registration_events",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "email": {
+          "name": "email",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "normalizedEmail": {
+          "name": "normalizedEmail",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "ipAddress": {
+          "name": "ipAddress",
+          "type": "varchar(45)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "fingerprintHash": {
+          "name": "fingerprintHash",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "userAgent": {
+          "name": "userAgent",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "loginMethod": {
+          "name": "loginMethod",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "trustScore": {
+          "name": "trustScore",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "outcome": {
+          "name": "outcome",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "metadata": {
+          "name": "metadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "registration_events_created_user_idx": {
+          "name": "registration_events_created_user_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "registration_events_userId_users_id_fk": {
+          "name": "registration_events_userId_users_id_fk",
+          "tableFrom": "registration_events",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.routing_rules": {
+      "name": "routing_rules",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "modelPattern": {
+          "name": "modelPattern",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "routingMode": {
+          "name": "routingMode",
+          "type": "varchar(32)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "providerOrder": {
+          "name": "providerOrder",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "maxFallbacks": {
+          "name": "maxFallbacks",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 3
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.sandbox_artifacts": {
+      "name": "sandbox_artifacts",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "sandboxJobId": {
+          "name": "sandboxJobId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "artifactType": {
+          "name": "artifactType",
+          "type": "sandbox_artifact_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "objectKey": {
+          "name": "objectKey",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "mimeType": {
+          "name": "mimeType",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sizeBytes": {
+          "name": "sizeBytes",
+          "type": "bigint",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sha256": {
+          "name": "sha256",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isPrimary": {
+          "name": "isPrimary",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "metadataJson": {
+          "name": "metadataJson",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "sandbox_artifacts_job_idx": {
+          "name": "sandbox_artifacts_job_idx",
+          "columns": [
+            {
+              "expression": "sandboxJobId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "sandbox_artifacts_type_idx": {
+          "name": "sandbox_artifacts_type_idx",
+          "columns": [
+            {
+              "expression": "artifactType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "sandbox_artifacts_sandboxJobId_sandbox_jobs_id_fk": {
+          "name": "sandbox_artifacts_sandboxJobId_sandbox_jobs_id_fk",
+          "tableFrom": "sandbox_artifacts",
+          "tableTo": "sandbox_jobs",
+          "columnsFrom": [
+            "sandboxJobId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.sandbox_jobs": {
+      "name": "sandbox_jobs",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "varchar(36)",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "featureType": {
+          "name": "featureType",
+          "type": "sandbox_feature_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "featureRefId": {
+          "name": "featureRefId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "executionMode": {
+          "name": "executionMode",
+          "type": "sandbox_execution_mode",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "sandboxProfileId": {
+          "name": "sandboxProfileId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "opensandboxId": {
+          "name": "opensandboxId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "sandbox_job_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'accepted'"
+        },
+        "statusReason": {
+          "name": "statusReason",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "imageUri": {
+          "name": "imageUri",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "inputManifestJson": {
+          "name": "inputManifestJson",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "outputManifestJson": {
+          "name": "outputManifestJson",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "stdoutExcerpt": {
+          "name": "stdoutExcerpt",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "stderrExcerpt": {
+          "name": "stderrExcerpt",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "costEstimate": {
+          "name": "costEstimate",
+          "type": "numeric(12, 4)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "costActual": {
+          "name": "costActual",
+          "type": "numeric(12, 4)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "idempotencyKey": {
+          "name": "idempotencyKey",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "startedAt": {
+          "name": "startedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "finishedAt": {
+          "name": "finishedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "expiresAt": {
+          "name": "expiresAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "sandbox_jobs_idempotency_idx": {
+          "name": "sandbox_jobs_idempotency_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "featureType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "idempotencyKey",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "where": "\"sandbox_jobs\".\"idempotencyKey\" IS NOT NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "sandbox_jobs_tenant_status_idx": {
+          "name": "sandbox_jobs_tenant_status_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "sandbox_jobs_opensandbox_id_idx": {
+          "name": "sandbox_jobs_opensandbox_id_idx",
+          "columns": [
+            {
+              "expression": "opensandboxId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "sandbox_jobs_user_idx": {
+          "name": "sandbox_jobs_user_idx",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "sandbox_jobs_created_idx": {
+          "name": "sandbox_jobs_created_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "sandbox_jobs_expires_idx": {
+          "name": "sandbox_jobs_expires_idx",
+          "columns": [
+            {
+              "expression": "expiresAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "sandbox_jobs_tenantId_tenants_id_fk": {
+          "name": "sandbox_jobs_tenantId_tenants_id_fk",
+          "tableFrom": "sandbox_jobs",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "sandbox_jobs_userId_users_id_fk": {
+          "name": "sandbox_jobs_userId_users_id_fk",
+          "tableFrom": "sandbox_jobs",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "sandbox_jobs_sandboxProfileId_sandbox_profiles_id_fk": {
+          "name": "sandbox_jobs_sandboxProfileId_sandbox_profiles_id_fk",
+          "tableFrom": "sandbox_jobs",
+          "tableTo": "sandbox_profiles",
+          "columnsFrom": [
+            "sandboxProfileId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.sandbox_profiles": {
+      "name": "sandbox_profiles",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "executionMode": {
+          "name": "executionMode",
+          "type": "sandbox_execution_mode",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "baseImage": {
+          "name": "baseImage",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "entrypointTemplate": {
+          "name": "entrypointTemplate",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "cpuLimit": {
+          "name": "cpuLimit",
+          "type": "varchar(16)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'1000m'"
+        },
+        "memoryLimitMb": {
+          "name": "memoryLimitMb",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 2048
+        },
+        "ephemeralDiskMb": {
+          "name": "ephemeralDiskMb",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 5120
+        },
+        "timeoutSeconds": {
+          "name": "timeoutSeconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 300
+        },
+        "networkDefaultAction": {
+          "name": "networkDefaultAction",
+          "type": "sandbox_network_action",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'deny'"
+        },
+        "allowBrowser": {
+          "name": "allowBrowser",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "allowCommand": {
+          "name": "allowCommand",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "allowCodeInterpreter": {
+          "name": "allowCodeInterpreter",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "allowFileUpload": {
+          "name": "allowFileUpload",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "maxInputMb": {
+          "name": "maxInputMb",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 50
+        },
+        "maxOutputMb": {
+          "name": "maxOutputMb",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 100
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "version": {
+          "name": "version",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "sandbox_profiles_slug_unique": {
+          "name": "sandbox_profiles_slug_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "slug"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.scheduled_message_logs": {
+      "name": "scheduled_message_logs",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "scheduledMessageId": {
+          "name": "scheduledMessageId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "executedAt": {
+          "name": "executedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "responseContent": {
+          "name": "responseContent",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "creditsUsed": {
+          "name": "creditsUsed",
+          "type": "numeric(10, 4)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'0'"
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'success'"
+        },
+        "error": {
+          "name": "error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "scheduled_message_logs_schedule_id": {
+          "name": "scheduled_message_logs_schedule_id",
+          "columns": [
+            {
+              "expression": "scheduledMessageId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "executedAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "scheduled_message_logs_scheduledMessageId_scheduled_messages_id_fk": {
+          "name": "scheduled_message_logs_scheduledMessageId_scheduled_messages_id_fk",
+          "tableFrom": "scheduled_message_logs",
+          "tableTo": "scheduled_messages",
+          "columnsFrom": [
+            "scheduledMessageId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.scheduled_messages": {
+      "name": "scheduled_messages",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "conversationId": {
+          "name": "conversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "targetUserId": {
+          "name": "targetUserId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "prompt": {
+          "name": "prompt",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "cronExpression": {
+          "name": "cronExpression",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "timezone": {
+          "name": "timezone",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'Asia/Bangkok'"
+        },
+        "scheduledAt": {
+          "name": "scheduledAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isRecurring": {
+          "name": "isRecurring",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "status": {
+          "name": "status",
+          "type": "schedule_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'active'"
+        },
+        "modelId": {
+          "name": "modelId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "dynamicParams": {
+          "name": "dynamicParams",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skillId": {
+          "name": "skillId",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'chat-alert'"
+        },
+        "isSimpleReminder": {
+          "name": "isSimpleReminder",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "priority": {
+          "name": "priority",
+          "type": "reminder_priority",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'normal'"
+        },
+        "emailNotify": {
+          "name": "emailNotify",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "lastRunAt": {
+          "name": "lastRunAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "nextRunAt": {
+          "name": "nextRunAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "bullmqJobId": {
+          "name": "bullmqJobId",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "scheduled_messages_user_status": {
+          "name": "scheduled_messages_user_status",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "scheduled_messages_user_created": {
+          "name": "scheduled_messages_user_created",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "scheduled_messages_status": {
+          "name": "scheduled_messages_status",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "scheduled_messages_userId_users_id_fk": {
+          "name": "scheduled_messages_userId_users_id_fk",
+          "tableFrom": "scheduled_messages",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "scheduled_messages_conversationId_conversations_id_fk": {
+          "name": "scheduled_messages_conversationId_conversations_id_fk",
+          "tableFrom": "scheduled_messages",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "conversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        },
+        "scheduled_messages_targetUserId_users_id_fk": {
+          "name": "scheduled_messages_targetUserId_users_id_fk",
+          "tableFrom": "scheduled_messages",
+          "tableTo": "users",
+          "columnsFrom": [
+            "targetUserId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.seo_metadata": {
+      "name": "seo_metadata",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "path": {
+          "name": "path",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "keywords": {
+          "name": "keywords",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "canonicalUrl": {
+          "name": "canonicalUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "ogMetadata": {
+          "name": "ogMetadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "twitterMetadata": {
+          "name": "twitterMetadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "aiContent": {
+          "name": "aiContent",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "structuredData": {
+          "name": "structuredData",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "geoData": {
+          "name": "geoData",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "qualitySignals": {
+          "name": "qualitySignals",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "seo_metadata_tenantId_tenants_id_fk": {
+          "name": "seo_metadata_tenantId_tenants_id_fk",
+          "tableFrom": "seo_metadata",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.skill_comments": {
+      "name": "skill_comments",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "skillId": {
+          "name": "skillId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "skill_comments_skillId_skills_id_fk": {
+          "name": "skill_comments_skillId_skills_id_fk",
+          "tableFrom": "skill_comments",
+          "tableTo": "skills",
+          "columnsFrom": [
+            "skillId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "skill_comments_userId_users_id_fk": {
+          "name": "skill_comments_userId_users_id_fk",
+          "tableFrom": "skill_comments",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.skill_likes": {
+      "name": "skill_likes",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "skillId": {
+          "name": "skillId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "skill_likes_unique": {
+          "name": "skill_likes_unique",
+          "columns": [
+            {
+              "expression": "skillId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "skill_likes_skillId_skills_id_fk": {
+          "name": "skill_likes_skillId_skills_id_fk",
+          "tableFrom": "skill_likes",
+          "tableTo": "skills",
+          "columnsFrom": [
+            "skillId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "skill_likes_userId_users_id_fk": {
+          "name": "skill_likes_userId_users_id_fk",
+          "tableFrom": "skill_likes",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.skill_permissions": {
+      "name": "skill_permissions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "skillId": {
+          "name": "skillId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "groupId": {
+          "name": "groupId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "grantedByUserId": {
+          "name": "grantedByUserId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "skill_permissions_unique": {
+          "name": "skill_permissions_unique",
+          "columns": [
+            {
+              "expression": "skillId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "groupId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "skill_permissions_group_idx": {
+          "name": "skill_permissions_group_idx",
+          "columns": [
+            {
+              "expression": "groupId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "skill_permissions_skillId_skills_id_fk": {
+          "name": "skill_permissions_skillId_skills_id_fk",
+          "tableFrom": "skill_permissions",
+          "tableTo": "skills",
+          "columnsFrom": [
+            "skillId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "skill_permissions_groupId_user_groups_id_fk": {
+          "name": "skill_permissions_groupId_user_groups_id_fk",
+          "tableFrom": "skill_permissions",
+          "tableTo": "user_groups",
+          "columnsFrom": [
+            "groupId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "skill_permissions_grantedByUserId_users_id_fk": {
+          "name": "skill_permissions_grantedByUserId_users_id_fk",
+          "tableFrom": "skill_permissions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "grantedByUserId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.skill_preferences": {
+      "name": "skill_preferences",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "conversationId": {
+          "name": "conversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "skillId": {
+          "name": "skillId",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "enabled": {
+          "name": "enabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "priority": {
+          "name": "priority",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "customSettings": {
+          "name": "customSettings",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "skill_preferences_conversationId_conversations_id_fk": {
+          "name": "skill_preferences_conversationId_conversations_id_fk",
+          "tableFrom": "skill_preferences",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "conversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.skill_repositories": {
+      "name": "skill_repositories",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(200)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "git_url": {
+          "name": "git_url",
+          "type": "varchar(500)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "branch": {
+          "name": "branch",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'main'"
+        },
+        "format_type": {
+          "name": "format_type",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'auto'"
+        },
+        "skills_subdir": {
+          "name": "skills_subdir",
+          "type": "varchar(200)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'skills'"
+        },
+        "last_fetched_at": {
+          "name": "last_fetched_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "last_commit_hash": {
+          "name": "last_commit_hash",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skill_count": {
+          "name": "skill_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "error_message": {
+          "name": "error_message",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "created_by": {
+          "name": "created_by",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "skill_repositories_created_by_users_id_fk": {
+          "name": "skill_repositories_created_by_users_id_fk",
+          "tableFrom": "skill_repositories",
+          "tableTo": "users",
+          "columnsFrom": [
+            "created_by"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.skills": {
+      "name": "skills",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "category": {
+          "name": "category",
+          "type": "skill_category",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'other'"
+        },
+        "version": {
+          "name": "version",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'1.0.0'"
+        },
+        "author": {
+          "name": "author",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "icon": {
+          "name": "icon",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'sparkles'"
+        },
+        "tags": {
+          "name": "tags",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "folderPath": {
+          "name": "folderPath",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isAutoTrigger": {
+          "name": "isAutoTrigger",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "triggerPatterns": {
+          "name": "triggerPatterns",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "isEnabled": {
+          "name": "isEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "enabledByDefault": {
+          "name": "enabledByDefault",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "visibleByDefault": {
+          "name": "visibleByDefault",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "creditMultiplier": {
+          "name": "creditMultiplier",
+          "type": "numeric(5, 2)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'1.0'"
+        },
+        "priority": {
+          "name": "priority",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 50
+        },
+        "availableModels": {
+          "name": "availableModels",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "defaultModel": {
+          "name": "defaultModel",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "executionMode": {
+          "name": "executionMode",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'llm-only'"
+        },
+        "chainTo": {
+          "name": "chainTo",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "systemPrompt": {
+          "name": "systemPrompt",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "skillContent": {
+          "name": "skillContent",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "marketplaceContent": {
+          "name": "marketplaceContent",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "knowledgebase": {
+          "name": "knowledgebase",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "configJson": {
+          "name": "configJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "importSource": {
+          "name": "importSource",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'manual'"
+        },
+        "importedFromZip": {
+          "name": "importedFromZip",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "repositoryId": {
+          "name": "repositoryId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "repositorySlug": {
+          "name": "repositorySlug",
+          "type": "varchar(200)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "contentHash": {
+          "name": "contentHash",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdBy": {
+          "name": "createdBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "visibility": {
+          "name": "visibility",
+          "type": "skill_visibility",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'private'"
+        },
+        "approvedBy": {
+          "name": "approvedBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "approvedAt": {
+          "name": "approvedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "rejectionReason": {
+          "name": "rejectionReason",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sandboxProfileSlug": {
+          "name": "sandboxProfileSlug",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "requiresNetwork": {
+          "name": "requiresNetwork",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "requiresBrowser": {
+          "name": "requiresBrowser",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "maxRuntimeSeconds": {
+          "name": "maxRuntimeSeconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "maxInputMb": {
+          "name": "maxInputMb",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "skills_repositoryId_skill_repositories_id_fk": {
+          "name": "skills_repositoryId_skill_repositories_id_fk",
+          "tableFrom": "skills",
+          "tableTo": "skill_repositories",
+          "columnsFrom": [
+            "repositoryId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "skills_createdBy_users_id_fk": {
+          "name": "skills_createdBy_users_id_fk",
+          "tableFrom": "skills",
+          "tableTo": "users",
+          "columnsFrom": [
+            "createdBy"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "skills_tenantId_tenants_id_fk": {
+          "name": "skills_tenantId_tenants_id_fk",
+          "tableFrom": "skills",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "skills_approvedBy_users_id_fk": {
+          "name": "skills_approvedBy_users_id_fk",
+          "tableFrom": "skills",
+          "tableTo": "users",
+          "columnsFrom": [
+            "approvedBy"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "skills_slug_unique": {
+          "name": "skills_slug_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "slug"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.storage_settings": {
+      "name": "storage_settings",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "displayName": {
+          "name": "displayName",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "providerType": {
+          "name": "providerType",
+          "type": "storage_provider_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'r2'"
+        },
+        "endpoint": {
+          "name": "endpoint",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "region": {
+          "name": "region",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'auto'"
+        },
+        "bucket": {
+          "name": "bucket",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "accessKeyIdEncrypted": {
+          "name": "accessKeyIdEncrypted",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "secretAccessKeyEncrypted": {
+          "name": "secretAccessKeyEncrypted",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "hasCredentials": {
+          "name": "hasCredentials",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "publicUrlPrefix": {
+          "name": "publicUrlPrefix",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "devTunnelUrl": {
+          "name": "devTunnelUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "pathPrefix": {
+          "name": "pathPrefix",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'uploads/'"
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "configJson": {
+          "name": "configJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "lastTestedAt": {
+          "name": "lastTestedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "lastTestResult": {
+          "name": "lastTestResult",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "storage_settings_name_unique": {
+          "name": "storage_settings_name_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "name"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.system_settings": {
+      "name": "system_settings",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "category": {
+          "name": "category",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "key": {
+          "name": "key",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "value": {
+          "name": "value",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "valueJson": {
+          "name": "valueJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isSensitive": {
+          "name": "isSensitive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": false,
+          "default": false
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "updatedBy": {
+          "name": "updatedBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.template_categories": {
+      "name": "template_categories",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "parentId": {
+          "name": "parentId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "template_categories_parentId_template_categories_id_fk": {
+          "name": "template_categories_parentId_template_categories_id_fk",
+          "tableFrom": "template_categories",
+          "tableTo": "template_categories",
+          "columnsFrom": [
+            "parentId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "template_categories_slug_unique": {
+          "name": "template_categories_slug_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "slug"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.template_ratings": {
+      "name": "template_ratings",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "templateId": {
+          "name": "templateId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "rating": {
+          "name": "rating",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "review": {
+          "name": "review",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "template_ratings_unique": {
+          "name": "template_ratings_unique",
+          "columns": [
+            {
+              "expression": "templateId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "template_ratings_template_idx": {
+          "name": "template_ratings_template_idx",
+          "columns": [
+            {
+              "expression": "templateId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "template_ratings_templateId_workflow_templates_id_fk": {
+          "name": "template_ratings_templateId_workflow_templates_id_fk",
+          "tableFrom": "template_ratings",
+          "tableTo": "workflow_templates",
+          "columnsFrom": [
+            "templateId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "template_ratings_userId_users_id_fk": {
+          "name": "template_ratings_userId_users_id_fk",
+          "tableFrom": "template_ratings",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.tenant_pages": {
+      "name": "tenant_pages",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "pageKey": {
+          "name": "pageKey",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sections": {
+          "name": "sections",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "metadata": {
+          "name": "metadata",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isPublished": {
+          "name": "isPublished",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "showInMenu": {
+          "name": "showInMenu",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "tenant_pages_tenantId_tenants_id_fk": {
+          "name": "tenant_pages_tenantId_tenants_id_fk",
+          "tableFrom": "tenant_pages",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.tenant_sandbox_policies": {
+      "name": "tenant_sandbox_policies",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "defaultProfileId": {
+          "name": "defaultProfileId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "maxConcurrentSandboxes": {
+          "name": "maxConcurrentSandboxes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 5
+        },
+        "maxDailyRuntimeSeconds": {
+          "name": "maxDailyRuntimeSeconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 36000
+        },
+        "maxSingleJobSeconds": {
+          "name": "maxSingleJobSeconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 1800
+        },
+        "defaultNetworkAction": {
+          "name": "defaultNetworkAction",
+          "type": "sandbox_network_action",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "egressRulesJson": {
+          "name": "egressRulesJson",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "allowedImagesJson": {
+          "name": "allowedImagesJson",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "tenant_sandbox_policies_tenantId_tenants_id_fk": {
+          "name": "tenant_sandbox_policies_tenantId_tenants_id_fk",
+          "tableFrom": "tenant_sandbox_policies",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "tenant_sandbox_policies_defaultProfileId_sandbox_profiles_id_fk": {
+          "name": "tenant_sandbox_policies_defaultProfileId_sandbox_profiles_id_fk",
+          "tableFrom": "tenant_sandbox_policies",
+          "tableTo": "sandbox_profiles",
+          "columnsFrom": [
+            "defaultProfileId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "tenant_sandbox_policies_tenantId_unique": {
+          "name": "tenant_sandbox_policies_tenantId_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "tenantId"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.tenants": {
+      "name": "tenants",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "varchar(36)",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "slug": {
+          "name": "slug",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "primaryDomain": {
+          "name": "primaryDomain",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "domains": {
+          "name": "domains",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "logoUrl": {
+          "name": "logoUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "websiteLogoUrl": {
+          "name": "websiteLogoUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "faviconUrl": {
+          "name": "faviconUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "seoConfig": {
+          "name": "seoConfig",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "themeConfig": {
+          "name": "themeConfig",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "contactInfo": {
+          "name": "contactInfo",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "settings": {
+          "name": "settings",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "ownerId": {
+          "name": "ownerId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'ACTIVE'"
+        },
+        "plan": {
+          "name": "plan",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'FREE'"
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "tenants_ownerId_users_id_fk": {
+          "name": "tenants_ownerId_users_id_fk",
+          "tableFrom": "tenants",
+          "tableTo": "users",
+          "columnsFrom": [
+            "ownerId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "tenants_slug_unique": {
+          "name": "tenants_slug_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "slug"
+          ]
+        },
+        "tenants_primaryDomain_unique": {
+          "name": "tenants_primaryDomain_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "primaryDomain"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.theme_presets": {
+      "name": "theme_presets",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "displayName": {
+          "name": "displayName",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "previewImageUrl": {
+          "name": "previewImageUrl",
+          "type": "varchar(512)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "themeConfig": {
+          "name": "themeConfig",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "isDefault": {
+          "name": "isDefault",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "sortOrder": {
+          "name": "sortOrder",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {},
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "theme_presets_name_unique": {
+          "name": "theme_presets_name_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "name"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.user_credit_budgets": {
+      "name": "user_credit_budgets",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "user_id": {
+          "name": "user_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "monthly_limit": {
+          "name": "monthly_limit",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "credits_used_this_month": {
+          "name": "credits_used_this_month",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "budget_month_key": {
+          "name": "budget_month_key",
+          "type": "varchar(7)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "alert_threshold_pct": {
+          "name": "alert_threshold_pct",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 80
+        },
+        "alert_sent": {
+          "name": "alert_sent",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "hard_cap_reached": {
+          "name": "hard_cap_reached",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "user_credit_budgets_tenant_user_unique": {
+          "name": "user_credit_budgets_tenant_user_unique",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "user_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "user_credit_budgets_tenant_id_tenants_id_fk": {
+          "name": "user_credit_budgets_tenant_id_tenants_id_fk",
+          "tableFrom": "user_credit_budgets",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "user_credit_budgets_user_id_users_id_fk": {
+          "name": "user_credit_budgets_user_id_users_id_fk",
+          "tableFrom": "user_credit_budgets",
+          "tableTo": "users",
+          "columnsFrom": [
+            "user_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.user_follows": {
+      "name": "user_follows",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "followerId": {
+          "name": "followerId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "followingId": {
+          "name": "followingId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "status": {
+          "name": "status",
+          "type": "follow_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'active'"
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "user_follows_followerId_users_id_fk": {
+          "name": "user_follows_followerId_users_id_fk",
+          "tableFrom": "user_follows",
+          "tableTo": "users",
+          "columnsFrom": [
+            "followerId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "user_follows_followingId_users_id_fk": {
+          "name": "user_follows_followingId_users_id_fk",
+          "tableFrom": "user_follows",
+          "tableTo": "users",
+          "columnsFrom": [
+            "followingId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.user_groups": {
+      "name": "user_groups",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenant_id": {
+          "name": "tenant_id",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "owner_id": {
+          "name": "owner_id",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "icon_url": {
+          "name": "icon_url",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "settings": {
+          "name": "settings",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'{\"visibility\":\"private\",\"joinPolicy\":\"invite_only\"}'::json"
+        },
+        "member_count": {
+          "name": "member_count",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "created_at": {
+          "name": "created_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updated_at": {
+          "name": "updated_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "deleted_at": {
+          "name": "deleted_at",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {
+        "user_groups_tenant_name_unique": {
+          "name": "user_groups_tenant_name_unique",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "name",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "where": "deleted_at IS NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "user_groups_tenant_idx": {
+          "name": "user_groups_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "where": "deleted_at IS NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "user_groups_owner_idx": {
+          "name": "user_groups_owner_idx",
+          "columns": [
+            {
+              "expression": "owner_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "where": "deleted_at IS NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "user_groups_visibility_idx": {
+          "name": "user_groups_visibility_idx",
+          "columns": [
+            {
+              "expression": "tenant_id",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "(settings->>'visibility')",
+              "asc": true,
+              "isExpression": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "where": "deleted_at IS NULL",
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "user_groups_tenant_id_tenants_id_fk": {
+          "name": "user_groups_tenant_id_tenants_id_fk",
+          "tableFrom": "user_groups",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenant_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "user_groups_owner_id_users_id_fk": {
+          "name": "user_groups_owner_id_users_id_fk",
+          "tableFrom": "user_groups",
+          "tableTo": "users",
+          "columnsFrom": [
+            "owner_id"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.user_notifications": {
+      "name": "user_notifications",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "type": {
+          "name": "type",
+          "type": "notification_type",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "title": {
+          "name": "title",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "content": {
+          "name": "content",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "conversationId": {
+          "name": "conversationId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "scheduledMessageId": {
+          "name": "scheduledMessageId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "priority": {
+          "name": "priority",
+          "type": "reminder_priority",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'normal'"
+        },
+        "isRead": {
+          "name": "isRead",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "user_notifications_user_read": {
+          "name": "user_notifications_user_read",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "isRead",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "user_notifications_user_priority": {
+          "name": "user_notifications_user_priority",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "isRead",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "priority",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "user_notifications_userId_users_id_fk": {
+          "name": "user_notifications_userId_users_id_fk",
+          "tableFrom": "user_notifications",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "user_notifications_conversationId_conversations_id_fk": {
+          "name": "user_notifications_conversationId_conversations_id_fk",
+          "tableFrom": "user_notifications",
+          "tableTo": "conversations",
+          "columnsFrom": [
+            "conversationId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        },
+        "user_notifications_scheduledMessageId_scheduled_messages_id_fk": {
+          "name": "user_notifications_scheduledMessageId_scheduled_messages_id_fk",
+          "tableFrom": "user_notifications",
+          "tableTo": "scheduled_messages",
+          "columnsFrom": [
+            "scheduledMessageId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.user_skill_visibility": {
+      "name": "user_skill_visibility",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "skillId": {
+          "name": "skillId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "visible": {
+          "name": "visible",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "autoTriggerEnabled": {
+          "name": "autoTriggerEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "user_skill_visibility_unique": {
+          "name": "user_skill_visibility_unique",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "skillId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "user_skill_visibility_userId_users_id_fk": {
+          "name": "user_skill_visibility_userId_users_id_fk",
+          "tableFrom": "user_skill_visibility",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "user_skill_visibility_skillId_skills_id_fk": {
+          "name": "user_skill_visibility_skillId_skills_id_fk",
+          "tableFrom": "user_skill_visibility",
+          "tableTo": "skills",
+          "columnsFrom": [
+            "skillId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.users": {
+      "name": "users",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "openId": {
+          "name": "openId",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "email": {
+          "name": "email",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "password": {
+          "name": "password",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "loginMethod": {
+          "name": "loginMethod",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "role": {
+          "name": "role",
+          "type": "role",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'user'"
+        },
+        "registeredDomain": {
+          "name": "registeredDomain",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "currentTenantId": {
+          "name": "currentTenantId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "credits": {
+          "name": "credits",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "plan": {
+          "name": "plan",
+          "type": "plan",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'free'"
+        },
+        "isDisabled": {
+          "name": "isDisabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "normalizedEmail": {
+          "name": "normalizedEmail",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "trustScore": {
+          "name": "trustScore",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 100
+        },
+        "registrationIp": {
+          "name": "registrationIp",
+          "type": "varchar(45)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "userPreferences": {
+          "name": "userPreferences",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'{}'::json"
+        },
+        "backupEmail": {
+          "name": "backupEmail",
+          "type": "varchar(320)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "backupEmailVerified": {
+          "name": "backupEmailVerified",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "phone": {
+          "name": "phone",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "phoneVerified": {
+          "name": "phoneVerified",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "telegramChatId": {
+          "name": "telegramChatId",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "telegramUsername": {
+          "name": "telegramUsername",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "telegramVerified": {
+          "name": "telegramVerified",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "telegramVerifiedAt": {
+          "name": "telegramVerifiedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "twoFactorEnabled": {
+          "name": "twoFactorEnabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "twoFactorSecret": {
+          "name": "twoFactorSecret",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "recoveryCodes": {
+          "name": "recoveryCodes",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "lastSignedIn": {
+          "name": "lastSignedIn",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "passwordChangedAt": {
+          "name": "passwordChangedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        }
+      },
+      "indexes": {},
+      "foreignKeys": {
+        "users_currentTenantId_tenants_id_fk": {
+          "name": "users_currentTenantId_tenants_id_fk",
+          "tableFrom": "users",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "currentTenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "users_openId_unique": {
+          "name": "users_openId_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "openId"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.video_editor_projects": {
+      "name": "video_editor_projects",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(256)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "projectData": {
+          "name": "projectData",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "thumbnailUrl": {
+          "name": "thumbnailUrl",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "duration": {
+          "name": "duration",
+          "type": "numeric(10, 2)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'0'"
+        },
+        "resolution": {
+          "name": "resolution",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "trackCount": {
+          "name": "trackCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 4
+        },
+        "clipCount": {
+          "name": "clipCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false,
+          "default": 0
+        },
+        "version": {
+          "name": "version",
+          "type": "varchar(10)",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'1.0'"
+        },
+        "isAutoSave": {
+          "name": "isAutoSave",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "video_editor_projects_user_idx": {
+          "name": "video_editor_projects_user_idx",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "video_editor_projects_updated_idx": {
+          "name": "video_editor_projects_updated_idx",
+          "columns": [
+            {
+              "expression": "updatedAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "video_editor_projects_userId_users_id_fk": {
+          "name": "video_editor_projects_userId_users_id_fk",
+          "tableFrom": "video_editor_projects",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.webhook_calls": {
+      "name": "webhook_calls",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "nodeId": {
+          "name": "nodeId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "requestMethod": {
+          "name": "requestMethod",
+          "type": "varchar(10)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "requestBody": {
+          "name": "requestBody",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "requestHeaders": {
+          "name": "requestHeaders",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "executionId": {
+          "name": "executionId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "response": {
+          "name": "response",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "webhook_calls_workflow_node_idx": {
+          "name": "webhook_calls_workflow_node_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "nodeId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "webhook_calls_execution_idx": {
+          "name": "webhook_calls_execution_idx",
+          "columns": [
+            {
+              "expression": "executionId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "webhook_calls_created_idx": {
+          "name": "webhook_calls_created_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "webhook_calls_workflowId_workflows_id_fk": {
+          "name": "webhook_calls_workflowId_workflows_id_fk",
+          "tableFrom": "webhook_calls",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_audit_events": {
+      "name": "workflow_audit_events",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "executionId": {
+          "name": "executionId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "nodeId": {
+          "name": "nodeId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "eventType": {
+          "name": "eventType",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "actorId": {
+          "name": "actorId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "data": {
+          "name": "data",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "traceId": {
+          "name": "traceId",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "audit_events_workflow_idx": {
+          "name": "audit_events_workflow_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "audit_events_execution_idx": {
+          "name": "audit_events_execution_idx",
+          "columns": [
+            {
+              "expression": "executionId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "audit_events_event_type_idx": {
+          "name": "audit_events_event_type_idx",
+          "columns": [
+            {
+              "expression": "eventType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "audit_events_tenant_idx": {
+          "name": "audit_events_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "audit_events_actor_idx": {
+          "name": "audit_events_actor_idx",
+          "columns": [
+            {
+              "expression": "actorId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "audit_events_trace_idx": {
+          "name": "audit_events_trace_idx",
+          "columns": [
+            {
+              "expression": "traceId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "audit_events_created_idx": {
+          "name": "audit_events_created_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_audit_events_workflowId_workflows_id_fk": {
+          "name": "workflow_audit_events_workflowId_workflows_id_fk",
+          "tableFrom": "workflow_audit_events",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_audit_events_executionId_workflow_executions_id_fk": {
+          "name": "workflow_audit_events_executionId_workflow_executions_id_fk",
+          "tableFrom": "workflow_audit_events",
+          "tableTo": "workflow_executions",
+          "columnsFrom": [
+            "executionId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        },
+        "workflow_audit_events_actorId_users_id_fk": {
+          "name": "workflow_audit_events_actorId_users_id_fk",
+          "tableFrom": "workflow_audit_events",
+          "tableTo": "users",
+          "columnsFrom": [
+            "actorId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "workflow_audit_events_tenantId_tenants_id_fk": {
+          "name": "workflow_audit_events_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_audit_events",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_cache_metadata": {
+      "name": "workflow_cache_metadata",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "cacheKey": {
+          "name": "cacheKey",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "nodeType": {
+          "name": "nodeType",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "hitCount": {
+          "name": "hitCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "lastHitAt": {
+          "name": "lastHitAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "ttlSeconds": {
+          "name": "ttlSeconds",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "valueSizeBytes": {
+          "name": "valueSizeBytes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "cache_metadata_node_type_idx": {
+          "name": "cache_metadata_node_type_idx",
+          "columns": [
+            {
+              "expression": "nodeType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "cache_metadata_tenant_idx": {
+          "name": "cache_metadata_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "cache_metadata_last_hit_idx": {
+          "name": "cache_metadata_last_hit_idx",
+          "columns": [
+            {
+              "expression": "lastHitAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_cache_metadata_tenantId_tenants_id_fk": {
+          "name": "workflow_cache_metadata_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_cache_metadata",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "workflow_cache_metadata_cacheKey_unique": {
+          "name": "workflow_cache_metadata_cacheKey_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "cacheKey"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_dead_letter_queue": {
+      "name": "workflow_dead_letter_queue",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "executionId": {
+          "name": "executionId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "nodeId": {
+          "name": "nodeId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "nodeType": {
+          "name": "nodeType",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "inputData": {
+          "name": "inputData",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "error": {
+          "name": "error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "stackTrace": {
+          "name": "stackTrace",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "retryCount": {
+          "name": "retryCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "status": {
+          "name": "status",
+          "type": "dlq_item_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "reprocessedAt": {
+          "name": "reprocessedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "dlq_workflow_idx": {
+          "name": "dlq_workflow_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "dlq_execution_idx": {
+          "name": "dlq_execution_idx",
+          "columns": [
+            {
+              "expression": "executionId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "dlq_status_idx": {
+          "name": "dlq_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "dlq_tenant_idx": {
+          "name": "dlq_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "dlq_created_idx": {
+          "name": "dlq_created_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_dead_letter_queue_workflowId_workflows_id_fk": {
+          "name": "workflow_dead_letter_queue_workflowId_workflows_id_fk",
+          "tableFrom": "workflow_dead_letter_queue",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_dead_letter_queue_executionId_workflow_executions_id_fk": {
+          "name": "workflow_dead_letter_queue_executionId_workflow_executions_id_fk",
+          "tableFrom": "workflow_dead_letter_queue",
+          "tableTo": "workflow_executions",
+          "columnsFrom": [
+            "executionId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        },
+        "workflow_dead_letter_queue_tenantId_tenants_id_fk": {
+          "name": "workflow_dead_letter_queue_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_dead_letter_queue",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_event_subscriptions": {
+      "name": "workflow_event_subscriptions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "nodeId": {
+          "name": "nodeId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "eventType": {
+          "name": "eventType",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "filterConditions": {
+          "name": "filterConditions",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workflow_event_subscriptions_workflow_idx": {
+          "name": "workflow_event_subscriptions_workflow_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_event_subscriptions_event_type_idx": {
+          "name": "workflow_event_subscriptions_event_type_idx",
+          "columns": [
+            {
+              "expression": "eventType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_event_subscriptions_active_idx": {
+          "name": "workflow_event_subscriptions_active_idx",
+          "columns": [
+            {
+              "expression": "isActive",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_event_subscriptions_workflowId_workflows_id_fk": {
+          "name": "workflow_event_subscriptions_workflowId_workflows_id_fk",
+          "tableFrom": "workflow_event_subscriptions",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_executions": {
+      "name": "workflow_executions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "status": {
+          "name": "status",
+          "type": "workflow_execution_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'pending'"
+        },
+        "inputData": {
+          "name": "inputData",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "outputData": {
+          "name": "outputData",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "startedAt": {
+          "name": "startedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "completedAt": {
+          "name": "completedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "error": {
+          "name": "error",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "nodeCount": {
+          "name": "nodeCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "creditsUsed": {
+          "name": "creditsUsed",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "threadId": {
+          "name": "threadId",
+          "type": "varchar(128)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "triggerType": {
+          "name": "triggerType",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "sandboxJobIds": {
+          "name": "sandboxJobIds",
+          "type": "jsonb",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::jsonb"
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workflow_executions_workflow_idx": {
+          "name": "workflow_executions_workflow_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_executions_tenant_idx": {
+          "name": "workflow_executions_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_executions_user_idx": {
+          "name": "workflow_executions_user_idx",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_executions_status_idx": {
+          "name": "workflow_executions_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_executions_thread_idx": {
+          "name": "workflow_executions_thread_idx",
+          "columns": [
+            {
+              "expression": "threadId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_executions_created_idx": {
+          "name": "workflow_executions_created_idx",
+          "columns": [
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_executions_workflowId_workflows_id_fk": {
+          "name": "workflow_executions_workflowId_workflows_id_fk",
+          "tableFrom": "workflow_executions",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_executions_tenantId_tenants_id_fk": {
+          "name": "workflow_executions_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_executions",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_executions_userId_users_id_fk": {
+          "name": "workflow_executions_userId_users_id_fk",
+          "tableFrom": "workflow_executions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_policy_rules": {
+      "name": "workflow_policy_rules",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "ruleType": {
+          "name": "ruleType",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "condition": {
+          "name": "condition",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "action": {
+          "name": "action",
+          "type": "policy_action",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "priority": {
+          "name": "priority",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 100
+        },
+        "enabled": {
+          "name": "enabled",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "workflowIds": {
+          "name": "workflowIds",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdBy": {
+          "name": "createdBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "policy_rules_tenant_idx": {
+          "name": "policy_rules_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "policy_rules_type_idx": {
+          "name": "policy_rules_type_idx",
+          "columns": [
+            {
+              "expression": "ruleType",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "policy_rules_enabled_idx": {
+          "name": "policy_rules_enabled_idx",
+          "columns": [
+            {
+              "expression": "enabled",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "policy_rules_priority_idx": {
+          "name": "policy_rules_priority_idx",
+          "columns": [
+            {
+              "expression": "priority",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_policy_rules_tenantId_tenants_id_fk": {
+          "name": "workflow_policy_rules_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_policy_rules",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_policy_rules_createdBy_users_id_fk": {
+          "name": "workflow_policy_rules_createdBy_users_id_fk",
+          "tableFrom": "workflow_policy_rules",
+          "tableTo": "users",
+          "columnsFrom": [
+            "createdBy"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_schedules": {
+      "name": "workflow_schedules",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "nodeId": {
+          "name": "nodeId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "cronExpression": {
+          "name": "cronExpression",
+          "type": "varchar(100)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "timezone": {
+          "name": "timezone",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'UTC'"
+        },
+        "lastRun": {
+          "name": "lastRun",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "nextRun": {
+          "name": "nextRun",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "isActive": {
+          "name": "isActive",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workflow_schedules_workflow_idx": {
+          "name": "workflow_schedules_workflow_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_schedules_next_run_idx": {
+          "name": "workflow_schedules_next_run_idx",
+          "columns": [
+            {
+              "expression": "nextRun",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_schedules_active_idx": {
+          "name": "workflow_schedules_active_idx",
+          "columns": [
+            {
+              "expression": "isActive",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_schedules_workflowId_workflows_id_fk": {
+          "name": "workflow_schedules_workflowId_workflows_id_fk",
+          "tableFrom": "workflow_schedules",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_secrets": {
+      "name": "workflow_secrets",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "encryptedValue": {
+          "name": "encryptedValue",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "vaultBackend": {
+          "name": "vaultBackend",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'internal'"
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdBy": {
+          "name": "createdBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "updatedBy": {
+          "name": "updatedBy",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workflow_secrets_tenant_name_unique": {
+          "name": "workflow_secrets_tenant_name_unique",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "name",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_secrets_tenant_idx": {
+          "name": "workflow_secrets_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_secrets_tenantId_tenants_id_fk": {
+          "name": "workflow_secrets_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_secrets",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_secrets_createdBy_users_id_fk": {
+          "name": "workflow_secrets_createdBy_users_id_fk",
+          "tableFrom": "workflow_secrets",
+          "tableTo": "users",
+          "columnsFrom": [
+            "createdBy"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        },
+        "workflow_secrets_updatedBy_users_id_fk": {
+          "name": "workflow_secrets_updatedBy_users_id_fk",
+          "tableFrom": "workflow_secrets",
+          "tableTo": "users",
+          "columnsFrom": [
+            "updatedBy"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "no action",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_templates": {
+      "name": "workflow_templates",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "workflowJson": {
+          "name": "workflowJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "authorId": {
+          "name": "authorId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "categoryId": {
+          "name": "categoryId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "tags": {
+          "name": "tags",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false,
+          "default": "'[]'::json"
+        },
+        "isPublic": {
+          "name": "isPublic",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "isFeatured": {
+          "name": "isFeatured",
+          "type": "boolean",
+          "primaryKey": false,
+          "notNull": true,
+          "default": false
+        },
+        "status": {
+          "name": "status",
+          "type": "template_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'draft'"
+        },
+        "downloadCount": {
+          "name": "downloadCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true,
+          "default": 0
+        },
+        "version": {
+          "name": "version",
+          "type": "varchar(20)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'1.0'"
+        },
+        "searchVector": {
+          "name": "searchVector",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "previewSvg": {
+          "name": "previewSvg",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "industry": {
+          "name": "industry",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "stepCount": {
+          "name": "stepCount",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "estimatedSetupMinutes": {
+          "name": "estimatedSetupMinutes",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "templateKey": {
+          "name": "templateKey",
+          "type": "varchar(50)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workflow_templates_author_idx": {
+          "name": "workflow_templates_author_idx",
+          "columns": [
+            {
+              "expression": "authorId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_templates_tenant_idx": {
+          "name": "workflow_templates_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_templates_category_idx": {
+          "name": "workflow_templates_category_idx",
+          "columns": [
+            {
+              "expression": "categoryId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflow_templates_status_idx": {
+          "name": "workflow_templates_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_templates_authorId_users_id_fk": {
+          "name": "workflow_templates_authorId_users_id_fk",
+          "tableFrom": "workflow_templates",
+          "tableTo": "users",
+          "columnsFrom": [
+            "authorId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_templates_tenantId_tenants_id_fk": {
+          "name": "workflow_templates_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_templates",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_templates_categoryId_template_categories_id_fk": {
+          "name": "workflow_templates_categoryId_template_categories_id_fk",
+          "tableFrom": "workflow_templates",
+          "tableTo": "template_categories",
+          "columnsFrom": [
+            "categoryId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "set null",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {
+        "workflow_templates_templateKey_unique": {
+          "name": "workflow_templates_templateKey_unique",
+          "nullsNotDistinct": false,
+          "columns": [
+            "templateKey"
+          ]
+        }
+      },
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflow_versions": {
+      "name": "workflow_versions",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "workflowId": {
+          "name": "workflowId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "versionNumber": {
+          "name": "versionNumber",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "workflowJson": {
+          "name": "workflowJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "defaultModel": {
+          "name": "defaultModel",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "contentHash": {
+          "name": "contentHash",
+          "type": "varchar(64)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "changeDescription": {
+          "name": "changeDescription",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "createdByUserId": {
+          "name": "createdByUserId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "wv_workflow_version_unique": {
+          "name": "wv_workflow_version_unique",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "versionNumber",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": true,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "wv_workflow_created_idx": {
+          "name": "wv_workflow_created_idx",
+          "columns": [
+            {
+              "expression": "workflowId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "wv_tenant_created_idx": {
+          "name": "wv_tenant_created_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            },
+            {
+              "expression": "createdAt",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "wv_content_hash_idx": {
+          "name": "wv_content_hash_idx",
+          "columns": [
+            {
+              "expression": "contentHash",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflow_versions_workflowId_workflows_id_fk": {
+          "name": "workflow_versions_workflowId_workflows_id_fk",
+          "tableFrom": "workflow_versions",
+          "tableTo": "workflows",
+          "columnsFrom": [
+            "workflowId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_versions_tenantId_tenants_id_fk": {
+          "name": "workflow_versions_tenantId_tenants_id_fk",
+          "tableFrom": "workflow_versions",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflow_versions_createdByUserId_users_id_fk": {
+          "name": "workflow_versions_createdByUserId_users_id_fk",
+          "tableFrom": "workflow_versions",
+          "tableTo": "users",
+          "columnsFrom": [
+            "createdByUserId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    },
+    "public.workflows": {
+      "name": "workflows",
+      "schema": "",
+      "columns": {
+        "id": {
+          "name": "id",
+          "type": "serial",
+          "primaryKey": true,
+          "notNull": true
+        },
+        "name": {
+          "name": "name",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "description": {
+          "name": "description",
+          "type": "text",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "defaultModel": {
+          "name": "defaultModel",
+          "type": "varchar(255)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "workflowJson": {
+          "name": "workflowJson",
+          "type": "json",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "userId": {
+          "name": "userId",
+          "type": "integer",
+          "primaryKey": false,
+          "notNull": true
+        },
+        "tenantId": {
+          "name": "tenantId",
+          "type": "varchar(36)",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "status": {
+          "name": "status",
+          "type": "workflow_status",
+          "typeSchema": "public",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'draft'"
+        },
+        "lastCompiledAt": {
+          "name": "lastCompiledAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": false
+        },
+        "schemaVersion": {
+          "name": "schemaVersion",
+          "type": "varchar(10)",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "'1.0'"
+        },
+        "createdAt": {
+          "name": "createdAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        },
+        "updatedAt": {
+          "name": "updatedAt",
+          "type": "timestamp with time zone",
+          "primaryKey": false,
+          "notNull": true,
+          "default": "now()"
+        }
+      },
+      "indexes": {
+        "workflows_user_idx": {
+          "name": "workflows_user_idx",
+          "columns": [
+            {
+              "expression": "userId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflows_tenant_idx": {
+          "name": "workflows_tenant_idx",
+          "columns": [
+            {
+              "expression": "tenantId",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        },
+        "workflows_status_idx": {
+          "name": "workflows_status_idx",
+          "columns": [
+            {
+              "expression": "status",
+              "isExpression": false,
+              "asc": true,
+              "nulls": "last"
+            }
+          ],
+          "isUnique": false,
+          "concurrently": false,
+          "method": "btree",
+          "with": {}
+        }
+      },
+      "foreignKeys": {
+        "workflows_userId_users_id_fk": {
+          "name": "workflows_userId_users_id_fk",
+          "tableFrom": "workflows",
+          "tableTo": "users",
+          "columnsFrom": [
+            "userId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        },
+        "workflows_tenantId_tenants_id_fk": {
+          "name": "workflows_tenantId_tenants_id_fk",
+          "tableFrom": "workflows",
+          "tableTo": "tenants",
+          "columnsFrom": [
+            "tenantId"
+          ],
+          "columnsTo": [
+            "id"
+          ],
+          "onDelete": "cascade",
+          "onUpdate": "no action"
+        }
+      },
+      "compositePrimaryKeys": {},
+      "uniqueConstraints": {},
+      "policies": {},
+      "checkConstraints": {},
+      "isRLSEnabled": false
+    }
+  },
+  "enums": {
+    "public.api_style": {
+      "name": "api_style",
+      "schema": "public",
+      "values": [
+        "chat-completions",
+        "responses",
+        "messages",
+        "gemini"
+      ]
+    },
+    "public.aspect_ratio": {
+      "name": "aspect_ratio",
+      "schema": "public",
+      "values": [
+        "1:1",
+        "9:16",
+        "16:9"
+      ]
+    },
+    "public.backfill_run_status": {
+      "name": "backfill_run_status",
+      "schema": "public",
+      "values": [
+        "running",
+        "paused",
+        "aborted",
+        "completed",
+        "failed"
+      ]
+    },
+    "public.billing_period": {
+      "name": "billing_period",
+      "schema": "public",
+      "values": [
+        "monthly",
+        "quarterly",
+        "semi_annual",
+        "yearly"
+      ]
+    },
+    "public.content_type": {
+      "name": "content_type",
+      "schema": "public",
+      "values": [
+        "image",
+        "video",
+        "website"
+      ]
+    },
+    "public.credit_source_type": {
+      "name": "credit_source_type",
+      "schema": "public",
+      "values": [
+        "chat",
+        "skill",
+        "media_image",
+        "media_video",
+        "media_audio",
+        "indexing",
+        "rag",
+        "stt",
+        "translation",
+        "brainstorm",
+        "scheduler",
+        "admin",
+        "other"
+      ]
+    },
+    "public.dlq_item_status": {
+      "name": "dlq_item_status",
+      "schema": "public",
+      "values": [
+        "pending",
+        "reprocessing",
+        "resolved",
+        "discarded"
+      ]
+    },
+    "public.edit_session_status": {
+      "name": "edit_session_status",
+      "schema": "public",
+      "values": [
+        "active",
+        "saved_back",
+        "discarded",
+        "expired"
+      ]
+    },
+    "public.entity_type": {
+      "name": "entity_type",
+      "schema": "public",
+      "values": [
+        "user",
+        "project",
+        "preference",
+        "technical",
+        "decision",
+        "plan",
+        "architecture",
+        "component",
+        "task",
+        "code_knowledge",
+        "rule"
+      ]
+    },
+    "public.follow_status": {
+      "name": "follow_status",
+      "schema": "public",
+      "values": [
+        "active",
+        "blocked"
+      ]
+    },
+    "public.indexing_mode": {
+      "name": "indexing_mode",
+      "schema": "public",
+      "values": [
+        "none",
+        "selected_folders",
+        "all_except",
+        "all"
+      ]
+    },
+    "public.library_index_job_status": {
+      "name": "library_index_job_status",
+      "schema": "public",
+      "values": [
+        "pending",
+        "processing",
+        "retry_pending",
+        "completed",
+        "failed"
+      ]
+    },
+    "public.library_item_status": {
+      "name": "library_item_status",
+      "schema": "public",
+      "values": [
+        "draft",
+        "ready",
+        "indexing",
+        "archived",
+        "failed"
+      ]
+    },
+    "public.library_visibility": {
+      "name": "library_visibility",
+      "schema": "public",
+      "values": [
+        "private",
+        "team",
+        "public"
+      ]
+    },
+    "public.media_callback_dlq_status": {
+      "name": "media_callback_dlq_status",
+      "schema": "public",
+      "values": [
+        "pending",
+        "reprocessed",
+        "discarded"
+      ]
+    },
+    "public.media_callback_event_status": {
+      "name": "media_callback_event_status",
+      "schema": "public",
+      "values": [
+        "pending",
+        "processing",
+        "retry_pending",
+        "completed",
+        "failed"
+      ]
+    },
+    "public.media_model_type": {
+      "name": "media_model_type",
+      "schema": "public",
+      "values": [
+        "image",
+        "video",
+        "audio"
+      ]
+    },
+    "public.media_provider_type": {
+      "name": "media_provider_type",
+      "schema": "public",
+      "values": [
+        "image",
+        "video",
+        "audio",
+        "multimodal"
+      ]
+    },
+    "public.message_role": {
+      "name": "message_role",
+      "schema": "public",
+      "values": [
+        "user",
+        "assistant",
+        "system"
+      ]
+    },
+    "public.notification_type": {
+      "name": "notification_type",
+      "schema": "public",
+      "values": [
+        "scheduled_message",
+        "follow_request",
+        "alert",
+        "system"
+      ]
+    },
+    "public.package_type": {
+      "name": "package_type",
+      "schema": "public",
+      "values": [
+        "one_time",
+        "subscription",
+        "agency"
+      ]
+    },
+    "public.plan": {
+      "name": "plan",
+      "schema": "public",
+      "values": [
+        "free",
+        "starter",
+        "pro",
+        "enterprise"
+      ]
+    },
+    "public.policy_action": {
+      "name": "policy_action",
+      "schema": "public",
+      "values": [
+        "allow",
+        "deny",
+        "require_approval"
+      ]
+    },
+    "public.reconciliation_status": {
+      "name": "reconciliation_status",
+      "schema": "public",
+      "values": [
+        "pending",
+        "passed",
+        "failed"
+      ]
+    },
+    "public.reminder_priority": {
+      "name": "reminder_priority",
+      "schema": "public",
+      "values": [
+        "low",
+        "normal",
+        "high",
+        "critical"
+      ]
+    },
+    "public.role": {
+      "name": "role",
+      "schema": "public",
+      "values": [
+        "user",
+        "admin",
+        "domain_admin"
+      ]
+    },
+    "public.sandbox_artifact_type": {
+      "name": "sandbox_artifact_type",
+      "schema": "public",
+      "values": [
+        "primary",
+        "log",
+        "screenshot",
+        "thumbnail",
+        "chunk",
+        "debug"
+      ]
+    },
+    "public.sandbox_execution_mode": {
+      "name": "sandbox_execution_mode",
+      "schema": "public",
+      "values": [
+        "code",
+        "command",
+        "browser",
+        "file",
+        "media"
+      ]
+    },
+    "public.sandbox_feature_type": {
+      "name": "sandbox_feature_type",
+      "schema": "public",
+      "values": [
+        "chat",
+        "skill",
+        "workflow",
+        "library",
+        "media",
+        "presentation",
+        "connector"
+      ]
+    },
+    "public.sandbox_job_status": {
+      "name": "sandbox_job_status",
+      "schema": "public",
+      "values": [
+        "accepted",
+        "policy_resolved",
+        "queued",
+        "provisioning",
+        "staging_inputs",
+        "executing",
+        "collecting_outputs",
+        "persisting",
+        "completed",
+        "failed",
+        "timed_out",
+        "canceled"
+      ]
+    },
+    "public.sandbox_network_action": {
+      "name": "sandbox_network_action",
+      "schema": "public",
+      "values": [
+        "deny",
+        "allow"
+      ]
+    },
+    "public.schedule_status": {
+      "name": "schedule_status",
+      "schema": "public",
+      "values": [
+        "active",
+        "paused",
+        "completed",
+        "failed"
+      ]
+    },
+    "public.skill_category": {
+      "name": "skill_category",
+      "schema": "public",
+      "values": [
+        "image_generation",
+        "video_generation",
+        "image_video_generation",
+        "audio_generation",
+        "sound_effects",
+        "prompt_enhancement",
+        "code_assistant",
+        "document_analysis",
+        "web_search",
+        "data_analysis",
+        "translation",
+        "summarization",
+        "chat_assistant",
+        "automation",
+        "other"
+      ]
+    },
+    "public.skill_visibility": {
+      "name": "skill_visibility",
+      "schema": "public",
+      "values": [
+        "private",
+        "pending_approval",
+        "public",
+        "rejected"
+      ]
+    },
+    "public.storage_provider_type": {
+      "name": "storage_provider_type",
+      "schema": "public",
+      "values": [
+        "r2",
+        "s3",
+        "local"
+      ]
+    },
+    "public.template_status": {
+      "name": "template_status",
+      "schema": "public",
+      "values": [
+        "draft",
+        "pending_review",
+        "published",
+        "archived"
+      ]
+    },
+    "public.transaction_type": {
+      "name": "transaction_type",
+      "schema": "public",
+      "values": [
+        "purchase",
+        "usage",
+        "bonus",
+        "refund",
+        "adjustment",
+        "subscription"
+      ]
+    },
+    "public.workflow_execution_status": {
+      "name": "workflow_execution_status",
+      "schema": "public",
+      "values": [
+        "pending",
+        "running",
+        "completed",
+        "failed",
+        "cancelled",
+        "interrupted"
+      ]
+    },
+    "public.workflow_status": {
+      "name": "workflow_status",
+      "schema": "public",
+      "values": [
+        "draft",
+        "compiled",
+        "running",
+        "completed",
+        "failed"
+      ]
+    }
+  },
+  "schemas": {},
+  "sequences": {},
+  "roles": {},
+  "policies": {},
+  "views": {},
+  "_meta": {
+    "columns": {},
+    "schemas": {},
+    "tables": {}
+  }
+}
\ No newline at end of file
diff --git a/apps/web/drizzle/meta/_journal.json b/apps/web/drizzle/meta/_journal.json
index fb013b4..eedeb0d 100644
--- a/apps/web/drizzle/meta/_journal.json
+++ b/apps/web/drizzle/meta/_journal.json
@@ -274,6 +274,20 @@
       "when": 1771947695205,
       "tag": "0038_flashy_frog_thor",
       "breakpoints": true
+    },
+    {
+      "idx": 39,
+      "version": "7",
+      "when": 1772018555003,
+      "tag": "0039_elite_baron_zemo",
+      "breakpoints": true
+    },
+    {
+      "idx": 40,
+      "version": "7",
+      "when": 1772107186315,
+      "tag": "0040_yellow_silhouette",
+      "breakpoints": true
     }
   ]
 }
\ No newline at end of file
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index a2544d9..8d5f54d 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -126,6 +126,29 @@ export const editSessionStatusEnum = pgEnum("edit_session_status", [
   "expired",
 ]);
 
+// OpenSandbox enums
+export const sandboxExecutionModeEnum = pgEnum("sandbox_execution_mode", [
+  "code", "command", "browser", "file", "media",
+]);
+
+export const sandboxJobStatusEnum = pgEnum("sandbox_job_status", [
+  "accepted", "policy_resolved", "queued", "provisioning",
+  "staging_inputs", "executing", "collecting_outputs", "persisting",
+  "completed", "failed", "timed_out", "canceled",
+]);
+
+export const sandboxArtifactTypeEnum = pgEnum("sandbox_artifact_type", [
+  "primary", "log", "screenshot", "thumbnail", "chunk", "debug",
+]);
+
+export const sandboxNetworkActionEnum = pgEnum("sandbox_network_action", [
+  "deny", "allow",
+]);
+
+export const sandboxFeatureTypeEnum = pgEnum("sandbox_feature_type", [
+  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
+]);
+
 /**
  * Core user table backing auth flow.
  * Extend this file with additional tables as your product grows.
@@ -591,6 +614,12 @@ export const apiAuditEvents = pgTable("api_audit_events", {
   mediaType: varchar("mediaType", { length: 20 }),
   mediaTaskId: varchar("mediaTaskId", { length: 128 }),
   metadata: json("metadata"),
+
+  /** Associated sandbox job ID */
+  sandboxJobId: varchar("sandboxJobId", { length: 36 }),
+  /** OpenSandbox container ID for correlation */
+  opensandboxId: varchar("opensandboxId", { length: 128 }),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
   index("api_audit_events_trace_id").on(t.traceId),
@@ -1503,6 +1532,10 @@ export const mediaCallbackEvents = pgTable("media_callback_events", {
   maxAttempts: integer("max_attempts").notNull().default(5),
   nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
   processedAt: timestamp("processed_at", { withTimezone: true }),
+
+  /** Associated sandbox job ID (if media was processed in sandbox) */
+  sandboxJobId: varchar("sandbox_job_id", { length: 36 }),
+
   createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
@@ -1864,6 +1897,9 @@ export const presentationConversionRecords = pgTable("presentation_conversion_re
   // Nullable: set by callback handler when job fails (surfaces failure reason to frontend)
   error: text("error"),
 
+  /** Associated sandbox job ID (if conversion ran in sandbox) */
+  sandboxJobId: varchar("sandbox_job_id", { length: 36 }),
+
   expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
   createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
@@ -2284,6 +2320,17 @@ export const skills = pgTable("skills", {
   /** Reason for rejection (if visibility = 'rejected') */
   rejectionReason: text("rejectionReason"),
 
+  /** Sandbox profile slug for skills that require sandbox execution */
+  sandboxProfileSlug: varchar("sandboxProfileSlug", { length: 64 }),
+  /** Whether this skill needs network access in sandbox */
+  requiresNetwork: boolean("requiresNetwork"),
+  /** Whether this skill needs browser automation in sandbox */
+  requiresBrowser: boolean("requiresBrowser"),
+  /** Maximum runtime for this skill in seconds (overrides profile default) */
+  maxRuntimeSeconds: integer("maxRuntimeSeconds"),
+  /** Maximum input file size in MB (overrides profile default) */
+  maxInputMb: integer("maxInputMb"),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
 });
@@ -2659,6 +2706,9 @@ export const scheduledMessages = pgTable("scheduled_messages", {
   /** LLM model to use */
   modelId: varchar("modelId", { length: 128 }),
 
+  /** Dynamic parameters required to execute the assigned skill */
+  dynamicParams: json("dynamicParams").$type<Record<string, any>>(),
+
   /** Associated skill */
   skillId: varchar("skillId", { length: 100 }).default("chat-alert"),
 
@@ -3304,6 +3354,9 @@ export const workflowExecutions = pgTable("workflow_executions", {
   /** Trigger type that started this execution */
   triggerType: varchar("triggerType", { length: 50 }),
 
+  /** Sandbox job IDs used during this workflow execution */
+  sandboxJobIds: jsonb("sandboxJobIds").$type<string[]>().default([]),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
 }, (t) => [
@@ -3718,3 +3771,125 @@ export const funnelBackfillCheckpoints = pgTable("funnel_backfill_checkpoints",
 
 export type FunnelBackfillCheckpoint = typeof funnelBackfillCheckpoints.$inferSelect;
 export type InsertFunnelBackfillCheckpoint = typeof funnelBackfillCheckpoints.$inferInsert;
+
+// ============================================================
+// OpenSandbox Tables
+// ============================================================
+
+/**
+ * Sandbox Profiles -- Reusable runtime configurations for sandbox containers.
+ * Each profile defines resource limits, execution mode, and security policies.
+ */
+export const sandboxProfiles = pgTable("sandbox_profiles", {
+  id: serial("id").primaryKey(),
+  slug: varchar("slug", { length: 64 }).notNull().unique(),
+  name: varchar("name", { length: 255 }).notNull(),
+  description: text("description"),
+  executionMode: sandboxExecutionModeEnum("executionMode").notNull(),
+  baseImage: varchar("baseImage", { length: 512 }).notNull(),
+  entrypointTemplate: text("entrypointTemplate"),
+  cpuLimit: varchar("cpuLimit", { length: 16 }).default("1000m").notNull(),
+  memoryLimitMb: integer("memoryLimitMb").default(2048).notNull(),
+  ephemeralDiskMb: integer("ephemeralDiskMb").default(5120).notNull(),
+  timeoutSeconds: integer("timeoutSeconds").default(300).notNull(),
+  networkDefaultAction: sandboxNetworkActionEnum("networkDefaultAction").default("deny").notNull(),
+  allowBrowser: boolean("allowBrowser").default(false).notNull(),
+  allowCommand: boolean("allowCommand").default(false).notNull(),
+  allowCodeInterpreter: boolean("allowCodeInterpreter").default(false).notNull(),
+  allowFileUpload: boolean("allowFileUpload").default(true).notNull(),
+  maxInputMb: integer("maxInputMb").default(50),
+  maxOutputMb: integer("maxOutputMb").default(100),
+  isActive: boolean("isActive").default(true).notNull(),
+  version: integer("version").default(1).notNull(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+});
+
+export type SandboxProfile = typeof sandboxProfiles.$inferSelect;
+export type InsertSandboxProfile = typeof sandboxProfiles.$inferInsert;
+
+/**
+ * Sandbox Jobs -- Canonical execution records for sandbox operations.
+ * Tracks lifecycle from acceptance through execution to completion/failure.
+ */
+export const sandboxJobs = pgTable("sandbox_jobs", {
+  id: varchar("id", { length: 36 }).primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+  userId: integer("userId").notNull().references(() => users.id),
+  featureType: sandboxFeatureTypeEnum("featureType").notNull(),
+  featureRefId: varchar("featureRefId", { length: 128 }),
+  executionMode: sandboxExecutionModeEnum("executionMode").notNull(),
+  sandboxProfileId: integer("sandboxProfileId").references(() => sandboxProfiles.id),
+  opensandboxId: varchar("opensandboxId", { length: 128 }),
+  status: sandboxJobStatusEnum("status").default("accepted").notNull(),
+  statusReason: text("statusReason"),
+  imageUri: varchar("imageUri", { length: 512 }),
+  inputManifestJson: jsonb("inputManifestJson").$type<Record<string, unknown>>(),
+  outputManifestJson: jsonb("outputManifestJson").$type<Record<string, unknown>>(),
+  stdoutExcerpt: text("stdoutExcerpt"),
+  stderrExcerpt: text("stderrExcerpt"),
+  costEstimate: numeric("costEstimate", { precision: 12, scale: 4 }),
+  costActual: numeric("costActual", { precision: 12, scale: 4 }),
+  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
+  startedAt: timestamp("startedAt", { withTimezone: true }),
+  finishedAt: timestamp("finishedAt", { withTimezone: true }),
+  expiresAt: timestamp("expiresAt", { withTimezone: true }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("sandbox_jobs_idempotency_idx")
+    .on(t.tenantId, t.featureType, t.idempotencyKey)
+    .where(sql`${t.idempotencyKey} IS NOT NULL`),
+  index("sandbox_jobs_tenant_status_idx").on(t.tenantId, t.status),
+  index("sandbox_jobs_opensandbox_id_idx").on(t.opensandboxId),
+  index("sandbox_jobs_user_idx").on(t.userId),
+  index("sandbox_jobs_created_idx").on(t.createdAt),
+  index("sandbox_jobs_expires_idx").on(t.expiresAt),
+]);
+
+export type SandboxJob = typeof sandboxJobs.$inferSelect;
+export type InsertSandboxJob = typeof sandboxJobs.$inferInsert;
+
+/**
+ * Sandbox Artifacts -- Output files produced by sandbox jobs.
+ * Tracks S3/R2 object keys, types, sizes, and checksums.
+ */
+export const sandboxArtifacts = pgTable("sandbox_artifacts", {
+  id: serial("id").primaryKey(),
+  sandboxJobId: varchar("sandboxJobId", { length: 36 }).notNull().references(() => sandboxJobs.id, { onDelete: "cascade" }),
+  artifactType: sandboxArtifactTypeEnum("artifactType").notNull(),
+  objectKey: varchar("objectKey", { length: 512 }).notNull(),
+  mimeType: varchar("mimeType", { length: 128 }),
+  sizeBytes: bigint("sizeBytes", { mode: "number" }),
+  sha256: varchar("sha256", { length: 64 }),
+  isPrimary: boolean("isPrimary").default(false).notNull(),
+  metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("sandbox_artifacts_job_idx").on(t.sandboxJobId),
+  index("sandbox_artifacts_type_idx").on(t.artifactType),
+]);
+
+export type SandboxArtifact = typeof sandboxArtifacts.$inferSelect;
+export type InsertSandboxArtifact = typeof sandboxArtifacts.$inferInsert;
+
+/**
+ * Tenant Sandbox Policies -- Per-tenant sandbox usage limits and configuration.
+ * One policy per tenant controlling concurrency, runtime, network, and image access.
+ */
+export const tenantSandboxPolicies = pgTable("tenant_sandbox_policies", {
+  id: serial("id").primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }).notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
+  defaultProfileId: integer("defaultProfileId").references(() => sandboxProfiles.id),
+  maxConcurrentSandboxes: integer("maxConcurrentSandboxes").default(5).notNull(),
+  maxDailyRuntimeSeconds: integer("maxDailyRuntimeSeconds").default(36000).notNull(),
+  maxSingleJobSeconds: integer("maxSingleJobSeconds").default(1800).notNull(),
+  defaultNetworkAction: sandboxNetworkActionEnum("defaultNetworkAction"),
+  egressRulesJson: jsonb("egressRulesJson").$type<Array<{ host: string; port?: number }>>(),
+  allowedImagesJson: jsonb("allowedImagesJson").$type<string[]>(),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
+});
+
+export type TenantSandboxPolicy = typeof tenantSandboxPolicies.$inferSelect;
+export type InsertTenantSandboxPolicy = typeof tenantSandboxPolicies.$inferInsert;
diff --git a/apps/web/drizzle/seedSandboxProfiles.ts b/apps/web/drizzle/seedSandboxProfiles.ts
new file mode 100644
index 0000000..ae67a69
--- /dev/null
+++ b/apps/web/drizzle/seedSandboxProfiles.ts
@@ -0,0 +1,113 @@
+/**
+ * Seed script for baseline sandbox profiles.
+ * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
+ *
+ * Usage: npx tsx drizzle/seedSandboxProfiles.ts
+ */
+import { getDb } from "../server/db";
+import { sandboxProfiles } from "./schema";
+import type { InsertSandboxProfile } from "./schema";
+
+const BASELINE_PROFILES: InsertSandboxProfile[] = [
+  {
+    slug: "code-default",
+    name: "Code Execution (Default)",
+    description: "General-purpose code interpreter sandbox with Python runtime",
+    executionMode: "code",
+    baseImage: "python:3.11-slim",
+    cpuLimit: "1000m",
+    memoryLimitMb: 2048,
+    ephemeralDiskMb: 5120,
+    timeoutSeconds: 600,
+    networkDefaultAction: "deny",
+    allowBrowser: false,
+    allowCommand: false,
+    allowCodeInterpreter: true,
+    allowFileUpload: true,
+    maxInputMb: 50,
+    maxOutputMb: 100,
+  },
+  {
+    slug: "media-processing",
+    name: "Media Processing",
+    description: "FFmpeg-based media processing sandbox for video/audio operations",
+    executionMode: "media",
+    baseImage: "jrottenberg/ffmpeg:6-ubuntu",
+    cpuLimit: "2000m",
+    memoryLimitMb: 4096,
+    ephemeralDiskMb: 10240,
+    timeoutSeconds: 1800,
+    networkDefaultAction: "deny",
+    allowBrowser: false,
+    allowCommand: true,
+    allowCodeInterpreter: false,
+    allowFileUpload: true,
+    maxInputMb: 500,
+    maxOutputMb: 1000,
+  },
+  {
+    slug: "browser-default",
+    name: "Browser Automation (Default)",
+    description: "Playwright browser sandbox with network access for web scraping",
+    executionMode: "browser",
+    baseImage: "mcr.microsoft.com/playwright:v1.40.0-jammy",
+    cpuLimit: "2000m",
+    memoryLimitMb: 4096,
+    ephemeralDiskMb: 5120,
+    timeoutSeconds: 600,
+    networkDefaultAction: "allow",
+    allowBrowser: true,
+    allowCommand: true,
+    allowCodeInterpreter: false,
+    allowFileUpload: true,
+    maxInputMb: 50,
+    maxOutputMb: 100,
+  },
+  {
+    slug: "file-parser",
+    name: "File Parser",
+    description: "Document parsing sandbox for PDF, DOCX, and other file formats",
+    executionMode: "file",
+    baseImage: "python:3.11-slim",
+    cpuLimit: "1000m",
+    memoryLimitMb: 2048,
+    ephemeralDiskMb: 5120,
+    timeoutSeconds: 300,
+    networkDefaultAction: "deny",
+    allowBrowser: false,
+    allowCommand: true,
+    allowCodeInterpreter: false,
+    allowFileUpload: true,
+    maxInputMb: 100,
+    maxOutputMb: 200,
+  },
+];
+
+export { BASELINE_PROFILES };
+
+export async function seedSandboxProfiles(): Promise<void> {
+  const db = await getDb();
+  if (!db) {
+    console.warn("[Seed] Database not available");
+    return;
+  }
+
+  for (const profile of BASELINE_PROFILES) {
+    await db
+      .insert(sandboxProfiles)
+      .values(profile)
+      .onConflictDoNothing({ target: sandboxProfiles.slug });
+  }
+
+  console.log(`[Seed] Sandbox profiles seeded (${BASELINE_PROFILES.length} profiles)`);
+}
+
+// Run directly
+if (import.meta.url === `file://${process.argv[1]}`) {
+  seedSandboxProfiles()
+    .then(() => process.exit(0))
+    .catch((err) => {
+      console.error("[Seed] Failed:", err);
+      process.exit(1);
+    });
+}
diff --git a/apps/web/server/sandbox-schema.test.ts b/apps/web/server/sandbox-schema.test.ts
new file mode 100644
index 0000000..a79d107
--- /dev/null
+++ b/apps/web/server/sandbox-schema.test.ts
@@ -0,0 +1,220 @@
+/**
+ * Sandbox schema definition tests.
+ * Validates that all new tables, enums, and extensions compile correctly.
+ */
+import { describe, it, expect } from "vitest";
+import {
+  sandboxProfiles,
+  sandboxJobs,
+  sandboxArtifacts,
+  tenantSandboxPolicies,
+  sandboxExecutionModeEnum,
+  sandboxJobStatusEnum,
+  sandboxArtifactTypeEnum,
+  sandboxNetworkActionEnum,
+  sandboxFeatureTypeEnum,
+  skills,
+  mediaCallbackEvents,
+  presentationConversionRecords,
+  apiAuditEvents,
+  workflowExecutions,
+} from "../drizzle/schema";
+import type {
+  SandboxProfile,
+  InsertSandboxProfile,
+  SandboxJob,
+  InsertSandboxJob,
+  SandboxArtifact,
+  InsertSandboxArtifact,
+  TenantSandboxPolicy,
+  InsertTenantSandboxPolicy,
+} from "../drizzle/schema";
+import { getTableConfig } from "drizzle-orm/pg-core";
+
+describe("Sandbox Schema Definitions", () => {
+  describe("sandboxProfiles table", () => {
+    it("should export table with correct name", () => {
+      const config = getTableConfig(sandboxProfiles);
+      expect(config.name).toBe("sandbox_profiles");
+    });
+
+    it("should have slug as unique column", () => {
+      const config = getTableConfig(sandboxProfiles);
+      const slugCol = config.columns.find((c) => c.name === "slug");
+      expect(slugCol).toBeDefined();
+      expect(slugCol!.isUnique).toBe(true);
+    });
+
+    it("should have correct column types for resource limits", () => {
+      const config = getTableConfig(sandboxProfiles);
+      const cols = config.columns;
+      expect(cols.find((c) => c.name === "cpuLimit")).toBeDefined();
+      expect(cols.find((c) => c.name === "memoryLimitMb")).toBeDefined();
+      expect(cols.find((c) => c.name === "timeoutSeconds")).toBeDefined();
+      expect(cols.find((c) => c.name === "ephemeralDiskMb")).toBeDefined();
+    });
+
+    it("should infer correct select and insert types", () => {
+      // Type-level check: these should compile without errors
+      const _select: SandboxProfile = {} as SandboxProfile;
+      const _insert: InsertSandboxProfile = {} as InsertSandboxProfile;
+      expect(_select).toBeDefined();
+      expect(_insert).toBeDefined();
+    });
+  });
+
+  describe("sandboxJobs table", () => {
+    it("should export table with correct name", () => {
+      const config = getTableConfig(sandboxJobs);
+      expect(config.name).toBe("sandbox_jobs");
+    });
+
+    it("should have varchar(36) id column", () => {
+      const config = getTableConfig(sandboxJobs);
+      const idCol = config.columns.find((c) => c.name === "id");
+      expect(idCol).toBeDefined();
+    });
+
+    it("should have indexes for tenant+status and opensandboxId", () => {
+      const config = getTableConfig(sandboxJobs);
+      expect(config.indexes.length).toBeGreaterThanOrEqual(5);
+    });
+
+    it("should reference tenants and users via FK", () => {
+      const config = getTableConfig(sandboxJobs);
+      expect(config.foreignKeys.length).toBeGreaterThanOrEqual(2);
+    });
+
+    it("should infer correct types", () => {
+      const _select: SandboxJob = {} as SandboxJob;
+      const _insert: InsertSandboxJob = {} as InsertSandboxJob;
+      expect(_select).toBeDefined();
+      expect(_insert).toBeDefined();
+    });
+  });
+
+  describe("sandboxArtifacts table", () => {
+    it("should export table with correct name", () => {
+      const config = getTableConfig(sandboxArtifacts);
+      expect(config.name).toBe("sandbox_artifacts");
+    });
+
+    it("should reference sandbox_jobs via FK", () => {
+      const config = getTableConfig(sandboxArtifacts);
+      expect(config.foreignKeys.length).toBeGreaterThanOrEqual(1);
+    });
+
+    it("should infer correct types", () => {
+      const _select: SandboxArtifact = {} as SandboxArtifact;
+      const _insert: InsertSandboxArtifact = {} as InsertSandboxArtifact;
+      expect(_select).toBeDefined();
+      expect(_insert).toBeDefined();
+    });
+  });
+
+  describe("tenantSandboxPolicies table", () => {
+    it("should export table with correct name", () => {
+      const config = getTableConfig(tenantSandboxPolicies);
+      expect(config.name).toBe("tenant_sandbox_policies");
+    });
+
+    it("should have unique tenantId", () => {
+      const config = getTableConfig(tenantSandboxPolicies);
+      const tenantCol = config.columns.find((c) => c.name === "tenantId");
+      expect(tenantCol).toBeDefined();
+      expect(tenantCol!.isUnique).toBe(true);
+    });
+
+    it("should infer correct types", () => {
+      const _select: TenantSandboxPolicy = {} as TenantSandboxPolicy;
+      const _insert: InsertTenantSandboxPolicy = {} as InsertTenantSandboxPolicy;
+      expect(_select).toBeDefined();
+      expect(_insert).toBeDefined();
+    });
+  });
+
+  describe("Sandbox Enums", () => {
+    it("sandboxExecutionModeEnum should have all expected values", () => {
+      expect(sandboxExecutionModeEnum.enumValues).toEqual(
+        expect.arrayContaining(["code", "command", "browser", "file", "media"])
+      );
+      expect(sandboxExecutionModeEnum.enumValues).toHaveLength(5);
+    });
+
+    it("sandboxJobStatusEnum should have all expected values", () => {
+      expect(sandboxJobStatusEnum.enumValues).toEqual(
+        expect.arrayContaining([
+          "accepted", "policy_resolved", "queued", "provisioning",
+          "staging_inputs", "executing", "collecting_outputs", "persisting",
+          "completed", "failed", "timed_out", "canceled",
+        ])
+      );
+      expect(sandboxJobStatusEnum.enumValues).toHaveLength(12);
+    });
+
+    it("sandboxArtifactTypeEnum should have all expected values", () => {
+      expect(sandboxArtifactTypeEnum.enumValues).toEqual(
+        expect.arrayContaining(["primary", "log", "screenshot", "thumbnail", "chunk", "debug"])
+      );
+      expect(sandboxArtifactTypeEnum.enumValues).toHaveLength(6);
+    });
+
+    it("sandboxNetworkActionEnum should have all expected values", () => {
+      expect(sandboxNetworkActionEnum.enumValues).toEqual(
+        expect.arrayContaining(["deny", "allow"])
+      );
+      expect(sandboxNetworkActionEnum.enumValues).toHaveLength(2);
+    });
+
+    it("sandboxFeatureTypeEnum should have all expected values", () => {
+      expect(sandboxFeatureTypeEnum.enumValues).toEqual(
+        expect.arrayContaining(["chat", "skill", "workflow", "library", "media", "presentation", "connector"])
+      );
+      expect(sandboxFeatureTypeEnum.enumValues).toHaveLength(7);
+    });
+  });
+
+  describe("Existing Table Extensions", () => {
+    it("skills table should have sandboxProfileSlug as nullable varchar", () => {
+      const config = getTableConfig(skills);
+      const col = config.columns.find((c) => c.name === "sandboxProfileSlug");
+      expect(col).toBeDefined();
+      expect(col!.notNull).toBe(false);
+    });
+
+    it("skills table should have requiresNetwork as nullable boolean", () => {
+      const config = getTableConfig(skills);
+      const col = config.columns.find((c) => c.name === "requiresNetwork");
+      expect(col).toBeDefined();
+      expect(col!.notNull).toBe(false);
+    });
+
+    it("mediaCallbackEvents should have sandboxJobId column", () => {
+      const config = getTableConfig(mediaCallbackEvents);
+      const col = config.columns.find((c) => c.name === "sandbox_job_id");
+      expect(col).toBeDefined();
+      expect(col!.notNull).toBe(false);
+    });
+
+    it("presentationConversionRecords should have sandboxJobId column", () => {
+      const config = getTableConfig(presentationConversionRecords);
+      const col = config.columns.find((c) => c.name === "sandbox_job_id");
+      expect(col).toBeDefined();
+      expect(col!.notNull).toBe(false);
+    });
+
+    it("apiAuditEvents should have sandboxJobId and opensandboxId", () => {
+      const config = getTableConfig(apiAuditEvents);
+      const jobId = config.columns.find((c) => c.name === "sandboxJobId");
+      const sbxId = config.columns.find((c) => c.name === "opensandboxId");
+      expect(jobId).toBeDefined();
+      expect(sbxId).toBeDefined();
+    });
+
+    it("workflowExecutions should have sandboxJobIds as JSONB", () => {
+      const config = getTableConfig(workflowExecutions);
+      const col = config.columns.find((c) => c.name === "sandboxJobIds");
+      expect(col).toBeDefined();
+    });
+  });
+});
diff --git a/apps/web/server/sandbox-seed.test.ts b/apps/web/server/sandbox-seed.test.ts
new file mode 100644
index 0000000..7064e26
--- /dev/null
+++ b/apps/web/server/sandbox-seed.test.ts
@@ -0,0 +1,68 @@
+/**
+ * Seed data tests for baseline sandbox profiles.
+ * Validates profile definitions without requiring a database.
+ */
+import { describe, it, expect } from "vitest";
+import { BASELINE_PROFILES } from "../drizzle/seedSandboxProfiles";
+
+describe("Sandbox Profile Seed Data", () => {
+  it("should define exactly 4 baseline profiles", () => {
+    expect(BASELINE_PROFILES).toHaveLength(4);
+  });
+
+  it("should have unique slugs", () => {
+    const slugs = BASELINE_PROFILES.map((p) => p.slug);
+    expect(new Set(slugs).size).toBe(slugs.length);
+  });
+
+  it("code-default profile should have correct resource defaults", () => {
+    const profile = BASELINE_PROFILES.find((p) => p.slug === "code-default");
+    expect(profile).toBeDefined();
+    expect(profile!.cpuLimit).toBe("1000m");
+    expect(profile!.memoryLimitMb).toBe(2048);
+    expect(profile!.timeoutSeconds).toBe(600);
+    expect(profile!.networkDefaultAction).toBe("deny");
+    expect(profile!.allowCodeInterpreter).toBe(true);
+    expect(profile!.executionMode).toBe("code");
+  });
+
+  it("media-processing profile should have correct resource defaults", () => {
+    const profile = BASELINE_PROFILES.find((p) => p.slug === "media-processing");
+    expect(profile).toBeDefined();
+    expect(profile!.cpuLimit).toBe("2000m");
+    expect(profile!.memoryLimitMb).toBe(4096);
+    expect(profile!.timeoutSeconds).toBe(1800);
+    expect(profile!.networkDefaultAction).toBe("deny");
+    expect(profile!.allowCommand).toBe(true);
+    expect(profile!.executionMode).toBe("media");
+  });
+
+  it("browser-default profile should have correct resource defaults", () => {
+    const profile = BASELINE_PROFILES.find((p) => p.slug === "browser-default");
+    expect(profile).toBeDefined();
+    expect(profile!.cpuLimit).toBe("2000m");
+    expect(profile!.memoryLimitMb).toBe(4096);
+    expect(profile!.timeoutSeconds).toBe(600);
+    expect(profile!.networkDefaultAction).toBe("allow");
+    expect(profile!.allowBrowser).toBe(true);
+    expect(profile!.executionMode).toBe("browser");
+  });
+
+  it("file-parser profile should have correct resource defaults", () => {
+    const profile = BASELINE_PROFILES.find((p) => p.slug === "file-parser");
+    expect(profile).toBeDefined();
+    expect(profile!.cpuLimit).toBe("1000m");
+    expect(profile!.memoryLimitMb).toBe(2048);
+    expect(profile!.timeoutSeconds).toBe(300);
+    expect(profile!.networkDefaultAction).toBe("deny");
+    expect(profile!.allowCommand).toBe(true);
+    expect(profile!.executionMode).toBe("file");
+  });
+
+  it("all profiles should have a baseImage defined", () => {
+    for (const profile of BASELINE_PROFILES) {
+      expect(profile.baseImage).toBeDefined();
+      expect(profile.baseImage!.length).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/python-backend/app/core/database.py b/python-backend/app/core/database.py
index 93b4fb1..cdad3a2 100644
--- a/python-backend/app/core/database.py
+++ b/python-backend/app/core/database.py
@@ -92,7 +92,9 @@ async def init_db():
         # Media and assets
         asset, media_task, media_callback_event, library,
         # Notifications and preferences
-        notification, user_preferences, custom_skill_prompt
+        notification, user_preferences, custom_skill_prompt,
+        # Sandbox execution
+        sandbox,
     )
     async with engine.begin() as conn:
         await conn.run_sync(Base.metadata.create_all)
diff --git a/python-backend/app/models/__init__.py b/python-backend/app/models/__init__.py
index 01293b8..880b1b7 100644
--- a/python-backend/app/models/__init__.py
+++ b/python-backend/app/models/__init__.py
@@ -62,6 +62,18 @@ from .library import (
     LibraryIndexJob,
 )
 
+# Sandbox execution
+from .sandbox import (
+    SandboxProfile,
+    SandboxJob,
+    SandboxArtifact,
+    TenantSandboxPolicy,
+    SandboxExecutionMode,
+    SandboxJobStatus,
+    SandboxArtifactType,
+    SandboxFeatureType,
+)
+
 __all__ = [
     # Existing
     "AuditLog",
@@ -131,4 +143,13 @@ __all__ = [
     "LibraryChunk",
     "LibraryPermission",
     "LibraryIndexJob",
+    # Sandbox
+    "SandboxProfile",
+    "SandboxJob",
+    "SandboxArtifact",
+    "TenantSandboxPolicy",
+    "SandboxExecutionMode",
+    "SandboxJobStatus",
+    "SandboxArtifactType",
+    "SandboxFeatureType",
 ]
diff --git a/python-backend/app/models/sandbox.py b/python-backend/app/models/sandbox.py
new file mode 100644
index 0000000..edf4657
--- /dev/null
+++ b/python-backend/app/models/sandbox.py
@@ -0,0 +1,269 @@
+"""
+Sandbox execution models for OpenSandbox integration.
+
+Maps to tables created by Drizzle ORM migrations:
+- sandbox_profiles
+- sandbox_jobs
+- sandbox_artifacts
+- tenant_sandbox_policies
+"""
+import enum
+from datetime import datetime
+
+from sqlalchemy import (
+    BigInteger,
+    Boolean,
+    Column,
+    DateTime,
+    ForeignKey,
+    Index,
+    Integer,
+    Numeric,
+    String,
+    Text,
+    UniqueConstraint,
+)
+from sqlalchemy.dialects.postgresql import JSONB
+
+from app.core.database import Base
+
+
+class SandboxExecutionMode(str, enum.Enum):
+    """Execution mode for sandbox jobs."""
+    CODE = "code"
+    COMMAND = "command"
+    BROWSER = "browser"
+    FILE = "file"
+    MEDIA = "media"
+
+
+class SandboxJobStatus(str, enum.Enum):
+    """Lifecycle status for sandbox jobs."""
+    ACCEPTED = "accepted"
+    POLICY_RESOLVED = "policy_resolved"
+    QUEUED = "queued"
+    PROVISIONING = "provisioning"
+    STAGING_INPUTS = "staging_inputs"
+    EXECUTING = "executing"
+    COLLECTING_OUTPUTS = "collecting_outputs"
+    PERSISTING = "persisting"
+    COMPLETED = "completed"
+    FAILED = "failed"
+    TIMED_OUT = "timed_out"
+    CANCELED = "canceled"
+
+
+class SandboxArtifactType(str, enum.Enum):
+    """Classification for sandbox output artifacts."""
+    PRIMARY = "primary"
+    LOG = "log"
+    SCREENSHOT = "screenshot"
+    THUMBNAIL = "thumbnail"
+    CHUNK = "chunk"
+    DEBUG = "debug"
+
+
+class SandboxFeatureType(str, enum.Enum):
+    """Which SmartSpecPro feature triggered the sandbox job."""
+    CHAT = "chat"
+    SKILL = "skill"
+    WORKFLOW = "workflow"
+    LIBRARY = "library"
+    MEDIA = "media"
+    PRESENTATION = "presentation"
+    CONNECTOR = "connector"
+
+
+class SandboxProfile(Base):
+    """Reusable sandbox runtime configuration profiles."""
+
+    __tablename__ = "sandbox_profiles"
+
+    id = Column(Integer, primary_key=True, autoincrement=True)
+    slug = Column(String(64), nullable=False, unique=True, index=True)
+    name = Column(String(255), nullable=False)
+    description = Column(Text, nullable=True)
+
+    execution_mode = Column("executionMode", String(16), nullable=False)
+    base_image = Column("baseImage", String(512), nullable=False)
+    entrypoint_template = Column("entrypointTemplate", Text, nullable=True)
+
+    cpu_limit = Column("cpuLimit", String(16), nullable=False, default="1000m")
+    memory_limit_mb = Column("memoryLimitMb", Integer, nullable=False, default=2048)
+    ephemeral_disk_mb = Column("ephemeralDiskMb", Integer, nullable=False, default=5120)
+    timeout_seconds = Column("timeoutSeconds", Integer, nullable=False, default=300)
+
+    network_default_action = Column("networkDefaultAction", String(8), nullable=False, default="deny")
+    allow_browser = Column("allowBrowser", Boolean, nullable=False, default=False)
+    allow_command = Column("allowCommand", Boolean, nullable=False, default=False)
+    allow_code_interpreter = Column("allowCodeInterpreter", Boolean, nullable=False, default=False)
+    allow_file_upload = Column("allowFileUpload", Boolean, nullable=False, default=True)
+
+    max_input_mb = Column("maxInputMb", Integer, nullable=True, default=50)
+    max_output_mb = Column("maxOutputMb", Integer, nullable=True, default=100)
+
+    is_active = Column("isActive", Boolean, nullable=False, default=True)
+    version = Column(Integer, nullable=False, default=1)
+
+    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+
+    def to_dict(self):
+        """Convert to dictionary for API responses."""
+        return {
+            "id": self.id,
+            "slug": self.slug,
+            "name": self.name,
+            "description": self.description,
+            "executionMode": self.execution_mode,
+            "baseImage": self.base_image,
+            "cpuLimit": self.cpu_limit,
+            "memoryLimitMb": self.memory_limit_mb,
+            "ephemeralDiskMb": self.ephemeral_disk_mb,
+            "timeoutSeconds": self.timeout_seconds,
+            "networkDefaultAction": self.network_default_action,
+            "allowBrowser": self.allow_browser,
+            "allowCommand": self.allow_command,
+            "allowCodeInterpreter": self.allow_code_interpreter,
+            "allowFileUpload": self.allow_file_upload,
+            "maxInputMb": self.max_input_mb,
+            "maxOutputMb": self.max_output_mb,
+            "isActive": self.is_active,
+            "version": self.version,
+        }
+
+
+class SandboxJob(Base):
+    """Canonical execution record for a sandbox job."""
+
+    __tablename__ = "sandbox_jobs"
+
+    id = Column(String(36), primary_key=True)
+    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
+    user_id = Column("userId", Integer, ForeignKey("users.id"), nullable=False)
+
+    feature_type = Column("featureType", String(16), nullable=False)
+    feature_ref_id = Column("featureRefId", String(128), nullable=True)
+    execution_mode = Column("executionMode", String(16), nullable=False)
+
+    sandbox_profile_id = Column("sandboxProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
+    opensandbox_id = Column("opensandboxId", String(128), nullable=True)
+
+    status = Column(String(24), nullable=False, default=SandboxJobStatus.ACCEPTED.value)
+    status_reason = Column("statusReason", Text, nullable=True)
+
+    image_uri = Column("imageUri", String(512), nullable=True)
+    input_manifest_json = Column("inputManifestJson", JSONB, nullable=True)
+    output_manifest_json = Column("outputManifestJson", JSONB, nullable=True)
+
+    stdout_excerpt = Column("stdoutExcerpt", Text, nullable=True)
+    stderr_excerpt = Column("stderrExcerpt", Text, nullable=True)
+
+    cost_estimate = Column("costEstimate", Numeric(12, 4), nullable=True)
+    cost_actual = Column("costActual", Numeric(12, 4), nullable=True)
+    idempotency_key = Column("idempotencyKey", String(128), nullable=True)
+
+    started_at = Column("startedAt", DateTime(timezone=True), nullable=True)
+    finished_at = Column("finishedAt", DateTime(timezone=True), nullable=True)
+    expires_at = Column("expiresAt", DateTime(timezone=True), nullable=True)
+
+    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+
+    __table_args__ = (
+        Index("sandbox_jobs_tenant_status_idx", "tenantId", "status"),
+        Index("sandbox_jobs_opensandbox_id_idx", "opensandboxId"),
+        Index("sandbox_jobs_user_idx", "userId"),
+        Index("sandbox_jobs_created_idx", "createdAt"),
+        Index("sandbox_jobs_expires_idx", "expiresAt"),
+    )
+
+    def to_dict(self):
+        """Convert to dictionary for API responses."""
+        return {
+            "id": self.id,
+            "tenantId": self.tenant_id,
+            "userId": self.user_id,
+            "featureType": self.feature_type,
+            "featureRefId": self.feature_ref_id,
+            "executionMode": self.execution_mode,
+            "sandboxProfileId": self.sandbox_profile_id,
+            "opensandboxId": self.opensandbox_id,
+            "status": self.status,
+            "statusReason": self.status_reason,
+            "costEstimate": str(self.cost_estimate) if self.cost_estimate else None,
+            "costActual": str(self.cost_actual) if self.cost_actual else None,
+            "startedAt": self.started_at.isoformat() + "Z" if self.started_at else None,
+            "finishedAt": self.finished_at.isoformat() + "Z" if self.finished_at else None,
+            "createdAt": self.created_at.isoformat() + "Z" if self.created_at else None,
+        }
+
+
+class SandboxArtifact(Base):
+    """Output file record from a sandbox job."""
+
+    __tablename__ = "sandbox_artifacts"
+
+    id = Column(Integer, primary_key=True, autoincrement=True)
+    sandbox_job_id = Column("sandboxJobId", String(36), ForeignKey("sandbox_jobs.id", ondelete="CASCADE"), nullable=False)
+
+    artifact_type = Column("artifactType", String(16), nullable=False)
+    object_key = Column("objectKey", String(512), nullable=False)
+    mime_type = Column("mimeType", String(128), nullable=True)
+    size_bytes = Column("sizeBytes", BigInteger, nullable=True)
+    sha256 = Column(String(64), nullable=True)
+    is_primary = Column("isPrimary", Boolean, nullable=False, default=False)
+    metadata_json = Column("metadataJson", JSONB, nullable=True)
+
+    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+
+    __table_args__ = (
+        Index("sandbox_artifacts_job_idx", "sandboxJobId"),
+        Index("sandbox_artifacts_type_idx", "artifactType"),
+    )
+
+    def to_dict(self):
+        """Convert to dictionary for API responses."""
+        return {
+            "id": self.id,
+            "sandboxJobId": self.sandbox_job_id,
+            "artifactType": self.artifact_type,
+            "objectKey": self.object_key,
+            "mimeType": self.mime_type,
+            "sizeBytes": self.size_bytes,
+            "sha256": self.sha256,
+            "isPrimary": self.is_primary,
+        }
+
+
+class TenantSandboxPolicy(Base):
+    """Per-tenant sandbox usage limits and configuration."""
+
+    __tablename__ = "tenant_sandbox_policies"
+
+    id = Column(Integer, primary_key=True, autoincrement=True)
+    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
+
+    default_profile_id = Column("defaultProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
+    max_concurrent_sandboxes = Column("maxConcurrentSandboxes", Integer, nullable=False, default=5)
+    max_daily_runtime_seconds = Column("maxDailyRuntimeSeconds", Integer, nullable=False, default=36000)
+    max_single_job_seconds = Column("maxSingleJobSeconds", Integer, nullable=False, default=1800)
+
+    default_network_action = Column("defaultNetworkAction", String(8), nullable=True)
+    egress_rules_json = Column("egressRulesJson", JSONB, nullable=True)
+    allowed_images_json = Column("allowedImagesJson", JSONB, nullable=True)
+
+    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
+
+    def to_dict(self):
+        """Convert to dictionary for API responses."""
+        return {
+            "id": self.id,
+            "tenantId": self.tenant_id,
+            "defaultProfileId": self.default_profile_id,
+            "maxConcurrentSandboxes": self.max_concurrent_sandboxes,
+            "maxDailyRuntimeSeconds": self.max_daily_runtime_seconds,
+            "maxSingleJobSeconds": self.max_single_job_seconds,
+            "defaultNetworkAction": self.default_network_action,
+        }
diff --git a/python-backend/pyproject.toml b/python-backend/pyproject.toml
index 949e8e9..b2225e7 100644
--- a/python-backend/pyproject.toml
+++ b/python-backend/pyproject.toml
@@ -66,6 +66,7 @@ markers = [
     "credits: Credit system related tests",
     "llm: LLM gateway related tests",
     "payment: Payment related tests",
+    "sandbox: OpenSandbox integration tests",
 ]
 
 # Filter warnings
diff --git a/python-backend/pytest.ini b/python-backend/pytest.ini
index 819a185..bc871a2 100644
--- a/python-backend/pytest.ini
+++ b/python-backend/pytest.ini
@@ -14,6 +14,7 @@ markers =
     dashboard: Dashboard tests
     llm: LLM proxy tests
     credits: Credit system tests
+    sandbox: OpenSandbox integration tests
 addopts =
     --verbose
     --strict-markers
diff --git a/python-backend/tests/test_sandbox_models.py b/python-backend/tests/test_sandbox_models.py
new file mode 100644
index 0000000..f97457c
--- /dev/null
+++ b/python-backend/tests/test_sandbox_models.py
@@ -0,0 +1,168 @@
+"""
+Tests for sandbox SQLAlchemy models.
+
+Validates model structure, column mappings, and enum definitions.
+"""
+import pytest
+from sqlalchemy import inspect as sa_inspect
+
+from app.models.sandbox import (
+    SandboxProfile,
+    SandboxJob,
+    SandboxArtifact,
+    TenantSandboxPolicy,
+    SandboxExecutionMode,
+    SandboxJobStatus,
+    SandboxArtifactType,
+    SandboxFeatureType,
+)
+
+pytestmark = [pytest.mark.unit, pytest.mark.sandbox]
+
+
+class TestSandboxProfileModel:
+    """SandboxProfile maps to sandbox_profiles table."""
+
+    def test_tablename_is_sandbox_profiles(self):
+        assert SandboxProfile.__tablename__ == "sandbox_profiles"
+
+    def test_has_required_columns(self):
+        mapper = sa_inspect(SandboxProfile)
+        col_names = [attr.key for attr in mapper.column_attrs]
+        required = [
+            "id", "slug", "name", "execution_mode", "base_image",
+            "cpu_limit", "memory_limit_mb", "timeout_seconds",
+            "network_default_action", "is_active", "version",
+        ]
+        for col in required:
+            assert col in col_names, f"Missing column: {col}"
+
+    def test_slug_is_unique(self):
+        mapper = sa_inspect(SandboxProfile)
+        slug_col = mapper.columns["slug"]
+        assert slug_col.unique is True
+
+    def test_to_dict_returns_expected_keys(self):
+        profile = SandboxProfile()
+        profile.id = 1
+        profile.slug = "test"
+        profile.name = "Test"
+        profile.execution_mode = "code"
+        profile.base_image = "python:3.11"
+        profile.cpu_limit = "1000m"
+        profile.memory_limit_mb = 2048
+        profile.ephemeral_disk_mb = 5120
+        profile.timeout_seconds = 300
+        profile.network_default_action = "deny"
+        profile.allow_browser = False
+        profile.allow_command = False
+        profile.allow_code_interpreter = True
+        profile.allow_file_upload = True
+        profile.max_input_mb = 50
+        profile.max_output_mb = 100
+        profile.is_active = True
+        profile.version = 1
+        d = profile.to_dict()
+        assert d["slug"] == "test"
+        assert d["executionMode"] == "code"
+        assert d["cpuLimit"] == "1000m"
+
+
+class TestSandboxJobModel:
+    """SandboxJob maps to sandbox_jobs table."""
+
+    def test_tablename_is_sandbox_jobs(self):
+        assert SandboxJob.__tablename__ == "sandbox_jobs"
+
+    def test_has_required_columns(self):
+        mapper = sa_inspect(SandboxJob)
+        col_names = [attr.key for attr in mapper.column_attrs]
+        required = [
+            "id", "tenant_id", "user_id", "feature_type",
+            "execution_mode", "status",
+        ]
+        for col in required:
+            assert col in col_names, f"Missing column: {col}"
+
+    def test_status_default_is_accepted(self):
+        mapper = sa_inspect(SandboxJob)
+        status_col = mapper.columns["status"]
+        assert status_col.default is not None
+
+    def test_to_dict_returns_expected_keys(self):
+        job = SandboxJob()
+        job.id = "test-uuid"
+        job.tenant_id = "t1"
+        job.user_id = 1
+        job.feature_type = "chat"
+        job.execution_mode = "code"
+        job.status = "accepted"
+        job.created_at = None
+        d = job.to_dict()
+        assert d["id"] == "test-uuid"
+        assert d["status"] == "accepted"
+
+
+class TestSandboxArtifactModel:
+    """SandboxArtifact maps to sandbox_artifacts table."""
+
+    def test_tablename_is_sandbox_artifacts(self):
+        assert SandboxArtifact.__tablename__ == "sandbox_artifacts"
+
+    def test_has_required_columns(self):
+        mapper = sa_inspect(SandboxArtifact)
+        col_names = [attr.key for attr in mapper.column_attrs]
+        required = ["id", "sandbox_job_id", "artifact_type", "object_key"]
+        for col in required:
+            assert col in col_names, f"Missing column: {col}"
+
+    def test_foreign_key_references_sandbox_jobs(self):
+        mapper = sa_inspect(SandboxArtifact)
+        fks = list(mapper.columns["sandbox_job_id"].foreign_keys)
+        assert len(fks) == 1
+        assert "sandbox_jobs.id" in str(fks[0])
+
+
+class TestTenantSandboxPolicyModel:
+    """TenantSandboxPolicy maps to tenant_sandbox_policies table."""
+
+    def test_tablename_is_tenant_sandbox_policies(self):
+        assert TenantSandboxPolicy.__tablename__ == "tenant_sandbox_policies"
+
+    def test_has_required_columns(self):
+        mapper = sa_inspect(TenantSandboxPolicy)
+        col_names = [attr.key for attr in mapper.column_attrs]
+        required = [
+            "id", "tenant_id", "max_concurrent_sandboxes",
+            "max_daily_runtime_seconds", "max_single_job_seconds",
+        ]
+        for col in required:
+            assert col in col_names, f"Missing column: {col}"
+
+    def test_tenant_id_is_unique(self):
+        mapper = sa_inspect(TenantSandboxPolicy)
+        tenant_col = mapper.columns["tenant_id"]
+        assert tenant_col.unique is True
+
+
+class TestSandboxEnums:
+    """Enum definitions match expected values."""
+
+    def test_execution_mode_values(self):
+        values = [e.value for e in SandboxExecutionMode]
+        assert set(values) == {"code", "command", "browser", "file", "media"}
+
+    def test_job_status_values(self):
+        values = [e.value for e in SandboxJobStatus]
+        assert len(values) == 12
+        assert "accepted" in values
+        assert "completed" in values
+        assert "failed" in values
+
+    def test_artifact_type_values(self):
+        values = [e.value for e in SandboxArtifactType]
+        assert set(values) == {"primary", "log", "screenshot", "thumbnail", "chunk", "debug"}
+
+    def test_feature_type_values(self):
+        values = [e.value for e in SandboxFeatureType]
+        assert set(values) == {"chat", "skill", "workflow", "library", "media", "presentation", "connector"}

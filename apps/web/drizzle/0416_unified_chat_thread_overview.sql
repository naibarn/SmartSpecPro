CREATE TABLE "conversation_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" integer NOT NULL,
	"tenant_id" varchar(36),
	"owner_user_id" integer NOT NULL,
	"parent_thread_id" uuid,
	"title" varchar(160) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_threads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade,
	CONSTRAINT "conversation_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
	CONSTRAINT "conversation_threads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "conversation_threads_parent_thread_id_conversation_threads_id_fk" FOREIGN KEY ("parent_thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE set null,
	CONSTRAINT "conversation_threads_parent_not_self_check" CHECK ("parent_thread_id" IS NULL OR "parent_thread_id" <> "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_threads_owner_idempotency_unique" ON "conversation_threads" USING btree ("conversation_id","owner_user_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "conversation_threads_activity_idx" ON "conversation_threads" USING btree ("conversation_id","last_activity_at");
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "thread_id" uuid;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");
--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN "thread_id" uuid;
--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "worker_jobs_thread_created_idx" ON "worker_jobs" USING btree ("thread_id","createdAt","id");

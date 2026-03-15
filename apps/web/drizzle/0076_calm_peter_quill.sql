ALTER TABLE "api_keys" ADD COLUMN "isSuspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "suspendedReason" varchar(500);--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "suspendedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "suspendedBy" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_suspendedBy_users_id_fk" FOREIGN KEY ("suspendedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
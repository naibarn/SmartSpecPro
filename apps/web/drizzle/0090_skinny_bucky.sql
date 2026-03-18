CREATE TABLE "user_llm_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"tenantId" varchar(36),
	"provider" varchar(50) NOT NULL,
	"apiKeyEncrypted" text NOT NULL,
	"keyHint" varchar(8),
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_llm_api_keys" ADD CONSTRAINT "user_llm_api_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_llm_api_keys_user_provider_idx" ON "user_llm_api_keys" USING btree ("userId","provider");--> statement-breakpoint
CREATE INDEX "user_llm_api_keys_user_idx" ON "user_llm_api_keys" USING btree ("userId");
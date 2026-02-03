CREATE TABLE "model_provider_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" varchar(128) NOT NULL,
	"providerId" integer NOT NULL,
	"modelName" varchar(128) NOT NULL,
	"providerModelId" varchar(256) NOT NULL,
	"pricingInput" numeric(12, 8) DEFAULT '0' NOT NULL,
	"pricingOutput" numeric(12, 8) DEFAULT '0' NOT NULL,
	"isFree" boolean DEFAULT false NOT NULL,
	"contextLength" integer,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"providerId" integer NOT NULL,
	"modelUsed" varchar(128) NOT NULL,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"costUsd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"creditsCharged" integer DEFAULT 0 NOT NULL,
	"responseTimeMs" integer,
	"statusCode" integer,
	"errorType" varchar(64),
	"wasFallback" boolean DEFAULT false NOT NULL,
	"fallbackFromProviderId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelPattern" varchar(128) NOT NULL,
	"routingMode" varchar(32) NOT NULL,
	"providerOrder" json,
	"maxFallbacks" integer DEFAULT 3 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "providerType" varchar(32) DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "healthStatus" varchar(32) DEFAULT 'healthy' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "lastHealthCheck" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "failureCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "successCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD CONSTRAINT "model_provider_map_providerId_llm_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."llm_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD CONSTRAINT "provider_usage_log_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD CONSTRAINT "provider_usage_log_providerId_llm_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."llm_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD CONSTRAINT "provider_usage_log_fallbackFromProviderId_llm_providers_id_fk" FOREIGN KEY ("fallbackFromProviderId") REFERENCES "public"."llm_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_provider_map_unique" ON "model_provider_map" USING btree ("modelId","providerId");--> statement-breakpoint
CREATE INDEX "provider_usage_log_user_created" ON "provider_usage_log" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "provider_usage_log_provider_created" ON "provider_usage_log" USING btree ("providerId","createdAt");
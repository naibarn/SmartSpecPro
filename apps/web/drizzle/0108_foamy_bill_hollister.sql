ALTER TABLE "agencies" ALTER COLUMN "topology" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "cacheConversationStarters" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_agents" ALTER COLUMN "parallelToolCalls" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_agents" ALTER COLUMN "maxTurns" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_guardrails" ALTER COLUMN "validationAttempts" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_guardrails" ALTER COLUMN "isEnabled" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_guardrails" ALTER COLUMN "sortOrder" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_tools" ALTER COLUMN "version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_tools" ALTER COLUMN "isExposedAsApi" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_tools" ALTER COLUMN "strictSchema" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_tools" ALTER COLUMN "oneCallAtATime" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_tools" ALTER COLUMN "isEnabled" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_tools" ALTER COLUMN "updatedAt" SET NOT NULL;
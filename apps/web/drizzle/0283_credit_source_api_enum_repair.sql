-- Repair environments whose migration ledger advanced past 0077/0078 while
-- the corresponding enum additions were not retained. Every statement is
-- additive and idempotent so this is safe for already-correct databases.
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_skill';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_agency';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_job';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_media';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_presentation';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_video_project';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_chat';--> statement-breakpoint
ALTER TYPE "public"."credit_source_type" ADD VALUE IF NOT EXISTS 'api_mcp';

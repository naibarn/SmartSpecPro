CREATE TYPE "public"."credit_source_type" AS ENUM('chat', 'skill', 'media_image', 'media_video', 'media_audio', 'indexing', 'rag', 'stt', 'translation', 'brainstorm', 'scheduler', 'admin', 'other');--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "traceId" varchar(32);--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "conversationId" integer;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "skillSlug" varchar(128);--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "sourceType" "credit_source_type";--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_transactions_trace_id_idx" ON "credit_transactions" USING btree ("traceId");--> statement-breakpoint
CREATE INDEX "credit_transactions_conversation_id_idx" ON "credit_transactions" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "credit_transactions_source_type_idx" ON "credit_transactions" USING btree ("sourceType");
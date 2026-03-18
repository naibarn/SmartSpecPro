ALTER TABLE "persona_templates" ADD COLUMN "assistantNickname" text;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "assistantGender" text DEFAULT 'neutral';--> statement-breakpoint
ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_assistant_gender_check" CHECK ("assistantGender" IN ('female','male','neutral') OR "assistantGender" IS NULL);

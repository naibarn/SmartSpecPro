ALTER TABLE "feedback_ticket_attachments"
  ADD COLUMN IF NOT EXISTS "commentId" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_ticket_reads" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticketId" integer NOT NULL,
  "userId" integer NOT NULL,
  "readAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feedback_ticket_attachments"
    ADD CONSTRAINT "feedback_ticket_attachments_commentId_feedback_ticket_comments_id_fk"
    FOREIGN KEY ("commentId") REFERENCES "public"."feedback_ticket_comments"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feedback_ticket_reads"
    ADD CONSTRAINT "feedback_ticket_reads_ticketId_feedback_tickets_id_fk"
    FOREIGN KEY ("ticketId") REFERENCES "public"."feedback_tickets"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feedback_ticket_reads"
    ADD CONSTRAINT "feedback_ticket_reads_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_ticket_reads_ticket_user_unique"
  ON "feedback_ticket_reads" USING btree ("ticketId", "userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_ticket_reads_user_read_idx"
  ON "feedback_ticket_reads" USING btree ("userId", "readAt");

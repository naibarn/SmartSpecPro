CREATE INDEX IF NOT EXISTS "idx_users_created_at"
  ON "users" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_last_signed_in"
  ON "users" USING btree ("lastSignedIn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_plan"
  ON "users" USING btree ("plan");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_registration_events_outcome"
  ON "registration_events" USING btree ("outcome", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_transactions_user_created"
  ON "credit_transactions" USING btree ("userId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_user_created"
  ON "conversations" USING btree ("userId", "createdAt");

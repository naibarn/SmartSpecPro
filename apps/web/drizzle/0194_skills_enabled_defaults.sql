ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "isEnabled" boolean;
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "enabledByDefault" boolean;
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "visibleByDefault" boolean;
--> statement-breakpoint
UPDATE "skills"
SET "isEnabled" = true
WHERE "isEnabled" IS NULL;
--> statement-breakpoint
UPDATE "skills"
SET "enabledByDefault" = true
WHERE "enabledByDefault" IS NULL;
--> statement-breakpoint
UPDATE "skills"
SET "visibleByDefault" = true
WHERE "visibleByDefault" IS NULL;
--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "isEnabled" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "enabledByDefault" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "visibleByDefault" SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "isEnabled" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "enabledByDefault" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "visibleByDefault" SET NOT NULL;

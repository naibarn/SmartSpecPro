ALTER TABLE "work_cases"
  ADD COLUMN IF NOT EXISTS "automationTemplateKey" varchar(120),
  ADD COLUMN IF NOT EXISTS "automationTemplateFamily" varchar(120) NOT NULL DEFAULT 'content-production',
  ADD COLUMN IF NOT EXISTS "automationTemplateSource" varchar(120) NOT NULL DEFAULT 'case_intake',
  ADD COLUMN IF NOT EXISTS "automationPolicyJson" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "work_automation_runs"
  ADD COLUMN IF NOT EXISTS "templateFamily" varchar(120) NOT NULL DEFAULT 'content-production',
  ADD COLUMN IF NOT EXISTS "templateSource" varchar(120) NOT NULL DEFAULT 'case_intake',
  ADD COLUMN IF NOT EXISTS "policyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "resolvedAt" timestamptz;

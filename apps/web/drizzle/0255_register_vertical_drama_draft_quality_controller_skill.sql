-- Register the checked-in Vertical Drama Draft QC skill so fixed-credit
-- settlement and Credits history can resolve one canonical identity.
INSERT INTO "skills" (
  "slug", "name", "description", "category", "importSource", "visibility",
  "executionMode", "tenantCreditCost", "skillOwnerCreditCost", "createdAt", "updatedAt"
)
VALUES (
  'vertical-drama-draft-quality-controller',
  'Vertical Drama Draft Quality Controller',
  'System Draft QC and safe revision skill.',
  'other',
  'system',
  'private',
  'llm-only',
  2,
  0,
  now(),
  now()
)
ON CONFLICT ("slug") DO NOTHING;

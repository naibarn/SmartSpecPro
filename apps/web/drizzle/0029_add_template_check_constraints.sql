-- M-04: Add CHECK constraints for workflow_templates safety bounds
-- Prevents invalid data from being inserted/updated:
-- - stepCount must be non-negative
-- - estimatedSetupMinutes must be non-negative
-- - previewSvg must not exceed 512KB

ALTER TABLE "workflow_templates"
  ADD CONSTRAINT "wt_stepCount_positive"
    CHECK ("stepCount" IS NULL OR "stepCount" >= 0);

ALTER TABLE "workflow_templates"
  ADD CONSTRAINT "wt_estimatedSetupMinutes_positive"
    CHECK ("estimatedSetupMinutes" IS NULL OR "estimatedSetupMinutes" >= 0);

ALTER TABLE "workflow_templates"
  ADD CONSTRAINT "wt_previewSvg_maxlen"
    CHECK ("previewSvg" IS NULL OR length("previewSvg") <= 524288);

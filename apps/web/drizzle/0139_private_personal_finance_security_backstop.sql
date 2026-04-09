ALTER TABLE "finance_recurring_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_recurring_rules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_recurring_rules_tenant_scope" ON "finance_recurring_rules" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "finance_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_drafts_tenant_scope" ON "finance_drafts" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "finance_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_transactions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_transactions_tenant_scope" ON "finance_transactions" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "document_extractions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_extractions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_extractions_tenant_scope" ON "document_extractions" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

ALTER TABLE "finance_transaction_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_transaction_documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "finance_transaction_documents_tenant_scope" ON "finance_transaction_documents" FOR ALL TO public
USING (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant_id', true)
  AND (
    (
      project_id = 'personal'
      AND current_setting('app.current_project_id', true) = 'personal'
      AND owner_user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      project_id <> 'personal'
      AND project_id = current_setting('app.current_project_id', true)
    )
  )
);
--> statement-breakpoint

-- Backfill planning note: legacy NULL project_id rows on library_items/library_chunks/library_index_jobs stay compatibility-only
-- until the section-06 backfill and verification path remediates them.

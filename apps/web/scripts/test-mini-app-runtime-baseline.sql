\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  required_table text;
  retired_table text;
  tenant_a varchar(36) := 'miniapp-tenant-a';
  tenant_b varchar(36) := 'miniapp-tenant-b';
  project_a varchar(36) := 'miniapp-project-a';
  v_note_id varchar(36);
  v_page_id varchar(36);
  v_job_id varchar(36);
  required_tables text[] := ARRAY[
    'tenants', 'users', 'app_identities', 'canonical_projects',
    'canonical_project_memberships', 'canonical_project_app_bindings',
    'mini_app_research_notes', 'mini_app_project_wiki_pages',
    'worker_jobs', 'worker_job_attempts', 'worker_job_events',
    'worker_job_dispatches', 'worker_job_outbox', 'worker_job_settlements'
  ];
  retired_tables text[] := ARRAY[
    'workflow_templates', 'workflows', 'workflow_executions', 'agencies',
    'agency_agents', 'work_requests', 'workpacks', 'sandbox_jobs'
  ];
BEGIN
  FOREACH required_table IN ARRAY required_tables LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION 'required_mini_app_table_missing:%', required_table;
    END IF;
  END LOOP;

  FOREACH retired_table IN ARRAY retired_tables LOOP
    IF to_regclass(format('public.%I', retired_table)) IS NOT NULL THEN
      RAISE EXCEPTION 'retired_table_present_in_mini_app_baseline:%', retired_table;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'mini_app_baseline_unexpectedly_requires_vector_extension';
  END IF;

  INSERT INTO tenants (id, slug, name) VALUES
    (tenant_a, 'miniapp-a', 'Mini App Acceptance A'),
    (tenant_b, 'miniapp-b', 'Mini App Acceptance B');

  INSERT INTO app_identities (
    app_id, public_app_id, tenant_id, publisher_ref, canonical_product_id, lifecycle
  ) VALUES
    ('app_research_notes', 'research-notes', tenant_a, 'platform:smartaihub', 'research-notes', 'active'),
    ('app_project_wiki_pages', 'project-wiki-pages', tenant_a, 'platform:smartaihub', 'project-wiki-pages', 'active');

  INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
  VALUES (project_a, tenant_a, 'mini-app-acceptance', 'Acceptance Project', 'principal:miniapp-owner');

  INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
  VALUES (tenant_a, project_a, 'principal:miniapp-owner', 'owner');

  INSERT INTO canonical_project_app_bindings (tenant_id, project_id, app_id)
  VALUES
    (tenant_a, project_a, 'app_research_notes'),
    (tenant_a, project_a, 'app_project_wiki_pages');

  INSERT INTO mini_app_research_notes (tenant_id, project_id, app_id, owner_principal_id, title, content)
  VALUES (tenant_a, project_a, 'app_research_notes', 'principal:miniapp-owner', 'Acceptance note', 'synthetic note')
  RETURNING mini_app_research_notes.note_id INTO v_note_id;

  INSERT INTO mini_app_project_wiki_pages (
    tenant_id, project_id, app_id, owner_principal_id, path, title, content, content_hash
  ) VALUES (
    tenant_a, project_a, 'app_project_wiki_pages', 'principal:miniapp-owner',
    'guide/start', 'Start', 'synthetic page', repeat('a', 64)
  ) RETURNING mini_app_project_wiki_pages.page_id INTO v_page_id;

  BEGIN
    INSERT INTO mini_app_research_notes (
      tenant_id, project_id, app_id, owner_principal_id, title, content
    ) VALUES (tenant_b, project_a, 'app_research_notes', 'principal:other', 'cross-tenant', 'must fail');
    RAISE EXCEPTION 'cross_tenant_project_reference_was_accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO mini_app_project_wiki_pages (
      tenant_id, project_id, app_id, owner_principal_id, path, title, content, content_hash
    ) VALUES (tenant_a, project_a, 'app_project_wiki_pages', 'principal:miniapp-owner',
      'guide/start', 'Duplicate', '', repeat('b', 64));
    RAISE EXCEPTION 'duplicate_active_page_path_was_accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  UPDATE mini_app_project_wiki_pages SET lifecycle = 'ARCHIVED' WHERE mini_app_project_wiki_pages.page_id = v_page_id;
  INSERT INTO mini_app_project_wiki_pages (
    tenant_id, project_id, app_id, owner_principal_id, path, title, content, content_hash
  ) VALUES (tenant_a, project_a, 'app_project_wiki_pages', 'principal:miniapp-owner',
    'guide/start', 'Replacement', '', repeat('c', 64));

  BEGIN
    INSERT INTO mini_app_research_notes (
      tenant_id, project_id, app_id, owner_principal_id, title, content
    ) VALUES (tenant_a, project_a, 'app_research_notes', 'principal:miniapp-owner', 'oversized', repeat('x', 262145));
    RAISE EXCEPTION 'oversized_note_was_accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO worker_jobs ("tenantId", "runtimeType", "jobType", "inputJson")
  VALUES (tenant_a, 'node_job_worker', 'mini_app.acceptance_probe', jsonb_build_object('noteId', v_note_id))
  RETURNING worker_jobs.id INTO v_job_id;

  INSERT INTO worker_job_outbox ("workerJobId", "envelopeVersion", "envelopeJson", "dedupeKey")
  VALUES (v_job_id, 'worker-job-envelope-v1', jsonb_build_object('jobId', v_job_id), 'miniapp-acceptance:' || v_job_id);
END $$;

ROLLBACK;
SELECT 'MINI_APP_RUNTIME_BASELINE_PASS' AS result;

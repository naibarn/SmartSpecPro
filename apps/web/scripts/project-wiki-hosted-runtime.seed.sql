\set ON_ERROR_STOP on
INSERT INTO users ("openId", name, email, "currentTenantId", "loginMethod")
VALUES ('miniapp-runtime-viewer', 'Synthetic Wiki Viewer', 'wiki-viewer@example.test', 'miniapp-runtime-tenant', 'test');

INSERT INTO app_identities (app_id, public_app_id, tenant_id, publisher_ref, canonical_product_id, lifecycle)
VALUES
  ('app_project_wiki_pages', 'project-wiki-pages', 'miniapp-runtime-tenant', 'platform:smartaihub', 'project-wiki-pages', 'active');

INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
VALUES
  ('miniapp-runtime-wiki-project', 'miniapp-runtime-tenant', 'project-wiki', 'Synthetic Wiki Project', 'user:1');
INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
SELECT 'miniapp-runtime-tenant', 'miniapp-runtime-wiki-project', 'user:' || id, 'owner'
FROM users WHERE "openId" = 'miniapp-runtime-user';
INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
SELECT 'miniapp-runtime-tenant', 'miniapp-runtime-wiki-project', 'user:' || id, 'viewer'
FROM users WHERE "openId" = 'miniapp-runtime-viewer';
INSERT INTO canonical_project_app_bindings (tenant_id, project_id, app_id)
VALUES ('miniapp-runtime-tenant', 'miniapp-runtime-wiki-project', 'app_project_wiki_pages');

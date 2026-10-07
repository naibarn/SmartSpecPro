\set ON_ERROR_STOP on
INSERT INTO tenants (id, slug, name)
VALUES ('miniapp-runtime-tenant', 'miniapp-runtime', 'Synthetic Runtime Tenant');
INSERT INTO tenants (id, slug, name)
VALUES ('miniapp-runtime-tenant-b', 'miniapp-runtime-b', 'Synthetic Other Tenant');
INSERT INTO users ("openId", name, email, "currentTenantId", "loginMethod")
VALUES ('miniapp-runtime-user', 'Synthetic Runtime User', 'miniapp-runtime@example.test', 'miniapp-runtime-tenant', 'test');
INSERT INTO users ("openId", name, email, "currentTenantId", "loginMethod")
VALUES ('miniapp-runtime-other-user', 'Synthetic Other Tenant User', 'miniapp-runtime-other@example.test', 'miniapp-runtime-tenant-b', 'test');
INSERT INTO app_identities (app_id, public_app_id, tenant_id, publisher_ref, canonical_product_id, lifecycle)
VALUES ('app_research_notes', 'research-notes', 'miniapp-runtime-tenant', 'platform:smartaihub', 'research-notes', 'active');
INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
VALUES ('miniapp-runtime-project', 'miniapp-runtime-tenant', 'research-notes', 'Synthetic Runtime Project', 'user:1');
INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
VALUES ('miniapp-runtime-tenant', 'miniapp-runtime-project', 'user:1', 'owner');
INSERT INTO canonical_project_app_bindings (tenant_id, project_id, app_id)
VALUES ('miniapp-runtime-tenant', 'miniapp-runtime-project', 'app_research_notes');
INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
VALUES ('miniapp-runtime-other-project', 'miniapp-runtime-tenant', 'research-notes', 'Other Project', 'principal:unrelated');
INSERT INTO canonical_project_app_bindings (tenant_id, project_id, app_id)
VALUES ('miniapp-runtime-tenant', 'miniapp-runtime-other-project', 'app_research_notes');

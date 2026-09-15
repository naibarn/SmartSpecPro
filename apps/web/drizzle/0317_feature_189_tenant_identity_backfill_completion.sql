-- Feature 189: complete the safe tenant-identity backfill after the additive
-- schema migration. This migration only binds users that are still unbound:
-- first to exactly one active persisted registered-domain match, then to the
-- explicitly configured Default tenant. Ambiguous/unresolved users and system
-- users remain untouched for operator review.

DO $$
DECLARE
  configured_default_tenant_id text := NULLIF(current_setting('app.feature189_default_tenant_id', true), '');
  default_tenant_id varchar(36);
  resolved_tenant_id varchar(36);
  resolution_reason varchar(120);
  normalized_registered_domain text;
  updated_count integer;
  user_row record;
BEGIN
  IF configured_default_tenant_id IS NOT NULL THEN
    SELECT t."id"
      INTO default_tenant_id
      FROM "tenants" t
     WHERE t."id" = configured_default_tenant_id
       AND t."isActive" = true
     LIMIT 1;
    IF default_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Configured app.feature189_default_tenant_id is missing or inactive';
    END IF;
  END IF;

  FOR user_row IN
    SELECT u."id", u."credits", u."registeredDomain"
      FROM "users" u
     WHERE u."currentTenantId" IS NULL
       AND COALESCE(u."isSystemUser", false) = false
  LOOP
    resolved_tenant_id := NULL;
    resolution_reason := NULL;
    normalized_registered_domain := NULLIF(
      lower(trim(trailing '.' from btrim(user_row."registeredDomain"))),
      ''
    );

    IF normalized_registered_domain IS NOT NULL THEN
      SELECT min(t."id")
        INTO resolved_tenant_id
        FROM "tenants" t
       WHERE t."isActive" = true
         AND (
           lower(trim(trailing '.' from btrim(t."primaryDomain"))) = normalized_registered_domain
           OR EXISTS (
             SELECT 1
               FROM jsonb_array_elements_text(COALESCE(t."domains"::jsonb, '[]'::jsonb)) AS domain(value)
              WHERE lower(trim(trailing '.' from btrim(domain.value))) = normalized_registered_domain
           )
         )
      HAVING count(*) = 1;
      IF resolved_tenant_id IS NOT NULL THEN
        resolution_reason := 'registered_domain_backfill';
      END IF;
    END IF;

    IF resolved_tenant_id IS NULL AND default_tenant_id IS NOT NULL THEN
      resolved_tenant_id := default_tenant_id;
      resolution_reason := 'default_tenant_backfill';
    END IF;

    IF resolved_tenant_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE "users"
       SET "currentTenantId" = resolved_tenant_id,
           "tenantIdentityMigrationReason" = resolution_reason,
           "tenantIdentityMigratedAt" = now(),
           "updatedAt" = now()
     WHERE "id" = user_row."id"
       AND "currentTenantId" IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO "tenant_identity_events" (
      "userId", "actorType", "oldTenantId", "newTenantId", "action",
      "reason", "priorCredits", "currentCredits", "creditResetStatus",
      "sessionRevocationStatus", "actionIdempotencyKey", "eventKey"
    ) VALUES (
      user_row."id", 'system_migration', NULL, resolved_tenant_id, 'backfill',
      resolution_reason, user_row."credits", user_row."credits",
      'not_applicable', 'not_attempted',
      'backfill:user:' || user_row."id" || ':' || resolution_reason,
      'backfill:user:' || user_row."id" || ':tenant:' || resolved_tenant_id
    ) ON CONFLICT ("eventKey") DO NOTHING;
  END LOOP;
END $$;

# Section 12 — Database Schema: MCP Server Registry

## Section ID
`section-12-db-schema-mcp-registry`

## Dependencies
- None (Wave 3 foundation — must complete before sections 13-21)

## Overview

Creates `mcp_servers` and `mcp_server_assignments` tables for centralized MCP server management, replacing per-agent JSONB (`agencyAgents.mcpServers`). Includes data migration script from JSONB to new tables. OAuth tokens stored in dedicated encrypted columns (not JSONB) per CLAUDE.md encryption rules.

## Files to Modify

| File | Path |
|------|------|
| schema.ts | `apps/web/drizzle/schema.ts` |

## Files to Create

| File | Path |
|------|------|
| Migration SQL | `apps/web/drizzle/XXXX_mcp_servers.sql` |
| Migration script | `apps/web/server/scripts/migrate-mcp-jsonb.ts` |

---

## TDD Specification

```
# Test: mcp_servers table created with all required columns
  - Run migration
  - Assert table exists with: id, tenantId, name, slug, transportType, config, enabled, etc.

# Test: tenantId is NOT NULL with FK to tenants
  - Attempt insert with tenantId=NULL
  - Assert constraint violation

# Test: slug is UNIQUE per tenant
  - Insert server with slug="github" for tenant 1
  - Insert server with slug="github" for tenant 1 again
  - Assert unique constraint violation
  - Insert server with slug="github" for tenant 2 — succeeds

# Test: riskLevel defaults to 'high'
  - Insert server without specifying riskLevel
  - Assert riskLevel = 'high'

# Test: mcp_server_assignments created correctly
  - Insert assignment with targetType="agency", targetId=1
  - Assert row created

# Test: migration script extracts JSONB to mcp_servers rows
  - Create agent with mcpServers JSONB: [{url: "https://mcp.example.com", name: "test"}]
  - Run migration script
  - Assert mcp_servers row created with matching URL
  - Assert mcp_server_assignments row linking agent to server
```

---

## Implementation Guidance

### Schema Definition (schema.ts)

#### Full DDL: mcp_servers

```sql
CREATE TABLE mcp_servers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  transport_type VARCHAR(20) NOT NULL DEFAULT 'http'
    CHECK (transport_type IN ('http', 'streamable_http', 'stdio')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  oauth_client_id TEXT,
  oauth_client_secret_encrypted TEXT,
  oauth_access_token_encrypted TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  oauth_config JSONB,
  capabilities JSONB DEFAULT '{"tools": true}',
  tool_name_prefix BOOLEAN DEFAULT true,
  max_tools_exposed INTEGER DEFAULT 50,
  timeout_seconds INTEGER DEFAULT 30,
  endpoint_path VARCHAR(100) DEFAULT '/rpc',
  risk_level VARCHAR(10) NOT NULL DEFAULT 'high'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  data_classification VARCHAR(20) DEFAULT 'internal'
    CHECK (data_classification IN ('public', 'internal', 'confidential')),
  config_hash VARCHAR(64),
  approved_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id),
  credit_per_call NUMERIC(10,2) DEFAULT 1.0,
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX ix_mcp_servers_tenant ON mcp_servers(tenant_id);
CREATE INDEX ix_mcp_servers_enabled ON mcp_servers(tenant_id, enabled);
```

#### Full DDL: mcp_server_assignments

```sql
CREATE TABLE mcp_server_assignments (
  id SERIAL PRIMARY KEY,
  mcp_server_id INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  target_type VARCHAR(10) NOT NULL
    CHECK (target_type IN ('tenant', 'agency', 'agent')),
  target_id INTEGER NOT NULL,
  enabled_tool_names TEXT[],
  disabled_tool_names TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mcp_server_id, target_type, target_id)
);

-- NEW-04: Validate tool name arrays at DB level to prevent injection via direct inserts
-- PostgreSQL trigger to validate each element matches safe pattern
CREATE OR REPLACE FUNCTION validate_tool_names() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enabled_tool_names IS NOT NULL THEN
    FOR i IN 1..array_length(NEW.enabled_tool_names, 1) LOOP
      IF NEW.enabled_tool_names[i] !~ '^[a-zA-Z0-9_\-\.]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid tool name: %', NEW.enabled_tool_names[i];
      END IF;
    END LOOP;
  END IF;
  IF NEW.disabled_tool_names IS NOT NULL THEN
    FOR i IN 1..array_length(NEW.disabled_tool_names, 1) LOOP
      IF NEW.disabled_tool_names[i] !~ '^[a-zA-Z0-9_\-\.]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid tool name: %', NEW.disabled_tool_names[i];
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_tool_names
  BEFORE INSERT OR UPDATE ON mcp_server_assignments
  FOR EACH ROW EXECUTE FUNCTION validate_tool_names();

CREATE INDEX ix_mcp_assignments_target ON mcp_server_assignments(target_type, target_id);
```

#### Drizzle Schema (schema.ts)

```typescript
export const mcpServers = pgTable("mcp_servers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  transportType: varchar("transport_type", { length: 20 }).notNull().default("http"),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default({}),
  oauthClientId: text("oauth_client_id"),
  oauthClientSecretEncrypted: text("oauth_client_secret_encrypted"),
  oauthAccessTokenEncrypted: text("oauth_access_token_encrypted"),
  oauthRefreshTokenEncrypted: text("oauth_refresh_token_encrypted"),
  oauthTokenExpiresAt: timestamp("oauth_token_expires_at", { withTimezone: true }),
  oauthConfig: jsonb("oauth_config"),
  capabilities: jsonb("capabilities").default({ tools: true }),
  toolNamePrefix: boolean("tool_name_prefix").default(true),
  maxToolsExposed: integer("max_tools_exposed").default(50),
  timeoutSeconds: integer("timeout_seconds").default(30),
  endpointPath: varchar("endpoint_path", { length: 100 }).default("/rpc"),
  riskLevel: varchar("risk_level", { length: 10 }).notNull().default("high"),
  dataClassification: varchar("data_classification", { length: 20 }).default("internal"),
  configHash: varchar("config_hash", { length: 64 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: integer("approved_by").references(() => users.id),
  creditPerCall: numeric("credit_per_call", { precision: 10, scale: 2 }).default("1.0"),
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  healthStatus: varchar("health_status", { length: 20 }).default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => ({
  uniqueSlug: unique().on(table.tenantId, table.slug),
}));

export const mcpServerAssignments = pgTable("mcp_server_assignments", {
  id: serial("id").primaryKey(),
  mcpServerId: integer("mcp_server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
  targetType: varchar("target_type", { length: 10 }).notNull(),
  targetId: integer("target_id").notNull(),
  enabledToolNames: text("enabled_tool_names").array(),
  disabledToolNames: text("disabled_tool_names").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueAssignment: unique().on(table.mcpServerId, table.targetType, table.targetId),
}));
```

Key design decisions:

- `oauthClientSecretEncrypted`, `oauthAccessTokenEncrypted`, `oauthRefreshTokenEncrypted` are **dedicated text columns**, not inside JSONB
- `oauthConfig` JSONB contains only non-secret metadata: `tokenUrl`, `grantType`, `scope`
- `tenantId` is `NOT NULL` with index — no platform-wide servers allowed (prevents cross-tenant leakage)
- `riskLevel` defaults to `'high'` — new servers are high-risk until admin reviews
- `configHash` (SHA-256) enables hot-reload change detection
- `approvedAt` / `approvedBy` support admin approval workflow

### Migration Script

The migration script (`migrate-mcp-jsonb.ts`):

1. Query all `agencyAgents` rows where `mcpServers IS NOT NULL`
2. For each unique URL across all agents in a tenant, create one `mcp_servers` row
3. Decrypt `mcpServerTokensEncrypted` → re-encrypt into `oauthAccessTokenEncrypted`
4. Create `mcp_server_assignments` for each agent→server reference
5. Leave JSONB columns intact for backward compat during transition period

### Database Safety Protocol

This is a **Medium-HIGH risk** operation (new tables + data migration). Follow mandatory protocol:

```bash
# Step 1: Backup affected tables
pg_dump "$DATABASE_URL" --data-only --table=agency_agents \
  --file=".db-backups/agency_agents_$(date +%Y%m%d_%H%M%S).sql"

# Step 2: Run migration
cd apps/web && pnpm db:push

# Step 3: Verify
psql "$DATABASE_URL" -c "SELECT count(*) FROM mcp_servers;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM mcp_server_assignments;"

# Step 4: Run migration script
npx tsx server/scripts/migrate-mcp-jsonb.ts

# Step 5: Verify data migrated
psql "$DATABASE_URL" -c "SELECT count(*) FROM mcp_servers WHERE config IS NOT NULL;"
```

### Security Considerations

1. **Encrypted columns**: OAuth tokens in dedicated encrypted columns use `encrypt()` from `crypto.ts` with `LLM_ENCRYPTION_KEY`. Never store tokens in JSONB.
2. **Tenant isolation**: `tenantId NOT NULL` prevents platform-wide MCP servers that could leak data across tenants.
3. **Default high risk**: New servers default to `riskLevel='high'` requiring explicit admin approval before agents can use them.

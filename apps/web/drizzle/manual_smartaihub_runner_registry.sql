-- Feature 205: additive Runner registry. This is deliberately separate from workers.
CREATE TABLE IF NOT EXISTS runner_nodes (
  "runnerId" varchar(160) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "ownerUserId" integer REFERENCES users(id) ON DELETE SET NULL,
  "nodeKind" varchar(32) NOT NULL,
  "profile" varchar(32) NOT NULL,
  "deviceId" varchar(160),
  "displayName" varchar(255) NOT NULL,
  "trustState" varchar(32) NOT NULL DEFAULT 'pending',
  "status" varchar(32) NOT NULL DEFAULT 'offline',
  "currentSnapshotRevision" varchar(128),
  "currentSnapshotJson" jsonb,
  "snapshotObservedAt" timestamptz,
  "snapshotExpiresAt" timestamptz,
  "lastSeenAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "deviceId")
);
CREATE INDEX IF NOT EXISTS runner_nodes_tenant_status_idx ON runner_nodes ("tenantId", "status");

CREATE TABLE IF NOT EXISTS runner_capability_snapshots (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "runnerId" varchar(160) NOT NULL REFERENCES runner_nodes("runnerId") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  revision varchar(128) NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "observedAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "snapshotJson" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runnerId", revision),
  UNIQUE ("runnerId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS runner_snapshots_tenant_created_idx ON runner_capability_snapshots ("tenantId", "createdAt");

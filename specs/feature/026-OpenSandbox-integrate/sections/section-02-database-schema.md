Now I have comprehensive context. Let me generate the section content.

# Section 2: Database Schema and Migrations

## Overview

This section adds 4 new database tables for the OpenSandbox integration (Drizzle ORM on the Node.js side), extends 5 existing tables with nullable sandbox columns, creates corresponding SQLAlchemy models for the Python backend, seeds 4 baseline sandbox profiles, and runs the migration. All new columns on existing tables are nullable, making this a LOW-risk migration.

**Dependencies**: Section 01 (Docker Foundation) must be completed first so the overall feature structure exists, but the database work itself has no runtime dependency on Docker.

**Blocks**: Sections 04 (Python Services) and 05 (Node.js Router Services) cannot begin until these tables and models exist.

---

## Tests (Write FIRST)

### 2.1 TypeScript Schema Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/sandbox-schema.test.ts`

These tests validate that the Drizzle schema definitions compile correctly and that type inference works as expected. They do NOT require a live database -- they verify the schema structure at the TypeScript level.

```typescript
/**
 * Sandbox schema definition tests.
 *
 * Validates that:
 * - All 4 new tables export correct inferred types
 * - Enum values match the expected set
 * - Foreign key references resolve to existing tables
 * - Default values are defined for key columns
 * - Existing table extensions add nullable columns without breaking types
 */
import { describe, it, expect } from "vitest";

describe("Sandbox Schema Definitions", () => {
  it("should export sandboxProfiles table with correct column types");
  it("should export sandboxJobs table with correct column types");
  it("should export sandboxArtifacts table with correct column types");
  it("should export tenantSandboxPolicies table with correct column types");

  it("should define sandboxExecutionModeEnum with all expected values");
  it("should define sandboxJobStatusEnum with all expected values");
  it("should define sandboxArtifactTypeEnum with all expected values");
  it("should define sandboxNetworkActionEnum with all expected values");
  it("should define sandboxFeatureTypeEnum with all expected values");

  it("sandbox_profiles slug should be unique");
  it("sandbox_jobs should have idempotency composite index");
  it("sandbox_jobs should reference tenants, users, sandbox_profiles via FK");
  it("sandbox_artifacts should reference sandbox_jobs via FK");
  it("tenant_sandbox_policies should have unique tenantId");

  it("skills table should accept sandboxProfileSlug as nullable varchar");
  it("skills table existing type should still be valid after extension");
  it("media_callback_events should accept sandboxJobId as nullable varchar");
  it("presentation_conversion_records should accept sandboxJobId as nullable varchar");
  it("api_audit_events should accept sandboxJobId and opensandboxId as nullable");
  it("workflow_executions should accept sandboxJobIds as nullable JSONB");
});
```

### 2.2 Python SQLAlchemy Model Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_models.py`

These tests verify the SQLAlchemy model definitions match the expected table and column structure. They use the model classes directly (no database required for structural tests).

```python
"""
Tests for sandbox SQLAlchemy models.

Validates:
- Model __tablename__ matches Drizzle-created table names
- Column names match the database column names (snake_case from Drizzle)
- Column types are appropriate (String, Integer, JSON, DateTime, etc.)
- CRUD operations work via async session (integration, requires DB)
"""
import pytest

# Mark all tests in this file with the sandbox marker
pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestSandboxProfileModel:
    """SandboxProfile maps to sandbox_profiles table."""

    def test_tablename_is_sandbox_profiles(self):
        """__tablename__ must be 'sandbox_profiles'."""
        ...

    def test_has_required_columns(self):
        """Model must define: id, slug, name, execution_mode, base_image, cpu_limit, etc."""
        ...

    def test_slug_is_unique(self):
        """slug column should be marked unique."""
        ...


class TestSandboxJobModel:
    """SandboxJob maps to sandbox_jobs table."""

    def test_tablename_is_sandbox_jobs(self):
        ...

    def test_has_required_columns(self):
        """Must define: id, tenant_id, user_id, feature_type, status, etc."""
        ...

    def test_status_default_is_accepted(self):
        ...

    def test_to_dict_returns_expected_keys(self):
        ...


class TestSandboxArtifactModel:
    """SandboxArtifact maps to sandbox_artifacts table."""

    def test_tablename_is_sandbox_artifacts(self):
        ...

    def test_has_required_columns(self):
        ...

    def test_foreign_key_references_sandbox_jobs(self):
        ...


class TestTenantSandboxPolicyModel:
    """TenantSandboxPolicy maps to tenant_sandbox_policies table."""

    def test_tablename_is_tenant_sandbox_policies(self):
        ...

    def test_has_required_columns(self):
        ...

    def test_tenant_id_is_unique(self):
        ...
```

### 2.3 Seed Data Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/sandbox-seed.test.ts`

```typescript
/**
 * Seed data tests for baseline sandbox profiles.
 *
 * Validates:
 * - 4 profiles are defined: code-default, media-processing, browser-default, file-parser
 * - Each profile has correct resource defaults
 * - Seed is idempotent (ON CONFLICT DO NOTHING)
 */
import { describe, it, expect } from "vitest";

describe("Sandbox Profile Seed Data", () => {
  it("should define exactly 4 baseline profiles");
  it("code-default profile should have 1000m CPU, 2048 MB, 600s timeout, network deny");
  it("media-processing profile should have 2000m CPU, 4096 MB, 1800s timeout, network deny");
  it("browser-default profile should have 2000m CPU, 4096 MB, 600s timeout, network allow");
  it("file-parser profile should have 1000m CPU, 2048 MB, 300s timeout, network deny");
  it("seed should be idempotent (no error on re-run)");
});
```

---

## Implementation Details

### 2.1 New Enums

Add these pgEnums to `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, placed near the existing enum definitions at the top of the file (after line ~100, near the other enum declarations):

**`sandboxExecutionModeEnum`** -- Execution mode for sandbox jobs:
- Values: `"code"`, `"command"`, `"browser"`, `"file"`, `"media"`

**`sandboxJobStatusEnum`** -- Lifecycle states for sandbox jobs:
- Values: `"accepted"`, `"policy_resolved"`, `"queued"`, `"provisioning"`, `"staging_inputs"`, `"executing"`, `"collecting_outputs"`, `"persisting"`, `"completed"`, `"failed"`, `"timed_out"`, `"canceled"`

**`sandboxArtifactTypeEnum`** -- Types of artifacts produced by sandbox jobs:
- Values: `"primary"`, `"log"`, `"screenshot"`, `"thumbnail"`, `"chunk"`, `"debug"`

**`sandboxNetworkActionEnum`** -- Default network policy for sandbox containers:
- Values: `"deny"`, `"allow"`

**`sandboxFeatureTypeEnum`** -- Which SmartSpecPro feature triggered the sandbox job:
- Values: `"chat"`, `"skill"`, `"workflow"`, `"library"`, `"media"`, `"presentation"`, `"connector"`

### 2.2 New Tables

Add these 4 tables to the end of `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (after the `funnelBackfillCheckpoints` table, around line 3724):

#### `sandbox_profiles` -- Reusable runtime configurations

```typescript
export const sandboxProfiles = pgTable("sandbox_profiles", {
  id: serial("id").primaryKey(),

  /** Unique slug identifier (e.g., "code-default", "media-processing") */
  slug: varchar("slug", { length: 64 }).notNull().unique(),

  /** Display name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Description of this profile's purpose */
  description: text("description"),

  /** Execution mode this profile is designed for */
  executionMode: sandboxExecutionModeEnum("executionMode").notNull(),

  /** Docker image to use for sandbox containers */
  baseImage: varchar("baseImage", { length: 512 }).notNull(),

  /** Entrypoint command template (optional override) */
  entrypointTemplate: text("entrypointTemplate"),

  /** CPU limit (Kubernetes-style, e.g., "1000m" = 1 core) */
  cpuLimit: varchar("cpuLimit", { length: 16 }).default("1000m").notNull(),

  /** Memory limit in MB */
  memoryLimitMb: integer("memoryLimitMb").default(2048).notNull(),

  /** Ephemeral disk limit in MB */
  ephemeralDiskMb: integer("ephemeralDiskMb").default(5120).notNull(),

  /** Maximum execution time in seconds */
  timeoutSeconds: integer("timeoutSeconds").default(300).notNull(),

  /** Default network policy for sandbox containers */
  networkDefaultAction: sandboxNetworkActionEnum("networkDefaultAction").default("deny").notNull(),

  /** Whether browser automation is allowed */
  allowBrowser: boolean("allowBrowser").default(false).notNull(),

  /** Whether shell commands are allowed */
  allowCommand: boolean("allowCommand").default(false).notNull(),

  /** Whether code interpreter is allowed */
  allowCodeInterpreter: boolean("allowCodeInterpreter").default(false).notNull(),

  /** Whether file upload into sandbox is allowed */
  allowFileUpload: boolean("allowFileUpload").default(true).notNull(),

  /** Max input file size in MB */
  maxInputMb: integer("maxInputMb").default(50),

  /** Max output file size in MB */
  maxOutputMb: integer("maxOutputMb").default(100),

  /** Whether this profile is active and can be used */
  isActive: boolean("isActive").default(true).notNull(),

  /** Profile version for tracking changes */
  version: integer("version").default(1).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SandboxProfile = typeof sandboxProfiles.$inferSelect;
export type InsertSandboxProfile = typeof sandboxProfiles.$inferInsert;
```

#### `sandbox_jobs` -- Canonical execution records

```typescript
export const sandboxJobs = pgTable("sandbox_jobs", {
  /** UUID primary key */
  id: varchar("id", { length: 36 }).primaryKey(),

  /** Tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** User who initiated the job */
  userId: integer("userId").notNull().references(() => users.id),

  /** Which SmartSpecPro feature triggered this job */
  featureType: sandboxFeatureTypeEnum("featureType").notNull(),

  /** Reference ID in the originating feature (e.g., message ID, skill execution ID) */
  featureRefId: varchar("featureRefId", { length: 128 }),

  /** Execution mode for this job */
  executionMode: sandboxExecutionModeEnum("executionMode").notNull(),

  /** Profile used for this job */
  sandboxProfileId: integer("sandboxProfileId").references(() => sandboxProfiles.id),

  /** OpenSandbox container ID (set after provisioning) */
  opensandboxId: varchar("opensandboxId", { length: 128 }),

  /** Current lifecycle status */
  status: sandboxJobStatusEnum("status").default("accepted").notNull(),

  /** Human-readable reason for current status (especially for failures) */
  statusReason: text("statusReason"),

  /** Docker image URI used for this job */
  imageUri: varchar("imageUri", { length: 512 }),

  /** Input file manifest (S3/R2 keys, sizes, checksums) */
  inputManifestJson: jsonb("inputManifestJson").$type<Record<string, unknown>>(),

  /** Output file manifest (S3/R2 keys, sizes, checksums) */
  outputManifestJson: jsonb("outputManifestJson").$type<Record<string, unknown>>(),

  /** First N bytes of stdout for quick inspection */
  stdoutExcerpt: text("stdoutExcerpt"),

  /** First N bytes of stderr for quick inspection */
  stderrExcerpt: text("stderrExcerpt"),

  /** Estimated cost before execution (credits) */
  costEstimate: numeric("costEstimate", { precision: 12, scale: 4 }),

  /** Actual cost after execution (credits) */
  costActual: numeric("costActual", { precision: 12, scale: 4 }),

  /** Idempotency key for deduplication */
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),

  /** When execution actually started */
  startedAt: timestamp("startedAt", { withTimezone: true }),

  /** When execution finished (success or failure) */
  finishedAt: timestamp("finishedAt", { withTimezone: true }),

  /** When this job record can be cleaned up */
  expiresAt: timestamp("expiresAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  /** Idempotency: prevent duplicate jobs for the same tenant+feature+key */
  uniqueIndex("sandbox_jobs_idempotency_idx")
    .on(t.tenantId, t.featureType, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
  index("sandbox_jobs_tenant_status_idx").on(t.tenantId, t.status),
  index("sandbox_jobs_opensandbox_id_idx").on(t.opensandboxId),
  index("sandbox_jobs_user_idx").on(t.userId),
  index("sandbox_jobs_created_idx").on(t.createdAt),
  index("sandbox_jobs_expires_idx").on(t.expiresAt),
]);

export type SandboxJob = typeof sandboxJobs.$inferSelect;
export type InsertSandboxJob = typeof sandboxJobs.$inferInsert;
```

#### `sandbox_artifacts` -- Output files from sandbox jobs

```typescript
export const sandboxArtifacts = pgTable("sandbox_artifacts", {
  id: serial("id").primaryKey(),

  /** Parent sandbox job */
  sandboxJobId: varchar("sandboxJobId", { length: 36 }).notNull().references(() => sandboxJobs.id, { onDelete: "cascade" }),

  /** Artifact classification */
  artifactType: sandboxArtifactTypeEnum("artifactType").notNull(),

  /** S3/R2 object key */
  objectKey: varchar("objectKey", { length: 512 }).notNull(),

  /** MIME type of the artifact */
  mimeType: varchar("mimeType", { length: 128 }),

  /** File size in bytes */
  sizeBytes: bigint("sizeBytes", { mode: "number" }),

  /** SHA-256 checksum for integrity verification */
  sha256: varchar("sha256", { length: 64 }),

  /** Whether this is the primary output artifact */
  isPrimary: boolean("isPrimary").default(false).notNull(),

  /** Additional metadata (e.g., dimensions, duration, codec) */
  metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sandbox_artifacts_job_idx").on(t.sandboxJobId),
  index("sandbox_artifacts_type_idx").on(t.artifactType),
]);

export type SandboxArtifact = typeof sandboxArtifacts.$inferSelect;
export type InsertSandboxArtifact = typeof sandboxArtifacts.$inferInsert;
```

#### `tenant_sandbox_policies` -- Per-tenant sandbox limits

```typescript
export const tenantSandboxPolicies = pgTable("tenant_sandbox_policies", {
  id: serial("id").primaryKey(),

  /** One policy per tenant (unique constraint) */
  tenantId: varchar("tenantId", { length: 36 }).notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),

  /** Default sandbox profile for this tenant */
  defaultProfileId: integer("defaultProfileId").references(() => sandboxProfiles.id),

  /** Max simultaneous running sandboxes */
  maxConcurrentSandboxes: integer("maxConcurrentSandboxes").default(5).notNull(),

  /** Max total runtime per day in seconds */
  maxDailyRuntimeSeconds: integer("maxDailyRuntimeSeconds").default(36000).notNull(),

  /** Max runtime for a single job in seconds */
  maxSingleJobSeconds: integer("maxSingleJobSeconds").default(1800).notNull(),

  /** Default network action override for this tenant */
  defaultNetworkAction: sandboxNetworkActionEnum("defaultNetworkAction"),

  /** Network egress allowlist rules (JSON array of {host, port} objects) */
  egressRulesJson: jsonb("egressRulesJson").$type<Array<{ host: string; port?: number }>>(),

  /** Allowed Docker images for this tenant (JSON array of image URIs) */
  allowedImagesJson: jsonb("allowedImagesJson").$type<string[]>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TenantSandboxPolicy = typeof tenantSandboxPolicies.$inferSelect;
export type InsertTenantSandboxPolicy = typeof tenantSandboxPolicies.$inferInsert;
```

### 2.3 Existing Table Extensions

These are all **nullable columns** added to existing tables. No data loss risk. Add these columns to the corresponding table definitions in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`:

#### `skills` table (around line 2289, before `createdAt`)

Add these 5 columns:

```typescript
  /** Sandbox profile slug for skills that require sandbox execution */
  sandboxProfileSlug: varchar("sandboxProfileSlug", { length: 64 }),

  /** Whether this skill needs network access in sandbox */
  requiresNetwork: boolean("requiresNetwork"),

  /** Whether this skill needs browser automation in sandbox */
  requiresBrowser: boolean("requiresBrowser"),

  /** Maximum runtime for this skill in seconds (overrides profile default) */
  maxRuntimeSeconds: integer("maxRuntimeSeconds"),

  /** Maximum input file size in MB (overrides profile default) */
  maxInputMb: integer("maxInputMb"),
```

#### `media_callback_events` table (around line 1506, before `createdAt`)

```typescript
  /** Associated sandbox job ID (if media was processed in sandbox) */
  sandboxJobId: varchar("sandbox_job_id", { length: 36 }),
```

Note: This table uses snake_case column naming convention (unlike the camelCase tables). Follow the existing convention.

#### `presentation_conversion_records` table (around line 1867, before `expiresAt`)

```typescript
  /** Associated sandbox job ID (if conversion ran in sandbox) */
  sandboxJobId: varchar("sandbox_job_id", { length: 36 }),
```

Note: This table also uses snake_case column naming. Follow the existing convention.

#### `api_audit_events` table (around line 594, before `createdAt`)

```typescript
  /** Associated sandbox job ID */
  sandboxJobId: varchar("sandboxJobId", { length: 36 }),

  /** OpenSandbox container ID for correlation */
  opensandboxId: varchar("opensandboxId", { length: 128 }),
```

Note: This table uses camelCase. Follow the existing convention.

#### `workflow_executions` table (around line 3310, before `createdAt`)

```typescript
  /** Sandbox job IDs used during this workflow execution */
  sandboxJobIds: jsonb("sandboxJobIds").$type<string[]>().default([]),
```

Note: This table uses camelCase. Follow the existing convention.

### 2.4 SQLAlchemy Models for Python Backend

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/models/sandbox.py`

Create this file with 4 SQLAlchemy model classes. The Python backend reads from the same PostgreSQL database; Drizzle creates the tables and Python maps to them.

Important column name mapping: Drizzle's `pgTable` definitions use JavaScript property names as column aliases, but the actual database column names may differ. Study the pattern in each table:
- Tables like `skills`, `apiAuditEvents`, `workflowExecutions` use **camelCase** in the database (the Drizzle property name IS the column name)
- Tables like `media_callback_events`, `presentation_conversion_records` use **snake_case** explicitly in the column definition string

The sandbox tables defined above use camelCase column names (matching the majority of the schema). The SQLAlchemy models must use the exact database column names.

```python
"""
Sandbox execution models for OpenSandbox integration.

Maps to tables created by Drizzle ORM migrations:
- sandbox_profiles
- sandbox_jobs
- sandbox_artifacts
- tenant_sandbox_policies
"""
import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class SandboxExecutionMode(str, enum.Enum):
    """Execution mode for sandbox jobs."""
    CODE = "code"
    COMMAND = "command"
    BROWSER = "browser"
    FILE = "file"
    MEDIA = "media"


class SandboxJobStatus(str, enum.Enum):
    """Lifecycle status for sandbox jobs."""
    ACCEPTED = "accepted"
    POLICY_RESOLVED = "policy_resolved"
    QUEUED = "queued"
    PROVISIONING = "provisioning"
    STAGING_INPUTS = "staging_inputs"
    EXECUTING = "executing"
    COLLECTING_OUTPUTS = "collecting_outputs"
    PERSISTING = "persisting"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELED = "canceled"


class SandboxArtifactType(str, enum.Enum):
    """Classification for sandbox output artifacts."""
    PRIMARY = "primary"
    LOG = "log"
    SCREENSHOT = "screenshot"
    THUMBNAIL = "thumbnail"
    CHUNK = "chunk"
    DEBUG = "debug"


class SandboxFeatureType(str, enum.Enum):
    """Which SmartSpecPro feature triggered the sandbox job."""
    CHAT = "chat"
    SKILL = "skill"
    WORKFLOW = "workflow"
    LIBRARY = "library"
    MEDIA = "media"
    PRESENTATION = "presentation"
    CONNECTOR = "connector"


class SandboxProfile(Base):
    """Reusable sandbox runtime configuration profiles."""

    __tablename__ = "sandbox_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Column name matches Drizzle's camelCase convention
    execution_mode = Column("executionMode", String(16), nullable=False)
    base_image = Column("baseImage", String(512), nullable=False)
    entrypoint_template = Column("entrypointTemplate", Text, nullable=True)

    cpu_limit = Column("cpuLimit", String(16), nullable=False, default="1000m")
    memory_limit_mb = Column("memoryLimitMb", Integer, nullable=False, default=2048)
    ephemeral_disk_mb = Column("ephemeralDiskMb", Integer, nullable=False, default=5120)
    timeout_seconds = Column("timeoutSeconds", Integer, nullable=False, default=300)

    network_default_action = Column("networkDefaultAction", String(8), nullable=False, default="deny")
    allow_browser = Column("allowBrowser", Boolean, nullable=False, default=False)
    allow_command = Column("allowCommand", Boolean, nullable=False, default=False)
    allow_code_interpreter = Column("allowCodeInterpreter", Boolean, nullable=False, default=False)
    allow_file_upload = Column("allowFileUpload", Boolean, nullable=False, default=True)

    max_input_mb = Column("maxInputMb", Integer, nullable=True, default=50)
    max_output_mb = Column("maxOutputMb", Integer, nullable=True, default=100)

    is_active = Column("isActive", Boolean, nullable=False, default=True)
    version = Column(Integer, nullable=False, default=1)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "slug": self.slug,
            "name": self.name,
            "description": self.description,
            "executionMode": self.execution_mode,
            "baseImage": self.base_image,
            "cpuLimit": self.cpu_limit,
            "memoryLimitMb": self.memory_limit_mb,
            "ephemeralDiskMb": self.ephemeral_disk_mb,
            "timeoutSeconds": self.timeout_seconds,
            "networkDefaultAction": self.network_default_action,
            "allowBrowser": self.allow_browser,
            "allowCommand": self.allow_command,
            "allowCodeInterpreter": self.allow_code_interpreter,
            "allowFileUpload": self.allow_file_upload,
            "maxInputMb": self.max_input_mb,
            "maxOutputMb": self.max_output_mb,
            "isActive": self.is_active,
            "version": self.version,
        }


class SandboxJob(Base):
    """Canonical execution record for a sandbox job."""

    __tablename__ = "sandbox_jobs"

    id = Column(String(36), primary_key=True)  # UUID
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", Integer, ForeignKey("users.id"), nullable=False)

    feature_type = Column("featureType", String(16), nullable=False)
    feature_ref_id = Column("featureRefId", String(128), nullable=True)
    execution_mode = Column("executionMode", String(16), nullable=False)

    sandbox_profile_id = Column("sandboxProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
    opensandbox_id = Column("opensandboxId", String(128), nullable=True)

    status = Column(String(24), nullable=False, default=SandboxJobStatus.ACCEPTED.value)
    status_reason = Column("statusReason", Text, nullable=True)

    image_uri = Column("imageUri", String(512), nullable=True)
    input_manifest_json = Column("inputManifestJson", JSONB, nullable=True)
    output_manifest_json = Column("outputManifestJson", JSONB, nullable=True)

    stdout_excerpt = Column("stdoutExcerpt", Text, nullable=True)
    stderr_excerpt = Column("stderrExcerpt", Text, nullable=True)

    cost_estimate = Column("costEstimate", Numeric(12, 4), nullable=True)
    cost_actual = Column("costActual", Numeric(12, 4), nullable=True)
    idempotency_key = Column("idempotencyKey", String(128), nullable=True)

    started_at = Column("startedAt", DateTime(timezone=True), nullable=True)
    finished_at = Column("finishedAt", DateTime(timezone=True), nullable=True)
    expires_at = Column("expiresAt", DateTime(timezone=True), nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("sandbox_jobs_tenant_status_idx", "tenantId", "status"),
        Index("sandbox_jobs_opensandbox_id_idx", "opensandboxId"),
        Index("sandbox_jobs_user_idx", "userId"),
        Index("sandbox_jobs_created_idx", "createdAt"),
        Index("sandbox_jobs_expires_idx", "expiresAt"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "tenantId": self.tenant_id,
            "userId": self.user_id,
            "featureType": self.feature_type,
            "featureRefId": self.feature_ref_id,
            "executionMode": self.execution_mode,
            "sandboxProfileId": self.sandbox_profile_id,
            "opensandboxId": self.opensandbox_id,
            "status": self.status,
            "statusReason": self.status_reason,
            "costEstimate": str(self.cost_estimate) if self.cost_estimate else None,
            "costActual": str(self.cost_actual) if self.cost_actual else None,
            "startedAt": self.started_at.isoformat() + "Z" if self.started_at else None,
            "finishedAt": self.finished_at.isoformat() + "Z" if self.finished_at else None,
            "createdAt": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


class SandboxArtifact(Base):
    """Output file record from a sandbox job."""

    __tablename__ = "sandbox_artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sandbox_job_id = Column("sandboxJobId", String(36), ForeignKey("sandbox_jobs.id", ondelete="CASCADE"), nullable=False)

    artifact_type = Column("artifactType", String(16), nullable=False)
    object_key = Column("objectKey", String(512), nullable=False)
    mime_type = Column("mimeType", String(128), nullable=True)
    size_bytes = Column("sizeBytes", BigInteger, nullable=True)
    sha256 = Column(String(64), nullable=True)
    is_primary = Column("isPrimary", Boolean, nullable=False, default=False)
    metadata_json = Column("metadataJson", JSONB, nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("sandbox_artifacts_job_idx", "sandboxJobId"),
        Index("sandbox_artifacts_type_idx", "artifactType"),
    )

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "sandboxJobId": self.sandbox_job_id,
            "artifactType": self.artifact_type,
            "objectKey": self.object_key,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "sha256": self.sha256,
            "isPrimary": self.is_primary,
        }


class TenantSandboxPolicy(Base):
    """Per-tenant sandbox usage limits and configuration."""

    __tablename__ = "tenant_sandbox_policies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column("tenantId", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)

    default_profile_id = Column("defaultProfileId", Integer, ForeignKey("sandbox_profiles.id"), nullable=True)
    max_concurrent_sandboxes = Column("maxConcurrentSandboxes", Integer, nullable=False, default=5)
    max_daily_runtime_seconds = Column("maxDailyRuntimeSeconds", Integer, nullable=False, default=36000)
    max_single_job_seconds = Column("maxSingleJobSeconds", Integer, nullable=False, default=1800)

    default_network_action = Column("defaultNetworkAction", String(8), nullable=True)
    egress_rules_json = Column("egressRulesJson", JSONB, nullable=True)
    allowed_images_json = Column("allowedImagesJson", JSONB, nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column("updatedAt", DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "tenantId": self.tenant_id,
            "defaultProfileId": self.default_profile_id,
            "maxConcurrentSandboxes": self.max_concurrent_sandboxes,
            "maxDailyRuntimeSeconds": self.max_daily_runtime_seconds,
            "maxSingleJobSeconds": self.max_single_job_seconds,
            "defaultNetworkAction": self.default_network_action,
        }
```

### 2.5 Update Python Model Registry

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/models/__init__.py`

Add imports for the new sandbox models:

```python
# Sandbox execution
from .sandbox import (
    SandboxProfile,
    SandboxJob,
    SandboxArtifact,
    TenantSandboxPolicy,
    SandboxExecutionMode,
    SandboxJobStatus,
    SandboxArtifactType,
    SandboxFeatureType,
)
```

Add to the `__all__` list:

```python
    # Sandbox
    "SandboxProfile",
    "SandboxJob",
    "SandboxArtifact",
    "TenantSandboxPolicy",
    "SandboxExecutionMode",
    "SandboxJobStatus",
    "SandboxArtifactType",
    "SandboxFeatureType",
```

### 2.6 Update Python Database Initialization

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py`

In the `init_db()` function, add `sandbox` to the model imports so SQLAlchemy recognizes the new tables:

```python
from app.models import (
    # ... existing imports ...
    sandbox,  # OpenSandbox integration models
)
```

### 2.7 Seed Script for Baseline Profiles

**File**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/seedSandboxProfiles.ts`

Create a seed script that inserts the 4 baseline sandbox profiles. Use the `ON CONFLICT DO NOTHING` pattern (matching the existing `seed.ts` approach) for idempotency.

The 4 profiles and their key configuration values:

| Slug | Execution Mode | CPU | Memory (MB) | Timeout (s) | Disk (MB) | Network | Browser | Command | Code Interpreter |
|------|---------------|-----|-------------|-------------|-----------|---------|---------|---------|-----------------|
| `code-default` | code | 1000m | 2048 | 600 | 5120 | deny | no | no | yes |
| `media-processing` | media | 2000m | 4096 | 1800 | 10240 | deny | no | yes | no |
| `browser-default` | browser | 2000m | 4096 | 600 | 5120 | allow | yes | yes | no |
| `file-parser` | file | 1000m | 2048 | 300 | 5120 | deny | no | yes | no |

The `baseImage` field for each profile should use a reasonable default Docker image:
- `code-default`: `"python:3.11-slim"` (code interpreter)
- `media-processing`: `"jrottenberg/ffmpeg:6-ubuntu"` (FFmpeg)
- `browser-default`: `"mcr.microsoft.com/playwright:v1.40.0-jammy"` (Playwright)
- `file-parser`: `"python:3.11-slim"` (document parsers)

The seed script structure:

```typescript
/**
 * Seed script for baseline sandbox profiles.
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
 *
 * Usage: npx tsx drizzle/seedSandboxProfiles.ts
 */
import { getDb } from "../server/db";
import { sandboxProfiles } from "./schema";

const BASELINE_PROFILES = [
  // ... 4 profile objects with all fields ...
];

export async function seedSandboxProfiles(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available");
    return;
  }

  for (const profile of BASELINE_PROFILES) {
    await db
      .insert(sandboxProfiles)
      .values(profile)
      .onConflictDoNothing({ target: sandboxProfiles.slug });
  }

  console.log(`[Seed] Sandbox profiles seeded (${BASELINE_PROFILES.length} profiles)`);
}
```

### 2.8 Migration Execution

Follow the Database Safety Protocol from the project CLAUDE.md. Since this migration only creates new tables and adds nullable columns to existing tables, it is LOW risk.

**Steps:**

1. Verify row counts of existing tables being extended (skills, media_callback_events, presentation_conversion_records, api_audit_events, workflow_executions)
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push`
3. Verify the 4 new tables exist
4. Verify existing table row counts are unchanged
5. Verify new nullable columns exist on extended tables
6. Run the seed script to insert baseline profiles
7. Verify 4 rows in sandbox_profiles

No backup of existing data is strictly necessary since we are only adding tables and nullable columns. However, the implementer should still record row counts before migration as a safety check.

---

## Files Summary

| Action | File Path |
|--------|-----------|
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` -- Add 5 enums, 4 tables, extend 5 existing tables |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/seedSandboxProfiles.ts` -- Seed 4 baseline profiles |
| **Create** | `/home/dev/projects/SmartSpecPro/python-backend/app/models/sandbox.py` -- 4 SQLAlchemy model classes + 4 enum classes |
| **Modify** | `/home/dev/projects/SmartSpecPro/python-backend/app/models/__init__.py` -- Import and export sandbox models |
| **Modify** | `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py` -- Add sandbox to init_db imports |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/sandbox-schema.test.ts` -- Schema definition tests |
| **Create** | `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_models.py` -- SQLAlchemy model tests |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/sandbox-seed.test.ts` -- Seed data tests |

---

## Critical Notes for the Implementer

1. **Column naming convention**: The existing schema is NOT consistent. Some tables use camelCase column names (skills, apiAuditEvents, workflowExecutions), while others use snake_case (media_callback_events, presentation_conversion_records). When extending a table, match its existing convention. The 4 new tables should use camelCase to match the majority pattern.

2. **Drizzle `sql` import**: The idempotency index on `sandbox_jobs` uses a `.where()` clause with `sql` template literal. Make sure `sql` is imported from `drizzle-orm` (it is already imported on line 2 of the existing schema file).

3. **`jsonb` vs `json`**: Use `jsonb` (not `json`) for the manifest and rules columns. This is already imported in the existing schema. JSONB supports indexing and is preferred for structured data.

4. **Migration is mandatory immediately**: After editing `schema.ts`, run `pnpm db:push` before doing any other work. An un-migrated schema change will crash at runtime when any code path touches the affected tables.

5. **SQLAlchemy column name mapping**: The SQLAlchemy models use `Column("databaseColumnName", ...)` syntax where the first positional string argument is the actual database column name. The Python attribute name uses snake_case for Pythonic access. For example: `tenant_id = Column("tenantId", String(36), ...)` maps the Python attribute `tenant_id` to the database column `tenantId`.

6. **No Alembic migration needed**: The Python backend does not manage schema changes. Drizzle on the Node.js side creates and migrates all tables. The SQLAlchemy models are read-only mappings to the existing tables. However, `Base.metadata.create_all` in `init_db()` must not conflict with the Drizzle-created tables -- SQLAlchemy's `create_all` only creates tables that do not already exist, so this is safe.

## Implementation Notes (Actual)

### Files Created/Modified
- **MODIFIED**: `apps/web/drizzle/schema.ts` -- 5 enums, 4 tables, 5 table extensions
- **CREATED**: `apps/web/drizzle/seedSandboxProfiles.ts` -- 4 baseline profiles with ON CONFLICT DO NOTHING
- **CREATED**: `apps/web/drizzle/0040_yellow_silhouette.sql` -- Migration SQL (109 statements)
- **CREATED**: `python-backend/app/models/sandbox.py` -- 4 models + 5 enums (including SandboxNetworkAction)
- **MODIFIED**: `python-backend/app/models/__init__.py` -- Exports all 4 models + 5 enums
- **MODIFIED**: `python-backend/app/core/database.py` -- Added sandbox import to init_db
- **CREATED**: `apps/web/server/sandbox-schema.test.ts` -- 26 TS tests
- **CREATED**: `apps/web/server/sandbox-seed.test.ts` -- 7 TS tests
- **CREATED**: `python-backend/tests/test_sandbox_models.py` -- 19 Python tests

### Deviations from Plan
1. **Added `SandboxNetworkAction` Python enum**: Plan specified only 4 Python enums. Code review identified the gap -- added 5th enum for network action validation.
2. **Used `datetime.now(timezone.utc)` instead of `datetime.utcnow`**: Plan didn't specify. Code review identified deprecated API. Fixed for Python 3.12+ compatibility.
3. **Removed `+ "Z"` from `to_dict()` isoformat calls**: Code review identified malformed ISO 8601 output when timezone-aware datetimes include offset.
4. **Migration required manual table drop**: A prior `drizzle-kit push` had created the tables with varchar columns instead of enum types. Had to drop empty tables and re-apply migration.
5. **Seed run via SQL**: The seed script's `getDb()` returns null outside app context. Seed data applied via direct SQL INSERT.

### Test Results
- TypeScript: 33 tests pass (26 schema + 7 seed)
- Python: 19 tests pass (4 model classes + 5 enums + network action)
- Post-migration row counts verified: skills=15, media_callback_events=1, workflow_executions=15 (unchanged)
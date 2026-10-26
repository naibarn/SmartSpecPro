import { describe, expect, it } from "vitest";
import {
  buildDevActiveSchemaBaseline,
  selectDevMigrationProfile,
  shouldBootstrapDevActiveSchema,
  validateDevActiveSchemaTarget,
} from "../devActiveSchemaBaseline";

describe("development active schema baseline", () => {
  it("orders extensions, sequences, tables, indexes, foreign keys, and security DDL", () => {
    const sql = buildDevActiveSchemaBaseline({
      schema: {
        tables: {
          tenant: {
            name: "tenants",
            columns: {
              id: { name: "id", type: "varchar", default: undefined },
              serial: { name: "serial", type: "int4", default: "nextval('tenants_serial_seq'::regclass)" },
            },
            foreignKeys: {},
          },
          retired: {
            name: "workflow_templates",
            columns: { id: { name: "id", type: "int4" } },
            foreignKeys: {},
          },
          located: {
            name: "located",
            columns: { point: { name: "point", type: "geography(Point,4326)" } },
            foreignKeys: {},
          },
        },
        enums: {},
      },
      migrationStatements: [
        'CREATE TABLE "tenants" ("id" varchar PRIMARY KEY, "serial" int4 DEFAULT nextval(\'tenants_serial_seq\'::regclass));',
        'CREATE TABLE "located" ("point" "geography(Point,4326)");',
        'CREATE INDEX "tenants_id_idx" ON "tenants" USING btree ("id");',
        'ALTER TABLE "tenants" ADD CONSTRAINT "tenants_fk" FOREIGN KEY ("id") REFERENCES "other"("id");',
      ],
      securityStatements: [
        'ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;',
        'CREATE TRIGGER "tenants_immutable" BEFORE UPDATE ON "tenants" FOR EACH ROW EXECUTE FUNCTION reject_tenant_update();',
      ],
    });
    const parts = [
      "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
      'CREATE SEQUENCE IF NOT EXISTS "public"."tenants_serial_seq";',
      'CREATE TABLE "tenants"',
      'CREATE INDEX "tenants_id_idx"',
      'ALTER TABLE "tenants" ADD CONSTRAINT "tenants_fk"',
      'ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;',
      'CREATE TRIGGER "tenants_immutable"',
    ];
    const positions = parts.map(part => sql.indexOf(part));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(sql).not.toContain("workflow_templates");
    expect(sql).toContain('"point" geography(Point,4326)');
    expect(sql).not.toContain('"geography(Point,4326)"');
  });

  it("bootstraps only an empty, marked development database", () => {
    expect(shouldBootstrapDevActiveSchema({
      nodeEnv: "development",
      environment: "development",
      databaseMode: "development",
      databaseName: "smartspec_dev",
      applicationTableCount: 0,
      migrationCount: 0,
    })).toBe(true);
    expect(shouldBootstrapDevActiveSchema({
      nodeEnv: "development",
      environment: "development",
      databaseMode: "development",
      databaseName: "smartspec_dev",
      applicationTableCount: 1,
      migrationCount: 0,
    })).toBe(false);
    expect(shouldBootstrapDevActiveSchema({
      nodeEnv: "production",
      environment: "production",
      databaseMode: "development",
      databaseName: "smartspec_dev",
      applicationTableCount: 0,
      migrationCount: 0,
    })).toBe(false);
  });

  it("refuses non-loopback and non-development targets", () => {
    expect(() => validateDevActiveSchemaTarget({
      NODE_ENV: "development",
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
      DATABASE_URL: "postgresql://user@localhost/smartspec_dev",
    })).not.toThrow();
    expect(() => validateDevActiveSchemaTarget({
      NODE_ENV: "production",
      SMARTSPEC_ENVIRONMENT: "production",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
      DATABASE_URL: "postgresql://user@localhost/smartspec",
    })).toThrow("DEV_ACTIVE_SCHEMA_TARGET_REQUIRED");
    expect(() => validateDevActiveSchemaTarget({
      NODE_ENV: "development",
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
      DATABASE_URL: "postgresql://user@remote.example/smartspec_dev",
    })).toThrow("DEV_ACTIVE_SCHEMA_TARGET_REQUIRED");
  });

  it("selects the active-contract bootstrap only for an empty marked dev database", () => {
    expect(selectDevMigrationProfile({
      nodeEnv: "development",
      environment: "development",
      databaseMode: "development",
      databaseName: "smartspec_dev",
      applicationTableCount: 0,
      migrationCount: 0,
    })).toBe("dev-active-baseline");
    expect(selectDevMigrationProfile({
      nodeEnv: "development",
      environment: "development",
      databaseMode: "development",
      databaseName: "smartspec_dev",
      applicationTableCount: 4,
      migrationCount: 0,
    })).toBe("canonical");
    expect(selectDevMigrationProfile({
      nodeEnv: "development",
      environment: "development",
      databaseMode: "development",
      databaseName: "smartspec_dev",
      applicationTableCount: 583,
      migrationCount: 1,
      baselineApplied: true,
    })).toBe("dev-active-baseline");
    expect(selectDevMigrationProfile({
      nodeEnv: "production",
      environment: "production",
      databaseMode: "production",
      databaseName: "smartspec",
      applicationTableCount: 0,
      migrationCount: 0,
    })).toBe("canonical");
  });
});

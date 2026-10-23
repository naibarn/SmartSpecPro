import { describe, expect, it } from "vitest";
import {
  compareDrizzleCatalog,
  normalizeCheck,
} from "../audit-drizzle-catalog";

describe("Drizzle catalog reconciliation", () => {
  it("reports missing, extra, and conflicting objects without inferring application from the ledger", () => {
    const expected = {
      tables: {
        "public.accounts": {
          name: "accounts",
          columns: {
            id: { name: "id", type: "serial", notNull: true },
            owner_id: { name: "owner_id", type: "integer", notNull: true },
          },
          indexes: { accounts_owner_unique: { name: "accounts_owner_unique" } },
          foreignKeys: { accounts_owner_fk: { name: "accounts_owner_fk" } },
          uniqueConstraints: {},
          checkConstraints: {},
          compositePrimaryKeys: {},
        },
        "public.missing_table": {
          name: "missing_table",
          columns: {},
          indexes: {},
          foreignKeys: {},
          uniqueConstraints: {},
          checkConstraints: {},
          compositePrimaryKeys: {},
        },
      },
      enums: {
        "public.account_state": {
          name: "account_state",
          values: ["active", "disabled"],
        },
      },
    };
    const actual = {
      tables: ["accounts", "legacy_accounts"],
      columns: [
        {
          tableName: "accounts",
          columnName: "id",
          type: "integer",
          notNull: true,
          defaultValue: "nextval('accounts_id_seq'::regclass)",
        },
        {
          tableName: "accounts",
          columnName: "owner_id",
          type: "text",
          notNull: true,
          defaultValue: null,
        },
      ],
      indexes: [],
      constraints: [],
      enums: [{ name: "account_state", values: ["active"] }],
    };

    expect(compareDrizzleCatalog(expected, actual)).toMatchObject({
      missingTables: ["missing_table"],
      extraTables: ["legacy_accounts"],
      conflictingColumns: [
        {
          object: "accounts.owner_id",
          expected: { type: "integer", notNull: true },
          actual: { type: "text", notNull: true },
        },
      ],
      missingIndexes: ["accounts_owner_unique"],
      missingConstraints: ["accounts.accounts_owner_fk"],
      conflictingEnums: [
        {
          name: "account_state",
          expected: ["active", "disabled"],
          actual: ["active"],
        },
      ],
    });
  });

  it("normalizes PostgreSQL aliases while still flagging schema differences", () => {
    const expected = {
      tables: {
        "public.users": {
          name: "users",
          columns: { id: { name: "id", type: "serial", notNull: true } },
          indexes: {},
          foreignKeys: {},
          uniqueConstraints: {},
          checkConstraints: {},
          compositePrimaryKeys: {},
        },
      },
      enums: {},
    };
    const actual = {
      tables: ["users"],
      columns: [
        {
          tableName: "users",
          columnName: "id",
          type: "integer",
          notNull: true,
          defaultValue: null,
        },
      ],
      indexes: [],
      constraints: [],
      enums: [],
    };
    expect(compareDrizzleCatalog(expected, actual).conflictingColumns).toEqual(
      []
    );
  });

  it("normalizes equivalent catalog check definitions while preserving different literals", () => {
    expect(
      normalizeCheck("\"app_identities\".\"lifecycle\" IN ('draft', 'active')")
    ).toBe(
      normalizeCheck(
        "CHECK (lifecycle::text = ANY (ARRAY['draft'::character varying, 'active'::character varying]::text[]))"
      )
    );
    expect(
      normalizeCheck("CHECK (visibility IN ('private', 'public'))")
    ).not.toBe(normalizeCheck("CHECK (visibility IN ('private', 'shared'))"));
  });

  it("matches renamed foreign keys by structure and named checks by normalized expression", () => {
    const expected = {
      tables: {
        "public.accounts": {
          name: "accounts",
          columns: {},
          indexes: {},
          uniqueConstraints: {},
          compositePrimaryKeys: {},
          foreignKeys: {
            accounts_owner_fk: {
              name: "accounts_owner_fk",
              tableFrom: "accounts",
              tableTo: "users",
              columnsFrom: ["owner_id"],
              columnsTo: ["id"],
              onDelete: "cascade",
              onUpdate: "no action",
            },
          },
          checkConstraints: {
            accounts_status_check: {
              name: "accounts_status_check",
              value: "\"accounts\".\"status\" IN ('active', 'disabled')",
            },
          },
        },
      },
      enums: {},
    };
    const actual = {
      tables: ["accounts"],
      columns: [],
      indexes: [],
      enums: [],
      constraints: [
        {
          tableName: "accounts",
          constraintName: "accounts_owner_id_fkey",
          type: "f",
          columns: ["owner_id"],
          referencedTable: "users",
          referencedColumns: ["id"],
          onDelete: "cascade",
          onUpdate: "no action",
          definition: "FOREIGN KEY",
        },
        {
          tableName: "accounts",
          constraintName: "accounts_status_check",
          type: "c",
          columns: [],
          referencedTable: null,
          referencedColumns: [],
          onDelete: null,
          onUpdate: null,
          definition:
            "CHECK (status::text = ANY (ARRAY['active'::text, 'disabled'::text]::text[]))",
        },
      ],
    };
    expect(compareDrizzleCatalog(expected, actual)).toMatchObject({
      missingConstraints: [],
      extraConstraints: [],
      conflictingConstraints: [],
    });
  });
});

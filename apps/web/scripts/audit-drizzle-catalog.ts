import "dotenv/config";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

type CatalogObject = {
  name: string;
  schema?: string;
  columns?: Record<
    string,
    {
      name: string;
      type: string;
      notNull?: boolean;
      default?: string | number | boolean;
    }
  >;
  indexes?: Record<string, { name: string }>;
  foreignKeys?: Record<string, { name: string }>;
  uniqueConstraints?: Record<string, { name: string }>;
  checkConstraints?: Record<string, { name: string }>;
  compositePrimaryKeys?: Record<string, { name: string }>;
};

type SchemaSnapshot = {
  tables: Record<string, CatalogObject>;
  enums: Record<string, { name: string; schema?: string; values: string[] }>;
};

export type CatalogSnapshot = {
  tables: string[];
  columns: Array<{
    tableName: string;
    columnName: string;
    type: string;
    notNull: boolean;
    defaultValue: string | null;
  }>;
  indexes: Array<{
    tableName: string;
    indexName: string;
    constraintBacked: boolean;
  }>;
  constraints: Array<{
    tableName: string;
    constraintName: string;
    type: string;
    columns: string[];
    referencedTable: string | null;
    referencedColumns: string[];
    onDelete: string | null;
    onUpdate: string | null;
    definition: string;
  }>;
  enums: Array<{ name: string; values: string[] }>;
};

const normalizeType = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("character varying", "varchar")
    .replaceAll("timestamp without time zone", "timestamp")
    .replaceAll("timestamp with time zone", "timestamptz")
    .replaceAll("double precision", "float8")
    .replaceAll("integer", "int4")
    .replaceAll("bigint", "int8")
    .replaceAll("smallint", "int2")
    .replaceAll("bigserial", "int8")
    .replaceAll("serial", "int4")
    .replace(/,\s+/g, ",")
    .replaceAll(/\s+/g, " ")
    .trim();

const normalizeExpression = (
  raw: string | number | boolean | undefined | null
) =>
  String(raw ?? "")
    .replace(
      /::(?:character varying|varchar|text|timestamp with time zone|timestamp without time zone|integer|bigint|smallint|boolean|regclass|jsonb|[a-z_][a-z0-9_.]*)(?:\[\])?/gi,
      ""
    )
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .replace(/^\((.*)\)$/s, "$1")
    .trim();

export function normalizeCheck(raw: string) {
  let value = raw
    .trim()
    .replace(/^CHECK\s*/i, "")
    .replace(/"([^"]+)"/g, "$1")
    .replace(/\b[a-z0-9_]+\./gi, "");
  const unwrap = (input: string) => {
    if (!input.startsWith("(") || !input.endsWith(")")) return input;
    let depth = 0;
    let inString = false;
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (char === "'" && input[index - 1] !== "\\") inString = !inString;
      if (inString) continue;
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0 && index < input.length - 1) return input;
    }
    return input.slice(1, -1).trim();
  };
  value = unwrap(value);
  value = value.replace(
    /([a-z0-9_.]+)(?:::text)?\s*=\s*ANY\s*\(\s*ARRAY\[(.*?)\](?:::[a-z0-9_]+\[\])?\s*\)/gis,
    (_match, column: string, items: string) => {
      const normalizedItems = items.replace(
        /::(?:character varying|varchar|text|[a-z_][a-z0-9_.]*)\b/gi,
        ""
      );
      return `${column} IN (${normalizedItems})`;
    }
  );
  value = normalizeExpression(value).replace(/"([^"]+)"/g, "$1");
  value = value
    .split(/('(?:''|[^'])*')/g)
    .map(part => (part.startsWith("'") ? part : part.toLowerCase()))
    .join("");
  return value;
}

const objectNames = (value: Record<string, { name: string }> | undefined) =>
  Object.keys(value ?? {}).sort();

export function compareDrizzleCatalog(
  expected: SchemaSnapshot,
  actual: CatalogSnapshot
) {
  const actualTables = new Map(actual.tables.map(name => [name, true]));
  const actualColumns = new Map(
    actual.columns.map(column => [
      `${column.tableName}.${column.columnName}`,
      column,
    ])
  );
  const actualIndexes = new Map(
    actual.indexes.map(index => [index.indexName, index])
  );
  const actualEnums = new Map(
    actual.enums.map(enumType => [enumType.name, enumType])
  );
  const expectedTableNames = Object.entries(expected.tables).map(
    ([key, table]) =>
      key.startsWith("public.")
        ? table.name
        : (key.split(".").at(-1) ?? table.name)
  );
  const missingTables: string[] = [];
  const extraTables = actual.tables
    .filter(name => !expectedTableNames.includes(name))
    .sort();
  const missingColumns: string[] = [];
  const extraColumns: string[] = [];
  const conflictingColumns: Array<{
    object: string;
    expected: { type: string; notNull: boolean };
    actual: { type: string; notNull: boolean };
  }> = [];
  const conflictingDefaults: Array<{
    object: string;
    expected: string;
    actual: string | null;
  }> = [];
  const missingIndexes: string[] = [];
  const extraIndexes: string[] = [];
  const expectedConstraintSignatures = new Set<string>();
  const expectedConstraintLabels = new Map<string, string>();
  const missingConstraints: string[] = [];
  const extraConstraints: string[] = [];
  const conflictingConstraints: Array<{
    object: string;
    expected: string;
    actual: string;
  }> = [];
  const expectedCheckNames = new Map<
    string,
    { label: string; value: string }
  >();
  const expectedTableNameSet = new Set(expectedTableNames);
  const missingEnums: string[] = [];
  const extraEnums: string[] = actual.enums
    .map(enumType => enumType.name)
    .filter(
      name =>
        !expected.enums[`public.${name}`] &&
        !Object.values(expected.enums).some(enumType => enumType.name === name)
    )
    .sort();
  const conflictingEnums: Array<{
    name: string;
    expected: string[];
    actual: string[];
  }> = [];

  for (const [key, table] of Object.entries(expected.tables)) {
    const tableName = table.name || key.split(".").at(-1) || key;
    if (!actualTables.has(tableName)) {
      missingTables.push(tableName);
      continue;
    }
    for (const [columnName, column] of Object.entries(table.columns ?? {})) {
      const object = `${tableName}.${columnName}`;
      const found = actualColumns.get(object);
      if (!found) {
        missingColumns.push(object);
      } else if (
        normalizeType(found.type) !== normalizeType(column.type) ||
        found.notNull !== Boolean(column.notNull)
      ) {
        conflictingColumns.push({
          object,
          expected: { type: column.type, notNull: Boolean(column.notNull) },
          actual: { type: found.type, notNull: found.notNull },
        });
      } else if (
        column.default !== undefined &&
        !defaultsEqual(column.default, found.defaultValue, column.type)
      ) {
        conflictingDefaults.push({
          object,
          expected: String(column.default),
          actual: found.defaultValue,
        });
      }
    }
    for (const indexName of objectNames(table.indexes))
      if (!actualIndexes.has(indexName)) missingIndexes.push(indexName);
    const expectedColumns = new Set(
      Object.keys(table.columns ?? {}).map(
        columnName => `${tableName}.${columnName}`
      )
    );
    for (const column of actual.columns)
      if (
        column.tableName === tableName &&
        !expectedColumns.has(`${tableName}.${column.columnName}`)
      )
        extraColumns.push(`${tableName}.${column.columnName}`);
    const expectedIndexes = new Set(objectNames(table.indexes));
    for (const index of actual.indexes)
      if (
        index.tableName === tableName &&
        !index.constraintBacked &&
        !expectedIndexes.has(index.indexName)
      )
        extraIndexes.push(index.indexName);
    for (const [name, fk] of Object.entries(table.foreignKeys ?? {})) {
      addExpectedConstraint(
        expectedConstraintSignatures,
        expectedConstraintLabels,
        signature({
          type: "f",
          tableName,
          columns: fk.columnsFrom ?? [],
          referencedTable: fk.tableTo,
          referencedColumns: fk.columnsTo ?? [],
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        }),
        `${tableName}.${name}`
      );
    }
    for (const [name, unique] of Object.entries(
      table.uniqueConstraints ?? {}
    )) {
      addExpectedConstraint(
        expectedConstraintSignatures,
        expectedConstraintLabels,
        signature({ type: "u", tableName, columns: unique.columns ?? [] }),
        `${tableName}.${name}`
      );
    }
    for (const [name, primaryKey] of Object.entries(
      table.compositePrimaryKeys ?? {}
    )) {
      addExpectedConstraint(
        expectedConstraintSignatures,
        expectedConstraintLabels,
        signature({ type: "p", tableName, columns: primaryKey.columns ?? [] }),
        `${tableName}.${name}`
      );
    }
    for (const [columnName, column] of Object.entries(table.columns ?? {})) {
      if (column.primaryKey)
        addExpectedConstraint(
          expectedConstraintSignatures,
          expectedConstraintLabels,
          signature({ type: "p", tableName, columns: [columnName] }),
          `${tableName}.${columnName}:primaryKey`
        );
    }
    for (const [name, check] of Object.entries(table.checkConstraints ?? {}))
      expectedCheckNames.set(`${tableName}.${name}`, {
        label: `${tableName}.${name}`,
        value: check.value,
      });
  }

  const actualConstraintSignatures = new Set(
    actual.constraints.map(constraint => signature(constraint))
  );
  for (const expectedSignature of expectedConstraintSignatures) {
    if (!actualConstraintSignatures.has(expectedSignature))
      missingConstraints.push(
        expectedConstraintLabels.get(expectedSignature) ?? expectedSignature
      );
  }
  for (const constraint of actual.constraints) {
    const label = `${constraint.tableName}.${constraint.constraintName}`;
    if (constraint.type === "c") {
      const check = expectedCheckNames.get(label);
      if (check) {
        if (
          normalizeCheck(check.value) !== normalizeCheck(constraint.definition)
        )
          conflictingConstraints.push({
            object: label,
            expected: check.value,
            actual: constraint.definition,
          });
      } else if (expectedTableNameSet.has(constraint.tableName))
        extraConstraints.push(label);
    } else if (
      expectedTableNameSet.has(constraint.tableName) &&
      !expectedConstraintSignatures.has(signature(constraint))
    ) {
      extraConstraints.push(label);
    }
  }
  for (const [label] of expectedCheckNames)
    if (
      !actual.constraints.some(
        constraint =>
          `${constraint.tableName}.${constraint.constraintName}` === label &&
          constraint.type === "c"
      )
    )
      missingConstraints.push(label);

  for (const [key, enumType] of Object.entries(expected.enums)) {
    const name = enumType.name || key.split(".").at(-1) || key;
    const found = actualEnums.get(name);
    if (!found) missingEnums.push(name);
    else if (
      JSON.stringify([...found.values].sort()) !==
      JSON.stringify([...enumType.values].sort())
    ) {
      conflictingEnums.push({
        name,
        expected: [...enumType.values].sort(),
        actual: [...found.values].sort(),
      });
    }
  }

  const sorted = <T extends string>(items: T[]) => items.sort();
  return {
    expectedTableCount: expectedTableNames.length,
    actualTableCount: actual.tables.length,
    expectedEnumCount: Object.keys(expected.enums).length,
    actualEnumCount: actual.enums.length,
    missingTables: sorted(missingTables),
    extraTables,
    missingColumns: sorted(missingColumns),
    extraColumns: sorted(extraColumns),
    conflictingColumns: conflictingColumns.sort((a, b) =>
      a.object.localeCompare(b.object)
    ),
    conflictingDefaults: conflictingDefaults.sort((a, b) =>
      a.object.localeCompare(b.object)
    ),
    missingIndexes: sorted(missingIndexes),
    extraIndexes: sorted(extraIndexes),
    missingConstraints: sorted(missingConstraints),
    extraConstraints: sorted(extraConstraints),
    conflictingConstraints: conflictingConstraints.sort((a, b) =>
      a.object.localeCompare(b.object)
    ),
    missingEnums: sorted(missingEnums),
    extraEnums,
    conflictingEnums: conflictingEnums.sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}

function signature(value: {
  type: string;
  tableName: string;
  columns: string[];
  referencedTable?: string | null;
  referencedColumns?: string[];
  onDelete?: string | null;
  onUpdate?: string | null;
  definition?: string;
}) {
  if (value.type === "f")
    return JSON.stringify([
      "f",
      value.tableName,
      value.columns,
      value.referencedTable,
      value.referencedColumns,
      (value.onDelete ?? "no action").toLowerCase(),
      (value.onUpdate ?? "no action").toLowerCase(),
    ]);
  if (value.type === "c")
    return JSON.stringify([
      "c",
      value.tableName,
      normalizeExpression(value.definition),
    ]);
  return JSON.stringify([value.type, value.tableName, value.columns]);
}

function defaultsEqual(
  expected: string | number | boolean,
  actual: string | null,
  type: string
) {
  const expectedText = normalizeExpression(expected);
  const actualText = normalizeExpression(actual);
  if (expectedText === actualText) return true;
  if (
    /^(?:numeric|decimal|int[248]?|smallint|integer|bigint|real|double precision|float[48])/.test(
      normalizeType(type)
    )
  ) {
    const canonicalNumber = (value: string) => {
      const unquoted = value.replace(/^'(-?\d+(?:\.\d+)?)'$/, "$1");
      const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(unquoted);
      if (!match) return null;
      const fraction = (match[3] ?? "").replace(/0+$/, "");
      const integer = match[2].replace(/^0+(?=\d)/, "");
      return `${match[1]}${integer}${fraction ? `.${fraction}` : ""}`;
    };
    const expectedNumber = canonicalNumber(expectedText);
    return (
      expectedNumber !== null && expectedNumber === canonicalNumber(actualText)
    );
  }
  if (/\bjsonb?\b/.test(type)) {
    try {
      const parse = (value: string) =>
        JSON.stringify(JSON.parse(value.replace(/^'(.*)'$/, "$1")));
      return parse(expectedText) === parse(actualText);
    } catch {
      return false;
    }
  }
  return false;
}

function addExpectedConstraint(
  signatures: Set<string>,
  labels: Map<string, string>,
  key: string,
  label: string
) {
  signatures.add(key);
  labels.set(key, label);
}

async function readCatalog(client: pg.Client): Promise<CatalogSnapshot> {
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  const columns = await client.query<
    CatalogSnapshot["columns"][number]
  >(`SELECT c.table_name AS "tableName", c.column_name AS "columnName", format_type(a.atttypid,a.atttypmod) AS type,
        a.attnotnull AS "notNull", pg_get_expr(d.adbin,d.adrelid) AS "defaultValue"
      FROM information_schema.columns c
      JOIN pg_namespace n ON n.nspname=c.table_schema
      JOIN pg_class r ON r.relnamespace=n.oid AND r.relname=c.table_name
      JOIN pg_attribute a ON a.attrelid=r.oid AND a.attname=c.column_name AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE c.table_schema='public' ORDER BY c.table_name,c.column_name`);
  const indexes = await client.query<
    CatalogSnapshot["indexes"][number]
  >(`SELECT p.tablename AS "tableName", p.indexname AS "indexName", (i.indisprimary OR con.oid IS NOT NULL) AS "constraintBacked"
      FROM pg_indexes p JOIN pg_class idx ON idx.relname=p.indexname JOIN pg_namespace ns ON ns.oid=idx.relnamespace AND ns.nspname=p.schemaname
      JOIN pg_index i ON i.indexrelid=idx.oid LEFT JOIN pg_constraint con ON con.conindid=idx.oid
      WHERE p.schemaname='public' ORDER BY p.indexname`);
  const constraints = await client.query<
    CatalogSnapshot["constraints"][number]
  >(`SELECT c.relname AS "tableName", con.conname AS "constraintName",
        CASE con.contype WHEN 'f' THEN 'f' WHEN 'u' THEN 'u' WHEN 'c' THEN 'c' WHEN 'p' THEN 'p' ELSE con.contype::text END AS type,
        COALESCE((SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum), '[]'::json) AS columns,
        CASE WHEN con.contype='f' THEN f.relname END AS "referencedTable",
        COALESCE((SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum), '[]'::json) AS "referencedColumns",
        CASE con.confdeltype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict' WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' END AS "onDelete",
        CASE con.confupdtype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict' WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' END AS "onUpdate",
        pg_get_constraintdef(con.oid,true) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_class f ON f.oid=con.confrelid
      WHERE n.nspname='public' ORDER BY con.conname`);
  const enums = await client.query<
    CatalogSnapshot["enums"][number]
  >(`SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`);
  return {
    tables: tables.rows.map(row => row.table_name),
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
    enums: enums.rows,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const snapshotBytes = await readFile(
    path.join(appRoot, "drizzle/meta/0410_snapshot.json")
  );
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as SchemaSnapshot;
  const sourceSha =
    process.env.GITHUB_SHA ??
    process.env.SOURCE_SHA ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: appRoot,
      encoding: "utf8",
    }).trim();
  const snapshotHash = createHash("sha256").update(snapshotBytes).digest("hex");
  const url = new URL(process.env.DATABASE_URL);
  const databaseTargetId = createHash("sha256")
    .update(`${url.host}${url.pathname}`)
    .digest("hex")
    .slice(0, 20);
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: "smartaihub-drizzle-catalog-audit",
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const actual = await readCatalog(client);
    const result = compareDrizzleCatalog(snapshot, actual);
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "drizzle-catalog-audit.v1",
          observedAt: new Date().toISOString(),
          sourceSha,
          snapshot: {
            path: "apps/web/drizzle/meta/0410_snapshot.json",
            sha256: snapshotHash,
          },
          databaseTargetId,
          access: "read_only",
          ...result,
        },
        null,
        2
      )}\n`
    );
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main().catch(error => {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "AUDIT_FAILED";
    const message =
      error instanceof Error
        ? error.message
            .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[redacted]")
            .slice(0, 240)
        : "Unknown audit failure";
    console.error(
      JSON.stringify({
        schema: "drizzle-catalog-audit.v1",
        error: code,
        message,
      })
    );
    process.exitCode = 1;
  });
}

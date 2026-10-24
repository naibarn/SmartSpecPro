import "dotenv/config";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { activeSchemaContract, isRetiredSchemaTable, postgresIdentifier } from "./schema-audit-policy";

export type CatalogObject = {
  name: string;
  schema?: string;
  columns?: Record<
    string,
    {
      name: string;
      type: string;
      notNull?: boolean;
      primaryKey?: boolean;
      default?: string | number | boolean;
    }
  >;
  indexes?: Record<string, { name: string; columns?: Array<{ expression: string; isExpression?: boolean; asc?: boolean; nulls?: string }>; method?: string; isUnique?: boolean; where?: string; canonicalWhere?: string }>;
  foreignKeys?: Record<string, { name: string; columnsFrom?: string[]; tableTo?: string; columnsTo?: string[]; onDelete?: string; onUpdate?: string }>;
  uniqueConstraints?: Record<string, { name: string; columns?: string[] }>;
  checkConstraints?: Record<string, { name: string; value: string; canonicalValue?: string }>;
  compositePrimaryKeys?: Record<string, { name: string; columns?: string[] }>;
};

export type SchemaSnapshot = {
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
    keys?: string[];
    method?: string;
    isUnique?: boolean;
    predicate?: string | null;
    canonicalPredicate?: string;
    valid?: boolean;
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
    canonicalDefinition?: string;
    validated?: boolean;
  }>;
  enums: Array<{ name: string; values: string[] }>;
};

const normalizeType = (value: string) =>
  value
    .toLowerCase()
    .replace(/^public\./, "")
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

function outsideLiterals(value: string, transform: (part: string) => string): string {
  return value.split(/('(?:''|[^'])*')/g).map(part => part.startsWith("'") ? part : transform(part)).join("");
}

const normalizeExpression = (raw: string | number | boolean | undefined | null) =>
  outsideLiterals(String(raw ?? ""), part => part
    .replace(/::(?:character varying|varchar|text|timestamp with time zone|timestamp without time zone|integer|bigint|smallint|boolean|regclass|jsonb|[a-z_][a-z0-9_.]*)(?:\[\])?/gi, "")
    .replace(/\s*,\s*/g, ",").replace(/\s+/g, " "))
    .replace(/^\((.*)\)$/s, "$1").trim();

export function normalizeCheck(raw: string) {
  let value = raw
    .trim()
    .replace(/^CHECK\s*/i, "")
    ;
  value = outsideLiterals(value, part => part.replace(/"([^"]+)"/g, "$1").replace(/\b[a-z_][a-z0-9_]*\./gi, ""));
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
  value = outsideLiterals(normalizeExpression(value), part => part.replace(/"([^"]+)"/g, "$1"));
  value = value
    .split(/('(?:''|[^'])*')/g)
    .map(part => (part.startsWith("'") ? part : part.toLowerCase()))
    .join("");
  return value;
}

const objectNames = (value: Record<string, { name: string }> | undefined) =>
  Object.keys(value ?? {}).sort();

function indexKey(value: string): string {
  let key = outsideLiterals(value, part => part.replace(/"([^" ]+)"/g, "$1")).trim();
  const nulls = /\s+NULLS\s+(FIRST|LAST)\s*$/i.exec(key)?.[1]?.toLowerCase();
  key = key.replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "");
  const descending = /\s+DESC\s*$/i.test(key);
  key = key.replace(/\s+(ASC|DESC)\s*$/i, "");
  return `${outsideLiterals(normalizeExpression(key), part => part.replace(/\s*(->>|->)\s*/g, "$1").replace(/\bcoalesce\(/gi, "coalesce("))}|${descending ? "desc" : "asc"}|${nulls ?? (descending ? "first" : "last")}`;
}

function indexesEqual(expected: NonNullable<CatalogObject["indexes"]>[string], actual: CatalogSnapshot["indexes"][number], table: CatalogObject): boolean {
  if (!expected.columns || !actual.keys || actual.valid === false) return false;
  const expectedKeys = expected.columns.map(column => indexKey(`${column.expression} ${column.asc === false ? "DESC" : "ASC"} NULLS ${column.nulls ?? "last"}`));
  const keysWithoutIrrelevantNullOrder = (keys: string[]) => keys.map(key => {
    const column = key.split("|")[0];
    return table.columns?.[column]?.notNull ? key.slice(0, key.lastIndexOf("|")) : key;
  });
  return JSON.stringify(keysWithoutIrrelevantNullOrder(expectedKeys)) === JSON.stringify(keysWithoutIrrelevantNullOrder(actual.keys.map(indexKey))) &&
    (expected.method ?? "btree") === (actual.method ?? "btree") &&
    Boolean(expected.isUnique) === Boolean(actual.isUnique) &&
    (expected.canonicalWhere ?? normalizeCheck(expected.where ?? "")) === (actual.canonicalPredicate ?? normalizeCheck(actual.predicate ?? ""));
}

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
  const equivalentIndexes: Array<{ expected: string; actual: string }> = [];
  const conflictingIndexes: string[] = [];
  const unvalidatedConstraints = actual.constraints.filter(item => item.validated === false).map(item => `${item.tableName}.${item.constraintName}`);
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
    { label: string; value: string; canonicalValue?: string }
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
    for (const [indexName, index] of Object.entries(table.indexes ?? {})) {
      const named = actualIndexes.get(postgresIdentifier(indexName));
      const equivalent = actual.indexes.find(found => found.tableName === tableName && indexesEqual(index, found, table));
      if (named) {
        if (named.valid === false || (index.columns && named.keys && !indexesEqual(index, named, table))) conflictingIndexes.push(indexName);
      } else if (equivalent) equivalentIndexes.push({ expected: indexName, actual: equivalent.indexName });
      else missingIndexes.push(indexName);
    }
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
        canonicalValue: check.canonicalValue,
      });
  }

  const actualConstraintSignatures = new Set(actual.constraints.map(constraint => signature(constraint)));
  for (const item of actual.indexes) {
    if (item.isUnique && !item.predicate && item.valid !== false && item.keys?.every(key => /^"?[A-Za-z_][A-Za-z0-9_]*"?(?: ASC NULLS LAST| DESC NULLS FIRST)?$/.test(key))) {
      actualConstraintSignatures.add(signature({ type: "u", tableName: item.tableName, columns: item.keys.map(key => key.replace(/ (ASC|DESC) NULLS (FIRST|LAST)$/, '').replaceAll('"', '')) }));
    }
  }
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
          (check.canonicalValue ?? normalizeCheck(check.value)) !== (constraint.canonicalDefinition ?? normalizeCheck(constraint.definition))
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
          constraint.type === "c" && (
            `${constraint.tableName}.${constraint.constraintName}` === label ||
            (constraint.tableName === label.slice(0, label.indexOf(".")) &&
              (constraint.canonicalDefinition ?? normalizeCheck(constraint.definition)) ===
              (expectedCheckNames.get(label)?.canonicalValue ?? normalizeCheck(expectedCheckNames.get(label)?.value ?? "")))
          )
      )
    )
      missingConstraints.push(label);

  for (const [key, enumType] of Object.entries(expected.enums)) {
    const name = enumType.name || key.split(".").at(-1) || key;
    const found = actualEnums.get(name);
    if (!found) missingEnums.push(name);
    else if (
      JSON.stringify(found.values) !==
      JSON.stringify(enumType.values)
    ) {
      conflictingEnums.push({
        name,
        expected: [...enumType.values],
        actual: [...found.values],
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
    equivalentIndexes,
    conflictingIndexes: sorted(conflictingIndexes),
    unvalidatedConstraints: sorted(unvalidatedConstraints),
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
      const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) :
        value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
      const parse = (value: string) => JSON.stringify(canonical(JSON.parse(value.replace(/^'(.*)'$/, "$1").replaceAll("''", "'"))));
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

export async function readCatalog(client: pg.Client, schema = "public"): Promise<CatalogSnapshot> {
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name`, [schema]
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
      WHERE c.table_schema=$1 ORDER BY c.table_name,c.column_name`, [schema]);
  const indexes = await client.query<
    CatalogSnapshot["indexes"][number]
  >(`SELECT p.tablename AS "tableName", p.indexname AS "indexName", (i.indisprimary OR con.oid IS NOT NULL) AS "constraintBacked", i.indisvalid AS valid,
        i.indisunique AS "isUnique", am.amname AS method,
        ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) ||
          CASE WHEN am.amname='btree' THEN
            CASE WHEN (i.indoption[k-1] & 1)=1 THEN ' DESC' ELSE ' ASC' END ||
            CASE WHEN (i.indoption[k-1] & 2)=2 THEN ' NULLS FIRST' ELSE ' NULLS LAST' END
          ELSE '' END FROM generate_series(1,i.indnkeyatts) k) AS keys,
        pg_get_expr(i.indpred,i.indrelid) AS predicate
      FROM pg_indexes p JOIN pg_class idx ON idx.relname=p.indexname JOIN pg_namespace ns ON ns.oid=idx.relnamespace AND ns.nspname=p.schemaname
      JOIN pg_index i ON i.indexrelid=idx.oid JOIN pg_am am ON am.oid=idx.relam LEFT JOIN pg_constraint con ON con.conindid=idx.oid
      WHERE p.schemaname=$1 ORDER BY p.indexname`, [schema]);
  const constraints = await client.query<
    CatalogSnapshot["constraints"][number]
  >(`SELECT c.relname AS "tableName", con.conname AS "constraintName",
        CASE con.contype WHEN 'f' THEN 'f' WHEN 'u' THEN 'u' WHEN 'c' THEN 'c' WHEN 'p' THEN 'p' ELSE con.contype::text END AS type,
        COALESCE((SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum), '[]'::json) AS columns,
        CASE WHEN con.contype='f' THEN f.relname END AS "referencedTable",
        COALESCE((SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum), '[]'::json) AS "referencedColumns",
        CASE con.confdeltype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict' WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' END AS "onDelete",
        CASE con.confupdtype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict' WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' END AS "onUpdate",
        pg_get_constraintdef(con.oid,true) AS definition, con.convalidated AS validated
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_class f ON f.oid=con.confrelid
      WHERE n.nspname=$1 ORDER BY con.conname`, [schema]);
  const enums = await client.query<
    CatalogSnapshot["enums"][number]
  >(`SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE n.nspname=$1 GROUP BY t.typname ORDER BY t.typname`, [schema]);
  return {
    tables: tables.rows.map(row => row.table_name),
    columns: columns.rows,
    indexes: indexes.rows,
    constraints: constraints.rows,
    enums: enums.rows,
  };
}

/** Let PostgreSQL parse/normalize checks; EXPLAIN never executes the query. */
export async function canonicalizeCatalogChecks(client: pg.Client, expected: SchemaSnapshot, actual: CatalogSnapshot) {
  await client.query("SET LOCAL enable_indexscan=off; SET LOCAL enable_indexonlyscan=off; SET LOCAL enable_bitmapscan=off");
  const failures: Array<{ object: string; code: string }> = [];
  async function canonical(table: string, expression: string): Promise<string | undefined> {
    await client.query("SAVEPOINT schema_check_parse");
    try {
      const result = await client.query(`EXPLAIN (FORMAT JSON, COSTS OFF) SELECT 1 FROM public."${table.replaceAll('"', '""')}" WHERE (${expression.replace(/^CHECK\s*/i, "").replace(/\s+NOT VALID$/i, "")})`);
      return JSON.stringify(result.rows[0]["QUERY PLAN"][0].Plan);
    } catch (error: any) {
      await client.query("ROLLBACK TO SAVEPOINT schema_check_parse");
      failures.push({ object: table, code: String(error?.code ?? "CHECK_PARSE_FAILED") });
      return undefined;
    } finally { await client.query("RELEASE SAVEPOINT schema_check_parse"); }
  }
  const present = new Set(actual.tables);
  for (const table of Object.values(expected.tables)) {
    if (!present.has(table.name)) continue;
    for (const check of Object.values(table.checkConstraints ?? {})) check.canonicalValue = await canonical(table.name, check.value);
  }
  for (const check of actual.constraints) {
    if (check.type === "c") check.canonicalDefinition = await canonical(check.tableName, check.definition);
  }
  for (const table of Object.values(expected.tables)) {
    if (!present.has(table.name)) continue;
    for (const index of Object.values(table.indexes ?? {})) {
      if (index.where) index.canonicalWhere = await canonical(table.name, index.where);
    }
  }
  for (const index of actual.indexes) {
    if (index.predicate) index.canonicalPredicate = await canonical(index.tableName, index.predicate);
  }
  return failures;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const { generateDrizzleJson } = await import("drizzle-kit/api");
  const schemaModule = await import("../drizzle/schema");
  const source = generateDrizzleJson(schemaModule) as unknown as SchemaSnapshot;
  const { contract: snapshot, ...scope } = activeSchemaContract(source);
  const snapshotBytes = await readFile(path.join(appRoot, "drizzle/schema.ts"));
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
    const wholeCatalog = await readCatalog(client);
    const actual = { ...wholeCatalog,
      tables: wholeCatalog.tables.filter(name => !isRetiredSchemaTable(name)),
      columns: wholeCatalog.columns.filter(item => !isRetiredSchemaTable(item.tableName)),
      indexes: wholeCatalog.indexes.filter(item => !isRetiredSchemaTable(item.tableName)),
      constraints: wholeCatalog.constraints.filter(item => !isRetiredSchemaTable(item.tableName)),
    };
    const checkNormalizationFailures = await canonicalizeCatalogChecks(client, snapshot, actual);
    const result = compareDrizzleCatalog(snapshot, actual);
    const requiredDrift = [result.missingTables, result.missingColumns, result.conflictingColumns, result.conflictingDefaults,
      result.missingIndexes, result.conflictingIndexes, result.missingConstraints, result.conflictingConstraints,
      result.missingEnums, result.conflictingEnums, result.unvalidatedConstraints, checkNormalizationFailures].reduce((sum, items) => sum + items.length, 0);
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "drizzle-catalog-audit.v1",
          observedAt: new Date().toISOString(),
          sourceSha,
          snapshot: {
            path: "apps/web/drizzle/schema.ts",
            sha256: snapshotHash,
          },
          databaseTargetId,
          access: "read_only",
          status: requiredDrift ? "DRIFT" : "READY",
          requiredDrift,
          scope: { ...scope, policy: "scripts/schema-audit-policy.ts", retiredObjectsPreserved: true,
            additionalObjects: "Tables, columns and safeguards outside the active Drizzle contract are retained and listed; no automatic DROP." },
          checkNormalizationFailures,
          ...result,
        },
        null,
        2
      )}\n`
    );
    await client.query("ROLLBACK");
    if (requiredDrift && process.argv.includes("--strict")) process.exitCode = 2;
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

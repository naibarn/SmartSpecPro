import { is, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type postgres from "postgres";
import {
  agentActivityEvents,
  runSnapshots,
  teamRooms,
  teamRuns,
  workerJobAttempts,
  workerJobDispatches,
  workerJobEvents,
  workerJobOutbox,
  workerJobScheduleOccurrences,
  workerJobSettlements,
  workerJobs,
  workers,
} from "../../../../drizzle/schema";

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const dialect = new PgDialect();

/**
 * Install the current canonical persistence projection needed by Feature186's
 * scheduler and bounded AutoTeam run evaluation. Cross-domain foreign keys are
 * intentionally omitted; this fixture is not a replacement for migrations.
 */
export async function installSpec277AutoTeamRuntimeSchema(client: postgres.Sql) {
  const configs = ([
    workers,
    workerJobs,
    workerJobAttempts,
    workerJobEvents,
    workerJobOutbox,
    workerJobScheduleOccurrences,
    workerJobDispatches,
    workerJobSettlements,
    teamRooms,
    teamRuns,
    runSnapshots,
    agentActivityEvents,
  ] as PgTable[]).map(getTableConfig);
  const enums = new Map<string, string[]>();
  for (const table of configs) {
    for (const column of table.columns) {
      const enumConfig = (column as typeof column & { enum?: { enumName: string; enumValues: string[] } }).enum;
      if (enumConfig) enums.set(enumConfig.enumName, enumConfig.enumValues);
    }
  }
  for (const [name, values] of enums) {
    await client.unsafe(`CREATE TYPE ${quote(name)} AS ENUM (${values.map(literal).join(", ")})`);
  }
  for (const table of configs) {
    const columns = table.columns.map(column => {
      let definition = `${quote(column.name)} ${column.getSQLType()}`;
      if (column.primary) definition += " PRIMARY KEY";
      if (column.notNull) definition += " NOT NULL";
      if (column.default !== undefined) {
        if (is(column.default, SQL)) {
          const expression = dialect.sqlToQuery(column.default);
          if (expression.params.length) throw new Error("SPEC277_SCHEMA_DEFAULT_HAS_PARAMETERS");
          definition += ` DEFAULT ${expression.sql}`;
        } else {
          definition += ` DEFAULT ${literal(column.mapToDriverValue(column.default))}`;
        }
      }
      return definition;
    });
    await client.unsafe(`CREATE TABLE ${quote(table.name)} (${columns.join(", ")})`);
    for (const index of table.indexes) {
      const config = index.config;
      const columnNames = config.columns.map(column => {
        if (is(column, SQL)) throw new Error("SPEC277_SCHEMA_EXPRESSION_INDEX_UNSUPPORTED");
        return quote(column.name);
      });
      const predicate = config.where ? dialect.sqlToQuery(config.where) : null;
      if (predicate?.params.length) throw new Error("SPEC277_SCHEMA_INDEX_HAS_PARAMETERS");
      await client.unsafe(`CREATE ${config.unique ? "UNIQUE " : ""}INDEX ${quote(config.name)} ON ${quote(table.name)} (${columnNames.join(", ")})${predicate ? ` WHERE ${predicate.sql}` : ""}`);
    }
  }
}

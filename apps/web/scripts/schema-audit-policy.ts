/** The active Drizzle contract excludes retired stores; it never drops data. */
const retiredWorkflowTables = new Set([
  "workflows", "workflow_versions", "workflow_templates", "workflow_schedules",
  "workflow_event_subscriptions", "workflow_executions", "workflow_dead_letter_queue",
  "workflow_cache_metadata", "workflow_audit_events", "workflow_secrets", "workflow_policy_rules",
  "webhook_calls", "webhook_triggers", "webhook_trigger_logs", "webhook_events",
]);

export function isRetiredSchemaTable(name: string): boolean {
  return name === "agencies" || name.startsWith("agency_") || name.startsWith("sandbox_") ||
    name === "tenant_sandbox_policies" || name.startsWith("workpack_") ||
    name === "role_workpack_binding" || retiredWorkflowTables.has(name);
}

export function activeSchemaContract<T extends {
  tables: Record<string, any>; enums: Record<string, any>;
}>(source: T) {
  const contract = structuredClone(source);
  const retiredTables: string[] = [];
  const retiredReferences: string[] = [];
  for (const [key, table] of Object.entries(contract.tables)) {
    if (isRetiredSchemaTable(table.name)) {
      retiredTables.push(table.name);
      delete contract.tables[key];
      continue;
    }
    for (const [name, fk] of Object.entries(table.foreignKeys ?? {}) as Array<[string, any]>) {
      if (isRetiredSchemaTable(fk.tableTo)) {
        retiredReferences.push(`${table.name}.${name}`);
        delete table.foreignKeys[name];
      }
    }
  }
  const usedEnums = new Set(Object.values(contract.tables).flatMap(table =>
    Object.values(table.columns ?? {}).map((column: any) => column.type.replace(/^public\./, ""))));
  const unusedEnums: string[] = [];
  for (const [key, enumType] of Object.entries(contract.enums)) {
    if (!usedEnums.has(enumType.name)) {
      unusedEnums.push(enumType.name);
      delete contract.enums[key];
    }
  }
  return { contract, retiredTables: retiredTables.sort(), retiredReferences: retiredReferences.sort(), unusedEnums: unusedEnums.sort() };
}

/** PostgreSQL truncates identifiers at 63 bytes, without splitting UTF-8. */
export function postgresIdentifier(value: string): string {
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character) > 63) break;
    result += character;
  }
  return result;
}

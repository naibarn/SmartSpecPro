import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("funnel_events schema", () => {
  it("defines funnel_events with required columns", async () => {
    const schema = await import("@db/schema");
    expect(schema.funnelEvents).toBeDefined();

    const table = schema.funnelEvents;
    expect(getTableName(table)).toBe("funnel_events");

    const columns = getTableColumns(table);
    expect(columns).toHaveProperty("id");
    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("domain");
    expect(columns).toHaveProperty("userId");
    expect(columns).toHaveProperty("eventName");
    expect(columns).toHaveProperty("eventTime");
    expect(columns).toHaveProperty("eventKey");
    expect(columns).toHaveProperty("properties");
    expect(columns).toHaveProperty("createdAt");

    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.eventName.notNull).toBe(true);
    expect(columns.eventTime.notNull).toBe(true);
    expect(columns.eventKey.notNull).toBe(true);
  });

  it("includes unique and analytics indexes", async () => {
    const schema = await import("@db/schema");
    const config = getTableConfig(schema.funnelEvents);
    const indexNames = config.indexes.map((idx) => idx.config.name);

    expect(indexNames).toContain("funnel_events_event_key_unique");
    expect(indexNames).toContain("funnel_events_tenant_event_time_idx");
    expect(indexNames).toContain("funnel_events_domain_event_time_idx");
    expect(indexNames).toContain("funnel_events_name_event_time_idx");
    expect(indexNames).toContain("funnel_events_user_name_time_idx");
  });
});

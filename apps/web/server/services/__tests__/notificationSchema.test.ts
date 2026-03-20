import { describe, it, expect } from "vitest";
import {
  userNotifications,
  notificationOccurrences,
} from "../../../drizzle/schema";
import type {
  NotificationOccurrence,
  InsertNotificationOccurrence,
} from "../../../drizzle/schema";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("userNotifications schema — dedup columns", () => {
  const columns = getTableColumns(userNotifications);

  it("includes groupKey column (nullable varchar 200)", () => {
    expect(columns.groupKey).toBeDefined();
    expect(columns.groupKey.dataType).toBe("string");
    expect(columns.groupKey.notNull).toBe(false);
  });

  it("includes occurrenceCount column (integer, default 1, not null)", () => {
    expect(columns.occurrenceCount).toBeDefined();
    expect(columns.occurrenceCount.dataType).toBe("number");
    expect(columns.occurrenceCount.notNull).toBe(true);
    expect(columns.occurrenceCount.hasDefault).toBe(true);
  });

  it("includes firstOccurredAt column (timestamptz, default now, not null)", () => {
    expect(columns.firstOccurredAt).toBeDefined();
    expect(columns.firstOccurredAt.dataType).toBe("date");
    expect(columns.firstOccurredAt.notNull).toBe(true);
    expect(columns.firstOccurredAt.hasDefault).toBe(true);
  });

  it("includes lastOccurredAt column (timestamptz, default now, not null)", () => {
    expect(columns.lastOccurredAt).toBeDefined();
    expect(columns.lastOccurredAt.dataType).toBe("date");
    expect(columns.lastOccurredAt.notNull).toBe(true);
    expect(columns.lastOccurredAt.hasDefault).toBe(true);
  });
});

describe("notificationOccurrences table schema", () => {
  const columns = getTableColumns(notificationOccurrences);

  it("has id column (serial primary key)", () => {
    expect(columns.id).toBeDefined();
    expect(columns.id.dataType).toBe("number");
    expect(columns.id.notNull).toBe(true);
    expect(columns.id.primary).toBe(true);
  });

  it("has notificationId column (integer, not null)", () => {
    expect(columns.notificationId).toBeDefined();
    expect(columns.notificationId.dataType).toBe("number");
    expect(columns.notificationId.notNull).toBe(true);
  });

  it("has content column (text, nullable)", () => {
    expect(columns.content).toBeDefined();
    expect(columns.content.dataType).toBe("string");
    expect(columns.content.notNull).toBe(false);
  });

  it("has metadata column (jsonb, nullable)", () => {
    expect(columns.metadata).toBeDefined();
    expect(columns.metadata.dataType).toBe("json");
    expect(columns.metadata.notNull).toBe(false);
  });

  it("has occurredAt column (timestamptz, default now, not null)", () => {
    expect(columns.occurredAt).toBeDefined();
    expect(columns.occurredAt.dataType).toBe("date");
    expect(columns.occurredAt.notNull).toBe(true);
    expect(columns.occurredAt.hasDefault).toBe(true);
  });

  it("exports NotificationOccurrence and InsertNotificationOccurrence types", () => {
    // Type-level assertions — if these compile, the types exist
    const _select: NotificationOccurrence = {} as NotificationOccurrence;
    const _insert: InsertNotificationOccurrence =
      {} as InsertNotificationOccurrence;
    expect(_select).toBeDefined();
    expect(_insert).toBeDefined();
  });
});

describe("userNotifications dedup index", () => {
  it("has unique partial index idx_notif_dedup_active on (userId, groupKey)", () => {
    const config = getTableConfig(userNotifications);
    const dedupIndex = config.indexes.find(
      (i) => i.config.name === "idx_notif_dedup_active",
    );
    expect(dedupIndex).toBeDefined();
    expect(dedupIndex!.config.unique).toBe(true);
  });
});

describe("notificationOccurrences indexes", () => {
  it("has index on (notificationId, occurredAt)", () => {
    const config = getTableConfig(notificationOccurrences);
    const timeIndex = config.indexes.find(
      (i) => i.config.name === "idx_notif_occurrences_notif_time",
    );
    expect(timeIndex).toBeDefined();
  });
});

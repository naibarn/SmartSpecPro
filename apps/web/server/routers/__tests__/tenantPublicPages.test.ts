import express, { type Express } from "express";
import request from "supertest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  where: null as unknown,
  orderBy: null as unknown,
  limit: null as unknown,
}));

vi.mock("../../db", () => ({
  db: {
    get instance() {
      const query = {
        from: () => query,
        where: (condition: unknown) => {
          dbState.where = condition;
          return query;
        },
        orderBy: (...ordering: unknown[]) => {
          dbState.orderBy = ordering;
          return query;
        },
        limit: async (count: number) => {
          dbState.limit = count;
          return dbState.rows.slice(0, count);
        },
      };
      return Promise.resolve({ select: () => query });
    },
  },
}));

import { registerTenantRoutes } from "../tenant";

const tenantId = "tenant-smartaihub";

function appWithTenant(): Express {
  const app = express();
  app.use((req, _res, next) => {
    (req as typeof req & { tenant: { id: string } }).tenant = { id: tenantId };
    next();
  });
  registerTenantRoutes(app);
  return app;
}

describe("GET /api/tenant/public-pages/:pageKey", () => {
  beforeEach(() => {
    dbState.rows = [];
    dbState.where = null;
    dbState.orderBy = null;
    dbState.limit = null;
  });

  it("queries only published rows owned by the current tenant and selects deterministically", async () => {
    const row = {
      id: 12,
      tenantId,
      pageKey: "home",
      title: "SmartAIHub home",
      slug: "home",
      isPublished: true,
    };
    dbState.rows = [row];

    const response = await request(appWithTenant()).get("/api/tenant/public-pages/home");

    const compiled = new PgDialect().sqlToQuery(dbState.where as SQL);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject(row);
    expect(compiled.params).toEqual(expect.arrayContaining([tenantId, "home", true]));
    expect(dbState.orderBy).toHaveLength(2);
    expect(dbState.limit).toBe(1);
  });

  it("returns 404 when no tenant-owned published row exists, including legacy global content", async () => {
    // The legacy public payload observed in production has tenantId=null.
    // It is intentionally absent from the tenant-owned query result.
    dbState.rows = [];

    const response = await request(appWithTenant()).get("/api/tenant/public-pages/home");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Page not found" });
    expect(dbState.limit).toBe(1);
  });
});

import express, { type Express } from "express";
import request from "supertest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  resultSets: [] as Array<Array<Record<string, unknown>>>,
  whereClauses: [] as unknown[],
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
          dbState.whereClauses.push(condition);
          return query;
        },
        orderBy: (...ordering: unknown[]) => {
          dbState.orderBy = ordering;
          return query;
        },
        limit: async (count: number) => {
          dbState.limit = count;
          const resultSet = dbState.resultSets.length
            ? dbState.resultSets.shift()!
            : dbState.rows;
          return resultSet.slice(0, count);
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
    (
      req as typeof req & { tenant: { id: string; primaryDomain: string } }
    ).tenant = {
      id: tenantId,
      primaryDomain: "smartaihub.app",
    };
    next();
  });
  registerTenantRoutes(app);
  return app;
}

describe("GET /api/tenant/public-pages/:pageKey", () => {
  beforeEach(() => {
    dbState.rows = [];
    dbState.resultSets = [];
    dbState.whereClauses = [];
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

    const response = await request(appWithTenant()).get(
      "/api/tenant/public-pages/home"
    );

    const compiled = new PgDialect().sqlToQuery(dbState.where as SQL);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toMatchObject(row);
    expect(compiled.params).toEqual(
      expect.arrayContaining([tenantId, "home", true])
    );
    expect(dbState.orderBy).toHaveLength(2);
    expect(dbState.limit).toBe(1);
  });

  it("serves a published global page on the canonical host when no tenant page exists", async () => {
    const row = {
      id: 13,
      tenantId: null,
      pageKey: "home",
      title: "SmartAIHub global home",
      slug: "home",
      isPublished: true,
    };
    dbState.resultSets = [[], [row]];

    const response = await request(appWithTenant())
      .get("/api/tenant/public-pages/home")
      .set("Host", "www.smartaihub.app");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject(row);
    expect(dbState.whereClauses).toHaveLength(2);
    const globalQuery = new PgDialect().sqlToQuery(
      dbState.whereClauses[1] as SQL
    );
    expect(globalQuery.params).toEqual(expect.arrayContaining(["home", true]));
  });

  it("does not serve global pages on custom tenant hosts", async () => {
    dbState.resultSets = [[]];

    const response = await request(appWithTenant())
      .get("/api/tenant/public-pages/home")
      .set("Host", "tenant.example");

    expect(response.status).toBe(404);
    expect(dbState.whereClauses).toHaveLength(1);
  });
});

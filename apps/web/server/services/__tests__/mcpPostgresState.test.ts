import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const execute = vi.hoisted(() => vi.fn());
vi.mock("../../db", () => ({ getDb: () => ({ execute }) }));

import { saveMcpDownloadGrant } from "../mcpPostgresState";

describe("MCP PostgreSQL state", () => {
  afterEach(() => execute.mockReset());

  it("quotes the reserved grant identifier in its conflict update", async () => {
    await saveMcpDownloadGrant("a".repeat(64), { userId: 1 }, 60);

    const compiled = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(compiled.sql).toContain('INSERT INTO mcp_download_grants (token_hash, "grant", expires_at)');
    expect(compiled.sql).toContain('"grant" = EXCLUDED."grant"');
  });
});

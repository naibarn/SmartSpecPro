import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "http";

// Mock dependencies before imports
const mockAuthenticateRequest = vi.fn();
const mockClearTenantCache = vi.fn();
const mockStoragePut = vi.fn().mockResolvedValue({ key: "test-key", url: "https://cdn.example.com/test.png" });

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: mockAuthenticateRequest,
  },
}));

vi.mock("../_core/tenant", () => ({
  clearTenantCache: mockClearTenantCache,
}));

vi.mock("../storage", () => ({
  storagePut: mockStoragePut,
}));

// Create chainable mock for drizzle query builder
function createChainableMock(resolveValue: any = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(resolveValue),
    then: (resolve: any) => Promise.resolve(resolveValue).then(resolve),
  };
  return chain;
}

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

const mockDbInstance = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
};

vi.mock("../db", () => ({
  db: {
    get instance() {
      return Promise.resolve(mockDbInstance);
    },
  },
}));

vi.mock("../../drizzle/schema", () => ({
  tenants: { id: "id", slug: "slug" },
  users: { id: "id" },
}));

const mockEq = vi.fn((col: any, val: any) => ({ col, val }));
vi.mock("drizzle-orm", () => ({
  eq: mockEq,
}));

async function startServer() {
  const { registerAdminTenantsRoutes } = await import("./adminTenants");
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  registerAdminTenantsRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { server, base: `http://127.0.0.1:${port}` };
}

function setupAdminAuth() {
  mockAuthenticateRequest.mockResolvedValue({ id: 1 });

  // Mock user lookup - return admin user
  const userChain = createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
  mockSelect.mockReturnValue(userChain);
}

const describeSocketSuite =
  process.env.RUN_SOCKET_TESTS === "true" ? describe : describe.skip;

describeSocketSuite("Admin Tenants Router", () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const started = await startServer();
    server = started.server;
    base = started.base;
  });

  afterEach(() => {
    server?.close();
  });

  describe("Authentication & Authorization", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuthenticateRequest.mockRejectedValue(new Error("No auth"));

      const res = await fetch(`${base}/api/admin/tenants`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 when user is not admin", async () => {
      mockAuthenticateRequest.mockResolvedValue({ id: 2 });

      const userChain = createChainableMock([{ id: 2, role: "user", email: "user@test.com" }]);
      mockSelect.mockReturnValue(userChain);

      const res = await fetch(`${base}/api/admin/tenants`);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden: Admin access required");
    });
  });

  describe("POST /api/admin/tenants (Create)", () => {
    it("returns 400 when required fields are missing", async () => {
      setupAdminAuth();

      // After auth, the next select is for slug check - need to reset mock
      // The first select call is for user auth, subsequent calls are in the handler
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          // Auth middleware - return admin user
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        // Handler - shouldn't reach here for validation failure
        return createChainableMock([]);
      });

      const res = await fetch(`${base}/api/admin/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "test" }), // missing name and primaryDomain
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing required fields");
    });

    it("returns 409 when slug already exists", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        // Slug check - return existing tenant
        return createChainableMock([{ id: "tenant-existing", slug: "test" }]);
      });

      mockAuthenticateRequest.mockResolvedValue({ id: 1 });

      const res = await fetch(`${base}/api/admin/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "test", name: "Test", primaryDomain: "test.com" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already exists");
    });

    it("creates tenant with required fields including status, plan, created_at", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        // Slug check - no existing tenant
        return createChainableMock([]);
      });

      const createdTenant = {
        id: "tenant-abc12345",
        slug: "newtest",
        name: "New Test",
        primaryDomain: "newtest.com",
        status: "ACTIVE",
        plan: "FREE",
      };

      const insertChain = createChainableMock([createdTenant]);
      mockInsert.mockReturnValue(insertChain);

      mockAuthenticateRequest.mockResolvedValue({ id: 1 });

      const res = await fetch(`${base}/api/admin/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "newtest", name: "New Test", primaryDomain: "newtest.com" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.tenant).toBeDefined();
      expect(body.tenant.slug).toBe("newtest");

      // Verify insert was called with status and plan
      const insertValues = insertChain.values.mock.calls[0][0];
      expect(insertValues.status).toBe("ACTIVE");
      expect(insertValues.plan).toBe("FREE");
      expect(insertValues.created_at).toBeInstanceOf(Date);
      expect(insertValues.id).toMatch(/^tenant-/);

      // Verify cache was cleared
      expect(mockClearTenantCache).toHaveBeenCalled();
    });

    it("generates a unique tenant ID starting with 'tenant-'", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        return createChainableMock([]);
      });

      const insertChain = createChainableMock([{ id: "tenant-12345678", slug: "idtest" }]);
      mockInsert.mockReturnValue(insertChain);

      mockAuthenticateRequest.mockResolvedValue({ id: 1 });

      await fetch(`${base}/api/admin/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "idtest", name: "ID Test", primaryDomain: "idtest.com" }),
      });

      const insertValues = insertChain.values.mock.calls[0][0];
      expect(insertValues.id).toMatch(/^tenant-.{8}$/);
    });

    it("sets default values for optional fields", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        return createChainableMock([]);
      });

      const insertChain = createChainableMock([{ id: "tenant-defaults" }]);
      mockInsert.mockReturnValue(insertChain);

      mockAuthenticateRequest.mockResolvedValue({ id: 1 });

      await fetch(`${base}/api/admin/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "defaults", name: "Defaults", primaryDomain: "defaults.com" }),
      });

      const insertValues = insertChain.values.mock.calls[0][0];
      expect(insertValues.isActive).toBe(true);
      expect(insertValues.domains).toEqual([]);
      expect(insertValues.themeConfig).toEqual({});
      expect(insertValues.seoConfig).toEqual({});
      expect(insertValues.settings).toEqual({});
    });
  });

  describe("DELETE /api/admin/tenants/:id", () => {
    it("deletes tenant and clears cache", async () => {
      setupAdminAuth();

      const deleteChain = createChainableMock();
      mockDelete.mockReturnValue(deleteChain);

      const res = await fetch(`${base}/api/admin/tenants/123`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain("deleted");

      expect(mockClearTenantCache).toHaveBeenCalled();
    });
  });

  describe("String ID handling (no parseInt)", () => {
    it("passes string tenant ID to eq() on GET", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        return createChainableMock([{ id: "tenant-abc123", name: "Test" }]);
      });
      mockAuthenticateRequest.mockResolvedValue({ id: 1 });
      mockEq.mockClear();

      await fetch(`${base}/api/admin/tenants/tenant-abc123`);

      // eq should be called with the string ID, not NaN from parseInt
      const idCalls = mockEq.mock.calls.filter((c: any) => c[1] === "tenant-abc123");
      expect(idCalls.length).toBeGreaterThan(0);
      // Ensure parseInt was NOT used (would produce NaN)
      const nanCalls = mockEq.mock.calls.filter((c: any) => Number.isNaN(c[1]));
      expect(nanCalls.length).toBe(0);
    });

    it("passes string tenant ID to eq() on PUT", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createChainableMock([{ id: 1, role: "admin", email: "admin@test.com" }]);
        }
        return createChainableMock([]);
      });
      mockAuthenticateRequest.mockResolvedValue({ id: 1 });

      const updateChain = createChainableMock([{ id: "tenant-xyz789", name: "Updated" }]);
      mockUpdate.mockReturnValue(updateChain);
      mockEq.mockClear();

      const res = await fetch(`${base}/api/admin/tenants/tenant-xyz789`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(200);
      const idCalls = mockEq.mock.calls.filter((c: any) => c[1] === "tenant-xyz789");
      expect(idCalls.length).toBeGreaterThan(0);
      const nanCalls = mockEq.mock.calls.filter((c: any) => Number.isNaN(c[1]));
      expect(nanCalls.length).toBe(0);
    });

    it("passes string tenant ID to eq() on DELETE", async () => {
      setupAdminAuth();
      const deleteChain = createChainableMock();
      mockDelete.mockReturnValue(deleteChain);
      mockEq.mockClear();

      await fetch(`${base}/api/admin/tenants/tenant-del456`, { method: "DELETE" });

      const idCalls = mockEq.mock.calls.filter((c: any) => c[1] === "tenant-del456");
      expect(idCalls.length).toBeGreaterThan(0);
      const nanCalls = mockEq.mock.calls.filter((c: any) => Number.isNaN(c[1]));
      expect(nanCalls.length).toBe(0);
    });
  });

  describe("POST /api/admin/tenants/:id/upload", () => {
    it("returns 400 for invalid upload type", async () => {
      setupAdminAuth();

      const res = await fetch(`${base}/api/admin/tenants/1/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "banner", fileBase64: "abc", fileName: "test.png", fileType: "image/png" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("logo");
    });

    it("returns 400 for invalid mime type", async () => {
      setupAdminAuth();

      const res = await fetch(`${base}/api/admin/tenants/1/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "logo", fileBase64: "abc", fileName: "test.exe", fileType: "application/x-executable" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid file type");
    });

    it("returns 400 when required upload fields are missing", async () => {
      setupAdminAuth();

      const res = await fetch(`${base}/api/admin/tenants/1/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "logo" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing required fields");
    });
  });
});

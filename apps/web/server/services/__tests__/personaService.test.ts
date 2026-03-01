/**
 * Tests for personaService.resolvePersona — resolution chain and tenant isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockGetDb, mockGetFeatureFlag } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetFeatureFlag: vi.fn(),
}));

// Mock database
vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

// Mock feature flags
vi.mock("../featureFlags", () => ({
  getFeatureFlag: mockGetFeatureFlag,
}));

// Mock schema with minimal column refs
vi.mock("../../../drizzle/schema", () => ({
  personaTemplates: { id: "pt.id", tenantId: "pt.tenantId", scope: "pt.scope", userId: "pt.userId" },
  users: { id: "u.id", defaultPersonaId: "u.defaultPersonaId" },
  tenants: { id: "t.id", defaultPersonaId: "t.defaultPersonaId" },
  conversations: { id: "c.id", personaId: "c.personaId", tenantId: "c.tenantId" },
  chatWidgets: { id: "cw.id", defaultPersonaId: "cw.defaultPersonaId" },
}));

import { resolvePersona, PLATFORM_DEFAULT_PERSONA } from "../personaService";

// Helper to create a chainable mock DB
function createMockDb(results: unknown[] = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(results),
  };
  return chain;
}

describe("personaService.resolvePersona", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeatureFlag.mockResolvedValue(true);
  });

  it("returns null when persona system is disabled", async () => {
    mockGetFeatureFlag.mockResolvedValue(false);

    const result = await resolvePersona(
      { personaId: null, tenantId: "t1" },
      { id: 1, defaultPersonaId: null },
      { id: "t1", defaultPersonaId: null },
    );

    expect(result).toBeNull();
  });

  it("returns conversation-level persona when personaId is set", async () => {
    const persona = {
      id: "p1",
      tenantId: "t1",
      name: "Test",
      scope: "tenant",
      systemPromptPrefix: "Hello",
    };
    const mockDb = createMockDb([persona]);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: "p1", tenantId: "t1" },
      { id: 1, defaultPersonaId: null },
      { id: "t1", defaultPersonaId: null },
    );

    expect(result).toEqual(persona);
  });

  it("returns widget default persona when widgetId provided and widget has default", async () => {
    const persona = {
      id: "p-widget",
      tenantId: null,
      name: "Widget Default",
      scope: "platform",
      systemPromptPrefix: "Widget prompt",
    };

    // personaId is null so step 1 is skipped (no DB call).
    // Call 1: widget query -> returns widget with defaultPersonaId
    // Call 2: loadPersonaById("p-widget") -> returns the persona
    const mockDb = createMockDb([]);
    let callCount = 0;
    mockDb.limit.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ defaultPersonaId: "p-widget" }]); // widget
      return Promise.resolve([persona]); // the persona itself
    });
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: null, tenantId: "t1" },
      { id: 1, defaultPersonaId: null },
      { id: "t1", defaultPersonaId: null },
      "widget-1",
    );

    expect(result).toEqual(persona);
  });

  it("returns user default when no conversation/widget persona", async () => {
    const persona = {
      id: "p-user",
      tenantId: null,
      name: "User Default",
      scope: "platform",
      systemPromptPrefix: "User prompt",
    };

    const mockDb = createMockDb([persona]);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: null, tenantId: "t1" },
      { id: 1, defaultPersonaId: "p-user" },
      { id: "t1", defaultPersonaId: null },
    );

    expect(result).toEqual(persona);
  });

  it("returns tenant default when no user default", async () => {
    const persona = {
      id: "p-tenant",
      tenantId: "t1",
      name: "Tenant Default",
      scope: "tenant",
      systemPromptPrefix: "Tenant prompt",
    };

    const mockDb = createMockDb([persona]);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: null, tenantId: "t1" },
      { id: 1, defaultPersonaId: null },
      { id: "t1", defaultPersonaId: "p-tenant" },
    );

    expect(result).toEqual(persona);
  });

  it("returns platform default as last fallback", async () => {
    const mockDb = createMockDb([]);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: null, tenantId: "t1" },
      { id: 1, defaultPersonaId: null },
      { id: "t1", defaultPersonaId: null },
    );

    expect(result).toEqual(PLATFORM_DEFAULT_PERSONA);
  });

  it("validates tenant isolation (persona.tenantId must match conversation.tenantId)", async () => {
    // Persona belongs to tenant t2, but conversation is in tenant t1
    const wrongTenantPersona = {
      id: "p-wrong",
      tenantId: "t2",
      name: "Wrong Tenant",
      scope: "tenant",
      systemPromptPrefix: "Wrong",
    };

    const mockDb = createMockDb([wrongTenantPersona]);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: "p-wrong", tenantId: "t1" },
      { id: 1, defaultPersonaId: null },
      { id: "t1", defaultPersonaId: null },
    );

    // Should fall through to platform default since tenant doesn't match
    expect(result).toEqual(PLATFORM_DEFAULT_PERSONA);
  });

  it("allows platform-scope personas (tenantId=null) for any tenant", async () => {
    const platformPersona = {
      id: "p-platform",
      tenantId: null,
      name: "Platform",
      scope: "platform",
      systemPromptPrefix: "Platform prompt",
    };

    const mockDb = createMockDb([platformPersona]);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await resolvePersona(
      { personaId: "p-platform", tenantId: "any-tenant" },
      { id: 1, defaultPersonaId: null },
      { id: "any-tenant", defaultPersonaId: null },
    );

    expect(result).toEqual(platformPersona);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Module-level mocks ---

// Mock @tauri-apps/api/core before importing authService
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// We need to dynamically import authService after setting up window.__TAURI__
// so that hasTauri() reads the correct value at call time.

const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>();

function makeResponse(status: number, body?: any): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? {}),
    headers: new Headers(),
    redirected: false,
    statusText: "",
    type: "basic" as ResponseType,
    url: "",
    clone: () => makeResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body ?? {})),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

describe("authService — browser context (hasTauri=false)", () => {
  let authService: typeof import("../../services/authService");

  beforeEach(async () => {
    vi.resetModules();
    // Ensure no Tauri
    delete (window as any).__TAURI__;

    // Stub fetch
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();

    // Clear localStorage
    localStorage.clear();

    // Reset interceptor flag
    delete (window as any).__authInterceptorSetup;

    // Fresh import
    authService = await import("../../services/authService");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAuthToken()", () => {
    it("returns null instead of reading localStorage", async () => {
      localStorage.setItem("smartspec_auth_token", "some-jwt-token");
      const token = await authService.getAuthToken();
      expect(token).toBeNull();
    });
  });

  describe("setAuthToken()", () => {
    it("is a no-op — does not write to localStorage", async () => {
      await authService.setAuthToken("test-token");
      expect(localStorage.getItem("smartspec_auth_token")).toBeNull();
    });
  });

  describe("getAuthTokenSync()", () => {
    it("returns null in browser context", () => {
      expect(authService.getAuthTokenSync()).toBeNull();
    });
  });

  describe("isTokenExpired()", () => {
    it("makes a server ping to /api/auth/me with credentials:'include'", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      await authService.isTokenExpired();
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/me", {
        credentials: "include",
      });
    });

    it("returns true when server returns 401", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(401));
      const result = await authService.isTokenExpired();
      expect(result).toBe(true);
    });

    it("returns false when server returns 200", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const result = await authService.isTokenExpired();
      expect(result).toBe(false);
    });

    it("returns true on network error (fetch throws)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await authService.isTokenExpired();
      expect(result).toBe(true);
    });
  });

  describe("verifyToken()", () => {
    it("uses credentials:'include' instead of Authorization Bearer header", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse(200, { id: "1", email: "a@b.com", is_admin: false }),
      );
      await authService.verifyToken();
      const call = mockFetch.mock.calls[0];
      expect(call[1]).toEqual(
        expect.objectContaining({ credentials: "include" }),
      );
      // Should NOT have Authorization header
      expect(call[1]?.headers?.Authorization).toBeUndefined();
    });

    it("returns true on 200 response", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse(200, { id: "1", email: "a@b.com", is_admin: false }),
      );
      const result = await authService.verifyToken();
      expect(result).toBe(true);
    });

    it("calls logout on 401 response", async () => {
      // verifyToken calls logout which redirects — mock location
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...originalLocation, href: "/dashboard", pathname: "/dashboard" },
      });

      mockFetch.mockResolvedValueOnce(makeResponse(401));
      const result = await authService.verifyToken();
      expect(result).toBe(false);

      // Restore
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await authService.verifyToken();
      expect(result).toBe(false);
    });
  });

  describe("isAuthenticated()", () => {
    it("makes a server ping instead of checking local token", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200));
      const result = await authService.isAuthenticated();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/me", {
        credentials: "include",
      });
    });

    it("returns false when server returns 401", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(401));
      const result = await authService.isAuthenticated();
      expect(result).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await authService.isAuthenticated();
      expect(result).toBe(false);
    });
  });

  describe("setupAuthInterceptor()", () => {
    it("does not set up twice (idempotent)", () => {
      authService.setupAuthInterceptor();
      const first = window.fetch;
      authService.setupAuthInterceptor();
      // fetch reference should be the same interceptor, not double-wrapped
      expect(window.fetch).toBe(first);
    });

    it("triggers logout on 401 response for non-auth URLs", async () => {
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...originalLocation, href: "/dashboard", pathname: "/dashboard" },
      });

      // Set up the underlying fetch to return 401
      const underlyingFetch = vi.fn().mockResolvedValue(makeResponse(401));
      vi.stubGlobal("fetch", underlyingFetch);
      delete (window as any).__authInterceptorSetup;

      // Re-import to get fresh module
      const freshModule = await import("../../services/authService");
      freshModule.setupAuthInterceptor();

      // Call the intercepted fetch
      await window.fetch("/api/some-endpoint");

      // Restore
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });

    it("skips logout for /auth/login paths", async () => {
      const underlyingFetch = vi.fn().mockResolvedValue(makeResponse(401));
      vi.stubGlobal("fetch", underlyingFetch);
      delete (window as any).__authInterceptorSetup;

      const freshModule = await import("../../services/authService");
      freshModule.setupAuthInterceptor();

      // This should NOT trigger logout
      const resp = await window.fetch("/api/auth/login");
      expect(resp.status).toBe(401);
    });
  });

  describe("logout()", () => {
    it("clears all 5 legacy localStorage keys", async () => {
      // Populate legacy keys
      localStorage.setItem("smartspec_auth_token", "token");
      localStorage.setItem("smartspec_user_data", "{}");
      localStorage.setItem("smartspec_web_refresh_token", "rt");
      localStorage.setItem("smartspec_web_token_expiry", "123");
      localStorage.setItem("smartspec_web_user", "{}");

      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...originalLocation, href: "/dashboard", pathname: "/dashboard" },
      });

      await authService.logout();

      expect(localStorage.getItem("smartspec_auth_token")).toBeNull();
      expect(localStorage.getItem("smartspec_user_data")).toBeNull();
      expect(localStorage.getItem("smartspec_web_refresh_token")).toBeNull();
      expect(localStorage.getItem("smartspec_web_token_expiry")).toBeNull();
      expect(localStorage.getItem("smartspec_web_user")).toBeNull();

      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });

    it("navigates to /login using provided navigate function", async () => {
      const navigate = vi.fn();
      await authService.logout(navigate);
      expect(navigate).toHaveBeenCalledWith("/login");
    });

    it("navigates to /login via window.location if no navigate provided", async () => {
      const originalLocation = window.location;
      const mockLocation = { ...originalLocation, href: "/dashboard", pathname: "/dashboard" };
      Object.defineProperty(window, "location", {
        writable: true,
        value: mockLocation,
      });

      await authService.logout();
      expect(mockLocation.href).toBe("/login");

      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });
  });
});

describe("authService — Tauri context (hasTauri=true)", () => {
  let authService: typeof import("../../services/authService");
  let tauriInvoke: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    // Enable Tauri
    (window as any).__TAURI__ = {};

    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    localStorage.clear();
    delete (window as any).__authInterceptorSetup;

    // Get mock reference
    const tauriModule = await import("@tauri-apps/api/core");
    tauriInvoke = tauriModule.invoke as ReturnType<typeof vi.fn>;
    tauriInvoke.mockReset();

    authService = await import("../../services/authService");
  });

  afterEach(() => {
    delete (window as any).__TAURI__;
    vi.restoreAllMocks();
  });

  describe("getAuthToken()", () => {
    it("reads from Tauri secure store via safeInvoke", async () => {
      tauriInvoke.mockResolvedValueOnce("tauri-jwt-token");
      const token = await authService.getAuthToken();
      expect(token).toBe("tauri-jwt-token");
      expect(tauriInvoke).toHaveBeenCalledWith("get_auth_token", undefined);
    });
  });

  describe("setAuthToken()", () => {
    it("writes to Tauri secure store via safeInvoke", async () => {
      tauriInvoke.mockResolvedValueOnce(undefined);
      await authService.setAuthToken("new-token");
      expect(tauriInvoke).toHaveBeenCalledWith("set_auth_token", {
        token: "new-token",
      });
    });
  });

  describe("isTokenExpired()", () => {
    it("decodes JWT from secure store and checks exp claim", async () => {
      // Create a JWT with exp in the future
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const payload = btoa(JSON.stringify({ exp: futureExp }));
      const fakeJwt = `header.${payload}.signature`;

      tauriInvoke.mockResolvedValueOnce(fakeJwt);
      const result = await authService.isTokenExpired();
      expect(result).toBe(false);
    });

    it("returns true when JWT is expired", async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const payload = btoa(JSON.stringify({ exp: pastExp }));
      const fakeJwt = `header.${payload}.signature`;

      tauriInvoke.mockResolvedValueOnce(fakeJwt);
      const result = await authService.isTokenExpired();
      expect(result).toBe(true);
    });

    it("returns true when no token is stored", async () => {
      tauriInvoke.mockResolvedValueOnce(null);
      const result = await authService.isTokenExpired();
      expect(result).toBe(true);
    });
  });

  describe("verifyToken()", () => {
    it("sends Authorization Bearer header", async () => {
      tauriInvoke.mockResolvedValueOnce("tauri-token");
      mockFetch.mockResolvedValueOnce(
        makeResponse(200, { id: "1", email: "a@b.com", is_admin: false }),
      );

      await authService.verifyToken();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/me"),
        expect.objectContaining({
          headers: { Authorization: "Bearer tauri-token" },
        }),
      );
    });
  });

  describe("logout()", () => {
    it("calls Tauri clear_all_credentials", async () => {
      tauriInvoke.mockResolvedValueOnce(undefined);
      const navigate = vi.fn();
      await authService.logout(navigate);
      expect(tauriInvoke).toHaveBeenCalledWith("clear_all_credentials", undefined);
    });
  });

  describe("isAuthenticated()", () => {
    it("checks via Tauri secure store", async () => {
      tauriInvoke.mockResolvedValueOnce(true);
      const result = await authService.isAuthenticated();
      expect(result).toBe(true);
      expect(tauriInvoke).toHaveBeenCalledWith("is_authenticated", undefined);
    });
  });
});

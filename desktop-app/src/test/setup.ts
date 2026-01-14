import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Minimal fetch mock helper (tests can override)
if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = async () => {
    return new Response(JSON.stringify({ proxy: { localhostOnly: false } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

// Mock Tauri API
vi.mock("@tauri-apps/api", () => ({
  invoke: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

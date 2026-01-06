import "@testing-library/jest-dom/vitest";

// Minimal fetch mock helper (tests can override)
if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = async () => {
    return new Response(JSON.stringify({ proxy: { localhostOnly: false } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

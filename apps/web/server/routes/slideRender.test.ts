import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { signBearerToken } from "../_core/tokens";

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

const dbMocks = vi.hoisted(() => {
  // Minimal chainable Drizzle mock: db.select().from().where().orderBy() => rows
  function makeChain(resolvedValue: unknown[]) {
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve(resolvedValue),
    };
    return chain;
  }

  return {
    getDb: vi.fn(),
    makeChain,
  };
});

vi.mock("../db", () => ({
  getDb: dbMocks.getDb,
}));

// Mock schema imports — Drizzle table objects are only used as query tokens
vi.mock("../../drizzle/schema", () => ({
  presentationSlides: { deckId: "deckId", orderIndex: "orderIndex" },
  presentationDecks: {},
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const DECK_ID = 7;
const SLIDE_INDEX = 2;

function makeValidToken(overrides: Record<string, unknown> = {}): string {
  return signBearerToken(
    {
      sub: "internal-render",
      scopes: ["internal:slide-render"],
      deckId: DECK_ID,
      slideIndex: SLIDE_INDEX,
      ...overrides,
    } as any,
    "5m",
  );
}

function makeSlide(index: number) {
  return {
    id: 100 + index,
    deckId: DECK_ID,
    orderIndex: index,
    title: `Slide ${index}`,
    slideContent: {
      elements: [
        { id: `el-${index}`, type: "text", content: `Hello slide ${index}` },
      ],
    },
    audioTrack: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildApp(remoteAddress: string = "127.0.0.1") {
  const app = express();
  // Simulate a specific remote address by patching socket before route
  app.use((req, _res, next) => {
    Object.defineProperty(req, "socket", {
      value: { remoteAddress },
      writable: true,
    });
    next();
  });
  // Lazy import to ensure mocks are in place
  return import("./slideRender").then(({ createSlideRenderRouter }) => {
    app.use("/internal", createSlideRenderRouter());
    return app;
  });
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("GET /internal/slide-render/:deckId/:slideIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DB returns 4 slides for the deck
    const slides = [makeSlide(0), makeSlide(1), makeSlide(2), makeSlide(3)];
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain(slides));
  });

  // -------------------------------------------------------------------------
  // Access control — IP address checks
  // -------------------------------------------------------------------------

  it("returns 403 for non-internal remote address (simulate ::2)", async () => {
    const app = await buildApp("::2");
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(403);
  });

  it("accepts Docker bridge gateway address 172.17.0.1 (RFC 1918)", async () => {
    const app = await buildApp("172.17.0.1");
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(200);
  });

  it("accepts 10.x.x.x private address (RFC 1918)", async () => {
    const app = await buildApp("10.0.0.1");
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(200);
  });

  it("accepts req.socket.remoteAddress === '127.0.0.1' (IPv4 loopback)", async () => {
    const app = await buildApp("127.0.0.1");
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(200);
  });

  it("accepts req.socket.remoteAddress === '::1' (IPv6 loopback)", async () => {
    const app = await buildApp("::1");
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(200);
  });

  it("accepts req.socket.remoteAddress === '::ffff:127.0.0.1' (IPv4-mapped IPv6)", async () => {
    const app = await buildApp("::ffff:127.0.0.1");
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // JWT header checks
  // -------------------------------------------------------------------------

  it("returns 401 when X-Internal-Token header is missing", async () => {
    const app = await buildApp();
    const res = await request(app).get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-Internal-Token contains an expired JWT", async () => {
    const app = await buildApp();
    // Sign with -1s expiry so it's already expired
    const expired = signBearerToken(
      { sub: "internal-render", scopes: ["internal:slide-render"], deckId: DECK_ID, slideIndex: SLIDE_INDEX } as any,
      "-1s" as any,
    );
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", expired);
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT deckId claim does not match URL :deckId param", async () => {
    const app = await buildApp();
    const token = makeValidToken({ deckId: 999 }); // different from DECK_ID=7
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT slideIndex claim does not match URL :slideIndex param", async () => {
    const app = await buildApp();
    const token = makeValidToken({ slideIndex: 99 }); // different from SLIDE_INDEX=2
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT scope does not include 'internal:slide-render'", async () => {
    const app = await buildApp();
    const token = makeValidToken({ scopes: ["other:scope"] });
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT has wildcard 'internal:*' scope (exact match required)", async () => {
    const app = await buildApp();
    const token = makeValidToken({ scopes: ["internal:*"] });
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT has 'admin' scope (exact match required)", async () => {
    const app = await buildApp();
    const token = makeValidToken({ scopes: ["admin"] });
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Success cases
  // -------------------------------------------------------------------------

  it("returns 200 with HTML when JWT is valid and remote address is loopback", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
  });

  it("HTML response body contains window.__slideReady = false initialization", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("window.__slideReady = false");
  });

  it("HTML response renders video elements with <video> tags (not black placeholder blocks)", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("var video = document.createElement(\"video\")");
    expect(res.text).toContain("video.autoplay = true");
  });

  it("HTML response waits for both image and video media before marking slide ready", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("var videos = canvas.querySelectorAll(\"video\")");
    expect(res.text).toContain("waitForMediaThenReady()");
  });

  it("HTML response supports record mode so videos are not paused at first frame", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("var renderMode = query.get(\"mode\") === \"record\" ? \"record\" : \"screenshot\"");
    expect(res.text).toContain("if (mode === \"record\")");
  });

  it("HTML response normalizes media URLs and forces muted video autoplay for frame capture", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("function normalizeMediaSrc(value)");
    expect(res.text).toContain("video.muted = true");
  });

  it("HTML response body contains inlined slideContent JSON (full element data)", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    // Should contain the elements array from slideContent — not just slideshow metadata
    expect(res.text).toContain(`el-${SLIDE_INDEX}`);
    expect(res.text).toContain(`Hello slide ${SLIDE_INDEX}`);
  });

  it("HTML response sets document.body margin to 0 and overflow to hidden", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("margin: 0");
    expect(res.text).toContain("overflow: hidden");
  });

  it("HTML response contains script tag with id='slide-data' and correct JSON", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain(`id="slide-data"`);
    expect(res.text).toContain(`application/json`);
    // Verify the script tag contains parseable JSON with the elements
    const match = res.text.match(/<script[^>]+id="slide-data"[^>]*>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.elements).toBeDefined();
    expect(parsed.elements[0].id).toBe(`el-${SLIDE_INDEX}`);
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it("returns 404 when slideIndex is out of bounds for the deck", async () => {
    const app = await buildApp();
    const outOfBoundsIndex = 99;
    const token = makeValidToken({ slideIndex: outOfBoundsIndex });
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${outOfBoundsIndex}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(404);
  });

  it("returns 404 when deckId does not exist (empty slides)", async () => {
    // Override: DB returns empty array (no slides for this deck)
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain([]));
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.status).toBe(404);
  });

  it("returns 400 when :deckId is non-integer (NaN)", async () => {
    const app = await buildApp();
    // Token claims won't match the NaN param anyway, but we want 400 not 401
    const res = await request(app)
      .get(`/internal/slide-render/abc/${SLIDE_INDEX}`)
      .set("X-Internal-Token", makeValidToken());
    expect(res.status).toBe(400);
  });

  it("returns 400 when :slideIndex is non-integer (NaN)", async () => {
    const app = await buildApp();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/xyz`)
      .set("X-Internal-Token", makeValidToken());
    expect(res.status).toBe(400);
  });
});

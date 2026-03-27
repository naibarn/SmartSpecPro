import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { JSDOM } from "jsdom";
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

function makeVisualRegressionSlide() {
  return {
    ...makeSlide(SLIDE_INDEX),
    slideContent: {
      canvas: { width: 960, height: 1200 },
      background: { type: "color", value: "#f4f7f2" },
      elements: [
        {
          id: "title-block",
          type: "text",
          x: 72,
          y: 84,
          width: 720,
          height: 116,
          text: "พัฒนาการเด็กหนึ่งขวบกับการฝึกเดิน",
          color: "#1f4d41",
          fontSize: 52,
          fontWeight: "700",
          lineHeight: 1.08,
          textAlign: "left",
        },
        {
          id: "body-block",
          type: "text",
          x: 72,
          y: 224,
          width: 732,
          height: 286,
          text: "• จับมือเดินได้ไม่เกร็ง\n• ชอบยืนเกาะโต๊ะ\n• เริ่มก้าวเองเป็นช่วงสั้น ๆ",
          color: "#557a70",
          fontSize: 28,
          fontWeight: "600",
          lineHeight: 1.28,
          textAlign: "left",
        },
        {
          id: "hero-visual",
          type: "image",
          x: 72,
          y: 548,
          width: 816,
          height: 508,
          svgContent:
            "<svg viewBox='0 0 816 508' xmlns='http://www.w3.org/2000/svg'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#fce7c3'/><stop offset='100%' stop-color='#d6b58a'/></linearGradient></defs><rect width='816' height='508' rx='28' fill='url(#g)' /><circle cx='612' cy='146' r='88' fill='#f3d8b3' opacity='0.95'/><rect x='146' y='242' width='466' height='122' rx='20' fill='#fff7ed' opacity='0.92'/></svg>",
          svgColor: "#f59e0b",
          mediaShape: "rounded",
          mediaCornerRadius: 28,
        },
      ],
    },
    audioTrack: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function serializeVisualRegressionFingerprint(dom: JSDOM) {
  const canvas = dom.window.document.getElementById("slide-canvas") as HTMLDivElement | null;
  if (!canvas) {
    throw new Error("slide canvas missing in rendered HTML");
  }

  return {
    canvas: {
      width: canvas.style.width,
      height: canvas.style.height,
      transform: canvas.style.transform,
      childCount: canvas.children.length,
    },
    elements: Array.from(canvas.children).map((child) => {
      const node = child as HTMLElement;
      const textNode = node.querySelector("p") as HTMLParagraphElement | null;
      const mediaNode = node.querySelector("[data-slide-media-id]") as HTMLElement | null;
      return {
        tag: node.tagName.toLowerCase(),
        mediaId: node.getAttribute("data-slide-media-id") ?? mediaNode?.getAttribute("data-slide-media-id") ?? null,
        left: node.style.left,
        top: node.style.top,
        width: node.style.width,
        height: node.style.height,
        overflow: node.style.overflow || null,
        borderRadius: node.style.borderRadius || null,
        clipPath: node.style.clipPath || null,
        background: node.style.background || null,
        transform: node.style.transform || null,
        text: textNode?.textContent ?? null,
        textStyle: textNode
          ? {
              fontSize: textNode.style.fontSize,
              lineHeight: textNode.style.lineHeight,
              color: textNode.style.color,
              fontFamily: textNode.style.fontFamily,
              fontWeight: textNode.style.fontWeight,
              textAlign: textNode.style.textAlign,
            }
          : null,
        mediaStyle: mediaNode
          ? {
              width: mediaNode.style.width,
              height: mediaNode.style.height,
              color: mediaNode.style.color || null,
              objectFit: (mediaNode as HTMLImageElement).style.objectFit || null,
            }
          : null,
      };
    }),
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

  it("flattens component fallback elements before embedding slide JSON", async () => {
    const componentSlide = {
      id: 500,
      deckId: DECK_ID,
      orderIndex: SLIDE_INDEX,
      title: "Component Slide",
      slideContent: {
        elements: [],
        components: [
          {
            id: "component-hero",
            componentId: "hero",
            componentType: "hero",
            definitionRevision: 4,
            slotBindings: [{ slotId: "title", type: "text", text: "Rendered from fallback" }],
            fallbackElements: [
              {
                id: "fallback-title",
                type: "text",
                x: 120,
                y: 180,
                width: 540,
                height: 90,
                text: "Rendered from fallback",
                color: "#111827",
              },
            ],
          },
        ],
      },
      audioTrack: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain([makeSlide(0), makeSlide(1), componentSlide, makeSlide(3)]));

    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Rendered from fallback");
    expect(res.text).not.toContain("\"components\"");
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
    expect(res.text).toContain("waitForMediaThenReady(function(hadFallback)");
  });

  it("HTML response encodes ready-gate timing contract constants", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("var READY_GATE_POLL_INTERVAL_MS = 200");
    expect(res.text).toContain("var READY_GATE_SOFT_WAIT_MS = 5000");
    expect(res.text).toContain("var READY_GATE_RETRY_DELAYS_MS = [750, 750]");
    expect(res.text).toContain("var READY_GATE_HARD_TIMEOUT_MS = 8000");
  });

  it("HTML response exposes slide-ready state metadata and timeout error code", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("window.__slideReadyState");
    expect(res.text).toContain("E_SLIDE_READY_TIMEOUT");
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

  it("HTML response includes media-shape rendering helpers for masked media", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("function applyMediaShapeStyle(node, el)");
    expect(res.text).toContain("node.style.clipPath = \"polygon(50% 0%, 61% 35%");
    expect(res.text).toContain("node.style.borderRadius = resolveMediaCornerRadius(el.mediaCornerRadius) + \"px\"");
  });

  it("HTML response includes media-motion runtime and applies it to live media nodes", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`)
      .set("X-Internal-Token", token);

    expect(res.text).toContain("var MEDIA_MOTION_RUNTIME =");
    expect(res.text).toContain("function normalizeMediaMotion(motion)");
    expect(res.text).toContain("function startMediaMotionLoopIfNeeded()");
    expect(res.text).toContain("\"pan-up-left\"");
    expect(res.text).toContain("maxPanOverscanDelta");
    expect(res.text).toContain("registerMediaMotionNode(video, zoom, posX, posY, el.mediaMotion)");
    expect(res.text).toContain("registerMediaMotionNode(img, zoom, posX, posY, el.mediaMotion)");
  });

  it("record-mode runtime animates registered inline svg media nodes", async () => {
    const slides = [makeSlide(0), makeSlide(1), {
      ...makeSlide(2),
      slideContent: {
        durationMs: 4000,
        elements: [
          {
            id: "svg-motion-1",
            type: "image",
            x: 0,
            y: 0,
            width: 320,
            height: 180,
            src: "",
            svgContent: "<svg viewBox='0 0 10 10'><rect width='10' height='10' fill='currentColor' /></svg>",
            svgColor: "#22c55e",
            mediaMotion: { preset: "pan-right", intensity: 1, easing: "linear" },
          },
        ],
      },
    }, makeSlide(3)];
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain(slides));

    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`)
      .set("X-Internal-Token", token);

    const rafQueue: FrameRequestCallback[] = [];
    const dom = new JSDOM(res.text, {
      url: `http://127.0.0.1/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`,
      runScripts: "dangerously",
      beforeParse(window) {
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
          rafQueue.push(callback);
          return rafQueue.length;
        }) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = vi.fn() as any;
      },
    });

    const svgNode = dom.window.document.querySelector("[data-slide-media-id='svg-motion-1']") as HTMLDivElement | null;
    expect(svgNode).not.toBeNull();
    const initialTransform = svgNode?.style.transform ?? "";

    expect(rafQueue.length).toBeGreaterThan(0);
    let timestamp = 1000;
    for (let step = 0; step < 6 && svgNode?.style.transform === initialTransform; step += 1) {
      const pending = rafQueue.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      for (const callback of pending) {
        callback(timestamp);
      }
      timestamp += 1000;
    }

    expect(svgNode?.style.transform).not.toBe(initialTransform);
    expect(svgNode?.style.transform).toContain("translate(");
  });

  it("record-mode runtime keeps long-slide raster image motion visible early for mp4 capture", async () => {
    const slides = [makeSlide(0), makeSlide(1), {
      ...makeSlide(2),
      slideContent: {
        durationMs: 10_000,
        elements: [
          {
            id: "img-motion-1",
            type: "image",
            x: 0,
            y: 0,
            width: 320,
            height: 180,
            src: "https://cdn.example.com/motion-image.png",
            alt: "Motion image",
            mediaMotion: { preset: "zoom-in" },
          },
        ],
      },
    }, makeSlide(3)];
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain(slides));

    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`)
      .set("X-Internal-Token", token);

    const rafQueue: FrameRequestCallback[] = [];
    const dom = new JSDOM(res.text, {
      url: `http://127.0.0.1/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`,
      runScripts: "dangerously",
      beforeParse(window) {
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
          rafQueue.push(callback);
          return rafQueue.length;
        }) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = vi.fn() as any;
      },
    });

    const imageNode = dom.window.document.querySelector("[data-slide-media-id='img-motion-1']") as HTMLImageElement | null;
    expect(imageNode).not.toBeNull();

    let timestamp = 1000;
    for (let step = 0; step < 3; step += 1) {
      const pending = rafQueue.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      for (const callback of pending) {
        callback(timestamp);
      }
      timestamp += 500;
    }

    const scaleMatch = imageNode?.style.transform.match(/scale\(([^)]+)\)/);
    expect(scaleMatch).not.toBeNull();
    expect(Number(scaleMatch?.[1] ?? "0")).toBeGreaterThan(1.02);
  });

  it("record-mode runtime starts outro image motion near the end of the slide", async () => {
    const slides = [makeSlide(0), makeSlide(1), {
      ...makeSlide(2),
      slideContent: {
        durationMs: 10_000,
        elements: [
          {
            id: "img-outro-1",
            type: "image",
            x: 0,
            y: 0,
            width: 320,
            height: 180,
            src: "https://cdn.example.com/motion-image.png",
            alt: "Motion image",
            mediaMotion: {
              outro: { preset: "pan-left", intensity: 1, easing: "linear", durationMs: 2000 },
            },
          },
        ],
      },
    }, makeSlide(3)];
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain(slides));

    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`)
      .set("X-Internal-Token", token);

    const rafQueue: FrameRequestCallback[] = [];
    const dom = new JSDOM(res.text, {
      url: `http://127.0.0.1/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}?mode=record`,
      runScripts: "dangerously",
      beforeParse(window) {
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
          rafQueue.push(callback);
          return rafQueue.length;
        }) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = vi.fn() as any;
      },
    });

    const imageNode = dom.window.document.querySelector("[data-slide-media-id='img-outro-1']") as HTMLImageElement | null;
    expect(imageNode).not.toBeNull();

    let timestamp = 1000;
    const beforeOutroTransform = imageNode?.style.transform ?? "";
    for (let step = 0; step < 7; step += 1) {
      const pending = rafQueue.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      for (const callback of pending) {
        callback(timestamp);
      }
      timestamp += 1000;
    }

    expect(imageNode?.style.transform).toBe(beforeOutroTransform);

    for (let step = 0; step < 4 && imageNode?.style.transform === beforeOutroTransform; step += 1) {
      const pending = rafQueue.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      for (const callback of pending) {
        callback(timestamp);
      }
      timestamp += 1000;
    }

    const translateMatch = imageNode?.style.transform.match(/translate\(([-0-9.]+)%\,\s*0%\)/);
    expect(translateMatch).not.toBeNull();
    expect(Number(translateMatch?.[1] ?? "0")).toBeLessThan(-5.5);
  });

  it("keeps a stable layout fingerprint for a representative export slide", async () => {
    dbMocks.getDb.mockResolvedValue(dbMocks.makeChain([
      makeSlide(0),
      makeSlide(1),
      makeVisualRegressionSlide(),
      makeSlide(3),
    ]));

    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);

    const dom = new JSDOM(res.text, {
      url: `http://127.0.0.1/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`,
      runScripts: "dangerously",
      beforeParse(window) {
        window.requestAnimationFrame = ((_: FrameRequestCallback) => 1) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = vi.fn() as any;
      },
    });

    const fingerprint = serializeVisualRegressionFingerprint(dom);
    expect(fingerprint).toMatchSnapshot();
  });

  it("HTML response includes svg validation and bounded placeholder fallback paths", async () => {
    const app = await buildApp();
    const token = makeValidToken();
    const res = await request(app)
      .get(`/internal/slide-render/${DECK_ID}/${SLIDE_INDEX}`)
      .set("X-Internal-Token", token);
    expect(res.text).toContain("function isLikelySvgMarkup(value)");
    expect(res.text).toContain("function createSvgPlaceholder()");
    expect(res.text).toContain("img.addEventListener(\"error\", function()");
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

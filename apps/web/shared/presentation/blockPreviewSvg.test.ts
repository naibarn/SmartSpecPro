import { describe, expect, it } from "vitest";

import { buildPresentationBlockPreviewSvg } from "./blockPreviewSvg";

describe("buildPresentationBlockPreviewSvg", () => {
  it("renders a solid color background when provided", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [
        { id: "t-1", type: "text", x: 120, y: 120, width: 300, height: 80, text: "Preview", color: "#111827" },
      ],
      { width: 1280, height: 720 },
      { type: "color", value: "#f0f9ff" },
    );

    expect(svg).toContain('fill="#f0f9ff"');
    expect(svg).toContain("Preview");
  });

  it("renders an image background when provided", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [],
      { width: 1280, height: 720 },
      { type: "image", url: "https://cdn.example.com/bg.png" },
    );

    expect(svg).toContain("<image");
    expect(svg).toContain('href="https://cdn.example.com/bg.png"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("allows callers to rewrite background image URLs for proxied previews", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [],
      { width: 1280, height: 720 },
      { type: "image", url: "https://cdn.example.com/bg.png" },
      {
        resolveImageUrl: (url) => `/api/media/image-proxy?url=${encodeURIComponent(url)}`,
      },
    );

    expect(svg).toContain("/api/media/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fbg.png");
    expect(svg).not.toContain('href="https://cdn.example.com/bg.png"');
  });

  it("renders foreground image elements through the resolver for canonical previews", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [{
        id: "img-1",
        type: "image",
        x: 120,
        y: 80,
        width: 360,
        height: 240,
        src: "https://cdn.example.com/hero.png",
        alt: "Hero",
        mediaShape: "rounded",
      }],
      { width: 1280, height: 720 },
      undefined,
      {
        resolveImageUrl: (url) => `/api/media/image-proxy?url=${encodeURIComponent(url)}`,
      },
    );

    expect(svg).toContain("<clipPath");
    expect(svg).toContain("<image");
    expect(svg).toContain("/api/media/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fhero.png");
    expect(svg).not.toContain('href="https://cdn.example.com/hero.png"');
  });

  it("renders inline svg image elements as encoded data URIs", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [{
        id: "img-2",
        type: "image",
        x: 60,
        y: 40,
        width: 180,
        height: 180,
        src: "https://cdn.example.com/fallback.png",
        alt: "Inline badge",
        svgContent: "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"10\" cy=\"10\" r=\"10\" fill=\"#ff0000\" /></svg>",
        mediaShape: "circle",
      }],
      { width: 400, height: 300 },
    );

    expect(svg).toContain("data:image/svg+xml;charset=utf-8,");
    expect(svg).toContain("%3Ccircle%20cx%3D%2210%22");
    expect(svg).toContain('clip-path="url(#preview-clip-img-2)"');
  });

  it("rewrites remote asset references embedded inside inline svg content", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [{
        id: "img-3",
        type: "image",
        x: 40,
        y: 40,
        width: 240,
        height: 160,
        src: "https://cdn.example.com/fallback.png",
        alt: "Inline hero",
        svgContent: "<svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"https://cdn.example.com/inline-asset.png\" width=\"40\" height=\"40\" /></svg>",
      }],
      { width: 400, height: 300 },
      undefined,
      {
        resolveImageUrl: (url) => `/api/media/image-proxy?url=${encodeURIComponent(url)}`,
      },
    );

    expect(svg).toContain(encodeURIComponent("/api/media/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Finline-asset.png"));
  });

  it("renders video posters through the resolver when available", () => {
    const svg = buildPresentationBlockPreviewSvg(
      [{
        id: "vid-1",
        type: "video",
        x: 80,
        y: 60,
        width: 320,
        height: 200,
        src: "https://cdn.example.com/clip.mp4",
        poster: "https://cdn.example.com/poster.png",
        mediaShape: "rounded",
      }],
      { width: 640, height: 360 },
      undefined,
      {
        resolveImageUrl: (url) => `/api/media/image-proxy?url=${encodeURIComponent(url)}`,
      },
    );

    expect(svg).toContain("<image");
    expect(svg).toContain("/api/media/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fposter.png");
    expect(svg).toContain("VIDEO");
  });
});

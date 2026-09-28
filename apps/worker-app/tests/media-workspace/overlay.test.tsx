import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { buildOverlayDocument } from "../../src/screens/media-workspace/overlayDocument";
import { SandboxedOverlayViewer } from "../../src/screens/media-workspace/SandboxedOverlayViewer";
import type { NleClip } from "../../src/types/nleProject";
const clip: NleClip = { id: "overlay", name: "<img src=x onerror=alert(1)>", timelineStartMs: 0, durationMs: 1000, sourceType: "generated_code", codeEngine: "react_css" };
it("removes active content and network/navigation escape markup", () => {
  const html = buildOverlayDocument('<meta http-equiv="refresh" content="0;url=https://evil.test"><script>parent.pwned=1</script><img src=x onerror="parent.pwned=1"><a href="javascript:alert(1)">Hi</a>', 'body{color:red}');
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("script,[onerror],[href]")).toBeNull();
  expect(doc.querySelectorAll("meta")).toHaveLength(1);
  expect(html).toContain("default-src 'none'");
});
it("contains generated markup in an opaque, scriptless iframe", () => {
  const html = renderToStaticMarkup(<SandboxedOverlayViewer activeClips={[{...clip, componentCode: '<img src=x onerror="alert(1)">', customCss: 'body{display:none}'}]} currentTimeMs={1} width={1080} height={1920} />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
  expect(doc.querySelector("style,script,[onerror]")).toBeNull();
});
it("renders SVG as a passive image and fallback names as text", () => {
  const html = renderToStaticMarkup(<SandboxedOverlayViewer activeClips={[{...clip, svgContent: '<svg onload="alert(1)"></svg>'}, {...clip, id: "fallback"}]} currentTimeMs={1} width={1080} height={1920} />);
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(doc.querySelector("svg,[onload],[onerror]")).toBeNull();
  expect(doc.querySelector("img")?.src).toMatch(/^data:image\/svg\+xml/);
});

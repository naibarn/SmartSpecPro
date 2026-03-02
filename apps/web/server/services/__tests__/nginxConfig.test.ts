/**
 * Nginx Configuration Validation
 *
 * Reads the actual Nginx config file and asserts required location blocks exist.
 * This is a configuration audit test, not a unit test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Nginx Configuration Validation", () => {
  const configPath = path.resolve(
    __dirname,
    "../../../../../nginx/conf.d/dev-host.conf",
  );

  let config: string;

  beforeAll(() => {
    config = fs.readFileSync(configPath, "utf-8");
  });

  it("nginx config file exists", () => {
    expect(config).toBeTruthy();
    expect(config.length).toBeGreaterThan(100);
  });

  it("has voice WebSocket location with upgrade headers", () => {
    expect(config).toContain("location /api/voice/stream");
    expect(config).toContain("proxy_set_header Upgrade $http_upgrade");
    expect(config).toContain('proxy_set_header Connection "upgrade"');
  });

  it("has widget WebSocket location with upgrade headers", () => {
    expect(config).toContain("location /widget/v1/ws");
    expect(config).toContain("proxy_set_header Upgrade $http_upgrade");
  });

  it("has sandbox.smartaihub.app server block", () => {
    expect(config).toContain("server_name sandbox.smartaihub.app");
  });

  it("has strict CSP for sandbox server block", () => {
    // connect-src 'none' prevents sandboxed code from making any network requests
    expect(config).toContain("connect-src 'none'");
  });

  it("has channel webhook route proxied to web_host", () => {
    // Generalized /webhooks/:channelType/:connectionId route
    expect(config).toMatch(/location.*\/webhooks\//);
  });

  it("voice WebSocket has 300s read timeout (5-min session max)", () => {
    const voiceBlock = config.match(
      /location \/api\/voice\/stream \{[^}]*\}/,
    );
    expect(voiceBlock).not.toBeNull();
    expect(voiceBlock?.[0]).toContain("proxy_read_timeout 300s");
  });

  it("widget WebSocket has 600s read timeout (long-lived sessions)", () => {
    const widgetBlock = config.match(
      /location \/widget\/v1\/ws \{[^}]*\}/,
    );
    expect(widgetBlock).not.toBeNull();
    expect(widgetBlock?.[0]).toContain("proxy_read_timeout 600s");
  });

  it("webhooks location appears before /api/ (Node.js must handle it, not Python backend)", () => {
    // Use exact block pattern to match only the Python backend /api/ block,
    // not prefix matches like /api/media-jobs/
    const webhooksPos = config.indexOf("location /webhooks/ {");
    const apiPos = config.indexOf("location /api/ {");

    expect(webhooksPos).toBeGreaterThan(-1);
    expect(apiPos).toBeGreaterThan(-1);
    // In at least one server block, webhooks must appear before /api/
    expect(webhooksPos).toBeLessThan(apiPos);
  });

  it("sandbox block has frame-ancestors security header", () => {
    expect(config).toContain("frame-ancestors https://smartaihub.app");
  });

  it("sandbox block has port-80 HTTP-to-HTTPS redirect", () => {
    // Must have a port-80 server block that redirects sandbox subdomain to HTTPS
    expect(config).toMatch(
      /listen 80[\s\S]{0,200}server_name sandbox\.smartaihub\.app[\s\S]{0,200}return 301/,
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  isLocalHostname,
  parseSampleRate,
  shouldEnableBrowserSentry,
} from "../sentryConfig";

describe("sentryConfig", () => {
  describe("parseSampleRate", () => {
    it("returns fallback when value is not numeric", () => {
      expect(parseSampleRate("nope", 0.2)).toBe(0.2);
    });

    it("clamps values into the 0..1 range", () => {
      expect(parseSampleRate("2", 0.2)).toBe(1);
      expect(parseSampleRate("-1", 0.2)).toBe(0);
      expect(parseSampleRate("0.35", 0.2)).toBe(0.35);
    });
  });

  describe("isLocalHostname", () => {
    it("recognizes local development hosts", () => {
      expect(isLocalHostname("localhost")).toBe(true);
      expect(isLocalHostname("127.0.0.1")).toBe(true);
      expect(isLocalHostname("::1")).toBe(true);
      expect(isLocalHostname("demo.local")).toBe(true);
    });

    it("does not mark public hosts as local", () => {
      expect(isLocalHostname("app.smartaihub.app")).toBe(false);
      expect(isLocalHostname("staging.example.com")).toBe(false);
    });
  });

  describe("shouldEnableBrowserSentry", () => {
    it("disables Sentry when DSN is missing or explicitly turned off", () => {
      expect(
        shouldEnableBrowserSentry({ dsn: "", mode: "production", hostname: "app.example.com" }),
      ).toBe(false);
      expect(
        shouldEnableBrowserSentry({
          enabledFlag: "false",
          dsn: "https://example@sentry.io/1",
          mode: "production",
          hostname: "app.example.com",
        }),
      ).toBe(false);
    });

    it("disables Sentry by default in development and on localhost", () => {
      expect(
        shouldEnableBrowserSentry({
          dsn: "https://example@sentry.io/1",
          mode: "development",
          hostname: "localhost",
        }),
      ).toBe(false);

      expect(
        shouldEnableBrowserSentry({
          dsn: "https://example@sentry.io/1",
          mode: "production",
          hostname: "127.0.0.1",
        }),
      ).toBe(false);
    });

    it("allows explicit dev opt-in", () => {
      expect(
        shouldEnableBrowserSentry({
          dsn: "https://example@sentry.io/1",
          mode: "development",
          hostname: "localhost",
          allowDevFlag: "true",
        }),
      ).toBe(true);
    });

    it("keeps Sentry enabled for non-local production hosts", () => {
      expect(
        shouldEnableBrowserSentry({
          dsn: "https://example@sentry.io/1",
          mode: "production",
          hostname: "app.smartaihub.app",
        }),
      ).toBe(true);
    });
  });
});

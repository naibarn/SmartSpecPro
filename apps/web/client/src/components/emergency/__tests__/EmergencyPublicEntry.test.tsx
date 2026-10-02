/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmergencyPublicEntry from "../EmergencyPublicEntry";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public emergency entry navigation", () => {
  it("makes public intelligence claims discoverable from the emergency overview", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));
    render(<EmergencyPublicEntry variant="overview" />);
    expect(screen.getByRole("link", { name: "publicEntry.claims" }).getAttribute("href")).toBe("/disaster/intelligence");
  });
});

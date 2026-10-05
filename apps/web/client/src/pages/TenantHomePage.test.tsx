/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ reducedMotion: false as boolean | null }));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => testState.reducedMotion,
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/components/emergency/EmergencyPublicEntry", () => ({
  default: () => null,
}));

import TenantHomePage from "./TenantHomePage";

const tenantPage = {
  id: 7,
  tenantId: "tenant-example",
  pageKey: "home",
  title: "Tenant home",
  slug: "home",
  isPublished: true,
  sections: [
    {
      id: "hero",
      type: "hero",
      title: "Tenant welcome",
      settings: { backgroundVideo: "/tenant/welcome.webm" },
      image: "/tenant/welcome-poster.webp",
    },
  ],
};

describe("tenant public homepage motion preferences", () => {
  beforeEach(() => {
    testState.reducedMotion = false;
  });

  it("does not autoplay decorative video for visitors who prefer reduced motion", () => {
    testState.reducedMotion = true;
    render(<TenantHomePage page={tenantPage} />);

    expect(screen.getByRole("heading", { level: 1, name: "Tenant welcome" })).toBeTruthy();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("img", { name: "Tenant welcome" })).toHaveAttribute(
      "src",
      "/tenant/welcome-poster.webp"
    );
  });

  it("keeps decorative video out of the accessibility tree for other visitors", () => {
    render(<TenantHomePage page={tenantPage} />);

    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
  });

  it("waits for motion preference detection before allowing autoplay", () => {
    testState.reducedMotion = null;
    render(<TenantHomePage page={tenantPage} />);

    expect(document.querySelector("video")).toBeNull();
  });
});

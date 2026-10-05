/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenant: null as null | {
    name: string;
    primaryDomain: string;
    contactInfo?: { email?: string };
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: state.tenant }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { Footer } from "../Footer";

afterEach(() => {
  cleanup();
  state.tenant = null;
});

describe("Footer tenant branding", () => {
  it("uses tenant identity and omits SmartAIHub-only links and contact details", () => {
    state.tenant = {
      name: "Acme Studio",
      primaryDomain: "studio.example",
      contactInfo: { email: "hello@studio.example" },
    };
    render(<Footer />);

    expect(screen.getByText("Acme Studio")).toBeInTheDocument();
    expect(screen.getByText(/© .*Acme Studio/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hello@studio.example" })).toHaveAttribute(
      "href",
      "mailto:hello@studio.example",
    );
    expect(screen.queryByText("SmartAIHub")).toBeNull();
    expect(screen.queryByRole("link", { name: "Features" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Support Group" })).toBeNull();
    expect(screen.queryByRole("link", { name: "smartaihubapp@gmail.com" })).toBeNull();
  });

  it("retains SmartAIHub links on the platform site", () => {
    state.tenant = { name: "SmartAIHub", primaryDomain: "smartaihub.app" };
    render(<Footer />);

    expect(screen.getByText("SmartAIHub")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Features" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "smartaihubapp@gmail.com" })).toBeInTheDocument();
  });
});

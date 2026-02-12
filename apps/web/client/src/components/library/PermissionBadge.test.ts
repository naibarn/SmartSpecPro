import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Eye: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-eye" }),
  Pencil: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-pencil" }),
  Trash2: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-trash2" }),
  Crown: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-crown" }),
}));

import { PermissionBadge } from "./PermissionBadge";

describe("PermissionBadge", () => {
  it('renders "read" badge with blue color and eye icon', () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, { level: "read" }),
    );
    expect(html).toContain("bg-blue-100");
    expect(html).toContain("text-blue-700");
    expect(html).toContain("icon-eye");
    expect(html).toContain("Read Only");
  });

  it('renders "write" badge with green color and pencil icon', () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, { level: "write" }),
    );
    expect(html).toContain("bg-green-100");
    expect(html).toContain("text-green-700");
    expect(html).toContain("icon-pencil");
    expect(html).toContain("Can Edit");
  });

  it('renders "delete" badge with orange color and trash icon', () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, { level: "delete" }),
    );
    expect(html).toContain("bg-orange-100");
    expect(html).toContain("text-orange-700");
    expect(html).toContain("icon-trash2");
    expect(html).toContain("Can Delete");
  });

  it('renders "owner" badge with purple color and crown icon', () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, { level: "owner" }),
    );
    expect(html).toContain("bg-purple-100");
    expect(html).toContain("text-purple-700");
    expect(html).toContain("icon-crown");
    expect(html).toContain("Owner");
  });

  it("has correct ARIA attributes (aria-label)", () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, { level: "read" }),
    );
    expect(html).toContain('aria-label="Read Only access"');
  });

  it('icon has aria-hidden="true"', () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, { level: "read" }),
    );
    expect(html).toContain('aria-hidden="true"');
  });

  it("uses custom label when provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionBadge, {
        level: "read",
        label: "View Only",
      }),
    );
    expect(html).toContain("View Only");
    // The aria-label still says "Read Only access" but the visible text should be "View Only"
    expect(html).toContain("<span>View Only</span>");
    expect(html).not.toContain("<span>Read Only</span>");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Mock UI components
vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return React.createElement("button", rest, children as React.ReactNode);
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "tooltip" }, props.children as React.ReactNode),
  TooltipTrigger: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "tooltip-trigger" }, props.children as React.ReactNode),
  TooltipContent: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "tooltip-content" }, props.children as React.ReactNode),
}));

vi.mock("lucide-react", () => ({
  Share2: (props: Record<string, unknown>) =>
    React.createElement("svg", { ...props, "data-testid": "icon-share2" }),
}));

import { ShareButton } from "./ShareButton";

describe("ShareButton", () => {
  it("renders share icon button", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareButton, {
        shareCount: 0,
        onOpenDialog: vi.fn(),
      }),
    );
    expect(html).toContain("icon-share2");
    expect(html).toContain("Share");
  });

  it("shows badge with share count when shares exist", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareButton, {
        shareCount: 3,
        onOpenDialog: vi.fn(),
      }),
    );
    expect(html).toContain(">3</span>");
  });

  it("does not show badge when share count is 0", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareButton, {
        shareCount: 0,
        onOpenDialog: vi.fn(),
      }),
    );
    expect(html).not.toContain("bg-blue-500");
  });

  it("has accessible aria-label with share count", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareButton, {
        shareCount: 5,
        onOpenDialog: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Share file (5 shares)"');
  });

  it("has accessible aria-label without count when no shares", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareButton, {
        shareCount: 0,
        onOpenDialog: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Share file"');
  });

  it("has tooltip text", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareButton, {
        shareCount: 2,
        onOpenDialog: vi.fn(),
      }),
    );
    expect(html).toContain("tooltip-content");
    expect(html).toContain("Share file (2 shares)");
  });
});

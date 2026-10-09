// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom/vitest";
import { ASSISTANT_MASCOT_STYLES, AssistantMascot } from "./AssistantMascot";

describe("AssistantMascot", () => {
  it("renders all five stable styles with distinct silhouettes", () => {
    const signatures = ASSISTANT_MASCOT_STYLES.map(style => {
      const { container, unmount } = render(<AssistantMascot style={style} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("data-mascot-style", style);
      const signature = [
        ...svg!.querySelectorAll(
          ":scope > path, :scope > circle, :scope > ellipse"
        ),
      ]
        .map(
          shape =>
            `${shape.tagName}:${shape.getAttribute("d") ?? shape.getAttribute("r")}`
        )
        .join("|");
      unmount();
      return signature;
    });

    expect(new Set(signatures).size).toBe(5);
  });

  it.each([24, 32, 40] as const)(
    "supports a %i CSS pixel presentation size",
    size => {
      const { container } = render(
        <AssistantMascot style="droplet" size={size} />
      );
      expect(container.querySelector("svg")).toHaveAttribute(
        "width",
        String(size)
      );
      expect(container.querySelector("svg")).toHaveAttribute(
        "height",
        String(size)
      );
    }
  );

  it("is decorative, non-focusable, and has no accessible notification content", () => {
    const { container } = render(
      <AssistantMascot
        style="star"
        expression="happy"
        className="motion-safe:animate-bounce"
      />
    );
    const svg = container.querySelector("svg")!;

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).not.toHaveAttribute("tabindex");
    expect(svg).toHaveClass("motion-safe:animate-bounce");
    expect(svg).toHaveStyle({ color: "var(--foreground)" });
    expect(svg.querySelector("g")).toHaveStyle({
      color: "var(--primary-foreground)",
    });
    expect(svg.querySelector("path")).toHaveAttribute("fill", "var(--primary)");
    expect(
      svg.querySelector("title, desc, foreignObject, script, a")
    ).toBeNull();
    expect(svg.querySelector("[onload], [onclick], [tabindex]")).toBeNull();
    expect(svg.textContent).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:|data:/i);
  });
});

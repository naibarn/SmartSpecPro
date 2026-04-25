// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpTopicRenderer } from "./HelpTopicRenderer";

describe("HelpTopicRenderer", () => {
  it("keeps relative help links after sanitizing rendered markdown", () => {
    render(
      <HelpTopicRenderer html='<p><a href="/help/memory">Memory</a></p>' />,
    );

    expect(screen.getByRole("link", { name: "Memory" })).toHaveAttribute(
      "href",
      "/help/memory",
    );
  });
});

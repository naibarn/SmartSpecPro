/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreationMenu } from "../CreationMenu";

describe("CreationMenu", () => {
  it("shows the personal chat entry point", () => {
    const onCreatePersonalChat = vi.fn();

    render(
      <CreationMenu
        onCreateChat={vi.fn()}
        onCreatePersonalChat={onCreatePersonalChat}
        onCreateTeamRoom={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new personal chat/i }));

    expect(onCreatePersonalChat).toHaveBeenCalledTimes(1);
  });
});

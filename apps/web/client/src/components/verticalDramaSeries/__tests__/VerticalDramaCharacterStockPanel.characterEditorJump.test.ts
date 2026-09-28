// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHARACTER_EDITOR_SECTION_ID,
  scrollToCharacterEditor,
} from "../VerticalDramaCharacterStockPanel";

describe("scrollToCharacterEditor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("scrolls to the character editor section with smooth motion", () => {
    const target = document.createElement("section");
    target.id = CHARACTER_EDITOR_SECTION_ID;
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    document.body.appendChild(target);

    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(callback => {
        callback(0);
        return 1;
      });

    scrollToCharacterEditor();

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("does nothing when the target section is not mounted", () => {
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(callback => {
        callback(0);
        return 1;
      });

    expect(() => scrollToCharacterEditor()).not.toThrow();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
});

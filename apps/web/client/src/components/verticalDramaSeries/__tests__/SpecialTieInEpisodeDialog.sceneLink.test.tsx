/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildSpecialTieInSceneHref,
  SpecialTieInSceneLink,
} from "../SpecialTieInEpisodeDialog";

describe("special tie-in scene link", () => {
  it("opens the selected scene in a separate tab and preserves the current form tab", () => {
    render(
      <SpecialTieInSceneLink
        lang="th"
        seriesId="53"
        locationKey="kitchen & cafe"
      />
    );

    const link = screen.getByRole("link", {
      name: "เปิดหน้าฉากเพื่อสร้างภาพ",
    });
    expect(link).toHaveAttribute(
      "href",
      "/drama-series/53?tab=scenes&locationKey=kitchen%20%26%20cafe"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("builds a same-origin scene URL with an encoded location key", () => {
    expect(buildSpecialTieInSceneHref("53", "scene/with spaces")).toBe(
      "/drama-series/53?tab=scenes&locationKey=scene%2Fwith%20spaces"
    );
  });
});

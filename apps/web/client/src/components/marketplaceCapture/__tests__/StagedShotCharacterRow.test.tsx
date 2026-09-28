import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  StagedShotCharacterRow,
  buildStagedShotLookOptions,
  resolveStagedShotPresentCastIds,
} from "../StagedShotCharacterRow";

/**
 * `planning/marketplace-four-character-cast/plan.md` §6 — the per-shot cast row
 * the user asked to mirror from the Vertical Drama storyboard shot card:
 * "เลือกตัวละครได้แก้ไขได้ … และเปลี่ยนลุคตัวละครได้ในรูปแบบเดียวกับ drama series …
 * แต่เป็นการเปลี่ยนเฉพาะช็อตนั้น ๆ ไม่ใช่เปลี่ยนทุกช็อตพร้อมกัน".
 */

const ROSTER = [
  { castId: "cast-1", name: "ไอริณ", url: "https://cdn.test/host.png", characterRole: "host", vdCharacterId: "71" },
  { castId: "cast-2", name: "กันต์", url: "https://cdn.test/guest.png", characterRole: "guest", vdCharacterId: "80" },
  { castId: "cast-3", name: "น้องปุย", url: "https://cdn.test/kid.png", characterRole: "support", vdCharacterId: "90" },
];

const LOOK_SOURCES = {
  "71": { characterId: "71", parentCharacterId: null, name: "ไอริณ", portraitUrl: "https://cdn.test/host.png" },
  "112": {
    characterId: "112",
    parentCharacterId: "71",
    name: "ไอริณ",
    variantLabel: "ชุดลำลอง",
    portraitUrl: "https://cdn.test/host-casual.png",
  },
  "80": { characterId: "80", parentCharacterId: null, name: "กันต์", portraitUrl: "https://cdn.test/guest.png" },
};

function renderRow(overrides: Partial<React.ComponentProps<typeof StagedShotCharacterRow>> = {}) {
  const onChangeCastInShot = vi.fn();
  const onChangeCastLook = vi.fn();
  render(
    <StagedShotCharacterRow
      shotId={7}
      roster={ROSTER}
      lookSourcesByCharacterId={LOOK_SOURCES}
      onChangeCastInShot={onChangeCastInShot}
      onChangeCastLook={onChangeCastLook}
      {...overrides}
    />
  );
  return { onChangeCastInShot, onChangeCastLook };
}

describe("resolveStagedShotPresentCastIds", () => {
  it("treats an absent castInShot as EVERYONE (legacy runs keep their cast)", () => {
    expect(
      resolveStagedShotPresentCastIds({ roster: ROSTER, castInShot: null })
    ).toEqual(["cast-1", "cast-2", "cast-3"]);
  });

  it("honors an explicit subset", () => {
    expect(
      resolveStagedShotPresentCastIds({ roster: ROSTER, castInShot: ["cast-2"] })
    ).toEqual(["cast-2"]);
  });

  it("ignores a castId no longer in the roster", () => {
    expect(
      resolveStagedShotPresentCastIds({
        roster: ROSTER,
        castInShot: ["cast-1", "cast-9"],
      })
    ).toEqual(["cast-1"]);
  });
});

describe("buildStagedShotLookOptions", () => {
  it("offers the base plus every look for a VD character that has one", () => {
    const options = buildStagedShotLookOptions({
      member: ROSTER[0],
      lookSourcesByCharacterId: LOOK_SOURCES,
    });
    expect(options.map(option => option.label)).toEqual(["ไอริณ", "ชุดลำลอง"]);
  });

  it("returns nothing for a VD character with no looks — the button stays hidden", () => {
    expect(
      buildStagedShotLookOptions({
        member: ROSTER[1],
        lookSourcesByCharacterId: LOOK_SOURCES,
      })
    ).toEqual([]);
  });

  it("returns nothing for an UPLOADED character (no VD family at all)", () => {
    expect(
      buildStagedShotLookOptions({
        member: { castId: "cast-4", name: "อัปโหลดเอง", url: "https://cdn.test/x.png" },
        lookSourcesByCharacterId: LOOK_SOURCES,
      })
    ).toEqual([]);
  });
});

describe("StagedShotCharacterRow", () => {
  it("renders one chip per present character and hides the rest", () => {
    renderRow({ castInShot: ["cast-1", "cast-3"] });
    expect(screen.getByText("ไอริณ")).toBeTruthy();
    expect(screen.getByText("น้องปุย")).toBeTruthy();
    expect(screen.queryByText("กันต์")).toBeNull();
  });

  it("shows the look button only for a character that HAS looks", () => {
    renderRow();
    expect(screen.getByTestId("staged-look-switch-7-cast-1")).toBeTruthy();
    expect(screen.queryByTestId("staged-look-switch-7-cast-2")).toBeNull();
  });

  it("switching a look reports the LOOK's url and identity for that shot only", () => {
    const { onChangeCastLook } = renderRow();
    fireEvent.click(screen.getByTestId("staged-look-switch-7-cast-1"));
    fireEvent.click(screen.getByTestId("staged-look-option-7-cast-1-112"));
    expect(onChangeCastLook).toHaveBeenCalledWith(7, "cast-1", {
      url: "https://cdn.test/host-casual.png",
      vdCharacterId: "112",
      variantLabel: "ชุดลำลอง",
    });
  });

  it("choosing the base look CLEARS the override rather than pinning the base url", () => {
    const { onChangeCastLook } = renderRow({
      castLooks: {
        "cast-1": { url: "https://cdn.test/host-casual.png", variantLabel: "ชุดลำลอง" },
      },
    });
    fireEvent.click(screen.getByTestId("staged-look-switch-7-cast-1"));
    fireEvent.click(screen.getByTestId("staged-look-option-7-cast-1-71"));
    expect(onChangeCastLook).toHaveBeenCalledWith(7, "cast-1", {
      url: "https://cdn.test/host.png",
      vdCharacterId: "71",
    });
  });

  it("renders the per-shot look override instead of the roster image", () => {
    renderRow({
      castLooks: {
        "cast-1": { url: "https://cdn.test/host-casual.png", variantLabel: "ชุดลำลอง" },
      },
    });
    expect(screen.getByText("ชุดลำลอง")).toBeTruthy();
    expect(
      screen.getByAltText("ไอริณ").getAttribute("src")
    ).toBe("https://cdn.test/host-casual.png");
  });

  it("unchecking a character reports the remaining cast in ROSTER order", () => {
    const { onChangeCastInShot } = renderRow({
      castInShot: ["cast-1", "cast-2", "cast-3"],
    });
    fireEvent.click(screen.getByTestId("staged-shot-cast-edit-7"));
    fireEvent.click(screen.getByTestId("staged-shot-cast-option-7-cast-2").querySelector("input")!);
    expect(onChangeCastInShot).toHaveBeenCalledWith(7, ["cast-1", "cast-3"]);
  });

  it("shows the supporting character's action, so the user can see WHY they are in frame", () => {
    renderRow({
      castInShot: ["cast-1", "cast-3"],
      supportingBeats: [{ castId: "cast-3", action: "นั่งเล่นของเล่นชิ้นนี้" }],
    });
    expect(screen.getByText("นั่งเล่นของเล่นชิ้นนี้")).toBeTruthy();
  });

  it("hides every edit affordance in read-only mode", () => {
    renderRow({ readOnly: true });
    expect(screen.queryByTestId("staged-shot-cast-edit-7")).toBeNull();
    expect(screen.queryByTestId("staged-look-switch-7-cast-1")).toBeNull();
  });

  it("renders nothing at all when the run has no characters", () => {
    const { container } = render(
      <StagedShotCharacterRow
        shotId={1}
        roster={[]}
        onChangeCastInShot={vi.fn()}
        onChangeCastLook={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

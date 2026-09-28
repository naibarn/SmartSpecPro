import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Marketplace two-character-conversation feature (planning/marketplace-two-
// character-conversation/plan.md §3.7/§3.8), Wave 3 frontend.

const seriesListFixture = [
  { id: "101", title: "รักนี้ที่รอคอย" },
];

const charactersFixture = {
  seriesId: "101",
  seriesTitle: "รักนี้ที่รอคอย",
  characters: [
    {
      characterId: "1",
      characterKey: "iris",
      name: "ไอริณ",
      role: "lead",
      narrativeRole: "protagonist",
      roleTier: "lead",
      occupation: "นักออกแบบ",
      description: null,
      ageRange: "20s",
      portraitUrl: "https://example.com/iris.png",
      portraitAssetId: "9001",
      hasPortrait: true,
      looks: [
        {
          characterId: "1",
          variantLabel: "ชุดทำงาน",
          variantType: "outfit",
          portraitUrl: "https://example.com/iris-office.png",
          portraitAssetId: "9002",
        },
      ],
    },
    {
      characterId: "2",
      characterKey: "kan",
      name: "กันต์",
      role: "lead",
      narrativeRole: "love_interest",
      roleTier: "lead",
      occupation: null,
      description: null,
      ageRange: "30s",
      portraitUrl: "https://example.com/kan.png",
      portraitAssetId: "9010",
      hasPortrait: true,
      looks: [],
    },
    {
      characterId: "3",
      characterKey: "noPortrait",
      name: "ตัวประกอบ",
      role: "supporting",
      narrativeRole: null,
      roleTier: null,
      occupation: null,
      description: null,
      ageRange: null,
      portraitUrl: null,
      portraitAssetId: null,
      hasPortrait: false,
      looks: [],
    },
  ],
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    verticalDramaSeries: {
      list: {
        useQuery: () => ({
          data: { series: seriesListFixture },
          isLoading: false,
          isError: false,
        }),
      },
    },
    marketplaceCapture: {
      listDramaCharactersForPicker: {
        useQuery: (input: { seriesId: string }) => ({
          data: input.seriesId ? charactersFixture : undefined,
          isLoading: false,
          isError: false,
        }),
      },
    },
  },
}));

import { MarketplaceDramaCharacterPickerDialog } from "../MarketplaceDramaCharacterPickerDialog";

describe("MarketplaceDramaCharacterPickerDialog", () => {
  it("auto-selects the only series, renders its characters, and confirms host/guest roles in pick order", async () => {
    const onConfirm = vi.fn();
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={2}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
    expect(screen.getByText("กันต์")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("เลือก ไอริณ"));
    fireEvent.click(screen.getByLabelText("เลือก กันต์"));

    fireEvent.click(
      screen.getByRole("button", { name: "เพิ่มตัวละคร (2)" })
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const items = onConfirm.mock.calls[0][0];
    expect(items).toEqual([
      expect.objectContaining({
        url: "https://example.com/iris.png",
        role: "character",
        characterName: "ไอริณ",
        characterRole: "host",
        vdCharacterId: "1",
        vdSeriesId: "101",
        portraitAssetId: "9001",
        ageRange: "20s",
      }),
      expect.objectContaining({
        url: "https://example.com/kan.png",
        role: "character",
        characterName: "กันต์",
        characterRole: "guest",
        vdCharacterId: "2",
        vdSeriesId: "101",
        portraitAssetId: "9010",
      }),
    ]);
  });

  it("disables a character with no portrait on the base OR any look", async () => {
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={2}
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText("ตัวประกอบ")).toBeTruthy());
    const checkbox = screen.getByLabelText(
      "เลือก ตัวประกอบ"
    ) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it("disables selecting a 3rd character once maxSelectable is reached", async () => {
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={1}
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("เลือก ไอริณ"));

    const kanCheckbox = screen.getByLabelText(
      "เลือก กันต์"
    ) as HTMLInputElement;
    expect(kanCheckbox.disabled).toBe(true);
  });

  it("shows the cap-reached message instead of the picker when maxSelectable is 0", () => {
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={0}
        onConfirm={vi.fn()}
      />
    );

    expect(
      screen.getByText(/ตัวละครครบ 2 คนแล้ว/)
    ).toBeTruthy();
    expect(screen.queryByText("ไอริณ")).toBeNull();
  });

  it("picking a look writes the base character's name but the look's own portrait/asset id", async () => {
    const onConfirm = vi.fn();
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={2}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("เลือกลุคของ ไอริณ"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByLabelText("เลือก ไอริณ"));
    fireEvent.click(
      screen.getByRole("button", { name: "เพิ่มตัวละคร (1)" })
    );

    expect(onConfirm.mock.calls[0][0][0]).toMatchObject({
      characterName: "ไอริณ",
      url: "https://example.com/iris-office.png",
      portraitAssetId: "9002",
    });
  });

  /* The look select used to be `disabled={selected}`, so ticking a character
     FROZE their look and the only way to change it was to untick and start
     over — a character that plainly had looks read as broken
     (`planning/marketplace-four-character-cast/plan.md`). */
  it("lets the look be changed AFTER the character is already selected", async () => {
    const onConfirm = vi.fn();
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={2}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
    // Select FIRST, then change the look.
    fireEvent.click(screen.getByLabelText("เลือก ไอริณ"));
    const lookSelect = screen.getByLabelText("เลือกลุคของ ไอริณ");
    expect((lookSelect as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(lookSelect, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มตัวละคร (1)" }));

    expect(onConfirm.mock.calls[0][0][0]).toMatchObject({
      characterName: "ไอริณ",
      url: "https://example.com/iris-office.png",
      portraitAssetId: "9002",
      variantLabel: "ชุดทำงาน",
    });
  });

  it("switching back to the base portrait after selecting a look clears the variant label", async () => {
    const onConfirm = vi.fn();
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={2}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("เลือก ไอริณ"));
    const lookSelect = screen.getByLabelText("เลือกลุคของ ไอริณ");
    fireEvent.change(lookSelect, { target: { value: "0" } });
    fireEvent.change(lookSelect, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มตัวละคร (1)" }));

    const confirmed = onConfirm.mock.calls[0][0][0];
    expect(confirmed.url).toBe("https://example.com/iris.png");
    expect(confirmed.variantLabel).toBeUndefined();
  });

  it("carries the character's own facts (descriptor) so the story is not generic", async () => {
    const onConfirm = vi.fn();
    render(
      <MarketplaceDramaCharacterPickerDialog
        open
        onOpenChange={vi.fn()}
        maxSelectable={2}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("เลือก ไอริณ"));
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มตัวละคร (1)" }));

    expect(onConfirm.mock.calls[0][0][0].descriptor).toContain("นักออกแบบ");
  });

  describe("touch target / responsive UX audit fixes", () => {
    it("toggles a character by clicking anywhere in its row, not just the tiny native checkbox", async () => {
      render(
        <MarketplaceDramaCharacterPickerDialog
          open
          onOpenChange={vi.fn()}
          maxSelectable={2}
          onConfirm={vi.fn()}
        />
      );

      await waitFor(() => expect(screen.getByText("ไอริณ")).toBeTruthy());
      const checkbox = screen.getByLabelText(
        "เลือก ไอริณ"
      ) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      // Click on the character's name text, not the checkbox itself — the
      // row is wrapped in a <label> so this forwards to the checkbox exactly
      // once (no double-toggle).
      fireEvent.click(screen.getByText("ไอริณ"));
      expect(checkbox.checked).toBe(true);

      // Clicking again (still off the checkbox) toggles it back off.
      fireEvent.click(screen.getByText("ไอริณ"));
      expect(checkbox.checked).toBe(false);
    });

    it("does not toggle a disabled (no-portrait) character when clicking its row", async () => {
      render(
        <MarketplaceDramaCharacterPickerDialog
          open
          onOpenChange={vi.fn()}
          maxSelectable={2}
          onConfirm={vi.fn()}
        />
      );

      await waitFor(() => expect(screen.getByText("ตัวประกอบ")).toBeTruthy());
      const checkbox = screen.getByLabelText(
        "เลือก ตัวประกอบ"
      ) as HTMLInputElement;

      fireEvent.click(screen.getByText("ตัวประกอบ"));
      expect(checkbox.checked).toBe(false);
    });
  });
});

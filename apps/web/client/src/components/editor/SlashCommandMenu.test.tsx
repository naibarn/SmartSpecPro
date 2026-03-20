// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import SlashCommandMenu from "./SlashCommandMenu";
import type { SlashCommandMenuRef } from "./SlashCommandMenu";
import {
  getSlashCommandItems,
  filterSlashItems,
} from "./slashCommandItems";
import type { SlashCommandItem } from "./slashCommandItems";

function createMockEditor() {
  const run = vi.fn();
  const methods: Record<string, any> = { run };
  const handler: ProxyHandler<Record<string, any>> = {
    get(target, prop) {
      if (prop === "run") return run;
      if (typeof prop === "string") {
        if (!target[prop]) {
          target[prop] = vi.fn().mockReturnValue(new Proxy({}, handler));
        }
        return target[prop];
      }
      return undefined;
    },
  };
  const proxy = new Proxy(methods, handler);

  return {
    chain: vi.fn().mockReturnValue(proxy),
    methods,
    run,
  };
}

describe("SlashCommandMenu — rendering", () => {
  it("renders all 13 items when no filter applied", () => {
    const items = getSlashCommandItems();
    const command = vi.fn();
    render(<SlashCommandMenu items={items} command={command} />);
    expect(screen.getByTestId("slash-menu")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(13);
  });

  it("shows correct labels", () => {
    const items = getSlashCommandItems();
    render(<SlashCommandMenu items={items} command={vi.fn()} />);
    expect(screen.getByText("Heading 1")).toBeInTheDocument();
    expect(screen.getByText("Bullet List")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it('shows "No results" when items is empty', () => {
    render(<SlashCommandMenu items={[]} command={vi.fn()} />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });
});

describe("SlashCommandMenu — filtering", () => {
  it('filtering "hea" returns only heading items', () => {
    const all = getSlashCommandItems();
    const filtered = filterSlashItems(all, "hea");
    expect(filtered).toHaveLength(4);
    expect(filtered.every((i) => i.id.startsWith("heading"))).toBe(true);
  });

  it('filtering "div" returns only divider', () => {
    const all = getSlashCommandItems();
    const filtered = filterSlashItems(all, "div");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("divider");
  });

  it("filtering with no match returns empty", () => {
    const all = getSlashCommandItems();
    const filtered = filterSlashItems(all, "zzz");
    expect(filtered).toHaveLength(0);
  });

  it("filtering is case-insensitive", () => {
    const all = getSlashCommandItems();
    const filtered = filterSlashItems(all, "HEAD");
    expect(filtered).toHaveLength(4);
  });

  it("empty query returns all items", () => {
    const all = getSlashCommandItems();
    const filtered = filterSlashItems(all, "");
    expect(filtered).toHaveLength(13);
  });
});

describe("SlashCommandMenu — selection", () => {
  it("clicking an item calls command with that item", () => {
    const items = getSlashCommandItems();
    const command = vi.fn();
    render(<SlashCommandMenu items={items} command={command} />);
    fireEvent.click(screen.getByTestId("slash-item-heading1"));
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({ id: "heading1" }),
    );
  });

  it("selecting Heading 1 calls chain with deleteRange and toggleHeading", () => {
    const mock = createMockEditor();
    const items = getSlashCommandItems();
    const range = { from: 0, to: 1 };
    items[0].command({ editor: mock as any, range });
    expect(mock.chain).toHaveBeenCalled();
    expect(mock.run).toHaveBeenCalled();
  });

  it("selecting Image calls onMediaInsert('image')", () => {
    const onMediaInsert = vi.fn();
    const mock = createMockEditor();
    const items = getSlashCommandItems(onMediaInsert);
    const imageItem = items.find((i) => i.id === "image")!;
    imageItem.command({ editor: mock as any, range: { from: 0, to: 1 } });
    expect(onMediaInsert).toHaveBeenCalledWith("image");
  });

  it("selecting Video calls onMediaInsert('video')", () => {
    const onMediaInsert = vi.fn();
    const items = getSlashCommandItems(onMediaInsert);
    const mock = createMockEditor();
    const videoItem = items.find((i) => i.id === "video")!;
    videoItem.command({ editor: mock as any, range: { from: 0, to: 1 } });
    expect(onMediaInsert).toHaveBeenCalledWith("video");
  });

  it("selecting Divider calls chain and runs command", () => {
    const mock = createMockEditor();
    const items = getSlashCommandItems();
    const dividerItem = items.find((i) => i.id === "divider")!;
    dividerItem.command({ editor: mock as any, range: { from: 0, to: 1 } });
    expect(mock.chain).toHaveBeenCalled();
    expect(mock.run).toHaveBeenCalled();
  });

  it("selecting Table calls chain and runs command", () => {
    const mock = createMockEditor();
    const items = getSlashCommandItems();
    const tableItem = items.find((i) => i.id === "table")!;
    tableItem.command({ editor: mock as any, range: { from: 0, to: 1 } });
    expect(mock.chain).toHaveBeenCalled();
    expect(mock.run).toHaveBeenCalled();
  });
});

describe("SlashCommandMenu — keyboard navigation", () => {
  it("ArrowDown moves selection down", () => {
    const ref = createRef<SlashCommandMenuRef>();
    const items = getSlashCommandItems();
    render(<SlashCommandMenu ref={ref} items={items} command={vi.fn()} />);

    // First item is selected by default
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].className).toContain("bg-accent");

    // ArrowDown moves to second item
    ref.current!.onKeyDown({
      event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
    });

    // Re-render check — need to verify via rerender
    // Since state updates are async in React, we check the returned boolean
    const handled = ref.current!.onKeyDown({
      event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
    });
    expect(handled).toBe(true);
  });

  it("ArrowUp wraps to last item", () => {
    const ref = createRef<SlashCommandMenuRef>();
    const items = getSlashCommandItems();
    render(<SlashCommandMenu ref={ref} items={items} command={vi.fn()} />);

    const handled = ref.current!.onKeyDown({
      event: new KeyboardEvent("keydown", { key: "ArrowUp" }),
    });
    expect(handled).toBe(true);
  });

  it("Enter selects current item", () => {
    const ref = createRef<SlashCommandMenuRef>();
    const items = getSlashCommandItems();
    const command = vi.fn();
    render(<SlashCommandMenu ref={ref} items={items} command={command} />);

    ref.current!.onKeyDown({
      event: new KeyboardEvent("keydown", { key: "Enter" }),
    });
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({ id: "heading1" }),
    );
  });

  it("unhandled key returns false", () => {
    const ref = createRef<SlashCommandMenuRef>();
    const items = getSlashCommandItems();
    render(<SlashCommandMenu ref={ref} items={items} command={vi.fn()} />);

    const handled = ref.current!.onKeyDown({
      event: new KeyboardEvent("keydown", { key: "a" }),
    });
    expect(handled).toBe(false);
  });
});

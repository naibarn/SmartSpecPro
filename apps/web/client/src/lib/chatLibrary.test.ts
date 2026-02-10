import { describe, expect, it } from "vitest";

import {
  appendLibraryContextToMessage,
  isChatLibrarySourcePickerEnabled,
  toAttachableLibrarySources,
  toggleLibrarySourceSelection,
  type ChatLibraryAttachPayload,
} from "./chatLibrary";

describe("chatLibrary helpers", () => {
  it("shows or hides library source picker using feature flag value", () => {
    expect(isChatLibrarySourcePickerEnabled("true")).toBe(true);
    expect(isChatLibrarySourcePickerEnabled("1")).toBe(true);
    expect(isChatLibrarySourcePickerEnabled("yes")).toBe(true);
    expect(isChatLibrarySourcePickerEnabled("false")).toBe(false);
    expect(isChatLibrarySourcePickerEnabled(undefined)).toBe(false);
  });

  it("attaches selected library payload into outgoing chat context", () => {
    const sources: ChatLibraryAttachPayload[] = [
      { item_id: 11, item_type: "image", title: "Hero still", source: "media_task" },
      { item_id: 12, item_type: "video", title: "Teaser shot", source: "media_task" },
    ];

    const merged = appendLibraryContextToMessage("Draft a launch concept", sources);
    expect(merged).toContain("Draft a launch concept");
    expect(merged).toContain("[image] Hero still (id:11, source:media_task)");
    expect(merged).toContain("[video] Teaser shot (id:12, source:media_task)");
  });

  it("never returns unready/unsafe library items as attachable", () => {
    const attachable = toAttachableLibrarySources([
      {
        status: "ready",
        attach_payload: { item_id: 1, item_type: "image", title: "A", source: "media_task" },
      },
      {
        status: "indexing",
        attach_payload: { item_id: 2, item_type: "image", title: "B", source: "media_task" },
      },
      {
        status: "ready",
        attach_payload: { item_id: 3, item_type: "image", title: "", source: "media_task" },
      },
      {
        status: "failed",
        attach_payload: { item_id: 4, item_type: "video", title: "C", source: "media_task" },
      },
    ]);

    expect(attachable).toHaveLength(1);
    expect(attachable[0].item_id).toBe(1);
  });

  it("keeps chat flow stable when search results are unavailable", () => {
    expect(toAttachableLibrarySources(undefined)).toEqual([]);
    expect(appendLibraryContextToMessage("hello", [])).toBe("hello");
  });

  it("toggles selected source items", () => {
    const payload: ChatLibraryAttachPayload = {
      item_id: 99,
      item_type: "image",
      title: "Poster",
      source: "media_task",
    };
    expect(toggleLibrarySourceSelection([], payload)).toEqual([payload]);
    expect(toggleLibrarySourceSelection([payload], payload)).toEqual([]);
  });
});

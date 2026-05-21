import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageSourcePicker } from "./ImageSourcePicker";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      listDocuments: {
        useQuery: vi.fn(() => ({ data: { results: [] }, isLoading: false })),
      },
      search: {
        useQuery: vi.fn(() => ({ data: { results: [] }, isLoading: false })),
      },
    },
    media: {
      listTasks: {
        useQuery: vi.fn(() => ({
          data: { tasks: [] },
          isLoading: false,
          isFetching: false,
        })),
      },
    },
  },
}));

describe("ImageSourcePicker drag and drop", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uploads dropped image files and appends returned URLs", async () => {
    const onUpload = vi.fn(async () => ["/uploads/dropped.png"]);
    const onChange = vi.fn();
    const imageFile = new File(["image"], "dropped.png", { type: "image/png" });
    const textFile = new File(["text"], "notes.txt", { type: "text/plain" });

    render(
      <ImageSourcePicker
        value={[]}
        onChange={onChange}
        maxImages={2}
        onUpload={onUpload}
        language="en"
      />,
    );

    fireEvent.drop(screen.getByRole("button", { name: "Add image" }), {
      dataTransfer: {
        files: [imageFile, textFile],
        dropEffect: "copy",
      },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith([imageFile]);
      expect(onChange).toHaveBeenCalledWith(["/uploads/dropped.png"]);
    });
  });

  it("adds a dropped Media Studio image URL without re-uploading", async () => {
    const onUpload = vi.fn(async () => ["/uploads/should-not-use.png"]);
    const onChange = vi.fn();

    render(
      <ImageSourcePicker
        value={["/uploads/existing.png"]}
        onChange={onChange}
        maxImages={3}
        onUpload={onUpload}
        language="en"
      />,
    );

    fireEvent.drop(screen.getByRole("button", { name: "Add image" }), {
      dataTransfer: {
        files: [],
        types: ["application/x-smartspec-media-type", "text/uri-list", "text/plain"],
        dropEffect: "copy",
        getData: (type: string) => {
          if (type === "application/x-smartspec-media-type") return "image";
          if (type === "text/uri-list") return "https://cdn.example.com/history-result";
          if (type === "text/plain") return "https://cdn.example.com/history-result";
          return "";
        },
      },
    });

    await waitFor(() => {
      expect(onUpload).not.toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith([
        "/uploads/existing.png",
        "https://cdn.example.com/history-result",
      ]);
    });
  });
});

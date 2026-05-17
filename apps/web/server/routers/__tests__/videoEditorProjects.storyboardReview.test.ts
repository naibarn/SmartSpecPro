import { describe, expect, it } from "vitest";
import { mergeFresherExistingReviewTasks } from "../videoEditorProjects";

describe("mergeFresherExistingReviewTasks", () => {
  it("preserves fresher existing task media when a stale client resaves with a newer draft timestamp", () => {
    const existing = {
      version: 1,
      updatedAt: 3000,
      taskIds: ["shot-1", "shot-2"],
      selectedTaskIds: ["shot-1", "shot-2"],
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: "/files/v1.mp4",
        },
        {
          id: "shot-2",
          updatedAt: 3000,
          url: "/files/v7.mp4",
        },
      ],
    };
    const incoming = {
      ...existing,
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: "/files/v1.mp4",
        },
        {
          id: "shot-2",
          updatedAt: 1000,
          url: "/files/v4.mp4",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        { id: "shot-1", updatedAt: 1000, url: "/files/v1.mp4" },
        { id: "shot-2", updatedAt: 3000, url: "/files/v7.mp4" },
      ],
    });
  });

  it("accepts incoming task media when it is at least as fresh as the stored task", () => {
    const existing = {
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/old.mp4" }],
    };
    const incoming = {
      tasks: [{ id: "shot-1", updatedAt: 2000, url: "/files/new.mp4" }],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toEqual(incoming);
  });
});

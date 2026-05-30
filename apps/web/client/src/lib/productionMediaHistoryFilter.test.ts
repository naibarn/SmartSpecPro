import { describe, expect, it } from "vitest";
import {
  buildProductionMediaHistoryProjectIndex,
  filterMediaHistoryTasksForProductionProject,
  mediaHistoryTaskBelongsToProductionProject,
} from "./productionMediaHistoryFilter";

describe("productionMediaHistoryFilter", () => {
  it("passes all tasks through when no production project is selected", () => {
    const index = buildProductionMediaHistoryProjectIndex("");
    const tasks = [{ id: "task-1" }, { id: "task-2" }];

    expect(filterMediaHistoryTasksForProductionProject(tasks, index)).toEqual(tasks);
  });

  it("matches tasks with explicit productionRunId metadata", () => {
    const index = buildProductionMediaHistoryProjectIndex("run-212");

    expect(mediaHistoryTaskBelongsToProductionProject({
      id: "task-1",
      parameters: {
        extraParams: {
          productionRunId: "run-212",
        },
      },
    }, index)).toBe(true);

    expect(mediaHistoryTaskBelongsToProductionProject({
      id: "task-2",
      parameters: {
        extraParams: {
          productionRunId: "run-other",
        },
      },
    }, index)).toBe(false);
  });

  it("uses saved production space task ids and urls as a legacy fallback", () => {
    const index = buildProductionMediaHistoryProjectIndex("run-212", {
      productionRunId: "run-212",
      flowNodes: [{
        id: "shot-1-storyboard-grid-image",
        outputRefs: [{
          mediaTaskId: "backend-task-1",
          providerTaskId: "provider-task-1",
          url: "https://cdn.example.com/generated/storyboard.png?signature=old",
        }],
      }],
    });

    expect(mediaHistoryTaskBelongsToProductionProject({
      id: "backend-task-1",
      status: "completed",
      mediaType: "image",
    }, index)).toBe(true);

    expect(mediaHistoryTaskBelongsToProductionProject({
      id: "public-gallery-7",
      resultUrl: "https://cdn.example.com/generated/storyboard.png?signature=new",
    }, index)).toBe(true);

    expect(mediaHistoryTaskBelongsToProductionProject({
      id: "unrelated-task",
      resultUrl: "https://cdn.example.com/generated/other.png",
    }, index)).toBe(false);
  });

  it("does not let a legacy url override an explicit different productionRunId", () => {
    const index = buildProductionMediaHistoryProjectIndex("run-212", {
      flowNodes: [{
        outputRefs: [{
          url: "https://cdn.example.com/generated/shared.png",
        }],
      }],
    });

    expect(mediaHistoryTaskBelongsToProductionProject({
      id: "task-other",
      resultUrl: "https://cdn.example.com/generated/shared.png",
      parameters: {
        extraParams: {
          production_run_id: "run-other",
        },
      },
    }, index)).toBe(false);
  });
});

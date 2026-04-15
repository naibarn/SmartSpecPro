import { describe, expect, it } from "vitest";
import {
  describeStatusBridge,
  mapTeamRunStatusToWorkOsState,
  mapWorkOsStateToTeamRunStatus,
} from "../workStatusBridge";

describe("workStatusBridge", () => {
  it("maps team run states to canonical Work OS states", () => {
    expect(mapTeamRunStatusToWorkOsState("queued")).toBe("planned");
    expect(mapTeamRunStatusToWorkOsState("running")).toBe("in_progress");
    expect(mapTeamRunStatusToWorkOsState("paused", "user_paused")).toBe("waiting_for_input");
    expect(mapTeamRunStatusToWorkOsState("paused", "awaiting_human_approval")).toBe("waiting_for_approval");
    expect(mapTeamRunStatusToWorkOsState("paused", "awaiting_external_member")).toBe("in_progress");
    expect(mapTeamRunStatusToWorkOsState("stopped", "user_requested")).toBe("cancelled");
    expect(mapTeamRunStatusToWorkOsState("stopped", "policy_hold")).toBe("blocked");
  });

  it("maps Work OS states back to a team-run hint", () => {
    expect(mapWorkOsStateToTeamRunStatus("planned")).toBe("queued");
    expect(mapWorkOsStateToTeamRunStatus("in_progress")).toBe("running");
    expect(mapWorkOsStateToTeamRunStatus("waiting_for_approval")).toBe("awaiting_human_approval");
    expect(mapWorkOsStateToTeamRunStatus("waiting_for_input")).toBe("waiting_for_poll");
    expect(mapWorkOsStateToTeamRunStatus("blocked")).toBe("waiting_for_worker");
    expect(mapWorkOsStateToTeamRunStatus("completed")).toBe("completed");
  });

  it("describes the bridge with a deterministic note", () => {
    expect(describeStatusBridge("running")).toEqual(expect.objectContaining({
      teamRunStatus: "running",
      workOsState: "in_progress",
    }));
  });
});

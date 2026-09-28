import { describe, expect, it } from "vitest";

import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_CAPABILITY_FAMILIES,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
} from "../workerRuntime";
import * as workerRuntime from "../workerRuntime";

describe("Feature 135 Hermes media worker runtime constants", () => {
  it("freezes the exact wire values for every job type and capability constant", () => {
    expect(HERMES_MEDIA_IMAGE_JOB_TYPE).toBe("hermes_media_image_generate");
    expect(HERMES_MEDIA_VIDEO_JOB_TYPE).toBe("hermes_media_video_generate");
    expect(HERMES_CONNECTION_AUTH_JOB_TYPE).toBe("hermes_connection_authorize");
    expect(HERMES_CONNECTION_PROBE_JOB_TYPE).toBe("hermes_connection_probe");
    expect(HERMES_CONNECTION_DISCONNECT_JOB_TYPE).toBe("hermes_connection_disconnect");
    expect(HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY).toBe("hermes_media");
    expect(HERMES_MEDIA_CAPABILITY_FAMILIES).toEqual(["hermes-media-generation"]);
  });

  it("does not collide with any existing job-type constant exported from workerRuntime.ts", () => {
    const hermesMediaJobTypes: readonly string[] = [
      HERMES_MEDIA_IMAGE_JOB_TYPE,
      HERMES_MEDIA_VIDEO_JOB_TYPE,
      HERMES_CONNECTION_AUTH_JOB_TYPE,
      HERMES_CONNECTION_PROBE_JOB_TYPE,
      HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
    ];

    const allJobTypeConstantValues = Object.entries(workerRuntime)
      .filter(([name, value]) => name.endsWith("_JOB_TYPE") && typeof value === "string")
      .map(([, value]) => value as string);

    const otherJobTypeConstants = allJobTypeConstantValues.filter(
      (value) => !hermesMediaJobTypes.includes(value),
    );

    expect(otherJobTypeConstants).toContain("vertical_drama_ffmpeg_assembly");
    for (const hermesJobType of hermesMediaJobTypes) {
      expect(otherJobTypeConstants).not.toContain(hermesJobType);
    }
    expect(allJobTypeConstantValues).not.toContain("external_agent_task");
  });
});

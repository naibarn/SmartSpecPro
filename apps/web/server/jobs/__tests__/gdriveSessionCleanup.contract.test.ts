import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Google Drive cleanup scheduler boundary", () => {
  it("keeps Drive API cleanup as a product operation but schedules it canonically under hard cutover", () => {
    const source = readFileSync(new URL("../gdriveSessionCleanup.ts", import.meta.url), "utf8");
    expect(source).toContain('jobType: "gdrive.edit_session_cleanup"');
    expect(source).toContain("startFeature186SystemSchedule");
    expect(source).toContain("runGDriveSessionCleanup");
    expect(source).not.toContain("CloudTasks");
    expect(source).not.toContain("Cloud Run");
  });
});

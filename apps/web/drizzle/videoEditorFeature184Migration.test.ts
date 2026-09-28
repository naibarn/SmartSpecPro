import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Feature 184 migration ownership", () => {
  it("ships additive project revision/asset/job tables with queue linkage", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "drizzle/0288_feature_184_video_editor_revisions.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "video_editor_project_revisions"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "video_editor_project_assets"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "video_editor_project_jobs"');
    expect(sql).toContain('REFERENCES "worker_jobs"("id")');
    expect(sql).toContain('REFERENCES "tenants"("id") ON DELETE CASCADE');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it("ships resumable upload and reviewable analysis tables", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "drizzle/0290_feature_184_video_editor_media_sessions.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "video_editor_upload_sessions"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "video_editor_upload_parts"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "video_editor_analysis_artifacts"');
    expect(sql).toContain('"expiresAt" timestamptz NOT NULL');
    expect(sql).toContain('"sessionId" varchar(64) NOT NULL');
    expect(sql).toContain('REFERENCES "video_editor_project_revisions"("id")');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});

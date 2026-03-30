/**
 * Seed script for baseline sandbox profiles.
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
 *
 * Usage: npx tsx drizzle/seedSandboxProfiles.ts
 */
import { getDb } from "../server/db";
import { sandboxProfiles } from "./schema";
import type { InsertSandboxProfile } from "./schema";

const BASELINE_PROFILES: InsertSandboxProfile[] = [
  {
    slug: "code-default",
    name: "Code Execution (Default)",
    description: "General-purpose code interpreter sandbox with Python runtime",
    executionMode: "code",
    baseImage: "python:3.11-slim",
    cpuLimit: "1000m",
    memoryLimitMb: 2048,
    ephemeralDiskMb: 5120,
    timeoutSeconds: 600,
    networkDefaultAction: "deny",
    allowBrowser: false,
    allowCommand: false,
    allowCodeInterpreter: true,
    allowFileUpload: true,
    maxInputMb: 50,
    maxOutputMb: 100,
  },
  {
    slug: "media-processing",
    name: "Media Processing",
    description: "FFmpeg-based media processing sandbox for video/audio operations",
    executionMode: "media",
    baseImage: "jrottenberg/ffmpeg:6-ubuntu",
    cpuLimit: "2000m",
    memoryLimitMb: 4096,
    ephemeralDiskMb: 10240,
    timeoutSeconds: 1800,
    networkDefaultAction: "deny",
    allowBrowser: false,
    allowCommand: true,
    allowCodeInterpreter: false,
    allowFileUpload: true,
    maxInputMb: 500,
    maxOutputMb: 1000,
  },
  {
    slug: "browser-default",
    name: "Browser Automation (Default)",
    description: "Playwright browser sandbox with network access plus LibreOffice for slide/PDF workflows",
    executionMode: "browser",
    baseImage: "smartspec/browser-sandbox:local",
    cpuLimit: "2000m",
    memoryLimitMb: 4096,
    ephemeralDiskMb: 5120,
    timeoutSeconds: 600,
    networkDefaultAction: "allow",
    allowBrowser: true,
    allowCommand: true,
    allowCodeInterpreter: false,
    allowFileUpload: true,
    maxInputMb: 50,
    maxOutputMb: 100,
  },
  {
    slug: "file-parser",
    name: "File Parser",
    description: "Document parsing sandbox for PDF, DOCX, and other file formats",
    executionMode: "file",
    baseImage: "python:3.11-slim",
    cpuLimit: "1000m",
    memoryLimitMb: 2048,
    ephemeralDiskMb: 5120,
    timeoutSeconds: 300,
    networkDefaultAction: "deny",
    allowBrowser: false,
    allowCommand: true,
    allowCodeInterpreter: false,
    allowFileUpload: true,
    maxInputMb: 100,
    maxOutputMb: 200,
  },
];

export { BASELINE_PROFILES };

export async function seedSandboxProfiles(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available");
    return;
  }

  for (const profile of BASELINE_PROFILES) {
    await db
      .insert(sandboxProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: sandboxProfiles.slug,
        set: {
          name: profile.name,
          description: profile.description,
          executionMode: profile.executionMode,
          baseImage: profile.baseImage,
          cpuLimit: profile.cpuLimit,
          memoryLimitMb: profile.memoryLimitMb,
          ephemeralDiskMb: profile.ephemeralDiskMb,
          timeoutSeconds: profile.timeoutSeconds,
          networkDefaultAction: profile.networkDefaultAction,
          allowBrowser: profile.allowBrowser,
          allowCommand: profile.allowCommand,
          allowCodeInterpreter: profile.allowCodeInterpreter,
          allowFileUpload: profile.allowFileUpload,
          maxInputMb: profile.maxInputMb,
          maxOutputMb: profile.maxOutputMb,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`[Seed] Sandbox profiles seeded (${BASELINE_PROFILES.length} profiles)`);
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSandboxProfiles()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Seed] Failed:", err);
      process.exit(1);
    });
}

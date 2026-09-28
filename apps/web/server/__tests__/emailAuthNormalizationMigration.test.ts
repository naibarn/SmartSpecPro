import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const migrationPath = path.join(
  drizzleDir,
  "0214_email_auth_normalization.sql"
);

describe("email auth normalization migration", () => {
  it("is duplicate-safe and preserves phone values in the polymorphic token email column", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");

    expect(content).toMatch(/GROUP BY\s+lower\(btrim\("email"\)\)/i);
    expect(content).toMatch(/HAVING\s+count\(\*\)\s*>\s*1/i);
    expect(content).toMatch(/RAISE\s+EXCEPTION/i);
    expect(content).toMatch(
      /channel[\s\S]*?IN\s*\([\s\S]*?'email',[\s\S]*?'backup_email',[\s\S]*?'reset_email',[\s\S]*?'reset_backup',[\s\S]*?'disable_2fa_email'[\s\S]*?\)/i
    );
    expect(content).toMatch(
      /UPDATE\s+"email_verification_tokens"[\s\S]+channel[\s\S]*?IN/i
    );
    expect(content).not.toMatch(/channel.*IN[\s\S]+['"]sms['"]/i);
    expect(content).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(content).toMatch(/lower\(btrim\("email"\)\)/i);
  });
});

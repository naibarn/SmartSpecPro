/**
 * Report-first backfill for the canonical narrative-role columns introduced by
 * the Character Visual Bible v2 pipeline.
 *
 * Default: report only. Mutations require --apply and write a JSON backup
 * before the transaction. Occupation-only legacy text is deliberately left in
 * review state; the backfill never guesses protagonist/villain from a job.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import postgres from "postgres";
import { normalizeLegacyRole, type NarrativeRole, type RoleTier } from "../shared/verticalDramaSeries/narrativeRole";

export interface CharacterRoleBackfillRow {
  id: number;
  seriesId: number;
  characterKey: string;
  role: string | null;
  narrativeRole: NarrativeRole | null;
  roleTier: RoleTier | null;
  occupation: string | null;
  roleProvenance: string | null;
  roleReviewStatus: string | null;
}

export interface CharacterRoleBackfillRepair {
  id: number;
  characterKey: string;
  before: Pick<CharacterRoleBackfillRow, "narrativeRole" | "roleTier" | "occupation" | "roleProvenance" | "roleReviewStatus">;
  after: Pick<CharacterRoleBackfillRow, "narrativeRole" | "roleTier" | "occupation" | "roleProvenance" | "roleReviewStatus">;
}

export function planCharacterRoleBackfill(rows: CharacterRoleBackfillRow[]): CharacterRoleBackfillRepair[] {
  return rows.flatMap(row => {
    if (row.roleProvenance === "user_confirmed") return [];
    const normalized = normalizeLegacyRole(row.role);
    const after = {
      narrativeRole: row.narrativeRole ?? normalized.narrativeRole,
      roleTier: row.roleTier ?? normalized.roleTier,
      occupation: row.occupation ?? row.role,
      roleProvenance: row.roleProvenance ?? "migrated",
      roleReviewStatus: row.roleReviewStatus ?? normalized.reviewStatus,
    } as const;
    const changed = Object.keys(after).some(key => {
      const field = key as keyof typeof after;
      return after[field] !== row[field];
    });
    return changed ? [{ id: row.id, characterKey: row.characterKey, before: {
      narrativeRole: row.narrativeRole,
      roleTier: row.roleTier,
      occupation: row.occupation,
      roleProvenance: row.roleProvenance,
      roleReviewStatus: row.roleReviewStatus,
    }, after }] : [];
  });
}

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

export async function runCharacterRoleBackfill(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const check = process.argv.includes("--check");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<CharacterRoleBackfillRow[]>`
      SELECT id, "seriesId", "characterKey", role, "narrativeRole", "roleTier",
             occupation, "roleProvenance", "roleReviewStatus"
      FROM vertical_drama_characters
      ORDER BY id
    `;
    const repairs = planCharacterRoleBackfill(rows);
    console.log(JSON.stringify({ mode: apply ? "apply" : check ? "check" : "report", scanned: rows.length, repairs: repairs.length }, null, 2));
    if (!apply) {
      if (check && repairs.length > 0) process.exitCode = 1;
      return;
    }
    if (repairs.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolve(argValue("--backup") ?? `backups/vertical-drama-character-roles-${timestamp}.json`);
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: repairs }, null, 2), "utf8");
    await sql.begin(async tx => {
      for (const repair of repairs) {
        await tx`
          UPDATE vertical_drama_characters
          SET "narrativeRole" = ${repair.after.narrativeRole},
              "roleTier" = ${repair.after.roleTier},
              occupation = ${repair.after.occupation},
              "roleProvenance" = ${repair.after.roleProvenance},
              "roleReviewStatus" = ${repair.after.roleReviewStatus},
              "updatedAt" = now()
          WHERE id = ${repair.id} AND COALESCE("roleProvenance", '') <> 'user_confirmed'
        `;
      }
    });
    console.log(JSON.stringify({ applied: repairs.length, backupPath }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCharacterRoleBackfill().catch(error => {
    console.error("[backfill-vertical-drama-character-roles] failed:", error);
    process.exitCode = 1;
  });
}

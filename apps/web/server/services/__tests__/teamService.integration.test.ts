import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { agencies, assistantTeams } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { createTeamFromBlueprint } from "../teamService";

describe("teamService integration", () => {
  it("creates the creative content blueprint team on the real database", async () => {
    const db = getDb();
    const name = `Creative Content 1 Integration ${Date.now()}`;

    let result:
      | Awaited<ReturnType<typeof createTeamFromBlueprint>>
      | undefined;

    try {
      result = await createTeamFromBlueprint(
        "creative-content-studio",
        "tenant-ZCSKEM9s",
        1,
        {
          name,
          description: "Plans, researches, creates, reviews, and publishes daily creative content across social channels.",
          category: "creative",
        },
      );

      expect(result.teamId).toBeTruthy();
      expect(result.agencyId).toBeTruthy();
      expect(result.members.length).toBe(6);

      const [teamRow] = await db.select().from(assistantTeams).where(eq(assistantTeams.id, result.teamId)).limit(1);
      const [agencyRow] = await db.select().from(agencies).where(eq(agencies.id, result.agencyId)).limit(1);

      expect(teamRow?.name).toBe(name);
      expect(agencyRow?.name).toBe(name);
    } finally {
      if (result) {
        await db.delete(assistantTeams).where(eq(assistantTeams.id, result.teamId));
        await db.delete(agencies).where(eq(agencies.id, result.agencyId));
      }
    }
  });
});

/**
 * TEMPORARY — Part 1 gate. Delete after use.
 *
 * Proves the series-memory pipeline emits real relationships with a
 * `disclosure` value from a REAL LLM call using the real skill.md.
 * Creates a throwaway series; NEVER touches series 16/17 (real user work).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { verticalDramaSeries } from "../drizzle/schema";
import { generateStoryBibleDeep } from "../server/services/verticalDramaStoryBible";
import { persistDeepDraftEpisodeMemories } from "../server/services/verticalDramaSeriesMemoryProjection";

const TENANT = "tenant-ZCSKEM9s";
const USER = 1;
const TITLE = "[TEST] memory gate";

async function main() {
  const db = await getDb();

  const inserted = await db
    .insert(verticalDramaSeries)
    .values({
      tenantId: TENANT,
      userId: USER,
      title: TITLE,
      locale: "th",
      genre: "โรแมนติกดราม่า",
      tone: "อบอุ่น",
      status: "draft",
      targetEpisodeCount: 2,
      bible: {
        logline:
          "ปูนกับแพรแอบคบกันมาสามเดือน ยังไม่บอกใครเลยแม้แต่กร พี่ชายของแพรที่เป็นเพื่อนสนิทปูน ระหว่างนั้นบ้านที่ปูนรีโนเวทค้างไว้ตั้งแต่ปีก่อนก็ยังไม่เสร็จ",
      },
    })
    .returning({ id: verticalDramaSeries.id });

  const seriesId = Number(inserted[0].id);
  console.log(`[gate] created test series id=${seriesId}`);

  const episodes = [
    {
      episodeNumber: 1,
      workingTitle: "ความลับสามเดือน",
      logline: "ปูนกับแพรแอบเจอกันที่บ้านรีโนเวทค้าง กรเกือบจับได้",
      keyBeats: [
        "ปูนกับแพรนัดเจอกันลับ ๆ ที่บ้านที่รีโนเวทค้าง",
        "กรโทรมาหาปูนพอดี ปูนต้องโกหก",
        "แพรบอกว่าอยากบอกกรแล้ว ปูนยังไม่กล้า",
        "ผนังบ้านที่ยังไม่ได้ทาสีเป็นฉากหลังของการทะเลาะเล็ก ๆ",
      ],
    },
    {
      episodeNumber: 2,
      workingTitle: "สีที่ยังไม่ได้ทา",
      logline: "กรเริ่มสงสัย ปูนกับแพรตัดสินใจว่าจะบอกหรือไม่บอก",
      keyBeats: [
        "กรเจอของแพรที่บ้านปูน",
        "ปูนอ้างว่าแพรมาช่วยดูงานรีโนเวท",
        "แพรน้อยใจที่ปูนยังปิดอยู่",
        "จบด้วยกรถามตรง ๆ ว่ามีอะไรกันหรือเปล่า",
      ],
    },
  ];

  console.log("[gate] running generateStoryBibleDeep (real LLM call)...");
  const result = await generateStoryBibleDeep({
    userId: USER,
    tenantId: TENANT,
    seriesId,
    title: TITLE,
    locale: "th",
    genre: "โรแมนติกดราม่า",
    tone: "อบอุ่น",
    episodes: episodes as never,
  });

  console.log(`[gate] model=${result.model} credits=${result.creditsUsed}`);
  console.log(`[gate] warnings=${JSON.stringify(result.warnings)}`);
  console.log(`[gate] draftedItems=${result.draftedItems.length}`);

  for (const item of result.draftedItems) {
    const it = item as unknown as {
      episodeNumber: number;
      episodeMemory?: unknown;
    };
    console.log(
      `[gate] ep${it.episodeNumber}: episodeMemory present = ${it.episodeMemory != null}`
    );
    if (it.episodeMemory) {
      console.log(JSON.stringify(it.episodeMemory, null, 2));
    }
  }

  const summary = await persistDeepDraftEpisodeMemories(
    { tenantId: TENANT, userId: USER, seriesId },
    result.draftedItems as never
  );
  console.log(`[gate] persist = ${JSON.stringify(summary)}`);

  const [row] = await db
    .select({ memory: verticalDramaSeries.memory })
    .from(verticalDramaSeries)
    .where(eq(verticalDramaSeries.id, seriesId));

  const memory = row?.memory as {
    currentState?: { relationships?: unknown[]; openThreads?: unknown[] };
  } | null;

  console.log("\n=============== GATE RESULT ===============");
  console.log("RELATIONSHIPS:");
  console.log(
    JSON.stringify(memory?.currentState?.relationships ?? [], null, 2)
  );
  console.log("OPEN THREADS:");
  console.log(JSON.stringify(memory?.currentState?.openThreads ?? [], null, 2));
  console.log(`\ntest series id = ${seriesId}`);
  process.exit(0);
}

main().catch(err => {
  console.error("[gate] ERROR:", err);
  process.exit(1);
});

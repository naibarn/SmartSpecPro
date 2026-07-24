// Diagnostic: print which ENABLED model the requirements-based resolver picks
// for the sequential storyboard skill (no LLM call, no credits).
import { loadEnabledLlmModelRows } from "../server/services/enabledLlmModels";
import { selectLlmModelCandidates } from "../server/services/intelligentModelSelector";

async function main() {
  const rows = await loadEnabledLlmModelRows({ allowFreeModels: false });
  const reqs = { supportsVision: true, supportsThinking: true, contextLength: 1000000 };
  const picks = selectLlmModelCandidates(reqs as any, rows, 5);
  console.log("CANDIDATES(top5)=", JSON.stringify(picks));
  console.log("WINNER=", picks[0] ?? null);
  process.exit(0);
}
main().catch(e => { console.error("FAILED", e?.message ?? e); process.exit(1); });

# Orchestra Decisions

[2026-05-30T01:51:24Z] DECISION: Start a fresh orchestra session.
  Context: Existing `orchestra/` directory had no `snapshot.json`; archived prior files before creating new state.
  Alternatives considered: Resume stale state; rejected because no active snapshot existed.

[2026-05-30T01:51:24Z] DECISION: Use `voiceover_script` as the replacement input name for `scene_descriptions`.
  Context: Existing Media Studio concepts and planner already use `voiceover_script`/`voiceoverBeats`, and the user requested replacing scene description with spoken script.
  Alternatives considered: `dialogue_script`; rejected because current production flow mostly uses voiceover/ad-read script wording.

[2026-05-30T02:17:00Z] DECISION: Add explicit cinematic realism, face identity, and product immutability locks to every production reference storyboard skill.
  Context: User requested higher-quality cinematic realistic images, better shot alignment to Storyboard Guide + Voiceover Script, clearer recurring character faces, natural non-plastic people, and stricter product fidelity from references.
  Alternatives considered: Only changing `cinematic_style` schema descriptions; rejected because the behavior must be enforced inside each skill prompt contract and output contract.

[2026-05-30T02:30:13Z] DECISION: Add explicit shot-by-shot frame mapping and per-frame product fidelity QA.
  Context: User supplied a real generated 3x3 storyboard where the prompt described the intended journey but output frames still drifted into generic lifestyle/product shots and changed the bedside table geometry.
  Alternatives considered: Adjusting only the example prompt; rejected because every production reference storyboard skill needs the same contract so the behavior generalizes across categories.

[2026-05-30T10:10:00+07:00] DECISION: Consolidate production reference storyboard execution into one skill with category rule files.
  Context: User requested replacing the 20 near-duplicate `*-reference-storyboard` skills with one shared skill and product-category option because only product-specific fidelity rules differ.
  Alternatives considered: Keep 20 skills and continue syncing duplicated prompt logic; rejected because every future storyboard/cinematic/face/product lock change would need 20 mirrored edits and increase drift risk.
  Outcome: `product-reference-storyboard` is the only Production-enabled storyboard reference skill; legacy skills remain on disk but disabled from Production selection; `product_category` selects the relevant `references/product-categories/*.md` rule file.

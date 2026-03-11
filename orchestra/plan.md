# Orchestra Plan

## Task
Move Reference Images from "Visual & References" section to right after Topic in "Content" section, add thumbnail previews, and pass reference images to article generation skill execution.

## Classification
- scope: small
- risk: low
- affected_domains: [frontend]
- estimated_file_count: 1-2
- chosen_route: single agent (conductor direct edit)
- task_summary: Relocate Reference Images UI to Content section, enhance with thumbnails, pass to article generate skill
- bug_route: N/A

## Changes Required
1. CUT the Reference Images block (lines ~1995-2096) from "Visual & References" section
2. PASTE it into "Content" section right after Topic textarea (after line ~1478)
3. Update description to clarify multi-purpose use (article gen, image gen, video start/stop frame)
4. Pass referenceImageUrls to the handleGenerateArticle executeSkill call
5. Thumbnails already exist in current implementation (grid with img tags) — they're already there

# Feature 098 Request

## Source Request

The user needs the auto-team system to stop producing plausible room discussion without real completion. Real database evidence from room `ad2e7e07-8820-40ff-bc74-3d976572deb9` showed that the run had a plan, but execution routed to article-writing messages, did not create media artifacts, did not attach most turns to work items, and ended by hitting `max_rounds_reached`.

The requested improvement is to create a complete plan so auto-team execution reaches the real goal:

- follow the durable plan
- assign and enforce persona owner/reviewer responsibilities
- route media objectives to media generation
- route complex objectives to Agency Swarm when needed
- create durable work items, artifacts, media jobs, reviews, and final results
- keep Work OS, My Requests, and Teams aligned so the user can track the whole lifecycle

## Evidence Snapshot

Observed from room `ad2e7e07-8820-40ff-bc74-3d976572deb9`:

- `team_runs.status = completed`
- `team_runs.stopReason = max_rounds_reached`
- plan artifact existed
- final review was missing
- 20 of 22 messages had no `workItemId`
- 20 messages used `runtimeMetadata.route = writing.article`
- 20 messages used `selectedSkillId = parenting-article-writer`
- no messages had artifact refs
- no messages routed to video, image, or Agency Swarm execution

## Expected Outcome

After implementation, starting automation for a video request must result in a real video execution chain or an explicit blocked state that explains the missing capability. It must not silently degrade into discussion or article-style output.

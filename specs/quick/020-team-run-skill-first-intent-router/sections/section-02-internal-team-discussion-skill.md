# Section 02 — Internal Team Discussion Skill

## Goal

Create a server-usable internal skill for agent-to-agent discussion inside team rooms and runs.

## Ownership boundaries

- Owns the new skill package and metadata model extensions
- Owns registry visibility rules for internal-only skills
- Does not own room routing itself

## Target files

- `apps/web/skills/team-discussion-assistant/skill.md` (new)
- optional skill schema/support files under the same folder
- `packages/skills/src/types.ts`
- `apps/web/server/services/skillRegistry.ts`

## Required behavior

- skill can be executed by server-owned team-run paths
- skill is hidden from normal user-facing skill browsing
- skill can declare it supports `team_room` / `team_run` and `agent_to_agent`
- skill uses existing skill execution policy and planner model resolution

## Prompt intent

The skill should be optimized for:

- assistant-to-assistant discussion
- synthesis, critique, proposal, handoff, and next-step clarity
- not sounding like consumer support chat

## Metadata additions

Add fields for:

- `surfaceScopes`
- `interactionModes`
- `internalOnly`
- `teamRunEligible`

## Done when

- the new skill loads from registry
- user-facing skill listings do not expose it by default
- server-side execution can target it explicitly

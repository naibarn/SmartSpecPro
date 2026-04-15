# Interview Transcript - Feature 095 Work OS Automation Fabric

## Q1. What is the intended architecture direction?

Use Work OS as the canonical orchestration and audit plane. Do not create a second workflow engine. Compose the system from the existing Work OS, Skill Registry / Unified Orchestrator, Agency Swarm / Agency Builder, Document Management, Media Studio, Video Editor, and the existing Automation Copilot adapter.

## Q2. What are the required operating modes?

The feature must support three modes:
- Manual assist
- Semi-auto with editable checkpoints
- Fully auto with approval gates

The same case must be able to move between modes during execution.

## Q3. How should open-ended reasoning and deterministic execution be split?

Agency Swarm should handle research, planning, critique, and branch exploration. Skills should handle deterministic special-purpose steps. Once a branch is stable, it should become a skill or a bounded execution step rather than remaining an open-ended agent flow.

## Q4. How should content, media, and video outputs be handled?

Intermediate content such as briefs, prompts, article drafts, and storyboard artifacts should live in Document Management. Media Studio should create images and other media assets. Video Editor should assemble and render timelines. Work OS should keep the case ledger and timeline evidence, not duplicate those asset stores.

## Q5. What is the stance on user edits and resume behavior?

Users must be able to intervene between steps, edit drafts, approve gates, rerun from a checkpoint, and resume from the last safe state. Checkpoints should be explicit and versioned so that edits do not destroy the prior history.

## Q6. How should browser/external automation fit?

Automation Copilot should be treated as one execution adapter for browser/external steps that need the existing policy/credit/boundary model. It should not become the top-level planner for the whole fabric.

## Notes on interview source

This transcript is synthesized from the spec and the current codebase. No interactive interview tool was available in the current environment, so the decisions above are the planning assumptions that the implementation plan must honor.

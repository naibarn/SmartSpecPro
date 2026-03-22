# Section 19: Team Blueprints And Member Kinds

## Goal

Define how one team roster can contain internal personas, human reviewers, and external connector systems while still being easy to create from presets.

## Deliverables

- canonical `memberKind` model
- preset team blueprint schema
- blueprint instantiation rules
- roster UX rules for mixed member kinds
- default 4-5 member office presets

## Required Rules

- one roster may contain `persona`, `human`, and `external_connector` members together
- external connector members must not be treated as personas for prompt construction
- one persona may still belong to multiple teams
- team-specific routing, approval, and working-hour behavior lives at the roster/profile layer, not by mutating the shared persona
- every preset blueprint must include:
  - orchestrator assignment
  - at least one producer role
  - at least one reviewer role
  - a handoff path
  - an approval path

## Default Blueprint Shapes

- `Daily Content Desk`
- `Quote And Proposal Desk`
- `Research And Insight Desk`
- `Operations Watch Desk`
- `Presentation Studio`

## Acceptance Clues

- a user can load a blueprint and immediately understand who researches, who drafts, who reviews, and who approves
- a mixed roster renders consistently in the team UI with visible badges for member kind and current responsibility

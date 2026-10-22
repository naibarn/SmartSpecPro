# Section 01 — G0 Owner and Number Audit

## Objective

Establish SPEC-310's exact identity, owner map, current source paths and accepted dependency boundaries without touching another owner's work.

## Requirement IDs

`A57`, `A59`, R1.3.1–R1.3.3 and G0. Reconcile R1.0 A01–A20 provenance before freezing acceptance coverage.

## Scope

SPEC-310 documentation only: `g0-discovery.md`, source/owner matrix, handoff freshness fields and the cumulative design metadata. Never edit SPEC-309, WP1–WP2C2, Desktop Auth, Companion Chat, Task Control, protected main, or another PR/worktree.

## Prerequisites

Fetch the configured canonical branch. Recheck canonical registry, PRs, remote branches, reservation evidence and local worktrees. Confirm the actual workspace owner before any numeric registry reconciliation.

## Deliverable and completion predicate

One dated evidence record bound to one base SHA; SPEC-309's separate assignment remains untouched; SPEC-310's status is clear about canonical vs unpublished allocation; all cross-SPEC owners and missing sources are listed.

## Verification and evidence

Run targeted registry/source-control inventory and compare a scoped diff. Record command scope, timestamp, SHA, and findings in the discovery document. This proves only discovery, not implementation or acceptance.

## Blocker challenge

If an authoritative source assigns 310 elsewhere, stop that ID and escalate only the allocation. If registry output disagrees with unpublished local assignment, continue independent G1 design while marking registry resolution as owner-pending.

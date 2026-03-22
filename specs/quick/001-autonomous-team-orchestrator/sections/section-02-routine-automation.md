# Section 02: Routine Automation

## Goal

Let teams act like daily workers with scheduled obligations.

## Direction

Build on existing scheduler infrastructure, not a new scheduler.

## Required concepts

- routine definition
- work item
- daily review pass
- execution pass
- retry / recovery pass

## Example routine

`daily-infographic-news`

- every day at 07:00 Asia/Bangkok
- collect latest news from approved sources
- shortlist candidate topics
- draft 5 infographic briefs
- generate assets
- send for reviewer approval
- publish or queue for human approval

## Working-hours rule

- if member has no configured working hours: available 24/7
- if member has working hours: considered available only inside that window
- orchestrator should prefer on-shift members first

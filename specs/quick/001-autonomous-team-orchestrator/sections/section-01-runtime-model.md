# Section 01: Runtime Model

## Goal

Define how persona, team profile, and orchestrator role should relate.

## Direction

- persona = identity/expertise/style
- assistant profile = team-specific role binding
- lead = current team coordinator field
- orchestrator role = explicit runtime responsibility, defaulting to lead when absent

## Main change

Add explicit team runtime semantics instead of overloading persona:

- `memberRole`
- `delegationPolicy`
- `reviewAuthority`
- `publishingAuthority`

## Why

This keeps persona reusable across multiple teams and avoids cloning personas just to change duty or authority.

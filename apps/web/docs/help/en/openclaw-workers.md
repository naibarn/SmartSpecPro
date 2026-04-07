---
slug: openclaw-workers
title: Claw Workers
description: Connect personal Claw workers, route team work to them, control worker budgets, and understand what the gateway supports today.
icon: Server
section: admin
order: 87
pages: ["/admin/tenants", "/admin/monitoring", "/teams", "/credits"]
tags: [openclaw, worker, external runtime, monitoring, teams, credits, feature flag]
---

# Claw Workers

Use this guide when you want SmartSpecPro Web to hand supported work to a Claw-family worker such as OpenClaw.

Claw workers are best for:

- long-running assistant work
- browser or tool-heavy tasks
- jobs where the worker can act like an operator on your behalf
- cases where the worker should create results and send links back into SmartSpecPro

They are not the main path for:

- local Windows file access
- desktop GPU or media rendering
- machine-specific work that should stay on SmartSpec Desktop

## What this phase adds

This phase adds:

- a tenant switch to turn external Claw workers on
- a worker fleet panel in **Admin Monitoring**
- owner-bound personal workers
- team binding with **External Reference** and **Bound Worker**
- delegated worker sessions so supported jobs can call SmartSpecPro through the system gateway
- worker budget caps for `hourly`, `5-hour`, `daily`, `weekly`, and `monthly` spend windows
- owner-scoped Library and RAG access
- worker callbacks back into rooms, workflow history, or user notifications
- worker controls: **Inspect**, **Drain**, **Disable**, **Resume**, and **Revoke**
- a one-time cleanup action: **Redact Legacy Data**
- a credit history label for worker usage

## Personal worker model

The important default is:

- each user adds their own worker
- a worker belongs to that owner only
- the worker cannot act for other users
- the worker cannot cross tenants
- admins can inspect or stop workers for safety, but they do not use one person's worker as another person's worker

Think of a bound worker as a personal operator that can do supported platform work for its owner, not as a shared tenant robot.

## Before you start

Make sure these are ready first:

1. Turn on the tenant feature flag `openClawExternalRuntime` in **Admin Tenants**.
2. Confirm the user has already registered a worker.
3. Check that the worker appears in **Admin Monitoring** and is healthy enough to use.
4. If your platform operator uses the global dispatch switch, make sure `OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED` is not set to `false`.

If the tenant flag is off, the worker can exist in the system but new work will not be dispatched for that tenant.

## Setup order that works best

1. Enable `openClawExternalRuntime`.
2. Let the user register their own worker.
3. Open **Admin Monitoring** and confirm the worker is online.
4. Go to **Teams** and add or edit an **External Connector** member.
5. Fill in the two important fields:
   - `External Reference`: the stable name or ID you use for that connector, for example `openclaw://main-office`
   - `Bound Worker`: the registered worker that should receive this connector's work
6. Save the team.
7. Start the run or workflow and check that credits and monitoring look correct.

## What a bound worker can do now

When a worker receives a delegated session for a supported job, it can use the SmartSpecPro gateway for allowed actions such as:

- LLM/chat and responses calls
- supported skills
- supported agency or swarm-style execution
- supported image, video, job, and presentation routes
- Library search
- Library upload for allowed file types
- RAG search over the owner's content
- sending result updates back to a room
- sending workflow updates
- sending a user-facing completion notification

Important:

- the worker only gets the routes and actions granted to that delegated session
- the worker still spends the owner's SmartSpecPro credits
- the worker is blocked when the owner's balance or worker budget guardrails say it must stop
- delegated worker LLM calls must use SmartSpecPro-approved model aliases
- delegated worker calls also respect per-job concurrency caps so a broken worker does not flood the gateway

## How the worker knows what is available

Use both of these:

- `GET /v1/openapi.json` for the static HTTP contract
- the delegated worker manifest for the job-specific truth

The delegated manifest is the source that tells the worker:

- which route families are available for this job
- which knowledge or upload actions are allowed
- which callback targets are allowed
- which model aliases are approved for that job profile
- whether a capability is ready, limited, or unavailable

Current rule:

- delegated workers should use HTTP-first integration
- delegated worker MCP access is unavailable in this phase

## Library and RAG access

Workers can use the owner's knowledge only when the delegated job grants it.

Today that means a delegated worker can:

- search the owner's Library
- upload allowed files into the owner's Library
- search the owner's RAG content

It cannot:

- read another user's Library
- write into another user's Library
- cross tenants

## Worker budget guardrails

The owner can set personal guardrails for each worker:

- hourly
- 5-hour
- daily
- weekly
- monthly

Leave a field empty for no cap in that window.

These caps apply to SmartSpecPro-routed usage for that worker. They do not change what the worker spends on outside services that it calls with its own credentials.

The worker also has built-in in-flight safety limits on the SmartSpecPro side:

- up to 4 lightweight read actions at the same time
- up to 2 compute-style actions such as LLM, skill, agency, or job creation calls
- up to 1 high-cost media start action at the same time

If the worker hits these limits, the gateway rejects the extra request instead of letting usage spike silently.

You can set these caps:

- from **Teams** while selecting a bound worker
- from **Admin Monitoring** while inspecting a worker

## What each worker action means

### Inspect

Shows the latest redacted diagnostics snapshot for that worker.

Use it when you want to confirm:

- the worker is still reporting
- dashboard information is present
- warning flags or summary details look normal

### Drain

Stops new work from being assigned, but lets current jobs finish.

Use this before maintenance, restarts, or controlled shutdowns.

### Disable

Stops the worker from being used.

Use this when the worker should stay unavailable until an admin turns it back on.

### Resume

Allows a drained or disabled worker to accept work again.

Use this after maintenance or after fixing a temporary issue.

### Revoke

Ends trust in the current worker registration.

Use this when a worker should no longer be allowed to act for the tenant. In many cases, the worker will need to register again after revocation.

### Redact Legacy Data

Cleans older stored worker diagnostics and artifact metadata so they match the current privacy and redaction rules.

Use it when:

- this environment had worker data from older builds
- you enabled the feature after earlier test runs
- you want old stored worker details cleaned up for the current tenant

This is a cleanup action, not something you normally run every day.

## Teams: how to set the fields correctly

When you add an **External Connector** member in **Teams**, the two most important fields are:

- `External Reference`: identifies the connector in a stable way
- `Bound Worker`: chooses the registered worker that should handle that connector

Simple rule:

- use **External Reference** to say "which connector is this"
- use **Bound Worker** to say "which worker should receive the work"

If **Bound Worker** is left unresolved, runs that depend on that connector may pause or stay incomplete until the binding is fixed.

## Important: what Bound Worker alone does not do

`Bound Worker` chooses the worker, but permissions still come from the delegated session for the job.

A binding alone does not automatically:

- grant every API
- grant every skill
- grant cross-user access
- grant cross-tenant access
- turn the worker into a full web login
- enable MCP for delegated mode in this phase

The worker can only use what the delegated job manifest and grants allow.

Also note that this team-binding path currently targets **OpenClaw gateway workers**. It is not the same thing as binding a ZeroClaw desktop runtime.

## Monitoring: what to check first

On the **Claw Workers** panel in **Admin Monitoring**, check these first:

- worker status
- last seen time
- active job count
- how many connectors are bound to the worker
- whether diagnostics are available

If a worker is visible but not taking jobs, the most common reasons are:

- the tenant flag is still off
- the worker is drained, disabled, or revoked
- the wrong worker was bound in Teams
- global dispatch was turned off by the operator

## Credits: where worker usage appears

On the **Credits** page, worker-based usage appears as:

- `Worker Runtime` in English
- `รันผ่าน Worker` in Thai

This helps you confirm that a task used the external worker path instead of a normal chat or media path.

If the worker later calls the public media API directly, that media request is tracked separately as media/API usage, not as the team-binding action itself.

## API and MCP reality today

Current status:

- Supported delegated workers use the HTTP gateway and deduct credits correctly when the route is granted.
- Library search, Library upload, and RAG search are available through the delegated HTTP path.
- MCP is available for normal platform callers, but delegated worker MCP is intentionally unavailable in this phase.

Simple rule:

- for delegated workers today, use the HTTP gateway plus the delegated manifest
- do not assume that a Bound Worker alone unlocks every platform function

## Quick checklist

Before telling a user the worker feature is ready, confirm all of these:

- `openClawExternalRuntime` is on for the tenant
- the worker is online in **Admin Monitoring**
- the worker belongs to the correct user
- the team has the correct **Bound Worker**
- worker budget caps are set if you want spend protection
- worker usage appears in **Credits** when expected
- **Redact Legacy Data** has been run once if the tenant already had older worker records

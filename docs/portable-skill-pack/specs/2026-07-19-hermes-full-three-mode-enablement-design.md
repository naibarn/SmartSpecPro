# Hermes Full Three-Mode Enablement Design

Date: 2026-07-19
Status: Approved

## Goal

Make Grok via Hermes usable end to end for:

1. `server_shared`: one admin-connected Grok account shared by the tenant;
2. `server_personal`: each user connects an isolated personal Grok account,
   executed by the shared server worker;
3. `private_worker`: each user connects a personal Grok account through the
   Worker App on their own Windows machine.

## Current Gaps

- The healthy `smartspec-hermes-hermes-1` container is the legacy Hermes agent
  gateway, not the Feature 135 media worker.
- The pinned host CLI, Feature 135 systemd unit, secure pairing environment,
  database worker row, and `hermes_shared_worker_id` setting are absent.
- `server_shared` and `server_personal` settings are disabled.
- No Hermes provider connection exists.
- The Windows Hermes runtime pack is unpublished.
- The served Worker App `0.1.129` predates the private-worker Hermes runtime
  implementation.
- The central-account button is shown as actionable even when its scope and
  worker prerequisites are unavailable.

## Architecture

### Shared server worker

Install `hermes-agent==0.18.2` in an isolated `/var/lib` virtual environment.
Pair one tenant-scoped `hermes_agent_gateway` worker through the existing
control-plane registration route, store its refresh credential only in a
root-owned `0600` environment file, install the dedicated systemd unit, and
require a healthy heartbeat plus advertised `hermesMedia` capability.

Both server scopes use this worker. Every connection receives a distinct
`profileReference`, so central and personal Grok sessions remain isolated.

### Connection semantics

- `server_shared` can be created and managed only by an admin. It is visible
  tenant-wide and bills the connected central Grok account.
- `server_personal` belongs to the connecting user. Other users cannot manage
  or select it.
- `private_worker` belongs to the user and must target an online worker
  registered by that same user.

The control plane remains authoritative for tenant, ownership, worker
assignment, scope flags, capability, and online-state checks.

### Worker App

Build and publish the Windows Hermes runtime pack with its checksum manifest,
then build a new Worker App version containing the Hermes private-worker
runtime. Publish the installer through the existing desktop-release path and
verify the public manifest/download responses.

### UI

Present three clearly separated modes with:

- who owns the Grok account;
- whose quota is consumed;
- where prompts/reference images are processed;
- required worker state;
- accurate Ready / Action required status;
- disabled buttons when prerequisites are unavailable;
- a direct Worker App download/setup action for private mode;
- Thai/English copy following the selected UI language.

The central button must never appear active while `server_shared` is disabled
or the paired shared worker is unavailable.

## Validation

- Host doctor probe reports Hermes `0.18.2`.
- Shared worker systemd service is active and heartbeating.
- DB worker row is tenant-scoped, online, and advertises Hermes media.
- Both server scope flags are enabled only after the worker is ready.
- Central and server-personal connect calls enqueue an authorize job and expose
  a device-code flow.
- Private runtime manifest is allowed and downloadable.
- New Worker App installer is publicly served.
- Router/service/UI tests, TypeScript checks, Rust tests/checks, web build,
  health endpoint, worker heartbeat, and secret-leak checks pass.

Completing xAI authorization requires the Grok account owner to approve the
device code; the system must make that human step reachable and observable.

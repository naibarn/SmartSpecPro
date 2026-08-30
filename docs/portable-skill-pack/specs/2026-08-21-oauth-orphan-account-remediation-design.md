# OAuth orphan-account remediation design

Date: 2026-08-21
Status: approved for implementation

## Problem

The split Google OAuth flow persists a Python user and OAuth connection before
the Node registration gate. When invite-only registration rejects the first
exchange, a retry is treated as an existing OAuth login because the provider
connection already exists. This allows an uninvited account to obtain a
session, while leaving `registeredDomain` and `currentTenantId` empty.

The affected production account is user `131`,
`spoondirector@gmail.com`. It has no workflows, executions, credit
transactions, or registration event. It has one OAuth connection and default
skill-visibility rows only.

## Remediation

1. Delete only the confirmed orphan account in a guarded database transaction.
   Verify that the user, OAuth connection, and default visibility rows are gone.
2. On a first OAuth signup rejected by registration policy, remove the
   pre-created shared user so a retry starts as a fresh registration.
3. Treat an OAuth user with incomplete onboarding (`registeredDomain` or
   `currentTenantId` missing) as pending registration. Re-run invite admission
   before issuing any session, including when Python reports the OAuth
   connection as existing.
4. On successful admission, complete domain/tenant onboarding and preserve
   idempotent signup-credit behavior.
5. Fix workflow credit validation to read the canonical `credits` field and
   require a tenant before execution.

## Failure handling and security boundaries

- Registration denial must never create an active session.
- Cleanup is limited to the OAuth-created, incomplete row; an approved
  existing user must not be deleted.
- Tenant-scoped workflow execution fails closed when no tenant is assigned.
- No OAuth access or refresh token is returned in admin/API responses or logs.

## Verification

Focused tests cover first-attempt denial, retry denial, valid invite completion,
approved existing-user login, workflow credit lookup, and missing-tenant
rejection. Production verification is read-only after the targeted deletion;
no provider-consuming or browser exploit test is required for this patch.

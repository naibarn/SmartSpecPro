# Section 04: Workflow and Agency

## Scope

Wire Upload-Post into workflow and agency execution paths.

## Work

- Extend the shared social/background action input to carry Upload-Post profile and owner identity fields.
- Add Upload-Post gateway handling to the workflow/agency dispatch chain.
- Resolve the Upload-Post connection from the workflow owner's `userId`.
- Register Upload-Post capability metadata in the social catalog without adding it to the native provider registry.

## Constraints

- Preserve the existing native provider path unchanged.
- Keep the Upload-Post path decoupled from `providerRegistry.ts`.
- Fail with a clear ownership error if the workflow owner has no Upload-Post connection.


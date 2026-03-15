## Goal

Let users save, manage, and reuse their own visual blocks.

## Scope

- save selected content as reusable block
- generate/store preview
- user/library scoping
- update/delete/use flows
- ownership, tenant access, and permission rules
- stable metadata for category, tags, and preview invalidation
- hybrid preview flow: client working preview plus server canonical preview
- preview hash/versioning tied to component definition version and bound content
- canonical preview binary in object storage, metadata/index in database
- stateless preview service and explicit lifecycle states

## Done When

- a user can turn a custom design into a reusable block and find it in the same catalog as built-ins
- private and shared scopes behave predictably under the existing library permission model
- canonical server previews can replace temporary client previews deterministically
- preview artifacts can be deduplicated, invalidated, and re-read without the relational database storing the binary payload

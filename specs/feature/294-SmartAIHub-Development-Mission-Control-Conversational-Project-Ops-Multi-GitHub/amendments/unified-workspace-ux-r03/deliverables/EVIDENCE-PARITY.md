# Canonical runtime evidence parity and gaps

| Evidence | Prototype coverage | Canonical runtime status |
|---|---|---|
| Workspace/project context | Selectable fixture projects | Needs real authenticated workspace/project list and tenant-scoped selection |
| Mission | Mission identity and hierarchy in demo DTO shape | Must bind to canonical Mission owner and stable IDs |
| Job / Run / Attempt | Display/select demo identities | Must bind only to canonical Job, Run, Attempt DTOs and preserve identity across refresh |
| Harness / Agent / Runner | Grouping and visible unknowns | Must use fresh authorized catalog, heartbeat, trust, entitlement, workspace scope and dispatchability sources |
| Status / attention / freshness | Local fixture status and reasons | Must come from durable source events and server read model with freshness cursor |
| Transcript / Tool Calls | Synthetic examples | Must bind to authorized persisted thread/events, redact secrets and respect disclosure policy |
| Terminal / files / diff / tests | Local example content | Must use authorized artifacts/receipts from the execution owner; unsupported evidence stays unavailable |
| Artifacts / decisions | Synthetic list and non-mutating decision preview | Real access, download, approval and resume require canonical authorization/action APIs |
| Usage / credits / receipts | Explicitly unavailable unless fixture tab shows an example | Must be sourced from canonical credit/receipt owner; never inferred from provider responses |
| Browser / verification | Not represented as a live capability | Requires supported browser evidence and verification source |
| Actions | View/navigation only | No create, cancel, retry, approve, dispatch, continue or stop action is simulated |
| Chat links | Navigates to existing `/chat` | Canonical conversation/thread ID handoff is still required for same-session navigation |

This parity matrix is intentionally conservative: a matching visual field is not proof of a canonical source. Integration work must bind each field to a typed, authorization-scoped owner API and preserve UNKNOWN / STALE / UNAVAILABLE distinctions.

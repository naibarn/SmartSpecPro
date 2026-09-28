# Spec 214 Implementation Contracts

- Spec 214 owns semantic node type identity, manifest, presets, instance semantics, binding references, ports/config/UI, runtime/security/governance declarations, AI Builder retrieval, extension admission, and version lifecycle.
- Spec 215 owns workflow interface/definition, graph, non-node bindings/scopes/policies/instrumentation, compilation and runtime state. Existing partial compiler contracts may consume Spec 214 but must not become a second node registry.
- Feature 195 `worker_jobs` + outbox is the only durable physical job authority.
- Canonical core set is exactly the 16 IDs in Spec 214. Vendor, product, protocol, Skill, and provider labels are bindings/capabilities/presets, not new core types.
- Registry lookup is exact-version and digest-verified. Unsupported/unknown types fail closed. Search returns real registered manifests only.
- Node instance config must reject secret material and runtime state. Binding refs carry identity only; they never contain credential material.
- Derived port/schema resolution is deterministic and side-effect free; unresolved bindings block authoring/compile explicitly.
- No destructive legacy-ID retirement or persistence migration without read-only production inventory and rollback evidence.
- Do not claim R20 live-generation certification from local corpus/static checks.

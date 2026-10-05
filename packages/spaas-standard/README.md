# @smartspec/spaas-standard

Offline, bounded, deterministic validation helpers for the SPAAS package contract. The package treats package entries as inert bytes and performs no filesystem enumeration, module loading, network access, registry resolution, deployment, migration, test execution, marketplace action, persistence, or runtime admission.

```ts
import { validateSpaasPackage } from "@smartspec/spaas-standard";

const report = validateSpaasPackage({
  manifest: manifestYaml,
  entries: [{ path: "app.manifest.yaml", kind: "file", bytes: new TextEncoder().encode(manifestYaml) }],
  support: { supportedApiVersions: ["spaas.smartaihub.app/v1"], supportedSchemaVersions: ["1.0"], supportedRequiredFeatures: [], supportedOptionalFeatures: [], extensions: [] },
  profile: "offline-package",
});

if (report.status === "valid") console.log(report.stages.map(({ stage, status }) => `${stage}:${status}`));
else if (report.status === "invalid") console.log(report.failedRequiredStage, report.diagnostics.map(({ code }) => code));
else console.log(report.missingRequiredStage, report.diagnostics.map(({ code }) => code));
```

V1–V4 are package-local checks only to the extent their parser, inventory, graph, digest, and scanner contracts prove them. V3 and V5–V8 external conclusions require trusted digest-bound evidence and otherwise remain `not_evaluated`/`needs_context` for profiles that require them. Evidence represents facts already obtained by a trusted host; this package does not authenticate the host. Diagnostics intentionally exclude source content, secret material, raw external responses, and stack traces.

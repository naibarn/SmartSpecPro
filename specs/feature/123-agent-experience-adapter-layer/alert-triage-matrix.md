# Agent Experience Alert And Triage Matrix

| Signal | Suggested trigger | First triage owner |
|---|---|---|
| Adapter parse success rate | below beta gate threshold for 15 minutes | frontend/platform owner |
| Adapter fallback rate | sudden spike after deploy or flag change | frontend owner |
| Cross-tenant/access denial anomaly | any confirmed unauthorized access path | security/backend owner |
| Approval backend failure rate | sustained increase or clustered failures | Work OS/backend owner |
| Artifact open/download error rate | sustained increase for enabled tenants | artifact/media owner |
| Runtype renderer bridge error rate | spike after dependency or flag change | bridge owner |
| Stream reconnect rate | sustained increase per surface | runtime/platform owner |

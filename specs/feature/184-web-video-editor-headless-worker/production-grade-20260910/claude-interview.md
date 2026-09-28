# Stakeholder decisions

- Web editor is the primary editing surface; heavy work is a `worker_jobs` queue.
- Queue display name is Worker Jobs / คิวงาน Worker.
- Bin is the default panel and supports single or multiple R2 uploads.
- No silent provider, CPU/GPU or local/cloud fallback.
- Full TypeScript typecheck is deferred because of memory usage.

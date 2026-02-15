# Interview Transcript: MVP Deployment Plan

## Q1: Frontend Architecture Split

**Question:** The current app serves React from Express (SSR via Vite). The spec calls for Cloudflare Pages hosting the frontend separately. Should we split the monolith?

**Answer:** Hybrid approach: Public/SEO pages on Cloudflare Pages, Dashboard+API stays unified on Cloud Run. Phase the split safely - start with Cloud Run serving everything, then move public/marketing pages to Cloudflare Pages.

## Q2: GCP Project Setup

**Question:** Do you have an existing GCP project, or should the plan include full bootstrap?

**Answer:** No GCP yet - plan full bootstrap. Include all GCP project setup, IAM, Artifact Registry, service accounts, Cloud Run, Cloud Tasks configuration.

## Q3: Periodic Tasks Replacement

**Question:** The codebase has 10+ CeleryBeat periodic tasks. What should replace these?

**Answer:** Cloud Scheduler + Cloud Tasks. Fully managed, no always-on worker needed.

## Q4: Celery Migration Strategy

**Question:** Should we migrate Celery queues incrementally or all at once?

**Answer:** All at once (big-bang migration). Migrate all queues to Cloud Tasks simultaneously.

## Q5: Database Strategy

**Question:** Should the plan include data migration from local PG to Neon?

**Answer:** Use Neon for staging/prod, keep local PG for dev. No need to migrate existing local data to Neon for MVP.

## Q6: Expected Scale at MVP Launch

**Question:** What's the expected scale?

**Answer:** Medium: 100-1000 users, 50-500 jobs/day. Moderate concurrency needed.

## Q7: Admin Dashboard Location

**Question:** Should the admin dashboard be in the existing app or separate?

**Answer:** Same app, protected /admin route. Server-side role check. Simplest approach.

## Q8: Kie AI Callback Flow

**Question:** How does the Kie AI callback/webhook flow work?

**Answer:** Both: webhook primary + polling fallback. Kie AI webhook for fast completion, polling as safety net for missed callbacks.

## Q9: Cost Priority / Cloud Run Scaling

**Question:** What's the budget sensitivity for Cloud Run?

**Answer:** Balance: min-instances=1 for API services (no cold starts for users), scale-to-zero for jobs (cheaper). Moderate cost approach.

## Q10: CI/CD Pipeline

**Question:** Do you have existing CI, or plan from scratch?

**Answer:** GitHub Actions exists - extend it. Add Cloud Run deployment steps to existing GitHub Actions workflow.

## Q11: Timeline Spec Format

**Question:** Should timeline_spec be a new schema or extend existing types?

**Answer:** Extend existing types with render metadata. Add render-specific fields (profile, output key, hash) to existing VideoEditorProject types. Middle ground approach.

## Q12: Sentry Project Structure

**Question:** One Sentry project or separate per service?

**Answer:** Separate projects per service (recommended). Frontend, Node.js, Python each get their own Sentry project for cleaner alerting and release tracking.

## Q13: Infrastructure as Code

**Question:** Terraform, Pulumi, or manual gcloud CLI?

**Answer:** Manual gcloud CLI commands in the plan. Quick to get started, can add Terraform later.

## Q14: Domain Structure

**Question:** What domain structure for the Cloud Run deployment?

**Answer:** Hybrid domain setup:
- `www.smartaihub.app` = Public/SEO pages (Cloudflare Pages)
- `app.smartaihub.app` = Dashboard + `/api/*` (Cloud Run unified, same-origin)
- `smartaihub.app` redirects to `www.smartaihub.app`
- No separate api subdomain for MVP (same-origin `/api/*` on app subdomain avoids CORS)

## Q15: Vectorize Scope

**Question:** Do you have existing content to index, or is this for future content?

**Answer:** Index existing content at launch:
- `docs_index`: Existing markdown/articles + selected spreadsheet summaries
- `images_index`: Existing website/gallery images only (not user temp uploads)
- No video indexing
- New user uploads: index only when promoted to `gallery/`

## Q16: Secrets Management

**Question:** How to handle secrets in Cloud Run?

**Answer:** GCP Secret Manager. Store secrets there, mount as env vars in Cloud Run. Provides rotation support and audit logging.

## Q17: Alerting Channel

**Question:** Where should alerts be sent?

**Answer:** Email to admin users. No Slack integration needed for MVP.

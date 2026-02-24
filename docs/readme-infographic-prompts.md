# SmartSpecPro README Infographic Prompts

This file provides 5 production-ready prompts (1 prompt = 1 image) for generating modern infographics to accompany `README.md`.

## Global Art Direction (Apply to All 5 Images)

Use this style baseline for every image:

```text
Modern SaaS infographic style, clean layout, premium enterprise look, high readability, strong visual hierarchy, generous whitespace, consistent iconography, balanced grid system, subtle gradients, crisp vector graphics, no photorealistic humans, no clutter, no visual noise, no watermark.

Color direction: deep navy, royal blue, cyan, emerald accents, neutral slate backgrounds.
Typography direction: bold geometric sans-serif headers + clean sans-serif body.
Tone: technical, trustworthy, future-ready.

Output: 16:9 landscape, 4K (3840x2160), sharp details, export-ready for GitHub README.
```

## Image 1 — Platform At a Glance

```text
Create a premium overview infographic titled: "SmartSpecPro Web — All-in-One AI Productivity Platform".

Layout:
- Top hero title and short subtitle.
- Center: 5 large feature pillars in equal cards with icons and concise labels.
- Bottom: one line showing "Current Stage: Alpha (Features evolving until Beta)".

Mandatory pillar labels:
1) AI Chat + Skill Execution
2) Media Studio (Image, Video, Audio)
3) Presentation Studio
4) Document Management + RAG Search
5) Virtual Workflow Automation

Add small supporting chips under the pillars:
- Marketplace
- Multi-Tenant Admin
- Credits & Billing
- Audit & Security
- Integrations

Visual requirements:
- Very clean and readable.
- Use modern icon set and consistent line weight.
- Keep text minimal but precise.
- Make sure every label is clearly legible.

Style: enterprise infographic, vector UI style, no 3D gimmicks, no fake lorem ipsum text.
Aspect ratio 16:9, 4K.
```

## Image 2 — System Architecture Diagram

```text
Create a technical architecture infographic titled: "SmartSpecPro Web Architecture".

Diagram structure (left-to-right flow):
Users (Browser / Tenant Domain)
-> SmartSpecPro Web (React + Node.js + tRPC)
-> Python Backend (FastAPI + Orchestration)
-> External AI/Media Providers

Data and platform layers (connected):
- PostgreSQL (primary data)
- Redis (cache + queue state)
- Object Storage (S3 / R2)
- Vector Database (ChromaDB / pgvector / Cloudflare Vectorize)
- Cloud Tasks / Background Processing
- Observability (Sentry + PostHog + Audit Logs)

Include explicit legends:
- Solid line = synchronous request
- Dashed line = async/background job
- Dotted line = telemetry/observability

Design requirements:
- Use grouped zones: Client Layer, Application Layer, Data Layer, AI Layer, Ops Layer.
- Clear arrows and directional flow.
- Minimal text but enough to understand architecture instantly.
- High contrast and readability for README embedding.

Style: modern cloud architecture infographic, clean vector graphics, enterprise documentation quality.
Aspect ratio 16:9, 4K.
```

## Image 3 — Feature Capability Map

```text
Create a capability map infographic titled: "SmartSpecPro Feature Matrix".

Use a structured matrix with rows as modules and columns as capabilities.

Rows (modules):
- Chat & Memory
- Skill Marketplace
- Media Studio
- Presentation Studio
- Document Management
- Workflow Automation
- Admin & Governance

Columns (capabilities):
- Create
- Automate
- Collaborate
- Version / Restore
- Search / Discover
- Monitor / Audit

Show each cell with a clear status marker:
- Full support (filled circle)
- Partial support (half circle)
- Planned / expanding (outlined circle)

Add a footer note:
"Alpha release: capabilities continue to expand before Beta."

Design requirements:
- Extremely readable table-like layout.
- Professional icon for each module row.
- Consistent spacing and typography.
- Do not overcrowd.
- Text must be real and legible (no gibberish).

Style: modern product operations infographic, minimal, polished, documentation-first.
Aspect ratio 16:9, 4K.
```

## Image 4 — End-to-End Workflow Journey

```text
Create a process infographic titled: "From Prompt to Deliverable in SmartSpecPro".

Design a 7-step horizontal journey with clear numbered stages:
1) User Prompt in Chat
2) Skill Detection / Selection
3) Context + Memory Enrichment
4) Generation / Execution (Media, Docs, Presentation, Workflow)
5) Review + Edit
6) Save to Library + Versioning
7) Share / Deploy / Reuse as Skill or Workflow

For each step:
- Show one icon.
- Show one short action line.
- Add tiny data artifacts under selected steps (example: "task id", "version snapshot", "vector index", "audit event").

Include a side panel called "Cross-Cutting Controls":
- Credits
- Permissions
- Security
- Observability

Design requirements:
- Strong directional flow arrows.
- Distinct step cards with clear sequence.
- High readability at GitHub markdown scale.
- Clean and modern, no visual confusion.

Style: enterprise process infographic, polished UX diagram style.
Aspect ratio 16:9, 4K.
```

## Image 5 — Deployment, Scale, and Release Maturity

```text
Create an infographic titled: "Deployment & Scale Reference + Release Maturity".

Split the canvas into 2 major sections:

Section A (left, 65% width): "Recommended Hosting Reference"
- Show 5 scale tiers in a vertical ladder:
Starter: 50 users, 4 vCPU, 8 GB RAM
Growth: 100 users, 8 vCPU, 16 GB RAM
Pro: 200 users, 12 vCPU, 32 GB RAM
Business: 500 users, 16 vCPU, 48 GB RAM
Enterprise: 1000+ users, 32 vCPU, 64 GB RAM
- Add small architecture blocks below:
Node API, Python Orchestrator, PostgreSQL, Redis, Object Storage, Vector DB.

Section B (right, 35% width): "Release Maturity"
- A clear timeline:
Alpha -> Beta -> Stable
- Highlight Alpha in orange with note:
"Current stage: Alpha. Features and APIs may change."
- Beta note:
"Feature stabilization, compatibility hardening."
- Stable note:
"Long-term compatibility and predictable releases."

Design requirements:
- Make operational planning instantly understandable.
- Keep typography large and crisp.
- Color semantics: orange for Alpha, blue for Beta, green for Stable.
- No clutter; clear spacing and hierarchy.

Style: modern DevOps/product roadmap infographic, executive-ready.
Aspect ratio 16:9, 4K.
```


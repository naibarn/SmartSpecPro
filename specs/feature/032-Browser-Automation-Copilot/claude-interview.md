# Feature 032 — Interview Transcript

## Q1: Credit Attribution for LLMGatewayClient (Python -> Node)

**Question**: For the LLMGatewayClient (Python -> Node gateway), how should credit attribution work?

**Answer**: **Hybrid approach** — Pass-through for user-initiated flows (user's credits are deducted directly), service account for background/system tasks.

---

## Q2: OpenSandbox Browser Runner Docker Image Scope

**Question**: Should we build a real Docker image now or defer?

**Answer**: **Local execution first, Docker later** — Implement Playwright execution locally (process-level isolation) and containerize in a follow-up phase.

---

## Q3: GPT-5.4 Model Availability

**Question**: Is GPT-5.4 available now or should we use GPT-4o as primary?

**Answer**: **GPT-5.4 is available now** — We have API access and can test immediately.

---

## Q4: UX Latency and Partial Results

**Question**: Should partial results stream to the UI as tool calls complete, or wait for full response?

**Answer**: **Hybrid: stream status, batch results** — Stream status updates ('searching...', 'browsing...') but deliver data results at the end.

---

## Q5: Web Search Cache Scope

**Question**: Should the search cache be per-user, per-tenant, or global?

**Answer**: **Two-tier cache** — Share only normalized public web-search results within a tenant, but keep user-contextual queries, browser/session state, cookies, auth, and extracted artifacts per-user. Never share authenticated state across users or tenants.

---

## Q6: Agency MCP Tool Scope

**Question**: Should agencies be able to trigger web_search independently, or only browser actions?

**Answer**: **Both web_search + browser actions** — Agencies can trigger both web_search (via Responses API) and browser.execute_actions.

---

## Q7: Responses API Access Control

**Question**: Should /v1/responses require global flag only, or also per-tenant flags?

**Answer**: **Global + per-tenant flags** — Global flag enables the endpoint, per-tenant flag controls who can use it for staged rollout.

---

## Q8: Budget Limits per Request

**Question**: Should there be a hard budget limit per request that auto-stops the tool loop?

**Answer**: **Both: estimate + hard cap** — Show estimate upfront, user can set a max budget, tool loop stops at that limit.

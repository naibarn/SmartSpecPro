# Interview Transcript: Workflow Editor Node System Redesign

## Q1: Priority Node Types for Phase 1

**Question:** Which node types should we prioritize first? Select all critical for initial release.

**Answer:** All 4 core nodes:
- LLM Call (with real model selection)
- RAG Query (document retrieval)
- Conditional (expression builder)
- Approval Gate (with real users)

**Plus a new concept — Skill Nodes:**
Turn all existing skills into workflow nodes so users can input data per skill requirements and get results (mostly text) that feed into subsequent nodes (e.g., create image, create slide, create video).

---

## Q2: Data Flow Between Nodes

**Question:** How should users reference outputs from previous nodes?

**Answer:** **Hybrid approach** — Use visual port connections for primary data flow between nodes, and allow expression syntax in text fields for fine-grained access to specific fields.

---

## Q3: Template Management

**Question:** Start simple with tenant-scoped or build full marketplace?

**Answer:** **Full marketplace with sharing** — Public marketplace where users can publish templates (reviewed by admin) OR keep them tenant-private.

---

## Q4: Skill Node Design

**Question:** How should skills become workflow nodes? Auto-discover, manual, or one node per skill?

**Answer:** **One node type per skill** — Generate a separate node type for each skill (Video Skill, Image Skill, Enhance Prompt, Image & Video Skill, Document Generate, Slide Generate, Graphic Info, etc.). Auto-generate config forms from input.schema.json. Each input field supports both:
- Direct form input (user types values)
- Connection from another node's output

Process according to skill definition, output as typed result to next node.

---

## Q5: Marketplace Access Control

**Question:** Who can create and share templates?

**Answer:** **Public marketplace + tenant private** — Users can publish to public marketplace (reviewed by admin) OR keep tenant-private.

---

## Q6: LLM Call Model Picker

**Question:** How should users select LLM models?

**Answer:** **Smart recommendation** — Show recommended model based on task type, with option to override. Factor in cost/quality tradeoffs. Auto-filter by user's credit balance and permissions.

---

## Q7: Error Handling

**Question:** What happens when a node fails during execution?

**Answer:** **Stop workflow + notify user** — Halt execution immediately, show error in UI, send notification to user.

---

## Q8: Execution Visibility

**Question:** Should users see real-time progress as nodes execute?

**Answer:** **Both: canvas + log panel** — Real-time canvas highlighting (nodes light up green/red) AND a side panel with detailed execution logs.

---

## Q9: Conditional Expression Builder

**Question:** What complexity level for the conditional node?

**Answer:** **Visual builder + advanced mode** — Default visual comparison builder (pick variable, operator, value with AND/OR), with toggle to switch to raw expression mode for power users.

---

## Q10: Loop Node Design

**Question:** What should users iterate over and how should loop exit work?

**Answer:** **Full loop control** — Support count-based loops, data iteration (over arrays), while-condition loops, break on expression, continue on expression. Most flexible approach.

---

## Q11: RAG Query Node Configuration

**Question:** How configurable should the RAG node be?

**Answer:** **Collection picker + search config** — Select knowledge base collection, configure top_k, search mode (vector/hybrid/bm25), and metadata filters. Not full pipeline config, but meaningful control.

---

## Summary of Key Decisions

| Aspect | Decision |
|--------|----------|
| Node types | LLM, RAG, Conditional, Approval, Loop, Skill Nodes (per skill) |
| Data flow | Hybrid: ports + expressions in text fields |
| Templates | Full marketplace (public + tenant-private) |
| Skill nodes | One node per skill, auto-generated from schema |
| Model picker | Smart recommendation with cost/quality |
| Error handling | Stop + notify |
| Execution UI | Canvas highlighting + log panel |
| Conditional | Visual builder + advanced expression mode |
| Loop | Full control (count, data, while, break, continue) |
| RAG | Collection picker + search config |

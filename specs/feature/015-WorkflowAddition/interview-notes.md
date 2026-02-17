# Interview Notes: Workflow Addition Feature

## Interview Session Summary
- **Date**: 2026-02-17
- **Context**: Feature specification review for Workflow Editor enhancements
- **Source Document**: spec.md (comprehensive specification provided)

---

## Phase 1: Bug Fixes - Confirmed Requirements

### Issue #1: Skill Node Field Naming
**Q**: What is the correct field name for skill selection?  
**A**: Node registry uses `skill_id`, frontend should check for `skill_id` not `skill`.

**Implementation Note**: Update `DynamicNodeConfig.tsx` condition from `input.name === "skill"` to `input.name === "skill_id"`.

### Issue #2: Options Endpoints
**Q**: Which endpoints are critical vs optional?  
**A**: 
- Critical: `/available-models`, `/rag-collections` (core functionality)
- Medium: `/available-approvers`, `/image-providers`
- Working: `/skills` (already implemented)

**Decision**: Create health check endpoint to verify all options endpoints status.

### Issue #3: Missing Executors
**Q**: How should we handle executors that are not fully implemented?  
**A**: Implement stub executors that return "not implemented" error with helpful message pointing to documentation.

---

## Phase 2: New Node Types - Requirements Clarification

### Priority Classification

**High Priority (Must have for MVP):**
1. `http_request` - Most requested integration feature
2. `send_email` - Essential for notifications
3. `schedule_trigger` - Required for automated workflows
4. `delay` - Basic flow control
5. `try_catch` - Error handling foundation

**Medium Priority (Should have):**
1. `webhook_trigger/response` - API integration
2. `read_file/write_file` - Data processing
3. `csv_parser` - Common data format
4. `template_engine` - Dynamic content generation
5. `retry` - Reliability improvement

**Lower Priority (Nice to have):**
1. `websocket_client` - Real-time features
2. `graphql_request` - Alternative API format
3. `circuit_breaker` - Advanced reliability
4. `parallel/join` - Performance optimization

### Security Requirements

**Q**: What security measures are required for code execution?  
**A**: 
- Phase 1: RestrictedPython with strict globals whitelist
- Phase 2: Docker containers with resource limits
- Never execute arbitrary code without sandbox

**Q**: Database query security requirements?  
**A**:
- Use parameterized queries only
- Validate tenant isolation on every query
- Read-only mode by default, explicit opt-in for writes
- Query timeout limits

### Node Naming Convention

**Decision**: Follow existing snake_case naming convention:
- `http_request` not `httpRequest`
- `send_email` not `sendEmail`
- `schedule_trigger` not `scheduleTrigger`

---

## Phase 3: Workflow → Skill Conversion - Requirements

### Conversion Eligibility

**Q**: What determines if a workflow can be converted to skill?  
**A**: Compatibility score based on:
- Node types used (some not compatible with chat interface)
- Complexity of flow (parallel branches don't work in chat)
- Input/output requirements

**Q**: What happens to incompatible workflows?  
**A**: Show user which nodes are incompatible and why. Do not allow conversion until user removes/modifies incompatible nodes.

### Skill Ownership

**Q**: Who owns converted skills?  
**A**: Skills are private to the user who created them. Stored with `owner_user_id` and `visibility: private`.

**Q**: Can converted skills be shared?  
**A**: Not in initial implementation. Future enhancement could allow sharing or publishing.

### Trigger Patterns

**Q**: How are trigger patterns generated?  
**A**: 
- User provides example phrases during conversion
- System can suggest patterns based on workflow name/description
- Multiple patterns allowed for same skill

Example:
```yaml
trigger_patterns:
  - "process {filename} and email to {email}"
  - "run data pipeline for {filename}"
  - "generate report from {filename}"
```

### Adapter Pattern for Incompatible Nodes

**Q**: How do we handle nodes that need adaptation?  
**A**: Create adapter classes that transform node config:

```python
# Form Input → Conversational Input
class FormInputAdapter:
    def convert(self, node):
        return {
            'type': 'conversational_input',
            'strategy': 'sequential',  # Ask one field at a time
            'fields': node.config['fields']
        }

# Approval Gate → Chat Approval
class ApprovalGateAdapter:
    def convert(self, node):
        return {
            'type': 'chat_approval',
            'prompt': 'Please review and approve:',
            'timeout': node.config.get('timeout', 3600)
        }
```

---

## Technical Decisions

### Decision 1: Executor Implementation Strategy
**Choice**: Implement stub executors first, then fill in implementation  
**Rationale**: Allows frontend testing immediately, prevents blocking

### Decision 2: Options Endpoint Fallback
**Choice**: Return empty array with warning if endpoint unavailable  
**Rationale**: Workflow editor remains functional even if some integrations down

### Decision 3: Conversion Preview
**Choice**: Show preview of converted skill before finalizing  
**Rationale**: Users can verify the conversion makes sense

### Decision 4: Error Handling in Skills
**Choice**: Convert workflow errors to user-friendly chat messages  
**Rationale**: Skill users see chat interface, not technical error logs

---

## Open Questions (Deferred)

1. **Skill Versioning**: How to handle updates to converted skills? (Deferred to future)
2. **Multi-tenant Skills**: Should admin be able to convert workflow to tenant-wide skill? (Deferred)
3. **Skill Analytics**: Track usage of converted skills? (Future enhancement)

---

## Acceptance Criteria Summary

### Must Have
- [ ] All 3 bug fixes implemented and tested
- [ ] 5 high-priority nodes working
- [ ] Conversion analysis API working
- [ ] User can convert eligible workflows to skills

### Should Have
- [ ] 10 medium-priority nodes working
- [ ] Health check endpoint for options endpoints
- [ ] Stub executors for all planned nodes

### Nice to Have
- [ ] All 31 new nodes implemented
- [ ] Advanced security sandbox
- [ ] Skill conversion analytics

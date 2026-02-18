# Plan Quality Uplift

## Quality Checklist Review

### Missing Edge Cases or Failure-Mode Handling

| Item | Severity | Impact | Rationale | Delta |
|------|----------|--------|-----------|-------|
| Schema loading failure | High | High-impact | What happens if getInputSchema fails? | Add error state and retry mechanism |
| Invalid schema format | Medium | High-impact | Schema might be malformed JSON | Add schema validation and graceful fallback |
| Concurrent skill executions | Medium | High-impact | User might submit form while another skill running | Add execution queue or disable during execution |
| Network interruption during form fill | Low | Low-impact | User loses form data if network drops | Add localStorage backup for form values |

### Unclear Acceptance Criteria

| Item | Severity | Impact | Rationale | Delta |
|------|----------|--------|-----------|-------|
| Form validation behavior | Medium | High-impact | When exactly should validation run? | Specify: on blur, on submit, real-time |
| Image upload size limits | Low | Low-impact | What's the max file size? | Define: 5MB per image, max 5 images |
| Mobile breakpoint definition | Low | Low-impact | When to switch to bottom sheet? | Specify: < 768px |

### Rollout/Rollback Gaps

| Item | Severity | Impact | Rationale | Delta |
|------|----------|--------|-----------|-------|
| Database migration needed? | High | High-impact | Need to confirm no DB changes | Add explicit "No DB changes required" section |
| Feature flag naming | Medium | Low-impact | Need consistent flag name | Specify: `chat-dynamic-skill-forms` |
| Rollback testing | Medium | High-impact | Need to verify rollback works | Add rollback testing to Phase 4 |

### Security Hardening

| Item | Severity | Impact | Rationale | Delta |
|------|----------|--------|-----------|-------|
| dynamicParams validation | High | High-impact | Server must validate all params | Add server-side validation requirements |
| XSS via schema fields | Medium | High-impact | Schema content rendered in UI | Add HTML sanitization for schema content |
| File upload restrictions | Medium | High-impact | Prevent malicious uploads | Add file type whitelist validation |

### Backward Compatibility

| Item | Severity | Impact | Rationale | Delta |
|------|----------|--------|-----------|-------|
| API version compatibility | Medium | High-impact | Old clients might not send dynamicParams | Ensure API handles missing field gracefully |
| Skill schema versioning | Low | Low-impact | Schema format might evolve | Add schema version field support |

### Observability/Monitoring

| Item | Severity | Impact | Rationale | Delta |
|------|----------|--------|-----------|-------|
| Form analytics events | Medium | Low-impact | Track form open, submit, cancel | Add analytics events specification |
| Error tracking | Medium | Low-impact | Need to capture form errors | Add Sentry error capture points |
| Performance metrics | Low | Low-impact | Track form load time | Add performance timing hooks |

## Recommended Uplifts Summary

### High-Impact Items (User Decision Required)

1. **Schema Loading Error Handling** (High severity)
   - Add retry mechanism for failed schema loads
   - Show user-friendly error message
   - Log errors for monitoring

2. **Concurrent Execution Handling** (High severity)
   - Disable form submission while skill executing
   - Show loading state on form
   - Prevent double-submit

3. **Server-Side dynamicParams Validation** (High severity)
   - Validate all params against expected types
   - Reject unknown params
   - Log validation failures

4. **API Backward Compatibility** (Medium severity, High impact)
   - Explicitly handle missing dynamicParams
   - Test with old clients

### Low-Impact Items (Auto-Apply Recommended)

5. **Add Analytics Events** (Medium severity)
   - `skill_form_opened`
   - `skill_form_submitted`
   - `skill_form_cancelled`
   - `skill_form_error`

6. **Define Mobile Breakpoint** (Low severity)
   - Document: 768px threshold

7. **Add File Size Limits** (Low severity)
   - Document: 5MB per image

8. **Add Schema Validation** (Medium severity)
   - Validate schema structure before rendering
   - Fallback to simple form if invalid

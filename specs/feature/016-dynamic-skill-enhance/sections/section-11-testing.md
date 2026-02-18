# Section 11: Testing and Polish

## Overview

Complete test coverage, polish UI/UX, and prepare for deployment.

## Files

- **Create/Maintain:** Various test files
- **Create:** Test plan document

## Test Coverage Matrix

### Unit Tests

| Component | File | Coverage Target |
|-----------|------|-----------------|
| SkillSelector | `SkillSelector.test.tsx` | 90% |
| DynamicSkillForm | `DynamicSkillForm.test.tsx` | 85% |
| ChatDynamicSkillForm | `ChatDynamicSkillForm.test.tsx` | 85% |
| MobileSkillForm | `MobileSkillForm.test.tsx` | 80% |
| useSkillForm | `useSkillForm.test.ts` | 90% |
| useSkillExecution | `useSkillExecution.test.ts` | 85% |
| API (executeSkill) | `chat.executeSkill.test.ts` | 80% |

### Integration Tests

| Flow | File | Scenarios |
|------|------|-----------|
| Complete Form Flow | `ChatView.formSubmission.test.tsx` | 5 |
| Slash Commands | `SlashCommandMenu.schema.test.tsx` | 4 |
| Cascading Selects | `optionGroups.test.ts` | 4 |
| Mobile Experience | `MobileSkillForm.test.tsx` | 3 |

### E2E Tests

| Scenario | File |
|----------|------|
| User completes skill with form | `e2e/skill-form.spec.ts` |
| Mobile form experience | `e2e/mobile-skill-form.spec.ts` |
| Error handling | `e2e/skill-form-errors.spec.ts` |

## Test Implementation

### Unit Test Example

```typescript
// SkillSelector.test.tsx - Complete example
describe('SkillSelector', () => {
  const mockSkills = [
    { id: '1', name: 'Image Gen', description: 'Generate images', icon: 'image', category: 'media', hasSchema: true },
    { id: '2', name: 'Search', description: 'Web search', icon: 'search', category: 'utility', hasSchema: false }
  ];

  beforeEach(() => {
    // Mock tRPC
    (trpc.skills.getUserVisibleSkills.useQuery as jest.Mock).mockReturnValue({
      data: { skills: mockSkills },
      isLoading: false
    });
  });

  it('renders skill list', () => {
    render(<SkillSelector open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    
    expect(screen.getByText('Image Gen')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('shows schema indicator', () => {
    render(<SkillSelector open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    
    // Image Gen has schema - should show gear icon
    const imageSkill = screen.getByText('Image Gen').closest('button');
    expect(imageSkill?.querySelector('[data-lucide="settings"]')).toBeInTheDocument();
  });

  it('filters by search', () => {
    render(<SkillSelector open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    
    const searchInput = screen.getByPlaceholderText('Search skills...');
    fireEvent.change(searchInput, { target: { value: 'image' } });
    
    expect(screen.getByText('Image Gen')).toBeInTheDocument();
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
  });

  it('calls onSelect with correct args', () => {
    const onSelect = jest.fn();
    render(<SkillSelector open={true} onClose={jest.fn()} onSelect={onSelect} />);
    
    fireEvent.click(screen.getByText('Image Gen'));
    
    expect(onSelect).toHaveBeenCalledWith('1', true); // hasSchema=true
  });
});
```

### Integration Test Example

```typescript
// Complete flow test
describe('Skill Form Flow', () => {
  it('completes full skill execution flow', async () => {
    // Setup
    const user = userEvent.setup();
    
    // Render ChatView
    render(<ChatView conversationId={123} />);
    
    // 1. Open skill selector
    await user.click(screen.getByRole('button', { name: /use skill/i }));
    
    // 2. Select skill with schema
    await user.click(screen.getByText('Create Image Prompt'));
    
    // 3. Form opens
    expect(screen.getByText('Create Image Prompt')).toBeInTheDocument();
    
    // 4. Fill form
    await user.type(screen.getByLabelText('Your Idea'), 'a cat in space');
    await user.selectOptions(screen.getByLabelText('Style Category'), 'F');
    await user.selectOptions(screen.getByLabelText('Style Variation'), 'Ghibli-style');
    
    // 5. Submit
    await user.click(screen.getByRole('button', { name: /execute/i }));
    
    // 6. Loading state
    expect(screen.getByText(/executing/i)).toBeInTheDocument();
    
    // 7. Success - message added
    await waitFor(() => {
      expect(screen.getByText(/skill executed/i)).toBeInTheDocument();
    });
    
    // 8. Form closed
    expect(screen.queryByText('Create Image Prompt')).not.toBeInTheDocument();
  });
});
```

## Polish Checklist

### UI Polish

- [ ] Loading skeletons for schema loading
- [ ] Smooth animations for form open/close
- [ ] Hover states on all interactive elements
- [ ] Focus rings for keyboard navigation
- [ ] Empty states for skill selector
- [ ] Error state illustrations

### UX Improvements

- [ ] Keyboard shortcuts (Cmd/Ctrl+K for skill selector)
- [ ] First-time user tooltips
- [ ] Form field hints and examples
- [ ] Progress indicator for multi-step skills
- [ ] Auto-save draft (optional)

### Performance

- [ ] Lazy load form components
- [ ] Debounce search input
- [ ] Cache schema for 5 minutes
- [ ] Optimize re-renders with React.memo
- [ ] Code splitting for mobile components

### Accessibility

- [ ] ARIA labels on all form fields
- [ ] Keyboard navigation works
- [ ] Screen reader tested
- [ ] Color contrast verified
- [ ] Focus management

## Performance Benchmarks

| Metric | Target | Measurement |
|--------|--------|-------------|
| Form render time | < 100ms | React DevTools |
| Schema load time | < 500ms | Network tab |
| Time to interactive | < 1s | Lighthouse |
| Bundle size increase | < 50KB | webpack-bundle-analyzer |

## Pre-Deployment Checklist

### Code Quality

- [ ] All tests passing (unit, integration, e2e)
- [ ] Code coverage > 80%
- [ ] No TypeScript errors
- [ ] ESLint passing
- [ ] Prettier formatted

### Feature Flag Setup

```typescript
// featureFlags.ts
export const FEATURE_FLAGS = {
  CHAT_DYNAMIC_SKILL_FORMS: 'chat-dynamic-skill-forms'
};

// Usage
const isEnabled = useFeatureFlag(FEATURE_FLAGS.CHAT_DYNAMIC_SKILL_FORMS);
```

### Monitoring

- [ ] Analytics events configured
- [ ] Error tracking (Sentry) set up
- [ ] Performance monitoring enabled
- [ ] Dashboard created

### Documentation

- [ ] API documentation updated
- [ ] Component documentation complete
- [ ] User guide written
- [ ] Changelog updated

## Deployment Plan

### Week 1: Internal Testing
- [ ] Deploy to staging
- [ ] Enable for team only
- [ ] Bug fixes

### Week 2: Limited Rollout
- [ ] Enable for 10% of users
- [ ] Monitor error rates
- [ ] Collect feedback

### Week 3: Expanded Rollout
- [ ] Enable for 50% of users
- [ ] Monitor metrics
- [ ] Address issues

### Week 4: Full Rollout
- [ ] Enable for all users
- [ ] Remove feature flag
- [ ] Post-launch review

## Rollback Plan

```typescript
// Emergency rollback
if (errorRate > 5%) {
  await disableFeatureFlag('chat-dynamic-skill-forms');
  await notifyTeam('Feature rolled back due to high error rate');
}
```

## Success Metrics

| Metric | Target | Tracking |
|--------|--------|----------|
| Form completion rate | > 70% | Analytics |
| Skill execution success | > 90% | API logs |
| User adoption (30d) | > 30% | Analytics |
| Error rate | < 2% | Sentry |
| Mobile usage | > 40% | Analytics |

## Final Review

### Code Review Checklist

- [ ] Self-review completed
- [ ] Peer review requested
- [ ] Security review passed
- [ ] Performance review passed

### QA Sign-off

- [ ] All test cases passed
- [ ] Manual testing completed
- [ ] Mobile testing completed
- [ ] Cross-browser testing completed

## Post-Launch

### Week 1 Monitoring
- Monitor error rates hourly
- Track form completion funnel
- Watch for user complaints

### Month 1 Review
- Analyze usage patterns
- Identify top skills
- Plan improvements

### Future Enhancements
- [ ] Multi-skill chaining
- [ ] Form templates/presets
- [ ] AI-powered form filling
- [ ] Collaborative forms

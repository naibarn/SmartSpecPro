# ChatView Integration Guide

This guide explains how to integrate the dynamic skill form feature into the main ChatView component.

## Quick Start

### 1. Import Required Hooks and Components

```typescript
import { useChatSkillForm, SkillCommandButton, SkillInputChip } from '@/components/chat/skill';
import { useMediaQuery } from '@/hooks/useMediaQuery';
```

### 2. Add to ChatView State

```typescript
export function ChatView({ conversationId }: ChatViewProps) {
  // ... existing state
  
  // Skill form integration
  const skillForm = useChatSkillForm(conversationId, handleSendMessage);
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // Pause auto-detection when form is open
  const shouldDetectSkills = !skillForm.isFormOpen;
  
  // ... rest of component
}
```

### 3. Add Skill Button to Input Area

```tsx
<div className="flex items-center gap-2">
  <SkillCommandButton 
    onClick={() => skillForm.setShowSkillSelector(true)}
    disabled={skillForm.isSubmitting}
  />
  {/* ... existing input */}
</div>
```

### 4. Render Skill Form UI

```tsx
{/* Skill Form - Desktop: Inline, Mobile: Bottom Sheet */}
{skillForm.skillFormState?.isOpen && !skillForm.skillFormState.isMinimized && (
  isMobile ? (
    <MobileSkillForm
      open={true}
      onClose={skillForm.closeSkillForm}
      skillName={skillForm.skillFormState.skillName}
      schema={skillForm.skillFormState.schema}
      values={skillForm.values}
      onChange={skillForm.setValues}
      onSubmit={() => skillForm.handleSkillFormSubmit(conversationId, input)}
      onCancel={skillForm.closeSkillForm}
      isSubmitting={skillForm.isSubmitting}
      hasUnsavedChanges={skillForm.hasFormChanges}
    />
  ) : (
    skillForm.renderSkillForm()
  )
)}

{/* Minimized Skill Chip */}
{skillForm.renderSkillChip()}

{/* Skill Selector Dialog */}
{skillForm.renderSkillSelector()}
```

### 5. Update Slash Command Handler

```typescript
const handleSlashCommand = async (slug: string, name: string) => {
  // Check if skill has schema
  const schemaData = await trpc.skills.getInputSchema.fetch({ skillId: slug });
  
  if (schemaData.hasSchema) {
    // Open form instead of executing immediately
    skillForm.openSkillForm(slug);
  } else {
    // Execute immediately for skills without forms
    executeSkill({ skillId: slug });
  }
};
```

### 6. Add Keyboard Shortcut

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + K to open skill selector
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      skillForm.setShowSkillSelector(true);
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

## State Flow

```
User clicks "Use Skill" or presses Ctrl+K
  ↓
SkillSelector opens
  ↓
User selects a skill
  ↓
Check if skill has input schema
  ↓
  ├─ Yes: Open ChatDynamicSkillForm
  │       User fills form
  │       Clicks Execute
  │       validate() → executeSkill()
  │       Success: Close form, show result
  │       Error: Show error, keep form open
  │
  └─ No: Execute skill immediately
```

## Props Reference

### useChatSkillForm

| Prop | Type | Description |
|------|------|-------------|
| conversationId | number | Current conversation ID |
| onSendMessage | (content, context?) => void | Callback to send context message |

### Returns

| Property | Type | Description |
|----------|------|-------------|
| skillFormState | SkillFormState \| null | Current form state |
| isFormOpen | boolean | Whether form is open |
| showSkillSelector | boolean | Selector visibility |
| setShowSkillSelector | (boolean) => void | Toggle selector |
| openSkillForm | (skillId) => Promise<void> | Open form for skill |
| closeSkillForm | () => void | Close and reset form |
| minimizeSkillForm | () => void | Minimize to chip |
| restoreSkillForm | () => void | Restore from chip |
| handleSkillFormSubmit | () => Promise<void> | Submit form |
| isSubmitting | boolean | Loading state |
| renderSkillForm | () => ReactNode | Render inline form |
| renderSkillChip | () => ReactNode | Render minimized chip |
| renderSkillSelector | () => ReactNode | Render selector |

## Testing

Run skill-related tests:

```bash
npm test --workspace=web -- --testPathPattern="skill"
```

## Troubleshooting

### Form not opening
- Check that `useChatSkillForm` is called with valid `conversationId`
- Verify skill has schema via `skills.getInputSchema`

### Schema not loading
- Check browser network tab for API calls
- Verify skill exists in database

### Mobile sheet not working
- Ensure `vaul` is installed: `npm list vaul`
- Check that `isMobile` hook returns correct value

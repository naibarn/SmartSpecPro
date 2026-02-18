# Section 9: Slash Command Enhancement

## Overview

Enhance SlashCommandMenu to handle skills with input schemas and add quick shortcuts.

## Files

- **Modify:** `apps/web/client/src/components/chat/SlashCommandMenu.tsx`
- **Create:** `apps/web/client/src/components/chat/SlashCommandMenu.schema.test.tsx`

## Implementation

### 1. Schema Indicator

```typescript
// Extend skill item to show schema indicator
interface SlashCommandItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  hasSchema?: boolean; // Add this
}

// In skill rendering
const SkillItem = ({ skill, onSelect }: SkillItemProps) => (
  <CommandItem
    key={skill.id}
    onSelect={() => onSelect(skill)}
    className="flex items-center gap-2"
  >
    <Icon className="h-4 w-4" />
    <span>{skill.name}</span>
    {skill.hasSchema && (
      <Settings className="h-3 w-3 text-muted-foreground ml-auto" />
    )}
  </CommandItem>
);
```

### 2. Schema Detection

```typescript
// Option 1: Extend getSlashCommands to include hasSchema
const { data: commands } = trpc.chat.getSlashCommands.useQuery();

// Option 2: Fetch schema on demand
const handleSkillSelect = async (skill: SlashCommandItem) => {
  if (skill.hasSchema) {
    // Open form
    openSkillForm(skill.id);
  } else {
    // Execute immediately
    executeSkill({ skillId: skill.id });
  }
};
```

### 3. Quick Shortcuts

```typescript
// Map shortcuts to skill IDs
const QUICK_SHORTCUTS: Record<string, string> = {
  '/image': 'image-generation',
  '/video': 'video-generation',
  '/prompt': 'create-image-prompt',
};

// In input handling
useEffect(() => {
  if (!input.startsWith('/')) return;
  
  const shortcut = Object.keys(QUICK_SHORTCUTS).find(s => 
    input === s || input.startsWith(s + ' ')
  );
  
  if (shortcut) {
    const skillId = QUICK_SHORTCUTS[shortcut];
    const prompt = input.slice(shortcut.length).trim();
    
    // Open form for this skill
    openSkillForm(skillId);
    
    // If there's additional text, pre-fill the prompt field
    if (prompt) {
      setSkillFormState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          values: { ...prev.values, userIdea: prompt }
        };
      });
    }
  }
}, [input]);
```

### 4. Loading State

```typescript
const [checkingSchema, setCheckingSchema] = useState<string | null>(null);

const handleSelect = async (skill: SlashCommandItem) => {
  setCheckingSchema(skill.id);
  
  try {
    const schemaData = await utils.skills.getInputSchema.fetch({
      skillId: skill.id
    });
    
    if (schemaData.hasSchema) {
      openSkillForm(skill.id);
    } else {
      executeSkill({ skillId: skill.id });
    }
  } finally {
    setCheckingSchema(null);
  }
};
```

### 5. Command Menu Groups

```tsx
<CommandList>
  <CommandEmpty>No skills found.</CommandEmpty>
  
  <CommandGroup heading="Quick Shortcuts">
    <CommandItem onSelect={() => handleQuickShortcut('/image')}>
      <Image className="h-4 w-4 mr-2" />
      /image - Generate image
    </CommandItem>
    <CommandItem onSelect={() => handleQuickShortcut('/video')}>
      <Video className="h-4 w-4 mr-2" />
      /video - Generate video
    </CommandItem>
    <CommandItem onSelect={() => handleQuickShortcut('/prompt')}>
      <Wand2 className="h-4 w-4 mr-2" />
      /prompt - Enhance prompt
    </CommandItem>
  </CommandGroup>
  
  <CommandGroup heading="My Skills">
    {mySkills.map(skill => (
      <SkillItem 
        key={skill.id} 
        skill={skill} 
        onSelect={handleSelect}
        isLoading={checkingSchema === skill.id}
      />
    ))}
  </CommandGroup>
  
  <CommandGroup heading="Other Skills">
    {otherSkills.map(skill => (
      <SkillItem 
        key={skill.id} 
        skill={skill} 
        onSelect={handleSelect}
        isLoading={checkingSchema === skill.id}
      />
    ))}
  </CommandGroup>
</CommandList>
```

### 6. Help Text

```tsx
<CommandGroup heading="Help">
  <div className="px-2 py-1.5 text-xs text-muted-foreground">
    <p>Type <kbd className="px-1 py-0.5 bg-muted rounded">/</kbd> to see available skills</p>
    <p className="mt-1">
      <Settings className="h-3 w-3 inline mr-1" />
      indicates skills requiring form input
    </p>
  </div>
</CommandGroup>
```

## Testing

```typescript
describe('SlashCommandMenu Schema Support', () => {
  it('shows schema indicator for skills with forms', () => {
    // Render with skills
    // Expect Settings icon next to skills with hasSchema=true
  });

  it('opens form for skills with schema', async () => {
    // Select skill with hasSchema=true
    // Expect openSkillForm called
    // Expect executeSkill not called
  });

  it('executes immediately for skills without schema', async () => {
    // Select skill with hasSchema=false
    // Expect executeSkill called
    // Expect openSkillForm not called
  });

  it('handles /image shortcut', () => {
    // Type /image
    // Expect form opened for image-generation skill
  });

  it('pre-fills prompt from shortcut', () => {
    // Type /image a cat in space
    // Expect form opened with userIdea="a cat in space"
  });

  it('shows loading while checking schema', () => {
    // Select skill
    // Expect loading indicator
  });
});
```

## Acceptance Criteria

- [ ] Schema indicator (⚙️) shows for skills with forms
- [ ] Clicking skill with schema opens form
- [ ] Clicking skill without schema executes immediately
- [ ] /image shortcut opens image form
- [ ] /video shortcut opens video form
- [ ] /prompt shortcut opens prompt form
- [ ] Additional text after shortcut pre-fills form
- [ ] Loading state while checking schema
- [ ] Help text explains schema indicator

## Dependencies

- Section 1: SkillSelector (openSkillForm pattern)
- Section 6: ChatView state (skill form state)
- shadcn/ui Command component

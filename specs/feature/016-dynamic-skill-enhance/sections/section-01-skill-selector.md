# Section 1: SkillSelector Component

## Overview

Create a skill selection dialog optimized for the chat context. Users can browse, search, and select skills. Skills with input schemas are marked with a gear icon (⚙️).

## Files

- **Create:** `apps/web/client/src/components/chat/skill/SkillSelector.tsx`
- **Create:** `apps/web/client/src/components/chat/skill/SkillSelector.test.tsx`

## Interface

```typescript
interface SkillSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (skillId: string, hasSchema: boolean) => void;
}

interface SkillWithSchema {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  hasSchema: boolean; // From getInputSchema
}
```

## Implementation Steps

### 1. Component Structure

```tsx
export function SkillSelector({ open, onClose, onSelect }: SkillSelectorProps) {
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  
  // Fetch visible skills
  const { data: skillsData } = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
  
  // Check schema for skills (parallel queries)
  const schemaQueries = useMemo(() => {
    return skillsData?.skills.map(skill => ({
      skillId: skill.id,
      query: trpc.skills.getInputSchema.useQuery({ skillId: skill.id }, { enabled: open })
    }));
  }, [skillsData, open]);

  // Filter and group skills
  const filteredSkills = useMemo(() => {
    // Filter by search
    // Group by category
    // Sort by priority
  }, [skillsData, search]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select a Skill</DialogTitle>
          <DialogDescription>
            Choose a skill to enhance your conversation
          </DialogDescription>
        </DialogHeader>
        
        <Input
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4"
        />
        
        <ScrollArea className="h-[400px]">
          {filteredSkills.map((group) => (
            <div key={group.category}>
              <h4 className="font-semibold mb-2">{group.category}</h4>
              {group.skills.map((skill) => (
                <SkillItem
                  key={skill.id}
                  skill={skill}
                  hasSchema={skill.hasSchema}
                  onClick={() => onSelect(skill.id, skill.hasSchema)}
                />
              ))}
            </div>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

### 2. Skill Item Component

```tsx
function SkillItem({ skill, hasSchema, onClick }: SkillItemProps) {
  const Icon = iconMap[skill.icon] || Wand2;
  
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
    >
      <div className="rounded-lg bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium">{skill.name}</span>
          {hasSchema && <Settings className="h-3 w-3 text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">{skill.description}</p>
      </div>
    </button>
  );
}
```

### 3. Keyboard Navigation

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    
    switch (e.key) {
      case 'ArrowDown':
        // Move selection down
        break;
      case 'ArrowUp':
        // Move selection up
        break;
      case 'Enter':
        // Select current
        if (selectedSkill) {
          const skill = findSkill(selectedSkill);
          onSelect(skill.id, skill.hasSchema);
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [open, selectedSkill]);
```

## Testing

### Unit Tests

```typescript
describe('SkillSelector', () => {
  it('renders skill list', () => {
    // Mock skills data
    // Render component
    // Expect skills to be visible
  });

  it('filters by search', () => {
    // Type in search input
    // Expect filtered results
  });

  it('shows schema indicator', () => {
    // Skill with hasSchema=true should show gear icon
  });

  it('calls onSelect with correct args', () => {
    // Click on skill
    // Expect onSelect called with skillId and hasSchema
  });

  it('supports keyboard navigation', () => {
    // Test arrow keys, enter, escape
  });
});
```

## Acceptance Criteria

- [ ] Dialog opens and closes correctly
- [ ] Skills grouped by category
- [ ] Search filters skills in real-time
- [ ] Schema indicator (⚙️) shows for skills with forms
- [ ] Keyboard navigation works (arrow keys, enter, escape)
- [ ] onSelect called with skillId and hasSchema
- [ ] Loading state while fetching skills
- [ ] Empty state when no skills match search

## Dependencies

- shadcn/ui Dialog, Input, ScrollArea
- Lucide icons (Settings, Wand2, etc.)
- tRPC skills.getUserVisibleSkills
- tRPC skills.getInputSchema

# Skill System Prompt Customization

## Overview
Allow desktop app users to customize skill system prompts for different task types, enabling personalized AI behavior and output formats.

## Use Cases

### 1. Image Generation Prompt Enhancement Skill
**Default System Prompt:**
```
You are an expert prompt engineer for image generation.
Enhance user prompts with professional details.
```

**User Customization:**
```
You are a fantasy art specialist.
Enhance prompts with:
- Medieval fantasy elements
- Dragon and magic themes
- Epic landscape descriptions
- Mystical lighting effects
```

### 2. Video Generation Prompt Enhancement Skill
**Default:**
```
You are a cinematic expert for video generation.
Add camera movements and transitions.
```

**User Customization:**
```
You are a documentary filmmaker.
Focus on:
- Natural, handheld camera work
- Real-world lighting
- Subtle transitions
- Storytelling narrative flow
```

### 3. Code Review Skill
**Default:**
```
You are a senior software engineer.
Review code for bugs and best practices.
```

**User Customization:**
```
You are a security-focused code reviewer.
Prioritize:
- Security vulnerabilities (OWASP Top 10)
- Input validation
- Authentication/authorization issues
- SQL injection and XSS risks
```

## Architecture

### Database Schema

```sql
CREATE TABLE custom_skill_prompts (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    skill_id VARCHAR(100) NOT NULL,  -- e.g., "image-prompt-enhancer"
    custom_system_prompt TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, skill_id)
);

CREATE TABLE skill_prompt_templates (
    id VARCHAR(36) PRIMARY KEY,
    skill_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    default_system_prompt TEXT NOT NULL,
    template_variables JSON,  -- {"style": "photorealistic", "model": "dalle-3"}
    category VARCHAR(100),
    is_public BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### API Endpoints

```python
# Get available skills
GET /api/v1/skills/customizable
Response: [
    {
        "skill_id": "image-prompt-enhancer",
        "name": "Image Prompt Enhancement",
        "category": "media_generation",
        "default_prompt": "...",
        "template_variables": ["style", "model", "quality"]
    }
]

# Get user's custom prompt for skill
GET /api/v1/skills/{skill_id}/custom-prompt
Response: {
    "skill_id": "image-prompt-enhancer",
    "custom_system_prompt": "...",
    "is_active": true
}

# Update custom prompt
PUT /api/v1/skills/{skill_id}/custom-prompt
Body: {
    "custom_system_prompt": "...",
    "is_active": true
}

# Reset to default
DELETE /api/v1/skills/{skill_id}/custom-prompt

# Get prompt templates (presets)
GET /api/v1/skills/{skill_id}/templates
Response: [
    {
        "id": "fantasy-art",
        "name": "Fantasy Art Specialist",
        "description": "Optimized for fantasy and mythical themes",
        "prompt": "..."
    }
]
```

### Skill Execution Flow

```
1. User triggers skill (e.g., "Enhance Prompt")
2. Backend checks for custom prompt:
   - SELECT * FROM custom_skill_prompts
     WHERE user_id = ? AND skill_id = ? AND is_active = true
3. If custom prompt exists:
   → Use custom_system_prompt
4. Else:
   → Use default skill prompt
5. Process with LLM using selected prompt
6. Return result
```

### Template Variables

Allow dynamic insertion of context into prompts:

```python
# Template
"""
You are a {style} specialist for {media_type} generation.
Target model: {model}
User preferences: {preferences}
"""

# Variables
{
    "style": "photorealistic",
    "media_type": "image",
    "model": "dalle-3",
    "preferences": "High detail, cinematic lighting"
}

# Result
"""
You are a photorealistic specialist for image generation.
Target model: dalle-3
User preferences: High detail, cinematic lighting
"""
```

## Frontend UI

### 1. Skill Settings Panel

```
┌─ Skill Settings ──────────────────────────┐
│                                            │
│ 🎨 Image Prompt Enhancement                │
│ ├─ [Default] ───────────────────────────  │
│ │  "You are an expert prompt engineer..." │
│ │                                          │
│ ├─ [Custom] ─────────────────── [Active] │
│ │  ┌─────────────────────────────────┐   │
│ │  │ You are a fantasy art specialist│   │
│ │  │ Enhance prompts with:           │   │
│ │  │ - Medieval fantasy elements     │   │
│ │  │ - Dragon and magic themes       │   │
│ │  │ └─────────────────────────────┘   │
│ │                                          │
│ │  Variables:                              │
│ │  Style: [photorealistic ▼]              │
│ │  Model: [dalle-3 ▼]                     │
│ │                                          │
│ └─ [Templates ▼]                           │
│    • Fantasy Art Specialist               │
│    • Documentary Style                    │
│    • Technical/Precise                    │
│                                            │
│ [Save] [Reset to Default] [Preview]       │
└────────────────────────────────────────────┘
```

### 2. Quick Edit in Generator

```
┌─ Image Generator ─────────────────────────┐
│                                            │
│ Prompt: [A dragon flying...            ]  │
│                                            │
│ [Auto-Enhance ✨] [⚙️ Customize Skill]    │
│                                            │
│ ⚙️ Customize opens modal:                 │
│ ┌─ Prompt Enhancement Settings ────┐     │
│ │ Current: Fantasy Art (Custom)     │     │
│ │ [Edit System Prompt]              │     │
│ │ [Use Template]                    │     │
│ │ [Reset to Default]                │     │
│ └───────────────────────────────────┘     │
└────────────────────────────────────────────┘
```

## Implementation

### Backend Model

```python
# app/models/custom_skill_prompt.py
from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base

class CustomSkillPrompt(Base):
    """User-customized skill system prompts"""
    __tablename__ = "custom_skill_prompts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    skill_id = Column(String(100), nullable=False)
    custom_system_prompt = Column(Text, nullable=False)
    template_variables = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="custom_skill_prompts")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "skill_id": self.skill_id,
            "custom_system_prompt": self.custom_system_prompt,
            "template_variables": self.template_variables,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }
```

### Service Layer

```python
# app/services/skill_prompt_service.py
class SkillPromptService:
    """Manage custom skill prompts"""

    @staticmethod
    async def get_prompt_for_skill(
        db: AsyncSession,
        user_id: str,
        skill_id: str
    ) -> str:
        """Get effective prompt (custom or default)"""
        # Check for custom prompt
        query = select(CustomSkillPrompt).where(
            and_(
                CustomSkillPrompt.user_id == user_id,
                CustomSkillPrompt.skill_id == skill_id,
                CustomSkillPrompt.is_active == True
            )
        )
        result = await db.execute(query)
        custom = result.scalar_one_or_none()

        if custom:
            # Apply template variables if any
            prompt = custom.custom_system_prompt
            if custom.template_variables:
                prompt = prompt.format(**custom.template_variables)
            return prompt

        # Return default prompt
        return get_default_skill_prompt(skill_id)

    @staticmethod
    async def save_custom_prompt(
        db: AsyncSession,
        user_id: str,
        skill_id: str,
        custom_prompt: str,
        template_variables: dict = None
    ):
        """Save or update custom prompt"""
        # Check if exists
        query = select(CustomSkillPrompt).where(
            and_(
                CustomSkillPrompt.user_id == user_id,
                CustomSkillPrompt.skill_id == skill_id
            )
        )
        result = await db.execute(query)
        existing = result.scalar_one_or_none()

        if existing:
            # Update
            existing.custom_system_prompt = custom_prompt
            existing.template_variables = template_variables
            existing.updated_at = datetime.utcnow()
        else:
            # Create
            new_prompt = CustomSkillPrompt(
                user_id=user_id,
                skill_id=skill_id,
                custom_system_prompt=custom_prompt,
                template_variables=template_variables
            )
            db.add(new_prompt)

        await db.commit()
```

### Integration with Prompt Enhancement

```python
# app/api/v1/prompt_enhancement.py
async def enhance_prompt_with_ai(...):
    # Get effective system prompt
    skill_id = "image-prompt-enhancer"
    system_prompt = await SkillPromptService.get_prompt_for_skill(
        db, current_user.id, skill_id
    )

    # If no custom, use default
    if not system_prompt:
        system_prompt = """You are an expert prompt engineer..."""

    # Continue with enhancement using custom/default prompt
    chat_request = ChatCompletionRequest(
        model="claude-3-5-sonnet-20241022",
        messages=[
            Message(role="system", content=system_prompt),
            Message(role="user", content=user_prompt)
        ],
        ...
    )
```

## Frontend Components

### SkillPromptEditor.tsx

```tsx
interface SkillPromptEditorProps {
  skillId: string;
  skillName: string;
  onSave?: () => void;
}

export const SkillPromptEditor: React.FC<SkillPromptEditorProps> = ({
  skillId,
  skillName,
  onSave
}) => {
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customPrompt, setCustomPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [templates, setTemplates] = useState([]);

  // Load current prompt
  useEffect(() => {
    loadSkillPrompt();
  }, [skillId]);

  const handleSave = async () => {
    await saveCustomPrompt(skillId, customPrompt);
    toast.success('Prompt saved!');
    onSave?.();
  };

  const handleReset = async () => {
    await deleteCustomPrompt(skillId);
    setMode('default');
    toast.success('Reset to default');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{skillName} - System Prompt</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'default' ? 'default' : 'outline'}
            onClick={() => setMode('default')}
          >
            Default
          </Button>
          <Button
            variant={mode === 'custom' ? 'default' : 'outline'}
            onClick={() => setMode('custom')}
          >
            Custom
          </Button>
        </div>

        {/* Prompt editor */}
        {mode === 'default' ? (
          <div className="p-4 bg-slate-900 rounded">
            <pre className="text-sm">{defaultPrompt}</pre>
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              className="w-full h-64 p-4 bg-slate-900 rounded font-mono text-sm"
              placeholder="Enter your custom system prompt..."
            />

            {/* Templates */}
            <div>
              <label>Or use a template:</label>
              <select onChange={e => setCustomPrompt(e.target.value)}>
                <option>Select template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.prompt}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleSave}>Save Custom Prompt</Button>
              <Button variant="outline" onClick={handleReset}>
                Reset to Default
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

## Security Considerations

### 1. Prompt Injection Protection
```python
def validate_custom_prompt(prompt: str) -> bool:
    """Validate custom prompt for safety"""
    # Check length
    if len(prompt) > 10000:
        return False

    # Block dangerous patterns
    dangerous_patterns = [
        "ignore previous instructions",
        "system: you are now",
        "{{secret}}",
        "${env:",
    ]

    prompt_lower = prompt.lower()
    for pattern in dangerous_patterns:
        if pattern in prompt_lower:
            return False

    return True
```

### 2. Rate Limiting
- Limit custom prompt updates to 10 per hour per user
- Prevent abuse of prompt testing

### 3. Audit Logging
```python
# Log all custom prompt changes
logger.info(
    "custom_prompt_updated",
    user_id=user.id,
    skill_id=skill_id,
    prompt_length=len(custom_prompt)
)
```

## Benefits

### For Users:
1. ✅ **Personalization** - Tailor AI behavior to preferences
2. ✅ **Domain Expertise** - Optimize for specific industries
3. ✅ **Consistency** - Enforce style guidelines
4. ✅ **Experimentation** - Test different approaches
5. ✅ **Learning** - Understand prompt engineering

### For Platform:
1. ✅ **User Engagement** - Advanced users stay longer
2. ✅ **Use Case Discovery** - Learn what users need
3. ✅ **Community Templates** - Users share successful prompts
4. ✅ **Premium Feature** - Monetize advanced customization

## Future Enhancements

1. **Prompt Versioning**
   - Save multiple versions
   - Compare performance
   - Rollback to previous versions

2. **A/B Testing**
   - Test two prompts side-by-side
   - Measure quality scores
   - Auto-select best performer

3. **Community Marketplace**
   - Share custom prompts
   - Download popular templates
   - Rate and review

4. **AI-Assisted Editing**
   - Suggest prompt improvements
   - Auto-complete common patterns
   - Validate effectiveness

5. **Per-Project Settings**
   - Different prompts per project
   - Team-shared configurations
   - Workspace-level defaults

## Status: Ready to Implement

All components designed:
- ✅ Database schema
- ✅ API endpoints
- ✅ Service layer
- ✅ Frontend components
- ✅ Security measures
- ✅ Integration points

Ready to begin implementation!

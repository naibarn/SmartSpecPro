# Section 7: API Extension (executeSkill)

## Overview

Extend the executeSkill mutation to accept dynamicParams and add server-side validation.

## Files

- **Modify:** `apps/web/server/routers/chat.ts`
- **Modify:** `apps/web/server/services/skillExecutor.ts` (if needed)
- **Create:** `apps/web/server/routers/chat.executeSkill.test.ts`

## API Changes

### 1. Input Schema Extension

```typescript
// In chat.ts router
executeSkill: protectedProcedure
  .input(
    z.object({
      skillId: z.string().min(1).max(50),
      prompt: z.string().optional(),
      dynamicParams: z.record(z.any()).optional(), // NEW
      conversationId: z.number(),
      // ... existing fields
      aspectRatio: skillAspectRatioSchema.optional(),
      numImages: z.number().min(1).max(4).optional(),
      // ... etc
    })
  )
  .mutation(async ({ ctx, input }) => {
    // ... existing code
  })
```

### 2. Server-Side Validation

```typescript
// Add validation function
function validateDynamicParams(
  params: Record<string, any>,
  skill: SkillDefinition
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Get expected params from skill config
  const configJson = skill.configJson || {};
  const expectedParams = configJson.inputFields || [];
  
  // Validate types
  for (const [key, value] of Object.entries(params)) {
    const fieldDef = expectedParams.find((f: any) => f.id === key);
    
    if (!fieldDef) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }
    
    // Type validation
    switch (fieldDef.type) {
      case 'number':
        if (typeof value !== 'number') {
          errors.push(`${key} must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${key} must be a boolean`);
        }
        break;
      case 'text':
      case 'textarea':
        if (typeof value !== 'string') {
          errors.push(`${key} must be a string`);
        }
        // Prevent XSS
        if (/<script|javascript:/i.test(value)) {
          errors.push(`${key} contains invalid characters`);
        }
        break;
      case 'imageUpload':
        // Validate URLs
        if (Array.isArray(value)) {
          for (const url of value) {
            if (!isValidImageUrl(url)) {
              errors.push(`${key} contains invalid URL: ${url}`);
            }
          }
        }
        break;
    }
  }
  
  return { valid: errors.length === 0, errors };
}

function isValidImageUrl(url: string): boolean {
  // Allow relative URLs (/uploads/...)
  if (url.startsWith('/uploads/')) return true;
  
  // Allow configured domains
  const allowedDomains = [
    process.env.PUBLIC_URL,
    // Add other allowed domains
  ].filter(Boolean);
  
  try {
    const urlObj = new URL(url);
    return allowedDomains.some(domain => 
      urlObj.hostname === new URL(domain!).hostname
    );
  } catch {
    return false;
  }
}
```

### 3. Mutation Handler Update

```typescript
.mutation(async ({ ctx, input }) => {
  const { skillId, prompt, dynamicParams, conversationId } = input;
  
  // Get skill
  const skill = getSkillByIdOrType(skillId);
  if (!skill) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Skill '${skillId}' not found`
    });
  }
  
  // Validate dynamicParams if provided
  if (dynamicParams && Object.keys(dynamicParams).length > 0) {
    const validation = validateDynamicParams(dynamicParams, skill);
    if (!validation.valid) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Validation failed: ${validation.errors.join(', ')}`
      });
    }
  }
  
  // Rate limiting
  const rateLimitKey = `user:${ctx.user.id}`;
  if (!skillExecutionLimiter.isAllowed(rateLimitKey)) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded'
    });
  }
  
  // Execute
  const result = await executeSkill(
    skill,
    {
      prompt: prompt || '',
      // ... other params
      extraParams: dynamicParams, // Pass to executor
    },
    ctx.user.id,
    ctx.userToken
  );
  
  // Save result as message
  if (conversationId && result.success) {
    await createMessage({
      conversationId,
      role: 'assistant',
      content: result.message || 'Skill executed',
      skillUsed: skillId,
      skillArgs: dynamicParams,
      creditsUsed: String(result.creditsUsed)
    });
  }
  
  return result;
})
```

### 4. Backward Compatibility

```typescript
// Ensure backward compatibility
const executionParams: SkillExecutionParams = {
  prompt: input.prompt || '',
  model: input.model,
  aspectRatio: input.aspectRatio,
  // ... other params
  // If no dynamicParams, extraParams will be undefined (existing behavior)
  extraParams: input.dynamicParams
};

// Old clients without dynamicParams still work
```

## Testing

```typescript
describe('executeSkill API', () => {
  it('accepts dynamicParams', async () => {
    const result = await caller.chat.executeSkill({
      skillId: 'test-skill',
      dynamicParams: { key: 'value' },
      conversationId: 123
    });
    
    expect(result.success).toBe(true);
  });

  it('validates dynamicParams types', async () => {
    await expect(
      caller.chat.executeSkill({
        skillId: 'test-skill',
        dynamicParams: { numberField: 'not-a-number' },
        conversationId: 123
      })
    ).rejects.toThrow('must be a number');
  });

  it('rejects unknown params', async () => {
    await expect(
      caller.chat.executeSkill({
        skillId: 'test-skill',
        dynamicParams: { unknownField: 'value' },
        conversationId: 123
      })
    ).rejects.toThrow('Unknown parameter');
  });

  it('sanitizes string inputs', async () => {
    await expect(
      caller.chat.executeSkill({
        skillId: 'test-skill',
        dynamicParams: { textField: '<script>alert(1)</script>' },
        conversationId: 123
      })
    ).rejects.toThrow('invalid characters');
  });

  it('backward compatible without dynamicParams', async () => {
    const result = await caller.chat.executeSkill({
      skillId: 'test-skill',
      conversationId: 123
      // No dynamicParams
    });
    
    expect(result.success).toBe(true);
  });

  it('validates image URLs', async () => {
    await expect(
      caller.chat.executeSkill({
        skillId: 'test-skill',
        dynamicParams: { 
          images: ['https://evil.com/image.png'] 
        },
        conversationId: 123
      })
    ).rejects.toThrow('invalid URL');
  });
});
```

## Acceptance Criteria

- [ ] executeSkill accepts dynamicParams
- [ ] Validates parameter types
- [ ] Rejects unknown parameters
- [ ] Sanitizes string inputs (XSS prevention)
- [ ] Validates image URLs
- [ ] Backward compatible (optional field)
- [ ] Returns validation errors to client
- [ ] Logs validation failures

## Security Checklist

- [ ] XSS prevention in string fields
- [ ] URL validation for images
- [ ] Type checking for all params
- [ ] Unknown param rejection
- [ ] Rate limiting applies
- [ ] User permission checked

## Dependencies

- Existing skillExecutor.ts
- Validation utilities
- Rate limiter

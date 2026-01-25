# Language Detection & Support Guide

## Overview

The Programming Advisor plugin now supports both English and Thai language requests. This guide explains how the language detection works and how to maintain consistency.

## Quick Start

### For Users
Simply ask your questions in either English or Thai - the plugin will automatically respond in the same language.

### For Developers
Language detection happens automatically based on the initial user message. The plugin loads the appropriate localization file and maintains language consistency throughout the conversation.

---

## Language Detection Algorithm

### Detection Order

1. **Initial Message Language** (Primary)
   - Analyzes the first user message
   - Detects language using character patterns and word recognition
   - Sets the conversation language

2. **Character-Based Detection**
   - Thai text: Contains Thai Unicode characters (U+0E00 - U+0E7F)
   - English text: Roman alphabet characters (a-z, A-Z)
   - Mixed: Determine primary language by character count ratio

3. **Keyword Matching** (Fallback)
   - English intent keywords: "build", "create", "code", "need", "how do I"
   - Thai intent keywords: "สร้าง", "ช่วย", "เขียน", "ต้องการ", "ได้ไหม"
   - Mixed language detection by matching known intents

4. **Context Preservation**
   - Once detected, maintain the same language for entire conversation
   - If user switches language in mid-conversation, note the switch
   - For code examples, keep code syntax unchanged (programming languages are universal)

### Implementation Example

```typescript
// Pseudo-code for language detection
function detectLanguage(userMessage: string): 'en' | 'th' {
  // Check for Thai characters
  const thaiCharRegex = /[\u0E00-\u0E7F]/g;
  const thaiChars = (userMessage.match(thaiCharRegex) || []).length;
  
  // Check for English characters
  const englishCharRegex = /[a-zA-Z]/g;
  const englishChars = (userMessage.match(englishCharRegex) || []).length;
  
  // Determine primary language
  if (thaiChars > englishChars * 0.5) {
    return 'th';
  }
  return 'en';
}

// Load appropriate localization
function loadLocalization(language: 'en' | 'th') {
  const localizationFile = language === 'th' 
    ? './localization/thai.json'
    : './localization/english.json';
  
  return require(localizationFile);
}
```

---

## Localization Structure

### File Organization

```
skills/programming-advisor/
├── localization/
│   ├── english.json      # English labels, responses, anti-patterns
│   └── thai.json         # Thai labels, responses, anti-patterns
├── references/           # Shared across both languages
│   ├── common-solutions.md
│   ├── token-estimates.md
│   ├── pricing-data.md
│   └── integration-patterns.md
└── SKILL.md             # Main workflow document
```

### Localization JSON Structure

Each localization file contains:

```json
{
  "language": "en/th",
  "langName": "English/ไทย",
  "labels": {
    "key": "Localized Label"
  },
  "responses": {
    "section": {
      "key": "Localized Response"
    }
  }
}
```

---

## Supported Languages & Intents

### English Intents

User triggers plugin with:
- "I want to build..."
- "Help me create..."
- "Can you code..."
- "I need a tool/app/script"
- "How do I implement..."
- "Should I build or use..."
- "What's the best solution for..."

Example Response Template:
```
## 🔍 Existing Solutions Found

I found [N] existing solutions before we write custom code:

### Libraries/Packages
- [solution details]

### Build vs Buy Comparison
[comparison table]
```

### Thai Intents

User triggers plugin with:
- "อยากจะสร้าง..." (I want to build...)
- "ช่วยสร้าง..." (Help me create...)
- "สามารถเขียนโค้ดได้ไหม..." (Can you code...)
- "ฉันต้องการ..." (I need...)
- "ควรจะสร้างหรือใช้..." (Should I build or use...)
- "โซลูชั่นที่ดีที่สุดคืออะไร..." (What's the best solution for...)
- "วิธีการใช้..." (How do I use...)
- "มีไลบรารี่ไหนที่..." (Is there a library that...)

Example Response Template:
```
## 🔍 พบโซลูชั่นที่มีอยู่แล้ว

ฉันพบ [N] โซลูชั่นที่มีอยู่แล้ว ก่อนที่เราจะเขียนโค้ดใหม่:

### ไลบรารี่/แพคเกจ
- [รายละเอียดโซลูชั่น]

### เปรียบเทียบสร้างเอง vs ซื้อ/ใช้
[ตารางเปรียบเทียบ]
```

---

## Workflow Steps (Language-Agnostic)

The core workflow remains the same regardless of language:

### Step 1: Capture Intent
- Extract: What, Why, Constraints
- Localized labels apply to the presentation

### Step 2: Search for Existing Solutions
- Same search strategy across languages
- Search terms remain in English (searching APIs)
- Results presented in user's language

### Step 3: Estimate Vibe Coding Cost
- Use token estimates from references
- Present costs with localized labels

### Step 4: Generate Comparison Table
- Same table structure
- Localized column headers and labels

### Step 5: Recommendation Framework
- Same decision logic
- Localized verdict labels (✅ แนะนำ vs ✅ Recommended)

### Step 6-8: All Subsequent Steps
- Follow same workflow
- Maintain conversation language
- Use localization for all UI labels

---

## Adding New Languages (Future)

To add a new language:

1. **Create localization file**: `localization/{language-code}.json`
2. **Copy from template**: Use `english.json` as structure
3. **Translate content**:
   - Labels (UI text)
   - Responses (conversation text)
   - Anti-patterns (common mistakes)
4. **Update language detection**: Add character ranges or keywords for new language
5. **Test**: Verify detection and response generation

---

## Language-Specific Considerations

### English
- Standard programming terminology
- Clear technical jargon
- Reference common English naming conventions
- Examples use camelCase, SCREAMING_SNAKE_CASE

### Thai
- Technical terms often borrowed from English (wrapped in Thai context)
- Use Thai counting system when appropriate (ไลบรารี่ 3 ตัว)
- Thai reading direction is left-to-right but emphasize clarity
- Common Thai programming patterns are increasingly similar to English
- Date formatting: Day/Month/Year (Thai Buddhist calendar for dates)
- Currency: ฿ for Thai Baht, $ for USD in tech context

### Code Examples
- **Always in English**: Variable names, function names follow programming conventions
- **Comments**: Respect user's language preference - if they ask in Thai, Thai comments
- **Markdown blocks**: Code formatting language-independent; comments adapt to user language

---

## Quality Checklist

Before delivering localized responses:

- [ ] User's initial language correctly detected
- [ ] Response language matches user's language
- [ ] All UI labels are localized
- [ ] Code examples are correct (language-neutral)
- [ ] Links and URLs preserved (no translation)
- [ ] Emoji used consistently (universal symbols)
- [ ] Tables formatted correctly in both languages
- [ ] Technical terms are accurate in target language
- [ ] No mixed language in single response (unless code example)
- [ ] Date/time formats follow language conventions

---

## Troubleshooting

### Mixed Language Responses
**Problem**: Response partially in English, partially in Thai
**Solution**: Check language detection algorithm - ensure primary language wins; check localization loading

### Missing Localization Keys
**Problem**: Some labels show as "[key]" instead of translated text
**Solution**: Verify key exists in JSON file; check for typos in key names

### Incorrect Language Detection
**Problem**: Thai message detected as English or vice versa
**Solution**: Enhance character pattern matching; add more keyword triggers

### Code Examples Not Working
**Problem**: Provided code doesn't match user's project
**Solution**: Language detection shouldn't affect code - verify project context detection separate from language detection

---

## Resources

- **Localization Files**: `skills/programming-advisor/localization/`
- **Main Workflow**: `skills/programming-advisor/SKILL.md`
- **Plugin Config**: `.claude-plugin/plugin.json`
- **References**: `skills/programming-advisor/references/`

---

## Version History

- **v2.0.0** (Current): Bilingual English + Thai support
  - Added language detection algorithm
  - Created localization JSON files
  - Enhanced intent triggers for Thai language
  - Maintained backward compatibility with English-only workflows

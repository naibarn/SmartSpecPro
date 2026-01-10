# OpenRouter Usage Accounting - Key Information

## วิธีเปิดใช้งาน Usage Accounting

ต้องส่ง parameter `usage` ใน request:

```json
{
  "model": "your-model",
  "messages": [],
  "usage": {
    "include": true
  }
}
```

## Response Format

เมื่อเปิด usage accounting จะได้ response แบบนี้:

```json
{
  "object": "chat.completion.chunk",
  "usage": {
    "completion_tokens": 2,
    "completion_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.95,
    "cost_details": {
      "upstream_inference_cost": 19
    },
    "prompt_tokens": 194,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "total_tokens": 196
  }
}
```

## Key Fields

- **cost**: The total amount charged to your account (in credits)
- **cost_details.upstream_inference_cost**: The actual cost charged by the upstream AI provider

## สิ่งที่ต้องแก้ไขใน UnifiedLLMClient

1. ส่ง `usage: { include: true }` ใน extra_body ของ request
2. ดึง `cost` จาก `response.usage.cost` (ถ้ามี)
3. แปลง cost เป็น USD (OpenRouter ใช้ credits ที่ 1 credit = $0.000001)

## Alternative: Get Usage via Generation ID

สามารถดึง usage information ภายหลังได้โดยใช้ generation ID จาก response

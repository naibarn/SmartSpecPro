# LangSmith Evaluation for SmartSpec

**Date:** January 2, 2026

## 1. LangSmith Overview

LangSmith เป็น observability platform จาก LangChain ที่ให้ความสามารถในการ:
- **Tracing:** ติดตามทุก request ผ่าน LLM pipeline
- **Monitoring:** ดู real-time metrics และ alerts
- **Evaluation:** ทำ online/offline evals
- **Debugging:** วิเคราะห์ปัญหาใน agent behavior
- **Prompt Management:** Prompt Hub และ Playground

## 2. Pricing Tiers

| Plan | Price | Traces/Month | Key Features |
|------|-------|--------------|--------------|
| **Developer** | Free | 5,000 base traces | 1 seat, Community support |
| **Plus** | $39/seat/mo | 10,000 base traces | Up to 10 seats, Email support, 3 workspaces |
| **Enterprise** | Custom | Custom | SSO, RBAC, Self-hosted option, SLA |

## 3. Key Features Analysis

### 3.1 Tracing & Observability
- End-to-end visibility into agent behavior
- Capture full request lifecycle
- Real-time monitoring and alerting
- AI-powered insights (Polly assistant)

### 3.2 Evaluation
- Online and offline evaluations
- Dataset collection
- Annotation queues for human feedback
- Custom evaluation metrics

### 3.3 Deployment (Plus/Enterprise)
- Agent deployment infrastructure
- MCP server exposure
- Real-time streaming
- Cron scheduling
- 30+ API endpoints

## 4. Pros & Cons for SmartSpec

### ✅ Pros
1. **Native Integration:** ทำงานร่วมกับ LangChain/LangGraph ได้ทันที (เราใช้อยู่แล้ว)
2. **Free Tier:** 5,000 traces/month เพียงพอสำหรับ development
3. **Debugging:** ช่วย debug complex agent workflows
4. **Evaluation:** ทำ A/B testing และ quality metrics ได้
5. **Prompt Management:** จัดการ prompts แบบ centralized

### ❌ Cons
1. **Vendor Lock-in:** ผูกกับ LangChain ecosystem
2. **Cost at Scale:** Pay-as-you-go หลัง free tier หมด
3. **Data Privacy:** Data ส่งไป LangChain cloud (ยกเว้น Enterprise self-hosted)
4. **Dependency:** เพิ่ม external dependency

## 5. Alternatives

| Tool | Type | Pros | Cons |
|------|------|------|------|
| **Langfuse** | Open-source | Self-hosted, Free | Less features |
| **Phoenix (Arize)** | Open-source | Local, No vendor lock-in | Setup complexity |
| **Helicone** | SaaS | Simple, Fast | Limited features |
| **OpenTelemetry** | Standard | Universal, Flexible | More setup work |

## 6. Recommendation

### 🎯 **แนะนำ: ใช้ LangSmith ในระยะแรก**

**เหตุผล:**
1. **Quick Start:** เราใช้ LangChain/LangGraph อยู่แล้ว - integration ง่ายมาก
2. **Free Tier:** 5,000 traces/month เพียงพอสำหรับ development และ testing
3. **Debugging Value:** ช่วย debug orchestrator และ agent workflows ได้มาก
4. **Low Risk:** สามารถเปลี่ยนไป Langfuse หรือ OpenTelemetry ได้ภายหลัง

### Implementation Strategy

**Phase 1 (Now):** 
- เพิ่ม LangSmith tracing ใน development environment
- ใช้ Free tier สำหรับ debugging

**Phase 2 (Production):**
- ประเมินว่าต้องการ Plus tier หรือไม่
- พิจารณา Langfuse เป็น alternative ถ้าต้องการ self-hosted

**Phase 3 (Scale):**
- ถ้า traces เยอะมาก พิจารณา Enterprise หรือ migrate ไป OpenTelemetry

## 7. Integration Code

```python
# .env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_api_key
LANGCHAIN_PROJECT=smartspec-dev

# No code changes needed - LangChain auto-traces!
```

## 8. Conclusion

LangSmith เป็นตัวเลือกที่ดีสำหรับ SmartSpec เนื่องจาก:
- Integration ง่าย (แค่ set environment variables)
- Free tier เพียงพอสำหรับ development
- ช่วย debug complex agent workflows
- สามารถ migrate ไป alternatives ได้ภายหลังถ้าจำเป็น

**ข้อเสนอ:** เพิ่ม LangSmith configuration ใน `config.py` แต่ทำให้เป็น optional (disabled by default)

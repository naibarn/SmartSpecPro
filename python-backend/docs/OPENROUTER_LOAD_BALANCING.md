# OpenRouter Load Balancing และ Automatic Fallbacks

**วันที่:** 30 ธันวาคม 2025  
**เวอร์ชัน:** SmartSpec Pro 0.2.0  
**ผู้เขียน:** SmartSpec Team

---

## 📋 **สารบัญ**

1. [ภาพรวม](#ภาพรวม)
2. [Load Balancing (การกระจายโหลด)](#load-balancing-การกระจายโหลด)
3. [Automatic Fallbacks (การสำรองอัตโนมัติ)](#automatic-fallbacks-การสำรองอัตโนมัติ)
4. [Provider Routing (การเลือก Provider)](#provider-routing-การเลือก-provider)
5. [การตั้งค่าใน Python](#การตั้งค่าใน-python)
6. [ตัวอย่างการใช้งาน](#ตัวอย่างการใช้งาน)
7. [Best Practices](#best-practices)

---

## 🎯 **ภาพรวม**

OpenRouter ให้บริการ **Load Balancing** และ **Automatic Fallbacks** แบบ built-in เพื่อ:

- ✅ **เพิ่ม uptime** - ถ้า provider หนึ่งล้ม จะลองอันอื่นอัตโนมัติ
- ✅ **กระจายโหลด** - แบ่งโหลดไปหลาย providers เพื่อลด rate limiting
- ✅ **ประหยัดต้นทุน** - เลือก provider ที่ถูกที่สุดก่อน
- ✅ **เพิ่มความเร็ว** - เลือก provider ที่เร็วที่สุด (throughput/latency)
- ✅ **ความยืดหยุ่น** - ปรับแต่งได้ตามความต้องการ

---

## ⚖️ **Load Balancing (การกระจายโหลด)**

### **1. Default Strategy: Price-Based Load Balancing**

OpenRouter จะกระจายโหลดโดยอัตโนมัติตาม **ราคา** และ **uptime**:

#### **อัลกอริทึม:**

```
1. เลือก providers ที่ไม่มีปัญหาใน 30 วินาทีที่ผ่านมา
2. จาก providers ที่เสถียร เลือกตามน้ำหนัก inverse square ของราคา
3. ใช้ providers ที่เหลือเป็น fallbacks
```

#### **ตัวอย่างการคำนวณ:**

สมมติมี 3 providers:
- **Provider A:** $1 ต่อ 1M tokens
- **Provider B:** $2 ต่อ 1M tokens (มีปัญหาเล็กน้อย)
- **Provider C:** $3 ต่อ 1M tokens

**การกระจายโหลด:**
```
Provider A: น้ำหนัก = 1/(1²) = 1.0
Provider C: น้ำหนัก = 1/(3²) = 0.111

Provider A มีโอกาสถูกเลือก 9 เท่าของ Provider C
```

**ลำดับการลอง:**
```
1. Provider A (ถูกที่สุด, เสถียร)
2. Provider C (ถูกรองลงมา, เสถียร)
3. Provider B (มีปัญหา, ใช้เป็น fallback สุดท้าย)
```

### **2. Throughput-Based Load Balancing**

เลือก provider ที่มี **throughput สูงสุด** (tokens/วินาที):

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-your-key"
)

response = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "sort": "throughput"  # เลือก provider ที่เร็วที่สุด
        }
    }
)
```

**หรือใช้ shortcut `:nitro`:**

```python
response = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct:nitro",  # เทียบเท่า sort="throughput"
    messages=[{"role": "user", "content": "Hello"}]
)
```

### **3. Latency-Based Load Balancing**

เลือก provider ที่มี **latency ต่ำที่สุด** (เวลาตอบสนอง):

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "sort": "latency"  # เลือก provider ที่ latency ต่ำที่สุด
        }
    }
)
```

### **4. Price-Based Load Balancing (Explicit)**

บังคับเลือก provider ที่ **ถูกที่สุด**:

```python
response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet:floor",  # เทียบเท่า sort="price"
    messages=[{"role": "user", "content": "Hello"}]
)
```

---

## 🔄 **Automatic Fallbacks (การสำรองอัตโนมัติ)**

### **1. Default Behavior: Fallbacks Enabled**

OpenRouter จะลอง fallback providers อัตโนมัติเมื่อ:

- ✅ Provider หลักล้ม (downtime)
- ✅ Rate limiting (เกินโควต้า)
- ✅ Content moderation (ถูกกรองเนื้อหา)
- ✅ Context length error (ข้อความยาวเกิน)
- ✅ Timeout
- ✅ Error อื่นๆ

#### **ตัวอย่าง: Model Fallbacks**

```python
response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",  # Model หลัก
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "models": [
            "openai/gpt-4o",           # Fallback #1
            "google/gemini-flash-1.5"  # Fallback #2
        ]
    }
)
```

**Flow:**
```
1. ลอง claude-3.5-sonnet ก่อน
   ↓ (ถ้าล้ม)
2. ลอง gpt-4o
   ↓ (ถ้าล้มอีก)
3. ลอง gemini-flash-1.5
   ↓ (ถ้าล้มอีก)
4. Return error
```

**ราคา:** คิดตาม model ที่ใช้งานจริง (ดูจาก `response.model`)

### **2. Provider Fallbacks**

กำหนด **ลำดับ providers** ที่ต้องการลอง:

```python
response = client.chat.completions.create(
    model="mistralai/mixtral-8x7b-instruct",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "order": ["together", "deepinfra", "fireworks"]  # ลำดับที่ต้องการ
        }
    }
)
```

**Flow:**
```
1. ลอง Together AI ก่อน
   ↓ (ถ้าล้ม)
2. ลอง DeepInfra
   ↓ (ถ้าล้มอีก)
3. ลอง Fireworks
   ↓ (ถ้าล้มอีก)
4. ลอง providers อื่นๆ ที่ OpenRouter เลือกให้ (default fallbacks)
```

### **3. Disabling Fallbacks**

ปิด fallbacks ถ้าต้องการใช้ provider เฉพาะ:

```python
response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "order": ["anthropic"],
            "allow_fallbacks": False  # ปิด fallbacks
        }
    }
)
```

**Flow:**
```
1. ลอง Anthropic
   ↓ (ถ้าล้ม)
2. Return error ทันที (ไม่ลอง providers อื่น)
```

---

## 🎯 **Provider Routing (การเลือก Provider)**

### **1. Allow Only Specific Providers**

อนุญาตเฉพาะ providers ที่ระบุ:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "only": ["azure", "openai"]  # ใช้ได้เฉพาะ Azure และ OpenAI
        }
    }
)
```

### **2. Ignore Specific Providers**

ข้าม providers ที่ไม่ต้องการ:

```python
response = client.chat.completions.create(
    model="meta-llama/llama-3.3-70b-instruct",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "ignore": ["deepinfra"]  # ไม่ใช้ DeepInfra
        }
    }
)
```

### **3. Targeting Specific Provider Endpoints**

บาง providers มีหลาย endpoints (เช่น default, turbo):

```python
response = client.chat.completions.create(
    model="deepseek/deepseek-r1",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "order": ["deepinfra/turbo"],  # ใช้ turbo endpoint
            "allow_fallbacks": False
        }
    }
)
```

### **4. Require Parameter Support**

ใช้เฉพาะ providers ที่รองรับ parameters ทั้งหมด:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    response_format={"type": "json_object"},  # ต้องการ JSON output
    extra_body={
        "provider": {
            "require_parameters": True  # ใช้เฉพาะ providers ที่รองรับ JSON
        }
    }
)
```

### **5. Data Privacy Controls**

#### **5.1 Deny Data Collection**

ใช้เฉพาะ providers ที่ไม่เก็บข้อมูล:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Sensitive data"}],
    extra_body={
        "provider": {
            "data_collection": "deny"  # ไม่ใช้ providers ที่เก็บข้อมูล
        }
    }
)
```

#### **5.2 Zero Data Retention (ZDR)**

บังคับใช้ ZDR endpoints:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Confidential data"}],
    extra_body={
        "provider": {
            "zdr": True  # ใช้เฉพาะ ZDR endpoints
        }
    }
)
```

### **6. Quantization Control**

เลือก quantization level (int4, int8, fp8, fp16):

```python
response = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "quantizations": ["fp8", "fp16"]  # ใช้เฉพาะ FP8 หรือ FP16
        }
    }
)
```

### **7. Max Price Limit**

กำหนดราคาสูงสุดที่ยอมจ่าย:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "max_price": {
                "prompt": 0.005,      # สูงสุด $0.005 ต่อ 1K prompt tokens
                "completion": 0.015   # สูงสุด $0.015 ต่อ 1K completion tokens
            }
        }
    }
)
```

---

## 🐍 **การตั้งค่าใน Python**

### **1. Basic Setup**

```python
from openai import OpenAI

# Setup OpenRouter client
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-your-key"
)

# Optional: Add site info for rankings
import os
os.environ["OPENROUTER_SITE_URL"] = "https://yoursite.com"
os.environ["OPENROUTER_SITE_NAME"] = "Your App Name"
```

### **2. Helper Function สำหรับ Provider Options**

```python
from typing import Optional, List, Literal

def create_provider_options(
    sort: Optional[Literal["price", "throughput", "latency"]] = None,
    order: Optional[List[str]] = None,
    allow_fallbacks: bool = True,
    require_parameters: bool = False,
    data_collection: Literal["allow", "deny"] = "allow",
    zdr: Optional[bool] = None,
    only: Optional[List[str]] = None,
    ignore: Optional[List[str]] = None,
    quantizations: Optional[List[str]] = None,
    max_price: Optional[dict] = None
) -> dict:
    """
    สร้าง provider options สำหรับ OpenRouter
    
    Args:
        sort: เรียงตาม "price", "throughput", หรือ "latency"
        order: ลำดับ providers ที่ต้องการลอง
        allow_fallbacks: อนุญาต fallbacks หรือไม่
        require_parameters: ใช้เฉพาะ providers ที่รองรับ parameters ทั้งหมด
        data_collection: "allow" หรือ "deny" การเก็บข้อมูล
        zdr: บังคับใช้ Zero Data Retention
        only: อนุญาตเฉพาะ providers ที่ระบุ
        ignore: ข้าม providers ที่ระบุ
        quantizations: quantization levels ที่ยอมรับ
        max_price: ราคาสูงสุดที่ยอมจ่าย
    
    Returns:
        dict: provider options สำหรับ extra_body
    """
    options = {}
    
    if sort:
        options["sort"] = sort
    if order:
        options["order"] = order
    if not allow_fallbacks:
        options["allow_fallbacks"] = False
    if require_parameters:
        options["require_parameters"] = True
    if data_collection == "deny":
        options["data_collection"] = "deny"
    if zdr is not None:
        options["zdr"] = zdr
    if only:
        options["only"] = only
    if ignore:
        options["ignore"] = ignore
    if quantizations:
        options["quantizations"] = quantizations
    if max_price:
        options["max_price"] = max_price
    
    return {"provider": options} if options else {}


# ตัวอย่างการใช้งาน
provider_opts = create_provider_options(
    sort="throughput",
    allow_fallbacks=True,
    data_collection="deny"
)

response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body=provider_opts
)
```

### **3. Wrapper Class สำหรับ SmartSpec**

```python
class OpenRouterClient:
    """
    Wrapper class สำหรับ OpenRouter ใน SmartSpec Pro
    """
    
    def __init__(self, api_key: str, site_url: str = "", site_name: str = ""):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key
        )
        self.site_url = site_url
        self.site_name = site_name
    
    def chat(
        self,
        model: str,
        messages: List[dict],
        # Load balancing options
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        # Fallback options
        fallback_models: Optional[List[str]] = None,
        allow_fallbacks: bool = True,
        # Provider options
        preferred_providers: Optional[List[str]] = None,
        only_providers: Optional[List[str]] = None,
        ignore_providers: Optional[List[str]] = None,
        # Privacy options
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        # Other options
        require_parameters: bool = False,
        quantizations: Optional[List[str]] = None,
        max_price: Optional[dict] = None,
        **kwargs
    ):
        """
        เรียกใช้ OpenRouter chat completion พร้อม load balancing และ fallbacks
        
        Args:
            model: Model ID (e.g., "openai/gpt-4o")
            messages: Chat messages
            sort: เรียง providers ตาม "price", "throughput", "latency"
            fallback_models: Model fallbacks
            allow_fallbacks: อนุญาต provider fallbacks
            preferred_providers: ลำดับ providers ที่ต้องการ
            only_providers: อนุญาตเฉพาะ providers ที่ระบุ
            ignore_providers: ข้าม providers ที่ระบุ
            data_collection: "allow" หรือ "deny"
            zdr: บังคับ Zero Data Retention
            require_parameters: ใช้เฉพาะ providers ที่รองรับ parameters ทั้งหมด
            quantizations: Quantization levels
            max_price: ราคาสูงสุด
            **kwargs: OpenAI API parameters อื่นๆ
        
        Returns:
            ChatCompletion response
        """
        # Build extra_body
        extra_body = {}
        
        # Provider options
        provider_opts = {}
        if sort:
            provider_opts["sort"] = sort
        if preferred_providers:
            provider_opts["order"] = preferred_providers
        if not allow_fallbacks:
            provider_opts["allow_fallbacks"] = False
        if require_parameters:
            provider_opts["require_parameters"] = True
        if data_collection == "deny":
            provider_opts["data_collection"] = "deny"
        if zdr is not None:
            provider_opts["zdr"] = zdr
        if only_providers:
            provider_opts["only"] = only_providers
        if ignore_providers:
            provider_opts["ignore"] = ignore_providers
        if quantizations:
            provider_opts["quantizations"] = quantizations
        if max_price:
            provider_opts["max_price"] = max_price
        
        if provider_opts:
            extra_body["provider"] = provider_opts
        
        # Model fallbacks
        if fallback_models:
            extra_body["models"] = fallback_models
        
        # Site info headers
        extra_headers = {}
        if self.site_url:
            extra_headers["HTTP-Referer"] = self.site_url
        if self.site_name:
            extra_headers["X-Title"] = self.site_name
        
        # Make request
        return self.client.chat.completions.create(
            model=model,
            messages=messages,
            extra_body=extra_body if extra_body else None,
            extra_headers=extra_headers if extra_headers else None,
            **kwargs
        )


# ตัวอย่างการใช้งาน
or_client = OpenRouterClient(
    api_key="sk-or-v1-your-key",
    site_url="https://smartspec.pro",
    site_name="SmartSpec Pro"
)

# Example 1: High throughput with fallbacks
response = or_client.chat(
    model="anthropic/claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Write code"}],
    sort="throughput",
    fallback_models=["openai/gpt-4o", "google/gemini-flash-1.5"]
)

# Example 2: Privacy-focused
response = or_client.chat(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Sensitive data"}],
    data_collection="deny",
    zdr=True
)

# Example 3: Cost-optimized
response = or_client.chat(
    model="meta-llama/llama-3.1-70b-instruct",
    messages=[{"role": "user", "content": "Hello"}],
    sort="price",
    max_price={"prompt": 0.001, "completion": 0.002}
)
```

---

## 💡 **ตัวอย่างการใช้งาน**

### **Example 1: High Availability Setup**

เน้น **uptime สูงสุด** พร้อม fallbacks หลายชั้น:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-your-key"
)

response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",  # Model หลัก
    messages=[{"role": "user", "content": "Write a Python function"}],
    extra_body={
        "models": [
            "openai/gpt-4o",              # Fallback #1
            "google/gemini-flash-1.5",    # Fallback #2
            "meta-llama/llama-3.1-70b-instruct"  # Fallback #3
        ],
        "provider": {
            "allow_fallbacks": True  # อนุญาต provider fallbacks ด้วย
        }
    }
)

print(f"Used model: {response.model}")
print(f"Response: {response.choices[0].message.content}")
```

**ผลลัพธ์:**
- ถ้า Claude ใช้งานได้ → ใช้ Claude
- ถ้า Claude ล้ม → ลอง GPT-4o
- ถ้า GPT-4o ล้ม → ลอง Gemini Flash
- ถ้า Gemini ล้ม → ลอง Llama 3.1
- ถ้าทุก model ล้ม → Return error

### **Example 2: Cost-Optimized Setup**

เน้น **ราคาถูกที่สุด**:

```python
response = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct:floor",  # ใช้ provider ที่ถูกที่สุด
    messages=[{"role": "user", "content": "Simple task"}],
    extra_body={
        "provider": {
            "max_price": {
                "prompt": 0.0005,      # สูงสุด $0.0005 ต่อ 1K prompt tokens
                "completion": 0.001    # สูงสุด $0.001 ต่อ 1K completion tokens
            }
        }
    }
)
```

### **Example 3: Speed-Optimized Setup**

เน้น **ความเร็วสูงสุด**:

```python
response = client.chat.completions.create(
    model="google/gemini-flash-1.5:nitro",  # ใช้ provider ที่เร็วที่สุด
    messages=[{"role": "user", "content": "Quick question"}],
    max_tokens=100  # จำกัด output เพื่อความเร็ว
)
```

### **Example 4: Privacy-Focused Setup**

เน้น **ความเป็นส่วนตัว**:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Confidential business data"}],
    extra_body={
        "provider": {
            "zdr": True,                    # Zero Data Retention
            "data_collection": "deny",      # ไม่เก็บข้อมูล
            "only": ["azure", "openai"]     # ใช้เฉพาะ providers ที่เชื่อถือ
        }
    }
)
```

### **Example 5: Production-Ready Setup**

รวมทุกอย่าง:

```python
def call_llm_with_high_reliability(
    model: str,
    messages: List[dict],
    task_type: str = "general"
) -> dict:
    """
    เรียก LLM พร้อม load balancing และ fallbacks แบบ production-ready
    """
    # กำหนด fallbacks ตาม task type
    fallback_configs = {
        "code": {
            "models": [
                "anthropic/claude-3.5-sonnet",
                "openai/gpt-4o",
                "google/gemini-flash-1.5"
            ],
            "sort": "quality"
        },
        "speed": {
            "models": [
                "google/gemini-flash-1.5",
                "openai/gpt-4o-mini",
                "meta-llama/llama-3.1-70b-instruct"
            ],
            "sort": "throughput"
        },
        "cost": {
            "models": [
                "meta-llama/llama-3.1-70b-instruct",
                "google/gemini-flash-1.5",
                "openai/gpt-4o-mini"
            ],
            "sort": "price"
        }
    }
    
    config = fallback_configs.get(task_type, fallback_configs["code"])
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            extra_body={
                "models": config["models"],
                "provider": {
                    "sort": config.get("sort"),
                    "allow_fallbacks": True,
                    "require_parameters": True,
                    "data_collection": "deny"  # Privacy by default
                }
            },
            timeout=30  # 30 seconds timeout
        )
        
        return {
            "success": True,
            "content": response.choices[0].message.content,
            "model_used": response.model,
            "tokens": response.usage.total_tokens if response.usage else 0
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# ใช้งาน
result = call_llm_with_high_reliability(
    model="anthropic/claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Write a function"}],
    task_type="code"
)

if result["success"]:
    print(f"Model used: {result['model_used']}")
    print(f"Response: {result['content']}")
else:
    print(f"Error: {result['error']}")
```

---

## ✅ **Best Practices**

### **1. Load Balancing**

```python
# ✅ DO: ใช้ default load balancing สำหรับ general use
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)

# ✅ DO: ใช้ sort เมื่อมีความต้องการเฉพาะ
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={"provider": {"sort": "throughput"}}  # เน้นความเร็ว
)

# ❌ DON'T: ใช้ sort โดยไม่จำเป็น (ทำให้เสีย load balancing)
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={"provider": {"sort": "price"}}  # ไม่จำเป็น default ก็ดีแล้ว
)
```

### **2. Fallbacks**

```python
# ✅ DO: ใช้ model fallbacks สำหรับ high availability
response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "models": ["openai/gpt-4o", "google/gemini-flash-1.5"]
    }
)

# ✅ DO: ใช้ provider order เมื่อต้องการ provider เฉพาะ
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {"order": ["azure", "openai"]}
    }
)

# ❌ DON'T: ปิด fallbacks โดยไม่จำเป็น
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {"allow_fallbacks": False}  # ทำให้ uptime ต่ำ
    }
)
```

### **3. Privacy**

```python
# ✅ DO: ใช้ ZDR สำหรับข้อมูลที่ sensitive
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Confidential data"}],
    extra_body={
        "provider": {"zdr": True}
    }
)

# ✅ DO: ใช้ data_collection="deny" สำหรับ privacy
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Personal info"}],
    extra_body={
        "provider": {"data_collection": "deny"}
    }
)
```

### **4. Cost Control**

```python
# ✅ DO: ใช้ max_price เพื่อควบคุมต้นทุน
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "max_price": {
                "prompt": 0.005,
                "completion": 0.015
            }
        }
    }
)

# ✅ DO: ใช้ :floor สำหรับราคาถูกที่สุด
response = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct:floor",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### **5. Error Handling**

```python
# ✅ DO: จัดการ errors อย่างเหมาะสม
from openai import OpenAIError
import time

def call_with_retry(client, model, messages, max_retries=3):
    """เรียก LLM พร้อม retry logic"""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                extra_body={
                    "models": [
                        "openai/gpt-4o",
                        "google/gemini-flash-1.5"
                    ]
                }
            )
            return response
        
        except OpenAIError as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # Exponential backoff
                print(f"Attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"All {max_retries} attempts failed")
                raise
```

---

## 📊 **สรุป**

### **Load Balancing Strategies**

| Strategy | Use Case | Command |
|----------|----------|---------|
| **Default** | General use, cost-effective | `model="openai/gpt-4o"` |
| **Price** | ต้นทุนต่ำสุด | `model="...:floor"` หรือ `sort="price"` |
| **Throughput** | ความเร็วสูงสุด | `model="...:nitro"` หรือ `sort="throughput"` |
| **Latency** | เวลาตอบสนองต่ำสุด | `sort="latency"` |

### **Fallback Strategies**

| Strategy | Reliability | Cost | Complexity |
|----------|-------------|------|------------|
| **No fallbacks** | ⭐ | $ | Simple |
| **Provider fallbacks** | ⭐⭐⭐ | $$ | Medium |
| **Model fallbacks** | ⭐⭐⭐⭐ | $$$ | Medium |
| **Both** | ⭐⭐⭐⭐⭐ | $$$$ | Complex |

### **Privacy Options**

| Option | Privacy Level | Availability |
|--------|---------------|--------------|
| **Default** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **data_collection="deny"** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **zdr=True** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **only=[trusted]** | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

## 🔗 **References**

- **OpenRouter Docs:** https://openrouter.ai/docs
- **Model Routing:** https://openrouter.ai/docs/guides/features/model-routing
- **Provider Selection:** https://openrouter.ai/docs/guides/routing/provider-selection
- **SmartSpec OpenRouter Provider:** `python-backend/app/llm_proxy/providers/openrouter_provider.py`

---

## ✅ **Checklist**

เมื่อใช้ OpenRouter ใน production:

- [ ] ตั้งค่า API key และ site info
- [ ] เลือก load balancing strategy ที่เหมาะสม
- [ ] กำหนด fallback models/providers
- [ ] ตั้งค่า privacy options (ZDR, data_collection)
- [ ] กำหนด max_price เพื่อควบคุมต้นทุน
- [ ] เพิ่ม error handling และ retry logic
- [ ] ทดสอบ fallbacks ทำงานถูกต้อง
- [ ] Monitor usage และ costs
- [ ] Log model_used สำหรับ debugging

---

**พร้อมใช้งาน OpenRouter แบบ production-ready! 🚀**

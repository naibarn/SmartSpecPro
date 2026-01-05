"""
OpenRouter Load Balancing และ Fallbacks - ตัวอย่างการใช้งาน
SmartSpec Pro

ตัวอย่างทั้งหมดใช้งานได้จริง - เพียงแค่ตั้งค่า OPENROUTER_API_KEY
"""

import os
import sys
from typing import List, Dict

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.llm_proxy.openrouter_wrapper import (
    OpenRouterWrapper,
    create_openrouter_client,
    get_preset_config
)


# ============================================================================
# Example 1: Basic Usage
# ============================================================================

def example_1_basic_usage():
    """
    ตัวอย่างพื้นฐาน - ใช้ default load balancing
    """
    print("\n" + "="*60)
    print("Example 1: Basic Usage")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY"),
        site_url="https://smartspec.pro",
        site_name="SmartSpec Pro"
    )
    
    response = client.chat(
        model="openai/gpt-4o-mini",
        messages=[
            {"role": "user", "content": "Say 'Hello from OpenRouter!' in exactly 5 words."}
        ],
        max_tokens=50,
        temperature=0.7
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response: {response.choices[0].message.content}")
    print(f"✅ Tokens: {response.usage.total_tokens if response.usage else 'N/A'}")


# ============================================================================
# Example 2: High Availability with Model Fallbacks
# ============================================================================

def example_2_high_availability():
    """
    High availability - ใช้ model fallbacks หลายชั้น
    """
    print("\n" + "="*60)
    print("Example 2: High Availability with Model Fallbacks")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    response = client.chat_high_availability(
        model="anthropic/claude-3.5-sonnet",  # Primary
        messages=[
            {"role": "user", "content": "Write a Python function to check if a number is prime."}
        ],
        fallback_models=[
            "openai/gpt-4o",                    # Fallback #1
            "google/gemini-flash-1.5",          # Fallback #2
            "meta-llama/llama-3.1-70b-instruct" # Fallback #3
        ],
        max_tokens=200,
        temperature=0.3
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response:\n{response.choices[0].message.content[:200]}...")
    print(f"✅ Tokens: {response.usage.total_tokens if response.usage else 'N/A'}")


# ============================================================================
# Example 3: Speed Optimization (Throughput)
# ============================================================================

def example_3_speed_optimization():
    """
    Speed optimization - เลือก provider ที่เร็วที่สุด
    """
    print("\n" + "="*60)
    print("Example 3: Speed Optimization (Throughput)")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    # Method 1: Using sort="throughput"
    response = client.chat_fast(
        model="google/gemini-flash-1.5",
        messages=[
            {"role": "user", "content": "What is 2+2? Answer in one word."}
        ],
        max_tokens=10,
        temperature=0.1
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response: {response.choices[0].message.content}")
    
    # Method 2: Using :nitro shortcut
    response2 = client.chat(
        model="meta-llama/llama-3.1-70b-instruct:nitro",  # Shortcut
        messages=[
            {"role": "user", "content": "Quick test"}
        ],
        max_tokens=10
    )
    
    print(f"✅ Model used (nitro): {response2.model}")
    print(f"✅ Response: {response2.choices[0].message.content}")


# ============================================================================
# Example 4: Cost Optimization (Price)
# ============================================================================

def example_4_cost_optimization():
    """
    Cost optimization - เลือก provider ที่ถูกที่สุด
    """
    print("\n" + "="*60)
    print("Example 4: Cost Optimization (Price)")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    # Method 1: Using sort="price"
    response = client.chat_cheap(
        model="meta-llama/llama-3.1-70b-instruct",
        messages=[
            {"role": "user", "content": "Hello, how are you?"}
        ],
        max_price={
            "prompt": 0.001,      # Max $0.001 per 1K prompt tokens
            "completion": 0.002   # Max $0.002 per 1K completion tokens
        },
        max_tokens=50
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response: {response.choices[0].message.content}")
    
    # Method 2: Using :floor shortcut
    response2 = client.chat(
        model="meta-llama/llama-3.1-70b-instruct:floor",  # Shortcut
        messages=[
            {"role": "user", "content": "Hello"}
        ],
        max_tokens=50
    )
    
    print(f"✅ Model used (floor): {response2.model}")
    print(f"✅ Response: {response2.choices[0].message.content}")


# ============================================================================
# Example 5: Privacy-Focused (ZDR + No Data Collection)
# ============================================================================

def example_5_privacy_focused():
    """
    Privacy-focused - ZDR และไม่เก็บข้อมูล
    """
    print("\n" + "="*60)
    print("Example 5: Privacy-Focused (ZDR + No Data Collection)")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    response = client.chat_private(
        model="openai/gpt-4o",
        messages=[
            {"role": "user", "content": "This is confidential business data: ..."}
        ],
        zdr=True,  # Zero Data Retention
        max_tokens=100
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response: {response.choices[0].message.content[:100]}...")
    print(f"✅ Privacy: ZDR enabled, no data collection")


# ============================================================================
# Example 6: Provider Routing (Specific Providers)
# ============================================================================

def example_6_provider_routing():
    """
    Provider routing - เลือก providers เฉพาะ
    """
    print("\n" + "="*60)
    print("Example 6: Provider Routing (Specific Providers)")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    # Example 6.1: Preferred provider order
    response = client.chat(
        model="openai/gpt-4o",
        messages=[
            {"role": "user", "content": "Hello"}
        ],
        preferred_providers=["azure", "openai"],  # Try Azure first, then OpenAI
        max_tokens=50
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response: {response.choices[0].message.content}")
    
    # Example 6.2: Only specific providers
    response2 = client.chat(
        model="openai/gpt-4o",
        messages=[
            {"role": "user", "content": "Hello"}
        ],
        only_providers=["azure", "openai"],  # Only allow these
        max_tokens=50
    )
    
    print(f"✅ Model used (only): {response2.model}")
    
    # Example 6.3: Ignore specific providers
    response3 = client.chat(
        model="meta-llama/llama-3.3-70b-instruct",
        messages=[
            {"role": "user", "content": "Hello"}
        ],
        ignore_providers=["deepinfra"],  # Skip DeepInfra
        max_tokens=50
    )
    
    print(f"✅ Model used (ignore): {response3.model}")


# ============================================================================
# Example 7: Disabling Fallbacks
# ============================================================================

def example_7_disable_fallbacks():
    """
    Disable fallbacks - ใช้ provider เฉพาะ ไม่มี fallback
    """
    print("\n" + "="*60)
    print("Example 7: Disabling Fallbacks")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    try:
        response = client.chat(
            model="anthropic/claude-3.5-sonnet",
            messages=[
                {"role": "user", "content": "Hello"}
            ],
            preferred_providers=["anthropic"],
            allow_fallbacks=False,  # No fallbacks!
            max_tokens=50
        )
        
        print(f"✅ Model used: {response.model}")
        print(f"✅ Response: {response.choices[0].message.content}")
    
    except Exception as e:
        print(f"❌ Error (expected if Anthropic is down): {str(e)[:100]}")


# ============================================================================
# Example 8: Require Parameter Support
# ============================================================================

def example_8_require_parameters():
    """
    Require parameter support - ใช้เฉพาะ providers ที่รองรับ parameters ทั้งหมด
    """
    print("\n" + "="*60)
    print("Example 8: Require Parameter Support (JSON Output)")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    response = client.chat(
        model="openai/gpt-4o",
        messages=[
            {"role": "user", "content": "Generate a JSON object with name and age"}
        ],
        response_format={"type": "json_object"},  # Require JSON support
        require_parameters=True,  # Only use providers that support JSON
        max_tokens=100
    )
    
    print(f"✅ Model used: {response.model}")
    print(f"✅ Response (JSON): {response.choices[0].message.content}")


# ============================================================================
# Example 9: Using Presets
# ============================================================================

def example_9_using_presets():
    """
    Using presets - ใช้ configuration ที่กำหนดไว้แล้ว
    """
    print("\n" + "="*60)
    print("Example 9: Using Presets")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY")
    )
    
    # Preset 1: High Availability
    config = get_preset_config("high_availability")
    response = client.chat(
        model="openai/gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=50,
        **config
    )
    print(f"✅ High Availability - Model used: {response.model}")
    
    # Preset 2: High Speed
    config = get_preset_config("high_speed")
    response = client.chat(
        model="google/gemini-flash-1.5",
        messages=[{"role": "user", "content": "Quick test"}],
        max_tokens=50,
        **config
    )
    print(f"✅ High Speed - Model used: {response.model}")
    
    # Preset 3: Low Cost
    config = get_preset_config("low_cost")
    response = client.chat(
        model="meta-llama/llama-3.1-70b-instruct",
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=50,
        **config
    )
    print(f"✅ Low Cost - Model used: {response.model}")
    
    # Preset 4: High Privacy
    config = get_preset_config("high_privacy")
    response = client.chat(
        model="openai/gpt-4o",
        messages=[{"role": "user", "content": "Confidential"}],
        max_tokens=50,
        **config
    )
    print(f"✅ High Privacy - Model used: {response.model}")


# ============================================================================
# Example 10: Production-Ready with Error Handling
# ============================================================================

def example_10_production_ready():
    """
    Production-ready - รวมทุกอย่างพร้อม error handling
    """
    print("\n" + "="*60)
    print("Example 10: Production-Ready with Error Handling")
    print("="*60)
    
    client = create_openrouter_client(
        api_key=os.getenv("OPENROUTER_API_KEY"),
        site_url="https://smartspec.pro",
        site_name="SmartSpec Pro"
    )
    
    def call_llm_production(
        model: str,
        messages: List[Dict[str, str]],
        task_type: str = "general"
    ) -> Dict:
        """Production-ready LLM call with full error handling"""
        
        # Task-specific configurations
        configs = {
            "code": {
                "fallback_models": [
                    "anthropic/claude-3.5-sonnet",
                    "openai/gpt-4o",
                    "google/gemini-flash-1.5"
                ],
                "sort": None,  # Use default load balancing
                "temperature": 0.3
            },
            "speed": {
                "fallback_models": [
                    "google/gemini-flash-1.5",
                    "openai/gpt-4o-mini"
                ],
                "sort": "throughput",
                "temperature": 0.7
            },
            "cost": {
                "fallback_models": [
                    "meta-llama/llama-3.1-70b-instruct",
                    "google/gemini-flash-1.5"
                ],
                "sort": "price",
                "temperature": 0.7,
                "max_price": {
                    "prompt": 0.001,
                    "completion": 0.002
                }
            }
        }
        
        config = configs.get(task_type, configs["code"])
        
        try:
            response = client.chat(
                model=model,
                messages=messages,
                fallback_models=config.get("fallback_models"),
                sort=config.get("sort"),
                max_price=config.get("max_price"),
                temperature=config.get("temperature", 0.7),
                data_collection="deny",  # Privacy by default
                max_retries=3,
                max_tokens=500
            )
            
            return {
                "success": True,
                "content": response.choices[0].message.content,
                "model_used": response.model,
                "tokens": response.usage.total_tokens if response.usage else 0,
                "finish_reason": response.choices[0].finish_reason
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    # Test 1: Code generation
    result = call_llm_production(
        model="anthropic/claude-3.5-sonnet",
        messages=[{"role": "user", "content": "Write a function to calculate factorial"}],
        task_type="code"
    )
    
    if result["success"]:
        print(f"✅ Code Task - Model: {result['model_used']}")
        print(f"   Tokens: {result['tokens']}")
        print(f"   Response: {result['content'][:100]}...")
    else:
        print(f"❌ Code Task - Error: {result['error']}")
    
    # Test 2: Speed task
    result = call_llm_production(
        model="google/gemini-flash-1.5",
        messages=[{"role": "user", "content": "Quick question: What is AI?"}],
        task_type="speed"
    )
    
    if result["success"]:
        print(f"✅ Speed Task - Model: {result['model_used']}")
        print(f"   Tokens: {result['tokens']}")
    else:
        print(f"❌ Speed Task - Error: {result['error']}")
    
    # Test 3: Cost task
    result = call_llm_production(
        model="meta-llama/llama-3.1-70b-instruct",
        messages=[{"role": "user", "content": "Hello"}],
        task_type="cost"
    )
    
    if result["success"]:
        print(f"✅ Cost Task - Model: {result['model_used']}")
        print(f"   Tokens: {result['tokens']}")
    else:
        print(f"❌ Cost Task - Error: {result['error']}")


# ============================================================================
# Main
# ============================================================================

def main():
    """Run all examples"""
    
    # Check API key
    if not os.getenv("OPENROUTER_API_KEY"):
        print("❌ Error: OPENROUTER_API_KEY not set")
        print("   Set it with: export OPENROUTER_API_KEY=sk-or-v1-your-key")
        return
    
    print("\n" + "="*60)
    print("OpenRouter Load Balancing & Fallbacks - Examples")
    print("="*60)
    
    try:
        example_1_basic_usage()
        example_2_high_availability()
        example_3_speed_optimization()
        example_4_cost_optimization()
        example_5_privacy_focused()
        example_6_provider_routing()
        example_7_disable_fallbacks()
        example_8_require_parameters()
        example_9_using_presets()
        example_10_production_ready()
        
        print("\n" + "="*60)
        print("✅ All examples completed successfully!")
        print("="*60)
    
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

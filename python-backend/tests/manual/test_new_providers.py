"""
Manual test script for OpenRouter and Z.AI providers

Usage:
    # Test OpenRouter
    export OPENROUTER_API_KEY=sk-or-v1-your-key
    python3.11 tests/manual/test_new_providers.py openrouter
    
    # Test Z.AI
    export ZAI_API_KEY=your-key
    python3.11 tests/manual/test_new_providers.py zai
    
    # Test both
    python3.11 tests/manual/test_new_providers.py all
"""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.llm_proxy.proxy import LLMProxy
from app.llm_proxy.models import LLMRequest


async def test_openrouter():
    """Test OpenRouter provider"""
    print("\n" + "="*60)
    print("Testing OpenRouter Provider")
    print("="*60)
    
    if not os.getenv("OPENROUTER_API_KEY"):
        print("❌ OPENROUTER_API_KEY not set")
        return False
    
    try:
        proxy = LLMProxy()
        
        # Check if provider is loaded
        if 'openrouter' not in proxy.providers:
            print("❌ OpenRouter provider not loaded")
            return False
        
        print(f"✅ OpenRouter provider loaded")
        print(f"   Models: {proxy.providers['openrouter'].models}")
        
        # Test 1: Simple prompt
        print("\n📝 Test 1: Simple prompt (gpt-4o-mini)")
        request = LLMRequest(
            prompt="Say 'Hello from OpenRouter!' in exactly 5 words.",
            preferred_provider="openrouter",
            preferred_model="openai/gpt-4o-mini",
            max_tokens=50,
            temperature=0.7
        )
        
        response = await proxy.invoke(request)
        print(f"✅ Response: {response.content}")
        print(f"   Tokens: {response.tokens_used}")
        print(f"   Cost: ${response.cost:.6f}")
        print(f"   Latency: {response.latency_ms}ms")
        
        # Test 2: Code generation
        print("\n📝 Test 2: Code generation (claude-3.5-sonnet)")
        request = LLMRequest(
            prompt="Write a Python function to check if a number is prime. Just the function, no explanation.",
            preferred_provider="openrouter",
            preferred_model="anthropic/claude-3.5-sonnet",
            max_tokens=200,
            temperature=0.3
        )
        
        response = await proxy.invoke(request)
        print(f"✅ Response:\n{response.content[:200]}...")
        print(f"   Tokens: {response.tokens_used}")
        print(f"   Cost: ${response.cost:.6f}")
        
        # Test 3: Fast model
        print("\n📝 Test 3: Fast model (gemini-flash-1.5)")
        request = LLMRequest(
            prompt="What is 2+2? Answer in one word.",
            preferred_provider="openrouter",
            preferred_model="google/gemini-flash-1.5",
            max_tokens=10,
            temperature=0.1
        )
        
        response = await proxy.invoke(request)
        print(f"✅ Response: {response.content}")
        print(f"   Tokens: {response.tokens_used}")
        print(f"   Cost: ${response.cost:.6f}")
        print(f"   Latency: {response.latency_ms}ms")
        
        print("\n✅ All OpenRouter tests passed!")
        return True
    
    except Exception as e:
        print(f"\n❌ OpenRouter test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_zai():
    """Test Z.AI provider"""
    print("\n" + "="*60)
    print("Testing Z.AI Provider")
    print("="*60)
    
    if not os.getenv("ZAI_API_KEY"):
        print("❌ ZAI_API_KEY not set")
        return False
    
    try:
        proxy = LLMProxy()
        
        # Check if provider is loaded
        if 'zai' not in proxy.providers:
            print("❌ Z.AI provider not loaded")
            return False
        
        print(f"✅ Z.AI provider loaded")
        print(f"   Models: {proxy.providers['zai'].models}")
        
        # Test 1: English prompt (glm-4-flash - FREE!)
        print("\n📝 Test 1: English prompt (glm-4-flash - FREE)")
        request = LLMRequest(
            prompt="Say 'Hello from Z.AI!' in exactly 5 words.",
            preferred_provider="zai",
            preferred_model="glm-4-flash",
            max_tokens=50,
            temperature=0.7
        )
        
        response = await proxy.invoke(request)
        print(f"✅ Response: {response.content}")
        print(f"   Tokens: {response.tokens_used}")
        print(f"   Cost: ${response.cost:.6f} (FREE!)")
        print(f"   Latency: {response.latency_ms}ms")
        
        # Test 2: Chinese prompt (glm-4.7)
        print("\n📝 Test 2: Chinese prompt (glm-4.7)")
        request = LLMRequest(
            prompt="用一句话介绍一下人工智能。",  # Introduce AI in one sentence
            preferred_provider="zai",
            preferred_model="glm-4.7",
            max_tokens=100,
            temperature=0.7
        )
        
        response = await proxy.invoke(request)
        print(f"✅ Response: {response.content}")
        print(f"   Tokens: {response.tokens_used}")
        print(f"   Cost: ${response.cost:.6f}")
        
        # Test 3: Code generation (glm-4.7)
        print("\n📝 Test 3: Code generation (glm-4.7)")
        request = LLMRequest(
            prompt="Write a Python function to calculate factorial. Just the function, no explanation.",
            preferred_provider="zai",
            preferred_model="glm-4.7",
            max_tokens=200,
            temperature=0.3
        )
        
        response = await proxy.invoke(request)
        print(f"✅ Response:\n{response.content[:200]}...")
        print(f"   Tokens: {response.tokens_used}")
        print(f"   Cost: ${response.cost:.6f}")
        
        print("\n✅ All Z.AI tests passed!")
        return True
    
    except Exception as e:
        print(f"\n❌ Z.AI test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Main test runner"""
    if len(sys.argv) < 2:
        print("Usage: python test_new_providers.py [openrouter|zai|all]")
        sys.exit(1)
    
    target = sys.argv[1].lower()
    
    results = []
    
    if target in ["openrouter", "all"]:
        results.append(("OpenRouter", await test_openrouter()))
    
    if target in ["zai", "all"]:
        results.append(("Z.AI", await test_zai()))
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{name}: {status}")
    
    all_passed = all(passed for _, passed in results)
    if all_passed:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

"""
Test script to query Kie.ai task IDs from dashboard
"""
import asyncio
import httpx
import json
from datetime import datetime

# Task IDs from user's screenshot
TEST_TASK_IDS = [
    "53fe2156323a5da55a12f1c13e83b4ed",  # Has red icon
    "d58964a2a4516b50d8e10ea073c10581",
    "1901bc1651c28973b3cf3cd7c90dadaf",
    "05bcc2e04562b024aeb6fa376fd92cd67",
    "37ab82e6d971559e12e0ea2100d7a747",
    "85501b4d8c4bc8057afd9b72844080e3"
]

async def test_task_id(task_id: str, api_key: str):
    """Test if task ID is valid on Kie.ai"""
    base_url = "https://api.kie.ai/api/v1"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Try recordInfo endpoint
        try:
            url = f"{base_url}/jobs/recordInfo?taskId={task_id}"
            print(f"\n{'='*80}")
            print(f"Testing task ID: {task_id}")
            print(f"URL: {url}")

            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()

            print(f"✓ SUCCESS - Status Code: {response.status_code}")
            print(f"Response keys: {list(data.keys())}")
            print(f"Full response:")
            print(json.dumps(data, indent=2, ensure_ascii=False))

            # Check for different possible field locations
            if "data" in data:
                data_obj = data["data"]
                print(f"\nData keys: {list(data_obj.keys()) if isinstance(data_obj, dict) else 'not a dict'}")
                if isinstance(data_obj, dict):
                    print(f"State: {data_obj.get('state', 'N/A')}")
                    print(f"Task ID in data: {data_obj.get('taskId', 'N/A')}")
                    print(f"Record ID in data: {data_obj.get('recordId', 'N/A')}")

            return True, data

        except httpx.HTTPStatusError as e:
            print(f"✗ HTTP ERROR - Status: {e.response.status_code}")
            print(f"Response: {e.response.text}")
            return False, None
        except Exception as e:
            print(f"✗ ERROR: {str(e)}")
            return False, None

async def main():
    # Get API key from env
    import os
    from dotenv import load_dotenv

    load_dotenv()
    api_key = os.getenv("KIE_AI_API_KEY")

    if not api_key:
        print("ERROR: KIE_AI_API_KEY not found in environment")
        return

    print(f"Testing {len(TEST_TASK_IDS)} task IDs from dashboard...")
    print(f"Timestamp: {datetime.now().isoformat()}")

    results = []
    for task_id in TEST_TASK_IDS:
        success, data = await test_task_id(task_id, api_key)
        results.append((task_id, success, data))
        await asyncio.sleep(1)  # Rate limit: 1 request/second

    print(f"\n{'='*80}")
    print("SUMMARY:")
    print(f"{'='*80}")
    for task_id, success, data in results:
        status = "✓ VALID" if success else "✗ INVALID"
        print(f"{task_id}: {status}")

if __name__ == "__main__":
    asyncio.run(main())

import os
import httpx
import json
from typing import Dict, Any, Optional

class KieAIProvider:
    def __init__(self, api_key: str, base_url: str = "https://kie.ai"): # Default base_url for Kie.ai
        self.api_key = api_key
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=self.base_url)

    async def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, files: Optional[Dict] = None) -> Dict:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        url = f"{self.base_url}/{endpoint}"

        try:
            if method == "POST":
                if files:
                    response = await self.client.post(url, headers=headers, data=data, files=files, timeout=300.0)
                else:
                    response = await self.client.post(url, headers=headers, json=data, timeout=300.0)
            elif method == "GET":
                response = await self.client.get(url, headers=headers, params=data, timeout=300.0)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            print(f"HTTP error occurred: {e.response.status_code} - {e.response.text}")
            raise
        except httpx.RequestError as e:
            print(f"An error occurred while requesting {e.request.url!r}: {e}")
            raise
        except json.JSONDecodeError:
            print(f"Failed to decode JSON from response: {response.text}")
            raise

    async def generate_image(self, model: str, prompt: str, **kwargs) -> Dict:
        # Example for Google Nano Banana Pro
        endpoint = f"api/v1/image/generate/{model}" # Assuming Kie.ai has a consistent endpoint structure
        payload = {"prompt": prompt, **kwargs}
        return await self._make_request("POST", endpoint, data=payload)

    async def generate_video(self, model: str, prompt: str, **kwargs) -> Dict:
        # Example for Veo 3.1, Sora 2, Kling 2.6
        endpoint = f"api/v1/video/generate/{model}" # Assuming Kie.ai has a consistent endpoint structure
        payload = {"prompt": prompt, **kwargs}
        return await self._make_request("POST", endpoint, data=payload)

    async def generate_audio(self, model: str, text: str, **kwargs) -> Dict:
        # Example for Elevenlabs Text to Speech, Sound Effects
        endpoint = f"api/v1/audio/generate/{model}" # Assuming Kie.ai has a consistent endpoint structure
        payload = {"text": text, **kwargs}
        return await self._make_request("POST", endpoint, data=payload)

    async def upload_reference_image(self, file_path: str) -> Dict:
        # This is a placeholder. Kie.ai API might have a specific endpoint for uploading reference images.
        # For now, we'll assume it's part of a generation request or a separate upload endpoint.
        endpoint = "api/v1/upload/image" # Hypothetical upload endpoint
        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f, "image/jpeg")}
            return await self._make_request("POST", endpoint, files=files)

# Example Usage (for testing purposes)
async def main():
    api_key = os.getenv("KIE_AI_API_KEY")
    if not api_key:
        print("KIE_AI_API_KEY environment variable not set.")
        return

    kie_ai = KieAIProvider(api_key)

    # Test Image Generation
    try:
        print("Generating image with Google Nano Banana Pro...")
        image_result = await kie_ai.generate_image("google-nano-banana-pro", "A futuristic city at sunset, cyberpunk style")
        print("Image Generation Result:", image_result)
    except Exception as e:
        print(f"Image generation failed: {e}")

    # Test Video Generation
    try:
        print("Generating video with Veo 3.1...")
        video_result = await kie_ai.generate_video("veo-3-1", "A drone shot flying over a serene forest with a river")
        print("Video Generation Result:", video_result)
    except Exception as e:
        print(f"Video generation failed: {e}")

    # Test Audio Generation
    try:
        print("Generating audio with Elevenlabs Text to Speech...")
        audio_result = await kie_ai.generate_audio("elevenlabs-tts", "Hello, this is a test audio from SmartSpecPro.")
        print("Audio Generation Result:", audio_result)
    except Exception as e:
        print(f"Audio generation failed: {e}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())

from app.llm_proxy.models import ImageGenerationRequest, VideoGenerationRequest


def test_image_generation_request_accepts_nested_extra_params_metadata():
    request = ImageGenerationRequest(
        model="google-banana-2",
        prompt="Create a product storyboard",
        extra_params={
            "resolution": "4K",
            "marketplaceContext": {
                "platform": "shopee",
                "productName": "Nordic bedside table",
            },
        },
    )

    assert request.extra_params["marketplaceContext"]["productName"] == "Nordic bedside table"


def test_video_generation_request_accepts_nested_extra_params_metadata():
    request = VideoGenerationRequest(
        model="gemini-omni-video",
        prompt="Create a product video",
        extra_params={
            "video_list": [
                {"url": "https://cdn.example.com/input.mp4", "duration": 5},
            ],
            "marketplaceContext": {
                "platform": "shopee",
                "productName": "Nordic bedside table",
            },
        },
    )

    assert request.extra_params["video_list"][0]["duration"] == 5
    assert request.extra_params["marketplaceContext"]["platform"] == "shopee"

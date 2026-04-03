import os

os.environ.setdefault("LLM_ENCRYPTION_KEY", "test-encryption-key")

from app.services.media_provider_service import normalize_media_provider_name


def test_normalize_media_provider_name_maps_wavespeed_aliases_to_canonical_key():
    assert normalize_media_provider_name("wavespeed_ai") == "wavespeed_ai"
    assert normalize_media_provider_name("wavespeed-ai") == "wavespeed_ai"
    assert normalize_media_provider_name("wavespeed ai") == "wavespeed_ai"
    assert normalize_media_provider_name("wavespeedai") == "wavespeed_ai"


def test_normalize_media_provider_name_preserves_existing_provider_aliases():
    assert normalize_media_provider_name("kie.ai") == "kie_ai"
    assert normalize_media_provider_name("byteplus-modelark") == "byteplus_modelark"

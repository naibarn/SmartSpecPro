from sqlalchemy import MetaData

from app.services.analytics_service import _metadata_mapping


def test_metadata_mapping_reads_json_mapping():
    assert _metadata_mapping({"provider": "openai", "model": "gpt-5"}) == {
        "provider": "openai",
        "model": "gpt-5",
    }


def test_metadata_mapping_rejects_sqlalchemy_metadata_object():
    # ``CreditTransaction.metadata`` resolves to Declarative Base metadata;
    # the JSONB column is intentionally exposed as ``CreditTransaction.meta``.
    assert _metadata_mapping(MetaData()) == {}
    assert _metadata_mapping(None) == {}

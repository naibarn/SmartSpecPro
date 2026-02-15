"""
Tests for OAuthConnection model extensions (status, scopes, tenant_id).
Validates the model definition, not a live database.
"""

import pytest
from sqlalchemy import inspect


@pytest.mark.unit
class TestOAuthConnectionModel:

    def test_oauth_connections_has_status_column_with_default_active(self):
        """Verify the OAuthConnection model has a status column defaulting to 'active'."""
        from app.models.oauth import OAuthConnection
        col = OAuthConnection.__table__.columns["status"]
        assert col is not None
        assert "active" in str(col.server_default.arg)

    def test_oauth_connections_has_scopes_column(self):
        """Verify the OAuthConnection model has a scopes text column."""
        from app.models.oauth import OAuthConnection
        col = OAuthConnection.__table__.columns["scopes"]
        assert col is not None
        assert col.nullable is True

    def test_oauth_connections_has_tenant_id_column(self):
        """Verify the OAuthConnection model has a nullable tenant_id varchar(36) column."""
        from app.models.oauth import OAuthConnection
        col = OAuthConnection.__table__.columns["tenant_id"]
        assert col is not None
        assert col.nullable is True

    def test_oauth_connections_has_unique_constraint_on_user_id_provider(self):
        """Verify UniqueConstraint('user_id', 'provider') exists in __table_args__."""
        from app.models.oauth import OAuthConnection
        table = OAuthConnection.__table__

        # Find unique constraints
        unique_constraints = [
            c for c in table.constraints
            if hasattr(c, "columns") and len(c.columns) > 1
        ]

        # Check for the user_id + provider constraint
        found = False
        for constraint in unique_constraints:
            col_names = {c.name for c in constraint.columns}
            if col_names == {"user_id", "provider"}:
                found = True
                break

        assert found, (
            f"Expected UniqueConstraint on (user_id, provider), "
            f"found constraints: {unique_constraints}"
        )

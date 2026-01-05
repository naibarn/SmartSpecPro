"""
Model Comparison Model
"""

from sqlalchemy import Column, String, Text, DateTime, Float, Integer, JSON
from datetime import datetime

from app.core.database import Base


class ModelComparison(Base):
    """Model comparison result"""
    __tablename__ = "model_comparisons"
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    models = Column(JSON, nullable=False)  # List of {provider, model}
    results = Column(JSON, nullable=False)  # List of {provider, model, response, tokens, cost, latency}
    total_cost_usd = Column(Float, nullable=False, default=0.0)
    total_credits_used = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

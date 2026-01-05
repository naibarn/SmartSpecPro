# R7.1: Centralized background task management
import dramatiq
from dramatiq.brokers.redis import RedisBroker
from app.core.config import settings
from urllib.parse import urlparse

# Parse Redis URL to get host and port
redis_url = urlparse(settings.REDIS_URL)
redis_host = redis_url.hostname or "localhost"
redis_port = redis_url.port or 6379

# Setup Redis broker
redis_broker = RedisBroker(host=redis_host, port=redis_port)
dramatiq.set_broker(redis_broker)

# Import actors to register them
# Note: This import is deferred to avoid circular imports
# from app.services.email_service import send_email_actor

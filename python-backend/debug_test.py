
import sys
import os
import traceback

# Add current directory to path
sys.path.insert(0, os.getcwd())

print("--- Attempting to import RateLimitService ---")
try:
    from app.services.rate_limit_service import RateLimitService, RateLimit
    print("SUCCESS: RateLimitService imported")
except Exception:
    print("FAILED: RateLimitService import error")
    traceback.print_exc()

print("\n--- Attempting to import test_rate_limit_service ---")
try:
    # Use standard library importlib to simulate pytest collection
    import importlib.util
    test_path = "tests/unit/test_rate_limit_service.py"
    spec = importlib.util.spec_from_file_location("test_rate_limit_service", test_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    print("SUCCESS: test_rate_limit_service collected")
except Exception:
    print("FAILED: test_rate_limit_service collection error")
    traceback.print_exc()

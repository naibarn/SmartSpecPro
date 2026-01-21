-- SmartSpecPro PostgreSQL Initialization Script
-- This script runs once when the database is first created

-- The database 'smartspec' is already created by POSTGRES_DB env var
-- This file can be used for additional initial setup if needed

-- Example: Create extensions if needed
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: Alembic migrations handle the actual schema
SELECT 'PostgreSQL initialized for SmartSpecPro' AS status;

-- IT Guy Solutions - Database Optimization Script
-- Goal: Improve performance for large datasets and ensure integrity

-- 1. Optimize Collections Table
-- Use a composite index for common queries (name + id)
ALTER TABLE collections ADD INDEX idx_name_id (name, id);
-- Use an index for sorting by date (name + updatedAt)
ALTER TABLE collections ADD INDEX idx_name_updated (name, updatedAt);

-- 2. Optimize Users Table
ALTER TABLE users ADD INDEX idx_email (email);
ALTER TABLE users ADD INDEX idx_username (username);
ALTER TABLE users ADD INDEX idx_role (role);

-- 3. Integrity Constraints (MySQL specific)
-- Ensure id is unique within a collection name
-- We can't easily add a unique constraint on (name, id) if 'id' is already PK 
-- but 'id' being PK already ensures global uniqueness if generated correctly.
-- If they want to allow same ID in different collections, id shouldn't be PK alone.
-- However, given the current app code, autoids are prefixed with 'user-', 'job-', etc.
-- so clashes are unlikely.

-- 4. Clean up invalid records (if any)
-- DELETE FROM collections WHERE data IS NULL OR data = '';

-- 5. Set appropriate character set for production
ALTER TABLE collections CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ANALYZE TABLE collections;
ANALYZE TABLE users;

-- IT Guy Solutions - Database Setup
-- Run these commands as root/admin on your MySQL server

-- 1. Create the Database
CREATE DATABASE IF NOT EXISTS itguy_prod;

-- 2. Create the User with the generated password
CREATE USER IF NOT EXISTS 'itguy_admin'@'localhost' IDENTIFIED BY 'a5ed594eb62a4b4a';

-- 3. Grant Permissions
GRANT ALL PRIVILEGES ON itguy_prod.* TO 'itguy_admin'@'localhost';

-- 4. Apply Changes
FLUSH PRIVILEGES;

-- Now use the itguy_prod database and run mysql-setup.sql
USE itguy_prod;
-- SOURCE mysql-setup.sql;

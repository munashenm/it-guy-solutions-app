-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    username VARCHAR(255),
    firstName VARCHAR(255),
    lastName VARCHAR(255),
    employeeId VARCHAR(255),
    phone VARCHAR(255),
    role VARCHAR(255),
    password VARCHAR(255),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create Collections table (Generic storage for JSON data)
CREATE TABLE IF NOT EXISTS collections (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    data LONGTEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (name)
);

-- Initial Admin Seed
INSERT IGNORE INTO users (uid, email, username, firstName, lastName, employeeId, role, password) 
VALUES ('admin-123', 'admin@itguy.co.za', 'admin', 'System', 'Admin', 'EMP-001', 'admin', 'admin123');

-- Insert Admin to Collections Mirror
INSERT IGNORE INTO collections (id, name, data, updatedAt) 
VALUES ('admin-123', 'users', '{"uid":"admin-123","email":"admin@itguy.co.za","username":"admin","firstName":"System","lastName":"Admin","employeeId":"EMP-001","role":"admin"}', CURRENT_TIMESTAMP);

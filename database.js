const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Hardened .env loading
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
} else {
    require('dotenv').config();
}


/**
 * Database Abstraction for IT Guy Solutions
 * Supports both SQLite (Local) and MySQL (Prod)
 */
class Database {
    constructor() {
        this.type = process.env.DB_TYPE || 'sqlite';
        this.connection = null;
        this.ready = false;
        this._initPromise = null;
    }

    async init() {
        if (this.ready) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._connectAndPrepare();
        try {
            await this._initPromise;
            this.ready = true;
        } catch (err) {
            this._initPromise = null;
            throw err;
        }
    }

    async _connectAndPrepare() {
        if (this.type === 'mysql') {
            console.log("DB: Initializing MySQL Connection Pool...");
            this.pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000
            });
            
            // Re-connection Heartbeat (every 30s)
            setInterval(async () => {
                try {
                    const [rows] = await this.pool.execute('SELECT 1');
                } catch(e) {
                    console.error("DB: MySQL Heartbeat failed, pool will auto-reconnect on next query.");
                }
            }, 30000);

            try {
                const connection = await this.pool.getConnection();
                await connection.query('SELECT 1');
                connection.release();
                console.log("DB: MySQL Ready and Connected.");
            } catch (err) {
                console.error("DB: MySQL Connection Warning during init:", err.message);
            }
            await this.ensureSchema();
        } else {
            console.log("DB: Initializing Stable SQLite Mode...");
            let sqlite3;
            try {
                sqlite3 = require('sqlite3').verbose();
            } catch (e) {
                throw new Error("SQLite library (sqlite3) is missing. If you are using MySQL, set DB_TYPE=mysql in your .env file.");
            }
            const dbPath = path.resolve(__dirname, 'database.sqlite');
            await new Promise((resolve, reject) => {
                this.sqlite = new sqlite3.Database(dbPath, (err) => {
                    if (err) {
                        console.error("DB: SQLite Connection Error:", err.message);
                        reject(err);
                    } else {
                        console.log(`DB: SQLite Connection Successful at ${dbPath}`);
                        resolve();
                    }
                });
            });
            await this.run('PRAGMA busy_timeout = 5000');
            try { await this.run('PRAGMA journal_mode = WAL'); } catch (e) {}
            await this.ensureSchema();
        }
    }

    async ensureSchema() {
        const isMySQL = this.type === 'mysql';
        const userSchema = isMySQL ?
            `CREATE TABLE IF NOT EXISTS users (
                uid VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255),
                username VARCHAR(255),
                firstName VARCHAR(255),
                lastName VARCHAR(255),
                employeeId VARCHAR(255),
                phone VARCHAR(255),
                role VARCHAR(255),
                password VARCHAR(255),
                sessionToken VARCHAR(512),
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )` :
            `CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                email TEXT,
                username TEXT,
                firstName TEXT,
                lastName TEXT,
                employeeId TEXT,
                phone TEXT,
                role TEXT,
                password TEXT,
                sessionToken TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.run(userSchema);

        const collSchema = isMySQL ?
            `CREATE TABLE IF NOT EXISTS collections (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                data LONGTEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )` :
            `CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT,
                data TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
        await this.run(collSchema);

        const extraCols = [
            ['username', isMySQL ? 'VARCHAR(255)' : 'TEXT'],
            ['firstName', isMySQL ? 'VARCHAR(255)' : 'TEXT'],
            ['lastName', isMySQL ? 'VARCHAR(255)' : 'TEXT'],
            ['employeeId', isMySQL ? 'VARCHAR(255)' : 'TEXT'],
            ['phone', isMySQL ? 'VARCHAR(255)' : 'TEXT'],
            ['sessionToken', isMySQL ? 'VARCHAR(512)' : 'TEXT']
        ];
        for (const [col, type] of extraCols) {
            try {
                await this.run(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
            } catch (e) { /* column already exists */ }
        }

        try {
            if (isMySQL) {
                await this.run('CREATE INDEX idx_collections_name ON collections (name)');
            } else {
                await this.run('CREATE INDEX IF NOT EXISTS idx_collections_name ON collections (name)');
            }
        } catch (e) { /* index already exists */ }

        await this.seedDefaultAdmin();
        await this.seedDefaultSettings();
    }

    async seedDefaultSettings() {
        const defaults = [
            ['companyProfile', { companyName: 'IT Guy Solutions', website: 'https://itguysa.co.za' }],
            ['systemSettings', { enablePOS: true }],
            ['documentSettings', {}]
        ];
        for (const [id, data] of defaults) {
            try {
                const row = await this.get("SELECT id FROM collections WHERE name = 'settings' AND id = ?", [id]);
                if (row) continue;
                const jsonData = JSON.stringify(data);
                if (this.type === 'mysql') {
                    await this.run(
                        `INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'settings', ?, CURRENT_TIMESTAMP)
                         ON DUPLICATE KEY UPDATE updatedAt = updatedAt`,
                        [id, jsonData]
                    );
                } else {
                    await this.run(
                        `INSERT OR IGNORE INTO collections (id, name, data, updatedAt) VALUES (?, 'settings', ?, CURRENT_TIMESTAMP)`,
                        [id, jsonData]
                    );
                }
            } catch (e) {
                console.warn('DB: settings seed skipped', id, e.message);
            }
        }
    }

    async seedDefaultAdmin() {
        try {
            const existing = await this.get("SELECT uid FROM users LIMIT 1");
            if (existing) return;

            console.log("DB: Seeding default admin user (admin / admin123)...");
            const hashedPassword = await bcrypt.hash('admin123', 12);
            const admin = {
                uid: 'admin-123',
                email: 'admin@itguy.co.za',
                username: 'admin',
                firstName: 'System',
                lastName: 'Admin',
                employeeId: 'EMP-001',
                role: 'admin'
            };
            await this.run(
                "INSERT INTO users (uid, email, username, firstName, lastName, employeeId, role, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [admin.uid, admin.email, admin.username, admin.firstName, admin.lastName, admin.employeeId, admin.role, hashedPassword]
            );
            const jsonData = JSON.stringify(admin);
            if (this.type === 'mysql') {
                await this.run(
                    `INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)
                     ON DUPLICATE KEY UPDATE data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`,
                    [admin.uid, jsonData]
                );
            } else {
                await this.run(
                    `INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)`,
                    [admin.uid, jsonData]
                );
            }
        } catch (err) {
            console.error("DB: Admin seed skipped:", err.message);
        }
    }

    async _ensureReady() {
        if (this.ready) return;
        if (this._initPromise) {
            await this._initPromise;
            return;
        }
        await this.init();
    }

    // Generic Run (Insert/Update/Delete)
    async run(sql, params = []) {
        await this._ensureReady();
        // SQLite 'INSERT OR REPLACE' isn't standard in MySQL
        // We handle the bridge in server.js but here we execute
        if (this.type === 'mysql') {
            const [result] = await this.pool.execute(sql, params);
            return result;
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            });
        }
    }

    // Generic Get (Single Row)
    async get(sql, params = []) {
        await this._ensureReady();
        if (this.type === 'mysql') {
            const [rows] = await this.pool.execute(sql, params);
            return rows[0] || null;
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    }

    // Generic All (Multiple Rows)
    async all(sql, params = []) {
        await this._ensureReady();
        if (this.type === 'mysql') {
            const [rows] = await this.pool.execute(sql, params);
            return rows;
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    }

    // Helper for Transactions
    async beginTransaction() {
        if (this.type === 'mysql') {
            const connection = await this.pool.getConnection();
            try {
                await connection.beginTransaction();
                return connection;
            } catch (err) {
                if (connection) connection.release();
                throw err;
            }
        }
        return null; // SQLite handles it differently or we use serial mode
    }

    async serialize(fn) {
        if (this.type === 'mysql') {
            const connection = await this.pool.getConnection();
            try {
                await connection.beginTransaction();
                await fn(connection);
                await connection.commit();
            } catch (e) {
                await connection.rollback();
                throw e;
            } finally {
                connection.release();
            }
        } else {
            return new Promise((resolve, reject) => {
                this.sqlite.serialize(async () => {
                    try {
                        await fn(this.sqlite);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        }
    }

    // Utility for Batch updates
    async beginBatch() {
        if (this.type === 'mysql') {
            const conn = await this.pool.getConnection();
            await conn.beginTransaction();
            return conn;
        } else {
            await this.run("BEGIN TRANSACTION");
            return this.sqlite;
        }
    }

    async commitBatch(conn) {
        if (this.type === 'mysql') {
            await conn.commit();
            conn.release();
        } else {
            await this.run("COMMIT");
        }
    }

    async rollbackBatch(conn) {
        if (this.type === 'mysql') {
            await conn.rollback();
            conn.release();
        } else {
            await this.run("ROLLBACK");
        }
    }

    async close() {
        this.ready = false;
        this._initPromise = null;
        if (this.type === 'mysql') {
            await this.pool.end();
        } else if (this.sqlite) {
            return new Promise((resolve, reject) => {
                this.sqlite.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }
}

module.exports = new Database();

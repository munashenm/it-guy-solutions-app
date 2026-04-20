const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

/**
 * Database Abstraction for IT Guy Solutions
 * Supports both SQLite (Local) and MySQL (Prod)
 */
class Database {
    constructor() {
        this.type = process.env.DB_TYPE || 'sqlite';
        this.connection = null;
    }

    async init() {
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
        } else {
            console.log("DB: Initializing Stable SQLite Mode...");
            const dbPath = path.resolve(__dirname, 'database.sqlite');
            this.sqlite = new sqlite3.Database(dbPath, (err) => {
                if (err) console.error("DB: SQLite Connection Error:", err.message);
                else console.log(`DB: SQLite Connection Successful at ${dbPath}`);
            });
        }
    }

    // Generic Run (Insert/Update/Delete)
    async run(sql, params = []) {
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

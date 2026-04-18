const express = require('express');
const db = require('./database');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');

const uploadDir = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
    console.error('Could not create uploads directory:', uploadDir, e.message);
}
const upload = multer({ dest: uploadDir });
const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.resolve(__dirname, 'database.sqlite');

app.set('trust proxy', 1);
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Heartbeat status for production diagnostics
app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        timestamp: new Date().toISOString(),
        dbType: process.env.DB_TYPE || 'sqlite',
        message: "IT Guy Backend is reachable and healthy."
    });
});

// Image Proxy to bypass CORS for PDF generation
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL is required");
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        res.set('Content-Type', contentType);
        res.send(response.data);
    } catch (e) {
        console.error("Proxy error:", e.message);
        res.status(500).send("Error proxying image");
    }
});

// Static files are registered after all /api routes (below) so a stray "api" folder
// or mis-served path cannot shadow API handlers.

// Structured Logging Helper
// Structured Logging Helper
const logger = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...meta };
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, Object.keys(meta).length ? meta : '');
};

// Automated Daily Backups
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

function automatedDailyBackup() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const backupFile = path.join(backupDir, `db_backup_${today}.sqlite`);
        
        // Prevent duplicate backups on the same day if the server restarts multiple times
        if (!fs.existsSync(backupFile)) {
            if (fs.existsSync(dbPath)) {
                fs.copyFileSync(dbPath, backupFile);
                logger('info', `Automated daily backup created successfully at ${backupFile}`);
            }
        }
        
        // Cleanup backups older than 7 days
        const files = fs.readdirSync(backupDir);
        files.forEach(file => {
            if(file.endsWith('.sqlite')) {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                const daysOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                if(daysOld > 7) {
                    fs.unlinkSync(filePath);
                    logger('info', `Deleted old automated backup: ${file}`);
                }
            }
        });
    } catch(e) {
        logger('error', 'Automated backup failed', { error: e.message });
    }
}
// Run immediately on server start, and then every 12 hours
automatedDailyBackup();
setInterval(automatedDailyBackup, 12 * 60 * 60 * 1000);


// Safe JSON Parsing Utility
const safeJsonParse = (str, fallback = {}, context = '') => {
    try {
        if (!str || str.trim() === '') return fallback;
        return JSON.parse(str);
    } catch (e) {
        logger('error', `JSON Parse Failed: ${context}`, { error: e.message, rawLength: str?.length });
        return { ...fallback, _parseError: true };
    }
};

// Database Initialization
db.init().then(async () => {
    logger('info', 'Database System Ready', { 
        type: process.env.DB_TYPE || 'sqlite',
        port: port, // Hardcoded 3000 for Apache Proxy compatibility
        nodeEnv: process.env.NODE_ENV || 'production'
    });
    
    const dbType = process.env.DB_TYPE || 'sqlite';
    const isMySQL = dbType === 'mysql';

    try {
        // 1. Create Users Table
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
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
        await db.run(userSchema);

        // 2. Add columns if missing (mostly for schema evolution)
        const columnsToAdd = ['username', 'firstName', 'lastName', 'employeeId', 'sessionToken'];
        for (const col of columnsToAdd) {
            try {
                await db.run(`ALTER TABLE users ADD COLUMN ${col} ${isMySQL ? 'VARCHAR(255)' : 'TEXT'}`);
            } catch (e) { /* ignore error - already exists */ }
        }

        // 3. Create Collections Table
        const collSchema = isMySQL ?
            `CREATE TABLE IF NOT EXISTS collections (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                data LONGTEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (name)
            )` :
            `CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT,
                data TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
        await db.run(collSchema);

        // 4. Seed Admin if missing
        const row = await db.get("SELECT * FROM users WHERE email = 'admin@techguy.pl' OR username = 'admin'");
        if (!row) {
            logger('info', 'Seeding default admin user...');
            const admin = { uid: 'admin-123', email: 'admin@techguy.pl', username: 'admin', firstName: 'System', lastName: 'Admin', employeeId: 'EMP-001', role: 'admin' };
            await db.run("INSERT INTO users (uid, email, username, firstName, lastName, employeeId, role, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                [admin.uid, admin.email, admin.username, admin.firstName, admin.lastName, admin.employeeId, admin.role, 'admin123']);
            const jsonData = JSON.stringify(admin);
            if (isMySQL) {
                await db.run(`INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP) 
                             ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data)`, [admin.uid, jsonData]);
            } else {
                await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)`, [admin.uid, jsonData]);
            }
        }
    } catch (err) {
        logger('error', 'Database Setup Error', { error: err.message });
    }

}).catch(err => {
    logger('critical', 'Critical Database Error', { error: err.message });
});

// Helper to handle generic collection storage
const saveDoc = async (collectionName, id, data) => {
    const jsonData = JSON.stringify(data);
    const type = process.env.DB_TYPE || 'sqlite';
    if(type === 'mysql') {
        const sql = `INSERT INTO collections (id, name, data, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
                     ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`;
        return db.run(sql, [id, collectionName, jsonData]);
    } else {
        const sql = `INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
        return db.run(sql, [id, collectionName, jsonData]);
    }
};

const getCollection = async (name) => {
    try {
        const rows = await db.all(`SELECT id, data FROM collections WHERE name = ?`, [name]);
        return rows.map(r => ({ 
            id: r.id, 
            ...safeJsonParse(r.data, {}, `Collection: ${name}, ID: ${r.id}`) 
        })).filter(item => !item._parseError); // Optional: filter out completely broken ones or keep them.
    } catch (err) {
        logger('error', `Failed to fetch collection: ${name}`, { error: err.message });
        throw err;
    }
};

// Authentication
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const row = await db.get("SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?", [email, email, password]);
        if (row) {
            const token = 'token-' + Math.random().toString(36).substr(2) + Date.now().toString(36);
            await db.run("UPDATE users SET sessionToken = ? WHERE uid = ?", [token, row.uid]);
            const { password, sessionToken, ...user } = row;
            res.json({ user, token });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware to enforce API security
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    const token = authHeader.split(' ')[1];
    try {
        const row = await db.get("SELECT * FROM users WHERE sessionToken = ?", [token]);
        if (!row) return res.status(401).json({ error: "Session expired or invalid" });
        req.user = row;
        next();
    } catch (err) {
        res.status(500).json({ error: "Database error verifying session" });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else res.status(403).json({ error: "Forbidden. Admin access required." });
};

// Apply auth middleware to all secure routes
app.use(['/api/users', '/api/collections', '/api/transaction', '/api/counters', '/api/restore', '/api/backup', '/api/notify'], requireAuth);

// User Registration Endpoint (Bypasses Firebase Auth)
app.post('/api/users', async (req, res) => {
    const { email, password, role, username, firstName, lastName, employeeId } = req.body;
    if(!email || !password || !role) return res.status(400).json({ error: "Missing required fields" });
    
    // Generate a unique ID
    const uid = 'user-' + Math.random().toString(36).substring(2, 12);
    
    try {
        await db.run("INSERT INTO users (uid, email, username, firstName, lastName, employeeId, role, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
            [uid, email, username||'', firstName||'', lastName||'', employeeId||'', role, password]);
        
        const userData = { uid, email, username: username||'', firstName: firstName||'', lastName: lastName||'', employeeId: employeeId||'', role, createdAt: new Date().toISOString() };
        await saveDoc('users', uid, userData);
        res.json({ success: true, user: userData });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/password', async (req, res) => {
    const { uid, oldPassword, newPassword } = req.body;
    if(!uid || !oldPassword || !newPassword) return res.status(400).json({ error: "Missing required fields" });

    try {
        const row = await db.get("SELECT * FROM users WHERE uid = ? AND password = ?", [uid, oldPassword]);
        if(!row) return res.status(401).json({ error: "Incorrect current password" });

        await db.run("UPDATE users SET password = ? WHERE uid = ?", [newPassword, uid]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin forced password change
app.post('/api/users/admin-password', async (req, res) => {
    const { uid, newPassword } = req.body;
    if(!uid || !newPassword) return res.status(400).json({ error: "Missing required fields" });

    try {
        await db.run("UPDATE users SET password = ? WHERE uid = ?", [newPassword, uid]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user profile
app.put('/api/users/:uid', async (req, res) => {
    const { uid } = req.params;
    const { email, username, firstName, lastName, employeeId, phone, role } = req.body;
    
    try {
        await db.run(`UPDATE users SET 
                email = ?, username = ?, firstName = ?, lastName = ?, 
                employeeId = ?, phone = ?, role = ?
                WHERE uid = ?`, 
                [email, username, firstName, lastName, employeeId, phone, role, uid]);
        
        const userData = { uid, email, username, firstName, lastName, employeeId, phone, role, updatedAt: new Date().toISOString() };
        await saveDoc('users', uid, userData);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user
app.delete('/api/users/:uid', async (req, res) => {
    const { uid } = req.params;
    const dbType = process.env.DB_TYPE || 'sqlite';
    try {
        if (dbType === 'mysql') {
            await db.run("DELETE FROM users WHERE uid = ?", [uid]);
            await db.run("DELETE FROM collections WHERE name = 'users' AND id = ?", [uid]);
        } else {
            await db.serialize(async () => {
                await db.run("DELETE FROM users WHERE uid = ?", [uid]);
                await db.run("DELETE FROM collections WHERE name = 'users' AND id = ?", [uid]);
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generic Collection CRUD
app.get('/api/collections/:name', async (req, res) => {
    try {
        const data = await getCollection(req.params.name);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/collections/:name/:id', async (req, res) => {
    try {
        await saveDoc(req.params.name, req.params.id, req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/collections/:name/:id', async (req, res) => {
    try {
        await db.run(`DELETE FROM collections WHERE name = ? AND id = ?`, [req.params.name, req.params.id]);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Transaction helper for inventory decrement etc.
app.post('/api/transaction/batch', async (req, res) => {
    const { updates } = req.body;
    const type = process.env.DB_TYPE || 'sqlite';
    let tx = null;
    try {
        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'Invalid batch: request body must include an updates array' });
        }
        tx = await db.beginBatch();
        for (const u of updates) {
            if (!u || typeof u.coll !== 'string' || typeof u.id !== 'string') {
                throw new Error('Invalid batch item: missing coll or id');
            }
            let jsonData;
            try {
                jsonData = u.data === undefined ? '{}' : JSON.stringify(u.data);
            } catch (stringifyErr) {
                throw new Error(`Cannot serialize batch item ${u.coll}/${u.id}: ${stringifyErr.message}`);
            }
            if (type === 'mysql') {
                const sql = `INSERT INTO collections (id, name, data, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
                             ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`;
                await tx.execute(sql, [u.id, u.coll, jsonData]);
            } else {
                await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                    [u.id, u.coll, jsonData]);
            }
        }
        await db.commitBatch(tx);
        res.json({ success: true });
    } catch (err) {
        console.error("Batch Transaction Failure:", err);
        try {
            if (type === 'mysql' && tx) {
                await db.rollbackBatch(tx);
            } else if (type === 'sqlite' && tx) {
                await db.run("ROLLBACK");
            }
        } catch (rollbackErr) {
            console.error("Batch rollback failed:", rollbackErr);
        }
        res.status(500).json({ error: err.message });
    }
});

// Counters for sequence IDs
app.post('/api/counters/:prefix', async (req, res) => {
    const { prefix } = req.params;
    const type = process.env.DB_TYPE || 'sqlite';
    try {
        const row = await db.get("SELECT data FROM collections WHERE id = 'counters' AND name = 'settings'");
        let counters = row ? safeJsonParse(row.data, {}, 'Settings: Counters') : {};
        const newVal = (counters[prefix] || 1000) + 1;
        counters[prefix] = newVal;
        const jsonData = JSON.stringify(counters);
        
        if (type === 'mysql') {
            await db.run(`INSERT INTO collections (id, name, data, updatedAt) VALUES ('counters', 'settings', ?, CURRENT_TIMESTAMP)
                   ON DUPLICATE KEY UPDATE data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`, [jsonData]);
        } else {
            await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES ('counters', 'settings', ?, CURRENT_TIMESTAMP)`,
                   [jsonData]);
        }
        res.json({ newId: prefix + "-" + String(newVal).padStart(4, '0') });
    } catch (err) {
        logger('error', `Counter Error for ${prefix}`, { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// Restore endpoint
app.post('/api/restore', upload.single('database'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    if(process.env.DB_TYPE === 'mysql') return res.status(400).json({ error: "Restore is only supported for SQLite mode." });

    console.log("Restoring database from:", req.file.path);

    try {
        // We can't easily swap the file while it's open, but we attempt a direct copy if possible or suggest restart
        // In local environments, we usually stop the connection
        if (db.sqlite && typeof db.sqlite.close === 'function') {
            await new Promise((resolve, reject) => {
                db.sqlite.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Backup current before overwrite
        if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dbPath + '.bak');
        // Overwrite with uploaded file
        fs.copyFileSync(req.file.path, dbPath);
        // Clean up temp upload
        fs.unlinkSync(req.file.path);

        // Re-initialize the database connection
        await db.init();
        
        console.log("Restore complete and server re-connected.");
        res.json({ success: true, message: "Database restored successfully. Please refresh the portal." });
    } catch (e) {
        console.error("Restore failed:", e);
        res.status(500).json({ error: "File system error during restore: " + e.message });
    }
});

// Notifications endpoint (Email/WhatsApp)
app.post('/api/notify', async (req, res) => {
    try {
        const { actionType, docType, docId, contactInfo, pdfBase64, dataObj } = req.body;
        
        // Load settings from local database
        const rows = await db.all("SELECT data FROM collections WHERE name = ? AND id = ?", ['settings', 'systemSettings']);
        if (!rows || rows.length === 0) throw new Error("System settings not found. Cannot send notifications.");
        const sysSettings = JSON.parse(rows[0].data);

        if (actionType === 'Email') {
            if(!sysSettings.smtpHost) throw new Error("SMTP is not configured in settings.");
            
            const transporter = nodemailer.createTransport({
                host: sysSettings.smtpHost,
                port: parseInt(sysSettings.smtpPort) || 465,
                secure: sysSettings.smtpPort == '465', 
                auth: {
                    user: sysSettings.smtpUser,
                    pass: sysSettings.smtpPass
                }
            });

            // Create attachments array
            const attachments = [];
            if (pdfBase64) {
                attachments.push({
                    filename: `${docType}_${docId}.pdf`,
                    content: pdfBase64,
                    encoding: 'base64'
                });
            }

            const subject = `${docType} - ${docId} from ${sysSettings.emailName || 'IT Guy Solutions'}`;
            const amountMsg = dataObj && dataObj.amount ? `\n\nTotal Amount: R ${dataObj.amount.toFixed(2)}` : '';
            const textContent = `Hi,\n\nPlease find attached the ${docType} (${docId}) regarding your recent service.${amountMsg}\n\nKind Regards,\n${sysSettings.emailName || 'IT Guy Solutions'}`;

            await transporter.sendMail({
                from: `"${sysSettings.emailName || 'IT Guy Solutions'}" <${sysSettings.smtpUser}>`,
                replyTo: sysSettings.emailReply,
                to: contactInfo,
                subject: subject,
                text: textContent,
                attachments: attachments
            });

            logger('info', `Automated Email Sent via API: ${docType} ${docId} to ${contactInfo}`);
            return res.json({ success: true, message: `Email delivered to ${contactInfo}` });
        } 
        else if (actionType === 'WhatsApp') {
            if(!sysSettings.waToken || !sysSettings.waPhoneId) throw new Error("WhatsApp API token/PhoneID is not configured in settings.");
            
            let cleanedPhone = contactInfo.replace(/\D/g, '');
            if(cleanedPhone.startsWith('0')) cleanedPhone = '27' + cleanedPhone.substring(1); 
            
            const amountMsg = dataObj && dataObj.amount ? ` Total: R ${dataObj.amount.toFixed(2)}` : '';
            const textContent = `Hi from ${sysSettings.emailName || 'IT Guy Solutions'}. Your ${docType} (${docId}) has been processed.${amountMsg}. Check your email to download the PDF.`;

            await axios.post(
                `https://graph.facebook.com/v18.0/${sysSettings.waPhoneId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: cleanedPhone,
                    type: 'text',
                    text: { body: textContent }
                },
                {
                    headers: {
                        "Authorization": `Bearer ${sysSettings.waToken}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            logger('info', `Automated WhatsApp Sent via API: ${docType} ${docId} to ${cleanedPhone}`);
            return res.json({ success: true, message: `WhatsApp sent to ${cleanedPhone}` });
        }
        else {
            return res.status(400).json({ error: "Invalid actionType" });
        }

    } catch(err) {
        logger('error', `Notification Failed: ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
});

// Backup endpoint
app.get('/api/backup', (req, res) => {
    logger('info', 'Database backup requested');
    res.download(dbPath, `it-guy-backup-${new Date().toISOString().split('T')[0]}.sqlite`);
});

// Catch-All for missing API routes to prevent HTML fall-through
app.all('/api/*', (req, res) => {
    res.status(404).json({ 
        error: "Not Found", 
        message: `The requested API endpoint ${req.method} ${req.path} does not exist.` 
    });
});

// Frontend (after API so /api/* always hits Express handlers first)
app.use(express.static(path.join(__dirname, '..')));

// Global Error Handler
app.use((err, req, res, next) => {
    logger('error', 'Unhandled Exception', { 
        error: err.message, 
        stack: err.stack,
        path: req.path,
        method: req.method 
    });
    
    // Explicitly set content-type to JSON
    res.setHeader('Content-Type', 'application/json');
    res.status(err.status || 500).json({ 
        error: "Internal Server Error", 
        message: err.message || "An unexpected error occurred. Please contact Support." 
    });
});

if (typeof PhusionPassenger !== 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
    app.listen('passenger', () => {
        console.log('IT Guy Server running under Phusion Passenger');
    });
} else {
    app.listen(port, () => {
        console.log(`IT Guy Local Server running at http://localhost:${port}`);
    });
}

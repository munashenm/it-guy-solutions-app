const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || 'it-guy-secret-key-2024';

router.post('/login', async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const row = await db.get("SELECT * FROM users WHERE email = ? OR username = ?", [email, email]);
        
        if (row) {
            let isValid = false;
            let needsMigration = false;

            if (row.password && row.password.startsWith('$2a$')) {
                isValid = await bcrypt.compare(password, row.password);
            } else {
                isValid = (row.password === password);
                if (isValid) needsMigration = true;
            }

            if (isValid) {
                const token = jwt.sign(
                    { uid: row.uid, email: row.email, role: row.role },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                
                if (needsMigration) {
                    const hashedPassword = await bcrypt.hash(password, 12);
                    await db.run("UPDATE users SET sessionToken = ?, password = ? WHERE uid = ?", [token, hashedPassword, row.uid]);
                    logger.info(`Migrated user ${email} to Bcrypt hashing.`);
                } else {
                    await db.run("UPDATE users SET sessionToken = ? WHERE uid = ?", [token, row.uid]);
                }

                const { password: _p, ...user } = row;
                res.json({ user, token });
            } else {
                res.status(401).json({ error: "Invalid credentials" });
            }
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch(err) {
        next(err);
    }
});

router.post('/register', async (req, res, next) => {
    const { email, password, firstName, lastName, phone } = req.body;
    if(!email || !password) return res.status(400).json({ error: "Email and Password are required" });
    
    try {
        const existing = await db.get("SELECT * FROM users WHERE email = ?", [email]);
        if(existing) return res.status(400).json({ error: "An account with this email already exists." });

        const uid = 'user-' + Math.random().toString(36).substring(2, 12);
        const hashedPassword = await bcrypt.hash(password, 12);
        const role = 'client'; 
        await db.run("INSERT INTO users (uid, email, firstName, lastName, phone, role, password) VALUES (?, ?, ?, ?, ?, ?, ?)", 
            [uid, email, firstName||'', lastName||'', phone||'', role, hashedPassword]);
        
        const userData = { uid, email, firstName: firstName||'', lastName: lastName||'', phone: phone||'', role, createdAt: new Date().toISOString() };
        
        // Use JSON.stringify for collections table
        const jsonData = JSON.stringify(userData);
        if(process.env.DB_TYPE === 'mysql') {
            await db.run(`INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP) 
                         ON DUPLICATE KEY UPDATE data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`, [uid, jsonData]);
        } else {
            await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)`, [uid, jsonData]);
        }

        res.json({ success: true, user: userData });
    } catch(err) {
        next(err);
    }
});

router.post('/forgot-password', async (req, res, next) => {
    const { email } = req.body;
    try {
        const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
        if(!user) return res.status(404).json({ error: "No user found." });

        const tempPass = Math.random().toString(36).substring(2, 8).toUpperCase();
        const hashedPassword = await bcrypt.hash(tempPass, 12);
        await db.run("UPDATE users SET password = ? WHERE uid = ?", [hashedPassword, user.uid]);

        const rows = await db.all("SELECT data FROM collections WHERE name = ? AND id = ?", ['settings', 'systemSettings']);
        if (rows && rows.length > 0) {
            const sys = JSON.parse(rows[0].data);
            if(sys.smtpHost) {
                const transporter = nodemailer.createTransport({
                    host: String(sys.smtpHost).trim(),
                    port: parseInt(sys.smtpPort) || 465,
                    secure: String(sys.smtpPort).trim() === '465', 
                    auth: { user: String(sys.smtpUser).trim(), pass: String(sys.smtpPass).trim() }
                });

                await transporter.sendMail({
                    from: `"${sys.emailName || 'IT Guy Solutions'}" <${sys.smtpUser}>`,
                    to: email,
                    subject: "Password Reset - IT Guy Solutions",
                    text: `Hi ${user.firstName || 'Customer'},\n\nYour password has been reset. \n\nTemporary Password: ${tempPass}\n\nPlease login and change your password immediately.\n\nKind Regards,\n${sys.emailName || 'IT Guy Solutions'}`
                });
            }
        }
        res.json({ success: true });
    } catch(err) {
        next(err);
    }
});

module.exports = router;

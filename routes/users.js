const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const fixes = require('../lib/itguy-fixes');

async function mirrorUser(uid, userData) {
    const jsonData = JSON.stringify(userData);
    if (db.type === 'mysql') {
        await db.run(`INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)
                     ON DUPLICATE KEY UPDATE data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`, [uid, jsonData]);
    } else {
        await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)`, [uid, jsonData]);
    }
}

// All routes here require auth
router.use(requireAuth);

router.post('/', requireAdmin, async (req, res, next) => {
    const parsed = fixes.validateStaffCreate(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const uid = 'user-' + Math.random().toString(36).substring(2, 12);

    try {
        const duplicate = await db.get(
            "SELECT uid FROM users WHERE LOWER(email) = LOWER(?) OR (? != '' AND LOWER(username) = LOWER(?))",
            [parsed.email, parsed.username, parsed.username]
        );
        if (duplicate) {
            return res.status(409).json({ error: 'A staff account with this email or username already exists.' });
        }

        const hashedPassword = await bcrypt.hash(parsed.password, 12);
        await db.run(
            "INSERT INTO users (uid, email, username, firstName, lastName, employeeId, role, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [uid, parsed.email, parsed.username, parsed.firstName, parsed.lastName, parsed.employeeId, parsed.role, hashedPassword]
        );

        const userData = {
            uid,
            email: parsed.email,
            username: parsed.username,
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            employeeId: parsed.employeeId,
            role: parsed.role,
            createdAt: new Date().toISOString()
        };

        try {
            await mirrorUser(uid, userData);
        } catch (mirrorErr) {
            await db.run("DELETE FROM users WHERE uid = ?", [uid]);
            throw mirrorErr;
        }

        res.json({ success: true, user: userData });
    } catch (err) {
        next(err);
    }
});

router.post('/password', async (req, res, next) => {
    const { uid, oldPassword, newPassword } = req.body;
    if(!uid || !oldPassword || !newPassword) return res.status(400).json({ error: "Missing required fields" });

    try {
        const row = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
        if(!row) return res.status(404).json({ error: "User not found" });

        let isMatch = false;
        const isHashed = row.password && (row.password.startsWith('$2a$') || row.password.startsWith('$2b$'));
        if (isHashed) {
            isMatch = await bcrypt.compare(oldPassword, row.password);
        } else {
            isMatch = (row.password === oldPassword);
        }

        if(!isMatch) return res.status(401).json({ error: "Incorrect current password" });

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await db.run("UPDATE users SET password = ? WHERE uid = ?", [hashedPassword, uid]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.post('/admin-password', requireAdmin, async (req, res, next) => {
    const { uid, newPassword } = req.body;
    if(!uid || !newPassword) return res.status(400).json({ error: "Missing required fields" });

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await db.run("UPDATE users SET password = ? WHERE uid = ?", [hashedPassword, uid]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.put('/:uid', requireAdmin, async (req, res, next) => {
    const { uid } = req.params;
    const { email, username, firstName, lastName, employeeId, phone, role } = req.body;
    
    try {
        await db.run(`UPDATE users SET 
                email = ?, username = ?, firstName = ?, lastName = ?, 
                employeeId = ?, phone = ?, role = ?
                WHERE uid = ?`, 
                [email, username, firstName, lastName, employeeId, phone, role, uid]);
        
        const userData = { uid, email, username, firstName, lastName, employeeId, phone, role, updatedAt: new Date().toISOString() };
        await mirrorUser(uid, userData);
        res.json({ success: true });
    } catch(err) {
        next(err);
    }
});

router.delete('/:uid', requireAdmin, async (req, res, next) => {
    const { uid } = req.params;
    try {
        await db.serialize(async () => {
            await db.run("DELETE FROM users WHERE uid = ?", [uid]);
            await db.run("DELETE FROM collections WHERE name = 'users' AND id = ?", [uid]);
        });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

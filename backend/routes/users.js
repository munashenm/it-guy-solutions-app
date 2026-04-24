const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All routes here require auth
router.use(requireAuth);

router.post('/', requireAdmin, async (req, res, next) => {
    const { email, password, role, username, firstName, lastName, employeeId } = req.body;
    if(!email || !password || !role) return res.status(400).json({ error: "Missing required fields" });
    
    const uid = 'user-' + Math.random().toString(36).substring(2, 12);
    
    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        await db.run("INSERT INTO users (uid, email, username, firstName, lastName, employeeId, role, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
            [uid, email, username||'', firstName||'', lastName||'', employeeId||'', role, hashedPassword]);
        
        const userData = { uid, email, username: username||'', firstName: firstName||'', lastName: lastName||'', employeeId: employeeId||'', role, createdAt: new Date().toISOString() };
        
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

router.post('/password', async (req, res, next) => {
    const { uid, oldPassword, newPassword } = req.body;
    if(!uid || !oldPassword || !newPassword) return res.status(400).json({ error: "Missing required fields" });

    try {
        const row = await db.get("SELECT * FROM users WHERE uid = ?", [uid]);
        if(!row) return res.status(404).json({ error: "User not found" });

        let isMatch = false;
        if (row.password.startsWith('$2a$')) {
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
        const jsonData = JSON.stringify(userData);
        if(process.env.DB_TYPE === 'mysql') {
            await db.run(`INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP) 
                         ON DUPLICATE KEY UPDATE data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`, [uid, jsonData]);
        } else {
            await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)`, [uid, jsonData]);
        }
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

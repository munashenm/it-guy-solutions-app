const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const fixes = require('../lib/itguy-fixes');

async function mirrorUser(uid, userData) {
    const safe = Object.assign({}, userData);
    delete safe.password;
    delete safe.sessionToken;
    const jsonData = JSON.stringify(safe);
    if (db.type === 'mysql') {
        await db.run(`INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)
                     ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`, [uid, jsonData]);
    } else {
        await db.run(`INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)`, [uid, jsonData]);
    }
}

function withoutSecrets(obj) {
    const out = Object.assign({}, obj || {});
    delete out.password;
    delete out.sessionToken;
    return out;
}

async function selectAccountRows() {
    try {
        return await db.all('SELECT uid, email, username, firstName, lastName, employeeId, phone, role, active, createdAt FROM users');
    } catch (err) {
        const rows = await db.all('SELECT uid, email, username, firstName, lastName, employeeId, phone, role FROM users');
        return rows.map((row) => Object.assign({ active: 1, createdAt: null }, row));
    }
}

async function listDirectory() {
    const sqlRows = await selectAccountRows();
    const collRows = await db.all("SELECT id, data FROM collections WHERE name = 'users'");
    const byUid = new Map();

    sqlRows.forEach((row) => {
        const uid = row.uid;
        if (!uid) return;
        byUid.set(uid, {
            id: uid,
            uid,
            email: row.email || '',
            username: row.username || '',
            firstName: row.firstName || '',
            lastName: row.lastName || '',
            employeeId: row.employeeId || '',
            phone: row.phone || '',
            role: fixes.canonicalRole(row.role),
            active: fixes.accountIsActive(row.active),
            createdAt: row.createdAt || null,
            storage: 'sql'
        });
    });

    collRows.forEach((row) => {
        const data = fixes.parseStoredJson(row.data);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;
        const uid = data.uid || row.id;
        if (!uid) return;
        const existing = byUid.get(uid);
        const roleSource = existing && existing.role ? existing.role : (data.role || '');
        const active = existing ? existing.active : fixes.accountIsActive(data.active);
        byUid.set(uid, {
            id: uid,
            uid,
            email: (existing && existing.email) || data.email || '',
            username: (existing && existing.username) || data.username || '',
            firstName: (existing && existing.firstName) || data.firstName || '',
            lastName: (existing && existing.lastName) || data.lastName || '',
            employeeId: (existing && existing.employeeId) || data.employeeId || '',
            phone: (existing && existing.phone) || data.phone || '',
            role: fixes.canonicalRole(roleSource),
            active,
            createdAt: (existing && existing.createdAt) || data.createdAt || null,
            storage: existing ? 'both' : 'collection'
        });
    });

    return Array.from(byUid.values()).map(withoutSecrets);
}

function requireDirectoryReader(req, res) {
    if (fixes.canonicalRole(req.user && req.user.role) === 'client') {
        res.status(403).json({ error: 'Clients cannot view the staff directory.' });
        return false;
    }
    return true;
}

// All routes here require auth
router.use(requireAuth);

router.get('/', async (req, res, next) => {
    try {
        if (!requireDirectoryReader(req, res)) return;
        const users = await listDirectory();
        res.json(users);
    } catch (err) {
        next(err);
    }
});

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

router.post('/:uid/status', requireAdmin, async (req, res, next) => {
    const { uid } = req.params;
    const active = !!(req.body && req.body.active);
    try {
        if (!active && req.user && req.user.uid === uid) {
            return res.status(400).json({ error: 'You cannot deactivate your own account.' });
        }
        const sqlRow = await db.get('SELECT uid, email, username, firstName, lastName, employeeId, phone, role FROM users WHERE uid = ?', [uid]);
        const coll = await db.get("SELECT data FROM collections WHERE name = 'users' AND id = ?", [uid]);
        const prev = coll ? (fixes.parseStoredJson(coll.data) || {}) : {};
        if (!sqlRow && !coll) return res.status(404).json({ error: 'User not found' });
        if (sqlRow) await db.run('UPDATE users SET active = ? WHERE uid = ?', [active ? 1 : 0, uid]);
        const merged = withoutSecrets(Object.assign({}, prev, {
            uid,
            email: (sqlRow && sqlRow.email) || prev.email || '',
            username: (sqlRow && sqlRow.username) || prev.username || '',
            firstName: (sqlRow && sqlRow.firstName) || prev.firstName || '',
            lastName: (sqlRow && sqlRow.lastName) || prev.lastName || '',
            employeeId: (sqlRow && sqlRow.employeeId) || prev.employeeId || '',
            phone: (sqlRow && sqlRow.phone) || prev.phone || '',
            role: fixes.canonicalRole((sqlRow && sqlRow.role) || prev.role),
            active,
            updatedAt: new Date().toISOString()
        }));
        await mirrorUser(uid, merged);
        res.json({ success: true, active });
    } catch (err) {
        next(err);
    }
});

router.put('/:uid', requireAdmin, async (req, res, next) => {
    const { uid } = req.params;
    const { email, username, firstName, lastName, employeeId, phone, role } = req.body;
    const storedRole = fixes.canonicalRole(role);
    
    try {
        const existing = await db.get('SELECT uid, active FROM users WHERE uid = ?', [uid]);
        const coll = await db.get("SELECT data FROM collections WHERE name = 'users' AND id = ?", [uid]);
        const prev = coll ? (fixes.parseStoredJson(coll.data) || {}) : {};
        if (!existing && !coll) return res.status(404).json({ error: 'User not found' });

        const active = existing
            ? fixes.accountIsActive(existing.active)
            : fixes.accountIsActive(prev.active);

        if (existing) {
            await db.run(`UPDATE users SET 
                    email = ?, username = ?, firstName = ?, lastName = ?, 
                    employeeId = ?, phone = ?, role = ?
                    WHERE uid = ?`, 
                    [email, username, firstName, lastName, employeeId, phone, storedRole, uid]);
        }
        
        const userData = {
            uid, email, username, firstName, lastName, employeeId, phone,
            role: storedRole, active, updatedAt: new Date().toISOString()
        };
        await mirrorUser(uid, userData);
        res.json({ success: true, user: userData });
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

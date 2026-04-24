const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(requireAuth);

const safeJsonParse = (str, fallback = {}, context = '') => {
    try {
        if (!str || str.trim() === '') return fallback;
        return JSON.parse(str);
    } catch (e) {
        logger.error(`JSON Parse Failed: ${context}`, { error: e.message, rawLength: str?.length });
        return { ...fallback, _parseError: true };
    }
};

const getCollection = async (name, query = {}, user = null) => {
    try {
        let sql = `SELECT id, data FROM collections WHERE name = ?`;
        const params = [name];

        const rows = await db.all(sql, params);
        let results = rows.map(r => ({ 
            id: r.id, 
            ...safeJsonParse(r.data, {}, `Collection: ${name}, ID: ${r.id}`) 
        })).filter(item => !item._parseError);

        if (user && user.role === 'client') {
            const clientEmail = (user.email || '').toLowerCase();
            results = results.filter(item => {
                const itemEmail = (item.email || item.customerEmail || item.clientEmail || '').toLowerCase();
                return itemEmail === clientEmail;
            });
        }

        if (query.orderBy) {
            const direction = query.direction === 'desc' ? -1 : 1;
            results.sort((a, b) => {
                const valA = a[query.orderBy] || '';
                const valB = b[query.orderBy] || '';
                if (valA < valB) return -1 * direction;
                if (valA > valB) return 1 * direction;
                return 0;
            });
        }

        if (query.limit) {
            results = results.slice(0, parseInt(query.limit));
        }

        return results;
    } catch (err) {
        logger.error(`Failed to fetch collection: ${name}`, { error: err.message });
        throw err;
    }
};


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

router.get('/:name', async (req, res, next) => {
    try {
        const data = await getCollection(req.params.name, req.query, req.user);
        res.json(data);
    } catch (e) {
        next(e);
    }
});


const isStaff = (user) => user && ['admin', 'employee', 'technician'].includes(user.role);

router.get('/:name/:id', async (req, res, next) => {
    try {
        const row = await db.get("SELECT data FROM collections WHERE name = ? AND id = ?", [req.params.name, req.params.id]);
        if (!row) return res.status(404).json({ error: "Document not found" });
        
        const data = safeJsonParse(row.data, {}, `Collection: ${req.params.name}, ID: ${req.params.id}`);
        
        // Security check for clients
        if (req.user.role === 'client') {
            const itemEmail = (data.email || data.customerEmail || data.clientEmail || '').toLowerCase();
            if (itemEmail !== req.user.email.toLowerCase()) {
                return res.status(403).json({ error: "Forbidden: You do not have permission to view this document." });
            }
        }
        
        res.json({ id: req.params.id, ...data });
    } catch (e) {
        next(e);
    }
});

router.post('/:name/:id', async (req, res, next) => {
    try {
        const { name, id } = req.params;
        
        // Staff-only collections
        if (['settings', 'users', 'inventory', 'expenses'].includes(name) && !isStaff(req.user)) {
            return res.status(403).json({ error: `Forbidden: Only staff can modify ${name}` });
        }

        // For other collections (jobs, quotes), clients can only create/update their OWN
        if (req.user.role === 'client') {
            const itemEmail = (req.body.email || req.body.customerEmail || req.body.clientEmail || '').toLowerCase();
            if (itemEmail !== req.user.email.toLowerCase()) {
                return res.status(403).json({ error: "Forbidden: You can only save documents associated with your email." });
            }
        }

        await saveDoc(name, id, req.body);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

router.patch('/:name/:id', async (req, res, next) => {
    try {
        const { name, id } = req.params;

        if (['settings', 'users', 'inventory', 'expenses'].includes(name) && !isStaff(req.user)) {
            return res.status(403).json({ error: `Forbidden: Only staff can modify ${name}` });
        }

        const row = await db.get("SELECT data FROM collections WHERE name = ? AND id = ?", [name, id]);
        const currentData = row ? safeJsonParse(row.data, {}, `Patch Read: ${name}/${id}`) : {};
        
        // Security check for existing document ownership
        if (req.user.role === 'client' && row) {
            const itemEmail = (currentData.email || currentData.customerEmail || currentData.clientEmail || '').toLowerCase();
            if (itemEmail !== req.user.email.toLowerCase()) {
                return res.status(403).json({ error: "Forbidden: You do not own this document." });
            }
        }

        const newData = { ...currentData, ...req.body };
        await saveDoc(name, id, newData);
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

router.delete('/:name/:id', async (req, res, next) => {
    try {
        const { name, id } = req.params;
        if (!isStaff(req.user)) {
            return res.status(403).json({ error: "Forbidden: Only staff can delete records." });
        }
        await db.run(`DELETE FROM collections WHERE name = ? AND id = ?`, [name, id]);
        res.json({ success: true });
    } catch(err) {
        next(err);
    }
});


module.exports = router;

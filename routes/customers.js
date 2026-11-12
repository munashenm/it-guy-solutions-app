const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const fixes = require('../lib/itguy-fixes');

const RECORD_COLLECTIONS = ['jobs', 'fieldJobs', 'invoices', 'quotations', 'tickets'];

function canManageCustomers(user) {
    const role = fixes.canonicalRole(user && user.role);
    return role === 'admin' || role === 'frontdesk' || role === 'employee';
}

async function loadNamed(name) {
    const rows = await db.all('SELECT id, data FROM collections WHERE name = ?', [name]);
    return rows.map((row) => {
        const data = fixes.parseStoredJson(row.data);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return Object.assign({ id: row.id }, data);
    }).filter(Boolean);
}

async function loadCustomer(id) {
    const row = await db.get("SELECT id, data FROM collections WHERE name = 'customers' AND id = ?", [id]);
    if (!row) return null;
    const data = fixes.parseStoredJson(row.data) || {};
    return { id: row.id, data: Object.assign({ id: row.id }, data) };
}

async function saveCustomer(id, data) {
    const jsonData = JSON.stringify(data);
    if (db.type === 'mysql') {
        await db.run(
            `INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'customers', ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`,
            [id, jsonData]
        );
    } else {
        await db.run(
            `INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'customers', ?, CURRENT_TIMESTAMP)`,
            [id, jsonData]
        );
    }
}

async function linkedRecords(customer) {
    const books = {};
    for (const name of RECORD_COLLECTIONS) books[name] = await loadNamed(name);
    return fixes.customerLinkCount(customer, books);
}

router.use(requireAuth);

router.delete('/:id', async (req, res, next) => {
    try {
        if (!canManageCustomers(req.user)) {
            return res.status(403).json({ error: 'Only office staff can delete or archive customers.' });
        }
        const found = await loadCustomer(req.params.id);
        if (!found) return res.status(404).json({ error: 'Customer not found' });
        const links = await linkedRecords(found.data);
        if (links > 0) {
            const noun = links === 1 ? 'record' : 'records';
            return res.status(409).json({
                error: `This customer has ${links} job, invoice, quote, or ticket ${noun}. Archive them instead of deleting. Those records stay.`,
                links
            });
        }
        await db.run("DELETE FROM collections WHERE name = 'customers' AND id = ?", [req.params.id]);
        res.json({ success: true, deleted: true });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/archive', async (req, res, next) => {
    try {
        if (!canManageCustomers(req.user)) {
            return res.status(403).json({ error: 'Only office staff can delete or archive customers.' });
        }
        const found = await loadCustomer(req.params.id);
        if (!found) return res.status(404).json({ error: 'Customer not found' });
        const nextDoc = Object.assign({}, found.data, {
            archived: true,
            archivedAt: new Date().toISOString()
        });
        delete nextDoc.password;
        await saveCustomer(req.params.id, nextDoc);
        res.json({ success: true, customer: nextDoc });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/restore', async (req, res, next) => {
    try {
        if (!canManageCustomers(req.user)) {
            return res.status(403).json({ error: 'Only office staff can delete or archive customers.' });
        }
        const found = await loadCustomer(req.params.id);
        if (!found) return res.status(404).json({ error: 'Customer not found' });
        const nextDoc = Object.assign({}, found.data, { archived: false, archivedAt: null });
        delete nextDoc.password;
        await saveCustomer(req.params.id, nextDoc);
        res.json({ success: true, customer: nextDoc });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

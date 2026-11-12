const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function validPushToken(token) {
    return typeof token === 'string'
        && token.length >= 20
        && token.length <= 512
        && /^[A-Za-z0-9:_\-.]+$/.test(token);
}

function platformOf(value) {
    const clean = String(value || 'android').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    return clean || 'android';
}

router.post('/push-token', async (req, res, next) => {
    try {
        const token = String((req.body && req.body.token) || '').trim();
        if (!validPushToken(token)) {
            return res.status(400).json({ error: 'A device push token is required.' });
        }
        const platform = platformOf(req.body && req.body.platform);
        const uid = req.user.uid;
        if (db.type === 'mysql') {
            await db.run(
                `INSERT INTO device_tokens (token, userUid, platform, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE userUid = VALUES(userUid), platform = VALUES(platform), updatedAt = CURRENT_TIMESTAMP`,
                [token, uid, platform]
            );
        } else {
            await db.run(
                `INSERT OR REPLACE INTO device_tokens (token, userUid, platform, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [token, uid, platform]
            );
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/push-tokens', async (req, res, next) => {
    try {
        const rows = await db.all(
            'SELECT token, platform, updatedAt FROM device_tokens WHERE userUid = ? ORDER BY updatedAt DESC',
            [req.user.uid]
        );
        res.json({ tokens: rows || [] });
    } catch (err) {
        next(err);
    }
});

router.delete('/push-token', async (req, res, next) => {
    try {
        const token = String((req.body && req.body.token) || req.query.token || '').trim();
        if (!validPushToken(token)) {
            return res.status(400).json({ error: 'A device push token is required.' });
        }
        await db.run('DELETE FROM device_tokens WHERE token = ? AND userUid = ?', [token, req.user.uid]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

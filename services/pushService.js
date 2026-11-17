/**
 * Firebase Cloud Messaging HTTP v1 sender.
 * Stays disabled when no service account is configured — saves and the API keep working.
 *
 * Credentials (first match wins, never commit the file or JSON):
 *   FIREBASE_SERVICE_ACCOUNT_JSON   full service-account JSON string
 *   FIREBASE_SERVICE_ACCOUNT_PATH   absolute path to the JSON file
 *   GOOGLE_APPLICATION_CREDENTIALS  absolute path (standard Google env var)
 */
const fs = require('fs');
const crypto = require('crypto');
const db = require('../database');
const logger = require('../utils/logger');
const shell = require('../lib/staff-shell');

const attempts = [];
let cachedAccessToken = '';
let cachedAccessUntil = 0;

function record(entry) {
    attempts.push(Object.assign({ at: new Date().toISOString() }, entry));
    if (attempts.length > 50) attempts.shift();
}

function loadServiceAccount() {
    try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (raw && String(raw).trim()) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.client_email && parsed.private_key && parsed.project_id) return parsed;
            return null;
        }
        const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (path && fs.existsSync(path)) {
            const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
            if (parsed && parsed.client_email && parsed.private_key && parsed.project_id) return parsed;
        }
    } catch (err) {
        logger.error('Firebase credentials could not be read. Push stays disabled.', { error: err.message });
    }
    return null;
}

function configured() {
    return !!loadServiceAccount();
}

function base64url(value) {
    return Buffer.from(value).toString('base64url');
}

function signServiceJwt(account) {
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const claim = base64url(JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const data = header + '.' + claim;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(data);
    signer.end();
    return data + '.' + signer.sign(account.private_key).toString('base64url');
}

async function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, ms || 5000);
    try {
        return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    } finally {
        clearTimeout(timer);
    }
}

async function accessToken(account) {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessUntil > now + 60000) return cachedAccessToken;
    const jwt = signServiceJwt(account);
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
    });
    const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    }, 5000);
    const json = await res.json().catch(function () { return {}; });
    if (!res.ok || !json.access_token) {
        throw new Error('FCM auth failed (' + res.status + ')');
    }
    cachedAccessToken = json.access_token;
    cachedAccessUntil = now + ((Number(json.expires_in) || 3600) * 1000);
    return cachedAccessToken;
}

async function deliver(message) {
    const account = loadServiceAccount();
    if (!account) return { skipped: true, reason: 'unconfigured' };
    const token = message && message.token;
    const payload = shell.buildFcmBody(token, message);
    try {
        const bearer = await accessToken(account);
        const res = await fetchWithTimeout(
            'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(account.project_id) + '/messages:send',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + bearer,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            },
            5000
        );
        const json = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            const status = json && json.error && json.error.status;
            const details = JSON.stringify(json.error || {});
            const drop = res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED' || /UNREGISTERED|NOT_FOUND/.test(details);
            return { ok: false, skipped: false, dropToken: drop, status: res.status };
        }
        return { ok: true, skipped: false, id: json.name || '' };
    } catch (err) {
        logger.error('FCM send failed', { error: err.message });
        return { ok: false, skipped: false, reason: 'send-failed' };
    }
}

async function resolveUser(event) {
    if (event.technicianUid) {
        const byUid = await db.get(
            'SELECT uid, role, email, firstName, lastName, username FROM users WHERE uid = ?',
            [event.technicianUid]
        );
        if (byUid) return byUid;
    }
    if (event.technicianEmail) {
        const byEmail = await db.get(
            'SELECT uid, role, email, firstName, lastName, username FROM users WHERE LOWER(email) = LOWER(?)',
            [event.technicianEmail]
        );
        if (byEmail) return byEmail;
    }
    if (event.technicianName) {
        const want = String(event.technicianName).trim().toLowerCase();
        const rows = await db.all('SELECT uid, role, email, firstName, lastName, username FROM users');
        return (rows || []).find(function (user) {
            const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim().toLowerCase();
            return full === want || String(user.username || '').toLowerCase() === want;
        }) || null;
    }
    return null;
}

async function dispatchEvent(event, actorUid) {
    let user = null;
    try {
        user = await resolveUser(event);
    } catch (err) {
        logger.error('Push recipient lookup failed', { error: err.message });
        record({ type: event.type, collection: event.collection, id: event.id, skipped: true, reason: 'lookup-failed' });
        return;
    }
    if (!user) {
        record({ type: event.type, collection: event.collection, id: event.id, skipped: true, reason: 'no-recipient', title: event.title });
        return;
    }
    const role = String(user.role || '').toLowerCase();
    if (role === 'client') {
        record({ type: event.type, collection: event.collection, id: event.id, uid: user.uid, skipped: true, reason: 'not-staff' });
        return;
    }
    if (actorUid && user.uid === actorUid) {
        record({ type: event.type, collection: event.collection, id: event.id, uid: user.uid, skipped: true, reason: 'actor' });
        return;
    }
    let tokens = [];
    try {
        tokens = await db.all('SELECT token FROM device_tokens WHERE userUid = ?', [user.uid]);
    } catch (err) {
        logger.error('Push token lookup failed', { error: err.message });
        record({ type: event.type, collection: event.collection, id: event.id, uid: user.uid, skipped: true, reason: 'lookup-failed' });
        return;
    }
    if (!tokens || !tokens.length) {
        record({ type: event.type, collection: event.collection, id: event.id, uid: user.uid, skipped: true, reason: 'no-tokens', title: event.title, body: event.body });
        return;
    }
    for (const row of tokens) {
        const result = await deliver({
            token: row.token,
            title: event.title,
            body: event.body,
            type: event.type,
            collection: event.collection,
            id: event.id,
            status: event.status
        });
        if (result && result.dropToken) {
            try { await db.run('DELETE FROM device_tokens WHERE token = ?', [row.token]); } catch (e) { /* keep going */ }
        }
        record({
            type: event.type,
            collection: event.collection,
            id: event.id,
            uid: user.uid,
            token: row.token,
            title: event.title,
            body: event.body,
            skipped: !!(result && result.skipped),
            reason: (result && result.reason) || (result && result.skipped ? 'unconfigured' : ''),
            ok: !!(result && result.ok)
        });
    }
}

async function notifyCollectionChange(input) {
    const src = input || {};
    const events = shell.diffJobNotifications({
        collection: src.collection,
        id: src.id,
        before: src.before || {},
        after: src.after || {},
        isCreate: !!src.isCreate
    });
    for (const event of events) {
        try {
            await dispatchEvent(event, src.actorUid || '');
        } catch (err) {
            logger.error('Push notification failed', { error: err.message });
            record({ type: event.type, id: src.id, skipped: true, reason: 'error' });
        }
    }
    return events.length;
}

module.exports = {
    attempts: attempts,
    configured: configured,
    loadServiceAccount: loadServiceAccount,
    deliver: deliver,
    notifyCollectionChange: notifyCollectionChange,
    clearAttempts: function () { attempts.length = 0; }
};

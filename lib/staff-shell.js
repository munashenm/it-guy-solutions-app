/**
 * Pure helpers for the Android staff shell and push notifications.
 * Loaded in the browser as a classic script and required by Node.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.StaffShell = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const NOTIFY_COLLECTIONS = { jobs: 'workshop job', fieldJobs: 'call-out' };
    const HEAVY_KEYS = {
        photoBefore: 1,
        photoAfter: 1,
        signature: 1,
        receiptBase64: 1,
        pdfBase64: 1,
        logoBase64: 1,
        password: 1,
        sessionToken: 1,
        smtpPass: 1
    };

    function party(doc) {
        const d = doc || {};
        return String(d.customer || d.client || d.customerName || '').trim();
    }

    function label(collection, id, doc) {
        const kind = NOTIFY_COLLECTIONS[collection] || 'job';
        const ref = String(id || (doc && doc.id) || '').trim();
        const who = party(doc);
        return kind + (ref ? ' ' + ref : '') + (who ? ' (' + who + ')' : '');
    }

    function diffJobNotifications(input) {
        const src = input || {};
        const collection = src.collection;
        if (!NOTIFY_COLLECTIONS[collection]) return [];
        const before = src.before || {};
        const after = src.after || {};
        const id = src.id || after.id || before.id || '';
        const isCreate = !!src.isCreate;
        const events = [];

        const prevTech = String(before.technician || '').trim();
        const nextTech = String(after.technician == null ? '' : after.technician).trim();
        const prevUid = String(before.technicianUid || '').trim();
        const nextUidRaw = String(after.technicianUid || '').trim();
        const prevEmail = String(before.technicianEmail || '').trim();
        const nextEmail = String(after.technicianEmail || '').trim();
        const nameChanged = nextTech !== prevTech;
        const uidChanged = nextUidRaw !== prevUid;
        const emailChanged = nextEmail !== prevEmail;

        if (nameChanged || uidChanged || emailChanged) {
            let uid = nextUidRaw;
            let email = nextEmail;
            if (nameChanged && !uidChanged) uid = '';
            if (nameChanged && !emailChanged) email = '';
            if (uid || email || nextTech) {
                events.push({
                    type: 'assignment',
                    collection: collection,
                    id: id,
                    technicianUid: uid,
                    technicianEmail: email,
                    technicianName: nextTech,
                    status: String(after.status || ''),
                    title: 'New assignment',
                    body: "You've been assigned to " + label(collection, id, after) + '.'
                });
            }
        }

        const prevStatus = String(before.status || '').trim();
        const nextStatus = String(after.status || '').trim();
        if (!isCreate && nextStatus && nextStatus !== prevStatus) {
            let uid = nextUidRaw;
            let email = nextEmail;
            if (nameChanged && !uidChanged) uid = '';
            if (nameChanged && !emailChanged) email = '';
            events.push({
                type: 'status',
                collection: collection,
                id: id,
                technicianUid: uid,
                technicianEmail: email,
                technicianName: nextTech,
                status: nextStatus,
                title: 'Job status updated',
                body: label(collection, id, after) + ' is now ' + nextStatus + '.'
            });
        }
        return events;
    }

    function pathOf(url) {
        const raw = String(url || '');
        try {
            const base = (typeof location !== 'undefined' && location.origin) ? location.origin : 'https://app.itguysa.co.za';
            return new URL(raw, base).pathname || '';
        } catch (e) {
            const noQuery = raw.split('?')[0];
            const idx = noQuery.indexOf('/api/');
            return idx >= 0 ? noQuery.slice(idx) : noQuery;
        }
    }

    function shouldQueueWrite(method, url) {
        const m = String(method || 'GET').toUpperCase();
        if (m !== 'POST' && m !== 'PATCH' && m !== 'PUT' && m !== 'DELETE') return false;
        const path = pathOf(url);
        if (/\/api\/collections\//.test(path)) return true;
        if (/\/api\/transaction\/batch$/.test(path)) return true;
        return false;
    }

    function shouldCacheRead(method, url) {
        const m = String(method || 'GET').toUpperCase();
        if (m !== 'GET') return false;
        const path = pathOf(url);
        if (/\/api\/collections\//.test(path)) return true;
        if (/\/api\/settings\/companyProfile$/.test(path)) return true;
        if (/\/api\/status$/.test(path)) return true;
        return false;
    }

    function externalLinkKind(url) {
        const u = String(url || '').trim();
        if (/^tel:/i.test(u)) return 'tel';
        if (/^mailto:/i.test(u)) return 'mailto';
        if (/^sms:/i.test(u)) return 'sms';
        if (/^whatsapp:/i.test(u) || /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i.test(u)) return 'whatsapp';
        if (/\.pdf(?:$|\?|#)/i.test(u)) return 'pdf';
        return '';
    }

    function isImageFileInput(el) {
        if (!el) return false;
        if (String(el.type || '').toLowerCase() !== 'file') return false;
        const accept = String(el.accept || '').toLowerCase();
        if (!accept) return false;
        return accept.split(',').some(function (part) {
            const p = part.trim();
            return p === 'image/*' || p.indexOf('image/') === 0;
        });
    }

    function slimValue(value, depth) {
        const level = depth || 0;
        if (level > 6) return null;
        if (Array.isArray(value)) return value.map(function (item) { return slimValue(item, level + 1); });
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string' && value.length > 8000 && value.indexOf('data:') === 0) return undefined;
            return value;
        }
        const out = {};
        Object.keys(value).forEach(function (key) {
            if (HEAVY_KEYS[key]) return;
            if (key === 'photos' && Array.isArray(value.photos)) {
                out.photos = value.photos.map(function (photo) {
                    return { at: photo && photo.at, by: photo && photo.by, offlinePlaceholder: true };
                });
                return;
            }
            const next = slimValue(value[key], level + 1);
            if (next !== undefined) out[key] = next;
        });
        return out;
    }

    function parseCollectionUrl(url) {
        const path = pathOf(url);
        const match = path.match(/\/api\/collections\/([^/]+)(?:\/([^/]+))?$/);
        if (!match) return null;
        let id = '';
        try {
            id = match[2] ? decodeURIComponent(match[2]) : '';
        } catch (e) {
            id = match[2] || '';
        }
        let name = match[1];
        try { name = decodeURIComponent(match[1]); } catch (e) { /* keep raw */ }
        return { name: name, id: id };
    }

    function applyOne(rows, method, id, data) {
        const verb = String(method || '').toUpperCase();
        const list = Array.isArray(rows) ? rows.slice() : [];
        if (verb === 'DELETE') return list.filter(function (row) { return row && row.id !== id; });
        const payload = Object.assign({ id: id }, data || {});
        const idx = list.findIndex(function (row) { return row && row.id === id; });
        if (verb === 'PATCH' || verb === 'PUT') {
            if (idx >= 0) list[idx] = Object.assign({}, list[idx], data || {}, { id: id });
            else list.unshift(payload);
            return list;
        }
        if (idx >= 0) list[idx] = payload;
        else list.unshift(payload);
        return list;
    }

    function applyQueuedEdits(name, body, queue) {
        let current = body;
        (Array.isArray(queue) ? queue : []).forEach(function (item) {
            if (!item) return;
            let data = item.data;
            if (data == null && typeof item.body === 'string' && item.body) {
                try { data = JSON.parse(item.body); } catch (e) { data = {}; }
            }
            const parsed = item.collection
                ? { name: item.collection, id: item.id || '' }
                : parseCollectionUrl(item.url || '');
            if (parsed && parsed.name === name && parsed.id) {
                if (Array.isArray(current)) {
                    current = applyOne(current, item.method, parsed.id, data);
                } else if (current && typeof current === 'object' && (!current.id || current.id === parsed.id)) {
                    const verb = String(item.method || '').toUpperCase();
                    if (verb === 'DELETE') current = null;
                    else if (verb === 'PATCH' || verb === 'PUT') current = Object.assign({}, current, data || {}, { id: parsed.id });
                    else current = Object.assign({ id: parsed.id }, data || {});
                }
                return;
            }
            if (String(item.url || '').indexOf('/api/transaction/batch') !== -1 && Array.isArray(current)) {
                ((data && data.updates) || []).forEach(function (update) {
                    if (!update || update.coll !== name || !update.id) return;
                    const verb = update.method === 'delete' ? 'DELETE' : (update.method === 'set' ? 'POST' : 'PATCH');
                    current = applyOne(current, verb, update.id, update.data || {});
                });
            }
        });
        return current;
    }

    function buildFcmBody(token, event) {
        const ev = event || {};
        return {
            message: {
                token: String(token || ''),
                notification: {
                    title: String(ev.title || 'IT Guy Staff'),
                    body: String(ev.body || '')
                },
                data: {
                    type: String(ev.type || ''),
                    collection: String(ev.collection || ''),
                    id: String(ev.id || ''),
                    status: String(ev.status || '')
                },
                android: {
                    priority: 'HIGH',
                    notification: { channel_id: 'itguy_jobs' }
                }
            }
        };
    }

    return {
        diffJobNotifications: diffJobNotifications,
        shouldQueueWrite: shouldQueueWrite,
        shouldCacheRead: shouldCacheRead,
        externalLinkKind: externalLinkKind,
        isImageFileInput: isImageFileInput,
        slimValue: slimValue,
        parseCollectionUrl: parseCollectionUrl,
        applyQueuedEdits: applyQueuedEdits,
        buildFcmBody: buildFcmBody,
        label: label
    };
});

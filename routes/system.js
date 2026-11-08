const fixes = require('../lib/itguy-fixes');
const dns = require('dns').promises;
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.resolve(__dirname, '../uploads');
const upload = multer({ dest: uploadDir });
const dbPath = path.resolve(__dirname, '../database.sqlite');

// Status route removed to avoid conflict with main app status

function publicJobView(id, data, type) {
    return {
        id,
        type,
        status: data.status || 'Scheduled',
        device: data.device || data.description || 'Device',
        technician: data.technician || 'Awaiting Assignment',
        date: data.date || data.dateBooked || data.createdAt || null,
        updatedAt: data.updatedAt || data.date || data.createdAt || null
    };
}

function parseCollectionRow(row) {
    if (!row || !row.data) return null;
    try {
        return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    } catch (e) {
        return null;
    }
}

// Public job status lookup for track.html (no login, sanitized fields only)
router.get('/track/:id', async (req, res, next) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'Job ID is required' });

        const workshop = await db.get("SELECT id, data FROM collections WHERE name = 'jobs' AND id = ?", [id]);
        const workshopData = parseCollectionRow(workshop);
        if (workshopData) {
            return res.json(publicJobView(workshop.id, workshopData, 'Workshop Repair'));
        }

        const field = await db.get("SELECT id, data FROM collections WHERE name = 'fieldJobs' AND id = ?", [id]);
        const fieldData = parseCollectionRow(field);
        if (fieldData) {
            return res.json(publicJobView(field.id, fieldData, 'Field Service'));
        }

        return res.status(404).json({ error: 'Reference not found' });
    } catch (err) {
        next(err);
    }
});

async function assertProxyTarget(raw) {
    const verdict = fixes.assessProxyUrl(raw);
    if (!verdict.ok) {
        const err = new Error('Image URL is not allowed');
        err.status = 400;
        throw err;
    }
    let records = [];
    try {
        records = await dns.lookup(verdict.hostname, { all: true, verbatim: true });
    } catch (e) {
        const err = new Error('Image URL is not allowed');
        err.status = 400;
        throw err;
    }
    if (!records.length || records.some(rec => fixes.isPrivateIp(rec.address))) {
        const err = new Error('Image URL is not allowed');
        err.status = 400;
        throw err;
    }
    return verdict.href;
}

async function fetchProxyImage(raw, hops) {
    const target = await assertProxyTarget(raw);
    const response = await axios.get(target, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxRedirects: 0,
        maxContentLength: 2 * 1024 * 1024,
        validateStatus: () => true
    });
    if (response.status >= 300 && response.status < 400) {
        if (hops >= 2) {
            const err = new Error('Image URL is not allowed');
            err.status = 400;
            throw err;
        }
        const next = fixes.assessProxyHop(target, response.headers.location || '');
        if (!next.ok) {
            const err = new Error('Image URL is not allowed');
            err.status = 400;
            throw err;
        }
        return fetchProxyImage(next.href, hops + 1);
    }
    return response;
}

router.get('/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL is required");
    try {
        const response = await fetchProxyImage(url, 0);
        if (response.status !== 200) return res.status(502).send("Error proxying image");
        const contentType = String(response.headers['content-type'] || '');
        if (!contentType.startsWith('image/')) return res.status(415).send("URL did not return an image");
        res.set('Content-Type', contentType);
        res.send(response.data);
    } catch (e) {
        if (e.status === 400) return res.status(400).send("Image URL is not allowed");
        logger.error("Proxy error:", { message: e.message });
        res.status(502).send("Error proxying image");
    }
});

router.post('/transaction/batch', requireAuth, async (req, res, next) => {
    const { updates } = req.body;
    const type = process.env.DB_TYPE || 'sqlite';
    const user = req.user;
    const role = String((user && user.role) || '').toLowerCase();
    const isStaff = ['admin', 'employee', 'technician'].includes(role);
    
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

            const sellDesk = role === 'frontdesk' && ['inventory', 'sales'].includes(u.coll);
            if (!isStaff && !sellDesk) {
                if (['settings', 'users', 'inventory', 'expenses', 'invoices'].includes(u.coll)) {
                    throw new Error(`Forbidden: You do not have permission to modify ${u.coll}`);
                }
            }

            const row = await db.get("SELECT data FROM collections WHERE name = ? AND id = ?", [u.coll, u.id]);
            let currentData = row ? JSON.parse(row.data) : {};
            
            // Ownership check for clients
            if (!isStaff && !sellDesk && row) {
                const itemEmail = (currentData.email || currentData.customerEmail || currentData.clientEmail || '').toLowerCase();
                if (itemEmail !== user.email.toLowerCase()) {
                    throw new Error(`Forbidden: You do not have permission to modify document ${u.id} in ${u.coll}`);
                }
            }

            let newData = { ...currentData };
            
            if (u.method === 'delete') {
                 if (!isStaff) throw new Error("Forbidden: Only staff can delete records.");
                 if (type === 'mysql') await tx.execute("DELETE FROM collections WHERE name = ? AND id = ?", [u.coll, u.id]);
                 else await db.run("DELETE FROM collections WHERE name = ? AND id = ?", [u.coll, u.id]);
                 continue;
            }

            const assignMethod = u.method === 'set' ? 'set' : 'patch';
            const assignBody = u.method === 'set' ? (u.data || {}) : (u.data || {});
            const denial = fixes.assignmentDenial(user, u.coll, currentData, assignBody, assignMethod);
            if (denial) throw new Error('Forbidden: ' + denial);

            if (u.method === 'set') {
                newData = u.data;
                // Double check email consistency on set for clients
                if (!isStaff && !sellDesk) {
                    const newEmail = (newData.email || newData.customerEmail || newData.clientEmail || '').toLowerCase();
                    if (newEmail !== user.email.toLowerCase()) {
                        throw new Error("Forbidden: You cannot change the email association of a document.");
                    }
                }
            } else {
                for (const key in u.data) {
                    const val = u.data[key];
                    if (val && typeof val === 'object' && val._type === 'increment') {
                        const baseVal = Number(currentData[key]) || 0;
                        newData[key] = baseVal + val.value;
                    } else if (val && typeof val === 'object' && val._type === 'arrayUnion') {
                        const arr = Array.isArray(currentData[key]) ? currentData[key] : [];
                        const exists = arr.some(item => JSON.stringify(item) === JSON.stringify(val.value));
                        if (!exists) arr.push(val.value);
                        newData[key] = arr;
                    } else {
                        newData[key] = val;
                    }
                }
            }

            if (u.coll === 'inventory' && newData.qty != null && Number(newData.qty) < 0) {
                throw new Error('Insufficient stock for ' + u.id);
            }

            const jsonData = JSON.stringify(newData);
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
        if (tx) {
            try {
                if (type === 'mysql') await db.rollbackBatch(tx);
                else await db.run("ROLLBACK");
            } catch (re) {}
        }
        // Return 403 for forbidden, otherwise let errorHandler handle it
        if (err.message && err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
        }
        if (err.message && err.message.includes('Insufficient stock')) {
            return res.status(409).json({ error: err.message });
        }
        next(err);
    }
});


router.post('/counters/:prefix', requireAuth, async (req, res, next) => {
    const { prefix } = req.params;
    const type = process.env.DB_TYPE || 'sqlite';
    try {
        const row = await db.get("SELECT data FROM collections WHERE id = 'counters' AND name = 'settings'");
        let counters = row ? JSON.parse(row.data) : {};
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
        next(err);
    }
});

router.post('/notify', requireAuth, async (req, res, next) => {
    try {
        const senderRole = String((req.user && req.user.role) || '').toLowerCase();
        if (!['admin', 'frontdesk', 'technician', 'employee'].includes(senderRole)) {
            return res.status(403).json({ error: 'Only staff can send documents from the app.' });
        }
        const { actionType, docType, docId, contactInfo, pdfBase64, dataObj } = req.body;
        if (actionType === 'Email' && (!contactInfo || String(contactInfo).indexOf('@') === -1)) {
            return res.status(400).json({ error: 'Enter the recipient email address before sending.' });
        }
        
        const rows = await db.all("SELECT data FROM collections WHERE name = ? AND id = ?", ['settings', 'systemSettings']);
        if (!rows || rows.length === 0) throw new Error("System settings not found. Cannot send notifications.");
        let sysSettings = {};
        try { sysSettings = JSON.parse(rows[0].data); } catch (e) {
            throw new Error("System settings are invalid. Cannot send notifications.");
        }

        if (actionType === 'Email') {
            if(!sysSettings.smtpHost || !sysSettings.smtpUser) {
                const configErr = new Error(fixes.SMTP_BLOCKER);
                configErr.status = 409;
                throw configErr;
            }
            
            const transporter = nodemailer.createTransport({
                host: String(sysSettings.smtpHost).trim(),
                port: parseInt(sysSettings.smtpPort) || 465,
                secure: String(sysSettings.smtpPort).trim() === '465', 
                auth: { user: String(sysSettings.smtpUser).trim(), pass: String(sysSettings.smtpPass).trim() }
            });

            const attachments = [];
            if (pdfBase64) {
                attachments.push({ filename: `${docType}_${docId}.pdf`, content: pdfBase64, encoding: 'base64' });
            }

            const parsedAmt = dataObj && dataObj.amount ? parseFloat(dataObj.amount) : null;
            const amountMsg = parsedAmt && !isNaN(parsedAmt) ? `\n\nTotal Amount: R ${parsedAmt.toFixed(2)}` : '';
            const defaultText = `Hi,\n\nPlease find attached the ${docType} (${docId}) regarding your recent service.${amountMsg}\n\nKind Regards,\n${sysSettings.emailName || 'IT Guy Solutions'}`;
            
            const finalSubject = req.body.subject || `${docType} - ${docId} from ${sysSettings.emailName || 'IT Guy Solutions'}`;
            const textContent = req.body.customMessage || defaultText;

            await transporter.sendMail({
                from: `"${sysSettings.emailName || 'IT Guy Solutions'}" <${sysSettings.smtpUser}>`,
                replyTo: sysSettings.emailReply,
                to: contactInfo,
                subject: finalSubject,
                text: textContent,
                attachments: attachments
            });

            logger.info(`Automated Email Sent: ${docType} ${docId} to ${contactInfo}`);
            return res.json({ success: true, message: `Email delivered to ${contactInfo}` });
        } 
        else if (actionType === 'WhatsApp') {
            if(!sysSettings.waToken || !sysSettings.waPhoneId) throw new Error("WhatsApp API token/PhoneID is not configured in settings.");
            
            let cleanedPhone = contactInfo.replace(/\D/g, '');
            if(cleanedPhone.startsWith('0')) cleanedPhone = '27' + cleanedPhone.substring(1); 
            
            const parsedAmt = dataObj && dataObj.amount ? parseFloat(dataObj.amount) : null;
            const amountMsg = parsedAmt && !isNaN(parsedAmt) ? ` Total: R ${parsedAmt.toFixed(2)}` : '';
            const textContent = `Hi from ${sysSettings.emailName || 'IT Guy Solutions'}. Your ${docType} (${docId}) has been processed.${amountMsg}. Check your email to download the PDF.`;

            await axios.post(
                `https://graph.facebook.com/v18.0/${String(sysSettings.waPhoneId).trim()}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: cleanedPhone,
                    type: 'text',
                    text: { body: textContent }
                },
                {
                    headers: {
                        "Authorization": `Bearer ${String(sysSettings.waToken).trim()}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            logger.info(`Automated WhatsApp Sent: ${docType} ${docId} to ${cleanedPhone}`);
            return res.json({ success: true, message: `WhatsApp sent to ${cleanedPhone}` });
        }
        else {
            return res.status(400).json({ error: "Invalid actionType" });
        }

    } catch(err) {
        const status = err.status && err.status < 500 ? err.status : 500;
        const message = err.message || 'Email could not be sent.';
        if (status >= 500) logger.error('Notify failed', { message: message });
        return res.status(status).json({ error: message });
    }
});

router.get('/backup', requireAuth, async (req, res, next) => {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'Only an admin can download a database backup.' });
    }
    if (db.type !== 'sqlite' || !db.filePath) {
        return res.status(400).json({ error: 'File backup is only available for the SQLite database. Use your host backup for MySQL.' });
    }
    try {
        await db.run('PRAGMA wal_checkpoint(TRUNCATE)');
        logger.info('Database backup requested');
        res.download(db.filePath, `it-guy-backup-${new Date().toISOString().split('T')[0]}.sqlite`);
    } catch (e) {
        next(e);
    }
});

router.post('/restore', requireAuth, upload.single('database'), async (req, res, next) => {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'Only an admin can restore a database.' });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    if (db.type !== 'sqlite' || !db.filePath) {
        return res.status(400).json({ error: "Restore is only supported for SQLite mode." });
    }

    const target = db.filePath;
    const backupCopy = target + '.bak';
    try {
        const fd = fs.openSync(req.file.path, 'r');
        const header = Buffer.alloc(16);
        fs.readSync(fd, header, 0, 16, 0);
        fs.closeSync(fd);
        if (!header.toString('utf8').startsWith('SQLite format 3')) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'That file is not a SQLite database. The current database was left unchanged.' });
        }

        if (fs.existsSync(target)) fs.copyFileSync(target, backupCopy);
        await db.closeSqlite();
        fs.copyFileSync(req.file.path, target);
        fs.unlinkSync(req.file.path);
        try {
            await db.init();
        } catch (reopenErr) {
            if (fs.existsSync(backupCopy)) fs.copyFileSync(backupCopy, target);
            await db.init();
            throw reopenErr;
        }
        res.json({ success: true, message: "Database restored successfully. A copy of the previous file is kept beside it as a .bak." });
    } catch (e) {
        next(e);
    }
});

module.exports = router;

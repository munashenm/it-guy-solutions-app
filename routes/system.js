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

router.get('/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL is required");
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        res.set('Content-Type', contentType);
        res.send(response.data);
    } catch (e) {
        logger.error("Proxy error:", { message: e.message, url });
        res.status(500).send("Error proxying image");
    }
});

router.post('/transaction/batch', requireAuth, async (req, res, next) => {
    const { updates } = req.body;
    const type = process.env.DB_TYPE || 'sqlite';
    const user = req.user;
    const isStaff = ['admin', 'employee', 'technician'].includes(user.role);
    
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

            // Security Check
            if (!isStaff) {
                // Clients cannot touch these collections
                if (['settings', 'users', 'inventory', 'expenses', 'invoices'].includes(u.coll)) {
                    throw new Error(`Forbidden: You do not have permission to modify ${u.coll}`);
                }
            }

            const row = await db.get("SELECT data FROM collections WHERE name = ? AND id = ?", [u.coll, u.id]);
            let currentData = row ? JSON.parse(row.data) : {};
            
            // Ownership check for clients
            if (!isStaff && row) {
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

            if (u.method === 'set') {
                newData = u.data;
                // Double check email consistency on set for clients
                if (!isStaff) {
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
        if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
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
        const { actionType, docType, docId, contactInfo, pdfBase64, dataObj } = req.body;
        
        const rows = await db.all("SELECT data FROM collections WHERE name = ? AND id = ?", ['settings', 'systemSettings']);
        if (!rows || rows.length === 0) throw new Error("System settings not found. Cannot send notifications.");
        const sysSettings = JSON.parse(rows[0].data);

        if (actionType === 'Email') {
            if(!sysSettings.smtpHost) throw new Error("SMTP is not configured in settings.");
            
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
        next(err);
    }
});

router.get('/backup', requireAuth, (req, res) => {
    logger.info('Database backup requested');
    res.download(dbPath, `it-guy-backup-${new Date().toISOString().split('T')[0]}.sqlite`);
});

router.post('/restore', requireAuth, upload.single('database'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    if(process.env.DB_TYPE === 'mysql') return res.status(400).json({ error: "Restore is only supported for SQLite mode." });

    try {
        if (db.sqlite && typeof db.sqlite.close === 'function') {
            await new Promise((resolve, reject) => {
                db.sqlite.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dbPath + '.bak');
        fs.copyFileSync(req.file.path, dbPath);
        fs.unlinkSync(req.file.path);

        await db.init();
        res.json({ success: true, message: "Database restored successfully." });
    } catch (e) {
        next(e);
    }
});

module.exports = router;

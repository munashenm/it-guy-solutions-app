/**
 * Pure helpers for staff assignment, billing prefill, modal dismissal,
 * A4 pagination, job reports, and outbound email decisions.
 * Loaded in the browser as a classic script and required by Node tests/routes.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ItguyFixes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const STAFF_ROLES = ['admin', 'technician', 'frontdesk'];
    const ASSIGN_ROLES = ['admin', 'frontdesk'];
    const A4_WIDTH_MM = 210;
    const A4_HEIGHT_MM = 297;

    function firstNonEmpty() {
        for (let i = 0; i < arguments.length; i++) {
            const v = arguments[i];
            if (v === undefined || v === null) continue;
            const s = String(v).trim();
            if (s) return s;
        }
        return '';
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function personName(user) {
        if (!user) return '';
        const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
        return full || user.username || String(user.email || '').split('@')[0] || '';
    }

    function canAssignTechnician(role) {
        return ASSIGN_ROLES.indexOf(String(role || '').toLowerCase()) !== -1;
    }

    function technicianCanSeeJob(job, user) {
        if (!user) return false;
        const role = String(user.role || '').toLowerCase();
        if (role !== 'technician') return true;
        const record = job || {};
        const uid = user.uid || user.id || '';
        if (record.technicianUid && uid && record.technicianUid === uid) return true;
        const email = String(user.email || '').toLowerCase();
        if (record.technicianEmail && email && String(record.technicianEmail).toLowerCase() === email) return true;
        const techField = String(record.technician || '').toLowerCase().trim();
        if (!techField) return false;
        const prefix = email.split('@')[0];
        const first = String(user.firstName || '').toLowerCase().trim();
        const last = String(user.lastName || '').toLowerCase().trim();
        const full = (first + ' ' + last).trim();
        if (full && techField === full) return true;
        if (email && techField.indexOf(email) !== -1) return true;
        if (prefix && prefix.length > 1 && techField.indexOf(prefix) !== -1) return true;
        if (first && first.length > 1 && techField.indexOf(first) !== -1) return true;
        return false;
    }

    function nextTechnicianValue(method, current, data) {
        const prev = current ? String(current) : '';
        if (!data || typeof data !== 'object') return prev;
        const has = Object.prototype.hasOwnProperty.call(data, 'technician');
        if (method === 'set') {
            return has ? (data.technician || '') : '';
        }
        if (has) return data.technician || '';
        return prev;
    }

    function assignmentDenial(actor, collection, currentData, nextData, method) {
        if (collection !== 'jobs' && collection !== 'fieldJobs') return null;
        const prev = currentData && currentData.technician ? String(currentData.technician) : '';
        const next = nextTechnicianValue(method || 'patch', prev, nextData);
        if (String(prev) === String(next || '')) return null;
        if (canAssignTechnician(actor && actor.role)) return null;
        return 'Only office staff can assign or reassign a technician.';
    }

    function validateStaffCreate(body) {
        const b = body || {};
        const email = String(b.email || '').trim();
        const password = String(b.password || '');
        const role = String(b.role || '').trim().toLowerCase();
        const firstName = String(b.firstName || '').trim();
        const lastName = String(b.lastName || '').trim();
        const username = String(b.username || '').trim();
        const employeeId = String(b.employeeId || '').trim();
        if (!email || !password || !role) {
            return { ok: false, error: 'Email, password, and role are required.' };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { ok: false, error: 'Enter a valid email address.' };
        }
        if (password.length < 6) {
            return { ok: false, error: 'Password must be at least 6 characters.' };
        }
        if (STAFF_ROLES.indexOf(role) === -1) {
            return { ok: false, error: 'Role must be technician, frontdesk, or admin.' };
        }
        if (!firstName) {
            return { ok: false, error: 'First name is required so the person can be assigned to jobs.' };
        }
        if (!username) {
            return { ok: false, error: 'Username is required.' };
        }
        return { ok: true, email, password, role, firstName, lastName, username, employeeId };
    }

    function partyName(doc, fallback) {
        if (!doc) return fallback || '';
        return firstNonEmpty(doc.customer, doc.client, doc.customerName, doc.company, doc.name) || (fallback || '');
    }

    function findCustomer(customers, name) {
        const want = String(name || '').trim().toLowerCase();
        if (!want || !Array.isArray(customers)) return null;
        for (let i = 0; i < customers.length; i++) {
            const c = customers[i];
            if (!c) continue;
            const keys = [c.name, c.company, c.customer, c.customerName];
            for (let k = 0; k < keys.length; k++) {
                if (keys[k] && String(keys[k]).trim().toLowerCase() === want) return c;
            }
        }
        return null;
    }

    function stripVatSuffix(name, vat) {
        const raw = String(name || '').trim();
        if (!raw || !vat) return raw;
        const suffix = ' (VAT: ' + vat + ')';
        if (raw.slice(-suffix.length) === suffix) return raw.slice(0, -suffix.length).trim();
        return raw;
    }

    function parseMoney(val) {
        if (typeof val === 'number') return isFinite(val) ? Math.round(val * 100) / 100 : 0;
        let s = String(val == null ? '' : val).trim();
        if (!s) return 0;
        const neg = /^\s*-/.test(s) || s.indexOf('-') === 0;
        s = s.replace(/[^\d,.]/g, '');
        if (!s) return 0;
        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');
        if (lastComma !== -1 && lastDot !== -1) {
            if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
            else s = s.replace(/,/g, '');
        } else if (lastComma !== -1) {
            const parts = s.split(',');
            const tail = parts[parts.length - 1];
            if (parts.length > 2 || (tail.length === 3 && parts[0].length > 0 && parts.length === 2 && parts[0].length <= 3)) {
                s = parts.join('');
            } else s = parts[0] + '.' + parts.slice(1).join('');
        }
        const n = parseFloat(s);
        if (!isFinite(n)) return 0;
        return (neg ? -1 : 1) * Math.round(n * 100) / 100;
    }

    function moneyNumber(val) {
        return parseMoney(val);
    }

    function reconcileBooks(books) {
        const src = books || {};
        const invoices = src.invoices || [];
        const sales = src.sales || [];
        const expenses = src.expenses || [];
        const sum = function (list, pick) {
            return list.reduce(function (acc, row) {
                return Math.round((acc + parseMoney(pick(row))) * 100) / 100;
            }, 0);
        };
        const invTotal = sum(invoices, function (row) { return row && row.amount; });
        const posTotal = sum(sales, function (row) { return row && (row.total != null ? row.total : row.amount); });
        const expenseTotal = sum(expenses, function (row) { return row && row.amount; });
        const grandTotal = Math.round((invTotal + posTotal) * 100) / 100;
        const netProfit = Math.round((grandTotal - expenseTotal) * 100) / 100;
        return { invTotal: invTotal, posTotal: posTotal, expenseTotal: expenseTotal, grandTotal: grandTotal, netProfit: netProfit };
    }

    function isPrivateIp(ip) {
        let raw = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
        if (raw.indexOf('%') !== -1) raw = raw.split('%')[0];
        if (raw.indexOf('::ffff:') === 0) return isPrivateIp(raw.slice(7));
        if (raw === '::1' || raw === '::' || raw === '0.0.0.0') return true;
        const m = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!m) return false;
        const n = [1, 2, 3, 4].map(function (i) { return Number(m[i]); });
        if (n.some(function (x) { return x > 255; })) return true;
        const a = n[0];
        const b = n[1];
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        return false;
    }

    function ipv4FromHost(host) {
        const h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
        if (/^\d+$/.test(h)) {
            const n = Number(h);
            if (n >= 0 && n <= 0xffffffff) {
                return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
            }
        }
        if (/^0x[0-9a-f]+$/i.test(h)) {
            const n = parseInt(h, 16);
            if (n >= 0 && n <= 0xffffffff) {
                return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
            }
        }
        const parts = h.split('.');
        if (parts.length >= 2 && parts.length <= 4 && parts.every(function (p) { return /^\d+$/.test(p); })) {
            const nums = parts.map(Number);
            if (parts.length === 4) return nums.join('.');
            if (parts.length === 3) return nums[0] + '.' + nums[1] + '.0.' + nums[2];
            return nums[0] + '.0.0.' + nums[1];
        }
        return null;
    }

    function assessProxyUrl(raw) {
        let parsed;
        try { parsed = new URL(String(raw || '')); } catch (e) { return { ok: false, reason: 'bad-url' }; }
        if (parsed.username || parsed.password) return { ok: false, reason: 'userinfo' };
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'protocol' };
        const host = parsed.hostname.toLowerCase();
        if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
            return { ok: false, reason: 'host' };
        }
        const literal = ipv4FromHost(host);
        if (literal && isPrivateIp(literal)) return { ok: false, reason: 'private-literal' };
        if (host.indexOf(':') !== -1 && isPrivateIp(host)) return { ok: false, reason: 'private-literal' };
        return { ok: true, hostname: host, href: parsed.href };
    }

    function assessProxyHop(currentUrl, location) {
        let next;
        try { next = new URL(location, currentUrl).href; } catch (e) { return { ok: false, reason: 'bad-redirect' }; }
        return assessProxyUrl(next);
    }

    function qtyNumber(val) {
        const n = parseFloat(val);
        if (!isFinite(n) || n <= 0) return 1;
        return n;
    }

    function lineTotal(unit, qty) {
        const q = parseFloat(qty);
        const u = moneyNumber(unit);
        if (!isFinite(q) || q < 0) return 0;
        return Math.round(u * q * 100) / 100;
    }

    function vatAmount(subtotal, rate, enabled) {
        if (!enabled) return 0;
        const r = parseFloat(rate);
        const use = isFinite(r) ? r : 15;
        return Math.round(moneyNumber(subtotal) * (use / 100) * 100) / 100;
    }

    function grandTotal(subtotal, vat) {
        return Math.round((moneyNumber(subtotal) + moneyNumber(vat)) * 100) / 100;
    }

    function normalizeBillingItems(items) {
        if (!Array.isArray(items)) return [];
        const out = [];
        items.forEach(function (item) {
            if (!item || typeof item !== 'object') return;
            const desc = firstNonEmpty(item.desc, item.description, item.name, item.details);
            const unit = moneyNumber(item.unit != null ? item.unit : (item.unitPrice != null ? item.unitPrice : (item.price != null ? item.price : item.sell)));
            if (!desc && !unit) return;
            out.push({
                type: firstNonEmpty(item.type, item.category),
                desc: desc,
                unit: unit,
                qty: qtyNumber(item.qty != null ? item.qty : item.quantity)
            });
        });
        return out;
    }

    function mapSourceToBilling(source, customers) {
        const src = source || {};
        const rawName = partyName(src, '');
        const vatFromSource = firstNonEmpty(src.vat, src.vatNumber);
        const cleanedName = stripVatSuffix(rawName, vatFromSource);
        const directory = findCustomer(customers, cleanedName) || findCustomer(customers, rawName);
        const vat = firstNonEmpty(vatFromSource, directory && (directory.vat || directory.vatNumber));
        const customer = stripVatSuffix(cleanedName || rawName, vat);
        const phone = firstNonEmpty(src.phone, src.customerPhone, src.contactPhone, src.mobile, directory && directory.phone);
        const email = firstNonEmpty(src.email, src.customerEmail, src.clientEmail, directory && directory.email);
        const address = firstNonEmpty(src.address, src.siteAddress, src.physicalAddress, directory && directory.address);
        const regNo = firstNonEmpty(src.regNo, src.reg, src.companyReg, directory && (directory.regNo || directory.reg));
        return {
            customer: customer,
            customerId: directory && (directory.id || directory.uid) ? (directory.id || directory.uid) : '',
            phone: phone,
            email: email,
            address: address,
            vat: vat,
            regNo: regNo,
            items: normalizeBillingItems(src.items),
            sourceId: src.id || '',
            missing: {
                customer: !customer,
                phone: !phone,
                email: !email
            }
        };
    }

    function findInvoiceForSource(invoices, sourceId) {
        if (!sourceId) return null;
        const list = invoices || [];
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].sourceId === sourceId) return list[i];
        }
        return null;
    }

    function sourceCollectionName(sourceType) {
        if (sourceType === 'Workshop') return 'jobs';
        if (sourceType === 'Field') return 'fieldJobs';
        if (sourceType === 'Quotation') return 'quotations';
        return '';
    }

    function modalDismissDecision(opts) {
        const o = opts || {};
        if (o.force) return { action: 'close', confirm: false };
        if (o.protectedForm && o.reason === 'backdrop') return { action: 'ignore', confirm: false };
        if (o.protectedForm && o.dirty && (o.reason === 'escape' || o.reason === 'cancel' || o.reason === 'close')) {
            return { action: 'confirm', confirm: true };
        }
        return { action: 'close', confirm: false };
    }

    function planA4(pixelWidth, pixelHeight, marginMm) {
        const pw = Math.max(1, Number(pixelWidth) || 1);
        const ph = Math.max(1, Number(pixelHeight) || 1);
        const margin = (marginMm == null ? 12 : marginMm);
        const printableW = A4_WIDTH_MM - margin * 2;
        const printableH = A4_HEIGHT_MM - margin * 2;
        const imgW = printableW;
        const imgH = (ph * imgW) / pw;
        const placements = [];
        if (imgH <= printableH + 0.25) {
            placements.push({ page: 0, x: margin, y: margin, w: imgW, h: imgH });
        } else {
            let consumed = 0;
            let page = 0;
            while (consumed < imgH - 0.25 && page < 80) {
                placements.push({ page: page, x: margin, y: margin - consumed, w: imgW, h: imgH });
                consumed += printableH;
                page += 1;
            }
        }
        return {
            pageWidthMm: A4_WIDTH_MM,
            pageHeightMm: A4_HEIGHT_MM,
            marginMm: margin,
            imageWidthMm: Math.round(imgW * 100) / 100,
            imageHeightMm: Math.round(imgH * 100) / 100,
            printableWidthMm: printableW,
            printableHeightMm: printableH,
            pageCount: placements.length,
            stretched: false,
            placements: placements
        };
    }

    function applyA4Plan(pdf, imageData, pixelWidth, pixelHeight, format) {
        const plan = planA4(pixelWidth, pixelHeight);
        const fmt = format || 'JPEG';
        plan.placements.forEach(function (p, i) {
            if (i > 0 && pdf && typeof pdf.addPage === 'function') pdf.addPage();
            if (pdf && typeof pdf.addImage === 'function') pdf.addImage(imageData, fmt, p.x, p.y, p.w, p.h);
        });
        return plan;
    }

    function renderDescriptionCell(text) {
        const safe = escapeHtml(text || '').replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
        return '<td class="pdf-desc" style="padding:15px;border-bottom:1px solid #eeeeee;line-height:1.5;color:#111111;background-color:#ffffff;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;">' + safe + '</td>';
    }

    function buildJobReport(job, kind) {
        const src = job || {};
        const cd = src.completionData || {};
        const items = Array.isArray(src.items) ? src.items : [];
        const notes = Array.isArray(src.notes) ? src.notes : [];
        return {
            kind: kind || (src.device ? 'Workshop' : 'Field'),
            id: src.id || '',
            customer: partyName(src, ''),
            phone: firstNonEmpty(src.phone, src.customerPhone),
            email: firstNonEmpty(src.email, src.customerEmail),
            address: firstNonEmpty(src.address, src.siteAddress),
            contactPerson: firstNonEmpty(src.contactPerson),
            technician: firstNonEmpty(src.technician),
            status: firstNonEmpty(src.status),
            device: firstNonEmpty(src.device),
            fault: firstNonEmpty(src.faultDescription, src.description, src.desc),
            workPerformed: firstNonEmpty(cd.report, src.report),
            suggestions: firstNonEmpty(cd.suggestions),
            hoursSpent: firstNonEmpty(cd.hoursSpent),
            distanceKM: firstNonEmpty(cd.distanceKM),
            date: firstNonEmpty(src.date, src.dateBooked),
            parts: items.map(function (item) {
                return {
                    desc: firstNonEmpty(item && item.desc, item && item.description, item && item.name),
                    qty: item && item.qty != null ? item.qty : '',
                    unit: item && (item.unit != null ? item.unit : item.unitPrice)
                };
            }).filter(function (p) { return p.desc; }),
            notes: notes.map(function (n) {
                if (!n) return '';
                return [n.time, n.user, n.text].filter(Boolean).join(' — ');
            }).filter(Boolean),
            hasBeforePhoto: !!(cd.photoBefore),
            hasAfterPhoto: !!(cd.photoAfter)
        };
    }

    function reportRow(label, value) {
        if (value == null || String(value).trim() === '') return '';
        return '<tr><td style="padding:8px 12px;color:#111111;font-weight:700;width:180px;vertical-align:top;background:#f7f7fb;">' +
            escapeHtml(label) + '</td><td class="pdf-desc" style="padding:8px 12px;color:#111111;background:#ffffff;white-space:pre-wrap;word-wrap:break-word;">' +
            escapeHtml(value).replace(/\n/g, '<br>') + '</td></tr>';
    }

    function renderJobReportHtml(report) {
        const r = report || {};
        const parts = (r.parts || []).map(function (p) {
            const price = (p.unit === 0 || p.unit) ? (' — R ' + moneyNumber(p.unit).toFixed(2)) : '';
            return '<li style="color:#111111;margin:0 0 6px 0;">' + escapeHtml(String(p.qty || 1) + ' × ' + p.desc) + price + '</li>';
        }).join('');
        const notes = (r.notes || []).map(function (n) {
            return '<li style="color:#111111;margin:0 0 6px 0;">' + escapeHtml(n) + '</li>';
        }).join('');
        return '' +
            '<div style="font-family:Arial,sans-serif;color:#111111;background:#ffffff;">' +
            '<table style="width:100%;border-collapse:collapse;margin-bottom:18px;border:1px solid #e5e5e5;">' +
            reportRow('Job', r.id) +
            reportRow('Type', r.kind) +
            reportRow('Status', r.status) +
            reportRow('Date', r.date) +
            reportRow('Customer', r.customer) +
            reportRow('Contact', r.contactPerson) +
            reportRow('Phone', r.phone) +
            reportRow('Email', r.email) +
            reportRow('Address', r.address) +
            reportRow('Technician', r.technician) +
            reportRow('Device', r.device) +
            reportRow('Logged issue', r.fault) +
            reportRow('Work performed', r.workPerformed) +
            reportRow('Recommendations', r.suggestions) +
            reportRow('Hours', r.hoursSpent) +
            reportRow('Distance (km)', r.distanceKM) +
            '</table>' +
            '<h3 style="color:#111111;font-size:14px;margin:12px 0 8px;">Parts used</h3>' +
            (parts ? '<ul style="margin:0 0 16px 18px;padding:0;">' + parts + '</ul>' : '<p style="color:#111111;">No parts recorded.</p>') +
            '<h3 style="color:#111111;font-size:14px;margin:12px 0 8px;">Log</h3>' +
            (notes ? '<ul style="margin:0 0 16px 18px;padding:0;">' + notes + '</ul>' : '<p style="color:#111111;">No log notes.</p>') +
            ((r.hasBeforePhoto || r.hasAfterPhoto) ? '<p style="color:#111111;">Before/after photos were captured on the job and stay on the job record.</p>' : '') +
            '</div>';
    }

    function smtpState(settings) {
        if (!settings || typeof settings !== 'object') return 'unknown';
        const hasHost = Object.prototype.hasOwnProperty.call(settings, 'smtpHost');
        const hasUser = Object.prototype.hasOwnProperty.call(settings, 'smtpUser');
        if (!hasHost && !hasUser) return 'unknown';
        if (String(settings.smtpHost || '').trim() && String(settings.smtpUser || '').trim()) return 'ready';
        return 'missing';
    }

    const SMTP_BLOCKER = 'Email was not sent. Outbound email is not configured (Settings → Email needs an SMTP host and username). Nothing was delivered. This app does not fall back to a mailto link, because that would not reliably send the document.';

    function reviewedRecipient(confirmed, fallback) {
        if (confirmed && Object.prototype.hasOwnProperty.call(confirmed, 'recipient')) {
            return String(confirmed.recipient || '').trim();
        }
        return String(fallback || '').trim();
    }

    function reviewEmailDispatch(opts) {
        const o = opts || {};
        if (!o.confirmed) return { send: false, reason: 'cancelled' };
        const recipient = String(o.recipient || '').trim();
        if (!recipient || recipient.indexOf('@') === -1) {
            return { send: false, reason: 'missing-recipient', error: 'Enter the recipient email address before sending.' };
        }
        if (o.smtpState === 'missing' || o.smtpConfigured === false) {
            return { send: false, reason: 'smtp-not-configured', error: SMTP_BLOCKER };
        }
        return { send: true, recipient: recipient };
    }

    function canonicalRole(role) {
        const r = String(role == null ? '' : role).trim().toLowerCase();
        if (!r) return '';
        if (r === 'tech' || r === 'technician') return 'technician';
        if (r === 'front desk' || r === 'front-desk' || r === 'frontdesk') return 'frontdesk';
        if (r === 'administrator' || r === 'admin') return 'admin';
        if (r === 'customer' || r === 'client') return 'client';
        if (r === 'employee' || r === 'staff') return 'employee';
        return r;
    }

    function accountIsActive(value) {
        return !(value === false || value === 0 || value === '0' || value === 'false');
    }

    function isStaffAccount(user) {
        if (!user || typeof user !== 'object') return false;
        return canonicalRole(user.role) !== 'client';
    }

    function splitDirectory(users) {
        const staff = [];
        const clients = [];
        (Array.isArray(users) ? users : []).forEach(function (user) {
            if (!user || typeof user !== 'object') return;
            const row = Object.assign({}, user, {
                id: user.uid || user.id,
                uid: user.uid || user.id
            });
            if (isStaffAccount(row)) staff.push(row);
            else clients.push(row);
        });
        return { staff: staff, clients: clients };
    }

    function filterPeople(list, query) {
        const q = String(query == null ? '' : query).trim().toLowerCase();
        const rows = Array.isArray(list) ? list : [];
        if (!q) return rows.slice();
        return rows.filter(function (person) {
            if (!person || typeof person !== 'object') return false;
            const hay = ['email', 'username', 'firstName', 'lastName', 'employeeId', 'role', 'phone', 'uid', 'id', 'name']
                .map(function (key) {
                    const value = person[key];
                    if (value == null) return '';
                    return String(value).toLowerCase();
                })
                .join(' ');
            return hay.indexOf(q) !== -1;
        });
    }

    function parseStoredJson(value) {
        try {
            if (value == null || value === '') return null;
            if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value)) {
                value = value.toString('utf8');
            }
            if (typeof value === 'object') return value;
            const text = String(value);
            if (!text.trim()) return null;
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    const CUSTOMER_RECORD_KEYS = ['jobs', 'fieldJobs', 'invoices', 'quotations', 'tickets'];

    function customerLinkCount(customer, books) {
        const person = customer || {};
        const id = String(person.id || '');
        const name = String(person.name || person.customer || '').trim().toLowerCase();
        const email = String(person.email || '').trim().toLowerCase();
        let count = 0;
        CUSTOMER_RECORD_KEYS.forEach(function (key) {
            const list = books && books[key];
            (Array.isArray(list) ? list : []).forEach(function (doc) {
                if (!doc || typeof doc !== 'object') return;
                if (id && (String(doc.customerId || '') === id || String(doc.clientId || '') === id)) {
                    count += 1;
                    return;
                }
                const names = [doc.customer, doc.client, doc.customerName]
                    .map(function (value) { return String(value || '').trim().toLowerCase(); });
                if (name && names.indexOf(name) !== -1) {
                    count += 1;
                    return;
                }
                const emails = [doc.email, doc.customerEmail]
                    .map(function (value) { return String(value || '').trim().toLowerCase(); });
                if (email && emails.indexOf(email) !== -1) count += 1;
            });
        });
        return count;
    }

    function calloutSavePlan(opts) {
        const o = opts || {};
        const notify = !!o.notify;
        const email = String(o.email || '').trim();
        if (!notify) {
            return { save: true, send: false, notice: 'Call-out saved. Nobody was notified.' };
        }
        if (!email || email.indexOf('@') === -1) {
            return {
                save: true,
                send: false,
                notice: 'Call-out saved. No customer email was on the form, so no message was sent.'
            };
        }
        if (o.smtpState !== 'ready') {
            return {
                save: true,
                send: false,
                notice: 'Call-out saved. Email was not sent because SMTP is not set up. Nothing was sent.'
            };
        }
        return {
            save: true,
            send: true,
            recipient: email,
            notice: 'Call-out saved. A visit email was sent to ' + email + '.'
        };
    }

    var DEFAULT_TERMS_SHARED = [
        'Deposits for parts or special orders are not refundable once the parts have been ordered.',
        'A diagnostic or call-out fee may be charged for an inspection or an on-site visit, including when the repair is declined.',
        'Parts and equipment we supply remain the property of IT Guy Solutions until they are paid for in full.',
        'Labour is warranted for 3 months from collection or completion. Parts carry the supplier\'s warranty. Physical damage, liquid damage, and damage caused by the user are excluded.',
        'Backing up your data is your responsibility. We are not liable for loss of data, software, or settings.',
        'Please collect a device when we tell you it is ready. Storage fees may apply after 30 days. If it is still uncollected after 90 days, we may, after notice to you, dispose of it to recover unpaid costs.',
        'Our liability is limited to the amount you paid for the service or part concerned. We are not liable for indirect or consequential loss.',
        'Prices are in South African Rand (ZAR). VAT is added where the law requires it.',
        'Questions: info@itguysa.co.za.'
    ];

    function defaultDocumentTerms(docType) {
        var kind = String(docType || '');
        var lead = '';
        if (kind === 'Quotation') {
            lead = 'This quotation is valid for 14 days from its date and is an offer, not a tax invoice. Prices may change after it expires. A deposit may be required before parts are ordered or work begins. The balance is invoiced on completion and is due on receipt, or by the due date on that invoice. We accept EFT, card, and cash.';
        } else if (kind === 'Invoice') {
            lead = 'Payment is due on receipt, or by the due date shown on this invoice. We accept EFT, card, and cash. Please use the invoice number as your payment reference.';
        } else {
            lead = 'By leaving a device with us, you agree to the repair terms below.';
        }
        return [lead].concat(DEFAULT_TERMS_SHARED).join('\n');
    }

    function documentTerms(docType, settings) {
        var stored = settings || {};
        var custom = '';
        if (docType === 'Quotation') custom = stored.termsQuote;
        else if (docType === 'Invoice') custom = stored.termsInvoice;
        else if (docType === 'Job Card') custom = stored.termsJob;
        if (custom != null && String(custom).trim()) {
            return { source: 'custom', text: String(custom).trim() };
        }
        return { source: 'default', text: defaultDocumentTerms(docType) };
    }

    return {
        STAFF_ROLES: STAFF_ROLES,
        A4_WIDTH_MM: A4_WIDTH_MM,
        A4_HEIGHT_MM: A4_HEIGHT_MM,
        SMTP_BLOCKER: SMTP_BLOCKER,
        firstNonEmpty: firstNonEmpty,
        escapeHtml: escapeHtml,
        personName: personName,
        canAssignTechnician: canAssignTechnician,
        technicianCanSeeJob: technicianCanSeeJob,
        assignmentDenial: assignmentDenial,
        validateStaffCreate: validateStaffCreate,
        partyName: partyName,
        parseMoney: parseMoney,
        moneyNumber: moneyNumber,
        reconcileBooks: reconcileBooks,
        isPrivateIp: isPrivateIp,
        assessProxyUrl: assessProxyUrl,
        assessProxyHop: assessProxyHop,
        lineTotal: lineTotal,
        vatAmount: vatAmount,
        grandTotal: grandTotal,
        mapSourceToBilling: mapSourceToBilling,
        normalizeBillingItems: normalizeBillingItems,
        findInvoiceForSource: findInvoiceForSource,
        sourceCollectionName: sourceCollectionName,
        modalDismissDecision: modalDismissDecision,
        planA4: planA4,
        applyA4Plan: applyA4Plan,
        renderDescriptionCell: renderDescriptionCell,
        buildJobReport: buildJobReport,
        renderJobReportHtml: renderJobReportHtml,
        smtpState: smtpState,
        reviewedRecipient: reviewedRecipient,
        reviewEmailDispatch: reviewEmailDispatch,
        canonicalRole: canonicalRole,
        accountIsActive: accountIsActive,
        isStaffAccount: isStaffAccount,
        splitDirectory: splitDirectory,
        filterPeople: filterPeople,
        parseStoredJson: parseStoredJson,
        customerLinkCount: customerLinkCount,
        calloutSavePlan: calloutSavePlan,
        defaultDocumentTerms: defaultDocumentTerms,
        documentTerms: documentTerms
    };
});

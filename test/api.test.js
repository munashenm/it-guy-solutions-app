const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const dbFile = path.join(os.tmpdir(), `itguy-qa-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_TYPE = 'sqlite';
process.env.SQLITE_PATH = dbFile;
process.env.PORT = '0';
process.env.JWT_SECRET = 'qa-secret-not-production';

const app = require('../app');
const db = require('../database');
const fixes = require('../lib/itguy-fixes');

let base;

async function waitReady() {
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(base + '/status');
            const body = await res.json();
            if (body.dbStatus === 'Connected') return body;
        } catch (e) { /* server still binding */ }
        await new Promise(r => setTimeout(r, 150));
    }
    throw new Error('Database did not become ready');
}

async function login(email, password) {
    const res = await fetch(base + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const body = await res.json();
    if (res.status !== 200) throw new Error('Login failed ' + res.status + ' ' + JSON.stringify(body));
    return body;
}

function auth(token, extra) {
    return Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra || {});
}

test.before(async () => {
    await db.init();
    await new Promise(r => setTimeout(r, 200));
    const addr = app._httpServer.address();
    base = `http://127.0.0.1:${addr.port}/api`;
    await waitReady();
});

test.after(async () => {
    await new Promise(resolve => app._httpServer.close(() => resolve()));
    if (db.sqlite) await new Promise(resolve => db.sqlite.close(() => resolve()));
    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(dbFile + suffix, { force: true });
    }
});

test('technician lifecycle, assignment persistence, and role boundaries', async () => {
    const admin = await login('admin', 'admin123');
    const created = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'jane.tech@example.com',
            password: 'Welcome123!',
            role: 'technician',
            firstName: 'Jane',
            lastName: 'Doe',
            username: 'jane',
            employeeId: 'EMP-4242'
        })
    });
    const createdBody = await created.json();
    assert.equal(created.status, 200, JSON.stringify(createdBody));
    assert.equal(createdBody.user.role, 'technician');
    assert.equal(createdBody.user.password, undefined);

    const duplicate = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'jane.tech@example.com', password: 'Welcome123!', role: 'technician',
            firstName: 'Jane', username: 'jane2'
        })
    });
    assert.equal(duplicate.status, 409);

    const badRole = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ email: 'x@example.com', password: 'Welcome123!', role: 'owner', firstName: 'X', username: 'x' })
    });
    assert.equal(badRole.status, 400);

    const desk = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'desk@example.com', password: 'Welcome123!', role: 'frontdesk',
            firstName: 'Dee', lastName: 'Front', username: 'desk', employeeId: 'EMP-2'
        })
    });
    assert.equal(desk.status, 200);

    const users = await (await fetch(base + '/collections/users', { headers: auth(admin.token) })).json();
    const jane = users.find(u => u.email === 'jane.tech@example.com');
    assert.ok(jane, 'new technician is available from the users collection');
    assert.equal(jane.role, 'technician');
    assert.equal(jane.password, undefined);

    const techLogin = await login('jane', 'Welcome123!');
    assert.equal(techLogin.user.role, 'technician');
    const techCreate = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(techLogin.token),
        body: JSON.stringify({ email: 'other@example.com', password: 'Welcome123!', role: 'technician', firstName: 'Other', username: 'other' })
    });
    assert.equal(techCreate.status, 403);

    const jobRes = await fetch(base + '/collections/fieldJobs/FLD-1001', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            id: 'FLD-1001', customer: 'Northwind', client: '', phone: '0821111111',
            email: 'north@example.com', address: '12 Field Street', status: 'Scheduled', technician: '', items: []
        })
    });
    assert.equal(jobRes.status, 200);

    const assign = await fetch(base + '/collections/fieldJobs/FLD-1001', {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ technician: 'Jane Doe', technicianUid: jane.uid, technicianEmail: 'jane.tech@example.com' })
    });
    assert.equal(assign.status, 200);
    const stored = await (await fetch(base + '/collections/fieldJobs/FLD-1001', { headers: auth(admin.token) })).json();
    assert.equal(stored.technician, 'Jane Doe');
    assert.equal(stored.customer, 'Northwind');
    assert.equal(stored.phone, '0821111111');

    const steal = await fetch(base + '/collections/fieldJobs/FLD-1001', {
        method: 'PATCH',
        headers: auth(techLogin.token),
        body: JSON.stringify({ technician: 'Someone Else' })
    });
    assert.equal(steal.status, 403);
    const afterSteal = await (await fetch(base + '/collections/fieldJobs/FLD-1001', { headers: auth(admin.token) })).json();
    assert.equal(afterSteal.technician, 'Jane Doe');

    const checkin = await fetch(base + '/collections/fieldJobs/FLD-1001', {
        method: 'PATCH',
        headers: auth(techLogin.token),
        body: JSON.stringify({ status: 'On-site' })
    });
    assert.equal(checkin.status, 200);
    const afterCheckin = await (await fetch(base + '/collections/fieldJobs/FLD-1001', { headers: auth(admin.token) })).json();
    assert.equal(afterCheckin.status, 'On-site');
    assert.equal(afterCheckin.technician, 'Jane Doe');

    const deskLogin = await login('desk', 'Welcome123!');
    const reassign = await fetch(base + '/collections/fieldJobs/FLD-1001', {
        method: 'PATCH',
        headers: auth(deskLogin.token),
        body: JSON.stringify({ technician: 'Dee Front', technicianUid: '', technicianEmail: 'desk@example.com' })
    });
    assert.equal(reassign.status, 200);
    const finalJob = await (await fetch(base + '/collections/fieldJobs/FLD-1001', { headers: auth(admin.token) })).json();
    assert.equal(finalJob.technician, 'Dee Front');
    assert.equal(fixes.technicianCanSeeJob(finalJob, { uid: jane.uid, role: 'technician', email: 'jane.tech@example.com', firstName: 'Jane' }), false);
});

test('public tracking and client access do not leak private job fields', async () => {
    const admin = await login('admin', 'admin123');
    await fetch(base + '/collections/jobs/JOB-55', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            id: 'JOB-55', customer: 'Private Co', email: 'private@example.com', status: 'Booked',
            device: 'Laptop', devicePasscode: '9999', phone: '0820000000', technician: 'Jane Doe'
        })
    });
    const pub = await fetch(base + '/track/JOB-55');
    const pubBody = await pub.json();
    assert.equal(pub.status, 200);
    assert.equal(pubBody.status, 'Booked');
    assert.equal(pubBody.device, 'Laptop');
    assert.equal(pubBody.devicePasscode, undefined);
    assert.equal(pubBody.phone, undefined);
    assert.equal(pubBody.email, undefined);
    assert.deepEqual(Object.keys(pubBody).sort(), ['date', 'device', 'id', 'status', 'technician', 'type', 'updatedAt'].sort());

    const missing = await fetch(base + '/track/NO-SUCH');
    assert.equal(missing.status, 404);

    const reg = await fetch(base + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'customer@example.com', password: 'Welcome123!', firstName: 'Cara', lastName: 'Client', phone: '0823333333' })
    });
    const regBody = await reg.json();
    assert.equal(reg.status, 200, JSON.stringify(regBody));
    const clientJobs = await (await fetch(base + '/collections/jobs', { headers: auth(regBody.token) })).json();
    assert.equal(clientJobs.find(j => j.id === 'JOB-55'), undefined);
    const forbidden = await fetch(base + '/collections/jobs/JOB-55', { headers: auth(regBody.token) });
    assert.equal(forbidden.status, 403);
    const unauth = await fetch(base + '/collections/fieldJobs');
    assert.equal(unauth.status, 401);
});

test('email notify fails closed when SMTP is not configured and the image proxy blocks local URLs', async () => {
    const admin = await login('admin', 'admin123');
    const res = await fetch(base + '/notify', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            actionType: 'Email',
            docType: 'Job Report',
            docId: 'FLD-1001',
            contactInfo: 'north@example.com',
            customMessage: 'Synthetic report',
            subject: 'Job report'
        })
    });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.match(body.error, /not sent/i);
    assert.match(body.error, /SMTP/);
    assert.match(body.error, /mailto/);

    const proxy = await fetch(base + '/proxy-image?url=' + encodeURIComponent('http://127.0.0.1/secret'));
    assert.equal(proxy.status, 400);
    const fileProxy = await fetch(base + '/proxy-image?url=' + encodeURIComponent('file:///etc/passwd'));
    assert.equal(fileProxy.status, 400);
    const decimalIp = await fetch(base + '/proxy-image?url=' + encodeURIComponent('http://2130706433/secret'));
    assert.equal(decimalIp.status, 400);
    const nip = await fetch(base + '/proxy-image?url=' + encodeURIComponent('http://127.0.0.1.nip.io/secret'));
    assert.equal(nip.status, 400);
});

test('POS stock, purchases, expenses, backup safeguards, and permissions', async () => {
    const admin = await login('admin', 'admin123');
    const desk = await login('desk', 'Welcome123!');
    const client = await login('customer@example.com', 'Welcome123!');

    const seeded = await fetch(base + '/collections/inventory/sku-cable', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ id: 'sku-cable', name: 'Cable', sku: 'CBL', qty: 5, sell: 'R 10.00', cost: 'R 4.00' })
    });
    assert.equal(seeded.status, 200);

    const sale = await fetch(base + '/transaction/batch', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            updates: [
                { coll: 'inventory', id: 'sku-cable', method: 'update', data: { qty: { _type: 'increment', value: -2 } } },
                { coll: 'sales', id: 'REC-1', method: 'set', data: { id: 'REC-1', customer: 'Walk-in', total: 20, method: 'Cash', items: [{ name: 'Cable', qty: 2 }], date: new Date().toISOString(), status: 'Completed' } }
            ]
        })
    });
    assert.equal(sale.status, 200, await sale.clone().text());
    let stock = await (await fetch(base + '/collections/inventory/sku-cable', { headers: auth(admin.token) })).json();
    assert.equal(stock.qty, 3);
    const savedSale = await (await fetch(base + '/collections/sales/REC-1', { headers: auth(admin.token) })).json();
    assert.equal(savedSale.total, 20);

    const over = await fetch(base + '/transaction/batch', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ updates: [{ coll: 'inventory', id: 'sku-cable', method: 'update', data: { qty: { _type: 'increment', value: -10 } } }] })
    });
    assert.equal(over.status, 409);
    stock = await (await fetch(base + '/collections/inventory/sku-cable', { headers: auth(admin.token) })).json();
    assert.equal(stock.qty, 3);

    const deskSale = await fetch(base + '/transaction/batch', {
        method: 'POST',
        headers: auth(desk.token),
        body: JSON.stringify({ updates: [{ coll: 'inventory', id: 'sku-cable', method: 'update', data: { qty: { _type: 'increment', value: -1 } } }] })
    });
    assert.equal(deskSale.status, 200, await deskSale.clone().text());
    stock = await (await fetch(base + '/collections/inventory/sku-cable', { headers: auth(admin.token) })).json();
    assert.equal(stock.qty, 2);

    const received = await fetch(base + '/transaction/batch', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ updates: [{ coll: 'inventory', id: 'sku-cable', method: 'update', data: { qty: { _type: 'increment', value: 4 } } }] })
    });
    assert.equal(received.status, 200);
    stock = await (await fetch(base + '/collections/inventory/sku-cable', { headers: auth(admin.token) })).json();
    assert.equal(stock.qty, 6);

    const clientStock = await fetch(base + '/transaction/batch', {
        method: 'POST',
        headers: auth(client.token),
        body: JSON.stringify({ updates: [{ coll: 'inventory', id: 'sku-cable', method: 'update', data: { qty: { _type: 'increment', value: -1 } } }] })
    });
    assert.equal(clientStock.status, 403);

    const expense = await fetch(base + '/collections/expenses/EXP-1', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ id: 'EXP-1', description: 'Rent', category: 'Premises', amount: '1 234,56', date: new Date().toISOString().slice(0, 10) })
    });
    assert.equal(expense.status, 200);
    const storedExpense = await (await fetch(base + '/collections/expenses/EXP-1', { headers: auth(admin.token) })).json();
    assert.equal(storedExpense.amount, '1 234,56');
    assert.equal(fixes.reconcileBooks({
        invoices: [],
        sales: [savedSale],
        expenses: [storedExpense]
    }).netProfit, -1214.56);

    const clientBackup = await fetch(base + '/backup', { headers: auth(client.token) });
    assert.equal(clientBackup.status, 403);
    const backup = await fetch(base + '/backup', { headers: auth(admin.token) });
    assert.equal(backup.status, 200);
    const backupBytes = Buffer.from(await backup.arrayBuffer());
    assert.equal(backupBytes.subarray(0, 15).toString(), 'SQLite format 3');

    const badRestore = new FormData();
    badRestore.append('database', new Blob([Buffer.from('not a database')]), 'bad.txt');
    const restored = await fetch(base + '/restore', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + admin.token },
        body: badRestore
    });
    assert.equal(restored.status, 400);
    const stillThere = await login('admin', 'admin123');
    assert.equal(stillThere.user.role, 'admin');

    const marker = await fetch(base + '/collections/expenses/EXP-KEEP', {
        method: 'POST',
        headers: auth(stillThere.token),
        body: JSON.stringify({ id: 'EXP-KEEP', description: 'Keep me', category: 'Other', amount: '10.00', date: '2026-11-12' })
    });
    assert.equal(marker.status, 200);
    const goodBackup = await fetch(base + '/backup', { headers: auth(stillThere.token) });
    assert.equal(goodBackup.status, 200);
    const goodBytes = Buffer.from(await goodBackup.arrayBuffer());
    assert.equal(goodBytes.subarray(0, 15).toString(), 'SQLite format 3');
    const gone = await fetch(base + '/collections/expenses/EXP-GONE', {
        method: 'POST',
        headers: auth(stillThere.token),
        body: JSON.stringify({ id: 'EXP-GONE', description: 'Should disappear', category: 'Other', amount: '1.00', date: '2026-11-12' })
    });
    assert.equal(gone.status, 200);
    const goodRestore = new FormData();
    goodRestore.append('database', new Blob([goodBytes]), 'good.sqlite');
    const restoredGood = await fetch(base + '/restore', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + stillThere.token },
        body: goodRestore
    });
    assert.equal(restoredGood.status, 200, await restoredGood.clone().text());
    const afterRestore = await login('admin', 'admin123');
    assert.equal(afterRestore.user.role, 'admin');
    const kept = await fetch(base + '/collections/expenses/EXP-KEEP', { headers: auth(afterRestore.token) });
    const goneAfter = await fetch(base + '/collections/expenses/EXP-GONE', { headers: auth(afterRestore.token) });
    assert.equal(kept.status, 200);
    assert.equal((await kept.json()).description, 'Keep me');
    assert.equal(goneAfter.status, 404);

    const clientNotify = await fetch(base + '/notify', {
        method: 'POST',
        headers: auth(client.token),
        body: JSON.stringify({ actionType: 'Email', docType: 'Job Report', docId: 'FLD-1001', contactInfo: 'a@b.co' })
    });
    assert.equal(clientNotify.status, 403);
});

function startFakeSmtp() {
    const messages = [];
    const server = net.createServer((socket) => {
        socket.write('220 fake.local ESMTP\r\n');
        let mode = 'cmd';
        let body = '';
        socket.on('data', (chunk) => {
            const text = chunk.toString();
            if (mode === 'data') {
                body += text;
                if (body.includes('\r\n.\r\n')) {
                    messages.push(body);
                    body = '';
                    mode = 'cmd';
                    socket.write('250 queued\r\n');
                }
                return;
            }
            text.split(/\r\n/).forEach((line) => {
                if (!line) return;
                if (/^DATA$/i.test(line)) {
                    mode = 'data';
                    socket.write('354 send\r\n');
                } else if (/^QUIT/i.test(line)) {
                    socket.end('221 bye\r\n');
                } else {
                    socket.write('250 ok\r\n');
                }
            });
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, messages }));
    });
}

test('report email is captured by a local SMTP sink and failure stays an error', async () => {
    const admin = await login('admin', 'admin123');
    const smtp = await startFakeSmtp();
    try {
        const saved = await fetch(base + '/collections/settings/systemSettings', {
            method: 'PATCH',
            headers: auth(admin.token),
            body: JSON.stringify({
                smtpHost: '127.0.0.1',
                smtpPort: String(smtp.port),
                smtpUser: 'qa-mailer',
                smtpPass: 'qa-secret',
                emailName: 'QA Bench'
            })
        });
        assert.equal(saved.status, 200, await saved.clone().text());

        const sent = await fetch(base + '/notify', {
            method: 'POST',
            headers: auth(admin.token),
            body: JSON.stringify({
                actionType: 'Email',
                docType: 'Job Report',
                docId: 'FLD-1001',
                contactInfo: 'north@example.com',
                subject: 'Job report FLD-1001',
                customMessage: 'Synthetic report body'
            })
        });
        const sentBody = await sent.json();
        assert.equal(sent.status, 200, JSON.stringify(sentBody));
        assert.equal(smtp.messages.length, 1);
        assert.match(smtp.messages[0], /north@example.com/);
        assert.match(smtp.messages[0], /Synthetic report body/);
        assert.doesNotMatch(smtp.messages[0], /qa-secret/);

        const missing = await fetch(base + '/notify', {
            method: 'POST',
            headers: auth(admin.token),
            body: JSON.stringify({ actionType: 'Email', docType: 'Job Report', docId: 'FLD-1001', contactInfo: '' })
        });
        assert.equal(missing.status, 400);
        assert.equal(smtp.messages.length, 1);

        const broken = await fetch(base + '/collections/settings/systemSettings', {
            method: 'PATCH',
            headers: auth(admin.token),
            body: JSON.stringify({ smtpHost: '127.0.0.1', smtpPort: '1', smtpUser: 'qa-mailer' })
        });
        assert.equal(broken.status, 200);
        const failed = await fetch(base + '/notify', {
            method: 'POST',
            headers: auth(admin.token),
            body: JSON.stringify({
                actionType: 'Email',
                docType: 'Job Report',
                docId: 'FLD-1001',
                contactInfo: 'north@example.com',
                customMessage: 'should not deliver'
            })
        });
        assert.notEqual(failed.status, 200);
        const failedBody = await failed.json();
        assert.match(failedBody.error, /ECONNREFUSED|connect|Invalid|error|fail/i);
        assert.equal(smtp.messages.length, 1);
    } finally {
        await new Promise((resolve) => smtp.server.close(resolve));
    }
});

test('device push tokens are stored per user and job events stay safe without Firebase', async () => {
    const push = require('../services/pushService');
    push.clearAttempts();

    const anon = await fetch(base + '/devices/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'a'.repeat(32) })
    });
    assert.equal(anon.status, 401);

    const admin = await login('admin', 'admin123');
    const bad = await fetch(base + '/devices/push-token', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ token: 'short' })
    });
    assert.equal(bad.status, 400);

    const created = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'push.tech@example.com',
            password: 'Welcome123!',
            role: 'technician',
            firstName: 'Push',
            lastName: 'Tech',
            username: 'pushtech',
            employeeId: 'EMP-9001'
        })
    });
    const createdBody = await created.json();
    assert.equal(created.status, 200, JSON.stringify(createdBody));

    const tech = await login('pushtech', 'Welcome123!');
    const techToken = 'fcm-push-tech-' + 'b'.repeat(24);
    const saved = await fetch(base + '/devices/push-token', {
        method: 'POST',
        headers: auth(tech.token),
        body: JSON.stringify({ token: techToken, platform: 'android' })
    });
    assert.equal(saved.status, 200);
    const again = await fetch(base + '/devices/push-token', {
        method: 'POST',
        headers: auth(tech.token),
        body: JSON.stringify({ token: techToken, platform: 'android' })
    });
    assert.equal(again.status, 200);

    const mine = await (await fetch(base + '/devices/push-tokens', { headers: auth(tech.token) })).json();
    assert.equal(mine.tokens.length, 1);
    assert.equal(mine.tokens[0].token, techToken);
    assert.equal(mine.tokens[0].platform, 'android');

    const adminList = await (await fetch(base + '/devices/push-tokens', { headers: auth(admin.token) })).json();
    assert.equal(adminList.tokens.some((row) => row.token === techToken), false);

    push.clearAttempts();
    const callout = await fetch(base + '/collections/fieldJobs/FLD-PUSH-1', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            id: 'FLD-PUSH-1',
            customer: 'Acme Site',
            status: 'Scheduled',
            technician: 'Push Tech',
            technicianUid: tech.user.uid,
            technicianEmail: 'push.tech@example.com'
        })
    });
    assert.equal(callout.status, 200);
    const assignment = push.attempts.find((row) => row.type === 'assignment' && row.token === techToken);
    assert.ok(assignment, JSON.stringify(push.attempts));
    assert.equal(assignment.skipped, true);
    assert.equal(assignment.reason, 'unconfigured');
    assert.match(assignment.body, /Acme Site/);
    assert.equal(push.attempts.some((row) => row.type === 'status' && row.token === techToken), false);

    push.clearAttempts();
    const workshop = await fetch(base + '/collections/jobs/JOB-PUSH-1', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            id: 'JOB-PUSH-1',
            customer: 'Walk-in',
            status: 'Booked',
            technician: 'Push Tech'
        })
    });
    assert.equal(workshop.status, 200);
    const byName = push.attempts.find((row) => row.type === 'assignment' && row.id === 'JOB-PUSH-1');
    assert.ok(byName, JSON.stringify(push.attempts));
    assert.equal(byName.uid, tech.user.uid);

    push.clearAttempts();
    const status = await fetch(base + '/collections/fieldJobs/FLD-PUSH-1', {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ status: 'On-site' })
    });
    assert.equal(status.status, 200);
    const statusEvent = push.attempts.find((row) => row.type === 'status' && row.token === techToken);
    assert.ok(statusEvent, JSON.stringify(push.attempts));
    assert.match(statusEvent.body, /On-site/);
    assert.equal(statusEvent.skipped, true);

    push.clearAttempts();
    const same = await fetch(base + '/collections/fieldJobs/FLD-PUSH-1', {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ status: 'On-site' })
    });
    assert.equal(same.status, 200);
    assert.equal(push.attempts.some((row) => row.type === 'status'), false);

    const removed = await fetch(base + '/devices/push-token', {
        method: 'DELETE',
        headers: auth(tech.token),
        body: JSON.stringify({ token: techToken })
    });
    assert.equal(removed.status, 200);
    const after = await (await fetch(base + '/devices/push-tokens', { headers: auth(tech.token) })).json();
    assert.equal(after.tokens.length, 0);

    const other = await fetch(base + '/devices/push-token', {
        method: 'DELETE',
        headers: auth(admin.token),
        body: JSON.stringify({ token: 'missing-token-value-000000' })
    });
    assert.equal(other.status, 200);
});

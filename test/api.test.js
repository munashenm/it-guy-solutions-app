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

test('staff directory lists sql-only, collection-only, and legacy roles', async () => {
    const status = await (await fetch(base + '/status')).json();
    assert.equal(status.version, '4.9');

    const admin = await login('admin', 'admin123');
    const created = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'qa-test-tech@example.com', password: 'Welcome123!', role: 'technician',
            firstName: 'Qa', lastName: 'Tech', username: 'qatech', employeeId: 'EMP-QA'
        })
    });
    const createdBody = await created.json();
    assert.equal(created.status, 200, JSON.stringify(createdBody));
    const uid = createdBody.user.uid;

    await db.run("DELETE FROM collections WHERE name = 'users' AND id = ?", [uid]);
    await db.run(
        "INSERT INTO users (uid, email, role, firstName) VALUES (?, ?, ?, ?)",
        ['legacy-tech', 'old.tech@example.com', 'Technician', 'Old']
    );
    await db.run(
        "INSERT INTO collections (id, name, data, updatedAt) VALUES (?, 'users', ?, CURRENT_TIMESTAMP)",
        ['user-json', JSON.stringify({ uid: 'user-json', email: 'json.only@example.com', role: 'tech', firstName: 'Json' })]
    );

    const listedRes = await fetch(base + '/users', { headers: auth(admin.token) });
    const listed = await listedRes.json();
    assert.equal(listedRes.status, 200, JSON.stringify(listed));
    const byEmail = Object.fromEntries(listed.map(u => [u.email, u]));
    assert.equal(byEmail['qa-test-tech@example.com'].role, 'technician');
    assert.equal(byEmail['qa-test-tech@example.com'].storage, 'sql');
    assert.equal(byEmail['qa-test-tech@example.com'].password, undefined);
    assert.equal(byEmail['old.tech@example.com'].role, 'technician');
    assert.equal(byEmail['json.only@example.com'].role, 'technician');
    assert.equal(byEmail['json.only@example.com'].storage, 'collection');
    assert.equal(fixes.isStaffAccount(byEmail['old.tech@example.com']), true);

    const edited = await fetch(base + '/users/' + uid, {
        method: 'PUT',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'qa-test-tech@example.com', username: 'qatech', firstName: 'Qa', lastName: 'Updated',
            employeeId: 'EMP-QA', phone: '', role: 'technician'
        })
    });
    assert.equal(edited.status, 200, await edited.text());

    const off = await fetch(base + '/users/' + uid + '/status', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ active: false })
    });
    assert.equal(off.status, 200, await off.text());
    const afterOff = await (await fetch(base + '/users', { headers: auth(admin.token) })).json();
    const inactive = afterOff.find(u => u.uid === uid);
    assert.equal(inactive.active, false);
    const blocked = await fetch(base + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'qa-test-tech@example.com', password: 'Welcome123!' })
    });
    assert.equal(blocked.status, 403);

    const selfOff = await fetch(base + '/users/' + admin.user.uid + '/status', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ active: false })
    });
    assert.equal(selfOff.status, 400);

    const removed = await fetch(base + '/users/' + uid, { method: 'DELETE', headers: auth(admin.token) });
    assert.equal(removed.status, 200);
    const afterDelete = await (await fetch(base + '/users', { headers: auth(admin.token) })).json();
    assert.equal(afterDelete.some(u => u.uid === uid), false);
});

test('customers can be deleted only when they have no records, otherwise archived', async () => {
    const admin = await login('admin', 'admin123');
    const tech = await fetch(base + '/users', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
            email: 'cust.guard@example.com', password: 'Welcome123!', role: 'technician',
            firstName: 'Guard', lastName: 'Tech', username: 'custguard', employeeId: 'EMP-G'
        })
    });
    const techBody = await tech.json();
    assert.equal(tech.status, 200, JSON.stringify(techBody));
    const techLogin = await login('custguard', 'Welcome123!');

    async function putCustomer(id, body) {
        const res = await fetch(base + '/collections/customers/' + id, {
            method: 'POST',
            headers: auth(admin.token),
            body: JSON.stringify(body)
        });
        assert.equal(res.status, 200, await res.text());
    }

    await putCustomer('cust-free', { name: 'Free Customer', email: 'free@example.com', phone: '0820000001' });
    await putCustomer('cust-busy', { name: 'Busy Customer', email: 'busy@example.com', phone: '0820000002' });
    const job = await fetch(base + '/collections/jobs/JOB-BUSY', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ id: 'JOB-BUSY', customer: 'Busy Customer', status: 'Received' })
    });
    assert.equal(job.status, 200, await job.text());

    const forbidden = await fetch(base + '/customers/cust-free', { method: 'DELETE', headers: auth(techLogin.token) });
    assert.equal(forbidden.status, 403);

    const blocked = await fetch(base + '/customers/cust-busy', { method: 'DELETE', headers: auth(admin.token) });
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 409);
    assert.match(blockedBody.error, /Archive/);

    const archived = await fetch(base + '/customers/cust-busy/archive', { method: 'POST', headers: auth(admin.token) });
    const archivedBody = await archived.json();
    assert.equal(archived.status, 200, JSON.stringify(archivedBody));
    assert.equal(archivedBody.customer.archived, true);
    const kept = await (await fetch(base + '/collections/jobs/JOB-BUSY', { headers: auth(admin.token) })).json();
    assert.equal(kept.customer, 'Busy Customer');

    const restored = await fetch(base + '/customers/cust-busy/restore', { method: 'POST', headers: auth(admin.token) });
    assert.equal(restored.status, 200);
    const restoredDoc = await (await fetch(base + '/collections/customers/cust-busy', { headers: auth(admin.token) })).json();
    assert.equal(restoredDoc.archived, false);

    const deleted = await fetch(base + '/customers/cust-free', { method: 'DELETE', headers: auth(admin.token) });
    assert.equal(deleted.status, 200, await deleted.text());
    const gone = await fetch(base + '/collections/customers/cust-free', { headers: auth(admin.token) });
    assert.equal(gone.status, 404);
});

test('server files are not served as static assets', async () => {
    const origin = base.replace(/\/api$/, '');
    for (const hidden of ['/database.js', '/package.json', '/app.js', '/.env.example', '/routes/users.js', '/lib/secret.js', '/deploy.zip', '/startup_log.txt']) {
        const res = await fetch(origin + hidden);
        assert.equal(res.status, 404, hidden);
    }
    assert.equal((await fetch(origin + '/version.js')).status, 200);
    assert.equal((await fetch(origin + '/index.html')).status, 200);
    assert.equal((await fetch(origin + '/lib/itguy-fixes.js')).status, 200);
    assert.equal((await fetch(origin + '/js/app.js')).status, 200);
});

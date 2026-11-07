const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
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
});

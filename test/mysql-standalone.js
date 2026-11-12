/**
 * Isolated MariaDB fixture. Refuses to run unless ITGUY_MYSQL_FIXTURE=1
 * and the connection points at 127.0.0.1. Never reads production secrets.
 */
const http = require('http');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const host = process.env.ITGUY_MYSQL_HOST || '127.0.0.1';
const port = Number(process.env.ITGUY_MYSQL_PORT || 3307);
const socketPath = process.env.ITGUY_MYSQL_SOCKET || '/tmp/maria-qa.sock';
const dbName = 'itguy_qa';
const dbUser = 'itguy';
const dbPass = 'fixture-pass';

function fail(msg) {
    console.error(msg);
    process.exit(1);
}

async function adminConn() {
    return mysql.createConnection({ socketPath, user: 'root', multipleStatements: true });
}

async function columns(conn) {
    const [rows] = await conn.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [dbName, 'users']
    );
    return rows.map(r => r.COLUMN_NAME);
}

function waitStatus(url) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            http.get(url, (res) => {
                let body = '';
                res.on('data', c => { body += c; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.dbStatus === 'Connected' && json.dbType === 'mysql') return resolve(json);
                    } catch (e) { /* retry */ }
                    if (Date.now() - started > 20000) return reject(new Error('MySQL app did not become ready: ' + body));
                    setTimeout(tick, 250);
                });
            }).on('error', () => {
                if (Date.now() - started > 20000) return reject(new Error('MySQL app did not listen'));
                setTimeout(tick, 250);
            });
        };
        tick();
    });
}

async function main() {
    if (host !== '127.0.0.1') fail('Refusing MySQL fixture: host must be 127.0.0.1');
    let conn;
    try {
        conn = await adminConn();
    } catch (e) {
        console.log('SKIP MySQL fixture: ' + e.message);
        process.exit(0);
    }
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await conn.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'127.0.0.1' IDENTIFIED BY '${dbPass}'`);
    await conn.query(`GRANT ALL ON \`${dbName}\`.* TO '${dbUser}'@'127.0.0.1'`);
    await conn.query('FLUSH PRIVILEGES');
    await conn.query(`DROP TABLE IF EXISTS \`${dbName}\`.collections`);
    await conn.query(`DROP TABLE IF EXISTS \`${dbName}\`.users`);
    await conn.query(`CREATE TABLE \`${dbName}\`.users (
        uid VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255)
    )`);
    await conn.query(`INSERT INTO \`${dbName}\`.users (uid, email) VALUES ('legacy-admin', 'legacy@example.com')`);
    const before = await columns(conn);
    if (before.includes('password') || before.includes('role')) fail('Fixture table was not the legacy shape');

    const appPort = 3477;
    const child = spawn(process.execPath, ['app.js'], {
        cwd: require('path').join(__dirname, '..'),
        env: Object.assign({}, process.env, {
            DB_TYPE: 'mysql',
            DB_HOST: host,
            DB_PORT: String(port),
            DB_USER: dbUser,
            DB_PASSWORD: dbPass,
            DB_NAME: dbName,
            PORT: String(appPort),
            JWT_SECRET: 'mysql-fixture-secret'
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let logs = '';
    child.stdout.on('data', d => { logs += d.toString(); });
    child.stderr.on('data', d => { logs += d.toString(); });
    try {
        const status = await waitStatus('http://127.0.0.1:' + appPort + '/api/status');
        if (status.dbType !== 'mysql') fail('App did not report mysql');
        const after = await columns(conn);
        ['password', 'role', 'username', 'firstName', 'lastName', 'employeeId', 'phone', 'sessionToken', 'active'].forEach(col => {
            if (!after.includes(col)) fail('Migration did not add column ' + col + ' columns=' + after.join(','));
        });
        if (status.version !== '4.9') fail('Status version is ' + status.version + ', expected 4.9');
        const [legacy] = await conn.query(`SELECT email FROM \`${dbName}\`.users WHERE uid = 'legacy-admin'`);
        if (!legacy.length || legacy[0].email !== 'legacy@example.com') fail('Legacy user row was lost');

        const hash = await bcrypt.hash('admin123', 4);
        await conn.query(
            `UPDATE \`${dbName}\`.users SET password = ?, role = 'admin', username = 'legacy', firstName = 'Legacy', lastName = 'Admin' WHERE uid = 'legacy-admin'`,
            [hash]
        );

        const loginRes = await fetch('http://127.0.0.1:' + appPort + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'legacy', password: 'admin123' })
        });
        const login = await loginRes.json();
        if (loginRes.status !== 200) fail('Legacy admin login failed ' + JSON.stringify(login));
        const headers = { Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json' };

        const techRes = await fetch('http://127.0.0.1:' + appPort + '/api/users', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email: 'mysql.tech@example.com', password: 'Welcome123!', role: 'technician',
                firstName: 'My', lastName: 'Sql', username: 'mysqltech', employeeId: 'EMP-M'
            })
        });
        const tech = await techRes.json();
        if (techRes.status !== 200) fail('Technician create failed ' + JSON.stringify(tech));

        const jobRes = await fetch('http://127.0.0.1:' + appPort + '/api/collections/fieldJobs/FLD-M1', {
            method: 'POST', headers,
            body: JSON.stringify({ id: 'FLD-M1', customer: 'Mysql Client', phone: '0820000000', status: 'Scheduled', technician: '' })
        });
        if (jobRes.status !== 200) fail('Field job create failed ' + await jobRes.text());
        const assign = await fetch('http://127.0.0.1:' + appPort + '/api/collections/fieldJobs/FLD-M1', {
            method: 'PATCH', headers,
            body: JSON.stringify({ technician: 'My Sql', technicianUid: tech.user.uid, technicianEmail: 'mysql.tech@example.com' })
        });
        if (assign.status !== 200) fail('Assign failed ' + await assign.text());

        const inv = await fetch('http://127.0.0.1:' + appPort + '/api/collections/invoices/INV-M1', {
            method: 'POST', headers,
            body: JSON.stringify({
                id: 'INV-M1', customer: 'Mysql Client', phone: '0820000000', amount: 'R 10.00',
                sourceType: 'Field', sourceId: 'FLD-M1', sourceCollection: 'fieldJobs', items: []
            })
        });
        if (inv.status !== 200) fail('Invoice create failed ' + await inv.text());
        const stored = await (await fetch('http://127.0.0.1:' + appPort + '/api/collections/invoices/INV-M1', { headers })).json();
        if (stored.sourceId !== 'FLD-M1' || stored.customer !== 'Mysql Client') fail('Invoice source fields missing ' + JSON.stringify(stored));
        const job = await (await fetch('http://127.0.0.1:' + appPort + '/api/collections/fieldJobs/FLD-M1', { headers })).json();
        if (job.technician !== 'My Sql') fail('Assignment did not persist on MySQL');

        await conn.query(`DELETE FROM \`${dbName}\`.collections WHERE name = 'users' AND id = ?`, [tech.user.uid]);
        await conn.query(
            `INSERT INTO \`${dbName}\`.users (uid, email, role, firstName) VALUES ('old-tech', 'old.tech@example.com', 'Technician', 'Old')`
        );
        await conn.query(
            `INSERT INTO \`${dbName}\`.collections (id, name, data, updatedAt) VALUES ('user-json', 'users', ?, CURRENT_TIMESTAMP)`,
            [JSON.stringify({ uid: 'user-json', email: 'json.only@example.com', role: 'tech', firstName: 'Json' })]
        );
        try {
            await conn.query(`ALTER TABLE \`${dbName}\`.collections MODIFY data JSON`);
            await conn.query(
                `INSERT INTO \`${dbName}\`.collections (id, name, data, updatedAt) VALUES ('user-json-col', 'users', CAST(? AS JSON), CURRENT_TIMESTAMP)`,
                [JSON.stringify({ uid: 'user-json-col', email: 'json.column@example.com', role: 'Technician', firstName: 'Column' })]
            );
        } catch (alterErr) {
            console.log('MySQL JSON column check skipped: ' + alterErr.message);
        }

        const directoryRes = await fetch('http://127.0.0.1:' + appPort + '/api/users', { headers });
        const directory = await directoryRes.json();
        if (directoryRes.status !== 200 || !Array.isArray(directory)) fail('Directory failed ' + JSON.stringify(directory));
        const byEmail = {};
        directory.forEach(u => { byEmail[u.email] = u; });
        if (!byEmail['mysql.tech@example.com'] || byEmail['mysql.tech@example.com'].storage !== 'sql') {
            fail('SQL-only technician missing from directory ' + JSON.stringify(directory));
        }
        if (!byEmail['legacy@example.com']) fail('Legacy admin missing from directory');
        if (!byEmail['old.tech@example.com'] || byEmail['old.tech@example.com'].role !== 'technician') {
            fail('Legacy Technician role was not listed ' + JSON.stringify(byEmail['old.tech@example.com']));
        }
        if (!byEmail['json.only@example.com'] || byEmail['json.only@example.com'].role !== 'technician') {
            fail('Collection-only tech missing ' + JSON.stringify(byEmail['json.only@example.com']));
        }
        if (byEmail['json.column@example.com'] && byEmail['json.column@example.com'].role !== 'technician') {
            fail('JSON-column tech was dropped or not normalised');
        }
        directory.forEach(u => {
            if (u.password || u.sessionToken) fail('Directory leaked a secret for ' + u.email);
        });

        const off = await fetch('http://127.0.0.1:' + appPort + '/api/users/' + tech.user.uid + '/status', {
            method: 'POST', headers, body: JSON.stringify({ active: false })
        });
        if (off.status !== 200) fail('Deactivate failed ' + await off.text());
        const loginOff = await fetch('http://127.0.0.1:' + appPort + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'mysql.tech@example.com', password: 'Welcome123!' })
        });
        if (loginOff.status !== 403) fail('Deactivated technician could still log in ' + loginOff.status);

        const free = await fetch('http://127.0.0.1:' + appPort + '/api/collections/customers/cust-free', {
            method: 'POST', headers,
            body: JSON.stringify({ name: 'Free Customer', email: 'free@example.com' })
        });
        if (free.status !== 200) fail('Customer create failed ' + await free.text());
        const del = await fetch('http://127.0.0.1:' + appPort + '/api/customers/cust-free', { method: 'DELETE', headers });
        if (del.status !== 200) fail('Customer delete failed ' + await del.text());
        const busy = await fetch('http://127.0.0.1:' + appPort + '/api/collections/customers/cust-busy', {
            method: 'POST', headers,
            body: JSON.stringify({ name: 'Mysql Client', email: 'busy@example.com' })
        });
        if (busy.status !== 200) fail('Busy customer create failed ' + await busy.text());
        const blocked = await fetch('http://127.0.0.1:' + appPort + '/api/customers/cust-busy', { method: 'DELETE', headers });
        if (blocked.status !== 409) fail('Customer with an invoice was deleted ' + blocked.status);
        const archived = await fetch('http://127.0.0.1:' + appPort + '/api/customers/cust-busy/archive', { method: 'POST', headers });
        if (archived.status !== 200) fail('Archive failed ' + await archived.text());

        console.log('MySQL fixture passed: migration, directory, deactivate, customer archive, assignment, invoice source fields');
    } catch (e) {
        console.error(logs.slice(-2000));
        fail(e.stack || e.message);
    } finally {
        child.kill('SIGTERM');
        await conn.end();
    }
}

main();

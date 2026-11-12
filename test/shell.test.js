const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const shell = require('../lib/staff-shell');

test('job notifications cover assignment and status, not creates or unrelated saves', () => {
    const created = shell.diffJobNotifications({
        collection: 'fieldJobs',
        id: 'FLD-9',
        before: {},
        after: {
            customer: 'Northwind',
            status: 'Scheduled',
            technician: 'Jane Doe',
            technicianUid: 'user-jane',
            technicianEmail: 'jane@example.com'
        },
        isCreate: true
    });
    assert.equal(created.length, 1);
    assert.equal(created[0].type, 'assignment');
    assert.equal(created[0].technicianUid, 'user-jane');
    assert.match(created[0].body, /call-out FLD-9 \(Northwind\)/);

    const status = shell.diffJobNotifications({
        collection: 'jobs',
        id: 'JOB-3',
        before: { technician: 'Jane Doe', technicianUid: 'user-jane', status: 'Booked', customer: 'Walk-in' },
        after: { technician: 'Jane Doe', technicianUid: 'user-jane', status: 'In Repair', customer: 'Walk-in' },
        isCreate: false
    });
    assert.equal(status.length, 1);
    assert.equal(status[0].type, 'status');
    assert.equal(status[0].status, 'In Repair');
    assert.match(status[0].body, /workshop job JOB-3/);

    const renamed = shell.diffJobNotifications({
        collection: 'jobs',
        id: 'JOB-3',
        before: { technician: 'Sam Lee', technicianUid: 'user-sam', technicianEmail: 'sam@example.com', status: 'Booked' },
        after: { technician: 'Jane Doe', technicianUid: 'user-sam', technicianEmail: 'sam@example.com', status: 'Booked' },
        isCreate: false
    });
    assert.equal(renamed.length, 1);
    assert.equal(renamed[0].type, 'assignment');
    assert.equal(renamed[0].technicianUid, '');
    assert.equal(renamed[0].technicianEmail, '');
    assert.equal(renamed[0].technicianName, 'Jane Doe');

    const unassigned = shell.diffJobNotifications({
        collection: 'fieldJobs',
        id: 'FLD-1',
        before: { technician: 'Jane Doe', technicianUid: 'user-jane', status: 'Scheduled' },
        after: { technician: '', technicianUid: 'user-jane', status: 'Scheduled' },
        isCreate: false
    });
    assert.equal(unassigned.length, 0);

    assert.deepEqual(shell.diffJobNotifications({
        collection: 'invoices',
        id: 'INV-1',
        before: { status: 'Unpaid' },
        after: { status: 'Paid' },
        isCreate: false
    }), []);
});

test('offline policy queues collection writes and caches collection reads only', () => {
    assert.equal(shell.shouldQueueWrite('PATCH', '/api/collections/fieldJobs/FLD-1'), true);
    assert.equal(shell.shouldQueueWrite('POST', 'https://app.itguysa.co.za/api/collections/jobs/JOB-1'), true);
    assert.equal(shell.shouldQueueWrite('POST', '/api/transaction/batch'), true);
    assert.equal(shell.shouldQueueWrite('POST', '/api/login'), false);
    assert.equal(shell.shouldQueueWrite('POST', '/api/devices/push-token'), false);
    assert.equal(shell.shouldQueueWrite('GET', '/api/collections/jobs'), false);
    assert.equal(shell.shouldCacheRead('GET', '/api/collections/jobs'), true);
    assert.equal(shell.shouldCacheRead('GET', '/api/collections/fieldJobs/FLD-1'), true);
    assert.equal(shell.shouldCacheRead('GET', '/api/status'), true);
    assert.equal(shell.shouldCacheRead('POST', '/api/collections/jobs'), false);
    assert.equal(shell.shouldCacheRead('GET', '/api/backup'), false);
});

test('queued edits overlay cached job lists and heavy photo fields are stripped', () => {
    const cached = [{ id: 'JOB-1', status: 'Booked', customer: 'Walk-in', photoBefore: 'SECRET' }];
    const slim = shell.slimValue(cached);
    assert.equal(slim[0].photoBefore, undefined);
    assert.equal(shell.slimValue({ password: 'hash', notes: 'keep' }).password, undefined);
    assert.equal(shell.slimValue({ photos: [{ at: 't', by: 'sam', dataUrl: 'data:image/jpeg;base64,abc' }] }).photos[0].offlinePlaceholder, true);

    const merged = shell.applyQueuedEdits('jobs', slim, [{
        url: '/api/collections/jobs/JOB-1',
        method: 'PATCH',
        body: JSON.stringify({ status: 'In Repair' })
    }]);
    assert.equal(merged[0].status, 'In Repair');
    assert.equal(merged[0].customer, 'Walk-in');

    const removed = shell.applyQueuedEdits('jobs', merged, [{
        url: 'https://app.itguysa.co.za/api/collections/jobs/JOB-1',
        method: 'DELETE'
    }]);
    assert.equal(removed.length, 0);
});

test('external links, image inputs, and FCM data payload stay explicit', () => {
    assert.equal(shell.externalLinkKind('tel:+27820000000'), 'tel');
    assert.equal(shell.externalLinkKind('mailto:desk@itguysa.co.za'), 'mailto');
    assert.equal(shell.externalLinkKind('https://wa.me/27820000000?text=Hi'), 'whatsapp');
    assert.equal(shell.externalLinkKind('https://app.itguysa.co.za/files/job.pdf?download=1'), 'pdf');
    assert.equal(shell.externalLinkKind('https://app.itguysa.co.za/index.html'), '');
    assert.equal(shell.isImageFileInput({ type: 'file', accept: 'image/*' }), true);
    assert.equal(shell.isImageFileInput({ type: 'file', accept: '.sqlite' }), false);
    assert.equal(shell.isImageFileInput({ type: 'file', accept: '' }), false);

    const message = shell.buildFcmBody('token-1', {
        type: 'status',
        collection: 'fieldJobs',
        id: 'FLD-1',
        status: 'On-site',
        title: 'Job status updated',
        body: 'call-out FLD-1 is now On-site.'
    });
    Object.values(message.message.data).forEach((value) => assert.equal(typeof value, 'string'));
    assert.equal(message.message.android.notification.channel_id, 'itguy_jobs');
    assert.equal(message.message.token, 'token-1');
});

test('android shell assets match the web scripts', () => {
    const root = path.join(__dirname, '..');
    assert.equal(
        fs.readFileSync(path.join(root, 'js/native-shell.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'mobile/www/native-shell.js'), 'utf8')
    );
    assert.equal(
        fs.readFileSync(path.join(root, 'lib/staff-shell.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'mobile/www/staff-shell.js'), 'utf8')
    );
});

test('service worker caches the app shell and does not store API responses', () => {
    const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    assert.match(sw, /itguy-app-5\.0/);
    assert.match(sw, /\/index\.html/);
    assert.match(sw, /Authenticated API responses stay out of the Cache API/);
    const apiBranch = sw.split("if (url.includes('/api/'))")[1].split('if (isCdn')[0];
    assert.equal(apiBranch.includes('cache.put'), false);
    assert.match(apiBranch, /status: 503/);
});

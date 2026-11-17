const test = require('node:test');
const assert = require('node:assert/strict');

const saved = {
    json: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    path: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    gac: process.env.GOOGLE_APPLICATION_CREDENTIALS
};

function clearCreds() {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

function restoreCreds() {
    if (saved.json == null) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = saved.json;
    if (saved.path == null) delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    else process.env.FIREBASE_SERVICE_ACCOUNT_PATH = saved.path;
    if (saved.gac == null) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = saved.gac;
}

test('push sender stays disabled and harmless without Firebase credentials', async () => {
    clearCreds();
    const push = require('../services/pushService');
    assert.equal(push.configured(), false);
    const result = await push.deliver({
        token: 'fcm-test-token-0123456789',
        title: 'New assignment',
        body: 'You have a call-out.',
        type: 'assignment',
        collection: 'fieldJobs',
        id: 'FLD-1',
        status: 'Scheduled'
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'unconfigured');
});

test('unreadable Firebase JSON does not throw', async () => {
    clearCreds();
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{not-json';
    const push = require('../services/pushService');
    assert.equal(push.configured(), false);
    const result = await push.deliver({ token: 'fcm-test-token-0123456789', title: 't', body: 'b' });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'unconfigured');
    restoreCreds();
});

test.after(restoreCreds);

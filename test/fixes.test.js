const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const fixes = require('../lib/itguy-fixes');

test('technician assignment permissions and visibility', () => {
    assert.equal(fixes.canAssignTechnician('admin'), true);
    assert.equal(fixes.canAssignTechnician('FrontDesk'), true);
    assert.equal(fixes.canAssignTechnician('technician'), false);
    assert.equal(fixes.canAssignTechnician('client'), false);

    const jane = { uid: 'user-jane', role: 'technician', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' };
    const sam = { uid: 'user-sam', role: 'technician', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' };
    const job = { id: 'FLD-1001', technician: 'Jane Doe', technicianUid: 'user-jane', technicianEmail: 'jane@example.com' };
    assert.equal(fixes.technicianCanSeeJob(job, jane), true);
    assert.equal(fixes.technicianCanSeeJob(job, sam), false);
    assert.equal(fixes.technicianCanSeeJob({ technician: 'jane' }, jane), true);
    assert.equal(fixes.assignmentDenial(sam, 'fieldJobs', { technician: 'Sam Lee' }, { technician: 'Jane Doe' }, 'patch'),
        'Only office staff can assign or reassign a technician.');
    assert.equal(fixes.assignmentDenial({ role: 'admin' }, 'fieldJobs', { technician: '' }, { technician: 'Jane Doe' }, 'patch'), null);
    assert.equal(fixes.assignmentDenial(sam, 'fieldJobs', { technician: 'Sam Lee' }, { status: 'On-site' }, 'patch'), null);
    assert.equal(fixes.assignmentDenial(sam, 'invoices', { technician: 'A' }, { technician: 'B' }, 'patch'), null);
});

test('staff creation accepts technicians and rejects unknown roles', () => {
    const ok = fixes.validateStaffCreate({
        email: 'tech@example.com', password: 'Welcome123!', role: 'Technician',
        firstName: 'Jane', lastName: 'Doe', username: 'jane', employeeId: 'EMP-9'
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.role, 'technician');
    const bad = fixes.validateStaffCreate({ email: 'a@b.co', password: '123456', role: 'superuser', firstName: 'A', username: 'a' });
    assert.equal(bad.ok, false);
    const short = fixes.validateStaffCreate({ email: 'a@b.co', password: '123', role: 'technician', firstName: 'A', username: 'a' });
    assert.equal(short.ok, false);
});

test('invoice source mapping keeps captured customer data and does not invent fields', () => {
    const customers = [{ id: 'cust-1', name: 'Acme Corp', phone: '0820000000', email: 'acme@example.com', address: '1 Main', vat: '4000000000' }];
    const legacy = {
        id: 'JOB-9',
        client: 'Legacy Client',
        customerPhone: '0831111111',
        items: [{ description: 'Board repair\nwith notes', unitPrice: 'R 150.50', quantity: 2 }]
    };
    const draft = fixes.mapSourceToBilling(legacy, customers);
    assert.equal(draft.customer, 'Legacy Client');
    assert.equal(draft.phone, '0831111111');
    assert.equal(draft.email, '');
    assert.equal(draft.customerId, '');
    assert.equal(draft.items[0].desc, 'Board repair\nwith notes');
    assert.equal(draft.items[0].unit, 150.5);
    assert.equal(draft.items[0].qty, 2);
    assert.equal(draft.items[0].type, '');

    const linked = fixes.mapSourceToBilling({ id: 'FLD-2', customer: 'Acme Corp (VAT: 4000000000)', vat: '4000000000', phone: '0829999999' }, customers);
    assert.equal(linked.customer, 'Acme Corp');
    assert.equal(linked.phone, '0829999999');
    assert.equal(linked.email, 'acme@example.com');
    assert.equal(linked.address, '1 Main');
    assert.equal(linked.customerId, 'cust-1');
    assert.equal(fixes.findInvoiceForSource([{ id: 'INV-1', sourceId: 'FLD-2' }, { id: 'INV-2', sourceId: 'JOB-1' }], 'FLD-2').id, 'INV-1');
    assert.equal(fixes.findInvoiceForSource([], ''), null);
    assert.equal(fixes.sourceCollectionName('Field'), 'fieldJobs');
});

test('modal dismissal protects unsaved invoice details', () => {
    assert.equal(fixes.modalDismissDecision({ reason: 'backdrop', protectedForm: true, dirty: true }).action, 'ignore');
    assert.equal(fixes.modalDismissDecision({ reason: 'backdrop', protectedForm: true, dirty: false }).action, 'ignore');
    assert.equal(fixes.modalDismissDecision({ reason: 'escape', protectedForm: true, dirty: true }).action, 'confirm');
    assert.equal(fixes.modalDismissDecision({ reason: 'cancel', protectedForm: true, dirty: false }).action, 'close');
    assert.equal(fixes.modalDismissDecision({ reason: 'backdrop', protectedForm: false, dirty: true }).action, 'close');
    assert.equal(fixes.modalDismissDecision({ reason: 'escape', protectedForm: true, dirty: true, force: true }).action, 'close');
});

test('A4 layout uses printable width and paginates without stretching short invoices', () => {
    const shortDoc = fixes.planA4(794, 400);
    assert.equal(shortDoc.pageCount, 1);
    assert.equal(shortDoc.pageWidthMm, 210);
    assert.equal(shortDoc.pageHeightMm, 297);
    assert.equal(shortDoc.stretched, false);
    assert.ok(shortDoc.imageWidthMm > 150, 'content should use most of the A4 width');
    assert.ok(shortDoc.imageHeightMm < shortDoc.printableHeightMm, 'short invoices are not stretched to full page height');
    assert.ok(shortDoc.imageWidthMm > shortDoc.pageWidthMm / 2);

    const longDoc = fixes.planA4(794, 4000);
    assert.ok(longDoc.pageCount >= 3);
    assert.equal(longDoc.placements[1].y < 0, true);

    const calls = [];
    const fakePdf = {
        addPage() { calls.push('page'); },
        addImage(data, fmt, x, y, w, h) { calls.push({ x, y, w, h }); }
    };
    const applied = fixes.applyA4Plan(fakePdf, 'img', 794, 4000, 'JPEG');
    assert.equal(applied.pageCount, longDoc.pageCount);
    assert.equal(calls.filter(c => c === 'page').length, longDoc.pageCount - 1);
    assert.ok(calls.find(c => c && c.w > 150));
});

test('invoice and quotation descriptions stay dark on a white page, including line breaks', () => {
    const html = fixes.renderDescriptionCell('Power supply\nreplaced');
    assert.match(html, /[^-]color:#111111/);
    assert.match(html, /white-space:pre-wrap/);
    assert.match(html, /Power supply<br>replaced/);
    assert.doesNotMatch(html, /[^-]color:#fff/i);
    const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
    assert.match(css, /#pdf-render-page td[\s\S]*#111111 !important/);
});

test('job report includes only existing job fields and email send is explicit', () => {
    const report = fixes.buildJobReport({
        id: 'FLD-7',
        customer: 'Northwind',
        phone: '0821234567',
        email: 'north@example.com',
        technician: 'Jane Doe',
        status: 'Completed',
        description: 'Server down',
        items: [{ desc: 'SSD', qty: 1, unit: 800 }],
        notes: [{ time: '10:00', user: 'Jane', text: 'Replaced disk' }],
        completionData: { report: 'Disk replaced', photoBefore: 'SECRETPHOTO', suggestions: 'Add backup' },
        password: 'should-not-copy',
        devicePasscode: 'PIN-SECRET-999'
    }, 'Field');
    assert.equal(report.customer, 'Northwind');
    assert.equal(report.technician, 'Jane Doe');
    assert.equal(report.workPerformed, 'Disk replaced');
    assert.equal(report.parts[0].desc, 'SSD');
    assert.equal(report.password, undefined);
    assert.equal(report.devicePasscode, undefined);
    const html = fixes.renderJobReportHtml(report);
    assert.match(html, /Northwind/);
    assert.match(html, /Disk replaced/);
    assert.match(html, /SSD/);
    assert.doesNotMatch(html, /SECRETPHOTO|should-not-copy|PIN-SECRET-999/);

    assert.equal(fixes.reviewedRecipient({ recipient: '' }, 'original@example.com'), '');
    assert.equal(fixes.reviewedRecipient({}, 'original@example.com'), 'original@example.com');
    assert.equal(fixes.reviewEmailDispatch({ confirmed: false, recipient: 'a@b.co', smtpState: 'ready' }).reason, 'cancelled');
    const missingTo = fixes.reviewEmailDispatch({ confirmed: true, recipient: '', smtpState: 'ready' });
    assert.equal(missingTo.send, false);
    assert.equal(missingTo.reason, 'missing-recipient');
    const blocked = fixes.reviewEmailDispatch({ confirmed: true, recipient: 'a@b.co', smtpState: 'missing' });
    assert.equal(blocked.send, false);
    assert.match(blocked.error, /SMTP/);
    assert.match(blocked.error, /mailto/);
    assert.equal(fixes.reviewEmailDispatch({ confirmed: true, recipient: 'a@b.co', smtpState: 'ready' }).send, true);
    assert.equal(fixes.smtpState({}), 'unknown');
    assert.equal(fixes.smtpState({ smtpHost: '', smtpUser: '' }), 'missing');
    assert.equal(fixes.smtpState({ smtpHost: 'smtp.example.com', smtpUser: 'mailer' }), 'ready');
});

test('local API base follows the page origin instead of a hardcoded port', () => {
    const src = fs.readFileSync(path.join(__dirname, '../js/local-db.js'), 'utf8');
    assert.match(src, /window\.location\.origin\.replace\(\/\\\/\$\/, ''\) \+ '\/api'/);
    assert.doesNotMatch(src, /localhost:3000\/api/);
});

test('books reconcile ZA currency, POS totals, and expenses', () => {
    const books = fixes.reconcileBooks({
        invoices: [{ amount: 'R 1 234,56' }, { amount: 10 }],
        sales: [{ total: 20.5 }, { total: 'R 4.50' }],
        expenses: [{ amount: '100,00' }]
    });
    assert.equal(books.invTotal, 1244.56);
    assert.equal(books.posTotal, 25);
    assert.equal(books.expenseTotal, 100);
    assert.equal(books.netProfit, 1169.56);
    assert.equal(fixes.parseMoney('R 1,234.56'), 1234.56);
});

test('image proxy rejects private hosts, numeric IPs, and redirect hops', () => {
    assert.equal(fixes.assessProxyUrl('http://127.0.0.1/secret').ok, false);
    assert.equal(fixes.assessProxyUrl('http://2130706433/').ok, false);
    assert.equal(fixes.assessProxyUrl('http://127.1/').ok, false);
    assert.equal(fixes.assessProxyUrl('file:///etc/passwd').ok, false);
    assert.equal(fixes.assessProxyUrl('http://user:pass@example.com/').ok, false);
    assert.equal(fixes.isPrivateIp('::ffff:127.0.0.1'), true);
    const hop = fixes.assessProxyHop('http://example.com/a', 'http://192.168.0.8/x');
    assert.equal(hop.ok, false);
    const okHop = fixes.assessProxyHop('http://example.com/a', '/logo.png');
    assert.equal(okHop.ok, true);
    assert.equal(okHop.href, 'http://example.com/logo.png');
});

test('money totals round to cents and keep VAT off the subtotal when disabled', () => {
    assert.equal(fixes.lineTotal('10.10', 3), 30.3);
    assert.equal(fixes.lineTotal(0.1, 3), 0.3);
    assert.equal(fixes.lineTotal('R 150.555', 1), 150.56);
    assert.equal(fixes.vatAmount(100, 15, true), 15);
    assert.equal(fixes.vatAmount(100, 15, false), 0);
    assert.equal(fixes.grandTotal(10.01, 1.5), 11.51);
    assert.equal(fixes.grandTotal(0.1, 0.2), 0.3);
});

test('staff directory keeps every non-client role and storage shape', () => {
    assert.equal(fixes.canonicalRole('Technician'), 'technician');
    assert.equal(fixes.canonicalRole('tech'), 'technician');
    assert.equal(fixes.canonicalRole('Front Desk'), 'frontdesk');
    assert.equal(fixes.isStaffAccount({ role: 'technician', email: 'a@b.co' }), true);
    assert.equal(fixes.isStaffAccount({ role: 'TECHNICIAN' }), true);
    assert.equal(fixes.isStaffAccount({ role: 'employee' }), true);
    assert.equal(fixes.isStaffAccount({ role: '', email: 'legacy@example.com' }), true);
    assert.equal(fixes.isStaffAccount({ role: 'client' }), false);
    assert.equal(fixes.accountIsActive(null), true);
    assert.equal(fixes.accountIsActive(0), false);
    assert.equal(fixes.accountIsActive('0'), false);
    assert.equal(fixes.accountIsActive(1), true);
    const split = fixes.splitDirectory([
        { uid: 'u1', role: 'Technician', email: 'tech@example.com' },
        { uid: 'u2', role: 'client', email: 'c@example.com' },
        { id: 'u3', email: 'blank@example.com' }
    ]);
    assert.deepEqual(split.staff.map(u => u.uid), ['u1', 'u3']);
    assert.equal(split.clients.length, 1);
});

test('staff search never throws when a field is not a string', () => {
    const rows = [
        { email: 'qa-test-tech@example.com', role: new Date('2024-01-01'), firstName: null, employeeId: 12 },
        { email: null, username: 'desk', role: { unexpected: true } }
    ];
    assert.doesNotThrow(() => fixes.filterPeople(rows, 'qa-test'));
    const found = fixes.filterPeople(rows, 'QA-TEST');
    assert.equal(found.length, 1);
    assert.equal(found[0].email, 'qa-test-tech@example.com');
    assert.deepEqual(fixes.filterPeople(null, 'x'), []);
});

test('stored JSON accepts MySQL objects and buffers', () => {
    assert.deepEqual(fixes.parseStoredJson({ role: 'technician', email: 'a@b.co' }), { role: 'technician', email: 'a@b.co' });
    assert.deepEqual(fixes.parseStoredJson(Buffer.from('{"role":"tech"}')), { role: 'tech' });
    assert.equal(fixes.parseStoredJson('not-json'), null);
    assert.equal(fixes.parseStoredJson(''), null);
});

test('customer delete is blocked once a job, invoice, quote, or ticket exists', () => {
    const customer = { id: 'cust-1', name: 'Acme', email: 'acme@example.com' };
    assert.equal(fixes.customerLinkCount(customer, { jobs: [], invoices: [] }), 0);
    assert.equal(fixes.customerLinkCount(customer, { jobs: [{ customer: 'acme' }] }), 1);
    assert.equal(fixes.customerLinkCount(customer, { invoices: [{ customerId: 'cust-1' }] }), 1);
    assert.equal(fixes.customerLinkCount(customer, { fieldJobs: [{ customer: 'Other' }] }), 0);
    assert.equal(fixes.customerLinkCount(customer, { quotations: [{ email: 'acme@example.com' }] }), 1);
    assert.equal(fixes.customerLinkCount(customer, { tickets: [{ customer: 'Acme' }] }), 1);
});

test('call-out notify never sends unless SMTP is ready and a customer email is present', () => {
    const saved = fixes.calloutSavePlan({ notify: false, email: 'a@b.co', smtpState: 'ready' });
    assert.equal(saved.send, false);
    assert.match(saved.notice, /Nobody was notified/);
    const noSmtp = fixes.calloutSavePlan({ notify: true, email: 'a@b.co', smtpState: 'missing' });
    assert.equal(noSmtp.send, false);
    assert.match(noSmtp.notice, /SMTP is not set up/);
    const unknown = fixes.calloutSavePlan({ notify: true, email: 'a@b.co', smtpState: 'unknown' });
    assert.equal(unknown.send, false);
    const noEmail = fixes.calloutSavePlan({ notify: true, email: '', smtpState: 'ready' });
    assert.equal(noEmail.send, false);
    assert.match(noEmail.notice, /No customer email/);
    const send = fixes.calloutSavePlan({ notify: true, email: 'a@b.co', smtpState: 'ready' });
    assert.equal(send.send, true);
    assert.equal(send.recipient, 'a@b.co');
});

test('app version is 4.9 from version.js', () => {
    const version = require('../version');
    assert.equal(version.APP_VERSION, '4.9');
    const server = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const footer = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    assert.match(server, /require\('\.\/version'\)/);
    assert.doesNotMatch(server, /version:\s*'4\./);
    assert.match(footer, /window\.APP_VERSION/);
    assert.doesNotMatch(footer, /v4\.8/);
    assert.match(sw, /importScripts\('version\.js'\)/);
    assert.match(footer, /Schedule &amp; Notify/);
    assert.match(footer, /handleScheduledCallout\(event, false\)/);
    const settings = fs.readFileSync(path.join(__dirname, '../js/settings.js'), 'utf8');
    assert.match(settings, /handleSearch\(event\)/);
    assert.match(settings, /setUserActive/);
});

test('htaccess keeps Passenger and serves only the public front end', () => {
    const ht = fs.readFileSync(path.join(__dirname, '../.htaccess'), 'utf8');
    assert.match(ht, /PassengerAppRoot "\/home\/itguysaco\/public_html\/app\.itguysa\.co\.za"/);
    assert.match(ht, /PassengerBaseURI "\/"/);
    assert.match(ht, /PassengerAppType node/);
    assert.match(ht, /PassengerStartupFile app\.js/);
    assert.match(ht, /RewriteCond %\{REQUEST_URI\} \^\/api\(\/\|\$\) \[NC\]/);
    [
        'index\\.html', 'client\\.html', 'track\\.html', 'manifest\\.json',
        'sw\\.js', 'version\\.js', 'lib/itguy-fixes\\.js', 'css|js|img|public'
    ].forEach((asset) => {
        assert.equal(ht.includes(asset), true, asset);
    });
    assert.match(ht, /\[F,L\]/);
    assert.doesNotMatch(ht, /REQUEST_FILENAME\} !-f/);
});

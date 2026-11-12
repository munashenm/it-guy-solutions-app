/**
 * Staff shell: offline read cache and write queue for the PWA, plus Android
 * camera, push, back button, external links, and PDF share when Capacitor is present.
 * The Android app also injects this file into https://app.itguysa.co.za so the
 * wrapper works before the next web deploy. Idempotent.
 */
(function () {
    if (window.__itguyNativeShell) return;
    window.__itguyNativeShell = true;

    var shell = window.StaffShell;
    if (!shell) return;

    var OUTBOX_KEY = 'itguy-outbox-v1';
    var READ_PREFIX = 'itguy-readcache-v1:';
    var originalFetch = window.fetch.bind(window);
    var flushing = false;
    var sawCachedRead = false;

    function isNative() {
        try {
            if (window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) return true;
        } catch (e) { /* bridge not ready */ }
        return /ItGuyStaffApp/.test(navigator.userAgent || '');
    }

    function plugins() {
        return (window.Capacitor && Capacitor.Plugins) || {};
    }

    function currentUid() {
        try {
            var raw = sessionStorage.getItem('it-guy-user');
            if (raw) {
                var user = JSON.parse(raw);
                if (user && (user.uid || user.id)) return String(user.uid || user.id);
            }
        } catch (e) { /* ignore */ }
        try {
            var token = sessionStorage.getItem('it-guy-token') || '';
            var part = token.split('.')[1];
            if (!part) return '';
            var json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
            return json && json.uid ? String(json.uid) : '';
        } catch (e2) {
            return '';
        }
    }

    function requestUrl(input) {
        if (typeof input === 'string') return input;
        if (input && input.url) return input.url;
        return '';
    }

    function requestMethod(input, init) {
        if (init && init.method) return String(init.method).toUpperCase();
        if (input && input.method) return String(input.method).toUpperCase();
        return 'GET';
    }

    function headerValue(input, init, name) {
        var sources = [];
        if (init && init.headers) sources.push(init.headers);
        if (input && input.headers) sources.push(input.headers);
        for (var i = 0; i < sources.length; i++) {
            var headers = sources[i];
            if (!headers) continue;
            if (typeof headers.get === 'function') {
                var found = headers.get(name);
                if (found) return found;
            } else {
                var keys = Object.keys(headers);
                for (var k = 0; k < keys.length; k++) {
                    if (keys[k].toLowerCase() === name.toLowerCase() && headers[keys[k]]) return headers[keys[k]];
                }
            }
        }
        return '';
    }

    function readOutbox() {
        try {
            var parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function writeOutbox(items) {
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
    }

    function normalize(url) {
        try {
            var u = new URL(url, location.origin);
            return u.pathname + u.search;
        } catch (e) {
            return String(url || '');
        }
    }

    function readCacheStore(uid) {
        try {
            var parsed = JSON.parse(localStorage.getItem(READ_PREFIX + uid) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveReadCache(uid, url, data) {
        if (!uid) return;
        var store = readCacheStore(uid);
        store[normalize(url)] = { at: Date.now(), body: shell.slimValue(data) };
        var keys = Object.keys(store);
        if (keys.length > 24) {
            keys.sort(function (a, b) { return (store[a].at || 0) - (store[b].at || 0); });
            keys.slice(0, keys.length - 24).forEach(function (key) { delete store[key]; });
        }
        try {
            localStorage.setItem(READ_PREFIX + uid, JSON.stringify(store));
        } catch (e) {
            keys.sort(function (a, b) { return (store[a].at || 0) - (store[b].at || 0); });
            keys.slice(0, Math.ceil(keys.length / 2)).forEach(function (key) { delete store[key]; });
            try { localStorage.setItem(READ_PREFIX + uid, JSON.stringify(store)); } catch (e2) { /* cache is optional */ }
        }
    }

    function loadCachedRead(uid, url) {
        if (!uid) return null;
        var store = readCacheStore(uid);
        var hit = store[normalize(url)];
        if (!hit) return null;
        var queue = readOutbox().filter(function (item) { return item && item.uid === uid; });
        var parsed = shell.parseCollectionUrl(url);
        var body = hit.body;
        if (parsed && parsed.name) body = shell.applyQueuedEdits(parsed.name, body, queue);
        return { at: hit.at, body: body };
    }

    function jsonResponse(body, extraHeaders) {
        var headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
        return new Response(JSON.stringify(body), { status: 200, headers: headers });
    }

    function errorResponse(message) {
        return new Response(JSON.stringify({ error: message }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function offlineMessage(queued) {
        if (queued) {
            return "You're offline. This change is queued on this device and will send when you reconnect.";
        }
        return "You're offline. This change could not be saved on this device. Reconnect and submit it again so it isn't lost.";
    }

    function ensureBanner() {
        var banner = document.getElementById('itguy-offline-banner');
        if (banner) return banner;
        if (!document.body) return null;
        banner = document.createElement('div');
        banner.id = 'itguy-offline-banner';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'display:none;position:fixed;left:12px;right:12px;top:12px;z-index:1000000;background:#0f111a;color:#fff;border:1px solid #6c5ce7;border-radius:12px;padding:12px 14px;font-family:Outfit,sans-serif;font-size:14px;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.35);';
        document.body.appendChild(banner);
        return banner;
    }

    function updateBanner(extra) {
        var banner = ensureBanner();
        if (!banner) return;
        var uid = currentUid();
        var mine = readOutbox().filter(function (item) { return item && item.uid === uid; });
        var text = '';
        if (extra) text = extra;
        else if (mine.length) {
            text = "You're offline. " + mine.length + " change" + (mine.length === 1 ? '' : 's') + " queued on this device. They will send when you reconnect and are not lost.";
        } else if (!navigator.onLine && sawCachedRead) {
            text = "You're offline. Showing saved screens from this device.";
        } else if (!navigator.onLine) {
            text = "You're offline. Saved screens appear after this app has been opened online once.";
        }
        if (!text) {
            banner.style.display = 'none';
            banner.textContent = '';
            return;
        }
        banner.textContent = text;
        banner.style.display = 'block';
        var sync = document.querySelector('#sync-indicator .sync-text');
        if (sync && (mine.length || !navigator.onLine)) sync.textContent = mine.length ? 'Queued offline' : 'Offline';
    }

    function toast(message) {
        if (window.app && typeof window.app.showToast === 'function') window.app.showToast(message, 'warning');
    }

    function queueWrite(url, method, body, authorization) {
        var uid = currentUid();
        if (!uid) return false;
        if (body != null && typeof body !== 'string') return false;
        var items = readOutbox();
        if (items.length >= 30) return false;
        items.push({
            id: 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            uid: uid,
            url: url,
            method: method,
            body: body == null ? '' : body,
            authorization: authorization || '',
            at: Date.now()
        });
        try {
            writeOutbox(items);
            return true;
        } catch (e) {
            return false;
        }
    }

    function connectivityFailure(error, response) {
        if (error) return true;
        if (!response) return true;
        return response.status === 502 || response.status === 503 || response.status === 504;
    }

    async function flushOutbox() {
        if (flushing || !navigator.onLine) return;
        flushing = true;
        var uid = currentUid();
        var items = readOutbox();
        var kept = [];
        var sent = 0;
        try {
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!item || item.uid !== uid) {
                    kept.push(item);
                    continue;
                }
                var token = sessionStorage.getItem('it-guy-token');
                if (!token) {
                    kept.push(item);
                    continue;
                }
                try {
                    var res = await originalFetch(item.url, {
                        method: item.method,
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer ' + token
                        },
                        body: item.method === 'GET' || item.method === 'HEAD' ? undefined : (item.body || undefined)
                    });
                    if (res.ok) {
                        sent += 1;
                        continue;
                    }
                    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
                        toast("A queued change was rejected (" + res.status + ") and was not saved. Open the job and check it.");
                        continue;
                    }
                    kept.push(item);
                    kept = kept.concat(items.slice(i + 1));
                    break;
                } catch (e) {
                    kept.push(item);
                    kept = kept.concat(items.slice(i + 1));
                    break;
                }
            }
        } finally {
            try { writeOutbox(kept.filter(Boolean)); } catch (e) { /* leave previous outbox if the write fails */ }
            flushing = false;
            updateBanner(sent ? 'Queued changes sent.' : '');
            if (sent && window.localDb && typeof window.localDb.syncAll === 'function') {
                try { window.localDb.syncAll(); } catch (e) { /* ignore */ }
            }
            if (sent) setTimeout(function () { updateBanner(); }, 2500);
        }
    }

    window.fetch = function (input, init) {
        var url = requestUrl(input);
        var method = requestMethod(input, init);
        var uid = currentUid();
        var queueable = shell.shouldQueueWrite(method, url);
        var cacheable = shell.shouldCacheRead(method, url);

        return originalFetch(input, init).then(function (response) {
            if (cacheable && response && response.ok) {
                response.clone().json().then(function (data) { saveReadCache(uid, url, data); }).catch(function () {});
            }
            if (queueable && connectivityFailure(null, response)) {
                return queuedOrError(url, method, init, input);
            }
            if (cacheable && response && response.status === 503) {
                var cached = loadCachedRead(uid, url);
                if (cached) {
                    sawCachedRead = true;
                    updateBanner();
                    return jsonResponse(cached.body, { 'X-ItGuy-Offline-Cache': '1' });
                }
            }
            return response;
        }).catch(function (error) {
            if (queueable && connectivityFailure(error, null)) {
                return queuedOrError(url, method, init, input);
            }
            if (cacheable) {
                var cachedFail = loadCachedRead(uid, url);
                if (cachedFail) {
                    sawCachedRead = true;
                    updateBanner();
                    return jsonResponse(cachedFail.body, { 'X-ItGuy-Offline-Cache': '1' });
                }
            }
            if (!navigator.onLine && /\/api\/(login|register|forgot-password)/.test(url)) {
                updateBanner("You're offline. Sign-in needs a connection.");
            } else {
                updateBanner();
            }
            throw error;
        });
    };

    function queuedOrError(url, method, init, input) {
        var body = init && Object.prototype.hasOwnProperty.call(init, 'body') ? init.body : '';
        var ok = queueWrite(url, method, body, headerValue(input, init, 'Authorization'));
        updateBanner();
        if (ok) {
            toast(offlineMessage(true));
            return jsonResponse({ success: true, offlineQueued: true }, { 'X-ItGuy-Offline-Queued': '1' });
        }
        toast(offlineMessage(false));
        return errorResponse(offlineMessage(false));
    }

    window.addEventListener('online', function () { flushOutbox(); });
    window.addEventListener('offline', function () { updateBanner(); });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') flushOutbox();
    });
    window.itguyFlushOfflineQueue = flushOutbox;

    function whenReady(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    function dataUrlToFile(dataUrl, name) {
        var parts = String(dataUrl || '').split(',');
        var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
        var binary = atob(parts[1] || '');
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], name, { type: mime });
    }

    function assignFile(input, file) {
        var transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function onImageInputClick(event) {
        var input = event.currentTarget;
        if (!input || !isNative()) return;
        if (input.dataset.itguyBypass === '1') {
            delete input.dataset.itguyBypass;
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        var Camera = plugins().Camera;
        if (!Camera || typeof Camera.getPhoto !== 'function') {
            input.dataset.itguyBypass = '1';
            input.removeAttribute('capture');
            input.click();
            return;
        }
        try {
            if (typeof Camera.requestPermissions === 'function') {
                await Camera.requestPermissions();
            }
            var photo = await Camera.getPhoto({
                quality: 70,
                width: 1600,
                correctOrientation: true,
                resultType: 'dataUrl',
                source: 'PROMPT',
                saveToGallery: false
            });
            var dataUrl = photo && (photo.dataUrl || (photo.base64String ? 'data:image/jpeg;base64,' + photo.base64String : ''));
            if (!dataUrl) return;
            assignFile(input, dataUrlToFile(dataUrl, 'photo-' + Date.now() + '.jpg'));
        } catch (err) {
            var message = (err && err.message) || '';
            if (/cancel|dismiss|no image|user denied/i.test(message)) return;
            input.dataset.itguyBypass = '1';
            input.removeAttribute('capture');
            input.click();
        }
    }

    function scanFileInputs() {
        if (!isNative()) return;
        document.querySelectorAll('input[type="file"]').forEach(function (input) {
            if (!shell.isImageFileInput(input) || input.dataset.itguyCameraBound === '1') return;
            input.dataset.itguyCameraBound = '1';
            input.addEventListener('click', onImageInputClick, true);
        });
    }

    function watchFileInputs() {
        scanFileInputs();
        if (!document.body || watchFileInputs.started) return;
        watchFileInputs.started = true;
        var observer = new MutationObserver(function () { scanFileInputs(); });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function openExternal(url) {
        var kind = shell.externalLinkKind(url);
        if (kind === 'whatsapp' && plugins().Browser && /^https?:/i.test(url)) {
            plugins().Browser.open({ url: url });
            return;
        }
        window.location.href = url;
    }

    function installExternalLinks() {
        if (!isNative() || installExternalLinks.done) return;
        installExternalLinks.done = true;
        document.addEventListener('click', function (event) {
            var anchor = event.target && event.target.closest && event.target.closest('a[href]');
            if (!anchor) return;
            var href = anchor.getAttribute('href') || '';
            var kind = shell.externalLinkKind(anchor.href || href);
            if (kind !== 'tel' && kind !== 'mailto' && kind !== 'sms' && kind !== 'whatsapp') return;
            event.preventDefault();
            openExternal(anchor.href || href);
        }, true);
        var originalOpen = window.open;
        window.open = function (url) {
            if (typeof url === 'string' && shell.externalLinkKind(url) === 'whatsapp') {
                openExternal(url);
                return null;
            }
            return originalOpen.apply(window, arguments);
        };
    }

    function consumeBack() {
        var sidebar = document.querySelector('.sidebar.open');
        if (sidebar) {
            sidebar.classList.remove('open');
            var backdrop = document.getElementById('sidebar-backdrop');
            if (backdrop) backdrop.classList.remove('open');
            return true;
        }
        var modal = document.getElementById('modal-container');
        if (modal && (modal.classList.contains('active') || (modal.textContent || '').trim())) {
            if (window.app && typeof window.app.closeModal === 'function') window.app.closeModal({ reason: 'escape' });
            else {
                modal.innerHTML = '';
                modal.classList.remove('active');
            }
            return true;
        }
        if (location.hash && location.hash !== '#dashboard') {
            location.hash = '#dashboard';
            return true;
        }
        return false;
    }

    function installBack() {
        var App = plugins().App;
        if (!isNative() || !App || installBack.done) return;
        installBack.done = true;
        App.addListener('backButton', function () {
            if (consumeBack()) return;
            App.exitApp();
        });
    }

    async function shareJsPdf(pdf, filename) {
        var name = String(filename || 'document.pdf').replace(/[^\w.\-]+/g, '_');
        if (!/\.pdf$/i.test(name)) name += '.pdf';
        var dataUrl = pdf.output('datauristring');
        var base64 = dataUrl.split(',')[1] || '';
        var FS = plugins().Filesystem;
        var Share = plugins().Share;
        if (!FS || !Share) throw new Error('Share is not available in this WebView.');
        var written = await FS.writeFile({ path: name, data: base64, directory: 'CACHE' });
        try {
            await Share.share({
                title: name,
                text: name,
                files: [written.uri],
                dialogTitle: 'Print, save, or share PDF'
            });
        } catch (err) {
            var message = (err && err.message) || '';
            if (/cancel|dismiss/i.test(message)) return;
            throw err;
        }
    }

    function installPdfHooks() {
        if (!isNative()) return;
        var jsPDF = window.jspdf && window.jspdf.jsPDF;
        if (jsPDF && jsPDF.prototype && !jsPDF.prototype.__itguyShare) {
            var originalSave = jsPDF.prototype.save;
            jsPDF.prototype.save = function (filename) {
                var doc = this;
                shareJsPdf(doc, filename).catch(function () {
                    originalSave.call(doc, filename);
                });
            };
            jsPDF.prototype.__itguyShare = true;
        }
        var generator = window.pdfGenerator;
        if (generator && !generator.__itguyShare && typeof generator.generateInternal === 'function') {
            generator.download = function (docType, docId, dataObj) {
                return generator.generateInternal(docType, docId, dataObj).then(function (result) {
                    return shareJsPdf(result.pdf, result.filename);
                });
            };
            generator.print = function (docType, docId, dataObj) {
                return generator.download(docType, docId, dataObj);
            };
            generator.__itguyShare = true;
        }
    }

    async function syncPushToken() {
        var session = sessionStorage.getItem('it-guy-token');
        var pushToken = window.__itguyPushToken;
        if (!session || !pushToken) return;
        var key = session + '|' + pushToken;
        if (window.__itguyPushSynced === key) return;
        try {
            var base = window.API_BASE || '/api';
            var res = await originalFetch(base + '/devices/push-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session },
                body: JSON.stringify({ token: pushToken, platform: 'android' })
            });
            if (res.ok) window.__itguyPushSynced = key;
        } catch (e) { /* endpoint may not be deployed yet */ }
    }

    function installPush() {
        if (!isNative() || installPush.started) return;
        var Push = plugins().PushNotifications;
        if (!Push) return;
        installPush.started = true;
        Push.addListener('registration', function (token) {
            window.__itguyPushToken = token && (token.value || token.token);
            syncPushToken();
        });
        try {
            Push.addListener('registrationError', function (err) {
                console.warn('Push registration unavailable', err && (err.error || err.message || err));
            });
        } catch (e) { /* ignore */ }
        async function registerAfterLogin() {
            if (!sessionStorage.getItem('it-guy-token')) return;
            if (registerAfterLogin.done) {
                syncPushToken();
                return;
            }
            registerAfterLogin.done = true;
            try {
                var perm = await Push.checkPermissions();
                if (!perm || perm.receive !== 'granted') perm = await Push.requestPermissions();
                if (!perm || (perm.receive !== 'granted' && perm.receive !== 'prompt')) return;
                await Push.register();
            } catch (err) {
                registerAfterLogin.done = false;
                console.warn('Push notifications are disabled until Firebase is configured.', err && err.message);
            }
        }
        var originalSet = sessionStorage.setItem.bind(sessionStorage);
        sessionStorage.setItem = function (key, value) {
            originalSet(key, value);
            if (key === 'it-guy-token') registerAfterLogin();
        };
        var originalRemove = sessionStorage.removeItem.bind(sessionStorage);
        sessionStorage.removeItem = function (key) {
            if (key === 'it-guy-token' && window.__itguyPushToken) {
                var auth = sessionStorage.getItem('it-guy-token');
                var pushToken = window.__itguyPushToken;
                originalRemove(key);
                window.__itguyPushSynced = '';
                if (auth) {
                    originalFetch((window.API_BASE || '/api') + '/devices/push-token', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth },
                        body: JSON.stringify({ token: pushToken })
                    }).catch(function () {});
                }
                return;
            }
            return originalRemove(key);
        };
        registerAfterLogin();
        setInterval(registerAfterLogin, 15000);
    }

    async function readFileAsDataUrl(file) {
        if (window.field && typeof window.field.compressImage === 'function') {
            var compressed = await window.field.compressImage(file);
            if (compressed) return compressed;
        }
        return await new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('Could not read the photo.')); };
            reader.readAsDataURL(file);
        });
    }

    function captureJobPhoto(jobId) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.addEventListener('change', async function () {
            var file = input.files && input.files[0];
            if (!file) return;
            try {
                var dataUrl = await readFileAsDataUrl(file);
                if (!dataUrl || String(dataUrl).indexOf('data:image/') !== 0) throw new Error('Could not read the photo.');
                var jobs = (window.app && window.app.state && window.app.state.jobs) || [];
                var fieldJobs = (window.app && window.app.state && window.app.state.fieldJobs) || [];
                var job = jobs.find(function (item) { return item.id === jobId; }) || fieldJobs.find(function (item) { return item.id === jobId; });
                if (!job) throw new Error('Job not found on this device.');
                var photos = Array.isArray(job.photos) ? job.photos.slice() : [];
                var user = window.authSystem && window.authSystem.currentUser;
                photos.push({
                    at: new Date().toISOString(),
                    by: user && user.email ? user.email.split('@')[0] : 'Staff',
                    dataUrl: dataUrl
                });
                var coll = String(jobId).indexOf('FLD') === 0 ? 'fieldJobs' : 'jobs';
                await window.fbDb.collection(coll).doc(jobId).update({ photos: photos });
                if (window.app && window.app.showToast) window.app.showToast('Photo attached to ' + jobId + '.', 'success');
            } catch (err) {
                var message = (err && err.message) || 'Could not save the photo.';
                if (window.app && window.app.showToast) window.app.showToast(message, 'error');
                alert(message);
            }
        });
        input.click();
    }

    function upgradeQuickPhoto() {
        if (!window.repair || typeof window.repair.quickPhoto !== 'function') return;
        if (window.repair.quickPhoto.__itguy) return;
        var src = Function.prototype.toString.call(window.repair.quickPhoto);
        if (src.indexOf('itguy-device-photo') !== -1) {
            window.repair.quickPhoto.__itguy = true;
            return;
        }
        window.repair.quickPhoto = function (jobId) { captureJobPhoto(jobId); };
        window.repair.quickPhoto.__itguy = true;
    }

    function tick() {
        scanFileInputs();
        installExternalLinks();
        installBack();
        installPdfHooks();
        installPush();
        upgradeQuickPhoto();
        updateBanner();
        if (navigator.onLine) flushOutbox();
        if (window.localDb && typeof window.localDb.syncAll === 'function' && !navigator.onLine) {
            try { window.localDb.syncAll(); } catch (e) { /* cache wrapper serves reads */ }
        }
    }

    whenReady(function () {
        watchFileInputs();
        tick();
        setTimeout(tick, 600);
        setTimeout(tick, 2000);
    });
})();

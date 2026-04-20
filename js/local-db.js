/**
 * Local Database Adapter for IT Guy Solutions
 * Mimics Firebase Firestore & Auth API for minimal frontend changes
 */

function resolveApiBase() {
    const meta = document.querySelector('meta[name="itguy-api-base"]');
    const fromMeta = meta && meta.getAttribute('content') && meta.getAttribute('content').trim();
    if (fromMeta) return fromMeta.replace(/\/$/, '');

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }
    return '/api';
}

const API_BASE = resolveApiBase();
window.API_BASE = API_BASE;

// SECURITY: Auto-Logout Timer for POPIA / GDPR Compliance (20 minutes idle)
let idleTimeoutTimer;
function resetIdleTimer() {
    clearTimeout(idleTimeoutTimer);
    if(sessionStorage.getItem('it-guy-token')) {
        idleTimeoutTimer = setTimeout(() => {
            if(window.authSystem && typeof window.authSystem.logout === 'function') {
                window.authSystem.logout().then(() => {
                    alert('SECURITY LOCK: Your session has expired due to 20 minutes of inactivity. Please log in again.');
                });
            }
        }, 20*60*1000); 
    }
}
window.addEventListener('mousemove', resetIdleTimer);
window.addEventListener('keypress', resetIdleTimer);
window.addEventListener('click', resetIdleTimer);
window.addEventListener('scroll', resetIdleTimer);

/**
 * Robust fetch helper that checks content-type and provides detailed errors
 */
async function safeFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (!options.headers['Authorization']) {
        const token = sessionStorage.getItem('it-guy-token');
        if (token) options.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(url, options);
        const contentType = res.headers.get('content-type');
        
        if (!res.ok) {
            if (contentType && contentType.includes('application/json')) {
                const errData = await res.json();
                throw new Error(errData.error || errData.message || `HTTP ${res.status}`);
            } else {
                const text = await res.text();
                // If we got HTML but expected JSON, it might be a server-level 404 or 500
                if (text.trim().startsWith('<')) {
                    throw new Error(`Server returned HTML (likely 404 or 500) instead of JSON. Check if backend is running.`);
                }
                throw new Error(text.substring(0, 50) || `HTTP ${res.status}`);
            }
        }

        // Return empty object for empty responses
        if (res.status === 204) return {};

        if (contentType && contentType.includes('application/json')) {
            return await res.json();
        }
        return await res.text();
    } catch (e) {
        throw e;
    }
}

class LocalStorage {
    constructor(name) {
        this.name = name;
        this.data = [];
        this.listeners = [];
        this._pending = {}; // Cache for recently created/updated items
        this.pollInterval = null;
    }

    doc(id) {
        return new LocalDoc(this, id);
    }

    async add(data) {
        const id = 'autoid-' + Math.random().toString(36).substring(2, 10);
        const docData = { id, ...data };
        
        // Optimistic update
        this.data.unshift(docData);
        this.emit();

        try {
            await safeFetch(`${API_BASE}/collections/${this.name}/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            this.fetch();
        } catch (e) {
            delete this.parent._pending[id];
            this.data = this.data.filter(d => d.id !== id);
            this.emit();
            throw e;
        }
        return { id };
    }

    onSnapshot(callback) {
        this.listeners.push(callback);
        this.startPolling();
        this.fetch();
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
            if (this.listeners.length === 0) this.stopPolling();
        };
    }

    async fetch() {
        try {
            const raw = await safeFetch(`${API_BASE}/collections/${this.name}`);
            const data = Array.isArray(raw) ? raw : [];
            this.data = data;
            
            // Clear global sync error if this was a recovery
            if (this._hasSyncError) {
                this._hasSyncError = false;
                this.updateGlobalSyncStatus();
            }
            
            this.emit();
        } catch (e) {
            console.error(`Fetch error for ${this.name}:`, e.message);
            
            // Only notify if status just changed to error
            if (!this._hasSyncError) {
                this._hasSyncError = true;
                this.updateGlobalSyncStatus();
                
                // Throttle toast to once every 30 seconds globally
                const now = Date.now();
                if (!window._lastSyncToast || (now - window._lastSyncToast > 30000)) {
                    if (window.app && window.app.showToast) {
                        window.app.showToast(`Sync issue: Connection to server unstable.`, "warning");
                    }
                    window._lastSyncToast = now;
                }
            }
            
            // Automatic retry managed by the interval, no need for manual timeout here
        }
    }

    updateGlobalSyncStatus() {
        const collections = Object.values(window.localDb._collections);
        const hasAnyError = collections.some(c => c._hasSyncError);
        
        const dot = document.getElementById('db-status-dot');
        const text = document.getElementById('db-status-text');
        
        if (dot && text) {
            if (hasAnyError) {
                dot.style.background = '#ff7675';
                text.textContent = 'Sync Interrupted';
                text.style.color = '#ff7675';
            } else {
                // Only reset if system is generally healthy
                if (window.app && window.app.checkSystemHealth) window.app.checkSystemHealth();
            }
        }
    }

    orderBy() { return this; }
    where() { return this; }
    limit() { return this; }

    async get() {
        const raw = await safeFetch(`${API_BASE}/collections/${this.name}`);
        const data = Array.isArray(raw) ? raw : [];
        const docs = data.map(d => ({
            id: d.id,
            data: () => d
        }));

        return {
            docs: docs,
            forEach: (cb) => docs.forEach(cb),
            empty: docs.length === 0
        };
    }

    emit() {
        const snapDocs = (this.data || []).map(d => ({
            id: d.id,
            data: () => d
        }));

        // Merge pending items that aren't in the main list yet
        for (const id in this._pending) {
            const found = snapDocs.find(d => d.id === id);
            if (!found) {
                snapDocs.unshift({
                    id: id,
                    data: () => this._pending[id]
                });
            } else {
                // Item has successfully synced to server list, remove from pending
                delete this._pending[id];
            }
        }

        const snap = { docs: snapDocs };
        this.listeners.forEach(l => l(snap));
    }

    startPolling() {
        if (!this.pollInterval) {
            // Increased interval to 15s to reduce server load/rate-limiting
            this.pollInterval = setInterval(() => this.fetch(), 15000);
        }
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}

class LocalDoc {
    constructor(parent, id) {
        this.parent = parent;
        this.id = id;
    }

    async get() {
        // Find in parent cache or fetch
        const item = (this.parent.data || []).find(d => d.id === this.id);
        if (item) return { exists: true, data: () => item };
        
        try {
            // Efficient single-doc fetch
            const doc = await safeFetch(`${API_BASE}/collections/${this.parent.name}/${this.id}`);
            if (doc && doc.id) {
                // Optionally update parent cache
                return { exists: true, data: () => doc };
            }
            return { exists: false, data: () => null };
        } catch (e) {
            // Fallback to searching the whole collection for backwards compatibility with older backends
            try {
                const raw = await safeFetch(`${API_BASE}/collections/${this.parent.name}`);
                const data = Array.isArray(raw) ? raw : [];
                const found = data.find(d => d.id === this.id);
                return { 
                    exists: !!found, 
                    data: () => found || null 
                };
            } catch (e2) {
                console.error(`LocalDoc.get failed for ${this.parent.name}/${this.id}:`, e2.message);
                return { exists: false, data: () => null };
            }
        }
    }
    
    async update(data) {
        const docData = { id: this.id, ...data };
        this.parent._pending[this.id] = docData; // Track as pending
        const idx = this.parent.data.findIndex(d => d.id === this.id);
        if (idx > -1) {
            this.parent.data[idx] = { ...this.parent.data[idx], ...data };
        }
        this.parent.emit();

        return await safeFetch(`${API_BASE}/collections/${this.parent.name}/${this.id}`, {
            method: 'PATCH', // Partial update
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    onSnapshot(callback) {
        const unsub = this.parent.onSnapshot(snap => {
            const found = (snap.docs || []).find(d => d.id === this.id);
            if(found) {
                callback({
                    exists: true,
                    data: () => found.data()
                });
            } else {
                callback({ exists: false, data: () => null });
            }
        });
        return unsub;
    }

    async set(data) {
        const docData = { id: this.id, ...data };
        this.parent._pending[this.id] = docData; // Track as pending
        const idx = this.parent.data.findIndex(d => d.id === this.id);
        if (idx > -1) this.parent.data[idx] = docData;
        else this.parent.data.unshift(docData);
        this.parent.emit();

        try {
            await safeFetch(`${API_BASE}/collections/${this.parent.name}/${this.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            this.parent.fetch(); 
        } catch (e) {
            this.parent.fetch(); 
            throw e;
        }
        return { id: this.id };
    }

    async delete() {
        this.parent.data = this.parent.data.filter(d => d.id !== this.id);
        this.parent.emit();
        return await safeFetch(`${API_BASE}/collections/${this.parent.name}/${this.id}`, { method: 'DELETE' });
    }
}

window.localDb = {
    _collections: {},
    collection: function(name) {
        if (!this._collections[name]) {
            this._collections[name] = new LocalStorage(name);
        }
        return this._collections[name];
    },
    runTransaction: async (fn) => {
        const transaction = {
            get: (docRef) => docRef.get(),
            set: (docRef, data) => docRef.set(data),
            update: (docRef, data) => docRef.update(data),
            delete: (docRef) => docRef.delete()
        };
        return await fn(transaction);
    },
    batch: function() {
        const operations = [];
        return {
            update: (docRef, data) => {
                operations.push({ coll: docRef.parent.name, id: docRef.id, method: 'update', data });
            },
            set: (docRef, data) => {
                operations.push({ coll: docRef.parent.name, id: docRef.id, method: 'set', data });
            },
            delete: (docRef) => {
                operations.push({ coll: docRef.parent.name, id: docRef.id, method: 'delete' });
            },
            commit: async () => {
                const res = await safeFetch(`${API_BASE}/transaction/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates: operations })
                });
                const uniqueColls = [...new Set(operations.map(o => o.coll))];
                uniqueColls.forEach(c => {
                    if (window.localDb._collections[c]) window.localDb._collections[c].fetch();
                });
                return res;
            }
        };
    }
};

const authListeners = [];
const triggerAuthChange = (user) => {
    if (user) {
        user.updatePassword = async (newPassword) => {
            const token = sessionStorage.getItem('it-guy-token');
            const data = await safeFetch(`${API_BASE}/update-password`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password: newPassword })
            });
            if (!data || !data.success) throw new Error(data?.error || "Password update failed");
            return true;
        };
    }
    if (window.localAuth) window.localAuth.currentUser = user;
    authListeners.forEach(cb => cb(user));
};

window.addEventListener('storage', (e) => {
    if (e.key === 'it-guy-user') {
        const user = e.newValue ? JSON.parse(e.newValue) : null;
        triggerAuthChange(user);
    }
});

window.localAuth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
        authListeners.push(callback);
        const storedUser = sessionStorage.getItem('it-guy-user');
        try {
            const user = storedUser ? JSON.parse(storedUser) : null;
            callback(user);
        } catch (e) {
            callback(null);
        }
        return () => {
            const idx = authListeners.indexOf(callback);
            if (idx > -1) authListeners.splice(idx, 1);
        };
    },
    signInWithEmailAndPassword: async (email, password) => {
        try {
            const data = await safeFetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (data && data.user && data.token) {
                sessionStorage.setItem('it-guy-token', data.token);
                sessionStorage.setItem('it-guy-user', JSON.stringify(data.user));
                triggerAuthChange(data.user);
            } else {
                throw new Error(data?.error || "Login failed");
            }
        } catch (e) {
            throw e;
        }
    },
    signOut: async () => {
        sessionStorage.removeItem('it-guy-user');
        sessionStorage.removeItem('it-guy-token');
        triggerAuthChange(null);
        setTimeout(() => window.location.reload(), 100);
    },
    createUserWithEmailAndPassword: async (email, password, firstName, lastName, phone) => {
        const data = await safeFetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, firstName, lastName, phone })
        });
        if (data && data.user) return data.user;
        throw new Error(data?.error || "Registration failed");
    },
    sendPasswordResetEmail: async (email) => {
        const data = await safeFetch(`${API_BASE}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!data.success) throw new Error(data.error || "Reset request failed");
        return true;
    }
};

window.firebase = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => new Date().toISOString(),
            increment: (val) => ({ _type: 'increment', value: val })
        }
    }
};

window.fbDb = window.localDb;
window.fbAuth = window.localAuth;

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
        }, 20 * 60 * 1000); 
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
            // Handle HTTP errors (4xx, 5xx)
            if (contentType && contentType.includes('application/json')) {
                const errData = await res.json();
                throw new Error(errData.error || errData.message || `HTTP ${res.status}`);
            } else {
                const text = await res.text();
                console.error(`API Error (${res.status}):`, text.substring(0, 500));
                if (text.includes('<!DOCTYPE html>')) {
                    throw new Error(`Server returned HTML (likely 404 or 500) instead of JSON. Check if backend is running.`);
                }
                throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}`);
            }
        }

        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            const snippet = text.substring(0, 100).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            throw new Error(`Server returned non-JSON response (200 OK). Snippet: ${snippet}`);
        }

        return await res.json();
    } catch (e) {
        if (e.message.includes('Failed to fetch')) {
            throw new Error("Connection Refused: Cannot connect to the backend server. Is it running?");
        }
        throw e;
    }
}

window.safeFetch = safeFetch;

class LocalCollection {
    constructor(name) {
        this.name = name;
        this.listeners = [];
        this.data = [];
        this.pollInterval = null;
        this.lastDataHash = null;
    }

    doc(id) {
        const finalId = id || this.generateId();
        return new LocalDoc(this, finalId);
    }

    generateId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    async add(data) {
        const id = this.generateId();
        const docData = { id, ...data };
        
        // Optimistic Update: Push to local cache immediately
        this.data.unshift(docData);
        this.emit();

        try {
            await safeFetch(`${API_BASE}/collections/${this.name}/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            // Final sync to ensure everything is matched with server
            this.fetch();
        } catch (e) {
            // Revert on failure
            this.data = this.data.filter(d => d.id !== id);
            this.emit();
            throw e;
        }
        return { id };
    }

    onSnapshot(callback) {
        this.listeners.push(callback);
        this.startPolling();
        // Initial fetch
        this.fetch();
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
            if (this.listeners.length === 0) this.stopPolling();
        };
    }

    async fetch() {
        try {
            const data = await safeFetch(`${API_BASE}/collections/${this.name}`);
            const dataHash = JSON.stringify(data);
            if (dataHash === this.lastDataHash) return; // Skip if no change
            
            this.lastDataHash = dataHash;
            this.data = data;
            this.emit();
        } catch (e) {
            console.error(`Sync error for ${this.name}:`, e.message);
        }
    }

    orderBy() { return this; }
    where() { return this; }
    limit() { return this; }

    async get() {
        const data = await safeFetch(`${API_BASE}/collections/${this.name}`);
        
        // Return a mock snapshot
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
        const snap = {
            docs: this.data.map(d => ({
                id: d.id,
                data: () => d
            }))
        };
        this.listeners.forEach(l => l(snap));
    }

    startPolling() {
        if (!this.pollInterval) {
            this.pollInterval = setInterval(() => this.fetch(), 3000);
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
        const item = this.parent.data.find(d => d.id === this.id);
        if (item) return { exists: true, data: () => item };
        
        const data = await safeFetch(`${API_BASE}/collections/${this.parent.name}`);
        const found = data.find(d => d.id === this.id);
        return { 
            exists: !!found, 
            data: () => found || null 
        };
    }
    
    onSnapshot(callback) {
        // A Doc snapshot is just a filtered collection snapshot
        const unsub = this.parent.onSnapshot(snap => {
            const found = snap.docs.find(d => d.id === this.id);
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
        
        // Optimistic update
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
            this.parent.fetch(); // Reload on fail
            throw e;
        }
    }

    async update(data) {
        const current = await this.get();
        const updated = { ...current.data(), ...data };
        await this.set(updated);
    }

    async delete() {
        // Optimistic delete
        this.parent.data = this.parent.data.filter(d => d.id !== this.id);
        this.parent.emit();

        try {
            await safeFetch(`${API_BASE}/collections/${this.parent.name}/${this.id}`, {
                method: 'DELETE'
            });
            this.parent.fetch();
        } catch (e) {
            this.parent.fetch();
            throw e;
        }
    }
}

class LocalBatch {
    constructor() {
        this.ops = [];
    }

    set(docRef, data) {
        this.ops.push({ coll: docRef.parent.name, id: docRef.id, data });
    }

    update(docRef, data) {
        // For simplicity in mock, update behaves like set in batch
        this.ops.push({ coll: docRef.parent.name, id: docRef.id, data });
    }

    async commit() {
        if (this.ops.length === 0) return;
        
        await safeFetch(`${API_BASE}/transaction/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: this.ops })
        });
        
        // Refresh all affected collections in background
        const uniqueColls = [...new Set(this.ops.map(o => o.coll))];
        uniqueColls.forEach(c => {
            // We can't easily find the collection instances here, 
            // so we rely on the next poll or manual navigation
        });
        
        this.ops = [];
    }
}

// Global registry to share collection instances and ensure real-time consistency
const collectionRegistry = {};

window.localDb = {
    collection: (name) => {
        if (!collectionRegistry[name]) {
            collectionRegistry[name] = new LocalCollection(name);
        }
        return collectionRegistry[name];
    },
    batch: () => new LocalBatch(),
    runTransaction: async (fn) => {
        // Mock transaction: just run the function with a dummy transaction object
        // This prevents "runTransaction is not a function" errors.
        console.warn("DB: runTransaction is mocked. Operations are not truly atomic.");
        const transaction = {
            get: async (docRef) => await docRef.get(),
            set: (docRef, data) => docRef.set(data),
            update: (docRef, data) => docRef.update(data),
            delete: (docRef) => docRef.delete()
        };
        return await fn(transaction);
    }
};

// Real-time Auth Mock with Listeners
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
    onAuthStateChanged: (callback) => {
        authListeners.push(callback);
        // Immediate initial check
        const storedUser = sessionStorage.getItem('it-guy-user');
        try {
            const user = storedUser ? JSON.parse(storedUser) : null;
            callback(user);
        } catch (e) {
            console.error("Auth session parse error:", e);
            callback(null);
        }
        
        return () => {
            const idx = authListeners.indexOf(callback);
            if (idx > -1) authListeners.splice(idx, 1);
        };
    },
    signInWithEmailAndPassword: async (email, password) => {
        try {
            console.log(`Attempting login for: ${email}`);
            const data = await safeFetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (data && data.user && data.token) {
                // Use sessionStorage to forget login on browser close
                sessionStorage.setItem('it-guy-token', data.token);
                sessionStorage.setItem('it-guy-user', JSON.stringify(data.user));
                triggerAuthChange(data.user);
            } else {
                const serverMsg = data && data.error ? data.error : JSON.stringify(data);
                throw new Error(`Invalid response from server: ${serverMsg}`);
            }
        } catch (e) {
            console.error("Login API Error:", e.message);
            throw e;
        }
    },
    signOut: async () => {
        sessionStorage.removeItem('it-guy-user');
        sessionStorage.removeItem('it-guy-token');
        triggerAuthChange(null);
        // Forced reload ensures all modules reset their state
        setTimeout(() => window.location.reload(), 100);
    },
    createUserWithEmailAndPassword: async (email, password, firstName, lastName, phone) => {
        try {
            const data = await safeFetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, firstName, lastName, phone })
            });
            if (data && data.user) {
                // Return just the user object to match Firebase Auth behavior
                return data.user;
            } else {
                throw new Error(data.error || "Registration failed");
            }
        } catch (e) {
            console.error("Register API Error:", e.message);
            throw e;
        }
    },
    sendPasswordResetEmail: async (email) => {
        try {
            const data = await safeFetch(`${API_BASE}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            if (!data.success) throw new Error(data.error || "Reset request failed");
            return true;
        } catch (e) {
            console.error("Forgot Pass API Error:", e.message);
            throw e;
        }
    }
};

// Global Firebase-like variables for app.js
window.firebase = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => new Date().toISOString(),
            increment: (val) => val
        }
    }
};

// Redundant aliases to ensure compatibility across all initialization patterns
window.fbDb = window.localDb;
window.fbAuth = window.localAuth;

console.log("IT Guy Local Adapter: Auth & DB Aliases initialized.");

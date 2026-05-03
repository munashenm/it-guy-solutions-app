const app = {
    state: {
        currentView: 'dashboard-view',
        jobs: [],
        invoices: [],
        fieldJobs: [],
        quotations: [],
        inventory: [],
        techStock: [],
        suppliers: [],
        purchaseOrders: [],
        expenses: [],
        knowledgeBase: [],
        customers: [],
        tickets: [],
        settings: {},
        _lastCreatedDoc: null // Temporary cache for immediate document actions
    },
    unsubscribes: [],

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.startSync();
        this.initStabilityHandlers();
        
        // System Health Check
        this.checkSystemHealth();
        setInterval(() => this.checkSystemHealth(), 60000); 
        
        // Handle initial route
        this.handleRouting();
        
        // Init modules
        const modules = [
            { name: 'dashboard', ref: window.dashboard },
            { name: 'repair', ref: window.repair },
            { name: 'field', ref: window.field },
            { name: 'quotation', ref: window.quotation },
            { name: 'invoice', ref: window.invoice },
            { name: 'client', ref: window.client },
            { name: 'inventory', ref: window.inventory },
            { name: 'mystock', ref: window.mystock },
            { name: 'posSystem', ref: window.posSystem },
            { name: 'reports', ref: window.reports },
            { name: 'customers', ref: window.customers },
            { name: 'adminPanel', ref: window.adminPanel }
        ];

        modules.forEach(m => {
            try {
                if (m.ref && typeof m.ref.init === 'function') {
                    console.log(`Initializing module: ${m.name}`);
                    m.ref.init();
                }
            } catch (e) {
                console.error(`Failed to initialize module: ${m.name}`, e);
            }
        });
    },

    async logActivity(event, details) {
        if (!window.fbDb) return;
        const user = window.authSystem?.currentUser || { email: 'System' };
        try {
            await window.fbDb.collection('activityLog').add({
                event,
                details,
                user: user.email || user.username || 'System',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.warn("LogActivity background error:", e);
        }
    },

    viewCollections: {
        'dashboard-view': ['jobs', 'fieldJobs', 'invoices', 'quotations', 'sales', 'activityLog'],
        'repair-view': ['jobs', 'customers', 'inventory', 'users'],
        'field-view': ['fieldJobs', 'techStock', 'inventory', 'users'],
        'quotations-view': ['quotations', 'customers', 'inventory'],
        'invoices-view': ['invoices', 'customers', 'inventory'],
        'inventory-view': ['inventory', 'suppliers'],
        'mystock-view': ['techStock', 'inventory'],
        'pos-view': ['inventory', 'sales', 'customers'],
        'customers-view': ['customers', 'jobs', 'invoices', 'quotations'],
        'reports-view': ['sales', 'invoices', 'expenses', 'jobs'],
        'tickets-view': ['tickets', 'customers'],
        'purchases-view': ['purchaseOrders', 'suppliers', 'inventory'],
        'expenses-view': ['expenses'],
        'wiki-view': ['knowledgeBase'],
        'profile-view': ['users']
    },

    startSync() {
        if(!window.fbDb) return;
        if(this.syncStarted) return;
        this.syncStarted = true;
        
        console.log("Starting Core Sync...");
        this.unsubscribes = this.unsubscribes || [];
        this._activeCollections = new Set();
        this._syncRawData = {}; 

        // Always sync core settings for branding and logic
        this.requestSync(['settings', 'companyProfile', 'systemSettings']);
        
        // Initial sync for current view
        const hash = window.location.hash || '#dashboard';
        const initialView = hash.replace('#', '') + '-view';
        this.updateViewSync(initialView);
    },

    updateViewSync(viewId) {
        if (!viewId) return;
        const required = this.viewCollections[viewId] || [];
        // Add users by default for role checks
        if (!required.includes('users')) required.push('users');
        
        this.requestSync(required);
    },

    requestSync(collections) {
        if (!Array.isArray(collections)) return;
        
        collections.forEach(coll => {
            if (this._activeCollections.has(coll)) return;
            
            console.log(`📡 Activating sync for: ${coll}`);
            this._activeCollections.add(coll);

            if (coll === 'settings' || coll === 'companyProfile' || coll === 'systemSettings') {
                this.syncDocument('settings', coll === 'settings' ? 'documentSettings' : coll);
                return;
            }

            const stateKey = this.getCollectionStateKey(coll);
            const unsub = window.fbDb.collection(coll).onSnapshot(snap => {
                if(!this._syncRawData[stateKey]) this._syncRawData[stateKey] = {};
                this._syncRawData[stateKey][coll] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.state[stateKey] = Object.values(this._syncRawData[stateKey]).flat();
                
                if(stateKey === 'inventory') this.migrateInventorySchema();
                this.refreshActiveViews();
            });
            this.unsubscribes.push(unsub);
        });
    },

    getCollectionStateKey(coll) {
        const mapping = { 'repairs': 'jobs' };
        return mapping[coll] || coll;
    },

    syncDocument(coll, docId) {
        const unsub = window.fbDb.collection(coll).doc(docId).onSnapshot(doc => {
            if(doc.exists) {
                const data = doc.data();
                if (docId === 'companyProfile') {
                    this.state.companyProfile = data;
                    this.state.settings = { ...(this.state.settings || {}), ...data };
                    this.applyBranding(data);
                } else {
                    this.state.settings = { ...(this.state.settings || {}), ...data };
                    this.refreshActiveViews();
                }
            }
        });
        this.unsubscribes.push(unsub);
    },

    migrateInventorySchema() {
        if (!this.state.inventory) return;
        this.state.inventory.forEach(item => {
            if(item.stock !== undefined && item.qty === undefined) {
                console.log(`Migrating schema for ${item.id}...`);
                window.fbDb.collection('inventory').doc(item.id).update({
                    qty: parseInt(item.stock) || 0,
                    cost: item.buyPrice || item.cost || '0.00',
                    sell: item.sellPrice || item.sell || '0.00'
                });
            }
        });
    },

    applyBranding(data) {
        if(!data) return;

        // 1. Update Theme Colors (Accent)
        if(data.themeColor) {
            const root = document.documentElement;
            root.style.setProperty('--accent', data.themeColor);
            
            // Generate a slightly darker version for hover (approx 15% darker)
            const darkenChannel = (hex, factor) => {
                const val = parseInt(hex, 16);
                return Math.floor(val * factor).toString(16).padStart(2, '0');
            };
            const c = data.themeColor.replace('#', '');
            const r = darkenChannel(c.substring(0,2), 0.85);
            const g = darkenChannel(c.substring(2,4), 0.85);
            const b = darkenChannel(c.substring(4,6), 0.85);
            root.style.setProperty('--accent-hover', `#${r}${g}${b}`);
            
            // Also update the logo background opacity for better aesthetics
            root.style.setProperty('--accent-rgb', this.hexToRgb(data.themeColor));
        }

        if(!data.logoUrl && !data.brandLogo) return;

        const logoUrl = data.logoUrl || data.brandLogo;

        // 2. Update Favicon & Apple Touch Icon
        const favicon = document.getElementById('app-favicon');
        const touchIcon = document.getElementById('app-apple-touch-icon');
        if (favicon) favicon.href = logoUrl;
        if (touchIcon) touchIcon.href = logoUrl;

        // 3. Update Login Screen Logo
        const loginContainer = document.getElementById('login-logo-container');
        if (loginContainer) {
            loginContainer.innerHTML = `<img src="${logoUrl}" alt="Logo" style="max-height: 80px; max-width: 100%; margin-bottom: 15px;">`;
        }

        // 4. Update Sidebar Logo
        const sidebarContainer = document.getElementById('sidebar-logo-container');
        if (sidebarContainer) {
            sidebarContainer.innerHTML = `<img src="${logoUrl}" alt="Logo" style="max-height: 40px; max-width: 100%; object-fit: contain;">`;
        }
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '108, 92, 231';
    },

    refreshActiveViews() {
        if (!this.state.currentView) return;
        const activeView = this.state.currentView;
        
        const safeRender = (module, name) => {
            if (module && typeof module.render === 'function') {
                try {
                    module.render();
                } catch (err) {
                    console.error(`Render error in ${name}:`, err);
                }
            }
        };

        switch (activeView) {
            case 'dashboard-view': safeRender(window.dashboard, 'Dashboard'); break;
            case 'repair-view': safeRender(window.repair, 'Repair'); break;
            case 'field-view': safeRender(window.field, 'Field'); break;
            case 'quotations-view': safeRender(window.quotation, 'Quotation'); break;
            case 'invoices-view': safeRender(window.invoice, 'Invoice'); break;
            case 'inventory-view': safeRender(window.inventory, 'Inventory'); break;
            case 'purchases-view': safeRender(window.purchases, 'Purchases'); break;
            case 'mystock-view': safeRender(window.mystock, 'MyStock'); break;
            case 'pos-view': safeRender(window.pos, 'POS'); break;
            case 'customers-view': safeRender(window.customers, 'Customers'); break;
            case 'reports-view': safeRender(window.reports, 'Reports'); break;
            case 'expenses-view': safeRender(window.expenses, 'Expenses'); break;
            case 'wiki-view': safeRender(window.wiki, 'Wiki'); break;
            case 'team-view': safeRender(window.admin, 'Admin'); break;
            case 'tickets-view': safeRender(window.tickets, 'Tickets'); break;
        }

        // Post-render UX: Inject labels for mobile card-view
        this.injectTableLabels();
    },

    async checkSystemHealth() {
        const dot = document.getElementById('db-status-dot');
        const text = document.getElementById('db-status-text');
        const label = document.getElementById('db-type-label');
        if(!dot || !text) return;

        try {
            const status = await window.localDb.safeFetch(`${window.API_BASE}/status`);
            const isHealthy = status.dbStatus === 'Connected';
            
            dot.style.background = isHealthy ? '#00b894' : '#ff7675';
            text.textContent = isHealthy ? 'System Online' : 'DB Sync Error';
            text.style.color = isHealthy ? '#00b894' : '#ff7675';
            const engineInfo = status.dbType ? `${status.dbType.toUpperCase()} Engine` : 'MYSQL Engine';
            label.textContent = `${engineInfo} | v2.7`;
            
            if (!isHealthy && status.dbError) {
                console.error("Database Health Warning:", status.dbError);
            }
        } catch(e) {
             dot.style.background = '#ff7675';
             text.textContent = 'Server Offline';
             text.style.color = '#ff7675';
             label.textContent = 'Connection Refused';
        }
    },

    initStabilityHandlers() {
        console.log("Initializing Stability Handlers...");
        
        // 1. Global Error Tracking
        window.onerror = (message, source, lineno, colno, error) => {
            console.error("Global JS Error:", message, "at", source, ":", lineno);
            this.showToast("An unexpected error occurred. We have logged it.", "error");
            this.logActivity('JS Error', `${message} @ ${source}:${lineno}`);
            return false;
        };

        window.onunhandledrejection = (event) => {
            console.error("Unhandled Promise Rejection:", event.reason);
            this.showToast("Sync issue detected. Retrying...", "warning");
        };

        // 2. Network Monitoring
        window.addEventListener('online', () => {
            this.showToast("Internet connection restored.", "success");
        });
        window.addEventListener('offline', () => {
            this.showToast("You are currently offline. Changes may not save.", "warning");
        });

        // 3. Search Keyboard Navigation State
        this._searchIndex = -1;
        this._searchItems = [];
    },

    showToast(message, type = 'info', duration = 4000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const icons = {
            success: 'check_circle',
            warning: 'warning',
            error: 'error',
            info: 'info'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon">${icons[type]}</span>
            <div class="toast-message">${message}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    injectTableLabels() {
        // Find all tables and inject data-label for mobile card responsiveness
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, i) => {
                    if (headers[i]) {
                        cell.setAttribute('data-label', headers[i]);
                    }
                });
            });
        });
    },

    handleGlobalSearch(query) {
        const resultsEl = document.getElementById('global-search-results');
        if (!query || query.length < 2) {
            if(resultsEl) resultsEl.classList.add('hidden');
            this._searchIndex = -1;
            this._searchItems = [];
            return;
        }
        
        const q = query.toLowerCase();
        const results = {
            jobs: [],
            invoices: [],
            quotations: [],
            inventory: []
        };

        // 1. Search Jobs (Workshop & Field)
        const allJobs = [...(this.state.jobs || []), ...(this.state.fieldJobs || [])];
        results.jobs = allJobs.filter(j => 
            (j.id || '').toLowerCase().includes(q) || 
            (j.customer || j.customerName || '').toLowerCase().includes(q)
        ).slice(0, 10);

        // 2. Search Invoices
        results.invoices = (this.state.invoices || []).filter(inv => 
            (inv.id || '').toLowerCase().includes(q) || 
            (inv.customer || '').toLowerCase().includes(q)
        ).slice(0, 10);

        // 3. Search Quotations
        results.quotations = (this.state.quotations || []).filter(quo => 
            (quo.id || '').toLowerCase().includes(q) || 
            (quo.customer || '').toLowerCase().includes(q)
        ).slice(0, 10);

        // 4. Search Inventory
        results.inventory = (this.state.inventory || []).filter(item => 
            (item.sku || '').toLowerCase().includes(q) || 
            (item.name || '').toLowerCase().includes(q) ||
            (item.serial || '').toLowerCase().includes(q)
        ).slice(0, 10);

        this.renderGlobalSearchResults(results);
    },

    renderGlobalSearchResults(results) {
        const resultsEl = document.getElementById('global-search-results');
        if(!resultsEl) return;

        const hasResults = results.jobs.length > 0 || results.invoices.length > 0 || results.quotations.length > 0 || results.inventory.length > 0;
        
        if(!hasResults) {
            resultsEl.innerHTML = `<div class="search-no-results">No documents found matching your search.</div>`;
            resultsEl.classList.remove('hidden');
            return;
        }

        let html = '';

        if(results.jobs.length > 0) {
            html += `<div class="search-header"><span class="material-symbols-outlined" style="font-size: 1rem;">build</span> Job Cards</div>`;
            html += results.jobs.map(j => `
                <div class="search-item" onclick="app.openDocumentPreview('job', '${j.id}')">
                    <div class="search-item-icon"><span class="material-symbols-outlined">description</span></div>
                    <div class="search-item-info">
                        <div class="search-item-title">${j.id}</div>
                        <div class="search-item-subtitle">${j.customer || j.customerName || 'Walk-in'} - ${j.device || 'Repair'}</div>
                    </div>
                </div>
            `).join('');
        }

        if(results.quotations.length > 0) {
            html += `<div class="search-header"><span class="material-symbols-outlined" style="font-size: 1rem;">request_quote</span> Quotations</div>`;
            html += results.quotations.map(q => `
                <div class="search-item" onclick="app.openDocumentPreview('quotation', '${q.id}')">
                    <div class="search-item-icon" style="color: #fdcb6e;"><span class="material-symbols-outlined">request_quote</span></div>
                    <div class="search-item-info">
                        <div class="search-item-title">${q.id}</div>
                        <div class="search-item-subtitle">${q.customer || 'Unnamed Client'} - R ${q.amount || '0.00'}</div>
                    </div>
                </div>
            `).join('');
        }

        if(results.invoices.length > 0) {
            html += `<div class="search-header"><span class="material-symbols-outlined" style="font-size: 1rem;">receipt_long</span> Invoices</div>`;
            html += results.invoices.map(inv => `
                <div class="search-item" onclick="app.openDocumentPreview('invoice', '${inv.id}')">
                    <div class="search-item-icon" style="color: #00b894;"><span class="material-symbols-outlined">receipt_long</span></div>
                    <div class="search-item-info">
                        <div class="search-item-title">${inv.id}</div>
                        <div class="search-item-subtitle">${inv.customer || 'Unnamed Client'} - R ${inv.amount || '0.00'}</div>
                    </div>
                </div>
            `).join('');
        }

        if(results.inventory.length > 0) {
            html += `<div class="search-header"><span class="material-symbols-outlined" style="font-size: 1rem;">inventory_2</span> Inventory & Parts</div>`;
            html += results.inventory.map(i => `
                <div class="search-item" onclick="app.openDocumentPreview('inventory', '${i.id}')">
                    <div class="search-item-icon" style="color: var(--accent);"><span class="material-symbols-outlined">inventory_2</span></div>
                    <div class="search-item-info">
                        <div class="search-item-title">${i.name}</div>
                        <div class="search-item-subtitle">SKU: ${i.sku} | In Stock: ${i.qty}</div>
                    </div>
                </div>
            `).join('');
        }

        resultsEl.innerHTML = html;
        resultsEl.classList.remove('hidden');
        
        // Cache items for keyboard nav
        this._searchItems = results.jobs.concat(results.quotations, results.invoices, results.inventory);
        this._searchIndex = -1;
    },

    openDocumentPreview(type, docId) {
        const dropdown = document.getElementById('global-search-results');
        if(dropdown) dropdown.classList.add('hidden');
        
        let doc = null;
        if(type === 'job') doc = [...(this.state.jobs || []), ...(this.state.fieldJobs || [])].find(x => x.id === docId);
        if(type === 'invoice') doc = (this.state.invoices || []).find(x => x.id === docId);
        if(type === 'quotation') doc = (this.state.quotations || []).find(x => x.id === docId);

        // Check cache if not found in state
        if (!doc && this.state._lastCreatedDoc && this.state._lastCreatedDoc.id === docId) {
            doc = this.state._lastCreatedDoc;
        }

        if(!doc) {
            alert("Error: Document not found in current session.");
            return;
        }

        let actionsHTML = '';
        let detailsHTML = `
            <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="font-size: 2.5rem; color: var(--accent); margin: 0;">${doc.id}</h1>
                <p style="color: #a0a0a0;">${type.charAt(0).toUpperCase() + type.slice(1)} Document</p>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <div>
                    <label style="font-size: 0.75rem; text-transform: uppercase; color: #747d8c; margin-bottom: 4px; display: block;">Customer</label>
                    <div style="font-weight: 600;">${doc.customer || doc.customerName || 'N/A'}</div>
                </div>
                <div>
                    <label style="font-size: 0.75rem; text-transform: uppercase; color: #747d8c; margin-bottom: 4px; display: block;">Status / Total</label>
                    <div style="font-weight: 600;">${doc.status || 'Pending'} / R ${doc.amount || '0.00'}</div>
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.75rem; text-transform: uppercase; color: #747d8c; margin-bottom: 4px; display: block;">Associated Info</label>
                    <div style="color: #a0a0a0;">${doc.device || doc.date || 'No extra info'}</div>
                </div>
            </div>
        `;

        if(type === 'invoice') {
            actionsHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button class="btn-primary" onclick="app.executeDocumentAction('Print', 'Invoice', '${doc.id}')"><span class="material-symbols-outlined">download</span> Download (Reprint)</button>
                    <button class="btn-primary" onclick="app.showSendModal('${doc.id}', 'Invoice')" style="background: var(--accent);"><span class="material-symbols-outlined">send</span> Resend to Client</button>
                    <button class="btn-secondary" onclick="app.markInvoiceAsPaid('${doc.id}')" style="grid-column: span 2; justify-content: center; border-color: var(--success); color: var(--success);"><span class="material-symbols-outlined">payments</span> Mark as Paid</button>
                </div>
            `;
        } else if(type === 'quotation') {
            actionsHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button class="btn-primary" onclick="app.openEditQuotationModal('${doc.id}')"><span class="material-symbols-outlined">edit</span> Edit Quotation</button>
                    <button class="btn-primary" onclick="app.convertQuoteToInvoice('${doc.id}')" style="background: var(--success);"><span class="material-symbols-outlined">receipt_long</span> Convert to Invoice</button>
                    <button class="btn-secondary" onclick="app.executeDocumentAction('Print', 'Quotation', '${doc.id}')" style="grid-column: span 2; justify-content: center;"><span class="material-symbols-outlined">download</span> Download PDF</button>
                </div>
            `;
        } else if(type === 'job') {
            actionsHTML = `
                <button class="btn-primary" onclick="app.closeModal(); app.navigateToDocument('job', '${doc.id}')" style="width: 100%; justify-content: center; padding: 14px;">
                    <span class="material-symbols-outlined">open_in_new</span> Open in Service Workspace
                </button>
            `;
        }

        this.showModal(`
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Document Preview</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    ${detailsHTML}
                    ${actionsHTML}
                </div>
            </div>
        `);
    },

    navigateToDocument(type, id) {
        const dropdown = document.getElementById('global-search-results');
        if(dropdown) dropdown.classList.add('hidden');
        
        const searchInput = document.getElementById('global-search-input');
        if(searchInput) searchInput.value = '';

        if(type === 'job') {
            const isField = id.startsWith('FLD-');
            window.location.hash = isField ? '#field' : '#repair';
            setTimeout(() => {
                const mod = isField ? window.field : window.repair;
                if(mod && typeof mod.openJob === 'function') {
                    mod.openJob(id);
                }
            }, 100);
        } else if(type === 'quotation') {
            window.location.hash = '#quotations';
        } else if(type === 'invoice') {
            window.location.hash = '#invoices';
        }
    },

    fillCustomerDetails(name, prefix) {
        if(!this.state.customers) return;
        const c = this.state.customers.find(x => x.name.toLowerCase() === name.toLowerCase());
        if(c) {
            const phoneEl = document.getElementById(prefix + '-phone');
            const emailEl = document.getElementById(prefix + '-email');
            const addrEl = document.getElementById(prefix + '-address'); 
            const vatEl = document.getElementById(prefix + '-vat'); 
            const regEl = document.getElementById(prefix + '-reg'); 
            if(phoneEl && c.phone) phoneEl.value = c.phone;
            if(emailEl && c.email) emailEl.value = c.email;
            if(addrEl && c.address) addrEl.value = c.address;
            if(vatEl && c.vat) vatEl.value = c.vat;
            if(regEl && c.regNo) regEl.value = c.regNo;
        }
    },
    
    generateCustomerDatalist() {
        if(!this.state.customers) return '';
        return `<datalist id="crm-customers-list">
            ${this.state.customers.map(c => `<option value="${c.name}">${c.email || c.phone || 'No contact info'}</option>`).join('')}
        </datalist>`;
    },
    
    generateInventoryDatalist() {
        if(!this.state.inventory) return '';
        return `<datalist id="inventory-items-list">
            ${this.state.inventory.map(i => `<option value="${i.name}" data-price="${i.sell}" data-type="${i.itemType || 'Hardware'}">SKU: ${i.sku} | R ${i.sell}</option>`).join('')}
        </datalist>`;
    },

    fillLinePriceFromInventory(input, prefix) {
        const val = input.value;
        const item = (this.state.inventory || []).find(i => i.name === val);
        if (item) {
            const row = input.closest('.quo-item-row, .inv-item-row');
            if (row) {
                const priceInput = row.querySelector(`.${prefix}-unit`);
                const typeSelect = row.querySelector(`.${prefix}-type`);
                if (priceInput) {
                    priceInput.value = item.sell;
                    this[prefix === 'quo' ? 'calcQuotationTotal' : 'calcInvoiceTotal']();
                }
                if (typeSelect) {
                    const typeMap = { 'Service': 'Labour', 'Stock': 'Hardware' };
                    typeSelect.value = typeMap[item.itemType] || item.itemType || 'Hardware';
                }
            }
        }
    },
    
    async getNextSequence(prefix) {
        try {
            const data = await window.safeFetch(`${window.API_BASE}/counters/${prefix}`, { method: 'POST' });
            return data.newId;
        } catch (e) {
            console.error("Sequence Generation Error:", e);
            // High-entropy fallback: Use timestamp + random suffix to prevent collisions
            const timestamp = Date.now().toString().slice(-4);
            const random = Math.floor(100 + Math.random() * 899).toString();
            const fallbackId = `${prefix}-${timestamp}${random}`;
            console.warn(`Fallback ID generated: ${fallbackId}`);
            return fallbackId;
        }
    },

    refreshAllData() {
        const icon = document.getElementById('global-refresh-icon');
        if (icon) icon.classList.add('rotating');
        
        console.log("♻️ Triggering Global Data Refresh...");
        
        if (window.localDb && window.localDb._collections) {
            Object.values(window.localDb._collections).forEach(coll => {
                if (coll.listeners.length > 0) coll.fetch();
            });
            this.showToast("Syncing all data with server...", "info");
        }

        setTimeout(() => {
            if (icon) icon.classList.remove('rotating');
            this.refreshActiveViews();
        }, 1000);
    },

    cacheDOM() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.mobileNavItems = document.querySelectorAll('.mobile-nav-item');
        this.viewSections = document.querySelectorAll('.view-section');
        this.modalContainer = document.getElementById('modal-container');
        console.log(`DOM Cached: ${this.navItems.length} nav items, ${this.viewSections.length} sections.`);
    },

    bindEvents() {
        // Mobile Sidebar Toggle
        const menuBtn = document.getElementById('mobile-menu-toggle');
        const backdrop = document.getElementById('sidebar-backdrop');
        const sidebar = document.querySelector('.sidebar');

        const toggleSidebar = (force = null) => {
            const isOpen = force !== null ? force : sidebar.classList.contains('open');
            sidebar.classList.toggle('open', !isOpen);
            if (backdrop) backdrop.classList.toggle('active', !isOpen);
        };

        if (menuBtn) menuBtn.onclick = () => toggleSidebar();
        if (backdrop) backdrop.onclick = () => toggleSidebar(true);

        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // If on mobile, close the sidebar when navigating
                if (window.innerWidth <= 992) {
                    toggleSidebar(true);
                }
            });
        });

        this.mobileNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Remove active class from all mobile nav items
                this.mobileNavItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
            });
        });

        window.addEventListener('hashchange', () => this.handleRouting());

        // Global Error Handling for Stability
        window.onerror = (msg, url, line, col, error) => {
            console.error("Global Error:", {msg, url, line, col, error});
            if (typeof app.showToast === 'function') {
                app.showToast("An unexpected error occurred. We've logged it for review.", "error");
            }
            return false;
        };

        // Global Search Binding
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleGlobalSearch(e.target.value));
            searchInput.addEventListener('focus', (e) => {
                if(e.target.value.length >= 2) this.handleGlobalSearch(e.target.value);
            });
            searchInput.addEventListener('keydown', (e) => this.handleSearchKeyboard(e));
        }

        // Hide search dropdown on click outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('global-search-results');
            const searchWrap = document.querySelector('.search-wrap');
            if (dropdown && searchWrap && !searchWrap.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Close modal on outside click
        this.modalContainer.addEventListener('click', (e) => {
            if(e.target === this.modalContainer) {
                this.closeModal();
            }
        });

        // Topbar Settings Binding
        const topSettingsBtn = document.getElementById('btn-topbar-settings');
        if (topSettingsBtn) {
            topSettingsBtn.addEventListener('click', () => {
                window.location.hash = '#company';
            });
        }
    },

    handleSearchKeyboard(e) {
        const dropdown = document.getElementById('global-search-results');
        if (!dropdown || dropdown.classList.contains('hidden')) return;

        const items = dropdown.querySelectorAll('.search-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._searchIndex = (this._searchIndex + 1) % items.length;
            this.highlightSearchItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._searchIndex = (this._searchIndex - 1 + items.length) % items.length;
            this.highlightSearchItem(items);
        } else if (e.key === 'Enter' && this._searchIndex > -1) {
            e.preventDefault();
            items[this._searchIndex].click();
        } else if (e.key === 'Escape') {
            dropdown.classList.add('hidden');
        }
    },

    highlightSearchItem(items) {
        items.forEach((item, idx) => {
            if (idx === this._searchIndex) {
                item.classList.add('highlighted');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('highlighted');
            }
        });
    },

    handleRouting() {
        const hash = window.location.hash || '#dashboard';
        const navItem = Array.from(this.navItems).find(item => item.getAttribute('href') === hash);
        
        // Update Mobile Nav Active State
        this.mobileNavItems.forEach(item => {
            if (item.getAttribute('href') === hash) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (navItem) {
            const targetView = navItem.getAttribute('data-target');
            this.navigate(targetView, navItem);
        } else {
            // Check mobile nav items if sidebar item not found
            const mNavItem = Array.from(this.mobileNavItems).find(item => item.getAttribute('href') === hash);
            if (mNavItem) {
                this.navigate(mNavItem.getAttribute('data-target'), mNavItem);
            } else if (hash === '#profile') {
                this.navigate('profile-view', document.getElementById('nav-profile'));
            }
        }
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container') || this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'check_circle',
            warning: 'warning',
            error: 'error',
            info: 'info'
        };

        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon">${icons[type] || 'info'}</span>
            <div class="toast-body">${message}</div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    createToastContainer() {
        const div = document.createElement('div');
        div.id = 'toast-container';
        document.body.appendChild(div);
        return div;
    },

    async navigate(viewId, navItem) {
        if(this.isNavigating) return;
        this.isNavigating = true;
        
        console.log(`Navigating to ${viewId}`);
        
        // 1. Update Nav Active State
        this.navItems.forEach(nav => nav.classList.remove('active'));
        if(navItem) {
            navItem.classList.add('active');
        } else {
            const fallbackNav = Array.from(this.navItems).find(nav => nav.getAttribute('data-target') === viewId);
            if(fallbackNav) fallbackNav.classList.add('active');
        }

        // 2. Animate Out
        const currentActive = document.querySelector('.view-section.active');
        if(currentActive && currentActive.id !== viewId) {
            currentActive.style.opacity = '0';
            currentActive.style.transform = 'translate3d(0, -10px, 0)';
            await new Promise(r => setTimeout(r, 200));
        }

        // 3. Update View Active State
        this.viewSections.forEach(section => {
            section.classList.remove('active', 'entry-anim');
            section.classList.add('hidden');
            section.style.display = 'none';
        });

        const target = document.getElementById(viewId);
        if(target) {
            target.classList.remove('hidden');
            target.style.display = 'block';
            
            // Force reflow for animation
            void target.offsetWidth;
            
            target.classList.add('active');
            this.state.currentView = viewId;
            
            // Adaptive Sync: Activate data streams for this view
            this.updateViewSync(viewId);
            
            // Critical Fix: Force an immediate deep refresh to prevent blank views
            if (window.localDb && typeof window.localDb.syncAll === 'function') {
                window.localDb.syncAll();
            }
            
            // Force a refresh immediately (in case data was already cached/synced)
            this.refreshActiveViews();
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        this.isNavigating = false;
    },

    switchTab(viewId) {
        // Find which nav item has this data-target
        const navItem = Array.from(this.navItems).find(i => i.getAttribute('data-target') === viewId);
        if (navItem) {
            window.location.hash = navItem.getAttribute('href');
        } else if (viewId === 'profile-view') {
            window.location.hash = '#profile';
        }
    },

    showModal(contentHTML) {
        this.modalContainer.innerHTML = contentHTML;
        this.modalContainer.classList.add('active');
        
        // specific modal setups
        if (contentHTML.includes('signature-pad')) {
            this.initSignaturePad();
        }
    },

    closeModal() {
        this.modalContainer.classList.remove('active');
        this.modalContainer.innerHTML = '';
    },

    showSendModal(docId, docType) {
        let doc = null;
        let internalDocType = docType.toLowerCase();
        
        if(internalDocType.includes('job') || docId.startsWith('JOB') || docId.startsWith('FLD')) {
            doc = [...(this.state.jobs || []), ...(this.state.fieldJobs || [])].find(x => x.id === docId);
            docType = 'Job Card';
        } else if(internalDocType.includes('invoice') || docId.startsWith('INV')) {
            doc = (this.state.invoices || []).find(x => x.id === docId);
            docType = 'Invoice';
        } else if(internalDocType.includes('quotation') || docId.startsWith('QUO')) {
            doc = (this.state.quotations || []).find(x => x.id === docId);
            docType = 'Quotation';
        }

        // Check cache if not found in state
        if (!doc && this.state._lastCreatedDoc && this.state._lastCreatedDoc.id === docId) {
            doc = this.state._lastCreatedDoc;
        }

        const clientName = doc ? (doc.customer || doc.customerName || 'N/A') : 'N/A';
        const amount = doc ? (doc.amount || '') : '';
        const email = doc ? (doc.email || '') : '';
        const phone = doc ? (doc.phone || '') : '';

        this.showDocumentActionModal(docType, docId, clientName, amount, email, phone);
    },

    async markInvoiceAsPaid(id) {
        if(!confirm(`Mark invoice ${id} as fully paid?`)) return;
        try {
            await window.fbDb.collection('invoices').doc(id).update({ status: 'Paid', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            alert("Invoice marked as Paid!");
            this.closeModal();
            this.refreshActiveViews();
        } catch(e) {
            console.error(e);
            alert("Error updating invoice: " + e.message);
        }
    },



    showNewJobModal() {
        const modalHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Create New Job (Walk-in)</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="new-job-form" onsubmit="app.handleNewJob(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Customer Name</label>
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" id="job-customer" list="crm-customers-list" class="form-control" placeholder="Select existing or type Walk-in" required oninput="app.fillCustomerDetails(this.value, 'job')">
                                    <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal('job')" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                                </div>
                                ${this.generateCustomerDatalist()}
                            </div>
                            <div class="form-group">
                                <label>Cell Phone</label>
                                <input type="tel" id="job-phone" class="form-control" placeholder="082 123 4567" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="job-email" class="form-control" placeholder="e.g. name@example.com">
                        </div>
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <h3 style="margin-bottom: 16px; font-size: 1.05rem; color: #ffffff;">Device Details</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Device Type</label>
                                <select id="job-device-type" class="form-control" required style="appearance: auto;">
                                    <option value="" disabled selected>Select type</option>
                                    <option value="Laptop" style="background: #1a1d2d; color: #fff;">Laptop</option>
                                    <option value="Printer" style="background: #1a1d2d; color: #fff;">Printer</option>
                                    <option value="Desktop" style="background: #1a1d2d; color: #fff;">Desktop</option>
                                    <option value="Tablet" style="background: #1a1d2d; color: #fff;">Tablet</option>
                                    <option value="Switch" style="background: #1a1d2d; color: #fff;">Switch</option>
                                    <option value="Router" style="background: #1a1d2d; color: #fff;">Router</option>
                                    <option value="TV" style="background: #1a1d2d; color: #fff;">TV</option>
                                    <option value="Other" style="background: #1a1d2d; color: #fff;">Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Brand</label>
                                <input type="text" id="job-brand" class="form-control" placeholder="e.g. Dell, HP, Apple" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Model</label>
                                <input type="text" id="job-model" class="form-control" placeholder="e.g. XPS 15" required>
                            </div>
                            <div class="form-group">
                                <label>Serial Number</label>
                                <input type="text" id="job-serial" class="form-control" placeholder="e.g. SN123456789">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Accessories Left</label>
                            <input type="text" id="job-accessories" class="form-control" placeholder="e.g. Charger, Bag">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Fault Description</label>
                                <textarea id="job-fault" class="form-control" rows="2" placeholder="Describe the issue..." required></textarea>
                            </div>
                            <div class="form-group">
                                <label>Device Password / PIN</label>
                                <input type="text" id="job-passcode" class="form-control" placeholder="Optional. Needed for login tests">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Customer Signature</label>
                            <p style="font-size: 0.8rem; color: #a0a0a0; margin-bottom: 8px;">
                                <i>Terms & Conditions: By signing below, you agree to IT Guy Solutions' strictly enforced policy that all devices <strong>must be collected within 48 hours</strong> of being notified of repair completion, otherwise storage fees may apply.</i>
                            </p>
                            <canvas id="signature-canvas" class="signature-pad"></canvas>
                            <button type="button" class="btn-secondary" style="margin-top: 8px;" onclick="app.clearSignature()">Clear Signature</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Create Booking</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        this.showModal(modalHTML);
    },
    
    async handleNewJob(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        const customer = document.getElementById('job-customer').value;
        const phone = document.getElementById('job-phone').value;
        const email = document.getElementById('job-email').value;
        const type = document.getElementById('job-device-type').value;
        const brand = document.getElementById('job-brand').value;
        const model = document.getElementById('job-model').value;
        const serial = document.getElementById('job-serial').value;
        const accessories = document.getElementById('job-accessories').value;
        const fault = document.getElementById('job-fault').value;
        const passcode = document.getElementById('job-passcode').value;
        
        const canvas = document.getElementById('signature-canvas');
        const signatureBase64 = canvas ? canvas.toDataURL() : null;

        const device = `${type} (${brand} ${model})${serial ? ' - SN: ' + serial : ''}${accessories ? ' [Acc: ' + accessories + ']' : ''}`;
        
        try {
            const newId = await this.getNextSequence("JOB");
            const payload = {
                id: newId,
                customer: customer,
                phone: phone,
                email: email,
                device: device,
                deviceType: type,
                brand: brand,
                model: model,
                serial: serial,
                accessories: accessories,
                faultDescription: fault,
                devicePasscode: passcode,
                signatureBase64: signatureBase64,
                status: 'Booked',
                date: new Date().toISOString().split('T')[0],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await window.fbDb.collection('jobs').doc(newId).set(payload);
            this.state._lastCreatedDoc = payload; // Cache for immediate actions
            this.closeModal();
            
            // Trigger the modal to choose Print, Download, Email, or WhatsApp
            if (window.pdfGenerator) {
                setTimeout(() => {
                    this.showDocumentActionModal('Job Card', newId, customer, 'N/A', email, phone);
                }, 800);
            }
            
            // Simulating auto-email notification toast
            alert('Job ' + newId + ' created successfully in Live DB! PDF generated and sent to customer via ' + (email ? 'Email' : 'WhatsApp') + '.');
        } catch(err) {
            console.error(err);
            alert("Database error: Could not save job.");
            if(btn) { btn.innerHTML = 'Save Job'; btn.disabled = false; }
        }
    },

    showScheduleCalloutModal() {
        const dateStr = new Date().toISOString().split('T')[0];
        const modalHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Schedule Call-out</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="schedule-callout-form" onsubmit="app.handleScheduledCallout(event)">
                        <div class="form-group">
                            <label>Client Details (Name or Company)</label>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="callout-client" list="crm-customers-list" class="form-control" placeholder="Select existing or type Walk-in" required oninput="app.fillCustomerDetails(this.value, 'callout')">
                                <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal('callout')" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                            </div>
                            ${this.generateCustomerDatalist()}
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Cell / WhatsApp</label>
                                <input type="tel" id="callout-phone" class="form-control" placeholder="e.g. 082 123 4567" required>
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" id="callout-email" class="form-control" placeholder="e.g. name@example.com">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Contact Person</label>
                                <input type="text" id="callout-contact-person" class="form-control" placeholder="Who to ask for on site" required>
                            </div>
                            <div class="form-group">
                                <label>Who booked the call</label>
                                <input type="text" id="callout-booked-by" class="form-control" placeholder="e.g. Admin User, Client Portal" value="Admin User" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Site Address</label>
                            <input type="text" id="callout-address" class="form-control" placeholder="123 Main Street..." required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Date Call Was Booked</label>
                                <input type="date" id="callout-booked-date" class="form-control" value="${dateStr}" readonly>
                            </div>
                            <div class="form-group">
                                <label>Assigned Technician</label>
                                <select id="callout-technician" class="form-control" required style="appearance: auto;">
                                    <option value="" disabled selected>Select from team</option>
                                    ${(this.state.users || []).filter(u => u.role === 'technician').map(t => `<option value="${t.firstName} ${t.lastName || ''}">${t.firstName} ${t.lastName || ''} (${t.username})</option>`).join('')}
                                    ${(this.state.users || []).filter(u => u.role === 'admin').map(a => `<option value="${a.firstName} ${a.lastName || ''}">${a.firstName} ${a.lastName || ''} (Admin)</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Description of the call</label>
                            <textarea id="callout-description" class="form-control" placeholder="Describe what the technician needs to do..." required></textarea>
                        </div>
                        <div class="form-group">
                            <label>Special Instructions</label>
                            <textarea id="callout-special" class="form-control" placeholder="Gate codes, parking info, access times..."></textarea>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Schedule & Notify</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        this.showModal(modalHTML);
    },

    async handleScheduledCallout(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        const client = document.getElementById('callout-client').value;
        const phone = document.getElementById('callout-phone').value;
        const email = document.getElementById('callout-email').value;
        const contactPerson = document.getElementById('callout-contact-person').value;
        const address = document.getElementById('callout-address').value;
        const technician = document.getElementById('callout-technician').value;
        const dateBooked = document.getElementById('callout-booked-date').value;
        const desc = document.getElementById('callout-description').value;
        const special = document.getElementById('callout-special').value;
        
        try {
            const newId = await this.getNextSequence("FLD");
            const payload = {
                id: newId,
                customer: client,
                phone: phone,
                email: email,
                contactPerson: contactPerson,
                address: address,
                technician: technician,
                status: 'Scheduled',
                dateBooked: dateBooked,
                description: desc,
                specialInstructions: special,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await window.fbDb.collection('fieldJobs').doc(newId).set(payload);
            this.state._lastCreatedDoc = payload; // Cache for immediate actions
            this.closeModal();

            const notifyMethod = email ? 'Email' : 'WhatsApp';
            let notifMsg = `Job ${newId} scheduled for ${client} in Live DB.\n\n`;
            notifMsg += `A notification has been sent to ${contactPerson} via ${notifyMethod} providing the technician's details and visit schedule.`;
            alert(notifMsg);
        } catch(err) {
            console.error(err);
            alert("Database Error: Could not schedule callout.");
            if(btn) { btn.innerHTML = 'Schedule Job'; btn.disabled = false; }
        }
    },

    showCreateInvoiceModal() {
        const dateStr = new Date().toISOString().split('T')[0];
        const modalHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>Create Invoice</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="create-invoice-form" onsubmit="app.handleCreateInvoice(event)">
                        
                        <div class="form-row" style="background: rgba(144, 202, 249, 0.05); padding: 12px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e0e0e0;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="color: var(--primary);">Generate From</label>
                                <select id="inv-source-type" class="form-control" style="appearance: auto; border-color: var(--primary);" onchange="app.handleInvoiceSourceTypeChange()">
                                    <option value="None" style="background: #1a1d2d; color: #fff;">None (Blank Invoice)</option>
                                    <option value="Workshop" style="background: #1a1d2d; color: #fff;">Workshop Booking</option>
                                    <option value="Field" style="background: #1a1d2d; color: #fff;">Field Call-out</option>
                                    <option value="Quotation" style="background: #1a1d2d; color: #fff;">Quotation</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="color: var(--primary);">Select Reference</label>
                                <select id="inv-source-id" class="form-control" style="appearance: auto; border-color: var(--primary);" onchange="app.handleInvoiceSourceIdChange()" disabled>
                                    <option value="" disabled selected>Select from list</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Company / Client Name (Optional)</label>
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" id="inv-client" list="crm-customers-list" class="form-control" placeholder="e.g. Acme Corp or Walk-in" oninput="app.fillCustomerDetails(this.value, 'inv')">
                                    <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal('invoice')" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                                </div>
                                ${this.generateCustomerDatalist()}
                                ${this.generateInventoryDatalist()}
                            </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>VAT Number (Optional)</label>
                                <input type="text" id="inv-vat" class="form-control" placeholder="e.g. 123456789">
                            </div>
                            <div class="form-group">
                                <label>Company Reg # (Optional)</label>
                                <input type="text" id="inv-reg" class="form-control" placeholder="e.g. 2024/000000/07">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone Number</label>
                                <input type="tel" id="inv-phone" class="form-control" placeholder="e.g. 082 123 4567" required>
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" id="inv-email" class="form-control" placeholder="e.g. name@example.com" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Physical Address (Optional)</label>
                            <input type="text" id="inv-address" class="form-control" placeholder="e.g. 123 Main Street, Suite 400">
                        </div>
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0; font-size: 1.05rem; color: #ffffff;">Line Items</h3>
                            <button type="button" class="btn-secondary" style="padding: 4px 12px; font-size: 0.9rem;" onclick="app.addInvoiceItemLine()">+ Add Item</button>
                        </div>
                        
                        <div id="invoice-items-container">
                            <!-- Items go here -->
                        </div>
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-top: 16px;">
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%;">
                                <span style="color: #a0a0a0; margin-right: 12px;">Subtotal:</span>
                                <input type="text" id="inv-subtotal" class="form-control" placeholder="R 0.00" readonly style="width: 150px; text-align: right; background: rgba(0,0,0,0.2); border: none;">
                            </div>
                            <div id="inv-vat-row" class="hidden" style="display: flex; align-items: center; justify-content: flex-end; width: 100%;">
                                <span id="inv-vat-label" style="color: #a0a0a0; margin-right: 12px;">VAT (15%):</span>
                                <input type="text" id="inv-vat-amount" class="form-control" placeholder="R 0.00" readonly style="width: 150px; text-align: right; background: rgba(0,0,0,0.2); border: none;">
                            </div>
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%; margin-top: 8px;">
                                <h3 style="margin: 0; margin-right: 16px; color: #ffffff;">Grand Total:</h3>
                                <input type="text" id="inv-amount" class="form-control" placeholder="R 0.00" readonly style="width: 150px; background: rgba(0,0,0,0.4); color: #00b894; font-weight: bold; font-size: 1.1rem; text-align: right;">
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Invoice Date</label>
                                <input type="date" id="inv-date" class="form-control" value="${dateStr}" required>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Generate Invoice</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        this.showModal(modalHTML);
        this.addInvoiceItemLine(); // Add an initial blank item line
    },

    handleInvoiceSourceTypeChange() {
        const type = document.getElementById('inv-source-type').value;
        const selectId = document.getElementById('inv-source-id');
        
        selectId.innerHTML = '<option value="" disabled selected>Select from list</option>';
        selectId.disabled = true;
        
        let arr = [];
        if (type === 'Workshop') arr = this.state.jobs;
        if (type === 'Field') arr = this.state.fieldJobs;
        if (type === 'Quotation') arr = this.state.quotations || [];
        
        if (arr.length > 0) {
            arr.forEach(item => {
                selectId.innerHTML += `<option value="${item.id}" style="background: #1a1d2d; color: #fff;">${item.id} - ${item.customer}</option>`;
            });
            selectId.disabled = false;
        } else if (type !== 'None') {
             selectId.innerHTML = '<option value="" disabled selected>No active items</option>';
        }
    },

    handleInvoiceSourceIdChange() {
        const type = document.getElementById('inv-source-type').value;
        const id = document.getElementById('inv-source-id').value;
        
        let sourceObj = null;
        if (type === 'Workshop') sourceObj = this.state.jobs.find(j => j.id === id);
        if (type === 'Field') sourceObj = this.state.fieldJobs.find(j => j.id === id);
        if (type === 'Quotation') sourceObj = (this.state.quotations || []).find(q => q.id === id);
        
        if (sourceObj) {
            document.getElementById('inv-client').value = sourceObj.customer || '';
            const vatEl = document.getElementById('inv-vat');
            if(vatEl) vatEl.value = sourceObj.vat || '';
            
            const regEl = document.getElementById('inv-reg');
            if(regEl) regEl.value = sourceObj.regNo || '';

            document.getElementById('inv-phone').value = sourceObj.phone || '';
            document.getElementById('inv-email').value = sourceObj.email || '';
            document.getElementById('inv-address').value = sourceObj.address || '';
            
            // Auto-fill items if they exist
            if (sourceObj.items && sourceObj.items.length > 0) {
                const container = document.getElementById('invoice-items-container');
                container.innerHTML = ''; // clear current items
                sourceObj.items.forEach(item => {
                    this.addInvoiceItemLine(item);
                });
            }
        }
    },

    addInvoiceItemLine(itemData = null) {
        const container = document.getElementById('invoice-items-container');
        if (!container) return;
        
        const rowId = 'item-row-' + Date.now() + Math.floor(Math.random() * 100);
        
        const type = itemData?.type || '';
        const desc = itemData?.desc || '';
        const unit = itemData?.unit || '';
        const qty = itemData?.qty || 1;
        
        const typeOptions = ['Labour', 'Hardware', 'Software', 'Call-out Fee', 'Other'].map(opt => 
            `<option value="${opt}" style="background: #1a1d2d; color: #fff;" ${type === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

        const rowHTML = `
            <div id="${rowId}" class="invoice-item-row" style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 12px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.1); position: relative;">
                <button type="button" class="btn-icon" style="position: absolute; top: 12px; right: 12px; color: #ff7675; background: rgba(255,118,117,0.1);" onclick="app.removeInvoiceItemLine('${rowId}')" title="Remove Line">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span>
                </button>

                <div class="form-group" style="margin-bottom: 12px; padding-right: 40px;">
                    <label style="font-size: 0.7rem; color: var(--accent); text-transform: uppercase;">Item Category</label>
                    <select class="form-control item-type" required style="appearance: auto; background: rgba(0,0,0,0.2);">
                        <option value="" disabled ${!type ? 'selected' : ''}>Select Category</option>
                        ${typeOptions}
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.7rem; color: var(--accent); text-transform: uppercase;">Description / Service Details</label>
                    <input type="text" class="form-control item-desc" placeholder="e.g. SSD Upgrade or Labour" value="${desc}" list="inventory-items-list" oninput="app.fillLinePriceFromInventory(this, 'inv')" required>
                </div>

                <div class="form-row" style="margin-bottom: 0;">
                    <div class="form-group">
                        <label style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">Unit Price (R)</label>
                        <input type="number" class="form-control item-unit" placeholder="0.00" oninput="app.calcInvoiceTotal()" value="${unit}" required min="0" step="0.01">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">Quantity</label>
                        <input type="number" class="form-control item-qty" value="${qty}" min="1" oninput="app.calcInvoiceTotal()" required>
                    </div>
                    <div class="form-group" style="display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end;">
                        <span style="font-size: 0.65rem; color: #a0a0a0; text-transform: uppercase; margin-bottom: 4px;">Line Total</span>
                        <span class="item-row-total" style="font-weight: 700; color: #00b894; font-size: 1.1rem;">R0.00</span>
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', rowHTML);
        this.calcInvoiceTotal();
    },

    removeInvoiceItemLine(rowId) {
        const row = document.getElementById(rowId);
        if (row) {
            row.remove();
            this.calcInvoiceTotal();
        }
    },

    calcInvoiceTotal() {
        const rows = document.querySelectorAll('.invoice-item-row');
        let subtotal = 0;
        
        rows.forEach(row => {
            const unitPrice = parseFloat(row.querySelector('.item-unit').value) || 0;
            const qty = parseInt(row.querySelector('.item-qty').value) || 0;
            const rowTotal = unitPrice * qty;
            subtotal += rowTotal;
            row.querySelector('.item-row-total').textContent = 'R ' + rowTotal.toFixed(2);
        });
        
        const settings = this.state.settings || {};
        const isVatRegistered = settings.vatRegistered === true;
        const vatRate = parseFloat(settings.vatRate) || 15;
        
        let vatAmount = 0;
        let grandTotal = subtotal;
        
        if (isVatRegistered) {
            vatAmount = subtotal * (vatRate / 100);
            grandTotal = subtotal + vatAmount;
            
            const vatRow = document.getElementById('inv-vat-row');
            if (vatRow) vatRow.classList.remove('hidden');
            const vatLabel = document.getElementById('inv-vat-label');
            if (vatLabel) vatLabel.textContent = `VAT (${vatRate}%):`;
            const vatField = document.getElementById('inv-vat-amount');
            if (vatField) vatField.value = 'R ' + vatAmount.toFixed(2);
        } else {
            const vatRow = document.getElementById('inv-vat-row');
            if (vatRow) vatRow.classList.add('hidden');
        }
        
        const subtotalField = document.getElementById('inv-subtotal');
        if (subtotalField) subtotalField.value = 'R ' + subtotal.toFixed(2);

        const amountField = document.getElementById('inv-amount');
        if (amountField) {
            amountField.value = 'R ' + grandTotal.toFixed(2);
        }
    },

    showScheduleCalloutModal() {
        const dateStr = new Date().toISOString().split('T')[0];
        const customers = this.state.customers || [];
        const techs = ['Unassigned', 'Admin User', 'Tech John', 'Tech Sarah']; // Could be dynamic
        
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Schedule Field Call-out</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="app.scheduleCalloutAction(event)">
                        <div class="form-group">
                            <label>Client / Customer</label>
                            <input type="text" id="call-client" class="form-control" placeholder="Search or Type Client Name..." list="customers-list" required>
                            <datalist id="customers-list">
                                ${customers.map(c => `<option value="${c.name || c.id}">${c.company || ''}</option>`).join('')}
                            </datalist>
                        </div>
                        <div class="form-group">
                            <label>Service Address</label>
                            <input type="text" id="call-address" class="form-control" placeholder="123 Street Name, Suburb" required onfocus="app.autoFillClientAddress()">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Date</label>
                                <input type="date" id="call-date" class="form-control" value="${dateStr}" required>
                            </div>
                            <div class="form-group">
                                <label>Preferred Time</label>
                                <input type="time" id="call-time" class="form-control" value="09:00">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Assign Technician</label>
                            <select id="call-tech" class="form-control" style="appearance: auto;">
                                ${techs.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Problem / Description</label>
                            <textarea id="call-desc" class="form-control" rows="3" placeholder="Describe the issue to resolve on-site..." required></textarea>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Book Call-out</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        this.showModal(modalHTML);
    },

    autoFillClientAddress() {
        const clientName = document.getElementById('call-client').value;
        const client = (this.state.customers || []).find(c => (c.name || c.id) === clientName || c.company === clientName);
        if (client && client.address) {
            document.getElementById('call-address').value = client.address;
        }
    },

    async scheduleCalloutAction(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = 'Scheduling...'; btn.disabled = true; }

        const jobData = {
            id: 'CALL-' + Math.floor(1000 + Math.random() * 9000),
            customer: document.getElementById('call-client').value,
            address: document.getElementById('call-address').value,
            date: document.getElementById('call-date').value,
            time: document.getElementById('call-time').value,
            technician: document.getElementById('call-tech').value,
            desc: document.getElementById('call-desc').value,
            status: 'Scheduled',
            items: [],
            notes: [],
            createdAt: new Date().toISOString()
        };

        try {
            await window.fbDb.collection('fieldJobs').doc(jobData.id).set(jobData);
            this.logActivity('Call-out Scheduled', `Scheduled ${jobData.id} for ${jobData.customer} on ${jobData.date}`);
            this.closeModal();
            // Refresh view
            if (window.field) window.field.render();
        } catch (err) {
            console.error(err);
            alert("Error scheduling call-out: " + err.message);
            if(btn) { btn.innerHTML = 'Book Call-out'; btn.disabled = false; }
        }
    },

    async handleCreateInvoice(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        let client = document.getElementById('inv-client').value;
        const vat = document.getElementById('inv-vat').value;
        const regNo = document.getElementById('inv-reg').value;
        const phone = document.getElementById('inv-phone').value;
        const email = document.getElementById('inv-email').value;
        const address = document.getElementById('inv-address').value;
        const amount = document.getElementById('inv-amount').value;
        const date = document.getElementById('inv-date').value;
        
        if (!client) {
            client = "Walk-in Client";
        }
        
        // Grab all item line records
        const items = [];
        document.querySelectorAll('.invoice-item-row').forEach(row => {
            items.push({
                type: row.querySelector('.item-type').value,
                desc: row.querySelector('.item-desc').value,
                unit: row.querySelector('.item-unit').value,
                qty: row.querySelector('.item-qty').value
            });
        });
        
        const subtotal = document.getElementById('inv-subtotal').value;
        const vatAmount = document.getElementById('inv-vat-amount').value;
        const settings = this.state.settings || {};
        
        try {
            const newId = await this.getNextSequence("INV");
            const payload = {
                id: newId,
                customer: client + (vat ? ' (VAT: ' + vat + ')' : ''),
                vatNumber: vat,
                regNo: regNo,
                phone: phone,
                email: email,
                address: address,
                items: items,
                subtotal: subtotal,
                vatAmount: vatAmount,
                vatRate: settings.vatRegistered ? settings.vatRate : 0,
                amount: amount,
                status: 'Unpaid',
                date: date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await window.fbDb.collection('invoices').doc(newId).set(payload, { merge: true });
            this.state._lastCreatedDoc = payload; // Cache for immediate actions
            this.logActivity('Invoice Created', `Generated ${newId} for ${client} (Amount: ${amount})`);
            this.closeModal(); // closes current modal
            
            setTimeout(() => {
                this.showDocumentActionModal('Invoice', newId, client, amount, email, phone);
            }, 300);
        } catch(err) {
            console.error(err);
            alert("Database Error: Could not save invoice.");
            if(btn) { btn.innerHTML = 'Save Invoice'; btn.disabled = false; }
        }
    },

    showDocumentActionModal(docType, docId, clientName, amount, email, phone) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; border-top: 4px solid var(--success);">
                <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
                    <span class="material-symbols-outlined" style="font-size: 48px; color: #00b894; margin-bottom: 8px;">check_circle</span>
                </div>
                <div class="modal-body" style="padding-top: 0;">
                    <h2 style="margin-bottom: 8px;">${docType} Generated</h2>
                    <p style="color: #a0a0a0; margin-bottom: 24px; font-size: 0.95rem;">
                        <strong>${docId}</strong> for ${clientName}<br>
                        Amount: <span style="font-weight: bold; color: #ffffff;">${amount}</span>
                    </p>
                    
                    <h3 style="font-size: 1rem; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Actions</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button type="button" class="btn-secondary" style="justify-content: center; border-radius: 6px;" onclick="app.executeDocumentAction('Print', '${docType}', '${docId}', this)">
                                <span class="material-symbols-outlined">print</span> Print
                            </button>
                            <button type="button" class="btn-secondary" style="justify-content: center; border-radius: 6px;" onclick="app.executeDocumentAction('Download', '${docType}', '${docId}', this)">
                                <span class="material-symbols-outlined">download</span> Download
                            </button>
                        </div>
                        <button type="button" class="btn-primary" style="justify-content: center; width: 100%; border-radius: 6px;" onclick="app.executeDocumentAction('Email', '${docType}', '${docId}', '${email}', this)">
                            <span class="material-symbols-outlined">mail</span> Send via Email
                        </button>
                        <button type="button" class="btn-primary" style="justify-content: center; width: 100%; border-radius: 6px; background: #128C7E; border-color: #128C7E;" onclick="app.executeDocumentAction('WhatsApp', '${docType}', '${docId}', '${phone}', this)">
                            <span class="material-symbols-outlined">chat</span> Send via WhatsApp
                        </button>
                    </div>
                    
                    <button type="button" class="btn-secondary" style="width: 100%; justify-content: center; background: transparent; border: none; text-decoration: underline;" onclick="app.closeModal()">Keep Working</button>
                </div>
            </div>
        `;
        this.showModal(modalHTML);
    },

    async executeDocumentAction(actionType, docType, docId, contactInfo = '', btn = null) {
        if (typeof contactInfo !== 'string') {
            btn = contactInfo; // If only 3 args passed or 4th is the btn
            contactInfo = '';
        }
        let oldContent = '';
        if (btn && btn.tagName === 'BUTTON') {
             oldContent = btn.innerHTML;
             btn.innerHTML = '<span class="material-symbols-outlined">sync</span> Processing...';
             btn.disabled = true;
        }

        let dataObj = null;
        
        // 0. Check immediate cache first (for just-created items)
        if (this.state._lastCreatedDoc && this.state._lastCreatedDoc.id === docId) {
            dataObj = this.state._lastCreatedDoc;
        }

        if (!dataObj && docType === 'Invoice') dataObj = app.state.invoices.find(i => i.id === docId);
        if (!dataObj && docType === 'Quotation') dataObj = (app.state.quotations || []).find(q => q.id === docId);
        if (docType === 'Cash Receipt') dataObj = (app.state.sales || []).find(s => s.id === docId);
        if (docType === 'Job Card') {
            dataObj = (app.state.jobs || []).find(j => j.id === docId) || (app.state.fieldJobs || []).find(f => f.id === docId);
        }
        if (docType === 'Statement') {
            // dataObj is already passed in the call for statements
        }

        // FALLBACK: If not in state, try to fetch directly from DB to avoid sync delay errors
        if (!dataObj && docType !== 'Report' && docType !== 'Statement') {
            try {
                let collName = '';
                if(docType === 'Invoice') collName = 'invoices';
                else if(docType === 'Quotation') collName = 'quotations';
                else if(docType === 'Cash Receipt') collName = 'sales';
                else if(docType === 'Job Card') collName = (docId.startsWith('FLD-')) ? 'fieldJobs' : 'jobs';
                
                if(collName) {
                    console.log(`Document ${docId} not in state. Attempting direct DB fetch...`);
                    const doc = await window.fbDb.collection(collName).doc(docId).get();
                    if(doc.exists) {
                        dataObj = doc.data();
                        console.log(`Successfully fetched ${docId} from DB fallback.`);
                    }
                }
            } catch (e) {
                console.error("Direct DB fetch failed during document action", e);
            }
        }

        if (actionType === 'Print' || actionType === 'Download') {
            if(!window.pdfGenerator) {
                alert("System Error: The high-fidelity PDF engine failed to load properly. Please refresh the portal and try again.");
                if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
                return;
            }

            if (!dataObj && docType !== 'Report') {
                alert(`Data Sync Error: Could not find the source record for ${docType} ${docId}. If you just created it, please wait a few seconds and try again.`);
                if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
                return;
            }

            if (actionType === 'Print') {
                await window.pdfGenerator.print(docType, docId, dataObj);
            } else {
                await window.pdfGenerator.download(docType, docId, dataObj);
            }
            
            if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
        } else {
            // Action is Email or WhatsApp
            try {
                if(!contactInfo || contactInfo === 'undefined' || contactInfo === 'null' || contactInfo.trim() === '') {
                    throw new Error(`No valid contact provided for ${actionType}. Please edit the client profile.`);
                }

                // Prepare Content Preview
                const sysSettings = this.state.settings || {};
                const subject = `${docType} - ${docId} from ${sysSettings.emailName || 'IT Guy Solutions'}`;
                const parsedAmt = dataObj && dataObj.amount ? parseFloat(dataObj.amount) : null;
                const amountMsg = parsedAmt && !isNaN(parsedAmt) ? `\n\nTotal Amount: R ${parsedAmt.toFixed(2)}` : '';
                let defaultText = `Hi,\n\nPlease find attached the ${docType} (${docId}) regarding your recent service.${amountMsg}\n\nKind Regards,\n${sysSettings.emailName || 'IT Guy Solutions'}`;
                
                if (actionType === 'WhatsApp') {
                    defaultText = `Hi! This is ${sysSettings.emailName || 'IT Guy Solutions'}. Just sharing your ${docType} (${docId}).${amountMsg}\n\nLink: https://app.itguysa.co.za/track.html?id=${docId}`;
                }

                const confirmed = await this.showNotificationPreview(actionType, contactInfo, subject, defaultText);
                if (!confirmed) {
                    if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
                    return;
                }

                const finalMessage = confirmed.message;

                // If email, we actually generate the PDF base64 to send as an attachment
                let pdfBase64 = null;
                if (actionType === 'Email' && window.pdfGenerator && docType !== 'Report') {
                    const { pdf } = await window.pdfGenerator.generateInternal(docType, docId, dataObj);
                    pdfBase64 = pdf.output('datauristring').split(',')[1];
                }

                const payload = {
                    actionType,
                    docType,
                    docId,
                    contactInfo,
                    pdfBase64,
                    dataObj,
                    customMessage: finalMessage,
                    subject: confirmed.subject || subject
                };

                if (actionType === 'WhatsApp') {
                    const waUrl = `https://wa.me/${contactInfo.replace(/\s+/g, '')}?text=${encodeURIComponent(finalMessage)}`;
                    window.open(waUrl, '_blank');
                    alert("WhatsApp opened in a new tab. Please complete the send there.");
                } else {
                    const res = await window.safeFetch(`${window.API_BASE || '/api'}/notify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    alert(`${docType} ${docId} successfully sent to ${contactInfo} via ${actionType}!`);
                }

            } catch (err) {
                console.error(err);
                alert(`Failed to send ${actionType}: ` + err.message);
            }
            if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
        }
    },

    showNotificationPreview(type, contact, subject, message) {
        return new Promise((resolve) => {
            const modalHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h2>Preview ${type}</h2>
                        <button class="btn-icon" onclick="app._resolvePreview(null)"><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 12px; color: var(--text-secondary);">Sending to: <strong>${contact}</strong></p>
                        ${type === 'Email' ? `
                            <div class="form-group">
                                <label>Subject</label>
                                <input type="text" id="prev-subject" class="form-control" value="${subject}">
                            </div>
                        ` : ''}
                        <div class="form-group">
                            <label>Message Content</label>
                            <textarea id="prev-message" class="form-control" style="height: 180px;">${message}</textarea>
                        </div>
                        <div class="modal-footer">
                            <button class="btn-secondary" onclick="app._resolvePreview(null)">Cancel</button>
                            <button class="btn-primary" onclick="app._resolvePreview('ok')">Send Now</button>
                        </div>
                    </div>
                </div>
            `;
            this.showModal(modalHTML);
            this._previewResolver = resolve;
        });
    },

    _resolvePreview(status) {
        if (!status) {
            this.closeModal();
            this._previewResolver(null);
            return;
        }
        const msg = document.getElementById('prev-message').value;
        const sub = document.getElementById('prev-subject')?.value || '';
        this.closeModal();
        this._previewResolver({ message: msg, subject: sub });
    },

    convertQuoteToInvoice(quoteId) {
        const quote = (this.state.quotations || []).find(q => q.id === quoteId);
        if(!quote) return;
        
        // Setup initial invoice modal, then artificially select this quote as the source
        this.showCreateInvoiceModal();
        setTimeout(() => {
             const typeSelect = document.getElementById('inv-source-type');
             if(typeSelect) {
                 typeSelect.value = 'Quotation';
                 this.handleInvoiceSourceTypeChange();
                 const idSelect = document.getElementById('inv-source-id');
                 if(idSelect) {
                     idSelect.value = quoteId;
                     this.handleInvoiceSourceIdChange();
                 }
             }
        }, 100);
    },

    showCreateQuotationModal() {
        const dateStr = new Date().toISOString().split('T')[0];
        this._renderQuotationModal("Create Quotation", { date: dateStr });
    },

    openEditQuotationModal(id) {
        const quote = (this.state.quotations || []).find(q => q.id === id);
        if(!quote) return alert("Quotation not found.");
        
        this._renderQuotationModal("Edit Quotation", quote);
        
        // Fill items
        const container = document.getElementById('quotation-items-container');
        if(container) {
            container.innerHTML = '';
            if(quote.items && quote.items.length > 0) {
                quote.items.forEach(item => this.addQuotationItemLine(item));
            } else {
                this.addQuotationItemLine();
            }
        }
        
        // Disable "Generate From" in edit mode to avoid confusion
        const sourceSelect = document.getElementById('quo-source-type');
        if(sourceSelect) sourceSelect.disabled = true;
    },

    _renderQuotationModal(title, data = {}) {
        const modalHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="create-quotation-form" onsubmit="app.handleCreateQuotation(event)">
                        <input type="hidden" id="quo-id-hidden" value="${data.id || ''}">
                        
                        <div class="form-row" style="background: rgba(144, 202, 249, 0.05); padding: 12px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e0e0e0;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="color: var(--primary);">Generate From</label>
                                <select id="quo-source-type" class="form-control" style="appearance: auto; border-color: var(--primary);" onchange="app.handleQuotationSourceTypeChange()">
                                    <option value="None" style="background: #1a1d2d; color: #fff;">None (Blank Quotation)</option>
                                    <option value="Workshop" style="background: #1a1d2d; color: #fff;">Workshop Booking</option>
                                    <option value="Field" style="background: #1a1d2d; color: #fff;">Field Call-out</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="color: var(--primary);">Select Reference</label>
                                <select id="quo-source-id" class="form-control" style="appearance: auto; border-color: var(--primary);" onchange="app.handleQuotationSourceIdChange()" disabled>
                                    <option value="" disabled selected>Select from list</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Company / Client Name</label>
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" id="quo-client" list="crm-customers-list" class="form-control" placeholder="e.g. Acme Corp or John Doe" value="${data.customer || ''}" required oninput="app.fillCustomerDetails(this.value, 'quo')">
                                    <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal('quotation')" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                                </div>
                                ${this.generateCustomerDatalist()}
                                ${this.generateInventoryDatalist()}
                            </div>
                            <div class="form-group">
                                <label>Phone Number</label>
                                <input type="tel" id="quo-phone" class="form-control" placeholder="e.g. 082 123 4567" value="${data.phone || ''}" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" id="quo-email" class="form-control" placeholder="e.g. name@example.com" value="${data.email || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Physical Address (Optional)</label>
                                <input type="text" id="quo-address" class="form-control" placeholder="e.g. 123 Main Street" value="${data.address || ''}">
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0; font-size: 1.05rem; color: #ffffff;">Line Items</h3>
                            <button type="button" class="btn-secondary" style="padding: 4px 12px; font-size: 0.9rem;" onclick="app.addQuotationItemLine()">+ Add Item</button>
                        </div>
                        
                        <div id="quotation-items-container">
                        </div>
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-top: 16px;">
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%;">
                                <span style="color: #a0a0a0; margin-right: 12px;">Subtotal:</span>
                                <input type="text" id="quo-subtotal" class="form-control" placeholder="R 0.00" value="${data.subtotal || ''}" readonly style="width: 150px; text-align: right; background: rgba(0,0,0,0.2); border: none;">
                            </div>
                            <div id="quo-vat-row" class="hidden" style="display: flex; align-items: center; justify-content: flex-end; width: 100%;">
                                <span id="quo-vat-label" style="color: #a0a0a0; margin-right: 12px;">VAT (15%):</span>
                                <input type="text" id="quo-vat-amount" class="form-control" placeholder="R 0.00" value="${data.vatAmount || ''}" readonly style="width: 150px; text-align: right; background: rgba(0,0,0,0.2); border: none;">
                            </div>
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%; margin-top: 8px;">
                                <h3 style="margin: 0; margin-right: 16px; color: #ffffff;">Grand Total:</h3>
                                <input type="text" id="quo-amount" class="form-control" placeholder="R 0.00" value="${data.amount || ''}" readonly style="width: 150px; background: rgba(0,0,0,0.4); color: #00b894; font-weight: bold; font-size: 1.1rem; text-align: right;">
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Quotation Date</label>
                                <input type="date" id="quo-date" class="form-control" value="${data.date || ''}" required>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">${data.id ? 'Update Quotation' : 'Generate Quotation'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        this.showModal(modalHTML);
        if(!data.id) this.addQuotationItemLine();
    },

    handleQuotationSourceTypeChange() {
        const type = document.getElementById('quo-source-type').value;
        const selectId = document.getElementById('quo-source-id');
        selectId.innerHTML = '<option value="" disabled selected>Select from list</option>';
        selectId.disabled = true;
        
        let arr = [];
        if (type === 'Workshop') arr = this.state.jobs;
        if (type === 'Field') arr = this.state.fieldJobs;
        
        if (arr.length > 0) {
            arr.forEach(item => {
                selectId.innerHTML += `<option value="${item.id}" style="background: #1a1d2d; color: #fff;">${item.id} - ${item.customer}</option>`;
            });
            selectId.disabled = false;
        } else if (type !== 'None') {
             selectId.innerHTML = '<option value="" disabled selected>No active items</option>';
        }
    },

    handleQuotationSourceIdChange() {
        const type = document.getElementById('quo-source-type').value;
        const id = document.getElementById('quo-source-id').value;
        let sourceObj = null;
        if (type === 'Workshop') sourceObj = this.state.jobs.find(j => j.id === id);
        if (type === 'Field') sourceObj = this.state.fieldJobs.find(j => j.id === id);
        
        if (sourceObj) {
            document.getElementById('quo-client').value = sourceObj.customer || '';
            document.getElementById('quo-phone').value = sourceObj.phone || '';
            document.getElementById('quo-email').value = sourceObj.email || '';
            document.getElementById('quo-address').value = sourceObj.address || '';
            
            if (sourceObj.items && sourceObj.items.length > 0) {
                const container = document.getElementById('quotation-items-container');
                container.innerHTML = ''; 
                sourceObj.items.forEach(item => this.addQuotationItemLine(item));
            }
        }
    },

    addQuotationItemLine(itemData = null) {
        const container = document.getElementById('quotation-items-container');
        if (!container) return;
        const rowId = 'quo-row-' + Date.now() + Math.floor(Math.random() * 100);
        
        const type = itemData?.type || '';
        const desc = itemData?.desc || '';
        const unit = itemData?.unit || '';
        const qty = itemData?.qty || 1;
        
        const typeOptions = ['Labour', 'Hardware', 'Software', 'Call-out Fee', 'Other'].map(opt => 
            `<option value="${opt}" style="background: #1a1d2d; color: #fff;" ${type === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');

        const rowHTML = `
            <div id="${rowId}" class="quo-item-row" style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 12px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.1); position: relative;">
                <button type="button" class="btn-icon" style="position: absolute; top: 12px; right: 12px; color: #ff7675; background: rgba(255,118,117,0.1);" onclick="app.removeQuotationItemLine('${rowId}')" title="Remove Line">
                    <span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span>
                </button>

                <div class="form-group" style="margin-bottom: 12px; padding-right: 40px;">
                    <label style="font-size: 0.7rem; color: var(--accent); text-transform: uppercase;">Item Category</label>
                    <select class="form-control quo-type" required style="appearance: auto; background: rgba(0,0,0,0.2);">
                        <option value="" disabled ${!type ? 'selected' : ''}>Select Category</option>
                        ${typeOptions}
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 12px;">
                    <label style="font-size: 0.7rem; color: var(--accent); text-transform: uppercase;">Description / Service Details</label>
                    <input type="text" class="form-control quo-desc" placeholder="e.g. SSD Upgrade or Labour" value="${desc}" list="inventory-items-list" oninput="app.fillLinePriceFromInventory(this, 'quo')" required>
                </div>

                <div class="form-row" style="margin-bottom: 0;">
                    <div class="form-group">
                        <label style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">Unit Price (R)</label>
                        <input type="number" class="form-control quo-unit" placeholder="0.00" oninput="app.calcQuotationTotal()" value="${unit}" required min="0" step="0.01">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">Quantity</label>
                        <input type="number" class="form-control quo-qty" value="${qty}" min="1" oninput="app.calcQuotationTotal()" required>
                    </div>
                    <div class="form-group" style="display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end;">
                        <span style="font-size: 0.65rem; color: #a0a0a0; text-transform: uppercase; margin-bottom: 4px;">Line Total</span>
                        <span class="quo-row-total" style="font-weight: 700; color: #00b894; font-size: 1.1rem;">R0.00</span>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', rowHTML);
        this.calcQuotationTotal();
    },

    removeQuotationItemLine(rowId) {
        const row = document.getElementById(rowId);
        if (row) { row.remove(); this.calcQuotationTotal(); }
    },

    calcQuotationTotal() {
        const rows = document.querySelectorAll('.quo-item-row');
        let subtotal = 0;
        rows.forEach(row => {
            const unitPrice = parseFloat(row.querySelector('.quo-unit').value) || 0;
            const qty = parseInt(row.querySelector('.quo-qty').value) || 0;
            const rowTotal = unitPrice * qty;
            subtotal += rowTotal;
            row.querySelector('.quo-row-total').textContent = 'R ' + rowTotal.toFixed(2);
        });
        
        const settings = this.state.settings || {};
        const isVatRegistered = settings.vatRegistered === true;
        const vatRate = parseFloat(settings.vatRate) || 15;
        
        let vatAmount = 0;
        let grandTotal = subtotal;
        
        if (isVatRegistered) {
            vatAmount = subtotal * (vatRate / 100);
            grandTotal = subtotal + vatAmount;
            
            const vatRow = document.getElementById('quo-vat-row');
            if (vatRow) vatRow.classList.remove('hidden');
            const vatLabel = document.getElementById('quo-vat-label');
            if (vatLabel) vatLabel.textContent = `VAT (${vatRate}%):`;
            const vatField = document.getElementById('quo-vat-amount');
            if (vatField) vatField.value = 'R ' + vatAmount.toFixed(2);
        } else {
            const vatRow = document.getElementById('quo-vat-row');
            if (vatRow) vatRow.classList.add('hidden');
        }
        
        const subtotalField = document.getElementById('quo-subtotal');
        if (subtotalField) subtotalField.value = 'R ' + subtotal.toFixed(2);

        const amountField = document.getElementById('quo-amount');
        if (amountField) amountField.value = 'R ' + grandTotal.toFixed(2);
    },

    async handleCreateQuotation(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        const client = document.getElementById('quo-client').value;
        const phone = document.getElementById('quo-phone').value;
        const email = document.getElementById('quo-email').value;
        const address = document.getElementById('quo-address').value;
        const amount = document.getElementById('quo-amount').value;
        const date = document.getElementById('quo-date').value;
        
        const items = [];
        document.querySelectorAll('.quo-item-row').forEach(row => {
            items.push({
                type: row.querySelector('.quo-type').value,
                desc: row.querySelector('.quo-desc').value,
                unit: row.querySelector('.quo-unit').value,
                qty: row.querySelector('.quo-qty').value
            });
        });
        
        const subtotal = document.getElementById('quo-subtotal').value;
        const vatAmount = document.getElementById('quo-vat-amount').value;
        const settings = this.state.settings || {};
        const existingId = document.getElementById('quo-id-hidden').value;

        try {
            const newId = existingId || await this.getNextSequence("QUO");
            const payload = {
                id: newId,
                customer: client,
                phone: phone,
                email: email,
                address: address,
                items: items,
                subtotal: subtotal,
                vatAmount: vatAmount,
                vatRate: settings.vatRegistered ? settings.vatRate : 0,
                amount: amount,
                status: 'Pending',
                date: date,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if(!existingId) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await window.fbDb.collection('quotations').doc(newId).set(payload, { merge: true });
            this.state._lastCreatedDoc = payload; // Cache for immediate actions
            this.closeModal();
            
            setTimeout(() => {
                this.showDocumentActionModal('Quotation', newId, client, amount, email, phone);
            }, 300);
        } catch(err) {
            console.error(err);
            alert("Database Error: Could not save quotation.");
            if(btn) { btn.innerHTML = 'Save Quotation'; btn.disabled = false; }
        }
    },

    initSignaturePad() {
        const canvas = document.getElementById('signature-canvas');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Setup canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // Background
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        function draw(e) {
            if (!isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
            const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
            
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
            [lastX, lastY] = [x, y];
        }

        canvas.addEventListener('mousedown', (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            [lastX, lastY] = [e.clientX - rect.left, e.clientY - rect.top];
        });
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mouseout', () => isDrawing = false);
        
        // Touch support
        canvas.addEventListener('touchstart', (e) => {
            isDrawing = true;
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            [lastX, lastY] = [touch.clientX - rect.left, touch.clientY - rect.top];
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault(); // prevent scrolling
            draw(e);
        });
        canvas.addEventListener('touchend', () => isDrawing = false);
        
        this.sigCtx = ctx;
        this.sigCanvas = canvas;
    },
    
    clearSignature() {
        if(this.sigCtx && this.sigCanvas) {
            this.sigCtx.fillStyle = "#fff";
            this.sigCtx.fillRect(0, 0, this.sigCanvas.width, this.sigCanvas.height);
        }
    },

    applyRolePermissions(user) {
        if(!user || !user.role) {
            console.error("Access Denied: Missing user role info");
            return;
        }
        console.log("Applying rules for role:", user.role);
        
        const role = user.role.toLowerCase();
        
        const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
        
        navItems.forEach(item => {
            const target = item.getAttribute('data-target');
            item.classList.remove('hidden'); // reset all to visible initially
            
            if (role === 'technician') {
                if(target === 'dashboard-view' || target === 'invoices-view' || target === 'quotations-view' || target === 'client-view' || target === 'team-view' || target === 'company-view' || target === 'reports-view' || target === 'pos-view' || target === 'inventory-view' || target === 'customers-view' || target === 'purchases-view') {
                    item.classList.add('hidden');
                }
            } else if (role === 'client') {
                if(target !== 'client-view' && target !== 'profile-view') {
                    item.classList.add('hidden');
                }
            } else if (role === 'frontdesk') {
                if(target === 'client-view' || target === 'repair-view' || target === 'team-view' || target === 'company-view' || target === 'inventory-view' || target === 'reports-view') {
                    item.classList.add('hidden');
                }
            } else {
                // Admin
                if(target === 'client-view' || target === 'field-view' || target === 'mystock-view') {
                    item.classList.add('hidden'); // Admin only manages global inventory/jobs
                }
                // Important: team-view and company-view are visible to admins
            }
        });
        
        // Dynamically check POS feature flag
        if(window.fbDb) {
            window.fbDb.collection("settings").doc("systemSettings").get().then(doc => {
                if(doc.exists && doc.data().enablePOS === false) {
                    const posNav = document.getElementById('nav-pos');
                    if(posNav && role !== 'admin') {
                        posNav.classList.add('hidden');
                    }
                }
            }).catch(e => console.error(e));
        }
        
        // Start Live Database Sync Engine
        this.startSync();
        
        // Boot settings if admin
        if(role === 'admin') {
            if(window.companySettings) window.companySettings.init();
            if(window.reports) window.reports.init();
            if(window.purchases) window.purchases.init();
        }
        if(window.mystock) window.mystock.init();
        if(window.wiki) window.wiki.init();
        
        // Render permitted view
        const newJobBtn = document.querySelector('.sidebar-new-job');
        if (role === 'technician') {
            document.querySelector('[data-target="mystock-view"]').click();
            if(newJobBtn) newJobBtn.classList.add('hidden');
            const mystockNav = document.getElementById('nav-mystock');
            if(mystockNav) mystockNav.classList.remove('hidden');
        } else if (role === 'client') {
            document.querySelector('[data-target="client-view"]').click();
            // Hide "New Job" button for clients
            if(newJobBtn) newJobBtn.classList.add('hidden');
        } else {
            const dbLink = document.querySelector('[data-target="dashboard-view"]');
            if(dbLink) dbLink.click();
            if(newJobBtn) newJobBtn.classList.remove('hidden');
        }
    },

    renderCurrentView() {
        // Handled by applyRolePermissions routing now on boot
    },

    scanBarcode() {
        // Check if library is loaded
        if (typeof Html5QrcodeScanner === 'undefined') {
            alert("Scanner library is still loading. Please make sure you are connected to the internet.");
            return;
        }

        const modalHTML = `
            <div class="modal-content" style="max-width: 600px; text-align: center;">
                <div class="modal-header">
                    <h2>Scan Job/Inventory Tag</h2>
                    <button class="btn-icon" onclick="app.closeScanner()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 20px; font-size: 0.9rem;">Point your camera at the QR Code or Barcode.</p>
                    <div id="qr-reader" style="width: 100%; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;"></div>
                </div>
            </div>
        `;
        this.showModal(modalHTML);

        // Initialize Scanner
        this.html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader", { fps: 10, qrbox: 250 }, false);

        this.html5QrcodeScanner.render((decodedText, decodedResult) => {
            console.log(`Scan result: ${decodedText}`);
            // Play a success beep physically
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
                audio.play().catch(e=>{});
            } catch(e){}
            
            this.closeScanner();
            
            // Auto trigger global search
            const searchInput = document.getElementById('global-search-input');
            if (searchInput) {
                searchInput.value = decodedText;
                this.handleGlobalSearch(decodedText);
            }

            // Direct Routing if it looks like a specific ID
            const q = decodedText.toLowerCase();
            const allJobs = [...(this.state.jobs || []), ...(this.state.fieldJobs || [])];
            const foundJob = allJobs.find(j => j.id.toLowerCase() === q);
            if (foundJob) {
                if (foundJob.id.startsWith('FLD')) {
                    document.querySelector('[data-target="field-view"]').click();
                } else {
                    document.querySelector('[data-target="repair-view"]').click();
                    setTimeout(() => window.repair.viewJob(foundJob.id), 100);
                }
                return;
            }

            const foundItem = (this.state.inventory || []).find(i => i.sku.toLowerCase() === q || (i.serial && i.serial.toLowerCase() === q));
            if (foundItem) {
                document.querySelector('[data-target="inventory-view"]').click();
                setTimeout(() => window.inventory.showEditPartModal(foundItem.id), 100);
                return;
            }

        }, (errorMessage) => {
            // Background scanning errors, ignore
        });
    },

    closeScanner() {
        if (this.html5QrcodeScanner) {
            this.html5QrcodeScanner.clear().catch(error => {
                console.error("Failed to clear html5QrcodeScanner. ", error);
            });
            this.html5QrcodeScanner = null;
        }
        this.closeModal();
    }
};

// Removed loose DOMContentLoaded init so auth.js controls boot flow
window.app = app;

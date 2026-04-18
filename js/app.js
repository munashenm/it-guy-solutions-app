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
        settings: {}
    },
    unsubscribes: [],

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.startSync();
        
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
            { name: 'customers', ref: window.customers }
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

    startSync() {
        if(!window.fbDb) return;
        if(this.syncStarted) return;
        this.syncStarted = true;
        
        this.unsubscribes.forEach(u => u());
        this.unsubscribes = [];
        this._syncRawData = {}; // Internal cache to handle multi-collection merges

        const register = (coll, stateKey) => {
            const unsub = window.fbDb.collection(coll).onSnapshot(snap => {
                if(!this._syncRawData[stateKey]) this._syncRawData[stateKey] = {};
                this._syncRawData[stateKey][coll] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Rebuild the merged state array from all registered collections for this key
                this.state[stateKey] = Object.values(this._syncRawData[stateKey]).flat();
                
                // One-time data migration/check for inventory
                if(stateKey === 'inventory') {
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
                }

                this.refreshActiveViews();
            });
            this.unsubscribes.push(unsub);
        };

        register('jobs', 'jobs');
        register('repairs', 'jobs'); // Support old/seeded repair collection name
        register('fieldJobs', 'fieldJobs');
        register('companyProfile', 'settings');
        register('documentSettings', 'settings');
        register('systemSettings', 'settings');
        register('activityLog', 'activityLog');
        register('invoices', 'invoices');
        register('quotations', 'quotations');
        register('inventory', 'inventory');
        register('techStock', 'techStock');
        register('suppliers', 'suppliers');
        register('customers', 'customers');
        register('sales', 'sales');
        register('tickets', 'tickets');
        register('purchaseOrders', 'purchaseOrders');
        register('expenses', 'expenses');
        register('knowledgeBase', 'knowledgeBase');
        
        
        // Settings Sync
        const settingsUnsub = window.fbDb.collection('settings').doc('systemSettings').onSnapshot(doc => {
            if(doc.exists) {
                this.state.settings = doc.data();
                this.refreshActiveViews();
            }
        });
        this.unsubscribes.push(settingsUnsub);
    },

    refreshActiveViews() {
        const now = Date.now();
        if (this._lastRefresh && now - this._lastRefresh < 500) return; // Debounce refreshes
        this._lastRefresh = now;

        console.log("Refreshing active views. Triggered for:", this.state.currentView);
        const activeView = this.state.currentView;
        
        try {
            if(window.dashboard && activeView === 'dashboard-view') dashboard.render();
            if(window.repair && activeView === 'repair-view') repair.render();
            if(window.field && activeView === 'field-view') field.render();
            if(window.quotation && activeView === 'quotations-view') quotation.render();
            if(window.invoice && activeView === 'invoices-view') invoice.render();
            if(window.inventory && activeView === 'inventory-view') inventory.render();
            if(window.mystock && activeView === 'mystock-view') mystock.render();
            if(window.posSystem && activeView === 'pos-view') posSystem.render();
            if(window.customers && activeView === 'customers-view') customers.render();
            if(window.reports && activeView === 'reports-view') reports.render();
            if(window.tickets && activeView === 'tickets-view') tickets.render();
            if(window.purchases && activeView === 'purchases-view') purchases.render();
            if(window.expenses && activeView === 'expenses-view') expenses.render();
            if(window.wiki && activeView === 'wiki-view') wiki.render();
        } catch (e) {
            console.error("Critical error during view refresh:", e);
        }
    },

    handleGlobalSearch(query) {
        const resultsEl = document.getElementById('global-search-results');
        if (!query || query.length < 2) {
            if(resultsEl) resultsEl.classList.add('hidden');
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
    },

    openDocumentPreview(type, docId) {
        const resultsEl = document.getElementById('global-search-results');
        if (resultsEl) resultsEl.classList.add('hidden');
        
        let data = null;
        let title = "";
        let actionsHTML = "";

        if (type === 'invoice') {
            data = (this.state.invoices || []).find(i => i.id === docId);
            title = "Invoice Preview";
            if (data) {
                actionsHTML = `
                    <button class="btn-primary" onclick="app.executeDocumentAction('Print', 'Invoice', '${docId}')"><span class="material-symbols-outlined">print</span> Print</button>
                    <button class="btn-primary" onclick="app.executeDocumentAction('Download', 'Invoice', '${docId}')"><span class="material-symbols-outlined">download</span> Download PDF</button>
                    <button class="btn-primary" style="background: #128C7E; border-color: #128C7E;" onclick="app.executeDocumentAction('WhatsApp', 'Invoice', '${docId}', '${data.phone || ''}')"><span class="material-symbols-outlined">chat</span> WhatsApp</button>
                    ${data.status !== 'Paid' ? `<button class="btn-secondary" style="background: var(--success); border-color: #00b894; color: white;" onclick="alert('Simulation: Marked ${data.id} as Paid')"><span class="material-symbols-outlined">check_circle</span> Mark Paid</button>` : ''}
                `;
            }
        } else if (type === 'quotation') {
            data = (this.state.quotations || []).find(q => q.id === docId);
            title = "Quotation Preview";
            if (data) {
                actionsHTML = `
                    <button class="btn-primary" onclick="app.executeDocumentAction('Print', 'Quotation', '${docId}')"><span class="material-symbols-outlined">print</span> Print</button>
                    <button class="btn-primary" onclick="app.executeDocumentAction('Download', 'Quotation', '${docId}')"><span class="material-symbols-outlined">download</span> Download PDF</button>
                    <button class="btn-secondary" onclick="quotation.editQuotation('${docId}')"><span class="material-symbols-outlined">edit</span> Edit</button>
                    ${data.status !== 'Invoiced' ? `<button class="btn-primary" style="background: var(--accent); border-color: var(--accent);" onclick="app.convertQuoteToInvoice('${docId}')"><span class="material-symbols-outlined">receipt</span> Invoice</button>` : ''}
                    <button class="btn-primary" style="background: #128C7E; border-color: #128C7E;" onclick="app.executeDocumentAction('WhatsApp', 'Quotation', '${docId}', '${data.phone || ''}')"><span class="material-symbols-outlined">chat</span> WhatsApp</button>
                `;
            }
        } else if (type === 'job') {
            data = (this.state.jobs || []).find(j => j.id === docId) || (this.state.fieldJobs || []).find(f => f.id === docId);
            title = "Job Card Preview";
            if (data) {
                actionsHTML = `
                    <button class="btn-primary" onclick="app.executeDocumentAction('Print', 'Job Card', '${docId}')"><span class="material-symbols-outlined">print</span> Print</button>
                    <button class="btn-primary" onclick="app.executeDocumentAction('Download', 'Job Card', '${docId}')"><span class="material-symbols-outlined">download</span> Download PDF</button>
                    <button class="btn-secondary" onclick="app.navigateToDocument('job', '${docId}')"><span class="material-symbols-outlined">open_in_new</span> Go to Workshop</button>
                `;
            }
        }


        if (!data) {
            alert("Document not found!");
            return;
        }

        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="close-modal" onclick="app.closeModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 24px;">
                    <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                            <span style="color: #a0a0a0;">Document ID:</span>
                            <span style="font-weight: bold; color: #ffffff;">${docId}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                            <span style="color: #a0a0a0;">Customer:</span>
                            <span style="font-weight: bold; color: #ffffff;">${data.customer || data.customerName || 'Walk-in'}</span>
                        </div>
                        ${data.amount ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                            <span style="color: #a0a0a0;">Amount:</span>
                            <span style="font-weight: bold; color: #ffffff;">R ${data.amount}</span>
                        </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #a0a0a0;">Status:</span>
                            <span class="badge ${data.status?.toLowerCase() || 'pending'}">${data.status || 'Active'}</span>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                        ${actionsHTML}
                    </div>
                </div>
            </div>
        `;

        this.showModal(modalHTML);
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
            const addrEl = document.getElementById(prefix + '-address'); // For invoces/callouts
            if(phoneEl && c.phone) phoneEl.value = c.phone;
            if(emailEl && c.email) emailEl.value = c.email;
            if(addrEl && c.address) addrEl.value = c.address;
        }
    },
    
    generateCustomerDatalist() {
        if(!this.state.customers) return '';
        return `<datalist id="crm-customers-list">
            ${this.state.customers.map(c => `<option value="${c.name}">${c.email || c.phone || 'No contact info'}</option>`).join('')}
        </datalist>`;
    },
    
    async getNextSequence(prefix) {
        try {
            const data = await window.safeFetch(`${window.API_BASE}/counters/${prefix}`, { method: 'POST' });
            return data.newId;
        } catch (e) {
            console.error("Sequence Generation Error:", e);
            // Fallback to random ID if server fails to prevent blocking the user
            return prefix + "-" + Math.floor(1000 + Math.random() * 9000);
        }
    },

    cacheDOM() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.viewSections = document.querySelectorAll('.view-section');
        this.modalContainer = document.getElementById('modal-container');
        console.log(`DOM Cached: ${this.navItems.length} nav items, ${this.viewSections.length} sections.`);
    },

    bindEvents() {
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // If on mobile, close the sidebar when navigating
                if (window.innerWidth <= 992) {
                    const sidebar = document.querySelector('.sidebar');
                    if (sidebar) sidebar.classList.remove('open');
                }
            });
        });

        window.addEventListener('hashchange', () => this.handleRouting());

        // Global Search Binding
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleGlobalSearch(e.target.value));
            searchInput.addEventListener('focus', (e) => {
                if(e.target.value.length >= 2) this.handleGlobalSearch(e.target.value);
            });
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

    handleRouting() {
        const hash = window.location.hash || '#dashboard';
        const navItem = Array.from(this.navItems).find(item => item.getAttribute('href') === hash);
        
        if (navItem) {
            const targetView = navItem.getAttribute('data-target');
            this.navigate(targetView, navItem);
        } else if (hash === '#profile') {
            this.navigate('profile-view', document.getElementById('nav-profile'));
        }
    },

    navigate(viewId, navItem) {
        console.log(`Navigating to ${viewId}`);
        
        // Update Nav Active State
        this.navItems.forEach(nav => nav.classList.remove('active'));
        if(navItem) {
            navItem.classList.add('active');
        } else {
            // Fallback: try to find the nav item for this view
            const fallbackNav = Array.from(this.navItems).find(nav => nav.getAttribute('data-target') === viewId);
            if(fallbackNav) fallbackNav.classList.add('active');
        }

        // Update View Active State
        this.viewSections.forEach(section => {
            section.classList.remove('active');
            section.classList.add('hidden');
            section.style.display = 'none'; // Forced hide for stability
        });

        const target = document.getElementById(viewId);
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
            target.style.display = 'block'; // Forced show
            this.state.currentView = viewId;
            
            // Trigger module specific renders if needed
            this.refreshActiveViews();
            
            // Scroll to top
            window.scrollTo(0, 0);
        } else {
            console.error(`CRITICAL: Navigation target not found: ${viewId}`);
        }
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

        const clientName = doc ? (doc.customer || doc.customerName || 'N/A') : 'N/A';
        const amount = doc ? (doc.amount || '') : '';
        const email = doc ? (doc.email || '') : '';
        const phone = doc ? (doc.phone || '') : '';

        this.showDocumentActionModal(docType, docId, clientName, amount, email, phone);
    },

    openDocumentPreview(type, id) {
        const dropdown = document.getElementById('global-search-results');
        if(dropdown) dropdown.classList.add('hidden');
        
        let doc = null;
        if(type === 'job') doc = [...(this.state.jobs || []), ...(this.state.fieldJobs || [])].find(x => x.id === id);
        if(type === 'invoice') doc = (this.state.invoices || []).find(x => x.id === id);
        if(type === 'quotation') doc = (this.state.quotations || []).find(x => x.id === id);

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

    async convertQuoteToInvoice(id) {
        const quote = (this.state.quotations || []).find(x => x.id === id);
        if(!quote) return;
        if(!confirm(`Are you sure you want to convert Quotation ${id} to a new Invoice?`)) return;

        try {
            const nextInvId = await this.getNextSequence("INV");
            const invoicePayload = {
                ...quote,
                id: nextInvId,
                status: 'Unpaid',
                quotationId: id,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            delete invoicePayload.updatedAt; // set new timestamp

            await window.fbDb.collection('invoices').doc(nextInvId).set(invoicePayload);
            alert(`Quotation ${id} successfully converted to Invoice ${nextInvId}!`);
            this.closeModal();
            window.location.hash = '#invoices';
        } catch(e) {
            console.error(e);
            alert("Error converting to invoice: " + e.message);
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
                                    <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal()" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
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
                                <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal()" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
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
                                    <option value="Admin User" style="background: #1a1d2d; color: #fff;">Admin User</option>
                                    <option value="Tech John" style="background: #1a1d2d; color: #fff;">Tech John</option>
                                    <option value="Tech Sarah" style="background: #1a1d2d; color: #fff;">Tech Sarah</option>
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
                                    <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal()" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                                </div>
                                ${this.generateCustomerDatalist()}
                            </div>
                            <div class="form-group">
                                <label>VAT Number (Optional)</label>
                                <input type="text" id="inv-vat" class="form-control" placeholder="e.g. 123456789">
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
            <div id="${rowId}" class="invoice-item-row" style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px dashed var(--border);">
                <div class="form-row" style="margin-bottom: 8px;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <select class="form-control item-type" required style="appearance: auto;">
                            <option value="" disabled ${!type ? 'selected' : ''}>Select type</option>
                            ${typeOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex: 2; margin-bottom: 0;">
                        <input type="text" class="form-control item-desc" placeholder="Description" value="${desc}" required>
                    </div>
                </div>
                <div class="form-row" style="margin-bottom: 0;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" class="form-control item-unit" placeholder="Unit Price" oninput="app.calcInvoiceTotal()" value="${unit}" required min="0" step="0.01">
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" class="form-control item-qty" value="${qty}" min="1" oninput="app.calcInvoiceTotal()" required>
                    </div>
                    <div class="form-group" style="flex: 1; display: flex; align-items: center; gap: 8px; margin-bottom: 0;">
                        <span class="item-row-total" style="flex: 1; text-align: right; color: #a0a0a0;">R0.00</span>
                        <button type="button" class="btn-icon" style="color: #ff4444;" onclick="app.removeInvoiceItemLine('${rowId}')" title="Remove Line"><span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span></button>
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

    async handleCreateInvoice(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        let client = document.getElementById('inv-client').value;
        const vat = document.getElementById('inv-vat').value;
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
            
            await window.fbDb.collection('invoices').doc(newId).set(payload);
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

        let dataObj = {};
        if (docType === 'Invoice') dataObj = app.state.invoices.find(i => i.id === docId);
        if (docType === 'Quotation') dataObj = (app.state.quotations || []).find(q => q.id === docId);
        if (docType === 'Cash Receipt') dataObj = (app.state.sales || []).find(s => s.id === docId);
        if (docType === 'Job Card') {
            dataObj = (app.state.jobs || []).find(j => j.id === docId) || (app.state.fieldJobs || []).find(f => f.id === docId);
        }

        if (actionType === 'Print' || actionType === 'Download') {
            if(!window.pdfGenerator) {
                alert("System Error: The high-fidelity PDF engine failed to load properly. Please refresh the portal and try again.");
                if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
                return;
            }

            if (!dataObj && docType !== 'Report') {
                alert(`Data Sync Error: Could not find the source record for ${docType} ${docId}. If you just created it, please wait a few seconds for synchronization.`);
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
                    dataObj
                };

                const res = await window.safeFetch(`${window.API_BASE || '/api'}/notify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                alert(`${docType} ${docId} successfully sent to ${contactInfo} via ${actionType}!`);
            } catch (err) {
                console.error(err);
                alert(`Failed to send ${actionType}: ` + err.message);
            }
            if(btn && btn.tagName === 'BUTTON') { btn.innerHTML = oldContent; btn.disabled = false; }
        }
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
                                    <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal()" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                                </div>
                                ${this.generateCustomerDatalist()}
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
            <div id="${rowId}" class="quo-item-row" style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px dashed var(--border);">
                <div class="form-row" style="margin-bottom: 8px;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <select class="form-control quo-type" required style="appearance: auto;">
                            <option value="" disabled ${!type ? 'selected' : ''}>Select type</option>
                            ${typeOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex: 2; margin-bottom: 0;">
                        <input type="text" class="form-control quo-desc" placeholder="Description" value="${desc}" required>
                    </div>
                </div>
                <div class="form-row" style="margin-bottom: 0;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" class="form-control quo-unit" placeholder="Unit Price" oninput="app.calcQuotationTotal()" value="${unit}" required min="0" step="0.01">
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" class="form-control quo-qty" value="${qty}" min="1" oninput="app.calcQuotationTotal()" required>
                    </div>
                    <div class="form-group" style="flex: 1; display: flex; align-items: center; gap: 8px; margin-bottom: 0;">
                        <span class="quo-row-total" style="flex: 1; text-align: right; color: #a0a0a0;">R0.00</span>
                        <button type="button" class="btn-icon" style="color: #ff4444;" onclick="app.removeQuotationItemLine('${rowId}')" title="Remove Line"><span class="material-symbols-outlined" style="font-size: 1.2rem;">delete</span></button>
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
        if(!user) return;
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
                if(target === 'client-view') {
                    item.classList.add('hidden'); // hide the outward client view for internal staff
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

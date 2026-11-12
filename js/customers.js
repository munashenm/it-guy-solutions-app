window.customers = {
    init() {
        this.container = document.getElementById('customers-content');
        if(this.container) this.render();
    },
    
    render() {
        if (!this.container) {
            this.container = document.getElementById('customers-content');
            if (!this.container) return;
        }
        let html = `
            <div class="section-header">
                <div>
                    <h1>Customers</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Names, phone numbers, and job history in one place.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-secondary" onclick="customers.toggleArchived()">${this.showArchived ? 'Hide archived' : 'Show archived'}</button>
                    <button class="btn-primary" onclick="customers.showAddCustomerModal()"><span class="material-symbols-outlined">person_add</span> Add Customer</button>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div class="table-container" style="max-height: 700px; overflow-y: auto;">
                    <table id="customers-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Phone Number</th>
                                <th>Email Address</th>
                                <th>Address</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>${this.renderCustomerRows()}</tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    showArchived: false,

    esc(value) {
        if (window.ItguyFixes && window.ItguyFixes.escapeHtml) return window.ItguyFixes.escapeHtml(value);
        return String(value == null ? '' : value);
    },

    visibleCustomers() {
        const all = (window.app && window.app.state && window.app.state.customers) || [];
        return all.filter(c => this.showArchived ? c && c.archived === true : !(c && c.archived === true));
    },

    toggleArchived() {
        this.showArchived = !this.showArchived;
        this.render();
    },

    recordCount(customer) {
        if (!window.ItguyFixes || !window.app) return 0;
        return window.ItguyFixes.customerLinkCount(customer, window.app.state || {});
    },

    renderCustomerRows() {
        const rows = this.visibleCustomers();
        if(!rows.length) {
            const empty = this.showArchived
                ? 'No archived customers.'
                : 'No customers yet. Add one so jobs and invoices can pick them from the list.';
            return `<tr><td colspan="5" style="text-align: center; color: #a0a0a0; padding: 32px;">${empty}</td></tr>`;
        }
        
        return rows.map(c => {
            const id = this.esc(c.id);
            const links = this.recordCount(c);
            const archived = c.archived === true;
            let action = '';
            if (archived) {
                action = `<button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="customers.restoreCustomer('${id}')">Restore</button>`;
            } else if (links > 0) {
                action = `<button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="customers.archiveCustomer('${id}')">Archive</button>`;
            } else {
                action = `<button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; color: #ff7675;" onclick="customers.deleteCustomer('${id}')">Delete</button>`;
            }
            return `
            <tr>
                <td><strong>${this.esc(c.name)}</strong>${archived ? ' <span class="badge" style="background:#636e72;">Archived</span>' : ''}</td>
                <td>${this.esc(c.phone || '-')}</td>
                <td><a href="mailto:${this.esc(c.email)}" style="color: #a29bfe; text-decoration: none;">${this.esc(c.email || '-')}</a></td>
                <td style="color: #a0a0a0; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.esc(c.address || '-')}</td>
                <td style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="customers.viewHistory('${id}')">
                        <span class="material-symbols-outlined" style="font-size: 1rem; margin-right: 4px;">history</span> History
                    </button>
                    ${action}
                </td>
            </tr>
            `;
        }).join('');
    },

    findCustomer(id) {
        const all = (window.app && window.app.state && window.app.state.customers) || [];
        return all.find(c => c && c.id === id);
    },

    async deleteCustomer(id) {
        const customer = this.findCustomer(id);
        const name = customer && customer.name ? customer.name : 'this customer';
        if (!confirm(`Delete ${name}?\n\nThis removes them from the customer list. It is only allowed when they have no jobs or invoices. Their records are not deleted.`)) return;
        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (window.app && window.app.state && Array.isArray(window.app.state.customers)) {
                window.app.state.customers = window.app.state.customers.filter(c => c.id !== id);
            }
            this.render();
            if (window.app && window.app.showToast) window.app.showToast(`${name} was deleted.`, 'success');
        } catch (err) {
            const message = err && err.message ? err.message : 'Could not delete that customer.';
            if (/archive/i.test(message) && confirm(`${message}\n\nArchive them now?`)) {
                await this.archiveCustomer(id, true);
                return;
            }
            alert(message);
        }
    },

    async archiveCustomer(id, alreadyConfirmed) {
        const customer = this.findCustomer(id);
        const name = customer && customer.name ? customer.name : 'this customer';
        const links = customer ? this.recordCount(customer) : 0;
        if (!alreadyConfirmed) {
            const recordNote = links > 0
                ? `They have ${links} job, invoice, quote, or ticket record${links === 1 ? '' : 's'}. Those records stay.`
                : 'They will be hidden from the active list. You can restore them later.';
            if (!confirm(`Archive ${name}?\n\n${recordNote}`)) return;
        }
        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/customers/${encodeURIComponent(id)}/archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            if (customer) {
                customer.archived = true;
            }
            this.render();
            if (window.app && window.app.showToast) window.app.showToast(`${name} was archived. Their jobs and invoices were kept.`, 'success');
        } catch (err) {
            alert(err.message || 'Could not archive that customer.');
        }
    },

    async restoreCustomer(id) {
        const customer = this.findCustomer(id);
        const name = customer && customer.name ? customer.name : 'this customer';
        if (!confirm(`Restore ${name} to the active customer list?`)) return;
        try {
            await window.safeFetch(`${window.API_BASE || '/api'}/customers/${encodeURIComponent(id)}/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            if (customer) customer.archived = false;
            this.render();
            if (window.app && window.app.showToast) window.app.showToast(`${name} is active again.`, 'success');
        } catch (err) {
            alert(err.message || 'Could not restore that customer.');
        }
    },

    lastModalSource: null,

    showAddCustomerModal(source = null) {
        this.lastModalSource = source;
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Add New Customer</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="customers.handleAddCustomer(event)">
                        <div class="form-group">
                            <label>Full Name / Company Name</label>
                            <input type="text" id="crm-name" class="form-control" placeholder="e.g. Alice Smith" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone Number</label>
                                <input type="tel" id="crm-phone" class="form-control" placeholder="082 123 4567" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0" required>
                            </div>
                            <div class="form-group">
                                <label>Email Address</label>
                                <input type="email" id="crm-email" class="form-control" placeholder="alice@example.com">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Physical Address</label>
                            <input type="text" id="crm-addr" class="form-control" placeholder="123 Main St, City">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>VAT Number (Optional)</label>
                                <input type="text" id="crm-vat" class="form-control" placeholder="e.g. 123456789">
                            </div>
                            <div class="form-group">
                                <label>Company Reg # (Optional)</label>
                                <input type="text" id="crm-reg" class="form-control" placeholder="e.g. 2024/000000/07">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Save Customer</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        const stack = !!(source && window.app.modalContainer && window.app.modalContainer.classList.contains('active'));
        window.app.showModal(modalHTML, { stack: stack });
    },

    async handleAddCustomer(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const payload = {
            name: document.getElementById('crm-name').value.trim(),
            phone: document.getElementById('crm-phone').value.trim(),
            email: document.getElementById('crm-email').value.trim(),
            address: document.getElementById('crm-addr').value.trim(),
            vat: document.getElementById('crm-vat').value.trim(),
            regNo: document.getElementById('crm-reg').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await window.fbDb.collection('customers').add(payload);
            
            const source = this.lastModalSource;
            const parentIds = ['inv-client', 'quo-client', 'callout-client', 'job-customer', 'tck-customer'];
            window.app.closeModal({ force: true });
            const parentRemains = parentIds.some(id => document.getElementById(id));

            // A stacked parent form is still on screen. Fill it instead of reopening and wiping unsaved lines.
            if (!parentRemains && source === 'tickets') {
                await window.tickets.showNewTicketModal();
                const custEl = document.getElementById('tck-customer');
                if(custEl) custEl.value = payload.name;
                const phoneEl = document.getElementById('tck-phone');
                if(phoneEl) phoneEl.value = payload.phone;
            } else if (!parentRemains && source === 'job') {
                window.app.showNewJobModal();
                const custEl = document.getElementById('job-customer');
                if(custEl) custEl.value = payload.name;
                const phoneEl = document.getElementById('job-phone');
                if(phoneEl) phoneEl.value = payload.phone;
                const emailEl = document.getElementById('job-email');
                if(emailEl) emailEl.value = payload.email;
            } else if (!parentRemains && source === 'callout') {
                window.app.showScheduleCalloutModal();
                const custEl = document.getElementById('callout-client');
                if(custEl) custEl.value = payload.name;
                const phoneEl = document.getElementById('callout-phone');
                if(phoneEl) phoneEl.value = payload.phone;
                const emailEl = document.getElementById('callout-email');
                if(emailEl) emailEl.value = payload.email;
                const addrEl = document.getElementById('callout-address');
                if(addrEl) addrEl.value = payload.address;
                const contactEl = document.getElementById('callout-contact-person');
                if(contactEl) contactEl.value = payload.name;
            } else if (!parentRemains && source === 'invoice') {
                window.app.showCreateInvoiceModal();
                const custEl = document.getElementById('inv-client');
                if(custEl) custEl.value = payload.name;
                const phoneEl = document.getElementById('inv-phone');
                if(phoneEl) phoneEl.value = payload.phone;
                const emailEl = document.getElementById('inv-email');
                if(emailEl) emailEl.value = payload.email;
                const addrEl = document.getElementById('inv-address');
                if(addrEl) addrEl.value = payload.address;
                const vatEl = document.getElementById('inv-vat');
                if(vatEl) vatEl.value = payload.vat;
                const regEl = document.getElementById('inv-reg');
                if(regEl) regEl.value = payload.regNo;
            } else if (!parentRemains && source === 'quotation') {
                window.app.showCreateQuotationModal();
                const custEl = document.getElementById('quo-client');
                if(custEl) custEl.value = payload.name;
                const phoneEl = document.getElementById('quo-phone');
                if(phoneEl) phoneEl.value = payload.phone;
                const emailEl = document.getElementById('quo-email');
                if(emailEl) emailEl.value = payload.email;
                const addrEl = document.getElementById('quo-address');
                if(addrEl) addrEl.value = payload.address;
            } else if (!parentRemains && source === 'pos' && window.posSystem) {
                // POS might handle its own customer selection or we might need to populate a specific field
                const custEl = document.getElementById('pos-customer');
                if(custEl) custEl.value = payload.name;
            }

            // Fallback: Populate any visible forms in the background (legacy behavior)
            const activeForms = [
                { id: 'callout-client', nameEl: 'callout-client', phoneEl: 'callout-phone', emailEl: 'callout-email', addressEl: 'callout-address', contactEl: 'callout-contact-person' },
                { id: 'job-customer', nameEl: 'job-customer', phoneEl: 'job-phone', emailEl: 'job-email' },
                { id: 'inv-client', nameEl: 'inv-client', phoneEl: 'inv-phone', emailEl: 'inv-email', addressEl: 'inv-address' }
            ];

            activeForms.forEach(form => {
                const el = document.getElementById(form.id);
                if (el) {
                    if (form.nameEl) { const target = document.getElementById(form.nameEl); if(target) target.value = payload.name; }
                    if (form.phoneEl) { const target = document.getElementById(form.phoneEl); if(target) target.value = payload.phone; }
                    if (form.emailEl) { const target = document.getElementById(form.emailEl); if(target) target.value = payload.email; }
                    if (form.addressEl) { const target = document.getElementById(form.addressEl); if(target) target.value = payload.address; }
                    if (form.contactEl) { const target = document.getElementById(form.contactEl); if(target) target.value = payload.name; }
                }
            });
            const quoClient = document.getElementById('quo-client');
            if (quoClient) {
                quoClient.value = payload.name;
                const qPhone = document.getElementById('quo-phone');
                const qEmail = document.getElementById('quo-email');
                const qAddr = document.getElementById('quo-address');
                if (qPhone) qPhone.value = payload.phone;
                if (qEmail) qEmail.value = payload.email;
                if (qAddr) qAddr.value = payload.address;
            }
            const invVat = document.getElementById('inv-vat');
            const invReg = document.getElementById('inv-reg');
            if (invVat && payload.vat) invVat.value = payload.vat;
            if (invReg && payload.regNo) invReg.value = payload.regNo;
            if (parentRemains && window.app.markModalDirty) window.app.markModalDirty();
        } catch(error) {
            console.error("Error adding customer:", error);
            alert("Failed to save customer. Check connection.");
            if(btn) { btn.innerHTML = 'Save Customer'; btn.disabled = false; }
        }
    },

    viewHistory(customerId) {
        const c = window.app.state.customers.find(x => x.id === customerId);
        if(!c) return;

        // Find Jobs using this customer's name (or email if available)
        // Since historical jobs lack the strict CRM ID, we fuzzy match the name or email
        const histJobs = (window.app.state.jobs || []).filter(j => 
            (c.email && j.email && j.email.toLowerCase() === c.email.toLowerCase()) || 
            (j.customer && c.name && String(j.customer).toLowerCase() === c.name.toLowerCase())
        );

        const histInvs = window.app.state.invoices.filter(i => 
            (c.email && i.email && i.email.toLowerCase() === c.email.toLowerCase()) || 
            (i.customer && c.name && String(i.customer).toLowerCase().includes(c.name.toLowerCase()))
        );

        const renderJobs = histJobs.length > 0 ? histJobs.map(j => `
            <div style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <strong style="color: #a29bfe;">${j.id}</strong>
                    <span class="badge pending">${j.status}</span>
                </div>
                <div style="font-size: 0.9rem;">${j.device}</div>
                <div style="font-size: 0.8rem; color: #a0a0a0; margin-top: 4px;">${j.date}</div>
            </div>
        `).join('') : '<div style="color: #a0a0a0; font-size: 0.9rem;">No past jobs found.</div>';

        const renderInvs = histInvs.length > 0 ? histInvs.map(i => `
            <div style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <strong>${i.id}</strong>
                    <span style="color: ${i.status === 'Paid' ? 'var(--success)' : 'var(--warning)'}">${i.status}</span>
                </div>
                <div style="font-size: 0.9rem; font-weight: bold; color: #ffffff;">${i.amount}</div>
                <div style="font-size: 0.8rem; color: #a0a0a0; margin-top: 4px;">${i.date}</div>
            </div>
        `).join('') : '<div style="color: #a0a0a0; font-size: 0.9rem;">No past invoices found.</div>';

        const modalHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Customer History: ${c.name}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-height: 500px; overflow-y: auto;">
                    <div>
                        <h3 style="margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;"><span class="material-symbols-outlined" style="vertical-align: middle; font-size: 1.2rem;">build</span> Repair Jobs</h3>
                        ${renderJobs}
                    </div>
                    <div>
                        <h3 style="margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;"><span class="material-symbols-outlined" style="vertical-align: middle; font-size: 1.2rem;">receipt_long</span> Invoices</h3>
                        ${renderInvs}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="app.closeModal()">Close</button>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    }
};

// Initialized by app.js

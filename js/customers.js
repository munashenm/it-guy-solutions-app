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
                    <h1>Customer Directory (CRM)</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage client data and view historical transactions.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" onclick="customers.showAddCustomerModal()"><span class="material-symbols-outlined">person_add</span> Add Customer</button>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div class="table-container" style="max-height: 700px; overflow-y: auto;">
                    <table id="customers-table">
                        <thead>
                            <tr>
                                <th>Client Name</th>
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

    renderCustomerRows() {
        if(!window.app || !window.app.state.customers || window.app.state.customers.length === 0) {
            return `<tr><td colspan="5" style="text-align: center; color: #a0a0a0;">No customers registered yet.</td></tr>`;
        }
        
        return window.app.state.customers.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone || '-'}</td>
                <td><a href="mailto:${c.email}" style="color: #a29bfe; text-decoration: none;">${c.email || '-'}</a></td>
                <td style="color: #a0a0a0; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.address || '-'}</td>
                <td>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="customers.viewHistory('${c.id}')">
                        <span class="material-symbols-outlined" style="font-size: 1rem; margin-right: 4px;">history</span> History
                    </button>
                </td>
            </tr>
        `).join('');
    },

    showAddCustomerModal() {
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
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Save Customer</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleAddCustomer(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Saving...'; btn.disabled = true; }

        try {
            await window.fbDb.collection('customers').add({
                name: document.getElementById('crm-name').value.trim(),
                phone: document.getElementById('crm-phone').value.trim(),
                email: document.getElementById('crm-email').value.trim(),
                address: document.getElementById('crm-addr').value.trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.closeModal();
            // onSnapshot triggers app.refreshActiveViews() seamlessly
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
        const histJobs = window.app.state.jobs.filter(j => 
            (c.email && j.email && j.email.toLowerCase() === c.email.toLowerCase()) || 
            (j.customer && j.customer.toLowerCase() === c.name.toLowerCase())
        );

        const histInvs = window.app.state.invoices.filter(i => 
            (c.email && i.email && i.email.toLowerCase() === c.email.toLowerCase()) || 
            (i.customer && i.customer.toLowerCase().includes(c.name.toLowerCase()))
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

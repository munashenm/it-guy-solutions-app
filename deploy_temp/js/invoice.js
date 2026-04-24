window.invoice = {
    init() {
        this.container = document.getElementById('invoices-content');
        this.render();
    },
    
    render() {
        if (!this.container) return;

        const invoices = app.state.invoices || [];
        const user = window.authSystem?.currentUser;
        const isFrontDesk = user && user.role === 'frontdesk';
        
        let tableRows = '';
        if (invoices.length === 0) {
            tableRows = `<tr><td colspan="6" style="text-align:center; padding: 48px; color: #a0a0a0;">
                <span class="material-symbols-outlined" style="font-size: 3rem; display: block; margin-bottom: 16px;">receipt</span>
                No invoices found in the system yet.
            </td></tr>`;
        } else {
            tableRows = invoices.map(inv => `
                <tr>
                    <td><strong>${inv.id || 'N/A'}</strong></td>
                    <td>${inv.date || '-'}</td>
                    <td>${inv.customer || 'Walk-in'}</td>
                    <td style="font-weight:600">${inv.amount || 'R 0.00'}</td>
                    <td><span class="badge ${(inv.status || 'Unpaid').toLowerCase()}">${inv.status || 'Unpaid'}</span></td>
                    <td>
                        <button class="btn-icon" title="Send to Client" onclick="app.showSendModal('${inv.id}', 'Invoice')"><span class="material-symbols-outlined">send</span></button>
                        <button class="btn-icon" title="Mark Paid" onclick="alert('Simulation: Marked ${inv.id} as Paid')"><span class="material-symbols-outlined">payments</span></button>
                        <button class="btn-icon" title="Download PDF" onclick="app.executeDocumentAction('Print', 'Invoice', '${inv.id}')"><span class="material-symbols-outlined">download</span></button>
                    </td>
                </tr>
            `).join('');
        }

        const html = `
            <div class="section-header">
                <div>
                    <h1>Invoices & Payments</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage client billing and track payments.</p>
                </div>
                ${!isFrontDesk ? `<button class="btn-primary" onclick="app.showCreateInvoiceModal()"><span class="material-symbols-outlined">receipt_long</span> Create Invoice</button>` : ''}
            </div>
            
            <div class="glass-card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
    },

    addExternalItem(customer, desc, qty, unit) {
        // 1. Open the full invoice modal
        window.app.showCreateInvoiceModal();
        
        // 2. Short timeout to ensure DOM is ready, then populate
        setTimeout(() => {
            const clientInput = document.getElementById('inv-client');
            if(clientInput) {
                clientInput.value = customer;
                window.app.fillCustomerDetails(customer, 'inv');
            }
            
            // Clear the initial empty line added by showCreateInvoiceModal
            const container = document.getElementById('invoice-items-container');
            if(container) container.innerHTML = '';
            
            // Add the specific item (e.g., Labor)
            window.app.addInvoiceItemLine({
                type: 'Labour',
                desc: desc,
                unit: unit,
                qty: qty
            });
        }, 300);
    }
};

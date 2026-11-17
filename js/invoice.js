window.invoice = {
    init() {
        this.container = document.getElementById('invoices-content');
        this.render();
    },
    
    render() {
        this.container = document.getElementById('invoices-content');
        if (!this.container) return;

        const invoices = (window.app && window.app.state && window.app.state.invoices) || [];
        const user = window.authSystem?.currentUser;
        const isFrontDesk = user && user.role === 'frontdesk';
        const isAdmin = window.ItguyFixes
            ? window.ItguyFixes.canonicalRole(user && user.role) === 'admin'
            : String(user && user.role || '').trim().toLowerCase() === 'admin';
        
        let tableRows = '';
        if (invoices.length === 0) {
            tableRows = `<tr><td colspan="6" style="text-align:center; padding: 48px; color: #a0a0a0;">
                <span class="material-symbols-outlined" style="font-size: 3rem; display: block; margin-bottom: 16px;">receipt</span>
                No invoices yet. Create one to bill a customer.
            </td></tr>`;
        } else {
            tableRows = invoices.map(inv => {
                const paid = window.ItguyFixes ? window.ItguyFixes.invoiceIsPaid(inv) : String(inv.status || '').toLowerCase() === 'paid';
                return `
                <tr>
                    <td><strong>${inv.id || 'N/A'}</strong></td>
                    <td>${inv.date || '-'}</td>
                    <td>${window.app.partyName(inv, 'Walk-in')}</td>
                    <td style="font-weight:600">${window.app.formatMoney(inv.amount)}</td>
                    <td><span class="badge ${(inv.status || 'Unpaid').toLowerCase()}">${inv.status || 'Unpaid'}</span></td>
                    <td>
                        <button class="btn-icon" title="Send to customer" onclick="app.showSendModal('${inv.id}', 'Invoice')"><span class="material-symbols-outlined">send</span></button>
                        ${inv.status !== 'Paid' ? `<button class="btn-icon" title="Mark as paid" onclick="app.markInvoiceAsPaid('${inv.id}')"><span class="material-symbols-outlined">payments</span></button>` : ''}
                        <button class="btn-icon" title="Download PDF" onclick="app.executeDocumentAction('Print', 'Invoice', '${inv.id}')"><span class="material-symbols-outlined">download</span></button>
                        ${isAdmin && !paid ? `<button class="btn-icon" title="Delete invoice" onclick="invoice.deleteInvoice('${inv.id}')"><span class="material-symbols-outlined" style="color:#ff7675;">delete</span></button>` : ''}
                    </td>
                </tr>
            `;
            }).join('');
        }

        const html = `
            <div class="section-header">
                <div>
                    <h1>Invoices & Payments</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Create invoices, send them to customers, and mark them paid.</p>
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
        
        (window.app && window.app.writeViewHtml)
            ? window.app.writeViewHtml(this.container, html)
            : (this.container.innerHTML = html);
    },

    async deleteInvoice(id) {
        const role = window.authSystem && window.authSystem.currentUser && window.authSystem.currentUser.role;
        const isAdmin = window.ItguyFixes
            ? window.ItguyFixes.canonicalRole(role) === 'admin'
            : String(role || '').trim().toLowerCase() === 'admin';
        if (!isAdmin) {
            window.app.showToast('Only an admin can delete an invoice.', 'error');
            return;
        }
        const inv = ((window.app.state && window.app.state.invoices) || []).find(row => row.id === id);
        if (window.ItguyFixes ? window.ItguyFixes.invoiceIsPaid(inv) : String(inv && inv.status || '').toLowerCase() === 'paid') {
            window.app.showToast('Paid invoices cannot be deleted.', 'error');
            return;
        }
        if (!confirm('Delete invoice ' + id + '? This cannot be undone.')) return;
        try {
            await window.fbDb.collection('invoices').doc(id).delete();
            window.app.showToast('Invoice ' + id + ' deleted.', 'success');
            if (typeof window.app.logActivity === 'function') {
                window.app.logActivity('Invoice Deleted', id);
            }
            this.render();
        } catch (e) {
            console.error(e);
            window.app.showToast(e.message || 'Could not delete the invoice.', 'error');
            this.render();
        }
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

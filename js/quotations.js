window.quotation = {
    init() {
        this.container = document.getElementById('quotations-content');
        this.render();
    },
    
    render() {
        this.container = document.getElementById('quotations-content');
        if (!this.container) return;

        // App.state.quotations must exist
        const quotations = (window.app && window.app.state && window.app.state.quotations) || [];
        
        const html = `
            <div class="section-header">
                <div>
                    <h1>Quotations</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Price work for a customer, then convert accepted quotes to invoices.</p>
                </div>
                <button class="btn-primary" onclick="app.showCreateQuotationModal()"><span class="material-symbols-outlined">request_quote</span> Create Quotation</button>
            </div>
            
            <div class="glass-card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Quote #</th>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${quotations.length > 0 ? quotations.map(quo => `
                                <tr>
                                    <td><strong>${quo.id}</strong></td>
                                    <td>${quo.date}</td>
                                    <td>${window.app.partyName(quo)}</td>
                                    <td style="font-weight:600">${window.app.formatMoney(quo.amount)}</td>
                                    <td><span class="badge ${quo.status ? quo.status.toLowerCase() : 'pending'}">${quo.status || 'Pending'}</span></td>
                                    <td>
                                        <button class="btn-icon" title="Convert to Invoice" onclick="app.convertQuoteToInvoice('${quo.id}')"><span class="material-symbols-outlined">receipt_long</span></button>
                                        <button class="btn-icon" title="Send to customer" onclick="app.showSendModal('${quo.id}', 'Quotation')"><span class="material-symbols-outlined">send</span></button>
                                        <button class="btn-icon" title="Download PDF" onclick="app.executeDocumentAction('Download', 'Quotation', '${quo.id}', this)"><span class="material-symbols-outlined">download</span></button>
                                    </td>
                                </tr>
                            `).join('') : `<tr><td colspan="6" style="text-align:center; padding: 32px; color:#a0a0a0;">No quotations yet. Create one to send a price to a customer.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        (window.app && window.app.writeViewHtml)
            ? window.app.writeViewHtml(this.container, html)
            : (this.container.innerHTML = html);
    }
};

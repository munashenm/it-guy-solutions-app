window.quotation = {
    init() {
        this.container = document.getElementById('quotations-content');
        this.render();
    },
    
    render() {
        if (!this.container) {
            this.container = document.getElementById('quotations-content');
            if (!this.container) return;
        }

        // App.state.quotations must exist
        const quotations = app.state.quotations || [];
        
        const html = `
            <div class="section-header">
                <h1>Quotations</h1>
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
                                    <td>${quo.customer}</td>
                                    <td style="font-weight:600">${quo.amount || 'R 0.00'}</td>
                                    <td><span class="badge ${quo.status ? quo.status.toLowerCase() : 'pending'}">${quo.status || 'Pending'}</span></td>
                                    <td>
                                        <button class="btn-icon" title="Convert to Invoice" onclick="app.convertQuoteToInvoice('${quo.id}')"><span class="material-symbols-outlined">receipt_long</span></button>
                                        <button class="btn-icon" title="Send to Client" onclick="app.showSendModal('${quo.id}', 'Quotation')"><span class="material-symbols-outlined">send</span></button>
                                        <button class="btn-icon" title="Download PDF" onclick="app.executeDocumentAction('Download', 'Quotation', '${quo.id}', this)"><span class="material-symbols-outlined">download</span></button>
                                    </td>
                                </tr>
                            `).join('') : `<tr><td colspan="6" style="text-align:center; padding: 24px;">No quotations generated yet</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
    }
};

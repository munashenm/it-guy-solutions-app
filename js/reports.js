window.reports = {
    activeTab: 'sales', // 'sales', 'quotes', 'stock', 'audit'
    timeframe: 'monthly', // 'weekly', 'monthly', 'yearly'

    init() {
        this.container = document.getElementById('reports-content');
        if(window.authSystem && window.authSystem.currentUser && window.authSystem.currentUser.role === 'admin') {
            this.render();
        }
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.render();
    },

    setTimeframe(tf) {
        this.timeframe = tf;
        this.render();
    },

    getRangeLabel() {
        const now = new Date();
        if(this.timeframe === 'weekly') return "This Week (Mon - Sun)";
        if(this.timeframe === 'monthly') return `This Month (${now.toLocaleString('default', { month: 'long' })})`;
        if(this.timeframe === 'yearly') return `This Year (${now.getFullYear()})`;
        return "";
    },

    isInRange(dateStr) {
        if(!dateStr) return false;
        const d = new Date(dateStr);
        const now = new Date();
        
        if(this.timeframe === 'yearly') {
            return d.getFullYear() === now.getFullYear();
        }
        
        if(this.timeframe === 'monthly') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        
        if(this.timeframe === 'weekly') {
            const startOfWeek = new Date(now);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday
            startOfWeek.setDate(diff);
            startOfWeek.setHours(0,0,0,0);
            return d >= startOfWeek;
        }
        
        return false;
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('reports-content');
            if (!this.container) return;
        }

        let html = `
            <div class="section-header">
                <div>
                    <h1>Business Intelligence</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Data-driven insights for <strong>${this.getRangeLabel()}</strong></p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <div class="glass-tabs" style="display: flex; background: rgba(255,255,255,0.05); padding: 4px; border-radius: 8px;">
                        <button class="tab-btn ${this.timeframe === 'weekly' ? 'active' : ''}" onclick="reports.setTimeframe('weekly')" style="padding: 6px 12px; border: none; background: ${this.timeframe === 'weekly' ? 'var(--primary)' : 'transparent'}; color: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">Weekly</button>
                        <button class="tab-btn ${this.timeframe === 'monthly' ? 'active' : ''}" onclick="reports.setTimeframe('monthly')" style="padding: 6px 12px; border: none; background: ${this.timeframe === 'monthly' ? 'var(--primary)' : 'transparent'}; color: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">Monthly</button>
                        <button class="tab-btn ${this.timeframe === 'yearly' ? 'active' : ''}" onclick="reports.setTimeframe('yearly')" style="padding: 6px 12px; border: none; background: ${this.timeframe === 'yearly' ? 'var(--primary)' : 'transparent'}; color: #fff; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">Yearly</button>
                    </div>
                    <button class="btn-secondary" onclick="app.executeDocumentAction('Print', 'Report', 'BI_${new Date().toISOString().split('T')[0]}')" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1);"><span class="material-symbols-outlined">print</span> Print</button>
                    <button class="btn-secondary" onclick="app.executeDocumentAction('Download', 'Report', 'BI_${new Date().toISOString().split('T')[0]}')" style="background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1);"><span class="material-symbols-outlined">download</span> Download</button>
                    <button class="btn-primary" onclick="reports.render()"><span class="material-symbols-outlined">refresh</span> Refresh</button>
                </div>
            </div>

            <div class="settings-tabs" style="margin-bottom: 24px;">
                <button class="settings-tab ${this.activeTab === 'sales' ? 'active' : ''}" onclick="reports.switchTab('sales')">Profit & Loss (P&L)</button>
                <button class="settings-tab ${this.activeTab === 'quotes' ? 'active' : ''}" onclick="reports.switchTab('quotes')">Quotations</button>
                <button class="settings-tab ${this.activeTab === 'stock' ? 'active' : ''}" onclick="reports.switchTab('stock')">Inventory Metrics</button>
                <button class="settings-tab ${this.activeTab === 'audit' ? 'active' : ''}" onclick="reports.switchTab('audit')">Audit Log</button>
            </div>
            
            <div id="report-view-content">
                ${this.renderActiveTab()}
            </div>
        `;

        this.container.innerHTML = html;
    },

    renderActiveTab() {
        if(this.activeTab === 'sales') return this.renderSalesReport();
        if(this.activeTab === 'quotes') return this.renderQuotesReport();
        if(this.activeTab === 'stock') return this.renderStockReport();
        if(this.activeTab === 'audit') return this.renderAuditLog();
        return '';
    },

    renderSalesReport() {
        const invoices = (window.app.state.invoices || []).filter(i => this.isInRange(i.date));
        const posSales = (window.app.state.sales || []).filter(s => this.isInRange(s.date));
        const expenses = (window.app.state.expenses || []).filter(e => this.isInRange(e.date));
        
        const invTotal = invoices.reduce((sum, i) => sum + (parseFloat(i.amount?.replace(/[^0-9.]/g, '')) || 0), 0);
        const posTotal = posSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const grandTotal = invTotal + posTotal;
        
        const expenseTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const netProfit = grandTotal - expenseTotal;

        const paidInv = invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + (parseFloat(i.amount?.replace(/[^0-9.]/g, '')) || 0), 0);
        const cashTotal = posSales.filter(s => s.method === 'Cash').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const cardTotal = posSales.filter(s => s.method === 'Card').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const eftTotal = posSales.filter(s => s.method === 'EFT').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(var(--success-rgb), 0.1); color: var(--success);"><span class="material-symbols-outlined">payments</span></div>
                    <div class="stat-info"><h3>R ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3><p>Gross Revenue</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(255, 118, 117, 0.1); color: #ff7675;"><span class="material-symbols-outlined">outbox</span></div>
                    <div class="stat-info"><h3>R ${expenseTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3><p>Total Expenses</p></div>
                </div>
                <div class="stat-card" style="border: 1px solid ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                    <div class="stat-icon" style="background: ${netProfit >= 0 ? 'rgba(0, 184, 148, 0.1)' : 'rgba(255, 118, 117, 0.1)'}; color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                        <span class="material-symbols-outlined">${netProfit >= 0 ? 'trending_up' : 'trending_down'}</span>
                    </div>
                    <div class="stat-info">
                        <h3 style="color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">R ${netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                        <p>Net Profit</p>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary);"><span class="material-symbols-outlined">account_balance</span></div>
                    <div class="stat-info"><h3>${grandTotal > 0 ? ((netProfit / grandTotal) * 100).toFixed(1) : 0}%</h3><p>Net Margin</p></div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-top: 24px;">
                <div class="glass-card" style="padding: 24px;">
                    <h3 style="margin-top: 0; margin-bottom: 20px;">Financial Transactions</h3>
                    <div class="table-container" style="max-height: 480px; overflow-y:auto;">
                        <table>
                            <thead>
                                <tr><th>Ref #</th><th>Source</th><th>Customer / Desc</th><th>Amount</th><th>Method / Cat</th></tr>
                            </thead>
                            <tbody>
                                ${[...invoices, ...posSales, ...expenses].sort((a,b) => new Date(b.date) - new Date(a.date)).map(s => {
                                    const isExpense = (s.id || '').startsWith('EXP');
                                    return `
                                        <tr>
                                            <td><strong>${s.id}</strong></td>
                                            <td><span class="badge ${isExpense ? 'danger' : 'success'}">${isExpense ? 'Expense' : (s.id.startsWith('REC') ? 'POS' : 'Invoice')}</span></td>
                                            <td>${s.customer || s.description}</td>
                                            <td style="color: ${isExpense ? 'var(--danger)' : 'var(--success)'}; font-weight: bold;">${isExpense ? '-' : ''} R ${(parseFloat(s.amount?.replace(/[^0-9.]/g, '') || s.total || s.amount) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            <td>${s.method || s.category || 'EFT/Invoiced'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="glass-card" style="padding: 24px;">
                    <h3 style="margin-top: 0; margin-bottom: 20px;">Efficiency Metrics</h3>
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${this.renderProgressBar('Revenue Utilization', grandTotal - expenseTotal, grandTotal)}
                        <div style="border-top: 1px dashed var(--border); margin: 8px 0;"></div>
                        ${this.renderProgressBar('Cash Flow (POS)', cashTotal + cardTotal + eftTotal, grandTotal)}
                        ${this.renderProgressBar('Invoiced Weight', invTotal, grandTotal)}
                        <div style="border-top: 1px dashed var(--border); margin: 8px 0;"></div>
                        <p style="font-size: 0.8rem; color: #a0a0a0; line-height: 1.4;">
                            <span class="material-symbols-outlined" style="font-size: 1rem; vertical-align: middle;">info</span>
                            Net Profit is calculated by subtracting all logged overhead expenses from your combined retail and service revenue.
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    renderQuotesReport() {
        const quotes = (window.app.state.quotations || []).filter(q => this.isInRange(q.date));
        const totalVal = quotes.reduce((sum, q) => sum + (parseFloat(q.amount?.replace(/[^0-9.]/g, '')) || 0), 0);
        const accepted = quotes.filter(q => q.status === 'Accepted' || q.status === 'Invoiced');
        const pending = quotes.filter(q => q.status === 'Sent' || q.status === 'Draft');

        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-info"><h3>${quotes.length}</h3><p>Total Quotations</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-info"><h3>R ${totalVal.toLocaleString()}</h3><p>Pipeline Value</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-info" style="color: var(--success);"><h3>${accepted.length}</h3><p>Converted / Accepted</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-info" style="color: var(--warning);"><h3>${pending.length}</h3><p>Pending Review</p></div>
                </div>
            </div>

            <div class="glass-card" style="margin-top: 24px; padding: 24px;">
                <h3 style="margin: 0 0 20px 0;">Converstion Analytics</h3>
                <div style="max-width: 500px;">
                    ${this.renderProgressBar('Conversion Rate', accepted.length, quotes.length || 1)}
                </div>
            </div>
        `;
    },

    renderStockReport() {
        const inventory = window.app.state.inventory || [];
        const totalItems = inventory.reduce((sum, i) => sum + (parseInt(i.qty) || 0), 0);
        
        let totalCostVal = 0;
        let totalSellVal = 0;
        
        inventory.forEach(item => {
            const qty = parseInt(item.qty) || 0;
            const cost = parseFloat(item.cost?.replace(/[^0-9.]/g, '') || 0);
            const sell = parseFloat(item.sell?.replace(/[^0-9.]/g, '') || item.sellPrice || 0);
            totalCostVal += (cost * qty);
            totalSellVal += (sell * qty);
        });

        const lowStock = inventory.filter(i => (parseInt(i.qty) || 0) < 5);

        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-info"><h3>${inventory.length}</h3><p>Unique SKUs</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-info"><h3>${totalItems}</h3><p>Total Units in Stock</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-info"><h3>R ${totalCostVal.toLocaleString()}</h3><p>Inventory Cost Value</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-info" style="color: var(--success);"><h3>R ${totalSellVal.toLocaleString()}</h3><p>Potential Revenue</p></div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; margin-top: 24px;">
                <div class="glass-card" style="padding: 24px;">
                    <h3 style="margin-top: 0; color: #ff7675; display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined">warning</span> Low Stock Alerts
                    </h3>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Item</th><th>SKU</th><th>Stock</th></tr></thead>
                            <tbody>
                                ${lowStock.map(i => `
                                    <tr><td>${i.name}</td><td>${i.sku}</td><td style="color: #ff7675; font-weight: bold;">${i.qty}</td></tr>
                                `).join('')}
                                ${lowStock.length === 0 ? '<tr><td colspan="3" style="text-align:center; color: #a0a0a0;">No low stock alerts.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="glass-card" style="padding: 24px;">
                    <h3>Stock Breakdown</h3>
                    <div style="display: flex; flex-direction: column; gap:16px;">
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>Profit Margin (Projected)</span>
                                <span style="font-weight: bold; color: var(--success);">R ${(totalSellVal - totalCostVal).toLocaleString()}</span>
                            </div>
                            <div style="height: 12px; background: rgba(0,184,148,0.1); border-radius: 6px; overflow: hidden;">
                                <div style="height: 100%; width: ${Math.min(100, ((totalSellVal - totalCostVal) / (totalSellVal || 1)) * 100)}%; background: var(--success);"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderProgressBar(label, value, total) {
        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
        return `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                    <span>${label}</span>
                    <span>R ${value.toLocaleString()} (${percentage}%)</span>
                </div>
                <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${percentage}%; background: var(--primary);"></div>
                </div>
            </div>
        `;
    },

    renderAuditLog() {
        const logs = (window.app.state.activityLog || []).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return `
            <div class="glass-card" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;">System Audit History</h3>
                    <div style="font-size: 0.8rem; color: #a0a0a0;">Showing latest ${logs.length} entries</div>
                </div>
                
                <div class="table-container" style="max-height: 550px; overflow-y: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 180px;">Date & Time</th>
                                <th style="width: 150px;">Staff Member</th>
                                <th style="width: 120px;">Event Action</th>
                                <th>Activity Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #a0a0a0;">No history recorded yet.</td></tr>' : ''}
                            ${logs.map(log => {
                                const date = new Date(log.timestamp);
                                return `
                                    <tr>
                                        <td style="font-size: 0.85rem; color: #a0a0a0;">
                                            ${date.toLocaleDateString()} <span style="color: var(--primary);">${date.toLocaleTimeString()}</span>
                                        </td>
                                        <td>
                                            <div style="font-weight: 500;">${log.user}</div>
                                            <div style="font-size: 0.75rem; color: #a0a0a0; text-transform: capitalize;">${log.role}</div>
                                        </td>
                                        <td><span class="badge" style="background: rgba(162, 155, 254, 0.1); color: #a29bfe; font-size: 0.75rem;">${log.action}</span></td>
                                        <td style="font-size: 0.9rem;">${log.details}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
};

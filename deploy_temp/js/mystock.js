window.mystock = {
    init() {
        this.container = document.getElementById('mystock-content');
        if(this.container) this.render();
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('mystock-content');
            if (!this.container) return;
        }

        const stats = this.getStats();
        
        let html = `
            <div class="section-header">
                <div>
                    <h1>My Stock on Hand</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Inventory currently issued to you. Record usage on jobs to keep this updated.</p>
                </div>
            </div>

            <!-- Stats Bar -->
            <div class="stats-grid" style="margin-bottom: 24px;">
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(0, 184, 148, 0.1); color: var(--success);"><span class="material-symbols-outlined">inventory_2</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.totalItems}</div>
                        <div class="stat-label">Total Items</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(253, 203, 110, 0.1); color: var(--warning);"><span class="material-symbols-outlined">warning</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.lowStock}</div>
                        <div class="stat-label">Low Stock (Refill)</div>
                    </div>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">Stock List</h2>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Item / SKU</th>
                                <th>Category</th>
                                <th>Quantity Hand</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="mystock-table-body">
                            ${this.renderStockRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    getStats() {
        const list = this.getTechStock();
        const totalItems = list.reduce((sum, item) => sum + (item.qty || 0), 0);
        const lowStock = list.filter(item => item.qty < 3).length;

        return { totalItems, lowStock };
    },

    getTechStock() {
        const currentUser = window.authSystem?.currentUser;
        if (!currentUser) return [];
        const uEmail = currentUser.email.toLowerCase();
        
        // Filter techStock from global state
        return (window.app.state.techStock || []).filter(s => s.techEmail.toLowerCase() === uEmail);
    },

    renderStockRows() {
        const list = this.getTechStock();
        if(list.length === 0) {
            return `<tr><td colspan="4" style="text-align: center; color: #a0a0a0; padding: 40px;">No stock currently issued to you. Contact Admin for parts.</td></tr>`;
        }

        return list.map(item => `
            <tr>
                <td>
                    <div style="font-weight: bold;">${item.name}</div>
                    <div style="font-size: 0.8rem; color: #a0a0a0;">${item.sku}</div>
                </td>
                <td><span class="badge pending">${item.category || 'General'}</span></td>
                <td>
                    <span style="font-weight: bold; color: ${item.qty < 3 ? 'var(--danger)' : 'white'};">
                        ${item.qty} ${item.qty < 3 ? '⚠️' : ''}
                    </span>
                </td>
                <td>
                    <button class="btn-icon" title="Request Restock" style="color: var(--accent);" onclick="mystock.requestRestock('${item.id}')"><span class="material-symbols-outlined">refresh</span></button>
                </td>
            </tr>
        `).join('');
    },

    requestRestock(id) {
        const item = (window.app.state.techStock || []).find(x => x.id === id);
        if(!item) return;
        alert(`Restock request for ${item.name} sent to Admin!`);
        // In a real app, this would add a log or notification
    }
};

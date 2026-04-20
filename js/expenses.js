window.expenses = {
    init() {
        this.container = document.getElementById('expenses-content');
        if(this.container) this.render();
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('expenses-content');
            if (!this.container) return;
        }

        const stats = this.getStats();
        
        let html = `
            <div class="section-header">
                <div>
                    <h1>Expense Manager</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Track business overheads and operational costs to calculate net profit.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" onclick="expenses.showAddExpenseModal()"><span class="material-symbols-outlined">add_circle</span> Log Expense</button>
                </div>
            </div>

            <!-- Stats Bar -->
            <div class="stats-grid" style="margin-bottom: 24px;">
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(255, 118, 117, 0.1); color: var(--danger);"><span class="material-symbols-outlined">payments</span></div>
                    <div class="stat-info">
                        <div class="stat-value">R ${stats.totalThisMonth}</div>
                        <div class="stat-label">Spent This Month</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(253, 203, 110, 0.1); color: var(--warning);"><span class="material-symbols-outlined">category</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.topCategory}</div>
                        <div class="stat-label">Top Expense Category</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(0, 184, 148, 0.1); color: var(--success);"><span class="material-symbols-outlined">trending_down</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.count}</div>
                        <div class="stat-label">Records Logged</div>
                    </div>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">Expense History</h2>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th>Amount</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="expenses-table-body">
                            ${this.renderExpenseRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    getStats() {
        const list = window.app.state.expenses || [];
        const now = new Date();
        const currentUser = window.authSystem?.currentUser;
        const isTech = currentUser?.role === 'technician';
        const uName = currentUser?.email?.split('@')[0].toLowerCase();

        const filteredList = list.filter(e => {
            if (isTech) {
                return e.addedBy && e.addedBy.toLowerCase() === uName;
            }
            return true;
        });

        const thisMonth = filteredList.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });

        const totalThisMonth = thisMonth.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0).toFixed(2);
        
        const cats = {};
        filteredList.forEach(e => {
            cats[e.category] = (cats[e.category] || 0) + (parseFloat(e.amount) || 0);
        });
        
        let topCat = "N/A";
        let max = 0;
        for(let c in cats) {
            if(cats[c] > max) { max = cats[c]; topCat = c; }
        }

        return { totalThisMonth, topCategory: topCat, count: filteredList.length };
    },

    renderExpenseRows() {
        const list = window.app.state.expenses || [];
        const currentUser = window.authSystem?.currentUser;
        const isTech = currentUser?.role === 'technician';
        const uName = currentUser?.email?.split('@')[0].toLowerCase();

        const filtered = list.filter(e => {
            if (isTech) {
                return e.addedBy && e.addedBy.toLowerCase() === uName;
            }
            return true;
        });

        if(filtered.length === 0) {
            return `<tr><td colspan="5" style="text-align: center; color: #a0a0a0; padding: 40px;">No expense records found.</td></tr>`;
        }

        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `
            <tr>
                <td>${e.date}</td>
                <td>
                    <strong>${e.description}</strong>
                    ${e.addedBy ? `<div style="font-size: 0.75rem; color: #a0a0a0;">By: ${e.addedBy}</div>` : ''}
                </td>
                <td><span class="badge" style="background: rgba(255,255,255,0.05); color: #fff; border: 1px solid var(--border);">${e.category}</span></td>
                <td style="color: var(--danger); font-weight: bold;">R ${parseFloat(e.amount).toFixed(2)}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        ${e.receiptBase64 ? `<button class="btn-icon" style="color: var(--accent);" onclick="expenses.viewReceipt('${e.id}')" title="View Receipt"><span class="material-symbols-outlined">receipt_long</span></button>` : ''}
                        <button class="btn-icon" style="color: var(--danger);" onclick="expenses.deleteExpense('${e.id}')"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    showAddExpenseModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Log New Expense</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="add-expense-form" onsubmit="expenses.handleAddExpense(event)">
                        <div class="form-group">
                            <label>Description</label>
                            <input type="text" id="exp-desc" class="form-control" placeholder="e.g. Monthly Rent, Fuel for Call-outs" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Category</label>
                                <select id="exp-cat" class="form-control" style="appearance: auto;" required>
                                    <option value="Rent">Rent & Utilities</option>
                                    <option value="Fuel">Fuel & Travel</option>
                                    <option value="Hardware">Hardware Purchases</option>
                                    <option value="Software">Software Subscriptions</option>
                                    <option value="Marketing">Marketing & Ads</option>
                                    <option value="Other" selected>Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Amount (ZAR)</label>
                                <input type="number" id="exp-amount" class="form-control" placeholder="0.00" step="0.01" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="exp-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
                        </div>
                        <div class="form-group">
                            <label>Scan/Upload Receipt</label>
                            <input type="file" id="exp-receipt" class="form-control" accept="image/*" capture="environment">
                            <p style="font-size: 0.75rem; color: #a0a0a0; margin-top: 4px;">Capture the slip for tax compliance.</p>
                        </div>

                        <div class="modal-footer" style="padding: 0; margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="flex: 2; justify-content: center;">Save Expense</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleAddExpense(e) {
        e.preventDefault();
        const desc = document.getElementById('exp-desc').value;
        const cat = document.getElementById('exp-cat').value;
        const amount = document.getElementById('exp-amount').value;
        const date = document.getElementById('exp-date').value;
        const receiptFile = document.getElementById('exp-receipt').files[0];

        try {
            const btn = e.target.querySelector('button[type="submit"]');
            btn.innerHTML = "Saving...";
            btn.disabled = true;

            let receiptBase64 = null;
            if (receiptFile && window.field && typeof window.field.compressImage === 'function') {
                receiptBase64 = await window.field.compressImage(receiptFile);
            }

            const currentUser = window.authSystem?.currentUser;
            const uName = (currentUser?.email?.split('@')[0] || 'Unknown').toLowerCase();

            const id = 'EXP-' + Date.now();
            await window.fbDb.collection('expenses').doc(id).set({
                id, 
                description: desc, 
                category: cat, 
                amount, 
                date,
                addedBy: uName,
                receiptBase64: receiptBase64,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.closeModal();
            window.app.showToast("Expense logged successfully.", "success");
        } catch(err) {
            console.error(err);
            window.app.showToast("Failed to save expense.", "error");
        }
    },

    viewReceipt(id) {
        const exp = window.app.state.expenses.find(x => x.id === id);
        if(!exp || !exp.receiptBase64) return;

        app.showModal(`
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Receipt: ${exp.description}</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="text-align: center;">
                    <img src="${exp.receiptBase64}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <p style="margin-top: 16px; color: #a0a0a0;">Amount: R ${exp.amount} | Date: ${exp.date}</p>
                </div>
            </div>
        `);
    },

    async deleteExpense(id) {
        if(!confirm("Delete this expense record?")) return;
        try {
            await window.fbDb.collection('expenses').doc(id).delete();
            window.app.showToast("Expense record deleted.", "info");
        } catch(err) {
            window.app.showToast("Delete failed.", "error");
        }
    }
};

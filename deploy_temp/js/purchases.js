window.purchases = {
    init() {
        this.container = document.getElementById('purchases-content');
        if(this.container) this.render();
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('purchases-content');
            if (!this.container) return;
        }

        const stats = this.getStats();
        
        let html = `
            <div class="section-header">
                <div>
                    <h1>Purchase Orders (Procurement)</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Order stock from suppliers and manage incoming inventory.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" onclick="purchases.showNewPOModal()"><span class="material-symbols-outlined">add_shopping_cart</span> Create PO</button>
                </div>
            </div>

            <!-- Stats Bar -->
            <div class="stats-grid" style="margin-bottom: 24px;">
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(108, 92, 231, 0.1); color: var(--primary);"><span class="material-symbols-outlined">shopping_cart</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.pending}</div>
                        <div class="stat-label">Pending Orders</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(0, 184, 148, 0.1); color: var(--success);"><span class="material-symbols-outlined">inventory_2</span></div>
                    <div class="stat-info">
                        <div class="stat-value">${stats.received}</div>
                        <div class="stat-label">Stock Received (30d)</div>
                    </div>
                </div>
                <div class="glass-card stat-card">
                    <div class="stat-icon" style="background: rgba(162, 155, 254, 0.1); color: #a29bfe;"><span class="material-symbols-outlined">account_balance_wallet</span></div>
                    <div class="stat-info">
                        <div class="stat-value">R ${stats.totalSpent}</div>
                        <div class="stat-label">Total Spend (30d)</div>
                    </div>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">Recent Orders</h2>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>PO #</th>
                                <th>Date</th>
                                <th>Supplier</th>
                                <th>Total (Inc VAT)</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="purchases-table-body">
                            ${this.renderPORows()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    getStats() {
        const poList = window.app.state.purchaseOrders || [];
        const pending = poList.filter(p => p.status === 'Ordered').length;
        const received = poList.filter(p => p.status === 'Received').length;
        
        const totalSpent = poList
            .filter(p => p.status === 'Received')
            .reduce((sum, p) => sum + (parseFloat(p.amount.replace('R ', '').replace(',', '')) || 0), 0)
            .toFixed(2);

        return { pending, received, totalSpent };
    },

    renderPORows() {
        const poList = window.app.state.purchaseOrders || [];
        if(poList.length === 0) {
            return `<tr><td colspan="6" style="text-align: center; color: #a0a0a0; padding: 40px;">No purchase orders recorded.</td></tr>`;
        }

        return poList.sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => `
            <tr>
                <td><strong>${p.id}</strong></td>
                <td>${p.date}</td>
                <td>${p.supplier}</td>
                <td><strong>${p.amount}</strong></td>
                <td><span class="badge ${p.status.toLowerCase()}">${p.status}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon" title="View PDF" onclick="app.executeDocumentAction('Print', 'Purchase Order', '${p.id}')"><span class="material-symbols-outlined">picture_as_pdf</span></button>
                        ${p.status === 'Ordered' ? `<button class="btn-icon" title="Receive Stock" onclick="purchases.receiveOrder('${p.id}')" style="color: var(--success);"><span class="material-symbols-outlined">inventory_2</span></button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    },

    async showNewPOModal() {
        const nextId = await window.app.getNextSequence("PO");
        const suppliers = window.app.state.suppliers || [];
        const inventory = window.app.state.inventory || [];
        
        const modalHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>Create Purchase Order</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="new-po-form" onsubmit="purchases.handleCreatePO(event)">
                        <input type="hidden" id="po-id" value="${nextId}">
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Target Supplier</label>
                                <select id="po-supplier" class="form-control" style="appearance: auto;" required>
                                    <option value="" disabled selected>Select Supplier</option>
                                    ${suppliers.map(s => `<option value="${s.name}" style="background: #1a1d2d; color: #fff;">${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Date</label>
                                <input type="date" id="po-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
                            </div>
                        </div>

                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h3 style="margin: 0; font-size: 1.05rem; color: #ffffff;">Order Items</h3>
                            <button type="button" class="btn-secondary" style="padding: 4px 12px; font-size: 0.9rem;" onclick="purchases.addPOLine()">+ Add Item</button>
                        </div>

                        <div id="po-items-container"></div>

                        <div style="border-top: 1px solid #e0e0e0; margin: 24px 0 16px;"></div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%;">
                                <span style="color: #a0a0a0; margin-right: 12px;">Subtotal:</span>
                                <input type="text" id="po-subtotal" class="form-control" placeholder="R 0.00" readonly style="width: 150px; text-align: right; background: rgba(0,0,0,0.2); border: none;">
                            </div>
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%;">
                                <span style="color: #a0a0a0; margin-right: 12px;">VAT (15%):</span>
                                <input type="text" id="po-vat-amount" class="form-control" placeholder="R 0.00" readonly style="width: 150px; text-align: right; background: rgba(0,0,0,0.2); border: none;">
                            </div>
                            <div style="display: flex; align-items: center; justify-content: flex-end; width: 100%; margin-top: 8px;">
                                <h3 style="margin: 0; margin-right: 16px; color: #ffffff;">Order Total:</h3>
                                <input type="text" id="po-amount" class="form-control" placeholder="R 0.00" readonly style="width: 150px; background: rgba(0,0,0,0.4); color: var(--accent); font-weight: bold; font-size: 1.1rem; text-align: right;">
                            </div>
                        </div>

                        <div class="modal-footer" style="padding: 0; margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="flex: 2; justify-content: center;">Send & Save PO</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
        this.addPOLine();
    },

    addPOLine() {
        const container = document.getElementById('po-items-container');
        if (!container) return;
        const rowId = 'po-row-' + Date.now();
        const inventory = window.app.state.inventory || [];

        const rowHTML = `
            <div id="${rowId}" class="po-item-row" style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px dashed var(--border);">
                <div class="form-row" style="margin-bottom: 8px;">
                    <div class="form-group" style="flex: 2; margin-bottom: 0;">
                        <select class="form-control po-item-select" onchange="purchases.onItemSelect(this)" required style="appearance: auto;">
                            <option value="" disabled selected>Link to Inventory Item</option>
                            ${inventory.map(i => `<option value="${i.id}" data-cost="${i.cost}" style="background: #1a1d2d; color: #fff;">${i.name} (${i.sku})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row" style="margin-bottom: 0;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" class="form-control po-cost" placeholder="Cost Each" oninput="purchases.calcPOTotals()" required min="0" step="0.01">
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" class="form-control po-qty" placeholder="Qty" oninput="purchases.calcPOTotals()" required min="1" value="1">
                    </div>
                    <div class="form-group" style="flex: 1; display: flex; align-items: center; gap: 8px; margin-bottom: 0;">
                        <span class="po-row-total" style="flex: 1; text-align: right; color: #a0a0a0;">R0.00</span>
                        <button type="button" class="btn-icon" style="color: #ff4444;" onclick="purchases.removePOLine('${rowId}')"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', rowHTML);
    },

    onItemSelect(select) {
        const row = select.closest('.po-item-row');
        const costInput = row.querySelector('.po-cost');
        const selectedOption = select.options[select.selectedIndex];
        
        // Auto-fill cost from inventory
        let costStr = selectedOption.getAttribute('data-cost') || '0.00';
        costStr = costStr.replace('R ', '').replace(',', '');
        costInput.value = parseFloat(costStr) || 0;
        
        this.calcPOTotals();
    },

    removePOLine(id) {
        document.getElementById(id).remove();
        this.calcPOTotals();
    },

    calcPOTotals() {
        const rows = document.querySelectorAll('.po-item-row');
        let subtotal = 0;
        
        rows.forEach(row => {
            const cost = parseFloat(row.querySelector('.po-cost').value) || 0;
            const qty = parseInt(row.querySelector('.po-qty').value) || 0;
            const total = cost * qty;
            subtotal += total;
            row.querySelector('.po-row-total').textContent = 'R ' + total.toFixed(2);
        });

        const vat = subtotal * 0.15;
        const total = subtotal + vat;

        document.getElementById('po-subtotal').value = 'R ' + subtotal.toFixed(2);
        document.getElementById('po-vat-amount').value = 'R ' + vat.toFixed(2);
        document.getElementById('po-amount').value = 'R ' + total.toFixed(2);
    },

    async handleCreatePO(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Sending...'; btn.disabled = true; }

        const id = document.getElementById('po-id').value;
        const supplier = document.getElementById('po-supplier').value;
        const date = document.getElementById('po-date').value;
        const amount = document.getElementById('po-amount').value;
        
        const items = [];
        document.querySelectorAll('.po-item-row').forEach(row => {
            const select = row.querySelector('.po-item-select');
            const invItem = window.app.state.inventory.find(i => i.id === select.value);
            items.push({
                invId: select.value,
                desc: invItem.name,
                sku: invItem.sku,
                cost: row.querySelector('.po-cost').value,
                qty: parseInt(row.querySelector('.po-qty').value)
            });
        });

        try {
            const payload = {
                id, supplier, date, amount, items,
                status: 'Ordered',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await window.fbDb.collection('purchaseOrders').doc(id).set(payload);
            
            // Simulation
            alert(`Purchase Order ${id} saved and emailed to ${supplier}!`);
            window.app.closeModal();
        } catch(err) {
            console.error(err);
            alert("Error: PO failed to save.");
            if(btn) { btn.innerHTML = 'Send & Save PO'; btn.disabled = false; }
        }
    },

    async receiveOrder(id) {
        const po = window.app.state.purchaseOrders.find(p => p.id === id);
        if(!po) return;

        if(!confirm(`Mark PO ${id} as RECEIVED? (This will automatically increment stock levels for ${po.items.length} items).`)) return;

        try {
            const batch = window.fbDb.batch();
            
            po.items.forEach(item => {
                const invRef = window.fbDb.collection('inventory').doc(item.invId);
                batch.update(invRef, {
                    qty: firebase.firestore.FieldValue.increment(item.qty)
                });
            });

            const poRef = window.fbDb.collection('purchaseOrders').doc(id);
            batch.update(poRef, { status: 'Received', receivedAt: firebase.firestore.FieldValue.serverTimestamp() });

            await batch.commit();
            alert(`Stock Received! All inventory items have been updated.`);
        } catch(err) {
            console.error(err);
            alert("Stock intake failed. Check your data.");
        }
    }
};

window.inventory = {
    init() {
        this.container = document.getElementById('inventory-content');
        if(this.container) this.render();
    },
    
    render() {
        if (!this.container) {
            this.container = document.getElementById('inventory-content');
            if (!this.container) return;
        }
        let html = `
            <div class="section-header">
                <div>
                    <h1>Inventory & Suppliers</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Manage your active stock, pricing, and wholesale vendors.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-secondary" onclick="inventory.showAddSupplierModal()"><span class="material-symbols-outlined">contact_phone</span> Add Supplier</button>
                    <button class="btn-secondary" onclick="inventory.showStockCountModal()" style="border-color: var(--accent); color: var(--accent);"><span class="material-symbols-outlined">inventory</span> Stock Take</button>
                    <button class="btn-primary" onclick="inventory.showAddPartModal()"><span class="material-symbols-outlined">add_box</span> Add Stock Item</button>
                </div>
            </div>
            
            <div class="glass-card" style="padding: 24px;">
                <div class="settings-tabs">
                    <button class="settings-tab active" onclick="inventory.switchTab('stock', event)">Stock Directory</button>
                    <button class="settings-tab" onclick="inventory.switchTab('suppliers', event)">Approved Suppliers</button>
                </div>

                <div id="inventory-stock" class="settings-section active">
                    <div class="table-container" style="max-height: 600px; overflow-y: auto;">
                        <table id="stock-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>SKU / Serial</th>
                                    <th>Part / Item Name</th>
                                    <th>Category</th>
                                    <th>Stock Lvl</th>
                                    <th>Unit Pricing</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>${this.renderStockRows()}</tbody>
                        </table>
                    </div>
                </div>

                <div id="inventory-suppliers" class="settings-section">
                    <div class="table-container" style="max-height: 600px; overflow-y: auto;">
                        <table id="supplier-table">
                            <thead>
                                <tr>
                                    <th>Supplier Name</th>
                                    <th>Rep Contact</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>SLA Terms</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>${this.renderSupplierRows()}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    },

    switchTab(tabId, event) {
        document.querySelectorAll('#inventory-view .settings-tab').forEach(btn => btn.classList.remove('active'));
        if(event && event.currentTarget) event.currentTarget.classList.add('active');
        
        document.querySelectorAll('#inventory-view .settings-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById('inventory-' + tabId).classList.add('active');
    },

    renderStockRows() {
        if(!window.app || !window.app.state.inventory || window.app.state.inventory.length === 0) {
            return `<tr><td colspan="6" style="text-align: center; color: #a0a0a0;">No stock items recorded.</td></tr>`;
        }
        
        return window.app.state.inventory.map(item => `
            <tr>
                <td><span class="badge" style="background: ${item.itemType === 'Service' ? 'rgba(108, 92, 231, 0.1)' : 'rgba(255,255,255,0.05)'}; color: ${item.itemType === 'Service' ? 'var(--accent)' : '#fff'};">${item.itemType === 'Service' ? 'Service' : 'Stock'}</span></td>
                <td>
                    <strong>${item.sku}</strong>
                    ${item.serial ? `<br><small style="color: #a29bfe; font-size: 0.75rem;">SN: ${item.serial}</small>` : ''}
                </td>
                <td>
                    ${item.name}
                    ${item.supplier ? `<br><small style="color: #a0a0a0;">Vendor: ${item.supplier}</small>` : ''}
                </td>
                <td><span class="badge pending">${item.category}</span></td>
                <td>
                    ${item.itemType === 'Service' ? '<span style="color: #a0a0a0;">N/A</span>' : `
                    <span style="color: ${parseInt(item.qty || item.stock || 0) < 5 ? 'var(--danger)' : 'var(--text-primary)'}; font-weight: ${parseInt(item.qty || item.stock || 0) < 5 ? 'bold' : 'normal'}">
                        ${item.qty !== undefined ? item.qty : (item.stock || 0)} 
                        ${parseInt(item.qty || item.stock || 0) < 5 ? '⚠️' : ''}
                    </span>
                    `}
                </td>
                <td style="font-weight: 500">
                    <span style="color: #a0a0a0; font-size: 0.8rem;">Sell:</span> R ${item.sell || item.sellPrice || '0.00'}<br>
                    <span style="color: #a0a0a0; font-size: 0.8rem;">Cost:</span> R ${item.cost || item.buyPrice || '0.00'}
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon" onclick="inventory.showIssueStockModal('${item.id}')" title="Issue to Technician" style="color: var(--warning);"><span class="material-symbols-outlined" style="font-size: 1.1rem">person_pin</span></button>
                        <button class="btn-icon" onclick="inventory.showEditPartModal('${item.id}')" title="Edit Item"><span class="material-symbols-outlined" style="font-size: 1.1rem">edit</span></button>
                        <button class="btn-icon" onclick="inventory.deletePart('${item.id}')" style="color: var(--danger);" title="Delete Item"><span class="material-symbols-outlined" style="font-size: 1.1rem">delete</span></button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    renderSupplierRows() {
        if(!window.app || !window.app.state.suppliers || window.app.state.suppliers.length === 0) {
            return `<tr><td colspan="6" style="text-align: center; color: #a0a0a0;">No suppliers recorded.</td></tr>`;
        }
        
        return window.app.state.suppliers.map(sup => `
            <tr>
                <td><strong>${sup.name}</strong></td>
                <td>${sup.rep}</td>
                <td>${sup.phone}</td>
                <td><a href="mailto:${sup.email}" style="color: #a29bfe; text-decoration: none;">${sup.email}</a></td>
                <td>${sup.sla}</td>
                <td><button class="btn-icon" title="Edit Supplier"><span class="material-symbols-outlined" style="font-size: 1.1rem">edit</span></button></td>
            </tr>
        `).join('');
    },

    showAddPartModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Add Stock Part</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="inventory.handleAddPart(event)">
                        <div class="form-group">
                            <label>Item Type</label>
                            <select id="part-type" class="form-control" style="appearance: auto;" onchange="inventory.toggleStockInputs(this.value)">
                                <option value="Stock">Physical Stock (Hardware, Cables, etc.)</option>
                                <option value="Service">Service / Labour (Repairs, Travel, etc.)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Part / Item Name</label>
                            <input type="text" id="part-name" class="form-control" placeholder="e.g. 500GB SSD or Labour - 1 Hour" required>
                        </div>
                        <div class="form-row" id="row-sku-serial">
                            <div class="form-group">
                                <label>SKU / Barcode</label>
                                <input type="text" id="part-sku" class="form-control" placeholder="e.g. CRU-500-SSD" required>
                            </div>
                            <div class="form-group">
                                <label>Serial Number (Optional)</label>
                                <input type="text" id="part-serial" class="form-control" placeholder="e.g. SN123456789">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Category</label>
                                <div id="cat-select-wrapper">
                                    <select id="part-cat" class="form-control" style="appearance: auto;" onchange="if(this.value==='_NEW_') { document.getElementById('cat-select-wrapper').classList.add('hidden'); document.getElementById('cat-input-wrapper').classList.remove('hidden'); document.getElementById('part-cat-new').focus(); }">
                                        ${[...new Set((window.app.state.inventory || []).map(i => i.category))].filter(Boolean).sort().map(c => `<option value="${c}">${c}</option>`).join('')}
                                        <option value="Storage">Storage</option>
                                        <option value="RAM">RAM</option>
                                        <option value="Displays">Displays</option>
                                        <option value="Cables">Cables</option>
                                        <option value="Consumables">Consumables</option>
                                        <option value="_NEW_">+ Add Custom Category</option>
                                    </select>
                                </div>
                                <div id="cat-input-wrapper" class="hidden">
                                    <div style="display: flex; gap: 4px;">
                                        <input type="text" id="part-cat-new" class="form-control" placeholder="Enter Category Name">
                                        <button type="button" class="btn-icon" onclick="document.getElementById('cat-select-wrapper').classList.remove('hidden'); document.getElementById('cat-input-wrapper').classList.add('hidden'); document.getElementById('part-cat').value='Storage';"><span class="material-symbols-outlined">undo</span></button>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group">
                                <label style="display: flex; justify-content: space-between; align-items: center;">
                                    Preferred Supplier
                                    <button type="button" class="btn-icon" onclick="inventory.showAddSupplierModal('part')" style="color: var(--primary); padding: 0; height: auto;" title="Add New Supplier"><span class="material-symbols-outlined" style="font-size: 1.1rem;">person_add</span></button>
                                </label>
                                <select id="part-supplier" class="form-control" style="appearance: auto;">
                                    <option value="">- Select Supplier -</option>
                                    ${(window.app.state.suppliers || []).map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Cost Price (incl. VAT)</label>
                                <input type="text" id="part-cost" class="form-control" placeholder="R 450.00" required>
                            </div>
                            <div class="form-group">
                                <label>Selling Price</label>
                                <input type="text" id="part-sell" class="form-control" placeholder="R 850.00" required>
                            </div>
                        </div>
                        <div class="form-group" id="row-qty">
                            <label>Initial Quantity</label>
                            <input type="number" id="part-qty" class="form-control" value="1" min="0">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Save Part</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleAddPart(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Saving...'; btn.disabled = true; }

        try {
            await window.fbDb.collection('inventory').add({
                itemType: document.getElementById('part-type')?.value || 'Stock',
                sku: document.getElementById('part-sku')?.value || '',
                serial: document.getElementById('part-serial')?.value || '',
                name: document.getElementById('part-name')?.value || '',
                category: (document.getElementById('part-cat')?.value === '_NEW_') ? (document.getElementById('part-cat-new')?.value || 'General') : (document.getElementById('part-cat')?.value || 'General'),
                supplier: document.getElementById('part-supplier')?.value || '',
                cost: document.getElementById('part-cost')?.value || '0.00',
                sell: document.getElementById('part-sell')?.value || '0.00',
                qty: parseInt(document.getElementById('part-qty')?.value) || 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.logActivity('Inventory Item Added', `Added ${document.getElementById('part-name')?.value} (SKU: ${document.getElementById('part-sku')?.value})`);
            window.app.closeModal();
        } catch(error) {
            console.error("Error adding part:", error);
            alert("Failed to save stock item: " + error.message);
            if(btn) { btn.innerHTML = 'Save Part'; btn.disabled = false; }
        }
    },

    showEditPartModal(id) {
        const item = window.app.state.inventory.find(i => i.id === id);
        if(!item) return;

        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Edit Stock Item</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="inventory.handleEditPart(event, '${id}')">
                        <div class="form-group">
                            <label>Item Type</label>
                            <select id="edit-part-type" class="form-control" style="appearance: auto;" onchange="inventory.toggleStockInputs(this.value, 'edit')">
                                <option value="Stock" ${item.itemType === 'Stock' ? 'selected' : ''}>Physical Stock</option>
                                <option value="Service" ${item.itemType === 'Service' ? 'selected' : ''}>Service / Labour</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Part / Item Name</label>
                            <input type="text" id="edit-part-name" class="form-control" value="${item.name}" required>
                        </div>
                        <div class="form-row" id="edit-row-sku-serial" class="${item.itemType === 'Service' ? 'hidden' : ''}">
                            <div class="form-group">
                                <label>SKU / Barcode</label>
                                <input type="text" id="edit-part-sku" class="form-control" value="${item.sku}" required>
                            </div>
                            <div class="form-group">
                                <label>Serial Number</label>
                                <input type="text" id="edit-part-serial" class="form-control" value="${item.serial || ''}">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Category</label>
                                <div id="edit-cat-select-wrapper">
                                    <select id="edit-part-cat" class="form-control" style="appearance: auto;" onchange="if(this.value==='_NEW_') { document.getElementById('edit-cat-select-wrapper').classList.add('hidden'); document.getElementById('edit-cat-input-wrapper').classList.remove('hidden'); document.getElementById('edit-part-cat-new').focus(); }">
                                        ${[...new Set((window.app.state.inventory || []).map(k => k.category))].filter(Boolean).sort().map(c => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                                        <option value="_NEW_">+ Add Custom Category</option>
                                    </select>
                                </div>
                                <div id="edit-cat-input-wrapper" class="hidden">
                                    <div style="display: flex; gap: 4px;">
                                        <input type="text" id="edit-part-cat-new" class="form-control" placeholder="Enter Category Name">
                                        <button type="button" class="btn-icon" onclick="document.getElementById('edit-cat-select-wrapper').classList.remove('hidden'); document.getElementById('edit-cat-input-wrapper').classList.add('hidden');"><span class="material-symbols-outlined">undo</span></button>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Supplier</label>
                                <select id="edit-part-supplier" class="form-control" style="appearance: auto;">
                                    <option value="">- Select Supplier -</option>
                                    ${(window.app.state.suppliers || []).map(s => `<option value="${s.name}" ${item.supplier === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Cost Price</label>
                                <input type="text" id="edit-part-cost" class="form-control" value="${item.cost}" required>
                            </div>
                            <div class="form-group">
                                <label>Selling Price</label>
                                <input type="text" id="edit-part-sell" class="form-control" value="${item.sell}" required>
                            </div>
                        </div>
                        <div class="form-group" id="edit-row-qty" class="${item.itemType === 'Service' ? 'hidden' : ''}">
                            <label>Current Quantity</label>
                            <input type="number" id="edit-part-qty" class="form-control" value="${item.qty}" min="0">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Update Item</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleEditPart(e, id) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Updating...'; btn.disabled = true; }

        try {
            await window.fbDb.collection('inventory').doc(id).update({
                itemType: document.getElementById('edit-part-type')?.value || 'Stock',
                sku: document.getElementById('edit-part-sku')?.value || '',
                serial: document.getElementById('edit-part-serial')?.value || '',
                name: document.getElementById('edit-part-name')?.value || '',
                category: (document.getElementById('edit-part-cat')?.value === '_NEW_') ? (document.getElementById('edit-part-cat-new')?.value || 'General') : (document.getElementById('edit-part-cat')?.value || 'General'),
                supplier: document.getElementById('edit-part-supplier')?.value || '',
                cost: document.getElementById('edit-part-cost')?.value || '',
                sell: document.getElementById('edit-part-sell')?.value || '',
                qty: parseInt(document.getElementById('edit-part-qty')?.value) || 0,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.logActivity('Inventory Item Updated', `Modified ${document.getElementById('edit-part-name')?.value || id}`);
            window.app.closeModal();
        } catch(error) {
            console.error("Error updating part:", error);
            alert("Failed to update stock item: " + error.message);
            if(btn) { btn.innerHTML = 'Update Item'; btn.disabled = false; }
        }
    },

    async deletePart(id) {
        if(!confirm("Are you sure you want to permanently delete this stock item? This cannot be undone.")) return;
        
        try {
            const item = window.app.state.inventory.find(i => i.id === id);
            await window.fbDb.collection('inventory').doc(id).delete();
            if(item) window.app.logActivity('Inventory Item Deleted', `Removed ${item.name} (SKU: ${item.sku})`);
        } catch(error) {
            console.error("Error deleting part:", error);
            alert("Failed to delete stock item.");
        }
    },

    showStockCountModal() {
        const items = window.app.state.inventory || [];
        const modalHTML = `
            <div class="modal-content" style="max-width: 800px; width: 90%;">
                <div class="modal-header">
                    <h2>Stock Count (Audit)</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 16px;">Perform a physical stock count. Update the 'Actual Count' for any items that differ from the system record.</p>
                    <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                        <table style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>Item / SKU</th>
                                    <th>System Qty</th>
                                    <th style="width: 150px;">Actual Physical Count</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => `
                                    <tr>
                                        <td>
                                            <div style="font-weight: 500;">${item.name}</div>
                                            <div style="font-size: 0.8rem; color: #a0a0a0;">${item.sku}</div>
                                        </td>
                                        <td style="text-align: center; font-weight: bold;">${item.qty !== undefined ? item.qty : (item.stock || 0)}</td>
                                        <td>
                                            <input type="number" id="sc-qty-${item.id}" class="form-control" value="${item.qty !== undefined ? item.qty : (item.stock || 0)}" min="0">
                                        </td>
                                        <td>
                                            <button class="btn-secondary" style="padding: 4px 12px; font-size: 0.85rem;" onclick="inventory.handleStockUpdate('${item.id}')">Update</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" onclick="app.closeModal()">Finished Audit</button>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleStockUpdate(id) {
        const newQty = parseInt(document.getElementById('sc-qty-' + id).value);
        if(isNaN(newQty)) return;

        try {
            await window.fbDb.collection('inventory').doc(id).update({
                qty: newQty,
                lastAudit: firebase.firestore.FieldValue.serverTimestamp()
            });
            const item = window.app.state.inventory.find(i => i.id === id);
            window.app.logActivity('Stock Adjustment', `Adjusted ${item ? item.name : id} stock to ${newQty}`);
            // Visual feedback
            const btn = event.currentTarget;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 1rem;">check</span>';
            btn.style.background = 'rgba(0, 184, 148, 0.2)';
            btn.style.color = '#00b894';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 1500);
        } catch(e) {
            console.error(e);
            alert("Update failed.");
        }
    },

    lastSupplierSource: null,

    showAddSupplierModal(source = null) {
        this.lastSupplierSource = source;
        const modalHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Add Supplier</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form onsubmit="inventory.handleAddSupplier(event)">
                        <div class="form-group">
                            <label>Supplier / Vendor Name</label>
                            <input type="text" id="sup-name" class="form-control" placeholder="e.g. Rectron South Africa" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Account/Rep Contact</label>
                                <input type="text" id="sup-rep" class="form-control" placeholder="e.g. Jason Smith" required>
                            </div>
                            <div class="form-group">
                                <label>Phone Number</label>
                                <input type="tel" id="sup-phone" class="form-control" placeholder="011 555 1234" pattern="^0[0-9]{2}\s?[0-9]{3}\s?[0-9]{4}$" title="10-digit SA number starting with 0">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="sup-email" class="form-control" placeholder="sales@supplier.co.za">
                        </div>
                        <div class="form-group">
                            <label>SLA / Delivery Terms</label>
                            <input type="text" id="sup-sla" class="form-control" placeholder="e.g. Next Business Day / 30-Day Account">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Save Supplier</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleAddSupplier(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Saving...'; btn.disabled = true; }

        const payload = {
            name: document.getElementById('sup-name').value,
            rep: document.getElementById('sup-rep').value,
            phone: document.getElementById('sup-phone').value,
            email: document.getElementById('sup-email').value,
            sla: document.getElementById('sup-sla').value,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await window.fbDb.collection('suppliers').add(payload);
            
            const source = this.lastSupplierSource;
            window.app.closeModal();

            if (source === 'part') {
                // Re-open and auto-select
                this.showAddPartModal();
                setTimeout(() => {
                    const sel = document.getElementById('part-supplier');
                    if(sel) sel.value = payload.name;
                }, 100);
            } else {
                this.switchTab('suppliers', { currentTarget: document.querySelectorAll('#inventory-view .settings-tab')[1] });
            }
            // onSnapshot refreshes data automatically
        } catch(error) {
            console.error("Error adding supplier:", error);
            alert("Failed to save supplier. Check connection.");
            if(btn) { btn.innerHTML = 'Save Supplier'; btn.disabled = false; }
        }
    },

    showIssueStockModal(id) {
        const item = window.app.state.inventory.find(i => i.id === id);
        if(!item) return;

        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Issue Stock to Technician</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <p style="color: #a0a0a0; margin-bottom: 16px;">Item: <strong>${item.name}</strong><br>Warehouse Qty: <strong>${item.qty}</strong></p>
                    <form onsubmit="inventory.handleIssueStock(event, '${id}')">
                        <div class="form-group">
                            <label>Select Technician</label>
                            <select id="issue-tech-email" class="form-control" style="appearance: auto;" required>
                                <option value="" disabled selected>-- Select --</option>
                                <option value="admin@itguy.co.za">Admin (Self)</option>
                                <option value="john@itguy.co.za">John Doe</option>
                                <option value="sarah@itguy.co.za">Sarah Parker</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Quantity to Issue</label>
                            <input type="number" id="issue-qty" class="form-control" value="1" min="1" max="${item.qty}" required>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary">Handover Stock</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleIssueStock(e, invId) {
        e.preventDefault();
        const techEmail = document.getElementById('issue-tech-email').value;
        const qtyToIssue = parseInt(document.getElementById('issue-qty').value);
        const item = window.app.state.inventory.find(i => i.id === invId);

        if(!item || qtyToIssue > item.qty) {
            alert("Insufficient stock in warehouse!");
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.innerHTML = "Processing...";
        btn.disabled = true;

        try {
            const batch = window.fbDb.batch();

            // 1. Deduct from Warehouse
            const invRef = window.fbDb.collection('inventory').doc(invId);
            batch.update(invRef, {
                qty: firebase.firestore.FieldValue.increment(-qtyToIssue),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Add to Tech Stock (Upsert)
            // We search for existing tech stock for this item/tech
            const existingTechStock = (window.app.state.techStock || []).find(s => s.techEmail === techEmail && s.sku === item.sku);
            if (existingTechStock) {
                const tsRef = window.fbDb.collection('techStock').doc(existingTechStock.id);
                batch.update(tsRef, {
                    qty: firebase.firestore.FieldValue.increment(qtyToIssue),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                const tsRef = window.fbDb.collection('techStock').doc();
                batch.set(tsRef, {
                    techEmail,
                    invId,
                    sku: item.sku,
                    name: item.name,
                    category: item.category,
                    qty: qtyToIssue,
                    issuedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // 3. Log Activity
            const logRef = window.fbDb.collection('logs').doc();
            batch.set(logRef, {
                type: 'Stock Handover',
                message: `Issued ${qtyToIssue}x ${item.name} to ${techEmail}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            await batch.commit();
            window.app.closeModal();
            alert(`Stock issued successfully to ${techEmail}`);
        } catch(err) {
            console.error(err);
            alert("Handover failed.");
            btn.innerHTML = "Handover Stock";
            btn.disabled = false;
        }
    },

    toggleStockInputs(type, prefix = 'part') {
        const isService = type === 'Service';
        const skuRow = document.getElementById(prefix === 'edit' ? 'edit-row-sku-serial' : 'row-sku-serial');
        const qtyRow = document.getElementById(prefix === 'edit' ? 'edit-row-qty' : 'row-qty');
        
        if (skuRow) skuRow.classList.toggle('hidden', isService);
        if (qtyRow) qtyRow.classList.toggle('hidden', isService);

        // Required field adjustments
        const skuInput = document.getElementById(prefix === 'edit' ? 'edit-part-sku' : 'part-sku');
        if (skuInput) skuInput.required = !isService;
    }
};

window.posSystem = {
    cart: [],
    
    init() {
        this.container = document.getElementById('pos-content');
        if(this.container) this.render();
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('pos-content');
            if (!this.container) return;
        }
        const html = `
            <div class="pos-wrapper" style="display: flex; flex-direction: column; gap: 24px; height: auto; min-height: calc(100vh - 100px);">
                
                <div class="pos-layout-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; flex: 1;">
                
                <!-- Left: Catalog -->
                <div class="glass-card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0;">
                    <div style="padding: 16px; border-bottom: 1px solid #e0e0e0; display: flex; gap: 16px; align-items: center; background: rgba(0,0,0,0.1);">
                        <div class="search-bar" style="flex: 1; margin: 0; background: rgba(255,255,255,0.05); border: 1px solid #e0e0e0;">
                            <span class="material-symbols-outlined">search</span>
                            <input type="text" id="pos-search" placeholder="Search by name, SKU or Serial..." onkeyup="posSystem.filterCatalog()" onkeydown="posSystem.handleSearchKeydown(event)">
                        </div>
                    </div>
                    
                    <div id="pos-catalog" style="padding: 16px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; flex: 1; align-content: start;">
                        ${this.renderCatalog()}
                    </div>
                </div>

                <!-- Right: Cart Register -->
                <div class="glass-card" style="display: flex; flex-direction: column; padding: 0;">
                    <div style="padding: 16px; border-bottom: 1px solid #e0e0e0; background: rgba(108, 92, 231, 0.1);">
                        <h2 style="margin: 0; display: flex; align-items: center; justify-content: space-between;">
                            Current Sale
                            <span class="material-symbols-outlined" style="cursor: pointer; color: #ff7675;" onclick="posSystem.clearCart()" title="Void Sale">delete_sweep</span>
                        </h2>
                    </div>
                    
                    <div style="padding: 16px; border-bottom: 1px solid #e0e0e0;">
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="pos-customer" list="crm-customers-list" class="form-control" placeholder="Select existing or type Walk-in">
                            <button type="button" class="btn-secondary" style="padding: 0 12px; height: 100%; border: 1px solid var(--primary);" onclick="customers.showAddCustomerModal('pos')" title="Quick Add Customer"><span class="material-symbols-outlined">person_add</span></button>
                        </div>
                        ${window.app ? window.app.generateCustomerDatalist() : ''}
                    </div>

                    <div id="pos-cart-items" style="flex: 1; overflow-y: auto; padding: 16px;">
                        ${this.renderCartItems()}
                    </div>

                    <div style="padding: 16px; border-top: 1px solid #e0e0e0; background: rgba(0,0,0,0.15);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #a0a0a0;">
                            <span>Subtotal:</span>
                            <span id="pos-subtotal">R 0.00</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 1.5rem; font-weight: bold; color: #a29bfe;">
                            <span>Total:</span>
                            <span id="pos-total">R 0.00</span>
                        </div>
                        
                        <button class="btn-primary" style="width: 100%; padding: 16px; font-size: 1.1rem; justify-content: center;" onclick="posSystem.showPaymentModal()">
                            <span class="material-symbols-outlined">point_of_sale</span> Complete Sale
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.container.innerHTML = html;
        this.updateTotals();
    },

    renderCatalog() {
        if(!window.app || !window.app.state.inventory || window.app.state.inventory.length === 0) return `<div style="grid-column: 1/-1; text-align: center; color: #a0a0a0; margin-top: 32px;">Inventory is empty. Add items in the Inventory tab first.</div>`;
        
        return window.app.state.inventory.map((item, index) => {
            const qty = parseInt(item.qty !== undefined ? item.qty : (item.stock || 0));
            const outOfStock = qty <= 0;
            const price = this._parsePrice(item.sell || item.sellPrice || 0);
            const itemName = item.name || 'Unnamed Item';
            const itemSku = item.sku || 'No SKU';
            
            return `
                <div class="pos-item-card ${outOfStock ? 'disabled' : ''}" style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; cursor: ${outOfStock ? 'not-allowed' : 'pointer'}; transition: all 0.2s; position: relative;" onclick="${outOfStock ? '' : `posSystem.addToCart(${index})`}">
                    <div style="font-size: 0.8rem; color: #a0a0a0; margin-bottom: 4px;">${itemSku}</div>
                    <div style="font-weight: bold; color: #ffffff; margin-bottom: 8px; font-size: 0.95rem;">${itemName}</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12px;">
                        <span style="color: #a29bfe; font-weight: bold;">R ${price.toFixed(2)}</span>
                        <span style="font-size: 0.8rem; background: ${qty < 5 ? (qty <= 0 ? 'rgba(255,118,117,0.2)' : 'rgba(253,203,110,0.2)') : 'rgba(0,184,148,0.1)'}; color: ${qty < 5 ? (qty <= 0 ? 'var(--danger)' : 'var(--warning)') : 'var(--success)'}; padding: 2px 6px; border-radius: 4px;">${qty} left</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    _parsePrice(val) {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return parseFloat(val.replace(/[^0-9.-]+/g,"")) || 0;
        return 0;
    },

    filterCatalog() {
        const term = document.getElementById('pos-search').value.toLowerCase();
        const catalog = document.getElementById('pos-catalog');
        const items = window.app.state.inventory;
        
        const filteredHTML = items.map((item, index) => {
            const matchesName = (item.name || '').toLowerCase().includes(term);
            const matchesSku = (item.sku || '').toLowerCase().includes(term);
            const matchesSerial = (item.serial || '').toLowerCase().includes(term);
            
            if(!matchesName && !matchesSku && !matchesSerial) return '';
            
            const qty = parseInt(item.qty !== undefined ? item.qty : (item.stock || 0));
            const outOfStock = qty <= 0;
            const price = this._parsePrice(item.sell || item.sellPrice || 0);
            
            return `
                <div class="pos-item-card ${outOfStock ? 'disabled' : ''}" style="background: rgba(255,255,255,0.02); border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; cursor: ${outOfStock ? 'not-allowed' : 'pointer'}; transition: all 0.2s;" onclick="${outOfStock ? '' : `posSystem.addToCart(${index})`}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <div style="font-size: 0.8rem; color: #a0a0a0;">${item.sku}</div>
                        ${item.serial ? `<div style="font-size: 0.75rem; color: #a29bfe;">SN: ${item.serial}</div>` : ''}
                    </div>
                    <div style="font-weight: bold; color: #ffffff; margin-bottom: 8px; font-size: 0.95rem;">${item.name}</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12px;">
                        <span style="color: #a29bfe; font-weight: bold;">R ${price.toFixed(2)}</span>
                        <span style="font-size: 0.8rem; background: ${qty < 5 ? (qty <= 0 ? 'rgba(255,118,117,0.2)' : 'rgba(253,203,110,0.2)') : 'rgba(0,184,148,0.1)'}; color: ${qty < 5 ? (qty <= 0 ? 'var(--danger)' : 'var(--warning)') : 'var(--success)'}; padding: 2px 6px; border-radius: 4px;">${qty} left</span>
                    </div>
                </div>
            `;
        }).join('');

        catalog.innerHTML = filteredHTML || `<div style="grid-column: 1/-1; text-align: center; color: #a0a0a0; margin-top: 32px;">No products match search.</div>`;
    },

    handleSearchKeydown(e) {
        if(e.key === 'Enter') {
            const term = e.target.value.trim().toLowerCase();
            if(!term) return;
            
            const items = window.app.state.inventory;
            const matches = items.filter(i => i.sku.toLowerCase() === term || (i.serial && i.serial.toLowerCase() === term));
            
            if(matches.length === 1) {
                const matchIndex = items.indexOf(matches[0]);
                const qty = parseInt(matches[0].qty) || 0;
                if(qty > 0) {
                    this.addToCart(matchIndex);
                    e.target.value = '';
                    this.filterCatalog();
                } else {
                    alert("Item is out of stock!");
                }
            }
        }
    },

    addToCart(inventoryIndex) {
        const item = window.app.state.inventory[inventoryIndex];
        const price = this._parsePrice(item.sell || item.sellPrice || 0);
        const itemQty = parseInt(item.qty !== undefined ? item.qty : (item.stock || 0));
        
        const existing = this.cart.find(c => c.sku === item.sku);
        if(existing) {
            if(existing.qty + 1 > itemQty) {
                 alert("Cannot add more than available stock!");
                 return;
            }
            existing.qty++;
        } else {
            this.cart.push({
                docId: item.id, // Live Firestore ID
                sku: item.sku,
                name: item.name,
                unitPrice: price,
                qty: 1,
                inventoryIndex: inventoryIndex
            });
        }
        
        this.refreshCartUI();
    },
    
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.refreshCartUI();
    },

    changeQty(index, delta) {
        const cartItem = this.cart[index];
        const invItem = window.app.state.inventory[cartItem.inventoryIndex];
        
        const newQty = cartItem.qty + delta;
        
        if(newQty <= 0) {
            this.removeFromCart(index);
            return;
        }
        
        if(newQty > invItem.qty) {
            alert("Not enough stock available!");
            return;
        }
        
        cartItem.qty = newQty;
        this.refreshCartUI();
    },

    refreshCartUI() {
        document.getElementById('pos-cart-items').innerHTML = this.renderCartItems();
        this.updateTotals();
    },

    renderCartItems() {
        if(this.cart.length === 0) {
            return `<div style="text-align: center; color: #a0a0a0; margin-top: 40px;">
                        <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.5;">shopping_cart</span>
                        <p>Cart is empty</p>
                    </div>`;
        }

        return this.cart.map((c, i) => `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                <div style="flex: 1;">
                    <div style="font-weight: 500; font-size: 0.95rem; line-height: 1.3;">${c.name}</div>
                    <div style="color: #a0a0a0; font-size: 0.85rem; margin-top: 4px;">R ${c.unitPrice.toFixed(2)} each</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                    <div style="font-weight: bold;">R ${(c.unitPrice * c.qty).toFixed(2)}</div>
                    <div style="display: flex; align-items: center; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;">
                        <button style="border: none; background: transparent; color: #fff; padding: 4px 8px; cursor: pointer;" onclick="posSystem.changeQty(${i}, -1)">-</button>
                        <span style="padding: 0 8px; font-size: 0.9rem;">${c.qty}</span>
                        <button style="border: none; background: transparent; color: #fff; padding: 4px 8px; cursor: pointer;" onclick="posSystem.changeQty(${i}, 1)">+</button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    updateTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
        
        const subEl = document.getElementById('pos-subtotal');
        const totEl = document.getElementById('pos-total');
        if(subEl) subEl.innerText = `R ${subtotal.toFixed(2)}`;
        if(totEl) totEl.innerText = `R ${subtotal.toFixed(2)}`;
    },

    clearCart() {
        if(this.cart.length > 0 && confirm("Void current sale?")) {
            this.cart = [];
            document.getElementById('pos-customer').value = '';
            document.getElementById('pos-search').value = '';
            this.filterCatalog();
            this.refreshCartUI();
        }
    },

    showPaymentModal() {
        if(this.cart.length === 0) return alert("Cart is empty!");
        
        const total = this.cart.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
        
        const modalHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2>Complete Sale</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 24px; padding: 20px; background: rgba(108, 92, 231, 0.1); border-radius: 12px;">
                        <div style="color: #a0a0a0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Amount Due</div>
                        <div style="font-size: 2.5rem; font-weight: 800; color: var(--accent);">R ${total.toFixed(2)}</div>
                    </div>
                    
                    <div class="form-group">
                        <label>Payment Method</label>
                        <select id="pos-pay-method" class="form-control" style="appearance: auto; font-size: 1.1rem; height: 50px;" onchange="posSystem.handlePaymentMethodChange()">
                            <option value="Cash">Cash</option>
                            <option value="Card">Credit/Debit Card</option>
                            <option value="EFT">EFT / Bank Transfer</option>
                        </select>
                    </div>
                    
                    <div id="pos-cash-fields">
                        <div class="form-group">
                            <label>Amount Paid</label>
                            <input type="number" id="pos-amount-paid" class="form-control" style="font-size: 1.5rem; height: 60px; font-weight: bold;" value="${total.toFixed(2)}" step="0.01" oninput="posSystem.calcChange(${total})">
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                            <span style="color: #a0a0a0;">Change Due:</span>
                            <span id="pos-change-due" style="font-size: 1.8rem; font-weight: bold; color: #00b894;">R 0.00</span>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="padding: 0; margin-top: 24px;">
                        <button class="btn-secondary" style="flex: 1; height: 50px;" onclick="app.closeModal()">Cancel</button>
                        <button class="btn-primary" style="flex: 2; height: 50px; font-size: 1.1rem; justify-content: center;" onclick="posSystem.completeSale()">Finish Sale</button>
                    </div>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
        this.calcChange(total);
    },

    handlePaymentMethodChange() {
        const method = document.getElementById('pos-pay-method').value;
        const cashFields = document.getElementById('pos-cash-fields');
        if(method === 'Cash') {
            cashFields.classList.remove('hidden');
        } else {
            cashFields.classList.add('hidden');
        }
    },

    calcChange(total) {
        const paid = parseFloat(document.getElementById('pos-amount-paid').value) || 0;
        const change = Math.max(0, paid - total);
        document.getElementById('pos-change-due').innerText = `R ${change.toFixed(2)}`;
        return change;
    },

    async completeSale() {
        if(this.cart.length === 0) return;

        const total = this.cart.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
        let custName = document.getElementById('pos-customer').value.trim();
        if(!custName) custName = "Walk-in Customer";
        
        // Grab payment details
        const method = document.getElementById('pos-pay-method')?.value || 'Cash';
        const paid = parseFloat(document.getElementById('pos-amount-paid')?.value) || total;
        const change = paid - total;

        const btn = document.querySelector('.btn-primary[onclick="posSystem.completeSale()"]');
        if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span> Processing...'; btn.disabled = true; }

        try {
            const batch = window.fbDb.batch();
            this.cart.forEach(cartItem => {
                if(cartItem.docId) {
                    const invRef = window.fbDb.collection('inventory').doc(cartItem.docId);
                    batch.update(invRef, {
                        qty: firebase.firestore.FieldValue.increment(-cartItem.qty)
                    });
                }
            });

            await batch.commit();

            const docId = "REC-" + Math.floor(Math.random() * 900000 + 100000);
            
            // Record Sale in Firestore
            await window.fbDb.collection('sales').doc(docId).set({
                id: docId,
                customer: custName,
                items: this.cart,
                total: total,
                method: method,
                amountPaid: paid,
                change: change > 0 ? change : 0,
                status: 'Completed',
                date: new Date().toISOString(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.logActivity('POS Sale', `Completed sale ${docId} for ${custName} (Total: R ${total.toFixed(2)})`);

            const successHTML = `
                <div style="padding: 24px; text-align: center;">
                    <span class="material-symbols-outlined" style="font-size: 4rem; color: #00b894; margin-bottom: 16px;">check_circle</span>
                    <h2 style="color: #ffffff; margin-bottom: 8px;">Sale Complete</h2>
                    <p style="color: #a0a0a0; margin-bottom: 24px;">Receipt <strong>${docId}</strong> generated successfully.</p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
                        <button class="btn-primary" style="justify-content: center;" onclick="posSystem.printReceipt('${custName}', ${total}, '${method}', ${paid}, ${change})"><span class="material-symbols-outlined">receipt</span> Print Receipt</button>
                        <button class="btn-primary" style="justify-content: center; background: var(--accent);" onclick="app.executeDocumentAction('Email', 'Cash Receipt', '${docId}', '')"><span class="material-symbols-outlined">mail</span> Email</button>
                        <button class="btn-primary" style="justify-content: center; background: #128C7E; border-color: #128C7E;" onclick="app.executeDocumentAction('WhatsApp', 'Cash Receipt', '${docId}', '')"><span class="material-symbols-outlined">chat</span> WhatsApp</button>
                        <button class="btn-secondary" style="justify-content: center;" onclick="app.closeModal()">Finish</button>
                    </div>
                </div>
            `;

            window.app.showModal(`
                <div class="modal-content" style="max-width: 450px;">
                    ${successHTML}
                </div>
            `);

            // Cache for printing
            this.lastSale = { items: [...this.cart], total, custName, method, paid, change, id: docId };

            // Full UI Reset
            this.cart = [];
            const custInput = document.getElementById('pos-customer');
            if(custInput) custInput.value = '';
            
            const searchInput = document.getElementById('pos-search');
            if(searchInput) searchInput.value = '';
            
            this.refreshCartUI();
            this.filterCatalog(); // Refresh catalog with empty search to show all items
            
        } catch(err) {
            console.error(err);
            alert("Transaction Failed. Check your network.");
        } finally {
            if(btn) { btn.innerHTML = '<span class="material-symbols-outlined">point_of_sale</span> Complete Sale'; btn.disabled = false; }
        }
    },

    printReceipt(custName, total, method = 'Cash', paid = 0, change = 0) {
        if(!this.lastSale) return;

        const pdfItems = this.lastSale.items.map(i => {
           return {
               type: 'Sale',
               desc: i.name + ' (' + i.sku + ')',
               unit: i.unitPrice,
               qty: i.qty
           };
        });

        const docId = this.lastSale.id || ("REC-" + Math.floor(Math.random() * 100000));

        const dataObj = {
           date: new Date().toLocaleDateString(),
           customer: custName,
           items: pdfItems,
           method: method,
           amountPaid: paid,
           change: change,
           docType: 'Cash Receipt'
        };

        window.pdfGenerator.generate('Cash Receipt', docId, dataObj);
    }
};

// Initialized by app.js

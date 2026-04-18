const db = require('./database');

async function seed() {
    await db.init();
    
    // Helper to insert into collections seamlessly
    const insertDoc = async (col, id, data) => {
        const sql = process.env.DB_TYPE === 'mysql' 
            ? `INSERT INTO collections (id, name, data, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE data = VALUES(data)`
            : `INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
        await db.run(sql, [id, col, JSON.stringify(data)]);
    };

    console.log("Seeding IT Guy Solutions Demo Data...");

    // 1. Inventory Items
    console.log("-> Seeding Inventory...");
    await insertDoc('inventory', 'ITM-001', { id: 'ITM-001', name: 'Samsung 500GB SSD', sku: 'SS500', cost: 'R 800.00', sell: 'R 1200.00', qty: 15, category: 'Storage' });
    await insertDoc('inventory', 'ITM-002', { id: 'ITM-002', name: 'Logitech M170 Wireless Mouse', sku: 'LOG-M170', cost: 'R 150.00', sell: 'R 250.00', qty: 30, category: 'Accessories' });
    await insertDoc('inventory', 'ITM-003', { id: 'ITM-003', name: 'Cat6 Network Cable 10m', sku: 'C6-10M', cost: 'R 80.00', sell: 'R 150.00', qty: 25, category: 'Networking' });
    await insertDoc('inventory', 'ITM-004', { id: 'ITM-004', name: 'HP LaserJet Toner 85A', sku: 'HP85A', cost: 'R 450.00', sell: 'R 850.00', qty: 2, category: 'Printing' });

    // 2. Customers
    console.log("-> Seeding Customers...");
    await insertDoc('customers', 'TechCorp Ltd', { name: 'TechCorp Ltd', email: 'director@techcorp.co.za', phone: '0821234567', address: '10 Innovation Hub, Sandton', type: 'Business' });
    await insertDoc('customers', 'Jane Doe', { name: 'Jane Doe', email: 'jane.d@example.com', phone: '0839876543', address: '45 Sunset Boulevard', type: 'Individual' });
    await insertDoc('customers', 'Velocity Logistics', { name: 'Velocity Logistics', email: 'admin@velocity.co.za', phone: '0112223333', address: 'Warehouse 4, Kempton Park', type: 'Business' });

    // Generate accurate dynamic dates so the BI Dashboard populates for "This Month"
    const today = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Jobs (Workshop & Field)
    console.log("-> Seeding Jobs...");
    await insertDoc('jobs', 'JOB-1001', { id: 'JOB-1001', customer: 'Jane Doe', device: 'MacBook Pro M1', description: 'Screen cracked', faultDescription: 'Customer dropped laptop. Screen is completely shattered. Display assembly needs total replacement.', status: 'In Repair', date: today, technician: 'admin', accessories: 'Charger', devicePasscode: '1234' });
    await insertDoc('jobs', 'JOB-1002', { id: 'JOB-1002', customer: 'TechCorp Ltd', device: 'Dell Latitude 3420', description: 'Keyboard keys missing', faultDescription: 'Keys A, S, and Enter are broken off. Requires new keyboard matrix.', status: 'Pending', date: twoDaysAgo, technician: 'Unassigned', accessories: 'None' });
    
    await insertDoc('fieldJobs', 'FLD-1001', { id: 'FLD-1001', customer: 'Velocity Logistics', description: 'Network Switch Setup', device: 'Site Network', dateBooked: today, physicalAddress: 'Warehouse 4, Kempton Park', faultDescription: 'Install and configure new 24-port switch in the dispatch office.', status: 'Scheduled', technician: 'admin' });

    // 4. Quotations
    console.log("-> Seeding Quotations...");
    await insertDoc('quotations', 'QUO-1001', { id: 'QUO-1001', customer: 'TechCorp Ltd', address: '10 Innovation Hub, Sandton', date: twoDaysAgo, items: [{ type: 'Hardware', desc: 'HP LaserJet Toner 85A', unit: 850, qty: 5 }, { type: 'Labor', desc: 'Delivery & Setup', unit: 350, qty: 1 }], amount: '4600.00', status: 'Sent' });
    await insertDoc('quotations', 'QUO-1002', { id: 'QUO-1002', customer: 'Jane Doe', address: '45 Sunset Boulevard', date: today, items: [{ type: 'Hardware', desc: 'Samsung 500GB SSD', unit: 1200, qty: 1 }, { type: 'Labor', desc: 'Data Cloning Service', unit: 450, qty: 1 }], amount: '1650.00', status: 'Accepted' });

    // 5. Invoices
    console.log("-> Seeding Invoices...");
    await insertDoc('invoices', 'INV-1001', { id: 'INV-1001', customer: 'Velocity Logistics', address: 'Warehouse 4, Kempton Park', date: fourDaysAgo, items: [{ type: 'Labor', desc: 'Network Diagnostic Call-Out', unit: 850, qty: 1 }], amount: '850.00', status: 'Paid' });
    await insertDoc('invoices', 'INV-1002', { id: 'INV-1002', customer: 'Jane Doe', address: '45 Sunset Boulevard', date: today, items: [{ type: 'Hardware', desc: 'Samsung 500GB SSD', unit: 1200, qty: 1 }, { type: 'Labor', desc: 'Data Cloning Service', unit: 450, qty: 1 }], amount: '1650.00', status: 'Unpaid' });

    // 6. POS Sales
    console.log("-> Seeding POS Sales...");
    await insertDoc('sales', 'REC-1001', { id: 'REC-1001', date: fourDaysAgo, total: '250.00', method: 'Card', user: 'admin', items: [{ name: 'Logitech M170 Wireless Mouse', price: '250.00', qty: 1 }]});
    await insertDoc('sales', 'REC-1002', { id: 'REC-1002', date: today, total: '150.00', method: 'Cash', user: 'admin', items: [{ name: 'Cat6 Network Cable 10m', price: '150.00', qty: 1 }]});

    // 7. Expenses
    console.log("-> Seeding Expenses...");
    await insertDoc('expenses', 'EXP-1001', { id: 'EXP-1001', date: fourDaysAgo, amount: '350.00', category: 'Fuel', description: 'Travel to Kempton Park Site' });
    await insertDoc('expenses', 'EXP-1002', { id: 'EXP-1002', date: today, amount: '120.00', category: 'Office Supplies', description: 'Receipt Paper Roles' });

    console.log("✅ FINISHED: Demo Data Successfully Flushed into Database!");
    process.exit(0);
}

seed();

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const collections = [
    { name: 'customers', count: 15 },
    { name: 'repairs', count: 12 },
    { name: 'invoices', count: 10 },
    { name: 'quotations', count: 8 },
    { name: 'inventory', count: 20 }
];

const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'Richard', 'Barbara', 'Joseph', 'Susan', 'Thomas'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];
const devices = ['iPhone 13 Pro', 'MacBook Air M2', 'Samsung S22 Ultra', 'Dell XPS 15', 'HP Pavilion', 'iPad Pro 11"', 'Lenovo ThinkPad', 'Asus ROG Strix', 'PlayStation 5', 'Nintendo Switch'];
const faults = ['Broken Screen', 'Battery not charging', 'Water damage', 'Keyboard keys sticking', 'Slow performance', 'OS Reinstall', 'Data recovery needed', 'Hinge broken', 'Overheating', 'No power'];
const statuses = ['Pending', 'In Progress', 'Awaiting Parts', 'Completed', 'Collected', 'Cancelled'];

const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomPrice = (min, max) => (Math.random() * (max - min) + min).toFixed(2);
const randomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];
};

db.serialize(() => {
    console.log("Starting data seeding...");

    // 1. Seed Customers
    const customerIds = [];
    for (let i = 0; i < 15; i++) {
        const id = 'cust-' + (1000 + i);
        const firstName = random(firstNames);
        const lastName = random(lastNames);
        const data = {
            name: `${firstName} ${lastName}`,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
            phone: `082 ${Math.floor(100+Math.random()*900)} ${Math.floor(1000+Math.random()*9000)}`,
            address: `${Math.floor(10+Math.random()*200)} ${random(['Main', 'Oak', 'Pine', 'Cedar'])} St, LTT`,
            type: random(['Individual', 'Business']),
            createdAt: new Date().toISOString()
        };
        db.run("INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'customers', ?, CURRENT_TIMESTAMP)", [id, JSON.stringify(data)]);
        customerIds.push({ id, ...data });
    }
    console.log(`- Seeded 15 customers`);

    // 2. Seed Inventory
    const inventoryItems = [];
    const categories = ['Hardware', 'Software', 'Accessories', 'Consumables'];
    for (let i = 0; i < 20; i++) {
        const id = 'inv-' + (5000 + i);
        const name = `${random(['Gigabyte', 'Crucial', 'Logitech', 'Western Digital'])} ${random(['Mouse', 'SSD 500GB', 'Keyboard', 'RAM 8GB', 'Monitor'])}`;
        const data = {
            name,
            sku: `SKU-${Math.floor(10000+Math.random()*90000)}`,
            category: random(categories),
            buyPrice: randomPrice(200, 1000),
            sellPrice: randomPrice(1200, 2500),
            stock: Math.floor(Math.random() * 50),
            minStock: 5,
            supplier: 'Tech Wholesale SA'
        };
        db.run("INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'inventory', ?, CURRENT_TIMESTAMP)", [id, JSON.stringify(data)]);
        inventoryItems.push({ id, ...data });
    }
    console.log(`- Seeded 20 inventory items`);

    // 3. Seed Repairs (Jobs)
    for (let i = 0; i < 12; i++) {
        const id = 'JOB-' + (2000 + i);
        const customer = random(customerIds);
        const data = {
            customerId: customer.id,
            customerName: customer.name,
            device: random(devices),
            faultDescription: random(faults),
            status: random(statuses),
            technician: 'Admin User',
            priority: random(['Normal', 'High', 'Urgent']),
            dateBooked: randomDate(new Date(2024, 0, 1), new Date()),
            accessories: 'Original Charger, Carry Case',
            devicePasscode: '1234',
            notes: i % 3 === 0 ? 'Customer says it happened after a power surge.' : ''
        };
        db.run("INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'repairs', ?, CURRENT_TIMESTAMP)", [id, JSON.stringify(data)]);
    }
    console.log(`- Seeded 12 repair jobs`);

    // 4. Seed Invoices
    for (let i = 0; i < 10; i++) {
        const id = 'INV-' + (8000 + i);
        const customer = random(customerIds);
        const items = [];
        let total = 0;
        const itemCount = 1 + Math.floor(Math.random() * 3);
        for(let j=0; j<itemCount; j++) {
            const item = random(inventoryItems);
            items.push({
                type: item.category,
                desc: item.name,
                unit: item.sellPrice,
                qty: 1
            });
            total += parseFloat(item.sellPrice);
        }
        const data = {
            customerId: customer.id,
            customer: customer.name,
            date: randomDate(new Date(2024, 0, 1), new Date()),
            status: random(['Paid', 'Unpaid', 'Overdue']),
            items: items,
            amount: 'R ' + total.toFixed(2),
            email: customer.email,
            phone: customer.phone,
            address: customer.address
        };
        db.run("INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'invoices', ?, CURRENT_TIMESTAMP)", [id, JSON.stringify(data)]);
    }
    console.log(`- Seeded 10 invoices`);

    // 5. Seed Quotations
    for (let i = 0; i < 8; i++) {
        const id = 'QUO-' + (9000 + i);
        const customer = random(customerIds);
        const items = [{
            type: 'Labour',
            desc: 'System Diagnosis and Cleanup',
            unit: '450.00',
            qty: 1
        }];
        const data = {
            customerId: customer.id,
            client: customer.name,
            date: randomDate(new Date(2024, 0, 1), new Date()),
            status: random(['Draft', 'Sent', 'Accepted', 'Rejected']),
            items: items,
            amount: 'R 450.00',
            email: customer.email,
            phone: customer.phone
        };
        db.run("INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES (?, 'quotations', ?, CURRENT_TIMESTAMP)", [id, JSON.stringify(data)]);
    }
    console.log(`- Seeded 8 quotations`);

    // 6. Update Counters
    const counters = {
        'JOB': 2012,
        'INV': 8010,
        'QUO': 9008,
        'cust': 1015,
        'inv': 5020
    };
    db.run("INSERT OR REPLACE INTO collections (id, name, data, updatedAt) VALUES ('counters', 'settings', ?, CURRENT_TIMESTAMP)", [JSON.stringify(counters)]);
    console.log(`- Updated system counters`);

    console.log("Seeding complete!");
    db.close();
});

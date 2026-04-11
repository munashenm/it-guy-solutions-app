const db = require('./database');
require('dotenv').config();

async function test() {
    try {
        console.log(`Starting Database Test (Type: ${process.env.DB_TYPE || 'sqlite'})...`);
        await db.init();
        
        const row = await db.get("SELECT COUNT(*) as count FROM users");
        console.log('--- SUCCESS ---');
        console.log('Connected successfully!');
        console.log('User count in database:', row.count);
        
        await db.close();
        console.log('Connection closed.');
        process.exit(0);
    } catch (err) {
        console.error('--- FAILURE ---');
        console.error('Database Error:', err.message);
        process.exit(1);
    }
}

test();

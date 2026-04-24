const db = require('./database');
require('dotenv').config();

async function scanDatabase() {
    console.log(`--- IT Guy Solutions: Database Integrity Scan ---`);
    console.log(`Database Type: ${process.env.DB_TYPE || 'sqlite'}`);
    
    try {
        await db.init();
        
        console.log("Fetching all records from 'collections' table...");
        const rows = await db.all("SELECT id, name, data FROM collections");
        
        console.log(`Total records found: ${rows.length}`);
        let invalidCount = 0;
        const issues = [];

        for (const row of rows) {
            try {
                if (!row.data || row.data.trim() === '') {
                    throw new Error("Data is empty or NULL");
                }
                JSON.parse(row.data);
            } catch (e) {
                invalidCount++;
                issues.push({
                    id: row.id,
                    collection: row.name,
                    error: e.message,
                    preview: row.data ? row.data.substring(0, 50) + "..." : "NULL"
                });
            }
        }

        if (invalidCount > 0) {
            console.error(`\n❌ FOUND ${invalidCount} INVALID RECORDS:`);
            console.table(issues);
            console.log("\nRecommendation: Manually inspect these records in phpMyAdmin/SQLite and fix or delete them.");
        } else {
            console.log("\n✅ All records contain valid JSON. Your database structure is clean.");
        }

        await db.close();
    } catch (err) {
        console.error("\nCritical Error during scan:", err.message);
    }
}

scanDatabase();

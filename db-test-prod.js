const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log("--- MySQL Connection Diagnostic ---");
    console.log(`Checking connection for user: ${process.env.DB_USER}`);
    console.log(`Target Database: ${process.env.DB_NAME}`);
    console.log(`Host: ${process.env.DB_HOST}`);

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log("✅ SUCCESS: Connected to MySQL successfully!");
        
        const [rows] = await connection.query('SELECT 1 + 1 AS solution');
        console.log("✅ SUCCESS: Query execution works (1 + 1 = " + rows[0].solution + ")");
        
        await connection.end();
        console.log("--- Diagnostic Complete ---");
        process.exit(0);
    } catch (err) {
        console.error("❌ FAILURE: Could not connect to the database.");
        console.error("Error Message:", err.message);
        console.error("Error Code:", err.code);
        
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log("\nTIP: This usually means the password or username in your .env file is wrong.");
        } else if (err.code === 'ENOTFOUND') {
            console.log("\nTIP: The host 'localhost' might not be correct for this server, though it is the default for cPanel.");
        }
        
        console.log("--- Diagnostic Complete ---");
        process.exit(1);
    }
}

testConnection();

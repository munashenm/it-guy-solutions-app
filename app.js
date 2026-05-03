// IT Guy Solutions - Extreme Compatibility Version (v2.8)
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

// 1. Emergency Error Logging
process.on('uncaughtException', (err) => {
    const msg = `[${new Date().toISOString()}] CRITICAL: ${err.message}\n${err.stack}\n`;
    try { fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), msg); } catch(e) {}
    console.error(msg);
    process.exit(1);
});

const app = express();

// 2. Core Middleware (Minimal)
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// 3. Status Heartbeat
let appDb = null;

app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        dbStatus: (appDb && appDb.pool) ? "Connected" : "Initializing",
        dbType: process.env.DB_TYPE || 'mysql',
        version: "2.9-Stable",
        timestamp: new Date().toISOString() 
    });
});

// 4. Load Routes Safely
try {
    appDb = require('./database');
    
    // Defer DB Init to let Passenger register the app as "Online" first
    if (appDb && typeof appDb.init === 'function') {
        setTimeout(() => {
            console.log("Deferred DB Init starting...");
            appDb.init().catch(e => console.error("Database Init Failed:", e));
        }, 2000);
    }

    const authRoutes = require('./routes/auth');
    const userRoutes = require('./routes/users');
    const collectionRoutes = require('./routes/collections');
    const systemRoutes = require('./routes/system');

    // Optional Security (Fail-safe)
    try { const cors = require('cors'); app.use(cors()); } catch(e) {}
    try { const helmet = require('helmet'); app.use(helmet()); } catch(e) {}

    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/collections', collectionRoutes);
    app.use('/api', systemRoutes);
} catch (err) {
    console.error("Route Loading Error:", err);
}

// 5. Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// 6. The "Zombie Process" Bypass
// By using port 0, Node will find any available port.
// Passenger will STILL intercept this call and route traffic perfectly.
// This permanently prevents the "EADDRINUSE" crash.
const port = process.env.PORT || 0; 
const server = app.listen(port, () => {
    console.log(`Server v2.8 running on port ${server.address().port}`);
});

module.exports = app;

// IT Guy Solutions - Extreme Compatibility Version (v2.7)
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
const port = process.env.PORT || 3000;

// 2. Core Middleware (Minimal)
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// 3. Status Heartbeat
app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        version: "2.7-Extreme",
        timestamp: new Date().toISOString() 
    });
});

// 4. Load Routes Safely
try {
    const db = require('./database');
    const authRoutes = require('./routes/auth');
    const userRoutes = require('./routes/users');
    const collectionRoutes = require('./routes/collections');
    const systemRoutes = require('./routes/system');

    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/collections', collectionRoutes);
    app.use('/api', systemRoutes);
    
    // Database Init Warning
    if (!db || !db.pool) console.warn("[DB] Pool not initialized yet.");
} catch (err) {
    console.error("Route Loading Error:", err);
}

// 5. Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// 6. Passenger vs Local Listener
if (process.env.PASSENGER_APP_ENV || process.env.PASSENGER_ENV || !process.env.PORT) {
    app.listen(); 
    console.log("Running in Passenger Mode (v2.7)");
} else {
    app.listen(port, () => {
        console.log(`Running in Local Mode on port ${port} (v2.7)`);
    });
}

module.exports = app;

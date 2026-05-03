// IT Guy Solutions - Permanent Stability Version (v4.1)
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const logFile = path.join(__dirname, 'startup_log.txt');
function diagLog(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(logFile, entry); } catch(e) {}
    console.log(entry);
}

process.on('uncaughtException', (err) => {
    diagLog(`!!! CRITICAL: ${err.message}`);
    try { fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), `${err.stack}\n`); } catch(e) {}
});

const app = express();

// 1. Core Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// 2. PRIMARY API ROUTES (Must be above static files)
let appDb = null;
try {
    appDb = require('./database');
    
    // Defer DB Init to satisfy Passenger
    setTimeout(() => {
        if (appDb && appDb.init) appDb.init().catch(e => diagLog("DB Init Error: " + e.message));
    }, 5000);

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/users', require('./routes/users'));
    app.use('/api/collections', require('./routes/collections'));
    app.use('/api', require('./routes/system'));
    diagLog("API Routes Registered Successfully.");
} catch (err) {
    diagLog("FATAL ROUTE ERROR: " + err.message);
}

app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        dbStatus: (appDb && appDb.pool) ? "Connected" : "Initializing",
        version: "4.1-Final",
        timestamp: new Date().toISOString() 
    });
});

// 3. STATIC FILES (Below API)
app.use(express.static(path.join(__dirname)));

// 4. Global Error Handler
app.use((err, req, res, next) => {
    diagLog(`Error: ${err.message}`);
    res.status(500).json({ error: 'Server Error', details: err.message });
});

const port = process.env.PORT || 0; 
const server = app.listen(port, () => {
    diagLog(`SYSTEM ONLINE on port ${server.address().port}`);
});

module.exports = app;

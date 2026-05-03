// IT Guy Solutions - Diagnostic Version (v3.0)
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const logFile = path.join(__dirname, 'startup_log.txt');
function diagLog(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(entry);
}

// Clear old log
try { fs.writeFileSync(logFile, "--- STARTUP DIARY ---\n"); } catch(e) {}

diagLog("Step 1: Core modules loaded.");

process.on('uncaughtException', (err) => {
    const msg = `[${new Date().toISOString()}] CRITICAL ERROR: ${err.message}\n${err.stack}\n`;
    try { fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), msg); } catch(e) {}
    diagLog("FATAL CRASH: " + err.message);
    process.exit(1);
});

const app = express();
diagLog("Step 2: Express initialized.");

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));
diagLog("Step 3: Middleware applied.");

let appDb = null;
app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        dbStatus: (appDb && appDb.pool) ? "Connected" : "Initializing",
        version: "3.0-Diag",
        timestamp: new Date().toISOString() 
    });
});

try {
    diagLog("Step 4: Requiring database.js...");
    appDb = require('./database');
    diagLog("Step 5: database.js loaded.");
    
    setTimeout(() => {
        diagLog("Step 10: Deferred DB Init starting...");
        if (appDb && appDb.init) appDb.init().catch(e => diagLog("DB Init Error: " + e.message));
    }, 5000);

    diagLog("Step 6: Loading Auth routes...");
    app.use('/api/auth', require('./routes/auth'));
    
    diagLog("Step 7: Loading User routes...");
    app.use('/api/users', require('./routes/users'));
    
    diagLog("Step 8: Loading Collection routes...");
    app.use('/api/collections', require('./routes/collections'));
    
    diagLog("Step 9: Loading System routes...");
    app.use('/api', require('./routes/system'));

} catch (err) {
    diagLog("ROUTE LOADING ERROR: " + err.message);
}

const port = process.env.PORT || 0; 
const server = app.listen(port, () => {
    diagLog(`Step 11: Server listening on port ${server.address().port}`);
});

module.exports = app;

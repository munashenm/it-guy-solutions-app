// IT Guy Solutions - Permanent Stability Version (v4.0)
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

// 1. Recovery Shield: Catch every possible error
process.on('uncaughtException', (err) => {
    diagLog(`!!! CRITICAL UNCAUGHT EXCEPTION: ${err.message}`);
    try { fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), `[${new Date().toISOString()}] ${err.stack}\n`); } catch(e) {}
});

process.on('unhandledRejection', (reason, promise) => {
    diagLog(`!!! UNHANDLED REJECTION: ${reason}`);
});

const app = express();

// 2. Black Box Recorder: Log every incoming request
app.use((req, res, next) => {
    diagLog(`${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

let appDb = null;
app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        dbStatus: (appDb && appDb.pool) ? "Connected" : "Initializing",
        version: "4.0-Permanent",
        timestamp: new Date().toISOString() 
    });
});

// 3. Robust Route Loading
try {
    appDb = require('./database');
    
    // Safety Delay for Passenger
    setTimeout(() => {
        diagLog("Connecting to Database...");
        if (appDb && appDb.init) appDb.init().catch(e => diagLog("DB Init Error: " + e.message));
    }, 5000);

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/users', require('./routes/users'));
    app.use('/api/collections', require('./routes/collections'));
    app.use('/api', require('./routes/system'));

} catch (err) {
    diagLog("FATAL STARTUP ERROR: " + err.message);
}

// 4. Force JSON Error Responses (Stop HTML leaks)
app.use((err, req, res, next) => {
    diagLog(`Error on ${req.url}: ${err.message}`);
    res.status(500).json({ error: 'Server Internal Error', message: err.message });
});

const port = process.env.PORT || 0; 
const server = app.listen(port, () => {
    diagLog(`SYSTEM ONLINE - Listening on port ${server.address().port}`);
});

module.exports = app;

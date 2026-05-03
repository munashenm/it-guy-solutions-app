// IT Guy Solutions - Stable Version (v3.1)
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

process.on('uncaughtException', (err) => {
    const msg = `[${new Date().toISOString()}] CRITICAL: ${err.message}\n${err.stack}\n`;
    try { fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), msg); } catch(e) {}
    process.exit(1);
});

const app = express();

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

let appDb = null;
app.get('/api/status', (req, res) => {
    res.json({ 
        status: "online", 
        dbStatus: (appDb && appDb.pool) ? "Connected" : "Initializing",
        version: "3.1-Final",
        timestamp: new Date().toISOString() 
    });
});

try {
    appDb = require('./database');
    
    // Immediate Init (Non-blocking)
    if (appDb && appDb.init) {
        appDb.init().catch(e => console.error("DB Init Error:", e));
    }

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/users', require('./routes/users'));
    app.use('/api/collections', require('./routes/collections'));
    app.use('/api', require('./routes/system'));

} catch (err) {
    console.error("Startup Error:", err);
}

// Global Error Handler (Returns JSON, not HTML)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Server Error', 
        message: err.message 
    });
});

const port = process.env.PORT || 0; 
app.listen(port);

module.exports = app;

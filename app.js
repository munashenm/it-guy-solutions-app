// IT Guy Solutions - Stability Version (v4.6)
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const logFile = path.join(__dirname, 'startup_log.txt');
function diagLog(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(logFile, entry); } catch (e) {}
    console.log(entry.trim());
}

process.on('uncaughtException', (err) => {
    diagLog(`!!! CRITICAL: ${err.message}`);
    try { fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), `${err.stack}\n`); } catch (e) {}
});

process.on('unhandledRejection', (reason) => {
    const msg = reason && reason.message ? reason.message : String(reason);
    diagLog(`Unhandled rejection: ${msg}`);
});

const app = express();
app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

let appDb = null;
try {
    appDb = require('./database');

    const authRoutes = require('./routes/auth');
    app.use('/api', authRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/users', require('./routes/users'));
    app.use('/api/collections', require('./routes/collections'));
    app.use('/api', require('./routes/system'));
    diagLog('API Routes Registered Successfully.');
} catch (err) {
    diagLog('FATAL ROUTE ERROR: ' + err.message);
}

app.get('/api/status', (req, res) => {
    const dbReady = !!(appDb && appDb.ready);
    res.json({
        status: 'online',
        dbStatus: dbReady ? 'Connected' : 'Initializing',
        dbType: (appDb && appDb.type) || process.env.DB_TYPE || 'sqlite',
        version: '4.6',
        timestamp: new Date().toISOString()
    });
});

const blockedExact = new Set([
    '/.env', '/.env.production', '/.env.example', '/package.json', '/package-lock.json',
    '/database.sqlite', '/app.js', '/database.js', '/seed.js', '/mailer.js'
]);
const blockedPrefixes = ['/node_modules', '/routes/', '/middleware/', '/services/', '/utils/', '/.git'];
app.use((req, res, next) => {
    const p = (req.path || '').toLowerCase();
    if (blockedExact.has(p) || blockedPrefixes.some((prefix) => p === prefix || p.startsWith(prefix))) {
        return res.status(404).end();
    }
    if (p.endsWith('.sqlite') || p.endsWith('.sql') || p.endsWith('.env')) {
        return res.status(404).end();
    }
    next();
});

app.use(express.static(path.join(__dirname)));

app.use((err, req, res, next) => {
    diagLog(`Error: ${err.message}`);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Server Error', details: err.message });
});

function startListening() {
    if (app._httpServer) return;

    try {
        if (typeof PhusionPassenger !== 'undefined') {
            PhusionPassenger.configure({ autoInstall: false });
            app._httpServer = app.listen('passenger', () => {
                diagLog('SYSTEM ONLINE (Passenger)');
            });
        } else {
            const port = process.env.PORT || 3000;
            app._httpServer = app.listen(port, () => {
                const addr = app._httpServer.address();
                diagLog(`SYSTEM ONLINE on port ${addr && addr.port ? addr.port : port}`);
            });
        }

        app._httpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                diagLog(`Port already in use (${err.message}). Host/Passenger owns the listener.`);
                return;
            }
            diagLog(`Listen error: ${err.message}`);
        });
    } catch (e) {
        diagLog('Listen exception: ' + e.message);
    }
}

// Bind immediately so Passenger does not time out; DB init continues in the background.
startListening();
if (appDb && appDb.init) {
    appDb.init().catch((e) => diagLog('DB Init Error: ' + e.message));
}

module.exports = app;

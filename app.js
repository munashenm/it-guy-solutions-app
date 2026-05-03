// 1. ABSOLUTE TOP: Core dependencies & Emergency Logging
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', (err) => {
    try {
        const msg = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n`;
        fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), msg);
    } catch (e) {}
    process.exit(1);
});

// 2. Safe Environment Initialization
try {
    require('dotenv').config();
} catch (e) {
    console.warn("Resilience: .env loading skipped");
}

try {
    const express = require('express');
    const bodyParser = require('body-parser');

    // Resilience Layer: Load optional security modules safely
    let helmet, cors, rateLimit;
    try { helmet = require('helmet'); } catch(e) { console.warn("Resilience: helmet missing"); }
    try { cors = require('cors'); } catch(e) { console.warn("Resilience: cors missing"); }
    try { rateLimit = require('express-rate-limit'); } catch(e) { console.warn("Resilience: rateLimit missing"); }

    const db = require('./database');
    const logger = require('./utils/logger');
    const errorHandler = require('./middleware/errorHandler');

    // Global Unhandled Rejection Handler
    process.on('unhandledRejection', (reason, promise) => {
        if (logger && logger.error) logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        else console.error('Unhandled Rejection:', reason);
    });

    // Route Imports
    const authRoutes = require('./routes/auth');
    const userRoutes = require('./routes/users');
    const collectionRoutes = require('./routes/collections');
    const systemRoutes = require('./routes/system');

    const app = express();
    const port = process.env.PORT || 3000;

    // 1. Logging and Status (Highest Priority)
    app.use('/api/status', (req, res) => {
        // Return simple online status. The Dashboard will do its own deep check.
        res.json({ 
            status: "online", 
            dbStatus: (db && db.pool) ? "Connected" : "Initializing",
            timestamp: new Date().toISOString(), 
            message: "Heartbeat check passed." 
        });
    });

    if (logger && logger.info) logger.info('Boot: Initializing Middleware...');

    // Security Middleware
    if (helmet) {
        app.use(helmet({ contentSecurityPolicy: false }));
    }
    if (cors) {
        app.use(cors()); 
    }
    app.set('trust proxy', 1);

    // Rate Limiting
    if (rateLimit) {
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 1000, 
            message: { error: "Too many requests from this IP" }
        });
        app.use('/api', limiter);
    }

    // Optimized memory for shared hosting
    app.use(bodyParser.json({ limit: '10mb' })); 

    // 2. Database Initialization (Resilient Pattern)
    if (logger && logger.info) logger.info('Boot: Connecting to Database...');
    
    // We don't await this so the server can start even if DB is slow
    db.init().then(() => {
        if (logger && logger.info) logger.info('Boot: Database Connection Established');
    }).catch(err => {
        if (logger && logger.error) logger.error('Boot: Critical Database Error', { error: err.message });
        // Don't exit, allow /api/status to still report the error
    });

    // 3. API Routes
    if (logger && logger.info) logger.info('Boot: Registering Routes...');
    app.use('/api', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/collections', collectionRoutes);
    app.use('/api', systemRoutes);

    app.use(express.static(path.resolve(__dirname, '.')));

    app.all('/api/*', (req, res) => {
        res.status(404).json({ error: "Not Found" });
    });

    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'index.html'));
    });

    app.use(errorHandler);

    // Passenger / Production Safe Listener
    if (process.env.PASSENGER_APP_ENV) {
        // Under Passenger, we don't always need to call listen(), 
        // but if we do, it handles the port for us.
        app.listen();
        if (logger && logger.info) logger.info('Server running under Phusion Passenger');
    } else {
        const server = app.listen(port, () => {
            console.log(`Server running on port ${port} in ${process.env.NODE_ENV || 'production'} mode`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[PORT_BUSY] Port ${port} is already in use. Local development may require a different port.`);
            } else {
                throw err;
            }
        });
    }

    // Export for Passenger if needed
    module.exports = app;

} catch (err) {
    const msg = `[${new Date().toISOString()}] CRITICAL STARTUP ERROR: ${err.message}\n${err.stack}\n`;
    try {
        fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), msg);
    } catch(e) {}
    console.error(msg);
    process.exit(1);
}

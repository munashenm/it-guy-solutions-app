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
            max: 1000, // Increased for sync intensity
            message: { error: "Too many requests from this IP, please try again after 15 minutes" }
        });
        app.use('/api', limiter);
    }

    app.use(bodyParser.json({ limit: '50mb' }));

    // Prevent API caching globally
    app.use('/api', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    });

    // Database Initialization
    db.init().then(async () => {
        if (logger && logger.info) logger.info('Database System Ready');
        
        if (process.env.DB_TYPE !== 'mysql') {
            try {
                const { startBackupService } = require('./services/backupService');
                startBackupService();
            } catch(e) {}
        }
    }).catch(err => {
        if (logger && logger.error) logger.error('Critical Database Error', { error: err.message });
    });

    // API Routes
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
    const server = app.listen(port, () => {
        console.log(`Server running on port ${port} in ${process.env.NODE_ENV || 'production'} mode`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[PORT_BUSY] Port ${port} is already in use. Passenger may be managing this process.`);
        } else {
            throw err;
        }
    });

} catch (err) {
    const msg = `[${new Date().toISOString()}] CRITICAL STARTUP ERROR: ${err.message}\n${err.stack}\n`;
    try {
        fs.appendFileSync(path.join(__dirname, 'emergency_error.txt'), msg);
    } catch(e) {}
    console.error(msg);
    process.exit(1);
}

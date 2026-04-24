const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Route Imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const collectionRoutes = require('./routes/collections');
const systemRoutes = require('./routes/system');

const app = express();
const port = process.env.PORT || 3000;

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for simplicity in SPA setup, can be hardened later
}));
app.use(cors()); // CORS is handled but can be restricted to specific domains in production
app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: { error: "Too many requests from this IP, please try again after 15 minutes" }
});
app.use('/api', limiter);

app.use(bodyParser.json({ limit: '50mb' }));

// Prevent API caching globally
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Request Logging
app.use('/api', (req, res, next) => {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
    next();
});

// Database Initialization & Schema Setup
db.init().then(async () => {
    logger.info('Database System Ready', { 
        type: process.env.DB_TYPE || 'sqlite',
        nodeEnv: process.env.NODE_ENV || 'production'
    });
    
    // Auto-backup for SQLite (moved to its own service if needed, but keeping logic here for now)
    if (process.env.DB_TYPE !== 'mysql') {
        const { startBackupService } = require('./services/backupService');
        startBackupService();
    }

}).catch(err => {
    logger.error('Critical Database Error', { error: err.message });
});

// API Routes
app.use('/api', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api', systemRoutes);

// Static files are registered AFTER /api routes
// This ensures that /api calls are handled by Express and not matched by static files
app.use(express.static(path.resolve(__dirname, '../')));

// Catch-All for missing API routes
app.all('/api/*', (req, res) => {
    res.status(404).json({ 
        error: "Not Found", 
        message: `The requested API endpoint ${req.method} ${req.path} does not exist.` 
    });
});

// SPA Routing: Serve index.html for any non-API route
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../index.html'));
});

// Centralized Error Handler
app.use(errorHandler);

app.listen(port, () => {
    logger.info(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
});

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error(`${err.name}: ${err.message}`, {
        method: req.method,
        url: req.url,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.status || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({
        error: message,
        status: status,
        timestamp: new Date().toISOString()
    });
};

module.exports = errorHandler;

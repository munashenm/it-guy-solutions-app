const fs = require('fs');
const path = require('path');

const logDir = path.resolve(__dirname, '../logs');
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (e) {
    console.warn(`Logger: Could not create log directory. ${e.message}`);
}


const logger = {
    info: (message, meta = {}) => log('info', message, meta),
    warn: (message, meta = {}) => log('warn', message, meta),
    error: (message, meta = {}) => log('error', message, meta),
    debug: (message, meta = {}) => log('debug', message, meta)
};

function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...meta };
    
    // Console output
    const consoleMsg = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (level === 'error') console.error(consoleMsg, meta);
    else console.log(consoleMsg, Object.keys(meta).length ? meta : '');

    // File output
    try {
        const date = timestamp.split('T')[0];
        const logFile = path.join(logDir, `${date}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (e) {
        console.error("Failed to write to log file:", e.message);
    }
}

module.exports = logger;

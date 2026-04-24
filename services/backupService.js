const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const backupDir = path.resolve(__dirname, '../backups');

try {
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
} catch (e) {
    console.warn(`Backup Service: Could not create backup directory. ${e.message}`);
}


function automatedDailyBackup() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const backupFile = path.join(backupDir, `db_backup_${today}.sqlite`);
        
        // Prevent duplicate backups on the same day if the server restarts multiple times
        if (!fs.existsSync(backupFile)) {
            if (fs.existsSync(dbPath)) {
                fs.copyFileSync(dbPath, backupFile);
                logger.info(`Automated daily backup created successfully at ${backupFile}`);
            }
        }
        
        // Cleanup backups older than 7 days
        const files = fs.readdirSync(backupDir);
        files.forEach(file => {
            if(file.endsWith('.sqlite')) {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                const daysOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                if(daysOld > 7) {
                    fs.unlinkSync(filePath);
                    logger.info(`Deleted old automated backup: ${file}`);
                }
            }
        });
    } catch(e) {
        logger.error('Automated backup failed', { error: e.message });
    }
}

function startBackupService() {
    // Run immediately on server start, and then every 12 hours
    automatedDailyBackup();
    setInterval(automatedDailyBackup, 12 * 60 * 60 * 1000);
}

module.exports = { startBackupService };

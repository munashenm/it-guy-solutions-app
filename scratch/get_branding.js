const db = require('../database');
db.init().then(async () => {
    try {
        const row = await db.get("SELECT data FROM collections WHERE name = 'settings' AND id = 'companyProfile'");
        console.log(row ? row.data : 'No settings found');
    } catch (e) {
        console.error(e);
    }
    process.exit();
});

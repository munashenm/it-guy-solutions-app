const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    const diagnostics = {
        status: "Diagnostic Mode",
        nodeVersion: process.version,
        cwd: process.cwd(),
        dirname: __dirname,
        envFileExists: fs.existsSync(path.join(__dirname, '.env')),
        packageJsonExists: fs.existsSync(path.join(__dirname, 'package.json')),
        nodeModulesExists: fs.existsSync(path.join(__dirname, 'node_modules')),
        timestamp: new Date().toISOString()
    };
    
    res.end(JSON.stringify(diagnostics, null, 4));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Diagnostic server running on port ${PORT}`);
});

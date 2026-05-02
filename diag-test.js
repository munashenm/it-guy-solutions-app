const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('✅ NODE.JS IS WORKING ON CPANEL!\n\nIf you see this, the server engine is healthy.\nThe problem is likely in the app.js code or database connection.');
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Diagnostic server running on port ${port}`);
});

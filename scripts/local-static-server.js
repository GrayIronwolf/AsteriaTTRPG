const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8123);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const compendiumAppRoutes = ['flora', 'fauna', 'minerals', 'materials', 'potions', 'weapons', 'armor', 'artifacts'];

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(root, clean);
  return target.startsWith(root) ? target : null;
}

function isAppRoute(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]).replace(/^\/+/, '');
  return compendiumAppRoutes.some(route => clean === route || clean.startsWith(`${route}/`));
}

function sendIndex(res) {
  const indexPath = path.join(root, 'index.html');
  fs.readFile(indexPath, (readError, data) => {
    if (readError) return send(res, 404, 'Not found');
    send(res, 200, data, types['.html']);
  });
}

http.createServer((req, res) => {
  const target = safePath(req.url || '/');
  if (!target) return send(res, 403, 'Forbidden');

  fs.stat(target, (statError, stat) => {
    if (statError) {
      if (isAppRoute(req.url || '/')) return sendIndex(res);
      return send(res, 404, 'Not found');
    }
    const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
    fs.readFile(file, (readError, data) => {
      if (readError) return send(res, 404, 'Not found');
      send(res, 200, data, types[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Asteria static server running at http://127.0.0.1:${port}/`);
});

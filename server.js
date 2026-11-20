import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const handler = async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(join(root, path || 'index.html'));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
};
const port = Number(process.env.PORT || 8443);
const { TLS_KEY, TLS_CERT } = process.env;
if (Boolean(TLS_KEY) !== Boolean(TLS_CERT)) throw new Error('Set both TLS_KEY and TLS_CERT');
const server = TLS_KEY ? httpsServer({ key: await readFile(TLS_KEY), cert: await readFile(TLS_CERT) }, handler) : httpServer(handler);
server.listen(port, '0.0.0.0', () => console.log(`${TLS_KEY ? 'HTTPS' : 'HTTP'} listening on port ${port}`));

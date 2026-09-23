import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

const LISTEN = Number(process.env.AUTH_PORT || 5180);
const TARGET = process.env.TARGET_URL || 'http://127.0.0.1:5173';
const USER = process.env.AUTH_USER || 'koen';
const PASS = process.env.AUTH_PASS || '';
const REALM = 'BIOBUZZ MuJoCo';

function okAuth(header) {
  if (!header?.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const u = decoded.slice(0, i);
  const p = decoded.slice(i + 1);
  const a = Buffer.from(u);
  const b = Buffer.from(USER);
  const c = Buffer.from(p);
  const d = Buffer.from(PASS);
  if (a.length !== b.length || c.length !== d.length) return false;
  return timingSafeEqual(a, b) && timingSafeEqual(c, d);
}

function unauthorized(res) {
  res.writeHead(401, {
    'WWW-Authenticate': `Basic realm="${REALM}"`,
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Login vereist');
}

const server = http.createServer(async (req, res) => {
  if (!okAuth(req.headers.authorization)) {
    unauthorized(res);
    return;
  }
  try {
    const url = new URL(req.url || '/', TARGET);
    const headers = { ...req.headers, host: new URL(TARGET).host };
    delete headers['authorization'];
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : req,
      duplex: 'half',
      redirect: 'manual',
    });
    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (k === 'transfer-encoding') return;
      outHeaders[k] = v;
    });
    res.writeHead(upstream.status, outHeaders);
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Upstream error: ' + (err?.message || err));
  }
});

server.listen(LISTEN, '0.0.0.0', () => {
  console.log(`auth-proxy listening on :${LISTEN} -> ${TARGET} user=${USER}`);
});

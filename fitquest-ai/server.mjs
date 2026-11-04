// Production server for Render (Node Web Service) — no extra dependencies.
//   • serves the built game from dist/ (SPA fallback to index.html)
//   • POST /api/heartrate  ← ESP32 band          (optional Bearer DEVICE_API_KEY)
//   • GET  /api/heartrate  → web app (latest reading per device, kept in memory)
//
// Render: Build Command `npm install && npm run build`, Start Command `npm start`.
// A Render web service is one long-running process, so the latest reading can live in memory.
// (On Vercel use api/heartrate.ts instead.)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const PORT = Number(process.env.PORT) || 10000;
const DIST = resolve('dist');
const API_KEY = process.env.DEVICE_API_KEY || '';
const ONLINE_WINDOW_MS = 15_000; // no data for 15 s = band offline
const DEVICE_RE = /^[\w-]{1,64}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

// ── Heart-rate store ───────────────────────────────────────
const latest = new Map(); // device -> { bpm, finger, battery, rssi, at }

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => resolveBody(raw));
    req.on('error', reject);
  });
}

async function handleHeartRate(req, res, url) {
  if (req.method === 'POST') {
    if (API_KEY && req.headers.authorization !== `Bearer ${API_KEY}`) return sendJson(res, 401, { error: 'unauthorized' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'invalid json' }); }
    const device = typeof body?.device === 'string' ? body.device : '';
    if (!DEVICE_RE.test(device)) return sendJson(res, 400, { error: 'invalid device' });
    latest.set(device, {
      bpm: num(body.bpm, 30, 220), // null = not measured yet
      finger: body.finger === true,
      battery: num(body.battery, 0, 100),
      rssi: num(body.rssi, -120, 0),
      at: Date.now(),
    });
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'GET') {
    const device = url.searchParams.get('device') ?? 'fitquest-band-01';
    if (!DEVICE_RE.test(device)) return sendJson(res, 400, { error: 'invalid device' });
    const d = latest.get(device);
    return sendJson(res, 200, d ? { ...d, online: Date.now() - d.at < ONLINE_WINDOW_MS } : { online: false });
  }
  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'method not allowed' });
}

// ── Static files ───────────────────────────────────────────
const gzipCache = new Map(); // path -> gzipped Buffer (dist never changes while running)

async function serveFile(req, res, filePath) {
  const ext = extname(filePath).toLowerCase();
  let data = await readFile(filePath);
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // Vite fingerprints everything under /assets/, so it can be cached forever; index.html must not be.
    'Cache-Control': filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    let gz = gzipCache.get(filePath);
    if (!gz) { gz = gzipSync(data); gzipCache.set(filePath, gz); }
    data = gz;
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = data.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function handleStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  const target = normalize(join(DIST, rel));
  if (target !== DIST && !target.startsWith(DIST + sep)) { res.writeHead(403); return res.end(); } // path traversal guard
  try {
    const s = await stat(target);
    if (s.isFile()) return await serveFile(req, res, target);
  } catch { /* fall through to SPA fallback */ }
  if (extname(rel)) { res.writeHead(404); return res.end('Not found'); } // missing asset: real 404
  return serveFile(req, res, join(DIST, 'index.html'));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/heartrate') return await handleHeartRate(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return await handleStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, '0.0.0.0', () => console.log(`FitQuest server listening on :${PORT} (api key ${API_KEY ? 'required' : 'NOT set'})`));

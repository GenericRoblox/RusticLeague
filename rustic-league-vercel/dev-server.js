// Local test server: serves index.html and an in-memory version of /api/lobby (no Redis needed). Run: node dev-server.js
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const rooms = new Map(), boxes = new Map();
http.createServer((req, res) => {
  const u = url.parse(req.url, true); const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/lobby') { let b = ''; req.on('data', d => b += d); req.on('end', () => { const body = b ? JSON.parse(b) : {}; const a = u.query.a; const now = Date.now();
    for (const [k, r] of rooms) if (now - r.t > 20000) rooms.delete(k);
    if (a === 'ping') return send(200, { ok: true });
    if (a === 'list') return send(200, { rooms: [...rooms.values()].filter(r => now - r.t < 14000) });
    if (a === 'room') return send(200, { room: rooms.get(String(u.query.code).toUpperCase()) || null });
    if (a === 'host') { const code = Math.random().toString(36).slice(2, 7).toUpperCase(); rooms.set(code, { ...(body.info || {}), code, t: now }); return send(200, { code }); }
    if (a === 'beat') { rooms.set(body.code, { ...(body.info || {}), code: body.code, t: now }); return send(200, { ok: true }); }
    if (a === 'close') { rooms.delete(body.code); return send(200, { ok: true }); }
    if (a === 'send') { const k = body.code + ':' + body.to; if (!boxes.has(k)) boxes.set(k, []); boxes.get(k).push(body.msg); return send(200, { ok: true }); }
    if (a === 'recv') { const k = u.query.code + ':' + u.query.me; const m = boxes.get(k) || []; boxes.set(k, []); return send(200, { msgs: m }); }
    send(400, { error: 'unknown' }); }); return; }
  let f = u.pathname === '/' ? '/index.html' : u.pathname; f = path.join(__dirname, f);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(d); });
}).listen(process.env.PORT || 8790, () => console.log('Rustic League dev server on http://localhost:' + (process.env.PORT || 8790)));

// Rustic League LAN matchmaking + WebRTC signalling, as one Vercel serverless function backed by Redis.
// Works with whatever the Vercel Marketplace provides:
//   * Upstash REST: UPSTASH_REDIS_REST_URL/_TOKEN or KV_REST_API_URL/_TOKEN (also with a custom prefix, e.g. STORAGE_KV_REST_API_URL)
//   * Any Redis over TCP: REDIS_URL / KV_URL (e.g. the "Redis" integration), via the `redis` package
// Visit /api/lobby?a=diag to see which settings the function can see (names only, never values).
const crypto = require('crypto');
function findEnv() {
  const e = process.env, keys = Object.keys(e);
  const pick = names => { for (const n of names) { const k = keys.find(x => x === n && e[x]) || keys.find(x => x.endsWith('_' + n) && e[x]); if (k) return k; } return null; };
  return { restUrl: pick(['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL']), restToken: pick(['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN']), tcp: pick(['REDIS_URL', 'KV_URL', 'UPSTASH_REDIS_URL']) };
}
const ENV = findEnv();
const MODE = ENV.restUrl && ENV.restToken ? 'rest' : ENV.tcp ? 'tcp' : null;
let tcpClient = null;
async function tcp() {
  if (tcpClient && tcpClient.isOpen) return tcpClient;
  const { createClient } = require('redis');
  tcpClient = createClient({ url: process.env[ENV.tcp], socket: { connectTimeout: 4000, reconnectStrategy: false } }); tcpClient.on('error', () => {});
  await Promise.race([tcpClient.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error('Redis connection timed out')), 5000))]); return tcpClient;
}
async function redis(cmds) { // run several commands, return their results in order
  if (MODE === 'rest') {
    const r = await fetch(process.env[ENV.restUrl].replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env[ENV.restToken], 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error('Redis REST ' + r.status + ' ' + (await r.text()).slice(0, 120)); return (await r.json()).map(x => x.result);
  }
  const c = await tcp(); const out = []; for (const cmd of cmds) out.push(await c.sendCommand(cmd.map(String))); return out;
}
const netKey = req => { const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return 'lan:' + crypto.createHash('sha1').update(ip + '|rustic').digest('hex').slice(0, 16); };
const code5 = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
const clean = s => String(s || '').slice(0, 40);
const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; } };
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const a = req.query.a; let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } } if (!body || typeof body !== 'object') body = {};
  if (a === 'diag') { // safe troubleshooting: variable NAMES only
    const names = Object.keys(process.env).filter(k => /REDIS|KV_|UPSTASH/i.test(k)).sort();
    let ping = 'not tried'; if (MODE) { try { ping = String((await redis([['PING']]))[0]); } catch (e) { ping = 'failed: ' + e.message; } }
    return res.json({ deployment: process.env.VERCEL_ENV || 'unknown', mode: MODE || 'none', using: ENV, redisVariableNamesVisible: names, ping });
  }
  if (!MODE) return res.status(503).json({ error: 'Matchmaking is not configured: no Redis settings are visible to this deployment. Connect Upstash Redis to this project, then redeploy. Details: /api/lobby?a=diag' });
  try {
    if (a === 'ping') return res.json({ ok: true, mode: MODE });
    if (a === 'list') { // rooms hosted from the same public IP (i.e. the same LAN)
      const [codes] = await redis([['SMEMBERS', netKey(req)]]); if (!codes || !codes.length) return res.json({ rooms: [] });
      const vals = (await redis([['MGET', ...codes.map(c => 'room:' + c)]]))[0] || [];
      const now = Date.now(); return res.json({ rooms: vals.map(parse).filter(r => r && now - (r.t || 0) < 14000) }); // hide hosts that stopped checking in
    }
    if (a === 'room') { const [v] = await redis([['GET', 'room:' + clean(req.query.code).toUpperCase()]]); return res.json({ room: v ? parse(v) : null }); }
    if (a === 'host') {
      for (let k = 0; k < 6; k++) { const code = code5(); const info = { ...(body.info || {}), code, t: Date.now() };
        const [ok] = await redis([['SET', 'room:' + code, JSON.stringify(info), 'EX', '20', 'NX']]);
        if (ok === 'OK') { const nk = netKey(req); await redis([['SADD', nk, code], ['EXPIRE', nk, '600']]); return res.json({ code }); } }
      return res.status(500).json({ error: 'no free code' });
    }
    if (a === 'beat') { const code = clean(body.code); const nk = netKey(req);
      const [closed] = await redis([['GET', 'closed:' + code]]); if (closed) return res.json({ ok: false, closed: true }); // a late heartbeat must never revive a closed room
      await redis([['SET', 'room:' + code, JSON.stringify({ ...(body.info || {}), code, t: Date.now() }), 'EX', '20'], ['SADD', nk, code], ['EXPIRE', nk, '600']]); return res.json({ ok: true }); }
    if (a === 'close') { const code = clean(body.code); await redis([['SET', 'closed:' + code, '1', 'EX', '300'], ['DEL', 'room:' + code], ['SREM', netKey(req), code]]); return res.json({ ok: true }); }
    if (a === 'send') { const k = 'sig:' + clean(body.code) + ':' + clean(body.to); await redis([['RPUSH', k, JSON.stringify(body.msg || {})], ['EXPIRE', k, '120']]); return res.json({ ok: true }); }
    if (a === 'recv') { const [msgs] = await redis([['LPOP', 'sig:' + clean(req.query.code) + ':' + clean(req.query.me), '50']]); return res.json({ msgs: (msgs || []).map(parse).filter(Boolean) }); }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};

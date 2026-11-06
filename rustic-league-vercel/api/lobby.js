// Rustic League LAN matchmaking + WebRTC signalling, as one Vercel serverless function backed by Upstash Redis (REST).
// Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN from the Vercel Marketplace).
const crypto = require('crypto');
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
async function redis(cmds) { // pipeline: [[cmd...], ...] -> results[]
  const r = await fetch(URL_ + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('redis ' + r.status); return (await r.json()).map(x => x.result);
}
const netKey = req => { const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return 'lan:' + crypto.createHash('sha1').update(ip + '|rustic').digest('hex').slice(0, 16); };
const code5 = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
const clean = s => String(s || '').slice(0, 40);
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'Matchmaking is not configured: add Upstash Redis to this Vercel project.' });
  const a = req.query.a; const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (a === 'ping') return res.json({ ok: true });
    if (a === 'list') { // rooms hosted from the same public IP (i.e. the same LAN)
      const [codes] = await redis([['SMEMBERS', netKey(req)]]); if (!codes || !codes.length) return res.json({ rooms: [] });
      const vals = (await redis([['MGET', ...codes.map(c => 'room:' + c)]]))[0] || [];
      return res.json({ rooms: vals.map(v => v && JSON.parse(v)).filter(Boolean) });
    }
    if (a === 'room') { const [v] = await redis([['GET', 'room:' + clean(req.query.code).toUpperCase()]]); return res.json({ room: v ? JSON.parse(v) : null }); }
    if (a === 'host') {
      for (let k = 0; k < 6; k++) { const code = code5(); const info = { ...(body.info || {}), code, t: Date.now() };
        const [ok] = await redis([['SET', 'room:' + code, JSON.stringify(info), 'EX', '35', 'NX']]);
        if (ok === 'OK') { const nk = netKey(req); await redis([['SADD', nk, code], ['EXPIRE', nk, '600']]); return res.json({ code }); } }
      return res.status(500).json({ error: 'no free code' });
    }
    if (a === 'beat') { const code = clean(body.code); const nk = netKey(req);
      await redis([['SET', 'room:' + code, JSON.stringify({ ...(body.info || {}), code, t: Date.now() }), 'EX', '35'], ['SADD', nk, code], ['EXPIRE', nk, '600']]); return res.json({ ok: true }); }
    if (a === 'close') { const code = clean(body.code); await redis([['DEL', 'room:' + code], ['SREM', netKey(req), code]]); return res.json({ ok: true }); }
    if (a === 'send') { const k = 'sig:' + clean(body.code) + ':' + clean(body.to); await redis([['RPUSH', k, JSON.stringify(body.msg || {})], ['EXPIRE', k, '120']]); return res.json({ ok: true }); }
    if (a === 'recv') { const [msgs] = await redis([['LPOP', 'sig:' + clean(req.query.code) + ':' + clean(req.query.me), '50']]); return res.json({ msgs: (msgs || []).map(m => JSON.parse(m)) }); }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};

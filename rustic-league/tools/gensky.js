require('../src/tex.js'); const T = globalThis.RLTex; const fs = require('fs');
const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const P = { sunset: nrm([-0.40, 0.045, 0.915]), day: nrm([-0.32, 0.62, 0.72]), overcast: nrm([-0.25, 0.8, 0.5]), night: nrm([0.45, 0.42, -0.79]) };
(async () => { for (const [k, d] of Object.entries(P)) { const t0 = Date.now(); const s = await T.sky(2048, 1024, d, k); fs.writeFileSync('assets/sky_' + k + '.raw', Buffer.from(s.data.buffer)); console.log(k, Date.now() - t0, 'ms'); } })();

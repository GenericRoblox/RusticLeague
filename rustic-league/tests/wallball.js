// Attacking a ball near a side wall or in a corner of the attacking third, against a real defender who starts in goal.
// Counts goals within 10 s (and goals conceded on the break). Compares the current bot with a baseline bot file.
// usage: node tests/wallball.js [level] [N] [baseline file, default tests/baseline/bot_v1.js]   (seeded, reproducible). ONLY=current or ONLY=baseline runs one row. SEED=n: another scenario set. KIND=air: a ball bouncing in the attacking third instead. 'In front of goal' = |x| < 15, 6-32 m out.
const S = require('../src/sim.js'), path = require('path');
const lv = process.argv[2] || 'legend', N = +(process.argv[3] || 40);
const mods = { current: require('../src/bot.js'), baseline: require(path.resolve(process.argv[4] || __dirname + '/baseline/bot_v1.js')) };
const { V } = S; const DEF = require(__dirname + '/baseline/bot_v1.js'); // the defender is always the original bot
for (const [name, M] of Object.entries(mods)) {
  if (process.env.ONLY && process.env.ONLY !== name) continue;
  let seed = 31 + 1000 * (+process.env.SEED || 0), goals = 0, against = 0, setT = [], rs = 7, delivered = 0, onTarget = 0, touches = 0; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  Math.random = () => { rs = (rs * 48271) % 2147483647; return rs / 2147483647; };
  for (let k = 0; k < N; k++) {
    const sim = new S.Sim({ teamSize: 1 }); const att = new M.Bot(sim, 0, lv), def = new DEF.Bot(sim, 1, lv);
    att.mode = 'attack'; def.mode = 'rotate';
    const side = r() < 0.5 ? -1 : 1, corner = r() < 0.3;
    const bz = corner ? S.A.HZ - 4 - r() * 4 : S.A.HZ - 12 - r() * 32, bx = corner ? side * (S.A.GW + 6 + r() * 14) : side * (S.A.HX - 3.5 - r() * 3);
    sim.ball.pos = V(bx, 1.6, bz); sim.ball.vel = V((r() - 0.5) * 4, 0, (r() - 0.3) * 6);
    if (process.env.KIND === 'air') { // a ball bouncing in the attacking third instead
      sim.ball.pos = V((r() - 0.5) * 40, 3 + r() * 5, S.A.HZ - 14 - r() * 30); sim.ball.vel = V((r() - 0.5) * 10, 5 + r() * 9, (r() - 0.5) * 10); }
    sim.placeCar(sim.cars[0], V(bx * 0.4 + (r() - 0.5) * 16, 0, bz - 18 - r() * 10), (r() - 0.5) * 0.8);
    sim.placeCar(sim.cars[1], V((r() - 0.5) * 6, 0, S.A.HZ - 3), Math.PI);
    let t = 0, g = -1, dlv = false, tgt = false, pend = 0;
    while (t < 15) { sim.step([att.update(sim.dt), def.update(sim.dt)]); t += sim.dt;
      for (const e of sim.events) if (e.type === 'ballHit' && e.car === 0) { touches++; pend = 6; }
      if (pend > 0 && --pend === 0) { const b = sim.ball, dz = S.A.HZ - b.pos.z; if (b.vel.z > 1 && Math.abs(b.pos.x + b.vel.x * dz / b.vel.z) < S.A.GW - 1 && dz < 40) tgt = true; }
      if (Math.abs(sim.ball.pos.x) < 15 && sim.ball.pos.z > S.A.HZ - 32 && sim.ball.pos.z < S.A.HZ - 6 && sim.ball.pos.y < 4) dlv = true;
      sim.events.length = 0; g = sim.goalCheck(); if (g >= 0) break; }
    if (dlv) delivered++; if (tgt) onTarget++;
    if (g === 0) { goals++; setT.push(t); } else if (g === 1) against++;
  }
  setT.sort((a, b) => a - b);
  console.log(`${name.padEnd(8)} ${lv}: ball brought in front of goal ${delivered}/${N}, a shot on target ${onTarget}/${N}, goals within 15 s ${goals}/${N} (median ${(setT[setT.length >> 1] || 0).toFixed(1)} s), conceded ${against}, touches ${touches}`);
}

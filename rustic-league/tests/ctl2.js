// Reproducible version of control.js: Math.random is seeded too, so a run can be replayed and traced.
// usage: node tests/ctl2.js [level] [N] [car] [seedBase] [traceRun]
// Reports goals, own goals, time spent per controller state, touches, direction error.
let rs = 1; Math.random = () => { rs = (rs * 48271) % 2147483647; return rs / 2147483647; };
const S = require('../src/sim.js'); const { Bot, LEVELS } = require('../src/bot.js'); if (process.env.NOPLAN) for (const k in LEVELS) LEVELS[k].plan = false; const { Sim, V } = S; const f = n => n.toFixed(1);
const lvl = process.argv[2] || 'legend', N = +(process.argv[3] || 30), car = process.argv[4] || 'coupe', base = +(process.argv[5] || 5), trace = process.argv[6] != null ? +process.argv[6] : -1;
let seed = base; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const times = []; let fails = 0, own = 0, touches = 0, errs = [], walls = 0; const stT = {};
for (let k = 0; k < N; k++) {
  rs = 1000 + k * 7919 + base * 31;
  const sim = new Sim({ teamSize: 1, types: [car, 'coupe'] }); const b = new Bot(sim, 0, lvl); b.mode = 'attack';
  sim.placeCar(sim.cars[1], V(-34, 0, 70), 0); sim.cars[1].frozen = true;
  const bx = (r() - 0.5) * 50, bz = -60 + r() * 55; sim.ball.pos = V(bx, 1.56, bz);
  sim.placeCar(sim.cars[0], V(bx + (r() - 0.5) * 20, 0, bz - 12 - r() * 10), (r() - 0.5) * 1.2);
  let t = 0, g = -1, onWall = false, nt = 0;
  while (t < 30) {
    const inp = b.update(sim.dt); sim.step([inp, {}]); t += sim.dt;
    const st = (b.dbg || '?').split(' ')[0] + (b.precise ? '*' : ''); stT[st] = (stT[st] || 0) + sim.dt;
    for (const e of sim.events) if (e.type === 'ballHit' && e.car === 0) {
      touches++; const bv = sim.ball.vel, d = S.norm(V(-sim.ball.pos.x, 0, S.A.HZ - sim.ball.pos.z)), h = S.norm(V(bv.x, 0, bv.z));
      errs.push(Math.acos(Math.max(-1, Math.min(1, S.dot(d, h)))) * 57.3);
      if (k === trace) console.log(`  HIT t=${f(t)} ball->(${f(bv.x)},${f(bv.z)}) err=${f(errs[errs.length - 1])}`);
    }
    sim.events.length = 0;
    const w = sim.ball.pos.y > 4 && S.wallDist(sim.ball.pos.x, sim.ball.pos.z) < 5; if (w && !onWall) walls++; onWall = w;
    if (k === trace && t >= nt) { nt += 0.25; const c = sim.cars[0], fw = c.forward();
      console.log(`t=${f(t)} car(${f(c.pos.x)},${f(c.pos.z)}) hd=${f(Math.atan2(fw.x, fw.z) * 57.3)} v=${f(c.speed())} ball(${f(sim.ball.pos.x)},${f(sim.ball.pos.y)},${f(sim.ball.pos.z)}) bv(${f(sim.ball.vel.x)},${f(sim.ball.vel.z)}) ${b.mode} tgt(${f(b.target.x)},${f(b.target.z)}) cap=${f(b.speedCap)} ${b.dbg} sd=(${f(b.shotDirSafe?b.shotDirSafe.x:0)},${f(b.shotDirSafe?b.shotDirSafe.z:0)}) in=${f(inp.throttle)}/${f(inp.steer)}${inp.handbrake ? '/HB' : ''}`); }
    g = sim.goalCheck(); if (g >= 0) break;
  }
  if (g === 0) times.push(t); else { fails++; if (g === 1) own++; }
  if (process.env.V) console.log(k, g === 0 ? 'GOAL ' + f(t) : g === 1 ? 'OWN' : 'fail', 'ball', f(sim.ball.pos.x), f(sim.ball.pos.z), 'car', f(sim.cars[0].pos.x), f(sim.cars[0].pos.z), b.dbg);
}
times.sort((a, b) => a - b); errs.sort((a, b) => a - b);
const tot = Object.values(stT).reduce((a, b) => a + b, 0);
console.log(`${lvl} ${car}: goals ${times.length}/${N} (own ${own}) median ${f(times[times.length >> 1] || 0)}s | touches/run ${f(touches / N)} | wall rides/run ${f(walls / N)} | dir err median ${f(errs[errs.length >> 1] || 0)} p75 ${f(errs[Math.floor(errs.length * .75)] || 0)}`);
if (process.env.ST) console.log(Object.entries(stT).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join('  '));

// Head-to-head: the current src/bot.js against a saved baseline bot (default tests/baseline/bot_v1.js, the bot before the
// strike planner), same level, alternating sides. usage: node tests/h2h.js [level] [matches] [minutes] [baseline file]
// About 6-8 s per 8-minute 1v1 match. A 20-match run gives ~130 goals, so one standard deviation is about 4 points of goal
// share: run it twice before believing a difference under ~8 points.
const S = require('../src/sim.js'), NEW = require('../src/bot.js'), OLD = require(require('path').resolve(process.argv[5] || __dirname + '/baseline/bot_v1.js'));
const lv = process.argv[2] || 'legend', M = +(process.argv[3] || 20), mins = +(process.argv[4] || 8);
let gN = 0, gO = 0, stalls = 0;
for (let m = 0; m < M; m++) {
  const newSide = m % 2, sim = new S.Sim();
  const bots = sim.cars.map((c, i) => new (c.team === newSide ? NEW : OLD).Bot(sim, i, lv));
  sim.resetKickoff(0); bots.forEach(b => b.onKickoff()); let t = 0, k = 0, since = 0;
  while (t < mins * 60) {
    sim.step(bots.map(b => b.update(sim.dt))); t += sim.dt; since += sim.dt; sim.events.length = 0;
    const g = sim.goalCheck();
    if (g >= 0 || since > 90) { if (g === newSide) gN++; else if (g >= 0) gO++; else stalls++; since = 0; sim.resetKickoff(++k); bots.forEach(b => b.onKickoff()); }
  }
}
console.log(`${lv}: current ${gN} - ${gO} baseline  (goal share ${(100 * gN / Math.max(gN + gO, 1)).toFixed(0)}%, ${M} x ${mins} min, 90 s stalls ${stalls})`);

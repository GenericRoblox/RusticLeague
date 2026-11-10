// Difficulty-order check: level A vs level B, both using src/bot.js (or another bot file), sides alternating every match,
// ball reset after 90 s without a goal. Prefer this to match.js, which keeps level A on one side and never resets a stall
// (it gave Normal-Easy 51-17 one day and 30-34 another; this runner gave 53-41 and 47-35 for the same two versions).
// usage: node tests/ladder.js levelA levelB [matches=16] [minutes=8] [bot file]
const S = require('../src/sim.js'), path = require('path');
const B = require(process.argv[6] ? path.resolve(process.argv[6]) : '../src/bot.js');
const la = process.argv[2] || 'legend', lb = process.argv[3] || 'hard', M = +process.argv[4] || 16, mins = +process.argv[5] || 8;
let ga = 0, gb = 0, stalls = 0;
for (let m = 0; m < M; m++) {
  const sim = new S.Sim(), aSide = m % 2;
  const bots = sim.cars.map((c, i) => new B.Bot(sim, i, c.team === aSide ? la : lb));
  sim.resetKickoff(0); bots.forEach(b => b.onKickoff()); let t = 0, k = 0, since = 0;
  while (t < mins * 60) {
    sim.step(bots.map(b => b.update(sim.dt))); t += sim.dt; since += sim.dt; sim.events.length = 0;
    const g = sim.goalCheck();
    if (g >= 0 || since > 90) { if (g === aSide) ga++; else if (g >= 0) gb++; else stalls++; since = 0; sim.resetKickoff(++k); bots.forEach(b => b.onKickoff()); }
  }
}
console.log(`${la} ${ga} - ${gb} ${lb}  (${(100 * ga / Math.max(1, ga + gb)).toFixed(0)}%, ${M} x ${mins} min, 90 s stalls ${stalls})`);

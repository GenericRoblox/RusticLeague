// Cars trapped inside a goal: placed in the net at random spots and headings (sideways, facing the back net, against
// a post), ball at midfield. Time until the car is back out of the goal, and how many are still inside after 10 s.
// usage: node tests/goalexit.js [level] [N] [baseline file, default tests/baseline/bot_v1.js]
const S = require('../src/sim.js'), path = require('path'), { V } = S;
const lv = process.argv[2] || 'legend', N = +(process.argv[3] || 60);
const mods = { current: require('../src/bot.js'), baseline: require(path.resolve(process.argv[4] || __dirname + '/baseline/bot_v1.js')) };
for (const [name, M] of Object.entries(mods)) {
  let seed = 17, rs = 3, stuck = 0; const times = []; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  Math.random = () => { rs = (rs * 48271) % 2147483647; return rs / 2147483647; };
  for (let k = 0; k < N; k++) {
    const sim = new S.Sim({ teamSize: 1 }); const b = new M.Bot(sim, 0, lv); b.mode = 'attack';
    sim.placeCar(sim.cars[1], V(-34, 0, 70), 0); sim.cars[1].frozen = true;
    const end = r() < 0.5 ? -1 : 1, post = r() < 0.35;
    const x = post ? (r() < 0.5 ? -1 : 1) * (S.A.GW - 2.2) : (r() - 0.5) * (S.A.GW * 2 - 6), z = end * (S.A.HZ + (post ? 1.5 + r() * 2 : 2.5 + r() * 4));
    sim.placeCar(sim.cars[0], V(x, 0, z), r() * 2 * Math.PI);
    sim.ball.pos = V((r() - 0.5) * 30, 1.6, (r() - 0.5) * 40);
    let t = 0, out = false;
    while (t < 10) { sim.step([b.update(sim.dt), {}]); t += sim.dt; sim.events.length = 0; if (Math.abs(sim.cars[0].pos.z) < S.A.HZ - 2) { out = true; break; } }
    if (out) times.push(t); else stuck++;
  }
  times.sort((a, b) => a - b);
  console.log(`${name.padEnd(8)} ${lv}: still inside after 10 s ${stuck}/${N}; out in median ${(times[times.length >> 1] || 0).toFixed(1)} s, p90 ${(times[Math.floor(times.length * 0.9)] || 0).toFixed(1)} s`);
}

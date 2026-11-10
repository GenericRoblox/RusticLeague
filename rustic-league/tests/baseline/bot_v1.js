// ===================== RUSTIC LEAGUE — BOT =====================
(function (root) {
'use strict';
const S = (typeof module !== 'undefined' && module.exports) ? require('../../src/sim.js') : root.RLSim;
const { V, add, sub, mul, dot, len, norm, clamp, lerp, A, PAD, sdf, sdfNormal, qrot, qconj } = S;

const LEVELS = {
  easy:   { name: 'Easy',   passSkill: 0.15, think: 0.30, noise: 0.18, cap: 0.80, horizon: 0.0, hb: false, hbAng: 9,    pads: 0.0,  avoid: 0.5, defend: 0.5,  kickDelay: 0.5,  aimCorner: 0,   brake: 1.0 },
  normal: { name: 'Normal', passSkill: 0.5, think: 0.17, noise: 0.12, cap: 0.92, horizon: 2.2, hb: true,  hbAng: 1.8,  pads: 0.35, avoid: 0.85, defend: 0.8, kickDelay: 0.18, aimCorner: 0.2, brake: 0.8 },
  hard:   { name: 'Hard',   passSkill: 0.9, think: 0.06, noise: 0.025, cap: 1.00, horizon: 3.6, hb: true,  hbAng: 1.3, pads: 0.7,  avoid: 1.0, defend: 0.92, kickDelay: 0.06, aimCorner: 0.5, brake: 0.5, flick: true },
  legend: { name: 'Legend', passSkill: 1.0, think: 0.045, noise: 0.0,  cap: 1.00, horizon: 4.0, hb: true,  hbAng: 1.25,  pads: 0.8,  avoid: 1.0, defend: 0.92, kickDelay: 0.04, aimCorner: 0.6, brake: 0.45, flick: true },
};
// play styles: how a bot behaves when it isn't the one going for the ball, and how it shoots
const STYLES = {
  allrounder: { name: 'All-rounder', car: 'coupe', defend: 1.0, aim: 0, pass: 0.25, pads: 1.0, support: 'back' },
  defender:   { name: 'Defender',    car: 'van',   defend: 1.1, aim: -0.2, pass: 0.15, pads: 0.5, support: 'goal' },
  striker:    { name: 'Striker',     car: 'buggy', defend: 0.55, aim: 0.25, pass: 0.08, pads: 1.3, support: 'forward' },
  playmaker:  { name: 'Playmaker',   car: 'coupe', defend: 0.9, aim: 0, pass: 0.65, pads: 0.9, support: 'mid' },
};
const LAUNCH_VY = 16.4, CAR_H = 0.75; // launch model used for pad planning

function predictBall(ball, horizon, dt = 1 / 30) {
  const out = []; let p = { ...ball.pos }, v = { ...ball.vel }; const r = ball.r;
  for (let t = 0; t <= horizon + 1e-6; t += dt) {
    out.push({ t, p: { ...p }, v: { ...v } });
    v = { x: v.x * (1 - 0.03 * dt), y: v.y - A.G * dt, z: v.z * (1 - 0.03 * dt) };
    p = add(p, mul(v, dt));
    const s = sdf(p.x, p.y, p.z);
    if (s < r) {
      const n = sdfNormal(p); const vn = dot(v, n);
      if (vn < 0) { const vt = sub(v, mul(n, vn)); v = add(mul(vt, 0.88), mul(n, -vn * 0.6)); }
      p = add(p, mul(n, r - s));
    }
  }
  return out;
}
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
const flat = p => V(p.x, 0, p.z);
// keep a ground target out of the wall itself (the ramp is fine, the steel behind it is not)
function wallNormal(x, z) { const e = 0.05; return norm(V(S.wallDist(x + e, z) - S.wallDist(x - e, z), 0, S.wallDist(x, z + e) - S.wallDist(x, z - e))); }
function inside(t, minW = 1.5) {
  let p = V(t.x, 0, t.z);
  for (let k = 0; k < 4; k++) { const w = S.wallDist(p.x, p.z); if (w >= minW) break; p = add(p, mul(wallNormal(p.x, p.z), minW - w + 0.3)); }
  // goal mouths count as open floor only inside the goal width
  if (Math.abs(p.z) > A.HZ - 0.5 && Math.abs(p.x) > A.GW - 1) p.z = Math.sign(p.z) * (A.HZ - 1.5);
  return p;
}

class Bot {
  constructor(sim, idx, level = 'normal', style = 'allrounder') {
    this.sim = sim; this.idx = idx; this.setLevel(level); this.style = STYLES[style] || STYLES.allrounder; this.styleKey = style;
    this.attack = sim.cars[idx].team === 0 ? 1 : -1; // +1 attacks +z goal
    this.thinkT = 0; this.target = V(); this.mode = 'attack'; this.stuckT = 0; this.reverseT = 0; this.modeT = 0;
    this.noiseA = 0; this.plan = null; this.kickT = 0; this.speedCap = 99; this.kickStart = 0;
  }
  setLevel(l) { this.levelKey = l; this.L = LEVELS[l] || LEVELS.normal; }
  onKickoff() { this.kickT = -3; this.plan = null; this.mode = 'kickoff'; this.reverseT = 0; this.stuckT = 0; this.kickStart = this.sim.time; this.thinkT = 0; }

  // look for a pad whose launch arc meets the ball
  planLaunch(pred, me, mySpd, shotDir) {
    const sim = this.sim; let best = null;
    const fwd = flat(me.forward());
    for (const pd of sim.pads) {
      if (pd.state !== 'armed') continue;
      const toPad = sub(flat(pd.c), flat(me.pos)); const dPad = len(toPad); if (dPad < 7 || dPad > 48) continue;
      const turn = Math.acos(clamp(dot(norm(fwd), norm(toPad)), -1, 1));
      const vApp = clamp(Math.max(mySpd, 12) + 4, 14, 31);
      const Tp = dPad / vApp + turn * 0.45 + 0.25;
      for (const s of pred) {
        const t = s.t - Tp; if (t < 0.35 || t > 2.3 || s.p.y < 3.6) continue;
        const u = sub(flat(s.p), flat(pd.c)); const dh = len(u); if (dh < 3) continue;
        const vh = dh / t; if (vh < 9 || vh > 27) continue;
        const ud = mul(u, 1 / dh);
        if (dot(norm(toPad), ud) < 0.78) continue;           // must be able to line up through the pad
        if (dot(ud, shotDir) < -0.15) continue;              // don't fly the ball toward our own end
        const cy = CAR_H + LAUNCH_VY * t - 0.5 * A.G * t * t;
        if (Math.abs(cy - s.p.y) > 3.0) continue;
        const score = s.t + Math.abs(cy - s.p.y) * 0.3 - dot(ud, shotDir);
        if (!best || score < best.score) best = { pad: pd.i, dir: ud, vh, t: s.t, score, until: sim.time + s.t + 0.5 };
        break;
      }
    }
    return best;
  }

  think() {
    if (!this.sim.passInfos) this.sim.passInfos = {};
    { const bv = this.sim.ball.vel, lv = this.lastBV || bv; const dv = Math.hypot(bv.x - lv.x, bv.y - lv.y, bv.z - lv.z); this.lastBV = { ...bv };
      const slowNow = Math.hypot(bv.x, bv.z) < 4.5 && this.sim.ball.pos.y < 2.2 && Math.abs(bv.y) < 2.5;
      this.idleBall = (slowNow && dv < 2.5) ? (this.idleBall || 0) + this.L.think * 1.0 : 0; }
    const sim = this.sim, me = sim.cars[this.idx], ball = sim.ball, L = this.L;
    const oppGoal = V(0, 0, A.HZ * this.attack), ownGoal = V(0, 0, -A.HZ * this.attack);
    const pred = L.horizon > 0 ? predictBall(ball, L.horizon) : [{ t: 0, p: { ...ball.pos }, v: { ...ball.vel } }];
    const myP = me.pos, mySpd = Math.max(len(V(me.vel.x, 0, me.vel.z)), 10);
    const fwd = me.forward();
    if (!(sim.time < this.noiseUntil)) { this.noiseUntil = sim.time + 0.6; this.noiseA = (Math.random() * 2 - 1) * L.noise; }
    if (!(sim.time < this.aimUntil)) { // commit to a shot target for a while instead of dithering
      this.aimUntil = sim.time + 2.5 + Math.random() * 1.5;
      // on the wing near their goal, good players cut the ball back across the front of goal instead of shooting from the angle
      const wing = ball.pos.z * this.attack > A.HZ * 0.55 && Math.abs(ball.pos.x) > A.GW + 5;
      this.cross = wing && sim.cars.some(c => c !== me && c.team === me.team) && L.passSkill > 0.4 && Math.random() < (this.style.pass + 0.3) * L.passSkill;
      // corner placement only when close enough to be accurate: from distance aim near the middle of the goal
      const shotLen = Math.hypot(ball.pos.x, A.HZ - ball.pos.z * this.attack), room = (A.GW - 3.2) * clamp(1.15 - shotLen / 70, 0.15, 1) * (0.5 + 0.5 * L.passSkill);
      this.aimX = Math.random() < clamp(L.aimCorner + this.style.aim, 0, 1) ? (ball.pos.x > 0 ? -1 : 1) * room * (Math.random() < 0.8 ? 1 : -1) : 0;
    }
    const aimX = this.aimX;
    // tight angle beside their goal (near the end wall, outside the posts): cut it back into the space in front of goal first
    const tight = (A.HZ - ball.pos.z * this.attack) < 20 && Math.abs(ball.pos.x) > A.GW + 0.5 && L.passSkill >= 0.5;
    const aim = (this.cross || tight) ? V(clamp(-ball.pos.x * 0.15, -A.GW * 0.5, A.GW * 0.5), 0, oppGoal.z - this.attack * (tight ? 11 : 9)) : V(aimX, 0, oppGoal.z + this.attack * 3);

    if (this.plan) { // keep an active launch plan while it's still valid
      const pd = sim.pads[this.plan.pad];
      const rel = sub(flat(me.pos), flat(pd.c)), u = this.plan.dir, along = dot(rel, u), lat = Math.abs(rel.x * u.z - rel.z * u.x);
      if (pd.state !== 'armed' || sim.time > this.plan.until || me.groundedCount === 0 || (along > -7 && lat > 3.5) || along > 1.5) this.plan = null;
      else { this.target = this.planTarget(me); this.mode = 'launch'; return; }
    }

    let pick = pred[pred.length - 1]; this.arriveT = 0;
    const carH = me.spec.dims[1] * me.spec.K, accel = me.spec.engineF / me.spec.mass * 0.8, vmx = me.spec.vmax * 0.95, v0 = Math.max(me.speed(), 0);
    const etaD = d => { const tA = Math.max(vmx - v0, 0) / accel, dA = v0 * tA + 0.5 * accel * tA * tA; return d <= dA ? (-v0 + Math.sqrt(v0 * v0 + 2 * accel * d)) / accel : tA + (d - dA) / vmx; };
    const smart = L.passSkill >= 0.5;
    for (const s of pred) {
      const onRamp = S.wallDist(s.p.x, s.p.z) < A.RR - 0.3; const reach = carH + (onRamp ? 4.5 : 1.5);
      if (s.p.y > (smart ? reach : 3.6)) continue;
      if (smart) { const app = flat(s.p), d = len(sub(app, flat(myP))); const turn = Math.abs(Math.acos(clamp(dot(norm(flat(fwd)), norm(sub(app, flat(myP)))), -1, 1)));
        if (etaD(Math.max(d - 2.5, 0)) + turn * 0.55 <= s.t + 0.05) { pick = s; this.arriveT = s.t; break; } continue; }
      const shot = norm(V(aim.x - s.p.x, 0, aim.z - s.p.z));
      const app = sub(flat(s.p), mul(shot, ball.r + 2.6));
      const d = len(sub(app, flat(myP)));
      const turn = Math.abs(Math.acos(clamp(dot(norm(flat(fwd)), norm(sub(app, flat(myP)))), -1, 1)));
      if ((d + turn * 7) / mySpd <= s.t + 0.05) { pick = s; break; }
    }
    const bp = pick.p;
    let shotDir = norm(V(aim.x - bp.x, 0, aim.z - bp.z));
    const aim0 = { x: aim.x, z: aim.z };

    // ---- team roles: one 'first man' per team goes for the ball, the rest hold positions for their style ----
    const mates = sim.cars.filter(c => c.team === me.team);
    const eta = c => { const to = flat(sub(ball.pos, c.pos)); const d = len(to); const fa = Math.acos(clamp(dot(norm(flat(c.forward())), norm(to)), -1, 1));
      const poss = d < 7 && fa < 0.7 && dot(flat(c.vel), norm(to)) > 3 ? 1.3 : 0; // already on the ball and driving it
      return d / Math.max(len(flat(c.vel)), 12) + fa * 0.45 + ((c.pos.z - ball.pos.z) * this.attack > 3 ? 1.0 : 0) + (c.groundedCount === 0 ? 0.6 : 0) - poss; };
    let first = true;
    if (mates.length > 1) {
      if (this.mode === 'kickoff' && len(ball.vel) < 1) { const dk = c => len(flat(sub(ball.pos, c.pos))) + c.id * 0.01; first = mates.every(m => m === me || dk(m) > dk(me)); }
      else { const mine = eta(me) - (this.wasFirst ? 0.35 : 0); first = mates.every(m => m === me || eta(m) >= mine); }
    }
    // the van ('defender') splits its time: keeper ~30%, sweeper in our half ~45%, helping up front ~25% (more attacking in 2v2)
    const ballOurHalf = bp.z * this.attack < 0;
    { const tb = sub(flat(ball.pos), flat(myP)); if (len(tb) < 7.5 && dot(norm(tb), norm(flat(fwd))) > 0.6) this.possT = sim.time; }
    const possessing = sim.time - (this.possT || -9) < 1.2; // touched/driving the ball very recently
    if (this.styleKey === 'defender' && mates.length > 1) {
      if (possessing) this.phaseUntil = Math.max(this.phaseUntil || 0, sim.time + 1.5); // never switch role mid-dribble
      if (!(sim.time < this.phaseUntil)) { const pr = mates.length === 2 ? [0.16, 0.42, 0.42] : [0.22, 0.48, 0.30]; const r = Math.random(); // odds tuned so time actually spent ≈ 30% goal / 45% own half / 25% up front
        this.phase = r < pr[0] ? 'keeper' : r < pr[0] + pr[1] ? 'sweeper' : 'forward'; this.phaseUntil = sim.time + 6 + Math.random() * 5; }
      const mateOnIt = mates.some(m => m !== me && len(flat(sub(m.pos, bp))) < 7);
      if (this.phase === 'keeper') first = first && (bp.z - ownGoal.z) * this.attack < 45;              // only leave the goal for balls close to it
      else if (this.phase === 'sweeper') first = ballOurHalf ? (first || !mateOnIt) : false;          // hunt the ball anywhere in our half
    } else this.phase = null;
    if (possessing) first = true;
    // a pass in flight: the receiver goes and gets it, the passer lets it go
    { const pi = sim.passInfos[me.team]; if (pi && sim.time < pi.until && pi.kicked) { if (pi.to === me.id) first = true; else if (pi.from === me.id) first = false; } }
    this.wasFirst = first;
    if (!first) {
      this.plan = null; this.mode = 'support';
      // a team-mate has passed to us: run onto the ball's landing spot instead of idling
      const pi = sim.passInfos[me.team]; if (pi && pi.to === me.id && sim.time < pi.until) { this.target = inside(pi.lead, 3); this.receiving = true; this.speedCap = 99; return; }
      this.receiving = false;
      const st = inside(this.supportTarget(bp, ownGoal, oppGoal), 3);
      if (!this.supT || len(sub(st, this.supT)) > 5) this.supT = st; // hold a spot rather than shuffling after every ball movement
      this.target = this.supT; this.speedCap = 99; return;
    }
    this.receiving = false;
    // ---- passing ----
    const opps = sim.cars.filter(c => c.team !== me.team);
    if (mates.length > 1 && !(sim.time < this.passUntil)) {
      this.passUntil = sim.time + 0.6; this.passTo = null;
      const clearing = this.styleKey === 'defender' && ballOurHalf;
      const want = clearing ? 0.75 : this.style.pass; const skill = L.passSkill;
      if (Math.random() < want * (0.35 + 0.65 * skill)) { const pk = this.choosePass(me, bp, mates, opps, ownGoal, oppGoal, clearing, skill); if (pk) { this.passTo = pk.id; this.passLead = pk.lead; this.passUntil = sim.time + 2.8; this.passTouch = this.idleTouchCount || 0; } }
    }
    // only pass from a clean setup: lined up behind the ball, off the wall, ball low, nobody on top of us, not a kickoff
    if (this.passTo != null) {
      const pdir = norm(V(this.passLead.x - bp.x, 0, this.passLead.z - bp.z)), tb = flat(sub(bp, myP)), lineUp = dot(norm(tb), pdir);
      const crowded = opps.some(o => len(flat(sub(o.pos, bp))) < 4.5), walled = S.wallDist(bp.x, bp.z) < 6 || Math.abs(bp.z) > A.HZ - 7;
      const kick = this.mode === 'kickoff' || (Math.abs(bp.x) < 0.5 && Math.abs(bp.z) < 0.5 && len(ball.vel) < 1);
      if (crowded || walled || kick || bp.y > 3.2 || (len(tb) < 14 && lineUp < 0.45)) { this.passTo = null; sim.passInfos[me.team] = null; }
    }
    if (this.passTo != null) {
      const lead = this.passLead; aim.x = clamp(lead.x, -A.HX + 5, A.HX - 5); aim.z = clamp(lead.z, -A.HZ + 5, A.HZ - 5);
      const sd = norm(V(aim.x - bp.x, 0, aim.z - bp.z)); shotDir.x = sd.x; shotDir.z = sd.z;
      const prevPI = sim.passInfos[me.team]; sim.passInfos[me.team] = { from: me.id, to: this.passTo, lead: V(aim.x, 0, aim.z), until: sim.time + 3, kicked: false, touchT: prevPI && prevPI.from === me.id ? prevPI.touchT : null };
    } else if (this.styleKey === 'defender' && ballOurHalf) { // no open team-mate: clear it long, away from the middle of our goal
      aim.x = clamp(bp.x * 1.4, -A.HX + 8, A.HX - 8); aim.z = this.attack * A.HZ * 0.45; const sd = norm(V(aim.x - bp.x, 0, aim.z - bp.z)); shotDir.x = sd.x; shotDir.z = sd.z;
    }
    // don't steer the ball into a nearby wall (it just climbs the ramp): bend the shot back toward the middle
    if (L.passSkill > 0.4) { const wBp = S.wallDist(bp.x, bp.z); if (wBp < 18 && Math.abs(bp.z) < A.HZ - 6) { const nIn = wallNormal(bp.x, bp.z), into = -dot(shotDir, nIn);
      if (into > -0.1) { const e = norm(add(shotDir, mul(nIn, (into + 0.25) * 1.3 * (1 - wBp / 18)))); shotDir.x = e.x; shotDir.z = e.z; } } }
    // aim off for the ball's own motion: strike along (wanted outgoing velocity - incoming velocity)
    if (L.passSkill > 0.4) { const vin = V(pick.v.x, 0, pick.v.z), want = 20; const eff = norm(sub(mul(shotDir, want), mul(vin, 0.85 * L.passSkill)));
      if (len(eff) > 0.5 && dot(eff, shotDir) > 0.2) { shotDir.x = eff.x; shotDir.z = eff.z; } }
    this.shotDirSafe = { x: shotDir.x, z: shotDir.z };
    const ahead = (myP.z - bp.z) * this.attack;
    const ballToOwn = (bp.z - ownGoal.z) * this.attack;
    const threat = ball.vel.z * -this.attack > 6 && ballToOwn < 50;
    let mode = this.mode === 'kickoff' || this.mode === 'launch' || this.mode === 'support' ? 'attack' : this.mode;
    const piR = sim.passInfos[me.team]; const receivingPass = piR && piR.kicked && piR.to === me.id && sim.time < piR.until;
    this.modeT += L.think;
    const deadBall = len(V(ball.vel.x, 0, ball.vel.z)) < 4.5 && ball.pos.y < 2.2 && Math.abs(ball.vel.y) < 2.5; // rolling slowly, not bouncing
    // time to set up a proper shot: the ball will be low where we meet it and no opponent can get there first
    const myEtaB = len(sub(flat(bp), flat(myP))) / Math.max(me.speed(), 12);
    const oppEtaB = Math.min(...sim.cars.filter(c => c.team !== me.team).map(c => len(sub(flat(bp), flat(c.pos))) / Math.max(len(flat(c.vel)), 12)), 99);
    // lining up costs a loop round behind the ball when we're coming from the wrong side: only do it if that still beats the opponent
    const alignNow = dot(norm(sub(flat(bp), flat(myP))), norm(V(aim0.x - bp.x, 0, aim0.z - bp.z)));
    const setupCost = myEtaB + (alignNow > 0.55 ? 0.3 : alignNow > 0 ? 1.6 : 2.8);
    const setupTime = pick.p.y < 2.6 && len(flat(ball.vel)) < 14 && oppEtaB - setupCost > 1.2 + (1 - L.passSkill) * 0.8;
    const oppNear = sim.cars.some(c => c.team !== me.team && len(sub(flat(c.pos), flat(bp))) < 18);
    const calm = deadBall && !oppNear; // nobody to beat to it: no need to retreat, the careful approach goes round the ball
    if (mode === 'rotate' && (calm || receivingPass)) { mode = 'attack'; this.modeT = 0; }
    // overran the ball deep in their end with nobody pressing: tight loop back behind it instead of a long retreat
    const deepEnd = bp.z * this.attack > A.HZ - 28 && !oppNear && !threat;
    if (deepEnd && mode === 'rotate') { mode = 'attack'; this.modeT = 0; }
    this.deepLoop = deepEnd && ahead > -1;
    if (mode === 'attack') { if (!calm && !receivingPass && !(possessing && ahead < 2) && (ahead > 5 || (threat && ahead > -2)) && this.modeT > 1.0) { this.modeT = 0; if (Math.random() < Math.min(1, L.defend * this.style.defend)) mode = 'rotate'; } }
    else if (mode === 'rotate') { if (ahead < -3 || (myP.z - ownGoal.z) * this.attack < 14) { mode = 'attack'; this.modeT = 0; } }
    if (this.mode === 'kickoff' && sim.time - this.kickStart < 8 && len(ball.vel) < 1) mode = 'kickoff';

    let target; this.speedCap = 99; this.precise = false;
    if (mode === 'rotate') {
      const opps = sim.cars.filter(c => c.team !== me.team); const opp = opps.reduce((a, c) => len(sub(flat(c.pos), flat(bp))) < len(sub(flat(a.pos), flat(bp))) ? c : a, opps[0]); const oppD = len(sub(flat(opp.pos), flat(bp))), myD = len(sub(flat(myP), flat(bp)));
      const pressure = threat || (oppD < 24 && oppD < myD + 4 && (opp.pos.z - bp.z) * this.attack > -2);
      const side = myP.x > bp.x ? 1 : -1;
      if (threat && (bp.z - ownGoal.z) * this.attack < 40) target = V(clamp(bp.x * 0.4, -A.GW, A.GW), 0, ownGoal.z + this.attack * 8);
      else if (pressure) target = V(clamp(bp.x + side * 8, -A.HX + 7, A.HX - 7), 0, clamp(bp.z - this.attack * 18, -A.HZ + 6, A.HZ - 6));
      else { // nobody near: loop round the ball, arriving slowly enough to turn in behind it
        target = V(clamp(bp.x + side * 9, -A.HX + 6, A.HX - 6), 0, clamp(bp.z - this.attack * 9, -A.HZ + 6, A.HZ - 6));
        const dT = len(sub(target, flat(myP))); this.speedCap = 11 + dT * 0.55; if (dT < 7) { mode = 'attack'; this.modeT = 0; }
      }
    } else if (mode === 'kickoff') target = flat(ball.pos);
    else if ((deadBall || (setupTime && L.passSkill >= 0.5)) && S.wallDist(bp.x, bp.z) > A.RR + 0.5) {
      // ---- dead ball: commit to a line, arrive slow enough to turn, never orbit ----
      const bxz = flat(bp), toB = sub(bxz, flat(myP)), dB = len(toB), dir = dB > 0.01 ? mul(toB, 1 / dB) : shotDir;
      const align = dot(dir, shotDir); this.precise = true;
      const side = Math.sign(shotDir.x * toB.z - shotDir.z * toB.x) || 1; const perp = V(-shotDir.z * side, 0, shotDir.x * side);
      if (this.idleBall > (L.think > 0.2 ? 7 : 5)) { target = add(bxz, mul(dir, 2)); this.speedCap = 13; }   // orbit breaker: just go and hit it
      else if (align > 0.55 || (dB < 9 && align > 0.2)) { target = add(bxz, mul(shotDir, 2.5)); this.speedCap = dB < 14 ? 16 + align * 10 : 99; }
      else {
        // set up behind the ball; if the straight path would clip the ball, swing wide around it first
        const back = clamp(dB * 0.4, 7, 12); let wp = add(sub(bxz, mul(shotDir, back)), mul(perp, align < -0.2 ? 4 : 1.5));
        const segT = clamp(dot(sub(bxz, flat(myP)), norm(sub(wp, flat(myP)))), 0, len(sub(wp, flat(myP)))); const closest = add(flat(myP), mul(norm(sub(wp, flat(myP))), segT));
        if (len(sub(closest, bxz)) < 4.5 && align < 0.3) wp = add(bxz, mul(perp, 7.5));
        target = wp; const dW = len(sub(wp, flat(myP))); this.speedCap = 10 + dW * 0.6;
      }
    }
    else {
      this.precise = false;
      const bxz = flat(bp), toB = sub(bxz, flat(myP)), dB = len(toB);
      const off = clamp(dB * 0.55, 0, 15);
      target = sub(bxz, mul(shotDir, off));
      if (dB < 6) target = add(bxz, mul(shotDir, 2));
      const align = dot(norm(toB), shotDir);
      this.speedCap = (dB < 22 && align < 0.3) ? lerp(14, 26, clamp(align + 0.5, 0, 1)) : 99;
      // close in: steer onto the line through the ball along the shot, then drive down it (accurate contact)
      const behind = dot(sub(flat(myP), bxz), mul(shotDir, -1)); // metres behind the ball along the line
      if (dB < 28 && behind > 2.5 && align > 0.25 && L.passSkill > 0.3) {
        const sp = Math.max(len(flat(me.vel)), 8), look = clamp(sp * 0.45, 4, 11);
        const onLine = sub(bxz, mul(shotDir, Math.max(behind - look, -3))); target = onLine;
        const lat = len(sub(sub(flat(myP), bxz), mul(shotDir, -behind)));
        if (lat > 2.5) this.speedCap = Math.min(this.speedCap, 14 + 20 / lat);
      }
      if (this.passTo != null) { const pd = len(sub(flat(this.passLead || bxz), bxz)); this.speedCap = Math.min(this.speedCap, dB < 16 ? clamp(pd * 0.34, 8, 18) : 99); } // weight the pass
      // a ball sitting up on the ramp: come at it square to the wall rather than from behind the wall
      const wB = S.wallDist(bp.x, bp.z), wT = S.wallDist(target.x, target.z);
      if (wB < A.RR + 1 && dB < 35) {
        const nIn = wallNormal(bp.x, bp.z); let tg = V(-nIn.z, 0, nIn.x); if (dot(tg, shotDir) < 0) tg = mul(tg, -1);
        const apDir = norm(add(mul(tg, 0.85), mul(nIn, -0.42))); // run along the wall, angled up into the ramp
        const behind = dot(sub(flat(myP), bxz), apDir);
        if (behind < -3 && len(sub(sub(flat(myP), bxz), mul(apDir, behind))) < 4) target = add(bxz, mul(apDir, 3)); else target = sub(bxz, mul(apDir, 9));
        if (bp.y > carH + 4.8) { target = add(bxz, mul(nIn, A.RR + 1)); this.speedCap = 10; } else this.speedCap = Math.max(this.speedCap, 19);
      }
      // the line from behind the ball runs into the wall: just hit it from the field side and let the ramp send it back out
      else if (wT < Math.min(wB, 5) && dB < 30) { target = bxz; this.speedCap = 17; }
    }
    if (this.deepLoop && mode === 'attack') { const side = Math.sign(myP.x - bp.x) || 1; target = V(clamp(bp.x + side * 6, -A.HX + 6, A.HX - 6), 0, bp.z - this.attack * 9); this.speedCap = Math.min(this.speedCap || 99, 13); }
    target = inside(target, mode === 'attack' ? 1.0 : 3.5);
    if (mode === 'attack' && this.arriveT > 0.8 && ball.pos.y > 3 && Math.abs(ball.vel.y) > 2) { // get there when the ball does, not before
      const dT = len(sub(flat(target), flat(myP))); this.speedCap = Math.min(this.speedCap || 99, Math.max(10, dT / Math.max(this.arriveT - 0.12, 0.25) * 1.18)); }
    // dribbling far from goal: keep the ball close instead of blasting it away
    if (mode === 'attack' && L.passSkill >= 0.8 && ball.pos.y < 2.2) { const toB = sub(flat(ball.pos), flat(myP)); const dB2 = len(toB), bs = len(flat(ball.vel));
      if (dB2 < 9 && dot(norm(toB), norm(flat(me.forward()))) > 0.85 && dot(flat(ball.vel), norm(toB)) > 2 && Math.abs(oppGoal.z - ball.pos.z) > 40 && S.wallDist(ball.pos.x, ball.pos.z) < 22) this.speedCap = Math.min(this.speedCap || 99, bs + 6); }
    // parked inside a goal: drive back out through the mouth first
    if (Math.abs(myP.z) > A.HZ - 0.5 && Math.abs(bp.z) < A.HZ && mode !== 'kickoff') target = V(clamp(myP.x, -4, 4), 0, Math.sign(myP.z) * (A.HZ - 12));

    if (L.pads > 0 && mode === 'attack' && me.groundedCount >= 3 && Math.random() < L.pads * this.style.pads) {
      const plan = this.planLaunch(pred, me, mySpd, shotDir);
      if (plan) { this.plan = plan; this.mode = 'launch'; this.target = this.planTarget(me); return; }
    }
    this.mode = mode;
    this.target = target;
  }
  // pick an open team-mate: passers look for whoever is nearest the goal we're attacking, a clearing defender for whoever is
  // furthest from our own goal. The ball is led into the space in front of the receiver so they can run onto it.
  choosePass(me, bp, mates, opps, ownGoal, oppGoal, clearing, skill) {
    let best = null; const openR = 4 + 6 * skill, laneR = 1.5 + 3 * skill;
    for (const m of mates) {
      if (m === me || m.groundedCount === 0) continue;
      const fwd = flat(m.forward()), sp = len(flat(m.vel)); const runDir = sp > 4 ? norm(flat(m.vel)) : norm(V(0, 0, this.attack));
      const d0 = len(sub(flat(m.pos), flat(bp))); if (d0 < 8 || d0 > 70) continue;
      const tFly = d0 / 24; const lead = add(add(flat(m.pos), mul(flat(m.vel), tFly)), mul(norm(add(runDir, mul(fwd, 0.5))), 7));
      const upfield = (lead.z - bp.z) * this.attack; if (!clearing && upfield < 6) continue; if (clearing && upfield < 0) continue;
      let open = true;
      for (const o of opps) { const op = flat(o.pos); if (len(sub(op, flat(m.pos))) < openR || len(sub(op, lead)) < openR * 0.8) { open = false; break; }
        const ab = sub(lead, flat(bp)), t = clamp(dot(sub(op, flat(bp)), ab) / Math.max(dot(ab, ab), 1e-3), 0, 1); if (len(sub(op, add(flat(bp), mul(ab, t)))) < laneR) { open = false; break; } }
      if (!open && Math.random() < skill) continue; // weaker bots sometimes pass into traffic anyway
      const score = clearing ? len(sub(lead, flat(ownGoal))) : -len(sub(lead, flat(oppGoal)));
      if (!best || score > best.score) best = { id: m.id, lead, score };
    }
    if (best && skill < 1) { const e = (1 - skill) * 6; best.lead = add(best.lead, V((Math.random() - 0.5) * e, 0, (Math.random() - 0.5) * e)); }
    return best;
  }
  supportTarget(bp, ownGoal, oppGoal) {
    const at = this.attack; let sup = this.style.support; const ownZ = ownGoal.z;
    if (this.phase === 'keeper') return V(clamp(bp.x * 0.22, -A.GW * 0.7, A.GW * 0.7), 0, ownZ + at * 6);
    if (this.phase === 'sweeper') return bp.z * at < 0 ? V(clamp(bp.x * 0.5, -A.HX + 8, A.HX - 8), 0, clamp(bp.z - at * 10, ownZ + at * 26, A.HZ - 8)) : V(clamp(bp.x * 0.4, -A.HX + 8, A.HX - 8), 0, -at * 4);
    if (this.phase === 'forward') sup = 'forward';
    if (sup === 'goal') return V(clamp(bp.x * 0.3, -A.GW * 0.8, A.GW * 0.8), 0, ownZ + at * clamp(Math.abs(bp.z - ownZ) * 0.3, 7, 30));
    if (sup === 'forward') return V(clamp(bp.x * 0.5 + (bp.x > 0 ? -10 : 10), -A.HX + 8, A.HX - 8), 0, clamp(bp.z + at * 22, -A.HZ * 0.72, A.HZ * 0.72));
    if (sup === 'mid') return V(clamp(bp.x * 0.6 + (bp.x > 0 ? -12 : 12), -A.HX + 8, A.HX - 8), 0, clamp(bp.z - at * 15, -A.HZ + 12, A.HZ - 12));
    return V(clamp(bp.x * 0.4, -A.HX + 8, A.HX - 8), 0, clamp((bp.z + ownZ) / 2, -A.HZ + 10, A.HZ - 10));
  }
  planTarget(me) {
    const pd = this.sim.pads[this.plan.pad], u = this.plan.dir; const c = flat(pd.c);
    const rel = sub(flat(me.pos), c); const along = dot(rel, u), lat = len(sub(rel, mul(u, along)));
    // pure pursuit along the launch line through the pad centre
    const spd = Math.max(me.speed(), 8);
    if (along < -spd * 1.1 - 6 && lat > 2.5) return sub(c, mul(u, spd * 1.1 + 4));
    const look = clamp(spd * 0.55, 4, 12);
    return add(c, mul(u, Math.min(along + look, 10)));
  }

  update(dt) {
    const sim = this.sim, me = sim.cars[this.idx], L = this.L;
    this.thinkT -= dt;
    if (this.mode === 'kickoff') this.kickT += dt;
    if (this.thinkT <= 0) { this.think(); this.thinkT = L.think * (0.8 + Math.random() * 0.4); }
    if (this.mode === 'kickoff' && this.kickT < L.kickDelay) return { throttle: 0, steer: 0, handbrake: false };
    if (this.mode === 'launch' && this.plan) this.target = this.planTarget(me);
    if (this.mode === 'support' && me.groundedCount >= 3 && me.up().y > 0.9) { // in position: idle and keep facing the play
      const d = len(sub(flat(this.target), flat(me.pos)));
      if (d < 5) { const lb = qrot(qconj(me.q), sub(sim.ball.pos, me.pos)); const a = Math.atan2(lb.x, lb.z); const sp = me.speed();
        if (Math.abs(a) > 0.5 && Math.abs(sp) < 4) return { throttle: 0.45, steer: Math.sign(a), handbrake: false };
        return { throttle: sp > 2 ? -0.5 : 0, steer: 0, handbrake: false }; }
    }

    const p = me.pos, up = me.up();
    if (me.groundedCount === 0) return { throttle: 0, steer: 0, handbrake: false };
    const to = sub(V(this.target.x, 0.6, this.target.z), p); const dist = len(V(to.x, 0, to.z));
    const loc = qrot(qconj(me.q), to);
    const noise = this.mode === 'launch' ? 0 : this.noiseA * clamp(dist / 30, 0, 1);
    let ang = wrap(Math.atan2(loc.x, loc.z) + noise);
    const spd = me.speed();
    let throttle = L.cap, steer = clamp(ang * 2.6, -1, 1), handbrake = false;

    // ---------- on a side ramp ----------
    const ballP = sim.ball.pos; const bl = len(sub(ballP, p));
    const ballOnWall = S.wallDist(ballP.x, ballP.z) < A.RR + 1 && ballP.y > 2;
    if (up.y < 0.82) {
      this.rampT = (this.rampT || 0) + dt;
      const chaseHere = this.mode === 'attack' && ballOnWall && bl < 14 && this.rampT < 3;
      if (!chaseHere) {
        // drive back down the slope: steer toward local "downhill", reverse if facing up the wall
        const d = qrot(qconj(me.q), V(0, -1, 0)); const dAng = Math.atan2(d.x, d.z);
        const goal = wrap(lerp(ang, dAng, up.y < 0.5 ? 0.9 : 0.65));
        this.rampStill = Math.abs(spd) < 1 ? (this.rampStill || 0) + dt : 0;
        if (this.rampStill > 1.0) { this.wiggle = 0.8; this.rampStill = 0; }
        if (this.wiggle > 0) { this.wiggle -= dt; return { throttle: 1, steer: dAng > 0 ? -1 : 1, handbrake: false }; }
        this.dbg = 'rampRev'; if (Math.abs(dAng) > 2.0 && Math.abs(spd) < 6) return { throttle: -1, steer: clamp(-wrap(dAng - Math.PI) * 2.5, -1, 1), handbrake: false };
        this.dbg = 'rampDown'; return { throttle: 0.85, steer: clamp(goal * 2.8, -1, 1), handbrake: false };
      }
    } else this.rampT = 0;

    // ---------- inside a goal: back straight out ----------
    if (Math.abs(p.z) > A.HZ - 1 && Math.abs(ang) > 1.0 && this.reverseT <= 0) { const rearA = wrap(ang - Math.PI); return { throttle: -1, steer: clamp(-rearA * 2.2, -1, 1), handbrake: false }; }

    // ---------- stuck recovery ----------
    if (Math.abs(spd) < 1.2 && me.groundedCount >= 3 && this.reverseT <= 0) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.9) { this.reverseT = 0.6 + Math.random() * 0.5; this.stuckT = 0; this.revMode = 'turn'; }
    const nose = me.toWorld(V(0, 1.3, 4.0)); const blocked = up.y > 0.8 && S.sdf(nose.x, Math.max(nose.y, 2.6), nose.z) < 1.0;
    if (this.reverseT <= 0 && this.mode !== 'launch') {
      if (blocked && Math.abs(ang) > 0.6 && spd < 10) { this.reverseT = 1.3; this.revMode = 'turn'; }           // three-point turn away from a wall
      else if (Math.abs(ang) > 2.3 && dist < 10 && spd < 8) { this.reverseT = 1.0; this.revMode = 'aim'; }     // target just behind: back up onto it
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt; const rearA = wrap(ang - Math.PI);
      const st = this.revMode === 'free' ? this.revSteer : this.revMode === 'turn' ? -Math.sign(ang) : clamp(-rearA * 2.2, -1, 1);
      if (this.revMode === 'aim' && Math.abs(rearA) < 0.45 && this.reverseT < 0.7) this.reverseT = 0;
      if (this.revMode === 'turn' && Math.abs(ang) < 0.5 && this.reverseT < 1.0) this.reverseT = 0;
      this.dbg = 'rev-' + this.revMode; return { throttle: -1, steer: st, handbrake: false };
    }

    if (this.mode === 'launch' && this.plan) { // hold the planned launch speed and line
      const pd = sim.pads[this.plan.pad], u = this.plan.dir; const rel = sub(flat(p), flat(pd.c)); const along = dot(rel, u), lat = Math.abs(rel.x * u.z - rel.z * u.x);
      let want = this.plan.vh; if (lat > 2 && along < -3) want = Math.min(want, 13 + 30 / (lat + 1));
      throttle = spd < want - 1 ? 1 : spd > want + 3 ? -0.6 : 0.3;
      return { throttle, steer: clamp(ang * 3.2, -1, 1), handbrake: false };
    }

    // ---------- handbrake turn: swing the tail round when the target is well off to the side/behind ----------
    if (this.hbT > 0) {
      this.hbT -= dt;
      if (Math.abs(ang) < 0.75 || this.hbT <= 0 || me.groundedCount < 3 || spd < 4) { this.hbT = 0; this.hbCool = 0.8; }
      else return { throttle: 0.55, steer: Math.sign(ang), handbrake: true };
    }
    this.hbCool = Math.max(0, (this.hbCool || 0) - dt);
    const padNear = sim.pads.some(pd => pd.state === 'armed' && len(sub(flat(pd.c), flat(p))) < PAD.R + 9);
    // ---- orbit detector (all levels): how far have we travelled round the ball without touching it? ----
    { const b = sim.ball, rel = sub(flat(p), flat(b.pos)), dB = len(rel), a = Math.atan2(rel.x, rel.z);
      if (dB < 22 && this.mode === 'attack') { if (this.orbA != null) { let d = a - this.orbA; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; this.orbSum = (this.orbSum || 0) + d; } this.orbA = a; }
      else { this.orbA = null; this.orbSum = 0; }
      const touched = len(sub(flat(b.vel), flat(this.orbBV || b.vel))) > 2.5; this.orbBV = { ...b.vel }; if (touched) this.orbSum = 0;
      if (Math.abs(this.orbSum || 0) > 4.4) { this.orbSum = 0; this.directT = 2.8; } } // most of a lap round the ball: stop setting up and just hit it
    if (this.directT > 0) { this.directT -= dt; const b = sim.ball; const lb = qrot(qconj(me.q), sub(b.pos, p)); const ab = Math.atan2(lb.x, lb.z);
      if (Math.abs(ab) > 1.0 && spd > 5 && me.groundedCount >= 3) return { throttle: 0.75, steer: Math.sign(ab), handbrake: true };
      this.dbg = 'direct'; return { throttle: 1, steer: clamp(ab * 2.5, -1, 1), handbrake: false }; }
    // ---- handbrake pivot to strike: ball close and off to the side, pivot the nose onto it, then drive through ----
    { const b = sim.ball, lb = qrot(qconj(me.q), sub(b.pos, p)), dB = len(flat(lb)), ab = Math.atan2(lb.x, lb.z);
      const sd = this.shotDirSafe || null, okDir = !sd || dot(norm(flat(sub(b.pos, p))), V(sd.x, 0, sd.z)) > -0.15; // pivoting onto it mustn't fire it at our own goal
      if (this.pivotT > 0) { this.pivotT -= dt; if (Math.abs(ab) < 0.3 || this.pivotT <= 0) { this.pivotT = 0; this.hbCool = 0.6; } else return { throttle: 0.7, steer: Math.sign(ab), handbrake: true }; }
      if (L.hb && this.mode === 'attack' && this.hbCool <= 0 && b.pos.y < 2.8 && dB < 14 && dB > 3.5 && Math.abs(ab) > 0.9 && Math.abs(ab) < 2.5 && spd > 6 && spd < 22 && okDir && up.y > 0.9 && me.groundedCount >= 3) {
        this.pivotT = 0.9; this.dbg = 'pivot'; return { throttle: 0.7, steer: Math.sign(ab), handbrake: true }; } }
    if (L.flick && this.hbCool <= 0 && !padNear && !this.precise && Math.abs(ang) > 0.8 && Math.abs(ang) < L.hbAng && spd > 9 && spd < 19 && dist > 6 && dist < 30 && up.y > 0.9 && me.groundedCount >= 3) {
      this.hbT = 0.32; this.hbCool = 0.5; return { throttle: 0.6, steer: Math.sign(ang), handbrake: true }; } // quick flick of the handbrake to tighten the line
    if (L.hb && this.hbCool <= 0 && !padNear && !(this.precise && dist < 25) && Math.abs(ang) > L.hbAng && spd > 11 && spd < 23 && dist > 8 && up.y > 0.9 && me.groundedCount >= 3) {
      this.hbT = 1.1; return { throttle: 0.55, steer: Math.sign(ang), handbrake: true };
    }

    // ---------- steer around pads we don't mean to use, and the other car ----------
    if (L.avoid > 0) {
      for (const pd of sim.pads) {
        if (pd.state !== 'armed') continue;
        const lp = qrot(qconj(me.q), sub(flat(pd.c), flat(p)));
        if (lp.z > 1 && lp.z < Math.max(spd, 6) * 1.1 + 5 && Math.abs(lp.x) < PAD.R + 1.6 && dist > lp.z - 2) {
          const push = (PAD.R + 2 - Math.abs(lp.x)) / (PAD.R + 2); steer = clamp(steer + (lp.x > 0 ? -1 : 1) * push * 1.4 * L.avoid, -1, 1);
        }
      }
    }
    for (const other of sim.cars) { if (other === me) continue; const lo = qrot(qconj(me.q), sub(other.pos, p)); const mate = other.team === me.team;
      if (lo.z > 0 && lo.z < (mate ? 12 : 9) && Math.abs(lo.x) < (mate ? 3.4 : 2.8) && dist > lo.z + 2 && (bl > 6 || mate)) steer = clamp(steer + (lo.x > 0 ? -0.9 : 0.9), -1, 1); }

    // ---------- throttle: flat out unless we'd overshoot the turn ----------
    const R = Math.max(dist, 5) / (2 * Math.max(Math.sin(Math.min(Math.abs(ang), 1.5)), 0.03));
    const vTurn = Math.sqrt(16 * R) * 1.05;
    const vLim = Math.min(vTurn, this.speedCap || 99);
    // chasing a ball that's running away from us: never brake
    const bv = sim.ball.vel; const chasing = bl < 30 && dot(norm(flat(sub(ballP, p))), flat(me.forward())) > 0.8 && dot(flat(bv), flat(me.forward())) > 8;
    if (L.hb && Math.abs(ang) > L.hbAng && spd >= 23) return { throttle: -1, steer, handbrake: false };
    if (this.precise) {
      // the ball is inside our turning circle: brake, and if we're already slow, back up and turn in (three-point turn)
      const minR = me.spec.wheelbase / Math.tan(me.spec.steerLo * 0.95), need = dist / (2 * Math.max(Math.sin(Math.min(Math.abs(ang), 1.57)), 0.05));
      if (need < minR * 1.1 && Math.abs(ang) > 0.9) { if (spd > 5) return { throttle: -1, steer, handbrake: false }; this.reverseT = 0.9; this.revMode = 'turn'; return { throttle: -1, steer: -Math.sign(ang), handbrake: false }; }
      const vl = Math.min(vLim, this.speedCap || 99); if (spd > vl + 1) throttle = spd > vl + 5 ? -0.8 : 0;
    }
    else if (!chasing && Math.abs(ang) > 0.35) { if (spd > vLim + 6 * L.brake + 2) throttle = -0.6; else if (spd > vLim) throttle = 0.15; }
    this.dbg = 'drive a=' + ang.toFixed(2); return { throttle, steer, handbrake };
  }
}

const api = { Bot, LEVELS, STYLES, predictBall };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RLBot = api;
})(typeof window !== 'undefined' ? window : globalThis);

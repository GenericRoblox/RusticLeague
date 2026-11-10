// ===================== RUSTIC LEAGUE — PHYSICS SIM =====================
// Pure JS, no rendering dependencies. Units: meters, seconds, kg.
(function (root) {
'use strict';

// ---------- vector / quaternion helpers ----------
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = a => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const norm = a => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : V(0, 0, 0); };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const Q = (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w });
function qmul(a, b) {
  return Q(a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);
}
function qnorm(q) { const l = Math.hypot(q.x, q.y, q.z, q.w) || 1; return Q(q.x / l, q.y / l, q.z / l, q.w / l); }
function qrot(q, v) { // rotate v by q
  const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return V(v.x + q.w * tx + (q.y * tz - q.z * ty), v.y + q.w * ty + (q.z * tx - q.x * tz), v.z + q.w * tz + (q.x * ty - q.y * tx));
}
const qconj = q => Q(-q.x, -q.y, -q.z, q.w);
function qaxis(ax, ang) { const s = Math.sin(ang / 2); return Q(ax.x * s, ax.y * s, ax.z * s, Math.cos(ang / 2)); }
function qyaw(a) { return qaxis(V(0, 1, 0), a); }

// ---------- arena definition ----------
const A = {
  HX: 38, HZ: 77, RC: 14, RR: 6.5, H: 26, GW: 9, GH: 7.2, GD: 8.5,
  WALL_TOP: 11.5, FENCE_Y: 13, G: 13.0
};
function fenceInset(y) { return y < A.FENCE_Y ? 0 : 2.6 * Math.pow((y - A.FENCE_Y) / (A.H - A.FENCE_Y), 2); }
function sdRoundRect(x, z, hx, hz, r) {
  const qx = Math.abs(x) - (hx - r), qz = Math.abs(z) - (hz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
// distance to wall line in XZ (positive = inside arena)
function wallDist(x, z) { return -sdRoundRect(x, z, A.HX, A.HZ, A.RC); }
function arenaFree(x, y, z) {
  const w = wallDist(x, z) - fenceInset(y), r = A.RR;
  let d;
  if (w < r && y < r) d = r - Math.hypot(w - r, y - r);
  else d = Math.min(w, y);
  return Math.min(d, A.H - y);
}
function goalFree(x, y, z) {
  const lz = Math.abs(z);
  return Math.min(A.GW - Math.abs(x), y, A.GH - y, A.HZ + A.GD - lz);
}
// moulded plastic goal posts & crossbar standing proud of the end wall
const FRAME = []; // crossbars, flush on the end walls
function rebuildFrame() { FRAME.length = 0; for (const sz of [-1, 1]) FRAME.push([0, A.GH + 0.27, sz * (A.HZ - 0.2), A.GW + 0.45, 0.27, 0.2]); }
rebuildFrame();
// the whole arena grows with team size (about 12.5% per extra player a side)
const BASE = { HX: 38, HZ: 77, RC: 14, GW: 9, GH: 7.2, GD: 8.5, H: 26 };
function setArenaScale(sc) {
  A.scale = sc; A.HX = BASE.HX * sc; A.HZ = BASE.HZ * sc; A.RC = BASE.RC * sc; A.GW = BASE.GW * sc; A.GH = BASE.GH * Math.min(sc, 1.25); A.GD = BASE.GD * sc; A.H = BASE.H * (1 + (sc - 1) * 0.5);
  PAD_POS.length = 0; for (const [x, z] of PAD_BASE) PAD_POS.push(V(x * sc, 0, z * sc)); rebuildFrame();
}
const teamScale = n => 1 + 0.125 * (n - 1);
function frameDist(x, y, z) {
  if (Math.abs(z) < A.HZ - 3) return 1e9; let d = 1e9;
  for (const [cx, cy, cz, hx, hy, hz] of FRAME) { const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
    d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0)); }
  return d;
}
function sdf(x, y, z) { return Math.min(Math.max(arenaFree(x, y, z), goalFree(x, y, z)), frameDist(x, y, z)); }
function sdfNormal(p) {
  const e = 0.01;
  return norm(V(sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
    sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
    sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e)));
}
function raymarch(o, d, maxT) {
  let t = 0;
  for (let i = 0; i < 24; i++) {
    const p = add(o, mul(d, t)); const s = sdf(p.x, p.y, p.z);
    if (s < 0.004) return { t, p, n: sdfNormal(p) };
    t += s; if (t > maxT) return null;
  }
  return null;
}

// ---------- rigid body ----------
class Body {
  constructor(mass, I) {
    this.m = mass; this.invM = mass > 0 ? 1 / mass : 0;
    this.I = I; this.invI = V(1 / I.x, 1 / I.y, 1 / I.z);
    this.pos = V(); this.vel = V(); this.ang = V(); this.q = Q();
    this.prevPos = V(); this.prevQ = Q();
  }
  invIw(v) { const l = qrot(qconj(this.q), v); return qrot(this.q, V(l.x * this.invI.x, l.y * this.invI.y, l.z * this.invI.z)); }
  Iw(v) { const l = qrot(qconj(this.q), v); return qrot(this.q, V(l.x * this.I.x, l.y * this.I.y, l.z * this.I.z)); }
  velAt(p) { return add(this.vel, cross(this.ang, sub(p, this.pos))); }
  impulse(J, p) {
    this.vel = add(this.vel, mul(J, this.invM));
    this.ang = add(this.ang, this.invIw(cross(sub(p, this.pos), J)));
  }
  toWorld(lp) { return add(this.pos, qrot(this.q, lp)); }
  dir(ld) { return qrot(this.q, ld); }
  integrate(dt) {
    this.pos = add(this.pos, mul(this.vel, dt));
    const w = this.ang, dq = qmul(Q(w.x, w.y, w.z, 0), this.q);
    this.q = qnorm(Q(this.q.x + dq.x * 0.5 * dt, this.q.y + dq.y * 0.5 * dt, this.q.z + dq.z * 0.5 * dt, this.q.w + dq.w * 0.5 * dt));
  }
  // effective inverse mass along n at point p
  kAt(p, n) { const rn = cross(sub(p, this.pos), n); return this.invM + dot(n, cross(this.invIw(rn), sub(p, this.pos))); }
}

// ---------- car spec ----------
// ---------- car specs (model units are real-world metres before the shared K scale) ----------
const K = 1.12;
function makeSpec(o) {
  const sv3 = (x, y, z) => V(x * K, y * K, z * K);
  const cm = sv3(...o.com);
  const sp = {
    ...o, K,
    wheels: [{ x: -o.track * K, z: (o.axF - o.com[2]) * K, f: 1 }, { x: o.track * K, z: (o.axF - o.com[2]) * K, f: 1 }, { x: -o.track * K, z: (o.axR - o.com[2]) * K, f: 0 }, { x: o.track * K, z: (o.axR - o.com[2]) * K, f: 0 }],
    radius: o.R * K, rest: o.rest * K, maxComp: o.maxComp * K, attachY: (o.R + o.rest - o.sag - o.com[1]) * K,
    boxes: o.boxes.map(b => ({ c: sv3(b[0], b[1] - o.com[1], b[2] - o.com[2]), h: sv3(b[3], b[4], b[5]) })),
    comModel: cm, wheelbase: (o.axF - o.axR) * K, rollY: (o.rollH - o.com[1]) * K,
  };
  const L = o.dims; sp.I = V(o.mass / 12 * (L[1] * L[1] + L[2] * L[2]) * K * K * o.iMul, o.mass / 12 * (L[0] * L[0] + L[2] * L[2]) * K * K * o.iMul, o.mass / 12 * (L[0] * L[0] + L[1] * L[1]) * K * K * o.iMul * 1.4);
  sp.k = o.mass * A.G / 4 / (o.sag * K);
  // contact hull: box corners + mid-length points + nose/tail
  sp.hull = [];
  sp.boxes.forEach((b, bi) => { for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 0, 1]) { if (bi > 0 && y < 0) continue; sp.hull.push(V(b.c.x + x * b.h.x * 0.97, b.c.y + y * b.h.y, b.c.z + z * b.h.z * 0.98)); } });
  const b0 = sp.boxes[0]; sp.hull.push(V(0, b0.c.y, b0.c.z + b0.h.z * 1.01), V(0, b0.c.y, b0.c.z - b0.h.z * 1.01));
  return sp;
}
// '77 personal-luxury coupe: the all-rounder
const COUPE = makeSpec({ type: 'coupe', name: 'Coupe', mass: 1350, dims: [2.0, 1.1, 5.4], iMul: 1.05, com: [0, 0.62, 0.08], track: 0.83, axF: 1.46, axR: -1.49, R: 0.40, rest: 0.48, sag: 0.1625, maxComp: 0.38,
  damp: 2800, antiRoll: 16000, boxes: [[0, 0.75, 0.10, 0.98, 0.42, 2.66], [0, 1.24, -0.47, 0.80, 0.16, 0.95]], rollH: 0.34,
  engineF: 15800, vmax: 34, revF: 9800, vrev: 13, brakeF: 17500, muF: 1.22, muR: 1.32, muHB: 0.62, yawAssist: 5600, steerLo: 0.62, steerHi: 0.16, steerRate: 1, ballE: 0.5 });
// '70s full-size cargo van: slow, tall, heavy, a rolling wall
const VAN = makeSpec({ type: 'van', name: 'Van', mass: 2050, dims: [2.02, 2.0, 4.95], iMul: 1.1, com: [0, 0.98, 0.2], track: 0.86, axF: 1.62, axR: -1.17, R: 0.41, rest: 0.62, sag: 0.22, maxComp: 0.48,
  damp: 3900, antiRoll: 30000, boxes: [[0, 1.30, 0.03, 1.0, 0.76, 2.46]], rollH: 0.62,
  engineF: 19500, vmax: 29, revF: 12500, vrev: 11, brakeF: 23000, muF: 1.12, muR: 1.18, muHB: 0.58, yawAssist: 9000, steerLo: 0.55, steerHi: 0.14, steerRate: 0.8, ballE: 0.56 });
// rear-engined '60s bug: light, quick, nimble and low, with a small nose to hit with
const BUGGY = makeSpec({ type: 'buggy', name: 'Buggy', mass: 820, dims: [1.55, 1.5, 4.08], iMul: 0.9, com: [0, 0.55, -0.06], track: 0.66, axF: 1.22, axR: -1.18, R: 0.36, rest: 0.40, sag: 0.12, maxComp: 0.30,
  damp: 1900, antiRoll: 10000, boxes: [[0, 0.62, 0.02, 0.78, 0.33, 2.02], [0, 1.22, -0.2, 0.6, 0.27, 0.8]], rollH: 0.28,
  engineF: 12000, vmax: 37, revF: 7500, vrev: 13, brakeF: 13000, muF: 1.45, muR: 1.42, muHB: 0.66, yawAssist: 3800, steerLo: 0.7, steerHi: 0.23, steerRate: 1.35, ballE: 0.47 });
const CARS = { coupe: COUPE, van: VAN, buggy: BUGGY };
const CAR = COUPE;

class Car extends Body {
  constructor(id, spec = COUPE, team = 0) {
    super(spec.mass, spec.I);
    this.id = id; this.spec = spec; this.team = team;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.steerCur = 0;
    this.wheels = spec.wheels.map(w => ({ ...w, comp: 0, prevComp: 0, grounded: false, n: V(0, 1, 0), p: V(), spin: 0, spinAngle: 0, slip: 0, onPad: -1, load: 0 }));
    this.groundedCount = 0; this.upsideTimer = 0; this.rightCooldown = 0;
    this.airTime = 0; this.lastPad = -1; this.frozen = false; this.rockPhase = 0;
  }
  forward() { return this.dir(V(0, 0, 1)); }
  up() { return this.dir(V(0, 1, 0)); }
  right() { return this.dir(V(1, 0, 0)); }
  speed() { return dot(this.vel, this.forward()); }
}

class Ball extends Body {
  constructor() { const m = 180, r = 1.55; super(m, V(2 / 3 * m * r * r, 2 / 3 * m * r * r, 2 / 3 * m * r * r)); this.r = r; }
}

// ---------- launch pads ----------
const PAD = { R: 2.8, T: 0.22, lift: 0.72, thetaMax: 0.01, fireTime: 0.085, hold: 0.4, retract: 2.0, cooldown: 1.8, minSpeed: 6,
  get hingeD() { return this.lift / Math.sin(this.thetaMax); },
  profile: u => u < 0.5 ? 2 * u * u * 1.0 + 0 : 1 - 2 * (1 - u) * (1 - u) };
const PAD_BASE = [[-22, -46], [22, -46], [-22, 46], [22, 46], [-28, -12], [28, -12], [-28, 12], [28, 12]];
const PAD_POS = PAD_BASE.map(([x, z]) => V(x, 0, z));
class Pad {
  constructor(i, p) {
    this.i = i; this.c = p; this.state = 'armed'; this.t = 0; this.theta = 0; this.omega = 0;
    this.dir = V(0, 0, 1); this.axis = V(1, 0, 0); this.hingeP = V(); this.yaw = 0;
    this.q = Q(); this.center = V(p.x, -PAD.T / 2, p.z); this.charge = 1;
  }
  setDir(d) {
    this.dir = norm(V(d.x, 0, d.z)); this.axis = cross(V(0, 1, 0), this.dir);
    this.hingeP = add(this.c, mul(this.dir, PAD.hingeD)); this.yaw = Math.atan2(this.dir.x, this.dir.z);
  }
  update(dt) {
    let om = 0;
    if (this.state === 'fire') {
      this.t += dt; const u = Math.min(this.t / PAD.fireTime, 1);
      const th = PAD.thetaMax * PAD.profile(u); om = (th - this.theta) / dt; this.theta = th;
      if (u >= 1) { this.state = 'hold'; this.t = 0; }
    }
    else if (this.state === 'hold') { this.t += dt; if (this.t > PAD.hold) { this.state = 'retract'; this.t = 0; } }
    else if (this.state === 'retract') { om = -PAD.thetaMax / PAD.retract; this.theta += om * dt; if (this.theta <= 0) { this.theta = 0; this.state = 'cool'; this.t = 0; } }
    else if (this.state === 'cool') { this.t += dt; if (this.t > PAD.cooldown) { this.state = 'armed'; } }
    this.omega = om;
    this.pose();
  }
  pose() {
    this.charge = this.state === 'armed' ? 1 : this.state === 'cool' ? this.t / PAD.cooldown * 0.5 + 0.5 : this.state === 'retract' ? (1 - this.theta / PAD.thetaMax) * 0.5 : 0;
    // pose: rotate base pose around hinge axis by theta
    this.q = qmul(qaxis(this.axis, this.theta), qyaw(this.yaw));
    const rel = sub(V(this.c.x, -PAD.T / 2, this.c.z), V(this.hingeP.x, 0, this.hingeP.z));
    this.center = add(V(this.hingeP.x, 0, this.hingeP.z), qrot(qaxis(this.axis, this.theta), rel));
  }
  up() { return qrot(this.q, V(0, 1, 0)); }
  topCenter() { return add(this.center, mul(this.up(), PAD.T / 2)); }
  surfVel(p) { return cross(mul(this.axis, this.omega), sub(p, V(this.hingeP.x, 0, this.hingeP.z))); }
  toLocal(p) { return qrot(qconj(this.q), sub(p, this.center)); }
  active() { return this.theta > 0.0005; }
}

// ---------- world ----------
// kickoff spots for the -z team (x, z, yaw), before arena scaling
const KICK = {
  1: [[[0, -52, 0]], [[-18, -45, 0.38]], [[18, -45, -0.38]]],
  2: [[[-18, -45, 0.38], [6, -62, 0]], [[18, -45, -0.38], [-6, -62, 0]], [[0, -52, 0], [-14, -64, 0.2]]],
  3: [[[-18, -45, 0.38], [18, -45, -0.38], [0, -63, 0]], [[0, -52, 0], [-22, -58, 0.3], [22, -58, -0.3]]],
  4: [[[-18, -45, 0.38], [18, -45, -0.38], [-8, -63, 0.1], [8, -63, -0.1]], [[0, -52, 0], [-22, -56, 0.3], [22, -56, -0.3], [0, -68, 0]]],
};
class Sim {
  constructor(opts = {}) {
    this.dt = 1 / 120; this.time = 0;
    this.teamSize = opts.teamSize || 1;
    const types = opts.types || [];
    this.cars = []; for (let t = 0; t < 2; t++) for (let k = 0; k < this.teamSize; k++) { const i = this.cars.length; this.cars.push(new Car(i, CARS[types[i]] || COUPE, t)); }
    this.ball = new Ball();
    this.pads = PAD_POS.map((p, i) => new Pad(i, p));
    this.events = [];
    this.resetKickoff(0);
  }
  team(t) { return this.cars.filter(c => c.team === t); }
  // ---- network snapshots: compact numeric arrays, host -> clients ----
  snapshot() {
    const r = x => Math.round(x * 1000) / 1000, b = this.ball, ST = ['armed', 'fire', 'hold', 'retract', 'cool'];
    return { b: [b.pos.x, b.pos.y, b.pos.z, b.q.x, b.q.y, b.q.z, b.q.w, b.vel.x, b.vel.y, b.vel.z].map(r),
      c: this.cars.map(c => { let slip = 0; c.wheels.forEach(w => { if (w.grounded) slip = Math.max(slip, w.slip); });
        return [c.pos.x, c.pos.y, c.pos.z, c.q.x, c.q.y, c.q.z, c.q.w, c.vel.x, c.vel.y, c.vel.z, c.steerCur, c.input.throttle, c.input.handbrake ? 1 : 0, ...c.wheels.map(w => w.comp), slip, c.groundedCount, c.ang.x, c.ang.y, c.ang.z].map(r); }),
      p: this.pads.map(pd => [r(pd.theta), ST.indexOf(pd.state), r(pd.yaw), r(pd.t)]) };
  }
  applySnapshot(S) {
    const ST = ['armed', 'fire', 'hold', 'retract', 'cool']; const b = this.ball;
    const setB = (o, a) => { o.prevPos = { ...o.pos }; o.prevQ = { ...o.q }; o.pos = V(a[0], a[1], a[2]); o.q = Q(a[3], a[4], a[5], a[6]); o.vel = V(a[7], a[8], a[9]); };
    setB(b, S.b);
    S.c.forEach((a, i) => { const c = this.cars[i]; if (!c) return; setB(c, a); c.steerCur = a[10]; c.input = { throttle: a[11], steer: 0, handbrake: !!a[12] };
      c.wheels.forEach((w, k) => { w.comp = a[13 + k]; w.grounded = a[18] > 0; w.slip = a[17]; w.spin = c.speed() / c.spec.radius; }); c.groundedCount = a[18]; c.ang = V(a[19], a[20], a[21]); });
    S.p.forEach((a, i) => { const pd = this.pads[i]; if (!pd) return; pd.theta = a[0]; pd.state = ST[a[1]] || 'armed'; pd.t = a[3];
      if (Math.abs(pd.yaw - a[2]) > 1e-3) pd.setDir(V(Math.sin(a[2]), 0, Math.cos(a[2]))); pd.pose(); });
  }
  resetKickoff(variant = 0) {
    const sets = KICK[this.teamSize] || KICK[1]; const set = sets[variant % sets.length]; const sc = A.scale || 1;
    for (let t = 0; t < 2; t++) { const mem = this.team(t);
      mem.forEach((c, k) => { const [x, z, yaw] = set[(k + (t === 1 ? 0 : 0)) % set.length]; const sx = t === 0 ? 1 : -1;
        this.placeCar(c, V(x * sc * sx, 0, z * sc * sx), t === 0 ? yaw : Math.PI + yaw); }); }
    const b = this.ball; b.pos = V(0, b.r + 0.02, 0); b.vel = V(); b.ang = V(); b.q = Q();
    b.prevPos = { ...b.pos }; b.prevQ = { ...b.q };
    for (const pd of this.pads) { pd.state = 'armed'; pd.theta = 0; pd.omega = 0; pd.setDir(V(0, 0, 1)); pd.update(0); }
  }
  placeCar(c, p, yaw) {
    c.q = qyaw(yaw); const restH = c.spec.comModel.y;
    c.pos = V(p.x, restH + 0.02, p.z); c.vel = V(); c.ang = V(); c.steerCur = 0;
    c.prevPos = { ...c.pos }; c.prevQ = { ...c.q }; c.upsideTimer = 0;
    for (const w of c.wheels) { w.comp = w.prevComp = 0.16; w.spin = 0; }
  }
  emit(e) { this.events.push(e); }

  step(inputs) {
    const dt = this.dt; this.time += dt;
    for (const b of [...this.cars, this.ball]) { b.prevPos = { ...b.pos }; b.prevQ = { ...b.q }; }
    for (const pd of this.pads) pd.update(dt);
    const fin = v => (typeof v === 'number' && Number.isFinite(v)) ? v : 0; // never let a bad input poison the car state
    this.cars.forEach((c, i) => { const inp = inputs && inputs[i]; c.input = c.frozen || !inp ? { throttle: 0, steer: 0, handbrake: false } : { throttle: fin(inp.throttle), steer: fin(inp.steer), handbrake: !!inp.handbrake };
      if (!Number.isFinite(c.steerCur)) c.steerCur = 0; });
    const contacts = [];
    for (const c of this.cars) this.carForces(c, dt, contacts);
    // ball gravity & damping
    const b = this.ball;
    b.vel.y -= A.G * dt;
    b.vel = mul(b.vel, 1 - 0.03 * dt); b.ang = mul(b.ang, 1 - 0.35 * dt);
    // contacts
    for (const c of this.cars) this.carWorldContacts(c, contacts);
    this.ballWorldContacts(contacts);
    for (const c of this.cars) this.carBallContact(c, contacts);
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) this.carCarContacts(this.cars[i], this.cars[j], contacts);
    this.solve(contacts, dt);
    // positional fix for ball penetrations (static)
    for (const ct of contacts) if (ct.B === null && ct.A === b && ct.pen > 0.02) b.pos = add(b.pos, mul(ct.n, (ct.pen - 0.02) * 0.5));
    // clamp speeds
    const bs = len(b.vel); if (bs > 62) b.vel = mul(b.vel, 62 / bs);
    for (const c of this.cars) { const s = len(c.vel); if (s > 60) c.vel = mul(c.vel, 60 / s); const a = len(c.ang); if (a > 9) c.ang = mul(c.ang, 9 / a); }
    for (const c of this.cars) c.integrate(dt);
    b.integrate(dt);
    for (const c of this.cars) { this.padTriggers(c); this.selfRight(c, dt); }
    this.safety();
  }

  wheelProbe(o, d, maxT) {
    // nearest of SDF and active pad plates
    let best = raymarch(o, d, maxT); let pad = -1;
    for (const pd of this.pads) {
      if (Math.abs(o.x - pd.c.x) > PAD.R + 4 || Math.abs(o.z - pd.c.z) > PAD.R + 4) continue;
      const n = pd.up(), top = pd.topCenter(); const dn = dot(d, n); if (dn > -0.05) continue;
      const t = dot(sub(top, o), n) / dn; if (t < -0.3 || t > maxT) continue;
      const hp = add(o, mul(d, t)); const lp = pd.toLocal(hp);
      if (lp.x * lp.x + lp.z * lp.z > PAD.R * PAD.R) continue;
      if (!best || t < best.t) { best = { t: Math.max(t, 0), p: hp, n }; pad = pd.i; }
    }
    if (best) best.pad = pad;
    return best;
  }

  carForces(c, dt, contacts) {
    const inp = c.input, up = c.up(), fwd = c.forward();
    const speedF = dot(c.vel, fwd), absS = Math.abs(speedF);
    // steering
    const maxSteer = lerp(c.spec.steerLo, c.spec.steerHi, clamp(absS / 30, 0, 1));
    const target = clamp(inp.steer, -1, 1) * maxSteer;
    const rate = (Math.abs(target) < Math.abs(c.steerCur) ? 7 : 4.5) * maxSteer * c.spec.steerRate;
    c.steerCur += clamp(target - c.steerCur, -rate * dt, rate * dt);
    // engine / brake demand (total longitudinal force, split later)
    let drive = 0, brake = 0; const thr = clamp(inp.throttle, -1, 1);
    if (thr > 0.01) { if (speedF < -1) brake = c.spec.brakeF * thr; else drive = c.spec.engineF * thr * clamp(1 - Math.pow(Math.max(speedF, 0) / c.spec.vmax, 2), 0, 1); }
    else if (thr < -0.01) { if (speedF > 1) brake = c.spec.brakeF * -thr; else drive = -c.spec.revF * -thr * clamp(1 - Math.pow(Math.max(-speedF, 0) / c.spec.vrev, 2), 0, 1); }
    // suspension pass
    let g = 0;
    for (const w of c.wheels) {
      const attach = c.toWorld(V(w.x, c.spec.attachY, w.z));
      const hit = this.wheelProbe(attach, mul(up, -1), c.spec.rest + c.spec.radius);
      w.prevComp = w.comp;
      if (hit) {
        const dist = hit.t - c.spec.radius; w.comp = clamp(c.spec.rest - dist, 0, c.spec.rest + 0.2);
        w.grounded = true; w.n = hit.n; w.p = hit.p; w.onPad = hit.pad; g++;
      } else { w.comp = 0; w.grounded = false; w.onPad = -1; }
    }
    c.groundedCount = g;
    const ar = [0, 0, 0, 0];
    for (let a = 0; a < 2; a++) { const l = c.wheels[a * 2], r = c.wheels[a * 2 + 1]; if (l.grounded && r.grounded) { const f = c.spec.antiRoll * (l.comp - r.comp); ar[a * 2] = f; ar[a * 2 + 1] = -f; } }
    const gr = c.wheels.filter(w => w.grounded);
    const nDriveF = c.wheels.filter(w => w.grounded && w.f).length, nDriveR = c.wheels.filter(w => w.grounded && !w.f).length;
    c.wheels.forEach((w, i) => {
      const steerA = w.f ? c.steerCur : 0;
      if (!w.grounded) { w.load = 0; w.slip = 0; w.spin = lerp(w.spin, w.spin * 0.98, 1); return; }
      const compVel = (w.comp - w.prevComp) / dt;
      let Fs = c.spec.k * Math.min(w.comp, c.spec.maxComp) + c.spec.damp * compVel + ar[i];
      Fs = clamp(Fs, 0, 60000); w.load = Fs;
      const attach = c.toWorld(V(w.x, c.spec.attachY, w.z));
      c.impulse(mul(up, Fs * dt), attach);
      // bump stop as hard contact
      if (w.comp > c.spec.maxComp) {
        const pd = w.onPad >= 0 ? this.pads[w.onPad] : null;
        contacts.push({ A: c, B: null, p: w.p, n: w.n, pen: w.comp - c.spec.maxComp, mu: 0, e: 0.05, vs: pd ? pd.surfVel(w.p) : V(), wheel: true });
      }
      // tire frame
      const n = w.n;
      const wf0 = c.dir(V(Math.sin(steerA), 0, Math.cos(steerA)));
      let wf = norm(sub(wf0, mul(n, dot(wf0, n)))); if (len(wf) < 0.5) wf = fwd;
      const ws = cross(n, wf);
      const app = c.toWorld(V(w.x, c.spec.rollY, w.z));
      const pd = w.onPad >= 0 ? this.pads[w.onPad] : null;
      let vc = c.velAt(w.p); if (pd) vc = sub(vc, pd.surfVel(w.p));
      const vl = dot(vc, wf), vs = dot(vc, ws);
      w.spin = vl / c.spec.radius;
      const Fz = Math.min(Fs, c.spec.mass * A.G * 0.9);
      let Flong = 0, Flat = 0;
      if (inp.handbrake && !w.f) {
        // locked wheel: friction opposes slip velocity
        const sv = Math.hypot(vl, vs); const mu = c.spec.muHB * Fz;
        if (sv > 0.05) { Flong = -mu * vl / sv; Flat = -mu * vs / sv; } else { Flong = -vl * 3000; Flat = -vs * 3000; }
        w.spin = 0; w.slip = clamp(sv / 8, 0, 1);
      } else {
        const mu = (w.f ? c.spec.muF : c.spec.muR) * Fz;
        const vsat = Math.max(0.9, 0.11 * Math.abs(vl));
        Flat = -mu * clamp(vs / vsat, -1, 1);
        const share = w.f ? (nDriveF ? 0.42 / nDriveF * 2 : 0) : (nDriveR ? 0.58 / nDriveR * 2 : 0);
        Flong = drive * share / 2;
        if (inp.handbrake && w.f) Flong = drive * 0.5;
        if (brake > 0) Flong += -clamp(vl * 4000, -brake / Math.max(gr.length, 1), brake / Math.max(gr.length, 1));
        if (Math.abs(thr) < 0.01) Flong += -vl * 28;
        // friction circle with lateral priority (keeps the car catchable after a slide)
        const latMax = Math.abs(Flat), longMax = Math.sqrt(Math.max(mu * mu - latMax * latMax, 0)) + mu * 0.25;
        Flong = clamp(Flong, -longMax, longMax);
        w.slip = clamp((Math.abs(vs) - vsat) / 6, 0, 1);
      }
      c.impulse(mul(add(mul(wf, Flong), mul(ws, Flat)), dt), app);
    });
    // tyre self-aligning stabilisation: pulls the yaw rate back toward what the front wheels ask for
    if (g >= 3 && !inp.handbrake) {
      const gripYaw = 1.25 * A.G / Math.max(Math.abs(speedF), 1);
      const desired = clamp(speedF * Math.tan(c.steerCur) / c.spec.wheelbase, -gripYaw, gripYaw);
      const yaw = dot(c.ang, up);
      // only resist yaw beyond what's asked for (oversteer); never add rotation
      const err = (Math.sign(yaw) !== Math.sign(desired) || Math.abs(yaw) > Math.abs(desired)) ? yaw - (Math.sign(yaw) === Math.sign(desired) ? desired : 0) : 0;
      const tq = clamp(-err * c.spec.yawAssist, -9000, 9000);
      c.ang = add(c.ang, c.invIw(mul(up, tq * dt)));
    }
    // gravity, aero
    c.vel.y -= A.G * dt;
    const sp = len(c.vel);
    c.vel = sub(c.vel, mul(c.vel, 0.42 * sp / c.spec.mass * dt));
    if (g >= 2) c.impulse(mul(up, -1.6 * sp * sp * dt), c.pos);
    if (g === 0) { c.ang = mul(c.ang, 1 - 0.05 * dt); c.airTime += dt; } else c.airTime = 0;
    // wheel visual spin
    for (const w of c.wheels) w.spinAngle += w.spin * dt;
  }

  carWorldContacts(c, contacts) {
    for (const lp of c.spec.hull) {
      const p = c.toWorld(lp);
      const s = sdf(p.x, p.y, p.z);
      if (s < 0.02) contacts.push({ A: c, B: null, p, n: sdfNormal(p), pen: 0.02 - s, mu: 0.45, e: 0.18, vs: V() });
      for (const pd of this.pads) {
        if (!pd.active()) continue;
        if (Math.abs(p.x - pd.c.x) > PAD.R + 3 || Math.abs(p.z - pd.c.z) > PAD.R + 3) continue;
        const l = pd.toLocal(p);
        if (l.x * l.x + l.z * l.z < PAD.R * PAD.R && l.y < PAD.T / 2 && l.y > -PAD.T / 2 - 0.4)
          contacts.push({ A: c, B: null, p, n: pd.up(), pen: PAD.T / 2 - l.y, mu: 0.6, e: 0.05, vs: pd.surfVel(p) });
      }
    }
  }
  ballWorldContacts(contacts) {
    const b = this.ball, p = b.pos;
    const s = sdf(p.x, p.y, p.z);
    if (s < b.r) { const n = sdfNormal(p); contacts.push({ A: b, B: null, p: sub(p, mul(n, b.r)), n, pen: b.r - s, mu: 0.4, e: 0.62, vs: V() }); }
    for (const pd of this.pads) {
      if (!pd.active()) continue;
      const l = pd.toLocal(p);
      if (l.x * l.x + l.z * l.z < PAD.R * PAD.R && l.y - b.r < PAD.T / 2 && l.y > -0.3) {
        const n = pd.up(), cp = sub(p, mul(n, b.r));
        contacts.push({ A: b, B: null, p: cp, n, pen: PAD.T / 2 - (l.y - b.r), mu: 0.5, e: 0.3, vs: pd.surfVel(cp) });
      }
    }
  }
  boxClosest(c, box, wp) { // returns {cp (world), d, n} closest point on oriented box
    const l = qrot(qconj(c.q), sub(wp, c.pos)); const rel = sub(l, box.c);
    const cl = V(clamp(rel.x, -box.h.x, box.h.x), clamp(rel.y, -box.h.y, box.h.y), clamp(rel.z, -box.h.z, box.h.z));
    const inside = cl.x === rel.x && cl.y === rel.y && cl.z === rel.z;
    if (inside) { // push out along min axis
      const dx = box.h.x - Math.abs(rel.x), dy = box.h.y - Math.abs(rel.y), dz = box.h.z - Math.abs(rel.z);
      let nl, pen;
      if (dx < dy && dx < dz) { nl = V(Math.sign(rel.x) || 1, 0, 0); pen = dx; } else if (dy < dz) { nl = V(0, Math.sign(rel.y) || 1, 0); pen = dy; } else { nl = V(0, 0, Math.sign(rel.z) || 1); pen = dz; }
      return { inside: true, n: c.dir(nl), pen, cp: wp };
    }
    const cpW = c.toWorld(add(cl, box.c)); const dv = sub(wp, cpW); const d = len(dv);
    return { inside: false, n: mul(dv, 1 / d), d, cp: cpW };
  }
  carBallContact(c, contacts) {
    const b = this.ball; if (len(sub(b.pos, c.pos)) > 7) return;
    let best = null;
    for (const box of c.spec.boxes) {
      const r = this.boxClosest(c, box, b.pos);
      if (r.inside) { const pen = r.pen + b.r; if (!best || pen > best.pen) best = { n: r.n, pen, p: sub(b.pos, mul(r.n, b.r)) }; }
      else if (r.d < b.r) { const pen = b.r - r.d; if (!best || pen > best.pen) best = { n: r.n, pen, p: r.cp }; }
    }
    if (best) contacts.push({ A: c, B: b, p: best.p, n: best.n, pen: best.pen, mu: 0.35, e: c.spec.ballE, ballHit: true });
  }
  carCarContacts(a, b, contacts) {
    if (len(sub(a.pos, b.pos)) > 8) return;
    // SAT on the main body boxes: 4 horizontal axes + vertical
    const info = c => { const box = c.spec.boxes[0];
      const ctr = c.toWorld(box.c); let f = c.forward(); f = norm(V(f.x, 0, f.z)); if (len(f) < 0.5) f = V(0, 0, 1);
      const r = V(f.z, 0, -f.x); return { ctr, f, r, hx: box.h.x, hz: box.h.z, hy: box.h.y + 0.25 };
    };
    const A1 = info(a), B1 = info(b); const d = sub(B1.ctr, A1.ctr);
    let best = 1e9, n = null;
    for (const ax of [A1.f, A1.r, B1.f, B1.r]) {
      const pa = A1.hx * Math.abs(dot(A1.r, ax)) + A1.hz * Math.abs(dot(A1.f, ax));
      const pb = B1.hx * Math.abs(dot(B1.r, ax)) + B1.hz * Math.abs(dot(B1.f, ax));
      const ov = pa + pb - Math.abs(dot(d, ax)); if (ov <= 0) return;
      if (ov < best) { best = ov; n = dot(d, ax) >= 0 ? ax : mul(ax, -1); }
    }
    const ovy = A1.hy + B1.hy - Math.abs(d.y); if (ovy <= 0) return;
    if (ovy < best) { best = ovy; n = V(0, d.y >= 0 ? 1 : -1, 0); }
    // contact point: deepest corner of each box along n, averaged
    const corners = (I, sgn) => { let bestP = null, bd = -1e9;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [-1, 1]) {
        const pt = add(I.ctr, add(add(mul(I.r, sx * I.hx), mul(I.f, sz * I.hz)), V(0, sy * I.hy * 0.8, 0)));
        const v = dot(pt, n) * sgn; if (v > bd) { bd = v; bestP = pt; } }
      return bestP; };
    const pA = corners(A1, 1), pB = corners(B1, -1);
    const p = mul(add(pA, pB), 0.5);
    contacts.push({ A: a, B: b, p, n, pen: best, mu: 0.3, e: 0.25, carHit: true });
  }
  solve(contacts, dt) {
    for (const ct of contacts) {
      ct.jn = 0; ct.jt = V();
      const vrel = this.relVel(ct);
      ct.vn0 = dot(vrel, ct.n);
      ct.k = ct.A.kAt(ct.p, ct.n) + (ct.B ? ct.B.kAt(ct.p, ct.n) : 0);
      const bounce = ct.vn0 < -1.5 ? -ct.e * ct.vn0 : 0;
      const bias = Math.min(0.22 * Math.max(ct.pen - 0.01, 0) / dt, ct.vs && (ct.vs.x || ct.vs.y || ct.vs.z) ? 0.6 : 4);
      ct.target = Math.max(bounce, bias);
    }
    for (let it = 0; it < 7; it++) {
      for (const ct of contacts) {
        const vrel = this.relVel(ct); const vn = dot(vrel, ct.n);
        let dj = (ct.target - vn) / ct.k;
        const nj = Math.max(ct.jn + dj, 0); dj = nj - ct.jn; ct.jn = nj;
        this.applyPair(ct, mul(ct.n, dj));
        if (ct.mu > 0) {
          const v2 = this.relVel(ct); const vt = sub(v2, mul(ct.n, dot(v2, ct.n))); const vtl = len(vt);
          if (vtl > 1e-5) {
            const t = mul(vt, 1 / vtl);
            const kt = ct.A.kAt(ct.p, t) + (ct.B ? ct.B.kAt(ct.p, t) : 0);
            let njt = sub(ct.jt, mul(t, vtl / kt)); const mx = ct.mu * ct.jn; const l = len(njt);
            if (l > mx) njt = mul(njt, mx / l);
            const d = sub(njt, ct.jt); ct.jt = njt; this.applyPair(ct, d);
          }
        }
      }
    }
    for (const ct of contacts) {
      if (ct.ballHit && ct.jn > 300) { this.emit({ type: 'ballHit', car: ct.A.id, j: ct.jn, p: ct.p }); if (this.passInfos) for (const tk in this.passInfos) { const pi = this.passInfos[tk]; if (!pi) continue; if (pi.from === ct.A.id && !pi.kicked) { pi.kicked = true; pi.until = this.time + 2.6; } else if (pi.kicked && pi.from !== ct.A.id) this.passInfos[tk] = null; } }
      else if (ct.carHit && ct.jn > 2500) this.emit({ type: 'carHit', j: ct.jn, p: ct.p });
      else if (!ct.B && ct.A instanceof Car && !ct.wheel && ct.jn > 2500) this.emit({ type: 'carWall', car: ct.A.id, j: ct.jn, p: ct.p });
      else if (!ct.B && ct.A === this.ball && ct.jn > 900) this.emit({ type: 'ballBounce', j: ct.jn, p: ct.p });
      else if (ct.wheel && ct.jn > 4000) this.emit({ type: 'land', car: ct.A.id, j: ct.jn, p: ct.p });
    }
  }
  relVel(ct) { // velocity of A relative to B (or to static surface) at contact point
    const va = ct.A.velAt(ct.p);
    const vb = ct.B ? ct.B.velAt(ct.p) : ct.vs;
    // normal points from B toward A for pairs (A pushed along +n). For car-ball contacts, n points from car to ball,
    // so we store pairs with that orientation flipped below in applyPair.
    return ct.B ? (ct.flip ? sub(vb, va) : sub(va, vb)) : sub(va, vb);
  }
  applyPair(ct, J) {
    if (!ct.B) { ct.A.impulse(J, ct.p); return; }
    // pair contacts: n points from A to B for ball/car (B pushed along n). handled via flip flag.
    if (ct.flip) { ct.B.impulse(J, ct.p); ct.A.impulse(mul(J, -1), ct.p); }
    else { ct.A.impulse(J, ct.p); ct.B.impulse(mul(J, -1), ct.p); }
  }

  padTriggers(c) {
    if (c.groundedCount < 2 || dot(c.up(), V(0, 1, 0)) < 0.7) return;
    const hv = V(c.vel.x, 0, c.vel.z); const hs = len(hv); if (hs < PAD.minSpeed) return;
    for (const pd of this.pads) {
      if (pd.state !== 'armed') continue;
      const dx = c.pos.x - pd.c.x, dz = c.pos.z - pd.c.z;
      const hd = mul(hv, 1 / hs);
      const along = dx * hd.x + dz * hd.z, lat = Math.abs(dx * hd.z - dz * hd.x);
      // fire so the car is centred on the plate halfway through the kick
      if (lat > PAD.R * 0.5 || along < -hs * PAD.fireTime * 0.5 || along > 0.6) continue;
      pd.setDir(hd); pd.state = 'fire'; pd.t = 0; pd.firedBy = c.id;
      this.emit({ type: 'padFire', pad: pd.i, car: c.id, p: { ...pd.c } });
    }
  }
  selfRight(c, dt) {
    c.rightCooldown -= dt;
    if (c.rockPhase > 0) { // phase 2: roll toward upright over remaining hop time
      c.rockPhase -= dt;
      if (c.rockPhase <= 0) {
        const u = c.up(); let ax = cross(u, V(0, 1, 0));
        if (len(ax) < 0.15) ax = c.forward(); ax = norm(ax);
        const ang = Math.acos(clamp(u.y, -1, 1));
        const tRem = Math.max(0.25, 2 * Math.max(c.vel.y, 0) / A.G);
        c.ang = mul(ax, ang / tRem * 1.05);
      }
      return;
    }
    const upY = c.up().y;
    const stuck = (upY < 0.45 && len(c.vel) < 3 && len(c.ang) < 2.5 && c.groundedCount < 3) || (upY < 0.62 && len(c.vel) < 1 && len(c.ang) < 1);
    c.upsideTimer = stuck ? c.upsideTimer + dt : Math.max(0, c.upsideTimer - dt * 2);
    if (c.upsideTimer > (upY < 0.45 ? 1.0 : 1.6) && c.rightCooldown <= 0) {
      c.vel = add(c.vel, V(0, upY < -0.3 ? 6.5 : 5.0, 0)); c.ang = mul(c.ang, 0.2);
      c.rockPhase = 0.1; c.rightCooldown = 1.4; c.upsideTimer = 0;
      this.emit({ type: 'rock', car: c.id, p: { ...c.pos } });
    }
  }
  safety() {
    for (const b of [...this.cars, this.ball]) {
      if (![b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z, b.ang.x, b.q.w].every(Number.isFinite)) {
        b.pos = b === this.ball ? V(0, 5, 0) : V(0, 2, b.id ? 30 : -30); b.vel = V(); b.ang = V(); b.q = Q();
      }
      const s = sdf(b.pos.x, b.pos.y, b.pos.z);
      if (s < -2.5 || b.pos.y < -3 || b.pos.y > A.H + 5) { // escaped: put back inside
        b.pos = V(clamp(b.pos.x, -A.HX + 8, A.HX - 8), 4, clamp(b.pos.z, -A.HZ + 8, A.HZ - 8)); b.vel = V(); b.ang = V();
        if (b !== this.ball) b.q = qyaw(Math.atan2(-b.pos.x, -b.pos.z));
      }
    }
  }
  goalCheck() { // returns the team that scored, or -1
    const b = this.ball;
    if (b.pos.z > A.HZ + b.r * 0.6) return 0;   // +z goal is defended by team 1
    if (b.pos.z < -A.HZ - b.r * 0.6) return 1;
    return -1;
  }
}

// car-ball contact: n points from car to ball; we want ball pushed along +n.
// We encode by setting flip=true so B (ball) receives +J and A (car) -J, and relVel = vB - vA.
const _origCarBall = Sim.prototype.carBallContact;
Sim.prototype.carBallContact = function (c, contacts) {
  const n0 = contacts.length; _origCarBall.call(this, c, contacts);
  for (let i = n0; i < contacts.length; i++) contacts[i].flip = true;
};
// car-car: n is box face normal of Q2 (=A) pointing outward toward P (=B) -> B pushed along +n.
const _origCarCar = Sim.prototype.carCarContacts;
Sim.prototype.carCarContacts = function (a, b, contacts) {
  const n0 = contacts.length; _origCarCar.call(this, a, b, contacts);
  for (let i = n0; i < contacts.length; i++) contacts[i].flip = true;
};

const api = { CARS, COUPE, VAN, BUGGY, setArenaScale, teamScale, KICK, FRAME, Sim, Car, Ball, Pad, A, CAR, PAD, PAD_POS, V, add, sub, mul, dot, cross, len, norm, clamp, lerp, Q, qmul, qrot, qconj, qaxis, qyaw, qnorm, sdf, sdfNormal, wallDist, fenceInset, raymarch };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RLSim = api;
})(typeof window !== 'undefined' ? window : globalThis);

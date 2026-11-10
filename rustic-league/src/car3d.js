// ===================== RUSTIC LEAGUE — CAR MODEL ('77 personal-luxury coupe, well past its prime) =====================
(function (root) {
'use strict';
const { Geo, sweep, lathe, disc, merge } = root.RLMesh;
const CM = root.RLTex.CARMAPS.coupe;
const ARCH = [-1.49, 1.46], AR = 0.49, AY = 0.40, XIN = 0.64; // arch radius = tyre (0.40) + 9 cm; XIN: inner wall of each wheel well
const pw = (pts, z) => { if (z <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + (y1 - y0) * (z - z0) / (z1 - z0); } return pts[pts.length - 1][1]; };
const TOP = [[-2.68, 0.86], [-2.66, 0.92], [-2.6, 0.95], [-2.35, 0.975], [-1.4, 0.98], [0.62, 0.965], [1.2, 0.95], [2.2, 0.925], [2.6, 0.905], [2.66, 0.895], [2.7, 0.88], [2.72, 0.86]]; // ends start at full height: the end caps are flat panels mapped like the sides
const BOT = [[-2.68, 0.42], [-2.64, 0.37], [-2.58, 0.33], [2.56, 0.33], [2.64, 0.39], [2.71, 0.47], [2.72, 0.49]];
const archY = z => { let y = 0; for (const zc of ARCH) { const d = z - zc; if (Math.abs(d) < AR) y = Math.max(y, AY + Math.sqrt(AR * AR - d * d)); } return y; };
const topZ = z => pw(TOP, z), botZ = z => Math.max(pw(BOT, z), archY(z));
const hwZ = z => 0.99 - Math.max(0, z - 2.25) * 0.11 - Math.max(0, -2.3 - z) * 0.1;
const uvS = (z, y) => [(z - CM.z0) / CM.len, Math.min(Math.max(y, 0) / CM.ymax, 1) * 0.5];
const uvT = (z, x) => [(z - CM.z0) / CM.len, 0.5 + (Math.max(-1, Math.min(1, x)) + 1) / 2 * 0.5 * 0.998];

function stations() {
  const Z = [-2.68, -2.66, -2.64, -2.62, -2.6, -2.5, -2.35];
  for (let z = -2.2; z < 2.55; z += 0.12) Z.push(z);
  for (const zc of ARCH) for (let k = -12; k <= 12; k++) Z.push(zc + AR * k / 12 + (k === -12 ? 0.0005 : k === 12 ? -0.0005 : 0));
  Z.push(2.58, 2.62, 2.66, 2.69, 2.71, 2.72);
  return [...new Set(Z.map(z => +z.toFixed(4)))].sort((a, b) => a - b);
}
// cross-section of the lower body: rounded shoulder, slight tumblehome, tucked sill
// 'U' points belong to the underbody: the floor, and around each wheel a well (inner wall at XIN, ceiling at the arch)
function bodySection(z) {
  const yt = topZ(z), yb0 = pw(BOT, z), yb = botZ(z), hw = hwZ(z); const H = Math.max(yt - yb, 0.02); const c = Math.min(0.09, H * 0.45), xi = Math.min(XIN, hw - 0.12);
  const side = [[0.0, yb0, 'U'], [xi, yb0, 'U'], [xi, yb, 'U'], [hw - 0.07, yb, 'U'], [hw - 0.012, yb + Math.min(0.05, H * 0.25), 'S'], [hw, yb + (H - c) * 0.55, 'S'], [hw - 0.012, yt - c, 'S']];
  const round = []; for (let k = 0; k <= 3; k++) { const a = k / 3 * Math.PI / 2; round.push([hw - 0.012 - c + c * Math.cos(a), yt - c + c * Math.sin(a), 'T']); }
  const top = [[0.55, yt + 0.008, 'T'], [0, yt + 0.014, 'T']];
  return { side, round, top, yt, yb, yb0 };
}
function loftBody(Z = stations(), section = bodySection, uS = uvS, uT = uvT, g = new Geo(), gU = null) {
  const rings = [];
  for (const z of Z) {
    const s = section(z); const right = [...s.side, ...s.round, ...s.top]; const ring = [];
    // ring: bottom centre -> right side -> top centre -> left side -> bottom centre
    const pts = [...right, ...right.slice(0, -1).reverse().map(p => [-p[0], p[1], p[2]])];
    for (let i = 0; i < pts.length; i++) {
      const [x, y, kind] = pts[i];
      if (kind === 'S' || kind === 'U') ring.push([g.v(x, y, z, ...uS(z, y))]);
      else if (i > 0 && pts[i - 1][2] === 'S' || (i < pts.length - 1 && pts[i + 1][2] === 'S')) ring.push([g.v(x, y, z, ...uS(z, y)), g.v(x, y, z, ...uT(z, x))]);
      else ring.push([g.v(x, y, z, ...uT(z, x))]);
    }
    rings.push({ ring, pts, z, yc: (s.yt + (s.yb0 != null ? s.yb0 : s.yb)) / 2 });
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    for (let i = 0; i < A.ring.length - 1; i++) {
      const kA = A.pts[i][2], kB = A.pts[i + 1][2];
      if (gU && kA === 'U' && kB === 'U') { // floor / wheel well: own vertices, mapped flat (horizontal faces by x,z; walls by y,z)
        const p0 = A.pts[i], p1 = A.pts[i + 1], q0 = B.pts[i], q1 = B.pts[i + 1];
        let dx = p1[0] - p0[0], dy = p1[1] - p0[1]; if (Math.hypot(dx, dy) < 1e-5) { dx = q1[0] - q0[0]; dy = q1[1] - q0[1]; } if (Math.hypot(dx, dy) < 1e-5) continue;
        const horiz = Math.abs(dy) <= Math.abs(dx), uvf = (x, y, z) => horiz ? [x * 0.7, z * 0.7] : [y * 0.7, z * 0.7];
        const ids = [[p0, A.z], [p1, A.z], [q1, B.z], [q0, B.z]].map(([p, z]) => gU.v(p[0], p[1], z, ...uvf(p[0], p[1], z)));
        gU.quad(ids[0], ids[1], ids[2], ids[3], dy, -dx, 0); continue; // the ring runs so that (dy, -dx) points out of the body
      }
      // pick the vertex copy that matches the segment's mapping (side or top)
      const seg = (kA === 'S' && kB === 'S') ? 0 : 1;
      const pick = (R, j, s) => R.ring[j].length === 2 ? R.ring[j][seg] : R.ring[j][0];
      const a = pick(A, i), b = pick(A, i + 1), c = pick(B, i + 1), d = pick(B, i);
      const mx = (A.pts[i][0] + A.pts[i + 1][0]) / 2, my = (A.pts[i][1] + A.pts[i + 1][1]) / 2;
      g.quad(a, b, c, d, mx, my - A.yc, 0);
    }
  }
  for (const [R, sz] of [[rings[0], -1], [rings[rings.length - 1], 1]]) { // end caps
    const capUV = (x, y) => { const b = uS(R.z, y); const zEdge = R.z + (sz > 0 ? -1 : 1) * (x + 1.05); const b2 = uS(zEdge, y); return [b2[0], b[1]]; };
    const c = g.v(0, R.yc, R.z, ...capUV(0, R.yc)); const ids = R.pts.map(([x, y]) => g.v(x, y, R.z, ...capUV(x, y)));
    for (let i = 0; i < ids.length - 1; i++) g.tri(c, ids[i], ids[i + 1], 0, 0, sz);
  }
  return g;
}
// greenhouse with a landau vinyl roof
const CAB = [[-1.48, 0.97], [-1.36, 1.08], [-1.2, 1.24], [-1.02, 1.375], [-0.9, 1.388], [-0.3, 1.378], [-0.18, 1.36], [0.0, 1.29], [0.2, 1.205], [0.5, 1.05], [0.66, 0.955]];
const cabTop = z => pw(CAB, z); const cabX = y => 0.93 - (y - 0.95) / 0.42 * 0.16; const CAB_B = 0.94;
function loftCab() {
  const g = new Geo(); const rings = []; const Z = []; for (let z = -1.48; z <= 0.661; z += 0.06) Z.push(+z.toFixed(3));
  for (const z of Z) {
    const yt = cabTop(z), r = Math.min(0.075, Math.max(yt - CAB_B, 0.01) * 0.4); const xs = cabX(yt - r);
    const right = [[cabX(CAB_B), CAB_B], [xs, yt - r]]; for (let k = 1; k <= 3; k++) { const a = k / 3 * Math.PI / 2; right.push([xs - r + r * Math.cos(a), yt - r + r * Math.sin(a)]); } right.push([0, yt + 0.008]);
    const pts = [...right, ...right.slice(0, -1).reverse().map(p => [-p[0], p[1]])];
    rings.push({ ids: pts.map(([x, y]) => g.v(x, y, z, z * 1.1, (y + Math.abs(x)) * 1.1)), pts, z });
  }
  for (let r = 0; r < rings.length - 1; r++) { const A = rings[r], B = rings[r + 1];
    for (let i = 0; i < A.ids.length - 1; i++) { const mx = (A.pts[i][0] + A.pts[i + 1][0]) / 2, my = (A.pts[i][1] + A.pts[i + 1][1]) / 2; g.quad(A.ids[i], A.ids[i + 1], B.ids[i + 1], B.ids[i], mx, my - 1.0, 0); } }
  return g;
}
// curved glass patch lying on the cabin top between z0 and z1
function glassPatch(g, z0, z1, inset, flipU) {
  const N = 8, M = 6; const ids = [];
  for (let i = 0; i <= N; i++) { const z = z0 + (z1 - z0) * i / N; const yt = cabTop(z); const r = Math.min(0.075, Math.max(yt - CAB_B, 0.01) * 0.4); const half = cabX(yt - r) - r - inset; const row = [];
    for (let j = 0; j <= M; j++) { const x = -half + 2 * half * j / M; row.push(g.v(x, yt + 0.008 + 0.012, z, flipU ? 1 - j / M : j / M, i / N)); } ids.push(row); }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) g.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j], 0, 1, 0);
  const edge = []; for (let i = 0; i <= N; i++) edge.push(ids[i][0]); for (let j = 1; j <= M; j++) edge.push(ids[N][j]); for (let i = N - 1; i >= 0; i--) edge.push(ids[i][M]); for (let j = M - 1; j >= 0; j--) edge.push(ids[0][j]);
  return edge.map(k => new BABYLON.Vector3(g.p[k * 3], g.p[k * 3 + 1] + 0.004, g.p[k * 3 + 2]));
}
const SIDEWIN = [[[0.52, 1.0], [0.4, 1.06], [-0.1, 1.3], [-0.7, 1.33], [-0.7, 1.0]], [[-0.84, 1.05], [-0.84, 1.28], [-1.0, 1.29], [-1.28, 1.05]]];
function box(scene, name, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }
function cyl(scene, name, d, h, x, y, z, rx = 0, ry = 0, rz = 0, tess = 12) { const m = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: d, height: h, tessellation: tess }, scene); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }
function tube(scene, path, r, tess = 6) { return BABYLON.MeshBuilder.CreateTube('t', { path, radius: r, tessellation: tess }, scene); }
const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);
function bumper(scene, sz) {
  const path = []; for (let k = 0; k <= 30; k++) { const x = -1.03 + 2.06 * k / 30; const e = Math.max(0, Math.abs(x) - 0.72); const z = sz * (2.79 - e * e * 1.9);
    const dzdx = -sz * 2 * e * 1.9 * Math.sign(x); const nl = Math.hypot(dzdx, 1); path.push({ x, z, nx: -dzdx / nl * sz * sz, nz: sz / nl, s: k / 30 * 2.1 }); }
  // fix normals to point outward (away from the car centre)
  for (const p of path) { if (p.nx * p.x + p.nz * p.z < 0) { p.nx = -p.nx; p.nz = -p.nz; } }
  const prof = []; const R = 0.045, w = 0.075, y0 = 0.33, y1 = 0.53;
  const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 3; k++) { const a = a0 + (a1 - a0) * k / 3; prof.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } };
  arc(w - R, y0 + R, -Math.PI / 2, 0); prof.push([w + 0.012, (y0 + y1) / 2]); arc(w - R, y1 - R, 0, Math.PI / 2); arc(-w + R, y1 - R, Math.PI / 2, Math.PI); arc(-w + R, y0 + R, Math.PI, Math.PI * 1.5); prof.push(prof[0]);
  return sweep('bumper', scene, path, prof, 1, 1).mesh('bumper', scene);
}

function buildCoupe(scene, M, opts = {}) {
  const gU = new Geo(); const body = loftBody(undefined, undefined, undefined, undefined, undefined, gU).mesh('carBody', scene);
  const cab = loftCab().mesh('carCab', scene);
  const gw = new Geo(), gr = new Geo(), gs = new Geo();
  const wEdge = glassPatch(gw, 0.6, -0.15, 0.04, false), rEdge = glassPatch(gr, -1.42, -1.04, 0.05, true);
  const chromeParts = [tube(scene, [...wEdge, wEdge[0]], 0.014), tube(scene, [...rEdge, rEdge[0]], 0.014)];
  for (const s of [-1, 1]) for (const poly of SIDEWIN) {
    const ids = poly.map(([z, y]) => gs.v(s * (cabX(y) + 0.006), y, z, (z + 1.4) / 2, (y - 0.95) / 0.5));
    for (let i = 1; i < ids.length - 1; i++) gs.tri(ids[0], ids[i], ids[i + 1], s, 0, 0);
    const path = poly.map(([z, y]) => V3(s * (cabX(y) + 0.012), y, z)); path.push(path[0]); chromeParts.push(tube(scene, path, 0.013));
  }
  for (const s of [-1, 1]) { // roof drip rails & beltline molding
    const drip = []; for (let z = -1.0; z <= -0.15; z += 0.08) { const yt = cabTop(z); drip.push(V3(s * (cabX(yt - 0.07) + 0.004), yt - 0.06, z)); } chromeParts.push(tube(scene, drip, 0.012));
    const belt = []; for (let z = -2.5; z <= 2.58; z += 0.1) { const sct = bodySection(z); belt.push(V3(s * (hwZ(z) - 0.004), sct.yt - Math.min(0.09, (sct.yt - sct.yb) * 0.45) - 0.01, z)); } chromeParts.push(tube(scene, belt, 0.011));
    const rock = []; for (let z = -0.95; z <= 0.92; z += 0.1) rock.push(V3(s * 0.992, 0.42, z)); chromeParts.push(tube(scene, rock, 0.016));
  }
  const windM = gw.mesh('carWind', scene), rearM = gr.mesh('carRear', scene), sideM = gs.mesh('carSide', scene);
  // front end
  const ch = [...chromeParts, bumper(scene, 1), bumper(scene, -1)], blk = [], amber = [], head = [], red = [], plate = [], under = [];
  blk.push(box(scene, 'grilleBack', 0.62, 0.32, 0.06, 0, 0.66, 2.69));
  for (let k = 0; k < 9; k++) ch.push(box(scene, 'gb', 0.02, 0.3, 0.05, -0.26 + k * 0.065, 0.66, 2.725));
  for (const y of [0.58, 0.74]) ch.push(box(scene, 'gh', 0.6, 0.016, 0.04, 0, y, 2.73));
  ch.push(box(scene, 'gs1', 0.7, 0.04, 0.06, 0, 0.84, 2.72), box(scene, 'gs2', 0.7, 0.04, 0.06, 0, 0.48, 2.72), box(scene, 'gs3', 0.04, 0.4, 0.06, -0.34, 0.66, 2.72), box(scene, 'gs4', 0.04, 0.4, 0.06, 0.34, 0.66, 2.72));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) { const x = s * (0.49 + k * 0.24); ch.push(box(scene, 'hb', 0.23, 0.165, 0.05, x, 0.69, 2.705)); blk.push(box(scene, 'hr', 0.2, 0.135, 0.02, x, 0.69, 2.722)); head.push(box(scene, 'hl', 0.18, 0.115, 0.02, x, 0.69, 2.733)); }
    amber.push(box(scene, 'ts', 0.36, 0.055, 0.03, s * 0.6, 0.555, 2.71));
    amber.push(box(scene, 'sideMk', 0.02, 0.05, 0.16, s * 0.985, 0.72, 2.3));
    red.push(box(scene, 'sideMkR', 0.02, 0.05, 0.16, s * 0.975, 0.72, -2.38));
    blk.push(box(scene, 'gF', 0.09, 0.25, 0.1, s * 0.42, 0.43, 2.86), box(scene, 'gR', 0.09, 0.25, 0.1, s * 0.42, 0.43, -2.86));
    ch.push(box(scene, 'handle', 0.025, 0.035, 0.2, s * 0.995, 0.84, -0.44));
    const m = BABYLON.MeshBuilder.CreateSphere('mir', { diameter: 1, segments: 8 }, scene); m.scaling.set(0.07, 0.07, 0.13); m.position.set(s * 1.05, 1.03, 0.42); ch.push(m);
    ch.push(cyl(scene, 'mirS', 0.025, 0.12, s * 0.99, 1.0, 0.44, 0, 0, Math.PI / 2, 6));
    ch.push(box(scene, 'emb', 0.01, 0.04, 0.22, s * 0.99, 0.62, 1.95));
    ch.push(cyl(scene, 'gas', 0.12, 0.012, s * 0.99, 0.8, -1.95, 0, 0, Math.PI / 2, 14));
  }
  ch.push(box(scene, 'orn', 0.025, 0.07, 0.1, 0, 0.95, 2.5), box(scene, 'lock', 0.06, 0.04, 0.02, 0, 0.83, -2.69));
  red.push(box(scene, 'tailL', 0.6, 0.15, 0.04, -0.6, 0.73, -2.665), box(scene, 'tailR', 0.6, 0.15, 0.04, 0.6, 0.73, -2.665));
  for (const sx of [-1, 1]) ch.push(box(scene, 'tailS', 0.64, 0.02, 0.05, sx * 0.6, 0.815, -2.666), box(scene, 'tailS2', 0.64, 0.02, 0.05, sx * 0.6, 0.645, -2.666));
  const pF = box(scene, 'plateF', 0.48, 0.14, 0.012, 0, 0.43, 2.885), pR = box(scene, 'plateR', 0.48, 0.14, 0.012, 0, 0.66, -2.69); plate.push(pF, pR);
  const ant = cyl(scene, 'ant', 0.012, 0.95, 0.8, 1.38, 1.9, -0.28, 0, 0, 5); ch.push(ant);
  for (const s of [-1, 1]) ch.push(box(scene, 'wiper', 0.55, 0.012, 0.02, s * 0.3, 0.99, 0.58, 0.08 * s));
  // undercarriage: visible every time somebody lands on their roof
  for (const s of [-1, 1]) under.push(box(scene, 'rail', 0.1, 0.12, 4.7, s * 0.55, 0.36, 0.05));
  under.push(cyl(scene, 'axle', 0.09, 1.55, 0, AY, ARCH[0], 0, 0, Math.PI / 2), BABYLON.MeshBuilder.CreateSphere('diff', { diameter: 0.32, segments: 8 }, scene));
  under[under.length - 1].position.set(0, AY, ARCH[0] + 0.05);
  under.push(box(scene, 'xmem', 1.5, 0.1, 0.16, 0, 0.36, ARCH[1]), box(scene, 'tank', 1.2, 0.22, 0.5, 0, 0.42, -2.15), box(scene, 'pan', 0.5, 0.14, 0.6, 0, 0.36, 1.85));
  under.push(tube(scene, [V3(-0.25, 0.3, 1.5), V3(-0.3, 0.29, 0.5), V3(-0.5, 0.29, -0.6), V3(-0.62, 0.3, -2.0), V3(-0.62, 0.3, -2.72)], 0.035), cyl(scene, 'muff', 0.2, 0.7, -0.45, 0.3, -0.2, Math.PI / 2, 0, 0));
  for (const zc of ARCH) for (const s of [-1, 1]) under.push(BABYLON.MeshBuilder.CreateCylinder('spr', { diameterTop: 0.12, diameterBottom: 0.12, height: 0.36, tessellation: 8 }, scene)), under[under.length - 1].position.set(s * 0.6, 0.6, zc);

  return finishCar(scene, M, opts, [[body, M.paint], [cab, M.vinyl], [windM, M.wind || M.glass], [rearM, M.glass], [sideM, M.glass], [merge(ch, 'carChrome'), M.chrome], [merge(blk, 'carBlack'), M.black],
    [merge(amber, 'carAmber'), M.amber], [merge(head, 'carHead'), M.head], [merge(red, 'carTail'), M.tail], [pF, M.plateF || M.plate], [pR, M.plateR || M.plate], [merge(under, 'carUnder'), M.under || M.pipe], [gU.mesh('carFloor', scene), M.under || M.pipe]], { AY, hub: M.hub, tire: M.tire, R: 0.40, W: 0.25 });
}

// ---------- shared: root nodes, parts, wheels ----------
function finishCar(scene, M, opts, parts, wcfg) {
  const K = opts.K || 1;
  const rootN = new BABYLON.TransformNode('car', scene); rootN.rotationQuaternion = new BABYLON.Quaternion();
  const model = new BABYLON.TransformNode('carModel', scene); model.parent = rootN; model.scaling.setAll(K); model.position.set(-opts.com.x, -opts.com.y, -opts.com.z);
  const meshes = [];
  for (const [m, mat] of parts) { if (!m) continue; m.material = mat; m.parent = model; meshes.push(m); }
  // tyre + hub, closed on both faces so the wheel never disappears from behind
  const R = wcfg.R, W = wcfg.W, rim = wcfg.rimR || R * 0.61, hw = W / 2;
  const tireProf = [[rim, -hw], [rim + (R - rim) * 0.5, -hw * 1.02], [R * 0.94, -hw * 0.92], [R * 0.99, -hw * 0.72], [R, -hw * 0.34], [R, hw * 0.34], [R * 0.99, hw * 0.72], [R * 0.94, hw * 0.92], [rim + (R - rim) * 0.5, hw * 1.02], [rim, hw]];
  const tireT = lathe('tire', scene, tireProf, 32); tireT.material = wcfg.tire;
  const hubO = disc('hubO', scene, rim * 1.01, 28, 1); hubO.position.y = hw * 0.85; hubO.bakeCurrentTransformIntoVertices(); hubO.material = wcfg.hub;
  const hubI = disc('hubI', scene, rim * 1.01, 20, -1); hubI.position.y = -hw * 0.6; hubI.bakeCurrentTransformIntoVertices(); hubI.material = M.black;
  const dish = lathe('dish', scene, [[0.0, hw * 0.85 + 0.035], [rim * 0.22, hw * 0.85 + 0.033], [rim * 0.33, hw * 0.85 + 0.02], [rim * 0.37, hw * 0.85]], 16); dish.material = M.chrome;
  const wheelT = BABYLON.Mesh.MergeMeshes([tireT, hubO, hubI, dish], true, true, undefined, true, true); wheelT.name = 'wheelT';
  const wheels = [];
  for (const [i, w] of opts.wheels.entries()) {
    const steer = new BABYLON.TransformNode('steer' + i, scene); steer.parent = model; steer.position.set(w.x / K, wcfg.AY, (w.z + opts.com.z) / K);
    const spin = new BABYLON.TransformNode('spin' + i, scene); spin.parent = steer;
    const wm = wheelT.clone('wheel' + i); wm.parent = spin; wm.rotation.z = w.x > 0 ? -Math.PI / 2 : Math.PI / 2;
    meshes.push(wm); wheels.push({ steer, spin, mesh: wm, x: w.x });
  }
  wheelT.setEnabled(false);
  return { root: rootN, model, meshes, wheels, tailMat: M.tail, K, extra: [wheelT] };
}
// map a primitive's vertices onto the paint atlas side region by their model position
function atlasUV(m, CMx) {
  const pos = m.getVerticesData(BABYLON.VertexBuffer.PositionKind); const wm = m.computeWorldMatrix(true); const uv = []; const v = new BABYLON.Vector3();
  for (let i = 0; i < pos.length; i += 3) { BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(pos[i], pos[i + 1], pos[i + 2], wm, v); uv.push((v.z - CMx.z0) / CMx.len, Math.min(Math.max(v.y, 0) / CMx.ymax, 1) * 0.5); }
  m.setVerticesData(BABYLON.VertexBuffer.UVKind, uv);
}
function glassOnTop(g, z0, z1, topFn, halfFn, lift = 0.014, crown = 0) {
  const N = 8, Mx = 6, ids = [];
  for (let i = 0; i <= N; i++) { const z = z0 + (z1 - z0) * i / N, y = topFn(z), half = halfFn(z); const row = [];
    for (let j = 0; j <= Mx; j++) { const x = -half + 2 * half * j / Mx; const q = x / Math.max(half, 0.01); row.push(g.v(x, y + lift + crown * (1 - q * q), z, j / Mx, i / N)); } ids.push(row); }
  for (let i = 0; i < N; i++) for (let j = 0; j < Mx; j++) g.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j], 0, 1, 0);
  const edge = []; for (let i = 0; i <= N; i++) edge.push(ids[i][0]); for (let j = 1; j <= Mx; j++) edge.push(ids[N][j]); for (let i = N - 1; i >= 0; i--) edge.push(ids[i][Mx]); for (let j = Mx - 1; j >= 0; j--) edge.push(ids[0][j]);
  return edge.map(k => V3(g.p[k * 3], g.p[k * 3 + 1] + 0.004, g.p[k * 3 + 2]));
}
// glass (or a lamp lens) lying on a body side, both sides of the car. A 4-corner [z, y] quad is tessellated so it follows
// the side's curve (a flat panel cut into a curved body or stood off it); the chrome frame follows the curve too.
function sidePoly(g, poly, xFn, chromeList, scene, off = 0.007) {
  const N = 8, bil = (u, v, c) => (1 - u) * (1 - v) * poly[0][c] + u * (1 - v) * poly[1][c] + u * v * poly[2][c] + (1 - u) * v * poly[3][c];
  for (const sgn of [-1, 1]) {
    if (poly.length === 4) { const ids = [];
      for (let i = 0; i <= N; i++) { const row = []; for (let j = 0; j <= N; j++) { const z = bil(j / N, i / N, 0), y = bil(j / N, i / N, 1); row.push(g.v(sgn * (xFn(z, y) + off), y, z, z, y)); } ids.push(row); }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) g.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j], sgn, 0, 0);
    } else { const ids = poly.map(([z, y]) => g.v(sgn * (xFn(z, y) + off), y, z, z, y)); for (let i = 1; i < ids.length - 1; i++) g.tri(ids[0], ids[i], ids[i + 1], sgn, 0, 0); }
    if (chromeList) { const path = []; for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length];
        for (let t = 0; t < N; t++) { const z = a[0] + (b[0] - a[0]) * t / N, y = a[1] + (b[1] - a[1]) * t / N; path.push(V3(sgn * (xFn(z, y) + off + 0.006), y, z)); } }
      path.push(path[0]); chromeList.push(tube(scene, path, 0.014)); } }
}
// a lens lying on an ellipsoid fender (unit sphere placed by matrix M4): an oval of angular radii ru x rv around direction
// dir, lifted a hair off the surface so it sits flush but never z-fights. Returns its rim (for a chrome bezel).
function fenderLens(g, M4, dir, ru, rv, lift = 1.012) {
  const d = dir.normalize(), up = Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0), e1 = BABYLON.Vector3.Cross(up, d).normalize(), e2 = BABYLON.Vector3.Cross(d, e1).normalize();
  const P = (a, r, l) => BABYLON.Vector3.TransformCoordinates(d.add(e1.scale(Math.cos(a) * ru * r)).add(e2.scale(Math.sin(a) * rv * r)).normalize().scale(l), M4);
  const ctr = BABYLON.Vector3.TransformCoordinates(V3(0, 0, 0), M4), NA = 18, NR = 3, c = P(0, 0, lift), n = c.subtract(ctr), ci = g.v(c.x, c.y, c.z, 0.5, 0.5); let prev = null;
  for (let r = 1; r <= NR; r++) { const row = []; for (let k = 0; k <= NA; k++) { const a = k / NA * Math.PI * 2, q = P(a, r / NR, lift); row.push(g.v(q.x, q.y, q.z, 0.5 + Math.cos(a) * 0.5 * r / NR, 0.5 + Math.sin(a) * 0.5 * r / NR)); }
    for (let k = 0; k < NA; k++) { if (!prev) g.tri(ci, row[k], row[k + 1], n.x, n.y, n.z); else g.quad(prev[k], prev[k + 1], row[k + 1], row[k], n.x, n.y, n.z); } prev = row; }
  const rim = []; for (let k = 0; k <= NA; k++) rim.push(P(k / NA * Math.PI * 2, 1, lift * 0.999)); return rim;
}
function straightBumper(scene, z, sz, halfW, y0, y1, wrap) {
  const path = []; for (let k = 0; k <= 24; k++) { const x = -halfW + 2 * halfW * k / 24; const e = Math.max(0, Math.abs(x) - (halfW - wrap)); path.push({ x, z: sz * (z - e * e * 2.4), nx: 0, nz: sz, s: k / 24 * 2 }); }
  for (let k = 1; k < path.length - 1; k++) { const a = path[k - 1], b = path[k + 1]; const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz); let nx = -tz / l, nz = tx / l; if (nx * path[k].x + nz * path[k].z < 0) { nx = -nx; nz = -nz; } path[k].nx = nx; path[k].nz = nz; }
  path[0].nx = path[1].nx; path[0].nz = path[1].nz; path[24].nx = path[23].nx; path[24].nz = path[23].nz;
  const prof = []; const R = 0.03, w = 0.05; const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 3; k++) { const a = a0 + (a1 - a0) * k / 3; prof.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } };
  arc(w - R, y0 + R, -Math.PI / 2, 0); arc(w - R, y1 - R, 0, Math.PI / 2); arc(-w + R, y1 - R, Math.PI / 2, Math.PI); arc(-w + R, y0 + R, Math.PI, Math.PI * 1.5); prof.push(prof[0]);
  return sweep('bumper', scene, path, prof, 1, 1).mesh('bumper', scene);
}
function lamp(scene, list, bezelList, x, y, z, r, nz = 1, tilt = 0) {
  const d = BABYLON.MeshBuilder.CreateCylinder('lamp', { diameter: r * 2, height: 0.04, tessellation: 18 }, scene); d.rotation.x = Math.PI / 2 * nz + tilt; d.position.set(x, y, z); list.push(d);
  const b = BABYLON.MeshBuilder.CreateTorus('bezel', { diameter: r * 2 + 0.03, thickness: 0.035, tessellation: 20 }, scene); b.rotation.x = Math.PI / 2 + tilt; b.position.set(x, y, z - 0.005 * nz); bezelList.push(b);
}

// ---------- '70s cargo van ----------
const VCM = root.RLTex.CARMAPS.van;
const V_ARCH = [-1.17, 1.62], V_AR = 0.50, V_AY = 0.41, V_XIN = 0.68;
const V_TOP = [[-2.5, 1.9], [-2.44, 1.98], [-2.3, 2.02], [1.2, 2.02], [1.3, 1.97], [1.42, 1.86], [1.86, 1.24], [2.0, 1.19], [2.42, 1.1], [2.48, 1.06], [2.5, 1.0]];
const V_BOT = [[-2.5, 0.56], [-2.42, 0.52], [2.38, 0.52], [2.5, 0.56]];
const vArchY = z => { let y = 0; for (const zc of V_ARCH) { const d = z - zc; if (Math.abs(d) < V_AR) y = Math.max(y, V_AY + Math.sqrt(V_AR * V_AR - d * d)); } return y; };
const vTop = z => pw(V_TOP, z), vBot = z => Math.max(pw(V_BOT, z), vArchY(z)), vHW = z => 1.0 - Math.max(0, z - 2.3) * 0.15 - Math.max(0, -2.35 - z) * 0.2;
const vS = (z, y) => [(z - VCM.z0) / VCM.len, Math.min(Math.max(y, 0) / VCM.ymax, 1) * 0.5], vT = (z, x) => [(z - VCM.z0) / VCM.len, 0.5 + (Math.max(-1, Math.min(1, x)) + 1) / 4 * 0.998];
function vanSection(z) {
  const yt = vTop(z), yb0 = pw(V_BOT, z), yb = vBot(z), hw = vHW(z), H = Math.max(yt - yb, 0.02), c = Math.min(0.14, H * 0.3), xi = Math.min(V_XIN, hw - 0.12);
  const side = [[0, yb0, 'U'], [xi, yb0, 'U'], [xi, yb, 'U'], [hw - 0.06, yb, 'U'], [hw - 0.01, yb + Math.min(0.05, H * 0.2), 'S'], [hw, yb + (H - c) * 0.5, 'S'], [hw - 0.03, yt - c, 'S']];
  const round = []; for (let k = 0; k <= 3; k++) { const a = k / 3 * Math.PI / 2; round.push([hw - 0.03 - c + c * Math.cos(a), yt - c + c * Math.sin(a), 'T']); }
  return { side, round, top: [[0.5, yt + 0.008, 'T'], [0, yt + 0.012, 'T']], yt, yb, yb0 };
}
const vSideX = (z, y) => { const sct = vanSection(z); const pts = [...sct.side.slice(3), ...sct.round]; for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { const a = pts[i - 1], b = pts[i]; return a[0] + (b[0] - a[0]) * (y - a[1]) / Math.max(b[1] - a[1], 1e-4); } return pts[pts.length - 1][0]; };
function buildVan(scene, M, opts) {
  const Z = [-2.5, -2.49, -2.47, -2.44, -2.38, -2.3]; for (let z = -2.2; z < 2.36; z += 0.12) Z.push(z); for (const zc of V_ARCH) for (let k = -12; k <= 12; k++) Z.push(zc + V_AR * k / 12 + (k === -12 ? 5e-4 : k === 12 ? -5e-4 : 0));
  Z.push(1.3, 1.42, 1.86, 2.0, 2.4, 2.44, 2.47, 2.49, 2.5); const ZS = [...new Set(Z.map(z => +z.toFixed(4)))].sort((a, b) => a - b);
  const gU = new Geo(); const body = loftBody(ZS, vanSection, vS, vT, undefined, gU).mesh('vanBody', scene);
  const gw = new Geo(), gs = new Geo(), ch = [], blk = [], amber = [], head = [], red = [], under = [];
  const wEdge = glassOnTop(gw, 1.83, 1.45, vTop, z => vHW(z) - 0.2, 0.016, 0.012); ch.push(tube(scene, [...wEdge, wEdge[0]], 0.016));
  sidePoly(gs, [[1.25, 1.35], [1.38, 1.83], [0.42, 1.88], [0.42, 1.35]], vSideX, ch, scene);
  // round porthole on the rear quarter, like the real thing
  for (const sgn of [-1, 1]) { const pc = [-1.78, 1.6], r = 0.2; const ring = []; const ids = [];
    for (let k = 0; k <= 20; k++) { const a = k / 20 * Math.PI * 2; const z = pc[0] + Math.cos(a) * r, y = pc[1] + Math.sin(a) * r; ids.push(gs.v(sgn * (vSideX(z, y) + 0.008), y, z, 0, 0)); ring.push(V3(sgn * (vSideX(z, y) + 0.014), y, z)); }
    const c0 = gs.v(sgn * (vSideX(pc[0], pc[1]) + 0.008), pc[1], pc[0], 0, 0); for (let k = 0; k < 20; k++) gs.tri(c0, ids[k], ids[k + 1], sgn, 0, 0); ch.push(tube(scene, ring, 0.022)); }
  // rear doors: two windows + centre seam
  for (const sx of [-1, 1]) { const ids = [[0.08, 1.32], [0.82, 1.32], [0.82, 1.84], [0.08, 1.84]].map(([x, y]) => gs.v(sx * x, y, -2.507, 0, 0)); gs.quad(ids[0], ids[1], ids[2], ids[3], 0, 0, -1);
    ch.push(tube(scene, [V3(sx * 0.08, 1.32, -2.512), V3(sx * 0.82, 1.32, -2.512), V3(sx * 0.82, 1.84, -2.512), V3(sx * 0.08, 1.84, -2.512), V3(sx * 0.08, 1.32, -2.512)], 0.012)); }
  blk.push(box(scene, 'rearSeam', 0.02, 1.3, 0.01, 0, 1.2, -2.506));
  // front: grille, round sealed-beam headlamps, signals
  blk.push(box(scene, 'grille', 1.0, 0.36, 0.04, 0, 0.8, 2.505)); for (let k = 0; k < 5; k++) ch.push(box(scene, 'gbar', 1.0, 0.025, 0.03, 0, 0.66 + k * 0.07, 2.515));
  ch.push(box(scene, 'gfr1', 1.06, 0.035, 0.05, 0, 0.99, 2.51), box(scene, 'gfr2', 1.06, 0.035, 0.05, 0, 0.61, 2.51));
  for (const sx of [-1, 1]) { blk.push(box(scene, 'hbox', 0.34, 0.34, 0.04, sx * 0.74, 0.8, 2.505)); lamp(scene, head, ch, sx * 0.74, 0.8, 2.52, 0.14); amber.push(box(scene, 'sig', 0.22, 0.09, 0.03, sx * 0.74, 0.58, 2.51)); }
  ch.push(straightBumper(scene, 2.6, 1, 1.06, 0.36, 0.56, 0.2), straightBumper(scene, 2.6, -1, 1.06, 0.38, 0.58, 0.2));
  for (const sx of [-1, 1]) {
    red.push(box(scene, 'tailB', 0.16, 0.34, 0.012, sx * 0.86, 1.0, -2.506)); // wrap-round tail lamp: rear lens on the panel, side lens below (gTail)
    // West Coast mirror on two arms: tall glass facing back, toed in slightly
    ch.push(box(scene, 'mirArm', 0.3, 0.03, 0.03, sx * 1.1, 1.58, 1.3), box(scene, 'mirArm2', 0.3, 0.03, 0.03, sx * 1.1, 1.32, 1.3));
    blk.push(box(scene, 'mirror', 0.2, 0.38, 0.05, sx * 1.34, 1.45, 1.3, sx * 0.12)); ch.push(box(scene, 'mirGlass', 0.17, 0.34, 0.01, sx * 1.337, 1.45, 1.272, sx * 0.12));
    ch.push(box(scene, 'handle', 0.025, 0.04, 0.2, sx * 1.005, 1.22, 0.55), box(scene, 'handle2', 0.025, 0.04, 0.2, sx * 1.005, 1.22, -0.6));
    amber.push(box(scene, 'mk', 0.02, 0.06, 0.14, sx * 1.0, 0.86, 2.2)); red.push(box(scene, 'mkR', 0.02, 0.06, 0.14, sx * 1.0, 0.7, -2.12)); // side marker clear of the wrap-round tail lamp
    ch.push(box(scene, 'emb', 0.01, 0.05, 0.3, sx * 1.0, 1.08, 1.55));
    ch.push(tube(scene, [V3(sx * 0.78, 2.14, -2.35), V3(sx * 0.78, 2.14, -0.4)], 0.025)); for (const zz of [-2.35, -0.4]) ch.push(tube(scene, [V3(sx * 0.78, 2.14, zz), V3(sx * 0.78, 2.02, zz)], 0.02));
    ch.push(box(scene, 'wiper', 0.6, 0.012, 0.02, sx * 0.35, 1.26, 1.85, 0.1 * sx));
  }
  for (const zz of [-2.2, -1.5, -0.8]) ch.push(tube(scene, [V3(-0.78, 2.14, zz), V3(0.78, 2.14, zz)], 0.02));
  const pR = box(scene, 'plateR', 0.48, 0.14, 0.012, 0, 0.72, -2.51);
  const gTail = new Geo(); sidePoly(gTail, [[-2.36, 0.83], [-2.49, 0.83], [-2.49, 1.17], [-2.36, 1.17]], vSideX, null, scene, 0.006); red.push(gTail.mesh('vTailSide', scene));
  for (const sx of [-1, 1]) under.push(box(scene, 'rail', 0.1, 0.14, 4.6, sx * 0.6, 0.5, 0.1));
  under.push(cyl(scene, 'axle', 0.11, 1.6, 0, V_AY, V_ARCH[0], 0, 0, Math.PI / 2), box(scene, 'tank', 1.0, 0.25, 0.6, 0.2, 0.5, -1.9), box(scene, 'eng', 0.6, 0.3, 0.8, 0, 0.5, 1.3));
  under.push(tube(scene, [V3(0.7, 0.42, 1.0), V3(0.85, 0.42, 0.2), V3(0.92, 0.45, -0.9)], 0.04)); // side exhaust
  const wheelsAt = { AY: V_AY, hub: M.steelHub || M.hub, tire: M.tireBlack || M.tire, R: 0.41, W: 0.24, rimR: 0.22 };
  return finishCar(scene, M, opts, [[body, M.paint], [gw.mesh('vWind', scene), M.wind || M.glass], [gs.mesh('vGlass', scene), M.glass], [merge(ch, 'vChrome'), M.chrome], [merge(blk, 'vBlack'), M.black],
    [merge(amber, 'vAmber'), M.amber], [merge(head, 'vHead'), M.head], [merge(red, 'vTail'), M.tail], [pR, M.plate], [merge(under, 'vUnder'), M.under || M.pipe], [gU.mesh('vFloor', scene), M.under || M.pipe]], wheelsAt);
}

// ---------- '60s bug ("buggy") ----------
const BCM = root.RLTex.CARMAPS.buggy;
const B_TOP = [[-1.98, 0.58], [-1.85, 0.72], [-1.6, 0.86], [-1.25, 1.05], [-0.95, 1.27], [-0.65, 1.42], [-0.3, 1.49], [0.15, 1.48], [0.38, 1.42], [0.82, 0.98], [1.0, 0.95], [1.4, 0.9], [1.72, 0.81], [1.9, 0.7], [1.97, 0.6]];
const B_HW = [[-1.98, 0.44], [-1.7, 0.56], [-1.2, 0.66], [-0.6, 0.72], [0.6, 0.72], [1.0, 0.66], [1.5, 0.56], [1.97, 0.44]];
const B_BOT = 0.4, B_BELT = 1.0;
const bTop = z => pw(B_TOP, z), bHW = z => pw(B_HW, z);
const bS = (z, y) => [(z - BCM.z0) / BCM.len, Math.min(Math.max(y, 0) / BCM.ymax, 1) * 0.5], bT = (z, x) => [(z - BCM.z0) / BCM.len, 0.5 + (Math.max(-1, Math.min(1, x)) + 1) / 4 * 0.998];
const bRoofHW = z => Math.min(bHW(z) - 0.06, 0.6);
function buggySection(z) {
  const yt = bTop(z), hw = bHW(z), yb = B_BOT, H = yt - yb;
  const belt = Math.min(B_BELT, yt - 0.12), c = Math.min(0.22, Math.max(0.05, (yt - belt) * 0.6 + 0.08));
  const side = [[0, yb, 'U'], [hw - 0.1, yb, 'U'], [hw - 0.02, yb + 0.07, 'S'], [hw, yb + (belt - yb) * 0.55, 'S'], [hw - 0.015, belt, 'S']];
  const tb = Math.min(1, Math.max(0, (yt - belt - 0.12) / 0.22)), topX = (hw - 0.04) + (bRoofHW(z) - (hw - 0.04)) * tb * tb * (3 - 2 * tb); side.push([topX, Math.max(yt - c, belt + 0.01), 'S']); // smooth blend into the glasshouse (no ridge)
  const round = []; for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; round.push([topX - c + c * Math.cos(a), Math.max(yt - c, belt + 0.01) + (yt - Math.max(yt - c, belt + 0.01)) * Math.sin(a), 'T']); }
  return { side, round, top: [[Math.max(0.05, (topX - c) * 0.5), yt + 0.012, 'T'], [0, yt + 0.02, 'T']], yt, yb };
}
// side surface x at (z, y), up over the rounded roof edge too, so side glass follows it
const bSideX = (z, y) => { const sct = buggySection(z); const pts = [...sct.side.slice(1), ...sct.round]; for (let i = 1; i < pts.length; i++) if (y <= pts[i][1]) { const a = pts[i - 1], b = pts[i]; return a[0] + (b[0] - a[0]) * (y - a[1]) / Math.max(b[1] - a[1], 1e-4); } return pts[pts.length - 1][0]; };
function buildBuggy(scene, M, opts) {
  const Z = []; for (let z = -1.98; z <= 1.975; z += 0.07) Z.push(+z.toFixed(3)); Z.push(1.97);
  const gU = new Geo(); const g = loftBody([...new Set(Z)].sort((a, b) => a - b), buggySection, bS, bT, undefined, gU); const body = g.mesh('bugBody', scene);
  // four bulbous fenders over the wheels, open underneath
  const fend = [], fM = {};
  for (const [zc, sx, sz, sy] of [[1.22, 0.29, 0.74, 0.5], [-1.18, 0.31, 0.84, 0.56]]) for (const s of [-1, 1]) {
    fM[(zc > 0 ? 'F' : 'R') + s] = BABYLON.Matrix.Compose(new BABYLON.Vector3(sx, sy, sz), BABYLON.Quaternion.RotationYawPitchRoll(0, zc > 0 ? 0.08 : -0.06, 0), new BABYLON.Vector3(s * 0.65, 0.4, zc));
    const f = BABYLON.MeshBuilder.CreateSphere('fender', { diameter: 2, segments: 18, slice: 0.5, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    f.scaling.set(sx, sy, sz); f.position.set(s * 0.65, 0.4, zc); f.rotation.x = zc > 0 ? 0.08 : -0.06; f.bakeCurrentTransformIntoVertices(); atlasUV(f, BCM); fend.push(f);
  }
  const fenders = merge(fend, 'fenders');
  const gw = new Geo(), gs = new Geo(), ch = [], blk = [], amber = [], head = [], red = [], under = [], gLamp = new Geo(), gSig = new Geo(), gTailL = new Geo();
  const roofHalf = z => { const sct = buggySection(z); const flat = sct.side[sct.side.length - 1][0] - (sct.round.length ? (sct.side[sct.side.length - 1][0] - sct.round[sct.round.length - 1][0]) : 0); return Math.max(0.1, Math.min(bRoofHW(z) - 0.2, flat - 0.06)); };
  const wEdge = glassOnTop(gw, 0.8, 0.42, bTop, roofHalf, 0.016, 0.022); ch.push(tube(scene, [...wEdge, wEdge[0]], 0.014));
  const rEdge = glassOnTop(gs, -0.92, -1.12, bTop, z => roofHalf(z) * 0.75, 0.016, 0.022); ch.push(tube(scene, [...rEdge, rEdge[0]], 0.012));
  sidePoly(gs, [[0.72, 1.03], [0.36, 1.38], [0.0, 1.41], [0.0, 1.03]], bSideX, ch, scene);
  sidePoly(gs, [[-0.06, 1.03], [-0.06, 1.41], [-0.42, 1.38], [-0.72, 1.06]], bSideX, ch, scene);
  for (const s of [-1, 1]) {
    // lamps are patches of the fender surface itself, so they sit flush on the curve
    ch.push(tube(scene, fenderLens(gLamp, fM['F' + s], V3(0, 0.6, 0.8), 0.27, 0.16, 1.014), 0.014, 8)); fenderLens(gLamp, fM['F' + s], V3(0, 0.6, 0.8), 0.24, 0.14, 1.02);
    fenderLens(gSig, fM['F' + s], V3(0, 0.9, 0.44), 0.12, 0.09, 1.012); // indicator on top of the front fender
    fenderLens(gTailL, fM['R' + s], V3(0, 0.58, -0.81), 0.2, 0.25, 1.012);
    blk.push(box(scene, 'board', 0.16, 0.05, 1.3, s * 0.72, 0.37, 0.02));
    ch.push(box(scene, 'handle', 0.02, 0.03, 0.14, s * 0.725, 0.98, -0.02));
    const m = BABYLON.MeshBuilder.CreateSphere('mir', { diameter: 0.14, segments: 8 }, scene); m.scaling.z = 0.5; m.position.set(s * 0.82, 1.08, 0.58); ch.push(m);
    ch.push(box(scene, 'overF', 0.035, 0.22, 0.04, s * 0.38, 0.5, 2.06), box(scene, 'overR', 0.035, 0.22, 0.04, s * 0.38, 0.5, -2.08));
    under.push(cyl(scene, 'pipe', 0.06, 0.25, s * 0.2, 0.38, -2.0, Math.PI / 2, 0, 0));
    ch.push(box(scene, 'wiper', 0.38, 0.01, 0.02, s * 0.22, 0.99, 0.8, 0.1 * s));
  }
  ch.push(straightBumper(scene, 2.02, 1, 0.82, 0.42, 0.5, 0.25), straightBumper(scene, 2.04, -1, 0.82, 0.42, 0.5, 0.25));
  for (let k = 0; k < 6; k++) { const z = -1.48 - k * 0.055; blk.push(box(scene, 'louver', 0.32, 0.02, 0.025, 0, bTop(z) + 0.016, z, 0, -0.75)); } // on the engine lid, not above it
  // bonnet handle and centre trim follow the bonnet (the trim used to be a straight rod sticking out past its nose)
  ch.push(box(scene, 'hoodH', 0.08, 0.02, 0.06, 0, bTop(1.84) + 0.016, 1.84, 0, 0.55)); const trim = []; for (let z = 0.86; z <= 1.8; z += 0.04) trim.push(V3(0, bTop(z) + 0.022, z)); ch.push(tube(scene, trim, 0.009, 5));
  head.push(gLamp.mesh('bLamp', scene)); amber.push(gSig.mesh('bSig', scene)); red.push(gTailL.mesh('bTailL', scene));
  const pR = box(scene, 'plateR', 0.4, 0.12, 0.012, 0, 0.62, -1.995);
  under.push(box(scene, 'pan', 1.1, 0.06, 3.3, 0, 0.38, 0), box(scene, 'engine', 0.8, 0.36, 0.6, 0, 0.55, -1.6), cyl(scene, 'axle', 0.08, 1.2, 0, 0.36, -1.18, 0, 0, Math.PI / 2), cyl(scene, 'beam', 0.1, 1.1, 0, 0.42, 1.22, 0, 0, Math.PI / 2));
  const wheelsAt = { AY: 0.36, hub: M.steelHub || M.hub, tire: M.tireBlack || M.tire, R: 0.36, W: 0.17, rimR: 0.2 };
  return finishCar(scene, M, opts, [[body, M.paint], [fenders, M.paintDouble || M.paint], [gw.mesh('bWind', scene), M.wind || M.glass], [gs.mesh('bGlass', scene), M.glass], [merge(ch, 'bChrome'), M.chrome], [merge(blk, 'bBlack'), M.black],
    [merge(amber, 'bAmber'), M.amber], [merge(head, 'bHead'), M.head], [merge(red, 'bTail'), M.tail], [pR, M.plate], [merge(under, 'bUnder'), M.under || M.pipe], [gU.mesh('bFloor', scene), M.under || M.pipe]], wheelsAt);
}
function buildCar(scene, M, opts) { const t = (opts.spec && opts.spec.type) || 'coupe'; return t === 'van' ? buildVan(scene, M, opts) : t === 'buggy' ? buildBuggy(scene, M, opts) : buildCoupe(scene, M, opts); }
root.RLCar3D = { buildCar };
})(typeof window !== 'undefined' ? window : globalThis);

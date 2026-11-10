// ===================== RUSTIC LEAGUE — ARENA & FARM SCENERY =====================
(function (root) {
'use strict';
const { Geo, triangulate, sweep, sphere, lathe, disc, merge } = root.RLMesh;
const S = root.RLSim; const A = S.A;
const V3 = (x, y, z) => new BABYLON.Vector3(x, y, z);

// metric-uv box
function mbox(scene, name, w, h, d, tile = 2) {
  const g = new Geo(); const hw = w / 2, hh = h / 2, hd = d / 2;
  const F = [[[1, 0, 0], [[hw, -hh, -hd], [hw, -hh, hd], [hw, hh, hd], [hw, hh, -hd]], d, h], [[-1, 0, 0], [[-hw, -hh, hd], [-hw, -hh, -hd], [-hw, hh, -hd], [-hw, hh, hd]], d, h],
    [[0, 0, 1], [[hw, -hh, hd], [-hw, -hh, hd], [-hw, hh, hd], [hw, hh, hd]], w, h], [[0, 0, -1], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd]], w, h],
    [[0, 1, 0], [[-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd]], w, d], [[0, -1, 0], [[-hw, -hh, hd], [hw, -hh, hd], [hw, -hh, -hd], [-hw, -hh, -hd]], w, d]];
  for (const [n, q, uw, vh] of F) { const ids = q.map((p, k) => g.v(p[0], p[1], p[2], [0, uw, uw, 0][k] / tile, [0, 0, vh, vh][k] / tile)); g.quad(ids[0], ids[1], ids[2], ids[3], ...n); }
  return g.mesh(name, scene);
}
// rounded-rect perimeter path, wall line, inward normals
function perimeter(segs, step = 1) {
  const pts = []; let s = 0;
  const push = (x, z, nx, nz) => { if (pts.length) { const l = pts[pts.length - 1]; s += Math.hypot(x - l.x, z - l.z); if (Math.hypot(x - l.x, z - l.z) < 1e-6) return; } pts.push({ x, z, nx, nz, s }); };
  for (const sg of segs) {
    if (sg.line) { const [a, b] = sg.line; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / step)); for (let i = 0; i <= n; i++) push(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, sg.n[0], sg.n[1]); }
    else { const [cx, cz, r, a0, a1] = sg.arc; const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / (step * 0.6))); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; push(cx + r * Math.cos(a), cz + r * Math.sin(a), -Math.cos(a), -Math.sin(a)); } }
  }
  return pts;
}
function arenaPaths() {
  const ix = A.HX - A.RC, iz = A.HZ - A.RC, G = A.GW, H = Math.PI / 2;
  const segA = [{ line: [[G, A.HZ], [ix, A.HZ]], n: [0, -1] }, { arc: [ix, iz, A.RC, H, 0] }, { line: [[A.HX, iz], [A.HX, -iz]], n: [-1, 0] }, { arc: [ix, -iz, A.RC, 0, -H] }, { line: [[ix, -A.HZ], [G, -A.HZ]], n: [0, 1] }];
  const segB = [{ line: [[-G, -A.HZ], [-ix, -A.HZ]], n: [0, 1] }, { arc: [-ix, -iz, A.RC, -H, -Math.PI] }, { line: [[-A.HX, -iz], [-A.HX, iz]], n: [1, 0] }, { arc: [-ix, iz, A.RC, Math.PI, H] }, { line: [[-ix, A.HZ], [-G, A.HZ]], n: [0, -1] }];
  const loop = [...segA, { line: [[G, -A.HZ], [-G, -A.HZ]], n: [0, 1] }, ...segB, { line: [[-G, A.HZ], [G, A.HZ]], n: [0, -1] }];
  return { A: perimeter(segA), B: perimeter(segB), loop: perimeter(loop, 1.5) };
}

function build(scene, M, Q, tex) {
  const casters = [], statics = [];
  const add = (m, mat, cast = false) => { if (!m) return m; m.material = mat; if (cast) casters.push(m); statics.push(m); m.receiveShadows = true; return m; };
  const paths = arenaPaths();

  // ---------- ground ----------
  const ground = BABYLON.MeshBuilder.CreateGround('field', { width: 2 * (A.HX + 4), height: 2 * (A.HZ + 12), subdivisions: 4 }, scene);
  add(ground, M.field);
  const farm = BABYLON.MeshBuilder.CreateGround('farm', { width: 1600, height: 1600, subdivisions: 2 }, scene); farm.position.y = -0.03; add(farm, M.farm);

  // ---------- quarter-pipe walls ----------
  const prof = []; for (let k = 0; k <= 12; k++) { const t = k / 12 * Math.PI / 2; prof.push([A.RR - A.RR * Math.sin(t), A.RR - A.RR * Math.cos(t)]); }
  prof.push([0, A.WALL_TOP]);
  const wg = new Geo();
  // large-scale grime baked into vertex colours: darker low down, blotchy along the perimeter, a tint per 3 m panel
  const N = root.RLTex.N1, N2 = root.RLTex.N2;
  const grime = (pt, pr) => { const y = pr[1]; const big = N.fbm(pt.s / 28 + 3, 0.5, 4, 4096, 4096), pan = N2.v(Math.floor(pt.s / 3) * 1.7, 0.3, 4096, 4096);
    let k = 0.8 + big * 0.3; k *= 0.95 + pan * 0.1; k *= 0.85 + 0.15 * Math.min(1, y / 2.2); const w = 0.98 + pan * 0.04; return [k * w, k, k * (2 - w)]; };
  // one unique, pre-baked texture covers the whole wall: rows of the atlas run end to end along the perimeter
  const WM = root.RL_WALL.meta, RL = WM.ROWLEN, PXM = WM.PX, ROWH = WM.ROWH, TH = WM.H;
  const fullP = [...prof, [-0.45, A.WALL_TOP]]; const PL = [0]; for (let k = 1; k < fullP.length; k++) PL.push(PL[k - 1] + Math.hypot(fullP[k][0] - fullP[k - 1][0], fullP[k][1] - fullP[k - 1][1]));
  let sBase = 0;
  for (const path of [paths.A, paths.B]) {
    const cols = [];
    path.forEach((pt, i) => { const sg = sBase + pt.s;
      if (i > 0) { const pv = cols[cols.length - 1], r0 = Math.floor(pv.sg / RL), r1 = Math.floor(sg / RL);
        if (r1 > r0) { const sb = r1 * RL, t = (sb - pv.sg) / (sg - pv.sg); const ip = { x: pv.pt.x + (pt.x - pv.pt.x) * t, z: pv.pt.z + (pt.z - pv.pt.z) * t, nx: pt.nx, nz: pt.nz, s: pv.pt.s + (pt.s - pv.pt.s) * t };
          cols.push({ pt: ip, sg: sb - 1e-4 }); cols.push({ pt: ip, sg: sb + 1e-4, cut: true }); } }
      cols.push({ pt, sg }); });
    const grid = cols.map(cl => { const row = Math.floor(cl.sg / RL); const u = (cl.sg - row * RL) / RL;
      return fullP.map((pr, k) => { wg.col(...grime(cl.pt, pr)); return wg.v(cl.pt.x + cl.pt.nx * pr[0], pr[1], cl.pt.z + cl.pt.nz * pr[0], u, (row * ROWH + PL[k] * PXM) / TH); }); });
    for (let i = 0; i < cols.length - 1; i++) { if (cols[i + 1].cut) continue;
      for (let k = 0; k < fullP.length - 1; k++) { const dw = fullP[k + 1][0] - fullP[k][0], dy = fullP[k + 1][1] - fullP[k][1], pt = cols[i].pt;
        wg.quad(grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1], pt.nx * dy, -dw, pt.nz * dy); } }
    sBase += path[path.length - 1].s + 3;
  }
  // the last atlas row is never reached by the perimeter (max ~553 m): caps and the panels above the goals use it
  const spU = m => Math.min(0.995, (2 + m) / RL), spV = m => Math.min(0.999, (4 * ROWH + 0.5 * PXM + m * PXM) / TH);
  const cap = [...prof, [-0.45, A.WALL_TOP], [-0.45, 0]];
  const capTris = triangulate(cap);
  for (const [px, pz, nx, nz, dirx] of [[A.GW, A.HZ, 0, -1, -1], [A.GW, -A.HZ, 0, 1, -1], [-A.GW, -A.HZ, 0, 1, 1], [-A.GW, A.HZ, 0, -1, 1]]) {
    const ids = cap.map(([w, y]) => { wg.col(0.8, 0.8, 0.8); return wg.v(px, y, pz + nz * w, spU(w + 3), spV(y)); });
    for (let t = 0; t < capTris.length; t += 3) wg.tri(ids[capTris[t]], ids[capTris[t + 1]], ids[capTris[t + 2]], dirx, 0, 0);
  }
  // panels above the goal mouths
  for (const sz of [-1, 1]) { const z = sz * A.HZ; const o = sz > 0 ? 12 : 12 + 2 * A.GW + 2; const V = (x, y, zz, u, v) => { wg.col(0.85, 0.85, 0.85); return wg.v(x, y, zz, u, v); };
    const a = V(-A.GW, A.GH, z, spU(o), spV(A.GH)), b = V(A.GW, A.GH, z, spU(o + 2 * A.GW), spV(A.GH)), c = V(A.GW, A.WALL_TOP, z, spU(o + 2 * A.GW), spV(A.WALL_TOP)), d = V(-A.GW, A.WALL_TOP, z, spU(o), spV(A.WALL_TOP)); wg.quad(a, b, c, d, 0, 0, -sz);
    const e = V(-A.GW, A.GH, z + sz * 0.45, spU(o), spV(A.GH - 0.45)), f = V(A.GW, A.GH, z + sz * 0.45, spU(o + 2 * A.GW), spV(A.GH - 0.45)); wg.quad(a, b, f, e, 0, -1, 0);
    const g2 = V(-A.GW, A.WALL_TOP, z + sz * 0.45, spU(o), spV(A.WALL_TOP + 0.45)), h2 = V(A.GW, A.WALL_TOP, z + sz * 0.45, spU(o + 2 * A.GW), spV(A.WALL_TOP + 0.45)); wg.quad(d, c, h2, g2, 0, 1, 0); }
  const walls = add(wg.mesh('walls', scene), M.wall, true);

  // ---------- fence, rail, poles ----------
  const fenceP = []; for (let k = 0; k <= 10; k++) { const y = A.WALL_TOP + (A.H - A.WALL_TOP) * k / 10; fenceP.push([S.fenceInset(y), y]); }
  const fence = add(sweep('fence', scene, paths.loop, fenceP, 1.2, 1.2).mesh('fence', scene), M.chain);
  const railPath = paths.loop.map(p => V3(p.x - p.nx * 0.2, A.WALL_TOP + 0.12, p.z - p.nz * 0.2)); railPath.push(railPath[0]);
  const pipes = [BABYLON.MeshBuilder.CreateTube('rail', { path: railPath, radius: 0.16, tessellation: 8 }, scene)];
  const topRail = paths.loop.map(p => V3(p.x + p.nx * S.fenceInset(A.H), A.H, p.z + p.nz * S.fenceInset(A.H))); topRail.push(topRail[0]);
  pipes.push(BABYLON.MeshBuilder.CreateTube('topRail', { path: topRail, radius: 0.09, tessellation: 6 }, scene));
  let lastS = -99;
  for (const p of paths.loop) { if (p.s - lastS < 9) continue; lastS = p.s; const path = [];
    for (let k = 0; k <= 8; k++) { const y = A.WALL_TOP - 0.2 + (A.H + 0.4 - A.WALL_TOP) * k / 8; const w = S.fenceInset(y) - 0.25; path.push(V3(p.x + p.nx * w, y, p.z + p.nz * w)); }
    pipes.push(BABYLON.MeshBuilder.CreateTube('pole', { path, radius: 0.14, tessellation: 6 }, scene)); }
  // overhead sagging cables
  for (let k = 0; k < 7; k++) { const z = -45 + k * 15, path = []; const inX = A.HX - S.fenceInset(A.H); for (let i = 0; i <= 12; i++) { const x = -inX + 2 * inX * i / 12; path.push(V3(x, A.H - 1.6 * Math.sin(i / 12 * Math.PI), z)); } pipes.push(BABYLON.MeshBuilder.CreateTube('cable', { path, radius: 0.04, tessellation: 4 }, scene)); }

  // ---------- goals ----------
  const ng = new Geo(); const nt = 0.8;
  for (const sz of [-1, 1]) { const z0 = sz * A.HZ, z1 = sz * (A.HZ + A.GD);
    for (const sx of [-1, 1]) { const x = sx * A.GW; const a = ng.v(x, 0, z0, 0, 0), b = ng.v(x, 0, z1, A.GD / nt, 0), c = ng.v(x, A.GH, z1, A.GD / nt, A.GH / nt), d = ng.v(x, A.GH, z0, 0, A.GH / nt); ng.quad(a, b, c, d, -sx, 0, 0); }
    { const a = ng.v(-A.GW, 0, z1, 0, 0), b = ng.v(A.GW, 0, z1, 2 * A.GW / nt, 0), c = ng.v(A.GW, A.GH, z1, 2 * A.GW / nt, A.GH / nt), d = ng.v(-A.GW, A.GH, z1, 0, A.GH / nt); ng.quad(a, b, c, d, 0, 0, -sz); }
    { const a = ng.v(-A.GW, A.GH, z0, 0, 0), b = ng.v(A.GW, A.GH, z0, 2 * A.GW / nt, 0), c = ng.v(A.GW, A.GH, z1, 2 * A.GW / nt, A.GD / nt), d = ng.v(-A.GW, A.GH, z1, 0, A.GD / nt); ng.quad(a, b, c, d, 0, -1, 0); }
    for (const zz of [(z0 * 2 + z1) / 3, (z0 + z1 * 2) / 3]) { const r = 0.7, g = A.GW + 0.05, h = A.GH + 0.02;
      const path = [V3(-g, 0, zz), V3(-g, h - r, zz)]; for (let k = 1; k < 6; k++) { const t = Math.PI - k / 6 * Math.PI / 2; path.push(V3(-g + r + r * Math.cos(t), h - r + r * Math.sin(t), zz)); }
      path.push(V3(g - r, h, zz)); for (let k = 1; k < 6; k++) { const t = Math.PI / 2 - k / 6 * Math.PI / 2; path.push(V3(g - r + r * Math.cos(t), h - r + r * Math.sin(t), zz)); } path.push(V3(g, h - r, zz), V3(g, 0, zz));
      pipes.push(BABYLON.MeshBuilder.CreateTube('rib', { path, radius: 0.08, tessellation: 8 }, scene)); }
    // coloured plastic frame: posts + crossbar at the mouth (solid in the physics), beams running back along the sides
    const beams = [];
    for (const [cx, cy, cz, hx, hy, hz] of S.FRAME.filter(f => Math.sign(f[2]) === sz)) { const b = mbox(scene, 'beam', hx * 2, hy * 2, hz * 2, 1.2); b.position.set(cx, cy, cz); beams.push(b); }
    // posts: square plastic beams laid along the ramp edge either side of the mouth (sitting on the surface, not through it)
    const T = 0.2; const shape = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; shape.push(V3(Math.cos(a) * 0.3 * 1.08, Math.sin(a) * T * 1.08, 0)); } shape.push(shape[0]);
    for (const sx of [-1, 1]) { const path = [];
      for (let k = 0; k <= 14; k++) { const t = k / 14 * Math.PI / 2; const w = A.RR - A.RR * Math.sin(t), y = A.RR - A.RR * Math.cos(t);
        path.push(V3(sx * (A.GW + 0.27), y + Math.cos(t) * T, sz * (A.HZ - w - Math.sin(t) * T))); }
      path.push(V3(sx * (A.GW + 0.27), A.GH + 0.5, sz * (A.HZ - T)));
      const post = BABYLON.MeshBuilder.ExtrudeShape('post', { shape, path, cap: BABYLON.Mesh.CAP_ALL, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
      // the extrusion spreads one texture repeat over the whole ~11 m post: rescale to the beams' 1.2 m repeat
      let plen = 0; for (let k = 1; k < path.length; k++) plen += BABYLON.Vector3.Distance(path[k], path[k - 1]); let per = 0; for (let k = 1; k < shape.length; k++) per += BABYLON.Vector3.Distance(shape[k], shape[k - 1]);
      const uv = post.getVerticesData(BABYLON.VertexBuffer.UVKind); for (let k = 0; k < uv.length; k += 2) { uv[k] *= per / 1.2; uv[k + 1] *= plen / 1.2; } post.setVerticesData(BABYLON.VertexBuffer.UVKind, uv);
      beams.push(post); }
    for (const sx of [-1, 1]) {
      for (const [y, hh] of [[A.GH + 0.3, 0.5], [0.16, 0.32]]) { const b = mbox(scene, 'side', 0.42, hh, A.GD, 1.2); b.position.set(sx * (A.GW + 0.24), y, sz * (A.HZ + A.GD / 2)); beams.push(b); }
      const bp = mbox(scene, 'backPost', 0.42, A.GH + 0.55, 0.42, 1.2); bp.position.set(sx * (A.GW + 0.24), (A.GH + 0.55) / 2, sz * (A.HZ + A.GD + 0.2)); beams.push(bp);
    }
    const bb = mbox(scene, 'backBar', 2 * A.GW + 0.9, 0.45, 0.42, 1.2); bb.position.set(0, A.GH + 0.3, sz * (A.HZ + A.GD + 0.2)); beams.push(bb);
    const bm = merge(beams, 'goalFrame' + sz); add(bm, sz < 0 ? M.plastic0 : M.plastic1, true);
  }
  const net = add(ng.mesh('nets', scene), M.net);
  const pipeMesh = add(merge(pipes, 'pipes'), M.pipe, true);

  // ---------- floodlight towers (instanced) ----------
  const tw = [], lamps = [];
  const H = 30, b0 = 1.4, b1 = 0.6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p0 = V3(sx * b0, 0, sz * b0), p1 = V3(sx * b1, H, sz * b1); tw.push(BABYLON.MeshBuilder.CreateTube('leg', { path: [p0, p1], radius: 0.13, tessellation: 6 }, scene)); }
  for (let y = 0; y < H - 2; y += 3) { const w0 = b0 + (b1 - b0) * y / H, w1 = b0 + (b1 - b0) * (y + 3) / H;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      tw.push(BABYLON.MeshBuilder.CreateTube('br', { path: [V3(a[0] * w0, y, a[1] * w0), V3(b[0] * w1, y + 3, b[1] * w1)], radius: 0.05, tessellation: 4 }, scene));
      tw.push(BABYLON.MeshBuilder.CreateTube('br2', { path: [V3(b[0] * w0, y, b[1] * w0), V3(a[0] * w1, y + 3, a[1] * w1)], radius: 0.05, tessellation: 4 }, scene)); } }
  const head = BABYLON.MeshBuilder.CreateBox('head', { width: 5.2, height: 3.6, depth: 0.25 }, scene); head.position.set(0, H + 1.4, 0.5); tw.push(head);
  const plat = BABYLON.MeshBuilder.CreateBox('plat', { width: 3, height: 0.15, depth: 2.4 }, scene); plat.position.set(0, H - 0.3, 0); tw.push(plat);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const can = BABYLON.MeshBuilder.CreateCylinder('can', { height: 0.5, diameter: 0.9, tessellation: 12 }, scene); can.rotation.x = Math.PI / 2; can.position.set(-1.8 + i * 1.2, H + 0.4 + j * 1.05, 0.85); tw.push(can);
    const lens = BABYLON.MeshBuilder.CreateDisc('lens', { radius: 0.4, tessellation: 12 }, scene); lens.position.set(-1.8 + i * 1.2, H + 0.4 + j * 1.05, 1.11); lens.rotation.y = Math.PI; lamps.push(lens); }
  const towerT = merge(tw, 'tower'); towerT.material = M.pipe; const lampT = merge(lamps, 'lamps'); lampT.material = M.lamp;
  const towerSpots = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const cx = sx * (A.HX - A.RC), cz = sz * (A.HZ - A.RC); towerSpots.push([cx + sx * (A.RC + 6) * 0.7071, cz + sz * (A.RC + 6) * 0.7071]); }
  towerSpots.push([A.HX + 6, 0], [-A.HX - 6, 0]);
  towerSpots.forEach(([x, z], i) => { const yaw = Math.atan2(-x, -z);
    const t = i === 0 ? towerT : towerT.createInstance('tw' + i); t.position.set(x, 0, z); t.rotation.y = yaw; casters.push(t);
    const l = i === 0 ? lampT : lampT.createInstance('lp' + i); l.position.set(x, 0, z); l.rotation.y = yaw; });

  // ---------- launch pads ----------
  const pads = [];
  const plateTop = disc('padTop', scene, S.PAD.R, 48, 1); plateTop.material = M.wood;
  const plateSide = BABYLON.MeshBuilder.CreateCylinder('padSide', { height: S.PAD.T, diameter: S.PAD.R * 2, tessellation: 48, cap: BABYLON.Mesh.NO_CAP }, scene); plateSide.position.y = -S.PAD.T / 2; plateSide.material = M.iron;
  const plateBot = disc('padBot', scene, S.PAD.R, 32, -1); plateBot.position.y = -S.PAD.T; plateBot.material = M.iron;
  const plateT = BABYLON.Mesh.MergeMeshes([plateTop, plateSide, plateBot], true, true, undefined, true, true); plateT.name = 'plateT';
  const pit = disc('pit', scene, S.PAD.R + 0.05, 40, 1); pit.material = M.pit;
  const rimRing = lathe('rim', scene, [[S.PAD.R + 0.05, 0.012], [S.PAD.R + 0.42, 0.012]], 48, -1); rimRing.material = M.iron;
  // helix spring
  const hel = []; for (let k = 0; k <= 120; k++) { const a = k / 120 * Math.PI * 2 * 7; hel.push(V3(Math.cos(a) * 0.55, k / 120, Math.sin(a) * 0.55)); }
  const springT = BABYLON.MeshBuilder.CreateTube('spring', { path: hel, radius: 0.06, tessellation: 6 }, scene); springT.material = M.iron;
  S.PAD_POS.forEach((p, i) => {
    const pt = pit.clone('pit' + i); pt.position.set(p.x, 0.008, p.z); pt.receiveShadows = true;
    const rr = rimRing.clone('rim' + i); rr.position.set(p.x, 0, p.z); rr.receiveShadows = true;
    const lampMat = M.padLamp.clone('padLamp' + i); const bulbs = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const b = BABYLON.MeshBuilder.CreateSphere('bulb', { diameter: 0.16, segments: 6 }, scene); b.position.set(p.x + Math.cos(a) * (S.PAD.R + 0.24), 0.05, p.z + Math.sin(a) * (S.PAD.R + 0.24)); bulbs.push(b); }
    const bm = merge(bulbs, 'bulbs' + i); bm.material = lampMat;
    const node = new BABYLON.TransformNode('pad' + i, scene); node.rotationQuaternion = new BABYLON.Quaternion();
    const pl = plateT.clone('plate' + i); pl.parent = node; pl.receiveShadows = true; casters.push(pl);
    const sp = springT.clone('spr' + i); sp.setEnabled(false); casters.push(sp);
    pads.push({ node, plate: pl, spring: sp, lampMat, c: p });
  });
  [plateT, pit, rimRing, springT].forEach(m => m.setEnabled(false));

  // ---------- sky, hills, scenery ----------
  const sky = sphere('sky', scene, 950, 48, 96, true); sky.material = M.sky; sky.infiniteDistance = true; sky.isPickable = false;
  const hg = new Geo(); const NA = 160, NR = 8; const ring = [];
  for (let i = 0; i <= NA; i++) { const a = i / NA * Math.PI * 2; const row = [];
    for (let r = 0; r <= NR; r++) { const rad = 240 + r * 70; const t = r / NR; const n = root.RLTex.N1.fbm(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 4, 5, 4096, 4096);
      const hgt = Math.sin(t * Math.PI) * (12 + n * 70) + Math.sin(a * 3 + 1) * 8 * Math.sin(t * Math.PI); row.push(hg.v(Math.sin(a) * rad, hgt - 1, Math.cos(a) * rad, a * 40, rad / 8)); }
    ring.push(row); }
  for (let i = 0; i < NA; i++) for (let r = 0; r < NR; r++) hg.quad(ring[i][r], ring[i + 1][r], ring[i + 1][r + 1], ring[i][r + 1], 0, 1, 0);
  const hills = hg.mesh('hills', scene); hills.material = M.hills;

  // barn
  const barnN = new BABYLON.TransformNode('barn', scene); barnN.position.set(A.HX + 20, 0, A.HZ + 35); barnN.rotation.y = -0.35;
  const bw = mbox(scene, 'barnW', 22, 9, 30, 2); bw.position.y = 4.5; bw.parent = barnN; add(bw, M.barn, true);
  const rg = new Geo(); const rp = [[-11.8, 8.8], [-8.6, 13.4], [0, 15.6], [8.6, 13.4], [11.8, 8.8]];
  for (let k = 0; k < rp.length - 1; k++) { const [x0, y0] = rp[k], [x1, y1] = rp[k + 1]; const L = Math.hypot(x1 - x0, y1 - y0);
    const a = rg.v(x0, y0, -15.6, 0, 0), b = rg.v(x1, y1, -15.6, L / 1.5, 0), c = rg.v(x1, y1, 15.6, L / 1.5, 31.2 / 1.5), d = rg.v(x0, y0, 15.6, 0, 31.2 / 1.5); rg.quad(a, b, c, d, -(y1 - y0), x1 - x0, 0); }
  const roof = rg.mesh('roof', scene); roof.parent = barnN; add(roof, M.tinRoof, true);
  const gg = new Geo(); const gp = [[-11, 9], [-8.4, 13.2], [0, 15.3], [8.4, 13.2], [11, 9]]; const gt = triangulate(gp);
  for (const sz of [-1, 1]) { const ids = gp.map(([x, y]) => gg.v(x, y, sz * 15, x / 2, y / 2)); for (let t = 0; t < gt.length; t += 3) gg.tri(ids[gt[t]], ids[gt[t + 1]], ids[gt[t + 2]], 0, 0, sz); }
  const gab = gg.mesh('gables', scene); gab.parent = barnN; add(gab, M.barn);
  const trims = [];
  for (const sz of [-1, 1]) { const z = sz * 15.05;
    const dr = BABYLON.MeshBuilder.CreateBox('door', { width: 8, height: 6.5, depth: 0.1 }, scene); dr.position.set(0, 3.25, z); trims.push(dr);
    const loft = BABYLON.MeshBuilder.CreateBox('loft', { width: 3, height: 2.6, depth: 0.1 }, scene); loft.position.set(0, 11.2, z); trims.push(loft); }
  const darkB = merge(trims, 'barnDark'); darkB.parent = barnN; add(darkB, M.black);
  const wt = [];
  for (const sz of [-1, 1]) { const z = sz * 15.12;
    for (const [w, h, x, y, r] of [[8.4, 0.3, 0, 6.6, 0], [8.4, 0.3, 0, 0.15, 0], [0.3, 6.8, -4.1, 3.3, 0], [0.3, 6.8, 4.1, 3.3, 0], [0.3, 6.8, 0, 3.3, 0], [0.25, 8.6, -2, 3.3, 0.89], [0.25, 8.6, 2, 3.3, -0.89], [3.4, 0.25, 0, 12.5, 0], [3.4, 0.25, 0, 9.9, 0], [0.25, 2.8, -1.6, 11.2, 0], [0.25, 2.8, 1.6, 11.2, 0]]) {
      const b = BABYLON.MeshBuilder.CreateBox('trim', { width: w, height: h, depth: 0.08 }, scene); b.position.set(x, y, z); b.rotation.z = r; wt.push(b); } }
  const whiteT = merge(wt, 'barnTrim'); whiteT.parent = barnN; add(whiteT, M.trim);
  const silo = BABYLON.MeshBuilder.CreateCylinder('silo', { height: 19, diameter: 7.4, tessellation: 32 }, scene); silo.position.set(A.HX, 9.5, A.HZ + 45); add(silo, M.silo, true);
  const dome = BABYLON.MeshBuilder.CreateSphere('dome', { diameter: 7.6, slice: 0.5, segments: 16 }, scene); dome.position.set(A.HX, 19, A.HZ + 45); add(dome, M.tinRoof);

  // windmill
  const wmN = new BABYLON.TransformNode('windmill', scene); wmN.position.set(6, 0, A.HZ + 31);
  const wmp = []; const WH = 15;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) wmp.push(BABYLON.MeshBuilder.CreateTube('wl', { path: [V3(sx * 2.4, 0, sz * 2.4), V3(sx * 0.35, WH, sz * 0.35)], radius: 0.08, tessellation: 5 }, scene));
  for (let y = 0; y < WH - 1; y += 2.5) { const w0 = 2.4 + (0.35 - 2.4) * y / WH, w1 = 2.4 + (0.35 - 2.4) * (y + 2.5) / WH;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) wmp.push(BABYLON.MeshBuilder.CreateTube('wb', { path: [V3(a[0] * w0, y, a[1] * w0), V3(b[0] * w1, y + 2.5, b[1] * w1)], radius: 0.035, tessellation: 4 }, scene)); }
  const vane = BABYLON.MeshBuilder.CreateBox('vane', { width: 0.06, height: 1.4, depth: 3 }, scene); vane.position.set(0, WH + 0.6, 2.2); wmp.push(vane);
  const boom = BABYLON.MeshBuilder.CreateBox('boom', { width: 0.1, height: 0.1, depth: 3.2 }, scene); boom.position.set(0, WH + 0.5, 1.2); wmp.push(boom);
  const wmT = merge(wmp, 'wmTower'); wmT.parent = wmN; add(wmT, M.pipe, true);
  const fan = new BABYLON.TransformNode('fan', scene); fan.parent = wmN; fan.position.set(0, WH + 0.5, -0.5);
  const fb = []; for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; const bl = BABYLON.MeshBuilder.CreateBox('bl', { width: 0.5, height: 2.6, depth: 0.03 }, scene); bl.position.set(Math.sin(a) * 2.0, Math.cos(a) * 2.0, 0); bl.rotation.z = -a; bl.rotation.y = 0.35; fb.push(bl); }
  const rimT = BABYLON.MeshBuilder.CreateTorus('rimT', { diameter: 6.4, thickness: 0.08, tessellation: 40 }, scene); rimT.rotation.x = Math.PI / 2; fb.push(rimT);
  const hubC = BABYLON.MeshBuilder.CreateCylinder('hubC', { height: 0.4, diameter: 0.5 }, scene); hubC.rotation.x = Math.PI / 2; fb.push(hubC);
  const fanM = merge(fb, 'fanM'); fanM.parent = fan; add(fanM, M.tinRoof, true);

  // trees: a big oak + scattered smaller ones
  function treeMesh(name, scale, seed) {
    const r = (k) => root.RLTex.N2.v(seed * 3.3 + k * 1.7, k * 0.9, 4096, 4096);
    const trunkPath = [V3(0, 0, 0), V3(0.2, 3 * scale, 0.1), V3(0.5, 5.5 * scale, -0.2)];
    const parts = [BABYLON.MeshBuilder.CreateTube('trunk', { path: trunkPath, radiusFunction: (i) => [0.9, 0.65, 0.45][i] * scale, tessellation: 10, cap: 0 }, scene)];
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + r(k); parts.push(BABYLON.MeshBuilder.CreateTube('br', { path: [V3(0.4, 4.6 * scale, -0.1), V3(Math.cos(a) * 3.5 * scale, (7 + r(k + 9) * 2) * scale, Math.sin(a) * 3.5 * scale)], radius: 0.28 * scale, tessellation: 6 }, scene)); }
    const trunk = merge(parts, name + 'T'); trunk.material = M.bark;
    const blobs = [];
    for (let k = 0; k < 22; k++) { const a = r(k) * Math.PI * 2 * 3, rr = (2 + r(k + 30) * 5) * scale, y = (7 + r(k + 60) * 6) * scale;
      const s = BABYLON.MeshBuilder.CreateIcoSphere('blob', { radius: (2.2 + r(k + 90) * 2.2) * scale, subdivisions: 2 }, scene); s.position.set(Math.cos(a) * rr, y - (rr / scale) * 0.4 * scale, Math.sin(a) * rr); s.scaling.y = 0.75; blobs.push(s); }
    const can = merge(blobs, name + 'C'); can.material = M.leaves;
    const pos = can.getVerticesData(BABYLON.VertexBuffer.PositionKind); for (let i = 0; i < pos.length; i += 3) { const n = root.RLTex.N3.v(pos[i] * 0.4 + 50, pos[i + 2] * 0.4 + pos[i + 1] * 0.3, 4096, 4096) - 0.5; pos[i] *= 1 + n * 0.25; pos[i + 1] += n * 1.2 * scale; pos[i + 2] *= 1 + n * 0.25; }
    can.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos); const nn = []; BABYLON.VertexData.ComputeNormals(pos, can.getIndices(), nn); can.updateVerticesData(BABYLON.VertexBuffer.NormalKind, nn);
    return [trunk, can];
  }
  const [oakT, oakC] = treeMesh('oak', 1.5, 1); oakT.position.set(-(A.HX + 26), 0, A.HZ + 9); oakC.position.set(-(A.HX + 26), 0, A.HZ + 9); casters.push(oakC, oakT); statics.push(oakT, oakC);
  const [smT, smC] = treeMesh('sm', 0.9, 7);
  const rr = root.RLTex.N1;
  for (let k = 0; k < 46; k++) { const a = k / 46 * Math.PI * 2 + rr.v(k * 2.1, 0.3, 4096, 4096); const d = Math.max(105, A.HZ + 30) + rr.v(k * 1.3, 7.7, 4096, 4096) * 120; const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (Math.hypot(x - A.HX - 20, z - A.HZ - 35) < 26 || Math.hypot(x - 6, z - A.HZ - 31) < 10 || (Math.abs(x) < A.HX + 14 && Math.abs(z) < A.HZ + 23)) continue; const sc = 0.7 + rr.v(k, 3.1, 4096, 4096) * 0.8;
    for (const m of [smT, smC]) { const inst = m.createInstance('tr' + k); inst.position.set(x, 0, z); inst.scaling.setAll(sc); inst.rotation.y = k; } }
  smT.position.set(-70, 0, -40); smC.position.set(-70, 0, -40);

  // hay bales
  const bales = []; for (const [x, z, ry, y] of [[A.HX + 4, A.HZ + 17, 0.3, 0.75], [A.HX + 7, A.HZ + 16, 0.2, 0.75], [A.HX + 5.5, A.HZ + 16.6, 0.25, 2.1], [-(A.HX + 12), A.HZ + 3, 1.2, 0.75], [-46, -(A.HZ + 18), 0.1, 0.75], [A.HX + 24, -40, 1.4, 0.75], [A.HX + 26, -38, 1.3, 0.75]]) { const b = BABYLON.MeshBuilder.CreateCylinder('bale', { height: 1.5, diameter: 1.5, tessellation: 18 }, scene); b.rotation.z = Math.PI / 2; b.rotation.y = ry; b.position.set(x, y, z); bales.push(b); }
  add(merge(bales, 'bales'), M.hay, true);
  // utility poles with sagging wires
  const up = [], wires = []; let prev = null;
  for (let k = -5; k <= 5; k++) { const x = k * 42, z = A.HZ + 88 + Math.sin(k) * 6; const pole = BABYLON.MeshBuilder.CreateCylinder('up', { height: 12, diameterTop: 0.28, diameterBottom: 0.4 }, scene); pole.position.set(x, 6, z); up.push(pole);
    const arm = BABYLON.MeshBuilder.CreateBox('arm', { width: 2.6, height: 0.18, depth: 0.18 }, scene); arm.position.set(x, 11.3, z); up.push(arm);
    if (prev) for (const o of [-1.1, 0, 1.1]) { const path = []; for (let i = 0; i <= 10; i++) { const t = i / 10; path.push(V3(prev[0] + (x - prev[0]) * t + o, 11.4 - Math.sin(t * Math.PI) * 1.4, prev[1] + (z - prev[1]) * t)); } wires.push(BABYLON.MeshBuilder.CreateTube('wire', { path, radius: 0.03, tessellation: 3 }, scene)); }
    prev = [x, z]; }
  add(merge(up, 'poles'), M.bark); add(merge(wires, 'wires'), M.black);

  for (const m of statics) { if (m.name !== 'fanM' && m.freezeWorldMatrix) m.freezeWorldMatrix(); }
  return { casters, pads, sky, fan, ground, walls, hills, statics, barnN, towerSpots, towerH: H, lampMeshes: [lampT] };
}
root.RLWorld = { build, arenaPaths };
})(typeof window !== 'undefined' ? window : globalThis);

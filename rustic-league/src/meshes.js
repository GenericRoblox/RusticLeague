// ===================== RUSTIC LEAGUE — MESH HELPERS =====================
(function (root) {
'use strict';
const B = () => root.BABYLON;
// Geometry accumulator. Babylon draws a triangle front-facing when cross(b-a, c-a) points AWAY from the viewer,
// so tri() flips winding to make the face look along the hinted outward normal.
class Geo {
  constructor() { this.p = []; this.i = []; this.u = []; this.c = null; }
  col(r, g, b) { if (!this.c) this.c = []; this.c.push(r, g, b, 1); }
  v(x, y, z, u = 0, w = 0) { this.p.push(x, y, z); this.u.push(u, w); return this.p.length / 3 - 1; }
  tri(a, b, c, nx, ny, nz) {
    const P = this.p; const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz > 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  quad(a, b, c, d, nx, ny, nz) { this.tri(a, b, c, nx, ny, nz); this.tri(a, c, d, nx, ny, nz); }
  mesh(name, scene, flat) {
    const BB = B(); const m = new BB.Mesh(name, scene); const vd = new BB.VertexData();
    vd.positions = this.p; vd.indices = this.i; vd.uvs = this.u; if (this.c && this.c.length === this.p.length / 3 * 4) vd.colors = this.c; const n = []; BB.VertexData.ComputeNormals(this.p, this.i, n); vd.normals = n; vd.applyToMesh(m);
    return m;
  }
}
// ear clipping for simple polygons [[x,y],...]
function triangulate(pts) {
  const n = pts.length; if (n < 3) return [];
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const idx = []; for (let i = 0; i < n; i++) idx.push(area > 0 ? i : n - 1 - i);
  const out = []; let guard = 0;
  const inside = (p, a, b, c) => { const s = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]); const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  while (idx.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-9) continue;
      let ok = true; for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (inside(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue; out.push(i0, i1, i2); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}
// extrude a side profile (z,y) along x. hw(y) gives half width. uvSide(z,y)->[u,v], uvRing(z,x,ny)->[u,v]
function extrudeX(profile, hw, uvSide, uvRing, g = new Geo()) {
  const tris = triangulate(profile);
  for (const s of [-1, 1]) {
    const base = profile.map(([z, y]) => { const [u, v] = uvSide(z, y); return g.v(s * hw(y), y, z, u, v); });
    for (let t = 0; t < tris.length; t += 3) g.tri(base[tris[t]], base[tris[t + 1]], base[tris[t + 2]], s, 0, 0);
  }
  // ring
  let area = 0; for (let i = 0; i < profile.length; i++) { const a = profile[i], b = profile[(i + 1) % profile.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length];
    const dz = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dz, dy) || 1; // outward normal in (z,y)
    const nz = sg * dy / l, ny = -sg * dz / l;
    const ua = uvRing(a[0], -hw(a[1]), ny, a[1]), ub = uvRing(b[0], -hw(b[1]), ny, b[1]), uc = uvRing(b[0], hw(b[1]), ny, b[1]), ud = uvRing(a[0], hw(a[1]), ny, a[1]);
    const v0 = g.v(-hw(a[1]), a[1], a[0], ...ua), v1 = g.v(-hw(b[1]), b[1], b[0], ...ub), v2 = g.v(hw(b[1]), b[1], b[0], ...uc), v3 = g.v(hw(a[1]), a[1], a[0], ...ud);
    g.quad(v0, v1, v2, v3, 0, ny, nz);
  }
  return g;
}
// lat-long sphere with equirect uv (u = atan2(x,z)/2pi+.5, v = acos(y)/pi)
function sphere(name, scene, r, nLat = 32, nLon = 64, inward = false) {
  const g = new Geo(); const rows = [];
  for (let i = 0; i <= nLat; i++) { const th = i / nLat * Math.PI; const row = [];
    for (let j = 0; j <= nLon; j++) { const u = j / nLon, a = (u - 0.5) * 2 * Math.PI; row.push(g.v(Math.sin(a) * Math.sin(th) * r, Math.cos(th) * r, Math.cos(a) * Math.sin(th) * r, u, i / nLat)); }
    rows.push(row); }
  const P = g.p; const s = inward ? -1 : 1;
  for (let i = 0; i < nLat; i++) for (let j = 0; j < nLon; j++) {
    const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
    const th = (i + 0.5) / nLat * Math.PI, ph = ((j + 0.5) / nLon - 0.5) * 2 * Math.PI;
    const n = [Math.sin(ph) * Math.sin(th) * s, Math.cos(th) * s, Math.cos(ph) * Math.sin(th) * s];
    if (i > 0) g.tri(a, b, c, ...n); if (i < nLat - 1) g.tri(a, c, d, ...n);
  }
  return g.mesh(name, scene);
}
// lathe around Y axis: prof [[r,y],...] ; v from cumulative profile length
function lathe(name, scene, prof, seg, outwardSign = 1) {
  const g = new Geo(); let L = [0]; for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const tot = L[L.length - 1] || 1; const ring = [];
  for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; const r = []; for (let i = 0; i < prof.length; i++) r.push(g.v(Math.cos(a) * prof[i][0], prof[i][1], Math.sin(a) * prof[i][0], j / seg, L[i] / tot)); ring.push(r); }
  for (let j = 0; j < seg; j++) for (let i = 0; i < prof.length - 1; i++) {
    const a = (j + 0.5) / seg * Math.PI * 2; const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1];
    const nr = dy * outwardSign, ny = -dr * outwardSign;
    g.quad(ring[j][i], ring[j + 1][i], ring[j + 1][i + 1], ring[j][i + 1], Math.cos(a) * nr, ny, Math.sin(a) * nr);
  }
  return g.mesh(name, scene);
}
// disc in XZ plane facing +y (or -y), planar uv
function disc(name, scene, r, seg, up = 1) {
  const g = new Geo(); const c = g.v(0, 0, 0, 0.5, 0.5); const ring = [];
  for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; ring.push(g.v(Math.cos(a) * r, 0, Math.sin(a) * r, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5)); }
  for (let j = 0; j < seg; j++) g.tri(c, ring[j], ring[j + 1], 0, up, 0);
  return g.mesh(name, scene);
}
// sweep a 2D profile [[w,y],...] along a path [{x,z,nx,nz,s}] (n = inward normal). freeSide: profile normal hint
function sweep(name, scene, path, prof, tileU, tileV, g = new Geo(), opts = {}) {
  const L = [0]; for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const grid = path.map(pt => prof.map((pr, k) => { const id = g.v(pt.x + pt.nx * pr[0], pr[1], pt.z + pt.nz * pr[0], pt.s / tileU, L[k] / tileV); if (opts.color) g.col(...opts.color(pt, pr)); else if (g.c) g.col(1, 1, 1); return id; }));
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < prof.length - 1; k++) {
    const dw = prof[k + 1][0] - prof[k][0], dy = prof[k + 1][1] - prof[k][1]; const pt = path[i];
    const nx = pt.nx * dy * (opts.flip ? -1 : 1), nz = pt.nz * dy * (opts.flip ? -1 : 1), ny = -dw * (opts.flip ? -1 : 1);
    g.quad(grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1], nx, ny, nz);
  }
  // a closed profile gets both ends capped (an open-ended bumper looked cut away from the side)
  const pf = prof[0], pl = prof[prof.length - 1], open = path.length > 1 && path[0] !== path[path.length - 1] && Math.hypot(path[0].x - path[path.length - 1].x, path[0].z - path[path.length - 1].z) > 1e-6;
  if (open && opts.cap !== false && Math.hypot(pf[0] - pl[0], pf[1] - pl[1]) < 1e-9) {
    const loop = prof.slice(0, -1), tris = triangulate(loop);
    for (const [pi, qi] of [[0, 1], [path.length - 1, path.length - 2]]) {
      const pt = path[pi], q = path[qi]; // the cap faces away from the neighbouring path point
      const ids = loop.map(pr => g.v(pt.x + pt.nx * pr[0], pr[1], pt.z + pt.nz * pr[0], 0, 0));
      for (let t = 0; t < tris.length; t += 3) g.tri(ids[tris[t]], ids[tris[t + 1]], ids[tris[t + 2]], pt.x - q.x, 0, pt.z - q.z);
    }
  }
  return g;
}
function merge(meshes, name) { const BB = B(); const m = BB.Mesh.MergeMeshes(meshes.filter(Boolean), true, true, undefined, false, false); if (m) m.name = name; return m; }

root.RLMesh = { Geo, triangulate, extrudeX, sphere, lathe, disc, sweep, merge };
})(typeof window !== 'undefined' ? window : globalThis);

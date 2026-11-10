// ===================== RUSTIC LEAGUE — PROCEDURAL TEXTURES =====================
// Every texture in the game is painted here at load time: noise -> height/masks -> albedo, normal, ORM.
(function (root) {
'use strict';
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
class Noise {
  constructor(seed) {
    const r = mulberry(seed); const p = new Int32Array(512); for (let i = 0; i < 512; i++) p[i] = i;
    for (let i = 511; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Int32Array(1024); for (let i = 0; i < 1024; i++) this.perm[i] = p[i & 511];
    this.val = new Float32Array(512); for (let i = 0; i < 512; i++) this.val[i] = r();
    this.jx = new Float32Array(512); this.jy = new Float32Array(512); for (let i = 0; i < 512; i++) { this.jx[i] = r(); this.jy[i] = r(); }
  }
  h(x, y) { return this.perm[(this.perm[x & 511] + y) & 511]; }
  v(x, y, px, py) {
    let xi = Math.floor(x), yi = Math.floor(y); const fx = x - xi, fy = y - yi;
    xi %= px; if (xi < 0) xi += px; yi %= py; if (yi < 0) yi += py;
    const x1 = xi + 1 === px ? 0 : xi + 1, y1 = yi + 1 === py ? 0 : yi + 1;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy), V = this.val;
    const a = V[this.h(xi, yi)], b = V[this.h(x1, yi)], c = V[this.h(xi, y1)], d = V[this.h(x1, y1)];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  fbm(x, y, oct, px, py, gain = 0.5) {
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.v(x, y, px, py); n += a; x *= 2; y *= 2; px *= 2; py *= 2; a *= gain; }
    return s / n;
  }
  ridge(x, y, oct, px, py) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(this.v(x, y, px, py) * 2 - 1)); n += a; x *= 2; y *= 2; px *= 2; py *= 2; a *= 0.5; } return s / n; }
  // periodic worley: returns f1, f2 (distances in cell units) and id of nearest
  worley(x, y, px, py, out) {
    const xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      let cx = xi + i, cy = yi + j; let wx = cx % px; if (wx < 0) wx += px; let wy = cy % py; if (wy < 0) wy += py;
      const hh = this.h(wx, wy); const dx = cx + this.jx[hh] - x, dy = cy + this.jy[hh] - y; const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hh; } else if (d < f2) f2 = d;
    }
    out.f1 = f1; out.f2 = f2; out.id = id; return out;
  }
}
const N1 = new Noise(1337), N2 = new Noise(7331), N3 = new Noise(4242), N4 = new Noise(99);
const W = { f1: 0, f2: 0, id: 0 };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (c1, c2, t, o) => { o[0] = mix(c1[0], c2[0], t); o[1] = mix(c1[1], c2[1], t); o[2] = mix(c1[2], c2[2], t); return o; };
const hexc = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// --- packing helpers ---
function newTex(w, h) { return { w, h, albedo: new Uint8Array(w * h * 4), normal: null, orm: new Uint8Array(w * h * 4), height: new Float32Array(w * h) }; }
function put(arr, i, r, g, b, a = 1) { arr[i * 4] = sat(r) * 255; arr[i * 4 + 1] = sat(g) * 255; arr[i * 4 + 2] = sat(b) * 255; arr[i * 4 + 3] = sat(a) * 255; }
function normalFromHeight(h, w, hh, strength, wrap = true) {
  const out = new Uint8Array(w * hh * 4);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const xl = wrap ? (x - 1 + w) % w : Math.max(x - 1, 0), xr = wrap ? (x + 1) % w : Math.min(x + 1, w - 1);
    const yu = wrap ? (y - 1 + hh) % hh : Math.max(y - 1, 0), yd = wrap ? (y + 1) % hh : Math.min(y + 1, hh - 1);
    const dx = (h[y * w + xr] - h[y * w + xl]) * strength, dy = (h[yd * w + x] - h[yu * w + x]) * strength;
    const l = Math.sqrt(dx * dx + dy * dy + 1); const i = (y * w + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
function finish(t, strength, wrap = true) { t.normal = normalFromHeight(t.height, t.w, t.h, strength, wrap); delete t.height; return t; }
// run a per-row generator in chunks so the loading screen stays alive
let yq = null; // yield to the browser without timers (not throttled in background tabs); created lazily, main thread only
const yieldNow = () => { if (!yq) { if (typeof MessageChannel === 'undefined') return new Promise(r => setTimeout(r, 0)); const ch = new MessageChannel(), q = []; ch.port1.onmessage = () => { const r = q.shift(); r && r(); }; yq = r => { q.push(r); ch.port2.postMessage(0); }; } return new Promise(r => yq(r)); };
async function rows(h, fn, chunk = 48) { const inWorker = typeof document === 'undefined'; for (let y = 0; y < h; y++) { fn(y); if (!inWorker && y % chunk === chunk - 1) await yieldNow(); } }

// =============== GRASS DETAIL (Babylon detail map: R albedo, G normalY, B rough, A normalX) ===============
async function grassDetail(S) {
  const w = S, h = S, out = new Uint8Array(w * h * 4), ht = new Float32Array(w * h), col = new Float32Array(w * h);
  await rows(h, y => { for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const n1 = N1.fbm(u * 16, v * 16, 4, 16, 16), n2 = N2.v(u * 128, v * 128, 128, 128), n3 = N3.v(u * 256, v * 256, 256, 256);
    N4.worley(u * 24, v * 24, 24, 24, W); const clump = 1 - ss(0, 0.75, W.f1);
    const blade = Math.pow(n3, 2.2) * 0.6 + n2 * 0.4;
    ht[y * w + x] = clump * 0.35 + blade * 0.5 + n1 * 0.15;
    col[y * w + x] = 0.5 + (blade - 0.4) * 0.55 + (clump - 0.5) * 0.25 + (n1 - 0.5) * 0.3;
  } });
  const nm = normalFromHeight(ht, w, h, 4.5);
  for (let i = 0; i < w * h; i++) { out[i * 4] = sat(col[i]) * 255; out[i * 4 + 1] = nm[i * 4 + 1]; out[i * 4 + 2] = sat(0.5 + (0.5 - col[i]) * 0.4) * 255; out[i * 4 + 3] = nm[i * 4]; }
  return { w, h, data: out };
}

// grime/pitting detail map for steel (R albedo, G normalY, B rough, A normalX)
async function grimeDetail(S) {
  const out = new Uint8Array(S * S * 4), ht = new Float32Array(S * S), col = new Float32Array(S * S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const a = N2.fbm(u * 6 + 7, v * 6, 5, 6, 6), b = N3.v(u * 96, v * 96, 96, 96); N1.worley(u * 30, v * 30, 30, 30, W);
    const pit = 1 - ss(0, 0.3, W.f1), run = ss(0.6, 0.85, N4.fbm(u * 40, v * 3, 3, 40, 3));
    ht[i] = a * 0.4 + b * 0.25 - pit * 0.35; col[i] = 0.5 + (a - 0.5) * 0.5 - pit * 0.18 - run * 0.14 + (b - 0.5) * 0.12;
  } });
  const nm = normalFromHeight(ht, S, S, 3);
  for (let i = 0; i < S * S; i++) { out[i * 4] = sat(col[i]) * 255; out[i * 4 + 1] = nm[i * 4 + 1]; out[i * 4 + 2] = sat(0.5 + (0.5 - col[i]) * 0.5) * 255; out[i * 4 + 3] = nm[i * 4]; }
  return { w: S, h: S, data: out };
}

// =============== FIELD MACRO ALBEDO (whole pitch, includes chalk lines & wear) ===============
async function fieldMacro(Wd, Hd, A, pads, wallDist) {
  const X1 = A.HX + 4, X0 = -X1, Z1 = A.HZ + 12, Z0 = -Z1; const out = new Uint8Array(Wd * Hd * 4); const c = [0, 0, 0];
  const lush = [0.20, 0.30, 0.09], dry = [0.42, 0.40, 0.16], dirt = [0.33, 0.24, 0.14], mud = [0.22, 0.16, 0.10], chalk = [0.86, 0.85, 0.78];
  const line = (d, wdt) => 1 - ss(wdt * 0.5, wdt * 0.5 + 0.06, Math.abs(d));
  await rows(Hd, j => { for (let i = 0; i < Wd; i++) {
    const x = mix(X0, X1, (i + 0.5) / Wd), z = mix(Z0, Z1, (j + 0.5) / Hd);
    const m = N1.fbm(x / 22 + 50, z / 22 + 50, 5, 4096, 4096), m2 = N2.fbm(x / 6, z / 6, 4, 4096, 4096), fine = N3.v(x * 3, z * 3, 4096, 4096);
    mix3(lush, dry, ss(0.38, 0.72, m * 0.75 + m2 * 0.35), c);
    const stripe = ((Math.floor((z + Z1) / 6.5) & 1) ? 1.06 : 0.94); c[0] *= stripe; c[1] *= stripe; c[2] *= stripe;
    // wear: goal mouths, centre, around pads, near walls
    let wear = 0;
    for (const sz of [-1, 1]) { const dz = (z - sz * (A.HZ - 4)) / 7, dx = x / 8; wear = Math.max(wear, Math.exp(-(dx * dx + dz * dz))); }
    wear = Math.max(wear, Math.exp(-(x * x + z * z) / 30) * 0.8);
    for (const p of pads) { const r = Math.hypot(x - p.x, z - p.z); wear = Math.max(wear, Math.exp(-Math.pow((r - 3.6) / 1.2, 2)) * 0.75); }
    wear *= ss(0.25, 0.6, m2 + fine * 0.3);
    const wd = wallDist(x, z); wear = Math.max(wear, ss(3, 0.5, wd) * 0.8);
    mix3(c, dirt, wear * 0.85, c);
    const mudp = ss(0.72, 0.8, N4.fbm(x / 9, z / 9, 4, 4096, 4096)) * 0.7; mix3(c, mud, mudp * wear, c);
    // chalk lines
    let L = 0;
    L = Math.max(L, line(z, 0.16));
    const r = Math.hypot(x, z); L = Math.max(L, line(r - 9.2, 0.16)); L = Math.max(L, (r < 0.35) ? 1 : 0);
    for (const sz of [-1, 1]) {
      const zz = z * sz; // distance from goal line inward
      if (Math.abs(x) < 16.5) L = Math.max(L, line(zz - (A.HZ - 14), 0.16)); if (zz > A.HZ - 14 && zz < A.HZ) L = Math.max(L, line(Math.abs(x) - 16.5, 0.16));
      if (Math.abs(x) < 9.5) L = Math.max(L, line(zz - (A.HZ - 5.5), 0.16)); if (zz > A.HZ - 5.5 && zz < A.HZ) L = Math.max(L, line(Math.abs(x) - 9.5, 0.16));
      if (Math.abs(x) < A.GW) L = Math.max(L, line(zz - A.HZ, 0.16));
      L = Math.max(L, Math.hypot(x, zz - (A.HZ - 10)) < 0.25 ? 1 : 0);
    }
    L *= ss(0.22, 0.5, N2.v(x * 1.2, z * 1.2, 4096, 4096) * 0.7 + fine * 0.5) * (1 - wear * 0.6);
    mix3(c, chalk, L * 0.85, c);
    const ao = mix(0.62, 1, ss(0.2, 3, wd));
    const v = 0.9 + fine * 0.2;
    put(out, j * Wd + i, c[0] * v * ao, c[1] * v * ao, c[2] * v * ao, 1);
  } });
  return { w: Wd, h: Hd, data: out };
}

// =============== RUSTED, PAINTED STEEL WALL PANELS ===============
async function rustWall(S) {
  const t = newTex(S, S); const c = [0, 0, 0];
  const rustD = [0.15, 0.08, 0.05], rustO = [0.46, 0.22, 0.09], rustB = [0.30, 0.18, 0.11];
  const blue = [0.20, 0.31, 0.43], blueF = [0.38, 0.45, 0.51], white = [0.64, 0.62, 0.56], bare = [0.50, 0.48, 0.46];
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; const i = y * S + x;
    const su = (u * 4) % 1, sv = (v * 4) % 1; // 12 m tile, 3 m panels
    const seamD = Math.min(Math.min(su, 1 - su) * 3, Math.min(sv, 1 - sv) * 3);
    const seam = 1 - ss(0.0, 0.035, seamD);
    const rivRow = Math.abs(seamD - 0.08) < 0.03; const rpu = ((u * 12 / 0.15) % 1), rpv = ((v * 12 / 0.15) % 1);
    const along = Math.min(su, 1 - su) < Math.min(sv, 1 - sv) ? rpv : rpu;
    const rivet = rivRow ? 1 - ss(0.12, 0.32, Math.abs(along - 0.5) * 2) : 0;
    const big = N1.fbm(u * 6, v * 6, 6, 6, 6), med = N2.fbm(u * 24, v * 24, 4, 24, 24), hi = N3.v(u * 384, v * 384, 384, 384);
    N4.worley(u * 96, v * 96, 96, 96, W); const pit = 1 - ss(0.0, 0.35, W.f1);
    const streak = N1.fbm(u * 96, v * 4, 3, 96, 4);
    mix3(rustD, rustB, ss(0.3, 0.7, med + hi * 0.2), c); mix3(c, rustO, ss(0.62, 0.9, med * 0.7 + hi * 0.5) * 0.7, c);
    let h = med * 0.35 + hi * 0.15 - pit * 0.25;
    let rough = 0.9, metal = 0.1, ao = 1;
    const pm = big * 0.85 + med * 0.25 + hi * 0.07 - streak * 0.12 + ss(0.15, 0.0, seamD) * -0.12 - 0.02;
    const paint = ss(0.47, 0.5, pm), edge = ss(0.44, 0.47, pm) - paint;
    if (paint > 0) {
      const pc = mix3(blue, blueF, ss(0.25, 0.85, N3.fbm(u * 10, v * 10, 4, 10, 10) + hi * 0.1), [0, 0, 0]);
      mix3(pc, white, ss(0.7, 0.73, N4.fbm(u * 4 + 3, v * 4 + 1, 5, 4, 4)) * 0.85, pc);
      mix3(pc, [0.32, 0.2, 0.13], ss(0.5, 0.9, streak) * 0.45, pc);
      const chips = (W.f2 - W.f1 < 0.04 && hi > 0.7) ? 1 : 0;
      mix3(c, pc, paint * (1 - chips), c);
      h += paint * 0.3; rough = mix(rough, 0.62, paint); metal = mix(metal, 0, paint);
    }
    // bare scraped steel at paint edges
    if (edge > 0.05) { mix3(c, bare, edge * 0.8, c); rough = mix(rough, 0.35, edge); metal = mix(metal, 0.8, edge); }
    // rust streak stains running down
    const st = ss(0.55, 0.85, streak) * (0.4 + 0.6 * paint);
    mix3(c, [0.26, 0.13, 0.07], st * 0.5, c);
    // seams & rivets
    if (seam > 0) { mix3(c, [0.08, 0.05, 0.04], seam * 0.85, c); h -= seam * 0.6; ao = 1 - seam * 0.6; }
    if (rivet > 0) { h += rivet * 0.5; mix3(c, rustD, rivet * 0.6, c); }
    const g = 0.9 + hi * 0.2; c[0] *= g; c[1] *= g; c[2] *= g;
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, ao, rough, metal); t.height[i] = h;
  } });
  return finish(t, 5.5);
}

// =============== RUSTED PIPE / STEELWORK ===============
async function pipeRust(S) {
  const t = newTex(S, S); const c = [0, 0, 0];
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x;
    const a = N1.fbm(u * 6, v * 6, 5, 6, 6), b = N2.v(u * 64, v * 64, 64, 64);
    N3.worley(u * 24, v * 24, 24, 24, W);
    mix3([0.20, 0.10, 0.05], [0.55, 0.27, 0.10], ss(0.3, 0.75, a + b * 0.2), c);
    const paint = ss(0.6, 0.63, N4.fbm(u * 3, v * 3, 4, 3, 3));
    mix3(c, [0.30, 0.33, 0.30], paint, c);
    const pit = 1 - ss(0, 0.3, W.f1);
    put(t.albedo, i, c[0] * (1 - pit * 0.4), c[1] * (1 - pit * 0.4), c[2] * (1 - pit * 0.4));
    put(t.orm, i, 1, mix(0.85, 0.5, paint), mix(0.25, 0.6, paint));
    t.height[i] = a * 0.5 + b * 0.2 - pit * 0.3 + paint * 0.2;
  } });
  return finish(t, 4);
}

// =============== CAR BODY ATLAS ===============
// u: z along car (-2.75..2.75). v<0.5: sides (y 0..1.45). v>=0.5: top (x -1..1).
const CARMAPS = {
  coupe: { z0: -2.75, len: 5.5, ymax: 1.45, arches: [-1.49, 1.46], ar: 0.49, ay: 0.40, doors: [0.6, -0.98], doorY: [0.33, 0.96], sill: 0.34, stripe: [0.858, 0.872], stripeZ: [-2.45, 2.5], rocker: 0.5,
    bondo: [1.75, 2.5, 0.5, 0.88, 2.12, 0.7], primer: [-2.35, -1.6, 0.55, 0.9], bare: [-1.0, 0.4, 0.3, 0.6], streak: [-1.45, 0.6, 0.42, 0.95], cowl: 0.62, trunk: -1.42, nose: 2.7, topSeamX: 0.9, peel: 0.6, under: 0.35, rustZones: [],
    drips: [[-0.44, 0.81, 0.24], [-0.35, 0.81, 0.15], [0.46, 0.95, 0.3], [1.95, 0.6, 0.18], [-1.95, 0.78, 0.22], [2.35, 0.7, 0.2], [-2.3, 0.7, 0.25], [0.6, 0.62, 0.2], [-0.98, 0.7, 0.3]] },
  van: { z0: -2.55, len: 5.1, ymax: 2.1, arches: [-1.17, 1.62], ar: 0.50, ay: 0.41, doors: [1.25, 0.4, 0.25, -0.95], doorY: [0.55, 1.95], sill: 0.56, stripe: [1.12, 1.16], stripeZ: [-2.4, 2.3], rocker: 0.72,
    bondo: [1.85, 2.3, 0.62, 0.95, 2.05, 0.78], primer: [-2.2, -1.4, 0.7, 1.2], bare: [-0.6, 0.15, 0.55, 0.8], streak: [-0.3, 1.2, 0.8, 1.9], cowl: 1.86, trunk: -9, nose: 2.45, topSeamX: 0.85, peel: 0.47, under: 0.82, rustZones: [],
    drips: [[1.3, 1.45, 0.4], [0.55, 1.2, 0.3], [-0.6, 1.2, 0.3], [-1.78, 1.4, 0.5], [2.2, 0.85, 0.25], [-2.3, 0.85, 0.3]] },
  buggy: { z0: -2.05, len: 4.1, ymax: 1.6, arches: [-1.18, 1.22], ar: 0.6, ay: 0.32, doors: [0.75, -0.06], doorY: [0.45, 1.02], sill: 0.45, stripe: null, stripeZ: [0, 0], rocker: 0.62,
    bondo: [-1.7, -1.3, 0.5, 0.75, -1.5, 0.62], primer: [-0.6, -0.1, 0.55, 0.85], bare: [0.1, 0.6, 0.45, 0.6], streak: [-0.7, 0.7, 0.6, 1.02], cowl: 0.92, trunk: -1.28, nose: 1.95, topSeamX: 0.6, peel: 0.58, under: 0.45, rustZones: [[0.95, 1.95, 0.38, 0.86]],
    drips: [[-0.02, 0.97, 0.2], [0.58, 1.07, 0.25], [1.78, 0.72, 0.2], [-1.88, 0.66, 0.2]] },
};
const CARMAP = CARMAPS.coupe;
let carMaskCache = null;
// rasterise thin line segments (scratches, drips) into a mask
function stampLine(mask, S, x0, y0, x1, y1, w, val) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L * 1.5));
  for (let k = 0; k <= n; k++) { const t = k / n, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, ww = w * (0.6 + 0.4 * Math.sin(t * Math.PI));
    for (let yy = Math.floor(cy - ww - 1); yy <= cy + ww + 1; yy++) for (let xx = Math.floor(cx - ww - 1); xx <= cx + ww + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const d = Math.hypot(xx - cx, yy - cy); const a = sat(1 - (d - ww * 0.5) / (ww * 0.5 + 0.7)) * val;
      if (a > mask[yy * S + xx]) mask[yy * S + xx] = a; } }
}
const carMaskCaches = {};
async function carMasks(S, type = 'coupe') {
  const L = CARMAPS[type] || CARMAPS.coupe, CARMAP = L; const key = type + S; if (carMaskCaches[key]) return carMaskCaches[key];
  const n = S * S; const F = () => new Float32Array(n);
  const M = { S, rust: F(), bondo: F(), bare: F(), primer: F(), fade: F(), peel: F(), peelEdge: F(), groove: F(), dirt: F(), mud: F(), h: F(), hi: F(), craze: F(), scratch: F(), streak: F(), stripe: F(), drip: F(), gloss: F() };
  const arches = L.arches;
  const zOf = u => CARMAP.z0 + u * CARMAP.len;
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const z = zOf(u);
    const big = N1.fbm(u * 6, v * 6, 5, 4096, 4096), med = N2.fbm(u * 24, v * 24, 4, 4096, 4096), hi = N3.v(u * 300, v * 300, 4096, 4096), micro = N4.v(u * 900, v * 900, 4096, 4096);
    N4.worley(u * 70, v * 70, 4096, 4096, W); const bub = (W.f1 < 0.2 && N1.v(W.id * 0.37, 3.3, 4096, 4096) > 0.7) ? 1 - W.f1 / 0.2 : 0;
    M.hi[i] = hi;
    let rust = 0, bondo = 0, bare = 0, primer = 0, fade = 0, peel = 0, groove = 0, dirt = 0, mud = 0, craze = 0, streak = 0, stripe = 0, gloss = 0;
    let h = med * 0.1 + hi * 0.04 + micro * 0.03; // micro = orange-peel in the paint
    if (v < 0.5) { // ---- sides ----
      const yy = v / 0.5 * CARMAP.ymax;
      rust = ss(0.5, 0.39, yy + (big - 0.5) * 0.3 + (med - 0.5) * 0.14);
      rust = ss(L.rocker, L.rocker - 0.11, yy + (big - 0.5) * 0.3 + (med - 0.5) * 0.14);
      for (const zc of arches) { const d = Math.hypot(z - zc, yy - L.ay); rust = Math.max(rust, ss(0.18, 0.0, Math.abs(d - L.ar) - (med - 0.5) * 0.16) * ss(0.25, 0.6, big + 0.2)); }
      for (const [z0r, z1r, y0r, y1r] of L.rustZones) if (z > z0r && z < z1r && yy > y0r && yy < y1r) rust = Math.max(rust, ss(0.38, 0.55, big + med * 0.4 - Math.abs(yy - (y0r + y1r) / 2) * 0.6));
      rust = Math.max(rust, bub * 0.95);
      const B = L.bondo; if (z > B[0] && z < B[1] && yy > B[2] && yy < B[3]) bondo = ss(0.55, 0.6, N2.fbm(u * 9 + 1, v * 9, 4, 4096, 4096) * 0.6 + ss(0.45, 0, Math.hypot((z - B[4]) / ((B[1] - B[0]) * 0.42), (yy - B[5]) / ((B[3] - B[2]) * 0.34))) * 0.55);
      const Pz = L.primer; if (z > Pz[0] && z < Pz[1] && yy > Pz[2] && yy < Pz[3]) primer = ss(0.5, 0.55, N3.fbm(u * 8, v * 8 + 2, 4, 4096, 4096) + 0.1);
      const Bz = L.bare; if (z > Bz[0] && z < Bz[1] && yy > Bz[2] && yy < Bz[3]) bare = ss(0.46, 0.5, N4.fbm(u * 10, v * 10, 4, 4096, 4096) + 0.18 - Math.abs(yy - (Bz[2] + Bz[3]) / 2) * 0.9);
      fade = ss(L.ymax * 0.38, L.ymax * 0.69, yy) * 0.65 + big * 0.25;
      const pm = N1.fbm(u * 12 + 7, v * 12, 5, 4096, 4096) + hi * 0.04; const pk = ss(L.ymax * 0.43, L.ymax * 0.6, yy) * (L.peel < 0.55 ? 0.6 : 0) + ss(0.62, 0.88, yy); peel = ss(L.peel, L.peel + 0.02, pm) * Math.min(1, pk); M.peelEdge[i] = (ss(L.peel - 0.03, L.peel, pm) - ss(L.peel, L.peel + 0.02, pm)) * Math.min(1, pk);
      for (const gz of L.doors) groove = Math.max(groove, (yy > L.doorY[0] && yy < L.doorY[1]) ? 1 - ss(0.003, 0.009, Math.abs(z - gz)) : 0);
      groove = Math.max(groove, (z > Math.min(...L.doors) && z < Math.max(...L.doors)) ? 1 - ss(0.003, 0.009, Math.abs(yy - L.sill)) : 0);
      dirt = ss(L.rocker + 0.22, L.rocker - 0.2, yy) * (0.35 + big * 0.65);
      for (const zc of arches) { // mud thrown back off each tyre
        const dz = zc - z, inZ = ss(0.35, 0.55, dz) * ss(1.5, 0.9, dz), inY = ss(L.ay + 0.45, L.ay + 0.05, yy); mud = Math.max(mud, inZ * inY * ss(0.62, 0.78, hi * 0.6 + N2.v(u * 140, v * 90, 4096, 4096) * 0.6));
        dirt = Math.max(dirt, inZ * inY * 0.55); }
      // water streaks running down from the window line
      const St = L.streak; if (z > St[0] && z < St[1] && yy > St[2] && yy < St[3]) streak = ss(0.62, 0.82, N3.fbm(u * 220, v * 7, 3, 4096, 4096)) * ss(St[2], St[2] + 0.2, yy) * ss(St[3] + 0.03, St[3] - 0.05, yy);
      // faded double pinstripe along the beltline
      const ps = L.stripe ? Math.min(Math.abs(yy - L.stripe[1]), Math.abs(yy - L.stripe[0])) : 9; if (z > L.stripeZ[0] && z < L.stripeZ[1]) stripe = (1 - ss(0.0015, 0.0035, ps)) * ss(0.25, 0.45, N4.v(u * 60, 3.3, 4096, 4096) + big * 0.4);
      gloss = ss(0.5, 0.75, yy) * (1 - fade);
    } else { // ---- top: hood, roof (under vinyl), trunk ----
      const xx = (v - 0.5) / 0.5 * 2 - 1;
      fade = 0.6 + big * 0.4;
      const pm = N1.fbm(u * 7 + 3, v * 7, 5, 4096, 4096) + hi * 0.05; const tp = L.peel < 0.55 ? L.peel + 0.02 : 0.6; peel = ss(tp, tp + 0.02, pm); M.peelEdge[i] = ss(tp - 0.02, tp, pm) - ss(tp, tp + 0.02, pm);
      rust = Math.max(bub * 0.85, ss(0.12, 0.0, Math.abs(z - L.cowl) - med * 0.08) * ss(0.4, 0.7, big + 0.2));
      rust = Math.max(rust, ss(0.18, 0.0, L.nose - z - med * 0.1) * ss(0.45, 0.7, med + 0.15));
      rust = Math.max(rust, ss(0.66, 0.7, N2.fbm(u * 14, v * 14 + 9, 4, 4096, 4096)) * 0.9);
      // sun crazing: a fine network of cracks across the flat panels
      N3.worley(u * 160, v * 95, 4096, 4096, W); craze = (1 - ss(0.0, 0.07, W.f2 - W.f1)) * ss(0.45, 0.75, big + 0.25) * (Math.abs(xx) < 0.85 ? 1 : 0);
      for (const gz of [L.cowl, L.trunk]) groove = Math.max(groove, 1 - ss(0.003, 0.009, Math.abs(z - gz)));
      if (z > L.cowl || z < L.trunk) groove = Math.max(groove, 1 - ss(0.003, 0.009, Math.abs(Math.abs(xx) - L.topSeamX)));
      dirt = big * 0.22 + ss(L.cowl - 0.12, L.cowl, z) * ss(L.cowl + 0.18, L.cowl, z) * 0.35; // dust and leaf muck in the cowl
    }
    M.rust[i] = sat(rust); M.bondo[i] = bondo; M.bare[i] = bare; M.primer[i] = primer; M.fade[i] = sat(fade); M.peel[i] = peel; M.groove[i] = groove; M.dirt[i] = sat(dirt); M.mud[i] = mud; M.craze[i] = craze; M.streak[i] = streak; M.stripe[i] = stripe; M.gloss[i] = gloss;
    M.h[i] = h + rust * (med * 0.6 + hi * 0.3) + bub * 0.35 - groove * 0.5 + bondo * 0.06 - bare * 0.05 + peel * 0.06 - craze * 0.25 + mud * 0.15;
  } });
  // scratches through the paint (keys, branches, other cars), and rust running from the trim
  const r = mulberry(11); const px = (z, yy) => [(z - L.z0) / L.len * S, yy / L.ymax * 0.5 * S];
  for (let k = 0; k < 90; k++) { const z = L.z0 + 0.2 + r() * (L.len - 0.4), yy = L.sill + 0.05 + r() * (L.ymax * 0.6), Ls = 0.04 + Math.pow(r(), 2) * 0.6, a = (r() - 0.5) * 0.5 + (r() < 0.1 ? 1.2 : 0);
    const [x0, y0] = px(z, yy), [x1, y1] = px(z + Math.cos(a) * Ls, yy + Math.sin(a) * Ls * 0.4); stampLine(M.scratch, S, x0, y0, x1, y1, 0.7 + r() * 1.3, 0.5 + r() * 0.5); }
  for (let k = 0; k < 30; k++) { const z = L.z0 + 0.3 + r() * (L.len - 0.6), xx = -0.85 + r() * 1.7, Ls = 0.05 + r() * 0.4, a = r() * 6.28; if (z > L.trunk && z < L.cowl && L !== CARMAPS.van) continue;
    const x0 = (z - CARMAP.z0) / CARMAP.len * S, y0 = (0.5 + (xx + 1) / 4) * S; stampLine(M.scratch, S, x0, y0, x0 + Math.cos(a) * Ls / CARMAP.len * S, y0 + Math.sin(a) * Ls / 4 * S, 0.7, 0.6); }
  for (const [z, yy, Ld] of L.drips) {
    for (let k = 0; k < 3; k++) { const dz = (r() - 0.5) * 0.04; const [x0, y0] = px(z + dz, yy), [x1, y1] = px(z + dz + (r() - 0.5) * 0.02, yy - Ld * (0.5 + r() * 0.6)); stampLine(M.drip, S, x0, y0, x1, y1, 1.2 + r() * 2, 0.5 + r() * 0.4); } }
  for (let i = 0; i < n; i++) M.h[i] -= M.scratch[i] * 0.35;
  for (let k = 0; k < 18; k++) { const cx = r() * S, cy = r() * S * 0.5, rad = (0.015 + r() * 0.05) * S, dep = 0.3 + r() * 0.6;
    for (let y = Math.max(0, cy - rad | 0); y < Math.min(S, cy + rad); y++) for (let x = Math.max(0, cx - rad | 0); x < Math.min(S, cx + rad); x++) { const d = Math.hypot(x - cx, y - cy) / rad; if (d < 1) M.h[y * S + x] -= dep * (1 - d * d) * (1 - d * d); } }
  carMaskCaches[key] = M; M.L = L; return M;
}
async function carAtlas(S, paintHex, hulk = false, type = 'coupe') {
  const M = await carMasks(S, type); const t = { w: S, h: S, albedo: new Uint8Array(S * S * 4), orm: new Uint8Array(S * S * 4), normal: null };
  const base = hexc(paintHex); const chalk = [mix(base[0], 0.8, 0.42), mix(base[1], 0.76, 0.42), mix(base[2], 0.72, 0.42)];
  const uw = M.L.under; const under = M.L.under > 0.6 ? [0.86, 0.85, 0.82] : [mix(base[0], 0.62, uw), mix(base[1], 0.58, uw), mix(base[2], 0.55, uw)];
  const rustC = [0.45, 0.19, 0.07], rustD = [0.19, 0.085, 0.045], bondoC = [0.74, 0.72, 0.66], primerC = [0.47, 0.47, 0.45], bareC = [0.64, 0.63, 0.62], dirtC = [0.30, 0.25, 0.18], mudC = [0.24, 0.18, 0.12], stripeC = [0.86, 0.74, 0.46];
  const c = [0, 0, 0], tmp = [0, 0, 0];
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const i = y * S + x; const hi = M.hi[i];
    mix3(base, chalk, M.fade[i], c);
    let rough = 0.32 + M.fade[i] * 0.42 - M.gloss[i] * 0.12, metal = 0, ao = 1;
    if (M.stripe[i] > 0) mix3(c, stripeC, M.stripe[i] * 0.85, c);
    if (M.peel[i] > 0) { mix3(c, under, M.peel[i] * (uw > 0.6 ? 0.92 : 0.6), c); rough = mix(rough, 0.88, M.peel[i]); }
    if (M.peelEdge[i] > 0) { mix3(c, [0.9, 0.88, 0.84], M.peelEdge[i] * 0.45, c); }
    if (M.craze[i] > 0) { mix3(c, [c[0] * 0.55, c[1] * 0.5, c[2] * 0.48], M.craze[i] * 0.8, c); rough = mix(rough, 0.95, M.craze[i]); }
    let rust = M.rust[i]; if (hulk) rust = Math.max(rust, ss(0.25, 0.55, M.fade[i] * 0.6 + hi * 0.5));
    if (M.primer[i] > 0) { mix3(c, primerC, M.primer[i], c); rough = mix(rough, 0.9, M.primer[i]); }
    if (M.bondo[i] > 0) { const sw = 0.92 + 0.08 * Math.sin((x * 0.21 + y * 0.13) + hi * 6); mix3(c, [bondoC[0] * sw, bondoC[1] * sw, bondoC[2] * sw], M.bondo[i], c); rough = mix(rough, 0.92, M.bondo[i]); }
    if (M.bare[i] > 0) { mix3(c, bareC, M.bare[i], c); rough = mix(rough, 0.36, M.bare[i]); metal = mix(metal, 0.9, M.bare[i]); }
    const sc = M.scratch[i]; if (sc > 0) { // deep scratches show bare steel, shallow ones the primer
      mix3(c, hi > 0.5 ? bareC : primerC, sc * 0.85, c); rough = mix(rough, hi > 0.5 ? 0.3 : 0.85, sc); metal = mix(metal, hi > 0.5 ? 0.85 : 0, sc); }
    if (rust > 0) { mix3(c, mix3(rustD, rustC, ss(0.3, 0.8, hi), tmp), rust, c); rough = mix(rough, 0.95, rust); metal = mix(metal, 0.1, rust); }
    if (M.drip[i] > 0) { mix3(c, [0.5, 0.22, 0.08], M.drip[i] * 0.7, c); rough = mix(rough, 0.85, M.drip[i]); }
    if (M.streak[i] > 0) { mix3(c, [0.62, 0.6, 0.55], M.streak[i] * 0.3, c); rough = mix(rough, 0.8, M.streak[i] * 0.6); }
    mix3(c, dirtC, M.dirt[i] * 0.5, c); rough = mix(rough, 0.95, M.dirt[i] * 0.5);
    if (M.mud[i] > 0) { mix3(c, mudC, M.mud[i] * 0.9, c); rough = mix(rough, 0.97, M.mud[i]); }
    if (M.groove[i] > 0) { mix3(c, [0.035, 0.03, 0.028], M.groove[i] * 0.85, c); ao = 1 - M.groove[i] * 0.75; }
    const g = 0.95 + hi * 0.1;
    put(t.albedo, i, c[0] * g, c[1] * g, c[2] * g); put(t.orm, i, ao, rough, metal);
  } });
  if (!M.normal) M.normal = normalFromHeight(M.h, S, S, 3.4 * S / 1024, false);
  t.normal = M.normal;
  return t;
}

// =============== SMALL MATERIALS ===============
async function chrome(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; N1.worley(u * 30, v * 30, 30, 30, W);
    const pit = W.f1 < 0.22 && N2.v(W.id * 0.71, 1.7, 512, 512) > 0.55 ? 1 - W.f1 / 0.22 : 0;
    const scr = Math.pow(N3.v(u * 4, v * 160, 4, 160), 8) * 0.8; const m = N4.fbm(u * 5, v * 5, 4, 5, 5);
    const g = 0.58 + m * 0.08 - scr * 0.15;
    put(t.albedo, i, mix(g, 0.45, pit), mix(g, 0.22, pit), mix(g + 0.02, 0.1, pit));
    put(t.orm, i, 1, mix(0.12 + m * 0.12 + scr * 0.3, 0.8, pit), mix(1, 0.2, pit)); t.height[i] = -pit * 0.6 + m * 0.1;
  } });
  return finish(t, 2);
}
async function tire(Wd, Hd, blackwall) { // u around, v across profile (0 inner sidewall .. 1 outer sidewall)
  const t = newTex(Wd, Hd);
  await rows(Hd, y => { for (let x = 0; x < Wd; x++) {
    const u = x / Wd, v = y / Hd, i = y * Wd + x; const n = N1.fbm(u * 64, v * 8, 4, 64, 8), hi = N2.v(u * 256, v * 32, 256, 32);
    let c = 0.055 + n * 0.03, rough = 0.9, h = 0;
    if (v > 0.3 && v < 0.7) { const blk = (Math.floor(u * 72) + Math.floor((v - 0.3) * 10)) % 2; const gq = Math.min(((u * 72) % 1), 1 - ((u * 72) % 1)); h = gq < 0.12 ? -0.8 : 0.2 * blk; c *= gq < 0.12 ? 0.5 : 1; }
    let ww = 0; if (!blackwall && v > 0.76 && v < 0.9) ww = ss(0.76, 0.78, v) * ss(0.9, 0.88, v);
    const dirt = ss(0.3, 0.8, n + hi * 0.3) * 0.45;
    const r = mix(c, 0.80, ww), g = mix(c, 0.77, ww), b = mix(c, 0.68, ww);
    put(t.albedo, i, mix(r, 0.32, dirt * (ww * 0.8 + 0.2)), mix(g, 0.26, dirt * (ww * 0.8 + 0.2)), mix(b, 0.18, dirt * (ww * 0.8 + 0.2)));
    put(t.orm, i, 1, rough - ww * 0.15, 0); t.height[i] = h + hi * 0.05;
  } });
  return finish(t, 3);
}
async function wireWheel(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, i = y * S + x; const r = Math.hypot(u, v) * 2, a = Math.atan2(v, u);
    const n = N1.fbm(x / S * 8, y / S * 8, 4, 8, 8), hi = N2.v(x / S * 128, y / S * 128, 128, 128);
    let c = [0.05, 0.045, 0.04], rough = 0.8, metal = 0.2, h = -0.5;
    if (r > 0.86) { c = [0.62, 0.6, 0.56]; rough = 0.25; metal = 1; h = 0.4 - (r > 0.95 ? 0.4 : 0); }
    else if (r < 0.2) { c = [0.66, 0.64, 0.6]; rough = 0.2; metal = 1; h = 0.6 - r; if (r < 0.06) c = [0.3, 0.25, 0.2]; }
    else { // two crossing spoke sets
      const k = 40; let s = 0;
      for (const sg of [-1, 1]) { const tw = a * k / (2 * Math.PI) + sg * (r - 0.2) * 5.2; const d = Math.abs(tw - Math.round(tw)); s = Math.max(s, 1 - ss(0.06, 0.16, d)); }
      if (s > 0) { c = mix3([0.05, 0.045, 0.04], [0.62, 0.5, 0.28], s, [0, 0, 0]); rough = mix(0.8, 0.35, s); metal = mix(0.2, 1, s); h = -0.5 + s; }
    }
    const rust = ss(0.55, 0.8, n + hi * 0.3) * 0.7; c = mix3(c, [0.36, 0.17, 0.07], rust * (metal > 0.5 ? 0.6 : 0.2), [0, 0, 0]);
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, 1, mix(rough, 0.9, rust * 0.6), metal * (1 - rust * 0.6)); t.height[i] = h;
  } });
  return finish(t, 3, false);
}
async function steelWheel(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, i = y * S + x; const r = Math.hypot(u, v) * 2, a = Math.atan2(v, u);
    const n = N1.fbm(x / S * 8, y / S * 8, 4, 8, 8), hi = N2.v(x / S * 128, y / S * 128, 128, 128);
    let c = [0.13, 0.13, 0.12], rough = 0.6, metal = 0.6, h = 0;
    if (r > 0.82) { h = 0.4; c = [0.16, 0.15, 0.14]; }
    const vent = r > 0.55 && r < 0.72 && Math.abs(Math.sin(a * 4)) > 0.6; if (vent) { c = [0.02, 0.02, 0.02]; h = -0.8; }
    if (r < 0.42) { c = [0.62, 0.61, 0.58]; rough = 0.25; metal = 1; h = 0.5 - r; }
    const lug = r > 0.25 && r < 0.36 && Math.abs(Math.sin(a * 2.5)) > 0.97; if (lug) { c = [0.08, 0.07, 0.06]; h = 0.2; }
    const rust = ss(0.45, 0.75, n + hi * 0.3) * (r < 0.42 ? 0.3 : 0.9); c = mix3(c, [0.4, 0.18, 0.07], rust, [0, 0, 0]);
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, 1, mix(rough, 0.92, rust), metal * (1 - rust)); t.height[i] = h + hi * 0.05;
  } });
  return finish(t, 3, false);
}
async function vinyl(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const g = N1.v(u * 220, v * 220, 220, 220), m = N2.fbm(u * 5, v * 5, 4, 5, 5);
    N3.worley(u * 9, v * 9, 9, 9, W); const crack = 1 - ss(0.0, 0.04, W.f2 - W.f1);
    const peel = ss(0.66, 0.7, N4.fbm(u * 3, v * 3, 5, 3, 3));
    let c = [0.10 + m * 0.04, 0.07 + m * 0.02, 0.07 + m * 0.02];
    c = mix3(c, [0.3, 0.24, 0.2], crack * 0.6, [0, 0, 0]); c = mix3(c, [0.55, 0.5, 0.42], peel * 0.8, [0, 0, 0]);
    put(t.albedo, i, c[0] * (0.9 + g * 0.2), c[1] * (0.9 + g * 0.2), c[2] * (0.9 + g * 0.2)); put(t.orm, i, 1, mix(0.62, 0.95, Math.max(crack, peel)), 0);
    t.height[i] = g * 0.25 - crack * 0.6 - peel * 0.3;
  } });
  return finish(t, 3.5);
}
async function glass(S, cracked) {
  const t = newTex(S, S); const ix = 0.68, iy = 0.32;
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const d = N1.fbm(u * 4, v * 4, 5, 4, 4), streak = N2.fbm(u * 3, v * 30, 3, 3, 30);
    const dirt = ss(0.45, 0.8, d + (1 - v) * 0.25) * 0.8 + ss(0.6, 0.8, streak) * 0.3;
    let crack = 0;
    if (cracked) { const dx = u - ix, dy = v - iy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const rad = Math.abs(Math.sin(a * 7 + N3.v(r * 30, a * 3, 4096, 4096) * 1.8)); crack = (r < 0.45 && rad < 0.035 * (1 - r)) ? 1 : 0;
      if (r < 0.14 && Math.abs(Math.sin(r * 90 + N4.v(a * 4, 1, 4096, 4096) * 3)) < 0.12) crack = 1; if (r < 0.015) crack = 1; }
    put(t.albedo, i, mix(0.025, 0.32, dirt) + crack * 0.5, mix(0.03, 0.28, dirt) + crack * 0.5, mix(0.035, 0.22, dirt) + crack * 0.5);
    put(t.orm, i, 1, mix(0.04, 0.7, dirt) + crack * 0.3, 0); t.height[i] = crack * 0.6 + dirt * 0.05;
  } });
  return finish(t, 2, false);
}
async function woodPad(S) {
  const t = newTex(S, S); const plankW = 0.19, D = 5.6;
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const px = u * D, pz = v * D; const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const pi = Math.floor(px / plankW), pf = (px / plankW) % 1; const tone = N1.v(pi * 3.1, 0.5, 4096, 4096);
    const grain = N2.fbm(pf * 2 + pi * 7.3, pz * 0.35, 4, 4096, 4096), fine = N3.v(pf * 6 + pi * 13, pz * 9, 4096, 4096);
    N4.worley(px * 1.3, pz * 0.45, 4096, 4096, W); const knot = W.f1 < 0.12 ? 1 - W.f1 / 0.12 : 0;
    const ring = Math.sin((grain * 40 + knot * 25)) * 0.5 + 0.5;
    let c = mix3([0.30, 0.22, 0.15], [0.52, 0.46, 0.38], ss(0.2, 0.9, tone * 0.6 + grain * 0.5), [0, 0, 0]);
    c = mix3(c, [0.24, 0.18, 0.12], ring * 0.25 + knot * 0.5, c);
    const worn = ss(0.75, 0.2, r) * 0.35; c = mix3(c, [0.58, 0.55, 0.5], worn, c);
    const gap = 1 - ss(0.0, 0.06, Math.min(pf, 1 - pf));
    let h = grain * 0.3 + fine * 0.15 - gap * 0.8 - knot * 0.2, rough = 0.82, metal = 0, ao = 1 - gap * 0.6;
    c = mix3(c, [0.05, 0.04, 0.03], gap * 0.85, c);
    // iron straps across the planks + rim band
    for (const sv of [0.33, 0.67]) { const d = Math.abs(v - sv); if (d < 0.022) { c = mix3([0.18, 0.12, 0.09], [0.42, 0.2, 0.08], ss(0.4, 0.8, grain + fine * 0.4), [0, 0, 0]); h = 0.6; rough = 0.7; metal = 0.6; const bolt = ((px / plankW) % 1); if (Math.hypot(bolt - 0.5, (d / 0.022) * 0.5) < 0.18) { h = 1; c = [0.14, 0.11, 0.09]; } } }
    if (r > 0.9) { c = mix3([0.16, 0.12, 0.1], [0.45, 0.22, 0.09], ss(0.4, 0.8, grain), [0, 0, 0]); h = 0.5 + (r > 0.97 ? -0.5 : 0); rough = 0.7; metal = 0.5;
      const aa = Math.atan2(v - 0.5, u - 0.5) * 24 / Math.PI; if (Math.abs(aa - Math.round(aa)) < 0.12 && Math.abs(r - 0.935) < 0.02) { h = 1; c = [0.12, 0.1, 0.08]; } }
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, ao, rough, metal); t.height[i] = h;
  } });
  return finish(t, 4, false);
}
async function barnWood(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const bw = 8, bi = Math.floor(u * bw), bf = (u * bw) % 1;
    const grain = N1.fbm(bf * 1.5 + bi * 5, v * 12, 4, 4096, 12), tone = N2.v(bi * 2.3, 0.3, 4096, 4096), hi = N3.v(u * 200, v * 60, 200, 60);
    const paint = ss(0.42, 0.46, N4.fbm(u * 4, v * 4, 5, 4, 4) + grain * 0.2 - 0.05);
    let c = mix3([0.38, 0.34, 0.30], [0.5, 0.46, 0.4], tone, [0, 0, 0]); c = mix3(c, [0.25, 0.22, 0.2], grain * 0.5, c);
    c = mix3(c, mix3([0.48, 0.10, 0.07], [0.62, 0.22, 0.16], tone * 0.6 + hi * 0.2, [0, 0, 0]), paint, c);
    const gap = 1 - ss(0, 0.05, Math.min(bf, 1 - bf)); c = mix3(c, [0.04, 0.03, 0.03], gap, c);
    const nail = (Math.abs(bf - 0.5) < 0.05 && Math.abs(((v * 4) % 1) - 0.5) < 0.012) ? 1 : 0; if (nail) c = [0.25, 0.12, 0.06];
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, 1 - gap * 0.6, mix(0.9, 0.7, paint), 0); t.height[i] = grain * 0.4 + hi * 0.1 - gap + paint * 0.15;
  } });
  return finish(t, 3.5);
}
async function corrugated(S, rusty) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const wave = Math.sin(u * Math.PI * 2 * 16);
    const n = N1.fbm(u * 4, v * 4, 5, 4, 4), streak = N2.fbm(u * 40, v * 2, 3, 40, 2), hi = N3.v(u * 160, v * 160, 160, 160);
    let c = [0.52 + n * 0.08, 0.53 + n * 0.08, 0.52 + n * 0.08]; const ox = ss(0.55, 0.75, n + hi * 0.2); c = mix3(c, [0.75, 0.74, 0.7], ox * 0.5, c);
    const rust = rusty ? ss(0.35, 0.65, n * 0.7 + streak * 0.5) : ss(0.62, 0.8, streak) * 0.7;
    c = mix3(c, mix3([0.26, 0.12, 0.06], [0.55, 0.26, 0.09], hi, [0, 0, 0]), rust, c);
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, 1 - (wave < -0.7 ? 0.25 : 0), mix(0.45 + ox * 0.3, 0.9, rust), mix(0.85, 0.15, rust)); t.height[i] = wave * 0.6 + hi * 0.05;
  } });
  return finish(t, 7);
}
function chainLink(S) {
  const a = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; const d1 = Math.abs(((u + v) * 4) % 1 - 0.5), d2 = Math.abs(((u - v + 4) * 4) % 1 - 0.5);
    const wire = Math.max(1 - ss(0.03, 0.065, 0.5 - d1), 1 - ss(0.03, 0.065, 0.5 - d2)); const r = N1.v(u * 64, v * 64, 64, 64);
    const rust = ss(0.6, 0.8, N2.fbm(u * 4, v * 4, 3, 4, 4) + r * 0.2);
    const i = (y * S + x) * 4; a[i] = mix(150, 120, rust); a[i + 1] = mix(148, 62, rust); a[i + 2] = mix(140, 30, rust); a[i + 3] = wire > 0.5 ? 255 : 0;
  }
  return { w: S, h: S, data: a };
}
function netTex(S) {
  const a = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S * 4) % 1, v = (y / S * 4) % 1; const d = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)); const kd = Math.hypot(u - 0.5, v - 0.5);
    const n = N3.v(x / S * 32, y / S * 32, 32, 32), tw = Math.sin((u + v) * 40) * 0.08; const on = 1 - ss(0.07, 0.09, d), knot = 1 - ss(0.12, 0.15, kd);
    const al = Math.max(on, knot); const i = (y * S + x) * 4; const g = (0.78 + n * 0.25 + tw) * (knot > 0.5 ? 0.85 : 1);
    a[i] = Math.min(255, 245 * g); a[i + 1] = Math.min(255, 240 * g); a[i + 2] = Math.min(255, 222 * g); a[i + 3] = al * 255;
  }
  return { w: S, h: S, data: a };
}
// sun-faded moulded plastic with scuffs and grime
async function plastic(S, hex) {
  const t = newTex(S, S); const base = hexc(hex); const faded = [mix(base[0], 0.82, 0.4), mix(base[1], 0.8, 0.4), mix(base[2], 0.78, 0.4)];
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const m = N1.fbm(u * 4, v * 4, 5, 4, 4), hi = N2.v(u * 160, v * 160, 160, 160);
    const scr = Math.pow(N3.v(u * 3, v * 120, 3, 120), 10) + Math.pow(N4.v(u * 110, v * 3, 110, 3), 12); const scuff = ss(0.62, 0.8, N4.fbm(u * 6, v * 6, 4, 6, 6));
    const c = mix3(base, faded, ss(0.3, 0.8, m) * 0.8, [0, 0, 0]); mix3(c, [0.85, 0.83, 0.8], sat(scr * 1.5) * 0.45, c); mix3(c, [0.25, 0.2, 0.15], scuff * 0.55, c);
    const run = ss(0.45, 0.85, N1.fbm(u * 9, v * 1.5, 4, 9, 2)) * 0.35; mix3(c, [0.3, 0.24, 0.17], run, c); // dirt run-off streaks
    put(t.albedo, i, c[0] * (0.95 + hi * 0.1), c[1] * (0.95 + hi * 0.1), c[2] * (0.95 + hi * 0.1)); put(t.orm, i, 1, mix(0.42, 0.75, Math.max(scuff, sat(scr))), 0);
    t.height[i] = hi * 0.05 - scr * 0.4 + m * 0.1;
  } });
  return finish(t, 2);
}
// truncated-icosahedron leather ball, equirect layout
async function ball(Wd, Hd) {
  const t = { w: Wd, h: Hd, albedo: new Uint8Array(Wd * Hd * 4), orm: new Uint8Array(Wd * Hd * 4), normal: null }; const hgt = new Float32Array(Wd * Hd);
  const ph = (1 + Math.sqrt(5)) / 2; const iv = [[-1, ph, 0], [1, ph, 0], [-1, -ph, 0], [1, -ph, 0], [0, -1, ph], [0, 1, ph], [0, -1, -ph], [0, 1, -ph], [ph, 0, -1], [ph, 0, 1], [-ph, 0, -1], [-ph, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
  const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const centers = []; iv.forEach(v => centers.push({ n: v, k: 1.02654, pent: true }));
  faces.forEach(f => { const c = [0, 0, 0]; f.forEach(k => { c[0] += iv[k][0]; c[1] += iv[k][1]; c[2] += iv[k][2]; }); const l = Math.hypot(...c); centers.push({ n: c.map(x => x / l), k: 1, pent: false }); });
  await rows(Hd, j => { for (let i = 0; i < Wd; i++) {
    const u = (i + 0.5) / Wd, v = (j + 0.5) / Hd; const th = v * Math.PI, a = (u - 0.5) * 2 * Math.PI;
    const d = [Math.sin(a) * Math.sin(th), Math.cos(th), Math.cos(a) * Math.sin(th)];
    let b1 = -9, b2 = -9, best = null, idx = 0, k = 0;
    for (const c of centers) { const s = (d[0] * c.n[0] + d[1] * c.n[1] + d[2] * c.n[2]) / c.k; if (s > b1) { b2 = b1; b1 = s; best = c; idx = k; } else if (s > b2) b2 = s; k++; }
    const edge = (b1 - b2) * 9; // ~ angular distance to seam
    const n = N1.fbm(d[0] * 3 + 5, d[1] * 3 + d[2] * 2, 5, 4096, 4096), hi = N2.v(d[0] * 60 + d[2] * 13, d[1] * 60, 4096, 4096);
    N3.worley(d[0] * 22 + 40, d[1] * 22 + d[2] * 9, 4096, 4096, W); const crack = 1 - ss(0, 0.06, W.f2 - W.f1);
    let c, rough, h;
    if (best.pent) { c = [0.07, 0.065, 0.06]; c = mix3(c, [0.3, 0.27, 0.22], crack * 0.7 + ss(0.6, 0.8, n) * 0.4, c); rough = 0.75 - crack * 0.1; h = -crack * 0.5; }
    else { const g = 0.78 - n * 0.22; c = [g * 0.95, g * 0.9, g * 0.8]; c = mix3(c, [0.42, 0.36, 0.28], ss(0.45, 0.85, n + hi * 0.3) * 0.7, c); rough = 0.68; h = 0; }
    const seam = 1 - ss(0.0, 0.07, edge); const stitch = (edge > 0.06 && edge < 0.11 && Math.sin((d[0] * 31 + d[1] * 37 + d[2] * 41) * 14) > 0.4) ? 1 : 0;
    c = mix3(c, [0.06, 0.05, 0.04], seam * 0.9, c); if (stitch) c = mix3(c, [0.2, 0.17, 0.13], 0.7, c);
    h += Math.min(edge, 0.5) * 1.2 - seam * 0.6 - stitch * 0.2 + hi * 0.06; // pillowed panels
    const p = j * Wd + i; put(t.albedo, p, c[0], c[1], c[2]); put(t.orm, p, 1 - seam * 0.5, rough, 0); hgt[p] = h;
  } });
  t.normal = normalFromHeight(hgt, Wd, Hd, 3.0, true);
  return t;
}
const SKY = {
  sunset: { zen: [0.13, 0.12, 0.27], up: [0.36, 0.22, 0.40], mid: [0.86, 0.42, 0.33], hor: [1.0, 0.64, 0.33], below: [0.42, 0.28, 0.27], glow: [1.0, 0.62, 0.3], gk: [0.45, 0.6, 1.2], cl: [0.5, 0.72], cDark: [0.42, 0.27, 0.42], cLit: [0.95, 0.45, 0.38], cSun: [1.0, 0.72, 0.42], disc: [1, 0.96, 0.82], discR: 0.99975 },
  day: { zen: [0.16, 0.32, 0.66], up: [0.30, 0.50, 0.80], mid: [0.55, 0.70, 0.88], hor: [0.80, 0.84, 0.88], below: [0.55, 0.58, 0.55], glow: [1.0, 0.95, 0.85], gk: [0.15, 0.35, 1.2], cl: [0.52, 0.74], cDark: [0.62, 0.66, 0.74], cLit: [0.96, 0.96, 0.95], cSun: [1, 1, 0.97], disc: [1, 1, 0.95], discR: 0.99985 },
  overcast: { zen: [0.30, 0.32, 0.36], up: [0.42, 0.44, 0.47], mid: [0.56, 0.56, 0.57], hor: [0.66, 0.65, 0.63], below: [0.45, 0.44, 0.42], glow: [0.9, 0.88, 0.82], gk: [0.18, 0.1, 0], cl: [0.3, 0.55], cDark: [0.36, 0.37, 0.4], cLit: [0.7, 0.7, 0.71], cSun: [0.85, 0.84, 0.8], disc: null },
  night: { zen: [0.006, 0.009, 0.025], up: [0.012, 0.018, 0.045], mid: [0.03, 0.04, 0.085], hor: [0.09, 0.08, 0.12], below: [0.03, 0.03, 0.05], glow: [0.45, 0.5, 0.65], gk: [0.06, 0.12, 0.6], cl: [0.56, 0.78], cDark: [0.03, 0.035, 0.06], cLit: [0.16, 0.18, 0.26], cSun: [0.4, 0.44, 0.55], disc: [0.92, 0.94, 1.0], discR: 0.99992, stars: true },
};
async function sky(Wd, Hd, sun, preset = 'sunset') {
  const P = SKY[preset] || SKY.sunset; const out = new Uint8Array(Wd * Hd * 4); const c = [0, 0, 0];
  await rows(Hd, j => { for (let i = 0; i < Wd; i++) {
    const u = (i + 0.5) / Wd, v = (j + 0.5) / Hd; const th = v * Math.PI, a = (u - 0.5) * 2 * Math.PI;
    const d = [Math.sin(a) * Math.sin(th), Math.cos(th), Math.cos(a) * Math.sin(th)]; const e = Math.asin(d[1]) * 180 / Math.PI;
    if (e < 0) mix3(P.hor, P.below, ss(0, 8, -e), c); else if (e < 7) mix3(P.hor, P.mid, e / 7, c); else if (e < 28) mix3(P.mid, P.up, (e - 7) / 21, c); else mix3(P.up, P.zen, ss(28, 85, e), c);
    const ca = Math.max(0, d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2]);
    const glow = Math.pow(ca, 6) * P.gk[0] + Math.pow(ca, 48) * P.gk[1] + Math.pow(ca, 400) * P.gk[2];
    c[0] += glow * P.glow[0]; c[1] += glow * P.glow[1]; c[2] += glow * P.glow[2];
    if (P.stars && d[1] > 0.02) { const sx = Math.floor((a + 3.2) * 260), sy = Math.floor(th * 260); const h = N1.v(sx * 0.731, sy * 0.917, 4096, 4096), h2 = N2.v(sx * 1.37, sy * 0.53, 4096, 4096);
      if (h > 0.93 && h2 > 0.55) { const b = (h - 0.93) * 14 * ss(0.02, 0.3, d[1]); c[0] += b * 0.9; c[1] += b * 0.92; c[2] += b; }
      const mw = Math.exp(-Math.pow((d[0] * 0.5 + d[1] * 0.7 - d[2] * 0.5) * 3.5, 2)) * N3.fbm(u * 30, v * 30, 4, 4096, 4096) * 0.05; c[0] += mw; c[1] += mw; c[2] += mw * 1.3; }
    if (d[1] > 0.012) {
      const k = 1 / (d[1] + 0.06); const cu = d[0] * k, cv = d[2] * k;
      const den = N1.fbm(cu * 0.55 + 10, cv * 1.6 + 3, 6, 4096, 4096) * 0.75 + N2.fbm(cu * 2.2, cv * 5, 3, 4096, 4096) * 0.35;
      const cl = ss(P.cl[0], P.cl[1], den) * ss(0.012, 0.09, d[1]) * (1 - ss(0.55, 0.95, d[1]) * (preset === 'overcast' ? 0 : 1));
      const lit = Math.pow(ca, 3);
      const ccol = mix3(mix3(P.cDark, P.cLit, ss(0.0, 0.6, lit + (1 - d[1]) * 0.25), [0, 0, 0]), P.cSun, Math.pow(ca, 14), [0, 0, 0]);
      const shade = 0.75 + 0.25 * ss(0.5, 0.8, den);
      mix3(c, [ccol[0] * shade, ccol[1] * shade, ccol[2] * shade], cl * 0.92, c);
    }
    if (P.disc && ca > P.discR) { c[0] = P.disc[0]; c[1] = P.disc[1]; c[2] = P.disc[2]; }
    put(out, j * Wd + i, c[0], c[1], c[2]);
  } });
  return { w: Wd, h: Hd, data: out };
}
async function leaves(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; N1.worley(u * 40, v * 40, 40, 40, W); const leaf = 1 - ss(0.2, 0.55, W.f1); const tone = N2.v(W.id * 0.31, 0.7, 512, 512); const m = N3.fbm(u * 4, v * 4, 4, 4, 4);
    const c = mix3(mix3([0.22, 0.26, 0.08], [0.55, 0.38, 0.1], ss(0.3, 0.8, m + tone * 0.4), [0, 0, 0]), [0.62, 0.25, 0.08], ss(0.75, 0.9, tone) * 0.8, [0, 0, 0]);
    const sh = 0.45 + leaf * 0.55; put(t.albedo, i, c[0] * sh, c[1] * sh, c[2] * sh); put(t.orm, i, 1, 0.85, 0); t.height[i] = leaf;
  } });
  return finish(t, 3);
}
async function hay(S) {
  const t = newTex(S, S);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = y * S + x; const s = N1.fbm(u * 64, v * 4, 4, 64, 4), hi = N2.v(u * 256, v * 16, 256, 16), m = N3.fbm(u * 4, v * 4, 3, 4, 4);
    const c = mix3([0.55, 0.45, 0.22], [0.82, 0.70, 0.42], ss(0.3, 0.8, s + hi * 0.3), [0, 0, 0]); mix3(c, [0.4, 0.36, 0.25], ss(0.5, 0.8, m) * 0.5, c);
    put(t.albedo, i, c[0], c[1], c[2]); put(t.orm, i, 1, 0.92, 0); t.height[i] = s * 0.6 + hi * 0.4;
  } });
  return finish(t, 4);
}
async function farmland(S) { // tile for the land outside the arena
  const out = new Uint8Array(S * S * 4);
  await rows(S, y => { for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; const n = N1.fbm(u * 8, v * 8, 5, 8, 8), hi = N2.v(u * 128, v * 128, 128, 128), rowS = Math.sin(v * Math.PI * 2 * 24) * 0.5 + 0.5;
    const c = mix3([0.30, 0.30, 0.12], [0.50, 0.42, 0.20], ss(0.35, 0.75, n), [0, 0, 0]); mix3(c, [0.34, 0.26, 0.15], rowS * 0.25 * ss(0.5, 0.6, n), c);
    put(out, y * S + x, c[0] * (0.9 + hi * 0.2), c[1] * (0.9 + hi * 0.2), c[2] * (0.9 + hi * 0.2));
  } });
  return { w: S, h: S, data: out };
}
function softDot(S) { const a = new Uint8Array(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = Math.hypot(x / S - 0.5, y / S - 0.5) * 2; const v = Math.pow(sat(1 - r), 1.6); const i = (y * S + x) * 4; a[i] = a[i + 1] = a[i + 2] = 255; a[i + 3] = v * 255; } return { w: S, h: S, data: a }; }
function chip(S) { const a = new Uint8Array(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S - 0.5, v = y / S - 0.5; const on = Math.abs(u) < 0.42 && Math.abs(v) < 0.18 + Math.abs(u) * 0.2; const i = (y * S + x) * 4; a[i] = a[i + 1] = a[i + 2] = 255; a[i + 3] = on ? 255 : 0; } return { w: S, h: S, data: a }; }
// cream paint with rust breaking through, for the UI wordmark
function uiRust(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); const id = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w * 4, v = y / h * 1.3; const n = N1.fbm(u * 2, v * 2, 5, 4096, 4096), hi = N2.v(u * 40, v * 40, 4096, 4096);
    const rust = ss(0.56, 0.6, n + hi * 0.12); const i = (y * w + x) * 4;
    const c = mix3([0.95, 0.89, 0.76], [0.84, 0.76, 0.6], ss(0.3, 0.7, n), [0, 0, 0]); mix3(c, mix3([0.44, 0.18, 0.07], [0.7, 0.33, 0.12], hi, [0, 0, 0]), rust, c);
    id.data[i] = c[0] * 255; id.data[i + 1] = c[1] * 255; id.data[i + 2] = c[2] * 255; id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0); return cv.toDataURL('image/png');
}

root.RLTex = { Noise, N1, N2, N3, grassDetail, fieldMacro, rustWall, pipeRust, carAtlas, CARMAP, chrome, tire, wireWheel, steelWheel, plastic, SKY, grimeDetail, CARMAPS, vinyl, glass, woodPad, barnWood, corrugated, chainLink, netTex, ball, sky, leaves, hay, farmland, softDot, chip, uiRust };
})(typeof window !== 'undefined' ? window : globalThis);

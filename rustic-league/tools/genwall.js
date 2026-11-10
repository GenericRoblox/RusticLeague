// Offline: paint one unique, non-repeating texture for the whole arena wall (all team sizes).
require('../src/tex.js'); const T = globalThis.RLTex; const fs = require('fs');
const W = 4096, PX = 28, ROWH = 448, ROWS = 5, H = ROWH * ROWS, ROWLEN = W / PX; // metres per row
const A = new T.Noise(101), Bn = new T.Noise(202), C = new T.Noise(303), D = new T.Noise(404), E = new T.Noise(505);
const P = 99999; const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t; const mix3 = (c, d, t) => [mix(c[0], d[0], t), mix(c[1], d[1], t), mix(c[2], d[2], t)];
const alb = Buffer.alloc(W * H * 3), orm = Buffer.alloc(W * H * 3), hgt = new Float32Array(W * H), wf = { f1: 0, f2: 0, id: 0 };
const rustD = [0.14, 0.075, 0.045], rustB = [0.30, 0.17, 0.10], rustO = [0.47, 0.22, 0.085];
const blue = [0.19, 0.30, 0.42], blueF = [0.36, 0.44, 0.51], white = [0.66, 0.64, 0.58], bare = [0.5, 0.48, 0.46], grn = [0.25, 0.33, 0.27];
const t0 = Date.now();
for (let y = 0; y < H; y++) {
  const row = Math.floor(y / ROWH), ym = (y % ROWH + 0.5) / PX; // metres up the profile from the floor edge
  for (let x = 0; x < W; x++) {
    const xm = row * ROWLEN + (x + 0.5) / PX; const i = y * W + x;
    const big = A.fbm(xm / 14, ym / 14, 6, P, P), med = Bn.fbm(xm / 3.2, ym / 3.2, 5, P, P), hi = C.v(xm * 11, ym * 11, P, P);
    const zone = D.fbm(xm / 60 + 7, 0.3, 4, P, P); // very large scale: some stretches repainted green, some almost all rust
    D.worley(xm * 3.5, ym * 3.5, P, P, wf); const pit = 1 - ss(0, 0.35, wf.f1);
    const streak = E.fbm(xm * 3.5, ym * 0.18, 4, P, P);
    // panels: 3 m wide, joints at 5.1 m and 10.2 m up the profile
    const sx = xm % 3, seamD = Math.min(Math.min(sx, 3 - sx), Math.abs(ym - 5.1), Math.abs(ym - 10.2), Math.abs(ym - 15.2));
    const seam = 1 - ss(0.01, 0.045, seamD);
    let c = mix3(rustD, rustB, ss(0.3, 0.7, med + hi * 0.2)); c = mix3(c, rustO, ss(0.62, 0.9, med * 0.7 + hi * 0.5) * 0.7);
    let h = med * 0.35 + hi * 0.12 - pit * 0.22, rough = 0.9, metal = 0.1, ao = 1;
    const wet = ss(1.6, 0.2, ym) * 0.7 + ss(14.9, 15.5, ym) * 0.5; // splash zone at the bottom, weathered lip on top
    const pm = big * 0.85 + med * 0.22 + hi * 0.05 - streak * 0.1 - wet * 0.35 - ss(0.62, 0.8, zone) * 0.25 + ss(0.35, 0.2, zone) * 0.08 - ss(0.12, 0, seamD) * 0.1;
    const paint = ss(0.47, 0.5, pm), edge = ss(0.44, 0.47, pm) - paint;
    if (paint > 0) {
      let pc = mix3(blue, blueF, ss(0.25, 0.85, C.fbm(xm / 2.2, ym / 2.2, 4, P, P) + hi * 0.1));
      pc = mix3(pc, grn, ss(0.55, 0.6, D.fbm(xm / 40, ym / 20 + 5, 3, P, P)) * 0.9);            // patched-over sections in green
      pc = mix3(pc, white, ss(0.72, 0.75, E.fbm(xm / 5 + 3, ym / 5 + 1, 5, P, P)) * 0.85);
      pc = mix3(pc, [0.3, 0.19, 0.12], ss(0.5, 0.9, streak) * 0.5);
      const chips = (wf.f2 - wf.f1 < 0.035 && hi > 0.7) ? 1 : 0;
      c = mix3(c, pc, paint * (1 - chips)); h += paint * 0.3; rough = mix(rough, 0.6, paint); metal = mix(metal, 0, paint);
    }
    if (edge > 0.05) { c = mix3(c, bare, edge * 0.8); rough = mix(rough, 0.35, edge); metal = mix(metal, 0.8, edge); }
    c = mix3(c, [0.24, 0.12, 0.065], ss(0.55, 0.85, streak) * (0.35 + 0.6 * paint) * 0.55);
    c = mix3(c, [0.22, 0.17, 0.12], wet * 0.45);                                                  // mud splash
    if (seam > 0) { c = mix3(c, [0.06, 0.04, 0.03], seam * 0.85); h -= seam * 0.6; ao = 1 - seam * 0.6; }
    // rivet heads along the panel joints
    const along = seamD === Math.min(sx, 3 - sx) ? ym : xm; const rv = Math.abs(seamD - 0.09) < 0.035 && Math.abs((along / 0.2) % 1 - 0.5) < 0.18;
    if (rv) { h += 0.5; c = mix3(c, rustD, 0.5); }
    const g = 0.9 + hi * 0.2; const o = i * 3;
    alb[o] = Math.min(255, c[0] * g * 255); alb[o + 1] = Math.min(255, c[1] * g * 255); alb[o + 2] = Math.min(255, c[2] * g * 255);
    orm[o] = ao * 255; orm[o + 1] = rough * 255; orm[o + 2] = metal * 255; hgt[i] = h;
  }
}
// normal map (no wrap: unique texture)
const nrm = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const xl = Math.max(x - 1, 0), xr = Math.min(x + 1, W - 1), yu = Math.max(y - 1, 0), yd = Math.min(y + 1, H - 1);
  const dx = (hgt[y * W + xr] - hgt[y * W + xl]) * 4, dy = (hgt[yd * W + x] - hgt[yu * W + x]) * 4; const l = Math.sqrt(dx * dx + dy * dy + 1); const o = (y * W + x) * 3;
  nrm[o] = (-dx / l * 0.5 + 0.5) * 255; nrm[o + 1] = (-dy / l * 0.5 + 0.5) * 255; nrm[o + 2] = (1 / l * 0.5 + 0.5) * 255;
}
fs.writeFileSync('assets/wall_albedo.raw', alb); fs.writeFileSync('assets/wall_normal.raw', nrm); fs.writeFileSync('assets/wall_orm.raw', orm);
fs.writeFileSync('assets/wall_meta.json', JSON.stringify({ W, H, PX, ROWH, ROWS, ROWLEN }));
console.log('done', (Date.now() - t0) / 1000, 's');

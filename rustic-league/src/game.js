// ===================== RUSTIC LEAGUE — GAME =====================
(async function () {
'use strict';
const B = BABYLON, S = RLSim, T = RLTex, AU = RLAudio, $ = id => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('rustic_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('rustic_' + k, JSON.stringify(v)); } catch (e) { } } };
const PAINTS = { maroon: ['#6b2626', 'Oxblood maroon'], avocado: ['#5a692b', 'Avocado'], bleached: ['#55728f', 'Sun-bleached blue'], mustard: ['#a8842d', 'Harvest mustard'], orange: ['#9e471f', 'Burnt orange'], seafoam: ['#5a877a', 'Seafoam'], cream: ['#b7ab8e', 'Champagne'] };
const guessQ = () => { const mob = /Mobi|Android/i.test(navigator.userAgent); return mob ? 'low' : (window.devicePixelRatio > 1.5 ? 'medium' : 'medium'); };
const settings = Object.assign({ mode: 'timed', difficulty: 'normal', volume: 0.8, quality: guessQ(), shake: true, ballcam: true, skids: true, touchControls: 'auto', touchLayout: 'default', teamSize: 1, lighting: 'sunset', flood: 'auto', brightness: 1, shadows: true, bloom: true }, store.get('settings', {}));
if ((settings.v || 0) < 2) { settings.ballcam = true; settings.v = 2; } // ball cam is the default now
const profile = Object.assign({ name: '', car: 'coupe', paint: 'maroon', xp: 0, wins: 0, losses: 0, draws: 0 }, store.get('profile', {}));
// goal plastic: a punchier, sun-faded version of the goalkeeper's paint
function vivid(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, l = (mx + mn) / 2, d = mx - mn, sa = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; } h *= 60; if (h < 0) h += 360;
  sa = Math.min(1, sa * 1.5 + 0.12); l = Math.min(0.62, Math.max(l * 1.25, 0.4));
  const c = (1 - Math.abs(2 * l - 1)) * sa, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; const [R, G, Bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const t = v => Math.round((v + m) * 255).toString(16).padStart(2, '0'); return '#' + t(R) + t(G) + t(Bb);
}
// goal frames: the team colour as sun-faded, grimy plastic (vivid() stays for the HUD accents)
function weathered(hex) {
  const v = vivid(hex), c = [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255), lum = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11, grime = [0.36, 0.3, 0.24];
  const t = c.map((x, i) => Math.max(0, Math.min(1, (x * 0.7 + lum * 0.3) * 0.95 * 0.85 + grime[i] * 0.15)));
  return '#' + t.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
const saveSettings = () => store.set('settings', settings), saveProfile = () => store.set('profile', profile);
const QP = { low: { tex: 0.5, shadow: 1024, scale: 1.5, bloom: false, aa: false }, medium: { tex: 0.75, shadow: 2048, scale: 1, bloom: true, aa: true }, high: { tex: 1, shadow: 2048, scale: 1 / Math.min(window.devicePixelRatio || 1, 1.5), bloom: true, aa: true } }[settings.quality] || {};
// (High used to render at up to 2x device pixels with 4x MSAA on top of FXAA, a 4096 shadow map and chromatic aberration:
// very slow, and the aberration read as a red/blue 3D-glasses fringe. It now differs from Medium by full-size textures,
// up to 1.5x device pixels and softer shadow filtering.)
const SUN = (() => { const v = [-0.40, 0.045, 0.915]; const l = Math.hypot(...v); return v.map(x => x / l); })();
const LIGHT = (() => { const v = [-0.42, 0.25, 0.87]; const l = Math.hypot(...v); return v.map(x => x / l); })();

// ---------- engine ----------
const canvas = $('c');
let engine;
try { engine = new B.Engine(canvas, QP.aa, { preserveDrawingBuffer: true, stencil: true, powerPreference: 'high-performance' }, false); }
catch (e) { $('loadErr').textContent = 'This browser could not start WebGL, which the game needs. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.'; $('loadErr').classList.remove('hidden'); return; }
engine.setHardwareScalingLevel(QP.scale);
const scene = new B.Scene(engine);
scene.clearColor = new B.Color4(0.5, 0.3, 0.3, 1);
scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogDensity = 0.0021; scene.fogColor = new B.Color3(0.78, 0.50, 0.42);
scene.skipPointerMovePicking = true;
window.addEventListener('resize', () => engine.resize());

const setLoad = (p, msg) => { $('loadBar').style.width = (p * 100).toFixed(0) + '%'; if (msg) $('loadMsg').textContent = msg; };
const tick = () => new Promise(r => setTimeout(r, 0));

// ---------- textures ----------
const CAR_RES = { low: 768, medium: 1024, high: 1536 }[settings.quality] || 1024;
const rs = n => Math.max(64, Math.round(n * QP.tex / 64) * 64);
function rawTex(t, data, srgb = true, wrap = true) {
  const tx = new B.RawTexture(data, t.w, t.h, B.Constants.TEXTUREFORMAT_RGBA, scene, true, false, B.Texture.TRILINEAR_SAMPLINGMODE);
  tx.gammaSpace = srgb; tx.wrapU = tx.wrapV = wrap ? B.Texture.WRAP_ADDRESSMODE : B.Texture.CLAMP_ADDRESSMODE; tx.anisotropicFilteringLevel = settings.quality === 'low' ? 4 : 12; return tx;
}
function pbr(name, set, o = {}) {
  const m = new B.PBRMaterial(name, scene);
  if (set) {
    if (set.albedo) m.albedoTexture = rawTex(set, set.albedo, true, o.wrap !== false);
    if (set.normal) { m.bumpTexture = rawTex(set, set.normal, false, o.wrap !== false); m.bumpTexture.level = o.bump || 1; }
    if (set.orm) { m.metallicTexture = rawTex(set, set.orm, false, o.wrap !== false); m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = true; m.useAmbientOcclusionFromMetallicTextureRed = true; m.metallic = 1; m.roughness = 1; }
    if (o.us || o.vs) for (const t of [m.albedoTexture, m.bumpTexture, m.metallicTexture]) if (t) { t.uScale = o.us || 1; t.vScale = o.vs || 1; }
  } else { m.metallic = o.metal ?? 0; m.roughness = o.rough ?? 0.8; }
  if (o.color) m.albedoColor = o.color;
  m.environmentIntensity = o.env ?? 0.75;
  m.maxSimultaneousLights = 3;
  return m;
}
const STOCH_GLSL = `
#ifdef STOCH
#if __VERSION__ >= 300
#define STG(s,uv,dx,dy) textureGrad(s,uv,dx,dy)
#else
#define STG(s,uv,dx,dy) texture2D(s,uv)
#endif
float stH(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float stN(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(stH(i),stH(i+vec2(1.0,0.0)),f.x),mix(stH(i+vec2(0.0,1.0)),stH(i+vec2(1.0,1.0)),f.x),f.y); }
void stXf(float k, out mat2 R, out vec2 off){
  float a=stH(vec2(k,1.7)); float b=stH(vec2(k,8.3)); float c=stH(vec2(k,3.1)); float ang;
  float m=1.0;
#if STOCH_MODE == 1
  off=floor(vec2(a,b)*4.0)*0.25; ang=floor(c*2.0)*3.14159265; m=stH(vec2(k,5.9))>0.5?1.0:-1.0;
#elif STOCH_MODE == 2
  off=vec2(a,b); ang=0.0;
#else
  off=vec2(a,b); ang=c*6.2831853;
#endif
  float cs=cos(ang); float sn=sin(ang); R=mat2(cs*m,sn*m,-sn,cs);
}
float stW(vec2 uv, out float ka, out float kb){ float l=stN(uv*0.33)*6.0+stN(uv*0.071+3.7)*4.0; ka=floor(l); kb=ka+1.0; return smoothstep(0.22,0.78,fract(l)); }
vec2 stRT(mat2 R, vec2 v){ return vec2(R[0][0]*v.x+R[0][1]*v.y, R[1][0]*v.x+R[1][1]*v.y); }
vec4 stochA(sampler2D s, vec2 uv){ float ka; float kb; float w=stW(uv,ka,kb); mat2 Ra; mat2 Rb; vec2 oa; vec2 ob; stXf(ka,Ra,oa); stXf(kb,Rb,ob);
  vec2 dx=dFdx(uv); vec2 dy=dFdy(uv); return mix(STG(s,Ra*uv+oa,Ra*dx,Ra*dy), STG(s,Rb*uv+ob,Rb*dx,Rb*dy), w); }
vec4 stochN(sampler2D s, vec2 uv){ float ka; float kb; float w=stW(uv,ka,kb); mat2 Ra; mat2 Rb; vec2 oa; vec2 ob; stXf(ka,Ra,oa); stXf(kb,Rb,ob);
  vec2 dx=dFdx(uv); vec2 dy=dFdy(uv); vec4 A=STG(s,Ra*uv+oa,Ra*dx,Ra*dy); vec4 C=STG(s,Rb*uv+ob,Rb*dx,Rb*dy);
  A.xy=stRT(Ra,A.xy*2.0-1.0)*0.5+0.5; C.xy=stRT(Rb,C.xy*2.0-1.0)*0.5+0.5; return mix(A,C,w); }
vec4 stochD(sampler2D s, vec2 uv){ float ka; float kb; float w=stW(uv,ka,kb); mat2 Ra; mat2 Rb; vec2 oa; vec2 ob; stXf(ka,Ra,oa); stXf(kb,Rb,ob);
  vec2 dx=dFdx(uv); vec2 dy=dFdy(uv); vec4 A=STG(s,Ra*uv+oa,Ra*dx,Ra*dy); vec4 C=STG(s,Rb*uv+ob,Rb*dx,Rb*dy);
  vec2 na=stRT(Ra,A.wy*2.0-1.0)*0.5+0.5; vec2 nc=stRT(Rb,C.wy*2.0-1.0)*0.5+0.5; A.w=na.x; A.y=na.y; C.w=nc.x; C.y=nc.y; return mix(A,C,w); }
#endif
`;
// Texture bombing: every tiled material samples two randomly rotated/offset copies of its (seamless) texture and
// blends between them with low-frequency noise, so no tile repeats.
class StochPlugin extends B.MaterialPluginBase {
  constructor(m, mode, parts) { super(m, 'Stoch', 300, { STOCH: false, STOCH_MODE: 0 }, true, false); this.mode = mode; this.parts = parts; this._enable(true); }
  getClassName() { return 'StochPlugin'; }
  prepareDefines(d) { d.STOCH = true; d.STOCH_MODE = this.mode; }
  getCustomCode(type) {
    if (type !== 'fragment' || !this.parts) return null; const c = { CUSTOM_FRAGMENT_DEFINITIONS: STOCH_GLSL };
    if (this.parts.a) { c['!TEXRD\\(albedoSampler,'] = 'stochA(albedoSampler,'; c['!TEXRD\\(reflectivitySampler,'] = 'stochA(reflectivitySampler,'; }
    if (this.parts.n) c['!perturbNormal\\(TBN,TEXRD\\(bumpSampler,'] = 'perturbNormal(TBN,stochN(bumpSampler,';
    if (this.parts.d) c['!texture(?:2D)?\\(detailSampler,'] = 'stochD(detailSampler,';
    return c;
  }
}
const canStoch = engine.webGLVersion >= 2;
const stoch = (m, mode = 0, parts = { a: true, n: true }) => { if (canStoch && m) m.stoch = new StochPlugin(m, mode, parts); return m; };
const botPaint = () => { const keys = Object.keys(PAINTS).filter(k => k !== profile.paint); const pref = ['avocado', 'bleached', 'mustard', 'seafoam'].find(k => k !== profile.paint); return pref || keys[0]; };
let botPaintKey = botPaint();
const steps = [];
const TX = {};
// ---- texture workers: paint textures on background threads, in parallel (falls back to the main thread where workers are blocked) ----
const Pool = await (async () => {
  const pend = new Map(); let seq = 0, workers = [];
  try {
    const srcOf = id => { const el = document.getElementById(id); return el ? el.textContent : ''; };
    const main = `self.window = self; self.onmessage = async e => { const { id, fn, args } = e.data; try { let res;
      if (fn === 'ping') res = 'pong'; else if (fn === 'fieldMacro') { const S = self.RLSim; S.setArenaScale(args[2]); res = await RLTex.fieldMacro(args[0], args[1], S.A, S.PAD_POS, S.wallDist); }
      else res = await RLTex[fn](...args); postMessage({ id, res }); } catch (err) { postMessage({ id, err: String(err && err.message || err) }); } };`;
    const src = srcOf('src-sim.js') + '\n' + srcOf('src-tex.js') + '\n' + main; if (!/RLTex/.test(src)) throw new Error('no source');
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) { const w = new Worker(url); w.onmessage = e => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.err ? p.rej(new Error(e.data.err)) : p.res(e.data.res); }; workers.push(w); }
    const call = (wi, fn, args) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); workers[wi].postMessage({ id, fn, args }); });
    await Promise.race([Promise.all(workers.map((_, i) => call(i, 'ping', []))), new Promise((_, rej) => setTimeout(() => rej(new Error('worker timeout')), 2500))]);
  } catch (e) { workers.forEach(w => w.terminate()); workers = []; console.info('Texture workers unavailable, painting on the main thread:', e.message); }
  let rr = 0;
  const local = (fn, args) => fn === 'fieldMacro' ? (S.setArenaScale(args[2]), T.fieldMacro(args[0], args[1], S.A, S.PAD_POS, S.wallDist)) : T[fn](...args);
  return { n: workers.length, run(fn, args, affinity) { if (!workers.length) return local(fn, args); const wi = affinity != null ? affinity % workers.length : (rr++ % workers.length);
    return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); workers[wi].postMessage({ id, fn, args }); }); } };
})();
const P = [['grass', 'grassDetail', [rs(512)]], ['field', 'fieldMacro', [rs(640), rs(1152), 1]], ['grime', 'grimeDetail', [512]], ['pipe', 'pipeRust', [rs(256)]],
  ['chrome', 'chrome', [256]], ['tire', 'tire', [512, 128]], ['wheel', 'wireWheel', [256]], ['vinyl', 'vinyl', [rs(512)]], ['glass', 'glass', [256, false]], ['wind', 'glass', [rs(512), true]],
  ['wood', 'woodPad', [rs(768)]], ['barn', 'barnWood', [rs(512)]], ['tin', 'corrugated', [rs(512), true]], ['silo', 'corrugated', [rs(512), false]], ['ball', 'ball', [rs(1536), rs(768)]],
  ['plastic0', 'plastic', [256, weathered(PAINTS[profile.paint][0])]], ['plastic1', 'plastic', [256, weathered(PAINTS[botPaintKey][0])]], ['leaves', 'leaves', [256]], ['hay', 'hay', [256]], ['farm', 'farmland', [512]],
  ['steelHubT', 'steelWheel', [256]], ['tireBlackT', 'tire', [512, 128, true]], ['hulk', 'carAtlas', [rs(512), '#6c5a46', true, 'coupe'], 0]];
// warm up the quick car coats (your car, and every type the bots might bring) while everything else paints
const CAR_LO_ = 384, AFF_ = { coupe: 0, van: 1, buggy: 2 };
for (const [ty, hex] of [[profile.car, PAINTS[profile.paint][0]], ...['coupe', 'van', 'buggy'].map(t => [t, PAINTS[botPaintKey][0]])]) P.push(['lo:' + ty + hex, 'carAtlas', [CAR_LO_, hex, false, ty], AFF_[ty]]);
const msgs = ['Sweeping out the barn', 'Painting the turf lines', 'Grinding in the grime', 'Bending some pipe', 'Fading the paint', 'Polishing what chrome is left', 'Mounting the whitewalls', 'Lacing the wire wheels', 'Cracking the vinyl', 'Smearing the glass', 'Chipping the windshield', 'Planking the launch pads', 'Painting the barn red', 'Corrugating the roof', 'Hanging the silo', 'Stitching the ball', 'Moulding the goal frames', 'Weathering more plastic', 'Turning the leaves', 'Baling hay', 'Plowing the fields'];
try {
  // biggest jobs first so the workers finish together; the first car paints start straight away in the background too
  let done = 0; const order = [...P].sort((a, b) => (b[2][0] * (b[2][1] > 8 ? b[2][1] : b[2][0])) - (a[2][0] * (a[2][1] > 8 ? a[2][1] : a[2][0])));
  await Promise.all(order.map(([k, fn, args, aff]) => Promise.resolve(Pool.run(fn, args, aff)).then(r => { TX[k] = r; done++; setLoad(done / (P.length + 4) * 0.85, msgs[Math.min(done, msgs.length - 1)]); })));
} catch (e) { console.error(e); $('loadErr').textContent = 'Something went wrong while painting the textures: ' + e.message; $('loadErr').classList.remove('hidden'); return; }
setLoad(0.8, 'Bolting it all together'); await tick();

// ---------- materials ----------
const M = {};
M.field = pbr('field', { w: TX.field.w, h: TX.field.h, albedo: TX.field.data }, { wrap: false }); M.field.metallic = 0; M.field.roughness = 0.96;
const grassDet = rawTex(TX.grass, TX.grass.data, false); grassDet.uScale = 84 / 1.7; grassDet.vScale = 2 * (S.A.HZ + 12) / 1.7;
M.field.detailMap.texture = grassDet; M.field.detailMap.isEnabled = true; M.field.detailMap.diffuseBlendLevel = 0.85; M.field.detailMap.bumpLevel = 1.3; M.field.detailMap.roughnessBlendLevel = 0.3; stoch(M.field, 0, { d: true });
M.farm = pbr('farm', { w: TX.farm.w, h: TX.farm.h, albedo: TX.farm.data }, { us: 110, vs: 110 }); M.farm.metallic = 0; M.farm.roughness = 1; M.farm.albedoColor = new B.Color3(0.85, 0.8, 0.75);
// the wall wears one unique pre-baked texture (no tiling at all); only the fine grime detail layer repeats, and that is bombed
M.wall = new B.PBRMaterial('wall', scene);
{ const W = window.RL_WALL; const tx = (u, srgb) => { const t = new B.Texture(u, scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE); t.gammaSpace = srgb; t.wrapU = t.wrapV = B.Texture.CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = 16; return t; };
  M.wall.albedoTexture = tx(W.albedo, true); M.wall.bumpTexture = tx(W.normal, false); M.wall.bumpTexture.level = 1.0; M.wall.metallicTexture = tx(W.orm, false);
  M.wall.useRoughnessFromMetallicTextureGreen = true; M.wall.useMetallnessFromMetallicTextureBlue = true; M.wall.useAmbientOcclusionFromMetallicTextureRed = true; M.wall.metallic = 1; M.wall.roughness = 1; M.wall.environmentIntensity = 0.75;
  stoch(M.wall, 0, { d: true });
  const gd = rawTex(TX.grime, TX.grime.data, false); gd.uScale = W.meta.ROWLEN / 1.9; gd.vScale = W.meta.H / W.meta.PX / 1.9; M.wall.detailMap.texture = gd; M.wall.detailMap.isEnabled = true; M.wall.detailMap.diffuseBlendLevel = 0.55; M.wall.detailMap.bumpLevel = 0.8; M.wall.detailMap.roughnessBlendLevel = 0.35; }
M.pipe = stoch(pbr('pipe', TX.pipe, { us: 2, vs: 14 }));
M.under = stoch(pbr('under', TX.pipe, { us: 0.45, vs: 0.45 })); M.under.albedoColor = new B.Color3(0.42, 0.36, 0.32); // car floors and wheel wells: grimy, evenly tiled
M.iron = stoch(pbr('iron', TX.pipe, { us: 3, vs: 3, color: new B.Color3(0.55, 0.5, 0.48) }));
M.bark = stoch(pbr('bark', TX.pipe, { us: 2, vs: 6, color: new B.Color3(0.42, 0.36, 0.33) }));
const alphaMat = (name, t, us) => { const m = new B.PBRMaterial(name, scene); const tx = rawTex(t, t.data); tx.hasAlpha = true; tx.uScale = us; tx.vScale = us; m.albedoTexture = tx; m.useAlphaFromAlbedoTexture = true; m.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = 0.5; m.backFaceCulling = false; m.metallic = 0.5; m.roughness = 0.55; m.environmentIntensity = 0.6; return m; };
M.chain = alphaMat('chain', T.chainLink(256), 1); M.net = alphaMat('net', T.netTex(256), 1.1); M.net.metallic = 0; M.net.roughness = 0.9; M.net.emissiveColor = new B.Color3(0.07, 0.065, 0.06); M.net.emissiveTexture = M.net.albedoTexture; M.net.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND; M.net.separateCullingPass = true;
M.plastic0 = stoch(pbr('plastic0', TX.plastic0, { env: 0.9 })); M.plastic1 = stoch(pbr('plastic1', TX.plastic1, { env: 0.9 }));
M.lamp = new B.PBRMaterial('lamp', scene); M.lamp.albedoColor = new B.Color3(0.02, 0.02, 0.02); M.lamp.emissiveColor = new B.Color3(1, 0.86, 0.62); M.lamp.emissiveIntensity = 3.2;
M.padLamp = new B.PBRMaterial('padLamp', scene); M.padLamp.albedoColor = new B.Color3(0.05, 0.03, 0.01); M.padLamp.emissiveColor = new B.Color3(1, 0.55, 0.16); M.padLamp.emissiveIntensity = 2.5;
M.pit = pbr('pit', null, { color: new B.Color3(0.04, 0.03, 0.025), rough: 1 });
M.wood = pbr('wood', TX.wood, { wrap: false, bump: 1.2 });
M.barn = stoch(pbr('barn', TX.barn, { us: 1, vs: 1 }), 2);
M.tinRoof = stoch(pbr('tin', TX.tin, { us: 1, vs: 1 }), 2);
M.silo = stoch(pbr('silo', TX.silo, { us: 10, vs: 8 }), 2);
M.trim = pbr('trim', null, { color: new B.Color3(0.72, 0.68, 0.6), rough: 0.85 });
M.black = pbr('black', null, { color: new B.Color3(0.025, 0.022, 0.02), rough: 0.7 }); M.black.backFaceCulling = false;
M.leaves = stoch(pbr('leaves', TX.leaves, { us: 2, vs: 2 })); M.hay = stoch(pbr('hay', TX.hay, { us: 2, vs: 1 }), 2);
M.hills = pbr('hills', { w: TX.farm.w, h: TX.farm.h, albedo: TX.farm.data }, { us: 0.02, vs: 0.02 }); M.hills.albedoColor = new B.Color3(0.45, 0.48, 0.32); M.hills.metallic = 0; M.hills.roughness = 1; stoch(M.hills); stoch(M.farm);
M.sky = new B.StandardMaterial('sky', scene); M.sky.disableLighting = true; M.sky.backFaceCulling = false; M.sky.fogEnabled = false; M.sky.diffuseColor = B.Color3.Black(); M.sky.specularColor = B.Color3.Black();
// car shared materials
M.vinyl = stoch(pbr('vinyl', TX.vinyl)); M.chrome = pbr('chrome', TX.chrome, { env: 1.1 }); M.tire = pbr('tire', TX.tire); M.hub = pbr('hub', TX.wheel, { wrap: false, env: 1.0 });
M.glass = pbr('glass', TX.glass, { env: 1.3 }); M.glass.metallic = 0; M.glass.useMetallnessFromMetallicTextureBlue = false;
M.wind = pbr('wind', TX.wind, { env: 1.3, wrap: false }); M.wind.metallic = 0; M.wind.useMetallnessFromMetallicTextureBlue = false;
M.amber = pbr('amber', null, { color: new B.Color3(0.5, 0.25, 0.03), rough: 0.3 }); M.amber.emissiveColor = new B.Color3(1, 0.5, 0.08); M.amber.emissiveIntensity = 0.25;
M.head = pbr('head', null, { color: new B.Color3(0.6, 0.6, 0.55), rough: 0.2 }); M.head.emissiveColor = new B.Color3(1, 0.88, 0.62); M.head.emissiveIntensity = 1.6;
M.plate = pbr('plate', null, { color: new B.Color3(1, 1, 1), rough: 0.6 });
{ const pt = new B.DynamicTexture('plateTex', { width: 256, height: 76 }, scene, true); const g = pt.getContext(); g.fillStyle = '#d8cfae'; g.fillRect(0, 0, 256, 76); g.strokeStyle = '#3b2a1a'; g.lineWidth = 5; g.strokeRect(4, 4, 248, 68);
  g.fillStyle = '#1d2f5c'; g.font = 'bold 44px Arial Narrow, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RUST 77', 128, 42); g.font = 'bold 12px Arial'; g.fillText('RUSTIC  COUNTY', 128, 13);
  const im = g.getImageData(0, 0, 256, 76); for (let i = 0; i < im.data.length; i += 4) { const n = T.N1.v((i / 4 % 256) * 0.2, Math.floor(i / 1024) * 0.2, 4096, 4096); const k = 0.82 + n * 0.25; im.data[i] *= k; im.data[i + 1] *= k * 0.97; im.data[i + 2] *= k * 0.9; } g.putImageData(im, 0, 0);
  pt.update(); M.plate.albedoTexture = pt; }
M.ball = pbr('ball', TX.ball, { bump: 1 });
const carMat = (name, set) => { const m = pbr(name, set, { wrap: false, bump: 0.9 }); m.maxSimultaneousLights = 8; return m; }; // sun, sky and all six floodlights (3 left a car lit by one tower at night)
const tailMat = () => { const m = pbr('tail', null, { color: new B.Color3(0.35, 0.02, 0.02), rough: 0.25 }); m.emissiveColor = new B.Color3(1, 0.06, 0.03); m.emissiveIntensity = 0.5; return m; };

// ---------- lights, shadows, environment ----------
const sun = new B.DirectionalLight('sun', new B.Vector3(-LIGHT[0], -LIGHT[1], -LIGHT[2]), scene); sun.shadowEnabled = settings.shadows !== false;
sun.diffuse = new B.Color3(1, 0.70, 0.44); sun.specular = new B.Color3(1, 0.75, 0.5); sun.intensity = 3.4;
const hemi = new B.HemisphericLight('hemi', new B.Vector3(0, 1, 0), scene); hemi.diffuse = new B.Color3(0.62, 0.52, 0.72); hemi.groundColor = new B.Color3(0.32, 0.22, 0.16); hemi.intensity = 0.95; hemi.specular = B.Color3.Black();
const sg = new B.ShadowGenerator(QP.shadow, sun); sg.usePercentageCloserFiltering = true; sg.filteringQuality = settings.quality === 'high' ? B.ShadowGenerator.QUALITY_HIGH : B.ShadowGenerator.QUALITY_MEDIUM; sg.bias = 0.0012; sg.normalBias = 0.03; sg.darkness = 0.12;
sun.autoUpdateExtends = false; sun.shadowOrthoScale = 0; sun.shadowMinZ = 1; sun.shadowMaxZ = 420;
sun.position = new B.Vector3(LIGHT[0] * 150, LIGHT[1] * 150, LIGHT[2] * 150);
const addCaster = m => { sg.addShadowCaster(m, true); };
const pruneCasters = () => { const sm = sg.getShadowMap(); if (sm && sm.renderList) sm.renderList = sm.renderList.filter(m => !m.isDisposed()); };
const probe = new B.ReflectionProbe('probe', settings.quality === 'low' ? 64 : 128, scene, true); probe.position = new B.Vector3(0, 14, 0);
probe.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
const ballMesh = RLMesh.sphere('ball', scene, 1.55, 40, 72); ballMesh.material = M.ball; ballMesh.rotationQuaternion = new B.Quaternion(); addCaster(ballMesh); ballMesh.receiveShadows = true;
const blob = RLMesh.disc('blob', scene, 1, 24, 1); const blobM = new B.StandardMaterial('blobM', scene); const dot = T.softDot(64);
blobM.diffuseTexture = rawTex(dot, dot.data, true, false); blobM.diffuseTexture.hasAlpha = true; blobM.useAlphaFromDiffuseTexture = true; blobM.diffuseColor = B.Color3.Black(); blobM.specularColor = B.Color3.Black(); blobM.emissiveColor = B.Color3.Black(); blobM.disableLighting = true; blobM.alpha = 0.55; blob.material = blobM;
M.steelHub = pbr('steelHub', TX.steelHubT, { wrap: false }); M.steelHub.backFaceCulling = false; M.hub.backFaceCulling = false;
M.tireBlack = pbr('tireBlack', TX.tireBlackT);

// ---------- arena: rebuilt whenever the team size (and so the arena scale) changes ----------
let world = null, floods = [], arenaMade = [], arenaScale = 0, lightsReady = false;
TX.fields = { '1.000': TX.field };
const hulkMat = carMat('hulk', TX.hulk);
let skidT = 0, skidPlane = null, skidTex = null, skidCtx = null, SKW = 84, FZ = 89, SKH = 1088, skidDirty = 0, skidFade = 0, lastSkid = [];
const skidMat = new B.StandardMaterial('skidM', scene); skidMat.useAlphaFromDiffuseTexture = true; skidMat.diffuseColor = new B.Color3(1, 1, 1); skidMat.specularColor = B.Color3.Black(); skidMat.disableLighting = true; skidMat.emissiveColor = B.Color3.Black(); skidMat.zOffset = -2;
function buildSkid() {
  if (skidPlane) { skidPlane.dispose(); skidTex.dispose(); }
  SKW = 2 * (S.A.HX + 4); FZ = S.A.HZ + 12; SKH = Math.round(512 * 2 * FZ / SKW);
  skidPlane = B.MeshBuilder.CreateGround('skid', { width: SKW, height: 2 * FZ }, scene); skidPlane.position.y = 0.012; skidPlane.isPickable = false;
  skidTex = new B.DynamicTexture('skidTex', { width: 512, height: SKH }, scene, true); skidTex.hasAlpha = true; skidCtx = skidTex.getContext();
  skidMat.diffuseTexture = skidTex; skidPlane.material = skidMat; skidCtx.clearRect(0, 0, 512, SKH); skidTex.update();
}
function skidPoint(ci, wi, p, a) {
  const u = (p.x + SKW / 2) / SKW * 512, v = (FZ - p.z) / (2 * FZ) * SKH; const prev = lastSkid[ci] && lastSkid[ci][wi];
  if (prev && Math.hypot(prev[0] - u, prev[1] - v) < 30) { skidCtx.strokeStyle = `rgba(40,26,14,${(a * 0.5).toFixed(3)})`; skidCtx.lineWidth = 3.2; skidCtx.lineCap = 'round'; skidCtx.beginPath(); skidCtx.moveTo(prev[0], prev[1]); skidCtx.lineTo(u, v); skidCtx.stroke(); skidDirty = 1; }
  if (lastSkid[ci]) lastSkid[ci][wi] = [u, v];
}
async function buildArena(n) {
  const sc = S.teamScale(n); S.setArenaScale(sc); if (world && Math.abs(arenaScale - sc) < 1e-6) return false; arenaScale = sc;
  if (world) { arenaMade.forEach(m => { if (!m.isDisposed()) m.dispose(); }); floods.forEach(l => l.dispose()); pruneCasters(); }
  const key = sc.toFixed(3); if (!TX.fields[key]) { TX.fields[key] = await Pool.run('fieldMacro', [rs(640), rs(1152), sc]); S.setArenaScale(sc); }
  const fld = TX.fields[key]; const ot = M.field.albedoTexture; M.field.albedoTexture = rawTex(fld, fld.data, true, false); if (ot && ot !== M.field.albedoTexture) ot.dispose();
  grassDet.uScale = 2 * (S.A.HX + 4) / 1.7; grassDet.vScale = 2 * (S.A.HZ + 12) / 1.7;
  const before = new Set([...scene.meshes, ...scene.transformNodes]);
  world = RLWorld.build(scene, M, QP, TX);
  const A = S.A;
  [[-30, 0, -(A.HZ + 24), 0.5, 0], [-24, 1.55, -(A.HZ + 24.6), -0.2, 0.08], [-18, 0, -(A.HZ + 29), 2.4, 0], [A.HX + 34, 0, A.HZ + 7, 1.9, 0]].forEach(([x, y, z, ry, rz], i) => {
    const h = RLCar3D.buildCar(scene, Object.assign({}, M, { paint: hulkMat, tail: tailMat(), glass: M.black, wind: M.wind }), { spec: S.COUPE, com: S.COUPE.comModel, wheels: S.COUPE.wheels, K: S.COUPE.K });
    h.root.position.set(x, y + S.COUPE.comModel.y - (i === 1 ? 0 : 0.12), z); h.root.rotationQuaternion = B.Quaternion.FromEulerAngles(0, ry, rz);
    if (i !== 3) h.wheels.forEach((w, k) => { if (k % 2 === i % 2) w.mesh.setEnabled(false); });
    h.meshes.forEach(m => { m.receiveShadows = true; world.casters.push(m); }); });
  arenaMade = [...scene.meshes, ...scene.transformNodes].filter(x => !before.has(x));
  world.casters.forEach(addCaster);
  const ext = Math.max(A.HX, A.HZ) * 1.15 + 20; sun.orthoLeft = -ext; sun.orthoRight = ext; sun.orthoTop = ext; sun.orthoBottom = -ext;
  probe.renderList.length = 0; [world.sky, world.hills, world.walls].forEach(m => probe.renderList.push(m)); arenaMade.filter(m => m.getClassName && m.getClassName() === 'Mesh' && /barn|roof|gables|silo|tower|fence|field|farm/.test(m.name)).forEach(m => probe.renderList.push(m));
  // each corner tower lights its own quarter and each side tower its own half; wide cones with a soft core blend into each
  // other. (All aimed near the centre with 66-degree cones, about 28% of the pitch got under a quarter of the median light.)
  floods = world.towerSpots.map(([x, z], i) => { const pos = new B.Vector3(x * 0.98, world.towerH + 1.6, z * 0.98); const side = Math.abs(z) < 1;
    const tgt = side ? new B.Vector3(x * 0.2, 0, 0) : new B.Vector3(x * 0.25, 0, z * 0.5);
    const l = new B.SpotLight('flood' + i, pos, tgt.subtract(pos).normalize(), 2.0, 1, scene); l.innerAngle = 1.1; l.diffuse = new B.Color3(1, 0.88, 0.7); l.specular = new B.Color3(1, 0.9, 0.75); l.range = 300; l.intensity = 0; l.setEnabled(false); return l; });
  for (const m of scene.materials) if (m instanceof B.PBRMaterial) m.maxSimultaneousLights = 8;
  buildSkid();
  if (lightsReady) { applyFlood(); scene.environmentTexture = null; probe.cubeTexture.resetRefreshCounter(); probe.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE; waitProbe(); }
  return true;
}
// paint per car type and team (team mates share a colour)
const paintMats = {};
const CAR_LO = 384, AFF = { coupe: 0, van: 1, buggy: 2 };
function swapPaint(m, t) { const old = [m.albedoTexture, m.bumpTexture, m.metallicTexture];
  const a = rawTex(t, t.albedo, true, false), n = rawTex(t, t.normal, false, false), o = rawTex(t, t.orm, false, false); n.level = 0.9;
  for (const x of [m, m.dbl]) { x.albedoTexture = a; x.bumpTexture = n; x.metallicTexture = o; } old.forEach(x => x && x.dispose()); }
// paint for each car type and team: a quick low-res coat first so nothing waits, the full-resolution one swapped in from a worker
async function paintMat(type, team) {
  const key = type + team, hex = (MP.inMatch && MP.colors) ? MP.colors[team] : PAINTS[team === 0 ? profile.paint : botPaintKey][0]; let m = paintMats[key];
  if (m && m.hex === hex) return m;
  const hiKey = type + hex + CAR_RES; const hi = paintCache.get(hiKey);
  const t = hi || TX['lo:' + type + hex] || await Pool.run('carAtlas', [CAR_LO, hex, false, type], AFF[type]);
  if (!m) { m = paintMats[key] = carMat('paint' + key, t); m.dbl = m.clone('paintD' + key); m.dbl.backFaceCulling = false; } else swapPaint(m, t);
  m.hex = hex;
  if (!hi) laterHi(() => Promise.resolve(Pool.run('carAtlas', [CAR_RES, hex, false, type], AFF[type])).then(full => { paintCache.set(hiKey, full); if (paintCache.size > 8) paintCache.delete(paintCache.keys().next().value); if (m.hex === hex) swapPaint(m, full); }).catch(e => console.warn('paint', e)));
  return m;
}
const paintCache = new Map();
// full-resolution paint jobs wait until any setup in progress is finished, so they never hold up the quick coats
const hiJobs = []; let holdHi = 0;
function laterHi(job) { hiJobs.push(job); flushHi(); }
function flushHi() { if (holdHi > 0) return; if (!Pool.n && state !== 'menu') { setTimeout(flushHi, 2000); return; } while (hiJobs.length) hiJobs.shift()(); }
// ---------- match setup: sim, bots, car models ----------
const ALL_CARS = ['coupe', 'van', 'buggy'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffled = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// 2v2: two different cars; 3v3: one of each; 4v4: one of each plus a random extra. 'first' is the human's car if on this team.
function teamCars(n, first) {
  let list = first ? [first] : [];
  if (n === 1) return first ? list : [pick(ALL_CARS)];
  if (n === 2) return first ? [first, pick(ALL_CARS.filter(t => t !== first))] : shuffled(ALL_CARS).slice(0, 2);
  list.push(...shuffled(ALL_CARS.filter(t => !list.includes(t)))); if (n === 4) list.push(pick(ALL_CARS));
  return first ? [first, ...shuffled(list.slice(1))] : shuffled(list);
}
// the car suggests the role: vans defend, buggies strike, coupes make plays (duplicates fall back to all-rounder)
function stylesFor(cars) { if (cars.length === 1) return ['allrounder']; const seen = {}; return cars.map(c => { const dup = seen[c]; seen[c] = 1; if (dup) return 'allrounder'; return c === 'van' ? 'defender' : c === 'buggy' ? 'striker' : pick(['playmaker', 'allrounder']); }); }
// team modes: each bot plays at the chosen level 70% of the time, otherwise one level either side
const LEVEL_ORDER = ['easy', 'normal', 'hard', 'legend'];
function assignLevels() {
  const base = LEVEL_ORDER.indexOf(matchDifficulty);
  bots.forEach(b => { if (!b) return; let k = base;
    if (sim.teamSize > 1 && Math.random() >= 0.7) { const opts = [base - 1, base + 1].filter(x => x >= 0 && x < LEVEL_ORDER.length); k = pick(opts); }
    b.setLevel(LEVEL_ORDER[k]); });
}
const TEAM_STYLES = { mates: ['defender', 'striker', 'playmaker'], rivals: { 1: ['allrounder'], 2: ['striker', 'defender'], 3: ['striker', 'defender', 'playmaker'], 4: ['striker', 'defender', 'playmaker', 'allrounder'] } };
let sim = null, bots = [], cars3d = [], dust = [], matchKey = '', setupBusy = false;
let setupChain = Promise.resolve();
function setupMatch(n, force, comp) { // one setup at a time, each with a time limit, so overlapping requests can't tangle the scene
  const run = () => Promise.race([setupMatchOnce(n, force, comp), new Promise((_, rej) => setTimeout(() => rej(new Error('Setting up the cars took too long.')), 45000))]);
  const p = setupChain.then(run, run); setupChain = p.catch(() => {}); return p;
}
async function setupMatchOnce(n, force, comp) {
  n = Math.max(1, Math.min(4, n | 0)); const key = n + profile.car + profile.paint + botPaintKey;
  if (!force && key === matchKey && sim && cars3d.length === sim.cars.length) return; matchKey = key; setupBusy = true;
  try { await setupMatchInner(n, comp); } catch (e) { matchKey = ''; console.error('setup failed, retrying', e); await setupMatchInner(n, comp); } finally { setupBusy = false; }
}
async function setupMatchInner(n, comp) {
  holdHi++; try { await setupMatchBody(n, comp); } finally { holdHi--; setTimeout(flushHi, 0); }
}
async function setupMatchBody(n, comp) {
  await buildArena(n); if (window.__mark) __mark('arena');
  let types, styles;
  if (comp) { types = comp.types; styles = comp.styles; }
  else { const t0 = teamCars(n, profile.car), t1 = teamCars(n, null); types = [...t0, ...t1]; styles = [...stylesFor(t0), ...stylesFor(t1)]; }
  sim = new S.Sim({ teamSize: n, types });
  // bots drive every car that isn't a person (on a multiplayer client nothing is simulated locally, so no bots at all)
  bots = sim.cars.map((c, i) => (i === meIdx || (comp && comp.humans[i] != null) || MP.role === 'client') ? null : new RLBot.Bot(sim, i, matchDifficulty, styles[i]));
  assignLevels();
  cars3d.forEach(v => { v.root.dispose(); (v.extra || []).forEach(e => e.dispose()); v.tailMat.dispose(); }); dust.forEach(d => d.dispose()); pruneCasters();
  cars3d = []; dust = [];
  for (const c of sim.cars) {
    const pm = await paintMat(c.spec.type, c.team);
    const v = RLCar3D.buildCar(scene, Object.assign({}, M, { paint: pm, paintDouble: pm.dbl, tail: tailMat(), pipe: M.pipe }), { spec: c.spec, com: c.spec.comModel, wheels: c.spec.wheels, K: c.spec.K });
    v.meshes.forEach(m => { addCaster(m); m.receiveShadows = true; m.getChildMeshes && m.getChildMeshes().forEach(cm => { addCaster(cm); cm.receiveShadows = true; }); });
    for (const mat of [v.tailMat]) mat.maxSimultaneousLights = 8; cars3d.push(v);
    dust.push(makePS('dust' + c.id, 500, dotTex, { c1: new B.Color4(0.52, 0.42, 0.3, 0.42), c2: new B.Color4(0.42, 0.33, 0.22, 0.32), dead: new B.Color4(0.45, 0.38, 0.3, 0), size: [0.6, 1.8], life: [0.6, 1.6], g: 0.6, d1: new B.Vector3(-1, 0.6, -1), d2: new B.Vector3(1, 1.6, 1), pow: [0.4, 1.4] }));
  }
  lastSkid = sim.cars.map(() => [null, null, null, null]);
  padRatchet = S.PAD_POS.map(() => -1);
  sim.cars.forEach(c => c.frozen = true);
  if (engs) engAssign = [0, -1, -1, -1];
}
const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const LIGHTS = {
  sunset: { sky: 'sunset', skyDir: SUN, dir: LIGHT, sun: [1, 0.70, 0.44], sunI: 3.4, hs: [0.62, 0.52, 0.72], hg: [0.32, 0.22, 0.16], hI: 0.95, fog: [0.78, 0.5, 0.42], fogD: 0.0021, exp: 1.3, sd: 0.12, flood: 0.3, lamp: 3.2, head: 1.6, clear: [0.5, 0.3, 0.3] },
  day: { sky: 'day', skyDir: nrm([-0.32, 0.62, 0.72]), dir: nrm([-0.32, 0.62, 0.72]), sun: [1, 0.95, 0.86], sunI: 3.0, hs: [0.55, 0.65, 0.88], hg: [0.36, 0.31, 0.22], hI: 1.05, fog: [0.70, 0.78, 0.88], fogD: 0.0015, exp: 1.0, sd: 0.28, flood: 0, lamp: 0.5, head: 0.4, clear: [0.6, 0.7, 0.85] },
  overcast: { sky: 'overcast', skyDir: nrm([-0.25, 0.8, 0.5]), dir: nrm([-0.25, 0.8, 0.5]), sun: [0.86, 0.88, 0.92], sunI: 1.1, hs: [0.72, 0.74, 0.8], hg: [0.32, 0.3, 0.27], hI: 1.5, fog: [0.58, 0.6, 0.63], fogD: 0.0042, exp: 1.18, sd: 0.62, flood: 0.45, lamp: 2.2, head: 1.0, clear: [0.55, 0.56, 0.58] },
  night: { sky: 'night', skyDir: nrm([0.45, 0.42, -0.79]), dir: nrm([0.45, 0.42, -0.79]), sun: [0.55, 0.65, 0.95], sunI: 0.45, hs: [0.16, 0.19, 0.32], hg: [0.06, 0.05, 0.05], hI: 0.6, fog: [0.035, 0.045, 0.08], fogD: 0.003, exp: 1.75, sd: 0.3, flood: 1, lamp: 5, head: 2.8, clear: [0.02, 0.03, 0.06] },
};
TX.skies = {};
function applyFlood() {
  const L = LIGHTS[settings.lighting] || LIGHTS.sunset; const f = settings.flood === 'off' ? 0 : settings.flood === 'on' ? Math.max(L.flood, 0.8) : L.flood;
  floods.forEach(l => { l.intensity = 2700 * arenaScale * arenaScale * f; l.setEnabled(f > 0); }); // brighter for bigger pitches: same light on the grass M.lamp.emissiveIntensity = f > 0 ? Math.max(L.lamp, 2.5 * f + 1) : 0.35;
}
async function applyLighting(initial) {
  const key = settings.lighting in LIGHTS ? settings.lighting : 'sunset', L = LIGHTS[key];
  if (!TX.skies[key]) TX.skies[key] = window.RL_SKY && RL_SKY[key] ? { url: RL_SKY[key] } : await Pool.run('sky', [1024, 512, L.skyDir, L.sky]);
  const sk = TX.skies[key]; const old = M.sky.emissiveTexture; M.sky.emissiveTexture = sk.url ? new B.Texture(sk.url, scene, false, false, B.Texture.TRILINEAR_SAMPLINGMODE) : rawTex(sk, sk.data, true, false); M.sky.emissiveTexture.wrapV = B.Texture.CLAMP_ADDRESSMODE; M.sky.emissiveTexture.wrapU = B.Texture.WRAP_ADDRESSMODE; if (old) old.dispose();
  sun.direction = new B.Vector3(-L.dir[0], -L.dir[1], -L.dir[2]); sun.position = new B.Vector3(L.dir[0] * 150, L.dir[1] * 150, L.dir[2] * 150);
  sun.diffuse = new B.Color3(...L.sun); sun.specular = new B.Color3(...L.sun); sun.intensity = L.sunI;
  hemi.diffuse = new B.Color3(...L.hs); hemi.groundColor = new B.Color3(...L.hg); hemi.intensity = L.hI;
  scene.fogColor = new B.Color3(...L.fog); scene.fogDensity = L.fogD; scene.clearColor = new B.Color4(...L.clear, 1);
  pipe.imageProcessing.exposure = L.exp * (settings.brightness || 1); sg.darkness = L.sd; M.head.emissiveIntensity = L.head;
  applyFlood();
  if (!initial) { scene.environmentTexture = null; probe.cubeTexture.resetRefreshCounter(); probe.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE; await waitProbe(); }
}
// only hand the reflection cube to the materials once it has actually been rendered (otherwise it samples itself)
async function waitProbeDone() { for (let k = 0; k < 600 && !scene.environmentTexture; k++) await new Promise(r => requestAnimationFrame(r)); }
async function waitProbe() {
  const raf = () => new Promise(r => requestAnimationFrame(r)); const r = probe.cubeTexture._objectRenderer || probe.cubeTexture;
  for (let k = 0; k < 600; k++) { await raf(); const id = r._currentRefreshId; if (id !== undefined && id !== -1) { await raf(); scene.environmentTexture = probe.cubeTexture; return; } }
}


const camera = new B.UniversalCamera('cam', new B.Vector3(0, 9, -48), scene); camera.fov = 1.15; camera.minZ = 0.15; camera.maxZ = 2400; camera.inputs.clear();
const pipe = new B.DefaultRenderingPipeline('post', true, scene, [camera]);
pipe.samples = 1; pipe.fxaaEnabled = QP.aa;
pipe.bloomEnabled = QP.bloom && settings.bloom !== false; pipe.bloomThreshold = 0.82; pipe.bloomWeight = 0.42; pipe.bloomKernel = 72; pipe.bloomScale = 0.5;
pipe.imageProcessingEnabled = true; const ip = pipe.imageProcessing; ip.toneMappingEnabled = true; ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES; ip.exposure = 1.3; ip.contrast = 1.18;
ip.vignetteEnabled = true; ip.vignetteWeight = 2.0; ip.vignetteColor = new B.Color4(0.15, 0.03, 0.05, 0); ip.vignetteCameraFov = 0.6;
pipe.grainEnabled = settings.quality !== 'low'; pipe.grain.intensity = 7; pipe.grain.animated = true;
pipe.chromaticAberrationEnabled = false;
pipe.sharpenEnabled = settings.quality !== 'low'; pipe.sharpen.edgeAmount = 0.22;

// ---------- particles ----------
const dotTex = rawTex(dot, dot.data, true, false); const chipT = T.chip(32); const chipTex = rawTex(chipT, chipT.data, true, false);
function makePS(name, cap, tex, o) {
  const ps = new B.ParticleSystem(name, cap, scene); ps.particleTexture = tex; ps.emitter = new B.Vector3(0, -50, 0); ps.minEmitBox = new B.Vector3(-0.3, 0, -0.3); ps.maxEmitBox = new B.Vector3(0.3, 0.1, 0.3);
  ps.color1 = o.c1; ps.color2 = o.c2; ps.colorDead = o.dead; ps.minSize = o.size[0]; ps.maxSize = o.size[1]; ps.minLifeTime = o.life[0]; ps.maxLifeTime = o.life[1];
  ps.emitRate = 0; ps.gravity = new B.Vector3(0, o.g, 0); ps.direction1 = o.d1; ps.direction2 = o.d2; ps.minEmitPower = o.pow[0]; ps.maxEmitPower = o.pow[1];
  ps.blendMode = B.ParticleSystem.BLENDMODE_STANDARD; ps.minAngularSpeed = -3; ps.maxAngularSpeed = 3; ps.updateSpeed = 1 / 60; ps.start(); return ps;
}
const burst = makePS('burst', 900, chipTex, { c1: new B.Color4(0.85, 0.7, 0.38, 1), c2: new B.Color4(0.55, 0.24, 0.08, 1), dead: new B.Color4(0.4, 0.2, 0.08, 0), size: [0.12, 0.42], life: [1.2, 2.6], g: -9, d1: new B.Vector3(-1, 0.4, -1), d2: new B.Vector3(1, 1.4, 1), pow: [6, 22] });
const puff = makePS('puff', 500, dotTex, { c1: new B.Color4(0.6, 0.5, 0.38, 0.5), c2: new B.Color4(0.5, 0.42, 0.32, 0.4), dead: new B.Color4(0.5, 0.45, 0.4, 0), size: [1.2, 3.2], life: [0.8, 2.0], g: 0.5, d1: new B.Vector3(-1, 0.2, -1), d2: new B.Vector3(1, 1, 1), pow: [2, 6] });
function emitAt(ps, p, n, box = 0.5) { ps.emitter = new B.Vector3(p.x, p.y, p.z); ps.minEmitBox = new B.Vector3(-box, 0, -box); ps.maxEmitBox = new B.Vector3(box, box * 0.5, box); ps.manualEmitCount = (ps.manualEmitCount > 0 ? ps.manualEmitCount : 0) + n; }

// ---------- UI helpers ----------
const rustURL = T.uiRust(640, 220), rustURL2 = T.uiRust(320, 40);
document.documentElement.style.setProperty('--rustimg', `url(${rustURL})`); document.documentElement.style.setProperty('--rustimg2', `url(${rustURL2})`);
// menu emblem: the bolted rust plate, carrying a slanted frame with a ball and a muscle car (after the brand sketch)
function emblemSVG(rust) {
  const D = '#1a1110', bolts = Array.from({ length: 24 }, (_, k) => { const a = k / 24 * Math.PI * 2; return `<circle cx="${(100 + Math.cos(a) * 92).toFixed(1)}" cy="${(100 + Math.sin(a) * 92).toFixed(1)}" r="3" fill="#3a1d10"/>`; }).join('');
  const frame = '54,72 176,72 146,128 24,128';
  // ball: line art like the sketch, rust seams on a dark ball: centre panel, seams to the five neighbours, their outlines at the rim
  const bc = [60, 100], br = 17.5, R = 'url(#rp)', pent = (cx, cy, r, rot) => Array.from({ length: 5 }, (_, k) => { const a = rot + k * Math.PI * 2 / 5; return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`; }).join(' ');
  const at = (r, a) => [bc[0] + Math.cos(a) * r, bc[1] + Math.sin(a) * r].map(v => v.toFixed(2));
  let ball = `<circle cx="${bc[0]}" cy="${bc[1]}" r="${br}" fill="#130c0a"/><g clip-path="url(#ballClip)" fill="none" stroke="${R}" stroke-width="2" stroke-linejoin="round"><polygon points="${pent(bc[0], bc[1], 6.6, -Math.PI / 2)}"/>`;
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5, b = a + Math.PI / 5, p0 = at(6.6, a), p1 = at(11.6, a), c = at(17.6, b).map(Number);
    ball += `<line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}"/><polygon points="${pent(c[0], c[1], 6.4, b + Math.PI)}"/>`; }
  ball += `</g><circle cx="${bc[0]}" cy="${bc[1]}" r="${br}" fill="none" stroke="${R}" stroke-width="3"/>`;
  // car, facing the ball: long bonnet, fastback, big near front wheel
  const body = 'M2,33 L1,27 L4,21 C14,18 30,17 41,15 L53,6 C60,4.5 68,4.5 72,5 C80,8 88,13 96,17 L99,21 L100,30 L97,33 L92,33 A10,10 0 0 0 72,33 L35,34.5 A11.5,11.5 0 0 0 12,34.5 Z';
  const car = `<g transform="translate(81 77.5) scale(0.82)">
    <path d="M100,31 L124,35 M95,37 L122,43 M101,26 L126,27" stroke="url(#rp)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="${body}" fill="url(#rp)" stroke="${D}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M44,15 L54,7.5 C60,6.5 66,6.5 70,7 L78,13 L74,15 Z" fill="${D}"/><path d="M62,6.8 L60.5,15.2" stroke="url(#rp)" stroke-width="1.6"/>
    <path d="M8,20.6 C18,18.6 30,17.6 39,16.4 M14,27 L95,24 M58,16 L58,31" fill="none" stroke="${D}" stroke-width="1.1"/>
    <rect x="1.2" y="26.6" width="3.2" height="4.6" fill="${D}"/>
    <circle cx="5.6" cy="24.4" r="2.5" fill="${D}"/><circle cx="5.6" cy="24.4" r="1.2" fill="url(#rp)"/><circle cx="11.2" cy="24" r="2.3" fill="${D}"/><circle cx="11.2" cy="24" r="1.1" fill="url(#rp)"/>
    <circle cx="23.5" cy="37.5" r="10.5" fill="${D}" stroke="url(#rp)" stroke-width="2.4"/><circle cx="23.5" cy="37.5" r="4" fill="url(#rp)"/>
    <circle cx="82" cy="35.5" r="9" fill="${D}" stroke="url(#rp)" stroke-width="2.2"/><circle cx="82" cy="35.5" r="3.4" fill="url(#rp)"/></g>`;
  return `<svg class="emblem" viewBox="0 0 200 200" aria-hidden="true"><defs><pattern id="rp" patternUnits="userSpaceOnUse" width="200" height="70"><image href="${rust}" width="200" height="70" preserveAspectRatio="none"/></pattern>
    <clipPath id="ballClip"><circle cx="${bc[0]}" cy="${bc[1]}" r="${br}"/></clipPath><clipPath id="frameClip"><polygon points="${frame}"/></clipPath></defs>
    <circle cx="100" cy="100" r="92" fill="${D}" stroke="url(#rp)" stroke-width="12"/>${bolts}<circle cx="100" cy="100" r="84" fill="none" stroke="#2c1a12" stroke-width="1.5"/>
    <polygon points="${frame}" fill="#130c0a"/><g clip-path="url(#frameClip)">${ball}${car}</g>
    <polygon points="${frame}" fill="none" stroke="url(#rp)" stroke-width="5.5" stroke-linejoin="miter"/></svg>`;
}
$('emblemSlot').innerHTML = emblemSVG(rustURL);

const show = (id, on) => $(id).classList.toggle('hidden', !on);
function refreshProfile() {
  const lvl = 1 + Math.floor(profile.xp / 600); $('pbName').textContent = profile.name || 'Driver'; $('pbLvl').textContent = lvl; $('pbXp').style.width = ((profile.xp % 600) / 6) + '%';
  $('pbRecord').textContent = `${profile.wins} won, ${profile.losses} lost${profile.draws ? `, ${profile.draws} drawn` : ''}`;
}
function syncSegs() {
  document.querySelectorAll('.seg').forEach(sgm => { const k = sgm.dataset.key; sgm.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[k]) === b.dataset.v)); });
  $('teamNote').textContent = (settings.teamSize || 1) > 1 ? `You plus ${(settings.teamSize || 1) - 1} bot team-mate${(settings.teamSize || 1) > 2 ? 's' : ''} against ${settings.teamSize} bots.` : '';
  $('volIn').value = settings.volume; $('briIn').value = settings.brightness || 1;
}
document.querySelectorAll('.seg').forEach(sgm => sgm.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const k = sgm.dataset.key; let v = b.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
  if (k === 'teamSize') v = +v; const old = settings[k]; settings[k] = v; saveSettings(); syncSegs(); AU.click();
  if (k === 'quality' && v !== old) show('qNote', true); if (k === 'difficulty') { if (sim) assignLevels(); updateHudNames(); } if (k === 'teamSize') { settings.teamSize = +v; saveSettings(); if (state === 'menu') rebuildForMenu(); }
  if (k === 'lighting' && v !== old) { $('lightNote').textContent = 'Changing the weather…'; applyLighting(false).then(() => { $('lightNote').textContent = ''; }); }
  if (k === 'flood') applyFlood(); if (k === 'skids' && !v && skidCtx) { skidCtx.clearRect(0, 0, 512, SKH); skidTex.update(); } if (k === 'touchControls' || k === 'touchLayout') buildTouch(); if (k === 'shadows') sun.shadowEnabled = v; if (k === 'bloom') pipe.bloomEnabled = QP.bloom && v;
}));
$('reloadBtn').onclick = () => location.reload();
$('volIn').oninput = e => { settings.volume = +e.target.value; AU.setVolume(settings.volume); saveSettings(); };
$('briIn').oninput = e => { settings.brightness = +e.target.value; pipe.imageProcessing.exposure = (LIGHTS[settings.lighting] || LIGHTS.sunset).exp * settings.brightness; saveSettings(); };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
function setTab(t) { AU.click(); document.querySelectorAll('.tabs button').forEach(x => { x.classList.toggle('on', x.dataset.tab === t); x.setAttribute('aria-selected', x.dataset.tab === t); }); document.querySelectorAll('.pane').forEach(x => x.classList.toggle('hidden', x.dataset.pane !== t)); }
const sw = $('swatches'); Object.entries(PAINTS).forEach(([k, [hex, name]]) => { const b = document.createElement('button'); b.className = 'sw'; b.style.background = hex; b.title = name; b.setAttribute('aria-label', name); b.dataset.k = k; sw.appendChild(b); });
function syncSwatches() { sw.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.k === profile.paint)); $('paintNote').textContent = PAINTS[profile.paint][1]; }
sw.addEventListener('click', async e => {
  const b = e.target.closest('.sw'); if (!b || b.dataset.k === profile.paint) return; AU.click(); profile.paint = b.dataset.k; saveProfile(); syncSwatches(); $('paintNote').textContent = 'Respraying…';
  if (botPaintKey === profile.paint) { botPaintKey = botPaint(); await setGoalColor(1, PAINTS[botPaintKey][0]); }
  await setGoalColor(0, PAINTS[profile.paint][0]); await setupMatch(settings.teamSize || 1, true); sim.resetKickoff(0); syncCars();
  syncSwatches(); updateHudNames();
});
const CAR_INFO = { coupe: ['Coupe', "'77 land yacht. Does a bit of everything.", { Speed: 3, Accel: 3, Handling: 3, Weight: 3, Reach: 3 }],
  van: ['Van', 'Slow and tall, but a rolling wall that hits the ball hard.', { Speed: 2, Accel: 2, Handling: 2, Weight: 5, Reach: 5 }],
  buggy: ['Buggy', 'Light, quick and nimble. Low and small to hit with.', { Speed: 5, Accel: 5, Handling: 5, Weight: 1, Reach: 2 }] };
$('carPick').innerHTML = Object.entries(CAR_INFO).map(([k, [n, d, st]]) => `<button class="carc" data-car="${k}" aria-label="${n}"><span class="thumb"><img id="thumb-${k}" alt=""></span><b>${n}</b><span class="st">${Object.entries(st).map(([a, v]) => `<span>${a}</span><i style="width:${v * 20}%"></i>`).join('')}</span></button>`).join('');
let thumbCapture = false;
function syncCars() { for (const t of ALL_CARS) { const img = $('thumb-' + t), u = window.RL_THUMBS && RL_THUMBS[t] && RL_THUMBS[t][profile.paint]; if (img && u && img.src !== u) img.src = u; } $('carPick').querySelectorAll('.carc').forEach(b => b.classList.toggle('on', b.dataset.car === profile.car)); }
$('carPick').addEventListener('click', async e => { const b = e.target.closest('.carc'); if (!b || b.dataset.car === profile.car) return; AU.click(); profile.car = b.dataset.car; saveProfile(); syncCars(); await rebuildForMenu(); });
$('nameIn').addEventListener('input', e => { profile.name = e.target.value.trim().slice(0, 16) || 'Driver'; saveProfile(); refreshProfile(); updateHudNames(); });

// ---------- game state ----------
let meIdx = 0, matchMode = settings.mode, matchDifficulty = settings.difficulty;
let state = 'menu', menuPanel = null, panelFrom = 'menu', paused = false, acc = 0, timeScale = 1, ballcam = !!settings.ballcam, shake = 0, kickVariant = 0, stateT = 0, goalInfo = null, hintT = 0;
const match = { score: [0, 0], time: 300, overtime: false, elapsed: 0, stats: [{ hits: 0, pads: 0, top: 0 }, { hits: 0, pads: 0, top: 0 }] };
let rebuilding = false;
async function rebuildForMenu() { if (rebuilding) return; rebuilding = true; $('loadMsg').textContent = 'Reshaping the arena'; show('loading', true); await tick(); try { await setupMatch(settings.teamSize || 1); sim.resetKickoff(0); } catch (e) { toast('Could not rebuild the arena: ' + e.message); } finally { show('loading', false); rebuilding = false; } }
async function setGoalColor(i, hex) { const t = await T.plastic(256, weathered(hex)); const m = i ? M.plastic1 : M.plastic0; const o = m.albedoTexture; m.albedoTexture = rawTex(t, t.albedo); if (o) o.dispose(); }
function updateHudNames() { const n = sim ? sim.teamSize : 1;
  if (mpActive() && MP.colors) { $('name0').textContent = colorName(MP.colors[0]); $('name1').textContent = colorName(MP.colors[1]); $('chip0').style.background = MP.colors[0]; $('chip1').style.background = MP.colors[1];
    document.querySelector('.team.l').style.boxShadow = `inset 0 -4px 0 ${MP.colors[0]}`; document.querySelector('.team.r').style.boxShadow = `inset 0 -4px 0 ${MP.colors[1]}`; return; } $('name0').textContent = n > 1 ? `${profile.name} + ${n - 1}` : profile.name; $('name1').textContent = RLBot.LEVELS[settings.difficulty].name + (n > 1 ? ' bots' : ' bot'); $('chip0').style.background = PAINTS[profile.paint][0]; $('chip1').style.background = PAINTS[botPaintKey][0];
  document.querySelector('.team.l').style.boxShadow = `inset 0 -4px 0 ${vivid(PAINTS[profile.paint][0])}`; document.querySelector('.team.r').style.boxShadow = `inset 0 -4px 0 ${vivid(PAINTS[botPaintKey][0])}`; }
$('name1').textContent = 'Bot';
function setPanel(p, from = 'menu') {
  menuPanel = p; panelFrom = from; show('panels', !!p); show('panelPlay', p === 'play'); show('panelGarage', p === 'garage'); show('panelSettings', p === 'settings'); show('panelLan', p === 'lan');
  $('mainnav').classList.toggle('hidden', !!p); show('promo', !p && state === 'menu'); document.querySelector('#menu .brand').style.opacity = p ? 0.12 : 1;
  document.querySelectorAll('.backlbl').forEach(e => e.textContent = from === 'pause' ? 'Back to pause' : 'Main menu');
  if (p === 'garage') { $('nameIn').value = profile.name; syncSwatches(); syncCars(); }
  if (p === 'lan') { setLanSel(null); $('lanList').innerHTML = '<div class="note">Looking…</div>'; refreshLan(); clearInterval(lanT); lanT = setInterval(refreshLan, 3000); } // live list however the screen was opened syncSegs();
  const f = { play: 'kickoffBtn', garage: 'nameIn' }[p]; setTimeout(() => { if (f) $(f).focus(); else if (p) document.querySelector('#panel' + p[0].toUpperCase() + p.slice(1) + ' .backbtn').focus(); else if (state === 'menu') $('mainnav').querySelector('.slab.sel')?.focus(); }, 30);
}
function closePanel() { AU.click(); const from = panelFrom; setPanel(null); if (from === 'pause') { show('pause', true); setTimeout(() => $('resumeBtn').focus(), 30); } }
function toMenu() {
  state = 'menu'; paused = false; show('menu', true); setPanel(null); show('playerbar', true); show('hud', false); show('pause', false); show('end', false); refreshProfile();
  if (sim) { sim.resetKickoff(0); sim.cars.forEach(c => c.frozen = true); } AU.silenceEngines(); ballMesh.setEnabled(true); timeScale = 1;
}
async function startMatch(comp) {
  paused = false; show('pause', false); show('end', false); AU.silenceEngines();
  AU.init(); AU.setVolume(settings.volume); ensureEngines();
  if (comp && !Array.isArray(comp.types)) comp = undefined; // only a real multiplayer line-up counts (never a click event)
  if (!comp) { matchMode = settings.mode; matchDifficulty = settings.difficulty; meIdx = 0; }
  $('loadMsg').textContent = 'Setting out the cars'; show('loading', true); await tick();
  try { await setupMatch(comp ? comp.n : (settings.teamSize || 1), true, comp); } // fresh line-up every match
  catch (e) { console.error(e); show('loading', false); toast('Could not set up the match: ' + e.message + ' Try again.'); if (MP.role) leaveMP(); else toMenu(); return; }
  show('loading', false);
  if (MP.role !== 'client') assignLevels();
  const mp = mpActive(); $('rematchBtn').classList.toggle('hidden', mp); $('restartBtn').classList.toggle('hidden', mp); $('pauseSetBtn').classList.toggle('hidden', mp); $('leaveMpBtn').classList.toggle('hidden', !mp); $('toLobbyBtn').classList.toggle('hidden', MP.role !== 'host'); match.score = [0, 0]; match.time = matchMode === 'timed' ? 300 : 0; match.overtime = false; match.elapsed = 0; match.stats = [{ hits: 0, pads: 0, top: 0 }, { hits: 0, pads: 0, top: 0 }];
  setPanel(null); show('menu', false); show('playerbar', false); show('hud', true); show('end', false); show('pause', false); updateHudNames(); updateScore(); hintT = 9; show('hint', true); $('camtag').textContent = ballcam ? 'Ball cam' : 'Car cam';
  skidCtx.clearRect(0, 0, 512, SKH); skidTex.update(); kickVariant = 0;
  if (MP.role === 'client') { state = 'waiting'; stateT = 0; ballMesh.setEnabled(true); camState.init = false; MP.net.send({ t: 'ready' }); } // tell the host we're loaded
  else if (MP.role === 'host' && MP.inMatch) { kickoff(); state = 'waiting'; stateT = 0; waitForPlayers().then(() => { if (MP.inMatch && state === 'waiting') { state = 'countdown'; stateT = 0; } }); }
  else kickoff();
  canvas.focus();
}
function kickoff() {
  sim.resetKickoff(kickVariant++); sim.passInfos = {}; sim.cars.forEach(c => c.frozen = true); bots.forEach(b => b && b.onKickoff()); state = 'countdown'; stateT = 0; timeScale = 1; ballMesh.setEnabled(true); lastSkid.forEach(a => a.fill(null));
  camState.init = false;
}
function toast(t, ms = 6000) { const el = $('touchNote'); el.textContent = t; show('touchNote', true); clearTimeout(toast.t); toast.t = setTimeout(() => show('touchNote', false), ms); }
function banner(html, ms) { const b = $('banner'); b.innerHTML = html; b.classList.remove('hidden', 'pop'); void b.offsetWidth; b.classList.add('pop'); clearTimeout(banner.t); if (ms) banner.t = setTimeout(() => b.classList.add('hidden'), ms); }
function fmt(t) { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }
function updateScore() { $('s0').textContent = match.score[0]; $('s1').textContent = match.score[1]; }
function endMatch(fromFx) {
  if (MP.role === 'host' && MP.inMatch && !fromFx) { fx('end', [...match.score], match.stats); return; }
  state = 'end'; AU.silenceEngines(); const myT = sim ? sim.cars[meIdx].team : 0; const a = match.score[myT], b = match.score[1 - myT]; const won = a > b, drew = a === b;
  if (won) profile.wins++; else if (drew) profile.draws++; else profile.losses++;
  const xp = 120 + a * 30 + (won ? 180 : 0); profile.xp += xp; saveProfile();
  $('endTitle').textContent = won ? (mpActive() ? 'Your team won' : 'You won') : drew ? 'Dead heat' : (mpActive() ? `${colorName(MP.colors[1 - myT])} team wins` : 'Bot wins');
  $('endSub').textContent = mpActive() ? `${a}–${b}. You earned ${xp} XP.${MP.role === 'client' ? ' The host will take everyone back to the lobby.' : ''}` : `${a}–${b} against the ${RLBot.LEVELS[settings.difficulty].name.toLowerCase()} bot. You earned ${xp} XP.`;
  const st = match.stats; $('endStats').innerHTML = `<span class="h"></span><span class="h">${sim.teamSize > 1 ? 'Your team' : 'You'}</span><span class="h">${sim.teamSize > 1 ? 'Bots' : 'Bot'}</span><span>Ball touches</span><span>${st[0].hits}</span><span>${st[1].hits}</span><span>Pad launches</span><span>${st[0].pads}</span><span>${st[1].pads}</span><span>Top speed</span><span>${Math.round(st[0].top * 2.237)} mph</span><span>${Math.round(st[1].top * 2.237)} mph</span>`;
  show('end', true); setTimeout(() => $('rematchBtn').focus(), 50);
}
function setPause(on) { if (!['countdown', 'play', 'goal'].includes(state)) return; if (mpActive()) { show('pause', on); if (on) setTimeout(() => $('resumeBtn').focus(), 30); else canvas.focus(); return; } paused = on; show('pause', on); if (!on && menuPanel) setPanel(null); if (on) { AU.silenceEngines(); setTimeout(() => $('resumeBtn').focus(), 30); } else canvas.focus(); }

// menu wiring
$('mainnav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; AU.init(); AU.setVolume(settings.volume); AU.click(); const a = b.dataset.act;
  if (a === 'lan') { setPanel('lan'); lanMsg(''); $('codeIn').value = ''; return; }
  if (a === 'quit') { show('menu', false); show('playerbar', false); show('quit', true); setTimeout(() => $('unquitBtn').focus(), 30); } else setPanel(a); });
$('mainnav').addEventListener('mouseover', e => { const b = e.target.closest('.slab'); if (!b) return; $('mainnav').querySelectorAll('.slab').forEach(x => x.classList.toggle('sel', x === b)); });
document.querySelectorAll('[data-back]').forEach(b => b.onclick = closePanel);
$('pauseSetBtn').onclick = () => { AU.click(); show('pause', false); setPanel('settings', 'pause'); };
$('promo').onclick = () => { AU.init(); setPanel('play'); }; $('promo').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') setPanel('play'); };
$('kickoffBtn').onclick = () => startMatch(); $('rematchBtn').onclick = () => startMatch(); $('endMenuBtn').onclick = toMenu;
$('resumeBtn').onclick = () => setPause(false); $('restartBtn').onclick = () => startMatch(); $('menuBtn').onclick = toMenu;
$('unquitBtn').onclick = () => { show('quit', false); toMenu(); };

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.code !== 'Escape') return;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && state !== 'menu') e.preventDefault();
  if (e.code === 'Escape' || (e.code === 'KeyP' && !menuPanel)) { e.preventDefault(); if (menuPanel) closePanel(); else if (!$('quit').classList.contains('hidden')) { show('quit', false); toMenu(); } else setPause(!paused); }
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && (state === 'menu' || paused || state === 'end') && !menuPanel) { e.preventDefault(); moveFocus(e.code === 'ArrowDown' ? 1 : -1); }
  if (e.code === 'KeyC' && state !== 'menu') setBallcam(!ballcam);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
function activeStack() { if (!$('pause').classList.contains('hidden')) return $('pause'); if (!$('end').classList.contains('hidden')) return $('end'); if (!$('quit').classList.contains('hidden')) return $('quit'); return $('mainnav'); }
function moveFocus(d) { const list = [...activeStack().querySelectorAll('button.slab')]; if (!list.length) return; let i = list.indexOf(document.activeElement); if (i < 0) i = list.findIndex(b => b.classList.contains('sel')); i = (i + d + list.length) % list.length; list.forEach(b => b.classList.toggle('sel', b === list[i])); list[i].focus(); AU.click(); }
$('mainnav').addEventListener('focusin', e => { const b = e.target.closest('.slab'); if (b) $('mainnav').querySelectorAll('.slab').forEach(x => x.classList.toggle('sel', x === b)); });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play' || state === 'countdown') setPause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && MP.role === 'client' && MP.inMatch && MP.net) MP.net.send({ t: 'i', a: [0, 0, 0] }); if (document.hidden && (state === 'play' || state === 'countdown')) setPause(true); });
let padPrev = {}, padNav = {};
function pollMenuPad() { const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g); if (!gp) return; const b = i => !!gp.buttons[i]?.pressed; const now = { up: b(12) || gp.axes[1] < -0.6, dn: b(13) || gp.axes[1] > 0.6, a: b(0), back: b(1) };
  if (now.up && !padNav.up) moveFocus(-1); if (now.dn && !padNav.dn) moveFocus(1); if (now.a && !padNav.a && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.click(); if (now.back && !padNav.back && menuPanel) closePanel(); if (b(9) && !padNav.st && paused && !menuPanel) setPause(false); now.st = b(9); padNav = now; }
function readInput() {
  let thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let st = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let hb = !!keys.Space;
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gps) { if (!gp) continue; const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0; const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.12) st = ax; if (rt > 0.05 || lt > 0.05) thr = rt - lt; if (gp.buttons[0]?.pressed || gp.buttons[1]?.pressed) hb = true;
    const yb = gp.buttons[3]?.pressed, sb = gp.buttons[9]?.pressed; if (yb && !padPrev.y && state !== 'menu') setBallcam(!ballcam); if (sb && !padPrev.s) setPause(!paused); padPrev = { y: yb, s: sb }; break; }
  if (TOUCH.thr) thr = TOUCH.thr; if (TOUCH.steer) st = TOUCH.steer; if (TOUCH.hb) hb = true;
  return { throttle: thr, steer: st, handbrake: hb };
}


// ---------- touch controls (phones and tablets) ----------
const TOUCH = { held: new Map(), thr: 0, steer: 0, hb: false };
const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
const touchOn = () => settings.touchControls === 'on' || (settings.touchControls !== 'off' && isTouchDevice());
const ICON = { l: '<svg viewBox="0 0 24 24"><path d="M15.5 3.5L7 12l8.5 8.5z"/></svg>', r: '<svg viewBox="0 0 24 24"><path d="M8.5 3.5L17 12l-8.5 8.5z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zm7 0h3v14h-3z"/></svg>' };
function buildTouch() {
  const el = $('touch'); el.innerHTML = ''; TOUCH.held.clear(); recalcTouch();
  document.body.classList.toggle('touchy', touchOn()); if (!touchOn()) return;
  const L = settings.touchLayout || 'default', u = 'var(--u)', g = 'var(--gap)', B = 'var(--bot)';
  const add = (k, html, st, cls = '') => { const b = document.createElement('div'); b.className = 'tb ' + cls; b.dataset.k = k; b.innerHTML = html; Object.assign(b.style, st); el.appendChild(b); return b; };
  const side = (right, off) => right ? { right: `calc(var(--edgeR) + ${off})` } : { left: `calc(var(--edge) + ${off})` };
  if (L === 'keys') { // keyboard-style W A S D on the left, a small handbrake square on the right
    const sq = { width: u, height: u };
    add('w', 'W', { ...sq, ...side(false, `${u} + ${g}`), bottom: `calc(${B} + ${u} + ${g})` });
    add('a', 'A', { ...sq, ...side(false, '0px'), bottom: B });
    add('s', 'S', { ...sq, ...side(false, `${u} + ${g}`), bottom: B });
    add('d', 'D', { ...sq, ...side(false, `2 * (${u} + ${g})`), bottom: B });
    add('hb', 'SPACE', { width: `calc(${u} * 0.82)`, height: `calc(${u} * 0.82)`, ...side(true, '0px'), bottom: B }, 'small');
  } else { // pedals on one side (handbrake above them), steering arrows on the other
    const pr = L !== 'inverse';
    add('gas', 'GAS', { width: `calc(${u} * 1.05)`, height: `calc(${u} * 1.85)`, ...side(pr, '0px'), bottom: B });
    add('brake', 'BRAKE', { width: `calc(${u} * 1.05)`, height: `calc(${u} * 1.25)`, ...side(pr, `${u} * 1.05 + ${g}`), bottom: B }, 'small');
    add('hb', 'HANDBRAKE', { width: `calc(${u} * 2.1 + ${g})`, height: `calc(${u} * 0.66)`, ...side(pr, '0px'), bottom: `calc(${B} + ${u} * 1.85 + ${g})` }, 'small');
    add(pr ? 'left' : 'left', ICON.l, { width: `calc(${u} * 1.2)`, height: `calc(${u} * 1.2)`, ...side(!pr, pr ? '0px' : `${u} * 1.2 + ${g}`), bottom: B });
    add('right', ICON.r, { width: `calc(${u} * 1.2)`, height: `calc(${u} * 1.2)`, ...side(!pr, pr ? `${u} * 1.2 + ${g}` : '0px'), bottom: B });
  }
  add('menu', ICON.menu, { left: 'var(--edge)' }, 'top');
  const cam = add('cam', ballcam ? 'BALL CAM' : 'CAR CAM', { right: 'var(--edgeR)' }, 'top'); cam.id = 'touchCam';
}
function recalcTouch() {
  const k = new Set(TOUCH.held.values()); const has = x => k.has(x);
  TOUCH.thr = (has('gas') || has('w') ? 1 : 0) - (has('brake') || has('s') ? 1 : 0);
  TOUCH.steer = (has('right') || has('d') ? 1 : 0) - (has('left') || has('a') ? 1 : 0); TOUCH.hb = has('hb');
  $('touch').querySelectorAll('.tb').forEach(b => b.classList.toggle('on', k.has(b.dataset.k)));
}
function setBallcam(v) { ballcam = v; settings.ballcam = v; saveSettings(); $('camtag').textContent = v ? 'Ball cam' : 'Car cam'; const t = $('touchCam'); if (t) t.textContent = v ? 'BALL CAM' : 'CAR CAM'; }
// Touch input is rebuilt from the full list of fingers on screen on every touch event, so a missed 'finger up' can never leave
// a pedal stuck: whatever isn't under a finger right now isn't pressed. Mouse/pen (for testing) uses pointer events.
{ const el = $('touch'); const keyAt = (x, y) => { const t = document.elementFromPoint(x, y); const b = t && t.closest && t.closest('#touch .tb'); return b ? b.dataset.k : null; };
  const fromTouches = list => { TOUCH.held.clear(); for (const t of list) { const k = keyAt(t.clientX, t.clientY); if (k && k !== 'menu' && k !== 'cam') TOUCH.held.set('t' + t.identifier, k); } recalcTouch(); };
  const tapActions = e => { for (const t of e.changedTouches) { const k = keyAt(t.clientX, t.clientY); if (k === 'menu') { setPause(true); return true; } if (k === 'cam') { setBallcam(!ballcam); return true; } } return false; };
  const onTouch = e => { if ($('touch').classList.contains('hidden')) return; const inside = [...e.changedTouches].some(t => keyAt(t.clientX, t.clientY));
    if (e.type === 'touchstart' && inside) { AU.init(); if (tapActions(e)) { e.preventDefault(); fromTouches([]); return; } }
    if (inside || TOUCH.held.size) e.preventDefault(); fromTouches(e.touches); };
  for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) window.addEventListener(t, onTouch, { passive: false });
  let mouseDown = null;
  el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; const k = keyAt(e.clientX, e.clientY); if (!k) return; e.preventDefault();
    if (k === 'menu') { setPause(true); return; } if (k === 'cam') { setBallcam(!ballcam); return; } mouseDown = e.pointerId; TOUCH.held.set('m', k); recalcTouch(); });
  window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch' && TOUCH.held.delete('m')) recalcTouch(); });
  el.addEventListener('contextmenu', e => e.preventDefault());
  const releaseAll = () => { if (TOUCH.held.size) { TOUCH.held.clear(); recalcTouch(); } };
  window.addEventListener('blur', releaseAll); document.addEventListener('visibilitychange', releaseAll); }
let touchShown = null;
function syncTouchVisibility() { const on = touchOn() && ['countdown', 'play', 'goal'].includes(state) && $('pause').classList.contains('hidden') && !paused;
  if (on !== touchShown) { touchShown = on; show('touch', on); } if (!on && TOUCH.held.size) { TOUCH.held.clear(); recalcTouch(); } }
function checkRotate() { const phone = isTouchDevice() && Math.min(screen.width, screen.height) < 600; show('rotate', phone && innerHeight > innerWidth); }
addEventListener('resize', checkRotate);
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', e => { if (!(e.target.closest && e.target.closest('input'))) e.preventDefault(); }, { passive: false });
let lastTap = 0; document.addEventListener('touchend', e => { const now = Date.now(); if (now - lastTap < 320 && !(e.target.closest && e.target.closest('input'))) e.preventDefault(); lastTap = now; }, { passive: false }); addEventListener('orientationchange', () => setTimeout(checkRotate, 200));
$('lobToL').onclick = () => { AU.click(); request('team', 0); }; $('lobToR').onclick = () => { AU.click(); request('team', 1); };
// first run on a device: ask for a driver name
function askName() { $('nameFirst').value = profile.name || ''; show('namePrompt', true); setTimeout(() => $('nameFirst').focus(), 50); }
$('nameGo').onclick = () => { const v = $('nameFirst').value.trim().slice(0, 16); if (!v) { $('nameErr').textContent = 'Type a name first.'; return; }
  profile.name = v; profile.named = true; saveProfile(); refreshProfile(); updateHudNames(); show('namePrompt', false); AU.init(); AU.click(); };
$('nameFirst').addEventListener('keydown', e => { if (e.key === 'Enter') $('nameGo').click(); });

// ---------- audio engines ----------
let engs = null, engAssign = [0, -1, -1, -1], engT = 0; function ensureEngines() { if (!engs && AU.ctx) engs = [AU.makeEngine(1), AU.makeEngine(0.8), AU.makeEngine(0.8), AU.makeEngine(0.8)]; }

// ---------- camera ----------
const camState = { init: false, pos: new B.Vector3(), look: new B.Vector3(), yaw: 0, fov: 1.15 };
const tmpV = new B.Vector3();
function v3(p) { return new B.Vector3(p.x, p.y, p.z); }
function gameCamera(dt, car, ballP) {
  const cp = car.root.position, sc = sim.cars[meIdx];
  const f = sc.forward(); let yawT = Math.atan2(f.x, f.z);
  const hv = Math.hypot(sc.vel.x, sc.vel.z); if (sc.groundedCount === 0 && hv > 4) yawT = Math.atan2(sc.vel.x, sc.vel.z); else if (sc.speed() < -3) yawT = Math.atan2(sc.vel.x, sc.vel.z);
  let look;
  if (ballcam) { const dx = ballP.x - cp.x, dz = ballP.z - cp.z; if (Math.hypot(dx, dz) > 1.5) yawT = Math.atan2(dx, dz); }
  if (!camState.init) { camState.yaw = yawT; }
  let dy = yawT - camState.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; camState.yaw += dy * Math.min(1, dt * (ballcam ? 7 : 5));
  const sz = sc.spec.dims[2] / 5.4, hz = sc.spec.dims[1] / 1.4; const dist = (10.6 + Math.min(hv, 34) * 0.05) * (0.75 + 0.25 * sz), height = 3.8 * (0.7 + 0.3 * hz);
  const target = new B.Vector3(cp.x - Math.sin(camState.yaw) * dist, Math.max(cp.y, 0.6) + height, cp.z - Math.cos(camState.yaw) * dist);
  // keep the camera inside the arena
  for (let k = 0; k < 6; k++) { const s = S.sdf(target.x, target.y, target.z); if (s > 1.0) break; const n = S.sdfNormal({ x: target.x, y: target.y, z: target.z }); target.x += n.x * (1.05 - s); target.y += n.y * (1.05 - s); target.z += n.z * (1.05 - s); }
  if (ballcam) { look = new B.Vector3(cp.x * 0.55 + ballP.x * 0.45, Math.min(cp.y * 0.6 + ballP.y * 0.4 + 1.2, cp.y + 7), cp.z * 0.55 + ballP.z * 0.45); }
  else look = new B.Vector3(cp.x + Math.sin(camState.yaw) * 4, cp.y + 1.3, cp.z + Math.cos(camState.yaw) * 4);
  if (!camState.init) { camState.pos.copyFrom(target); camState.look.copyFrom(look); camState.init = true; }
  const k = 1 - Math.exp(-dt * 9), kl = 1 - Math.exp(-dt * 12);
  B.Vector3.LerpToRef(camState.pos, target, k, camState.pos); B.Vector3.LerpToRef(camState.look, look, kl, camState.look);
  camState.fov += ((1.12 + Math.min(hv / 34, 1) * 0.16) - camState.fov) * Math.min(1, dt * 3);
  camera.fov = camState.fov; applyCam(camState.pos, camState.look, dt);
}
function applyCam(pos, look, dt) {
  camera.position.copyFrom(pos);
  if (shake > 0 && settings.shake) { const s = shake * shake * 0.5; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s; }
  shake = Math.max(0, shake - dt * 2.2);
  camera.setTarget(look);
}
let menuT = 0;
function menuCamera(dt) {
  if (thumbCapture) return;
  menuT += dt;
  if (menuPanel === 'garage') {
    const c = cars3d[0].root.position, spec = sim.cars[0].spec; const a = menuT * 0.22; const r = spec.dims[2] * spec.K * 1.25 + 4.6, hgt = 1.0 + spec.dims[1] * spec.K * 0.6;
    const pos = new B.Vector3(c.x + Math.sin(a) * r, hgt, c.z + Math.cos(a) * r);
    const fwd = new B.Vector3(c.x - pos.x, 0, c.z - pos.z).normalize(); const right = B.Vector3.Cross(B.Vector3.Up(), fwd).normalize();
    // keep the car centred in the free space to the right of the garage panel
    const W = canvas.clientWidth || 1, pr = $('panelGarage').getBoundingClientRect().right; const ndc = Math.min(0.6, Math.max(0, ((pr + W) / 2) / W * 2 - 1));
    const aspect = W / (canvas.clientHeight || 1), hfov = 2 * Math.atan(Math.tan(0.5 * 0.9) * aspect); const dist = Math.hypot(pos.x - c.x, pos.z - c.z);
    const look = new B.Vector3(c.x, 0.2 + spec.dims[1] * spec.K * 0.4, c.z).subtract(right.scale(ndc * dist * Math.tan(hfov / 2)));
    B.Vector3.LerpToRef(camState.pos, pos, Math.min(1, dt * 3), camState.pos); B.Vector3.LerpToRef(camState.look, look, Math.min(1, dt * 3), camState.look);
    camera.fov = 0.9; applyCam(camState.pos, camState.look, dt); return;
  } else {
    const t = menuT; const pos = new B.Vector3(Math.sin(t * 0.045) * 26 - 8, 7.5 + Math.sin(t * 0.07) * 2, -(S.A.HZ - 11) + Math.cos(t * 0.05) * 6);
    const look = new B.Vector3(Math.sin(t * 0.03) * 12 + 4, 6, S.A.HZ * 0.75);
    B.Vector3.LerpToRef(camState.pos, pos, Math.min(1, dt * 1.5), camState.pos); B.Vector3.LerpToRef(camState.look, look, Math.min(1, dt * 1.5), camState.look);
  }
  camera.fov = 1.05; applyCam(camState.pos, camState.look, dt);
}

// ---------- events ----------
function handleEvents() {
  const cp = cars3d[meIdx].root.position;
  if (MP.role === 'host' && MP.inMatch && sim.events.length) MP.evq.push(...sim.events.slice(0, 30).map(e => ({ ...e, p: e.p ? { x: +e.p.x.toFixed(2), y: +e.p.y.toFixed(2), z: +e.p.z.toFixed(2) } : e.p })));
  const dist = p => Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z);
  for (const e of sim.events) {
    switch (e.type) {
      case 'ballHit': AU.ballHit(e.j, dist(e.p)); if (e.car !== undefined) match.stats[sim.cars[e.car].team].hits++; if (e.car === 0) shake = Math.max(shake, Math.min(e.j / 14000, 0.6)); emitAt(puff, e.p, 6, 0.4); break;
      case 'ballBounce': AU.bounce(e.j, dist(e.p)); break;
      case 'carHit': AU.metal(e.j, dist(e.p)); shake = Math.max(shake, Math.min(e.j / 30000, 0.9)); emitAt(burst, e.p, 14, 0.3); break;
      case 'carWall': AU.metal(e.j * 0.6, dist(e.p)); if (e.car === 0) shake = Math.max(shake, Math.min(e.j / 40000, 0.6)); break;
      case 'land': AU.land(e.j, dist(e.p)); emitAt(puff, e.p, 6, 1); if (e.car === 0) shake = Math.max(shake, Math.min(e.j / 50000, 0.5)); break;
      case 'padFire': AU.padFire(dist(e.p)); emitAt(puff, { x: e.p.x, y: 0.3, z: e.p.z }, 30, 2.4); emitAt(burst, { x: e.p.x, y: 0.4, z: e.p.z }, 40, 2.2); match.stats[sim.cars[e.car].team].pads++; if (e.car === 0) shake = Math.max(shake, 0.7); padRatchet[e.pad] = 0.6; break;
      case 'rock': AU.tone(140, 0.25, 0.25, 'triangle', 0.6); break;
    }
  }
  sim.events.length = 0;
}
let padRatchet = [];

// ---------- per-frame sync ----------
const qA = new B.Quaternion(), qB = new B.Quaternion();
function syncBody(node, body, a) {
  node.position.set(body.prevPos.x + (body.pos.x - body.prevPos.x) * a, body.prevPos.y + (body.pos.y - body.prevPos.y) * a, body.prevPos.z + (body.pos.z - body.prevPos.z) * a);
  qA.set(body.prevQ.x, body.prevQ.y, body.prevQ.z, body.prevQ.w); qB.set(body.q.x, body.q.y, body.q.z, body.q.w); B.Quaternion.SlerpToRef(qA, qB, a, node.rotationQuaternion);
}
let soundWasLive = false, soundLive = false;
function syncVisuals(a, dt) {
  // engines and tyre squeal only while a round is running and no menu/overlay is up; silence once on every transition
  soundLive = ['countdown', 'play', 'goal'].includes(state) && !paused && $('pause').classList.contains('hidden') && $('end').classList.contains('hidden');
  if (soundWasLive && !soundLive) AU.silenceEngines(); soundWasLive = soundLive;
  engT -= dt; if (engs && engT <= 0) { engT = 0.6; // the three nearest other cars get an engine voice
    const me_ = sim.cars[meIdx]; const near = sim.cars.filter(c => c !== me_).map(c => [c.id, Math.hypot(c.pos.x - me_.pos.x, c.pos.z - me_.pos.z)]).sort((p, q) => p[1] - q[1]).slice(0, 3).map(p => p[0]);
    engAssign[0] = meIdx; engAssign.forEach((id, k) => { if (k > 0 && !near.includes(id)) engAssign[k] = -1; }); near.forEach(id => { if (!engAssign.includes(id)) { const k = engAssign.indexOf(-1, 1); if (k > 0) engAssign[k] = id; } });
    engs.forEach((e, k) => { if (engAssign[k] < 0) AU.updateEngine(e, 0, 0, 0, 999, false); }); }
  sim.cars.forEach((c, i) => {
    const v = cars3d[i]; syncBody(v.root, c, a);
    c.wheels.forEach((w, k) => { const wv = v.wheels[k]; const sp_ = c.spec; wv.steer.position.y = (sp_.comModel.y + sp_.attachY - sp_.rest + Math.min(w.comp, sp_.rest * 0.62)) / sp_.K; if (w.f) wv.steer.rotation.y = c.steerCur; wv.spin.rotation.x = w.spinAngle; });
    const braking = (c.input.throttle < -0.1 && c.speed() > 1) || (c.input.throttle > 0.1 && c.speed() < -1) || c.input.handbrake;
    v.tailMat.emissiveIntensity = braking ? 2.6 : 0.5;
    // dust & skid
    let slip = 0; c.wheels.forEach(w => { if (w.grounded) slip = Math.max(slip, w.slip); });
    const sp = Math.hypot(c.vel.x, c.vel.z); const rear = c.toWorld({ x: 0, y: -0.5, z: -1.6 });
    dust[i].emitter = new B.Vector3(rear.x, Math.max(rear.y, 0.2), rear.z); dust[i].minEmitBox = new B.Vector3(-0.9, 0, -0.3); dust[i].maxEmitBox = new B.Vector3(0.9, 0.2, 0.3);
    dust[i].emitRate = (c.groundedCount >= 2 && c.pos.y < 1.2) ? (slip * 160 + Math.max(0, sp - 14) * 2.2) : 0;
    if (settings.skids !== false && (state === 'play' || state === 'goal')) c.wheels.forEach((w, k) => { if (w.grounded && w.slip > 0.12 && w.p.y < 0.05 && Math.abs(w.p.x) < SKW / 2 - 2) skidPoint(i, k, w.p, Math.min(0.55, w.slip * 0.7)); else lastSkid[i][k] = null; });
    const slot = engAssign.indexOf(i); if (engs && slot >= 0 && soundLive) { const d = Math.hypot(c.pos.x - sim.cars[meIdx].pos.x, c.pos.z - sim.cars[meIdx].pos.z); AU.updateEngine(engs[slot], c.speed(), c.frozen ? 0.15 : c.input.throttle, slip, d, c.groundedCount === 0); }
    if (i === meIdx) match.stats[c.team].top = Math.max(match.stats[c.team].top, sp);
  });
  syncBody(ballMesh, sim.ball, a);
  const bp = ballMesh.position; const wd = S.wallDist(bp.x, bp.z);
  blob.position.set(bp.x, 0.03, bp.z); const hgt = Math.max(bp.y - sim.ball.r, 0); const sc = sim.ball.r * (1.1 + hgt * 0.04); blob.scaling.set(sc, 1, sc); blobM.alpha = Math.max(0, 0.6 - hgt * 0.035) * (wd > 2 ? 1 : 0); blob.setEnabled(ballMesh.isEnabled());
  // pads
  sim.pads.forEach((pd, i) => {
    const vp = world.pads[i]; const top = pd.topCenter(); const lift = Math.max(0, top.y) / S.PAD.lift;
    vp.node.position.set(top.x, top.y + 0.022, top.z);
    const tilt = B.Quaternion.RotationAxis(new B.Vector3(pd.axis.x, pd.axis.y, pd.axis.z), 0.14 * Math.min(lift, 1.2));
    tilt.multiplyToRef(new B.Quaternion(pd.q.x, pd.q.y, pd.q.z, pd.q.w), vp.node.rotationQuaternion);
    const on = top.y > 0.03; vp.spring.setEnabled(on);
    if (on) { const bx = pd.c.x - pd.dir.x * 0.9, bz = pd.c.z - pd.dir.z * 0.9; vp.spring.position.set(bx, -0.25, bz); vp.spring.scaling.set(1, top.y + 0.25 - S.PAD.T + 0.12 * lift, 1); }
    vp.lampMat.emissiveIntensity = pd.state === 'armed' ? 2.6 + Math.sin(performance.now() / 260 + i) * 0.5 : 0.25 * pd.charge;
    if (padRatchet[i] > 0) { padRatchet[i] -= dt; if (padRatchet[i] <= 0 && pd.state === 'retract') { AU.ratchet(Math.hypot(pd.c.x - sim.cars[meIdx].pos.x, pd.c.z - sim.cars[meIdx].pos.z)); } }
  });
  skidFade += dt; if (skidFade > 0.5) { skidFade = 0; skidCtx.globalCompositeOperation = 'destination-out'; skidCtx.fillStyle = 'rgba(0,0,0,0.035)'; skidCtx.fillRect(0, 0, 512, SKH); skidCtx.globalCompositeOperation = 'source-over'; skidDirty = Math.max(skidDirty, 1); }
  skidT += dt; if (skidDirty && skidT > 0.12) { skidTex.update(); skidDirty = 0; skidT = 0; } // upload new marks promptly
}

// ---------- main update ----------
function stepSim(dt) {
  acc += dt * timeScale; let n = 0;
  while (acc >= sim.dt && n < 12) {
    const pIn = readInput();
    sim.step(sim.cars.map((c, i) => { if (i === meIdx) return pIn; const h = MP.humans[i]; if (h != null) { const a = (performance.now() - (MP.inputsT[h] || 0) < 600) ? MP.inputs[h] : null; return a ? { throttle: a[0], steer: a[1], handbrake: !!a[2] } : null; } return bots[i] ? bots[i].update(sim.dt) : null; })); acc -= sim.dt; n++;
    if (state === 'play') { const g = sim.goalCheck(); if (g >= 0) onGoal(g); }
    handleEvents();
  }
  if (n === 12) acc = 0;
}
function onGoal(team) {
  match.score[team]++; updateScore(); state = 'goal'; stateT = 0; goalInfo = { team, p: { ...sim.ball.pos } }; timeScale = 0.35;
  const sc = `${match.score[0]} – ${match.score[1]}`;
  const who = mpActive() ? `${colorName(MP.colors[team])} team scores` : team === 0 ? profile.name + ' scores' : 'The bot scores';
  fx('goal', team, [...match.score], { ...sim.ball.pos }, `GOAL!<small>${who}, ${sc}</small>`);
}
function update(dt) {
  syncTouchVisibility();
  if (setupBusy || !world || !sim || cars3d.length !== sim.cars.length) return;
  stateT += dt;
  const dbg = window.__rl && window.__rl.debugCam; if (dbg) { if (dbg.step && state !== 'menu') { stepSim(dbg.step); } syncVisuals(1, dt); camera.fov = dbg.fov || 1.0; camera.position.set(...dbg.pos); camera.setTarget(new B.Vector3(...dbg.look)); return; }
  if (state === 'menu' || paused || state === 'end') pollMenuPad();
  if (state === 'menu') { world.fan.rotation.z += dt * 0.5; menuCamera(dt); syncVisuals(1, dt); return; }
  world.fan.rotation.z += dt * 0.9;
  if (paused || state === 'end') { if (state === 'end') gameCamera(dt, cars3d[meIdx], ballMesh.position); return; }
  if (MP.role === 'client' && MP.inMatch) { // play back the host's snapshots
    const pIn = document.hidden ? { throttle: 0, steer: 0, handbrake: false } : readInput(); MP.net.send({ t: 'i', a: [+pIn.throttle.toFixed(2), +pIn.steer.toFixed(2), pIn.handbrake ? 1 : 0] }, true);
    const a = Math.min(1, (performance.now() - MP.snapT) / (1000 / 30)); syncVisuals(a, dt); gameCamera(dt, cars3d[meIdx], ballMesh.position); hud(); return; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) show('hint', false); }
  if (state === 'countdown') {
    const n = 3 - Math.floor(stateT); const prevN = 3 - Math.floor(stateT - dt);
    if (stateT < dt * 1.5 || n !== prevN) { if (n > 0) { fx('banner', String(n), 900); fx('beep', false); } }
    if (stateT >= 3) { state = 'play'; stateT = 0; sim.cars.forEach(c => c.frozen = false); fx('go'); }
  }
  if (state === 'goal') { timeScale = stateT < 1.2 ? 0.35 : 1; if (stateT > 3.2) {
      const done = (matchMode === 'first5' && Math.max(...match.score) >= 5) || match.overtime;
      if (done) { endMatch(); return; } kickoff(); } }
  if (state === 'play') {
    if (matchMode === 'timed') {
      if (!match.overtime) { match.time -= dt; if (match.time <= 0) { match.time = 0; if (match.score[0] !== match.score[1]) { endMatch(); return; } match.overtime = true; fx('banner', 'OVERTIME<small>Next goal wins</small>', 2200); } }
      else match.time += dt;
    } else match.time += dt;
  }
  stepSim(dt);
  const a = acc / sim.dt;
  syncVisuals(Math.min(a, 1), dt);
  gameCamera(dt, cars3d[meIdx], ballMesh.position);
  if (MP.role === 'host' && MP.inMatch) hostSnapshot(dt);
  hud();
}
function hud() {
  const clock = $('clock'); clock.textContent = (match.overtime ? '+' : '') + fmt(match.time); clock.classList.toggle('ot', match.overtime);
  const mph = Math.abs(sim.cars[meIdx].speed()) * 2.237; $('mph').textContent = Math.round(mph); $('needle').style.width = Math.min(mph / 100, 1) * 100 + '%';
}
engine.runRenderLoop(() => { const dt = Math.min(engine.getDeltaTime() / 1000, 0.1); try { update(dt); } catch (e) { console.error(e); } scene.render(); });

// ===================== LAN MULTIPLAYER =====================
// Host-authoritative: the host's browser runs the physics and every bot; players send their controls and receive
// 30 Hz snapshots over WebRTC. Lobby: two teams, A/D to switch, bots fill empty seats, host picks the rules and colours.
const TEAM_COLORS = [['#2f6fd6', 'Blue'], ['#d23a2f', 'Red'], ['#e0a020', 'Amber'], ['#2e9e57', 'Green'], ['#8a4fd0', 'Purple'], ['#e06a1f', 'Orange'], ['#1fb5b5', 'Teal'], ['#d8d2c0', 'Cream'], ['#3a3a3a', 'Black']];
const colorName = hex => (TEAM_COLORS.find(c => c[0] === hex) || ['', 'Team'])[1];
const MP = { role: null, net: null, lobby: null, myId: 'host', humans: {}, inputs: {}, inputsT: {}, ready: new Set(), inMatch: false, snapAcc: 0, evq: [], snapT: 0, lastSnap: null };
const mpActive = () => !!MP.role;
const mpHuman = () => MP.lobby ? MP.lobby.players.find(p => p.id === MP.myId) : null;
const teamHumans = (L, t) => L.players.filter(p => p.team === t);
function lobbyMsg(t) { $('lobMsg').textContent = t || ''; }
let warmKey = '';
function warmLobbyPaints() { const L = MP.lobby; if (!L) return; const k = L.colors.join(); if (k === warmKey) return; warmKey = k;
  for (const hex of L.colors) for (const ty of ALL_CARS) { const key = 'lo:' + ty + hex; if (!TX[key]) Promise.resolve(Pool.run('carAtlas', [CAR_LO, hex, false, ty], AFF[ty])).then(t => { TX[key] = t; }).catch(() => {}); } }
function renderLobby() {
  warmLobbyPaints();
  const L = MP.lobby; if (!L) return; const host = MP.role === 'host', me = mpHuman();
  $('lobCode').textContent = MP.code || '-----';
  document.querySelectorAll('#lobby .hostonly').forEach(e => e.classList.toggle('hidden-role', !host));
  document.querySelectorAll('#lobby .clientonly').forEach(e => e.classList.toggle('hidden-role', host));
  $('lobSettingsTxt').textContent = `${L.teamSize}v${L.teamSize}, ${L.mode === 'timed' ? '5:00 + overtime' : 'first to 5'}, ${RLBot.LEVELS[L.difficulty].name} bots. The host picks the rules.`;
  document.querySelectorAll('#lobby [data-lkey]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(L[sg.dataset.lkey]) === b.dataset.v)));
  $('lobCar').querySelectorAll('button').forEach(b => b.classList.toggle('on', me && me.car === b.dataset.v));
  document.querySelectorAll('#lobby .tcol').forEach(col => {
    const t = +col.dataset.team, hex = L.colors[t]; col.style.setProperty('--tc', hex); col.querySelector('.tname').textContent = colorName(hex) + ' team';
    const canColor = host || (L.teamSize === 1 && me && me.team === t);
    col.querySelector('.tswatch').innerHTML = TEAM_COLORS.map(([h, n]) => `<button style="background:${h}" title="${n}" aria-label="${n}" data-hex="${h}" data-team="${t}" class="${h === hex ? 'on' : ''}" ${canColor && h !== L.colors[1 - t] ? '' : 'disabled'}></button>`).join('');
    const hs = teamHumans(L, t); let html = '';
    for (let k = 0; k < L.teamSize; k++) { const p = hs[k];
      html += p ? `<li class="${p.id === MP.myId ? 'me' : ''}"><span>${p.name.replace(/</g, '')}${p.id === 'host' ? ' <small>host</small>' : ''}</span><small>${CAR_INFO[p.car][0]}</small></li>` : `<li class="bot"><span>Bot</span><small>${RLBot.LEVELS[L.difficulty].name}</small></li>`; }
    col.querySelector('.slots').innerHTML = html;
  });
  $('lobSwitch').textContent = L.teamSize === 1 && L.players.length === 2 ? 'teams split automatically' : 'switch team';
  $('lobStart').classList.toggle('hidden', !host);
  if (!host) lobbyMsg('Waiting for the host to start…');
}
function showLobby(on) { show('lobby', on); show('menu', !on); show('playerbar', !on); setPanel(null); if (on) renderLobby(); }
function hostSync() { if (MP.role !== 'host') return; MP.net.broadcast({ t: 'lobby', lobby: MP.lobby }); MP.net.setInfo(roomInfo()); renderLobby(); }
function roomInfo() { const L = MP.lobby; return { name: profile.name + "'s game", host: profile.name, players: L.players.length, max: L.teamSize * 2, teamSize: L.teamSize, started: MP.inMatch }; }
// host rules
function hostRequest(id, m) {
  const L = MP.lobby, p = L.players.find(x => x.id === id); if (!p || MP.inMatch) return;
  if (m.kind === 'team') { const t = m.value === 1 ? 1 : 0; if (t !== p.team && !(L.teamSize === 1 && L.players.length === 2) && teamHumans(L, t).length < L.teamSize) p.team = t; }
  else if (m.kind === 'car' && CAR_INFO[m.value]) p.car = m.value;
  else if (m.kind === 'color') { const t = m.team ? 1 : 0; if ((id === 'host' || (L.teamSize === 1 && p.team === t)) && TEAM_COLORS.some(c => c[0] === m.value) && m.value !== L.colors[1 - t]) L.colors[t] = m.value; }
  else if (m.kind === 'set' && id === 'host') {
    if (m.key === 'teamSize') { const n = +m.value; if (L.players.length <= n * 2) { L.teamSize = n; for (const t of [0, 1]) while (teamHumans(L, t).length > n) teamHumans(L, t).pop().team = 1 - t; if (n === 1 && L.players.length === 2) L.players[1].team = 1 - L.players[0].team; } else lobbyMsg('Too many players for that size.'); }
    else if (['mode', 'difficulty', 'lighting'].includes(m.key)) L[m.key] = m.value;
  }
  hostSync();
}
function request(kind, value, extra = {}) { if (MP.role === 'host') hostRequest('host', { kind, value, ...extra }); else if (MP.net) MP.net.send({ t: 'req', kind, value, ...extra }); }
async function hostGame() {
  try {
    const L = { teamSize: settings.teamSize || 1, mode: settings.mode, difficulty: settings.difficulty, lighting: settings.lighting, colors: ['#2f6fd6', '#d23a2f'], players: [{ id: 'host', name: profile.name, car: profile.car, team: 0 }] };
    MP.role = 'host'; MP.myId = 'host'; MP.lobby = L;
    MP.net = new RLNet.Host(profile.name, {
      canJoin: () => !MP.inMatch && MP.lobby.players.length < MP.lobby.teamSize * 2,
      rejectReason: () => MP.inMatch ? 'started' : 'full',
      onJoin: peer => { const L = MP.lobby; L.players = L.players.filter(p => p.id !== peer.id); const t = teamHumans(L, 0).length <= teamHumans(L, 1).length ? 0 : 1; L.players.push({ id: peer.id, name: String(peer.name || 'Driver').slice(0, 16), car: 'coupe', team: L.teamSize === 1 ? 1 - L.players[0].team : t }); AU.click(); hostSync(); },
      onLeave: id => mpPlayerLeft(id),
      onMsg: (id, m) => { if (m.t === 'req') hostRequest(id, m); else if (m.t === 'i') { MP.inputs[id] = m.a; MP.inputsT[id] = performance.now(); } else if (m.t === 'ready') { if (MP.ready) MP.ready.add(id); } else if (m.t === 'bye') MP.net.drop(id); else if (m.t === 'me') { const p = MP.lobby.players.find(x => x.id === id); if (p) { p.name = String(m.name || p.name).slice(0, 16); if (CAR_INFO[m.car]) p.car = m.car; hostSync(); } } },
    });
    lanMsg('Opening the lobby…'); MP.code = await MP.net.open(roomInfo()); showLobby(true); lobbyMsg('Share the room code, or friends on your network will see the game listed.');
  } catch (e) { mpReset(); lanMsg('Could not host: ' + e.message); }
}
let joining = false;
async function joinGame(code) {
  if (joining || MP.role) return; joining = true; setLanSel(null); $('hostBtn').disabled = true;
  try {
    lanMsg('Connecting…'); MP.role = 'client';
    MP.net = new RLNet.Client(profile.name, { onMsg: (m, lbl) => clientMsg(m), onClose: () => mpLost('The connection to the host was lost.') });
    MP.myId = MP.net.id; await MP.net.join(code); MP.code = code.toUpperCase();
    MP.net.send({ t: 'me', name: profile.name, car: profile.car });
  } catch (e) { mpReset(); lanMsg(e.message); }
  finally { joining = false; $('hostBtn').disabled = false; setLanSel(null); }
}
function clientMsg(m) {
  if (m.t === 'lobby') { MP.lobby = m.lobby; if (!MP.inMatch && $('lobby').classList.contains('hidden') && state === 'menu') showLobby(true); else renderLobby(); }
  else if (m.t === 'start') startMatchMP(m.comp);
  else if (m.t === 's' && MP.inMatch) clientSnapshot(m);
  else if (m.t === 'fx') runFx(m.k, m.a, true);
  else if (m.t === 'back') backToLobby();
  else if (m.t === 'bye') mpLost('The host closed the game.');
}
function mpPlayerLeft(id) {
  const L = MP.lobby; L.players = L.players.filter(p => p.id !== id); delete MP.inputs[id];
  if (MP.inMatch) for (const k in MP.humans) if (MP.humans[k] === id) { delete MP.humans[k]; const i = +k; bots[i] = new RLBot.Bot(sim, i, MP.lobby.difficulty, 'allrounder'); bots[i].onKickoff(); }
  hostSync();
}
function mpReset() { try { MP.net && MP.net.close(); } catch (_) { } Object.assign(MP, { role: null, net: null, lobby: null, myId: 'host', humans: {}, inputs: {}, inputsT: {}, ready: new Set(), inMatch: false, code: null }); meIdx = 0; }
function mpLost(msg) { if (!MP.role) return; mpReset(); show('lobby', false); show('pause', false); show('end', false); toMenu(); restoreSolo(); setPanel('lan'); lanMsg(msg); }
function restoreSolo() { matchKey = ''; setGoalColor(0, PAINTS[profile.paint][0]); setGoalColor(1, PAINTS[botPaintKey][0]); setupMatch(settings.teamSize || 1, true).then(() => sim && sim.resetKickoff(0)); }
function leaveMP() { mpReset(); show('lobby', false); toMenu(); restoreSolo(); }
// line-up for a multiplayer match: humans keep their cars, bots fill the rest following the usual car rules
function fillCars(n, fixed) { const out = [...fixed]; const missing = shuffled(ALL_CARS.filter(t => !out.includes(t)));
  while (out.length < n) { const need = n >= 3 && missing.length ? missing.shift() : n === 2 ? pick(ALL_CARS.filter(t => !out.includes(t))) : pick(ALL_CARS); out.push(need); } return out; }
function buildComp() {
  const L = MP.lobby, n = L.teamSize; const types = [], humans = {}, styles = [];
  for (const t of [0, 1]) { const hs = teamHumans(L, t); const cars = fillCars(n, hs.map(p => p.car)); const st = stylesFor(cars);
    cars.forEach((c, k) => { const i = t * n + k; types[i] = c; styles[i] = st[k]; if (hs[k]) humans[i] = hs[k].id; }); }
  return { n, types, humans, styles, colors: [...L.colors], mode: L.mode, difficulty: L.difficulty, lighting: L.lighting, names: Object.fromEntries(L.players.map(p => [p.id, p.name])) };
}
// the host holds the countdown until every player's browser has finished loading the match (max 25 s)
function waitForPlayers() {
  const need = () => Object.values(MP.humans).filter(id => id !== 'host' && MP.net.peers.has(id) && !MP.ready.has(id));
  if (!need().length) return Promise.resolve();
  fx('banner', 'Waiting for players…<small>Getting everyone loaded</small>', 0);
  return new Promise(res => { const t0 = performance.now(); const iv = setInterval(() => { if (!need().length || performance.now() - t0 > 25000 || !MP.inMatch) { clearInterval(iv); fx('banner', '', 1); res(); } }, 150); });
}
async function startMatchMP(comp) {
  MP.ready = new Set();
  MP.inMatch = true; MP.humans = comp.humans; MP.colors = comp.colors; MP.comp = comp; show('lobby', false);
  const myK = Object.keys(comp.humans).find(k => comp.humans[k] === MP.myId);
  if (myK == null) { mpLost('You weren\'t in that match\'s line-up. Rejoin the lobby to play.'); return; }
  meIdx = +myK;
  matchMode = comp.mode; matchDifficulty = comp.difficulty;
  if (settings.lighting !== comp.lighting) { settings.lighting = comp.lighting; await applyLighting(false); }
  await setGoalColor(0, comp.colors[0]); await setGoalColor(1, comp.colors[1]);
  await startMatch(comp);
  if (MP.role === 'host') MP.net.setInfo(roomInfo());
}
function hostStart() { if (MP.role !== 'host') return; const comp = buildComp(); MP.net.broadcast({ t: 'start', comp }); startMatchMP(comp); }
function backToLobby() { MP.inMatch = false; state = 'menu'; show('hud', false); show('end', false); show('pause', false); AU.silenceEngines(); meIdx = 0; matchKey = ''; showLobby(true); if (MP.role === 'host') { MP.net.broadcast({ t: 'back' }); hostSync(); } }
// effects (banners, beeps, horn, goal burst, end of match) run on the host and are mirrored to every player
function fx(k, ...a) { runFx(k, a, false); if (MP.role === 'host' && MP.inMatch) MP.net.broadcast({ t: 'fx', k, a }); }
function runFx(k, a, remote) {
  if (k === 'banner') banner(a[0], a[1]); else if (k === 'beep') AU.beep(a[0]); else if (k === 'go') { banner('GO!', 700); AU.beep(true); }
  else if (k === 'goal') { if (remote) match.score = a[1]; updateScore(); AU.horn(); emitAt(burst, a[2], 260, 1.2); emitAt(puff, a[2], 60, 1.5); shake = 1.2; ballMesh.setEnabled(false); banner(a[3], 3000); }
  else if (k === 'end') { if (remote) { match.score = a[0]; match.stats = a[1]; } endMatch(true); }
}
function clientSnapshot(m) {
  sim.applySnapshot(m); const was = state; state = m.st; stateT = m.sT; match.score = m.sc; match.time = m.tm; match.overtime = m.ot; updateScore();
  if (was !== 'countdown' && state === 'countdown') { ballMesh.setEnabled(true); camState.init = false; lastSkid.forEach(a => a.fill(null)); }
  MP.snapT = performance.now(); if (m.ev && m.ev.length) { sim.events = m.ev; handleEvents(); }
}
function hostSnapshot(dt) {
  MP.snapAcc += dt; if (MP.snapAcc < 1 / 30) return; MP.snapAcc = 0;
  MP.net.broadcast({ t: 's', ...sim.snapshot(), st: state, sT: +stateT.toFixed(3), sc: match.score, tm: +match.time.toFixed(2), ot: match.overtime, ev: MP.evq.splice(0) }, true);
}
// lobby wiring
function lanMsg(t) { $('lanMsg').textContent = t || ''; }
let lanT = null;
async function refreshLan() {
  if (menuPanel !== 'lan') { clearInterval(lanT); lanT = null; return; }
  try { const { rooms } = await RLNet.api('list');
    $('lanList').innerHTML = rooms.length ? rooms.map(r => `<button class="lanitem" data-code="${r.code}"><span>${String(r.name || 'Game').replace(/</g, '')}<small>${r.teamSize}v${r.teamSize}, ${r.players}/${r.max} players${r.started ? ', in a match' : ''}</small></span><b>${r.code}</b></button>`).join('') : '<div class="note">No games on your network yet. Host one, or join with a code.</div>';
    if (lanSel && rooms.some(r => r.code === lanSel)) setLanSel(lanSel); else if (lanSel && $('codeIn').value.trim().toUpperCase() !== lanSel) setLanSel(null);
  } catch (e) { $('lanList').innerHTML = `<div class="note">${/configured|503/.test(e.message) ? e.message : 'LAN parties need the Vercel deployment with matchmaking set up (see the README). Single player works anywhere.'}</div>`; }
}
// picking a listed game selects it; the bottom-right button then becomes a green JOIN (tap the same game again to deselect)
let lanSel = null;
function setLanSel(code) { lanSel = code; document.querySelectorAll('.lanitem').forEach(b => b.classList.toggle('sel', b.dataset.code === code));
  const hb = $('hostBtn'); hb.classList.toggle('joinbtn', !!code); hb.querySelector('span').textContent = code ? 'JOIN ' + code : 'HOST A GAME'; }
$('lanList').addEventListener('click', e => { const b = e.target.closest('.lanitem'); if (!b || joining) return; AU.click(); setLanSel(lanSel === b.dataset.code ? null : b.dataset.code); });
$('codeIn').addEventListener('input', () => { const c = $('codeIn').value.trim().toUpperCase(); if (c.length === 5) setLanSel(c); else if (lanSel && !document.querySelector(`.lanitem[data-code="${lanSel}"]`)) setLanSel(null); });
$('joinCodeBtn').onclick = () => { const c = $('codeIn').value.trim(); if (c.length === 5) joinGame(c); else lanMsg('Room codes are 5 letters.'); };
$('hostBtn').onclick = () => { if (joining || MP.role) return; AU.click(); if (lanSel) joinGame(lanSel); else hostGame(); };
$('lobLeave').onclick = () => { AU.click(); leaveMP(); };
$('lobStart').onclick = () => { AU.click(); hostStart(); };
$('lobCar').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; AU.click(); profile.car = b.dataset.v; saveProfile(); request('car', b.dataset.v); });
document.querySelectorAll('#lobby [data-lkey]').forEach(sg => sg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || MP.role !== 'host') return; AU.click(); request('set', b.dataset.v, { key: sg.dataset.lkey }); }));
$('lobby').addEventListener('click', e => { const b = e.target.closest('.tswatch button'); if (!b || b.disabled) return; AU.click(); request('color', b.dataset.hex, { team: +b.dataset.team }); });
$('toLobbyBtn').onclick = () => { if (MP.role === 'host') backToLobby(); };
$('leaveMpBtn').onclick = () => { AU.click(); leaveMP(); };
window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || !MP.lobby || MP.inMatch || $('lobby').classList.contains('hidden')) return;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') request('team', 0); if (e.code === 'KeyD' || e.code === 'ArrowRight') request('team', 1); if (e.code === 'Escape') leaveMP(); });
const leavePage = () => { try { MP.net && MP.net.close(); } catch (_) { } };
window.addEventListener('pagehide', leavePage); window.addEventListener('beforeunload', leavePage);

// ---------- finish loading ----------
setLoad(0.95, 'Rolling out'); await tick();
await new Promise(r => scene.executeWhenReady(r));
waitProbe();
await setupMatch(settings.teamSize || 1); await applyLighting(true); lightsReady = true;
toMenu(); camState.pos.set(-8, 9, -S.A.HZ + 9); camState.look.set(4, 6, S.A.HZ * 0.75);
// promo art: a render of the ball against the barn and windmill
if (window.RL_PROMO) $('promoImg').src = RL_PROMO; else try {
  const pc = new B.UniversalCamera('promoCam', new B.Vector3(-4.5, 2.2, -6), scene); pc.setTarget(new B.Vector3(2, 3.6, 12)); pc.fov = 0.9; pc.minZ = 0.1; pc.maxZ = 2400;
  B.Tools.CreateScreenshotUsingRenderTarget(engine, pc, { width: 480, height: 300 }, data => { $('promoImg').src = data; pc.dispose(); }, 'image/jpeg', 1, false);
} catch (e) { }
syncCars();
setLoad(1); show('loading', false); buildTouch(); checkRotate(); if (!profile.named || !profile.name) askName();
// paint the pitch markings for the other team sizes in the background, so switching sizes later is quick
setTimeout(() => { for (const n of [2, 3, 4]) { const sc = S.teamScale(n), k = sc.toFixed(3); if (!TX.fields[k]) laterHi(() => Promise.resolve(Pool.run('fieldMacro', [rs(640), rs(1152), sc])).then(f => { if (!TX.fields[k]) TX.fields[k] = f; S.setArenaScale(arenaScale || 1); }).catch(() => {})); } }, 4000);
// offline helper: photograph a car in a given paint on a transparent background with studio lighting (used to bake the garage images)
// view (optional, for inspecting models): { yaw, el, dist, look: [x, y, z], w, h } — yaw 0 looks at the front, PI at the back, el < 0 from below
async function studioShot(type, hex, view) {
  const spec = S.CARS[type]; const t = await T.carAtlas(1024, hex, false, type); const pm = carMat('studio', t); pm.dbl = pm.clone('studioD'); pm.dbl.backFaceCulling = false;
  const vis = scene.meshes.map(m => [m, m.isEnabled()]); scene.meshes.forEach(m => m.setEnabled(false));
  const v = RLCar3D.buildCar(scene, Object.assign({}, M, { paint: pm, paintDouble: pm.dbl, tail: tailMat(), pipe: M.pipe }), { spec, com: spec.comModel, wheels: spec.wheels, K: spec.K });
  v.root.position.set(0, spec.comModel.y, 0);
  const ipc = scene.imageProcessingConfiguration, keep = { a: ipc.applyByPostProcess, tm: ipc.toneMappingEnabled, tt: ipc.toneMappingType, ex: ipc.exposure, co: ipc.contrast, cc: scene.clearColor.clone(), fog: scene.fogMode,
    sd: sun.direction.clone(), si: sun.intensity, sc: sun.diffuse.clone(), hi: hemi.intensity, hd: hemi.diffuse.clone(), hg: hemi.groundColor.clone(), sh: sun.shadowEnabled };
  ipc.applyByPostProcess = false; ipc.toneMappingEnabled = true; ipc.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES; ipc.exposure = 1.25; ipc.contrast = 1.12;
  scene.clearColor = new B.Color4(0, 0, 0, 0); scene.fogMode = B.Scene.FOGMODE_NONE; sun.shadowEnabled = false;
  sun.direction = new B.Vector3(0.55, -0.62, -0.56); sun.intensity = 3.2; sun.diffuse = new B.Color3(1, 0.95, 0.88); hemi.intensity = 1.25; hemi.diffuse = new B.Color3(0.85, 0.85, 0.95); hemi.groundColor = new B.Color3(0.3, 0.26, 0.22);
  const L = spec.dims[2] * spec.K, H = spec.dims[1] * spec.K; const cp = new B.Vector3((-0.72 * L - 0.9) * 1.1, 0.42 * H + 0.95, (0.86 * L + 1.0) * 1.1); const cam = new B.UniversalCamera('studio', cp, scene); cam.fov = 0.5; cam.minZ = 0.1; cam.setTarget(new B.Vector3(0, H * 0.4, 0));
  v.root.rotationQuaternion = B.Quaternion.FromEulerAngles(0, Math.atan2(cp.x, cp.z) + 1.05, 0); // three-quarter front view
  if (view) { const lk = new B.Vector3(...(view.look || [0, H * 0.4, 0])), d = view.dist || L * 1.6, el = view.el || 0, yw = view.yaw || 0;
    v.root.rotationQuaternion = B.Quaternion.Identity(); cam.position = lk.add(new B.Vector3(Math.sin(yw) * Math.cos(el), Math.sin(el), Math.cos(yw) * Math.cos(el)).scale(d)); cam.setTarget(lk);
    if (el < -0.2) { hemi.groundColor = new B.Color3(0.8, 0.78, 0.75); sun.direction = new B.Vector3(0.3, 0.8, -0.4); } }
  const url = await B.Tools.CreateScreenshotUsingRenderTargetAsync(engine, cam, { width: (view && view.w) || 640, height: (view && view.h) || 360 }, 'image/png', 2, true);
  cam.dispose(); v.root.dispose(); (v.extra || []).forEach(e => e.dispose()); v.tailMat.dispose(); pm.dbl.dispose(); pm.dispose();
  ipc.applyByPostProcess = keep.a; ipc.toneMappingEnabled = keep.tm; ipc.toneMappingType = keep.tt; ipc.exposure = keep.ex; ipc.contrast = keep.co; scene.clearColor = keep.cc; scene.fogMode = keep.fog;
  sun.direction = keep.sd; sun.intensity = keep.si; sun.diffuse = keep.sc; hemi.intensity = keep.hi; hemi.diffuse = keep.hd; hemi.groundColor = keep.hg; sun.shadowEnabled = keep.sh; vis.forEach(([m, e]) => m.setEnabled(e));
  return url;
}
window.__rl = { studioShot, PAINTS, applyLighting, scene, get sim() { return sim; }, engine, camera, state: () => state, startMatch, get world() { return world; }, get bots() { return bots; }, settings, setupMatch };
})();

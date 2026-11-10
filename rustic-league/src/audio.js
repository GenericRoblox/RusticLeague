// ===================== RUSTIC LEAGUE — SYNTHESISED AUDIO =====================
(function (root) {
'use strict';
class Audio {
  constructor() { this.ctx = null; this.vol = 0.8; this.engines = []; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ambience: wind + crickets
    const wind = this.noise(); const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380; const wg = c.createGain(); wg.gain.value = 0.05; wind.connect(wf).connect(wg).connect(this.master); wind.start();
    this.cricketT = setInterval(() => this.cricket(), 900);
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; return s; }
  cricket() {
    if (!this.ctx || Math.random() < 0.35) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.frequency.value = 4300 + Math.random() * 600;
    const g = c.createGain(); g.gain.value = 0; const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    for (let k = 0; k < 3; k++) { const s = t + k * 0.07; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.012, s + 0.012); g.gain.linearRampToValueAtTime(0, s + 0.045); }
    if (pan) { pan.pan.value = Math.random() * 2 - 1; o.connect(g).connect(pan).connect(this.master); } else o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.3);
  }
  // V8 burble: two detuned saws through a growling lowpass, amplitude-modulated at firing rate
  makeEngine(gainMul = 1) {
    if (!this.ctx) return null; const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), sub = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth'; sub.type = 'square';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; const am = c.createGain(); const lfo = c.createOscillator(); lfo.type = 'square'; const lfoG = c.createGain(); lfoG.gain.value = 0.25;
    const out = c.createGain(); out.gain.value = 0; const shaper = c.createWaveShaper(); const cur = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cur[i] = Math.tanh(x * 2.5); } shaper.curve = cur;
    const subG = c.createGain(); subG.gain.value = 0.5;
    o1.connect(lp); o2.connect(lp); sub.connect(subG).connect(lp); lp.connect(shaper).connect(am).connect(out).connect(this.master);
    am.gain.value = 0.75; lfo.connect(lfoG).connect(am.gain);
    // tyre squeal
    const sq = this.noise(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6; const sqG = c.createGain(); sqG.gain.value = 0; sq.connect(bp).connect(sqG).connect(this.master);
    [o1, o2, sub, lfo, sq].forEach(o => o.start());
    const e = { o1, o2, sub, lp, lfo, out, sqG, bp, gainMul, rpm: 800, gear: 1 }; this.engines.push(e); return e;
  }
  updateEngine(e, speed, throttle, slip, dist, airborne) {
    if (!e || !this.ctx) return; const t = this.ctx.currentTime;
    const s = Math.abs(speed); const gears = [0, 9, 17, 25, 99]; let g = 1; while (s > gears[g] && g < 4) g++;
    const lo = gears[g - 1], hi = Math.min(gears[g], 36); const frac = Math.min((s - lo) / Math.max(hi - lo, 1), 1);
    let rpm = 750 + frac * 3600 + (g === 1 ? s * 40 : 0); if (airborne) rpm = Math.max(e.rpm * 0.995, 900 + Math.abs(throttle) * 3000);
    rpm += Math.abs(throttle) * 300; e.rpm += (rpm - e.rpm) * 0.15;
    const f = e.rpm / 60 * 4; // V8 firing frequency
    e.o1.frequency.setTargetAtTime(f * 0.5, t, 0.03); e.o2.frequency.setTargetAtTime(f * 0.503, t, 0.03); e.sub.frequency.setTargetAtTime(f * 0.25, t, 0.03); e.lfo.frequency.setTargetAtTime(f * 0.25, t, 0.03);
    e.lp.frequency.setTargetAtTime(280 + Math.abs(throttle) * 900 + e.rpm * 0.12, t, 0.05);
    const att = 1 / (1 + dist * dist * 0.004);
    e.out.gain.setTargetAtTime((0.10 + Math.abs(throttle) * 0.09) * att * e.gainMul, t, 0.05);
    e.sqG.gain.setTargetAtTime(Math.min(slip, 1) * 0.11 * att * e.gainMul, t, 0.05); e.bp.frequency.setTargetAtTime(900 + s * 18, t, 0.1);
  }
  silenceEngines() { if (!this.ctx) return; for (const e of this.engines) { e.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); e.sqG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } }
  burst(freq, q, dur, vol, type = 'bandpass', delay = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay; const n = this.noise(); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol, type = 'sine', slide = 0, delay = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  ballHit(j, dist) { const v = Math.min(j / 9000, 1) / (1 + dist * 0.02); this.tone(90, 0.25, 0.5 * v, 'sine', 0.5); this.burst(700, 1.2, 0.12, 0.35 * v); this.burst(2400, 2, 0.05, 0.12 * v); }
  bounce(j, dist) { const v = Math.min(j / 6000, 1) / (1 + dist * 0.02); this.tone(70, 0.18, 0.3 * v, 'sine', 0.6); this.burst(400, 1, 0.08, 0.15 * v); }
  metal(j, dist) { const v = Math.min(j / 20000, 1) / (1 + dist * 0.02); this.burst(320, 3, 0.35, 0.5 * v); this.burst(1500, 8, 0.25, 0.2 * v); this.tone(180 + Math.random() * 90, 0.4, 0.1 * v, 'triangle', 0.7); }
  padFire(dist) { const v = 1 / (1 + dist * 0.015); this.tone(55, 0.35, 0.8 * v, 'sine', 0.4); this.burst(1800, 1, 0.08, 0.5 * v, 'highpass'); this.burst(300, 2, 0.25, 0.4 * v);
    this.tone(220, 0.7, 0.18 * v, 'triangle', 2.2, 0.02); this.tone(330, 0.6, 0.08 * v, 'triangle', 1.6, 0.05); }
  ratchet(dist) { const v = 0.15 / (1 + dist * 0.03); for (let k = 0; k < 10; k++) this.burst(3000, 4, 0.02, v, 'bandpass', k * 0.18); }
  land(j, dist) { const v = Math.min(j / 30000, 1) / (1 + dist * 0.02); this.tone(60, 0.3, 0.5 * v, 'sine', 0.5); this.burst(500, 2, 0.2, 0.25 * v); }
  horn() { // aa-OOO-gah
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    for (const [d, vol] of [[1, 0.12], [1.006, 0.08]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180 * d, t); o.frequency.linearRampToValueAtTime(420 * d, t + 0.35); o.frequency.setValueAtTime(420 * d, t + 0.75); o.frequency.linearRampToValueAtTime(300 * d, t + 1.2);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * 3, t + 0.05); g.gain.setValueAtTime(vol * 3, t + 1.1); g.gain.linearRampToValueAtTime(0, t + 1.3);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 1.4); }
  }
  beep(hi) { this.tone(hi ? 880 : 520, hi ? 0.5 : 0.18, 0.25, 'square'); }
  click() { this.tone(1400, 0.04, 0.06, 'square'); }
}
root.RLAudio = new Audio();
})(typeof window !== 'undefined' ? window : globalThis);

// ===================== RUSTIC LEAGUE — LAN NETWORKING (WebRTC peer-to-peer, signalled through /api/lobby) =====================
(function (root) {
'use strict';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
async function api(a, body, q = '') {
  const r = await fetch('/api/lobby?a=' + a + q, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j;
}
const rid = () => Math.random().toString(36).slice(2, 10);
// one identity per browser tab, so a retried join replaces the earlier attempt instead of creating a second player
const tabId = (() => { try { let v = sessionStorage.getItem('rustic_peer'); if (!v) { v = rid(); sessionStorage.setItem('rustic_peer', v); } return v; } catch (_) { return rid(); } })();
// closing must survive the page being torn down: beacon first, keepalive fetch as a fallback
function closeRoom(code) { const body = JSON.stringify({ code }); let ok = false;
  try { ok = navigator.sendBeacon && navigator.sendBeacon('/api/lobby?a=close', new Blob([body], { type: 'text/plain' })); } catch (_) { }
  if (!ok) fetch('/api/lobby?a=close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {}); }
// wait for ICE gathering so the whole offer/answer (with LAN candidates) goes in one message
function gathered(pc, ms = 2500) { return new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); }); }
function wire(peer, ch, onMsg) { ch.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onMsg(peer.id, m, ch.label); }; }

class Host {
  constructor(name, handlers) { this.name = name; this.h = handlers; this.peers = new Map(); this.code = null; this.info = {}; this.closed = false; }
  async open(info) {
    this.info = info; const r = await api('host', { info }); this.code = r.code;
    this.pollT = setInterval(() => this.poll(), 1200); this.beatT = setInterval(() => this.beat(), 6000); return this.code;
  }
  setInfo(info) { this.info = info; }
  beat() { if (!this.code || this.closed) return; api('beat', { code: this.code, info: this.info }).then(r => { if (r && r.closed) { this.closed = true; clearInterval(this.beatT); } }).catch(() => {}); }
  async poll() {
    if (this.polling || this.closed) return; this.polling = true;
    try { const { msgs } = await api('recv', null, '&code=' + this.code + '&me=host'); for (const m of msgs) await this.signal(m); } catch (_) { }
    this.polling = false;
  }
  async signal(m) {
    if (m.type === 'join') {
      if (this.peers.has(m.from)) this.drop(m.from); // the same player retrying: replace the old connection, never add a second seat
      if (this.h.canJoin && !this.h.canJoin(m)) { api('send', { code: this.code, to: m.from, msg: { type: 'reject', reason: this.h.rejectReason ? this.h.rejectReason() : 'full' } }); return; }
      const pc = new RTCPeerConnection(ICE); const peer = { id: m.from, name: m.name, pc, rel: null, fast: null, open: false };
      this.peers.set(m.from, peer);
      peer.rel = pc.createDataChannel('rel', { ordered: true }); peer.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      let n = 0; const ready = () => { if (++n === 2) { peer.open = true; this.h.onJoin && this.h.onJoin(peer); } };
      for (const ch of [peer.rel, peer.fast]) { ch.onopen = ready; wire(peer, ch, (id, msg, lbl) => this.h.onMsg && this.h.onMsg(id, msg, lbl)); }
      pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this.drop(m.from); };
      await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
      await api('send', { code: this.code, to: m.from, msg: { type: 'offer', sdp: pc.localDescription.sdp } });
    } else if (m.type === 'answer') { const p = this.peers.get(m.from); if (p) await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }); }
  }
  drop(id) { const p = this.peers.get(id); if (!p) return; this.peers.delete(id); try { p.pc.close(); } catch (_) { } if (p.open) this.h.onLeave && this.h.onLeave(id); }
  send(id, msg, fast) { const p = this.peers.get(id); const ch = p && (fast ? p.fast : p.rel); if (ch && ch.readyState === 'open') ch.send(JSON.stringify(msg)); }
  broadcast(msg, fast) { const s = JSON.stringify(msg); for (const p of this.peers.values()) { const ch = fast ? p.fast : p.rel; if (ch && ch.readyState === 'open') ch.send(s); } }
  stopListing() { clearInterval(this.pollT); this.pollT = null; }
  close() { this.closed = true; clearInterval(this.pollT); clearInterval(this.beatT); if (this.code) closeRoom(this.code); for (const id of [...this.peers.keys()]) { const p = this.peers.get(id); try { p.rel.send(JSON.stringify({ t: 'bye' })); } catch (_) { } this.drop(id); } }
}

class Client {
  constructor(name, handlers) { this.name = name; this.h = handlers; this.id = tabId; this.pc = null; this.rel = null; this.fast = null; }
  join(code) {
    this.code = code.toUpperCase();
    return new Promise(async (resolve, reject) => {
      const fail = e => { this.stop(); reject(e); };
      try { const { room } = await api('room', null, '&code=' + this.code); if (!room) return fail(new Error('No game with that code is running.')); } catch (e) { return fail(e); }
      await api('send', { code: this.code, to: 'host', msg: { type: 'join', from: this.id, name: this.name } }).catch(fail);
      const t0 = Date.now();
      this.pollT = setInterval(async () => {
        if (this.busy) return; this.busy = true;
        try {
          if (Date.now() - t0 > 20000 && !(this.rel && this.rel.readyState === 'open')) { this.busy = false; return fail(new Error('The host did not answer. Are you on the same network?')); }
          const { msgs } = await api('recv', null, '&code=' + this.code + '&me=' + this.id);
          for (const m of msgs) {
            if (m.type === 'reject') { this.busy = false; return fail(new Error(m.reason === 'started' ? 'That match has already started.' : 'That lobby is full.')); }
            if (m.type === 'offer' && !this.pc) {
              const pc = this.pc = new RTCPeerConnection(ICE); let n = 0;
              pc.ondatachannel = e => { const ch = e.channel; if (ch.label === 'rel') this.rel = ch; else this.fast = ch;
                wire({ id: 'host' }, ch, (id, msg, lbl) => this.h.onMsg && this.h.onMsg(msg, lbl));
                ch.onopen = () => { if (++n === 2) { clearInterval(this.pollT); resolve(this); } }; if (ch.readyState === 'open' && ++n === 2) { clearInterval(this.pollT); resolve(this); } };
              pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this.h.onClose && this.h.onClose(); };
              await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp }); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
              await api('send', { code: this.code, to: 'host', msg: { type: 'answer', from: this.id, sdp: pc.localDescription.sdp } });
            }
          }
        } catch (_) { }
        this.busy = false;
      }, 800);
    });
  }
  send(msg, fast) { const ch = fast ? this.fast : this.rel; if (ch && ch.readyState === 'open') ch.send(JSON.stringify(msg)); }
  stop() { clearInterval(this.pollT); }
  close() { this.stop(); try { this.send({ t: 'bye' }); } catch (_) { } try { this.pc && this.pc.close(); } catch (_) { } }
}
root.RLNet = { api, Host, Client, closeRoom };
})(typeof window !== 'undefined' ? window : globalThis);

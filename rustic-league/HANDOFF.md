# Rustic League: handoff for a new chat

Paste or attach this file first. It explains what the project is, how it is built and tested, what state it is in, and what to work on next. The other docs go deeper: `ARCHITECTURE.md` (code map), `BOTS.md` (AI internals and the open problem), `MULTIPLAYER.md` (LAN parties).

## What it is

A Rocket League–style car-soccer game in the browser, themed around rusty old cars on a farm. One self-contained HTML page: Babylon.js 9.31.0 for rendering (loaded from the jsDelivr CDN), a custom physics engine (no Havok), procedural textures painted at runtime in background workers, and synthesized audio. It plays on desktop (keyboard or gamepad) and on phones and tablets (on-screen controls).

- **Modes:** 1v1 to 4v4 against bots; the arena grows 12.5% per extra player a side. LAN parties for up to 8 players, hosted peer-to-peer with WebRTC.
- **Cars:** Coupe (all-rounder), Van (slow, heavy, big hitbox, high ride), Buggy (light, quick, nimble, small and low). The stats differ in physics, not only in looks.
- **Bots:** Easy, Normal, Hard, Legend. In team modes each bot's level is the chosen one 70% of the time and one step either side otherwise. Play styles: defender (usually the van), striker (usually the buggy), playmaker, all-rounder.
- **Where it runs:** published as a claude.ai artifact (single player only, since that page blocks networking) and deployed by the user on Vercel (full game, LAN parties included).

## Layout of this package

```
src/          all game source (see ARCHITECTURE.md)
build.py      concatenates src/ into one HTML page (modes: test, vtest, vercel, prod)
dist/         the current published game page + the current Vercel zip
vercel/       Vercel project: api/lobby.js (matchmaking + signalling), dev-server.js, package.json, README.md
tests/        Node simulations and bot benchmarks (no browser needed)
test/         Playwright scripts for headless-browser checks (load errors, screenshots, phone emulation, two-browser LAN)
tools/        offline asset bakers (wall texture, skies, garage photos)
```

`python3 build.py prod` rebuilds `dist/rustic-league.html`. The output is byte-identical to the published game, which confirms the package is complete.

## Build, run, test

- **Build:** `python3 build.py test` writes `test/index.html`. Put `babylon.js` (babylonjs@9.31.0, from jsDelivr) next to it, then serve the folder with `python3 -m http.server 8765` from `test/`.
- **Vercel build:** `python3 build.py vercel` writes `vercel/index.html` with Babylon from the CDN. The user deploys the `vercel/` folder.
- **Local LAN testing:** `python3 build.py vtest`, copy `babylon.js` into `vercel/`, then `node dev-server.js` from `vercel/` (in-memory matchmaker on port 8790).
- **Physics and bot tests:** plain Node, no browser. For example, `node tests/control.js legend 30`. The benchmarks are listed in `BOTS.md`.
- **Browser tests:** Playwright Chromium with software WebGL. Launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Software rendering is very slow (a frame can take seconds), so poll for `window.__rl` with long timeouts and don't trust frame-rate or timing numbers from it. The scripts in `test/` contain absolute paths from the original sandbox (`/home/claude/rl/...`); adjust them to wherever the package lives.
- **Car close-ups:** `studioShot(type, hex, {yaw, el, dist, look, w, h})` renders one car from any angle (yaw 0 = front, el < 0 = from below).
- **Debug hook:** `window.__rl` exposes `sim`, `bots`, `scene`, `camera`, `state()`, `startMatch()`, `setupMatch()`, `settings`, `studioShot()`, and `debugCam` (set `{pos, look, fov}` to override the camera).

### Pitfalls the previous chat hit

- `pkill -f "node dev-server.js"` inside a shell command can kill that shell itself, because the pattern matches its own command line. Use `pgrep -f '^node dev-server'`.
- Background processes started in one turn were killed at the end of that turn. Long jobs, such as baking garage photos, must finish within a turn or be resumable (`test/studio.py` skips photos that already exist).
- `/bin/sh` here is dash: no `{a,b}` brace expansion. Use `bash -c '...'` when needed.
- Button handlers must call `startMatch()` with no arguments (`() => startMatch()`). Passing the function directly hands it the click event, which it then mistook for a multiplayer line-up.
- Test harnesses must pass full input objects `{throttle, steer, handbrake}` to `sim.step`. The sim now replaces bad numbers with 0, but an old test once created NaN steering this way.

## Current state

Everything below works and is published: single player 1v1–4v4, the three cars, garage, settings (lighting presets, quality, skid marks, touch layouts), LAN parties, phone and tablet support, and fast loading.

### Recently fixed (keep these working)

- **Loading:** heavy textures are pre-baked and embedded (the non-repeating wall, four skies, 21 garage photos, the promo image). Everything else is painted in Web Workers, falling back to the main thread where workers are blocked, as on claude.ai.
  - Car paint shows a quick 384 px coat first, then swaps to the full resolution once no setup is running.
  - Match setup is serialized (one at a time), has a 45 s timeout, and retries once.
- **LAN parties:**
  - Closed rooms are remembered on the server (a "tombstone"), so a late heartbeat can't revive them; the server also hides rooms silent for more than 14 s.
  - Each browser tab keeps one player id, and a repeated join replaces the earlier one.
  - The host waits for every player to report "ready" before the countdown.
  - The host zeroes a player's controls if none arrive for more than 0.6 s.
- **Mobile:**
  - Touch input is rebuilt from the full list of fingers on every touch event, so a pedal can't stick down.
  - Pinch zoom, double-tap zoom and text selection are blocked.
  - Phones held upright show a "rotate your device" notice.
  - Three layouts: pedals right, pedals left, and a keys layout (W A S D on the left, handbrake on the right).
- **Sound:** engine and tyre sound only play while a round is live and no menu is open.

### Recently fixed: visuals

- **Cars:**
  - Floors and wheel wells have their own mapping and material, so the underside is no longer stretched.
  - The van's rear (and the coupe's ends) are flat panels, with no roof texture smeared down them.
  - The coupe and van have four separate, smaller wheel wells.
  - Bumpers are capped at both ends.
  - Van: mirrors face backwards; tail lights are flush.
  - Buggy: lamps, blinkers and tail lights are flush lenses on the fenders, side windows follow the curved body, and the bonnet trim follows the bonnet.
  - The garage photos and the promo image were re-baked: `test/studio.py` then `tools/compose.py`, then the promo appended as `window.RL_PROMO`.
- **Night lighting:** each floodlight lights its own part of the pitch with a wide, soft cone, brightness scales with arena size, and car paint takes all eight lights.
- **Goal frames:** weathered team colours, more grime, and the corner posts' texture repeats every 1.2 m.
- **High quality:** chromatic aberration (the red/blue fringe) and 4× MSAA removed; at most 1.5× device pixels; a 2048 shadow map.
- **Branding:**
  - The loading-screen title is a pre-baked image (`tools/bakelogo.py`).
  - The wordmark is padded so `background-clip: text` covers whole letters.
  - New menu emblem (`emblemSVG`), and the garage icon's headlights are re-centred.

### Recently added (see `BOTS.md`)

- **Strike planner.** In the attacking end, bots at Normal and up plan the approach so they arrive facing the shot: about 5° aim error per planned touch, against about 30° before.
- **Legend extras.** Wall balls are knocked into open space in front of goal as a set-up (wall-ball goals +68% in `tests/wallball.js`). Balls in the air are met on the bounce. Both are Legend-only, because they didn't help Hard in full matches.
- **Legend vs the original Legend:** 59% goal share.
- **Cars no longer get trapped in goals:** 0/200 against 28/200.
- **Difficulty ladder:** Legend–Hard 63–41, Hard–Normal 70–45, Normal–Easy 47–35. Use `tests/ladder.js`, which alternates sides, rather than `match.js`.

### Open problems (in priority order)

1. **Set-ups and bounce timing don't help Hard in full matches**, though they work in their own scenarios. Find out why.
2. **Long stalls.** 90 s without a goal is still common in bot-vs-bot play.
3. **The older modes on the accurate ball prediction** would need retuning.
4. **Bouncing balls mid-pitch** are missed a little more often than before.
5. **Pad launches** almost never happen.

### How the user works

The user tests the deployed game hands-on (desktop and phone) and reports concrete observations. They appreciate:

- honest measured results, including when something didn't work;
- changes that are verified before shipping, with regressions reverted;
- a short summary of what changed and what to replace on Vercel. Usually only `index.html` changes; say so explicitly when `api/lobby.js` changes too.

Before shipping any bot change, check that the difficulty order still holds: Legend > Hard > Normal > Easy, with `tests/ladder.js`. Compare against the previous bot with `tests/h2h.js`. See `BOTS.md` for the commands and how noisy match results are.

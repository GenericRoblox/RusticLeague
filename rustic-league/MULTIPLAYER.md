# Rustic League: LAN parties

## Pieces

- **`vercel/api/lobby.js`:** one Node serverless function backed by Redis. It accepts Upstash REST settings (`KV_REST_API_URL`/`TOKEN` or `UPSTASH_REDIS_REST_URL`/`TOKEN`, with any prefix) or a plain `REDIS_URL` (connects with no retries and a 4 s timeout). `?a=diag` reports which setting names it can see (never their values) and whether the database answers a ping.
- **`vercel/dev-server.js`:** serves `index.html` and an in-memory copy of the same API on port 8790, for local testing with no Redis.
- **`src/net.js` (`RLNet`):**
  - `Host` and `Client` classes over WebRTC (STUN: stun.l.google.com).
  - The full offer or answer is gathered before sending, so each side sends one message.
  - Two data channels: `rel` (ordered: lobby, events) and `fast` (unordered, no retransmits: snapshots, inputs).
  - The player id is stored per tab in sessionStorage.
  - `closeRoom()` uses `sendBeacon`, falling back to a keepalive fetch.

## API actions (`/api/lobby?a=`)

| action | what it does |
|---|---|
| `ping`, `diag` | health check and setup diagnosis |
| `list` | rooms registered from the same public IP (hashed), excluding rooms silent for more than 14 s |
| `room&code=` | look up one room |
| `host` | create a 5-character code; `room:CODE` expires after 20 s and is refreshed by heartbeats |
| `beat` | heartbeat every 6 s; ignored if `closed:CODE` exists (the tombstone, kept 300 s) |
| `close` | sets the tombstone, deletes the room, removes it from the same-network set; accepts text/plain beacon bodies |
| `send`, `recv` | signalling mailbox per room and player (RPUSH, and LPOP up to 50) |

## Game protocol (`game.js`, multiplayer block)

The host is authoritative: its browser runs the physics and all bots.

| Message | Direction | Purpose |
|---|---|---|
| `lobby` | host → all | full lobby state on any change: teamSize, mode, difficulty, lighting, colours, players with id, name, car and team |
| `req` | client → host | ask to change team, car or colour, or a setting (host only); the host validates (1v1 auto-split, team capacity, colour rules) |
| `me` | client → host | name and car on join |
| `start` | host → all | the line-up: n, types, humans {carIndex: playerId}, styles, colours, settings, names |
| `ready` | client → host | finished loading the match; the host holds the countdown, with a "Waiting for players…" banner, until all are ready or 25 s pass |
| `s` | host → all, fast channel | snapshot about 30 times a second: `sim.snapshot()` plus state, state timer, score, clock, overtime and recent events (for sounds and particles) |
| `i` | client → host, fast channel | controls `[throttle, steer, handbrake]` every frame; the host zeroes them if more than 0.6 s stale; sent as zeros when the tab is hidden |
| `fx` | host → all | banner, beep, go, goal, end, mirrored so every screen shows the same effects |
| `back`, `bye` | host → all | return to the lobby; host left |

On a client, nothing is simulated: `clientSnapshot()` applies the latest snapshot and the renderer interpolates between snapshots over 1/30 s. `meIdx` is found by looking the client's own id up in `comp.humans`. A client that is missing from the line-up gets a message and is sent back; it never borrows someone else's car.

A player who leaves mid-match is replaced by a bot. If the host leaves, everyone returns to the LAN screen with a message.

## Deployment checklist (Vercel)

1. Import the `vercel/` folder as a project (framework preset "Other", no build step).
2. Storage → Upstash → Redis (free plan) → connect to the project, with the Production environment ticked.
3. Redeploy, then check `/api/lobby?a=diag`: `"ping": "PONG"` means it works.
4. Usually only `index.html` changes between versions. When `api/lobby.js` changes, both must be replaced.

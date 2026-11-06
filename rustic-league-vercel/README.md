# Rustic League — Vercel deployment (with LAN parties)

The game is a single static page (`index.html`). LAN parties use one serverless function (`api/lobby.js`)
for matchmaking and WebRTC connection setup; the match itself runs peer-to-peer between browsers.

## Deploy

1. Put this folder in a Git repository (or use the Vercel CLI: `npx vercel` from this folder).
2. Import it as a new project on Vercel. No build step or framework is needed.
3. In the project, open **Storage → Create / Marketplace → Upstash → Redis** (the free plan is plenty) and connect it to the project.
   Vercel adds the connection settings automatically (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` / `KV_REST_API_TOKEN`; either pair works).
4. Redeploy so the function picks up those settings.

## Playing a LAN party

- Everyone opens the site on a device on the same network.
- One player picks **LAN PARTY → HOST A GAME**. Everyone else sees the game under "Games on your network" (games are grouped by your
  network's public address), or can type the 5-letter room code.
- In the lobby: **A / D** switches team, pick your car, and the host sets team size, match type, bot level, time of day and team colours.
  In 1v1 the two players are split automatically and each picks their own team colour. Bots fill every empty seat.
- The host's browser runs the match, so the host should be on the most capable machine.

## Notes

- Some networks (guest Wi-Fi, some corporate or school networks) block devices from talking to each other. If joining hangs at
  "Connecting…", try a home network or a phone hotspot.
- Room codes also work between different networks in many cases (via a public STUN server), but some home routers will block it.
- Local testing: `node dev-server.js` serves the game with an in-memory matchmaker at http://localhost:8790 (open two browser windows).

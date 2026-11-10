# Rustic League: architecture

All modules are plain scripts that attach to `window` (or `globalThis` in Node and workers): `RLSim`, `RLBot`, `RLTex`, `RLMesh`, `RLCar3D`, `RLWorld`, `RLAudio`, `RLNet`. `build.py` inlines them in this order: `walltex, skytex, thumbs, net, sim, bot, tex, meshes, car3d, world, audio, game`. Each one goes into a `<script id="src-NAME.js">` tag, because the texture workers read the `sim.js` and `tex.js` source from those tags. `src/index.html` holds the HTML and CSS, with a `<!--SCRIPTS-->` placeholder where the scripts are inlined.

## sim.js: physics (also runs in Node)

- **Arena `A`:** half sizes HX 38, HZ 77; corner radius RC 14; ramp radius RR 6.5; ceiling H 26; goal half-width GW 9, height GH 7.2, depth GD 8.5 (1v1 sizes).
  - `setArenaScale(s)` scales the arena and rebuilds the pad positions and crossbars. `teamScale(n) = 1 + 0.125·(n−1)`.
  - A signed-distance function drives collisions: rounded-rectangle walls with a quarter-pipe base, goal mouths, crossbar boxes.
  - Helpers: `wallDist(x,z)`, `wallNormal(x,z)`.
- **Cars:** `CARS = {coupe, van, buggy}` are built by `makeSpec()` from real-world sizes times the shared scale K = 1.12. Each spec includes:
  - mass, inertia, wheel positions and radius, suspension (rest length, sag, stiffness, damping);
  - collision boxes and hull points;
  - engine force, top speed, brakes, front and rear grip, handbrake grip, yaw assist;
  - steering at low and high speed, steering rate, and bounciness against the ball.
  - A `Car` keeps its `spec` and `team`. Self-righting kicks in when the car is upside down or wedged.
- **Ball:** radius 1.55 m, mass 180.
- **Launch pads:** 8 spring pads that fire when crossed faster than 6 m/s. `Pad.pose()` sets the pad's orientation from its state.
- **`Sim({teamSize, types})`:**
  - The car array lists team 0 first, then team 1.
  - `step(inputs[])` runs at 120 Hz. Inputs are sanitized (non-numbers become 0).
  - `goalCheck()` returns the scoring team or −1.
  - `resetKickoff(variant)` uses the `KICK[n]` spot tables, scaled with the arena.
  - Events: `ballHit`, `padFire`, and others.
  - `snapshot()` / `applySnapshot()` produce compact numeric arrays for networking.
  - `passInfos[team]` tracks a pass in flight (set by the bots; marked "kicked" on the passer's touch).

## bot.js: AI (also runs in Node)

`LEVELS` (easy, normal, hard, legend), `STYLES` (allrounder, defender, striker, playmaker), and `Bot(sim, idx, level, style)`. `update(dt)` returns `{throttle, steer, handbrake}`. `think()` runs every `L.think` seconds to choose a mode and target; `update()` turns the target into controls. Full detail in `BOTS.md`.

## tex.js: procedural textures (main thread or worker)

- Seeded `Noise` class: Perlin, fbm and Worley noise. `rows()` yields to the browser between rows on the main thread only, using MessageChannel (not throttled in background tabs).
- Generators: `grassDetail, fieldMacro(W,H,A,pads,wallDist), grimeDetail, pipeRust, chrome, tire(W,H,blackwall), wireWheel, steelWheel, vinyl, glass, woodPad, barnWood, corrugated, ball, plastic, leaves, hay, farmland, sky(W,H,dir,preset)`, plus the car textures.
- **Car textures:**
  - `carAtlas(S, hex, hulk, type)` paints one texture sheet per car type.
  - The masks are cached per type and size; the layout tables are in `CARMAPS`: wheel arches, door seams, bondo, primer, rust zones, drips, and peel amount and colour (the van peels to white primer).
- Results are `{w, h, albedo, normal, orm}` typed arrays, uploaded as RawTextures in `game.js`.

## meshes.js, car3d.js, world.js

- **meshes.js:** geometry helpers (`Geo` builder, sweep along a path, lathe, sphere, disc).
- **car3d.js:** `buildCar(scene, M, {spec, com, wheels, K})` picks one of three builders:
  - `buildCoupe`, `buildVan`, `buildBuggy` loft the body from cross-section functions, then add glass, chrome, lights, plates and the underside.
  - The shared `finishCar()` builds the root and model nodes, and wheels closed on both faces.
  - The buggy's fenders are separate half-spheres.
  - **Loft point kinds:** body cross-sections mark points `S` (side, textured from the side of the atlas), `T` (top) or `U` (underbody).
    - `U`–`U` segments go to a separate floor mesh (`gU`), mapped flat in metres and drawn with `M.under` (grimy, evenly tiled rust).
    - The coupe and van sections include a notch: an inner wall at `XIN` / `V_XIN` and a ceiling at the arch height. This gives four separate wheel wells, not a tunnel through the car per axle.
    - Arch radius is tyre radius + 9 cm, and `CARMAPS.ar` must match it, because the paint atlas draws rust rings at that radius.
  - **Body ends start at full height,** so the loft closes them with flat end caps, mapped like the sides. A profile that starts at zero height turns the whole end into a stretch of roof texture.
  - `sidePoly` tessellates 4-corner windows and lenses so they follow the body curve. `fenderLens` cuts lamp lenses out of a fender ellipsoid, so they sit flush.
- **meshes.js `sweep`** caps both ends of a closed profile (bumpers used to be open tubes).
- **world.js:** `RLWorld.build(scene, M, QP, TX)` builds the arena (walls carry the pre-baked wall texture through a row-atlas UV layout), goals, pads, floodlight towers and farm scenery. Positions follow `A`, so the world is rebuilt whenever the team size changes the arena scale.

## game.js: the app

In order, from top to bottom:

1. Settings and profile in localStorage (`rustic_settings`, `rustic_profile`).
2. The quality presets.
3. The texture worker pool (`Pool.run(fn, args, affinity)`, with main-thread fallback). The `P` job list includes warm-up jobs for the quick car coats.
4. Materials, including a stochastic-tiling material plugin (`stoch`) and the baked wall material.
5. Lights, shadows and the reflection probe.
6. `buildArena(n)`: disposes and rebuilds the world for a new scale; caches the field texture per scale.
7. Paint and setup:
   - `paintMat(type, team)`: quick coat first, full resolution later via `laterHi` (held while `holdHi > 0`).
   - `setupMatch(n, force, comp)`: queued on `setupChain`; builds the sim, bots and car meshes. `teamCars` and `stylesFor` decide the line-up.
8. Lighting presets (`LIGHTS`, `applyLighting`), particles, skid marks (a canvas texture that fades over about 20 s), and the UI wiring for menus, garage and settings.
9. Touch controls (`buildTouch`, `TOUCH`), the name prompt, and `readInput()`, which merges keyboard, gamepad and touch.
10. Match flow:
    - `startMatch(comp)`, `kickoff`, `stepSim`, `update`/`hud`, `onGoal` → `fx('goal')`, `endMatch`.
    - States: `menu`, `waiting`, `countdown`, `play`, `goal`, `end`.
    - `meIdx` is the local player's car index (not always 0 in multiplayer).
11. The multiplayer block (see `MULTIPLAYER.md`).
12. Finishing load: `setupMatch`, `applyLighting`, the promo image, `buildTouch`, the name prompt, then painting the field textures for the other team sizes in the background.

## Pre-baked assets (tools/)

- `tools/bakelogo.py` bakes the loading-screen title into `src/loadlogo.txt` (WebP data URI). `build.py` puts it in the HTML at `<!--LOADLOGO-->`, so it shows textured on the first frame.
  - The bake uses the game's own `.wordmark` CSS, the generated rust texture and the real font, Rubik Distressed.
  - The font comes from `npm pack @fontsource/rubik-distressed` (`files/rubik-distressed-latin-400-normal.woff2` → `test/rd.woff2`), because Google Fonts is not reachable from the sandbox.
- **The menu emblem** is SVG built by `emblemSVG(rustURL)` in `game.js`: the bolted rust plate, a slanted frame, a line-art ball and a muscle car.

- `tools/genwall.js` + `tools/packwall.py` produce `src/walltex.js`: one 4096×2240 wall texture (28 px/m, 5 rows of 146 m) plus a normal map and roughness map, with stencilled signs. The wall mesh UVs map distance along the perimeter into those rows.
- `tools/gensky.js` produces `src/skytex.js` (four 2048×1024 WebP skies).
- `test/studio.py` + `tools/compose.py` produce `src/thumbs.js` (21 garage photos plus the promo image). These use the `studioShot()` hook in `game.js`, which renders on a transparent background that is then composited onto a gradient.

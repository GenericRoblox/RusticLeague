# Rustic League: bots

## Levels (src/bot.js `LEVELS`)

| | think (s) | noise | cap | horizon (s) | hbAng | passSkill | notes |
|---|---|---|---|---|---|---|---|
| easy | 0.30 | 0.18 | 0.80 | 0 | 9 (rare) | 0.15 | direct approach only; no lining up |
| normal | 0.17 | 0.12 | 0.92 | 2.2 | 1.8 | 0.5 | timing for bouncing balls, lining up, cut-backs |
| hard | 0.06 | 0.025 | 1.0 | 3.6 | 1.3 | 0.9 | Legend with handicaps; quick handbrake taps (`flick`) |
| legend | 0.045 | 0 | 1.0 | 4.0 | 1.25 | 1.0 | |

The columns:

- **think:** seconds between re-plans.
- **noise:** random steering error.
- **cap:** maximum throttle.
- **horizon:** how far ahead the ball's flight is predicted.
- **hbAng:** steering angle (radians) above which the bot does a full handbrake turn.
- **passSkill:** a general skill level that gates the smarter features. Below 0.5 they're off. At 0.8 and above, holding back near walls is enabled.
- **plan / aimErr / trim / setup / bounce:** the strike planner (see below) is on for Normal and up. `aimErr` is a random aim error in radians, re-rolled with each committed aim: Normal 0.12, Hard 0.04, Legend 0. `trim` (Hard, Legend) allows corner hits that bend the ball. `setup` (wall balls knocked into space in front of goal) and `bounce` (balls in the air met on the bounce) are Legend only; see "Level split" below for why.

## How a bot decides (think)

1. **Predict the ball** (`predictBall`) and pick the earliest point it can reach:
   - travel time is estimated from the car's actual acceleration, plus a penalty for turning;
   - the ball counts as reachable up to car height + 1.5 m, or higher when it's on a ramp;
   - the chosen point's arrival time is stored as `arriveT`.
2. **Team roles:**
   - The "first man" is the team-mate with the best travel time. A car that is already driving the ball gets a bonus, and while possessing the ball a bot always counts as first man.
   - Everyone else goes to a support spot for their style.
   - The defender (van) rotates through keeper / sweeper / forward phases; phases are held while it has the ball.
3. **Passing:** `choosePass` looks for an open team-mate: no opponent near them or in the passing lane. The pass is led into the space in front of the receiver. Passes are only made from a clean setup. The receiver attacks the ball and the passer backs off (`sim.passInfos`).
4. **Aim:**
   - The goal, with distance-aware corner placement (near the middle from far away).
   - Cut-backs across the front of goal from the wing (team modes only).
   - Shots are bent away from nearby walls.
   - The aim allows for the ball's own motion: the bot strikes along (wanted outgoing velocity − incoming velocity).
5. **Modes:**
   - `attack`, with these approaches:
     - **offset chase:** aim at a point behind the ball, closer in as the bot nears it;
     - **line pursuit** onto the shot line;
     - **careful approach** (`precise`) for dead balls, or whenever the bot has time to line up (`setupTime`: the opponent's travel time minus my set-up cost must exceed a margin).
   - `rotate` (go back and defend), `support`, `kickoff`, `launch` (pad aerials).
   - Ramp balls: approach along the wall at an angle.

## Controls (update)

- **Order of checks:** stuck recovery, three-point turns, inside-goal escape, kickoff, ramp handling, avoiding team-mates.
- **Orbit detector:** if the car travels most of a lap around the ball without touching it, it strikes directly for 2.8 s.
- **Handbrake pivot:** when the ball is close, low and off to the side, the bot slides until its nose points at the ball.
- **Other handbrake use:** full handbrake turns above `hbAng`, and quick taps (Hard and Legend).
- **Speed limits:** turning-radius limits, a careful-approach speed cap, timed arrival for balls coming out of the air, and holding back near walls (Hard+).

## Benchmarks (tests/)

All are plain Node. The bots use `Math.random`, so the same command varies from run to run (the old control test ranged 11–18/30). Wrap a command in `tests/seeded.js SEED` to make it reproducible, and compare versions on the same seeds.

| Command | Measures | Current, Legend (original bot on the same seeds) |
|---|---|---|
| `node tests/seeded.js 7 tests/still.js legend 40 coupe` | time to touch a stationary ball | median 6.1–6.4 s, 0/40 fails (5.0 s, 0/40) |
| `node tests/seeded.js 9 tests/air.js legend air` (seeds 9–11) | bouncing ball, first touch | 6/120 never touched (2/120) |
| `node tests/seeded.js 7 tests/air.js legend ramp` | ball high on a side ramp | median 4.2 s, 0/40 fails |
| `node tests/ctl2.js legend 30 coupe SEED` | dribble from own half and score within 30 s, fully seeded; `V=1` per run, `ST=1` time per state, 6th argument traces one run | see below |
| `node tests/h2h.js legend 20 8` | current bot vs `tests/baseline/bot_v1.js` (the bot before the strike planner), alternating sides | 53–59% goal share per 20-match run |
| `node tests/ladder.js A B 16` | level A vs level B, sides alternating, ball reset after 90 s stalls | see the difficulty-order check |
| `node tests/wallball.js legend 300` | ball near a side wall or corner of the attacking third, Legend defender in goal (always the original bot): ball brought in front of goal, shots on target, goals in 15 s. `KIND=air`: ball bouncing in the attacking third. `SEED=n`, `ONLY=current` | 300 runs: 135–153 in front, 37–47 on target, 25–28 goals (original 149, 33, 22) |
| `node tests/goalexit.js legend 200` | car dropped inside a goal at random spots and headings, ball at midfield: time to get out | 0/200 still inside after 10 s (original 28/200) |
| `node tests/match.js A B 8` | bot vs bot, 8 minutes. Level A always has the same side and stalls are never reset: use `ladder.js` for comparisons | |
| `node tests/roles.js 3 legend 10` | team modes: van time split, passes received | |
| `node tests/teams.js n level mins` | team match stalls and stuck cars | |
| `node tests/duel.js level mins` | level vs a pure attacker | |

`ctl2.js` parks the opponent at (−34, 70), beside the goal being attacked. The planner's race check counts that car, so in this test the planner rarely runs where it is allowed to. Use `h2h.js` to judge attacking play.

**Match noise.** A 20-match run has about 130 goals, so one standard deviation is about 4 points of goal share. The same code gave 76–57 and 60–64 in consecutive runs. Run twice before believing a difference of less than about 8 points.

**Difficulty-order check.** Run before shipping any bot change, 16 matches per pairing:

```
node tests/ladder.js legend hard 16; node tests/ladder.js hard normal 16; node tests/ladder.js normal easy 16
```

Last results: Legend–Hard 63–41, Hard–Normal 70–45, Normal–Easy 47–35. `match.js` keeps level A on one side, and for the same two versions gave Normal–Easy 51–17 one day and 30–34 another, so older numbers from it aren't reliable.

## Ball contact: what the measurements say

`tests/` numbers from the analysis that led to the strike planner:
- **The ball goes where the car points.** Outgoing vs car heading: median 5°. Within ±1 m of the centreline the push is straight. Past the bumper edge the ball is bent toward that side: about 5° at 0.1 m past the edge, 19° at 0.7 m, 40° at 1.3 m. Car speed barely matters.
- **The ball's own velocity matters a lot.** A centred hit at 20 m/s on a ball crossing at 8 m/s comes out 35° off.
- **Gentle dribble touches can't steer.** Catching a 15 m/s ball at 20 m/s changes its direction by ±2° whatever the offset.
- **The old bots' 30° error was execution.** Car heading vs the bot's own intended direction at impact: median 34°. Intended vs goal: 7°.
- **Cars turn wide at speed.** Full-lock path radius for the Coupe: 14 m at 14 m/s, 26 m at 20 m/s, 47 m at 28 m/s (Van a little more, Buggy a little less; grip limit about 11.5 × muF m/s²). Lining up has to be planned well before contact.

## Strike planner (Normal and up)

`Bot.planStrike` / `Bot.strikeControl`, used in attack mode.

**Planning.** For predicted ball positions in the next 0.5 s (`PLAN_LEAD`), the planner works out a contact pose: bumper on the ball, heading along the shot direction. The shot direction is computed per position: aim point, wall bend, and correction for the ball's velocity. End-pose variants are square on, ±4° (no correction needed), and for Hard and Legend (`trim`) ±10–34° with the ball taken on the bumper corner to bend it back.

For each candidate curve speed (7–28 m/s, which sets the turn radius) it computes the shortest Dubins path to a line-up point (run-in 4 + 0.3·v m, or 1 m with a small penalty). Driving time comes from a trapezoid speed profile (`pieceTime`). It picks the earliest position it can reach in time. Penalties for corner hits and short run-ins only rank options; they never delay feasibility. If nothing is reachable in time, it takes the least-late option.

**Rejected paths.** A path is rejected if it touches the side ramps (wall distance under RR − 1.5) or any armed pad, or passes the ball. The ball check uses the ball's predicted position when the car gets there. A path may start inside the ramp or ball margin, but not enter it.

**Following the path.** Pure pursuit on a look-ahead point, with a speed envelope (curve caps, braking before them). For a moving ball the car eases off only when clearly early. A plan younger than 0.35 s is kept through a one-off planning failure.

**When it is used.** Once the ball is 0.26 × half-length into the opponent's half (`PLAN_ZONE`, 20 m in 1v1), and only if the plan reaches the ball 0.6 s before the nearest opponent. An undisturbed still ball (`calm`) in their half can be lined up anywhere there, for at most 5 s of looping without the ball moving. Everywhere else the original logic plays, since getting to the ball first matters more than precision there. Head-to-head goal share against the original Legend, 20 × 8 min:

| Where the planner is used | Goal share |
|---|---|
| Everywhere | 47% |
| From halfway | 55–56% |
| From 20 m into their half (several rule variants, pooled) | 419–352, 54% (single runs 48–62%) |
| From 35 m | 45% |

**Wall balls: set-ups (Legend).** A ball near a wall without a real angle on goal (`directShot`: goal mouth under 19°) is knocked toward the best spot in front of their goal (`setupTarget`). Spots are a grid 10–28 m out, scored by angle on goal plus how much sooner one of us gets there than any defender, at 11 m/s ball travel. The ball is struck at a capped speed (0.4 × distance, 7–14 m/s) so it doesn't run on into the far wall. For these balls the approach may run onto the foot of the ramp (contact pose 3 m from the wall, path 3.5 m). `tests/wallball.js`, 300 scenarios: set-up to the best spot 37 goals, no set-ups 26, original bot 22. Trying the top three spots and taking the one reached first: 19 (`SETUP_SPOTS`).

**Balls in the air: met on the bounce (Legend).** For a ball in the air the planner targets the moments in the next 2.5 s (`AIR_LEAD`) when it is low enough to hit, around the bounce, and times the arrival. `KIND=air`, 200 scenarios: shots on target 52, against 45 without bounce timing and 40 for the original.

**Level split.** In full matches these two features did not help Hard. Hard vs Normal over 16 matches each: both features on, 47–50% goal share; set-ups only, 51%; bounce only, 52%; neither, 61%. They are Legend-only until the reason is found. Legend with them against the original Legend: 59% (37–26).

**CPU.** The planner's work is capped per think: at most 1,200 path evaluations and 60 clearance checks, with ball positions it can't reach in time skipped. 4v4 Legend: about 78 ms of CPU per second for eight bots, worst single think 24 ms (original bot 21 ms).

**Ball prediction.** `predictBall` now models spin and rolling. Error after 3 s fell from 4.7 m median (p90 8.9) to 0.1 m (p90 0.9) over 200 random balls. The planner uses it. The other modes keep the original as `predictBallLegacy`, which thinks a rolling ball stops within about a second. They were tuned around it: switched to the accurate one, the original logic fell to 37% goal share against itself. Moving them over means retuning them.

**What didn't work.**
- Looking further ahead: 0.7 s lead gave 21/90 goals in `ctl2` against 66/90 at 0.5 s; unlimited gave 20/90. Long plans go stale.
- Exact-heading-only end poses: endless loops when slightly misaligned.
- Folding penalties into the feasibility time: the car arrived early, then dawdled.

## Recovery fixes

- **Stuck recovery.** It still reverses first. If the last escape moved the car less than 1.2 m (jammed on a post), it drives forward instead, alternating sides. Basing this on "stuck again nearby" instead switched to driving forward in ordinary challenges against a defender, and cost wall-ball goals.
- **Inside a goal (past the goal line, between the posts).** Mouth behind: reverse onto it. Otherwise drive round to it. Along the end wall beside the goal the old rule (back off when the target is off the nose) stays; applying the new one there also cost wall-ball goals.
- **`deepLoop`.** "Behind the ball" is now relative to the intended shot, so it no longer fights cut-backs from beside the goal.

## Open problems
1. **Why set-ups and bounce timing don't help Hard in full matches.** They help in the targeted scenarios, and are Legend-only for now (see "Level split").
2. **Long 90 s stalls** are still common in bot-vs-bot play (about 2 per 8-minute match).
3. **The original logic on the accurate prediction** would need retuning.
4. **Bouncing balls mid-pitch** (`air.js`, where the original logic plays): 8 of 120 never touched, against 2 for the original bot.
5. **Pad launches** almost never happen.

# Bounce Back Hill

A couch co-op browser game for the **"bounce back"** hackathon theme.
2–4 friends share one keyboard, control squishy slime blobs, and try to keep a **giant, heavy ball in the air**
while climbing a tower of floating ledges to the summit flag. The twist: **the blob that just hit the ball can't
touch it again until a different blob hits it.** When the ball finally drops, the team *bounces back* from the last checkpoint ledge.

Plain HTML + CSS + vanilla JavaScript on a `<canvas>`, with [Matter.js](https://brm.io/matter-js/) physics
(bundled in `lib/matter.min.js`, so it works **offline**). No build step, no external assets: everything is drawn with canvas shapes and synthesised with the Web Audio API.

## How to run

* **Just open `index.html`** in a modern browser (double-click it). No server needed.
* Or serve the folder: `python3 -m http.server` and visit <http://localhost:8000>.

## How to play

* Walk or jump into the ball to **hit it up**. Hit it from the side to steer it, hit it from below to launch it.
* The blob that hit it turns into a **ghost** (⏳ on its name tag) and passes through the ball until a **teammate** hits it.
* Quick hits from different blobs **stack**: chain them to climb a whole ledge. A heavier ball gives weaker hits, so it takes more teamwork.
* Ledges are one-way: jump up through them and land on top.
* Get the ball to **rest on a checkpoint ledge** (green flag) to save your spot. If it falls too far below the last checkpoint (or breaks) the team **bounces back** there. Falling is never game over.
* Get the ball to rest on the **summit ledge** (star flag) to win. You get a time, your bounce-back count and a (rude) rating.

## Controls (one keyboard)

| Player | Move | Jump |
| --- | --- | --- |
| P1 green  | `A` / `D` | `W` |
| P2 red    | `←` / `→` | `↑` |
| P3 blue   | `J` / `L` | `I` |
| P4 yellow | Numpad `4` / `6` | Numpad `8` |

`Esc` or `P` pauses, `M` mutes. Pick 2, 3 or 4 players on the title screen (keys `2` `3` `4`).
Hint: some keyboards can't register that many keys at once ("ghosting"). If a blob randomly stops responding, that's the keyboard, not the game.

## Levels

1. **Up We Go** – a giant bouncy ball, wide ledges. Learn the hit-and-swap rhythm.
2. **Mushroom Hop** – heavier ball and big gaps: bounce across on mushroom pads.
3. **Eggs-press Delivery** – a fragile egg with a damage meter. It cracks if it lands too hard (and an icy ledge!).
4. **Crate Escalator** – a wobbly crate that lands on its corners, plus sliding platforms.
5. **The Grand Wobble** – huge ball, wind gusts, mushrooms, ice, a spring pad, falling rocks and a roaming boulder.

Hazards: ice patches, wind zones, falling rocks (with a "!" warning), mushroom/spring pads that launch blobs *and* objects, and a boulder that rolls across a ledge now and then.

Silly failure stuff: blobs **flop** (ragdoll) when something heavy hits them, a slow-mo **"NOOOO!"** when the ball plummets onto a teammate who can't catch it,
funny bounce-back messages, and a **replay of shame**: the worst moment of the last 5 seconds replays in slow motion (toggle it in the pause menu).

## Tweaking the feel

Everything lives in **`js/config.js`** with comments: gravity (`world.gravity`, 0.6 = "slightly low"), blob run speed / jump, how strong a hit is
(`hit.impulse`, `hit.side`, `hit.keepUp`, `hit.maxSpeed`), how much heavier objects weaken hits (`hit.weightExponent`), wind, pads, camera, slow-mo and replay.

### Adding a level

Levels are plain data in **`js/levels-data.js`**. Copy one, change it, add it to the `BBH.LEVELS` array. The format is documented at the top of the file:

```js
{
  id: 'my-level', name: 'My Level', twist: 'shown on level select', tip: 'shown when it starts',
  theme: { skyTop: '#bde6ff', skyBottom: '#fff1e6', hillFar: '#d9ecff', hillNear: '#c8f0dc', grass: '#9fe3b5', soil: '#ffe2c7', accent: '#ff9bb8' },
  ledges: [ { x: -300, y: -240, w: 760 }, { x: 300, y: -480, w: 760, cp: true }, { x: 0, y: -720, w: 900, cp: true, goal: true } ],
  object: { type: 'ball', radius: 90, weight: 16 },   // 'ball' | 'egg' | 'crate'; weight is in blob-masses
  hazards: [ { type: 'mushroom', ledge: 0, dx: 240, power: 780, angle: 18, w: 130 } ],
}
```

## Deploy to GitHub Pages

The site is fully static and uses only relative paths, so it deploys as-is.

* **With the included workflow:** in the repo go to *Settings → Pages → Build and deployment → Source: GitHub Actions*, then push to `main` (`.github/workflows/pages.yml`).
* **Or without it:** *Settings → Pages → Deploy from a branch → `main` / root*.

## Code layout

```
index.html  style.css  lib/matter.min.js
js/config.js        all tuning constants
js/levels-data.js   levels as data
js/main.js          game loop (fixed timestep), state machine, effects, replay, results, saving
js/input.js         one-keyboard, four-player input
js/blob.js          the slime blobs (drive, jump, flop, ghost state, drawing)
js/object.js        ball / egg / crate
js/hazards.js       wind, rocks, pads, boulder, moving platforms
js/level.js         builds the world, one-way ledges, the hit rule, checkpoints, rendering of the world
js/camera.js        follows the team, zooms out when spread, shake
js/particles.js     puffs, confetti, stars...
js/audio.js         Web Audio sound effects
js/ui.js            menus, HUD, pop-up text
```

Physics runs at a fixed 60 Hz regardless of the display's frame rate. Best times and fewest bounce backs are saved in `localStorage`.

Matter.js is MIT licensed (`lib/matter-LICENSE.txt`).
